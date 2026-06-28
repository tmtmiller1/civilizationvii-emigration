// emigration-ethnicity-tiles.js
//
// Shared per-tile ethnic-composition computation for the ethnicity LENS (emigration-ethnicity-lens.js)
// and its hover TOOLTIP (emigration-ethnicity-tooltip.js). Those run as separate <UIScripts> entries —
// hence separate V8 isolates with no shared memory — so each imports THIS module and computes the
// per-tile mosaic independently. Because the model is pure + deterministic and both read the same
// engine state, they arrive at the IDENTICAL result: the lens colours each tile by its local mix, and
// the tooltip reads the hovered tile's shares, so colour and percentages always agree.
//
// This is the one place that does the engine reads (owned plots, district class, build-up, population
// scaling); the distribution math itself stays pure in emigration-ethnicity-distribution.js.

import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { distributeTiles } from "/emigration/ui/emigration-ethnicity-distribution.js";
import { scaleCityPopulation } from "/emigration/ui/emigration-population.js";
import { monoTurn } from "/emigration/ui/emigration-migration-stats.js";

// Per-tile density weights by district class — "urban districts have higher populations". A tile's
// final weight is its class weight times a build-up bonus (constructibles on the tile).
const W_CITY_CENTER = 3.6;
const W_URBAN = 2.4;
const W_RURAL = 1.0;
const W_WILDERNESS = 0.4;
const BUILDUP_PER = 0.18; // weight bonus per constructible on the tile…
const BUILDUP_CAP = 4; // …capped, so a wonder-stacked tile doesn't dominate everything

/**
 * @typedef {import("/emigration/ui/emigration-ethnicity-distribution.js").TilePaint} TilePaint
 */

/**
 * The number of constructibles on a tile (its build-up), capped — a denser-built tile holds more
 * people. 0 when unreadable.
 * @param {number} x Plot x. @param {number} y Plot y.
 * @returns {number} Constructible count.
 */
function constructibleCount(x, y) {
  try {
    const cs = typeof MapConstructibles !== "undefined" && MapConstructibles.getConstructibles
      ? MapConstructibles.getConstructibles(x, y) : null;
    return Array.isArray(cs) ? cs.length : (cs && typeof cs.length === "number" ? cs.length : 0);
  } catch (_) {
    return 0;
  }
}

/**
 * A tile's district-class base density weight (city centre ≫ urban > rural > wilderness). Defaults to
 * the rural weight when the district can't be read, so an unclassifiable tile still carries people.
 * @param {number} x Plot x. @param {number} y Plot y.
 * @returns {number} The base weight.
 */
function districtWeight(x, y) {
  try {
    const d = typeof Districts !== "undefined" && Districts.getAtLocation
      ? Districts.getAtLocation({ x, y }) : null;
    const t = d ? d.type : null;
    if (t != null && typeof DistrictTypes !== "undefined") {
      if (t === DistrictTypes.CITY_CENTER) return W_CITY_CENTER;
      if (t === DistrictTypes.URBAN) return W_URBAN;
      if (t === DistrictTypes.WILDERNESS) return W_WILDERNESS;
    }
  } catch (_) {
    /* ignore */
  }
  return W_RURAL;
}

/**
 * A settlement's owned tiles with their population-density weights (district class × build-up bonus).
 * Empty when the city has no readable plots.
 * @param {*} city City object.
 * @returns {{x:number, y:number, weight:number}[]} Weighted plots.
 */
function classifyPlots(city) {
  /** @type {{x:number, y:number, weight:number}[]} */
  const out = [];
  try {
    const idx = city && typeof city.getPurchasedPlots === "function" ? city.getPurchasedPlots() : [];
    for (const i of idx || []) {
      const loc = GameplayMap.getLocationFromIndex(i);
      if (!loc) continue;
      const buildUp = 1 + BUILDUP_PER * Math.min(constructibleCount(loc.x, loc.y), BUILDUP_CAP);
      out.push({ x: loc.x, y: loc.y, weight: districtWeight(loc.x, loc.y) * buildUp });
    }
  } catch (_) {
    /* ignore unreadable city */
  }
  return out;
}

/**
 * The settlement's scaled population (people) for the density model. Unseeded (a standing TOTAL).
 * @param {number} points The settlement's population in points.
 * @returns {number} Scaled people.
 */
function scaledPeopleFor(points) {
  try {
    return scaleCityPopulation(points, monoTurn());
  } catch (_) {
    return points * 40000; // rough fallback so density still varies by tile weight
  }
}

/** The settlement's stable centre key "x,y", or null. @param {*} city City. @returns {string|null} */
function locKey(city) {
  const loc = city && city.location;
  return loc && typeof loc.x === "number" && typeof loc.y === "number" ? loc.x + "," + loc.y : null;
}

/** The current game turn (cache key), or -1. @returns {number} The turn. */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : -1;
  } catch (_) {
    return -1;
  }
}

/**
 * @typedef {Object} CityTiles
 * @property {TilePaint[]} tiles Every owned tile's local mix + density.
 * @property {Map<string, TilePaint>} byKey "x,y" → tile, for the tooltip's per-tile lookup.
 * @property {*} comp The settlement's composition (origins, dominant, total).
 */

// Per-settlement cache, refreshed when the turn advances: the expensive Districts / MapConstructibles
// walk runs once per settlement per turn, shared by every repaint and every hover within the turn.
/** @type {Map<string, {turn:number, value:CityTiles|null}>} */
const _cache = new Map();
const MAX_CACHE = 4096; // bound the cache over a long game

/**
 * The per-tile ethnic mosaic for a settlement: each owned tile's local origin shares + density, plus a
 * key→tile map and the composition. Null when the settlement is untracked or has no readable plots.
 * Memoized per settlement for the current turn (both the lens and the tooltip hit this each frame).
 * @param {*} city City object.
 * @returns {CityTiles|null} The settlement's tiles, or null.
 */
export function tilesForCity(city) {
  const key = locKey(city);
  if (key == null) return null;
  const turn = gameTurn();
  const hit = _cache.get(key);
  if (hit && hit.turn === turn) return hit.value;
  const value = computeTiles(city);
  if (_cache.size >= MAX_CACHE && !hit) _cache.clear();
  _cache.set(key, { turn, value });
  return value;
}

/**
 * Compute (uncached) a settlement's per-tile mosaic from its composition + classified plots.
 * @param {*} city City object. @returns {CityTiles|null} The tiles, or null.
 */
function computeTiles(city) {
  const comp = compositionForCity(city);
  if (!comp || !comp.dominant) return null;
  const plots = classifyPlots(city);
  if (!plots.length) return null;
  const tiles = distributeTiles(plots, comp, scaledPeopleFor(comp.total));
  /** @type {Map<string, TilePaint>} */
  const byKey = new Map();
  for (const t of tiles) byKey.set(t.x + "," + t.y, t);
  return { tiles, byKey, comp };
}
