// eep-modtest137.js - why does a call for 3 hand the player fewer tiles to place?
//
// The user's report (2026-09-17): "I click 'bring 3 home' and it only lets me set 2 rural tiles, even for
// internal events." Two explanations fit that, and only a real call can tell them apart:
//   A. UNDER-DELIVERY. One of the three transfers fails (the source has no rural point left to give), so the
//      fee was charged for 3 and only 2 points ever arrived. That is an overcharge bug.
//   B. SPLIT PLACEMENT. All three arrive, but the mod's own automatic placement (arriveRural is called with no
//      origin, so asksAbout() falls to arrivalAskReturnees, which is OFF by default → autoPlace) seats some of
//      them itself and leaves the rest as pendingPopulation, which the GAME then prompts for. The player is
//      asked for fewer tiles than they paid for, but nobody is missing. That is a clarity bug, not a theft.
//
// This runs ONE real internal call for 3 on the live save with the real transfer path, logging every step:
//   • the quote, and what each individual moveReturnees returned
//   • the source and destination population / rural / pendingPopulation after every single move
//   • the destination's pendingPopulation before and after the 250ms arrival flush, which is what decides how
//     many tiles the player is handed
//   • the result's paid / attempted / returned
// A: returned < 3 with the bill still for 3. B: returned == 3, pending drops at the flush, leftovers prompt.
//
// It SPENDS GOLD in the loaded autosave. Nothing is written back to disk (the harness quits the game), and the
// save file is untouched.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { CALL_HOME_CURRENCY, CALL_HOME_SCOPE, callHomeCost, callHomeQuote } from "/emigration/ui/emigration-call-home.js";
import { callHomeNow, callHomeBalance, _resetCallHomeCooldowns } from "/emigration/ui/emigration-call-home-action.js";
import { moveReturnees } from "/emigration/ui/emigration-return.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";

const TAG = "[EmigTest]";
const WANT = 3;
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }

/** Population, rural and the unplaced-point counter for one city. */
function snap(city) {
  return safe(() => ({
    name: cityName(city),
    pop: city.population,
    rural: safe(() => city.Population?.ruralPopulation, "?"),
    urban: safe(() => city.urbanPopulation, "?"),
    pending: safe(() => city.pendingPopulation, "?")
  }));
}

/** A player's city by display name. */
function cityByName(owner, name) {
  return safe(() => {
    for (const c of (Players.get(owner)?.Cities?.getCities?.() || [])) {
      if (cityName(c) === name || c.name === name) return c;
    }
    return null;
  }, null);
}

function dialog() { const all = Array.from(document.querySelectorAll("screen-dialog-box")); return all[all.length - 1] || null; }
async function clearDialogs(label) {
  for (let i = 0; i < 4 && dialog(); i++) {
    const d = dialog();
    emit(label + " clearing queued dialog " + J(safe(() => d.getAttribute("title"))));
    const btns = Array.from(d.querySelectorAll("fxs-button"));
    const last = btns[btns.length - 1];
    if (last) safe(() => last.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    await later(2500);
  }
}

async function run() {
  const local = GameContext.localPlayerID;
  _resetCallHomeCooldowns();
  await clearDialogs("S0");
  emit("S0 turn=" + safe(() => Game.turn) + " local=" + local
    + " placementMode=" + CONFIG.arrivalPlacement + " askReturnees=" + CONFIG.arrivalAskReturnees
    + " preferSpecialists=" + CONFIG.arrivalPreferSpecialists
    + " gold=" + callHomeBalance(local, CALL_HOME_CURRENCY.GOLD));

  const quote = callHomeQuote(local, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD, undefined, WANT);
  emit("S1 quote available=" + quote.available + " points=" + quote.points + " chance=" + quote.chance
    + " cost=" + callHomeCost(quote.points, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD)
    + " pairs=" + J(quote.pairs.map((p) => p.points + " from " + p.from + " back to " + p.home)));
  if (quote.points <= 0) { emit("S1 nothing callable; stopping"); emit("DONE modtest137 finished"); return; }

  // The cities the first pair names: watched point by point through the whole call.
  const pair0 = quote.pairs[0];
  const host0 = cityByName(local, pair0.from);
  const home0 = cityByName(local, pair0.home);
  emit("S2 before: host=" + J(snap(host0)) + " home=" + J(snap(home0)));

  // The real transfer path (movePointHome does exactly this), with each attempt logged.
  let n = 0;
  const move = (pair) => {
    n++;
    const host = cityByName(local, pair.from);
    const home = cityByName(local, pair.home);
    if (!host || !home) { emit("S3 move#" + n + " CITY NOT FOUND " + pair.from + " / " + pair.home); return false; }
    const r = safe(() => moveReturnees(host, home, "", local), { ok: false, err: true });
    emit("S3 move#" + n + " " + pair.from + "->" + pair.home + " result=" + J(r)
      + " host=" + J(snap(host)) + " home=" + J(snap(home)));
    return !!(r && r.ok);
  };

  const before = callHomeBalance(local, CALL_HOME_CURRENCY.GOLD);
  const result = callHomeNow(local, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD, { want: WANT, move });
  const after = callHomeBalance(local, CALL_HOME_CURRENCY.GOLD);
  emit("S4 result=" + J(result) + " asked=" + WANT + " goldBefore=" + before + " goldAfter=" + after
    + " goldSpent=" + (before - after));
  emit("S4 immediately after (flush not yet run): home=" + J(snap(home0)));

  // The 250ms flush is what seats points automatically or hands them to the player.
  await later(4000);
  emit("S5 after the arrival flush: host=" + J(snap(host0)) + " home=" + J(snap(home0)));
  const d = dialog();
  emit("S5 a dialog is up=" + !!d + " title=" + J(d && safe(() => d.getAttribute("title"))));
  emit("SHOT after-call");
  await later(9000);

  // Give the engine a few seconds more in case it raises its own Grow City prompt for leftovers.
  await later(5000);
  emit("S6 later: home=" + J(snap(home0)) + " dialogUp=" + !!dialog());
  emit("S6 VERDICT asked=" + WANT + " returned=" + result.returned + " paid=" + result.paid
    + " pendingLeft=" + J(safe(() => home0.pendingPopulation)));
  emit("DONE modtest137 finished");
}

emit("modtest137 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest137 finished"); }); }, 12000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
