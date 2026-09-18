// eep-modtest20.js - can the mod DAMAGE (pillage) a constructible instead of destroying it? Plan 8.2a.
// Human-controlled Exploration save (AugustusExp66), no turn ending. Logs [EmigTest]; "SHOT" lines ask
// the runner for screenshots.
//   D1 enumerate the engine's operation enums (Player/City/Unit operations and commands) and a live
//      constructible instance's surface; log anything damage/pillage/repair-shaped.
//   D2 for every enumerated PLAYER or CITY operation whose name contains DAMAGE, PILLAGE, or REPAIR:
//      canStart + sendRequest against a London building; read `damaged` before and after.
//   D3 unit pillage on an OWN tile: canStart UNITOPERATION_PILLAGE for a local unit on London's farthest
//      farm; teleport the unit there (UNITOPERATION_TELEPORT_TO, canStart first) and try again; read
//      `damaged` after.
//   D4 the fallback: DESTROY_ELEMENT a London building, then CREATE_ELEMENT it back with Progress 50;
//      read `complete` / `damaged`, the city's urban population, and the build queue.
//   then camera on the plot, SHOT damage-probe, DONE.

import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { listDepartureTiles, findDepartureBuilding } from "/emigration/ui/emigration-departure-tile.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function look(loc) { safe(() => Camera.lookAtPlot(loc, { zoom: 0, instantaneous: true })); }
const SHAPE = /DAMAGE|PILLAGE|REPAIR|HEAL|RAZE|DESTROY|ELEMENT|MODIFY|SET_/i;

function plotInfo(loc) {
  return safe(() => (MapConstructibles.getConstructibles(loc.x, loc.y) || []).map((id) => {
    const i = Constructibles.getByComponentID(id);
    const info = i ? GameInfo.Constructibles.lookup(i.type) : null;
    return { type: info ? info.ConstructibleType : "?", complete: i && i.complete, damaged: i && i.damaged, id: id && id.id };
  }), []);
}
function enumKeys(name) {
  const g = globalThis[name];
  if (!g || typeof g !== "object") return null;
  return Object.keys(g);
}
function surface(obj) {
  const own = safe(() => Object.getOwnPropertyNames(obj), []);
  const proto = safe(() => Object.getOwnPropertyNames(Object.getPrototypeOf(obj) || {}), []);
  return Array.from(new Set(own.concat(proto)));
}

