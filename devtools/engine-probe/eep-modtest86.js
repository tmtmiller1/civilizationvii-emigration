// eep-modtest86.js - is the Ethnicity lens painting? Reported not working in game (2026-09-15). Its data is seeded
// for every settlement (emigration-composition.js seedCities) and read from persisted state, so this separates the
// three candidates the Prosperity lens investigation taught: registration, data in the lens's own script context, and
// the paint calls themselves. AugustusExp66, mod pass off, no turns.
//   R  registration: LensManager holds emig-ethnicity-lens / emig-ethnicity-layer here.
//   D  data: compositionForCity + tilesForCity for a sample of settlements (are there tiles to paint at all?).
//   L  paint: the layer's overlay.addPlots wrapped with a counter, the lens switched on, calls/plots/colours logged,
//      then a screenshot with the lens on and one from the same camera with it off.
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { tilesForCity } from "/emigration/ui/emigration-ethnicity-tiles.js";

const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable:" + e; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  CONFIG.turnInterval = 99999;
  const local = GameContext.localPlayerID;
  const LM = await import("/core/ui/lenses/lens-manager.js").then((m) => m.default || m.LensManager).catch((e) => { emit("R import failed " + e); return null; });
  if (!LM) { emit("DONE modtest86 finished"); return; }
  const layer = safe(() => LM.layers.get("emig-ethnicity-layer"), null);
  emit("R lensRegistered=" + safe(() => LM.lenses.has("emig-ethnicity-lens")) + " layerRegistered=" + !!layer +
    " layerHasOverlay=" + !!(layer && layer.overlay) + " active=" + J(safe(() => LM.getActiveLens(), null)));

  const sigs = (safe(() => collectCitySignals(), []) || []);
  const rows = [];
  for (const s of sigs.slice(0, 8)) {
    const comp = safe(() => compositionForCity(s.city), null);
    const tiles = safe(() => tilesForCity(s.city), null);
    rows.push({
      city: safe(() => Locale.compose(s.city.name), "?"), owner: s.owner,
      comp: comp ? { total: comp.total, dominant: comp.dominant, civs: (comp.civs || []).length } : null,
      tiles: tiles && tiles.tiles ? tiles.tiles.length : null
    });
  }
  emit("D settlements=" + sigs.length + " " + J(rows));

  let calls = 0, painted = 0;
  const colours = [];
  if (layer && layer.overlay && typeof layer.overlay.addPlots === "function") {
    const orig = layer.overlay.addPlots.bind(layer.overlay);
    layer.overlay.addPlots = (p, opts) => {
      calls++;
      painted += Array.isArray(p) ? p.length : 0;
      if (colours.length < 3) colours.push({ fill: opts && opts.fillColor, edge: opts && opts.edgeColor });
      return orig(p, opts);
    };
  }
  safe(() => LM.setActiveLens("fxs-default-lens"));
  await later(4000);
  safe(() => LM.setActiveLens("emig-ethnicity-lens"));
  await later(6000);
  emit("L active=" + J(safe(() => LM.getActiveLens(), null)) + " addPlotsCalls=" + calls + " plotsPainted=" + painted + " colours=" + J(colours));
  emit("SHOT ethnicity-lens-on");
  await later(12000);
  safe(() => LM.setActiveLens("fxs-default-lens"));
  await later(5000);
  emit("SHOT ethnicity-lens-off");
  await later(12000);
  emit("DONE modtest86 finished");
}

emit("modtest86 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => { emit("run threw " + e + " " + (e && e.stack)); emit("DONE modtest86 finished"); }); }, 10000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
