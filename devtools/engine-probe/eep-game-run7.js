// eep-game.js - run 7: the follow-up probes for the reopened features.
//   E2  UNIT_MIGRANT spawned for a FOREIGN owner beside its city: does the AI resettle it? (watch 7 turns)
//   F2  found a town for a foreign owner: retry several candidate spots (which, if any, take?)
//   D2  DESTROY a building in a FOREIGN city (urban write, symmetric?)
//   G2  ASSIGN_WORKER Amount:-1 on a FOREIGN city's specialist (sent as the foreign owner)
//   H   the non-buildable custom improvement IMPROVEMENT_EMIG_TEST_ENCLAVE: CREATE_ELEMENT it on a freed
//       plot of the local capital; does it place, does it yield, and does the game survive 7 AI turns?
// Turn 1 acts; turns 2..8 snapshot and end (Autoplay when blocked). Logs [EmigProbe] to UI.log.

const TAG = "[EmigProbe]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }

let local = -1, n = 0, endTurnTimer = null, blockedTries = 0;
let watch = { F: null, Fowner: -1, migrantId: null, L: null, testLoc: null, townSpots: [] };
const YIELDS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS"];
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function plotTypes(x, y) {
  return safe(() => (MapConstructibles.getConstructibles(x, y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null; return info ? info.ConstructibleType : "?"; }), []);
}
function snap(c) {
  if (!c) return null;
  const s = { name: cityName(c), owner: c.owner, pop: c.population, rural: c.ruralPopulation, urban: c.urbanPopulation, specialists: safe(() => c.Workers.getNumWorkers(false)), pending: safe(() => c.pendingPopulation), net: {} };
  for (const k of YIELDS) s.net[k.replace("YIELD_", "")] = safe(() => Math.round(c.Yields.getNetYield(YieldTypes[k]) * 100) / 100, null);
  let imp = 0, bld = 0;
  safe(() => { for (const idx of c.getPurchasedPlots()) { const l = GameplayMap.getLocationFromIndex(idx); for (const t of plotTypes(l.x, l.y)) { if (t.startsWith("IMPROVEMENT_")) imp++; else if (t.startsWith("BUILDING_")) bld++; } } });
  s.improvements = imp; s.buildings = bld;
  return s;
}
function units(pid) { return safe(() => Players.get(pid).Units.getUnits().map((u) => ({ id: u.id, type: safe(() => GameInfo.Units.lookup(u.type).UnitType), x: u.location && u.location.x, y: u.location && u.location.y })), []); }
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
function buildingsOf(c) {
  const out = [];
  safe(() => {
    for (const p of c.getPurchasedPlots()) {
      const l = GameplayMap.getLocationFromIndex(p);
      if (l.x === c.location.x && l.y === c.location.y) continue;
      const d = Districts.getAtLocation(l); if (!d) continue;
      for (const id of (d.getConstructibleIds() || [])) { const inst = Constructibles.getByComponentID(id); const info = inst ? GameInfo.Constructibles.lookup(inst.type) : null; if (info && info.ConstructibleClass === "BUILDING" && info.ConstructibleType !== "BUILDING_ANCIENT_WALLS") out.push({ loc: l, elem: id, type: info.ConstructibleType }); }
    }
  });
  return out;
}
function emptySpots(c, minDistCity, maxR, want) {
  return safe(() => {
    const cx = c.location.x, cy = c.location.y, out = [], all = [];
    for (const p of Players.getAlive()) for (const k of (safe(() => p.Cities.getCities(), []) || [])) all.push(k.location);
    for (let r = 3; r <= maxR && out.length < want; r++) {
      for (let dx = -r; dx <= r && out.length < want; dx++) for (let dy = -r; dy <= r && out.length < want; dy++) {
        const x = cx + dx, y = cy + dy; if (x < 0 || y < 0) continue;
        if (GameplayMap.getPlotDistance(cx, cy, x, y) !== r) continue;
        if (GameplayMap.isWater(x, y)) continue;
        const o = GameplayMap.getOwner(x, y); if (o !== -1 && o !== 4294967295) continue;
        let ok = true; for (const l of all) if (GameplayMap.getPlotDistance(l.x, l.y, x, y) < minDistCity) { ok = false; break; }
        if (!ok) continue;
        if ((MapUnits.getUnits(x, y) || []).length) continue;
        out.push({ x, y, r });
      }
    }
    return out;
  }, []);
}
function adjacentEmpty(c) {
  return safe(() => {
    const cx = c.location.x, cy = c.location.y;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = cx + dx, y = cy + dy; if (dx === 0 && dy === 0) continue;
      if (GameplayMap.getPlotDistance(cx, cy, x, y) !== 1 || GameplayMap.isWater(x, y)) continue;
      if ((MapUnits.getUnits(x, y) || []).length) continue;
      return { x, y };
    }
    return null;
  }, null);
}

