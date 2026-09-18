// eep-modtest27.js - "Choose where they settle" did not open placement in the user's game (turns 46-49,
// arrivals in Bristol and Gao). Save AugustusAnt49 (the user's own), human control, no turn ending.
//   C0 every local settlement: town?, pop, pendingPopulation, Growth.isReadyToPlacePopulation, EXPAND plots.
//   C1 for a TOWN (Gao or Bristol first) and then a CITY (London): the shipped arriveRural in ask mode raises
//      the real pop-up; the "Choose where they settle" button is clicked through the DOM; the interface mode,
//      pending and ready flags are read at 0, 100, 300, 1000, 2500 ms.
//   C2 if the mode did not stay, a direct InterfaceMode.switchTo outside any dialog, same readings.
//   SHOT while the mode is open (if it ever is), then back to default. DONE.

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

function state(c) {
  const can = safe(() => Game.CityCommands.canStart(c.id, CityCommandTypes.EXPAND, {}, false), null);
  return {
    mode: IM ? safe(() => IM.getCurrent(), "?") : "?", pop: c.population, pending: safe(() => c.pendingPopulation, "?"),
    ready: safe(() => c.Growth.isReadyToPlacePopulation, "?"), expand: can && can.Plots ? can.Plots.length : 0
  };
}
async function watch(tag, c) {
  const out = [];
  let t = 0;
  for (const at of [0, 100, 300, 1000, 2500]) { await later(at - t); t = at; out.push(at + ":" + J(state(c))); }
  emit(tag + " " + out.join(" | "));
  return safe(() => IM.getCurrent(), "") === "INTERFACEMODE_ACQUIRE_TILE";
}
function findChooseButton() {
  const dialogs = Array.from(document.querySelectorAll("screen-dialog-box"));
  for (const d of dialogs) {
    const btn = Array.from(d.querySelectorAll("fxs-button, fxs-hero-button, button, [caption]"))
      .find((b) => /where they settle/i.test((b.getAttribute && b.getAttribute("caption")) || b.textContent || ""));
    if (btn) return { btn, dialogs: dialogs.length };
  }
  return { btn: null, dialogs: dialogs.length };
}

async function trial(label, sig) {
  const c = sig.city;
  emit(label + " " + cityName(c) + " town=" + !!sig.isTown + " before=" + J(state(c)));
  const ok = arriveRural(c); // ask mode: +1 and the real pop-up on a deferred flush
  let found = { btn: null, dialogs: 0 };
  for (let i = 0; i < 20 && !found.btn; i++) { await later(250); found = findChooseButton(); }
  emit(label + " arriveRural=" + ok + " dialogs=" + found.dialogs + " chooseButton=" + !!found.btn + " afterArrival=" + J(state(c)));
  if (!found.btn) return;
  safe(() => { found.btn.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })); });
  const stayed = await watch(label + " afterClick", c);
  emit(label + " dialogsAfterClick=" + findChooseButton().dialogs + " modeStayed=" + stayed);
  if (stayed) { emit("SHOT choose-open-" + label); await later(9000); }
  safe(() => IM.switchToDefault());
  await later(1500);
  if (!stayed) {
    safe(() => IM.switchTo("INTERFACEMODE_ACQUIRE_TILE", { CityID: c.id }));
    const direct = await watch(label + " directSwitch", c);
    if (direct) { emit("SHOT direct-open-" + label); await later(9000); }
    safe(() => IM.switchToDefault());
    await later(1500);
  }
}

async function run() {
  CONFIG.arrivalPlacement = 2;
  const mod = await import("/core/ui/interface-modes/interface-modes.js");
  IM = mod.InterfaceMode || mod.default;
  const local = GameContext.localPlayerID;
  const mine = collectCitySignals().filter((s) => s.owner === local);
  emit("START turn=" + safe(() => Game.turn) + " mode=" + safe(() => IM.getCurrent()) + " local settlements=" + mine.length);
  for (const s of mine) emit("C0 " + cityName(s.city) + " town=" + !!s.isTown + " " + J(state(s.city)));
  const town = mine.find((s) => s.isTown && /Gao|Bristol/.test(cityName(s.city))) || mine.find((s) => s.isTown);
  const city = mine.find((s) => !s.isTown && /London/.test(cityName(s.city))) || mine.find((s) => !s.isTown);
  if (town) await trial("TOWN", town);
  if (city) await trial("CITY", city);
  emit("DONE modtest27 finished");
}

emit("modtest27 attached");
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
