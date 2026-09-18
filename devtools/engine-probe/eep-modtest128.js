// eep-modtest128.js - the FULL Cultural Enclave progression in one run, with a screenshot at every stage.
// AugustusExp66. Every stage runs through SHIPPED code (maybeQuarter / tickContestedQuarters / the real
// decision modal / the mod's own war handlers); only the INPUTS are synthetic: migration records are
// fed to the composition ledger so a community exists to progress. Logs [EmigTest]; "SHOT" lines ask the
// runner for a screenshot.
//
//   S0 BASELINE      the host city before anyone arrives: composition, records, plot.
//   S1 FOOTHOLD      a community BELOW the established bar. A pass must NOT form an enclave; the readout's
//                    progress line must show it climbing toward the bar.                SHOT 1-foothold
//   S2 ESTABLISHED   the community crosses the bar. One pass must CREATE the enclave: record written, tile
//                    placed on the map, "Takes Root" in the Chronicle.                  SHOT 2-established-tile
//   S3 DWELL         recognition is NOT offered while the dwell clock runs (quarterDwellTurns = 2): a pass on
//                    the same turn must raise no modal. Then two turns are ended.
//   S4 RECOGNIZED    dwell served. ASK mode raises the REAL decision modal.             SHOT 3-decision-modal
//                    The first (embrace) choice is clicked; the record takes a stance.
//   S5 STANCE YIELDS one turn ended; the host's per-turn stance yields are read before/after the tick.
//   S6 CONTESTED     the host goes to war with the homeland (fed through the mod's own DeclareWar handler,
//                    the same function the engine event calls). tickContestedQuarters must mark the record
//                    contested, dim its benefit, and chronicle "War Tests the ...". Peace must clear it.
//   S7 CHANGE OF HANDS  a larger community from a DIFFERENT origin overtakes the tile. The record must be
//                    replaced and the Chronicle must note it.                           SHOT 4-changed-hands
//   S8 FADE          the community goes home; quarterFadeTurns = 2. Turns are ended until the mod's own
//                    upkeep dissolves the enclave: tile gone, record dropped, "The Enclave Fades".
//                                                                                       SHOT 5-faded-plot
//   S9 CHRONICLE     the mod window's Chronicle, carrying the whole story.              SHOT 6-chronicle

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { maybeQuarter, tickContestedQuarters, contestedBenefitScale } from "/emigration/ui/emigration-quarter.js";
import { allQuarterEntries, allCandidacyEntries } from "/emigration/ui/emigration-quarter-state.js";
import { enclaveStanding } from "/emigration/ui/emigration-enclave-place.js";
import { chronicleLog } from "/emigration/ui/emigration-chronicle.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { establishedStockBar, enclaveProgressForCity } from "/emigration/ui/emigration-diaspora.js";
import { recordCompositionPass, compositionForCity } from "/emigration/ui/emigration-composition.js";
import { recordWarDeclared, recordPeace, warOpponents } from "/emigration/ui/emigration-war.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function look(loc) { safe(() => Camera.lookAtPlot(loc, { zoom: 0.35, instantaneous: true })); }
function comp(c) { return safe(() => { const k = compositionForCity(c); return k && k.civs.slice(0, 4).map((x) => x.civ + ":" + Math.round(x.pts * 10) / 10 + "/" + Math.round(x.share * 100) + "%"); }); }
function plotInfo(idx) { return safe(() => { const l = GameplayMap.getLocationFromIndex(idx); return (MapConstructibles.getConstructibles(l.x, l.y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null; return info ? info.ConstructibleType : "?"; }); }); }
function chron(re) { return safe(() => (chronicleLog(60) || []).filter((e) => re.test(String(e.title || ""))).map((e) => String(e.title)), []); }
function yields(pid) { return safe(() => { const st = Players.get(pid).Stats; const o = {}; for (const y of ["YIELD_GOLD", "YIELD_CULTURE", "YIELD_SCIENCE", "YIELD_HAPPINESS", "YIELD_DIPLOMACY"]) o[y.replace("YIELD_", "")] = Math.round(st.getNetYield(YieldTypes[y]) * 10) / 10; return o; }); }

