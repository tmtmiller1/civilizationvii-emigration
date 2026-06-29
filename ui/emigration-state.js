// emigration-state.js
//
// Persistence + per-pass bookkeeping for the emigration engine. The state (per-source pressure +
// cooldown, the monotonic scaling turn, and the in-flight transit queue) lives in GameConfiguration
// so it survives save/reload. Kept apart from emigration-engine.js so the algorithm reads as the
// algorithm, not the plumbing.

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
 * @returns {{pressure:number, cooldown:number, crisisCooldown:number}} Normalized source row.
 */
function normalizeSourceEntry(v) {
  if (!v || typeof v !== "object") return { pressure: 0, cooldown: 0, crisisCooldown: 0 };
  return {
    pressure: finiteNumberOr(v.pressure, 0),
    cooldown: Math.max(0, Math.floor(finiteNumberOr(v.cooldown, 0))),
    crisisCooldown: Math.max(0, Math.floor(finiteNumberOr(v.crisisCooldown, 0)))
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
  return {
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
 * @property {string} cause Why they left (for the arrival record's flavour).
 * @property {string} [eventKey] The specific event behind the cause (war/disaster/crisis), carried
 *   to the arrival so immigration can be attributed to it.
 * @property {boolean} infected Whether the source was infected (plague carried on arrival).
 * @property {string} srcName Source city name (arrival flavour).
 * @property {string} destName Destination city name (arrival flavour).
 * @property {number} [defers] Times this arrival has been deferred (destination at its inbound cap);
 *   force-landed once it exceeds MAX_DEFERS so it's never stuck in transit forever.
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
