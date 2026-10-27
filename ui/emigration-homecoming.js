// emigration-homecoming.js
//
// People displaced inside their own civilization go home on their own once it is safe. On each civilization's turn,
// a home settlement that has been calm (no distress from war, siege, disaster, famine or unrest) for
// `homecomingCalmTurns` turns in a row gets one of its people back every `homecomingEveryTurns` turns, from the
// settlement of the same civilization holding the most of them. The move is the paid call's own (`movePointHome`),
// so it leaves a tile at the host and lands as a new one at home, and the return is counted (emigration-returned.js)
// so the count of people away goes down. Nobody comes home to a settlement that is lost, still in trouble, or has
// nobody away. Once a home is calm enough, each group of its people decides once how many go back and how many stay
// (emigration-homecoming-split.js); only those going back come on their own. The paid call stays for people abroad.
//
// Calm streaks and the last return per home are kept in the save, so a reload doesn't reset them; turns are the
// mod's monotonic turn, so an age change doesn't either.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { distress, situationalBreakdown } from "/emigration/ui/emigration-prosperity.js";
import { freshCity, lastPassRanked } from "/emigration/ui/emigration-pass-signals.js";
import { callHomeCandidates } from "/emigration/ui/emigration-call-home.js";
import { callHomeResolvable, movePointHome } from "/emigration/ui/emigration-call-home-action.js";
import { cityName } from "/emigration/ui/emigration-migration-records.js";
import { chronicle } from "/emigration/ui/emigration-chronicle.js";
import { narrativeCiv } from "/emigration/ui/emigration-naming.js";
import { msg, msgText } from "/emigration/ui/emigration-loc.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { toast } from "/emigration/ui/emigration-feedback.js";
import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";
import { cleanSplit, decide, firstFledByPair, goingPairs, hostClearlyBetter, observe, tookOne }
  from "/emigration/ui/emigration-homecoming-split.js";

const STATE_KEY = "EmigrationHomecoming_v1";

/**
 * @typedef {Object} HomecomingState
 * @property {Record<string, Record<string, number>>} calm Consecutive calm turns, by civ then settlement.
 * @property {Record<string, Record<string, number>>} last Turn of the last return, by civ then home.
 * @property {Record<string, Record<string, string>>} kind The last trouble at each settlement, "war" (fighting in
 *   its borders or a siege) or "other" (disaster, famine, unrest), by civ then settlement.
 * @property {Record<string, number>} ran Turn each civ was last processed (once per turn).
 * @property {Record<string, import("/emigration/ui/emigration-homecoming-split.js").SplitBook>} split Who of each
 *   group goes back and who stays, by civ.
 */

/**
 * @typedef {Object} HomecomingDeps Test seams; each defaults to the live game.
 * @property {()=>*[]} [signals] The pass's kept city signals.
 * @property {(s:*)=>*} [resolve] The live city for a kept signal, or null.
 * @property {(s:*)=>number} [distressOf] A signal's distress.
 * @property {(s:*)=>string} [troubleOf] The kind of a signal's distress: "war" or "other".
 * @property {(city:*)=>string} [nameOf] A city's display name, as the flow ledger keys it.
 * @property {(pid:number)=>*[]} [pairs] The civ's internal candidate pairs, still away.
 * @property {(pid:number)=>(pair:*)=>boolean} [resolvable] Whether both cities of a pair still stand.
 * @property {(pid:number, pair:*)=>boolean} [move] Move one person home.
 * @property {()=>number} [turn] The current turn.
 * @property {(pid:number, home:string, done:boolean)=>void} [report] Tell the player.
 * @property {(pid:number, home:string, go:number, stay:number)=>void} [reportSplit] Tell the player how a home's
 *   people decided.
 * @property {number} [local] The local player id.
 * @property {()=>Record<string, Record<string, number>>} [history] The turn each group first fled, by civ then pair
 *   key, from the flow history; read once, for a save made before the split.
 */

/** @type {HomecomingState|null} */
let _state = null;
/** Whether the loaded save predates the split, so its groups are backdated from the flow history once. */
let _backfill = false;
/** @type {Set<number>} Civilizations already backdated this session. */
const _backfilled = new Set();
registerCacheReset(() => {
  _state = null;
  _backfill = false;
  _backfilled.clear();
});

/** @param {*} o @returns {boolean} */
const isObj = (o) => !!o && typeof o === "object" && !Array.isArray(o);

