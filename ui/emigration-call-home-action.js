// emigration-call-home-action.js
//
// The playable end of "call our people home" (emigration-call-home.js holds the rules and the odds). This binds
// them to the game: reads what the treasury can afford, charges Gold or Influence, moves the point home, keeps
// the per-civilization cooldown, writes the outcome to the Chronicle, and offers the whole thing as a dialog.
//
// The two currencies are offered side by side at the moment of the call rather than set once in Options: which
// one you can spare is a turn-by-turn question, and the choice is more interesting when it is asked then.
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { deduct } from "/emigration/ui/emigration-effects.js";
import { loc } from "/emigration/ui/emigration-loc.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";
import { chronicle } from "/emigration/ui/emigration-chronicle.js";
import { moveReturnees } from "/emigration/ui/emigration-return.js";
import { narrativeCiv } from "/emigration/ui/emigration-naming.js";
import {
  CALL_HOME_CURRENCY, CALL_HOME_SCOPE, callHomeCost, callHomeQuote, resolveCallHome
} from "/emigration/ui/emigration-call-home.js";

/** @type {Map<string, number>} Last turn a civilization called, by "pid|scope". */
const _lastCall = new Map();

/** @param {number} pid @param {string} scope @returns {string} The cooldown key. */
const cdKey = (pid, scope) => pid + "|" + scope;

/** @returns {number} The current turn, or 0. */
function turnNow() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Turns still to wait before this civilization may call again for this variant.
 * @param {number} pid Player id. @param {string} scope A CALL_HOME_SCOPE. @returns {number} Turns remaining.
 */
export function callHomeCooldownLeft(pid, scope) {
  const last = Number(_lastCall.get(cdKey(pid, scope)) || 0);
  if (!(last > 0)) return 0;
  const wait = Math.max(0, Number(CONFIG.callHomeCooldownTurns) || 0);
  return Math.max(0, wait - (turnNow() - last));
}

/** Test seam: forget every cooldown. */
export function _resetCallHomeCooldowns() {
  _lastCall.clear();
}

/**
 * What a civilization can currently spend of a currency, or Infinity when it cannot be read (off-engine, or
 * mid age-transition) so a failed read never silently blocks the call.
 * @param {number} pid Player id. @param {number} currency A CALL_HOME_CURRENCY. @returns {number} The balance.
 */
function affordFor(pid, currency) {
  try {
    const p = typeof Players !== "undefined" ? Players.get?.(pid) : null;
    return currency === CALL_HOME_CURRENCY.INFLUENCE
      ? balanceOf(p && p.DiplomacyTreasury, "diplomacyBalance", "getDiplomacyBalance")
      : balanceOf(p && p.Treasury, "goldBalance", "getGoldBalance");
  } catch (_) {
    // Players.get / the treasuries can be absent or throw mid age-transition.
    return Infinity;
  }
}

/**
 * Read a treasury balance through whichever accessor it offers, or Infinity when neither is there.
 * @param {*} treasury The treasury object. @param {string} field The value field.
 * @param {string} getter The getter name. @returns {number} The balance.
 */
function balanceOf(treasury, field, getter) {
  if (!treasury) return Infinity;
  if (typeof treasury[field] === "number") return treasury[field];
  if (typeof treasury[getter] === "function") return Number(treasury[getter]());
  return Infinity;
}

/**
 * Run one call for a civilization, charging the chosen currency and moving whoever comes.
 * @param {number} pid Player id. @param {string} scope A CALL_HOME_SCOPE.
 * @param {number} currency A CALL_HOME_CURRENCY.
 * @param {{move?:(pair:*)=>boolean}} [deps] Test seam for the mover.
 * @returns {{ok:boolean, reason:string, scope:string, paid:number, attempted:number, returned:number}} Result.
 */
export function callHomeNow(pid, scope, currency, deps) {
  const left = callHomeCooldownLeft(pid, scope);
  if (left > 0) return { ok: false, reason: "cooldown", scope, paid: 0, attempted: 0, returned: 0 };
  const yieldKey = currency === CALL_HOME_CURRENCY.INFLUENCE ? "YIELD_INFLUENCE" : "YIELD_GOLD";
  const result = resolveCallHome(pid, scope, currency, {
    turn: turnNow(),
    gameId: safeGameId(),
    afford: (c) => affordFor(pid, c),
    pay: (amount) => {
      if (amount <= 0) return true;
      try {
        deduct(pid, yieldKey, amount);
        return true;
      } catch (e) {
        dlog("call home: charge threw " + e);
        return false;
      }
    },
    move: (deps && deps.move) || ((pair) => movePointHome(pid, pair))
  });
  if (result.ok) {
    _lastCall.set(cdKey(pid, scope), turnNow());
    reportCall(pid, result);
  }
  return result;
}

/**
 * Move one point from where it fled back to the settlement it left.
 * @param {number} pid Player id. @param {*} pair The candidate pair. @returns {boolean} Whether it moved.
 */
