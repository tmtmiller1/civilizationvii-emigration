// eep-game.js - run 6: the tuner's CREATE_ELEMENT / DESTROY_ELEMENT surface, tested against the closed
// feature list. All within one turn (no turn ends needed). Logs [EmigProbe] lines to UI.log.
//   A  re-create a standard improvement on a plot we just abandoned (local city)   -> enclave-as-constructible
//   B  the same on a foreign city                                                  -> symmetric
//   C  create a standard BUILDING in a district with room (local city)             -> urban write / enclave building
//   D  DESTROY a building (local city)                                             -> urban emigration primitive
//   E  create a unit for a FOREIGN owner with the tuner's argument shape           -> AI migrant units
//   F  found a TOWN for a foreign owner (and the local player) on an empty spot    -> refugee settlements
//   G  ASSIGN_WORKER Amount:-1 on a specialist plot                                -> specialist emigration

const TAG = "[EmigProbe]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }

let local = -1;
const YIELDS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS"];
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function plotTypes(x, y) {
  return safe(() => (MapConstructibles.getConstructibles(x, y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null; return info ? info.ConstructibleType : "?"; }), []);
}
function plotMap(c) {
  return safe(() => { const out = {}; for (const idx of c.getPurchasedPlots()) { const l = GameplayMap.getLocationFromIndex(idx); const t = plotTypes(l.x, l.y); if (t.length) out[idx] = t; } return out; }, null);
}
function snap(c) {
  if (!c) return null;
  const s = { name: cityName(c), owner: c.owner, pop: c.population, rural: c.ruralPopulation, urban: c.urbanPopulation, specialists: safe(() => c.Workers.getNumWorkers(false)), pending: safe(() => c.pendingPopulation), net: {} };
  for (const k of YIELDS) s.net[k.replace("YIELD_", "")] = safe(() => Math.round(c.Yields.getNetYield(YieldTypes[k]) * 100) / 100, null);
  const pm = plotMap(c) || {}; let imp = 0, bld = 0; for (const p in pm) for (const t of pm[p]) { if (t.startsWith("IMPROVEMENT_")) imp++; else if (t.startsWith("BUILDING_")) bld++; }
  s.improvements = imp; s.buildings = bld;
  return s;
}
function unitCount(pid) { return safe(() => Players.get(pid).Units.getUnits().length, null); }
function cityCount(pid) { return safe(() => Players.get(pid).Cities.getCities().length, null); }
function send(op, args, sender) { return safe(() => Game.PlayerOperations.sendRequest(sender == null ? local : sender, op, args), "ERR"); }
function idx(type) { return safe(() => GameInfo.Constructibles.lookup(type).$index, null); }

