// eep-modtest159.js - shot 06 retaken with the newcomer pop-up's figures on its buttons, and the automatic button's
// tile prediction WATCHED: does "Let the city settle them" take the tile it names, and does the city gain those yields?
// Save: the Steam set's game (turn-106 promo save, run-promo144.sh). Washington, D.C. is given one real pending point
// (city.addRuralPopulation(+1): a real pending placement, watched 2026-09-11) so the game offers EXPAND plots.
//
//   SHOT newcomer   the pop-up, 1 point of Bulgarian refugees
//   then            press "Let the city settle them" (wired to the shipped autoPlace), read which plot was expanded
//                   and the city's net yields before / 5 s after, against what the button said
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { arrivalPromptView, autoPlace } from "/emigration/ui/emigration-arrival-placement.js";
import { displacedQuoteFor } from "/emigration/ui/emigration-displaced-quotes.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";
import { civType } from "/emigration/ui/emigration-naming.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";

const TAG = "[EmigTest]";
const YIELDS = ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS", "YIELD_DIPLOMACY"];
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function net(c) { const o = {}; for (const y of YIELDS) o[y.replace("YIELD_", "")] = safe(() => Math.round(c.Yields.getNetYield(YieldTypes[y]) * 100) / 100, null); return o; }
function state(c) { return { pop: c.population, rural: c.ruralPopulation, pending: safe(() => c.pendingPopulation, null), net: net(c) }; }
function dialog() { const all = Array.from(document.querySelectorAll("screen-dialog-box")); return all[all.length - 1] || null; }
async function clearDialogs(label) {
  for (let i = 0; i < 5 && dialog(); i++) {
    const d = dialog();
    emit(label + " clearing dialog " + J(safe(() => d.getAttribute("title"))));
    const btns = Array.from(d.querySelectorAll("fxs-button"));
    if (btns.length) safe(() => btns[btns.length - 1].dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    await later(2500);
  }
}
async function dismissScreens() {
  for (let i = 0; i < 4; i++) {
    const open = safe(() => Array.from(document.querySelectorAll("*")).filter((e) => /^SCREEN-/.test(e.tagName)
      && e.tagName !== "SCREEN-DIALOG-BOX" && e.querySelector("fxs-button, fxs-hero-button")), []);
    if (!open.length) return;
    for (const e of open) {
      const btns = Array.from(e.querySelectorAll("fxs-button, fxs-hero-button"));
      safe(() => btns[btns.length - 1].dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    }
    await later(2500);
  }
}
function plotYields(plot, owner) {
  return safe(() => {
    const out = {};
    for (const p of GameplayMap.getYields(plot, owner) || []) { const d = GameInfo.Yields.lookup(p[0]); out[d ? d.YieldType : p[0]] = p[1]; }
    return out;
  }, null);
}

async function run() {
  const local = GameContext.localPlayerID;
  CONFIG.turnInterval = 99999;
  await later(6000);
  await dismissScreens();
  const sigs = collectCitySignals();
  const host = sigs.filter((s) => s.owner === local && !s.isTown).sort((a, b) => (b.population || 0) - (a.population || 0))[0];
  const origin = sigs.find((s) => s.owner !== local && !s.isCityState && safe(() => Players.get(s.owner).isMajor, false)).owner;
  const city = host.city;
  emit("SCENE " + cityName(city) + " origin=" + origin + " " + civType(origin) + " before=" + J(state(city)));
  safe(() => Camera.lookAtPlot(city.location, { zoom: 0.45 }));
  await later(15000);
  await dismissScreens();
  await clearDialogs("setup");

  emit("CALL addRuralPopulation(+1)");
  safe(() => city.addRuralPopulation(1));
  await later(3000);
  const offered = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.EXPAND, {}, false).Plots, []);
  emit("PENDING after=" + J(state(city)) + " offered=" + J(offered) + " offeredYields=" + J((offered || []).slice(0, 8).map((p) => [p, plotYields(p, local)])));

  const view = arrivalPromptView(city, 1, displacedQuoteFor(origin, "refugee", "arrival|probe159"), { civ: origin, kind: "refugee", cause: "war" });
  emit("VIEW buttons=" + J(view.choices.map((c) => c.label)));
  const before = state(city);
  showDilemma(view, (id) => { emit("CHOSEN " + id); if (id === "auto") emit("autoPlace placed=" + autoPlace(city, 1)); });
  let d = null;
  for (let i = 0; i < 50 && !d; i++) { await later(200); d = Array.from(document.querySelectorAll("screen-dialog-box")).find((x) => (x.textContent || "").includes("Let the city")) || null; }
  if (!d) { emit("no dialog"); emit("DONE modtest159 finished"); return; }
  await later(2500);
  const frame = d.querySelector(".screen-dialog-box__dialog-wrapper") || d;
  const r = frame.getBoundingClientRect();
  emit("newcomer rect=" + J([Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]) + " viewport=" + window.innerWidth + "x" + window.innerHeight
    + " captions=" + J(Array.from(d.querySelectorAll("fxs-button")).map((b) => b.getAttribute("caption"))));
  emit("SHOT newcomer");
  await later(9000);

  const btn = Array.from(d.querySelectorAll("fxs-button")).find((b) => String(b.getAttribute("caption") || "").startsWith("Let the city"));
  emit("PRESS " + J(btn && btn.getAttribute("caption")));
  if (btn) btn.dispatchEvent(new CustomEvent("action-activate", { bubbles: true }));
  await later(6000);
  const after = state(city);
  const dNet = {};
  for (const k of Object.keys(after.net)) if (typeof after.net[k] === "number" && typeof before.net[k] === "number") dNet[k] = Math.round((after.net[k] - before.net[k]) * 100) / 100;
  const nowOffered = safe(() => Game.CityCommands.canStart(city.id, CityCommandTypes.EXPAND, {}, false).Plots, []);
  emit("RESULT before=" + J(before) + " after=" + J(after) + " netDelta=" + J(dNet) + " offeredNow=" + J(nowOffered));
  await clearDialogs("end");
  emit("DONE modtest159 finished");
}

emit("modtest159 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest159 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest159 finished"); }
}
setTimeout(beginPoll, 3000);
