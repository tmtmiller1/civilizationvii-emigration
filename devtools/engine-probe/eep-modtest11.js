// eep-modtest11.js - the SHIPPED themed enclave placement (CONFIG.enclaveTileSkin = 1) on a human
// Exploration save (AugustusExp66). Logs [EmigTest]; "SHOT <name>" lines ask the runner for screenshots.
//   For each (origin, stance) below, placeEnclave on one of the player's cities, put the quarter record,
//   read the plot (type on it, yields) 7 s later, and log which candidate won and why:
//     Goryeo a   -> its own Gama (unique, Exploration)              in city 1
//     Rome a     -> Hidden Fortress on a hill, else Hillfort, else Caravanserai  in city 2
//     Mughal a   -> Stepwell is Modern (not loaded) -> culture fallback (Gama)   in city 3
//     Abbasid a  -> science has no skin -> stance b (happiness) -> Thing         in city 4
//     Aksum a    -> its own Hawelt (Antiquity type, flat) in Exploration           in city 1 (2nd tile)
//   Then: the departure list of each city excludes the enclave plots (by record); close-up shots of the
//   first two; end 2 turns; re-read every enclave plot (standing + yields) and the marker count.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { placeEnclave, enclaveStanding, enclaveTypeOf, placedTypesFor, enclaveIndex, enclaveTypeFor } from "/emigration/ui/emigration-enclave-place.js";
import { putQuarter, quartersForOwner } from "/emigration/ui/emigration-quarter-state.js";
import { listDepartureTiles } from "/emigration/ui/emigration-departure-tile.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, finished = false;
const placed = [];
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function yieldsAt(loc) { return safe(() => { const y = GameplayMap.getYields(GameplayMap.getIndexFromLocation(loc), local); return Array.isArray(y) ? y.map((p) => [safe(() => GameInfo.Yields.lookup(p[0]).YieldType, p[0]), p[1]]) : ("raw:" + J(y)); }, "ERR"); }
function plotInfo(loc) { return safe(() => (MapConstructibles.getConstructibles(loc.x, loc.y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null; return info ? info.ConstructibleType : "?"; }), []); }
function look(loc) { safe(() => Camera.lookAtPlot(loc, { zoom: 0, instantaneous: true })); }
function record(sig, originCiv, optionId, r) {
  const key = "probe:" + sig.owner + ":" + r.plot;
  putQuarter(key, { civ: 99, originCiv, owner: local, optionId, turn: safe(() => Game.turn, 0),
    applied: { benefitYield: "YIELD_CULTURE", benefitAmount: 2, penaltyYield: null, penaltyAmount: 0 }, contested: false, contestedTurn: -999, placed: r });
}
async function tryOne(sig, originCiv, optionId, label, shot) {
  const cands = placedTypesFor(enclaveTypeFor(originCiv, optionId), originCiv).map((t) => t + (enclaveIndex(t) == null ? "(unloaded)" : ""));
  const r = placeEnclave(sig.city, originCiv, optionId);
  if (r) record(sig, originCiv, optionId, r);
  await later(7000);
  const loc = r ? GameplayMap.getLocationFromIndex(r.plot) : null;
  emit(label + " " + cityName(sig.city) + " candidates=" + J(cands) + " placed=" + J(r) + (r ? " standing=" + enclaveStanding({ placed: r }) + " plotNow=" + J(plotInfo(loc)) + " yields=" + J(yieldsAt(loc)) : ""));
  if (r) placed.push({ label, sig, r, loc });
  if (r && shot) { look(loc); await later(4000); emit("SHOT " + shot); await later(10000); }
}

async function run() {
  local = GameContext.localPlayerID;
  emit("START turn=" + safe(() => Game.turn) + " skin=" + CONFIG.enclaveTileSkin + " turnActive=" + safe(() => Players.get(local).isTurnActive));
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population);
  const c = (i) => mine[Math.min(i, mine.length - 1)];
  await tryOne(c(0), "CIVILIZATION_GORYEO", "a", "T1 Goryeo", "themed-gama");
  await tryOne(c(1), "CIVILIZATION_ROME", "a", "T2 Rome", "themed-rome");
  await tryOne(c(2), "CIVILIZATION_MUGHAL", "a", "T3 Mughal", null);
  await tryOne(c(3), "CIVILIZATION_ABBASID", "a", "T4 Abbasid", null);
  await tryOne(c(0), "CIVILIZATION_AKSUM", "a", "T5 Aksum", null);
  for (const p of placed) {
    const tiles = listDepartureTiles(p.sig.city);
    emit("EXCLUSION " + p.label + " plot " + p.r.plot + " inDepartureList=" + tiles.some((t) => t.plot === p.r.plot) + " (expect false)");
  }
  emit("RECORDS " + quartersForOwner(local).length + " enclaveTypes=" + J(quartersForOwner(local).map((e) => enclaveTypeOf(e.rec))));
  emit("ACTIONS done; ending 2 turns");
  finished = true;
  setTimeout(endTurn, 2000);
}
function recheck(tag) { for (const p of placed) emit(tag + " " + p.label + " plot " + p.r.plot + " standing=" + enclaveStanding({ placed: p.r }) + " now=" + J(plotInfo(p.loc)) + " yields=" + J(yieldsAt(p.loc))); }

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
  if (n === 2) setTimeout(() => { recheck("TURN+1"); endTurn(); }, 4000);
  if (n >= 3) setTimeout(() => { recheck("TURN+2"); emit("DONE modtest11 finished"); }, 4000);
});
emit("modtest11 attached");
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
