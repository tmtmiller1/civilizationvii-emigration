// eep-modtest24.js - DEAD RURAL PLOTS after a departure (user report 2026-09-14: "a removed tile can never
// be repaired or re-placed, noticed in towns"). Save AugustusAnt43 (the user's own game), human control,
// no turn ending. Logs [EmigTest]; "SHOT" asks for a screenshot.
//   D0 the 12 plots the mod abandoned this session: owner, owning settlement (town?), district, constructibles,
//      and whether the plot is in the owning settlement's EXPAND list (what the place-population dialog offers).
//   D1 every settlement: owned plots that carry a RURAL district with NO constructible, and how many of those
//      are offered by EXPAND; plus a baseline: owned plots with no district and whether EXPAND offers them.
//   D2 the candidate fix on existing dead plots: DESTROY_ELEMENT {Kind:"DISTRICT"} (the tuner's form), then
//      re-read district / ownership / EXPAND. Up to 3 local plots (towns first) and 1 AI plot.
//   D3 the full cycle on a FRESH tile in a local town: the shipped departure (abandonTileOrDecrement) -> read
//      the plot -> destroy the district -> read -> +1 rural population and EXPAND onto that exact plot -> read.
//   then SHOT dead-plot-fixed, DONE.

import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { abandonTileOrDecrement, listDepartureTiles } from "/emigration/ui/emigration-departure-tile.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function look(loc) { safe(() => Camera.lookAtPlot(loc, { zoom: 0, instantaneous: true })); }
const LOGGED = [2568, 4568, 3773, 3870, 2953, 2855, 2856, 4567, 4667, 4759, 1756, 2761];

function consAt(loc) {
  return safe(() => (MapConstructibles.getConstructibles(loc.x, loc.y) || []).map((id) => {
    const i = Constructibles.getByComponentID(id);
    const info = i ? GameInfo.Constructibles.lookup(i.type) : null;
    return info ? info.ConstructibleType : "?";
  }), []);
}
function districtAt(loc) {
  return safe(() => {
    const d = Districts.getAtLocation(loc);
    if (!d) return null;
    const info = GameInfo.Districts.lookup(d.type);
    const idAt = Districts.getIdAtLocation(loc);
    return { type: info ? info.DistrictType : String(d.type), owner: idAt ? idAt.owner : d.owner, id: idAt ? idAt.id : d.localId };
  }, null);
}
function owningCity(loc) { return safe(() => { const id = GameplayMap.getOwningCityFromXY(loc.x, loc.y); return id ? Cities.get(id) : null; }, null); }
function expandSet(city) {
  return safe(() => { const r = Game.CityCommands.canStart(city.id, CityCommandTypes.EXPAND, {}, false); return new Set((r && r.Plots) || []); }, new Set());
}
function plotReport(plot) {
  const loc = GameplayMap.getLocationFromIndex(plot);
  const city = owningCity(loc);
  return {
    plot, xy: loc.x + "," + loc.y, owner: safe(() => GameplayMap.getOwner(loc.x, loc.y), "?"),
    city: city ? cityName(city) : null, town: city ? !!city.isTown : null, pop: city ? city.population : null,
    district: districtAt(loc), cons: consAt(loc), inExpand: city ? expandSet(city).has(plot) : null
  };
}
function destroyDistrict(loc) {
  const d = districtAt(loc);
  if (!d) return false;
  safe(() => Game.PlayerOperations.sendRequest(GameContext.localPlayerID, "DESTROY_ELEMENT", { Kind: "DISTRICT", Owner: d.owner, LocalID: d.id }));
  return true;
}

