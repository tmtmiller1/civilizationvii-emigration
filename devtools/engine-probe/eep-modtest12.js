// eep-modtest12.js - an enclave BUILT OVER is destroyed. AugustusExp66: London is completing El Escorial on
// plot 2874 (its outlying mine), which displaced enclaves placed there in mod tests 15 to 18. Place a
// Goryeo enclave there through the shipped path, put its record, end turns, and watch the mod's own
// per-turn pass retire the record and chronicle it. Logs [EmigTest].

import { placeEnclave, enclaveStanding } from "/emigration/ui/emigration-enclave-place.js";
import { putQuarter, quarterAt, quartersForOwner } from "/emigration/ui/emigration-quarter-state.js";
import { chronicleLog } from "/emigration/ui/emigration-chronicle.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, finished = false, key = null, rec = null, loc = null;
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function plotInfo(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null; return info ? info.ConstructibleType : "?"; }), []); }
function status(tag) {
  const r = quarterAt(key);
  const chron = safe(() => (chronicleLog(20) || []).filter((e) => /Built Over|built over/i.test(String(e.title || "") + String(e.body || ""))).length, "ERR");
  emit(tag + " plot=" + J(plotInfo(loc)) + " record=" + (r ? J({ placed: r.placed }) : "DROPPED") + " standing=" + (r ? enclaveStanding(r) : "n/a") + " builtOverChronicle=" + chron + " records=" + quartersForOwner(local).length);
}

async function run() {
  local = GameContext.localPlayerID;
  const sigs = collectCitySignals();
  const L = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population)[0];
  emit("START turn=" + safe(() => Game.turn) + " L=" + cityName(L.city) + " turnActive=" + safe(() => Players.get(local).isTurnActive));
  const r = placeEnclave(L.city, "CIVILIZATION_GORYEO", "a");
  if (!r) { emit("placement failed"); finished = true; setTimeout(endTurn, 2000); return; }
  key = "probe:" + local + ":" + r.plot;
  // A REAL origin player id (the largest foreign civ's owner): the first two runs used 99, a player that
  // does not exist, and crashed natively right after the built-over branch chronicled the loss.
  const originPid = sigs.filter((s) => s.owner !== local && !s.isCityState).sort((a, b) => b.population - a.population)[0].owner;
  emit("ORIGIN pid=" + originPid);
  rec = { civ: originPid, originCiv: "CIVILIZATION_GORYEO", owner: local, optionId: "a", turn: safe(() => Game.turn, 0),
    applied: { benefitYield: "YIELD_CULTURE", benefitAmount: 2, penaltyYield: null, penaltyAmount: 0 }, contested: false, contestedTurn: -999, placed: r };
  putQuarter(key, rec);
  loc = GameplayMap.getLocationFromIndex(r.plot);
  await later(7000);
  status("PLACED " + J(r));
  emit("ACTIONS done; ending 3 turns");
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
  // The mod's own pass runs on turn activation; give it a few seconds, then read.
  if (n < 4) setTimeout(() => { status("TURN+" + (n - 1)); endTurn(); }, 6000);
  else setTimeout(() => { status("TURN+" + (n - 1)); emit("DONE modtest12 finished"); }, 6000);
});
emit("modtest12 attached");
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
