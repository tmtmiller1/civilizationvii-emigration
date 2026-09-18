// eep-modtest22.js - the half-built fallback on a CURRENT-age building (modtest21 tried an obsolete one,
// which the city can never queue again). AugustusExp66, human control, no turn ending. Logs [EmigTest].
//   H1 pick a London building from the CURRENT age (not a wall, not defensive): DESTROY_ELEMENT it,
//      CREATE_ELEMENT it back with Progress 50; read complete/damaged, urban population, production.
//   H2 ask the city whether it can BUILD that type now (Success / InProgress / Plots / InQueue); if so,
//      send the build and read the queue (progress, required, turns left) and getTurnsLeft(type).
//   H3 control: can the city BUILD a current-age building it does NOT have (any buildable one), so the
//      H2 result is read against a known-good canStart.
//   then SHOT half-built, DONE.

import { collectCitySignals } from "/emigration/ui/emigration-cities.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function look(loc) { safe(() => Camera.lookAtPlot(loc, { zoom: 0, instantaneous: true })); }
function ageType() { return safe(() => GameInfo.Ages.lookup(Game.age).AgeType, ""); }
function plotInfo(loc) {
  return safe(() => (MapConstructibles.getConstructibles(loc.x, loc.y) || []).map((id) => {
    const i = Constructibles.getByComponentID(id);
    const info = i ? GameInfo.Constructibles.lookup(i.type) : null;
    return { type: info ? info.ConstructibleType : "?", complete: i && i.complete, damaged: i && i.damaged, id: id && id.id };
  }), []);
}
function prod(c) { return safe(() => Math.round(c.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION) * 10) / 10); }
function queue(c) {
  return safe(() => { const q = c.BuildQueue; return { current: q.currentProductionTypeHash, progress: q.currentBuildProgress, required: q.currentBuildProgressRequired, turns: q.currentTurnsLeft, empty: q.isEmpty }; });
}
function currentAgeBuildings(city) {
  const out = [];
  const age = ageType();
  for (const idx of safe(() => city.getPurchasedPlots(), []) || []) {
    const loc = GameplayMap.getLocationFromIndex(idx);
    for (const id of safe(() => MapConstructibles.getConstructibles(loc.x, loc.y), []) || []) {
      const inst = safe(() => Constructibles.getByComponentID(id));
      const info = inst ? safe(() => GameInfo.Constructibles.lookup(inst.type)) : null;
      if (!info || info.ConstructibleClass !== "BUILDING" || !inst.complete) continue;
      if (info.Age !== age || /WALL/.test(info.ConstructibleType) || (info.Defense || 0) > 0) continue;
      out.push({ loc, id, type: info.ConstructibleType, cost: info.Cost, index: info.$index });
    }
  }
  return out.sort((a, b) => a.cost - b.cost);
}

async function run() {
  const local = GameContext.localPlayerID;
  const mine = collectCitySignals().filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population);
  const L = mine[0];
  emit("START turn=" + safe(() => Game.turn) + " age=" + ageType() + " city=" + cityName(L.city) + " urban=" + L.city.urbanPopulation + " prod=" + prod(L.city));
  const cands = currentAgeBuildings(L.city);
  emit("H1 current-age buildings=" + J(cands.map((c) => c.type + ":" + c.cost)));
  // H3 control first (before anything changes): a buildable current-age building the city lacks
  {
    const have = new Set(cands.map((c) => c.type));
    let control = null;
    for (const row of GameInfo.Constructibles) {
      if (row.ConstructibleClass !== "BUILDING" || row.Age !== ageType() || have.has(row.ConstructibleType)) continue;
      const t = safe(() => GameInfo.Types.lookup(row.ConstructibleType));
      const r = safe(() => Game.CityOperations.canStart(L.city.id, CityOperationTypes.BUILD, { ConstructibleType: t.Hash }, false));
      if (r && r.Success) { control = { type: row.ConstructibleType, result: r }; break; }
    }
    emit("H3 control canBUILD=" + J(control && { type: control.type, Success: control.result.Success, InProgress: control.result.InProgress, plots: (control.result.Plots || []).length, InQueue: control.result.InQueue }));
  }
  const b = cands[0];
  if (!b) { emit("H1 no current-age building; DONE modtest22 finished"); return; }
  const typeInfo = safe(() => GameInfo.Types.lookup(b.type));
  const before = { plot: plotInfo(b.loc), urban: L.city.urbanPopulation, prod: prod(L.city), can: safe(() => Game.CityOperations.canStart(L.city.id, CityOperationTypes.BUILD, { ConstructibleType: typeInfo.Hash }, false)) };
  safe(() => Game.PlayerOperations.sendRequest(local, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: id0(b).owner, LocalID: id0(b).id }));
  await later(3000);
  const gone = { plot: plotInfo(b.loc), urban: L.city.urbanPopulation, prod: prod(L.city), can: safe(() => Game.CityOperations.canStart(L.city.id, CityOperationTypes.BUILD, { ConstructibleType: typeInfo.Hash }, false)) };
  safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: b.index, Location: b.loc, Parent: L.city.id, Owner: L.city.owner, Progress: 50 }));
  await later(4000);
  const args = { ConstructibleType: typeInfo.Hash };
  const half = { plot: plotInfo(b.loc), urban: L.city.urbanPopulation, prod: prod(L.city), can: safe(() => Game.CityOperations.canStart(L.city.id, CityOperationTypes.BUILD, args, false)) };
  emit("H1 " + b.type + " before=" + J(before) + " destroyed=" + J(gone) + " half=" + J(half));
  const can = half.can;
  if (can && can.Success) {
    if (can.InProgress && can.Plots && can.Plots.length) { const l = GameplayMap.getLocationFromIndex(can.Plots[0]); args.X = l.x; args.Y = l.y; }
    else { args.X = b.loc.x; args.Y = b.loc.y; }
    safe(() => Game.CityOperations.sendRequest(L.city.id, CityOperationTypes.BUILD, args));
    await later(3000);
    emit("H2 after BUILD request: queue=" + J(queue(L.city)) + " turnsLeft(type)=" + safe(() => L.city.BuildQueue.getTurnsLeft(b.type)) + " plot=" + J(plotInfo(b.loc)));
  } else emit("H2 city cannot queue " + b.type + " while half built: " + J(can));
  look(b.loc);
  await later(4000);
  emit("SHOT half-built");
  await later(10000);
  emit("DONE modtest22 finished");
}
function id0(b) { return b.id; }

emit("modtest22 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => emit("run threw " + e + " " + (e && e.stack))); }, 12000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
