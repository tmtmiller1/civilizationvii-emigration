// eep-game.js - game scope. Hands-free engine probe for the Emigration mod's open questions (run 2).
//   Q1  does addRuralPopulation(-1)/(+1) change a city's improvements / NET yields / growth threshold?
//       (measured on LOCAL cities with no Autoplay in between, plus a foreign +1)
//   Q2  does Players.grantYield(pid, YIELD_HAPPINESS, -n) change any city's happiness, or only the
//       player-level celebration meter?  (answered in run 1: lifetime stockpile only)
//   Q3  can the local player be handed a UNIT_MIGRANT via CREATE_ELEMENT and RESETTLE it?
// Turn plan: n=1 settle (end turn, any unblocker) | n=2 writes, clean end turn | n=3 measure, spawn
// migrant | n=4 measure, resettle migrant | n=5 measure, DONE.  Every line -> UI.log via console.error.

const TAG = "[EmigProbe]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

let n = 0;
let local = -1;
let ids = { C1: null, C2: null, C3: null, F: null, Fowner: -1 };
let endTurnTimer = null;
let blockedTries = 0;
let autoplayUsed = false;

const YIELDS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS", "YIELD_DIPLOMACY"];
function yt(k) { return safe(() => YieldTypes[k], null); }
function cityName(c) { return safe(() => (Locale && Locale.compose ? Locale.compose(c.name) : String(c.name)), "?"); }
function city(id) { return id ? safe(() => Cities.get(id), null) : null; }

function improvementCount(c) {
  return safe(() => {
    const plots = c.getPurchasedPlots();
    let all = 0, imp = 0;
    for (const idx of plots) {
      const loc = GameplayMap.getLocationFromIndex(idx);
      for (const id of (MapConstructibles.getConstructibles(loc.x, loc.y) || [])) {
        all++;
        const inst = Constructibles.getByComponentID(id);
        const info = inst ? GameInfo.Constructibles.lookup(inst.type) : null;
        if (info && info.ConstructibleClass === "IMPROVEMENT") imp++;
      }
    }
    return { plots: plots.length, constructibles: all, improvements: imp };
  }, null);
}

function plotMap(c) {
  return safe(() => {
    const out = {};
    for (const idx of c.getPurchasedPlots()) {
      const loc = GameplayMap.getLocationFromIndex(idx);
      const names = [];
      for (const id of (MapConstructibles.getConstructibles(loc.x, loc.y) || [])) {
        const inst = Constructibles.getByComponentID(id);
        const info = inst ? GameInfo.Constructibles.lookup(inst.type) : null;
        names.push(info ? info.ConstructibleType : "?");
      }
      if (names.length) out[idx] = names;
    }
    return out;
  }, null);
}
function notifTypes() {
  return safe(() => { const ids = Game.Notifications.getIdsForPlayer(local) || []; const out = {}; for (const id of ids) { const t = Game.Notifications.getTypeName(id); out[t] = (out[t] || 0) + 1; } return out; }, null);
}
function snapCity(c) {
  if (!c) return null;
  const s = { name: cityName(c), owner: c.owner, pop: c.population, rural: c.ruralPopulation, urban: c.urbanPopulation };
  s.specialists = safe(() => c.Workers.getNumWorkers(false), null);
  s.pending = safe(() => c.pendingPopulation, null);
  s.net = {};
  for (const k of YIELDS) { const t = yt(k); if (t != null) s.net[k.replace("YIELD_", "")] = safe(() => Math.round(c.Yields.getNetYield(t) * 100) / 100, null); }
  s.foodToGrow = safe(() => c.Growth.getNextGrowthFoodThreshold().value, null);
  s.turnsToGrow = safe(() => c.Growth.turnsUntilGrowth, null);
  s.currentFood = safe(() => c.Growth.currentFood, null);
  s.cityHappyNet = safe(() => c.Happiness.netHappinessPerTurn, null);
  s.queue = safe(() => c.BuildQueue.getQueue().length, null);
  s.tiles = improvementCount(c);
  return s;
}

