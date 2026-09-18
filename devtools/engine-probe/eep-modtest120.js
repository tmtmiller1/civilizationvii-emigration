// eep-modtest120.js - Load check for the conflict-refugee sliders (overall, major-power wars, minor-power raids).
//
// Probes cannot see or open the Options screen, so this checks everything around it that CAN be read:
//   1. the new and retranslated text keys resolve to real text in game (not the raw LOC_ tag)
//   2. the mod booted and the violence audit reports the measured defaults (scale 0.4, floor 0.08)
// The harness log is then searched for load errors from emigration-options.js / emigration-tunables.js.
const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
const KEYS = ["LOC_OPTIONS_EMIG_CONFLICTREF", "LOC_OPTIONS_EMIG_MAJORWAR", "LOC_OPTIONS_EMIG_MINORRAID", "LOC_OPTIONS_EMIG_MINORRAID_D", "LOC_EMIG_T_MAJORVIOL", "LOC_EMIG_T_SIEGEFLOOR",
  "LOC_EMIG_ADVGRP_VIOLENCE", "LOC_OPTIONS_EMIG_CROSSCIV"];
function run() {
  let raw = 0;
  for (const k of KEYS) {
    const t = safe(() => Locale.compose(k), "ERR");
    if (!t || t === k || String(t).startsWith("LOC_") || String(t).startsWith("ERR")) raw++;
    emit("TEXT " + k + " = " + String(t).slice(0, 90));
  }
  const g = /** @type {*} */ (globalThis);
  emit("BOOT emigration=" + typeof g.emigration + " audit=" + typeof g.EmigrationViolence);
  emit("CONFIG " + JSON.stringify(safe(() => g.EmigrationViolence.config(), "ABSENT")));
  emit("RESULT rawKeys=" + raw + " of " + KEYS.length);
  setTimeout(() => emit("DONE modtest120 finished"), 3000);
}
let tries = 0;
function stateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function poll() {
  if (stateName() === "GameStarted") { setTimeout(() => { try { run(); } catch (e) { emit("run threw " + e); emit("DONE modtest120 finished"); } }, 12000); return; }
  tries++;
  if (tries % 5 === 0 || tries < 3) safe(() => UI.notifyUIReady());
  if (tries < 90) setTimeout(poll, 2000); else { emit("LOAD gave up"); emit("DONE modtest120 finished"); }
}
emit("modtest120 attached");
setTimeout(poll, 3000);
