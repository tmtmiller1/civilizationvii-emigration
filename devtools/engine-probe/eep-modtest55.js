// eep-modtest55.js - does un-assigning a specialist leave a population point waiting to be placed, and does the
// specialist-for-tile swap remove one person cleanly? AugustusAnt136 (London has specialists).
//   A  ASSIGN_WORKER {Location, Amount:-1} on a worked specialist plot. Read Growth.isReadyToPlacePopulation, the
//      EXPAND plot list, pop/rural/urban/specialists/pending. Hypothesis: the specialist becomes a waiting point
//      (ready true, EXPAND offers plots, pop unchanged). Disproved if ready stays false and EXPAND offers nothing.
//   B  (only if A held) destroy the city's departure tile, clear its empty rural district, EXPAND the waiting point
//      back onto that plot. Expected net vs A0: pop -1, specialists -1, rural and improvements unchanged, pending 0.
//   C  end one turn (no emigration pass: turnInterval raised) and read again.
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { findDepartureTile } from "/emigration/ui/emigration-departure-tile.js";
import { clearEmptyRuralDistrict } from "/emigration/ui/emigration-plot-cleanup.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }

const local = GameContext.localPlayerID;

function expandPlots(c) {
  const r = safe(() => Game.CityCommands.canStart(c.id, CityCommandTypes.EXPAND, {}, false), null);
  return r && Array.isArray(r.Plots) ? r.Plots : [];
}
function workerPlots(c) {
  const all = safe(() => c.Workers.GetAllPlacementInfo(), []) || [];
  return all.filter((p) => p && p.NumWorkers > 0).map((p) => ({ plot: p.PlotIndex, n: p.NumWorkers, max: p.MaxWorkers }));
}
function improvementCount(c) {
  let n = 0;
  for (const plot of safe(() => c.getPurchasedPlots(), []) || []) {
    const loc = GameplayMap.getLocationFromIndex(plot);
    for (const id of safe(() => MapConstructibles.getConstructibles(loc.x, loc.y), []) || []) {
      const inst = safe(() => Constructibles.getByComponentID(id), null);
      const info = inst ? safe(() => GameInfo.Constructibles.lookup(inst.type), null) : null;
      if (info && info.ConstructibleClass === "IMPROVEMENT") n++;
    }
  }
  return n;
}
function plotTypes(plot) {
  const loc = GameplayMap.getLocationFromIndex(plot);
  return (safe(() => MapConstructibles.getConstructibles(loc.x, loc.y), []) || []).map((id) => {
    const inst = safe(() => Constructibles.getByComponentID(id), null);
    const info = inst ? safe(() => GameInfo.Constructibles.lookup(inst.type), null) : null;
    return info ? info.ConstructibleType : "?";
  });
}
function ready(c) {
  return safe(() => {
    const g = c.Growth;
    const v = g.isReadyToPlacePopulation;
    return typeof v === "function" ? v.call(g) : v;
  });
}
function blocking() {
  return safe(() => {
    const b = Game.Notifications.getEndTurnBlockingType(local);
    return String(b) === String(EndTurnBlockingTypes.NONE) ? "none" : String(b);
  });
}
function snap(cid) {
  const c = Cities.get(cid);
  const s = {
    pop: c.population, rural: c.ruralPopulation, urban: c.urbanPopulation,
    spec: safe(() => c.Workers.getNumWorkers(false)), pending: safe(() => c.pendingPopulation),
    ready: ready(c), expand: expandPlots(c).length, improvements: improvementCount(c),
    workers: workerPlots(c), turnsToGrow: safe(() => c.Growth.turnsUntilGrowth), block: blocking()
  };
  s.placed = (Number(s.rural) || 0) + (Number(s.urban) || 0) + (Number(s.spec) || 0);
  s.gap = s.pop - s.placed;
  return s;
}
function delta(a, b) {
  return { pop: b.pop - a.pop, rural: b.rural - a.rural, urban: b.urban - a.urban, spec: b.spec - a.spec,
    pending: b.pending, improvements: b.improvements - a.improvements, ready: b.ready, gap: b.gap };
}

