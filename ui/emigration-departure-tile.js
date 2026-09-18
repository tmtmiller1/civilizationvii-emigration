// emigration-departure-tile.js
//
// The SOURCE side of a departure made real. In Civ VII a rural population point is the count of placed
// improvements, and `city.addRuralPopulation(-1)` (the only population write) changes nothing but that
// count: it parks a -1 in `pendingPopulation` and leaves every improvement working, so the city that
// lost people kept every yield. Watched in-game 2026-09-11 (devtools/engine-probe, runs 4 and 5).
//
// What DOES work, watched the same day: the `DESTROY_ELEMENT` player operation with
// `{Kind:"CONSTRUCTIBLE", Owner, LocalID}` on a rural improvement removes the tile AND one population
// point together (pop -1, rural -1, pending 0, the tile's yields gone), on the local player's cities
// and on foreign cities alike (it is not owner-gated). So a departure now destroys the chosen tile and
// the engine takes the point and its improvement away as one. Because a destroyed tile cannot be
// undone, the source write is DEFERRED: the engine reserves the point, lands it at the destination,
// and only then calls `commitSourcePoint`. If no improvement can be found (an all-urban city, or
// off-engine in tests) the plain counter decrement is used, exactly as before.
//
// Which tile: the outlying farmstead empties first. Improvements NOT sitting on a resource are
// preferred, then the farthest from the city centre, then the lowest plot index (deterministic).
//
// The tile is the whole felt loss on the source side: the losing civilization pays nothing else, while
// the receiving one carries the assimilation cost (emigration-effects.js).

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { removeRural } from "/emigration/ui/emigration-population.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { disasterLossCapReached } from "/emigration/ui/emigration-disasters.js";
import { allQuarterEntries } from "/emigration/ui/emigration-quarter-state.js";
import { scheduleDistrictCleanup } from "/emigration/ui/emigration-plot-cleanup.js";

/**
 * A candidate rural improvement on one of the city's plots.
 * @typedef {Object} DepartureTile
 * @property {number} plot Plot index.
 * @property {{x:number,y:number}} loc Plot location.
 * @property {*} elem The constructible ComponentID ({owner,id,type}).
 * @property {string} type The ConstructibleType (e.g. IMPROVEMENT_FARM).
 * @property {boolean} onResource Whether the plot carries a resource.
 * @property {number} distance Hex distance from the city centre.
 * @property {boolean} [damaged] Whether the improvement is pillaged (abandoned first).
 * @property {boolean} [feeds] Whether the improvement yields food (spared under famine).
 */

/**
 * Whether the engine surface this module needs is present (in-game, not in tests).
 * @returns {boolean} True when improvements can be enumerated and destroyed.
 */
export function departureTileApiAvailable() {
  try {
    return typeof Districts !== "undefined" && typeof Districts.getAtLocation === "function" &&
      typeof ConstructibleClasses !== "undefined" && typeof Constructibles !== "undefined" &&
      typeof GameplayMap !== "undefined" && typeof Game !== "undefined" &&
      !!Game.PlayerOperations && typeof Game.PlayerOperations.sendRequest === "function";
  } catch (_) {
    return false;
  }
}

/**
 * Whether a plot carries a resource (unknown reads count as "no resource").
 * @param {number} x Plot x. @param {number} y Plot y.
 * @returns {boolean} True when a resource is present.
 */
function plotHasResource(x, y) {
  try {
    if (typeof GameplayMap.getResourceType !== "function") return false;
    const r = GameplayMap.getResourceType(x, y);
    return typeof r === "number" && r >= 0 && r !== 4294967295;
  } catch (_) {
    return false;
  }
}

/**
 * Hex distance between two plot locations (0 when unreadable).
 * @param {{x:number,y:number}} a One location. @param {{x:number,y:number}} b The other.
 * @returns {number} Distance.
 */
function plotDistance(a, b) {
  try {
    return typeof GameplayMap.getPlotDistance === "function" ? GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y) : 0;
  } catch (_) {
    return 0;
  }
}

/** @type {Map<number, number>} Plots whose DESTROY_ELEMENT was issued this turn (plot → turn). The op is
 * asynchronous, so a second departure from the same city in the same pass would otherwise pick the same
 * tile again and the second point would never leave. */
const abandonedThisTurn = new Map();

