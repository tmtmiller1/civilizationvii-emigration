// eep-modtest14.js - takeover COMPENSATION: an enclave that replaces a worked tile pays back what that
// tile gave. AugustusExp66, themed skin, the shipped placeEnclave + the shipped per-turn upkeep (the mod's
// own pass settles and pays). Logs [EmigTest].
//   Place a Chola enclave (gold → Caravanserai) over an outlying LAND farmstead in a city of mine, with a
//   record for a real origin player; log the plot yields before, after 7 s, the record's `before`; end a
//   turn; log placed.stood / placed.compensation and the owner's culture/food/production/gold net yields
//   per turn before and after (the compensation is a per-turn grant, so the treasury deltas show it).

import { placeEnclave, enclaveStanding, nativeYieldsOf, plotYieldsAt, emptyPlotsOf } from "/emigration/ui/emigration-enclave-place.js";
import { listDepartureTiles } from "/emigration/ui/emigration-departure-tile.js";
import { putQuarter, quarterAt } from "/emigration/ui/emigration-quarter-state.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, finished = false, key = null, plot = -1;
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function treasury() { return safe(() => Math.round(Players.get(local).Treasury.goldBalance * 100) / 100); }
function status(tag) {
  const r = quarterAt(key);
  emit(tag + " plotYields=" + J(plotYieldsAt(plot, local)) + " placed=" + J(r && r.placed) + " standing=" + (r ? enclaveStanding(r) : "n/a") + " treasury=" + treasury());
}

async function run() {
  local = GameContext.localPlayerID;
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population);
  const originPid = sigs.filter((s) => s.owner !== local && !s.isCityState).sort((a, b) => b.population - a.population)[0].owner;
  // A city with NO empty plot (so the takeover path runs) and a land farmstead to take over; not London
  // (its outlying plot gets El Escorial next turn).
  const land = (s) => listDepartureTiles(s.city).some((t) => !safe(() => GameplayMap.isWater(t.loc.x, t.loc.y), true));
  const C = mine.find((s) => cityName(s.city) !== "London" && emptyPlotsOf(s.city).length === 0 && land(s)) || mine[1];
  emit("CITY " + cityName(C.city) + " emptyPlots=" + emptyPlotsOf(C.city).length + " landTiles=" + land(C));
  emit("START turn=" + safe(() => Game.turn) + " city=" + cityName(C.city) + " origin=" + originPid + " nativeCaravanserai=" + J(nativeYieldsOf("IMPROVEMENT_CARAVANSERAI")));
  // Force the TAKEOVER path: hide the city's empty plots from the placer (a proxy overriding only
  // getPurchasedPlots; every other read goes to the real city object).
  const hidden = new Set(emptyPlotsOf(C.city).map((e) => e.plot));
  const target = new Proxy(C.city, { get(t, k) { return k === "getPurchasedPlots" ? () => (t.getPurchasedPlots() || []).filter((i) => !hidden.has(i)) : Reflect.get(t, k); } });
  const r = placeEnclave(target, "CIVILIZATION_CHOLA", "a");
  if (!r) { emit("placement failed"); finished = true; setTimeout(endTurn, 2000); return; }
  plot = r.plot; key = "probe:" + local + ":" + r.plot;
  putQuarter(key, { civ: originPid, originCiv: "CIVILIZATION_CHOLA", owner: local, optionId: "a", turn: safe(() => Game.turn, 0),
    applied: { benefitYield: null, benefitAmount: 0, penaltyYield: null, penaltyAmount: 0 }, contested: false, contestedTurn: -999, placed: r });
  emit("PLACED " + J(r) + " (before = the farmstead's plot yields)");
  await later(7000);
  status("AFTER-CREATE");
  emit("ACTIONS done; ending 2 turns");
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
  if (n === 2) setTimeout(() => { status("TURN+1 (settled by the mod's pass)"); endTurn(); }, 6000);
  if (n >= 3) setTimeout(() => { status("TURN+2 (paid again)"); emit("DONE modtest14 finished"); }, 6000);
});
emit("modtest14 attached");
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
