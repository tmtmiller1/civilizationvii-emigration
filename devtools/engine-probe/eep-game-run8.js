// eep-game.js - run 8: the last open questions.
//   E3  a UNIT_MIGRANT spawned for an AI owner: where does it go? Track the owner's TOTAL population,
//       rural, urban, specialists, improvements and unit list across 7 turns.
//   G3  ASSIGN_WORKER Amount:-1 on a foreign city's specialist: watch across turns, not just 4 seconds.
//   H2  the custom non-buildable improvement placed in an AI city (the AI's own broker evaluates its
//       cities): does the game survive 7 AI turns with it there?
// Logs [EmigProbe] to UI.log.

const TAG = "[EmigProbe]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }

let local = -1, n = 0, endTurnTimer = null, blockedTries = 0;
let watch = { Fowner: -1, F: null, migrantIds: [], testLoc: null, specCity: null, specPlot: null };
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function plotTypes(x, y) {
  return safe(() => (MapConstructibles.getConstructibles(x, y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null; return info ? info.ConstructibleType : "?"; }), []);
}
function improvementsOf(c) { let k = 0; safe(() => { for (const idx of c.getPurchasedPlots()) { const l = GameplayMap.getLocationFromIndex(idx); for (const t of plotTypes(l.x, l.y)) if (t.startsWith("IMPROVEMENT_")) k++; } }); return k; }
function totals(pid) {
  return safe(() => {
    const t = { cities: 0, pop: 0, rural: 0, urban: 0, specialists: 0, improvements: 0, pending: 0 };
    for (const c of Players.get(pid).Cities.getCities()) { t.cities++; t.pop += c.population; t.rural += c.ruralPopulation; t.urban += c.urbanPopulation; t.specialists += safe(() => c.Workers.getNumWorkers(false), 0); t.improvements += improvementsOf(c); t.pending += safe(() => c.pendingPopulation, 0); }
    return t;
  }, null);
}
function units(pid) { return safe(() => Players.get(pid).Units.getUnits().map((u) => ({ id: u.id.id, type: safe(() => GameInfo.Units.lookup(u.type).UnitType), x: u.location && u.location.x, y: u.location && u.location.y })), []); }
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
function adjacentEmpty(c, ring) {
  return safe(() => {
    const cx = c.location.x, cy = c.location.y;
    for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
      const x = cx + dx, y = cy + dy; if (dx === 0 && dy === 0) continue;
      if (GameplayMap.getPlotDistance(cx, cy, x, y) !== ring || GameplayMap.isWater(x, y)) continue;
      if ((MapUnits.getUnits(x, y) || []).length) continue;
      return { x, y };
    }
    return null;
  }, null);
}

async function actTurn1() {
  local = GameContext.localPlayerID;
  let F = null; for (const p of Players.getAlive()) { if (p.id === local || !p.isMajor) continue; for (const c of p.Cities.getCities()) if (!F || c.population > F.population) F = c; }
  watch.F = F.id; watch.Fowner = F.owner;
  emit("TARGETS F=" + cityName(F) + " owner " + F.owner + " totalsBefore=" + J(totals(F.owner)) + " units=" + units(F.owner).length + " migrantsBefore=" + units(F.owner).filter((u) => u.type === "UNIT_MIGRANT").length);

  // E3: two migrants for the AI, one beside the city and one two tiles out.
  for (const ring of [1, 2]) {
    const loc = adjacentEmpty(F, ring);
    if (!loc) { emit("E3 no empty plot at ring " + ring); continue; }
    send("CREATE_ELEMENT", { Kind: "UNIT", Type: "UNIT_MIGRANT", Location: loc, Owner: F.owner, IndependentIndex: -1 });
    await later(3000);
    const m = units(F.owner).find((u) => u.type === "UNIT_MIGRANT" && u.x === loc.x && u.y === loc.y);
    if (m) watch.migrantIds.push(m.id);
    emit("E3 migrant ring " + ring + " at " + J(loc) + " -> " + J(m));
  }
  emit("E3 totalsAfterSpawn=" + J(totals(F.owner)) + " migrants=" + units(F.owner).filter((u) => u.type === "UNIT_MIGRANT").length);

  // G3: foreign specialist un-assign, sent as the foreign owner; re-read across turns.
  {
    let target = null; for (const p of Players.getAlive()) { if (p.id === local || !p.isMajor) continue; for (const c of p.Cities.getCities()) if (safe(() => c.Workers.getNumWorkers(false), 0) > 0) { target = c; break; } if (target) break; }
    if (target) {
      watch.specCity = target.id;
      for (const p of target.getPurchasedPlots()) {
        const can = safe(() => Game.PlayerOperations.canStart(target.owner, PlayerOperationTypes.ASSIGN_WORKER, { Location: p, Amount: -1 }, false), null);
        if (can && can.Success) { watch.specPlot = p; const r = send(PlayerOperationTypes.ASSIGN_WORKER, { Location: p, Amount: -1 }, target.owner); emit("G3 " + cityName(target) + " owner " + target.owner + " specialists=" + safe(() => target.Workers.getNumWorkers(false)) + " canStart ok on plot " + p + " sent -> " + J(r) + " placementInfo=" + J(safe(() => target.Workers.GetTilePlacementInfo(p), null))); break; }
      }
      await later(4000);
      emit("G3 after 4s specialists=" + safe(() => Cities.get(watch.specCity).Workers.getNumWorkers(false)));
    } else emit("G3 no foreign city with specialists");
  }
  // H2: custom improvement into the AI city.
  {
    const t = farImprovement(F);
    send("DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: t.elem.owner, LocalID: t.elem.id });
    await later(4000);
    const before = { pop: F.population, culture: safe(() => Math.round(F.Yields.getNetYield(YieldTypes.YIELD_CULTURE) * 10) / 10) };
    const r = send("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: idx("IMPROVEMENT_EMIG_TEST_ENCLAVE"), Location: t.loc, Parent: F.id, Owner: F.owner });
    await later(4000);
    watch.testLoc = t.loc;
    emit("H2 custom improvement in " + cityName(F) + " replacing " + t.type + " -> " + J(r) + " plotNow=" + J(plotTypes(t.loc.x, t.loc.y)) + " pop " + before.pop + "->" + F.population + " culture " + before.culture + "->" + safe(() => Math.round(F.Yields.getNetYield(YieldTypes.YIELD_CULTURE) * 10) / 10));
  }
  emit("TURN1 actions done; ending turns");
  setTimeout(endTurn, 3000);
}

function snapshotWatch() {
  const fu = units(watch.Fowner);
  const alive = watch.migrantIds.map((id) => !!fu.find((u) => u.id === id));
  const sc = watch.specCity ? safe(() => Cities.get(watch.specCity), null) : null;
  emit("WATCH n=" + n + " turn=" + safe(() => Game.turn) + " totals=" + J(totals(watch.Fowner)) + " migrantsAlive=" + J(alive) + " migrantsNow=" + fu.filter((u) => u.type === "UNIT_MIGRANT").length + " testPlot=" + J(watch.testLoc && plotTypes(watch.testLoc.x, watch.testLoc.y)) + " specCitySpecialists=" + (sc ? safe(() => sc.Workers.getNumWorkers(false)) : "n/a"));
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
  if (n >= 2) { setTimeout(() => { snapshotWatch(); if (n >= 8) emit("DONE run 8 finished"); else setTimeout(endTurn, 2000); }, 3000); }
});

emit("game attached (run 8)");
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
