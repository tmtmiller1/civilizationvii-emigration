// eep-modtest25.js - the SHIPPED dead-plot fix (emigration-plot-cleanup.js) watched on the user's own save
// (AugustusAnt43), human control, no turn ending. Logs [EmigTest]; "SHOT" asks for a screenshot.
//   F0 empty rural districts on every settlement's land after load (the automatic turn-start sweep should
//      already have cleared the 10 left by earlier departures), plus the sweep's own log line if any.
//   F1 a fresh departure through the shipped abandonTileOrDecrement in Birmingham: read the plot at once
//      (empty district expected) and again after the cleanup delay (no district, offered by EXPAND).
//   F2 the enclave-removal path: the shipped destroyPlacedTile on a record pointing at another improvement,
//      then the same two reads.
//   F3 a new population point placed on the F1 plot with EXPAND.
//   then SHOT, DONE.

import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { abandonTileOrDecrement, listDepartureTiles } from "/emigration/ui/emigration-departure-tile.js";
import { destroyPlacedTile } from "/emigration/ui/emigration-enclave-place.js";
import { emptyRuralDistrictAt, CLEANUP_DELAY_MS } from "/emigration/ui/emigration-plot-cleanup.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function look(loc) { safe(() => Camera.lookAtPlot(loc, { zoom: 0, instantaneous: true })); }
function consAt(loc) {
  return safe(() => (MapConstructibles.getConstructibles(loc.x, loc.y) || []).map((id) => {
    const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null;
    return info ? info.ConstructibleType : "?";
  }), []);
}
function districtType(loc) { return safe(() => { const d = Districts.getAtLocation(loc); return d ? GameInfo.Districts.lookup(d.type).DistrictType : null; }, null); }
function inExpand(city, plot) { return safe(() => { const r = Game.CityCommands.canStart(city.id, CityCommandTypes.EXPAND, {}, false); return ((r && r.Plots) || []).includes(plot); }, null); }
function read(city, plot) { const loc = GameplayMap.getLocationFromIndex(plot); return { plot, xy: loc.x + "," + loc.y, district: districtType(loc), cons: consAt(loc), inExpand: inExpand(city, plot), pop: city.population }; }
function countEmpty(sigs) {
  let n = 0; const where = {};
  for (const s of sigs) for (const plot of safe(() => s.city.getPurchasedPlots(), []) || []) {
    if (emptyRuralDistrictAt(plot)) { n++; where[cityName(s.city)] = (where[cityName(s.city)] || 0) + 1; }
  }
  return { n, where };
}

async function run() {
  const local = GameContext.localPlayerID;
  const sigs = collectCitySignals();
  emit("START turn=" + safe(() => Game.turn) + " delay=" + CLEANUP_DELAY_MS + " settlements=" + sigs.length);
  emit("F0 empty rural districts now=" + J(countEmpty(sigs)) + " (10 before the fix in this save)");

  const town = sigs.find((s) => s.owner === local && cityName(s.city) === "Birmingham" && listDepartureTiles(s.city).length > 1)
    || sigs.filter((s) => s.owner === local && listDepartureTiles(s.city).length > 1).sort((a, b) => b.population - a.population)[0];
  if (!town) { emit("no local settlement with two rural tiles"); emit("DONE modtest25 finished"); return; }
  const c = town.city;

  // F1
  const r = abandonTileOrDecrement(c);
  await later(800);
  if (!r || r.plot == null) { emit("F1 no tile taken " + J(r)); emit("DONE modtest25 finished"); return; }
  emit("F1 " + cityName(c) + " town=" + !!town.isTown + " departure=" + J(r) + " immediately=" + J(read(c, r.plot)));
  await later(CLEANUP_DELAY_MS + 3000);
  emit("F1 afterCleanupDelay=" + J(read(c, r.plot)));

  // F2
  const other = listDepartureTiles(c).find((t) => t.plot !== r.plot);
  if (other) {
    const ok = destroyPlacedTile({ placed: { type: other.type, plot: other.plot } });
    await later(800);
    emit("F2 destroyPlacedTile(" + other.type + " at " + other.plot + ")=" + ok + " immediately=" + J(read(c, other.plot)));
    await later(CLEANUP_DELAY_MS + 3000);
    emit("F2 afterCleanupDelay=" + J(read(c, other.plot)));
  } else emit("F2 skipped: no second rural tile");

  // F3
  const loc = GameplayMap.getLocationFromIndex(r.plot);
  safe(() => c.addRuralPopulation(1));
  await later(1500);
  const can = safe(() => Game.CityCommands.canStart(c.id, CityCommandTypes.EXPAND, { X: loc.x, Y: loc.y }, false));
  safe(() => Game.CityCommands.sendRequest(c.id, CityCommandTypes.EXPAND, { X: loc.x, Y: loc.y }));
  await later(3500);
  emit("F3 re-place canStart=" + J(can && { Success: can.Success }) + " after=" + J(read(c, r.plot)));

  look(loc); await later(4000); emit("SHOT shipped-fix-replaced"); await later(10000);
  emit("DONE modtest25 finished");
}

emit("modtest25 attached");
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
