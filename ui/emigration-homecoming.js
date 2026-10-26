// emigration-homecoming.js
//
// People displaced inside their own civilization go home on their own once it is safe. On each civilization's turn,
// a home settlement that has been calm (no distress from war, siege, disaster, famine or unrest) for
// `homecomingCalmTurns` turns in a row gets one of its people back every `homecomingEveryTurns` turns, from the
// settlement of the same civilization holding the most of them. The move is the paid call's own (`movePointHome`),
// so it leaves a tile at the host and lands as a new one at home, and the return is counted (emigration-returned.js)
// so the count of people away goes down. Nobody comes home to a settlement that is lost, still in trouble, or has
// nobody away. The paid call stays for people abroad.
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
import { msg } from "/emigration/ui/emigration-loc.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";

const STATE_KEY = "EmigrationHomecoming_v1";

/**
 * @typedef {Object} HomecomingState
 * @property {Record<string, Record<string, number>>} calm Consecutive calm turns, by civ then settlement.
 * @property {Record<string, Record<string, number>>} last Turn of the last return, by civ then home.
 * @property {Record<string, Record<string, string>>} kind The last trouble at each settlement, "war" (fighting in
 *   its borders or a siege) or "other" (disaster, famine, unrest), by civ then settlement.
 * @property {Record<string, number>} ran Turn each civ was last processed (once per turn).
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
 * @property {number} [local] The local player id.
 */

/** @type {HomecomingState|null} */
let _state = null;
registerCacheReset(() => {
  _state = null;
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
    calm: cleanNested(src.calm), last: cleanNested(src.last), kind: cleanKinds(src.kind), ran: cleanFlat(src.ran)
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
    turn: turnNow, report: reportHomecoming, local: localPid(), ...(d || {})
  };
}

/** @returns {HomecomingState} */
function state() {
  resetCachesOnNewGame();
  if (!_state) {
    try {
      const raw = Configuration?.getGame?.()?.getValue?.(STATE_KEY);
      _state = cleanHomecoming(typeof raw === "string" && raw ? JSON.parse(raw) : null);
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
 * @returns {Record<string, number>} The streaks, by settlement name.
 */
export function updateCalm(pid, was, d, kinds) {
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
  }
  return now;
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
 * @returns {{home:string, pair:*, away:number}[]} One entry per home due.
 */
export function homesDue(pairs, civ, t, ok) {
  const { calm, last } = civ;
  const kinds = civ.kind || {};
  const every = Math.max(1, Math.floor(Number(CONFIG.homecomingEveryTurns) || 0));
  /** @type {Map<string, {home:string, pair:*, away:number}>} */
  const due = new Map();
  for (const p of pairs) {
    if (!ok(p)) continue;
    const entry = due.get(p.home);
    if (entry) {
      entry.away += p.points;
      continue;
    }
    if ((Number(calm[p.home]) || 0) < calmNeeded(kinds[p.home])) continue;
    if (p.home in last && t - Number(last[p.home]) < every) continue;
    due.set(p.home, { home: p.home, pair: p, away: p.points });
  }
  return [...due.values()];
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
 * One civilization's turn: refresh its calm streaks, bring one person home to each home that is due, and forget
 * what no longer applies.
 * @param {number} pid @param {HomecomingState} s @param {number} t @param {Required<HomecomingDeps>} d
 * @returns {number} How many came home.
 */
function runCiv(pid, s, t, d) {
  const kind = (s.kind[pid] ??= {});
  const calm = (s.calm[pid] = updateCalm(pid, s.calm[pid] || {}, d, kind));
  const last = (s.last[pid] ??= {});
  const pairs = d.pairs(pid);
  let moved = 0;
  const due = homesDue(pairs, { calm, last, kind }, t, d.resolvable(pid));
  for (const h of due) moved += bringOneHome(pid, h, last, t, d);
  pruneLast(last, pairs);
  for (const name of Object.keys(kind)) if (!(name in calm)) delete kind[name]; // settlements no longer held
  return moved;
}

/**
 * Move one person home for a home that is due, and tell the player about the first and the last of them.
 * @param {number} pid @param {{home:string, pair:*, away:number}} h @param {Record<string, number>} last
 * @param {number} t @param {Required<HomecomingDeps>} d @returns {number} 1 when someone came home, else 0.
 */
function bringOneHome(pid, h, last, t, d) {
  if (!d.move(pid, h.pair)) return 0;
  const first = !(h.home in last);
  const done = h.away <= 1;
  last[h.home] = t;
  dlog("homecoming: 1 point from " + h.pair.from + " back to " + h.home + " (civ " + pid + ", " + (h.away - 1) + " still away)");
  if (pid === d.local && first) d.report(pid, h.home, false);
  if (pid === d.local && done) d.report(pid, h.home, true);
  if (done) delete last[h.home];
  return 1;
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
 * A Chronicle line when the player's people start coming home to a settlement, and when the last of them is back.
 * @param {number} pid @param {string} home @param {boolean} done
 */
function reportHomecoming(pid, home, done) {
  try {
    const nc = narrativeCiv(pid);
    chronicle({
      kind: "return", civ: nc.adj, people: 1,
      title: done
        ? msg("LOC_EMIG_HOMECOMING_DONE_TITLE", "Home At Last")
        : msg("LOC_EMIG_HOMECOMING_START_TITLE", "The Road Home"),
      body: done
        ? msg("LOC_EMIG_HOMECOMING_DONE", "The last of the people who fled {1_Home} are back.", home)
        : msg("LOC_EMIG_HOMECOMING_START",
          "{1_Home} is safe again, and the people who fled it have started coming home.", home),
      dedupeKey: "homecoming:" + pid + "|" + home + "|" + (done ? "done" : "start") + "|" + turnNow()
    });
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

/** Test seam: drop the in-memory state, so the next read loads it from the save again. */
export function _forgetHomecoming() {
  _state = null;
}