function snapPlayer(pid) {
  const p = safe(() => Players.get(pid), null);
  if (!p) return null;
  const s = { pid };
  s.netHappy = safe(() => p.Stats.getNetYield(yt("YIELD_HAPPINESS")), null);
  s.lifetimeHappy = safe(() => p.Stats.getLifetimeYield(yt("YIELD_HAPPINESS")), null);
  s.nextCelebration = safe(() => p.Happiness.nextGoldenAgeThreshold, null);
  s.inCelebration = safe(() => p.Happiness.isInGoldenAge(), null);
  s.gold = safe(() => p.Treasury.goldBalance, null);
  s.netGold = safe(() => p.Stats.getNetYield(yt("YIELD_GOLD")), null);
  return s;
}

function pickTargets() {
  local = GameContext.localPlayerID;
  const mine = Players.get(local).Cities.getCities().filter((c) => !c.isTown).slice().sort((a, b) => b.population - a.population);
  if (mine.length > 0) ids.C1 = mine[0].id;
  if (mine.length > 1) ids.C2 = mine[1].id;
  if (mine.length > 2) ids.C3 = mine[2].id;
  if (!ids.C3) { const any = Players.get(local).Cities.getCities().filter((c) => c.id.id !== ids.C1.id && c.id.id !== ids.C2.id); if (any.length) ids.C3 = any[0].id; }
  let best = null;
  for (const p of Players.getAlive()) {
    if (p.id === local || !p.isMajor) continue;
    for (const c of (safe(() => p.Cities.getCities(), []) || [])) if (!best || c.population > best.population) best = c;
  }
  if (best) { ids.F = best.id; ids.Fowner = best.owner; }
  emit("TARGETS local=" + local + " C1(-1)=" + J(ids.C1) + " C2(+1)=" + J(ids.C2) + " C3(ctrl,migrant)=" + J(ids.C3) + " F(+1)=" + J(ids.F) + " Fowner=" + ids.Fowner);
}

function snapAll(phase) {
  emit("SNAP n=" + n + " phase=" + phase + " turn=" + safe(() => Game.turn, "?") + " autoplayUsed=" + autoplayUsed + " C1 " + J(snapCity(city(ids.C1))));
  emit("SNAP n=" + n + " phase=" + phase + " C2 " + J(snapCity(city(ids.C2))));
  emit("SNAP n=" + n + " phase=" + phase + " C3 " + J(snapCity(city(ids.C3))));
  emit("SNAP n=" + n + " phase=" + phase + " F " + J(snapCity(city(ids.F))));
  emit("SNAP n=" + n + " phase=" + phase + " P " + J(snapPlayer(local)));
  emit("SNAP n=" + n + " phase=" + phase + " PF " + J(snapPlayer(ids.Fowner)));
  emit("PLOTS n=" + n + " phase=" + phase + " C1 " + J(plotMap(city(ids.C1))));
  emit("PLOTS n=" + n + " phase=" + phase + " C2 " + J(plotMap(city(ids.C2))));
  emit("NOTIFS n=" + n + " phase=" + phase + " " + J(notifTypes()));
  if (n === 1) { const c = city(ids.C1); const idx = safe(() => c.getPurchasedPlots()[1], null); const loc = idx != null ? GameplayMap.getLocationFromIndex(idx) : null; emit("YIELDSHAPE getYields(loc,local)=" + J(safe(() => GameplayMap.getYields(loc, local), null)) + " getYieldsWithCity=" + J(safe(() => GameplayMap.getYieldsWithCity(loc, c.id), null))); }
}

function actWrites() {
  emit("ACT addRuralPopulation(-1) on C1 -> " + safe(() => { city(ids.C1).addRuralPopulation(-1); return "ok"; }));
  emit("ACT addRuralPopulation(+1) on C2 -> " + safe(() => { city(ids.C2).addRuralPopulation(1); return "ok"; }));
  emit("ACT addRuralPopulation(+1) on F -> " + safe(() => { city(ids.F).addRuralPopulation(1); return "ok"; }));
  emit("ACT grantYield(local, YIELD_HAPPINESS, -100) -> " + safe(() => { Players.grantYield(local, yt("YIELD_HAPPINESS"), -100); return "ok"; }));
}