/** @param {*} v @returns {boolean} A number, or a numeric string; null and blanks don't count. */
const isNum = (v) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(Number(v));

/**
 * Keep only numeric entries two levels down.
 * @param {*} o @returns {Record<string, Record<string, number>>}
 */
function cleanNested(o) {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  if (!isObj(o)) return out;
  for (const [pid, m] of Object.entries(o)) {
    if (!isObj(m)) continue;
    for (const [name, n] of Object.entries(m)) if (isNum(n)) (out[pid] ??= {})[name] = Number(n);
  }
  return out;
}

/** @param {*} o @returns {Record<string, number>} Numeric entries only. */
function cleanFlat(o) {
  /** @type {Record<string, number>} */
  const out = {};
  if (isObj(o)) for (const [k, v] of Object.entries(o)) if (isNum(v)) out[k] = Number(v);
  return out;
}

/** @param {*} o @returns {Record<string, Record<string, string>>} "war" / "other" entries two levels down. */
function cleanKinds(o) {
  /** @type {Record<string, Record<string, string>>} */
  const out = {};
  if (!isObj(o)) return out;
  for (const [pid, m] of Object.entries(o)) {
    if (!isObj(m)) continue;
    for (const [name, k] of Object.entries(m)) if (k === "war" || k === "other") (out[pid] ??= {})[name] = k;
  }
  return out;
}

/** @param {*} o Parsed save value. @returns {HomecomingState} */
export function cleanHomecoming(o) {
  const src = isObj(o) ? o : {};
  return {
    calm: cleanNested(src.calm), last: cleanNested(src.last), kind: cleanKinds(src.kind), ran: cleanFlat(src.ran),
    split: cleanSplit(src.split)
  };
}

/**
 * The seams with the live game filled in where a caller left them out.
 * @param {HomecomingDeps} [d] @returns {Required<HomecomingDeps>}
 */
function withDefaults(d) {
  return {
    signals: lastPassRanked, resolve: freshCity, distressOf: liveDistress, troubleOf: liveTrouble, nameOf: cityName,
    pairs: (pid) => callHomeCandidates(pid).internal, resolvable: callHomeResolvable, move: movePointHome,
    turn: turnNow, report: reportHomecoming, reportSplit: reportSplit, local: localPid(), history: firstFledByPair,
    ...(d || {})
  };
}

/** @returns {*} The saved state as parsed, or null when there is none. */
function readSaved() {
  const raw = Configuration?.getGame?.()?.getValue?.(STATE_KEY);
  return typeof raw === "string" && raw ? JSON.parse(raw) : null;
}