let local = -1, host = null;
function mine() { return allQuarterEntries().filter((e) => e.rec.owner === local); }
function recLine(e) { return e.tileKey + " origin=" + e.rec.civ + " stance=" + e.rec.optionId + " contested=" + !!e.rec.contested + " placed=" + J(e.rec.placed) + " standing=" + safe(() => enclaveStanding(e.rec)); }
function report(tag) {
  const es = mine();
  emit(tag + " records=" + es.length + " candidacies=" + safe(() => allCandidacyEntries().length) + " comp(" + cityName(host.city) + ")=" + J(comp(host.city)));
  for (const e of es) emit(tag + "   " + recLine(e) + " plot=" + J(e.rec.placed ? plotInfo(e.rec.placed.plot) : null));
  emit(tag + " progress=" + J(safe(() => { const p = enclaveProgressForCity(host.city); return p && { civ: p.civ, share: +p.share.toFixed(3), bar: +p.establishedShare.toFixed(3), stock: +p.stock.toFixed(1), stockBar: +p.stockBar.toFixed(1), stage: p.stage, dwell: p.dwell }; })));
}
async function pass(tag) { maybeQuarter(collectCitySignals(), false); await later(7000); report(tag); }
function seed(src, pts, cause, originCiv) {
  const m = { srcOwner: src.owner, srcName: cityName(src.city), destOwner: host.owner, destName: cityName(host.city), points: pts, cause: cause || "prosperity", phase: "move", crossCiv: true };
  if (originCiv != null) m.originCiv = originCiv;
  recordCompositionPass(collectCitySignals(), [m]);
}
function sendHome(toCity, originCiv, pts) {
  recordCompositionPass(collectCitySignals(), [{ srcOwner: host.owner, srcName: cityName(host.city), destOwner: toCity.owner, destName: cityName(toCity.city), originCiv, points: pts, cause: "return", phase: "move", crossCiv: true }]);
}

// ── decision modal ──
function dialog() { const all = Array.from(document.querySelectorAll("screen-dialog-box")); return all[all.length - 1] || null; }
async function waitDialog(ms) { let d = null; for (let i = 0; i < ms / 100 && !d; i++) { d = dialog(); if (!d) await later(100); } return d; }
async function clickFirstChoice(d) {
  const btns = Array.from(d.querySelectorAll("fxs-button"));
  emit("S4 modal buttons=" + J(btns.map((b) => safe(() => b.getAttribute("caption") || b.textContent.trim().slice(0, 40)))));
  if (btns[0]) safe(() => btns[0].dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
  await later(2500);
}

// ── turn ending (same fallback ladder as the earlier tests) ──
let n = 1, blockedTries = 0, endTurnTimer = null, onTurn = null;
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
function nextTurn() {
  return new Promise((resolve) => { onTurn = resolve; setTimeout(endTurn, 1500); });
}
engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player); if (who !== GameContext.localPlayerID) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0;
  emit("TURN activated n=" + n + " turn=" + safe(() => Game.turn));
  const r = onTurn; onTurn = null;
  if (r) setTimeout(r, 9000); // let the mod's own per-turn pass finish before the script reads state
});

