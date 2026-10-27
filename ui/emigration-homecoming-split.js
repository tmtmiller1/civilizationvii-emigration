// emigration-homecoming-split.js
//
// Not everyone who fled goes back. When a home settlement has been calm long enough for its people to start coming
// home (emigration-homecoming.js), each group of them, one per settlement they live in now, decides once how many go
// back and how many stay. The share who go back starts at `homecomingReturnShare` for people away no longer than
// `homecomingShareGraceTurns`, falls by `homecomingShareDropPerTurn` for each turn after that down to
// `homecomingShareFloor`, and is scaled by `homecomingHostBetterScale` when the settlement they live in now is
// clearly better off than home (its prosperity `homecomingHostBetterGap` or more above). The free homecoming then
// brings back only those going; the rest have settled, and the paid Hasten can still bring them.
//
// The book per civilization holds, for each group (by call-home pair key), how many are going back still to come
// (`go`), how many stayed (`stay`), and the turn people first counted in the group were seen undecided (`seen`).
// The book is checked against the live count every turn: people brought back by a paid call come off `go` first,
// then off `stay`. People displaced after a decision are undecided until the next one. The split is a seeded
// rounding of the share, so a reload decides the same way.
//
// Pure over the book it is handed, except firstFledByPair, which reads the flow history to backdate the groups of a
// save made before the split. emigration-homecoming.js keeps the book in its own save state.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { pairKey } from "/emigration/ui/emigration-call-home.js";
import { currentGameId, registerCacheReset } from "/emigration/ui/emigration-cache-reset.js";
import { migrationFlowHistory } from "/emigration/ui/emigration-migration-stats.js";
import { isRefugeeCause } from "/emigration/ui/emigration-causes.js";

/**
 * @typedef {{go:number, stay:number, seen?:number}} SplitEntry One group's decision so far.
 * @typedef {Record<string, SplitEntry>} SplitBook One civilization's groups, by pair key.
 */

/** @param {*} v @param {number} fallback @returns {number} A finite number, or the fallback. */
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** @param {number} x @returns {number} Clamped to [0, 1]. */
const unit = (x) => Math.max(0, Math.min(1, x));

/**
 * The share of a group who go back: the base share while they've been away no longer than the grace, less the
 * drop for each turn after it, never under the floor, then scaled down when the place they live now is clearly
 * better off than home.
 * @param {number} turnsAway Turns since the group was first seen undecided.
 * @param {boolean} hostBetter Whether the settlement they live in now is clearly better off than home.
 * @returns {number} The share in [0, 1].
 */
export function returnShare(turnsAway, hostBetter) {
  const base = unit(num(CONFIG.homecomingReturnShare, 0.8));
  const grace = Math.max(0, num(CONFIG.homecomingShareGraceTurns, 5));
  const drop = Math.max(0, num(CONFIG.homecomingShareDropPerTurn, 0.02));
  const floor = Math.min(base, unit(num(CONFIG.homecomingShareFloor, 0.3)));
  let share = Math.max(floor, base - drop * Math.max(0, num(turnsAway, 0) - grace));
  if (hostBetter) share *= unit(num(CONFIG.homecomingHostBetterScale, 0.75));
  return unit(share);
}

/**
 * Whether the settlement a group lives in now is clearly better off than home.
 * @param {number|undefined} hostPros @param {number|undefined} homePros
 * @returns {boolean} False when either is unknown.
 */
export function hostClearlyBetter(hostPros, homePros) {
  if (!Number.isFinite(hostPros) || !Number.isFinite(homePros)) return false;
  return Number(hostPros) - Number(homePros) >= Math.max(0, num(CONFIG.homecomingHostBetterGap, 15));
}

/**
 * A seeded number in [0, 1): FNV-1a over the seed, then the murmur3 finalizer, so seeds that differ only at the end
 * still spread out. The game id is folded in when it can be read.
 * @param {string} seed @returns {number}
 */
