// eep-modtest8.js - do the enclave's NATIVE yields show on the tile? Plus the Village-skin questions.
// Human-controlled Exploration save (AugustusExp66), no Autoplay. Logs [EmigTest]; "SHOT" lines ask the
// runner for screenshots.
//   Y1 London's outlying tile: GameplayMap.getYields before (its current improvement) and after the enclave
//      replaces it (ROME a: +2 Culture natively), the constructible instance's `complete` flag, and the
//      city's net culture before/after.
//   Y2 yield icons layer on (LensManager "fxs-yields-layer"), camera on the tile, screenshot
//      "enclave-yields".
//   V1 do any major civilizations already own IMPROVEMENT_VILLAGE tiles (scan every met city)?
//   V2 place a plain IMPROVEMENT_VILLAGE on London's next outlying tile (art check), read its yields,
//      screenshot "village-skin".
//   then end one turn and DONE.

import { placeEnclave, enclaveStanding, emptyPlotsOf } from "/emigration/ui/emigration-enclave-place.js";
import { findDepartureTile, listDepartureTiles } from "/emigration/ui/emigration-departure-tile.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, finished = false, enclaveLoc = null, cityRef = null;
let LM = null;
import("/core/ui/lenses/lens-manager.js").then((m) => { LM = m.default || m.LensManager || m; }).catch((e) => emit("lens import failed " + e));
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function yieldsAt(loc) { return safe(() => { const y = GameplayMap.getYields(GameplayMap.getIndexFromLocation(loc), local); return Array.isArray(y) ? y.map((p) => [safe(() => GameInfo.Yields.lookup(p[0]).YieldType, p[0]), p[1]]) : ("raw:" + J(y)); }, "ERR"); }
function plotInfo(loc) { return safe(() => (MapConstructibles.getConstructibles(loc.x, loc.y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null; return { type: info ? info.ConstructibleType : "?", complete: i && i.complete, damaged: i && i.damaged }; }), []); }
function cityCulture(c) { return safe(() => Math.round(c.Yields.getNetYield(YieldTypes.YIELD_CULTURE) * 10) / 10); }
function look(loc) { safe(() => Camera.lookAtPlot(loc, { zoom: 0, instantaneous: true })); }

async function run() {
  local = GameContext.localPlayerID;
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population);
  const withEmpty = mine.find((s) => emptyPlotsOf(s.city).length > 0);
  const L = withEmpty || mine[0];
  emit("EMPTY-PLOT city=" + (withEmpty ? cityName(withEmpty.city) : "none") + " emptyPlots=" + (withEmpty ? emptyPlotsOf(withEmpty.city).length : 0));
  emit("START turn=" + safe(() => Game.turn) + " L=" + cityName(L.city) + " turnActive=" + safe(() => Players.get(local).isTurnActive) + " culture=" + cityCulture(L.city));
  // V1 villages owned by majors
  {
    const hits = [];
    for (const s of sigs) for (const t of listDepartureTiles(s.city)) if (/VILLAGE|ENCAMPMENT/.test(t.type)) hits.push(cityName(s.city) + ":" + t.type);
    emit("V1 villages/encampments inside major cities: " + J(hits) + " (of " + sigs.length + " met cities)");
  }
  // Y1 enclave yields
  const landTiles = () => listDepartureTiles(L.city).filter((x) => !/FISHING|BOAT/.test(x.type) && !x.onResource && !x.type.startsWith("IMPROVEMENT_EMIG_ENCLAVE_"));
  let t, before, r, loc;
  if (withEmpty) {
    // the empty-plot path: rural district first, then the enclave (the shipped placeEnclave path)
    const e = emptyPlotsOf(L.city)[0];
    before = { plot: plotInfo(e.loc), yields: yieldsAt(e.loc), culture: cityCulture(L.city), production: safe(() => Math.round(L.city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION) * 10) / 10) };
    r = placeEnclave(L.city, "CIVILIZATION_ROME", "a");
    await later(6000);
    loc = r ? GameplayMap.getLocationFromIndex(r.plot) : e.loc;
    t = { plot: e.plot, loc: e.loc };
  } else {
    t = landTiles()[0];
    if (!t) { emit("Y1 no outlying tile in " + cityName(L.city)); finished = true; setTimeout(endTurn, 2000); return; }
    before = { plot: plotInfo(t.loc), yields: yieldsAt(t.loc), culture: cityCulture(L.city) };
    const enclaveIdx = safe(() => GameInfo.Constructibles.lookup("IMPROVEMENT_EMIG_ENCLAVE_ROME_A").$index, null);
    safe(() => Game.PlayerOperations.sendRequest(local, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: t.elem.owner, LocalID: t.elem.id }));
    await later(3000);
    safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: enclaveIdx, Location: t.loc, Parent: L.city.id, Owner: L.city.owner }));
    await later(6000);
    r = { type: "IMPROVEMENT_EMIG_ENCLAVE_ROME_A", plot: t.plot };
    loc = t.loc;
  }
  enclaveLoc = loc; cityRef = L.city;
  emit("Y1 placed=" + J(r) + " standing=" + (r ? enclaveStanding({ placed: r }) : "n/a") + " before=" + J(before) + " after=" + J({ plot: plotInfo(loc), yields: yieldsAt(loc), culture: cityCulture(L.city), production: safe(() => Math.round(L.city.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION) * 10) / 10), district: safe(() => !!Districts.getAtLocation(loc)) }) + " (ROME a = +2 PRODUCTION natively)");
  // Y2 yield icons + screenshot
  {
    const on = safe(() => { if (!LM) return "no LensManager"; if (LM.isLayerEnabled && LM.isLayerEnabled("fxs-yields-layer")) return "already on"; LM.enableLayer ? LM.enableLayer("fxs-yields-layer") : LM.toggleLayer("fxs-yields-layer"); return "enabled"; });
    look(loc);
    await later(4000);
    emit("Y2 yields layer=" + on + " camera on plot " + (r ? r.plot : t.plot));
    emit("SHOT enclave-yields");
    await later(10000);
  }
  // V2 a plain Village on the next outlying tile
  {
    const t2 = landTiles()[0];
    const vIdx = safe(() => GameInfo.Constructibles.lookup("IMPROVEMENT_VILLAGE").$index, null);
    if (t2 && vIdx != null) {
      const before2 = { plot: plotInfo(t2.loc), yields: yieldsAt(t2.loc) };
      safe(() => Game.PlayerOperations.sendRequest(local, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: t2.elem.owner, LocalID: t2.elem.id }));
      await later(3000);
      safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: vIdx, Location: t2.loc, Parent: L.city.id, Owner: L.city.owner }));
      await later(6000);
      emit("V2 village on plot " + t2.plot + " before=" + J(before2) + " after=" + J({ plot: plotInfo(t2.loc), yields: yieldsAt(t2.loc) }));
      look(t2.loc);
      await later(4000);
      emit("SHOT village-skin");
      await later(10000);
    } else emit("V2 skipped: tile=" + !!t2 + " villageIdx=" + vIdx);
  }
  emit("ACTIONS done; ending the turn");
  finished = true;
  setTimeout(endTurn, 2000);
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
  if (finished) setTimeout(() => { if (enclaveLoc) emit("Y3 next turn: plot=" + J(plotInfo(enclaveLoc)) + " yields=" + J(yieldsAt(enclaveLoc)) + " production=" + safe(() => Math.round(cityRef.Yields.getNetYield(YieldTypes.YIELD_PRODUCTION) * 10) / 10)); emit("DONE modtest8 finished"); }, 4000);
});
emit("modtest8 attached");
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