async function run() {
  CONFIG.turnInterval = 99999; // no emigration pass may touch the city during the test
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && workerPlots(s.city).length > 0);
  const pick = mine.find((s) => /London/.test(cityName(s.city))) || mine[0];
  emit("START turn=" + safe(() => Game.turn) + " candidates=" + J(mine.map((s) => cityName(s.city))));
  if (!pick) { emit("NO local city with a specialist; DONE modtest55 finished"); emit("DONE modtest55 finished"); return; }
  const cid = pick.city.id;
  const A0 = snap(cid);
  emit("A0 " + cityName(pick.city) + " " + J(A0) + " readyType=" + safe(() => typeof Cities.get(cid).Growth.isReadyToPlacePopulation));

  // A: un-assign one specialist the way the shipped unassignSpecialist does: the first purchased plot canStart accepts.
  // (modtest55 run 1 sent it on a GetAllPlacementInfo worker plot, canStart refused it, and nothing changed.)
  const c0 = Cities.get(cid);
  const info = new Map((safe(() => c0.Workers.GetAllPlacementInfo(), []) || []).map((p) => [p.PlotIndex, p]));
  const accepted = [];
  for (const p of safe(() => c0.getPurchasedPlots(), []) || []) {
    const r = safe(() => Game.PlayerOperations.canStart(local, PlayerOperationTypes.ASSIGN_WORKER, { Location: p, Amount: -1 }, false), null);
    if (r && r.Success) {
      const pi = info.get(p);
      accepted.push({ plot: p, types: plotTypes(p), workers: pi ? pi.NumWorkers : null, max: pi ? pi.MaxWorkers : null, blocked: pi ? pi.IsBlocked : null });
    }
  }
  emit("A accepted plots (" + accepted.length + ") " + J(accepted.slice(0, 12)) + " workerPlots=" + J(A0.workers.map((w) => ({ ...w, types: plotTypes(w.plot) }))));
  const wp = accepted.length ? accepted[0].plot : A0.workers[0].plot;
  const args = { Location: wp, Amount: -1 };
  const can = safe(() => Game.PlayerOperations.canStart(local, PlayerOperationTypes.ASSIGN_WORKER, args, false), null);
  const sent = safe(() => Game.PlayerOperations.sendRequest(local, PlayerOperationTypes.ASSIGN_WORKER, args));
  emit("A send ASSIGN_WORKER -1 plot=" + wp + " canStart=" + J(can) + " sent=" + J(sent));
  await later(4000);
  const A1 = snap(cid);
  emit("A1 +4s " + J(A1));
  await later(4000);
  const A2 = snap(cid);
  emit("A2 +8s " + J(A2));
  const held = A2.ready === true || A2.expand > 0;
  emit("A VERDICT held=" + held + " delta=" + J(delta(A0, A2)));

  // B: the swap, only when a point is waiting.
  let tilePlot = null;
  if (!held) {
    emit("B skipped: no waiting point after un-assign");
  } else {
    const tile = findDepartureTile(Cities.get(cid));
    if (!tile) {
      emit("B skipped: no departure tile");
    } else {
      tilePlot = tile.plot;
      emit("B tile " + tile.type + " plot=" + tile.plot + " owner=" + tile.elem.owner + " id=" + tile.elem.id);
      safe(() => Game.PlayerOperations.sendRequest(local, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: tile.elem.owner, LocalID: tile.elem.id }));
      await later(3000);
      const B1 = snap(cid);
      emit("B1 after destroy " + J(B1) + " plotNow=" + J(plotTypes(tile.plot)));
      const cleared = clearEmptyRuralDistrict(tile.plot);
      await later(3000);
      const B2 = snap(cid);
      const offered = expandPlots(Cities.get(cid));
      emit("B2 after district clear sent=" + cleared + " " + J(B2) + " plotOffered=" + offered.includes(tile.plot) + " offered=" + J(offered.slice(0, 12)));
      const target = offered.includes(tile.plot) ? tile.plot : offered[0];
      if (target == null) {
        emit("B3 no EXPAND plot offered");
      } else {
        const loc = GameplayMap.getLocationFromIndex(target);
        safe(() => Game.CityCommands.sendRequest(cid, CityCommandTypes.EXPAND, { X: loc.x, Y: loc.y }));
        await later(4000);
        const B3 = snap(cid);
        emit("B3 after EXPAND plot=" + target + " samePlot=" + (target === tile.plot) + " " + J(B3) + " plotNow=" + J(plotTypes(target)));
        emit("B VERDICT net vs A0=" + J(delta(A0, B3)) + " (want pop -1, spec -1, rural 0, improvements 0, pending 0, gap 0, ready false)");
      }
    }
  }

  // C: end one turn and read again.
  let done = false;
  const finish = (why) => { if (done) return; done = true; emit("DONE modtest55 finished (" + why + ")"); };
  engine.on("PlayerTurnActivated", (d) => {
    const who = d && (d.player ?? d.Player);
    if (who !== local || done) return;
    setTimeout(() => {
      const C = snap(cid);
      emit("C next turn=" + safe(() => Game.turn) + " " + J(C) + (tilePlot != null ? " tilePlotNow=" + J(plotTypes(tilePlot)) : ""));
      emit("C VERDICT net vs A0=" + J(delta(A0, C)));
      finish("turn");
    }, 6000);
  });
  let tries = 0;
  const endTurn = () => {
    if (done) return;
    if (!safe(() => Players.get(local).isTurnActive, false) || safe(() => GameContext.hasSentTurnComplete(), false)) return;
    const b = blocking();
    tries++;
    if (b !== "none" && tries >= 3 && tries < 6) emit("ENDTURN blocked by " + b + " (try " + tries + "); sending anyway");
    if (b !== "none" && tries >= 6 && typeof Autoplay !== "undefined") {
      emit("ENDTURN still blocked by " + b + "; Autoplay 1 turn (C counts polluted by AI placement)");
      safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
      return;
    }
    safe(() => UI.Player.deselectAllUnits());
    safe(() => GameContext.sendTurnComplete());
    emit("ENDTURN sent (block=" + b + ")");
    setTimeout(endTurn, 8000);
  };
  endTurn();
  setTimeout(() => finish("turn timeout"), 180000);
}

emit("modtest55 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest55 finished (threw)"); }); }, 12000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
