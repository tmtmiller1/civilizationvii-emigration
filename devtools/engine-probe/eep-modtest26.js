// eep-modtest26.js - the load-time sweep: on AugustusAnt43 (11 empty rural districts in the saved state),
// count empty rural districts on every settlement's land twice after the game starts, no turn ending.
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { emptyRuralDistrictAt } from "/emigration/ui/emigration-plot-cleanup.js";
const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb; } }
function later(ms) { return new Promise((r) => setTimeout(r, ms)); }
function count() {
  let n = 0; const where = {};
  for (const s of collectCitySignals()) for (const plot of safe(() => s.city.getPurchasedPlots(), []) || []) {
    if (emptyRuralDistrictAt(plot)) { n++; const k = safe(() => Locale.compose(s.city.name), "?"); where[k] = (where[k] || 0) + 1; }
  }
  return n + " " + JSON.stringify(where);
}
async function run() {
  emit("L1 at start (the sweep fires 2-4 s after polling sees GameStarted): empty=" + count());
  await later(8000);
  emit("L2 eight seconds later: empty=" + count() + " (11 in the saved state)");
  emit("DONE modtest26 finished");
}
emit("modtest26 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") { setTimeout(() => { run().catch((e) => emit("run threw " + e)); }, 1000); return; }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else emit("LOAD gave up");
}
setTimeout(beginPoll, 3000);
