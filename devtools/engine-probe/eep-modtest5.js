// eep-modtest5.js - the remaining unobserved claims, on the AugustusAnt136 save (Antiquity turn 136).
// Logs [EmigTest] to UI.log; "SHOT <name>" lines ask the runner to take a screenshot.
//   A1 famine ordering after the yield-table fix: London's pick with and without the starving hint.
//   A2 pillaged-first: scan every met city for a pillaged improvement; commit one war departure there and
//      watch which tile goes (expect the pillaged one), plus that owner's treasury before/after.
//   A3 cross-civ departure gold: commit one war departure from the largest AI city; its owner's treasury
//      before/after (expect -10).
//   A4 treasury floor: drain the local treasury to 5 gold, charge twice (expect 5 then 0), restore.
//   A5 urban crisis cap blocks a SECOND building with per-turn room: cap 1%, take one, expect refusal now
//      and next turn; lifting the cap re-allows it.
//   A6 enclave placed in London, camera on it, screenshot "enclave-marker".
//   next turn: A5 recheck; A7 arrival prompt (ask mode) with screenshot "arrival-prompt"; DONE.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import {
  listDepartureTiles, findDepartureTile, findDepartureBuilding, chargeDepartureGold, urbanCrisisBudget,
  urbanReserveKind, takeUrbanPoint, commitSourcePoint
} from "/emigration/ui/emigration-departure-tile.js";
import { consumeSourcePoint } from "/emigration/ui/emigration-refugee-staging.js";
import { placeEnclave, enclaveStanding } from "/emigration/ui/emigration-enclave-place.js";
import { arriveRural, flushArrivalPlacements } from "/emigration/ui/emigration-arrival-placement.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1, n = 0, endTurnTimer = null, blockedTries = 0;
let capCity = null, L = null;
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function treasury(pid) { return safe(() => Math.round(Players.get(pid).Treasury.goldBalance * 100) / 100, null); }
function plotTypes(idx) { return safe(() => { const l = GameplayMap.getLocationFromIndex(idx); return (MapConstructibles.getConstructibles(l.x, l.y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null; return (info ? info.ConstructibleType : "?") + (i && i.damaged ? "(dmg)" : ""); }); }, []); }
function tileBrief(t) { return { type: t.type, plot: t.plot, dmg: !!t.damaged, feeds: !!t.feeds, res: t.onResource, d: t.distance }; }

async function departFrom(sig, label) {
  const owner = sig.owner;
  const pickBefore = findDepartureTile(sig.city);
  const goldBefore = treasury(owner);
  const consumed = consumeSourcePoint(sig, "war");
  const commit = consumed.ok ? commitSourcePoint(sig, consumed) : null;
  await later(5000);
  emit(label + " " + cityName(sig.city) + " owner=" + owner + " pick=" + J(pickBefore && tileBrief(pickBefore)) + " consumed=" + J(consumed) + " commit=" + J(commit) +
    " plotNow=" + J(pickBefore && plotTypes(pickBefore.plot)) + " gold " + goldBefore + " -> " + treasury(owner));
}

