// eep-modtest10.js - can the engine place OTHER civilizations' unique improvements (and off-age ones) as
// enclave tiles, do they carry their native yields for a foreign owner, and do they survive AI turns?
// Plus a look at candidate fallback skins. Human-controlled Exploration save (AugustusExp66, the player is
// Mongolia). Logs [EmigTest]; "SHOT <name>" lines ask the runner for screenshots.
//   Each placement: destroy an outlying non-resource land tile of the right terrain, CREATE the type, read
//   the plot 7 s later (types on it, yields), camera + screenshot. Then end 2 turns and re-read every plot.
//   Foreign on-age:  GAMA (Goryeo, Exploration) in London.
//   Off-age (past):  HAWELT (Aksum, Antiquity, flat) in London.
//   Off-age (future): STEPWELL (Mughal, Modern) in London (is the type even loaded?).
//   AI city:         ORTOO (Mongolia, flat) and GAMA in Paris (AI turns run over them).
//   Fallback looks:  CARAVANSERAI, HIDDEN_FORTRESS, THING, MAWASKAWE_SKOTE, ENCAMPMENT across my cities.

import { listDepartureTiles } from "/emigration/ui/emigration-departure-tile.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1, n = 0, endTurnTimer = null, blockedTries = 0, finished = false;
const placed = [];
const used = new Set();
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function yieldsAt(loc) { return safe(() => { const y = GameplayMap.getYields(GameplayMap.getIndexFromLocation(loc), local); return Array.isArray(y) ? y.map((p) => [safe(() => GameInfo.Yields.lookup(p[0]).YieldType, p[0]), p[1]]) : ("raw:" + J(y)); }, "ERR"); }
function plotInfo(loc) { return safe(() => (MapConstructibles.getConstructibles(loc.x, loc.y) || []).map((id) => { const i = Constructibles.getByComponentID(id); const info = i ? GameInfo.Constructibles.lookup(i.type) : null; return (info ? info.ConstructibleType : "?") + (i && i.complete ? "" : "(incomplete)"); }), []); }
function terrainAt(loc) { return safe(() => GameInfo.Terrains.lookup(GameplayMap.getTerrainType(loc.x, loc.y)).TerrainType, "?"); }
function look(loc) { safe(() => Camera.lookAtPlot(loc, { zoom: 0, instantaneous: true })); }
function pickTile(sig, terrain) {
  return listDepartureTiles(sig.city).find((t) => !used.has(t.plot) && !t.onResource && !/FISHING|BOAT/.test(t.type) && (!terrain || terrainAt(t.loc) === terrain));
}
async function placeType(sig, type, terrain, shot) {
  const def = safe(() => GameInfo.Constructibles.lookup(type), null);
  const idx = def && typeof def.$index === "number" ? def.$index : null;
  if (idx == null) { emit("PLACE " + type + " in " + cityName(sig.city) + ": type NOT LOADED"); return; }
  const t = pickTile(sig, terrain);
  if (!t) { emit("PLACE " + type + " in " + cityName(sig.city) + ": no free " + (terrain || "land") + " tile"); return; }
  used.add(t.plot);
  const before = { was: t.type, terrain: terrainAt(t.loc), yields: yieldsAt(t.loc) };
  const sender = local;
  safe(() => Game.PlayerOperations.sendRequest(sender, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: t.elem.owner, LocalID: t.elem.id }));
  await later(3000);
  safe(() => Game.PlayerOperations.sendRequest(sender, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: idx, Location: t.loc, Parent: sig.city.id, Owner: sig.city.owner }));
  await later(7000);
  const after = { plot: plotInfo(t.loc), yields: yieldsAt(t.loc) };
  const ok = after.plot.some((p) => p.startsWith(type));
  emit("PLACE " + type + " (age " + (def.Age || "ageless") + ") in " + cityName(sig.city) + " owner=" + sig.owner + " plot " + t.plot + " " + (ok ? "LANDED" : "DID NOT LAND") + " before=" + J(before) + " after=" + J(after));
  placed.push({ type, city: cityName(sig.city), loc: t.loc, plot: t.plot });
  if (ok && shot) { look(t.loc); await later(4000); emit("SHOT " + shot); await later(10000); }
}

async function run() {
  local = GameContext.localPlayerID;
  const sigs = collectCitySignals();
  const mine = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => b.population - a.population);
  const foreign = sigs.filter((s) => s.owner !== local && !s.isCityState && !s.isTown).sort((a, b) => b.population - a.population);
  const L = mine[0], C2 = mine[1] || mine[0], C3 = mine[2] || mine[0], F = foreign[0];
  emit("START turn=" + safe(() => Game.turn) + " age=" + safe(() => GameInfo.Ages.lookup(Game.age).AgeType) + " me=" + safe(() => GameInfo.Civilizations.lookup(Players.get(local).civilizationType).CivilizationType) + " L=" + cityName(L.city) + " C2=" + cityName(C2.city) + " C3=" + cityName(C3.city) + " F=" + cityName(F.city) + " turnActive=" + safe(() => Players.get(local).isTurnActive));
  await placeType(L, "IMPROVEMENT_GAMA", null, "gama-london");
  await placeType(L, "IMPROVEMENT_HAWELT", "TERRAIN_FLAT", "hawelt-london");
  await placeType(L, "IMPROVEMENT_STEPWELL", null, "stepwell-london");
  await placeType(F, "IMPROVEMENT_ORTOO", "TERRAIN_FLAT", "ortoo-paris");
  await placeType(F, "IMPROVEMENT_GAMA", null, null);
  await placeType(C2, "IMPROVEMENT_CARAVANSERAI", null, "caravanserai");
  await placeType(C2, "IMPROVEMENT_HIDDEN_FORTRESS", null, "hidden-fortress");
  await placeType(C3, "IMPROVEMENT_THING", null, "thing");
  await placeType(C3, "IMPROVEMENT_MAWASKAWE_SKOTE", null, "mawaskawe-skote");
  await placeType(C3, "IMPROVEMENT_ENCAMPMENT", null, "encampment");
  emit("ACTIONS done; ending 2 turns");
  finished = true;
  setTimeout(endTurn, 2000);
}
function recheck(tag) { for (const p of placed) emit(tag + " " + p.type + " " + p.city + " plot " + p.plot + " now=" + J(plotInfo(p.loc)) + " yields=" + J(yieldsAt(p.loc))); }

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
  if (!finished) return;
  if (n === 2) { setTimeout(() => { recheck("TURN+1"); endTurn(); }, 4000); }
  if (n >= 3) { setTimeout(() => { recheck("TURN+2"); emit("DONE modtest10 finished"); }, 4000); }
});
emit("modtest10 attached");
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
