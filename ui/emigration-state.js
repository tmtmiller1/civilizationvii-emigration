// emigration-state.js
//
// Persistence + per-pass bookkeeping for the emigration engine. The state (per-source pressure +
// cooldown, the monotonic scaling turn, and the in-flight transit queue) lives in GameConfiguration
// so it survives save/reload.

const STATE_KEY = "EmigrationState_v1";
const STATE_SCHEMA_VERSION = 2;
const MAX_SOURCE_ENTRIES = 4096;
const MAX_TRANSIT_ENTRIES = 4096;

function defaultState() {
  /** @type {EmigState} */
  const s = { sources: {}, monoTurn: 0, transit: [] };
  return s;
}

/**
 * @param {*} v Candidate number.
 * @param {number} fallback Fallback value.
 * @returns {number} Finite number or fallback.
 */
function finiteNumberOr(v, fallback) {
  return typeof v === "number" && isFinite(v) ? v : fallback;
}

/**
 * @param {*} v Candidate string.
 * @param {string} fallback Fallback string.
 * @returns {string} String or fallback.
 */
function stringOr(v, fallback) {
  return typeof v === "string" ? v : fallback;
}

/**
 * @param {*} v Candidate source row.
 * @returns {{pressure:number, cooldown:number, crisisCooldown:number, deathPressure:number,
 *   crisisTenure:number, unrestTenure:number}} Normalized source row.
 */
function normalizeSourceEntry(v) {
  if (!v || typeof v !== "object") {
    return { pressure: 0, cooldown: 0, crisisCooldown: 0, deathPressure: 0, crisisTenure: 0, unrestTenure: 0 };
  }
  return {
    pressure: finiteNumberOr(v.pressure, 0),
    cooldown: Math.max(0, Math.floor(finiteNumberOr(v.cooldown, 0))),
    crisisCooldown: Math.max(0, Math.floor(finiteNumberOr(v.crisisCooldown, 0))),
    // Death-channel state persists so the onset ramp survives save/reload during a long crisis.
    deathPressure: Math.max(0, finiteNumberOr(v.deathPressure, 0)),
    crisisTenure: Math.max(0, Math.floor(finiteNumberOr(v.crisisTenure, 0))),
    // Sustained-unrest counter persists so the "unrest turns lethal only after neglect" gate survives reload.
    unrestTenure: Math.max(0, Math.floor(finiteNumberOr(v.unrestTenure, 0)))
  };
}

/**
 * @param {*} v Candidate transit row.
 * @returns {Transit|null} Normalized transit row, or null if unusable.
 */
function normalizeTransitEntry(v) {
  if (!v || typeof v !== "object") return null;
  const destKey = stringOr(v.destKey, "");
  const arriveTurn = finiteNumberOr(v.arriveTurn, Number.NaN);
  const people = finiteNumberOr(v.people, Number.NaN);
  const srcOwner = finiteNumberOr(v.srcOwner, Number.NaN);
  const destOwner = finiteNumberOr(v.destOwner, Number.NaN);
  const nums = [arriveTurn, people, srcOwner, destOwner];
  if (!destKey || nums.some((n) => !isFinite(n))) {
    return null;
  }
  /** @type {Transit} */
  const row = {
    destKey,
    arriveTurn,
    people,
    srcOwner,
    destOwner,
    crossCiv: !!v.crossCiv,
    cause: stringOr(v.cause, "other"),
    eventKey: typeof v.eventKey === "string" ? v.eventKey : undefined,
    infected: !!v.infected,
    srcName: stringOr(v.srcName, ""),
    destName: stringOr(v.destName, "")
  };
  // Carry the deferral counter across persist/load: runPass reloads + re-saves state every turn, so
  // dropping it here would reset `defers` to 0 each turn and the MAX_DEFERS perish guard
  // (and the longest-waiting-first arrival sort) could never fire. Kept optional (only when > 0).
  const defers = Math.max(0, Math.floor(finiteNumberOr(v.defers, 0)));
  if (defers > 0) row.defers = defers;
  return withIdentity(row, v);
}

/**
 * Copy who the migrant is and where they left from / are going onto a normalized transit row.
 * Optional: an entry without them keeps the single-origin attribution on arrival.
 * @param {Transit} row The normalized row (mutated). @param {*} v The raw entry. @returns {Transit} The row.
 */
function withIdentity(row, v) {
  const originMix = normalizeOriginMix(v.originMix);
  if (originMix) row.originMix = originMix;
  if (typeof v.srcLoc === "string" && v.srcLoc) row.srcLoc = v.srcLoc;
  if (typeof v.destLoc === "string" && v.destLoc) row.destLoc = v.destLoc;
  return row;
}

