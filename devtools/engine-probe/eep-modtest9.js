// eep-modtest9.js - the Village-skinned enclave (CONFIG.enclaveTileSkin = 1). Human-controlled Exploration
// save (AugustusExp66). Logs [EmigTest]; "SHOT" lines ask the runner for screenshots.
//   S1 empty-plot path (a city with an empty plot): placeEnclave -> a Village with a rural district; plot
//      yields before/after (expect +2 Culture from data/emigration-enclave-village.xml); quarter record put.
//   S2 takeover path (London): the outlying tile replaced by a Village; yields before/after; record put.
//   S3 markers: the record-driven marker (civ symbol + "<Civ> Enclave") over each Village; close-up shots
//      "village-enclave-empty" and "village-enclave-takeover".
//   then end one turn, re-read yields, DONE.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { placeEnclave, enclaveStanding, enclaveTypeOf, villageSkin } from "/emigration/ui/emigration-enclave-place.js";
import { putQuarter, quartersForOwner } from "/emigration/ui/emigration-quarter-state.js";
import { findDepartureTile, listDepartureTiles } from "/emigration/ui/emigration-departure-tile.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { emptyPlotsOf } from "/emigration/ui/emigration-enclave-place.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, finished = false;
const placedLocs = [];
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function yieldsAt(loc) { return safe(() => { const y = GameplayMap.getYields(GameplayMap.getIndexFromLocation(loc), local); return Array.isArray(y) ? y.map((p) => [safe(() => GameInfo.Yields.lookup(p[0]).YieldType, p[0]), p[1]]) : ("raw:" + J(y)); }, "ERR"); }
function plotInfo(loc) { return safe(() => (MapConstructibles.getConstructibles(loc.x, loc.y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null; return info ? info.ConstructibleType : "?"; }), []); }
function look(loc) { safe(() => Camera.lookAtPlot(loc, { zoom: 0, instantaneous: true })); }
function record(sig, originCiv, optionId, placed) {
  const key = "probe:" + sig.owner + ":" + placed.plot;
  const rec = { civ: 99, originCiv, owner: local, optionId, turn: safe(() => Game.turn, 0),
    applied: { benefitYield: "YIELD_CULTURE", benefitAmount: 2, penaltyYield: null, penaltyAmount: 0 },
    contested: false, contestedTurn: -999, placed };
  const ok = safe(() => { putQuarter(key, rec); return true; }, false);
  const back = safe(() => quartersForOwner(local).find((e) => e.rec.placed && e.rec.placed.plot === placed.plot), null);
  emit("RECORD put=" + ok + " readback=" + J(back && back.rec.placed) + " enclaveTypeOf=" + (back ? enclaveTypeOf(back.rec) : null) + " standing=" + (back ? enclaveStanding(back.rec) : null));
}
async function place(sig, originCiv, optionId, label) {
  const emp = emptyPlotsOf(sig.city);
  const target = emp.length ? emp[0] : findDepartureTile(sig.city);
  if (!target) { emit(label + " no plot in " + cityName(sig.city)); return null; }
  const before = { plot: plotInfo(target.loc), yields: yieldsAt(target.loc) };
  const r = placeEnclave(sig.city, originCiv, optionId);
  if (r) record(sig, originCiv, optionId, r);
  await later(7000);
  const loc = r ? GameplayMap.getLocationFromIndex(r.plot) : target.loc;
  emit(label + " " + cityName(sig.city) + " placed=" + J(r) + " standing=" + (r ? enclaveStanding({ placed: r }) : "n/a") + " before=" + J(before) + " after=" + J({ plot: plotInfo(loc), yields: yieldsAt(loc) }) + " (expect a Village and +2 Culture)");
  if (r) placedLocs.push({ loc, label });
  return r;
}

async function run() {
  local = GameContext.localPlayerID;
  emit("START turn=" + safe(() => Game.turn) + " skin=" + CONFIG.enclaveTileSkin + " villageSkin=" + villageSkin() + " villageIdx=" + safe(() => GameInfo.Constructibles.lookup("IMPROVEMENT_VILLAGE").$index) + " modifierLoaded=" + safe(() => !!GameInfo.Modifiers.lookup("MOD_EMIG_VILLAGE_ENCLAVE_CULTURE")) + " turnActive=" + safe(() => Players.get(local).isTurnActive));
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population);
  const withEmpty = mine.find((s) => emptyPlotsOf(s.city).length > 0);
  if (withEmpty) await place(withEmpty, "CIVILIZATION_ROME", "a", "S1 empty-plot");
  else emit("S1 no city with an empty plot");
  await place(mine[0], "CIVILIZATION_GREECE", "b", "S2 takeover");
  for (const p of placedLocs) {
    look(p.loc);
    await later(4000);
    emit("SHOT " + (p.label.startsWith("S1") ? "village-enclave-empty" : "village-enclave-takeover"));
    await later(10000);
  }
  emit("DEPARTURE-EXCLUSION " + cityName(mine[0].city) + " tiles=" + J(listDepartureTiles(mine[0].city).map((t) => t.type)) + " (no IMPROVEMENT_VILLAGE expected)");
  emit("ACTIONS done; ending the turn");
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
  if (finished) setTimeout(() => { for (const p of placedLocs) emit("NEXT TURN " + p.label + " plot=" + J(plotInfo(p.loc)) + " yields=" + J(yieldsAt(p.loc))); emit("DONE modtest9 finished"); }, 4000);
});
emit("modtest9 attached");
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
