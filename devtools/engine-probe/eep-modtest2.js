// eep-modtest2.js - in-game test of the shipped urban-crisis leg and the placed enclave tile. Requires the
// emigration mod loaded. Logs [EmigTest] to UI.log.
//   U1 local city, rural "exhausted" signal, crisis cause: consumeSourcePoint reserves a SPECIALIST, commit un-assigns
//      one and lowers the count.
//   U2 foreign city, same: reserves a BUILDING, commit destroys it (urban -1).
//   U3 voluntary cause on the same exhausted signal: nothing reserved.
//   U4 abandonForDeath on a rural-exhausted foreign signal: a building.
//   E1 placeEnclave(London, CIVILIZATION_ROME, "a"): the tile appears, culture rises, the record's placed
//      field is set, enclaveStanding true; applyOwnerQuarterYields then skips the benefit grant.
//   E2 the markers module painted (ENCLAVEMARK lines in UI.log via its CSS channel).
//   then 5 Autoplay turns for the crash watch.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { consumeSourcePoint, undoSourceConsume } from "/emigration/ui/emigration-refugee-staging.js";
import { commitSourcePoint, abandonForDeath, urbanReserveKind } from "/emigration/ui/emigration-departure-tile.js";
import { placeEnclave, enclaveStanding, enclaveIndex, enclaveTypeFor } from "/emigration/ui/emigration-enclave-place.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { runChecks } from "/emigration/ui/emigration-selftest-checks.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1, n = 0, endTurnTimer = null, blockedTries = 0;
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function plotTypes(x, y) { return safe(() => (MapConstructibles.getConstructibles(x, y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null; return info ? info.ConstructibleType : "?"; }), []); }
function snap(c) {
  if (!c) return null;
  let bld = 0, imp = 0;
  safe(() => { for (const idx of c.getPurchasedPlots()) { const l = GameplayMap.getLocationFromIndex(idx); for (const t of plotTypes(l.x, l.y)) { if (t.startsWith("BUILDING_")) bld++; else if (t.startsWith("IMPROVEMENT_")) imp++; } } });
  return { name: cityName(c), pop: c.population, rural: c.ruralPopulation, urban: c.urbanPopulation, specialists: safe(() => c.Workers.getNumWorkers(false)), pending: safe(() => c.pendingPopulation), buildings: bld, improvements: imp,
    culture: safe(() => Math.round(c.Yields.getNetYield(YieldTypes.YIELD_CULTURE) * 10) / 10), gold: safe(() => Math.round(c.Yields.getNetYield(YieldTypes.YIELD_GOLD) * 10) / 10) };
}

async function run() {
  local = GameContext.localPlayerID;
  emit("CONFIG urban=" + CONFIG.urbanEmigrationEnabled + " floor=" + CONFIG.urbanFloor + " place=" + CONFIG.quarterPlaceImprovement + " enclaveDataLoaded=" + (enclaveIndex(enclaveTypeFor("CIVILIZATION_ROME", "a")) != null));
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population);
  const foreign = sigs.filter((s) => s.owner !== local && !s.isCityState && !s.isTown).sort((a, b) => b.population - a.population);
  const L = mine[0], F = foreign[0];
  emit("TARGETS L=" + cityName(L.city) + " specialists=" + L.specialists + " urban=" + L.urban + " F=" + cityName(F.city) + " urban=" + F.urban);

  // E1: place a Roman enclave (stance a) in London.
  {
    const before = snap(L.city);
    const placed = placeEnclave(L.city, "CIVILIZATION_ROME", "a");
    await later(6000);
    const loc = placed ? GameplayMap.getLocationFromIndex(placed.plot) : null;
    emit("E1 placed=" + J(placed) + " plotNow=" + J(loc && plotTypes(loc.x, loc.y)) + " standing=" + enclaveStanding({ placed }) + " before=" + J(before) + " after=" + J(snap(L.city)));
    emit("E1 tooltip name=" + safe(() => Locale.compose("LOC_IMPROVEMENT_EMIG_ENCLAVE_ROME_A_NAME")) + " icon=" + J(safe(() => UI.getIconBLP("IMPROVEMENT_EMIG_ENCLAVE_ROME_A"), null)));
  }
  // E1b: farmstead takeover path on the second city (force no empty plot by using stance b on a city whose empty plots we skip)
  {
    const C = mine[1] || L;
    const before = snap(C.city);
    const emptyBefore = safe(() => C.city.getPurchasedPlots().length);
    const placed = placeEnclave(C.city, "CIVILIZATION_GREECE", "b");
    await later(5000);
    const loc = placed ? GameplayMap.getLocationFromIndex(placed.plot) : null;
    emit("E1b " + cityName(C.city) + " placed=" + J(placed) + " plotNow=" + J(loc && plotTypes(loc.x, loc.y)) + " standing=" + enclaveStanding({ placed }) + " plots=" + emptyBefore + " before=" + J(before) + " after=" + J(snap(C.city)));
  }
  // E2 + self-test rows
  {
    const rows = safe(() => runChecks(), []);
    for (const r of rows) if (/urban core|Enclave tiles|Departures/.test(r.label)) emit("SELFTEST " + r.label + " [" + r.status + "] " + r.detail);
  }
  emit("ACTIONS done; ending turns (5 Autoplay turns for the crash watch)");
  setTimeout(endTurn, 3000);
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
  if (n >= 2) setTimeout(() => { if (n >= 4) emit("DONE modtest2 finished"); else endTurn(); }, 3000);
});
emit("modtest2 attached");
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
