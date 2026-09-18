// emigration-ethnicity-tiles.js
//
// Shared per-tile ethnic-composition computation for the ethnicity LENS (emigration-ethnicity-lens.js)
// and its hover TOOLTIP (emigration-ethnicity-tooltip.js). Those run as separate <UIScripts> entries,
// hence separate V8 isolates with no shared memory, so each imports THIS module and computes the
// per-tile mosaic independently. Because the model is pure + deterministic and both read the same
// engine state, they arrive at the IDENTICAL result: the lens colours each tile by its local mix, and
// the tooltip reads the hovered tile's shares, so colour and percentages always agree.
//
// This is the one place that does the engine reads (owned plots, district class, build-up, population
// scaling, and a standing enclave's plot); the distribution math itself stays pure in
// emigration-ethnicity-distribution.js.

import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { distributeTiles } from "/emigration/ui/emigration-ethnicity-distribution.js";
import { scaleCityPopulation } from "/emigration/ui/emigration-population.js";
import { monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { quarterSnapshotAt } from "/emigration/ui/emigration-quarter-state.js";
import { enclaveStanding } from "/emigration/ui/emigration-enclave-place.js";

// Per-tile density weights by district class, "urban districts have higher populations". A tile's
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
 * The number of constructibles on a tile (its build-up), capped, a denser-built tile holds more
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
 *
 * An ENCLAVE tile is floored at the urban weight. The enclave is placed on the nearest EMPTY land plot
 * (emigration-enclave-place.js), which the map still classifies as bare rural or wilderness — so the one
 * tile that is meant to read as a packed foreign quarter was coming out as the sparsest thing in the
 * settlement, and the lens maps sparse to near-transparent. Watched in game 2026-09-17: the enclave tile
 * was the faintest hex on screen. A quarter full of people is not wilderness, so it is weighted as the
 * built-up district it represents.
 * @param {*} city City object.
 * @param {Map<number, {x:number, y:number}>} anchors Enclave plots (civ → location), floored to urban.
 * @returns {{x:number, y:number, weight:number}[]} Weighted plots.
 */
function classifyPlots(city, anchors) {
  /** @type {Set<string>} */
  const enclaves = new Set();
  anchors.forEach((a) => enclaves.add(a.x + "," + a.y));
  /** @type {{x:number, y:number, weight:number}[]} */
  const out = [];
  try {
    const idx = city && typeof city.getPurchasedPlots === "function" ? city.getPurchasedPlots() : [];
    for (const i of idx || []) {
      const loc = GameplayMap.getLocationFromIndex(i);
      if (!loc) continue;
      const buildUp = 1 + BUILDUP_PER * Math.min(constructibleCount(loc.x, loc.y), BUILDUP_CAP);
      const base = districtWeight(loc.x, loc.y);
      const weight = enclaves.has(loc.x + "," + loc.y) ? Math.max(base, W_URBAN) * buildUp : base * buildUp;
      out.push({ x: loc.x, y: loc.y, weight });
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
  const value = computeTiles(city, key);
  if (_cache.size >= MAX_CACHE && !hit) _cache.clear();
  _cache.set(key, { turn, value });
  return value;
}

/**
 * The composition of a settlement the pass has not recorded yet: everyone in it is the owner's own people. Mod
 * test 86 found a freshly loaded save carries no stored composition at all (mod state is not saved into the save
 * file), so the lens and the hover panel had no tiles to work with and drew nothing. That state is not unknown, it
 * is 100% host, and the mosaic (and its density gradient) is still worth drawing.
 * @param {*} city City object.
 * @returns {*} A composition in the stored shape, or null when the settlement is unreadable.
 */
function hostOnlyComposition(city) {
  try {
    const owner = city && typeof city.owner === "number" ? city.owner : null;
    const total = city ? Number(city.population) : 0;
    if (owner == null || !(total > 0)) return null;
    const civs = [{ civ: owner, pts: total, share: 1 }];
    return { total, owner, civs, dominant: { civ: owner, share: 1 } };
  } catch (_) {
    return null;
  }
}

/**
 * The settlement's ENCLAVE anchor pins: origin civ → the plot its standing Cultural Enclave occupies, so
 * that diaspora's colour cluster centres on the tile the enclave marker actually sits on rather than on
 * an unrelated hash tile. The quarters store is keyed by the host settlement's CENTRE, so a settlement
 * holds at most one enclave record and this yields at most one pin.
 *
 * Gated on the tile STANDING (`enclaveStanding`, which also recognizes a Village-skinned enclave — on the
 * map that is a plain Village, so a constructible-type check here would miss it): a record whose tile was
 * pillaged or built over stops steering the lens, and the cluster reverts to its hash anchor. Never
 * throws — an unreadable store or plot yields no pins and the lens paints exactly as it did before.
 *
 * Reads the per-turn SNAPSHOT, not `quarterAt`: the lens is its own isolate and does not write quarters,
 * and the writer's copy is loaded once, so `quarterAt` here would freeze whatever the store held on the
 * lens's first paint (an empty one in a fresh session) and no enclave would ever pin.
 * @param {string} key The settlement's "x,y" centre key.
 * @returns {Map<number, {x:number, y:number}>} Origin civ → enclave plot (empty when none).
 */
function enclaveAnchors(key) {
  /** @type {Map<number, {x:number, y:number}>} */
  const out = new Map();
  try {
    const rec = quarterSnapshotAt(key);
    if (!rec || typeof rec.civ !== "number" || !rec.placed) return out;
    if (typeof rec.placed.plot !== "number" || !enclaveStanding(rec)) return out;
    const loc = GameplayMap.getLocationFromIndex(rec.placed.plot);
    if (loc && typeof loc.x === "number" && typeof loc.y === "number") {
      out.set(rec.civ, { x: loc.x, y: loc.y });
    }
  } catch (_) {
    /* no pin — fall back to the hash anchor */
  }
  return out;
}

/**
 * The share an origin must hold for an enclave to form (`quarterEstablishedShare`) — the ceiling on how
 * much of a plain tile any diaspora may colour. Reading it from CONFIG keeps the lens honest against the
 * live rule: retune the enclave bar and the lens moves with it. 0 when unreadable (no extra ceiling).
 * @returns {number} The bar in [0, 1].
 */
function enclaveBar() {
  const n = Number(CONFIG.quarterEstablishedShare);
  return Number.isFinite(n) && n > 0 ? Math.min(1, n) : 0;
}

/**
 * Compute (uncached) a settlement's per-tile mosaic from its composition + classified plots.
 * @param {*} city City object. @param {string} key The settlement's "x,y" centre key.
 * @returns {CityTiles|null} The tiles, or null.
 */
function computeTiles(city, key) {
  const comp = compositionForCity(city) || hostOnlyComposition(city);
  if (!comp || !comp.dominant) return null;
  const anchors = enclaveAnchors(key);
  const plots = classifyPlots(city, anchors);
  if (!plots.length) return null;
  const tiles = distributeTiles(plots, comp, scaledPeopleFor(comp.total), { anchors, plainCap: enclaveBar() });
  /** @type {Map<string, TilePaint>} */
  const byKey = new Map();
  for (const t of tiles) byKey.set(t.x + "," + t.y, t);
  return { tiles, byKey, comp };
}
