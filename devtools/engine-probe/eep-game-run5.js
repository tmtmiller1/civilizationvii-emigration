// eep-game.js - run 5. Three questions:
//   G   does a -1 pending population cancel the city's next food growth?  (-1 on the local city closest to growing)
//   D   is DESTROY_ELEMENT {Kind:"CONSTRUCTIBLE"} usable to remove a rural improvement, own city and foreign city?
//   P   can the mod place a +1 pending point itself with CityCommandTypes.EXPAND (same turn, before Autoplay)?
// Logs [EmigProbe] lines to UI.log via console.error. Ends turns with the Autoplay fallback when blocked.

const TAG = "[EmigProbe]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

let n = 0, local = -1, endTurnTimer = null, blockedTries = 0, autoplayUsed = false;
let ids = { G: null, D1: null, DF: null, P1: null };
let destroyed = { D1: null, DF: null };

const YIELDS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS"];
function yt(k) { return safe(() => YieldTypes[k], null); }
function cityName(c) { return safe(() => (Locale && Locale.compose ? Locale.compose(c.name) : String(c.name)), "?"); }
function city(id) { return id ? safe(() => Cities.get(id), null) : null; }

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
function improvements(c) { const m = plotMap(c) || {}; let k = 0; for (const i in m) for (const t of m[i]) if (t.startsWith("IMPROVEMENT_")) k++; return k; }

function snapCity(c) {
  if (!c) return null;
  const s = { name: cityName(c), owner: c.owner, pop: c.population, rural: c.ruralPopulation, urban: c.urbanPopulation };
  s.specialists = safe(() => c.Workers.getNumWorkers(false), null);
  s.pending = safe(() => c.pendingPopulation, null);
  s.readyToPlace = safe(() => c.Growth.isReadyToPlacePopulation, null);
  s.net = {};
  for (const k of YIELDS) { const t = yt(k); if (t != null) s.net[k.replace("YIELD_", "")] = safe(() => Math.round(c.Yields.getNetYield(t) * 100) / 100, null); }
  s.foodToGrow = safe(() => c.Growth.getNextGrowthFoodThreshold().value, null);
  s.turnsToGrow = safe(() => c.Growth.turnsUntilGrowth, null);
  s.currentFood = safe(() => c.Growth.currentFood, null);
  s.improvements = improvements(c);
  return s;
}
function snapPlayer(pid) {
  const p = safe(() => Players.get(pid), null); if (!p) return null;
  return { pid, gold: safe(() => p.Treasury.goldBalance, null), lifetimeHappy: safe(() => p.Stats.getLifetimeYield(yt("YIELD_HAPPINESS")), null) };
}

function firstImprovement(c) {
  return safe(() => {
    for (const idx of c.getPurchasedPlots()) {
      const loc = GameplayMap.getLocationFromIndex(idx);
      const d = Districts.getAtLocation(loc);
      if (!d) continue;
      const list = d.getConstructibleIdsOfClass(ConstructibleClasses.IMPROVEMENT) || [];
      if (list.length) {
        const inst = Constructibles.getByComponentID(list[0]);
        const info = inst ? GameInfo.Constructibles.lookup(inst.type) : null;
        return { plot: idx, loc, elem: list[0], type: info ? info.ConstructibleType : "?" };
      }
    }
    return null;
  }, null);
}

function pickTargets() {
  local = GameContext.localPlayerID;
  const mine = Players.get(local).Cities.getCities().slice();
  const growing = mine.filter((c) => safe(() => c.Growth.turnsUntilGrowth, 99) > 0).sort((a, b) => a.Growth.turnsUntilGrowth - b.Growth.turnsUntilGrowth);
  if (growing.length) ids.G = growing[0].id;
  const rest = mine.filter((c) => !ids.G || c.id.id !== ids.G.id);
  const withImp = rest.filter((c) => improvements(c) > 0).sort((a, b) => b.population - a.population);
  if (withImp.length) ids.D1 = withImp[0].id;
  const rest2 = withImp.filter((c) => c.id.id !== ids.D1.id);
  if (rest2.length) ids.P1 = rest2[0].id;
  let best = null;
  for (const p of Players.getAlive()) {
    if (p.id === local || !p.isMajor) continue;
    for (const c of (safe(() => p.Cities.getCities(), []) || [])) if (improvements(c) > 0 && (!best || c.population > best.population)) best = c;
  }
  if (best) ids.DF = best.id;
  emit("TARGETS local=" + local + " G(-1,growth)=" + J(ids.G) + " D1(destroy own)=" + J(ids.D1) + " DF(destroy foreign)=" + J(ids.DF) + " P1(+1,expand)=" + J(ids.P1));
}

function snapAll(phase) {
  for (const k of ["G", "D1", "DF", "P1"]) emit("SNAP n=" + n + " phase=" + phase + " autoplayUsed=" + autoplayUsed + " " + k + " " + J(snapCity(city(ids[k]))));
  for (const k of ["G", "D1", "DF", "P1"]) emit("PLOTS n=" + n + " phase=" + phase + " " + k + " " + J(plotMap(city(ids[k]))));
  emit("SNAP n=" + n + " phase=" + phase + " P " + J(snapPlayer(local)));
}

