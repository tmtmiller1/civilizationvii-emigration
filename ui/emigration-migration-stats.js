// emigration-migration-stats.js
//
// The per-civ migration TALLIES: as each pass's migrations are recorded, accumulate per-player
// cumulative net / gross-out / gross-in / refugees / deaths, and expose per-sample deltas (used by
// the Demographics graphs, wired in emigration-demographics.js) plus cumulative reads
// (globalThis.EmigrationData, used by the Demographics war tooltip + the feedback layer).
//
// Tallies persist in GameConfiguration. The schema extends the original net-only blob
// backward-compatibly (older saves simply lack the new maps, which default to {}).

import { isRefugeeCause } from "/emigration/ui/emigration-causes.js";
import { citySnapshot } from "/emigration/ui/emigration-city-readout-data.js";

const STATE_KEY = "EmigrationMigStats_v1";

/** In-memory ring of the most recent moves (newest last), for the live readout/feed. Not persisted
 * — it's a session-local "what just happened" surface, so a reload simply starts it empty. */
const RECENT_CAP = 50;
/** @type {{srcOwner?:number, destOwner?:number, people?:number, cause?:string}[]} */
let _recent = [];

/**
 * @typedef {Object} MigStatsState
 * @property {Record<string, number>} cum Cumulative net per player.
 * @property {Record<string, number>} lastSampled Net watermark (per-sample delta).
 * @property {Record<string, number>} out Cumulative gross emigration per player.
 * @property {Record<string, number>} in Cumulative gross immigration per player.
 * @property {Record<string, number>} refugees Cumulative non-unhappiness emigration.
 * @property {Record<string, number>} deaths Cumulative population lost to attrition (the outlet).
 * @property {Record<string, number>} wmOut Gross-emigration watermark.
 * @property {Record<string, number>} wmIn Gross-immigration watermark.
 * @property {Record<string, Record<string, number>>} outByCause Cumulative emigration, per cause.
 * @property {Record<string, Record<string, number>>} inByCause Immigration cumulative by cause.
 * @property {Record<string, Record<string, number>>} wmOutByCause Per-cause emigration watermarks.
 * @property {Record<string, Record<string, number>>} wmInByCause Per-cause immigration watermarks.
 */

/** @type {MigStatsState | null} */
let _s = null;

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
 * `v` if it's an object, else a fresh empty map. Keeps `normalize` flat (no per-field `||`).
 * @param {*} v Value.
 * @returns {*} An object.
 */
function mapOr(v) {
  return v && typeof v === "object" ? v : {};
}

/**
 * Coerce a parsed object into the canonical state shape (filling missing maps).
 * @param {*} o Parsed object.
 * @returns {MigStatsState} The normalized state.
 */
function normalize(o) {
  return {
    cum: mapOr(o.cum),
    lastSampled: mapOr(o.lastSampled),
    out: mapOr(o.out),
    in: mapOr(o.in),
    refugees: mapOr(o.refugees),
    deaths: mapOr(o.deaths),
    wmOut: mapOr(o.wmOut),
    wmIn: mapOr(o.wmIn),
    outByCause: mapOr(o.outByCause),
    inByCause: mapOr(o.inByCause),
    wmOutByCause: mapOr(o.wmOutByCause),
    wmInByCause: mapOr(o.wmInByCause)
  };
}

/**
 * Load (once) the persisted tallies.
 * @returns {MigStatsState} State.
 */
function load() {
  if (_s) return _s;
  try {
    const raw = readStored();
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === "object") {
        _s = normalize(o);
        return _s;
      }
    }
  } catch (_) {
    /* ignore */
  }
  _s = normalize({});
  return _s;
}

/** Persist the tallies to GameConfiguration. */
function save() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(_s));
  } catch (_) {
    /* ignore */
  }
}

