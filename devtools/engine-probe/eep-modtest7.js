// eep-modtest7.js - WHY does a fresh enclave placement fail in the Exploration age? (Mod tests 5 and 7 saw
// London's empty-plot placement not take at Exploration turns 1 and 2, and an AI farmstead takeover not
// take at turn 3, while the same calls worked in Antiquity and the Antiquity-placed tiles stood.)
// Loads an Exploration autosave from mod test 7 (the Antiquity enclaves are on the map). Autoplay OFF; the
// local player's turn is active. Logs [EmigTest] to UI.log.
//   D1 canStart for CREATE_ELEMENT DISTRICT_RURAL on London's empty plot, and the district read after a
//      real request (does the district appear?).
//   D2 canStart + request for the enclave improvement on that plot (after D1), and on an existing
//      farmstead plot of London (destroy first, tuner shape), reading the plot 6 s later.
//   D3 the same takeover on an AI city, reading canStart for both the DESTROY and the CREATE.
//   D4 control: a plain IMPROVEMENT_FARM CREATE on the empty plot (is it the enclave type or any create?).
//   D5 the compiled data: does GameInfo.Constructibles still list the enclave and is Age null?
//   then end one turn and DONE.

import { placeEnclave, enclaveTypeFor, enclaveIndex, emptyPlotsOf, enclaveTypeAt } from "/emigration/ui/emigration-enclave-place.js";
import { findDepartureTile } from "/emigration/ui/emigration-departure-tile.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1, n = 0, endTurnTimer = null, blockedTries = 0;
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function ageName() { return safe(() => GameInfo.Ages.lookup(Game.age).AgeType, "?"); }
function plotTypes(loc) { return safe(() => (MapConstructibles.getConstructibles(loc.x, loc.y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null; return info ? info.ConstructibleType : "?"; }), []); }
function districtAt(loc) { return safe(() => { const d = Districts.getAtLocation(loc); return d ? (safe(() => GameInfo.Districts.lookup(d.type).DistrictType, "?") + "") : null; }, "ERR"); }
function can(op, args) { return safe(() => { const r = Game.PlayerOperations.canStart(local, op, args, false); return r && { Success: r.Success, FailureReasons: r.FailureReasons, keys: Object.keys(r) }; }, "ERR"); }
function send(op, args) { return safe(() => { Game.PlayerOperations.sendRequest(local, op, args); return "sent"; }, "ERR"); }