function actG() {
  const g = city(ids.G);
  emit("ACT G " + cityName(g) + " turnsToGrow=" + safe(() => g.Growth.turnsUntilGrowth) + " food=" + safe(() => g.Growth.currentFood) + "/" + safe(() => g.Growth.getNextGrowthFoodThreshold().value) + " addRuralPopulation(-1) -> " + safe(() => { g.addRuralPopulation(-1); return "ok"; }));
}

function actDestroy(key, viaOwner) {
  const c = city(ids[key]); if (!c) { emit("ACT DESTROY " + key + " no city"); return; }
  const imp = firstImprovement(c);
  if (!imp) { emit("ACT DESTROY " + key + " no improvement found"); return; }
  destroyed[key] = imp;
  const args = { Kind: "CONSTRUCTIBLE", Owner: imp.elem.owner, LocalID: imp.elem.id };
  const sender = viaOwner ? c.owner : local;
  const r = safe(() => Game.PlayerOperations.sendRequest(sender, "DESTROY_ELEMENT", args), null);
  emit("ACT DESTROY " + key + " " + cityName(c) + " owner=" + c.owner + " plot=" + imp.plot + " " + imp.type + " elem=" + J(imp.elem) + " sender=" + sender + " -> " + J(r));
}

function actP1() {
  const c = city(ids.P1); if (!c) { emit("ACT P1 no city"); return; }
  emit("ACT P1 " + cityName(c) + " addRuralPopulation(+1) -> " + safe(() => { c.addRuralPopulation(1); return "ok"; }));
  setTimeout(() => {
    const can = safe(() => Game.CityCommands.canStart(c.id, CityCommandTypes.EXPAND, {}, false), null);
    emit("ACT P1 EXPAND canStart Success=" + J(can && can.Success) + " plots=" + (can && can.Plots ? can.Plots.length : null) + " pending=" + safe(() => c.pendingPopulation) + " readyToPlace=" + safe(() => c.Growth.isReadyToPlacePopulation));
    if (can && can.Plots && can.Plots.length) {
      const loc = GameplayMap.getLocationFromIndex(can.Plots[0]);
      const args = { X: loc.x, Y: loc.y };
      emit("ACT P1 EXPAND sendRequest " + J(args) + " types=" + J(can.ConstructibleTypes ? can.ConstructibleTypes.slice(0, 2) : null) + " -> " + J(safe(() => Game.CityCommands.sendRequest(c.id, CityCommandTypes.EXPAND, args), "ERR")));
    }
  }, 1500);
}

// ── blockers / end turn ─────────────────────────────────────────────────────────────────────────
function blockingName() { return safe(() => String(Game.Notifications.getEndTurnBlockingType(local)), "?"); }
function endTurn() {
  try {
    const me = Players.get(local);
    if (!me.isTurnActive) { emit("ENDTURN not active; skip"); return; }
    if (GameContext.hasSentTurnComplete()) { emit("ENDTURN already sent"); return; }
    const b = blockingName();
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      if (blockedTries >= 3 && typeof Autoplay !== "undefined") {
        emit("ENDTURN blocked (" + b + "); FALLBACK Autoplay 1 turn");
        autoplayUsed = true;
        safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); return "ok"; });
        blockedTries = 0;
        endTurnTimer = setTimeout(endTurn, 30000);
        return;
      }
      endTurnTimer = setTimeout(endTurn, 4000);
      return;
    }
    blockedTries = 0;
    safe(() => UI.Player.deselectAllUnits());
    GameContext.sendTurnComplete();
    emit("ENDTURN sent for n=" + n + " (no autoplay)");
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}

function stage() {
  try {
    if (n === 1) {
      pickTargets(); snapAll("pre");
      actG(); actDestroy("D1", false); actDestroy("DF", false); actP1();
      setTimeout(() => {
        snapAll("post");
        const df = city(ids.DF);
        const before = destroyed.DF ? 1 : 0;
        if (before && df && plotMap(df) && (plotMap(df)[destroyed.DF.plot] || []).includes(destroyed.DF.type)) actDestroy("DF", true);
        setTimeout(() => { snapAll("post2"); setTimeout(endTurn, 2000); }, 4000);
      }, 5000);
      return;
    }
    if (n === 2 || n === 3) { snapAll("t" + n); setTimeout(endTurn, 3000); return; }
    if (n === 4) { snapAll("t4"); emit("DONE probe finished; leaving the game running"); return; }
  } catch (e) { emit("stage threw " + e); }
}

function onTurn(data) {
  const who = data && (data.player ?? data.Player);
  if (who !== GameContext.localPlayerID) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++;
  emit("TURN activated n=" + n + " turn=" + safe(() => Game.turn, "?") + " previousTurnUsedAutoplay=" + autoplayUsed);
  autoplayUsed = false; blockedTries = 0;
  setTimeout(stage, 3000);
}

emit("game attached (run 5)");
try { engine.on("PlayerTurnActivated", onTurn); } catch (e) { emit("engine.on failed " + e); }

function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
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
