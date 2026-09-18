// eep-modtest3.js - in-game check of the 2026-09-12 tuning pass (the brakes on the real losses). Requires the
// emigration mod loaded. Logs [EmigTest] to UI.log. Mostly READ-ONLY; the only writes are T2 (departure gold
// on the local treasury, 30 gold) and T5 (a disaster loss tally on one foreign city, cleared by decay).
//   T0 the new CONFIG keys are present with their defaults.
//   T1 the pillaged-first / famine-aware reads: does a live constructible instance expose `damaged`, does
//      the live yield table support `.filter` (else the name hint is used), what the ranking picks.
//   T2 chargeDepartureGold: the per-turn cap (10,10,10 then 0) and that the treasury read works.
//   T3 findDepartureBuilding: obsolete-age flag, the current-age read.
//   T4 urbanCrisisBudget on the largest local city (floor(urban x 0.34)).
//   T5 the disaster loss cap gates canShedPoint("disaster") but not "war".
//   T6 the Self-Test rows.
//   then 3 turns for the crash watch.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import {
  listDepartureTiles, rankDepartureTiles, findDepartureTile, findDepartureBuilding, chargeDepartureGold,
  urbanCrisisBudget, canShedPoint
} from "/emigration/ui/emigration-departure-tile.js";
import { recordDisasterLoss, disasterLossCapReached } from "/emigration/ui/emigration-disasters.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { runChecks } from "/emigration/ui/emigration-selftest-checks.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1, n = 0, endTurnTimer = null, blockedTries = 0;
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function treasury() { return safe(() => Players.get(local).Treasury.goldBalance, null); }

async function run() {
  local = GameContext.localPlayerID;
  emit("T0 CONFIG goldCap=" + CONFIG.departureGoldPerTurnCap + " urbanCap=" + CONFIG.urbanLossCapPct + " recovery=" + CONFIG.urbanRecoveryTurns + " disasterCap=" + CONFIG.disasterLossCapPct + " gold=" + CONFIG.departureGold);
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population);
  const foreign = sigs.filter((s) => s.owner !== local && !s.isCityState && !s.isTown).sort((a, b) => b.population - a.population);
  const L = mine[0], F = foreign[0];
  emit("TARGETS L=" + cityName(L.city) + " urban=" + L.urban + " rural=" + L.rural + " starving=" + L.starving + " F=" + cityName(F.city) + " pop=" + F.population);

  // T1 live reads behind the ranking
  {
    const tiles = listDepartureTiles(L.city);
    const first = tiles[0];
    const inst = first ? safe(() => Constructibles.getByComponentID(first.elem), null) : null;
    emit("T1 tiles=" + tiles.length + " instKeys=" + J(inst ? Object.keys(inst) : null) + " damagedProp=" + (inst ? typeof inst.damaged + ":" + inst.damaged : "n/a"));
    emit("T1 yieldTable filter=" + safe(() => typeof GameInfo.Constructible_YieldChanges.filter) + " len=" + safe(() => GameInfo.Constructible_YieldChanges.length));
    emit("T1 tiles=" + J(tiles.map((t) => ({ type: t.type, dmg: t.damaged, feeds: t.feeds, res: t.onResource, d: t.distance }))));
    const pick = findDepartureTile(L.city), pickFamine = findDepartureTile(L.city, { avoidFood: true });
    emit("T1 pick=" + (pick && pick.type) + " pickUnderFamine=" + (pickFamine && pickFamine.type) + " ranked=" + J(rankDepartureTiles(tiles, { avoidFood: true }).map((t) => t.type)));
    // Any pillaged tile anywhere on the map among my cities?
    const dmg = [];
    for (const s of mine) for (const t of listDepartureTiles(s.city)) if (t.damaged) dmg.push(cityName(s.city) + ":" + t.type);
    emit("T1 pillagedTilesInMyCities=" + J(dmg));
  }
  // T2 gold cap + treasury read
  {
    const before = treasury();
    const charged = [chargeDepartureGold(local), chargeDepartureGold(local), chargeDepartureGold(local), chargeDepartureGold(local)];
    await later(3000);
    emit("T2 charged=" + J(charged) + " treasuryBefore=" + before + " after=" + treasury() + " (expect 10,10,10,0 and -30)");
  }
  // T3 building choice + age read
  {
    const b = findDepartureBuilding(L.city);
    emit("T3 building=" + J(b && { type: b.type, cost: b.cost, obsolete: b.obsolete, d: b.distance }) + " age=" + safe(() => Game.age) + " ageType=" + safe(() => GameInfo.Ages.lookup(Game.age).AgeType));
  }
  // T4 urban crisis budget
  {
    emit("T4 " + cityName(L.city) + " urban=" + L.city.urbanPopulation + " crisisBudget=" + urbanCrisisBudget(L.city) + " (expect floor(urban x " + CONFIG.urbanLossCapPct + "))");
  }
  // T5 disaster cap gate
  {
    const src = { ...F, disaster: 99 };
    const before = canShedPoint(src, "disaster");
    const cap = Math.max(1, Math.floor(CONFIG.disasterLossCapPct * F.population));
    for (let i = 0; i < cap; i++) recordDisasterLoss(F.city, F.population);
    emit("T5 " + cityName(F.city) + " pop=" + F.population + " capPoints=" + cap + " shedBefore=" + before + " capReached=" + disasterLossCapReached(F.city) + " shedDisasterNow=" + canShedPoint(src, "disaster") + " shedWarNow=" + canShedPoint(src, "war") + " (expect true,true,false,true)");
  }
  // T6 self-test rows
  {
    const rows = safe(() => runChecks(), []);
    for (const r of rows) if (/urban core|Departures/.test(r.label)) emit("SELFTEST " + r.label + " [" + r.status + "] " + r.detail);
  }
  emit("ACTIONS done; ending turns (3 turns for the crash watch)");
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
  if (n >= 2) setTimeout(() => { if (n >= 4) emit("DONE modtest3 finished"); else endTurn(); }, 3000);
});
emit("modtest3 attached");
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
