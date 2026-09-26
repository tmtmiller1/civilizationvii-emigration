// eep-modtest21.js - follow-up to modtest20 (plan 8.2a, damage instead of delete). AugustusExp66, human
// control, no turn ending. Logs [EmigTest].
//   P1 the constructible instance's setProperty: does setProperty("damaged"/"Damaged", true) flip the
//      engine's `damaged` flag on a London building? (read back, plus getProperty if it exists)
//   P2 unit pillage on an OWN tile with a VALID unit: a local military unit with a real location, else
//      one created with CREATE_ELEMENT {Kind:"UNIT"} ON the farm plot; canStart UNITOPERATION_PILLAGE
//      from there; send if allowed; read `damaged`.
//   P3 the half-built fallback end to end: DESTROY_ELEMENT a building, CREATE_ELEMENT it back with
//      Progress 50, then ask the city whether it can BUILD that type (InProgress / Plots), send the build,
//      and read the build queue (progress, required, turns left).
//   P4 every PlayerOperationTypes key, for the ledger.

import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { listDepartureTiles, findDepartureBuilding } from "/emigration/ui/emigration-departure-tile.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
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

async function run() {
  const local = GameContext.localPlayerID;
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population);
  const L = mine[0];
  emit("START turn=" + safe(() => Game.turn) + " city=" + cityName(L.city) + " urban=" + L.urban + " prod=" + prod(L.city));
  emit("P4 PlayerOperationTypes=" + J(Object.keys(PlayerOperationTypes)));

  // P1 setProperty on a building instance
  const building = findDepartureBuilding(L.city);
  if (building) {
    const inst = safe(() => Constructibles.getByComponentID(building.elem));
    emit("P1 " + building.type + " damaged before=" + safe(() => inst.damaged) + " getProperty=" + (typeof safe(() => inst.getProperty)));
    for (const key of ["damaged", "Damaged", "DAMAGED", "pillaged"]) {
      const r = safe(() => inst.setProperty(key, true));
      await later(1500);
      const again = safe(() => Constructibles.getByComponentID(building.elem));
      emit("P1 setProperty(" + key + ", true) returned " + J(r) + " damaged now=" + safe(() => again.damaged) + " plot=" + J(plotInfo(building.loc).filter((c) => c.id === building.elem.id)));
    }
  }

  // P2 unit pillage with a valid unit on the farm
  const farm = listDepartureTiles(L.city).filter((t) => !/FISHING|BOAT/.test(t.type) && !t.onResource)[0];
  if (farm) {
    const units = (safe(() => Players.get(local).Units.getUnits(), []) || []).filter((u) => u.location && u.location.x >= 0);
    const military = units.filter((u) => safe(() => GameInfo.Units.lookup(u.type).CoreClass, "") === "CORE_CLASS_MILITARY");
    emit("P2 units on map=" + units.length + " military=" + J(military.map((u) => safe(() => GameInfo.Units.lookup(u.type).UnitType, "?") + "@" + u.location.x + "," + u.location.y)));
    const typeStr = military[0] ? safe(() => GameInfo.Units.lookup(military[0].type).UnitType, "UNIT_TREBUCHET") : "UNIT_TREBUCHET";
    const countBefore = units.length;
    safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "UNIT", Type: typeStr, Location: farm.loc, Owner: local }));
    await later(3500);
    const after = (safe(() => Players.get(local).Units.getUnits(), []) || []).filter((u) => u.location && u.location.x >= 0);
    const onFarm = after.find((u) => u.location.x === farm.loc.x && u.location.y === farm.loc.y);
    emit("P2 created " + typeStr + " on farm " + J(farm.loc) + ": units " + countBefore + " -> " + after.length + " onFarm=" + !!onFarm + " farmBefore=" + J(plotInfo(farm.loc)));
    const probeUnit = onFarm || military[0];
    if (probeUnit) {
      const args = { X: farm.loc.x, Y: farm.loc.y };
      const can = safe(() => Game.UnitOperations.canStart(probeUnit.id, "UNITOPERATION_PILLAGE", args, false));
      emit("P2 canStart PILLAGE (unit at " + J(probeUnit.location) + ")=" + J(can));
      safe(() => Game.UnitOperations.sendRequest(probeUnit.id, "UNITOPERATION_PILLAGE", args));
      await later(4000);
      emit("P2 farmAfter=" + J(plotInfo(farm.loc)));
      // also the pillage of the city-center building plot from the unit's position
      if (building) {
        const canB = safe(() => Game.UnitOperations.canStart(probeUnit.id, "UNITOPERATION_PILLAGE", { X: building.loc.x, Y: building.loc.y }, false));
        emit("P2 canStart PILLAGE on the building plot=" + J(canB));
      }
      if (onFarm) safe(() => Game.PlayerOperations.sendRequest(local, "DESTROY_ELEMENT", { Kind: "UNIT", Owner: onFarm.owner, LocalID: onFarm.id.id }));
    }
  } else emit("P2 skipped: no farm");

  // P3 half-built fallback end to end
  if (building) {
    const def = safe(() => GameInfo.Constructibles.lookup(building.type));
    const typeInfo = safe(() => GameInfo.Types.lookup(building.type));
    const before = { plot: plotInfo(building.loc), urban: L.city.urbanPopulation, prod: prod(L.city), queue: queue(L.city) };
    safe(() => Game.PlayerOperations.sendRequest(local, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: building.elem.owner, LocalID: building.elem.id }));
    await later(3000);
    const gone = { plot: plotInfo(building.loc), urban: L.city.urbanPopulation, prod: prod(L.city) };
    safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: def.$index, Location: building.loc, Parent: L.city.id, Owner: L.city.owner, Progress: 50 }));
    await later(4000);
    const half = { plot: plotInfo(building.loc), urban: L.city.urbanPopulation, prod: prod(L.city) };
    const args = { ConstructibleType: typeInfo ? typeInfo.Hash : def.$hash };
    const can = safe(() => Game.CityOperations.canStart(L.city.id, CityOperationTypes.BUILD, args, false));
    emit("P3 " + building.type + " before=" + J(before) + " destroyed=" + J(gone) + " half=" + J(half) + " canBUILD=" + J(can));
    if (can && can.Success) {
      if (can.InProgress && can.Plots && can.Plots.length) { const l = GameplayMap.getLocationFromIndex(can.Plots[0]); args.X = l.x; args.Y = l.y; }
      else { args.X = building.loc.x; args.Y = building.loc.y; }
      safe(() => Game.CityOperations.sendRequest(L.city.id, CityOperationTypes.BUILD, args));
      await later(3000);
      emit("P3 after BUILD request: queue=" + J(queue(L.city)) + " turnsLeft(type)=" + safe(() => L.city.BuildQueue.getTurnsLeft(building.type)) + " plot=" + J(plotInfo(building.loc)));
    }
  }
  emit("DONE modtest21 finished");
}

emit("modtest21 attached");
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
