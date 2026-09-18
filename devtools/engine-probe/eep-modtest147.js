// eep-modtest147.js - the enclave-tile tooltip shot that mod test 145 got wrong (run 2: see pin()).
// Same scene as the chosen shot 10 (mod test 144: Rostov on Don and its Bulgar enclave, turn 106 of the mod test 142
// game), zoomed in further, with the lens's cursor panel showing the hovered tile's origin mix.
//
//   SHOT enclave-1..3      camera on the enclave tile, panel reading that tile
//
// Mod test 145's enclave shot read the wrong tile: the game turns the REAL mouse (sitting over the game window) into
// "cursor-updated" events that set the hovered plot, and one landed after the probe's last write before the capture.
// Here, while a shot is held, a window listener registered after PlotCursor's own puts the hovered plot straight back
// whenever such an event moves it. Three captures are taken, each logged with the hovered plot and the panel text at
// that moment, so the one to use is chosen from the log, not guessed from the picture.
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
let _hold = null; // the plot being held for a shot, or null
let _overrides = 0;
window.addEventListener("cursor-updated", (ev) => {
  const p = ev && ev.detail && ev.detail.plot;
  if (!_hold || (p && p.x === _hold.x && p.y === _hold.y)) return;
  _overrides++;
  safe(() => { PlotCursor.plotCursorCoords = { x: _hold.x, y: _hold.y }; });
});
function hover(at) {
  safe(() => { PlotCursor.plotCursorCoords = { x: at.x, y: at.y }; });
  safe(() => window.dispatchEvent(new CustomEvent("plot-cursor-coords-updated", { detail: { value: { x: at.x, y: at.y } } })));
}
/** Keep the hovered plot and the panel's position fixed while a shot is taken.
 * Run 1 re-sent the plot-cursor event every tick; each one made the panel re-render and re-place itself at the last
 * real mousemove (0,0, the top-left corner) AFTER the tick had moved it, so every capture showed it in the corner.
 * Now the plot is only re-set when something moved it, and the panel is placed after the frame renders as well. */
function pin(at, ms) {
  // Anchor as if the cursor rested a little below the tile's centre (still on the tile): run 2's panel, anchored at the
  // exact centre, covered the end of the enclave's name label.
  const CURSOR_BELOW_CENTRE = 60;
  const cx = Math.round(window.innerWidth / 2), cy = Math.round(window.innerHeight / 2) + CURSOR_BELOW_CENTRE;
  const until = Date.now() + ms;
  const place = () => {
    const p = panel();
    if (p) { p.style.left = (cx + CURSOR_OFFSET) + "px"; p.style.top = (cy + CURSOR_OFFSET) + "px"; }
    return !!p;
  };
  return new Promise((resolve) => {
    const tick = () => {
      const c = safe(() => PlotCursor.plotCursorCoords, null);
      if (!c || c.x !== at.x || c.y !== at.y) safe(() => { PlotCursor.plotCursorCoords = { x: at.x, y: at.y }; });
      place();
      safe(() => requestAnimationFrame(() => { place(); requestAnimationFrame(place); }));
      if (Date.now() < until) setTimeout(tick, 50); else resolve(place());
    };
    tick();
  });
}

/** Where the panel actually is, for the log. */
function panelBox() {
  const p = panel();
  if (!p) return null;
  const r = safe(() => p.getBoundingClientRect(), null);
  return r ? { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null;
}

async function shootTile(name, at) {
  await dismissPopups();
  safe(() => Camera.lookAtPlot(at, { zoom: ZOOM }));
  await later(15000);
  safe(() => LensManager.setActiveLens(ETHN));
  await later(3000);
  _hold = { x: at.x, y: at.y };
  hover(at);
  await later(2500);
  const holding = pin(at, 3 * 9000 + 4000);
  for (let i = 1; i <= 3; i++) {
    await later(i === 1 ? 4000 : 9000);
    const p = panel();
    emit("SHOT " + name + "-" + i);
    emit("TIP " + name + "-" + i + " cursor=" + J(safe(() => PlotCursor.plotCursorCoords, null)) + " want=" + J(at)
      + " overrides=" + _overrides + " box=" + J(panelBox()) + " text=" + J(p ? String(p.textContent).replace(/\s+/g, " ").trim() : ""));
  }
  await holding;
  _hold = null;
}

async function run() {
  local = safe(() => GameContext.localPlayerID, -1);
  emit("modtest147 run local=" + local + " turn=" + safe(() => Game.turn));
  await later(6000);
  const { city, enclave } = findScene();
  emit("SCENE city=" + J(city && city.location) + " enclave=" + J(enclave));
  if (!city) { emit("SCENE no " + CITY); emit("DONE modtest147 finished"); return; }
  if (enclave) await shootTile("enclave", enclave); else emit("SCENE no enclave found");
  safe(() => LensManager.setActiveLens("fxs-default-lens"));
  emit("DONE modtest147 finished");
}

emit("modtest147 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest147 finished"); }); }, 10000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest147 finished"); }
}
setTimeout(beginPoll, 3000);