let finished = false;
async function run() {
  local = GameContext.localPlayerID;
  // The autosave was taken under Autoplay, so the game resumes it on load: switch it off and wait for the
  // local player's turn to be active before sending anything (the first attempt sent everything while
  // turnActive=false and nothing landed although canStart said Success).
  safe(() => { Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setTurns(0); Autoplay.setActive(false); });
  for (let i = 0; i < 40 && !safe(() => Players.get(local).isTurnActive, false); i++) await later(2000);
  // Quiet check: turns must NOT advance on their own for 20 s before the writes (the previous run's turns
  // kept ending every ~8 s after setActive(false), so the AI may have been acting for London concurrently).
  const t0 = safe(() => Game.turn, 0), n0 = n;
  await later(20000);
  emit("AUTOPLAY off; turnActive=" + safe(() => Players.get(local).isTurnActive) + " turn " + t0 + "->" + safe(() => Game.turn) + " activations=" + (n - n0) + " autoplayActive=" + safe(() => Autoplay.isActive));
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population);
  const foreign = sigs.filter((s) => s.owner !== local && !s.isCityState && !s.isTown).sort((a, b) => b.population - a.population);
  const L = mine[0], F = foreign[0];
  const typeB = enclaveTypeFor("CIVILIZATION_ROME", "b"), idxB = enclaveIndex(typeB);
  emit("START turn=" + safe(() => Game.turn) + " age=" + ageName() + " L=" + cityName(L.city) + " turnActive=" + safe(() => Players.get(local).isTurnActive) + " enclaveIdx=" + idxB + " londonPending=" + safe(() => L.city.pendingPopulation) + " pop=" + L.city.population);
  // D5 data
  {
    const def = safe(() => GameInfo.Constructibles.lookup(typeB), null);
    emit("D5 def=" + J(def && { type: def.ConstructibleType, age: def.Age, cls: def.ConstructibleClass, unlock: def.RequiresUnlock, idx: def.$index }) + " farmDef=" + J(safe(() => { const f = GameInfo.Constructibles.lookup("IMPROVEMENT_FARM"); return { age: f.Age, idx: f.$index }; })));
  }
  // D1 district on the empty plot
  const empties = emptyPlotsOf(L.city);
  emit("D1 " + cityName(L.city) + " emptyPlots=" + J(empties.map((e) => ({ plot: e.plot, loc: e.loc, d: e.distance, terrain: safe(() => GameInfo.Terrains.lookup(GameplayMap.getTerrainType(e.loc.x, e.loc.y)).TerrainType), feature: safe(() => GameplayMap.getFeatureType(e.loc.x, e.loc.y)), river: safe(() => GameplayMap.isRiver(e.loc.x, e.loc.y)), owner: safe(() => GameplayMap.getOwner(e.loc.x, e.loc.y)) }))));
  if (empties.length) {
    const e = empties[0];
    const dArgs = { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: e.loc, Parent: L.city.id, Owner: L.city.owner };
    emit("D1 canStart district=" + J(can("CREATE_ELEMENT", dArgs)));
    send("CREATE_ELEMENT", dArgs);
    await later(5000);
    emit("D1 after district request: districtAt=" + districtAt(e.loc) + " plot=" + J(plotTypes(e.loc)));
    // D2a enclave on that plot
    const cArgs = { Kind: "CONSTRUCTIBLE", Type: idxB, Location: e.loc, Parent: L.city.id, Owner: L.city.owner };
    emit("D2a canStart enclave=" + J(can("CREATE_ELEMENT", cArgs)));
    send("CREATE_ELEMENT", cArgs);
    await later(5000);
    emit("D2a after enclave request: plot=" + J(plotTypes(e.loc)) + " enclaveAt=" + enclaveTypeAt(e.loc.x, e.loc.y));
    // D4 control: a plain farm on the same plot (if still empty)
    if (!plotTypes(e.loc).length) {
      const fArgs = { Kind: "CONSTRUCTIBLE", Type: safe(() => GameInfo.Constructibles.lookup("IMPROVEMENT_FARM").$index), Location: e.loc, Parent: L.city.id, Owner: L.city.owner };
      emit("D4 canStart farm=" + J(can("CREATE_ELEMENT", fArgs)));
      send("CREATE_ELEMENT", fArgs);
      await later(5000);
      emit("D4 after farm request: plot=" + J(plotTypes(e.loc)) + " districtAt=" + districtAt(e.loc));
    }
  } else emit("D1 no empty plot in " + cityName(L.city));
  // D2b takeover of an existing farmstead in London (district exists)
  {
    const t = findDepartureTile(L.city);
    if (t) {
      const dArgs = { Kind: "CONSTRUCTIBLE", Owner: t.elem.owner, LocalID: t.elem.id };
      emit("D2b tile=" + t.type + " plot=" + t.plot + " canStart destroy=" + J(can("DESTROY_ELEMENT", dArgs)));
      send("DESTROY_ELEMENT", dArgs);
      await later(4000);
      emit("D2b after destroy: plot=" + J(plotTypes(t.loc)) + " districtAt=" + districtAt(t.loc));
      const cArgs = { Kind: "CONSTRUCTIBLE", Type: idxB, Location: t.loc, Parent: L.city.id, Owner: L.city.owner };
      emit("D2b canStart enclave=" + J(can("CREATE_ELEMENT", cArgs)));
      send("CREATE_ELEMENT", cArgs);
      await later(5000);
      emit("D2b after enclave request: plot=" + J(plotTypes(t.loc)) + " londonPending=" + safe(() => L.city.pendingPopulation));
      if (!plotTypes(t.loc).length) {
        const fArgs = { Kind: "CONSTRUCTIBLE", Type: safe(() => GameInfo.Constructibles.lookup("IMPROVEMENT_FARM").$index), Location: t.loc, Parent: L.city.id, Owner: L.city.owner };
        send("CREATE_ELEMENT", fArgs);
        await later(5000);
        emit("D2c control farm on the emptied plot: plot=" + J(plotTypes(t.loc)) + " terrain=" + safe(() => GameInfo.Terrains.lookup(GameplayMap.getTerrainType(t.loc.x, t.loc.y)).TerrainType) + " resource=" + safe(() => GameplayMap.getResourceType(t.loc.x, t.loc.y)));
        // and the shipped path once more, now on a plot with district and nothing on it
        const cArgs2 = { Kind: "CONSTRUCTIBLE", Type: idxB, Location: t.loc, Parent: L.city.id, Owner: L.city.owner };
        if (!plotTypes(t.loc).length) { send("CREATE_ELEMENT", cArgs2); await later(5000); emit("D2d enclave retry: plot=" + J(plotTypes(t.loc))); }
      }
    } else emit("D2b no farmstead in " + cityName(L.city));
  }
  // D3 AI city takeover via the shipped path, with canStart reads first
  {
    const t = findDepartureTile(F.city);
    if (t) {
      emit("D3 " + cityName(F.city) + " tile=" + t.type + " canStart destroy=" + J(can("DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: t.elem.owner, LocalID: t.elem.id })) +
        " canStart enclave=" + J(can("CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: enclaveIndex(enclaveTypeFor("CIVILIZATION_GREECE", "a")), Location: t.loc, Parent: F.city.id, Owner: F.city.owner })));
      const r = placeEnclave(F.city, "CIVILIZATION_GREECE", "a");
      await later(6000);
      emit("D3 placeEnclave=" + J(r) + " plotNow=" + J(r ? plotTypes(GameplayMap.getLocationFromIndex(r.plot)) : null));
    }
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
  emit("TURN activated n=" + n + " turn=" + safe(() => Game.turn) + " age=" + ageName() + " ALIVE");
  if (finished) setTimeout(() => emit("DONE modtest7 finished"), 3000);
});
emit("modtest7 attached");
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
