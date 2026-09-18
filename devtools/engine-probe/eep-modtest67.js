// eep-modtest67.js - is the game's "Grow City" prompt CREATED by mod-added points alone? The question mod tests 59 to
// 66 left open (on turn 67 Philadelphia's natural growth was present too). AugustusExp66, the mod's pass off. The run
// searches forward with one-turn Autoplay (closing AI proposals) until a turn starts on which no local settlement is
// ready to place a point, none will grow next turn, and no Grow City notification exists. On that clean turn: the
// raw engine write addRuralPopulation(+1) on London and Leeds, then a MANUAL end turn (sendTurnComplete, never
// Autoplay, which would place the points; blocking notifications other than Grow City are dismissed). On the next
// turn: whether NOTIFICATION_NEW_POPULATION exists and blocks, which settlements are ready, and whether any other
// settlement grew. Notification types are read the base game's way (getTypeName of getType).
import { CONFIG } from "/emigration/ui/emigration-config.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function nm(c) { return safe(() => Locale.compose(c.name), "?"); }

let local = -1;

function typeName(id) {
  const t = safe(() => Game.Notifications.getType(id), null);
  return safe(() => Game.Notifications.getTypeName(t), "?");
}
function notes() {
  return (safe(() => Game.Notifications.getIdsForPlayer(local), []) || []).map((id) => ({
    id, type: typeName(id), message: safe(() => Game.Notifications.getMessage(id), null),
    blocks: safe(() => Game.Notifications.getBlocksTurnAdvancement(id), null)
  }));
}
function growCity() { return notes().filter((n) => /NEW_POPULATION/.test(n.type)).map((n) => ({ message: n.message, blocks: n.blocks })); }
function blockerName() {
  const b = safe(() => Game.Notifications.getEndTurnBlockingType(local), null);
  if (b == null || String(b) === String(EndTurnBlockingTypes.NONE)) return "none";
  const id = safe(() => Game.Notifications.findEndTurnBlocking(local, b), null);
  return id != null ? typeName(id) : String(b);
}
function mine() { return (safe(() => Players.get(local).Cities.getCityIds(), []) || []).map((id) => Cities.get(id)).filter(Boolean); }
function readyCities() { return mine().filter((c) => safe(() => c.Growth.isReadyToPlacePopulation, false)).map(nm); }
function growingNext() { return mine().filter((c) => safe(() => c.Growth.turnsUntilGrowth, 99) <= 1).map(nm); }
function pops() { const o = {}; for (const c of mine()) o[nm(c)] = c.population; return o; }

async function closeScreens() {
  const visible = (el) => safe(() => el.getBoundingClientRect().width > 0, false);
  const caption = (b) => String(b.getAttribute("caption") || b.textContent || "").trim();
  for (let i = 0; i < 10; i++) {
    const buttons = Array.from(document.querySelectorAll("fxs-button, fxs-hero-button")).filter(visible);
    const pick = buttons.find((b) => /^ok$/i.test(caption(b))) || buttons.find((b) => /^reject$/i.test(caption(b))) ||
      Array.from(document.querySelectorAll("fxs-close-button")).filter(visible).pop();
    if (!pick) return;
    safe(() => pick.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    emit("CLOSED " + J(caption(pick) || pick.tagName));
    await later(2500);
  }
}

async function autoplayOneTurn() {
  const t0 = safe(() => Game.turn, 0);
  safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
  for (let i = 0; i < 30; i++) {
    await later(5000);
    if (safe(() => Game.turn, 0) > t0 && safe(() => Players.get(local).isTurnActive, false)) break;
  }
  await later(5000);
  await closeScreens();
  return safe(() => Game.turn, 0) > t0;
}

async function manualEndTurn() {
  const t0 = safe(() => Game.turn, 0);
  for (let attempt = 1; attempt <= 6; attempt++) {
    for (const n of notes()) if (n.blocks && !/NEW_POPULATION/.test(n.type)) safe(() => Game.Notifications.dismiss(n.id));
    safe(() => UI.Player.deselectAllUnits());
    safe(() => GameContext.sendTurnComplete());
    for (let i = 0; i < 8; i++) {
      await later(5000);
      if (safe(() => Game.turn, 0) > t0) return { advanced: true, attempt };
    }
    emit("ENDTURN attempt=" + attempt + " still turn " + safe(() => Game.turn) + " blocker=" + blockerName());
    await closeScreens();
  }
  return { advanced: false, attempt: 6 };
}

async function run() {
  local = GameContext.localPlayerID;
  CONFIG.turnInterval = 99999;
  const london = mine().find((c) => nm(c) === "London");
  const leeds = mine().find((c) => nm(c) === "Leeds");
  let clean = null;
  for (let step = 0; step < 16; step++) {
    await closeScreens();
    const r = readyCities(), g = growingNext(), p = growCity();
    emit("SEARCH turn=" + safe(() => Game.turn) + " ready=" + J(r) + " growingNext=" + J(g) + " growCity=" + p.length);
    if (!r.length && !g.length && !p.length) { clean = safe(() => Game.turn, 0); break; }
    if (!(await autoplayOneTurn())) { emit("SEARCH autoplay did not advance"); break; }
  }
  if (clean == null) {
    emit("VERDICT cleanTurnFound=false");
    emit("DONE modtest67 finished");
    return;
  }
  const before = pops();
  safe(() => london.addRuralPopulation(1));
  safe(() => leeds.addRuralPopulation(1));
  await later(4000);
  emit("WRITTEN turn=" + clean + " ready=" + J(readyCities()) + " growCity=" + J(growCity()) + " blocker=" + blockerName());
  const end = await manualEndTurn();
  await later(8000);
  await closeScreens();
  await later(3000);
  const after = pops();
  const grew = Object.keys(after).filter((k) => k !== "London" && k !== "Leeds" && typeof before[k] === "number" && after[k] > before[k]);
  const p = growCity();
  emit("NEXT turn=" + safe(() => Game.turn) + " advanced=" + end.advanced + " growCity=" + J(p) + " ready=" + J(readyCities()) +
    " grewNaturally=" + J(grew) + " blocker=" + blockerName() + " londonLeeds=" + J({ london: after.London, leeds: after.Leeds }));
  emit("VERDICT cleanTurnFound=true cleanTurn=" + clean + " advanced=" + end.advanced + " growCityCreated=" + (p.length > 0) +
    " blocks=" + p.some((n) => n.blocks) + " ready=" + J(readyCities()) + " grewNaturally=" + J(grew));
  emit("DONE modtest67 finished");
}

emit("modtest67 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest67 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
