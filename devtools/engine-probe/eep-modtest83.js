// eep-modtest83.js - the Prosperity lens's cursor panel after the per-tile rewrite. The panel used to print only a
// settlement's standing against the world, which sat near "About average" for almost every city and had nothing to do
// with the color the lens painted a tile. It now leads with the hovered TILE's standing inside its own settlement,
// the number the fill color is mixed from (emigration-tile-score.js, shared by both surfaces).
// A probe cannot move the mouse, so this reads the panel two ways: it logs tileTierAt for a spread of the settlement's
// tiles (what the panel would print on each), then tries to drive the panel by setting the plot cursor and dispatching
// a mousemove, and dumps the panel element's rendered rows plus a screenshot.
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { cityTileTiers, tileTierAt, tierHex } from "/emigration/ui/emigration-tile-score.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function r2(v) { return Math.round(v * 100) / 100; }

async function run() {
  CONFIG.turnInterval = 99999;
  const local = GameContext.localPlayerID;
  let best = null;
  for (const c of safe(() => Players.get(local).Cities.getCities(), []) || []) {
    const tiers = cityTileTiers(c);
    if (tiers.length < 6) continue;
    const hi = tiers.reduce((a, r) => (r.t > a.t ? r : a), tiers[0]);
    const lo = tiers.reduce((a, r) => (r.t < a.t ? r : a), tiers[0]);
    if (!best || hi.score - lo.score > best.range) best = { city: c, name: safe(() => Locale.compose(c.name), "?"), tiers, hi, lo, range: hi.score - lo.score };
  }
  if (!best) { emit("no settlement with enough tiles"); emit("DONE modtest83 finished"); return; }

  // What the panel would print on a spread of this settlement's tiles: the same deviation the lens colored each from.
  const sorted = best.tiers.slice().sort((a, b) => b.score - a.score);
  const sample = [sorted[0], sorted[Math.floor(sorted.length * 0.25)], sorted[Math.floor(sorted.length / 2)],
    sorted[Math.floor(sorted.length * 0.75)], sorted[sorted.length - 1]].filter(Boolean);
  emit("TILES " + best.name + " n=" + best.tiers.length + " mean=" + r2(best.tiers[0].mean) + " " +
    J(sample.map((r) => ({ at: r.x + "," + r.y, score: r.score, pct: Math.round(r.t * 100), hex: tierHex(r.t) }))));
  emit("PANEL would show " + J(safe(() => tileTierAt(best.city, best.hi.x, best.hi.y), null)) + " on the best tile");

  const LM = await import("/core/ui/lenses/lens-manager.js").then((m) => m.default || m.LensManager).catch(() => null);
  safe(() => Camera.lookAtPlot({ x: best.hi.x, y: best.hi.y }, { zoom: 0.25 }));
  await later(15000);
  safe(() => LM.setActiveLens("emig-prosperity-lens"));
  await later(5000);

  // Drive the panel: point the engine's plot cursor at the tile and nudge the mouse so the panel re-renders.
  const setCursor = safe(() => { PlotCursor.plotCursorCoords = { x: best.hi.x, y: best.hi.y }; return J(PlotCursor.plotCursorCoords); }, "threw");
  safe(() => window.dispatchEvent(new MouseEvent("mousemove", { clientX: Math.round(window.innerWidth / 2), clientY: Math.round(window.innerHeight / 2), bubbles: true })));
  await later(3000);
  const panel = safe(() => document.getElementById("emig-prospanel"), null);
  emit("PANEL cursor=" + setCursor + " element=" + !!panel + " display=" + safe(() => panel && panel.style.display, "?") +
    " rows=" + J(safe(() => panel ? Array.from(panel.querySelectorAll(".r")).map((r) => r.textContent.trim()) : null, "threw")) +
    " title=" + J(safe(() => panel && panel.querySelector(".t") ? panel.querySelector(".t").textContent : null, "threw")));
  emit("SHOT panel-on-best-tile");
  await later(12000);
  safe(() => LM.setActiveLens("fxs-default-lens"));
  emit("DONE modtest83 finished");
}

emit("modtest83 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest83 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
