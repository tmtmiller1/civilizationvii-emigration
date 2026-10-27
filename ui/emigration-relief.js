// emigration-relief.js
//
// Fewer people, less strain. A settlement that loses people over unhappiness gets +1 Happiness for each of them until
// it grows back to the size it was when they left. Civ VII charges no Happiness for ordinary population, so without
// this a city that keeps losing people never gets any happier for it. Only departures over unhappiness count; people
// fleeing war or a disaster, and people drawn to a richer place, leave no relief behind.
//
// The Happiness is the game's own: one hidden building in the settlement's center, BUILDING_EMIG_RELIEF_<n>
// (data/emigration-relief.sql), whose modifier adds n Happiness under the tooltip line "People who left". The game
// keeps one copy of a building type per city, so the count is a tier, swapped as it changes, up to RELIEF_TIERS.
//
// The book, kept in the save: for each settlement center ("x,y"), the size before each such departure. Each pass an
// entry holds while the settlement is smaller than that size. Runs inside the pass, on the local player's turn, the
// moment a map write is safe (the Canals 1.6.3 finding: never between TurnEnd and TurnBegin, never during a save).
// Part of the stage happiness model: off while CONFIG.happinessModel is "field".

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { dlog } from "/emigration/ui/emigration-log.js";

const STATE_KEY = "EmigrationRelief_v1";
const PREFIX = "BUILDING_EMIG_RELIEF_";
export const RELIEF_TIERS = 10;

/** @typedef {Record<string, number[]>} ReliefBook Sizes before each departure over unhappiness, by center. */

/**
 * Add this pass's departures over unhappiness to the book. Several from one settlement in a pass left one after
 * another, so the sizes before them run up from the size it's at now.
 * @param {ReliefBook} book Changed in place. @param {*[]} migs This pass's records.
 * @param {(loc:string)=>number|null} sizeAt The settlement's population now, or null when it's gone.
 * @returns {number} How many were added.
 */
export function noteDepartures(book, migs, sizeAt) {
  /** @type {Map<string, number>} */
  const left = new Map();
  for (const m of migs || []) {
    if (leftOverUnhappiness(m)) left.set(m.srcLoc, (left.get(m.srcLoc) || 0) + pointsOf(m));
  }
  let added = 0;
  for (const [loc, n] of left) {
    const now = sizeAt(loc);
    if (!Number.isFinite(now)) continue;
    const entries = (book[loc] ??= []);
    for (let i = 1; i <= n; i++) entries.push(Number(now) + i);
    added += n;
  }
  return added;
}

/** @param {*} m A record. @returns {boolean} A departure (not an arrival) over unhappiness, with its source. */
function leftOverUnhappiness(m) {
  return !!m && m.cause === "unhappiness" && m.phase !== "arrive" && typeof m.srcLoc === "string";
}

/** @param {*} m @returns {number} The points a record moved, at least 1. */
function pointsOf(m) {
  return Math.max(1, Math.floor(Number(m.points) || 1));
}

/**
 * The entries a settlement keeps at its size now, and the tier they make.
 * @param {number[]} entries @param {number} size @returns {{kept:number[], tier:number}}
 */
export function holdRelief(entries, size) {
  const kept = (entries || []).filter((before) => Number.isFinite(size) && size < before);
  return { kept, tier: Math.min(kept.length, RELIEF_TIERS) };
}

/** @param {string} type @returns {number} The tier a relief building type stands for, or 0. */
export function tierOf(type) {
  if (typeof type !== "string" || !type.startsWith(PREFIX)) return 0;
  const n = Number(type.slice(PREFIX.length));
  return Number.isInteger(n) && n >= 1 && n <= RELIEF_TIERS ? n : 0;
}

/**
 * One pass: note the departures, then bring each settlement's building to its tier. A settlement nobody holds any
 * more drops out of the book; a relief building on a settlement with no entries left is taken down.
 * @param {*[]} migs This pass's records. @param {Partial<ReliefDeps>} [d] Seams for tests.
 * @returns {{added:number, changed:number}}
 */
export function reliefPass(migs, d) {
  const deps = { ...liveDeps(), ...(d || {}) };
  if (CONFIG.happinessModel !== "stage" || CONFIG.reliefEnabled === false) return { added: 0, changed: 0 };
  const book = deps.load();
  const added = noteDepartures(book, migs, (loc) => deps.sizeAt(loc));
  let changed = 0;
  for (const loc of new Set([...Object.keys(book), ...deps.placedAt()])) if (settle(book, loc, deps)) changed++;
  deps.save(book);
  if (added || changed) dlog("relief: " + added + " left over unhappiness, " + changed + " settlement(s) changed tier");
  return { added, changed };
}

