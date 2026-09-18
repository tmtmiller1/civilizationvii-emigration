// eep-modtest129.js - the full Cultural Enclave progression, corrected after run 128, with the new tile
// TOOLTIP and MARKER captured at every stage. AugustusExp66.
//
// What run 128 got wrong, and why this script is different:
//   • CONFIG was assigned directly. `applyTunableOverrides()` runs at the START OF EVERY PASS
//     (emigration-main.js) and rewrites every tunable key from saved settings, so the overrides were
//     wiped by the mod's own turn pass: recognition fell back to automatic (no decision modal) and the
//     fade clock back to 12 turns (no fade). Everything here goes through setTunable(), which persists
//     AND survives that reset, and the originals are restored at the end.
//   • The "foothold" seed cleared the absolute-SIZE bar (4.8 points against a 4.6 bar) even though it was
//     under the share bar, so the enclave formed a stage early. The seed is now under BOTH bars.
//   • A takeover needs its own dwell before the record changes hands; turns are ended for it now.
//
// Stages, each with a screenshot:
//   S1 FOOTHOLD     below both bars: no enclave, the readout shows it climbing.      SHOT 1-foothold
//   S2 ESTABLISHED  over the share bar: record + tile + "Takes Root".                SHOT 2-established
//                   then the tile's own TOOLTIP, and the marker reading "Established". SHOT 3-tip-established
//   S3 LABEL        the camera is moved and the tile repainted repeatedly: the label must stay SINGLE
//                   (the 2026-09-17 doubling).                                        SHOT 4-label-check
//   S4 DWELL        no modal while the clock runs; two turns are ended.
//   S5 RECOGNIZED   the real decision modal, and the first choice is taken.           SHOT 5-modal
//                   the marker now reads "Recognized" + the stance's yields.          SHOT 6-marker-recognized
//                   the tooltip now carries the stance row and its reasoning.         SHOT 7-tip-recognized
//   S6 YIELDS       the HOST CITY's own yields across a turn (Production included).
//   S7 CONTESTED    war with the homeland: the tooltip shows the dimmed benefit.      SHOT 8-tip-contested
//   S8 HANDS        a larger community from another origin, dwell served, takes the tile. SHOT 9-changed-hands
//   S9 FADE         everyone goes home, fade 2 turns: tile gone, record dropped.      SHOT 10-faded
//
// The Emigration window is deliberately NOT opened at the end: run 128 aborted (SIGABRT in a UI-engine
// allocation) about a second after it was opened, so leaving it out is also the isolation test.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { getTunable, setTunable } from "/emigration/ui/emigration-settings.js";
import { maybeQuarter, tickContestedQuarters } from "/emigration/ui/emigration-quarter.js";
import { allQuarterEntries, allCandidacyEntries } from "/emigration/ui/emigration-quarter-state.js";
import { enclaveStanding } from "/emigration/ui/emigration-enclave-place.js";
import { chronicleLog } from "/emigration/ui/emigration-chronicle.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { establishedStockBar, enclaveProgressForCity } from "/emigration/ui/emigration-diaspora.js";
import { recordCompositionPass, compositionForCity } from "/emigration/ui/emigration-composition.js";
import { recordWarDeclared, recordPeace } from "/emigration/ui/emigration-war.js";
// The same singleton the mod's hover panel reads, so setting it here is exactly what a real hover does.
import PlotCursor from "/core/ui/input/plot-cursor.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function comp(c) { return safe(() => { const k = compositionForCity(c); return k && k.civs.slice(0, 4).map((x) => x.civ + ":" + Math.round(x.pts * 10) / 10 + "/" + Math.round(x.share * 100) + "%"); }); }
function plotInfo(idx) { return safe(() => { const l = GameplayMap.getLocationFromIndex(idx); return (MapConstructibles.getConstructibles(l.x, l.y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const d = i ? GameInfo.Constructibles.lookup(i.type) : null; return d ? d.ConstructibleType : "?"; }); }); }
function chron(re) { return safe(() => (chronicleLog(60) || []).filter((e) => re.test(String(e.title || ""))).map((e) => String(e.title)), []); }

