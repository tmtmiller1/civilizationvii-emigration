// emigration-quarter-state.js
//
// The persistent record of every Cultural Quarter that has formed in the world: ONE quarter per host
// tile (the city-centre plot), keyed "x,y". A quarter is a foreign diaspora that grew large enough to
// keep a district of its own, the stance the player took toward it, and the small yields that stance
// grants each turn (applied per-turn from this record). No stacking: a second origin overtaking the
// same tile REPLACES the record, so a tile always names a single quarter and the per-turn yields simply
// follow whoever currently holds it. Also carries the per-age decision throttle (a cap + a cooldown,
// shared in spirit with the refugee dilemmas) and a "contested" flag set while the host is at war with
// the quarter's homeland.
//
// State persists in GameConfiguration under EmigrationQuarters_v1. Fully defensive: an unreadable or
// malformed blob degrades to an empty store, and no path throws into the pass.

import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { isQuarterOption } from "/emigration/ui/emigration-quarter-registry.js";

const STATE_KEY = "EmigrationQuarters_v1";
const STATE_SCHEMA_VERSION = 1;
const MAX_TILES = 4096;

/**
 * @typedef {Object} QuarterApplied
 * @property {string|null} benefitYield The granted yield (null = none).
 * @property {number} benefitAmount The granted amount (>= 0).
 * @property {string|null} penaltyYield The cost yield (null = none).
 * @property {number} penaltyAmount The cost amount (>= 0).
 */
/**
 * @typedef {Object} QuarterRecord
 * @property {number} civ Origin PLAYER id (whose diaspora holds the quarter); used for naming/war reads.
 * @property {string|null} originCiv Origin CivilizationType captured at formation (e.g. "CIVILIZATION_ROME"),
 *   or null for legacy records. This is the STABLE identity used for the per-civ enclave cap — it does not
 *   drift if the origin player later changes civilisation across an age.
 * @property {number} owner Host player id.
 * @property {string} optionId The stance chosen.
 * @property {number} turn Formation turn (monotonic).
 * @property {QuarterApplied} applied The small yields this stance grants each turn.
 * @property {boolean} contested Whether the host is at war with the origin's homeland.
 * @property {number} contestedTurn Turn the quarter last became contested (-999 if never).
 * @property {number|null} [fadeSince] The turn the origin's share first sat below the fade bar (null = above).
 * @property {boolean} recognized False from ESTABLISHMENT (the enclave exists: record + tile, no stance yet)
 *   until RECOGNITION after the dwell period (the stance is chosen and its yields begin). Records saved
 *   before this field existed were all created at recognition, so an absent value reads as true.
 * @property {PlacedRecord|null} [placed] The constructible placed for this stance, or null when none was placed
 *   (no valid tile / data not loaded); see emigration-enclave-place.js.
 */
/**
 * @typedef {Object} PlacedRecord
 * @property {string} type The type on the map (a unique or fallback improvement, the Village, or the native enclave).
 * @property {number} plot Plot index.
 * @property {string} [enclave] The enclave improvement the record stands for (icon, label).
 * @property {string} [replaced] The improvement the enclave took over, when any.
 * @property {boolean} [stood] Set once the tile has been seen standing (a later disappearance = built over).
 * @property {Record<string, number>} [before] The plot's yields before a takeover.
 * @property {Record<string, number>} [compensation] The replaced improvement's lost yields, paid each turn
 *   while the tile stands (computed once the tile is first seen standing).
 */
/**
 * A pending-enclave dwell clock: an established diaspora that has NOT yet been offered its decision. Kept
 * per host tile so the decision can require the enclave to persist (quarterDwellTurns) before it fires.
 * @typedef {Object} CandidacyRecord
 * @property {number} civ Origin PLAYER id (legacy-fallback identity when a CivilizationType is unavailable).
 * @property {string|null} originCiv Origin CivilizationType captured while observing (stable identity).
 * @property {number} since Turn the current established streak began (the dwell clock's start).
 * @property {number} lastSeen Last turn observed established (for grace-window pruning of a lapsed streak).
 */