async function actTurn1() {
  local = GameContext.localPlayerID;
  const mine = Players.get(local).Cities.getCities().filter((c) => !c.isTown).sort((a, b) => b.population - a.population);
  const L = mine[0]; watch.L = L.id;
  let F = null; for (const p of Players.getAlive()) { if (p.id === local || !p.isMajor) continue; for (const c of p.Cities.getCities()) if (!F || c.population > F.population) F = c; }
  watch.F = F ? F.id : null; watch.Fowner = F ? F.owner : -1;
  emit("TARGETS L=" + cityName(L) + " F=" + (F ? cityName(F) + " owner " + F.owner : "none") + " testType idx=" + idx("IMPROVEMENT_EMIG_TEST_ENCLAVE"));

  // E2: migrant for the foreign owner beside its city.
  if (F) {
    const loc = adjacentEmpty(F); const before = units(F.owner).length;
    send("CREATE_ELEMENT", { Kind: "UNIT", Type: "UNIT_MIGRANT", Location: loc, Owner: F.owner, IndependentIndex: -1 });
    await later(4000);
    const now = units(F.owner); const mig = now.find((u) => u.type === "UNIT_MIGRANT" && u.x === loc.x && u.y === loc.y);
    watch.migrantId = mig ? mig.id : null;
    emit("E2 spawned migrant for owner " + F.owner + " at " + J(loc) + " units " + before + " -> " + now.length + " migrant=" + J(mig) + " city=" + J(snap(F)));
  }
  // D2: destroy a foreign building.
  if (F) {
    const b = buildingsOf(F)[0]; const before = snap(F);
    if (b) {
      send("DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: b.elem.owner, LocalID: b.elem.id });
      await later(4000);
      const s = snap(F);
      emit("D2 destroyed foreign " + b.type + ": pop " + before.pop + "->" + s.pop + " urban " + before.urban + "->" + s.urban + " buildings " + before.buildings + "->" + s.buildings + " plotNow=" + J(plotTypes(b.loc.x, b.loc.y)));
    } else emit("D2 no foreign building found");
  }
  // G2: un-assign a foreign specialist, sent as the foreign owner (and as local if that fails).
  if (F) {
    let target = null; for (const p of Players.getAlive()) { if (p.id === local || !p.isMajor) continue; for (const c of p.Cities.getCities()) if (safe(() => c.Workers.getNumWorkers(false), 0) > 0) { target = c; break; } if (target) break; }
    if (target) {
      const before = snap(target); let plot = null, sender = null;
      for (const pid of [target.owner, local]) {
        for (const p of target.getPurchasedPlots()) {
          const can = safe(() => Game.PlayerOperations.canStart(pid, PlayerOperationTypes.ASSIGN_WORKER, { Location: p, Amount: -1 }, false), null);
          if (can && can.Success) { plot = p; sender = pid; send(PlayerOperationTypes.ASSIGN_WORKER, { Location: p, Amount: -1 }, pid); break; }
        }
        if (plot != null) break;
      }
      await later(4000);
      const s = snap(target);
      emit("G2 foreign specialist " + cityName(target) + " sender=" + sender + " plot=" + plot + " specialists " + before.specialists + " -> " + s.specialists + " pop " + before.pop + " -> " + s.pop);
    } else emit("G2 no foreign city with specialists");
  }
  // F2: foreign town, several spots.
  if (F) {
    const spots = emptySpots(F, 4, 10, 4); const c0 = cityCount(F.owner);
    emit("F2 candidate spots " + J(spots));
    for (const sp of spots) {
      send("CREATE_ELEMENT", { Kind: "CITY", Location: { x: sp.x, y: sp.y }, Owner: F.owner });
      await later(5000);
      const c1 = cityCount(F.owner); const at = safe(() => { const c = MapCities.getCity(sp.x, sp.y); return c ? { name: cityName(c), owner: c.owner, isTown: c.isTown } : null; }, null);
      emit("F2 town attempt at " + J(sp) + " cities " + c0 + " -> " + c1 + " cityAtSpot=" + J(at));
      if (c1 > c0) { watch.townSpots.push(sp); break; }
    }
    // Same spot kind for the LOCAL player as a control, sent the same way.
    const mySpots = emptySpots(L, 4, 10, 1); const m0 = cityCount(local);
    if (mySpots.length) { send("CREATE_ELEMENT", { Kind: "CITY", Location: { x: mySpots[0].x, y: mySpots[0].y }, Owner: local }); await later(5000); emit("F2 control: local town at " + J(mySpots[0]) + " cities " + m0 + " -> " + cityCount(local)); }
  }
  // H: custom non-buildable improvement on a freed plot of L.
  {
    const t = farImprovement(L); const before = snap(L);
    send("DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: t.elem.owner, LocalID: t.elem.id });
    await later(4000);
    watch.testLoc = t.loc;
    const ti = idx("IMPROVEMENT_EMIG_TEST_ENCLAVE");
    for (const v of [
      { name: "index+Parent", args: { Kind: "CONSTRUCTIBLE", Type: ti, Location: t.loc, Parent: L.id, Owner: L.owner } },
      { name: "string+Parent", args: { Kind: "CONSTRUCTIBLE", Type: "IMPROVEMENT_EMIG_TEST_ENCLAVE", Location: t.loc, Parent: L.id, Owner: L.owner } },
      { name: "index+Parent+Progress", args: { Kind: "CONSTRUCTIBLE", Type: ti, Location: t.loc, Parent: L.id, Owner: L.owner, Progress: 100 } }
    ]) {
      if (ti == null && v.name.startsWith("index")) { emit("H type index unavailable (data not loaded?)"); continue; }
      const r = send("CREATE_ELEMENT", v.args);
      await later(4000);
      const now = plotTypes(t.loc.x, t.loc.y); const s = snap(L);
      emit("H CREATE custom " + v.name + " -> " + J(r) + " plotNow=" + J(now) + " pop " + before.pop + "->" + s.pop + " culture " + before.net.CULTURE + "->" + s.net.CULTURE + " gold " + before.net.GOLD + "->" + s.net.GOLD);
      if (now.includes("IMPROVEMENT_EMIG_TEST_ENCLAVE")) { emit("H VERDICT custom non-buildable improvement PLACED via '" + v.name + "'"); break; }
    }
    if (!plotTypes(t.loc.x, t.loc.y).length) {
      // put a farm back so the city is not left short
      send("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: idx(t.type), Location: t.loc, Parent: L.id, Owner: L.owner });
      emit("H custom placement failed on every variant; restored " + t.type);
    }
  }
  emit("TURN1 actions done; ending turns");
  setTimeout(endTurn, 3000);
}

function snapshotWatch() {
  const F = watch.F ? safe(() => Cities.get(watch.F), null) : null;
  const L = safe(() => Cities.get(watch.L), null);
  const fu = watch.Fowner >= 0 ? units(watch.Fowner) : [];
  const mig = fu.find((u) => watch.migrantId && u.id.id === watch.migrantId.id);
  emit("WATCH n=" + n + " turn=" + safe(() => Game.turn) + " F=" + J(F && { pop: F.population, rural: F.ruralPopulation, improvements: snap(F).improvements }) + " foreignMigrantAlive=" + !!mig + " migrantAt=" + J(mig && { x: mig.x, y: mig.y }) + " foreignMigrants=" + fu.filter((u) => u.type === "UNIT_MIGRANT").length + " testPlot=" + J(watch.testLoc && plotTypes(watch.testLoc.x, watch.testLoc.y)) + " L=" + J(L && { pop: L.population, culture: snap(L).net.CULTURE, gold: snap(L).net.GOLD }));
}

function endTurn() {
  try {
    const me = Players.get(local);
    if (!me.isTurnActive || GameContext.hasSentTurnComplete()) return;
    const b = String(Game.Notifications.getEndTurnBlockingType(local));
    if (b !== String(EndTurnBlockingTypes.NONE)) {
      blockedTries++;
      if (blockedTries >= 3 && typeof Autoplay !== "undefined") {
        safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
        blockedTries = 0; endTurnTimer = setTimeout(endTurn, 30000); return;
      }
      endTurnTimer = setTimeout(endTurn, 4000); return;
    }
    safe(() => UI.Player.deselectAllUnits()); GameContext.sendTurnComplete();
  } catch (e) { emit("ENDTURN threw " + e); }
  endTurnTimer = setTimeout(() => { if (safe(() => Players.get(local).isTurnActive, false) && !GameContext.hasSentTurnComplete()) endTurn(); }, 12000);
}

engine.on("PlayerTurnActivated", (d) => {
  const who = d && (d.player ?? d.Player);
  if (who !== GameContext.localPlayerID) return;
  if (endTurnTimer) { clearTimeout(endTurnTimer); endTurnTimer = null; }
  n++; blockedTries = 0;
  emit("TURN activated n=" + n + " turn=" + safe(() => Game.turn) + " ALIVE");
  if (n >= 2) { setTimeout(() => { snapshotWatch(); if (n >= 8) emit("DONE run 7 finished after 7 AI turns with the custom improvement in play"); else setTimeout(endTurn, 2000); }, 3000); }
});

emit("game attached (run 7)");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { emit("LOAD GameStarted"); setTimeout(() => { n = 1; actTurn1().catch((e) => emit("run threw " + e + " " + (e && e.stack))); }, 8000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
