// eep-modtest6.js - enclave tiles across the age transition, with the placements PERSISTED so the
// post-transition script reload can find them, plus fresh placements in the new age. Loads
// the latest surviving Antiquity save (AugustusAnt169; the turn-158 autosave was rotated out) and Autoplays
// up to 30 turns to reach the age end. Logs [EmigTest] to UI.log.
//   Phase 1 (Antiquity): place London (ROME a) + Paris (GREECE b); store plots in GameConfiguration;
//            Autoplay 6 turns through the transition.
//   Phase 2 (Exploration, after the UI reload): does the stored record survive? do the tiles stand?
//            Fresh placement on turn 1 (repeat of the earlier failure) and again on turn >= 2 (London,
//            ROME b, and a second AI city, GREECE a); standing checks every turn; Autoplay 6 turns; DONE.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { placeEnclave, enclaveStanding, enclaveIndex, enclaveTypeFor, emptyPlotsOf } from "/emigration/ui/emigration-enclave-place.js";
import { urbanCrisisBudget, urbanReserveKind, takeUrbanPoint } from "/emigration/ui/emigration-departure-tile.js";
import { arriveRural, flushArrivalPlacements } from "/emigration/ui/emigration-arrival-placement.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";

const TAG = "[EmigTest]";
const KEY = "EmigProbe_Plots";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1, n = 0, triedLate = false, done = false, capSrc = null, mineTop = null;
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function ageName() { return safe(() => GameInfo.Ages.lookup(Game.age).AgeType, "?"); }
function plotTypes(idx) { return safe(() => { const l = GameplayMap.getLocationFromIndex(idx); return (MapConstructibles.getConstructibles(l.x, l.y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null; return info ? info.ConstructibleType : "?"; }); }, []); }
function readStored() { return safe(() => { const v = Configuration.getGame().getValue(KEY); return typeof v === "string" && v ? JSON.parse(v) : null; }, null); }
function writeStored(o) { return safe(() => { Configuration.editGame().setValue(KEY, JSON.stringify(o)); return true; }, false); }
let placed = [];
function report(tag) {
  for (const p of placed) emit(tag + " " + p.city + " " + p.placed.type + " plot " + p.placed.plot + " standing=" + enclaveStanding(p) + " plotNow=" + J(plotTypes(p.placed.plot)));
}
async function tryPlace(sig, civ, opt, label) {
  if (!sig) { emit(label + " no city"); return; }
  const empties = emptyPlotsOf(sig.city).length;
  const r = placeEnclave(sig.city, civ, opt);
  await later(6000);
  emit(label + " " + cityName(sig.city) + " owner=" + sig.owner + " emptyPlots=" + empties + " -> " + J(r) + " standing=" + (r ? enclaveStanding({ placed: r }) : "n/a") + " plotNow=" + J(r ? plotTypes(r.plot) : null));
  if (r && enclaveStanding({ placed: r })) placed.push({ city: cityName(sig.city), placed: r });
  return r;
}
function autoplay(turns) { safe(() => { Autoplay.setTurns(turns); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); }, null); }