function actSpawnMigrant() {
  const loc = safe(() => city(ids.C3).location, null);
  const r = safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { IndependentIndex: -1, Kind: "UNIT", Location: loc, Owner: local, Type: "UNIT_MIGRANT" }), null);
  emit("ACT CREATE_ELEMENT UNIT_MIGRANT at C3 " + J(loc) + " -> " + J(r));
}

function migrants() {
  return safe(() => Players.get(local).Units.getUnits().filter((u) => { const i = GameInfo.Units.lookup(u.type); return i && i.UnitType === "UNIT_MIGRANT"; }), []);
}

function actResettle() {
  const ms = migrants();
  emit("MIGRANTS local holds " + ms.length);
  if (!ms.length) return;
  const u = ms[0];
  const can = safe(() => Game.UnitCommands.canStart(u.id, UnitCommandTypes.RESETTLE, {}, false), null);
  emit("RESETTLE canStart " + J({ Success: can && can.Success, plots: can && can.Plots ? can.Plots.length : null }));
  if (can && can.Plots && can.Plots.length) {
    const loc = GameplayMap.getLocationFromIndex(can.Plots[0]);
    const owner = safe(() => GameplayMap.getOwningCityFromXY(loc.x, loc.y), null);
    emit("RESETTLE target plot " + J(loc) + " owned by city " + J(owner) + " -> " + J(safe(() => Game.UnitCommands.sendRequest(u.id, "UNITCOMMAND_RESETTLE", { X: loc.x, Y: loc.y }), null)));
  }
}

// ── blockers ────────────────────────────────────────────────────────────────────────────────────
function blockingName() {
  return safe(() => { const t = Game.Notifications.getEndTurnBlockingType(local); for (const k of Object.keys(EndTurnBlockingTypes)) if (EndTurnBlockingTypes[k] === t) return k; return String(t); }, "?");
}
function hashOf(typeName, fallback) { return safe(() => { const t = GameInfo.Types.lookup(typeName); return t && t.Hash != null ? t.Hash : fallback; }, fallback); }

function assignResources() {
  const p = Players.get(local);
  const res = safe(() => p.Resources.getResources(), []) || [];
  const assigned = new Set();
  const cities = p.Cities.getCities();
  for (const c of cities) for (const r of (safe(() => c.Resources.getAssignedResources(), []) || [])) assigned.add(r.value);
  let sent = 0, unassigned = 0;
  for (const r of res) {
    if (assigned.has(r.value)) continue;
    unassigned++;
    const loc = GameplayMap.getLocationFromIndex(r.value);
    for (const c of cities) {
      const args = { Location: loc, City: c.id.id };
      const can = safe(() => Game.PlayerOperations.canStart(local, PlayerOperationTypes.ASSIGN_RESOURCE, args, false), null);
      if (can && can.Success) { safe(() => Game.PlayerOperations.sendRequest(local, PlayerOperationTypes.ASSIGN_RESOURCE, args)); sent++; break; }
    }
  }
  emit("UNBLOCK assignResources total=" + res.length + " unassigned=" + unassigned + " sent=" + sent);
}

// The base screens clear "must consider" blockers by sending a CONSIDER_* player op on close.
function considerAll() {
  const sent = [];
  for (const k of ["CONSIDER_ASSIGN_RESOURCE", "CONSIDER_ASSIGN_TRADITIONS", "CONSIDER_ASSIGN_ATTRIBUTE", "CONSIDER_RAZE_CITY"]) {
    const op = safe(() => PlayerOperationTypes[k], null); if (op == null) continue;
    const can = safe(() => Game.PlayerOperations.canStart(local, op, {}, false), null);
    if (can && can.Success) { safe(() => Game.PlayerOperations.sendRequest(local, op, {})); sent.push(k); }
  }
  for (const k of ["CONSIDER_ASSIGN_RESOURCE", "PLAYEROPERATION_CONSIDER_ASSIGN_RESOURCE"]) safe(() => { Game.PlayerOperations.sendRequest(local, k, {}); sent.push("str:" + k); });
  emit("UNBLOCK consider ops sent: " + J(sent));
}

