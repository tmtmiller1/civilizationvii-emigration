// eep-modtest4.js - crash watch: a PLACED enclave tile through an age transition. Loads the turn-158
// autosave of the Antiquity game (the transition fires at turn 160), places one enclave in the local
// player's largest city and one in the largest AI city, then lets Autoplay drive through the transition
// and three turns of the new age. Logs [EmigTest] to UI.log. Compare with the peer session's crash at
// 22:02:39 on 2026-09-12 (EXC_BAD_ACCESS 0x2a8, AsyncWorker1, ~30s after the same transition, with
// emigration DISABLED), which this run neither confirms nor clears on its own; it answers only "does a
// standing enclave tile survive the transition, and does the game keep running with it".

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { placeEnclave, enclaveStanding, enclaveIndex, enclaveTypeFor } from "/emigration/ui/emigration-enclave-place.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1, n = 0;
const placed = [];
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function ageName() { return safe(() => GameInfo.Ages.lookup(Game.age).AgeType, "?"); }
function plotTypes(idx) { return safe(() => { const l = GameplayMap.getLocationFromIndex(idx); return (MapConstructibles.getConstructibles(l.x, l.y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null; return info ? info.ConstructibleType : "?"; }); }, []); }
function report(tag) {
  for (const p of placed) emit(tag + " " + p.city + " " + p.rec.placed.type + " plot " + p.rec.placed.plot + " standing=" + enclaveStanding(p.rec) + " plotNow=" + J(plotTypes(p.rec.placed.plot)));
}

async function run() {
  local = GameContext.localPlayerID;
  emit("START turn=" + safe(() => Game.turn) + " age=" + ageName() + " place=" + CONFIG.quarterPlaceImprovement + " dataLoaded=" + (enclaveIndex(enclaveTypeFor("CIVILIZATION_ROME", "a")) != null));
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population);
  const foreign = sigs.filter((s) => s.owner !== local && !s.isCityState && !s.isTown).sort((a, b) => b.population - a.population);
  for (const [sig, civ, opt] of [[mine[0], "CIVILIZATION_ROME", "a"], [foreign[0], "CIVILIZATION_GREECE", "b"]]) {
    if (!sig) continue;
    const r = placeEnclave(sig.city, civ, opt);
    emit("PLACE " + cityName(sig.city) + " owner=" + sig.owner + " -> " + J(r));
    if (r) placed.push({ city: cityName(sig.city), rec: { placed: r } });
  }
  await later(6000);
  report("PLACED");
  emit("AUTOPLAY through the transition (8 turns)");
  safe(() => { Autoplay.setTurns(8); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); }, null);
}

engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player); if (who !== GameContext.localPlayerID) return;
  n++;
  emit("TURN activated n=" + n + " turn=" + safe(() => Game.turn) + " age=" + ageName() + " ALIVE");
  report("CHECK");
  if (n >= 7) emit("DONE modtest4 finished");
});
engine.on("AgeProgressionChanged", () => emit("EVENT AgeProgressionChanged turn=" + safe(() => Game.turn)));
engine.on("GameAgeEnded", () => emit("EVENT GameAgeEnded turn=" + safe(() => Game.turn)));
emit("modtest4 attached");
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