/**
 * @typedef {Object} QuartersState
 * @property {Record<string, QuarterRecord>} tiles The formed quarters, one per host tile.
 * @property {Record<string, CandidacyRecord>} candidacy The pending-enclave dwell clocks, one per host tile.
 * @property {number} age The age ordinal the per-age throttle count belongs to.
 * @property {number} count Decisions made this age (per-age cap).
 * @property {number} lastTurn The last decision turn (cooldown clock).
 * @property {{age:number, byOwner:Record<string,number>}} formed Enclaves formed per host this age (pacing).
 */

/** @type {QuartersState | null} */
let _state = null;
registerCacheReset(() => { _state = null; });

/** @type {{turn:number, state:QuartersState} | null} Reader-side snapshot; see {@link quarterSnapshotAt}. */
let _snapshot = null;
registerCacheReset(() => { _snapshot = null; });

/**
 * The current turn (the reader snapshot's refresh key), or 0.
 * @returns {number} Game.turn or 0.
 */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * The current age ordinal (for the per-age cap), or 0.
 * @returns {number} Game.age or 0.
 */
function currentAge() {
  try {
    return typeof Game !== "undefined" && typeof Game.age === "number" ? Game.age : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * @returns {QuartersState} An empty persisted quarters state.
 */
function emptyState() {
  const age = currentAge();
  return { tiles: {}, candidacy: {}, age, count: 0, lastTurn: -999, formed: { age, byOwner: {} } };
}

/**
 * @param {*} v Candidate value.
 * @param {number} fallback Fallback.
 * @returns {number} Non-negative integer, or the fallback.
 */
function nonNegInt(v, fallback) {
  return typeof v === "number" && isFinite(v) ? Math.max(0, Math.floor(v)) : fallback;
}

/**
 * @param {*} v Candidate amount.
 * @returns {number} A finite non-negative number (0 on bad input).
 */
function nonNegNum(v) {
  return typeof v === "number" && isFinite(v) && v > 0 ? v : 0;
}

/**
 * @param {*} y Candidate yield key.
 * @returns {string|null} The yield key when a non-empty string, else null.
 */
function yieldKeyOrNull(y) {
  return typeof y === "string" && y.length ? y : null;
}

/**
 * Resolve persisted payload from a legacy or schema envelope blob.
 * @param {*} parsed Parsed JSON value.
 * @returns {*} Payload object, or null.
 */
function payloadFromBlob(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const payload = typeof parsed.v === "number" && parsed.data && typeof parsed.data === "object"
    ? parsed.data
    : parsed;
  return payload && typeof payload === "object" ? payload : null;
}

/**
 * @param {*} a Candidate applied-yields object.
 * @returns {QuarterApplied} Sanitized applied yields.
 */
function normalizeApplied(a) {
  const src = a && typeof a === "object" ? a : {};
  return {
    benefitYield: yieldKeyOrNull(src.benefitYield),
    benefitAmount: nonNegNum(src.benefitAmount),
    penaltyYield: yieldKeyOrNull(src.penaltyYield),
    penaltyAmount: nonNegNum(src.penaltyAmount)
  };
}

/** @param {*} v @returns {string|null} A non-empty string, else null. */
function strOrNull(v) {
  return typeof v === "string" && v ? v : null;
}

/**
 * @param {*} rec Candidate tile record.
 * @returns {QuarterRecord|null} Sanitized record, or null when unusable.
 */
function normalizeRecord(rec) {
  if (!rec || typeof rec !== "object") return null;
  if (typeof rec.civ !== "number" || !isFinite(rec.civ)) return null;
  if (typeof rec.owner !== "number" || !isFinite(rec.owner)) return null;
  const optionId = isQuarterOption(rec.optionId) ? rec.optionId : "ignore";
  return {
    civ: rec.civ,
    originCiv: strOrNull(rec.originCiv),
    owner: rec.owner,
    optionId,
    turn: nonNegInt(rec.turn, 0),
    applied: normalizeApplied(rec.applied),
    contested: !!rec.contested,
    contestedTurn: typeof rec.contestedTurn === "number" && isFinite(rec.contestedTurn)
      ? Math.floor(rec.contestedTurn) : -999,
    placed: normalizePlaced(rec.placed),
    fadeSince: finiteTurnOrNull(rec.fadeSince),
    recognized: rec.recognized !== false
  };
}

/** A finite turn number floored, else null. @param {*} v Any value. @returns {number|null} The turn or null. */
function finiteTurnOrNull(v) {
  return typeof v === "number" && isFinite(v) ? Math.floor(v) : null;
}

/**
 * @param {*} p A candidate placed-improvement descriptor.
 * @returns {PlacedRecord|null} The descriptor, or null when malformed.
 */
function normalizePlaced(p) {
  if (!p || typeof p !== "object") return null;
  if (typeof p.type !== "string" || !p.type.length) return null;
  if (typeof p.plot !== "number" || !isFinite(p.plot)) return null;
  /** @type {PlacedRecord} */
  const out = { type: p.type, plot: Math.floor(p.plot) };
  if (p.stood === true) out.stood = true;
  return withOptionalFields(out, p);
}

/**
 * Copy the optional placed-record fields that are well-formed.
 * @param {PlacedRecord} out The record being built. @param {*} p The candidate descriptor.
 * @returns {PlacedRecord} `out`.
 */
function withOptionalFields(out, p) {
  const enclave = nonEmptyString(p.enclave);
  if (enclave) out.enclave = enclave;
  const replaced = nonEmptyString(p.replaced);
  if (replaced) out.replaced = replaced;
  const before = yieldMap(p.before);
  if (before) out.before = before;
  const comp = yieldMap(p.compensation);
  if (comp) out.compensation = comp;
  return out;
}

/** A non-empty string, or null. @param {*} v Any value. @returns {string|null} The string, or null. */
function nonEmptyString(v) {
  return typeof v === "string" && v.length ? v : null;
}

/**
 * A sanitized {YIELD_X: n} map (finite numbers, non-empty), or null.
 * @param {*} m A candidate map. @returns {Record<string, number>|null} The map, or null.
 */
function yieldMap(m) {
  if (!m || typeof m !== "object") return null;
  /** @type {Record<string, number>} */
  const out = {};
  for (const [k, v] of Object.entries(m)) if (typeof k === "string" && k.length && typeof v === "number" && isFinite(v)) out[k] = v;
  return Object.keys(out).length ? out : null;
}

/**
 * @param {*} tiles Candidate tiles map.
 * @returns {Record<string, QuarterRecord>} Sanitized tiles map.
 */
function normalizeTiles(tiles) {
  /** @type {Record<string, QuarterRecord>} */
  const out = {};
  if (!tiles || typeof tiles !== "object") return out;
  let n = 0;
  for (const [key, raw] of Object.entries(tiles)) {
    if (n >= MAX_TILES) break;
    if (typeof key !== "string" || !key.length) continue;
    const rec = normalizeRecord(raw);
    if (!rec) continue;
    out[key] = rec;
    n++;
  }
  return out;
}

/**
 * @param {*} rec Candidate candidacy record.
 * @returns {CandidacyRecord|null} Sanitized record, or null when unusable.
 */
function normalizeCandidacyRecord(rec) {
  if (!rec || typeof rec !== "object") return null;
  if (typeof rec.civ !== "number" || !isFinite(rec.civ)) return null;
  return {
    civ: rec.civ,
    originCiv: strOrNull(rec.originCiv),
    since: nonNegInt(rec.since, 0),
    lastSeen: nonNegInt(rec.lastSeen, 0)
  };
}

/**
 * @param {*} map Candidate candidacy map.
 * @returns {Record<string, CandidacyRecord>} Sanitized candidacy map.
 */
function normalizeCandidacy(map) {
  /** @type {Record<string, CandidacyRecord>} */
  const out = {};
  if (!map || typeof map !== "object") return out;
  let n = 0;
  for (const [key, raw] of Object.entries(map)) {
    if (n >= MAX_TILES) break;
    if (typeof key !== "string" || !key.length) continue;
    const rec = normalizeCandidacyRecord(raw);
    if (!rec) continue;
    out[key] = rec;
    n++;
  }
  return out;
}

/**
 * @param {*} parsed Parsed persisted state.
 * @returns {QuartersState|null} Normalized state, or null.
 */
function normalizeState(parsed) {
  const payload = payloadFromBlob(parsed);
  if (!payload) return null;
  return {
    tiles: normalizeTiles(payload.tiles),
    candidacy: normalizeCandidacy(payload.candidacy),
    age: nonNegInt(payload.age, 0),
    count: nonNegInt(payload.count, 0),
    lastTurn: typeof payload.lastTurn === "number" && isFinite(payload.lastTurn)
      ? Math.floor(payload.lastTurn) : -999,
    formed: normalizeFormed(payload.formed)
  };
}

/**
 * The per-age "enclaves formed per host" counters: {age, byOwner: {pid: n}}. Malformed rows dropped.
 * @param {*} f Candidate value. @returns {{age:number, byOwner:Record<string,number>}} Sanitized.
 */
function normalizeFormed(f) {
  const src = f && typeof f === "object" ? f : {};
  /** @type {Record<string,number>} */
  const byOwner = {};
  const raw = src.byOwner && typeof src.byOwner === "object" ? src.byOwner : {};
  for (const k of Object.keys(raw)) {
    const n = nonNegInt(raw[k], 0);
    if (/^\d+$/.test(k) && n > 0) byOwner[k] = n;
  }
  return { age: nonNegInt(src.age, 0), byOwner };
}

/**
 * The formed counters for the CURRENT age (reset when the age hash changes). Does NOT persist.
 * @returns {{age:number, byOwner:Record<string,number>}} The live counters.
 */
function formedNow() {
  const s = state();
  const age = currentAge();
  if (!s.formed || s.formed.age !== age) s.formed = { age, byOwner: {} };
  return s.formed;
}

/**
 * Enclaves a host civilization has formed this age (recognized, automatic or by decision).
 * @param {number} owner Host player id. @returns {number} The count.
 */
export function formedThisAge(owner) {
  return nonNegInt(formedNow().byOwner[String(owner)], 0);
}

/**
 * Count one more enclave formed by a host this age. Does NOT persist (the caller saves).
 * @param {number} owner Host player id.
 */
export function noteFormed(owner) {
  if (typeof owner !== "number") return;
  const f = formedNow();
  f.byOwner[String(owner)] = formedThisAge(owner) + 1;
}

/**
 * The raw persisted state string, or null.
 * @returns {string|null} The stored JSON, or null.
 */
function readStored() {
  const g = Configuration?.getGame?.();
  const v = g && typeof g.getValue === "function" ? g.getValue(STATE_KEY) : null;
  return typeof v === "string" && v.length ? v : null;
}

/**
 * Read + parse the persisted state, or null when absent/unusable.
 * @returns {QuartersState|null} State.
 */
function loadState() {
  try {
    const raw = readStored();
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Load (once) the persisted quarters state into the module cache.
 * @returns {QuartersState} State.
 */
function state() {
  resetCachesOnNewGame();
  if (!_state) _state = loadState() || emptyState();
  return _state;
}

/** Persist the quarters state. */
export function saveQuarters() {
  try {
    const normalized = normalizeState(_state) || emptyState();
    Configuration?.editGame?.()?.setValue?.(
      STATE_KEY,
      JSON.stringify({ v: STATE_SCHEMA_VERSION, data: normalized })
    );
  } catch (_) {
    /* ignore - a failed save must never break the pass */
  }
}

/**
 * The quarter record on a tile, or null when none.
 * @param {string} tileKey The "x,y" plot key.
 * @returns {QuarterRecord|null} The record, or null.
 */
export function quarterAt(tileKey) {
  if (typeof tileKey !== "string" || !tileKey.length) return null;
  return state().tiles[tileKey] || null;
}

/**
 * A tile's quarter record as a READER in another isolate sees it, re-read from the store once per turn.
 *
 * Use this, not {@link quarterAt}, from any isolate that does not itself write quarters. `_state` is
 * loaded once and then held as the writer's live working copy (it carries in-pass mutations that are
 * persisted at the end of the pass), so a reader isolate that touched it before any enclave existed
 * would cache an EMPTY store and never see one form — the lens would silently stop pinning for the whole
 * session. Each `<Item>` in the modinfo is its own V8 isolate with no shared memory, so this is the same
 * reload-from-persistence discipline emigration-composition.js uses for its own cross-isolate readers.
 *
 * Deliberately a SEPARATE cache from `_state`: refreshing `_state` here would discard a writer's
 * uncommitted mid-pass changes.
 * @param {string} tileKey The "x,y" settlement-centre key.
 * @returns {QuarterRecord|null} The record, or null.
 */
export function quarterSnapshotAt(tileKey) {
  if (typeof tileKey !== "string" || !tileKey.length) return null;
  resetCachesOnNewGame();
  const turn = gameTurn();
  if (!_snapshot || _snapshot.turn !== turn) _snapshot = { turn, state: loadState() || emptyState() };
  return _snapshot.state.tiles[tileKey] || null;
}

/**
 * Write (or replace) a tile's quarter record. Caps the store size; a write past the cap is dropped
 * rather than growing unbounded. Does NOT persist (the caller persists once per pass).
 * @param {string} tileKey The plot key. @param {QuarterRecord} rec The record.
 */
export function putQuarter(tileKey, rec) {
  if (typeof tileKey !== "string" || !tileKey.length) return;
  const clean = normalizeRecord(rec);
  if (!clean) return;
  const s = state();
  if (!s.tiles[tileKey] && Object.keys(s.tiles).length >= MAX_TILES) return;
  s.tiles[tileKey] = clean;
}

/**
 * Remove a tile's quarter record (if any). Does NOT persist.
 * @param {string} tileKey The plot key.
 */
export function dropQuarter(tileKey) {
  if (typeof tileKey !== "string") return;
  delete state().tiles[tileKey];
}

/**
 * The dwell-clock candidacy record on a tile, or null when none.
 * @param {string} tileKey The plot key.
 * @returns {CandidacyRecord|null} The record, or null.
 */
export function candidacyAt(tileKey) {
  if (typeof tileKey !== "string" || !tileKey.length) return null;
  return state().candidacy[tileKey] || null;
}

/**
 * Write (or replace) a tile's candidacy record. Caps the store size like the tiles map. Does NOT persist.
 * @param {string} tileKey The plot key. @param {CandidacyRecord} rec The record.
 */
export function putCandidacy(tileKey, rec) {
  if (typeof tileKey !== "string" || !tileKey.length) return;
  const clean = normalizeCandidacyRecord(rec);
  if (!clean) return;
  const s = state();
  if (!s.candidacy[tileKey] && Object.keys(s.candidacy).length >= MAX_TILES) return;
  s.candidacy[tileKey] = clean;
}

/**
 * Remove a tile's candidacy record (if any). Does NOT persist.
 * @param {string} tileKey The plot key.
 */
export function dropCandidacy(tileKey) {
  if (typeof tileKey !== "string") return;
  delete state().candidacy[tileKey];
}

/**
 * Every candidacy record with its tile key.
 * @returns {{tileKey:string, rec:CandidacyRecord}[]} The entries.
 */
export function allCandidacyEntries() {
  const s = state();
  return Object.keys(s.candidacy).map((tileKey) => ({ tileKey, rec: s.candidacy[tileKey] }));
}

/**
 * Whether a tile's established enclave has persisted long enough (its dwell clock has run at least
 * CONFIG.quarterDwellTurns turns) to OFFER its decision. Requires a candidacy record that still names this
 * origin (identity by CivilizationType, with a legacy fallback to the raw origin player id). With
 * quarterDwellTurns = 0 this is satisfied as soon as a candidacy exists (legacy "offer on cross").
 * @param {string} tileKey The plot key. @param {string|null} originCiv The origin's resolved CivilizationType.
 * @param {number} civ The origin player id (legacy fallback). @param {number} turn Now (monotonic).
 * @param {number} [relax] Per-age pacing relaxation in [0, 1): the dwell reads turns x (1 - relax), min 2.
 * @returns {boolean} True when the enclave has dwelt long enough.
 */
export function dwellSatisfied(tileKey, originCiv, civ, turn, relax) {
  const p = dwellProgress(tileKey, originCiv, civ, turn, relax);
  return !!p && p.elapsed >= p.needed;
}

/**
 * How far a tile's candidacy has dwelt toward recognition: elapsed monotonic turns and the turns needed
 * (the configured dwell, reduced by the pacing relaxation, never below 2 unless the dwell is 0). Null
 * when no candidacy names this origin.
 * @param {string} tileKey The plot key. @param {string|null} originCiv The origin's CivilizationType.
 * @param {number} civ The origin player id (legacy fallback). @param {number} turn Now (monotonic).
 * @param {number} [relax] Pacing relaxation. @returns {{elapsed:number, needed:number}|null} The progress.
 */
export function dwellProgress(tileKey, originCiv, civ, turn, relax) {
  const rec = candidacyAt(tileKey);
  if (!rec) return null;
  const same = originCiv && rec.originCiv ? rec.originCiv === originCiv : rec.civ === civ;
  if (!same) return null;
  const dwell = Math.max(0, Number(CONFIG.quarterDwellTurns) || 0);
  const r = Math.min(1, Math.max(0, Number(relax) || 0));
  const needed = dwell === 0 ? 0 : Math.max(2, Math.round(dwell * (1 - r)));
  const elapsed = typeof turn === "number" && isFinite(turn) ? Math.max(0, turn - rec.since) : 0;
  return { elapsed, needed };
}

/**
 * Every quarter record with its tile key.
 * @returns {{tileKey:string, rec:QuarterRecord}[]} The entries.
 */
export function allQuarterEntries() {
  const s = state();
  return Object.keys(s.tiles).map((tileKey) => ({ tileKey, rec: s.tiles[tileKey] }));
}

/**
 * Every quarter record hosted by a given owner.
 * @param {number} owner Host player id.
 * @returns {{tileKey:string, rec:QuarterRecord}[]} The entries.
 */
export function quartersForOwner(owner) {
  if (typeof owner !== "number") return [];
  return allQuarterEntries().filter((e) => e.rec.owner === owner);
}

/**
 * Whether a fresh quarter DECISION may fire now: under the per-age cap and past the cooldown. Resets
 * the cap count when the age has advanced. (Formation of the quarter record itself is not throttled,
 * only the player-facing choice modal is, so modals stay rare.)
 * @param {number} turn Now (monotonic). @param {number} age Current age ordinal.
 * @returns {boolean} True when a decision may fire.
 */
export function canDecide(turn, age) {
  const s = state();
  if (age !== s.age) {
    s.age = age;
    s.count = 0;
  }
  const cap = Math.max(0, Number(CONFIG.quarterCapPerAge) || 0);
  if (s.count >= cap) return false;
  const cooldown = Math.max(0, Number(CONFIG.quarterCooldownTurns) || 0);
  return turn - s.lastTurn >= cooldown;
}

/**
 * Stamp the decision throttle (increment the per-age count and set the cooldown clock). Does NOT
 * persist.
 * @param {number} turn Now (monotonic).
 */
export function noteDecision(turn) {
  const s = state();
  s.count += 1;
  if (typeof turn === "number" && isFinite(turn)) s.lastTurn = Math.floor(turn);
}

/**
 * Set (or clear) a tile's contested flag, stamping the turn it became contested. Does NOT persist.
 * @param {string} tileKey The plot key. @param {boolean} on Whether contested. @param {number} turn Now.
 */
export function setContested(tileKey, on, turn) {
  const rec = quarterAt(tileKey);
  if (!rec) return;
  const nowOn = !!on;
  if (nowOn && !rec.contested) rec.contestedTurn = typeof turn === "number" && isFinite(turn) ? Math.floor(turn) : rec.contestedTurn;
  rec.contested = nowOn;
}

// Test hook.
export const __test = {
  STATE_KEY,
  emptyState,
  normalizeState,
  normalizeRecord,
  normalizeCandidacyRecord,
  loadStateForTest: () => loadState(),
  readStateForTest: () => state(),
  persistStateForTest: () => saveQuarters()
};