let local = -1, host = null;
function mine() { return allQuarterEntries().filter((e) => e.rec.owner === local); }
function report(tag) {
  const es = mine();
  emit(tag + " records=" + es.length + " candidacies=" + safe(() => allCandidacyEntries().length) + " comp=" + J(comp(host.city)));
  for (const e of es) {
    emit(tag + "   " + e.tileKey + " origin=" + e.rec.civ + " recognized=" + (e.rec.recognized !== false) + " stance=" + e.rec.optionId
      + " contested=" + !!e.rec.contested + " fadeSince=" + e.rec.fadeSince + " placed=" + J(e.rec.placed)
      + " standing=" + safe(() => enclaveStanding(e.rec)) + " plot=" + J(e.rec.placed ? plotInfo(e.rec.placed.plot) : null));
  }
  emit(tag + " progress=" + J(safe(() => { const p = enclaveProgressForCity(host.city); return p && { civ: p.civ, share: +p.share.toFixed(3), bar: +p.establishedShare.toFixed(3), stock: +p.stock.toFixed(1), stockBar: +p.stockBar.toFixed(1), stage: p.stage }; })));
}
async function pass(tag) { maybeQuarter(collectCitySignals(), false); await later(6000); report(tag); }
function seed(src, pts) {
  recordCompositionPass(collectCitySignals(), [{ srcOwner: src.owner, srcName: cityName(src.city), destOwner: host.owner, destName: cityName(host.city), points: pts, cause: "prosperity", phase: "move", crossCiv: true }]);
}
function sendHome(to, originCiv, pts) {
  recordCompositionPass(collectCitySignals(), [{ srcOwner: host.owner, srcName: cityName(host.city), destOwner: to.owner, destName: cityName(to.city), originCiv, points: pts, cause: "return", phase: "move", crossCiv: true }]);
}
function hostYields() {
  return safe(() => { const y = host.city.Yields; const o = {}; for (const k of ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS"]) o[k.replace("YIELD_", "")] = Math.round(y.getNetYield(YieldTypes[k]) * 10) / 10; return o; });
}

// ── the tile's own tooltip: put the plot cursor on the enclave and move the mouse there ──
function enclavePlot() { const e = mine()[0]; return e && e.rec.placed ? e.rec.placed.plot : null; }
function look(plot, zoom) { safe(() => Camera.lookAtPlot(GameplayMap.getLocationFromIndex(plot), { zoom: zoom == null ? 0.4 : zoom, instantaneous: true })); }
async function hoverEnclave(label) {
  const plot = enclavePlot();
  if (plot == null) { emit(label + " no placed tile to hover"); return false; }
  look(plot);
  await later(2500);
  const loc = safe(() => GameplayMap.getLocationFromIndex(plot), null);
  safe(() => { PlotCursor.plotCursorCoords = { x: loc.x, y: loc.y }; });
  // The panel positions itself at the mouse, so put the mouse where the tile is on screen.
  const uv = safe(() => WorldUI.getScreenPlotPos(loc), null);
  const px = uv ? Math.round(uv.x * window.innerWidth) : Math.round(window.innerWidth / 2);
  const py = uv ? Math.round(uv.y * window.innerHeight) : Math.round(window.innerHeight / 2);
  safe(() => window.dispatchEvent(new MouseEvent("mousemove", { clientX: px, clientY: py, bubbles: true })));
  safe(() => window.dispatchEvent(new CustomEvent("plot-cursor-coords-updated", { detail: { plot: loc } })));
  await later(1500);
  const panel = safe(() => document.getElementById("emig-enclave-tip-panel"), null);
  const shown = !!(panel && panel.style.display !== "none" && panel.textContent);
  emit(label + " tooltip shown=" + shown + " at " + px + "," + py + " text=" + J(safe(() => panel && panel.textContent.slice(0, 400))));
  return shown;
}

// ── turn ending ──
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
function nextTurn() { return new Promise((r) => { onTurn = r; setTimeout(endTurn, 1500); }); }
engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player); if (who !== GameContext.localPlayerID) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0;
  emit("TURN activated n=" + n + " turn=" + safe(() => Game.turn));
  const r = onTurn; onTurn = null;
  if (r) setTimeout(r, 9000);
});

// ── the decision modal ──
function dialog() { const all = Array.from(document.querySelectorAll("screen-dialog-box")); return all[all.length - 1] || null; }
async function waitDialog(ms) { let d = null; for (let i = 0; i < ms / 100 && !d; i++) { d = dialog(); if (!d) await later(100); } return d; }

