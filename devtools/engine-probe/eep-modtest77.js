// eep-modtest77.js - why the Prosperity lens reads as a gray wash. Mod test 75 showed it paints 1623 plots in 12
// addPlots calls, almost all near gray. Hypothesis: each tile's color is scaled against the single most extreme tile
// (spread = max |score - mean|), so one outlier pushes every other tile toward t = 0. AugustusExp66, mod pass off, no
// turns. Records every addPlots call the lens makes (plot count and color, so plots per bucket), and recomputes the
// lens's per-plot scores the same way (sum of getYields amounts over every settlement's purchased plots) to log the
// mean, the spread, the tiles that set it, and the 10th / 50th / 90th percentile deviations as a share of the spread.
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function r2(v) { return Math.round(v * 100) / 100; }

function scores() {
  const all = [];
  for (const s of safe(() => collectCitySignals(), []) || []) {
    for (const idx of safe(() => s.city.getPurchasedPlots(), []) || []) {
      const ys = safe(() => GameplayMap.getYields(idx, GameContext.localPlayerID), null);
      if (!Array.isArray(ys)) continue;
      let sc = 0;
      for (const y of ys) sc += Array.isArray(y) ? Number(y[1]) || 0 : 0;
      const loc = GameplayMap.getLocationFromIndex(idx);
      all.push({ owner: s.owner, x: loc.x, y: loc.y, score: sc });
    }
  }
  return all;
}

async function run() {
  CONFIG.turnInterval = 99999;
  const all = scores();
  const mean = all.reduce((a, r) => a + r.score, 0) / Math.max(1, all.length);
  let spread = 0;
  for (const r of all) spread = Math.max(spread, Math.abs(r.score - mean));
  const devs = all.map((r) => Math.abs(r.score - mean) / (spread || 1)).sort((a, b) => a - b);
  const pct = (p) => r2(devs[Math.min(devs.length - 1, Math.floor(p * devs.length))] || 0);
  const extremes = all.slice().sort((a, b) => Math.abs(b.score - mean) - Math.abs(a.score - mean)).slice(0, 5)
    .map((r) => ({ owner: r.owner, x: r.x, y: r.y, score: r.score }));
  const scoresSorted = all.map((r) => r.score).sort((a, b) => a - b);
  const q = (p) => scoresSorted[Math.min(scoresSorted.length - 1, Math.floor(p * scoresSorted.length))];
  emit("SCORES plots=" + all.length + " mean=" + r2(mean) + " spread=" + r2(spread) + " scoreP10/P50/P90/max=" + J([q(0.1), q(0.5), q(0.9), q(1 - 1e-9)]) +
    " |t| P10/P50/P90=" + J([pct(0.1), pct(0.5), pct(0.9)]) + " shareUnder0.15=" + r2(devs.filter((d) => d < 0.15).length / Math.max(1, devs.length)) + " extremes=" + J(extremes));

  const LM = await import("/core/ui/lenses/lens-manager.js").then((m) => m.default || m.LensManager).catch((e) => { emit("LENS import failed " + e); return null; });
  const layer = LM ? safe(() => LM.layers.get("emig-prosperity-layer"), null) : null;
  const calls = [];
  if (layer && layer.overlay && typeof layer.overlay.addPlots === "function") {
    const orig = layer.overlay.addPlots.bind(layer.overlay);
    layer.overlay.addPlots = (p, opts) => {
      const c = opts && opts.fillColor;
      calls.push({ n: Array.isArray(p) ? p.length : 0, rgb: c ? [r2(c.x), r2(c.y), r2(c.z)] : null });
      return orig(p, opts);
    };
  }
  safe(() => LM.setActiveLens("emig-prosperity-lens"));
  await later(5000);
  calls.sort((a, b) => b.n - a.n);
  emit("BUCKETS calls=" + calls.length + " " + J(calls));
  emit("SHOT lens-prosperity");
  await later(10000);
  safe(() => LM.setActiveLens("fxs-default-lens"));
  emit("DONE modtest77 finished");
}

emit("modtest77 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest77 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