/**
 * Fold one migration into the tallies: a gain for the destination owner, an equal loss for the
 * source owner, and - when the move was caused by war/disaster/conquest - a refugee tally on the
 * source. Also tracks per-cause emigration/immigration breakdowns for tooltips.
 * @param {MigStatsState} s State.
 * @param {{srcOwner?:number, destOwner?:number, people:number, cause?:string}} m Migration.
 */
function foldMigration(s, m) {
  const p = typeof m.people === "number" && isFinite(m.people) ? m.people : 0;
  const c = m.cause || "other"; // Default cause if unspecified
  // Attrition is a death, not a migration: it never touches the migration/refugee tallies (no one
  // received these people) - only the deaths counter.
  if (m.cause === "attrition") {
    if (typeof m.srcOwner === "number") add(s.deaths, m.srcOwner, p);
    return;
  }
  if (typeof m.destOwner === "number") {
    add(s.cum, m.destOwner, p);
    add(s.in, m.destOwner, p);
    add(s.inByCause, m.destOwner, p, c);
  }
  if (typeof m.srcOwner !== "number") return;
  add(s.cum, m.srcOwner, -p);
  add(s.out, m.srcOwner, p);
  add(s.outByCause, m.srcOwner, p, c);
  if (isRefugeeCause(m.cause)) add(s.refugees, m.srcOwner, p); // war/disaster/conquest only
}

/**
 * Add `delta` to a tally map entry (treating missing as 0). Supports both flat maps (map[id])
 * and nested cause maps (map[id][cause]).
 * @param {Record<string, any>} map A tally map (flat, or nested by cause).
 * @param {number} id Player id.
 * @param {number} delta Signed amount.
 * @param {string} [cause] Optional cause key for nested maps.
 */
function add(map, id, delta, cause) {
  if (typeof cause === "string") {
    if (!map[id]) map[id] = {};
    map[id][cause] = (map[id][cause] || 0) + delta;
  } else {
    map[id] = (map[id] || 0) + delta;
  }
}

/**
 * Fold a pass's migrations into the cumulative tallies.
 * @param {{srcOwner?:number, destOwner?:number, people:number, cause?:string}[]} migs Migrations.
 */
export function recordMigrations(migs) {
  if (!Array.isArray(migs) || !migs.length) return;
  const s = load();
  for (const m of migs) foldMigration(s, m);
  pushRecent(migs);
  save();
}

/**
 * Append a pass's moves to the in-memory recent ring (newest last), trimmed to RECENT_CAP.
 * @param {{srcOwner?:number, destOwner?:number, people?:number, cause?:string}[]} migs Migrations.
 */
function pushRecent(migs) {
  for (const m of migs) _recent.push(m);
  if (_recent.length > RECENT_CAP) _recent = _recent.slice(_recent.length - RECENT_CAP);
}

/**
 * The most recent moves involving a player (newest first), from the session-local ring. Drives the
 * live "why am I gaining/losing people?" feed; empty after a reload until new moves occur.
 * @param {number} pid Player id.
 * @param {number} [limit] Max entries to return (default 10).
 * @returns {{srcOwner?:number, destOwner?:number, people?:number, cause?:string}[]} Recent moves.
 */
export function recentEventsFor(pid, limit = 10) {
  const out = [];
  for (let i = _recent.length - 1; i >= 0 && out.length < limit; i--) {
    const m = _recent[i];
    if (m.srcOwner === pid || m.destOwner === pid) out.push(m);
  }
  return out;
}

/**
 * Cumulative → per-sample delta for a metric, advancing its watermark.
 * @param {Record<string,number>} cumMap Cumulative map.
 * @param {Record<string,number>} wm Watermark map.
 * @param {number} pid Player id.
 * @returns {number} Flow since the last sample.
 */
function sampleDelta(cumMap, wm, pid) {
  const cur = cumMap[pid] || 0;
  const prev = wm[pid] || 0;
  wm[pid] = cur;
  return cur - prev;
}

/**
 * Net migration for a player since last sampled (the per-sample net flow).
 * @param {number} id A player id.
 * @returns {number} Net people (positive = net immigration).
 */