async function run() {
  const local = GameContext.localPlayerID;
  const sigs = collectCitySignals();
  emit("START turn=" + safe(() => Game.turn) + " local=" + local + " width=" + safe(() => GameplayMap.getGridWidth()) + " settlements=" + sigs.length);

  // D0
  for (const p of LOGGED) emit("D0 " + J(plotReport(p)));

  // D1
  const dead = [];
  for (const s of sigs) {
    const c = s.city;
    const ex = expandSet(c);
    let emptyRural = 0, emptyRuralOffered = 0, bare = 0, bareOffered = 0;
    for (const plot of safe(() => c.getPurchasedPlots(), []) || []) {
      const loc = GameplayMap.getLocationFromIndex(plot);
      if (safe(() => GameplayMap.isWater(loc.x, loc.y), false)) continue;
      const d = districtAt(loc);
      const cons = consAt(loc);
      if (d && d.type === "DISTRICT_RURAL" && cons.length === 0) {
        emptyRural++; if (ex.has(plot)) emptyRuralOffered++;
        dead.push({ plot, loc, owner: s.owner, town: !!s.isTown, name: cityName(c), cityRef: c });
      } else if (!d && cons.length === 0) { bare++; if (ex.has(plot)) bareOffered++; }
    }
    if (emptyRural > 0 || s.owner === local) {
      emit("D1 " + cityName(c) + " owner=" + s.owner + (s.owner === local ? "(local)" : "") + " town=" + !!s.isTown + " pop=" + s.population +
        " emptyRuralDistricts=" + emptyRural + " offeredByExpand=" + emptyRuralOffered + " | bareOwnedPlots=" + bare + " offered=" + bareOffered + " expandTotal=" + ex.size);
    }
  }
  emit("D1 total empty rural districts=" + dead.length + " (local " + dead.filter((d) => d.owner === local).length + ", in towns " + dead.filter((d) => d.town).length + ")");

  // D2
  const localDead = dead.filter((d) => d.owner === local).sort((a, b) => (b.town ? 1 : 0) - (a.town ? 1 : 0)).slice(0, 3);
  const aiDead = dead.filter((d) => d.owner !== local).slice(0, 1);
  let fixedLoc = null;
  for (const d of localDead.concat(aiDead)) {
    const before = plotReport(d.plot);
    destroyDistrict(d.loc);
    await later(3000);
    const after = plotReport(d.plot);
    emit("D2 " + d.name + " town=" + d.town + " before=" + J(before) + " afterDistrictDestroy=" + J(after));
    if (!fixedLoc && d.owner === local) fixedLoc = d.loc;
  }

  // D3
  const town = sigs.filter((s) => s.owner === local && s.isTown && listDepartureTiles(s.city).length > 0).sort((a, b) => b.population - a.population)[0]
    || sigs.filter((s) => s.owner === local && listDepartureTiles(s.city).length > 0).sort((a, b) => b.population - a.population)[0];
  if (town) {
    const c = town.city;
    const popBefore = c.population;
    const r = abandonTileOrDecrement(c);
    await later(3500);
    if (r && r.plot != null) {
      const loc = GameplayMap.getLocationFromIndex(r.plot);
      emit("D3 " + cityName(c) + " town=" + !!town.isTown + " departure=" + J(r) + " pop " + popBefore + "->" + c.population + " plotAfterDeparture=" + J(plotReport(r.plot)));
      destroyDistrict(loc);
      await later(3000);
      emit("D3 plotAfterDistrictDestroy=" + J(plotReport(r.plot)) + " pop=" + c.population);
      safe(() => c.addRuralPopulation(1));
      await later(1500);
      const can = safe(() => Game.CityCommands.canStart(c.id, CityCommandTypes.EXPAND, { X: loc.x, Y: loc.y }, false));
      safe(() => Game.CityCommands.sendRequest(c.id, CityCommandTypes.EXPAND, { X: loc.x, Y: loc.y }));
      await later(3500);
      emit("D3 re-place canStart=" + J(can && { Success: can.Success }) + " plotAfterRePlace=" + J(plotReport(r.plot)) + " pop=" + c.population + " pending=" + safe(() => c.pendingPopulation));
      fixedLoc = loc;
    } else emit("D3 departure took no tile: " + J(r));
  } else emit("D3 skipped: no local settlement with a rural tile");

  if (fixedLoc) { look(fixedLoc); await later(4000); emit("SHOT dead-plot-fixed"); await later(10000); }
  emit("DONE modtest24 finished");
}

emit("modtest24 attached");
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