/**
 * The current game turn (0 off-engine).
 * @returns {number} Turn.
 */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Whether a plot's improvement was already abandoned this turn (its DESTROY may still be in flight).
 * @param {number} plot Plot index.
 * @returns {boolean} True when it must be skipped.
 */
function abandonedRecently(plot) {
  const t = abandonedThisTurn.get(plot);
  return t != null && t === gameTurn();
}

/**
 * Whether an improvement type feeds the city. The name hint is primary: in the compiled gameplay DB
 * (Debug/gameplay-copy.sqlite, checked 2026-09-12) farms, fishing boats, pastures and plantations have NO
 * Constructible_YieldChanges food row (their food comes from the terrain and resource), so a table-only
 * read called every food tile "not food" in game. The table still catches oddities like the Baray.
 * @param {string} type The ConstructibleType. @returns {boolean} True for food improvements.
 */
function improvementFeeds(type) {
  if (/FARM|FISHING|PASTURE|PLANTATION|FOOD|BOAT/.test(type)) return true;
  try {
    const rows = typeof GameInfo !== "undefined" && GameInfo.Constructible_YieldChanges;
    if (rows && typeof rows.filter === "function") {
      const feeds = (/** @type {*} */ r) => r.ConstructibleType === type && r.YieldType === "YIELD_FOOD" && r.YieldChange > 0;
      return rows.filter(feeds).length > 0;
    }
  } catch (_) {
    /* unreadable table: the name hint has already answered */
  }
  return false;
}

/**
 * The ConstructibleType name of a constructible instance ("IMPROVEMENT" when unreadable).
 * @param {*} elem The constructible ComponentID.
 * @returns {string} Type name.
 */
function constructibleTypeOf(elem) {
  const inst = Constructibles.getByComponentID(elem);
  const info = inst && typeof GameInfo !== "undefined" ? GameInfo.Constructibles.lookup(inst.type) : null;
  return info && info.ConstructibleType ? info.ConstructibleType : "IMPROVEMENT";
}

/**
 * The district on a plot that can be asked for its improvements, or null (the centre, an unreadable
 * plot, a plot whose DESTROY is still in flight from earlier this turn, or no district).
 * @param {number} plot Plot index. @param {{x:number,y:number}} loc Its location.
 * @param {{x:number,y:number}} centre The city-centre location.
 * @returns {*} The district, or null.
 */
function candidateDistrict(plot, loc, centre) {
  if (!loc || (loc.x === centre.x && loc.y === centre.y) || abandonedRecently(plot)) return null;
  const district = Districts.getAtLocation(loc);
  return district && typeof district.getConstructibleIdsOfClass === "function" ? district : null;
}

/**
 * The rural improvements on ONE plot of a city (empty when the plot is not a candidate).
 * @param {number} plot Plot index.
 * @param {{x:number,y:number}} centre The city-centre location.
 * @returns {DepartureTile[]} Candidates on that plot.
 */
function tilesOnPlot(plot, centre) {
  /** @type {DepartureTile[]} */
  const out = [];
  try {
    const loc = GameplayMap.getLocationFromIndex(plot);
    const district = candidateDistrict(plot, loc, centre);
    if (!district) return out;
    const onResource = plotHasResource(loc.x, loc.y);
    const distance = plotDistance(loc, centre);
    for (const elem of district.getConstructibleIdsOfClass(ConstructibleClasses.IMPROVEMENT) || []) {
      const type = constructibleTypeOf(elem);
      if (type.startsWith(ENCLAVE_TYPE_PREFIX) || type === VILLAGE_TYPE) continue; // an enclave never leaves
      const damaged = !!safeDamaged(elem);
      out.push({ plot, loc, elem, type, onResource, distance, damaged, feeds: improvementFeeds(type) });
    }
  } catch (_) {
    /* an unreadable plot is skipped, never fatal */
  }
  return out;
}

/**
 * Every rural improvement on the city's plots, with the ranking signals attached.
 * @param {*} city The city object.
 * @returns {DepartureTile[]} Candidates (possibly empty).
 */
export function listDepartureTiles(city) {
  if (!city || typeof city.getPurchasedPlots !== "function" || !departureTileApiAvailable()) return [];
  let plots = [];
  try {
    plots = city.getPurchasedPlots() || [];
  } catch (_) {
    return [];
  }
  const centre = city.location || { x: 0, y: 0 };
  const enclaves = enclavePlots();
  /** @type {DepartureTile[]} */
  const out = [];
  for (const plot of plots) {
    if (enclaves.has(plot)) continue; // a placed Cultural Enclave (any skin) never leaves with a departure
    for (const t of tilesOnPlot(plot, centre)) out.push(t);
  }
  return out;
}

