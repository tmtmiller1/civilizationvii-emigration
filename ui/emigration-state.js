// emigration-state.js
//
// Persistence + per-pass bookkeeping for the emigration engine. The state (per-source pressure +
// cooldown, the monotonic scaling turn, and the in-flight transit queue) lives in GameConfiguration
// so it survives save/reload. Kept apart from emigration-engine.js so the algorithm reads as the
// algorithm, not the plumbing.

const STATE_KEY = "EmigrationState_v1";

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
 * @property {boolean} infected Whether the source was infected (plague carried on arrival).
 * @property {string} srcName Source city name (arrival flavour).
 * @property {string} destName Destination city name (arrival flavour).
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
  if (!s || typeof s !== "object") return null;
  if (!s.sources) s.sources = {};
  if (typeof s.monoTurn !== "number") s.monoTurn = 0;
  if (!Array.isArray(s.transit)) s.transit = []; // in-flight lagged migrations (Feature 1b)
  return s;
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
  return { sources: {}, monoTurn: 0, transit: [] };
}

/**
 * Persist emigration state to GameConfiguration.
 * @param {*} state State object.
 */
export function saveState(state) {
  try {
    const e = Configuration?.editGame?.();
    if (e && typeof e.setValue === "function") e.setValue(STATE_KEY, JSON.stringify(state));
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