function farImprovement(c) {
  return safe(() => {
    let best = null;
    for (const p of c.getPurchasedPlots()) {
      const l = GameplayMap.getLocationFromIndex(p);
      const d = Districts.getAtLocation(l); if (!d) continue;
      const ids = d.getConstructibleIdsOfClass(ConstructibleClasses.IMPROVEMENT) || [];
      if (!ids.length) continue;
      const inst = Constructibles.getByComponentID(ids[0]); const info = inst ? GameInfo.Constructibles.lookup(inst.type) : null;
      const dist = GameplayMap.getPlotDistance(l.x, l.y, c.location.x, c.location.y);
      if (!best || dist > best.dist) best = { plot: p, loc: l, elem: ids[0], type: info ? info.ConstructibleType : "?", dist };
    }
    return best;
  }, null);
}
function districtWithRoom(c) {
  return safe(() => {
    for (const p of c.getPurchasedPlots()) {
      const l = GameplayMap.getLocationFromIndex(p);
      if (l.x === c.location.x && l.y === c.location.y) continue;
      const types = plotTypes(l.x, l.y);
      if (types.length === 1 && types[0].startsWith("BUILDING_")) return { plot: p, loc: l, types };
    }
    return null;
  }, null);
}
function buildingToAdd(c) {
  const have = new Set(); const pm = plotMap(c) || {}; for (const p in pm) for (const t of pm[p]) have.add(t);
  for (const t of ["BUILDING_GRANARY", "BUILDING_MONUMENT", "BUILDING_ALTAR", "BUILDING_LIBRARY", "BUILDING_MARKET", "BUILDING_BARRACKS", "BUILDING_GARDEN", "BUILDING_BRICKYARD", "BUILDING_SAW_PIT"]) if (!have.has(t)) return t;
  return "BUILDING_GRANARY";
}
function emptyPlotNear(c, minDistCity, maxR) {
  return safe(() => {
    const cx = c.location.x, cy = c.location.y;
    const all = [];
    for (const p of Players.getAlive()) for (const k of (safe(() => p.Cities.getCities(), []) || [])) all.push(k.location);
    for (let r = 2; r <= maxR; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0) continue;
        if (GameplayMap.getPlotDistance(cx, cy, x, y) !== r) continue;
        if (GameplayMap.isWater(x, y)) continue;
        if (GameplayMap.getOwner(x, y) !== -1 && GameplayMap.getOwner(x, y) !== 4294967295) continue;
        let ok = true; for (const l of all) if (GameplayMap.getPlotDistance(l.x, l.y, x, y) < minDistCity) { ok = false; break; }
        if (!ok) continue;
        if ((MapUnits.getUnits(x, y) || []).length) continue;
        return { x, y };
      }
    }
    return null;
  }, null);
}
function adjacentEmpty(c) {
  return safe(() => {
    const cx = c.location.x, cy = c.location.y;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = cx + dx, y = cy + dy; if (dx === 0 && dy === 0) continue;
      if (GameplayMap.getPlotDistance(cx, cy, x, y) !== 1) continue;
      if (GameplayMap.isWater(x, y)) continue;
      if ((MapUnits.getUnits(x, y) || []).length) continue;
      return { x, y };
    }
    return null;
  }, null);
}

