// eep-modtest146.js - watch the debug-log change (emigration-log.js, 2026-09-18): dlog now writes only through
// console.warn. Loads a save, lets the mod boot and run a pass, then ends. The verdict is read from UI.log by the
// runner: "[Emigration]" lines present, "border-top-color - EMIG_" lines absent.
const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }

emit("modtest146 attached");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() {
  const st = loadStateName();
  if (st === "GameStarted") {
    setTimeout(() => {
      safe(() => globalThis.emigration.runNow()); // one pass, so pass-time dlog lines are in the log too
      setTimeout(() => emit("DONE modtest146 finished"), 8000);
    }, 12000);
    return;
  }
  beginTries++;
  if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady());
  if (beginTries < 90) setTimeout(beginPoll, 2000); else { emit("LOAD gave up"); emit("DONE modtest146 finished"); }
}
setTimeout(beginPoll, 3000);
