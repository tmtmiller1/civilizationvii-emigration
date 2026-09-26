// eep-modtest79.js - watch the per-city Prosperity lens up close. Mod test 78 measured the fix at the data level
// (largest color bucket 28% of plots, down from 63%; 70 tiles at full green), but the wide camera over London could
// not show a 0.6-alpha tint on textured terrain. This points the camera at the local civ's best and worst tile (scored
// the way the lens scores them, per settlement) with the lens on, so the color is legible, and logs both tiles.
import { CONFIG } from "/emigration/ui/emigration-config.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** One settlement's plots scored as the lens scores them, with each tile's deviation from its own city's mean. */
function cityTiles(city, local) {
  const tiles = [];
  for (const idx of safe(() => city.getPurchasedPlots(), []) || []) {
    const ys = safe(() => GameplayMap.getYields(idx, local), null);
    if (!Array.isArray(ys)) continue;
    let score = 0;
    for (const y of ys) score += Array.isArray(y) ? Number(y[1]) || 0 : 0;
    const loc = GameplayMap.getLocationFromIndex(idx);
    tiles.push({ x: loc.x, y: loc.y, score });
  }
  if (!tiles.length) return [];
  const mean = tiles.reduce((a, r) => a + r.score, 0) / tiles.length;
  let spread = 0;
  for (const r of tiles) spread = Math.max(spread, Math.abs(r.score - mean));
  return tiles.map((r) => ({ ...r, mean: Math.round(mean * 10) / 10, t: spread > 0 ? (r.score - mean) / spread : 0 }));
}

async function run() {
  CONFIG.turnInterval = 99999;
  const local = GameContext.localPlayerID;
  const cities = (safe(() => Players.get(local).Cities.getCities(), []) || []);
  // The settlement with the widest own spread shows the gradient best.
  let best = null;
  for (const c of cities) {
    const tiles = cityTiles(c, local);
    if (tiles.length < 6) continue;
    const hi = tiles.reduce((a, r) => (r.t > a.t ? r : a), tiles[0]);
    const lo = tiles.reduce((a, r) => (r.t < a.t ? r : a), tiles[0]);
    const range = hi.score - lo.score;
    if (!best || range > best.range) best = { name: safe(() => Locale.compose(c.name), "?"), hi, lo, range, n: tiles.length };
  }
  if (!best) { emit("no settlement with enough plots"); emit("DONE modtest79 finished"); return; }
  emit("CITY " + J(best));

  const LM = await import("/core/ui/lenses/lens-manager.js").then((m) => m.default || m.LensManager).catch(() => null);
  safe(() => LM.setActiveLens("emig-prosperity-lens"));
  await later(5000);
  safe(() => Camera.lookAtPlot({ x: best.hi.x, y: best.hi.y }, { zoom: 0.3 }));
  await later(4000);
  emit("SHOT percity-best-tile");
  await later(10000);
  safe(() => Camera.lookAtPlot({ x: best.lo.x, y: best.lo.y }, { zoom: 0.3 }));
  await later(4000);
  emit("SHOT percity-worst-tile");
  await later(10000);
  safe(() => LM.setActiveLens("fxs-default-lens"));
  await later(4000);
  emit("SHOT percity-default-same-camera");
  await later(10000);
  emit("DONE modtest79 finished");
}

emit("modtest79 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest79 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
