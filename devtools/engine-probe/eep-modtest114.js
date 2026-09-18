// eep-modtest114.js - Are globals shared across mod script contexts at all?
//
// Mod test 113 read `globalThis.EmigrationCombat` as absent. That has two very different causes and the
// difference decides whether there is a bug to fix:
//   (a) emigration's boot never called startCombatEvents  -> a real wiring bug, mine to fix.
//   (b) each mod's UI script has its OWN globalThis        -> the reading is meaningless and cross-context
//       verification needs a completely different mechanism.
//
// The control is `globalThis.emigration`, the console API that emigration-main installs at the TOP of boot(),
// several statements BEFORE the combat tracker is started. So:
//   emigration present + EmigrationCombat absent -> (a): boot ran, my call did not take effect.
//   both absent                                  -> (b): this probe cannot see emigration's globals at all.
// `DemographicsData` is a second control: emigration-combat.js already depends on reading it cross-MOD, so
// whether it is visible here says whether that established pattern actually crosses contexts.
const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "unserializable"; } }

let n = 0, done = false;

function report(tag) {
  const g = globalThis;
  emit(tag + " emigration=" + typeof g.emigration
    + " EmigrationCombat=" + typeof g.EmigrationCombat
    + " DemographicsData=" + typeof g.DemographicsData);
  if (typeof g.emigration === "object" && g.emigration) {
    emit(tag + "   emigration keys=" + J(safe(() => Object.keys(g.emigration), "ERR")));
  }
  if (typeof g.EmigrationCombat === "object" && g.EmigrationCombat) {
    emit(tag + "   combat stats=" + J(safe(() => g.EmigrationCombat.stats(), "ERR")));
  }
}

engine.on("PlayerTurnActivated", () => {
  if (done) return;
  n++;
  setTimeout(() => {
    report("T" + n);
    if (n >= 3) { done = true; emit("DONE modtest114 finished"); }
  }, 4000);
});

emit("modtest114 attached");
let tries = 0;
function stateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function poll() {
  if (stateName() === "GameStarted") {
    setTimeout(() => {
      report("START");
      // Give the mod plenty of time to finish booting, then read again before ending the run.
      setTimeout(() => { report("LATE"); if (!done) { done = true; emit("DONE modtest114 finished"); } }, 30000);
    }, 12000);
    return;
  }
  tries++;
  if (tries % 5 === 0 || tries < 3) safe(() => UI.notifyUIReady());
  if (tries < 90) setTimeout(poll, 2000); else { emit("LOAD gave up"); emit("DONE modtest114 finished"); }
}
setTimeout(poll, 3000);
