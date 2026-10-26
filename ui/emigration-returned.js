// emigration-returned.js
//
// Who has come home. The flow ledger (emigration-migration-stats.js) is an all-game tally of moves and never goes
// down, so on its own it can't say who is still away: a call that brought three people home left the quote
// unchanged, and the offer came back for people already home. Every return that lands (a paid call, or a diaspora
// drifting home) is counted here by origin civ, host civ, host settlement and home settlement, and call-home
// subtracts it from the ledger. Kept in the save.

import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";

const STATE_KEY = "EmigrationReturned_v1";
/** Bound on stored host settlements, so a long game can't grow the save until setValue drops it. */
const MAX_HOSTS = 4000;

/**
 * Returns by origin civ, then host civ, then host settlement, then home settlement.
 * @typedef {Record<string, Record<string, Record<string, Record<string, number>>>>} ReturnedStore
 */

/** @type {ReturnedStore|null} */
let _state = null;
registerCacheReset(() => {
  _state = null;
});

/** @param {*} o @returns {boolean} */
const isObj = (o) => !!o && typeof o === "object" && !Array.isArray(o);

/** @param {*} o @returns {[string, *][]} An object's entries whose values are objects; none for a non-object. */
const objEntries = (o) => (isObj(o) ? Object.entries(o).filter(([, v]) => isObj(v)) : []);

/**
 * Every count in one origin's map, flattened.
 * @param {*} byHost Host civ, then host settlement, then home. @returns {[string, string, string, *][]}
 *   [host civ, host settlement, home, count] rows.
 */
function leaves(byHost) {
  /** @type {[string, string, string, *][]} */
  const out = [];
  for (const [host, froms] of objEntries(byHost)) {
    for (const [from, homes] of objEntries(froms)) {
      for (const [home, n] of Object.entries(homes)) out.push([host, from, home, n]);
    }
  }
  return out;
}

/**
 * Set one count, creating the levels on the way.
 * @param {ReturnedStore} s @param {(string|number)[]} path [origin, host civ, host settlement, home].
 * @param {number} n
 */
function put(s, path, n) {
  const [origin, host, from, home] = path;
  ((((s[origin] ??= {})[host] ??= {})[from] ??= {})[home] = n);
}

/**
 * The homes stored for one host settlement, or null.
 * @param {ReturnedStore} s @param {number} origin @param {number} host @param {string} from
 * @returns {Record<string, number>|null}
 */
function homesAt(s, origin, host, from) {
  const byHost = s[origin];
  const froms = byHost ? byHost[host] : null;
  return froms && froms[from] ? froms[from] : null;
}

/**
 * Keep only well-formed entries: positive whole counts under object levels.
 * @param {*} o Parsed save value. @returns {ReturnedStore}
 */
export function cleanReturned(o) {
  /** @type {ReturnedStore} */
  const out = {};
  for (const [origin, byHost] of objEntries(o)) {
    for (const [host, from, home, n] of leaves(byHost)) {
      const v = Math.floor(Number(n));
      if (v > 0) put(out, [origin, host, from, home], v);
    }
  }
  return out;
}

/** @returns {ReturnedStore} */
function load() {
  try {
    const raw = Configuration?.getGame?.()?.getValue?.(STATE_KEY);
    return cleanReturned(typeof raw === "string" && raw ? JSON.parse(raw) : null);
  } catch (_) {
    return {};
  }
}

/** @returns {ReturnedStore} */
function state() {
  resetCachesOnNewGame();
  if (!_state) _state = load();
  return _state;
}

function persist() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(_state || {}));
  } catch (_) {
    /* unwritable mid age-transition; kept in memory */
  }
}

/**
 * Count one return that landed.
 * @param {number} origin The returnees' civ. @param {number} host The civ they lived under.
 * @param {string} from The host settlement. @param {string} home The settlement they went back to.
 * @param {number} [n] How many (default 1).
 */
export function recordReturn(origin, host, from, home, n = 1) {
  const k = Math.floor(Number(n));
  if (!validReturn(origin, host, from, home) || !(k > 0)) return;
  const s = state();
  const homes = homesAt(s, origin, host, from);
  if (!homes && countHosts(s) >= MAX_HOSTS) return;
  put(s, [origin, host, from, home], ((homes && homes[home]) || 0) + k);
  persist();
}

/** @param {*} origin @param {*} host @param {*} from @param {*} home @returns {boolean} */
function validReturn(origin, host, from, home) {
  return typeof origin === "number" && typeof host === "number" && !!from && !!home;
}

/** @param {ReturnedStore} s @returns {number} Stored host settlements. */
function countHosts(s) {
  let n = 0;
  for (const [, byHost] of objEntries(s)) for (const [, froms] of objEntries(byHost)) n += Object.keys(froms).length;
  return n;
}

/**
 * One origin's returns, as stored (host civ, then host settlement, then home settlement).
 * @param {number} origin @returns {Record<string, Record<string, Record<string, number>>>}
 */
export function returnedFor(origin) {
  return state()[origin] || {};
}

/**
 * Take an origin's returns off its candidate pairs. A return first comes off the pair it matches exactly
 * (same host settlement and home); what it can't match there (a diaspora drifting home lands in the homeland's
 * chosen city, not always the one they left) comes off the other pairs from the same host settlement, largest
 * first. A pair never goes below zero, and pairs left empty are dropped. Pure; the input is not changed.
 * @param {{from:string, home:string, host:number, points:number}[]} pairs Candidate pairs for one origin.
 * @param {Record<string, Record<string, Record<string, number>>>} returned That origin's returns.
 * @returns {*[]} The pairs still away, richest first.
 */
export function netOfReturns(pairs, returned) {
  if (!isObj(returned)) return pairs;
  const out = pairs.map((p) => ({ ...p }));
  spillOver(out, takeExact(out, returned));
  return out.filter((p) => p.points > 0).sort((a, b) => b.points - a.points);
}

/**
 * Take each return off the pair it matches exactly, and gather what didn't fit by host settlement.
 * @param {*[]} out The pairs (changed in place). @param {*} returned One origin's returns.
 * @returns {Map<string, number>} Unmatched returns by "host|from".
 */
function takeExact(out, returned) {
  /** @type {Map<string, number>} */
  const spill = new Map();
  for (const [host, from, home, n] of leaves(returned)) {
    const p = out.find((x) => String(x.host) === host && x.from === from && x.home === home);
    const take = p ? Math.min(p.points, n) : 0;
    if (p) p.points -= take;
    const key = host + "|" + from;
    if (n > take) spill.set(key, (spill.get(key) || 0) + n - take);
  }
  return spill;
}

/**
 * Take unmatched returns off the other pairs from the same host settlement, largest first.
 * @param {*[]} out The pairs (changed in place). @param {Map<string, number>} spill By "host|from".
 */
function spillOver(out, spill) {
  for (const [key, n] of spill) {
    let left = n;
    const group = out.filter((x) => x.host + "|" + x.from === key).sort((a, b) => b.points - a.points);
    for (const p of group) {
      const take = Math.min(p.points, left);
      p.points -= take;
      left -= take;
    }
  }
}

/** Test seam: drop the in-memory record, so the next read loads it from the save again. */
export function _forgetReturned() {
  _state = null;
}