async function run() {
  local = GameContext.localPlayerID;
  const mine = Players.get(local).Cities.getCities().filter((c) => !c.isTown).sort((a, b) => b.population - a.population);
  const L = mine[0];
  let F = null; for (const p of Players.getAlive()) { if (p.id === local || !p.isMajor) continue; for (const c of p.Cities.getCities()) if (!F || c.population > F.population) F = c; }
  emit("TARGETS L=" + cityName(L) + " F=" + (F ? cityName(F) + " owner " + F.owner : "none"));

  // A: destroy the farthest improvement of L, then re-create the same type there.
  {
    const t = farImprovement(L); emit("A target " + J(t && { plot: t.plot, type: t.type, dist: t.dist }));
    const before = snap(L);
    send("DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: t.elem.owner, LocalID: t.elem.id });
    await later(4000);
    const mid = snap(L); emit("A after destroy pop=" + mid.pop + " improvements=" + mid.improvements + " plotNow=" + J(plotTypes(t.loc.x, t.loc.y)));
    const variants = [
      { name: "index+Parent", args: { Kind: "CONSTRUCTIBLE", Type: idx(t.type), Location: t.loc, Parent: L.id, Owner: L.owner } },
      { name: "string+Parent", args: { Kind: "CONSTRUCTIBLE", Type: t.type, Location: t.loc, Parent: L.id, Owner: L.owner } },
      { name: "index+Parent+Progress", args: { Kind: "CONSTRUCTIBLE", Type: idx(t.type), Location: t.loc, Parent: L.id, Owner: L.owner, Progress: 100 } },
      { name: "string noParent", args: { Kind: "CONSTRUCTIBLE", Type: t.type, Location: t.loc, Owner: L.owner } }
    ];
    for (const v of variants) {
      const r = send("CREATE_ELEMENT", v.args);
      await later(4000);
      const now = plotTypes(t.loc.x, t.loc.y); const s = snap(L);
      emit("A CREATE " + v.name + " -> " + J(r) + " plotNow=" + J(now) + " pop=" + s.pop + " rural=" + s.rural + " improvements=" + s.improvements + " food=" + s.net.FOOD + " prod=" + s.net.PRODUCTION);
      if (now.length) { emit("A VERDICT improvement re-created with variant '" + v.name + "'; before=" + J(before.net) + " after=" + J(s.net)); break; }
    }
  }
  // B: foreign city, same thing, sent by the local player.
  if (F) {
    const t = farImprovement(F); emit("B target " + J(t && { plot: t.plot, type: t.type }));
    if (t) {
      send("DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: t.elem.owner, LocalID: t.elem.id });
      await later(4000);
      emit("B after destroy pop=" + snap(F).pop + " plotNow=" + J(plotTypes(t.loc.x, t.loc.y)));
      for (const v of [
        { name: "index+Parent", args: { Kind: "CONSTRUCTIBLE", Type: idx(t.type), Location: t.loc, Parent: F.id, Owner: F.owner } },
        { name: "string+Parent", args: { Kind: "CONSTRUCTIBLE", Type: t.type, Location: t.loc, Parent: F.id, Owner: F.owner } }
      ]) {
        const r = send("CREATE_ELEMENT", v.args);
        await later(4000);
        const now = plotTypes(t.loc.x, t.loc.y); const s = snap(F);
        emit("B CREATE " + v.name + " -> " + J(r) + " plotNow=" + J(now) + " pop=" + s.pop + " rural=" + s.rural + " improvements=" + s.improvements);
        if (now.length) break;
      }
    }
  }
  // C: create a building in a district with room (local).
  let createdBuilding = null;
  {
    const d = districtWithRoom(L); const type = buildingToAdd(L);
    emit("C target district " + J(d) + " type=" + type + " idx=" + idx(type));
    if (d) {
      const before = snap(L);
      for (const v of [
        { name: "string+Parent", args: { Kind: "CONSTRUCTIBLE", Type: type, Location: d.loc, Parent: L.id, Owner: L.owner } },
        { name: "index+Parent", args: { Kind: "CONSTRUCTIBLE", Type: idx(type), Location: d.loc, Parent: L.id, Owner: L.owner } },
        { name: "string+Parent+Progress", args: { Kind: "CONSTRUCTIBLE", Type: type, Location: d.loc, Parent: L.id, Owner: L.owner, Progress: 100 } }
      ]) {
        const r = send("CREATE_ELEMENT", v.args);
        await later(4000);
        const now = plotTypes(d.loc.x, d.loc.y); const s = snap(L);
        emit("C CREATE " + v.name + " -> " + J(r) + " plotNow=" + J(now) + " pop=" + s.pop + " urban=" + s.urban + " buildings=" + s.buildings + " net=" + J(s.net));
        if (now.length > d.types.length) { createdBuilding = { loc: d.loc, type }; emit("C VERDICT building created with '" + v.name + "'; urban " + before.urban + " -> " + s.urban + " before=" + J(before.net)); break; }
      }
    }
  }
  // D: destroy a building (the one we created if any, else another non-palace building).
  {
    const before = snap(L);
    let target = null;
    const pick = createdBuilding ? createdBuilding.loc : null;
    const cands = [];
    for (const p of L.getPurchasedPlots()) {
      const l = GameplayMap.getLocationFromIndex(p);
      if (l.x === L.location.x && l.y === L.location.y) continue;
      const d = Districts.getAtLocation(l); if (!d) continue;
      for (const id of (d.getConstructibleIds() || [])) { const inst = Constructibles.getByComponentID(id); const info = inst ? GameInfo.Constructibles.lookup(inst.type) : null; if (info && info.ConstructibleClass === "BUILDING" && info.ConstructibleType !== "BUILDING_ANCIENT_WALLS") cands.push({ loc: l, elem: id, type: info.ConstructibleType }); }
    }
    target = (pick && cands.find((c) => c.loc.x === pick.x && c.loc.y === pick.y && c.type === createdBuilding.type)) || cands[0];
    emit("D target " + J(target && { type: target.type, loc: target.loc }));
    if (target) {
      send("DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: target.elem.owner, LocalID: target.elem.id });
      await later(4000);
      const s = snap(L);
      emit("D VERDICT destroyed " + target.type + ": pop " + before.pop + "->" + s.pop + " urban " + before.urban + "->" + s.urban + " rural " + before.rural + "->" + s.rural + " specialists " + before.specialists + "->" + s.specialists + " buildings " + before.buildings + "->" + s.buildings + " plotNow=" + J(plotTypes(target.loc.x, target.loc.y)) + " net=" + J(s.net));
    }
  }
  // E: unit for a foreign owner, tuner argument shape.
  if (F) {
    const loc = adjacentEmpty(F); const u0 = unitCount(F.owner);
    const r = send("CREATE_ELEMENT", { Kind: "UNIT", Type: "UNIT_MIGRANT", Location: loc, Owner: F.owner, IndependentIndex: -1 });
    await later(4000);
    emit("E foreign unit at " + J(loc) + " -> " + J(r) + " units " + u0 + " -> " + unitCount(F.owner) + " plotUnits=" + J(safe(() => (MapUnits.getUnits(loc.x, loc.y) || []).map((u) => ({ owner: u.owner, type: safe(() => GameInfo.Units.lookup(Units.get(u).type).UnitType) })), null)));
    if (unitCount(F.owner) === u0) {
      const r2 = send("CREATE_ELEMENT", { Kind: "UNIT", Type: "UNIT_WARRIOR", Location: loc, Owner: F.owner, IndependentIndex: -1 }, F.owner);
      await later(4000);
      emit("E retry sent as foreign owner, UNIT_WARRIOR -> " + J(r2) + " units now " + unitCount(F.owner));
    }
  }
  // F: found a town for the foreign owner, then for the local player, on empty land >= 4 from any city.
  if (F) {
    const spot = emptyPlotNear(F, 4, 9); const c0 = cityCount(F.owner);
    emit("F foreign spot " + J(spot));
    if (spot) {
      const r = send("CREATE_ELEMENT", { Kind: "CITY", Location: spot, Owner: F.owner });
      await later(5000);
      emit("F foreign town -> " + J(r) + " cities " + c0 + " -> " + cityCount(F.owner) + " cityAtSpot=" + J(safe(() => { const c = MapCities.getCity(spot.x, spot.y); return c ? { name: cityName(c), owner: c.owner, isTown: c.isTown, pop: c.population } : null; }, null)));
    }
  }
  {
    const spot = emptyPlotNear(L, 4, 9); const c0 = cityCount(local);
    emit("F local spot " + J(spot));
    if (spot) {
      const r = send("CREATE_ELEMENT", { Kind: "CITY", Location: spot, Owner: local });
      await later(5000);
      emit("F local town -> " + J(r) + " cities " + c0 + " -> " + cityCount(local) + " cityAtSpot=" + J(safe(() => { const c = MapCities.getCity(spot.x, spot.y); return c ? { name: cityName(c), owner: c.owner, isTown: c.isTown, pop: c.population } : null; }, null)));
    }
  }
  // G: un-assign a specialist.
  {
    const c = mine.find((k) => safe(() => k.Workers.getNumWorkers(false), 0) > 0) || L;
    const before = snap(c); let sent = null;
    for (const p of c.getPurchasedPlots()) {
      const can = safe(() => Game.PlayerOperations.canStart(local, PlayerOperationTypes.ASSIGN_WORKER, { Location: p, Amount: -1 }, false), null);
      if (can && can.Success) { sent = p; send("ASSIGN_WORKER" in (PlayerOperationTypes || {}) ? PlayerOperationTypes.ASSIGN_WORKER : "ASSIGN_WORKER", { Location: p, Amount: -1 }); break; }
    }
    await later(4000);
    const s = snap(c);
    emit("G ASSIGN_WORKER -1 on " + cityName(c) + " plot=" + J(sent) + " specialists " + before.specialists + " -> " + s.specialists + " pop " + before.pop + " -> " + s.pop + " urban " + before.urban + " -> " + s.urban + " pending " + s.pending);
  }
  emit("DONE run 6 finished; leaving the game running");
}

emit("game attached (run 6)");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { emit("LOAD GameStarted"); setTimeout(() => run().catch((e) => emit("run threw " + e + " " + (e && e.stack))), 8000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