export function netDeltaForPlayer(id) {
  const s = load();
  return sampleDelta(s.cum, s.lastSampled, id);
}

/**
 * Gross emigration for a player this sample.
 * @param {number} pid Player id.
 * @returns {number} People who left.
 */
export function sampleOut(pid) {
  const s = load();
  return sampleDelta(s.out, s.wmOut, pid);
}

/**
 * Gross immigration for a player this sample.
 * @param {number} pid Player id.
 * @returns {number} People who arrived.
 */
export function sampleIn(pid) {
  const s = load();
  return sampleDelta(s.in, s.wmIn, pid);
}

/**
 * The cumulative refugees a civ has produced (read-only; does not advance a watermark).
 * @param {number} id Player id.
 * @returns {number} Cumulative refugees.
 */
export function refugeesFor(id) {
  return load().refugees[id] || 0;
}

/**
 * Per-cause emigration breakdown for a player (cumulative, read-only).
 * @param {number} pid Player id.
 * @returns {Record<string, number>} Emigration sample by cause this turn.
 */
export function emigrationByCause(pid) {
  return load().outByCause[pid] || {};
}

/**
 * Per-cause immigration breakdown for a player (cumulative, read-only).
 * @param {number} pid Player id.
 * @returns {Record<string, number>} Immigration by cause.
 */
export function immigrationByCause(pid) {
  return load().inByCause[pid] || {};
}

/**
 * Per-cause emigration sample delta for a player this turn.
 * @param {number} pid Player id.
 * @returns {Record<string, number>} Emigration sample by cause.
 */
export function sampleOutByCause(pid) {
  const s = load();
  const out = s.outByCause[pid] || {};
  if (!s.wmOutByCause[pid]) s.wmOutByCause[pid] = {};
  const wmRef = s.wmOutByCause[pid];
  /** @type {Record<string, number>} */
  const result = {};
  for (const cause in out) {
    const cur = out[cause] || 0;
    const prev = wmRef[cause] || 0;
    wmRef[cause] = cur;
    result[cause] = cur - prev;
  }
  return result;
}

/**
 * Per-cause immigration sample delta for a player this turn.
 * @param {number} pid Player id.
 * @returns {Record<string, number>} Immigration sample by cause.
 */
export function sampleInByCause(pid) {
  const s = load();
  const inn = s.inByCause[pid] || {};
  if (!s.wmInByCause[pid]) s.wmInByCause[pid] = {};
  const wmRef = s.wmInByCause[pid];
  /** @type {Record<string, number>} */
  const result = {};
  for (const cause in inn) {
    const cur = inn[cause] || 0;
    const prev = wmRef[cause] || 0;
    wmRef[cause] = cur;
    result[cause] = cur - prev;
  }
  return result;
}

// Expose per-civ cumulative tallies for the Demographics war tooltip + the feedback layer
// (read-only; cumulative so reads don't disturb the graph sample watermarks).
try {
  /** @type {*} */ (globalThis).EmigrationData = {
    grossOutCumFor: (/** @type {number} */ pid) => load().out[pid] || 0,
    grossInCumFor: (/** @type {number} */ pid) => load().in[pid] || 0,
    refugeesCumFor: (/** @type {number} */ pid) => load().refugees[pid] || 0,
    deathsCumFor: (/** @type {number} */ pid) => load().deaths[pid] || 0,
    netCumFor: (/** @type {number} */ pid) => load().cum[pid] || 0,
    // Per-cause breakdowns for tooltip attribution
    emigrationByCauseFor: (/** @type {number} */ pid) => emigrationByCause(pid),
    immigrationByCauseFor: (/** @type {number} */ pid) => immigrationByCause(pid),
    // The per-city readout view-model + the session-local recent-moves feed (Phase 0 data core).
    citySnapshot: (/** @type {*} */ cityId) => citySnapshot(cityId),
    recentEventsFor: (/** @type {number} */ pid, /** @type {number=} */ limit) =>
      recentEventsFor(pid, limit)
  };
} catch (_) {
  /* ignore */
}
