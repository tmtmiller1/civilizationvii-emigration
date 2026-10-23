// emigration-call-home-action.js
//
// The playable end of "call our people home" (emigration-call-home.js holds the rules and the odds,
// emigration-call-home-view.js the dialog). This binds them to the game: reads what the treasury can
// afford, charges Gold or Influence, moves the point home, keeps the per-civilization cooldown, writes the
// outcome to the Chronicle, and offers the whole thing as a dialog.
//
// Leaving them where they are (the button, the dialog's close button or Escape) is remembered in the save: the
// people that dialog listed, pair by pair, are not offered again. A later offer lists only people displaced
// since, and a pair whose numbers fall (people drifted home on their own) is trimmed to what is left, so a
// pair that later grows again is offered for the newcomers alone. The console call lists everyone.
//
// The two currencies are offered side by side at the moment of the call rather than set once in Options: which
// one you can spare is a turn-by-turn question, and the choice is more interesting when it is asked then.
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { deduct, grantSigned } from "/emigration/ui/emigration-effects.js";
import { monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { msg } from "/emigration/ui/emigration-loc.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";
import { chronicle } from "/emigration/ui/emigration-chronicle.js";
import { moveReturnees } from "/emigration/ui/emigration-return.js";
import { narrativeCiv } from "/emigration/ui/emigration-naming.js";
import {
  CALL_HOME_CURRENCY, CALL_HOME_SCOPE, callHomeCandidates, callHomeQuote, pairKey, resolveCallHome
} from "/emigration/ui/emigration-call-home.js";
import { callHomeView, parseChoice } from "/emigration/ui/emigration-call-home-view.js";
import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";

/** The save key of each civilization's last call per variant, so a cooldown survives a save and load. */
const COOLDOWN_KEY = "EmigrationCallHomeCooldown_v1";
/** @type {Record<string, number>|null} Last turn a civilization called, by "pid|scope"; loaded on first use. */
let _lastCall = null;

/** @param {number} pid @param {string} scope @returns {string} */
const cdKey = (pid, scope) => pid + "|" + scope;

/**
 * The turn a cooldown is measured in: the mod's monotonic cross-age turn (emigration-migration-stats.js) once the
 * first pass has set it, else the game turn. The two agree within a turn in any game that has run a pass, and a
 * cooldown is only ever started after one.
 * @returns {number}
 */
function turnNow() {
  try {
    const mono = monoTurn();
    if (mono > 0) return mono;
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/** @returns {Record<string, number>} The cooldown map, loaded from the save on first use. */
function cooldowns() {
  resetCachesOnNewGame();
  if (!_lastCall) _lastCall = readCooldowns();
  return _lastCall;
}

/**
 * The stored cooldown map, cleaned: only "pid|scope" keys with a finite turn. Empty when unreadable, so every
 * cooldown then counts as over, as it did when the map lived in memory.
 * @returns {Record<string, number>}
 */
function readCooldowns() {
  /** @type {Record<string, number>} */ const out = {};
  const o = storedJson(COOLDOWN_KEY);
  if (!o) return out;
  for (const [k, v] of Object.entries(o)) {
    if (/^\d+\|/.test(k) && typeof v === "number" && isFinite(v)) out[k] = v;
  }
  return out;
}

/**
 * A JSON object stored under a game-configuration key, or null when missing, unreadable or not an object.
 * @param {string} key The configuration key. @returns {Record<string, *>|null}
 */
function storedJson(key) {
  try {
    const raw = Configuration?.getGame?.()?.getValue?.(key);
    const o = typeof raw === "string" && raw ? JSON.parse(raw) : null;
    return o && typeof o === "object" ? o : null;
  } catch (_) {
    return null;
  }
}

/** @param {number} pid @param {string} scope @param {number} turn The turn of the call. */
function noteCall(pid, scope, turn) {
  cooldowns()[cdKey(pid, scope)] = turn;
  try {
    Configuration?.editGame?.()?.setValue?.(COOLDOWN_KEY, JSON.stringify(_lastCall || {}));
  } catch (_) {
    /* unwritable mid age-transition; kept in memory */
  }
}

/**
 * Turns still to wait before this civilization may call again for this variant. A last call recorded after the
 * current turn (a save from a later point, loaded earlier) counts as over rather than blocking for an age.
 * @param {number} pid @param {string} scope A CALL_HOME_SCOPE. @returns {number} Turns remaining.
 */
export function callHomeCooldownLeft(pid, scope) {
  const last = Number(cooldowns()[cdKey(pid, scope)] || 0);
  if (!(last > 0)) return 0;
  const now = turnNow();
  if (last > now) return 0;
  const wait = Math.max(0, Number(CONFIG.callHomeCooldownTurns) || 0);
  return Math.max(0, wait - (now - last));
}

/** Test seam: forget every cooldown, in memory and in the save. */
export function _resetCallHomeCooldowns() {
  _lastCall = {};
  try {
    Configuration?.editGame?.()?.setValue?.(COOLDOWN_KEY, "{}");
  } catch (_) {
    /* off-engine */
  }
}

/** Test seam: drop the in-memory map only, as a reload does, so the next read comes from the save. */
export function _forgetCallHomeCooldownMemory() {
  _lastCall = null;
}

/** The save key of the people left where they are. */
const DECLINED_KEY = "EmigrationCallHomeDeclined_v1";
/** @type {Record<string, Record<string, number>>|null} Points left where they are, by "pid|scope", then pairKey. */
let _declined = null;
registerCacheReset(() => {
  _declined = null;
  _lastCall = null;
});

/** @param {*} pairs @returns {Record<string, number>} */
function cleanPairs(pairs) {
  /** @type {Record<string, number>} */
  const m = {};
  if (!pairs || typeof pairs !== "object") return m;
  for (const [pk, n] of Object.entries(pairs)) if (Number(n) > 0) m[pk] = Math.floor(Number(n));
  return m;
}

/** @returns {*} */
function readDeclined() {
  try {
    const raw = Configuration?.getGame?.()?.getValue?.(DECLINED_KEY);
    return typeof raw === "string" && raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/** @returns {Record<string, Record<string, number>>} */
function loadDeclined() {
  /** @type {Record<string, Record<string, number>>} */
  const clean = {};
  const o = readDeclined();
  if (o && typeof o === "object") for (const [k, pairs] of Object.entries(o)) clean[k] = cleanPairs(pairs);
  return clean;
}

/** @returns {Record<string, Record<string, number>>} */
function declinedStore() {
  resetCachesOnNewGame();
  if (!_declined) _declined = loadDeclined();
  return _declined;
}

function persistDeclined() {
  try {
    Configuration?.editGame?.()?.setValue?.(DECLINED_KEY, JSON.stringify(_declined || {}));
  } catch (_) {
    /* unwritable mid age-transition; kept in memory */
  }
}

/**
 * The people this civilization left where they are for this variant, trimmed against the live candidates: a
 * pair no longer listed is dropped, and one with fewer people than were left is cut to what is there, so only
 * people displaced afterward are offered again.
 * @param {number} pid @param {string} scope A CALL_HOME_SCOPE. @param {*[]} [flows] Flow rows (default live).
 * @returns {Record<string, number>} Points left where they are, by pairKey.
 */
export function callHomeDeclined(pid, scope, flows) {
  const store = declinedStore();
  const k = cdKey(pid, scope);
  const was = store[k] || {};
  const cands = callHomeCandidates(pid, flows);
  const live = scope === CALL_HOME_SCOPE.EXTERNAL ? cands.external : cands.internal;
  /** @type {Record<string, number>} */
  const now = {};
  for (const p of live) {
    const n = Math.min(Number(was[pairKey(p)]) || 0, p.points);
    if (n > 0) now[pairKey(p)] = n;
  }
  if (JSON.stringify(now) !== JSON.stringify(was)) {
    store[k] = now;
    persistDeclined();
  }
  return now;
}

/**
 * Remember that the player left these people where they are.
 * @param {number} pid @param {string} scope A CALL_HOME_SCOPE. @param {*[]} pairs The pairs the dialog listed.
 */
export function declineCallHome(pid, scope, pairs) {
  const store = declinedStore();
  const k = cdKey(pid, scope);
  const m = store[k] || {};
  for (const p of pairs || []) m[pairKey(p)] = (Number(m[pairKey(p)]) || 0) + Math.max(0, Number(p.points) || 0);
  store[k] = m;
  persistDeclined();
  dlog("call home: left " + (pairs || []).reduce((n, p) => n + p.points, 0) + " point(s) where they are (" + scope + ")");
}

/** Test seam: drop the in-memory record, so the next read loads it from the save again. */
export function _resetCallHomeDeclined() {
  _declined = null;
}

/**
 * What a civilization can currently spend of a currency, or Infinity when it cannot be read (off-engine, or
 * mid age-transition) so a failed read never silently blocks the call.
 * @param {number} pid @param {number} currency A CALL_HOME_CURRENCY. @returns {number}
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
 * @param {*} treasury @param {string} field The value field.
 * @param {string} getter The getter name. @returns {number}
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
 * @param {number} pid @param {string} scope A CALL_HOME_SCOPE.
 * @param {number} currency A CALL_HOME_CURRENCY.
 * @param {{want?:number, move?:(pair:*)=>boolean, declined?:Record<string, number>, flows?:*[],
 *   resolvable?:(pair:*)=>boolean, order?:(pairs:*[])=>*[]}} [deps] How many the player asked for (default: the
 *   per-call cap), test seams for the mover, the flow rows, the city check and the pair order, and the people left
 *   where they are (never moved by this call).
 * @returns {{ok:boolean, reason:string, scope:string, paid:number, attempted:number, returned:number}} Result.
 */
export function callHomeNow(pid, scope, currency, deps) {
  const left = callHomeCooldownLeft(pid, scope);
  if (left > 0) return { ok: false, reason: "cooldown", scope, paid: 0, attempted: 0, returned: 0 };
  const d = deps || /** @type {*} */ ({});
  const result = resolveCallHome(pid, scope, currency, {
    ...callEffects(pid, currency, d),
    turn: turnNow(), gameId: safeGameId(), want: d.want, declined: d.declined, flows: d.flows, order: d.order
  });
  if (result.ok || result.reason === "nobody-came") {
    noteCall(pid, scope, turnNow());
    reportCall(pid, result);
  }
  return result;
}

/**
 * The engine-side effects of a call: what the treasury can spend, the charge, the refund, the mover and the city
 * check, with the test seams in `d` taking the place of the mover and the check.
 * @param {number} pid @param {number} currency A CALL_HOME_CURRENCY.
 * @param {{move?:(pair:*)=>boolean, resolvable?:(pair:*)=>boolean}} d The seams.
 * @returns {*} The effects for resolveCallHome.
 */
function callEffects(pid, currency, d) {
  // Influence is YIELD_DIPLOMACY in the game's yield table; there is no YIELD_INFLUENCE, and charging that
  // key is a silent no-op.
  const yieldKey = currency === CALL_HOME_CURRENCY.INFLUENCE ? "YIELD_DIPLOMACY" : "YIELD_GOLD";
  return {
    afford: (/** @type {number} */ c) => callHomeBalance(pid, c),
    pay: (/** @type {number} */ amount) => {
      if (amount <= 0) return true;
      try {
        deduct(pid, yieldKey, -amount);
        return true;
      } catch (e) {
        dlog("call home: charge threw " + e);
        return false;
      }
    },
    move: d.move || ((/** @type {*} */ pair) => movePointHome(pid, pair)),
    resolvable: d.resolvable || callHomeResolvable(pid),
    refund: (/** @type {number} */ amount) => refundFee(pid, yieldKey, amount)
  };
}

/**
 * Give a fee back after a paid call that moved nobody (the dice said yes, the move failed): the same signed grant
 * the charge went through, so the two net to nothing. Never throws.
 * @param {number} pid @param {string} yieldKey "YIELD_GOLD" or "YIELD_DIPLOMACY". @param {number} amount The fee.
 */
function refundFee(pid, yieldKey, amount) {
  try {
    grantSigned(pid, yieldKey, amount);
  } catch (e) {
    dlog("call home: refund threw " + e);
  }
}

/**
 * Whether a candidate pair's two cities still exist under the owners the flow ledger names: the host city under
 * the host, the home city under the caller. A city that changed hands or was razed since the people fled fails it
 * (watched 2026-10-23: Greece paid for three people in Chalkís after Goryeo had taken it, and nobody moved). Off
 * the engine there are no cities to check, so every pair passes.
 * @param {number} pid The caller. @returns {(pair:*)=>boolean} The test, for a quote's `resolvable`.
 */
export function callHomeResolvable(pid) {
  if (typeof Players === "undefined") return () => true;
  return (pair) => !!(pair && cityByName(pair.host, pair.from) && cityByName(pid, pair.home));
}

/**
 * Move one point from where it fled back to the settlement it left.
 * @param {number} pid @param {*} pair The candidate pair. @returns {boolean} Whether it moved.
 */
export function movePointHome(pid, pair) {
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

/** @param {number} owner @param {string} name @returns {*} */
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

/** @returns {string} */
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
 * @param {number} pid @param {*} result The call result.
 */
function reportCall(pid, result) {
  try {
    const nc = narrativeCiv(pid);
    const answered = result.returned > 0;
    const many = result.returned > 1;
    const body = answered
      ? msg(many ? "LOC_EMIG_CALLHOME_CHRON" : "LOC_EMIG_CALLHOME_CHRON_ONE",
        many
          ? "{1_Count} population points answered the call and came home."
          : "One population point answered the call and came home.",
        result.returned)
      : msg("LOC_EMIG_CALLHOME_CHRON_NONE", "The call went out to our people abroad, and none of them came.");
    chronicle({
      kind: "return", civ: nc.adj, people: result.returned, body,
      title: answered
        ? msg("LOC_EMIG_CALLHOME_CHRON_TITLE", "They Answer The Call")
        : msg("LOC_EMIG_CALLHOME_CHRON_NONE_TITLE", "The Call Goes Unanswered"),
      dedupeKey: "callhome:" + pid + "|" + result.scope + "|" + turnNow()
    });
  } catch (e) {
    dlog("call home: chronicle threw " + e);
  }
}

/**
 * Offer the call to the local player as a dialog. Internal: a ladder of sizes per currency, each a purchase.
 * External: one roll per currency. People the player already left where they are are not listed, and
 * leaving these ones adds them to that record.
 * @param {number} pid @param {string} scope A CALL_HOME_SCOPE.
 * @param {{includeDeclined?:boolean, flows?:*[], show?:(view:*, onChoice:(id:string)=>void)=>void,
 *   move?:(pair:*)=>boolean, resolvable?:(pair:*)=>boolean}} [opts] List everyone, declined or not (the console
 *   call); test seams for the flow rows, the dialog, the mover and the city check.
 * @returns {boolean} Whether it opened.
 */
export function offerCallHome(pid, scope, opts) {
  if (!CONFIG.callHomeEnabled) return false;
  if (callHomeCooldownLeft(pid, scope) > 0) return false;
  const o = opts || {};
  const declined = o.includeDeclined ? {} : callHomeDeclined(pid, scope, o.flows);
  const resolvable = o.resolvable || callHomeResolvable(pid);
  const view = callHomeView(pid, scope, {
    afford: (c) => callHomeBalance(pid, c), seed: "callhome|" + scope + "|" + turnNow(), declined,
    flows: o.flows, resolvable
  });
  if (!view) return false;
  const shown = callHomeQuote(pid, scope, CALL_HOME_CURRENCY.GOLD, o.flows, { declined, resolvable }).pairs;
  (o.show || showDilemma)(view, (id) => {
    // A grayed-out size can never be bought, even if an input path slipped past the dialog's own guard.
    if (view.choices.some((c) => c.id === id && c.disabled)) return;
    const pick = parseChoice(id);
    if (pick) {
      callHomeNow(pid, scope, pick.currency, { want: pick.want, declined, flows: o.flows, move: o.move, resolvable });
    }
    else declineCallHome(pid, scope, shown);
  });
  return true;
}
