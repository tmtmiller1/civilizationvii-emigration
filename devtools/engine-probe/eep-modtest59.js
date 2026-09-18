// eep-modtest59.js - does the GAME prompt the player to place a population point the mod adds? AugustusExp66, human
// control, the mod's pass switched off (turnInterval 99999) and no mod pop-up involved: the raw engine write
// city.addRuralPopulation(+1) on one local city and one local town. Watches, at 2 s, 6 s, 12 s and after one
// ended turn (sendTurnComplete only, never Autoplay, which would place the point itself): the local player's
// notifications (type names, targets), NotificationAdded events, the end-turn blocker, Growth.isReadyToPlacePopulation,
// pendingPopulation, and the EXPAND plot list. Positive control: any local settlement one turn from natural growth
// shows what the engine's own NOTIFICATION_NEW_POPULATION looks like to this probe.
import { CONFIG } from "/emigration/ui/emigration-config.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function nm(c) { return safe(() => Locale.compose(c.name), "?"); }

let local = -1;
const added = [];
safe(() => engine.on("NotificationAdded", (d) => {
  const id = d && (d.id ?? d.ID ?? d);
  added.push({ t: Date.now(), type: typeName(id), raw: J(d).slice(0, 200) });
}));

function typeName(id) {
  const byId = safe(() => Game.Notifications.getTypeName(id), null);
  if (typeof byId === "string" && byId) return byId;
  const n = safe(() => Game.Notifications.find(id), null);
  return safe(() => Game.Notifications.getTypeName(n.Type), "?");
}
function notes() {
  return (safe(() => Game.Notifications.getIdsForPlayer(local), []) || []).map((id) => {
    const n = safe(() => Game.Notifications.find(id), null);
    return { key: J(id), type: typeName(id), target: safe(() => J(n.Target), null) };
  });
}
function blocker() {
  const b = safe(() => Game.Notifications.getEndTurnBlockingType(local), null);
  if (b == null || String(b) === String(EndTurnBlockingTypes.NONE)) return "none";
  const id = safe(() => Game.Notifications.findEndTurnBlocking(local, b), null);
  return String(b) + ":" + (id != null ? typeName(id) : "?");
}
function snap(c) {
  const city = safe(() => Cities.get(c.id), c);
  const exp = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.EXPAND, {}, false), null);
  return { name: nm(city), town: !!city.isTown, pop: city.population, rural: city.ruralPopulation, pending: safe(() => city.pendingPopulation),
    ready: safe(() => city.Growth.isReadyToPlacePopulation), expand: exp && Array.isArray(exp.Plots) ? exp.Plots.length : 0,
    turnsToGrow: safe(() => city.Growth.turnsUntilGrowth) };
}
function newPopNotes(list) { return list.filter((x) => /NEW_POPULATION/.test(String(x.type))); }

async function run() {
  local = GameContext.localPlayerID;
  CONFIG.turnInterval = 99999;
  const mine = (safe(() => Players.get(local).Cities.getCityIds(), []) || []).map((id) => Cities.get(id)).filter(Boolean);
  const city = mine.filter((c) => !c.isTown).sort((a, b) => b.population - a.population)[0];
  const town = mine.filter((c) => c.isTown).sort((a, b) => b.population - a.population)[0];
  const growingNext = mine.filter((c) => safe(() => c.Growth.turnsUntilGrowth, 99) === 1).map(nm);
  const base = notes();
  emit("START turn=" + safe(() => Game.turn) + " city=" + J(city && snap(city)) + " town=" + J(town && snap(town)) +
    " growingNextTurn=" + J(growingNext) + " blocker=" + blocker() + " notes=" + J(base.map((x) => x.type)));
  const baseKeys = new Set(base.map((x) => x.key));
  const targets = [city, town].filter(Boolean);
  for (const c of targets) {
    const before = snap(c);
    const ok = safe(() => { c.addRuralPopulation(1); return true; }, false);
    for (const ms of [2000, 4000, 6000]) {
      await later(ms);
      const now = notes().filter((x) => !baseKeys.has(x.key));
      emit("W " + before.name + " +" + (ms === 2000 ? 2 : ms === 4000 ? 6 : 12) + "s write=" + ok + " " + J(snap(c)) +
        " newNotes=" + J(now) + " blocker=" + blocker() + " addedEvents=" + J(added.map((a) => a.type)));
    }
  }
  const beforeTurn = { turn: safe(() => Game.turn), added: added.length };
  emit("ENDTURN sending (no Autoplay) blocker=" + blocker());
  safe(() => UI.Player.deselectAllUnits());
  safe(() => GameContext.sendTurnComplete());
  let advanced = false;
  const onTurn = (d) => { if ((d && (d.player ?? d.Player)) === local) advanced = true; };
  safe(() => engine.on("PlayerTurnActivated", onTurn));
  for (let i = 0; i < 18 && !advanced; i++) await later(5000);
  await later(6000);
  const after = notes();
  const popAfter = newPopNotes(after);
  const eventsAfter = added.slice(beforeTurn.added).map((a) => a.type);
  emit("AFTER turn=" + safe(() => Game.turn) + " advanced=" + advanced + " blocker=" + blocker() + " targets=" + J(targets.map(snap)) +
    " NEW_POPULATION notes=" + J(popAfter) + " all=" + J(after.map((x) => x.type)) + " eventsSinceEndTurn=" + J(eventsAfter));
  const writtenSeen = newPopNotes(notes().filter((x) => !baseKeys.has(x.key)));
  const readyAny = targets.some((c) => snap(c).ready === true);
  emit("VERDICT promptSeen=" + (writtenSeen.length > 0 || readyAny) + " newPopulationNotes=" + writtenSeen.length +
    " readyFlag=" + readyAny + " advanced=" + advanced + " naturalGrowthControl=" + J(growingNext));
  emit("DONE modtest59 finished");
}

emit("modtest59 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest59 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
