// emigration-lost-tiles.js
//
// The tiles a departure tore down, by settlement, kept in the save. A departure abandons a rural improvement on
// a known plot (emigration-departure-tile.js), and until now the record only said "tile". Keeping the improvement
// and the plot lets the Displaced tab say "Lost: 2 Farms, 1 Woodcutter", and lets a returnee settle the plot they
// left when it's still open (emigration-return.js takes one entry per return; the placement prefers its plot, else
// any free plot of the same settlement). An entry is consumed by whichever return comes first, whether or not the
// game ends up building on that plot, so the list stays in step with the people away.

import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";

const STATE_KEY = "EmigrationLostTiles_v1";
/** Bounds, so a long game can't grow the save until setValue drops it. */
const MAX_PER_HOME = 48;
const MAX_HOMES = 512;

/**
 * @typedef {{t:string, p:number, turn:number}} LostTile The improvement type, the plot index, and the turn.
 * @typedef {Record<string, Record<string, LostTile[]>>} LostStore By owner, then settlement name.
 */

/** @type {LostStore|null} */
let _state = null;
registerCacheReset(() => {
  _state = null;
});

/** @param {*} o @returns {boolean} */
const isObj = (o) => !!o && typeof o === "object" && !Array.isArray(o);

/**
 * Keep only well-formed entries.
 * @param {*} o Parsed save value. @returns {LostStore}
 */
export function cleanLostTiles(o) {
  /** @type {LostStore} */
  const out = {};
  if (!isObj(o)) return out;
  for (const [owner, homes] of Object.entries(o)) {
    if (!isObj(homes)) continue;
    for (const [home, list] of Object.entries(homes)) {
      if (!Array.isArray(list)) continue;
      const kept = list.filter((e) => isObj(e) && typeof e.t === "string" && e.t && Number.isInteger(e.p))
        .map((e) => ({ t: e.t, p: e.p, turn: Number.isFinite(Number(e.turn)) ? Number(e.turn) : 0 }));
      if (kept.length) (out[owner] ??= {})[home] = kept.slice(-MAX_PER_HOME);
    }
  }
  return out;
}

/** @returns {LostStore} */
function state() {
  resetCachesOnNewGame();
  if (!_state) {
    try {
      const raw = Configuration?.getGame?.()?.getValue?.(STATE_KEY);
      _state = cleanLostTiles(typeof raw === "string" && raw ? JSON.parse(raw) : null);
    } catch (_) {
      _state = {};
    }
  }
  return _state;
}

function persist() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(_state || {}));
  } catch (_) {
    /* unwritable mid age-transition; kept in memory */
  }
}

/** @param {LostStore} s @returns {number} Settlements with entries. */
function countHomes(s) {
  let n = 0;
  for (const homes of Object.values(s)) n += Object.keys(homes).length;
  return n;
}

/**
 * Note a tile a departure tore down.
 * @param {number} owner The settlement's owner. @param {string} home The settlement.
 * @param {string} type The improvement type. @param {number} plot The plot index. @param {number} turn
 */
export function recordLostTile(owner, home, type, plot, turn) {
  if (!validTile(owner, home, type, plot)) return;
  const s = state();
  const homes = (s[owner] ??= {});
  if (!homes[home] && countHomes(s) >= MAX_HOMES) return;
  const list = (homes[home] ??= []);
  list.push({ t: type, p: plot, turn: Number(turn) || 0 });
  if (list.length > MAX_PER_HOME) list.splice(0, list.length - MAX_PER_HOME);
  persist();
}

/** @param {*} owner @param {*} home @param {*} type @param {*} plot @returns {boolean} */
function validTile(owner, home, type, plot) {
  return typeof owner === "number" && !!home && typeof type === "string" && !!type && Number.isInteger(plot);
}

/**
 * The tiles a settlement has lost, oldest first (a copy).
 * @param {number} owner @param {string} home @returns {LostTile[]}
 */
export function lostTilesFor(owner, home) {
  const list = (state()[owner] || {})[home];
  return Array.isArray(list) ? list.map((e) => ({ ...e })) : [];
}

/**
 * Take one lost tile off a settlement's list for a returnee: the oldest whose plot is still open, else the oldest
 * of all (the returnee lands somewhere else in the same settlement, and the loss is still made good).
 * @param {number} owner @param {string} home
 * @param {(plot:number)=>boolean} [isOpen] Whether a plot can be settled now (default: every plot).
 * @returns {LostTile|null} The entry taken, or null when the settlement has none.
 */
export function takeLostTile(owner, home, isOpen) {
  const s = state();
  const list = (s[owner] || {})[home];
  if (!Array.isArray(list) || !list.length) return null;
  let i = 0;
  if (typeof isOpen === "function") {
    const open = list.findIndex((e) => safeOpen(isOpen, e.p));
    if (open >= 0) i = open;
  }
  const [taken] = list.splice(i, 1);
  if (!list.length) delete s[owner][home];
  if (!Object.keys(s[owner]).length) delete s[owner];
  persist();
  return taken;
}

/** @param {(plot:number)=>boolean} isOpen @param {number} plot @returns {boolean} */
function safeOpen(isOpen, plot) {
  try {
    return !!isOpen(plot);
  } catch (_) {
    return false;
  }
}

/**
 * Drop a settlement's list (it was lost, or razed).
 * @param {number} owner @param {string} home
 */
export function forgetLostTiles(owner, home) {
  const s = state();
  if (s[owner] && s[owner][home]) {
    delete s[owner][home];
    persist();
  }
}

/**
 * Whether a plot is free for a settlement of this owner to settle again: the owner's, with nothing built on it.
 * False when the map can't be read.
 * @param {number} plot @param {number} owner @returns {boolean}
 */
export function plotIsFree(plot, owner) {
  try {
    const l = GameplayMap.getLocationFromIndex(plot);
    if (!l || GameplayMap.getOwner(l.x, l.y) !== owner) return false;
    return (MapConstructibles.getConstructibles(l.x, l.y) || []).length === 0;
  } catch (_) {
    return false;
  }
}

/** Test seam: drop the in-memory record, so the next read loads it from the save again. */
export function _forgetLostTilesMemory() {
  _state = null;
}