async function run() {
  local = GameContext.localPlayerID;
  Object.assign(CONFIG, {
    quartersEnabled: true, quarterForce: false, quarterPlaceImprovement: true,
    quarterRecognition: 0, // ASK: the local player gets the real decision modal
    quarterDwellTurns: 2, quarterDwellGrace: 0, quarterFadeTurns: 2,
    quarterPacingEnabled: false, // plain bars, so the foothold/established contrast is exact
    quarterCapPerAge: 0, quarterCooldownTurns: 0
  });
  const sigs = collectCitySignals();
  recordCompositionPass(sigs, []); // seed the ledger so the scaled stock bar can read a mean
  const cities = sigs.filter((s) => s.owner === local && !s.isTown && s.population >= 8 && !/London/.test(cityName(s.city)));
  host = cities.sort((a, b) => a.population - b.population)[0] || sigs.find((s) => s.owner === local);
  const foreignCities = sigs.filter((s) => s.owner !== local && !s.isCityState && !s.isTown).sort((a, b) => b.population - a.population);
  const A = foreignCities[0];
  const B = foreignCities.find((s) => s.owner !== A.owner);
  if (!host || !A || !B) { emit("S0 cannot run: host=" + !!host + " A=" + !!A + " B=" + !!B); emit("DONE modtest128 finished"); return; }
  const shareBar = Number(CONFIG.quarterEstablishedShare), stockBar = establishedStockBar();
  emit("S0 turn=" + safe(() => Game.turn) + " host=" + cityName(host.city) + " pop=" + host.population + " originA=" + A.owner + "(" + cityName(A.city) + ") originB=" + B.owner + "(" + cityName(B.city) + ") shareBar=" + shareBar + " stockBar=" + stockBar.toFixed(2) + " minStock=" + CONFIG.quarterMinStock);
  report("S0");
  look(host.city.location);

  // S1 FOOTHOLD: about half the share bar.
  seed(A, Math.max(2, Math.ceil(host.population * shareBar * 0.5 / 0.8)));
  await pass("S1");
  emit("S1 verdict formed=" + (mine().length > 0) + " (expect false: below the bar)");
  safe(() => globalThis.emigration.city(host.city));
  await later(3500);
  emit("SHOT 1-foothold");
  await later(9000);

  // S2 ESTABLISHED: push the same origin over the bar.
  seed(A, Math.ceil(host.population * 0.45 / 0.8));
  await pass("S2");
  const e2 = mine()[0];
  emit("S2 verdict formed=" + !!e2 + " tilePlaced=" + !!(e2 && e2.rec.placed) + " stance=" + (e2 && e2.rec.optionId) + " takesRoot=" + J(chron(/Takes Root|Enclave of/i)));
  if (e2 && e2.rec.placed) look(safe(() => GameplayMap.getLocationFromIndex(e2.rec.placed.plot), host.city.location));
  await later(3000);
  emit("SHOT 2-established-tile");
  await later(9000);
  if (!e2) { emit("S2 no enclave formed; stopping"); emit("DONE modtest128 finished"); return; }

  // S3 DWELL: no modal while the clock runs.
  maybeQuarter(collectCitySignals(), false);
  emit("S3 same-turn pass raised a modal=" + !!(await waitDialog(3000)) + " (expect false: dwell " + CONFIG.quarterDwellTurns + " turns)");
  await nextTurn(); report("S3 turn+1");
  await nextTurn(); report("S3 turn+2");

  // S4 RECOGNIZED: the real decision modal.
  maybeQuarter(collectCitySignals(), false);
  const d = await waitDialog(8000);
  emit("S4 modal appeared=" + !!d + " title=" + J(d && safe(() => d.querySelector("fxs-header").getAttribute("title"))));
  if (d) { await later(1200); emit("SHOT 3-decision-modal"); await later(9000); await clickFirstChoice(d); }
  report("S4");
  emit("S4 verdict stance=" + J(mine().map((e) => e.rec.optionId)));

  // S5 STANCE YIELDS.
  const y0 = yields(local);
  await nextTurn();
  emit("S5 host yields before=" + J(y0) + " after=" + J(yields(local)) + " (the stance pays each turn on top of the tile)");
  report("S5");

  // S6 CONTESTED: war with the homeland, through the mod's own handler.
  emit("S6 opponents before=" + J([...warOpponents(local)]));
  recordWarDeclared({ actingPlayer: A.owner, reactingPlayer: local });
  tickContestedQuarters(collectCitySignals());
  await later(3000);
  const e6 = mine()[0];
  emit("S6 at war: opponents=" + J([...warOpponents(local)]) + " contested=" + !!(e6 && e6.rec.contested) + " benefitScale=" + safe(() => contestedBenefitScale(e6.rec)) + " chronicle=" + J(chron(/War Tests/i)));
  recordPeace({ actingPlayer: A.owner, reactingPlayer: local });
  tickContestedQuarters(collectCitySignals());
  await later(3000);
  const e6b = mine()[0];
  emit("S6 peace: contested=" + !!(e6b && e6b.rec.contested) + " benefitScale=" + safe(() => contestedBenefitScale(e6b.rec)) + " (expect false / 1)");

  // S7 CHANGE OF HANDS: a bigger community from another origin.
  seed(B, Math.ceil(host.population * 0.9 / 0.8));
  await pass("S7");
  const e7 = mine()[0];
  emit("S7 verdict originNow=" + (e7 && e7.rec.civ) + " (was " + A.owner + ", expect " + B.owner + ") chronicle=" + J(chron(/Changes Hands|New Hands|Gives Way|Takes Root/i)));
  if (e7 && e7.rec.placed) look(safe(() => GameplayMap.getLocationFromIndex(e7.rec.placed.plot), host.city.location));
  await later(3000);
  emit("SHOT 4-changed-hands");
  await later(9000);

  // S8 FADE: everyone goes home.
  const lastPlot = e7 && e7.rec.placed ? e7.rec.placed.plot : (e2.rec.placed ? e2.rec.placed.plot : null);
  sendHome(A, A.owner, 80); sendHome(B, B.owner, 80);
  emit("S8 community left: comp=" + J(comp(host.city)) + " fadeTurns=" + CONFIG.quarterFadeTurns + " fadeShare=" + CONFIG.quarterFadeShare);
  for (let i = 1; i <= 4 && mine().length; i++) { await nextTurn(); report("S8 turn+" + i); }
  emit("S8 verdict recordsLeft=" + mine().length + " plotNow=" + J(lastPlot != null ? plotInfo(lastPlot) : null) + " fades=" + J(chron(/Fades/i)));
  if (lastPlot != null) look(safe(() => GameplayMap.getLocationFromIndex(lastPlot), host.city.location));
  await later(3000);
  emit("SHOT 5-faded-plot");
  await later(9000);

  // S9 the whole story in the Chronicle.
  emit("S9 chronicle titles=" + J(safe(() => (chronicleLog(60) || []).map((e) => String(e.title)))));
  safe(() => globalThis.emigration.window && globalThis.emigration.window());
  await later(5000);
  emit("SHOT 6-chronicle");
  await later(10000);
  emit("DONE modtest128 finished");
}

emit("modtest128 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest128 finished"); }); }, 12000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
