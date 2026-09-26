// eep-modtest19.js - the banner pressure bar. Human-controlled Exploration save (AugustusExp66), no turn
// ending. Logs [EmigTest]; "SHOT" lines ask the runner for screenshots.
//   B1 count the decorated banners (one .emig-bpbar per city banner) before any pressure is set.
//   B2 raise the local player's two largest cities to 0.9 and 0.72 of the move bar and the third to 0.3
//      (below the 0.66 cue fraction, so it must stay hidden); persist; refresh; log each bar's width,
//      color, and hidden state with its city.
//   B3 camera on the largest city: SHOT banner-bar-near (zoom 0) and SHOT banner-bar-mid (zoom 0.5).
//   then DONE.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { loadState, saveState } from "/emigration/ui/emigration-state.js";
import { speedBar } from "/emigration/ui/emigration-game-speed.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { refreshBannerPressure } from "/emigration/ui/emigration-banner-pressure.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cityName(c) { return safe(() => Locale.compose(c.name), "?"); }
function look(loc, zoom) { safe(() => Camera.lookAtPlot(loc, { zoom, instantaneous: true })); }

function barReport() {
  return safe(() => Array.from(document.querySelectorAll(".emig-bpbar")).map((b) => {
    const banner = b.closest(".city-banner");
    const fill = b.querySelector(".emig-bpbar__fill");
    return {
      city: banner ? banner.getAttribute("city-id") : "?",
      hidden: b.classList.contains("hidden"),
      width: fill ? fill.style.width : "?",
      color: fill ? fill.style.backgroundColor : "?"
    };
  }), []);
}

async function run() {
  const local = GameContext.localPlayerID;
  emit("START turn=" + safe(() => Game.turn) + " local=" + local + " option=" + CONFIG.bannerPressureBar +
    " cueFraction=" + CONFIG.voluntaryCueFraction + " bar=" + speedBar(CONFIG.emigrationBar));
  const before = barReport();
  emit("B1 decorated banners=" + before.length + " visible=" + before.filter((b) => !b.hidden).length);
  const mine = collectCitySignals().filter((s) => s.owner === local).sort((a, b) => b.population - a.population);
  const targets = [[0.9, mine[0]], [0.72, mine[1]], [0.3, mine[2]]].filter((t) => t[1]);
  const st = loadState();
  st.sources = st.sources || {};
  const bar = speedBar(CONFIG.emigrationBar);
  for (const [frac, sig] of targets) {
    const e = st.sources[sig.key] || (st.sources[sig.key] = { pressure: 0, cooldown: 0, crisisPressure: 0, crisisCooldown: 0 });
    e.pressure = frac * bar;
    e.cooldown = 0;
    emit("B2 set " + cityName(sig.city) + " key=" + sig.key + " pressure=" + e.pressure.toFixed(1) + " (" + frac + " of bar)");
  }
  saveState(st);
  const visible = refreshBannerPressure("probe");
  await later(1500);
  const after = barReport();
  emit("B2 refresh visible=" + visible + " bars=" + J(after.filter((b) => !b.hidden)) + " hiddenCount=" + after.filter((b) => b.hidden).length);
  if (mine[0]) {
    const loc = mine[0].city.location;
    look(loc, 0);
    await later(4000);
    emit("B3 camera on " + cityName(mine[0].city) + " " + J(loc));
    emit("SHOT banner-bar-near");
    await later(10000);
    look(loc, 0.5);
    await later(4000);
    emit("SHOT banner-bar-mid");
    await later(10000);
  }
  emit("DONE modtest19 finished");
}

emit("modtest19 attached");
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