async function run() {
  const local = GameContext.localPlayerID;
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population);
  const L = mine[0];
  emit("START turn=" + safe(() => Game.turn) + " local=" + local + " city=" + cityName(L.city) + " urban=" + L.urban);

  // D1 enumerations
  for (const name of ["PlayerOperationTypes", "CityOperationTypes", "CityCommandTypes", "UnitOperationTypes", "UnitCommandTypes", "PlayerCommandTypes"]) {
    const keys = enumKeys(name);
    if (!keys) { emit("D1 " + name + ": absent"); continue; }
    emit("D1 " + name + ": " + keys.length + " keys; shaped=" + J(keys.filter((k) => SHAPE.test(k))));
  }
  const building = findDepartureBuilding(L.city);
  const farm = listDepartureTiles(L.city).filter((t) => !/FISHING|BOAT/.test(t.type) && !t.onResource)[0];
  emit("D1 building=" + J(building && { type: building.type, plot: building.plot, cost: building.cost }) + " farm=" + J(farm && { type: farm.type, plot: farm.plot, damaged: farm.damaged }));
  if (building) {
    const inst = safe(() => Constructibles.getByComponentID(building.elem));
    emit("D1 constructible instance surface=" + J(surface(inst)));
    emit("D1 instance damaged=" + safe(() => inst.damaged) + " complete=" + safe(() => inst.complete) + " keys=" + J(safe(() => Object.keys(inst), [])));
  }
  emit("D1 Game.PlayerOperations surface=" + J(surface(Game.PlayerOperations)) + " CityOperations=" + J(surface(safe(() => Game.CityOperations, {}))) + " UnitOperations=" + J(surface(safe(() => Game.UnitOperations, {}))));

  // D2 damage-shaped player / city operations against the building
  if (building) {
    const target = { Kind: "CONSTRUCTIBLE", Owner: building.elem.owner, LocalID: building.elem.id, Location: building.loc, Damaged: true };
    for (const k of (enumKeys("PlayerOperationTypes") || []).filter((x) => /DAMAGE|PILLAGE|REPAIR/i.test(x))) {
      const can = safe(() => Game.PlayerOperations.canStart(local, k, target, false));
      emit("D2 player op " + k + " canStart=" + J(can));
      safe(() => Game.PlayerOperations.sendRequest(local, k, target));
      await later(2500);
      emit("D2 after " + k + ": " + J(plotInfo(building.loc).filter((c) => c.id === building.elem.id)));
    }
    for (const k of (enumKeys("CityOperationTypes") || []).concat(enumKeys("CityCommandTypes") || []).filter((x) => /DAMAGE|PILLAGE|REPAIR/i.test(x))) {
      const api = (enumKeys("CityOperationTypes") || []).includes(k) ? Game.CityOperations : Game.CityCommands;
      const can = safe(() => api.canStart(L.city.id, k, target, false));
      emit("D2 city op " + k + " canStart=" + J(can));
      safe(() => api.sendRequest(L.city.id, k, target));
      await later(2500);
      emit("D2 after " + k + ": " + J(plotInfo(building.loc).filter((c) => c.id === building.elem.id)));
    }
    emit("D2 done (no damage-shaped ops = nothing tried)");
  }

  // D3 unit pillage on an own tile
  const units = safe(() => Players.get(local).Units.getUnits(), []) || [];
  const unit = units.find((u) => safe(() => GameInfo.Units.lookup(u.type).CoreClass, "") === "CORE_CLASS_MILITARY") || units[0];
  if (unit && farm) {
    const uType = safe(() => GameInfo.Units.lookup(unit.type).UnitType, "?");
    emit("D3 unit=" + uType + " at " + J(unit.location) + " farm=" + J(farm.loc) + " farmBefore=" + J(plotInfo(farm.loc)));
    const args = { X: farm.loc.x, Y: farm.loc.y };
    emit("D3 canStart PILLAGE (from afar)=" + J(safe(() => Game.UnitOperations.canStart(unit.id, "UNITOPERATION_PILLAGE", args, false))));
    const canTp = safe(() => Game.UnitOperations.canStart(unit.id, "UNITOPERATION_TELEPORT_TO", args, false));
    emit("D3 canStart TELEPORT_TO=" + J(canTp));
    if (canTp && canTp.Success) {
      safe(() => Game.UnitOperations.sendRequest(unit.id, "UNITOPERATION_TELEPORT_TO", args));
      await later(3000);
      emit("D3 unit now at " + J(safe(() => Players.get(local).Units.getUnits().find((u) => u.id.id === unit.id.id).location)));
    }
    const canP = safe(() => Game.UnitOperations.canStart(unit.id, "UNITOPERATION_PILLAGE", args, false));
    emit("D3 canStart PILLAGE (after teleport)=" + J(canP));
    safe(() => Game.UnitOperations.sendRequest(unit.id, "UNITOPERATION_PILLAGE", args));
    await later(4000);
    emit("D3 farmAfter=" + J(plotInfo(farm.loc)));
  } else emit("D3 skipped: unit=" + !!unit + " farm=" + !!farm);

  // D4 destroy + recreate with Progress
  if (building) {
    const before = { plot: plotInfo(building.loc), urban: safe(() => L.city.urbanPopulation), pop: safe(() => L.city.population) };
    const def = safe(() => GameInfo.Constructibles.lookup(building.type));
    safe(() => Game.PlayerOperations.sendRequest(local, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: building.elem.owner, LocalID: building.elem.id }));
    await later(3000);
    const mid = { plot: plotInfo(building.loc), urban: safe(() => L.city.urbanPopulation), pop: safe(() => L.city.population) };
    safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: def.$index, Location: building.loc, Parent: L.city.id, Owner: L.city.owner, Progress: 50 }));
    await later(4000);
    const after = { plot: plotInfo(building.loc), urban: safe(() => L.city.urbanPopulation), pop: safe(() => L.city.population) };
    const queue = safe(() => { const q = L.city.BuildQueue; return q ? { keys: Object.keys(q), current: q.currentProductionTypeHash, len: safe(() => q.getQueue().length) } : "no BuildQueue"; });
    emit("D4 " + building.type + " before=" + J(before) + " afterDestroy=" + J(mid) + " afterRecreateProgress50=" + J(after) + " queue=" + J(queue));
    look(building.loc);
    await later(4000);
    emit("SHOT damage-probe");
    await later(10000);
  }
  emit("DONE modtest20 finished");
}

emit("modtest20 attached");
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
