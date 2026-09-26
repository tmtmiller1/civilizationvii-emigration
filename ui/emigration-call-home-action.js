// emigration-call-home-action.js
//
// The playable end of "call our people home" (emigration-call-home.js holds the rules and the odds,
// emigration-call-home-view.js the dialog). This binds them to the game: reads what the treasury can
// afford, charges Gold or Influence, moves the point home, keeps the per-civilization cooldown, writes the
// outcome to the Chronicle, and offers the whole thing as a dialog.
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
import { CALL_HOME_CURRENCY, resolveCallHome } from "/emigration/ui/emigration-call-home.js";
import { callHomeView, parseChoice } from "/emigration/ui/emigration-call-home-view.js";

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
export function callHomeBalance(pid, currency) {
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
 * Run one call for a civilization, charging the chosen currency and moving whoever comes. Any resolved call,
 * answered or not, starts the cooldown: an external call the dice refused cannot be repeated next turn.
 * @param {number} pid Player id. @param {string} scope A CALL_HOME_SCOPE.
 * @param {number} currency A CALL_HOME_CURRENCY.
 * @param {{want?:number, move?:(pair:*)=>boolean}} [deps] How many the player asked for (default: the
 *   per-call cap), and a test seam for the mover.
 * @returns {{ok:boolean, reason:string, scope:string, paid:number, attempted:number, returned:number}} Result.
 */
export function callHomeNow(pid, scope, currency, deps) {
  const left = callHomeCooldownLeft(pid, scope);
  if (left > 0) return { ok: false, reason: "cooldown", scope, paid: 0, attempted: 0, returned: 0 };
  // Influence is YIELD_DIPLOMACY in the game's yield table; there is no YIELD_INFLUENCE, and charging that
  // key is a silent no-op.
  const yieldKey = currency === CALL_HOME_CURRENCY.INFLUENCE ? "YIELD_DIPLOMACY" : "YIELD_GOLD";
  const result = resolveCallHome(pid, scope, currency, {
    turn: turnNow(),
    gameId: safeGameId(),
    want: deps && deps.want,
    afford: (c) => callHomeBalance(pid, c),
    pay: (amount) => {
      if (amount <= 0) return true;
      try {
        deduct(pid, yieldKey, -amount);
        return true;
      } catch (e) {
        dlog("call home: charge threw " + e);
        return false;
      }
    },
    move: (deps && deps.move) || ((pair) => movePointHome(pid, pair))
  });
  if (result.ok || result.reason === "nobody-came") {
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
 * that flickered past. An external call nobody answered is recorded too: the player asked, and the answer
 * was no.
 * @param {number} pid Player id. @param {*} result The call result.
 */
function reportCall(pid, result) {
  try {
    const nc = narrativeCiv(pid);
    const answered = result.returned > 0;
    const many = result.returned > 1;
    const body = answered
      ? loc(many ? "LOC_EMIG_CALLHOME_CHRON" : "LOC_EMIG_CALLHOME_CHRON_ONE",
        many
          ? "{1_Count} population points answered the call and came home."
          : "One population point answered the call and came home.",
        result.returned)
      : loc("LOC_EMIG_CALLHOME_CHRON_NONE", "The call went out to our people abroad, and none of them came.");
    chronicle({
      kind: "return", civ: nc.adj, people: result.returned, body,
      title: answered
        ? loc("LOC_EMIG_CALLHOME_CHRON_TITLE", "They Answer The Call")
        : loc("LOC_EMIG_CALLHOME_CHRON_NONE_TITLE", "The Call Goes Unanswered"),
      dedupeKey: "callhome:" + pid + "|" + result.scope + "|" + turnNow()
    });
  } catch (e) {
    dlog("call home: chronicle threw " + e);
  }
}

/**
 * Offer the call to the local player as a dialog. Internal: a ladder of sizes per currency, each a purchase.
 * External: one roll per currency.
 * @param {number} pid Player id. @param {string} scope A CALL_HOME_SCOPE. @returns {boolean} Whether it opened.
 */
export function offerCallHome(pid, scope) {
  if (!CONFIG.callHomeEnabled) return false;
  if (callHomeCooldownLeft(pid, scope) > 0) return false;
  const view = callHomeView(pid, scope, {
    afford: (c) => callHomeBalance(pid, c), seed: "callhome|" + scope + "|" + turnNow()
  });
  if (!view) return false;
  showDilemma(view, (id) => {
    // A grayed-out size can never be bought, even if an input path slipped past the dialog's own guard.
    if (view.choices.some((c) => c.id === id && c.disabled)) return;
    const pick = parseChoice(id);
    if (pick) callHomeNow(pid, scope, pick.currency, { want: pick.want });
  });
  return true;
}