function placePopulation(c) {
  const can = safe(() => Game.CityCommands.canStart(c.id, CityCommandTypes.EXPAND, {}, false), null);
  if (!can || !can.Plots || !can.Plots.length) { emit("UNBLOCK placePopulation " + cityName(c) + " no plots " + J(can && can.Success)); return false; }
  const loc = GameplayMap.getLocationFromIndex(can.Plots[0]);
  const args = { X: loc.x, Y: loc.y };
  if (can.ConstructibleTypes && can.ConstructibleTypes[0] != null) args.ConstructibleType = can.ConstructibleTypes[0];
  emit("UNBLOCK placePopulation " + cityName(c) + " at " + J(loc) + " -> " + J(safe(() => Game.CityCommands.sendRequest(c.id, CityCommandTypes.EXPAND, args), "ERR")));
  return true;
}

function queueSomething(c) {
  if (safe(() => c.isTown, false)) { safe(() => Game.CityOperations.sendRequest(c.id, CityOperationTypes.CONSIDER_TOWN_PROJECT, {})); return true; }
  const units = safe(() => Game.CityOperations.canStartQuery(c.id, CityOperationTypes.BUILD, CityQueryType.Unit), null) || [];
  for (const { index, result } of units) {
    if (!result || !result.Success) continue;
    const def = GameInfo.Units.lookup(index); if (!def) continue;
    const args = { UnitType: hashOf(def.UnitType, index) };
    const can = safe(() => Game.CityOperations.canStart(c.id, CityOperationTypes.BUILD, args, false), null);
    if (!can || !can.Success) continue;
    emit("UNBLOCK queued " + def.UnitType + " in " + cityName(c) + " -> " + J(safe(() => Game.CityOperations.sendRequest(c.id, CityOperationTypes.BUILD, args), "ERR")));
    return true;
  }
  emit("UNBLOCK nothing buildable in " + cityName(c));
  return false;
}

function chooseNode(opName) {
  const op = PlayerOperationTypes[opName];
  let done = false;
  safe(() => GameInfo.ProgressionTreeNodes.forEach((node) => {
    if (done) return;
    for (const v of [node.ProgressionTreeNodeType, node.$index, hashOf(node.ProgressionTreeNodeType, null)]) {
      if (v == null) continue;
      const args = { ProgressionTreeNodeType: v };
      const can = Game.PlayerOperations.canStart(local, op, args, false);
      if (can && can.Success) { Game.PlayerOperations.sendRequest(local, op, args); emit("UNBLOCK " + opName + " -> " + node.ProgressionTreeNodeType); done = true; return; }
    }
  }));
  if (!done) emit("UNBLOCK " + opName + " found no startable node");
}

function unblock(b) {
  try {
    const nid = safe(() => Game.Notifications.findEndTurnBlocking(local, Game.Notifications.getEndTurnBlockingType(local)), null);
    const notif = nid ? safe(() => Game.Notifications.find(nid), null) : null;
    const tname = nid ? safe(() => Game.Notifications.getTypeName(nid), "?") : "?";
    const target = notif && notif.Target ? safe(() => Cities.get(notif.Target), null) : null;
    emit("UNBLOCK blocking=" + b + " notif=" + J(nid) + " type=" + tname + " target=" + (target ? cityName(target) : "none"));
    if (tname === "NOTIFICATION_CHOOSE_TECH") return chooseNode("SET_TECH_TREE_NODE");
    if (tname === "NOTIFICATION_CHOOSE_CULTURE_NODE") return chooseNode("SET_CULTURE_TREE_NODE");
    if (tname === "NOTIFICATION_ASSIGN_NEW_RESOURCES") return considerAll();
    if (tname === "NOTIFICATION_NEW_POPULATION") {
      if (target) return placePopulation(target);
      for (const c of Players.get(local).Cities.getCities()) if (safe(() => c.pendingPopulation, 0) > 0) placePopulation(c);
      return;
    }
    if (tname === "NOTIFICATION_CHOOSE_CITY_PRODUCTION") {
      if (target) return queueSomething(target);
      for (const c of Players.get(local).Cities.getCities()) { const q = safe(() => c.BuildQueue.getQueue(), null); if (Array.isArray(q) && q.length === 0) queueSomething(c); }
      return;
    }
    if (nid) { emit("UNBLOCK unhandled " + tname + " dismiss -> " + J(safe(() => Game.Notifications.dismiss(nid), "ERR"))); considerAll(); }
  } catch (e) { emit("UNBLOCK threw " + e); }
}