async function run() {
  local = GameContext.localPlayerID;
  const stored = readStored();
  const age = ageName();
  emit("START turn=" + safe(() => Game.turn) + " age=" + age + " stored=" + J(stored) + " dataLoaded=" + (enclaveIndex(enclaveTypeFor("CIVILIZATION_ROME", "a")) != null));
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population);
  const foreign = sigs.filter((s) => s.owner !== local && !s.isCityState && !s.isTown).sort((a, b) => b.population - a.population);
  if (age !== "AGE_EXPLORATION") {
    // Phase 1
    const r = await tryPlace(mine[0], "CIVILIZATION_ROME", "a", "P1 place");
    await tryPlace(foreign[0], "CIVILIZATION_GREECE", "b", "P1 place");
    emit("P1 stored=" + writeStored(placed) + " readback=" + J(readStored()));
    // Screenshot of the placed enclave (camera on the tile; the runner activates the game window first).
    if (r) { safe(() => Camera.lookAtPlot(GameplayMap.getLocationFromIndex(r.plot), { instantaneous: true })); await later(3000); emit("SHOT enclave-marker"); await later(10000); }
    // Urban crisis cap across turns: 1% cap, take one building from the second AI city, then watch whether the
    // config override and the block survive the turn changes before the transition (the earlier recheck was
    // inconclusive because the mod re-reads its options at turn start).
    capSrc = { ...(foreign[1] || foreign[0]), rural: 0 };
    CONFIG.maxUrbanLossPerCityPerTurn = 5; CONFIG.urbanLossCapPct = 0.01;
    emit("P1 cap " + cityName(capSrc.city) + " budget=" + urbanCrisisBudget(capSrc.city) + " kind=" + urbanReserveKind(capSrc) + " took=" + J(urbanReserveKind(capSrc) === "building" ? takeUrbanPoint(capSrc.city, "building") : null) + " kindNow=" + urbanReserveKind(capSrc));
    emit("P1 AUTOPLAY 30 turns toward the age end");
    autoplay(30);
    return;
  }
  // Phase 2
  if (!stored) emit("P2 PERSIST LOST: the stored placements did not survive the transition");
  else { placed = stored; report("P2 after transition"); }
  await tryPlace(mine[0], "CIVILIZATION_ROME", "b", "P2 turn1 place");
  emit("P2 waiting for turn >= 2 to try again");
  autoplay(1);
}

async function lateTry() {
  triedLate = true;
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population);
  const foreign = sigs.filter((s) => s.owner !== local && !s.isCityState && !s.isTown).sort((a, b) => b.population - a.population);
  await tryPlace(mine[0], "CIVILIZATION_ROME", "b", "P2 late place");
  await tryPlace(foreign[1] || foreign[0], "CIVILIZATION_GREECE", "a", "P2 late place");
  report("P2 check");
  emit("P2 AUTOPLAY 6 more turns");
  autoplay(6);
}

engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player); if (who !== GameContext.localPlayerID) return;
  n++;
  emit("TURN activated n=" + n + " turn=" + safe(() => Game.turn) + " age=" + ageName() + " ALIVE");
  if (ageName() === "AGE_EXPLORATION" && safe(() => Game.turn, 0) >= 2 && !triedLate) setTimeout(() => lateTry().catch((e) => emit("lateTry threw " + e)), 3000);
});
async function finish() {
  // Arrival prompt screenshot last, so a modal can never block the run.
  const sigs = collectCitySignals();
  const top = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population)[0];
  if (top) {
    CONFIG.arrivalPlacement = 2;
    const ok = arriveRural(top.city);
    flushArrivalPlacements();
    await later(3000);
    safe(() => Camera.lookAtPlot(top.city.location, { instantaneous: true }));
    emit("P2 arrival " + cityName(top.city) + " arriveRural=" + J(ok) + " pending=" + safe(() => top.city.pendingPopulation));
    await later(2000);
    emit("SHOT arrival-prompt");
    await later(10000);
  }
  emit("DONE modtest6 finished");
}
engine.on("AgeProgressionChanged", () => {
  const t = safe(() => Game.turn, 0);
  emit("EVENT AgeProgressionChanged turn=" + t + " age=" + ageName());
  if (capSrc) emit("P1 cap turn " + t + " urbanLossCapPct=" + CONFIG.urbanLossCapPct + " maxPerTurn=" + CONFIG.maxUrbanLossPerCityPerTurn + " budget=" + urbanCrisisBudget(capSrc.city) + " kind=" + urbanReserveKind(capSrc));
  if (ageName() === "AGE_EXPLORATION") { report("P2 turn " + t); if (t >= 9 && !done) { done = true; finish().catch((e) => emit("finish threw " + e)); } }
});
engine.on("GameAgeEnded", () => emit("EVENT GameAgeEnded turn=" + safe(() => Game.turn)));
emit("modtest6 attached");
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
