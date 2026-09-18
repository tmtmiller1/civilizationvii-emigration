// eep-modtest61.js - mod test 60 plus SCREENSHOTS (runner SHOT lines, captured by game window id): London and
// Philadelphia's banners and the notification train before the write and after the real turn. Otherwise identical.
// Original header (mod test 60): the placement prompt, across a REAL turn. Mod test 59 showed the raw write
// city.addRuralPopulation(+1) makes a real pending placement (isReadyToPlacePopulation true, EXPAND plots offered)
// with no NOTIFICATION_NEW_POPULATION within 12 s, but its end turn never advanced: the "assign new resources"
// blocker held it on turn 66. This run clears that blocker the ways the base game does (assign every unassigned
// resource to a city that accepts it, send CONSIDER_ASSIGN_RESOURCE as the resource screen does on close, dismiss
// the notification), then ends the turn WITHOUT Autoplay and requires Game.turn to actually increase. After the new
// turn: NEW_POPULATION notifications (with targets), ready flags and pending on the written London and Leeds, and
// the same for the settlement that was one turn from natural growth (the positive control).
import { CONFIG } from "/emigration/ui/emigration-config.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function nm(c) { return safe(() => Locale.compose(c.name), "?"); }

let local = -1;
const added = [];
safe(() => engine.on("NotificationAdded", (d) => { added.push({ turn: safe(() => Game.turn), type: typeName(d && (d.id ?? d.ID ?? d)) }); }));

function typeName(id) {
  const byId = safe(() => Game.Notifications.getTypeName(id), null);
  if (typeof byId === "string" && byId) return byId;
  const n = safe(() => Game.Notifications.find(id), null);
  return safe(() => Game.Notifications.getTypeName(n.Type), "?");
}
function noteList() {
  return (safe(() => Game.Notifications.getIdsForPlayer(local), []) || []).map((id) => {
    const n = safe(() => Game.Notifications.find(id), null);
    return { id, type: typeName(id), target: safe(() => J(n.Target), null) };
  });
}
function blockerInfo() {
  const b = safe(() => Game.Notifications.getEndTurnBlockingType(local), null);
  if (b == null || String(b) === String(EndTurnBlockingTypes.NONE)) return { name: "none" };
  const id = safe(() => Game.Notifications.findEndTurnBlocking(local, b), null);
  return { b: String(b), id, name: id != null ? typeName(id) : "?" };
}
function cityIds() { return safe(() => Players.get(local).Cities.getCityIds(), []) || []; }
function snap(c) {
  const city = safe(() => Cities.get(c.id), c);
  const exp = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.EXPAND, {}, false), null);
  return { name: nm(city), pop: city.population, rural: city.ruralPopulation, pending: safe(() => city.pendingPopulation),
    ready: safe(() => city.Growth.isReadyToPlacePopulation), expand: exp && Array.isArray(exp.Plots) ? exp.Plots.length : 0,
    turnsToGrow: safe(() => city.Growth.turnsUntilGrowth) };
}
function unassigned() {
  const all = (safe(() => Players.get(local).Resources.getResources(), []) || []).map((r) => r.value);
  const assigned = new Set();
  for (const id of cityIds()) for (const r of safe(() => Cities.get(id).Resources.getAssignedResources(), []) || []) assigned.add(r.value);
  return all.filter((v) => !assigned.has(v));
}
function clearResourceBlocker() {
  const log = { unassigned: unassigned().length, assigned: 0, refused: 0, consider: null, dismissed: 0 };
  for (const v of unassigned()) {
    const loc = GameplayMap.getLocationFromIndex(v);
    let done = false;
    for (const id of cityIds()) {
      const args = { Location: loc, City: id.id };
      const r = safe(() => Game.PlayerOperations.canStart(local, PlayerOperationTypes.ASSIGN_RESOURCE, args, false), null);
      if (r && r.Success) { safe(() => Game.PlayerOperations.sendRequest(local, PlayerOperationTypes.ASSIGN_RESOURCE, args)); done = true; break; }
    }
    if (done) log.assigned++; else log.refused++;
  }
  const c = safe(() => Game.PlayerOperations.canStart(local, PlayerOperationTypes.CONSIDER_ASSIGN_RESOURCE, {}, false), null);
  log.consider = c && c.Success;
  if (c && c.Success) safe(() => Game.PlayerOperations.sendRequest(local, PlayerOperationTypes.CONSIDER_ASSIGN_RESOURCE, {}));
  for (const n of noteList()) if (/ASSIGN_NEW_RESOURCES/.test(n.type)) { safe(() => Game.Notifications.dismiss(n.id)); log.dismissed++; }
  return log;
}