// ── tunables: set through the settings store so the per-pass reset cannot undo them ──
const KNOBS = {
  quartersEnabled: true, quarterForce: false, quarterPlaceImprovement: true,
  quarterRecognition: 0, quarterDwellTurns: 2, quarterFadeTurns: 2,
  quarterPacingEnabled: false, quarterCapPerAge: 0, quarterCooldownTurns: 0
};
const _saved = {};
function applyKnobs() {
  for (const k of Object.keys(KNOBS)) { _saved[k] = safe(() => getTunable(k)); safe(() => setTunable(k, KNOBS[k])); }
  CONFIG.quarterDwellGrace = 0; // not a tunable: the per-pass reset never touches it
  emit("KNOBS set=" + J(KNOBS) + " saved=" + J(_saved));
}
function restoreKnobs() {
  for (const k of Object.keys(_saved)) safe(() => setTunable(k, _saved[k]));
  emit("KNOBS restored=" + J(safe(() => Object.fromEntries(Object.keys(_saved).map((k) => [k, getTunable(k)])))));
}

async function run() {
  local = GameContext.localPlayerID;
  applyKnobs();
  const sigs = collectCitySignals();
  recordCompositionPass(sigs, []);
  const cities = sigs.filter((s) => s.owner === local && !s.isTown && s.population >= 10);
  host = cities.sort((a, b) => a.population - b.population)[0];
  const foreign = sigs.filter((s) => s.owner !== local && !s.isCityState && !s.isTown).sort((a, b) => b.population - a.population);
  const A = foreign[0], B = foreign.find((s) => s.owner !== A.owner);
  if (!host || !A || !B) { emit("S0 cannot run"); emit("DONE modtest129 finished"); return; }
  const shareBar = Number(CONFIG.quarterEstablishedShare), stockBar = establishedStockBar();
  emit("S0 turn=" + safe(() => Game.turn) + " host=" + cityName(host.city) + " pop=" + host.population
    + " originA=" + A.owner + "(" + cityName(A.city) + ") originB=" + B.owner + "(" + cityName(B.city) + ")"
    + " shareBar=" + shareBar + " stockBar=" + stockBar.toFixed(2) + " minStock=" + CONFIG.quarterMinStock);
  report("S0");

  // S1 FOOTHOLD: at/over the min stock, but UNDER the share bar AND under the size bar.
  const footStock = Math.max(Number(CONFIG.quarterMinStock) || 3, 3);
  if (footStock >= stockBar || footStock / host.population >= shareBar) {
    emit("S1 WARNING: host pop " + host.population + " cannot hold a foothold under both bars");
  }
  seed(A, Math.ceil(footStock / 0.8));
  await pass("S1");
  emit("S1 verdict formed=" + (mine().length > 0) + " (expect FALSE: under both bars)");
  safe(() => globalThis.emigration.city(host.city));
  await later(3500);
  emit("SHOT 1-foothold");
  await later(9000);

  // S2 ESTABLISHED.
  seed(A, Math.ceil(host.population * 0.45 / 0.8));
  await pass("S2");
  const e2 = mine()[0];
  emit("S2 verdict formed=" + !!e2 + " tile=" + J(e2 && e2.rec.placed) + " recognized=" + (e2 && e2.rec.recognized !== false)
    + " (expect formed, NOT yet recognized) chronicle=" + J(chron(/Takes Root|Enclave of/i)));
  if (!e2) { emit("S2 nothing formed; stopping"); restoreKnobs(); emit("DONE modtest129 finished"); return; }
  look(enclavePlot(), 0.25);
  await later(3000);
  emit("SHOT 2-established");
  await later(9000);
  await hoverEnclave("S2");
  emit("SHOT 3-tip-established");
  await later(10000);

  // S3 THE LABEL: repaint repeatedly from different camera positions; it must stay single.
  for (let i = 0; i < 6; i++) {
    look(enclavePlot(), i % 2 ? 0.2 : 0.6);
    await later(700);
    safe(() => window.dispatchEvent(new CustomEvent("ConstructibleAddedToMap")));
  }
  look(enclavePlot(), 0.25);
  await later(3000);
  emit("S3 label check: 6 camera moves + repaints; the tile must carry ONE label");
  emit("SHOT 4-label-check");
  await later(9000);

  // S4 DWELL.
  maybeQuarter(collectCitySignals(), false);
  emit("S4 same-turn pass raised a modal=" + !!(await waitDialog(3000)) + " (expect false: dwell " + CONFIG.quarterDwellTurns + ")");
  await nextTurn(); report("S4 turn+1");
  await nextTurn(); report("S4 turn+2");

  // S5 RECOGNITION: the real modal.
  maybeQuarter(collectCitySignals(), false);
  const d = await waitDialog(9000);
  emit("S5 modal appeared=" + !!d + " title=" + J(d && safe(() => d.querySelector("fxs-header").getAttribute("title")))
    + " recognizedAlready=" + J(mine().map((e) => e.rec.recognized !== false)));
  if (d) {
    await later(1200);
    emit("SHOT 5-modal");
    await later(10000);
    const btns = Array.from(d.querySelectorAll("fxs-button"));
    emit("S5 choices=" + J(btns.map((b) => safe(() => b.getAttribute("caption") || b.textContent.trim().slice(0, 40)))));
    if (btns[0]) safe(() => btns[0].dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    await later(3000);
  }
  report("S5");
  emit("S5 verdict stance=" + J(mine().map((e) => e.rec.optionId)));
  look(enclavePlot(), 0.25);
  await later(2500);
  emit("SHOT 6-marker-recognized");
  await later(9000);
  await hoverEnclave("S5");
  emit("SHOT 7-tip-recognized");
  await later(10000);

  // S6 the HOST CITY's own yields across a turn.
  const y0 = hostYields();
  await nextTurn();
  emit("S6 " + cityName(host.city) + " yields before=" + J(y0) + " after=" + J(hostYields()));
  report("S6");

  // S7 CONTESTED.
  recordWarDeclared({ actingPlayer: A.owner, reactingPlayer: local });
  tickContestedQuarters(collectCitySignals());
  await later(3000);
  emit("S7 contested=" + J(mine().map((e) => !!e.rec.contested)) + " chronicle=" + J(chron(/War Tests/i)));
  await hoverEnclave("S7");
  emit("SHOT 8-tip-contested");
  await later(10000);
  recordPeace({ actingPlayer: A.owner, reactingPlayer: local });
  tickContestedQuarters(collectCitySignals());
  await later(2500);
  emit("S7 after peace contested=" + J(mine().map((e) => !!e.rec.contested)));

  // S8 CHANGE OF HANDS: a bigger community from another origin, then its own dwell.
  seed(B, Math.ceil(host.population * 0.9 / 0.8));
  await pass("S8 seeded");
  await nextTurn(); await nextTurn();
  await pass("S8 after dwell");
  const e8 = mine()[0];
  emit("S8 verdict originNow=" + (e8 && e8.rec.civ) + " (was " + A.owner + ", expect " + B.owner + ") chronicle=" + J(chron(/Hands|Gives Way|Takes Root/i)));
  look(enclavePlot(), 0.25);
  await later(2500);
  emit("SHOT 9-changed-hands");
  await later(9000);

  // S9 FADE.
  const lastPlot = enclavePlot();
  sendHome(A, A.owner, 80); sendHome(B, B.owner, 80);
  emit("S9 community left: comp=" + J(comp(host.city)) + " fadeTurns=" + CONFIG.quarterFadeTurns);
  for (let i = 1; i <= 5 && mine().length; i++) { await nextTurn(); report("S9 turn+" + i); }
  emit("S9 verdict recordsLeft=" + mine().length + " plotNow=" + J(lastPlot != null ? plotInfo(lastPlot) : null) + " fades=" + J(chron(/Fades/i)));
  if (lastPlot != null) look(lastPlot, 0.25);
  await later(2500);
  emit("SHOT 10-faded");
  await later(9000);

  emit("S9 chronicle=" + J(safe(() => (chronicleLog(60) || []).map((e) => String(e.title)))));
  restoreKnobs();
  await later(3000);
  emit("DONE modtest129 finished");
}

emit("modtest129 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); safe(() => restoreKnobs()); emit("DONE modtest129 finished"); }); }, 12000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