/** @returns {HomecomingState} */
function state() {
  resetCachesOnNewGame();
  if (!_state) {
    try {
      const parsed = readSaved();
      // A save without the split, including one from before homecoming, is backdated once from the flow history.
      _backfill = !(parsed && typeof parsed === "object" && "split" in parsed);
      _state = cleanHomecoming(parsed);
    } catch (_) {
      _state = cleanHomecoming(null);
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

/** @returns {number} The monotonic turn once a pass has set it, else the game turn. */
function turnNow() {
  try {
    const mono = monoTurn();
    if (mono > 0) return mono;
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/** @param {*} s @returns {number} Distress, or Infinity when the read throws (counts as not calm). */
function liveDistress(s) {
  try {
    return Number(distress(s)) || 0;
  } catch (_) {
    return Infinity;
  }
}

/**
 * What kind of trouble a city is in: "war" when there is fighting in its borders or a siege, else "other".
 * @param {*} s A city signal with its live city. @returns {string}
 */
function liveTrouble(s) {
  try {
    const b = situationalBreakdown(s);
    return b.violence < 0 || b.siege < 0 ? "war" : "other";
  } catch (_) {
    return "war"; // unreadable: the longer wait
  }
}

/**
 * This civilization's calm streaks after this turn: a settlement with no distress adds a turn, one in distress goes
 * back to zero, and settlements it no longer holds drop out.
 * Each troubled settlement's kind of trouble is noted in `kinds` (changed in place), so the wait after it can
 * depend on what it was.
 * @param {number} pid @param {Record<string, number>} was Last turn's streaks. @param {HomecomingDeps} d
 * @param {Record<string, string>} [kinds] The last trouble per settlement, kept up to date.
 * @param {Record<string, number>} [pros] Filled with each settlement's prosperity, by name, when given.
 * @returns {Record<string, number>} The streaks, by settlement name.
 */
export function updateCalm(pid, was, d, kinds, pros) {
  const x = withDefaults(d);
  /** @type {Record<string, number>} */
  const now = {};
  for (const s of x.signals() || []) {
    const city = s && s.owner === pid ? x.resolve(s) : null;
    if (!city) continue;
    const name = x.nameOf(city);
    const sig = { ...s, city };
    const troubled = x.distressOf(sig) > 0;
    now[name] = troubled ? 0 : (Number(was[name]) || 0) + 1;
    if (troubled && kinds) kinds[name] = x.troubleOf(sig);
    notePros(pros, name, s);
  }
  return now;
}

/**
 * Keep a settlement's prosperity, when there's a record to keep it in and the signal has one.
 * @param {Record<string, number>|undefined} pros @param {string} name @param {*} s
 */
function notePros(pros, name, s) {
  if (pros && Number.isFinite(Number(s.pros))) pros[name] = Number(s.pros);
}

/**
 * How many calm turns a home needs before its people come back: the longer wait after fighting or a siege (a
 * frontier city that was hit once is likely to be hit again), the short one after disaster, famine or unrest.
 * @param {string|undefined} kind The home's last trouble. @returns {number}
 */
export function calmNeeded(kind) {
  const key = kind === "war" ? "homecomingCalmTurnsAfterWar" : "homecomingCalmTurns";
  return Math.max(1, Math.floor(Number(CONFIG[key]) || 0));
}

/**
 * The homes due a returnee this turn, each with the pair to bring one back from: calm long enough, the wait since
 * the last return over, somebody away, and both cities still standing. The pair is the home's largest.
 * @param {*[]} pairs Internal pairs still away, richest first.
 * @param {{calm:Record<string, number>, last:Record<string, number>, kind?:Record<string, string>}} civ This
 *   civilization's calm streaks, last return per home, and last trouble per home (sets how long it must be calm).
 * @param {number} t Now. @param {(pair:*)=>boolean} ok Whether both cities of a pair still stand.
 * @returns {{home:string, pairs:*[], away:number}[]} One entry per home due, its pairs richest first.
 */
export function homesDue(pairs, civ, t, ok) {
  const { calm, last } = civ;
  const kinds = civ.kind || {};
  const every = Math.max(1, Math.floor(Number(CONFIG.homecomingEveryTurns) || 0));
  /** @type {Map<string, {home:string, pairs:*[], away:number}>} */
  const due = new Map();
  for (const p of pairs) {
    if (!ok(p)) continue;
    const entry = due.get(p.home);
    if (entry) {
      entry.pairs.push(p);
      entry.away += p.points;
      continue;
    }
    if ((Number(calm[p.home]) || 0) < calmNeeded(kinds[p.home])) continue;
    if (p.home in last && t - Number(last[p.home]) < every) continue;
    due.set(p.home, { home: p.home, pairs: [p], away: p.points });
  }
  return [...due.values()];
}

/**
 * How many come home to a settlement in one return: one, plus one for every `homecomingBatchPer` away. A city
 * missing twenty people would otherwise take eighty turns to refill (watched 2026-10-25: Boston, 23 away, 91 turns).
 * @param {number} away Population points still away. @returns {number}
 */
export function batchFor(away) {
  const per = Math.max(1, Math.floor(Number(CONFIG.homecomingBatchPer) || 0));
  return Math.max(1, 1 + Math.floor(Math.max(0, away) / per));
}

/**
 * Run one civilization's homecoming for its turn. Called on every civilization's turn; does its work once a turn.
 * @param {number} pid The civilization whose turn it is. @param {HomecomingDeps} [deps] Test seams.
 * @returns {number} How many people came home.
 */
export function homecomingOnTurn(pid, deps) {
  if (!CONFIG.homecomingEnabled || typeof pid !== "number" || pid < 0) return 0;
  try {
    const d = withDefaults(deps);
    const s = state();
    const t = d.turn();
    if (s.ran[pid] === t) return 0;
    s.ran[pid] = t;
    const moved = runCiv(pid, s, t, d);
    persist();
    return moved;
  } catch (e) {
    dlog("homecoming threw " + e);
    return 0;
  }
}

/**
 * One civilization's turn: refresh its calm streaks, let the people of each home calm enough decide whether to go
 * back, bring a batch of those going home to each home that is due, and forget what no longer applies.
 * @param {number} pid @param {HomecomingState} s @param {number} t @param {Required<HomecomingDeps>} d
 * @returns {number} How many came home.
 */
function runCiv(pid, s, t, d) {
  const kind = (s.kind[pid] ??= {});
  /** @type {Record<string, number>} */
  const pros = {};
  const calm = (s.calm[pid] = updateCalm(pid, s.calm[pid] || {}, d, kind, pros));
  const last = (s.last[pid] ??= {});
  const book = (s.split[pid] ??= {});
  const pairs = d.pairs(pid);
  const ok = d.resolvable(pid);
  observe(book, pairs, t, pairs.length ? backdate(pid, d) : undefined);
  decideCalmHomes(pid, book, pairs, { calm, kind, pros, t, ok }, d);
  const going = goingPairs(book, pairs);
  const move = (/** @type {number} */ who, /** @type {*} */ pair) => {
    const done = d.move(who, pair);
    if (done) tookOne(book, pair);
    return done;
  };
  let moved = 0;
  for (const h of homesDue(going, { calm, last, kind }, t, ok)) moved += bringHome(pid, h, last, t, { ...d, move });
  pruneLast(last, going);
  for (const name of Object.keys(kind)) if (!(name in calm)) delete kind[name]; // settlements no longer held
  return moved;
}

/**
 * For a save made before the split, the turn each of this civilization's groups first fled, once a session.
 * @param {number} pid @param {Required<HomecomingDeps>} d @returns {Record<string, number>|undefined}
 */
function backdate(pid, d) {
  if (!_backfill || _backfilled.has(pid)) return undefined;
  _backfilled.add(pid);
  try {
    return d.history()[pid];
  } catch (_) {
    return undefined;
  }
}

/**
 * The people of each home that has been calm long enough, and whose settlements both still stand, decide whether
 * to go back; the player hears how their own people decided.
 * @param {number} pid @param {import("/emigration/ui/emigration-homecoming-split.js").SplitBook} book
 * @param {*[]} pairs
 * @param {{calm:Record<string, number>, kind:Record<string, string>, pros:Record<string, number>, t:number,
 *   ok:(pair:*)=>boolean}} c
 * @param {Required<HomecomingDeps>} d
 */
function decideCalmHomes(pid, book, pairs, c, d) {
  /** @type {Map<string, *[]>} */
  const byHome = new Map();
  for (const p of pairs) {
    if (!c.ok(p) || (Number(c.calm[p.home]) || 0) < calmNeeded(c.kind[p.home])) continue;
    const list = byHome.get(p.home);
    if (list) list.push(p);
    else byHome.set(p.home, [p]);
  }
  const better = (/** @type {*} */ p) => hostClearlyBetter(c.pros[p.from], c.pros[p.home]);
  for (const [home, list] of byHome) {
    const r = decide(book, list, c.t, better);
    if (r.go + r.stay <= 0) continue;
    dlog("homecoming: " + home + " (civ " + pid + ") decided " + r.go + " go back, " + r.stay + " stay; pros "
      + list.map((p) => p.from + " " + fmt(c.pros[p.from])).join(", ") + " vs home " + fmt(c.pros[home]));
    if (pid !== d.local) continue;
    if (r.stay > 0) d.reportSplit(pid, home, r.go, r.stay);
    else d.report(pid, home, false);
  }
}

/** @param {number|undefined} n @returns {string} */
const fmt = (n) => (Number.isFinite(n) ? String(Math.round(Number(n) * 10) / 10) : "?");

/**
 * Bring this return's batch home to a settlement that is due, from its largest group first, and tell the player
 * about the first of them and the last.
 * @param {number} pid @param {{home:string, pairs:*[], away:number}} h @param {Record<string, number>} last
 * @param {number} t @param {Required<HomecomingDeps>} d @returns {number} How many came home.
 */
function bringHome(pid, h, last, t, d) {
  const moved = moveBatch(pid, h.pairs, Math.min(h.away, batchFor(h.away)), d.move);
  if (!moved) return 0;
  const done = h.away - moved <= 0;
  last[h.home] = t;
  dlog("homecoming: " + moved + " point(s) back to " + h.home + " (civ " + pid + ", " + (h.away - moved)
    + " still to come)");
  if (pid === d.local && done) d.report(pid, h.home, true);
  if (done) delete last[h.home];
  return moved;
}

/**
 * Move up to `want` people home, from the largest group first; a move that fails ends that group.
 * @param {number} pid @param {*[]} pairs @param {number} want @param {(pid:number, pair:*)=>boolean} move
 * @returns {number} How many moved.
 */
function moveBatch(pid, pairs, want, move) {
  let moved = 0;
  for (const pair of pairs) {
    for (let k = 0; k < pair.points && moved < want; k++) {
      if (!move(pid, pair)) break;
      moved++;
    }
    if (moved >= want) break;
  }
  return moved;
}

/**
 * Forget the last-return turn of homes nobody is away from any more, so the save stays small and a later
 * displacement starts a fresh homecoming.
 * @param {Record<string, number>} last @param {*[]} pairs
 */
function pruneLast(last, pairs) {
  const homes = new Set(pairs.map((p) => p.home));
  for (const home of Object.keys(last)) if (!homes.has(home)) delete last[home];
}

/** @returns {number} The local player id, or -1. */
function localPid() {
  try {
    return typeof GameContext !== "undefined" ? GameContext.localPlayerID : -1;
  } catch (_) {
    return -1;
  }
}

/**
 * The Chronicle line and notice when a home's people have decided: how many are coming back and how many stay.
 * @param {number} pid @param {string} home @param {number} go @param {number} stay
 */
function reportSplit(pid, home, go, stay) {
  const body = go > 0
    ? msg("LOC_EMIG_HOMECOMING_SPLIT",
      "{1_Home} is safe again. {2_Go} of the people who fled it are coming home, and {3_Stay} have settled "
      + "where they went.", home, go, stay)
    : msg("LOC_EMIG_HOMECOMING_ALL_STAY",
      "{1_Home} is safe again, but the {2_Stay} people who fled it have settled where they went. Hasten can "
      + "still bring them back.", home, stay);
  announce(pid, home, body, "split");
}

/**
 * A Chronicle line when the player's people start coming home to a settlement, and when the last of them is back.
 * @param {number} pid @param {string} home @param {boolean} done
 */
function reportHomecoming(pid, home, done) {
  const body = done
    ? msg("LOC_EMIG_HOMECOMING_DONE_GOING", "The last of the people coming home to {1_Home} are back.", home)
    : msg("LOC_EMIG_HOMECOMING_START",
      "{1_Home} is safe again, and the people who fled it have started coming home.", home);
  announce(pid, home, body, done ? "done" : "start");
}

/**
 * Put a homecoming line in the Chronicle and beside End Turn.
 * @param {number} pid @param {string} home @param {*} body A composed message. @param {string} tag "start",
 *   "split" or "done".
 */
function announce(pid, home, body, tag) {
  const done = tag === "done";
  try {
    const nc = narrativeCiv(pid);
    chronicle({
      kind: "return", civ: nc.adj, people: 1,
      title: done
        ? msg("LOC_EMIG_HOMECOMING_DONE_TITLE", "Home At Last")
        : msg("LOC_EMIG_HOMECOMING_START_TITLE", "The Road Home"),
      body, dedupeKey: "homecoming:" + pid + "|" + home + "|" + tag + "|" + turnNow()
    });
    // One notice beside End Turn per settlement, when they start and when the last is back; it opens the Displaced tab.
    toast(msgText(body), undefined, false, undefined, "home");
  } catch (e) {
    dlog("homecoming: chronicle threw " + e);
  }
}

/**
 * Where one home stands: calm turns so far and needed, the turn of its last return (null before the first), the
 * turns between returns, and the turn now. For the Displaced tab.
 * @param {number} pid @param {string} home
 * @returns {{calm:number, needed:number, every:number, last:number|null, kind:string|undefined, turn:number}}
 */
export function homecomingStatus(pid, home) {
  const s = state();
  const kind = (s.kind[pid] || {})[home];
  const last = (s.last[pid] || {})[home];
  return {
    calm: Number((s.calm[pid] || {})[home]) || 0, needed: calmNeeded(kind),
    every: Math.max(1, Math.floor(Number(CONFIG.homecomingEveryTurns) || 1)),
    last: Number.isFinite(Number(last)) && last !== undefined ? Number(last) : null, kind, turn: turnNow()
  };
}

/**
 * A civilization's book of who goes back and who stays, for the Left pane. Read-only; the turn keeps it current.
 * @param {number} pid @returns {import("/emigration/ui/emigration-homecoming-split.js").SplitBook}
 */
export function homecomingSplitOf(pid) {
  try {
    return state().split[pid] || {};
  } catch (_) {
    return {};
  }
}

/** Test seam: drop the in-memory state, so the next read loads it from the save again. */
export function _forgetHomecoming() {
  _state = null;
  _backfilled.clear();
}
