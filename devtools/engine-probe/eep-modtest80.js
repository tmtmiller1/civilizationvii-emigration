// eep-modtest80.js - watch the per-city Prosperity lens, with the camera settled. Mod test 79 moved the camera 4s
// before each shot and every frame lagged one move behind, so the tint was never seen at a tile whose value is known.
// Here the camera moves ONCE to the best-scoring tile of the settlement with the widest own spread, waits 15s, and
// shoots with the lens on, then with the lens off from the SAME camera. The pair isolates the lens's fill.
import { CONFIG } from "/emigration/ui/emigration-config.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** One settlement's LAND plots scored as the lens scores them, each tile's deviation from its own city's mean. */
function cityTiles(city, local) {
  const tiles = [];
  for (const idx of safe(() => city.getPurchasedPlots(), []) || []) {
    const loc = GameplayMap.getLocationFromIndex(idx);
    if (safe(() => GameplayMap.isWater(loc.x, loc.y), false)) continue; // water reads 0 and is not what a player judges
    const ys = safe(() => GameplayMap.getYields(idx, local), null);
    if (!Array.isArray(ys)) continue;
    let score = 0;
    for (const y of ys) score += Array.isArray(y) ? Number(y[1]) || 0 : 0;
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
  let best = null;
  for (const c of safe(() => Players.get(local).Cities.getCities(), []) || []) {
    const tiles = cityTiles(c, local);
    if (tiles.length < 6) continue;
    const hi = tiles.reduce((a, r) => (r.t > a.t ? r : a), tiles[0]);
    const lo = tiles.reduce((a, r) => (r.t < a.t ? r : a), tiles[0]);
    if (!best || hi.score - lo.score > best.range) {
      best = { name: safe(() => Locale.compose(c.name), "?"), hi, lo, range: hi.score - lo.score, n: tiles.length,
        neighbours: tiles.slice().sort((a, b) => b.score - a.score).slice(0, 6).map((r) => r.x + "," + r.y + "=" + r.score) };
    }
  }
  if (!best) { emit("no settlement with enough land plots"); emit("DONE modtest80 finished"); return; }
  emit("CITY " + J(best));

  const LM = await import("/core/ui/lenses/lens-manager.js").then((m) => m.default || m.LensManager).catch(() => null);
  safe(() => Camera.lookAtPlot({ x: best.hi.x, y: best.hi.y }, { zoom: 0.25 }));
  await later(15000); // mod test 79: 4s left the camera mid-flight and the shot showed the previous framing
  safe(() => LM.setActiveLens("emig-prosperity-lens"));
  await later(6000);
  emit("CAMERA settled at " + best.hi.x + "," + best.hi.y + " lens=" + J(safe(() => LM.getActiveLens(), null)));
  emit("SHOT percity-lens-on");
  await later(12000);
  safe(() => LM.setActiveLens("fxs-default-lens"));
  await later(6000);
  emit("SHOT percity-lens-off");
  await later(12000);
  emit("DONE modtest80 finished");
}

emit("modtest80 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest80 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