export function seededUnit(seed) {
  const gameId = currentGameId();
  const s = (gameId != null ? gameId + "|" : "") + seed;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/**
 * How many of `n` go back at `share`: the whole part of n × share, and one more when the seeded roll falls under the
 * fraction left over. A group of one goes back at the share's odds instead of always or never.
 * @param {number} n @param {number} share @param {string} seed @returns {number} In [0, n].
 */
export function splitCount(n, share, seed) {
  const count = Math.max(0, Math.floor(num(n, 0)));
  const want = count * unit(num(share, 0));
  const whole = Math.floor(want);
  const extra = want - whole > 0 && seededUnit(seed) < want - whole ? 1 : 0;
  return Math.min(count, whole + extra);
}

/**
 * Bring a group's entry in line with how many of them are still away: when fewer are away than it accounts for (a
 * paid call or a return brought some home), take the difference off `go` first, then off `stay`.
 * @param {SplitEntry} e Changed in place. @param {number} away @returns {number} How many are still undecided.
 */
export function reconcile(e, away) {
  const n = Math.max(0, Math.floor(num(away, 0)));
  let over = e.go + e.stay - n;
  if (over > 0) {
    const fromGo = Math.min(e.go, over);
    e.go -= fromGo;
    over -= fromGo;
    e.stay = Math.max(0, e.stay - over);
  }
  return n - e.go - e.stay;
}

/**
 * Check a civilization's book against the groups still away this turn: reconcile each, note the turn a group first
 * has undecided people, and drop groups nobody is left in.
 * @param {SplitBook} book Changed in place. @param {*[]} pairs Internal pairs still away. @param {number} t Now.
 * @param {Record<string, number>} [since] For a save made before the split, the turn each group first fled, by pair
 *   key, so people long away aren't counted as just arrived.
 */
export function observe(book, pairs, t, since) {
  const live = new Set();
  for (const p of pairs || []) {
    const key = pairKey(p);
    live.add(key);
    const known = since && !book[key] ? since[key] : undefined;
    observeOne((book[key] ??= { go: 0, stay: 0 }), p.points, Number.isFinite(known) ? Number(known) : t);
  }
  for (const key of Object.keys(book)) if (!live.has(key)) delete book[key];
}

/**
 * One group: reconcile it, and note when it first has undecided people.
 * @param {SplitEntry} e @param {number} away @param {number} firstSeen The turn to note when none is noted yet.
 */
function observeOne(e, away, firstSeen) {
  const undecided = reconcile(e, away);
  if (undecided > 0 && e.seen == null) e.seen = firstSeen;
  if (undecided <= 0) delete e.seen;
}

/**
 * Decide the undecided people of one home's groups.
 * @param {SplitBook} book Changed in place. @param {*[]} pairs This home's pairs still away.
 * @param {number} t Now. @param {(pair:*)=>boolean} better Whether a pair's host is clearly better off than home.
 * @returns {{go:number, stay:number}} How many were decided each way this turn.
 */
export function decide(book, pairs, t, better) {
  const out = { go: 0, stay: 0 };
  for (const p of pairs) {
    const key = pairKey(p);
    const e = (book[key] ??= { go: 0, stay: 0 });
    const undecided = reconcile(e, p.points);
    if (undecided <= 0) continue;
    const share = returnShare(t - num(e.seen, t), better(p));
    const go = splitCount(undecided, share, key + "|" + t);
    e.go += go;
    e.stay += undecided - go;
    delete e.seen;
    out.go += go;
    out.stay += undecided - go;
  }
  return out;
}

/**
 * The groups as the free homecoming sees them: each pair with only those going back still to come.
 * @param {SplitBook} book @param {*[]} pairs @returns {*[]} Copies, largest first; groups with none going left out.
 */
export function goingPairs(book, pairs) {
  return (pairs || [])
    .map((p) => ({ ...p, points: Math.min(p.points, (book[pairKey(p)] || { go: 0 }).go) }))
    .filter((p) => p.points > 0)
    .sort((a, b) => b.points - a.points);
}

/**
 * One person of a group came home on the free homecoming.
 * @param {SplitBook} book @param {*} pair
 */
export function tookOne(book, pair) {
  const e = book[pairKey(pair)];
  if (e && e.go > 0) e.go -= 1;
}

/**
 * Where a group stands for the Left pane, against how many of them are away now.
 * @param {SplitBook|undefined} book @param {*} pair
 * @returns {{go:number, stay:number, undecided:number}}
 */
export function groupStatus(book, pair) {
  const e = book && book[pairKey(pair)];
  const away = Math.max(0, Math.floor(num(pair.points, 0)));
  if (!e) return { go: 0, stay: 0, undecided: away };
  const stay = Math.min(e.stay, away);
  const go = Math.min(e.go, away - stay);
  return { go, stay, undecided: away - stay - go };
}

/** @type {Record<string, Record<string, number>>|null} */
let _fled = null;
registerCacheReset(() => {
  _fled = null;
});

/**
 * The turn (the mod's monotonic turn) each group of people displaced inside their own civilization first fled, by
 * civ then pair key: the first history frame where the move between the two settlements has a refugee cause.
 * @returns {Record<string, Record<string, number>>}
 */
export function firstFledByPair() {
  if (_fled) return _fled;
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const frame of migrationFlowHistory()) {
    for (const e of frame.edges || []) {
      if (!internalRefugeeEdge(e)) continue;
      const key = pairKey({ from: e.destCity, home: e.srcCity, host: e.dest });
      const civ = (out[e.src] ??= {});
      if (!(key in civ)) civ[key] = Number(frame.chartTurn) || 0;
    }
  }
  return (_fled = out);
}

/**
 * Whether a history edge is people fleeing one settlement for another of the same civilization.
 * @param {*} e @returns {boolean}
 */
function internalRefugeeEdge(e) {
  if (!e || e.src !== e.dest || !e.srcCity || !e.destCity || e.srcCity === e.destCity) return false;
  return Object.entries(e.byCause || {}).some(([c, n]) => isRefugeeCause(c) && Number(n) > 0);
}

/**
 * A book from the save, keeping only well-formed entries.
 * @param {*} o @returns {Record<string, SplitBook>} By civilization.
 */
export function cleanSplit(o) {
  /** @type {Record<string, SplitBook>} */
  const out = {};
  if (!isRecord(o)) return out;
  for (const [pid, book] of Object.entries(o)) {
    if (!isRecord(book)) continue;
    for (const [key, e] of Object.entries(book)) {
      const entry = cleanEntry(e);
      if (entry) (out[pid] ??= {})[key] = entry;
    }
  }
  return out;
}

/** @param {*} o @returns {boolean} A plain object, not an array. */
const isRecord = (o) => !!o && typeof o === "object" && !Array.isArray(o);

/** @param {*} e A saved entry. @returns {SplitEntry|null} */
function cleanEntry(e) {
  if (!e || typeof e !== "object") return null;
  /** @type {SplitEntry} */
  const entry = { go: Math.max(0, Math.floor(num(e.go, 0))), stay: Math.max(0, Math.floor(num(e.stay, 0))) };
  const seen = e.seen === null || e.seen === "" ? NaN : Number(e.seen);
  if (Number.isFinite(seen)) entry.seen = seen;
  return entry;
}