/**
 * A persisted origin mix as origin civ → fraction, summing to 1, or undefined when unusable. Drops any
 * non-finite or non-positive fraction and renormalizes the rest.
 * @param {*} raw A raw mix. @returns {Record<string, number>|undefined} The clean mix.
 */
export function normalizeOriginMix(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  /** @type {Record<string, number>} */
  const out = {};
  let sum = 0;
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    if (typeof v === "number" && isFinite(v) && v > 0 && isFinite(Number(k))) {
      out[k] = v;
      sum += v;
    }
  }
  if (!(sum > 0)) return undefined;
  for (const k of Object.keys(out)) out[k] /= sum;
  return out;
}

/**
 * @param {*} s Parsed state blob.
 * @returns {Record<string, *>|null} Canonical payload object, supporting legacy and schema envelopes.
 */
function payloadFromStateBlob(s) {
  if (!s || typeof s !== "object") return null;
  const payload = typeof s.v === "number" && s.data && typeof s.data === "object" ? s.data : s;
  return payload && typeof payload === "object" ? payload : null;
}

/**
 * @param {*} monoTurn Candidate monotonic turn.
 * @returns {number} Normalized monotonic turn.
 */
function normalizeMonoTurn(monoTurn) {
  return Math.max(0, Math.floor(finiteNumberOr(monoTurn, 0)));
}

/**
 * @param {*} sources Candidate sources map.
 * @returns {Record<string, {pressure:number, cooldown:number, crisisCooldown:number}>} Normalized map.
 */
function normalizeSourcesMap(sources) {
  /** @type {Record<string, {pressure:number, cooldown:number, crisisCooldown:number}>} */
  const out = {};
  if (!sources || typeof sources !== "object") return out;
  let n = 0;
  for (const [key, value] of Object.entries(sources)) {
    if (n >= MAX_SOURCE_ENTRIES) break;
    if (typeof key !== "string" || !key.length) continue;
    out[key] = normalizeSourceEntry(value);
    n++;
  }
  return out;
}

/**
 * @param {*} transit Candidate transit list.
 * @returns {Transit[]} Normalized transit list.
 */
function normalizeTransitList(transit) {
  /** @type {Transit[]} */
  const out = [];
  if (!Array.isArray(transit)) return out;
  for (const item of transit) {
    if (out.length >= MAX_TRANSIT_ENTRIES) break;
    const row = normalizeTransitEntry(item);
    if (row) out.push(row);
  }
  return out;
}

/**
 * One in-flight (lagged) migration awaiting arrival at its destination.
 * @typedef {Object} Transit
 * @property {string} destKey Destination city key (matched against the live ranking on arrival).
 * @property {number} arriveTurn Monotonic turn at/after which it lands.
 * @property {number} people Historically-scaled people in transit.
 * @property {number} srcOwner Source owner (charged the death if the destination is gone).
 * @property {number} destOwner Destination owner (credited the immigration on arrival).
 * @property {boolean} crossCiv Whether it crossed civilizations.
 * @property {string} cause Why they left (for the arrival record's flavor).
 * @property {string} [eventKey] The specific event behind the cause (war/disaster/crisis), carried
 *   to the arrival so immigration can be attributed to it.
 * @property {string[]} [reasons] The "why here" reason tags captured at departure, forwarded
 *   to the arrival record.
 * @property {boolean} infected Whether the source was infected (plague carried on arrival).
 * @property {string} srcName Source city name (arrival flavor).
 * @property {string} destName Destination city name (arrival flavor).
 * @property {number} [defers] Times this arrival has been deferred (destination at its inbound cap);
 *   perishes once it exceeds MAX_DEFERS so it's never stuck in transit forever.
 * @property {Record<string, number>} [originMix] Who the migrant is, origin civ → fraction, captured at
 *   departure and forwarded to the arrival record (see Migration.originMix).
 * @property {string} [srcLoc] The source settlement's center plot "x,y".
 * @property {string} [destLoc] The destination settlement's center plot "x,y".
 */

/**
 * @typedef {Object} EmigState
 * @property {Record<string, {pressure:number, cooldown:number}>} sources Per-source state.
 * @property {number} monoTurn Monotonic scaling turn (never resets at age boundaries).
 * @property {Transit[]} transit In-flight lagged migrations awaiting arrival.
 */

/**
 * The current age-local game turn, defaulting to 0.
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
 * Read the raw persisted state string from GameConfiguration, or null.
 * @returns {string|null} The stored JSON string, or null.
 */