function movePointHome(pid, pair) {
  try {
    const host = cityByName(pair.host, pair.from);
    const home = cityByName(pid, pair.home);
    if (!host || !home) return false;
    // The return module owns the actual transfer: it keeps the origin ledger, the pooled points and the
    // deferred tile abandonment straight, which this must not reimplement.
    return !!moveReturnees(host, home, "", pid).ok;
  } catch (e) {
    dlog("call home: move threw " + e);
    return false;
  }
}

/**
 * A player's settlement by name.
 * @param {number} owner Owner id. @param {string} name The settlement name. @returns {*} The city, or null.
 */
function cityByName(owner, name) {
  try {
    const cities = Players.get(owner)?.Cities?.getCities?.() || [];
    for (const c of cities) {
      const n = typeof Locale !== "undefined" ? Locale.compose(c.name) : c.name;
      if (n === name || c.name === name) return c;
    }
  } catch (_) {
    /* unreadable mid age-transition */
  }
  return null;
}

/** @returns {string} The game id, or "". */
function safeGameId() {
  try {
    return String(Configuration.getGame()?.gameGUIDHexString || "");
  } catch (_) {
    return "";
  }
}

/**
 * Write what the call achieved to the Chronicle, so the outcome is a recorded event and not just a number
 * that flickered past.
 * @param {number} pid Player id. @param {*} result The call result.
 */
function reportCall(pid, result) {
  try {
    const many = result.returned > 1;
    const body = loc(
      many ? "LOC_EMIG_CALLHOME_CHRON" : "LOC_EMIG_CALLHOME_CHRON_ONE",
      many
        ? "{1_Count} population points answered the call and came home."
        : "One population point answered the call and came home.",
      result.returned);
    const nc = narrativeCiv(pid);
    chronicle({
      kind: "return", civ: nc.adj, people: result.returned, body,
      title: loc("LOC_EMIG_CALLHOME_CHRON_TITLE", "They Answer The Call"),
      dedupeKey: "callhome:" + pid + "|" + result.scope + "|" + turnNow()
    });
  } catch (e) {
    dlog("call home: chronicle threw " + e);
  }
}

/**
 * The dialog offering the call: both currencies priced side by side, with the odds stated plainly so the
 * player knows a call brings at least one person and how many more to expect.
 * @param {number} pid Player id. @param {string} scope A CALL_HOME_SCOPE.
 * @returns {{eyebrow:string, title:string, body:string, dismissId:string, choices:*[]}|null} The view, or null.
 */
export function callHomeView(pid, scope) {
  const gold = callHomeQuote(pid, scope, CALL_HOME_CURRENCY.GOLD);
  if (gold.points <= 0) return null;
  const inflCost = callHomeCost(gold.points, scope, CALL_HOME_CURRENCY.INFLUENCE);
  const pct = Math.round(gold.chance * 100);
  const internal = scope === CALL_HOME_SCOPE.INTERNAL;
  return {
    eyebrow: loc("LOC_EMIG_CALLHOME_EYEBROW", "Call them home"),
    title: internal
      ? loc("LOC_EMIG_CALLHOME_TITLE_IN", "Call our people home")
      : loc("LOC_EMIG_CALLHOME_TITLE_EX", "Call our people back from abroad"),
    body: loc("LOC_EMIG_CALLHOME_BODY",
      "{1_Away} population points were driven out and have not come back. A call reaches up to {2_Points}: "
      + "about {3_Pct}% of them agree, and at least one always does. You pay only for those who come.",
      gold.available, gold.points, pct),
    dismissId: "no",
    choices: [
      { id: "gold", label: loc("LOC_EMIG_CALLHOME_PAY_GOLD", "Pay {1_Cost} Gold", gold.cost),
        note: loc("LOC_EMIG_CALLHOME_PAY_N", "Charged per point that comes home, not per attempt.") },
      { id: "influence", label: loc("LOC_EMIG_CALLHOME_PAY_INFL", "Spend {1_Cost} Influence", inflCost),
        note: loc("LOC_EMIG_CALLHOME_PAY_N", "Charged per point that comes home, not per attempt.") },
      { id: "no", label: loc("LOC_EMIG_CALLHOME_NO", "Leave them where they are"),
        note: loc("LOC_EMIG_CALLHOME_NO_N", "They may still drift home on their own in time.") }
    ]
  };
}

/**
 * Offer the call to the local player as a dialog.
 * @param {number} pid Player id. @param {string} scope A CALL_HOME_SCOPE. @returns {boolean} Whether it opened.
 */
export function offerCallHome(pid, scope) {
  if (!CONFIG.callHomeEnabled) return false;
  if (callHomeCooldownLeft(pid, scope) > 0) return false;
  const view = callHomeView(pid, scope);
  if (!view) return false;
  showDilemma(view, (id) => {
    if (id === "gold") callHomeNow(pid, scope, CALL_HOME_CURRENCY.GOLD);
    else if (id === "influence") callHomeNow(pid, scope, CALL_HOME_CURRENCY.INFLUENCE);
  });
  return true;
}