async function run() {
  local = GameContext.localPlayerID;
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population);
  const foreign = sigs.filter((s) => s.owner !== local && !s.isCityState && !s.isTown).sort((a, b) => b.population - a.population);
  L = mine[0];
  const F = foreign[0], F2 = foreign[1] || foreign[0];
  emit("START turn=" + safe(() => Game.turn) + " L=" + cityName(L.city) + " F=" + cityName(F.city) + " F2=" + cityName(F2.city) + " met cities=" + sigs.length);

  // A1 famine ordering
  {
    const plain = findDepartureTile(L.city), famine = findDepartureTile(L.city, { avoidFood: true });
    emit("A1 " + cityName(L.city) + " pick=" + (plain && plain.type) + " pickUnderFamine=" + (famine && famine.type) + " tiles=" + J(listDepartureTiles(L.city).map((t) => t.type + (t.feeds ? "*" : ""))) + " (* = feeds)");
  }
  // A2 pillaged-first
  {
    let hit = null;
    for (const s of sigs) {
      const dmg = listDepartureTiles(s.city).filter((t) => t.damaged);
      if (dmg.length) { hit = { s, dmg }; if (s.owner !== local) break; }
    }
    if (!hit) emit("A2 no pillaged improvement in any of the " + sigs.length + " met cities; pillaged-first not exercisable on this save");
    else {
      emit("A2 " + cityName(hit.s.city) + " owner=" + hit.s.owner + " pillaged=" + J(hit.dmg.map(tileBrief)) + " rural=" + hit.s.rural);
      await departFrom(hit.s, "A2 depart");
    }
  }
  // A3 cross-civ gold
  await departFrom(F, "A3 depart");
  // A4 treasury floor
  {
    const orig = treasury(local);
    safe(() => Players.grantYield(local, YieldTypes.YIELD_GOLD, -(orig - 5)));
    await later(3000);
    const drained = treasury(local);
    const c1 = chargeDepartureGold(local), c2 = chargeDepartureGold(local);
    await later(3000);
    const after = treasury(local);
    safe(() => Players.grantYield(local, YieldTypes.YIELD_GOLD, orig - after));
    emit("A4 treasury " + orig + " drained to " + drained + " charged=" + J([c1, c2]) + " after=" + after + " (expect 5,0 and 0) restored");
  }
  // A5 urban crisis cap
  {
    CONFIG.maxUrbanLossPerCityPerTurn = 5; CONFIG.urbanLossCapPct = 0.01;
    capCity = F2;
    const src = { ...F2, rural: 0 };
    const b0 = urbanCrisisBudget(F2.city), k0 = urbanReserveKind(src);
    const took = k0 === "building" ? takeUrbanPoint(F2.city, "building") : null;
    await later(4000);
    emit("A5 " + cityName(F2.city) + " urban=" + F2.city.urbanPopulation + " budget=" + b0 + " kind=" + k0 + " took=" + J(took) + " budgetNow=" + urbanCrisisBudget(F2.city) + " kindNow=" + urbanReserveKind(src) + " nextBuilding=" + J(safe(() => { const x = findDepartureBuilding(F2.city); return x && x.type; })) + " (expect 1, building, taken, 0, null, a building still available)");
  }
  // A6 enclave + screenshot
  {
    const r = placeEnclave(L.city, "CIVILIZATION_ROME", "a");
    await later(5000);
    const loc = r ? GameplayMap.getLocationFromIndex(r.plot) : L.city.location;
    emit("A6 enclave " + J(r) + " standing=" + enclaveStanding({ placed: r }) + " camera=" + safe(() => { Camera.lookAtPlot(loc, { instantaneous: true }); return "ok"; }));
    await later(4000);
    emit("SHOT enclave-marker");
    await later(8000);
  }
  emit("ACTIONS done; ending the turn");
  setTimeout(endTurn, 2000);
}

async function nextTurn() {
  // A5 recheck
  {
    const src = { ...capCity, rural: 0 };
    const stillBlocked = urbanReserveKind(src);
    CONFIG.urbanLossCapPct = 1;
    const lifted = urbanReserveKind(src);
    CONFIG.urbanLossCapPct = 0.34; CONFIG.maxUrbanLossPerCityPerTurn = 1;
    emit("A5 next turn " + cityName(capCity.city) + " kindWithCap=" + stillBlocked + " kindCapLifted=" + lifted + " (expect null, building)");
  }
  // A7 arrival prompt
  {
    CONFIG.arrivalPlacement = 2;
    const ok = arriveRural(L.city);
    flushArrivalPlacements();
    await later(3000);
    safe(() => Camera.lookAtPlot(L.city.location, { instantaneous: true }));
    emit("A7 arrival " + cityName(L.city) + " arriveRural=" + J(ok) + " dialogOpen=" + safe(() => DialogBoxManager.isDialogBoxOpen(), "n/a") + " pending=" + safe(() => L.city.pendingPopulation));
    await later(2000);
    emit("SHOT arrival-prompt");
    await later(8000);
  }
  emit("DONE modtest5 finished");
}

function endTurn() {
  try {
    const me = Players.get(local);
    if (!me.isTurnActive || GameContext.hasSentTurnComplete()) return;
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      if (blockedTries >= 3 && typeof Autoplay !== "undefined") { safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); }); blockedTries = 0; endTurnTimer = setTimeout(endTurn, 30000); return; }
      endTurnTimer = setTimeout(endTurn, 4000); return;
    }
    safe(() => UI.Player.deselectAllUnits()); GameContext.sendTurnComplete();
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}
engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player); if (who !== GameContext.localPlayerID) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0;
  emit("TURN activated n=" + n + " turn=" + safe(() => Game.turn) + " ALIVE");
  if (n === 2) setTimeout(() => nextTurn().catch((e) => emit("nextTurn threw " + e + " " + (e && e.stack))), 4000);
});
emit("modtest5 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { n = 1; run().catch((e) => emit("run threw " + e + " " + (e && e.stack))); }, 8000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