function endTurn() {
  try {
    const me = Players.get(local);
    if (!me.isTurnActive) { emit("ENDTURN not active; skip"); return; }
    if (GameContext.hasSentTurnComplete()) { emit("ENDTURN already sent"); return; }
    const b = blockingName();
    emit("ENDTURN blocking=" + b);
    if (b !== "NONE") {
      blockedTries++;
      if (blockedTries >= 12 && typeof Autoplay !== "undefined") {
        emit("ENDTURN still blocked after " + blockedTries + " tries; FALLBACK Autoplay 1 turn");
        autoplayUsed = true;
        safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); return "ok"; });
        blockedTries = 0;
        endTurnTimer = setTimeout(endTurn, 30000);
        return;
      }
      unblock(b);
      endTurnTimer = setTimeout(endTurn, 5000);
      return;
    }
    blockedTries = 0;
    safe(() => UI.Player.deselectAllUnits());
    GameContext.sendTurnComplete();
    emit("ENDTURN sent for n=" + n + " (clean, no autoplay this turn=" + !autoplayUsed + ")");
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}

// ── stages ──────────────────────────────────────────────────────────────────────────────────────
function stage() {
  try {
    if (n === 1) { pickTargets(); snapAll("t1"); setTimeout(endTurn, 2000); return; }
    if (n === 2) { snapAll("pre"); actWrites(); setTimeout(() => { snapAll("post"); setTimeout(endTurn, 2000); }, 2500); return; }
    if (n === 3) { snapAll("t3"); actSpawnMigrant(); setTimeout(() => { snapAll("t3post"); setTimeout(endTurn, 2000); }, 2500); return; }
    if (n === 4) { snapAll("t4"); actResettle(); setTimeout(() => { snapAll("t4post"); setTimeout(endTurn, 2000); }, 3000); return; }
    if (n === 5) { snapAll("t5"); emit("DONE probe finished; leaving the game running"); return; }
  } catch (e) { emit("stage threw " + e); }
}

function onTurn(data) {
  const who = data && (data.player ?? data.Player);
  if (who !== GameContext.localPlayerID) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++;
  emit("TURN activated n=" + n + " turn=" + safe(() => Game.turn, "?") + " previousTurnUsedAutoplay=" + autoplayUsed);
  autoplayUsed = false;
  blockedTries = 0;
  setTimeout(stage, 3000);
}

emit("game attached (run 2)");
try { engine.on("PlayerTurnActivated", onTurn); } catch (e) { emit("engine.on failed " + e); }

function loadStateName() {
  return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?");
}
let beginTries = 0;
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    emit("LOAD state=GameStarted; starting probe");
    setTimeout(() => {
      if (n === 0 && safe(() => Players.get(GameContext.localPlayerID).isTurnActive, false)) { n = 1; emit("TURN already active at load; n=1 turn=" + safe(() => Game.turn, "?")); stage(); }
      else if (n === 0) emit("turn not active after GameStarted; waiting for PlayerTurnActivated");
    }, 6000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) emit("LOAD state=" + st + " -> UI.notifyUIReady() " + J(safe(() => { UI.notifyUIReady(); return "ok"; })));
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up waiting for GameStarted");
}
setTimeout(beginPoll, 3000);
