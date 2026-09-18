// eep-modtest18.js - FADE and the absolute-stock qualifier. Automatic recognition everywhere (CONFIG.quarterRecognition = 2) through the SHIPPED
// maybeQuarter path, on AugustusExp66. Force mode relaxes the share bar to foothold and skips the dwell
// gate (the save's composition state decides which cities qualify), so this shows whether AI cities
// form enclaves, get their tiles placed, and get markers only where revealed. Logs [EmigTest]; "SHOT".

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { maybeQuarter } from "/emigration/ui/emigration-quarter.js";
import { allQuarterEntries } from "/emigration/ui/emigration-quarter-state.js";
import { enclaveStanding, enclaveTypeOf } from "/emigration/ui/emigration-enclave-place.js";
import { chronicleLog } from "/emigration/ui/emigration-chronicle.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { establishedStockBar } from "/emigration/ui/emigration-diaspora.js";
import { recordCompositionPass, compositionForCity } from "/emigration/ui/emigration-composition.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, finished = false;
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function ownerName(pid) { return safe(() => GameInfo.Civilizations.lookup(Players.get(pid).civilizationType).CivilizationType, "?"); }
function plotInfo(idx) { return safe(() => { const l = GameplayMap.getLocationFromIndex(idx); return (MapConstructibles.getConstructibles(l.x, l.y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null; return info ? info.ConstructibleType : "?"; }); }, []); }
const seenPlots = new Map();
function report(tag) {
  const entries = allQuarterEntries();
  for (const { tileKey, rec } of entries) if (rec.placed) seenPlots.set(tileKey, rec.placed);
  for (const [k, p] of seenPlots) if (!entries.some((e) => e.tileKey === k)) emit(tag + " GONE " + k + " plot " + p.plot + " now=" + J(plotInfo(p.plot)) + " (record dropped)");
  emit(tag + " records=" + entries.length);
  for (const { tileKey, rec } of entries) emit(tag + " " + tileKey + " host=" + rec.owner + "(" + ownerName(rec.owner) + ") origin=" + rec.originCiv + " stance=" + rec.optionId + " placed=" + J(rec.placed) + " standing=" + enclaveStanding(rec) + " enclave=" + enclaveTypeOf(rec) + " plotNow=" + J(rec.placed ? plotInfo(rec.placed.plot) : null));
  emit(tag + " autoChronicle=" + safe(() => (chronicleLog(30) || []).filter((e) => /Takes Root/i.test(String(e.title || ""))).length, "ERR"));
}
async function pass(label) {
  const sigs = collectCitySignals();
  maybeQuarter(sigs, false);
  await later(8000);
  report(label);
}

async function run() {
  local = GameContext.localPlayerID;
  CONFIG.quarterRecognition = 2; CONFIG.quarterForce = true; CONFIG.quartersEnabled = true;
  const sigs = collectCitySignals();
  const owners = [...new Set(sigs.filter((s) => !s.isCityState).map((s) => s.owner))];
  emit("START turn=" + safe(() => Game.turn) + " mode=" + CONFIG.quarterRecognition + " force=" + CONFIG.quarterForce + " majors=" + J(owners.map((o) => o + ":" + ownerName(o))) + " turnActive=" + safe(() => Players.get(local).isTurnActive));
  report("BEFORE");
  // SEED foreign communities (this save was not played with the mod, so no diaspora exists): Songhai
  // migrants into the largest Norman city and into London, 45% of each city's population, through the
  // composition pass with synthetic migration records.
  const F = sigs.filter((s) => s.owner !== local && !s.isCityState && !s.isTown).sort((a, b) => b.population - a.population)[0];
  const L = sigs.filter((s) => s.owner === local && !s.isTown && cityName(s.city) !== "London").sort((a, b) => b.population - a.population)[0]; // not London: its plot gets El Escorial
  const src = sigs.filter((s) => s.owner !== local && s.owner !== F.owner && !s.isCityState && !s.isTown).sort((a, b) => b.population - a.population)[0];
  const migs = [];
  // Paris (the AI city) gets a SMALL share but 7 points (the absolute-stock path); London gets 45%.
  // The scaled bar needs a seeded ledger to read a mean: seed the ledger first (no migrations), read the bar,
  // then give Paris a community just above it at a small share (the STOCK path); points reconcile to ~80%.
  recordCompositionPass(sigs, []);
  const bar = establishedStockBar();
  const seedPts = Math.ceil((bar + 1) / 0.8);
  emit("STOCK-BAR live=" + bar + " (base " + CONFIG.quarterEstablishedStock + ", ref " + CONFIG.quarterStockRefPop + ") seeding Paris with " + seedPts + " points");
  migs.push({ srcOwner: src.owner, srcName: cityName(src.city), destOwner: F.owner, destName: cityName(F.city), points: seedPts, cause: "prosperity", phase: "move", crossCiv: true });
  migs.push({ srcOwner: src.owner, srcName: cityName(src.city), destOwner: L.owner, destName: cityName(L.city), points: Math.ceil(L.population * 0.45), cause: "prosperity", phase: "move", crossCiv: true });
  recordCompositionPass(sigs, migs);
  const comp = (c) => safe(() => { const k = compositionForCity(c); return k && k.civs.slice(0, 3).map((x) => x.civ + ":" + x.pts + "/" + Math.round(x.share * 100) + "%"); });
  emit("SEED from " + cityName(src.city) + " (owner " + src.owner + ") -> " + cityName(F.city) + " (owner " + F.owner + ") comp=" + J(comp(F.city)) + " ; -> " + cityName(L.city) + " comp=" + J(comp(L.city)));
  await pass("PASS1");
  // Now the communities LEAVE (returns home: removed from that origin's bucket), and the fade period is
  // shortened to 2 turns so the mod's own per-turn upkeep can dissolve both enclaves within the run.
  const sigs2 = collectCitySignals();
  const gone = [];
  for (const dest of [F, L]) gone.push({ srcOwner: dest.owner, srcName: cityName(dest.city), destOwner: src.owner, destName: cityName(src.city), originCiv: src.owner, points: 40, cause: "return", phase: "move", crossCiv: true });
  recordCompositionPass(sigs2, gone);
  CONFIG.quarterFadeTurns = 2;
  emit("REMOVED comp " + cityName(F.city) + "=" + J(comp(F.city)) + " " + cityName(L.city) + "=" + J(comp(L.city)) + " fadeTurns=" + CONFIG.quarterFadeTurns + " fadeShare=" + CONFIG.quarterFadeShare + " stockBar=" + CONFIG.quarterEstablishedStock);
  await pass("PASS2");
  emit("ACTIONS done; ending 3 turns (fade after 2 below the bar)");
  finished = true;
  setTimeout(endTurn, 2000);
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
  if (!finished) return;
  if (n === 2 || n === 3) setTimeout(() => { report("TURN+" + (n - 1)); endTurn(); }, 6000);
  if (n >= 4) setTimeout(() => { report("TURN+3"); emit("FADE-CHRONICLE " + safe(() => (chronicleLog(30) || []).filter((e) => /Fades/i.test(String(e.title || ""))).length, "ERR")); emit("DONE modtest18 finished"); }, 6000);
});
emit("modtest18 attached");
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
