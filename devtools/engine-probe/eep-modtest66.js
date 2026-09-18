// eep-modtest66.js - mod test 65, then isolation: dismiss Grow City and advance to turn 68 with only mod-written
// points waiting, to see whether the game raises it again for them alone. Mod test 65 header: mod test 64 plus the attribution step: after turn 67, place Philadelphia's natural point and
// check whether the blocking Grow City notification stays while only the mod-written points are ready.
// Mod test 64 header: mod test 60 with notification types read the base game's way (getType, then getTypeName),
// plus each notification's message and target city, to attribute the turn-67 "Grow City" prompt. Mod test 60 header:
// the placement prompt, across a REAL turn. Mod test 59 showed the raw write
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
  // The base game's way: the type first, then its name (mod tests 59 to 63 passed the id to getTypeName and read
  // every notification as ASSIGN_NEW_RESOURCES).
  const t = safe(() => Game.Notifications.getType(id), null);
  return safe(() => Game.Notifications.getTypeName(t), "?");
}
function targetName(n) {
  const c = safe(() => Cities.get(n.Target), null);
  return c ? nm(c) : safe(() => J(n.Target), null);
}
function noteList() {
  return (safe(() => Game.Notifications.getIdsForPlayer(local), []) || []).map((id) => {
    const n = safe(() => Game.Notifications.find(id), null);
    return { id, type: typeName(id), message: safe(() => Game.Notifications.getMessage(id), null), target: n ? targetName(n) : null,
      blocks: safe(() => Game.Notifications.getBlocksTurnAdvancement(id), null) };
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

async function run() {
  local = GameContext.localPlayerID;
  CONFIG.turnInterval = 99999;
  const mine = cityIds().map((id) => Cities.get(id)).filter(Boolean);
  const city = mine.filter((c) => !c.isTown).sort((a, b) => b.population - a.population)[0];
  const town = mine.filter((c) => c.isTown).sort((a, b) => b.population - a.population)[0];
  const control = mine.filter((c) => safe(() => c.Growth.turnsUntilGrowth, 99) === 1);
  const startTurn = safe(() => Game.turn, 0);
  emit("START turn=" + startTurn + " control(one turn from growth)=" + J(control.map(snap)) + " blocker=" + J(blockerInfo()) + " notes=" + J(noteList().map((n) => ({ type: n.type, message: n.message, target: n.target }))));
  const targets = [city, town].filter(Boolean);
  for (const c of targets) safe(() => c.addRuralPopulation(1));
  await later(3000);
  emit("WRITTEN " + J(targets.map(snap)) + " popNotes=" + J(noteList().filter((n) => /NEW_POPULATION/.test(n.type)).map((n) => ({ type: n.type, message: n.message, target: n.target }))));
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
  const byTarget = (c) => pop.filter((n) => n.target === nm(c)).length;
  emit("AFTER turn=" + safe(() => Game.turn) + " advanced=" + advanced + " NEW_POPULATION=" + J(pop) +
    " targets=" + J(targets.map((c) => ({ ...snap(c), notes: byTarget(c) }))) + " control=" + J(control.map((c) => ({ ...snap(c), notes: byTarget(c) }))) +
    " allNotes=" + J(notes.map((n) => ({ type: n.type, message: n.message, target: n.target, blocks: n.blocks }))));
  // Attribution: place Philadelphia's natural point, leaving only the mod-written London and Leeds ready. If the
  // blocking "Grow City" notification persists, the game prompts for points the mod adds.
  const popNow = () => noteList().filter((n) => /NEW_POPULATION/.test(n.type)).map((n) => ({ message: n.message, blocks: n.blocks }));
  for (const c of control) {
    const exp = safe(() => Game.CityCommands.canStart(c.id, CityCommandTypes.EXPAND, {}, false), null);
    const plot = exp && Array.isArray(exp.Plots) && exp.Plots.length ? exp.Plots[0] : null;
    if (plot != null) {
      const l = GameplayMap.getLocationFromIndex(plot);
      safe(() => Game.CityCommands.sendRequest(c.id, CityCommandTypes.EXPAND, { X: l.x, Y: l.y }));
    }
    emit("PLACED natural point in " + nm(c) + " plot=" + plot);
  }
  await later(6000);
  const onlyWritten = popNow();
  emit("ATTRIBUTION control=" + J(control.map(snap)) + " written=" + J(targets.map(snap)) + " NEW_POPULATION=" + J(onlyWritten) + " blocker=" + J(blockerInfo()));
  // Isolation: dismiss the Grow City notification, then advance to turn 68 with only the mod-written points waiting
  // and no settlement one turn from natural growth. If Grow City comes back, the game raises it for mod points alone.
  const local2 = GameContext.localPlayerID;
  const allMine = () => (safe(() => Players.get(local2).Cities.getCityIds(), []) || []).map((id) => Cities.get(id)).filter(Boolean);
  for (const n of noteList()) if (/NEW_POPULATION/.test(n.type)) {
    emit("DISMISS canUserDismiss=" + J(safe(() => Game.Notifications.canUserDismissNotification(n.id))));
    safe(() => Game.Notifications.dismiss(n.id));
  }
  await later(3000);
  const growingNext = allMine().filter((c) => safe(() => c.Growth.turnsUntilGrowth, 99) <= 1).map(nm);
  emit("DISMISSED NEW_POPULATION=" + J(popNow()) + " blocker=" + J(blockerInfo()) + " growingNextTurn=" + J(growingNext));
  const turnBefore = safe(() => Game.turn, 0);
  let moved = false;
  for (let attempt = 1; attempt <= 4 && !moved; attempt++) {
    for (const n of noteList()) if (/NEW_POPULATION/.test(n.type)) safe(() => Game.Notifications.dismiss(n.id));
    safe(() => UI.Player.deselectAllUnits());
    safe(() => GameContext.sendTurnComplete());
    for (let i = 0; i < 8; i++) { await later(5000); if (safe(() => Game.turn, 0) > turnBefore) { moved = true; break; } }
    emit("ENDTURN to 68 attempt=" + attempt + " advanced=" + moved + " blocker=" + J(blockerInfo()));
  }
  await later(8000);
  const readyNow = allMine().filter((c) => safe(() => c.Growth.isReadyToPlacePopulation, false)).map(nm);
  const back = popNow();
  emit("TURN68 turn=" + safe(() => Game.turn) + " advanced=" + moved + " NEW_POPULATION=" + J(back) + " blocker=" + J(blockerInfo()) +
    " readyCities=" + J(readyNow) + " written=" + J(targets.map(snap)));
  emit("VERDICT advanced=" + moved + " growCityReturned=" + (back.length > 0) + " readyCities=" + J(readyNow) +
    " onlyWrittenReady=" + (readyNow.length > 0 && readyNow.every((x) => x === "London" || x === "Leeds")) + " grewNaturally=" + J(growingNext));
  emit("DONE modtest66 finished");
}

emit("modtest66 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest66 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