/**
 * The plot indices of every placed Cultural Enclave (from the quarter records; the tile on the map may be
 * a Village or another civilization's improvement, so the RECORD is the only way to know).
 * @returns {Set<number>} Plot indices.
 */
function enclavePlots() {
  /** @type {Set<number>} */
  const out = new Set();
  try {
    for (const { rec } of allQuarterEntries()) if (rec && rec.placed && typeof rec.placed.plot === "number") out.add(rec.placed.plot);
  } catch (_) {
    /* no records readable: nothing to exclude */
  }
  return out;
}

/**
 * Whether a constructible instance is pillaged.
 * @param {*} elem The constructible ComponentID. @returns {boolean} True when damaged.
 */
function safeDamaged(elem) {
  try {
    const inst = Constructibles.getByComponentID(elem);
    return !!(inst && inst.damaged);
  } catch (_) {
    return false;
  }
}

/**
 * Rank candidates: PILLAGED tiles first (the burnt farmstead is the one abandoned, which is how this
 * meets the war and pillage systems instead of stacking on them), then, under famine, non-food tiles
 * before food tiles (people leaving must not deepen the starvation that drove them out), then plain
 * tiles before resource tiles, farther from the centre first, then by plot index. Pure.
 * @param {DepartureTile[]} tiles Candidates.
 * @param {{avoidFood?:boolean}} [opts] `avoidFood`: the source is starving.
 * @returns {DepartureTile[]} A new sorted array (best first).
 */
export function rankDepartureTiles(tiles, opts) {
  const avoidFood = !!(opts && opts.avoidFood);
  return (tiles || []).slice().sort((a, b) => {
    if (!!a.damaged !== !!b.damaged) return a.damaged ? -1 : 1;
    if (avoidFood && !!a.feeds !== !!b.feeds) return a.feeds ? 1 : -1;
    if (a.onResource !== b.onResource) return a.onResource ? 1 : -1;
    if (a.distance !== b.distance) return b.distance - a.distance;
    return a.plot - b.plot;
  });
}

/**
 * The improvement a departure should abandon, or null when the city has none to give.
 * @param {*} city The city object.
 * @param {{avoidFood?:boolean}} [opts] `avoidFood`: the source is starving (see rankDepartureTiles).
 * @returns {DepartureTile|null} The chosen tile.
 */
export function findDepartureTile(city, opts) {
  const ranked = rankDepartureTiles(listDepartureTiles(city), opts);
  return ranked.length ? ranked[0] : null;
}

/**
 * Send the engine's DESTROY_ELEMENT for one constructible. Fire-and-forget like every gameplay write.
 * @param {DepartureTile} tile The tile to remove.
 * @returns {boolean} True when the request was issued without throwing.
 */
function destroyTile(tile) {
  try {
    const sender = typeof GameContext !== "undefined" ? GameContext.localPlayerID : tile.elem.owner;
    const args = { Kind: "CONSTRUCTIBLE", Owner: tile.elem.owner, LocalID: tile.elem.id };
    Game.PlayerOperations.sendRequest(sender, "DESTROY_ELEMENT", args);
    const turn = gameTurn();
    for (const [plot, t] of abandonedThisTurn) if (t !== turn) abandonedThisTurn.delete(plot);
    abandonedThisTurn.set(tile.plot, turn);
    scheduleDistrictCleanup(tile.plot); // the empty rural district left behind would block the plot for good
    return true;
  } catch (e) {
    dlog("destroyTile threw " + e);
    return false;
  }
}

/**
 * Take one population point out of a city THE REAL WAY: destroy one rural improvement, which makes the
 * engine remove the point together with the tile that fed it (pop -1, rural -1, yields gone). Falls
 * back to the plain counter decrement when the option is off, the city has no rural improvement, or
 * the engine surface is missing (off-engine tests). Used for committed departures and for deaths.
 * @param {*} city The city losing the point.
 * @param {{avoidFood?:boolean}} [opts] `avoidFood`: the source is starving.
 * @returns {{ok:boolean, mode:"tile"|"counter", type?:string, plot?:number}} What happened.
 */
