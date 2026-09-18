// eep-modtest145.js - Ethnic Composition lens close-up WITH its hover readout, for the Steam page.
// Same scene as the chosen shot 10 (mod test 144: Rostov on Don and its Bulgar enclave, turn 106 of the mod test 142
// game), zoomed in further, with the lens's cursor panel showing the hovered tile's origin mix.
//
//   SHOT tooltip-enclave   camera on the enclave tile, panel reading that tile
//   SHOT tooltip-city      camera on the city centre (a Norman/Bulgarian blend), panel reading that tile
//
// Why the panel is pinned by hand: the panel follows the last window mousemove, and mod test 143 showed a synthetic
// mousemove's coordinates do not reach it (the panel drew at 0,0, the top-left corner). The probe sets the hovered
// plot through PlotCursor (which the panel does read), frames that plot at the centre of the screen, and places the
// panel where its own place() would put it for a cursor on that tile: 36 px right of and below the centre.
import LensManager from "/core/ui/lenses/lens-manager.js";
import PlotCursor from "/core/ui/input/plot-cursor.js";
import { allQuarterEntries } from "/emigration/ui/emigration-quarter-state.js";

const TAG = "[EmigTest]";
const ETHN = "emig-ethnicity-lens";
const CITY = "Rostov on Don";
const ZOOM = 0.3; // mod test 144 used 0.45
const CURSOR_OFFSET = 36; // emigration-lens-hover-panel.js
const HOLD = 15000; // the runner polls every 4 s; hold each framing well past a capture
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1;

async function dismissPopups() {
  for (let i = 0; i < 6; i++) {
    const open = safe(() => Array.from(document.querySelectorAll("*")).filter((e) => /^SCREEN-/.test(e.tagName)
      && e.querySelector("fxs-button, fxs-hero-button")), []);
    if (!open.length) return;
    for (const e of open) {
      emit("POPUP dismissing " + e.tagName.toLowerCase());
      const btns = Array.from(e.querySelectorAll("fxs-button, fxs-hero-button"));
      safe(() => btns[btns.length - 1].dispatchEvent(new CustomEvent("action-activate", { bubbles: true })));
    }
    await later(2500);
  }
}

function allCities() { return safe(() => Players.getAlive().flatMap((p) => safe(() => p.Cities.getCities() || [], [])), []); }
function findScene() {
  const city = allCities().find((c) => safe(() => Locale.compose(c.name)) === CITY) || null;
  let enclave = null;
  for (const { tileKey, rec } of safe(() => allQuarterEntries(), [])) {
    const host = allCities().find((c) => safe(() => c.location.x + "," + c.location.y) === tileKey);
    const plot = rec && rec.placed ? rec.placed.plot : null;
    const at = typeof plot === "number" ? safe(() => GameplayMap.getLocationFromIndex(plot), null) : null;
    emit("ENCLAVE host=" + safe(() => Locale.compose(host.name), "?") + " at=" + J(at) + " origin=" + J(rec && (rec.civ ?? rec.originCiv)));
    if (host && city && host === city && at) enclave = at;
    if (!enclave && host && city && safe(() => host.id.id === city.id.id && host.id.owner === city.id.owner, false) && at) enclave = at;
  }
  return { city, enclave };
}

// The panel is a direct child of <body> styled from a stylesheet (z-index 10001); find it by computed style.
function panel() {
  return safe(() => Array.from(document.body.children).find((d) => {
    const cs = getComputedStyle(d);
    return cs.zIndex === "10001" && cs.display !== "none" && cs.position === "fixed";
  }), null);
}
function hover(at) {
  safe(() => { PlotCursor.plotCursorCoords = { x: at.x, y: at.y }; });
  safe(() => window.dispatchEvent(new CustomEvent("plot-cursor-coords-updated", { detail: { value: { x: at.x, y: at.y } } })));
}
/** Keep the hovered plot and the panel's position fixed while a shot is taken (camera settling re-renders it). */
function pin(at, ms) {
  const cx = Math.round(window.innerWidth / 2), cy = Math.round(window.innerHeight / 2);
  const until = Date.now() + ms;
  return new Promise((resolve) => {
    const tick = () => {
      hover(at);
      const p = panel();
      if (p) { p.style.left = (cx + CURSOR_OFFSET) + "px"; p.style.top = (cy + CURSOR_OFFSET) + "px"; }
      if (Date.now() < until) setTimeout(tick, 100); else resolve(!!p);
    };
    tick();
  });
}

async function shootTile(name, at) {
  await dismissPopups();
  safe(() => Camera.lookAtPlot(at, { zoom: ZOOM }));
  await later(15000);
  safe(() => LensManager.setActiveLens(ETHN));
  await later(3000);
  hover(at);
  await later(2500);
  const p = panel();
  emit("TIP " + name + " at=" + J(at) + " panel=" + !!p + " text=" + J(p ? String(p.textContent).replace(/\s+/g, " ").trim() : "")
    + " screenPos=" + J(safe(() => WorldUI.getScreenPlotPos(at), null)) + " viewport=" + window.innerWidth + "x" + window.innerHeight);
  const holding = pin(at, 4000 + HOLD);
  await later(4000);
  emit("SHOT " + name);
  const had = await holding;
  emit("TIP " + name + " panel held=" + had);
}

async function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("modtest145 run local=" + local + " turn=" + safe(() => Game.turn));
  await later(6000);
  const { city, enclave } = findScene();
  emit("SCENE city=" + J(city && city.location) + " enclave=" + J(enclave));
  if (!city) { emit("SCENE no " + CITY); emit("DONE modtest145 finished"); return; }
  if (enclave) await shootTile("tooltip-enclave", enclave);
  await shootTile("tooltip-city", city.location);
  safe(() => LensManager.setActiveLens("fxs-default-lens"));
  emit("DONE modtest145 finished");
}

emit("modtest145 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest145 finished"); }); }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest145 finished"); }
}
setTimeout(beginPoll, 3000);
