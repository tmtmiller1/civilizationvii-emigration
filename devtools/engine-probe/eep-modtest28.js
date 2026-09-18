// eep-modtest28.js - why "Choose where they settle" fails in TOWNS (modtest27: the town's mode read
// ACQUIRE_TILE at 2.5 s but the screenshot a few seconds later showed the plain map; the city's view stayed).
// Save AugustusAnt49, human control, no turn ending. For each local town, then London:
//   V1 no click: arriveRural (ask mode) and watch pending / ready / districts / improvements for 12 s, with a
//      DistrictAddedToMap listener for that settlement. Does the game settle the point on its own?
//   V2 real dialog click: a second arrival, click "Choose where they settle", watch the mode 12 s.
//   V3 canonical path (as the base notification handler does): UI.Player.lookAtID then switchTo, watch 12 s.
//   Dismiss any leftover dialog between variants. DONE.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { arriveRural } from "/emigration/ui/emigration-arrival-placement.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
let IM = null;
const districtEvents = [];
engine.on("DistrictAddedToMap", (d) => { districtEvents.push({ t: Date.now(), city: safe(() => d.cityID.id, "?"), loc: safe(() => d.location.x + "," + d.location.y, "?") }); });

function ruralCount(c) {
  let n = 0;
  for (const plot of safe(() => c.getPurchasedPlots(), []) || []) {
    const loc = GameplayMap.getLocationFromIndex(plot);
    if ((safe(() => MapConstructibles.getConstructibles(loc.x, loc.y), []) || []).length) n++;
  }
  return n;
}
function snap(c) {
  return { mode: safe(() => IM.getCurrent(), "?").replace("INTERFACEMODE_", ""), pop: c.population, pend: safe(() => c.pendingPopulation, "?"),
    ready: safe(() => c.Growth.isReadyToPlacePopulation, "?"), growthType: safe(() => c.Growth.growthType, "?"), cons: ruralCount(c) };
}
async function watch(tag, c, ms) {
  const t0 = Date.now(); const mark = districtEvents.length; const out = [];
  for (const at of [0, 250, 1000, 2500, 4000, 6000, 9000, ms]) { await later(Math.max(0, t0 + at - Date.now())); out.push(at + ":" + J(snap(c))); }
  const evs = districtEvents.slice(mark).map((e) => (e.t - t0) + "ms city" + e.city + "@" + e.loc);
  emit(tag + " " + out.join(" | ") + " districtAdded=" + J(evs));
}
function chooseButton() {
  for (const d of Array.from(document.querySelectorAll("screen-dialog-box"))) {
    const b = Array.from(d.querySelectorAll("fxs-button, fxs-hero-button, button, [caption]"))
      .find((x) => /where they settle/i.test((x.getAttribute && x.getAttribute("caption")) || x.textContent || ""));
    if (b) return b;
  }
  return null;
}
function laterButton() {
  for (const d of Array.from(document.querySelectorAll("screen-dialog-box"))) {
    const b = Array.from(d.querySelectorAll("fxs-button, fxs-hero-button, button, [caption]"))
      .find((x) => /^later$/i.test(((x.getAttribute && x.getAttribute("caption")) || x.textContent || "").trim()));
    if (b) return b;
  }
  return null;
}
async function waitDialog() { for (let i = 0; i < 20; i++) { if (chooseButton()) return true; await later(250); } return false; }

async function trial(sig) {
  const c = sig.city; const name = cityName(c) + (sig.isTown ? "(town)" : "(city)");
  emit("T " + name + " start " + J(snap(c)));
  // V1
  arriveRural(c);
  const d1 = await waitDialog();
  await watch("V1 " + name + " noClick dialog=" + d1, c, 12000);
  const lb = laterButton(); if (lb) { safe(() => lb.dispatchEvent(new CustomEvent("action-activate", { bubbles: true }))); await later(800); }
  // V2
  arriveRural(c);
  const d2 = await waitDialog();
  const cb = chooseButton();
  if (cb) safe(() => cb.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
  await watch("V2 " + name + " click dialog=" + d2 + " clicked=" + !!cb, c, 12000);
  safe(() => IM.switchToDefault()); await later(1200);
  // V3
  safe(() => UI.Player.lookAtID(c.id, 0));
  const ok = safe(() => IM.switchTo("INTERFACEMODE_ACQUIRE_TILE", { CityID: c.id }), "ERR");
  await watch("V3 " + name + " lookAt+switchTo=" + ok, c, 12000);
  safe(() => IM.switchToDefault()); await later(1200);
  const lb2 = laterButton(); if (lb2) safe(() => lb2.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
  await later(600);
}

async function run() {
  CONFIG.arrivalPlacement = 2;
  const mod = await import("/core/ui/interface-modes/interface-modes.js");
  IM = mod.InterfaceMode || mod.default;
  const local = GameContext.localPlayerID;
  const mine = collectCitySignals().filter((s) => s.owner === local);
  emit("START turn=" + safe(() => Game.turn) + " GrowthTypes=" + J(safe(() => GrowthTypes, "?")) + " settlements=" + J(mine.map((s) => cityName(s.city) + (s.isTown ? "(town)" : "(city)"))));
  for (const s of mine.filter((x) => x.isTown)) await trial(s);
  const london = mine.find((s) => !s.isTown);
  if (london) await trial(london);
  emit("DONE modtest28 finished");
}

emit("modtest28 attached");
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