export function abandonTileOrDecrement(city, opts) {
  if (CONFIG.departureRemovesTile) {
    const tile = findDepartureTile(city, opts);
    if (tile && destroyTile(tile)) {
      dlog("abandoned " + tile.type + " at plot " + tile.plot);
      return { ok: true, mode: "tile", type: tile.type, plot: tile.plot };
    }
  }
  return { ok: removeRural(city), mode: "counter" };
}

/**
 * Whether a departure from this city would abandon a tile (so the engine can DEFER the source write
 * until the destination has accepted the point: a destroyed tile cannot be undone, a counter can).
 * @param {*} city The source city.
 * @returns {boolean} True when a rural improvement is available to abandon.
 */
export function departureWouldAbandonTile(city) {
  return !!CONFIG.departureRemovesTile && !!findDepartureTile(city);
}

/**
 * The tile-ranking hints for a source signal (a starving source spares its food tiles).
 * @param {*} src The source city signal. @returns {{avoidFood:boolean}} Hints.
 */
function tileHints(src) {
  return { avoidFood: !!(src && src.starving) };
}

/**
 * Commit a deferred source-side removal once the destination has the point: destroy the tile (or, if
 * none is left by now, decrement the counter). The losing civilization pays nothing beyond the tile;
 * the receiving one carries the assimilation cost. No-op for points that came from a holding pool or
 * were already written the plain way.
 * @param {*} src The source city signal ({city, owner}).
 * @param {{ok:boolean, fromPool:boolean, deferredTile?:boolean}} consumed The consume result.
 * @returns {{mode:"tile"|"counter"|"none"}} What happened.
 */
export function commitSourcePoint(src, consumed) {
  if (!consumed || !consumed.ok || consumed.fromPool) return { mode: "none" };
  /** @type {"tile"|"counter"|"none"} */
  let mode = "counter";
  if (consumed.deferredTile) mode = abandonTileOrDecrement(src.city, tileHints(src)).mode;
  return { mode };
}

// ── shedding gates and deaths ────────────────────────────────────────────────────────────────────
//
// Only rural tiles ever leave; the urban core is never taken. Building loss was ruled out for players, and no
// script operation removes a specialist: ASSIGN_WORKER {Amount:-1} only lowers the city's worker counter and
// leaves the slot filled (watched 2026-09-14, mod test 55; docs/engine-limits-from-probes.md 1.4).

/** The placed Cultural Enclave improvements (emigration-enclave-place.js); excluded from departures (watched
 * 2026-09-13: without this, London's own enclave was the outlying tile a departure would have abandoned). */
const ENCLAVE_TYPE_PREFIX = "IMPROVEMENT_EMIG_ENCLAVE_";
/** The Village-skinned enclave (emigration-enclave-place.js); a major civilization's Village is always one. */
const VILLAGE_TYPE = "IMPROVEMENT_VILLAGE";

/**
 * Whether a source can shed one more point for a given cause: a rural tile above the floor, and for a
 * disaster, room under the disaster cap.
 * @param {*} src The source signal. @param {string} cause The move cause.
 * @returns {boolean} True when a point is available.
 */
export function canShedPoint(src, cause) {
  if (cause === "disaster" && disasterLossCapReached(src.city)) return false; // the remnant digs in
  return (Number(src.rural) || 0) > CONFIG.minRuralToEmigrate;
}

/**
 * Whether a source could shed anything this pass (rural above the floor). The engine's early-out gate.
 * @param {*} src The source signal.
 * @returns {boolean} True when the source may shed.
 */
export function canShedAny(src) {
  return (Number(src.rural) || 0) > CONFIG.minRuralToEmigrate;
}

/**
 * Take one point for a crisis DEATH: a rural tile while the city is above its rural floor, else the counter.
 * @param {*} src The source city signal.
 * @returns {{ok:boolean, mode:"tile"|"counter", type?:string}} What happened.
 */
export function abandonForDeath(src) {
  const city = src && src.city;
  // The dead vacate a farmstead only while the settlement keeps its rural floor: below it the death
  // still counts (the counter), but the last tiles stay worked so a crisis cannot strip a city bare.
  if (CONFIG.departureRemovesTile && (Number(src.rural) || 0) > CONFIG.minRuralToEmigrate) {
    const tile = findDepartureTile(city, tileHints(src));
    if (tile && destroyTile(tile)) return { ok: true, mode: "tile", type: tile.type };
  }
  return { ok: removeRural(city), mode: "counter" };
}