function readStateRaw() {
  const g = Configuration?.getGame?.();
  if (!g || typeof g.getValue !== "function") return null;
  const v = g.getValue(STATE_KEY);
  return typeof v === "string" && v.length ? v : null;
}

/**
 * Coerce a parsed value into the canonical state shape, or null if unusable.
 * @param {*} s Parsed value.
 * @returns {*} The normalized state, or null.
 */
function normalizeState(s) {
  const payload = payloadFromStateBlob(s);
  if (!payload) return null;

  /** @type {EmigState} */
  const out = defaultState();
  out.monoTurn = normalizeMonoTurn(payload.monoTurn);
  out.sources = normalizeSourcesMap(payload.sources);
  out.transit = normalizeTransitList(payload.transit);
  return out;
}

/**
 * Load persisted emigration state from GameConfiguration.
 * @returns {EmigState} The state.
 */
export function loadState() {
  try {
    const raw = readStateRaw();
    if (raw) {
      const s = normalizeState(JSON.parse(raw));
      if (s) return s;
    }
  } catch (_) {
    /* ignore */
  }
  return defaultState();
}

/**
 * Persist emigration state to GameConfiguration.
 * @param {*} state State object.
 */
export function saveState(state) {
  try {
    const normalized = normalizeState(state) || defaultState();
    const e = Configuration?.editGame?.();
    if (e && typeof e.setValue === "function") {
      e.setValue(STATE_KEY, JSON.stringify({ v: STATE_SCHEMA_VERSION, data: normalized }));
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * Whether the in-flight transit queue is at its hard cap (`MAX_TRANSIT_ENTRIES`). Checked at ENQUEUE
 * time so a lagged departure is never started when it couldn't be persisted (the load-time truncation
 * would silently destroy in-flight population); at capacity the migrant simply stays home this turn.
 * @param {*} state Loaded state (transit queue).
 * @returns {boolean} True when no further transit rows may be enqueued this turn.
 */
export function transitAtCapacity(state) {
  return !!state && Array.isArray(state.transit) && state.transit.length >= MAX_TRANSIT_ENTRIES;
}

/**
 * Advance the monotonic turn (so scaling never resets at age boundaries) and prune stale per-source
 * state + tick cooldowns against the current ranking.
 * @param {*} state Loaded state (sources + monoTurn).
 * @param {*[]} ranked Ranked signals.
 */
export function prepareState(state, ranked) {
  state.monoTurn = Math.max(state.monoTurn + 1, gameTurn());
  const live = new Set(ranked.map((s) => s.key));
  const sources = state.sources;
  for (const k of Object.keys(sources)) {
    if (!live.has(k)) {
      delete sources[k];
    } else {
      if (sources[k].cooldown > 0) sources[k].cooldown--; // voluntary post-move rest
      if (sources[k].crisisCooldown > 0) sources[k].crisisCooldown--; // crisis track (unused today; 0)
    }
  }
}

/** Below this a decayed pressure snaps to 0, so a drained source reads as genuinely idle. */
const PRESSURE_FLOOR = 0.01;

/**
 * Bleed every source's accumulated emigration pressure toward zero, once per pass, BEFORE the turn's
 * pull is added, so the charge reads CURRENT conditions in both directions (a city charged up by a
 * siege does not discharge it as a peacetime move many turns later). Runs over the whole persisted
 * map, so a source resting on cooldown or skipped this pass drains too.
 * @param {*} state Loaded state (its `sources` map is mutated in place).
 * @param {number} retention Per-turn retention in [0, 1). 1, or anything unusable, leaves the
 *   accumulator alone (the legacy ratchet). Speed re-basing is the caller's job.
 */
export function tickPressure(state, retention) {
  if (!(retention >= 0) || retention >= 1) return;
  const sources = state && state.sources;
  if (!sources) return;
  for (const k of Object.keys(sources)) {
    const v = finiteNumberOr(sources[k].pressure, 0) * retention;
    sources[k].pressure = v < PRESSURE_FLOOR ? 0 : v;
  }
}

/**
 * Sum total population per owner across the ranking (for the congestion headwind).
 * @param {*[]} ranked Ranked signals.
 * @returns {Record<number, number>} owner id → total population.
 */
export function ownerPopulations(ranked) {
  /** @type {Record<number, number>} */
  const m = {};
  for (const s of ranked) m[s.owner] = (m[s.owner] || 0) + (s.population || 0);
  return m;
}

// Test-only access to the transit-row normalizer (the persistence round trip the engine relies on).
export const __test = { normalizeTransitEntry };