/**
 * One settlement: keep its entries that still hold, and bring its building to their tier. One nobody can read drops
 * out of the book and keeps whatever stands until it can be read.
 * @param {ReliefBook} book Changed in place. @param {string} loc @param {ReliefDeps} deps
 * @returns {boolean} Whether its tier was changed.
 */
function settle(book, loc, deps) {
  const size = deps.sizeAt(loc);
  const { kept, tier } = size == null ? { kept: [], tier: 0 } : holdRelief(book[loc], size);
  if (kept.length) book[loc] = kept;
  else delete book[loc];
  return size != null && deps.tierAt(loc) !== tier && deps.setTier(loc, tier);
}

/**
 * @typedef {Object} ReliefDeps
 * @property {()=>ReliefBook} load @property {(book:ReliefBook)=>void} save
 * @property {(loc:string)=>number|null} sizeAt The population of the settlement centered there, or null.
 * @property {()=>string[]} placedAt Settlement centers with a relief building standing now.
 * @property {(loc:string)=>number} tierAt The tier standing there (0 for none).
 * @property {(loc:string, tier:number)=>boolean} setTier Bring the building there to a tier (0 takes it down).
 */

/** @returns {ReliefDeps} */
function liveDeps() {
  return {
    load, save, placedAt, setTier, sizeAt: (loc) => sizeOf(cityAt(loc)), tierAt: (loc) => standing(cityAt(loc)).tier
  };
}

/** @returns {ReliefBook} */
function load() {
  try {
    const raw = Configuration?.getGame?.()?.getValue?.(STATE_KEY);
    return cleanBook(typeof raw === "string" && raw ? JSON.parse(raw) : null);
  } catch (_) {
    return {};
  }
}

/** @param {ReliefBook} book */
function save(book) {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(book));
  } catch (_) {
    /* unwritable mid age-transition; the next pass writes it */
  }
}

/** @param {*} o A saved book. @returns {ReliefBook} Only well-formed entries. */
export function cleanBook(o) {
  /** @type {ReliefBook} */
  const out = {};
  if (!o || typeof o !== "object" || Array.isArray(o)) return out;
  for (const [loc, v] of Object.entries(o)) {
    if (!/^-?\d+,-?\d+$/.test(loc) || !Array.isArray(v)) continue;
    const sizes = v.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (sizes.length) out[loc] = sizes;
  }
  return out;
}

/** @param {string} loc "x,y" @returns {*} The city centered there, or null. */
function cityAt(loc) {
  try {
    const [x, y] = loc.split(",").map(Number);
    const id = MapCities.getCity(x, y);
    const city = id != null ? Cities.get(id) : null;
    const at = city && city.location;
    return at && at.x === x && at.y === y ? city : null;
  } catch (_) {
    return null;
  }
}

/** @param {*} city @returns {number|null} */
function sizeOf(city) {
  const n = city ? Number(city.population) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** @param {*} city @returns {{tier:number, ids:*[]}} The relief tier standing in the city and its component ids. */
function standing(city) {
  const out = { tier: 0, ids: /** @type {*[]} */ ([]) };
  try {
    for (const id of (city && city.Constructibles && city.Constructibles.getIds()) || []) {
      const inst = Constructibles.getByComponentID(id);
      const def = inst ? GameInfo.Constructibles.lookup(inst.type) : null;
      const t = tierOf(def && def.ConstructibleType);
      if (t) { out.tier = Math.max(out.tier, t); out.ids.push(id); }
    }
  } catch (_) {
    /* an unreadable city reads as none */
  }
  return out;
}

/** @returns {string[]} Centers of the major civilizations' settlements with a relief building standing. */
function placedAt() {
  const out = [];
  try {
    for (const p of Players.getAlive()) {
      if (!p.isMajor) continue;
      for (const c of p.Cities.getCities()) {
        if (standing(c).ids.length && c.location) out.push(c.location.x + "," + c.location.y);
      }
    }
  } catch (_) {
    /* a partial read leaves the rest for the next pass */
  }
  return out;
}

/**
 * Take down whatever relief building stands in the settlement and place the one for this tier, as the local player
 * (the engine gates CREATE_ELEMENT and DESTROY_ELEMENT to the local player's requests).
 * @param {string} loc @param {number} tier @returns {boolean} Whether the requests were sent.
 */
function setTier(loc, tier) {
  const city = cityAt(loc);
  if (!city) return false;
  try {
    const sender = GameContext.localPlayerID;
    for (const id of standing(city).ids) {
      Game.PlayerOperations.sendRequest(sender, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: id.owner, LocalID: id.id });
    }
    if (tier > 0) {
      Game.PlayerOperations.sendRequest(sender, "CREATE_ELEMENT",
        { Kind: "CONSTRUCTIBLE", Type: PREFIX + tier, Location: city.location, Owner: city.owner });
    }
    return true;
  } catch (e) {
    dlog("relief: setTier " + loc + " threw " + e);
    return false;
  }
}
