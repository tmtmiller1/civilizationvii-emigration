// emigration-flow-history.js
//
// Delta-encoded flow-history helpers (combined design plan P0.3).
//
// The migration-network timeline used to store, in every history frame, a full
// CLONE of the cumulative city-pair flow matrix , so storage grew as
// snapshots × cumulative-matrix and the whole blob was JSON-serialized to
// GameConfiguration every turn. These helpers let the history store only each
// interval's DELTA (the migration that occurred in that window). The cumulative
// network at any frame is reconstructed on read by summing deltas, so no
// information is lost while storage drops to roughly the irreducible set of
// distinct city-pair / cause events (each recorded once).
//
// A flow matrix here is `key → { cause: people }`, where the key is
// "srcCiv>destCiv>srcCity>destCity" (see emigration-migration-stats.js). All of
// these helpers produce FRESH objects so a returned delta is never an alias of
// a live cumulative map.

/**
 * Add one delta's per-cause counts into a running cumulative map, in place.
 * @param {Record<string, Record<string, number>>} target Running cumulative (mutated).
 * @param {Record<string, Record<string, number>>} [delta] The increment to fold in.
 * @returns {Record<string, Record<string, number>>} `target`, for chaining.
 */
export function addFlows(target, delta) {
  if (!delta) return target;
  for (const key of Object.keys(delta)) {
    const causes = delta[key] || {};
    if (!target[key]) target[key] = {};
    for (const cause of Object.keys(causes)) {
      target[key][cause] = (target[key][cause] || 0) + (causes[cause] || 0);
    }
  }
  return target;
}

/**
 * Sum a list of history frames' `delta` maps into one fresh cumulative map.
 * @param {{delta?: Record<string, Record<string, number>>}[]} frames History frames.
 * @returns {Record<string, Record<string, number>>} The cumulative flow matrix.
 */
export function sumDeltas(frames) {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const f of frames || []) addFlows(out, f && f.delta);
  return out;
}

/**
 * Subtract one key's `baseCauses` from `causes`, returning a fresh per-cause map of the non-zero
 * differences, or null when nothing remains.
 * @param {Record<string, number>} causes The newer per-cause counts.
 * @param {Record<string, number>} baseCauses The older per-cause counts to subtract.
 * @returns {Record<string, number>|null} The non-zero difference map, or null.
 */
function subtractCauses(causes, baseCauses) {
  /** @type {Record<string, number>|null} */
  let entry = null;
  for (const cause of Object.keys(causes)) {
    const v = (causes[cause] || 0) - (baseCauses[cause] || 0);
    if (v === 0) continue;
    if (!entry) entry = {};
    entry[cause] = v;
  }
  return entry;
}

/**
 * Subtract `prior` from `cumulative` per key/cause, dropping zero/empty entries.
 * Flows are monotonic (people only ever accumulate), so every retained value is
 * non-negative , the result is the migration that happened SINCE `prior`.
 * Produces fresh objects.
 * @param {Record<string, Record<string, number>>} cumulative The newer cumulative.
 * @param {Record<string, Record<string, number>>} prior The older cumulative to subtract.
 * @returns {Record<string, Record<string, number>>} The delta map.
 */
export function subtractFlows(cumulative, prior) {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  const base = prior || {};
  for (const key of Object.keys(cumulative || {})) {
    const entry = subtractCauses(cumulative[key] || {}, base[key] || {});
    if (entry) out[key] = entry;
  }
  return out;
}

/**
 * Whether a frame sits on an age boundary relative to its predecessor (kept
 * un-merged during decimation so timeline boundary markers survive).
 * @param {{age?: string}} frame The frame.
 * @param {{age?: string}|undefined} prev The previous frame.
 * @returns {boolean} True at an age boundary.
 */
function isAgeBoundary(frame, prev) {
  return !!prev && (frame.age || "") !== (prev.age || "");
}

/**
 * Merge a frame's delta into the accumulator frame, in place (later frame's
 * metadata , turn / age / chartTurn / year , is kept as the merged window's).
 * @param {*} into The accumulator frame (mutated).
 * @param {*} from The later frame whose delta + metadata are merged in.
 */
function mergeInto(into, from) {
  into.delta = addFlows(into.delta || {}, from.delta || {});
  into.turn = from.turn;
  into.age = from.age;
  into.chartTurn = from.chartTurn;
  into.year = from.year;
}

/**
 * Decimate over-cap history by MERGING adjacent deltas (summing them) rather
 * than dropping frames: old time resolution coarsens but cumulative totals stay
 * exact. Age-boundary frames are never merged into their predecessor so the
 * timeline keeps its boundary markers; the most recent frame is always kept
 * standalone. Returns a fresh frame list.
 * @param {*[]} frames The current frames (oldest → newest).
 * @param {number} maxSnapshots The retention cap.
 * @returns {*[]} The decimated frames.
 */
export function mergeAdjacentDeltas(frames, maxSnapshots) {
  if (!Array.isArray(frames) || frames.length <= maxSnapshots) return frames;
  /** @type {*[]} */
  const out = [];
  const lastIdx = frames.length - 1;
  for (let i = 0; i < frames.length; i += 1) {
    const f = frames[i];
    const prevOut = out[out.length - 1];
    // Pair up even-indexed frames with their successor, but never fold across an
    // age boundary and never fold the most-recent frame.
    const canMerge =
      prevOut && i !== lastIdx && i % 2 === 1 && !isAgeBoundary(f, frames[i - 1]);
    if (canMerge) {
      mergeInto(prevOut, f);
    } else {
      out.push({ turn: f.turn, age: f.age, chartTurn: f.chartTurn, year: f.year,
        delta: Object.assign({}, deepCopyDelta(f.delta)) });
    }
  }
  return out;
}

/**
 * Deep-copy a delta map (key → fresh per-cause object) so merges never alias a
 * source frame's cause maps.
 * @param {Record<string, Record<string, number>>} delta The delta to copy.
 * @returns {Record<string, Record<string, number>>} A fresh copy.
 */
function deepCopyDelta(delta) {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const key of Object.keys(delta || {})) out[key] = Object.assign({}, delta[key]);
  return out;
}

/**
 * One-time backward-compat migration: convert legacy frames that carry a
 * cumulative `.flows` clone into delta-encoded frames (`.delta`). Exact:
 * delta[0] = flows[0], delta[i] = flows[i] − flows[i-1]. Idempotent , a no-op
 * once every frame is already delta-encoded. Mutates and returns `frames`.
 * @param {*[]} frames The persisted frames.
 * @returns {*[]} The migrated frames.
 */
export function migrateCumulativeToDeltas(frames) {
  if (!Array.isArray(frames) || !frames.length) return frames;
  const legacy = frames.some((f) => f && f.flows && !f.delta);
  if (!legacy) return frames;
  /** @type {Record<string, Record<string, number>>|null} */
  let prev = null;
  for (const f of frames) {
    const cum = f.flows || {};
    f.delta = subtractFlows(cum, prev || {});
    prev = cum;
    delete f.flows;
  }
  return frames;
}