async function shot(label, a, b) {
  for (const [tag, c] of [[label, a], [label + "-control", b]]) {
    if (!c) continue;
    safe(() => Camera.lookAtPlot(c.location, { zoom: 0.5 }));
    await later(5000);
    emit("SHOT " + tag.replace(/[^A-Za-z0-9_-]/g, ""));
    await later(9000);
  }
}

async function run() {
  local = GameContext.localPlayerID;
  CONFIG.turnInterval = 99999;
  const mine = cityIds().map((id) => Cities.get(id)).filter(Boolean);
  const city = mine.filter((c) => !c.isTown).sort((a, b) => b.population - a.population)[0];
  const town = mine.filter((c) => c.isTown).sort((a, b) => b.population - a.population)[0];
  const control = mine.filter((c) => safe(() => c.Growth.turnsUntilGrowth, 99) === 1);
  const startTurn = safe(() => Game.turn, 0);
  emit("START turn=" + startTurn + " control(one turn from growth)=" + J(control.map(snap)) + " blocker=" + J(blockerInfo()));
  const targets = [city, town].filter(Boolean);
  for (const c of targets) safe(() => c.addRuralPopulation(1));
  await later(3000);
  await shot("before", city, control[0]);
  emit("WRITTEN " + J(targets.map(snap)) + " newPopNotes=" + J(noteList().filter((n) => /NEW_POPULATION/.test(n.type))));
  let advanced = false;
  for (let attempt = 1; attempt <= 6 && !advanced; attempt++) {
    const cleared = clearResourceBlocker();
    await later(3000);
    const bl = blockerInfo();
    emit("CLEAR attempt=" + attempt + " " + J(cleared) + " blockerNow=" + J({ b: bl.b, name: bl.name }));
    safe(() => UI.Player.deselectAllUnits());
    safe(() => GameContext.sendTurnComplete());
    for (let i = 0; i < 12; i++) { await later(5000); if (safe(() => Game.turn, 0) > startTurn) { advanced = true; break; } }
    emit("ENDTURN attempt=" + attempt + " turn=" + safe(() => Game.turn) + " advanced=" + advanced);
  }
  await later(8000);
  const notes = noteList();
  const pop = notes.filter((n) => /NEW_POPULATION/.test(n.type));
  const byTarget = (c) => pop.filter((n) => n.target && n.target.includes('"id":' + c.id.id + ",")).length;
  emit("AFTER turn=" + safe(() => Game.turn) + " advanced=" + advanced + " NEW_POPULATION=" + J(pop) +
    " targets=" + J(targets.map((c) => ({ ...snap(c), notes: byTarget(c) }))) + " control=" + J(control.map((c) => ({ ...snap(c), notes: byTarget(c) }))) +
    " addedSinceStart=" + J(added.map((a) => a.turn + ":" + a.type)));
  await shot("after-london", city, null);
  await shot("after-philadelphia", control[0] || city, null);
  emit("VERDICT advanced=" + advanced + " newPopulationNotes=" + pop.length +
    " writtenStillReady=" + J(targets.map((c) => snap(c).ready)) + " controlGrew=" + J(control.map((c) => snap(c).ready)));
  emit("DONE modtest61 finished");
}

emit("modtest61 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest61 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
