// eep-modtest75.js - why the Prosperity lens paints nothing visible. Mod test 73's same-camera pair (default lens,
// Prosperity lens) looked identical over London, with no error logged, although mod test 70 showed per-plot yields
// read. AugustusExp66, mod pass off, no turns. Separates the causes:
//   R  registration: LensManager's lenses / layers maps hold emig-prosperity-lens / emig-prosperity-layer here.
//   S  data in this context: collectCitySignals() count, London's getPurchasedPlots() count.
//   O  overlay rendering at all: a magenta fill (alpha 1) on London's plots through a probe-owned overlay, shot.
//   L  the lens itself: the layer's overlay.addPlots wrapped with a counter, the lens switched on, calls and plots
//      counted, shot; then applyLayer() called directly and counted again.
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  CONFIG.turnInterval = 99999;
  const local = GameContext.localPlayerID;
  const LM = await import("/core/ui/lenses/lens-manager.js").then((m) => m.default || m.LensManager).catch((e) => { emit("R import failed " + e); return null; });
  if (!LM) { emit("DONE modtest75 finished"); return; }
  const layer = safe(() => LM.layers.get("emig-prosperity-layer"), null);
  emit("R lensRegistered=" + safe(() => LM.lenses.has("emig-prosperity-lens")) + " layerRegistered=" + !!layer +
    " layerHasOverlay=" + !!(layer && layer.overlay) + " lensCount=" + safe(() => LM.lenses.size) + " active=" + J(safe(() => LM.getActiveLens(), null)));

  const sigs = safe(() => collectCitySignals(), []) || [];
  const london = (safe(() => Players.get(local).Cities.getCities(), []) || []).find((c) => /London/.test(safe(() => Locale.compose(c.name), "")));
  const plots = london ? (safe(() => london.getPurchasedPlots(), []) || []).map((i) => GameplayMap.getLocationFromIndex(i)) : [];
  emit("S signals=" + sigs.length + " localSignals=" + sigs.filter((s) => s.owner === local).length + " londonPlots=" + plots.length +
    " sampleYields=" + J(london ? safe(() => GameplayMap.getYields(london.getPurchasedPlots()[0], local)) : null));

  // O: our own overlay, bright and opaque, on London's plots.
  safe(() => LM.setActiveLens("fxs-default-lens"));
  await later(3000);
  const group = safe(() => WorldUI.createOverlayGroup("EmigProbeOverlay", 1), null);
  const own = group ? safe(() => group.addPlotOverlay(), null) : null;
  const added = own ? safe(() => own.addPlots(plots, { fillColor: { x: 1, y: 0, z: 1, w: 1 } }), "threw") : "no overlay";
  emit("O group=" + !!group + " overlay=" + !!own + " addPlots=" + J(added));
  await later(3000);
  emit("SHOT probe-magenta");
  await later(10000);
  safe(() => { own.clear(); group.clearAll(); });
  await later(2000);

  // L: count what the lens paints.
  let calls = 0, painted = 0;
  const colours = [];
  if (layer && layer.overlay && typeof layer.overlay.addPlots === "function") {
    const orig = layer.overlay.addPlots.bind(layer.overlay);
    layer.overlay.addPlots = (p, opts) => { calls++; painted += Array.isArray(p) ? p.length : 0; if (colours.length < 3) colours.push(opts && opts.fillColor); return orig(p, opts); };
  }
  safe(() => LM.setActiveLens("emig-prosperity-lens"));
  await later(5000);
  emit("L viaLens active=" + J(safe(() => LM.getActiveLens(), null)) + " addPlotsCalls=" + calls + " plotsPainted=" + painted + " colours=" + J(colours));
  emit("SHOT lens-prosperity-counted");
  await later(10000);
  const c0 = calls, p0 = painted;
  const direct = layer ? safe(() => { layer.applyLayer(); return "ok"; }, "threw") : "no layer";
  await later(3000);
  emit("L direct applyLayer=" + J(direct) + " addPlotsCalls=" + (calls - c0) + " plotsPainted=" + (painted - p0));
  emit("SHOT lens-prosperity-direct");
  await later(10000);
  safe(() => LM.setActiveLens("fxs-default-lens"));
  emit("DONE modtest75 finished");
}

emit("modtest75 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest75 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
