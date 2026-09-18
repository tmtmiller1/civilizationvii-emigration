// eep-modtest126.js - Relabelled Options: value text composes in game, and the tab reads cleanly.
//
// 1. Compose the value keys the formatter uses (plural turns, periods, grouped counts) and a few special words, so
//    a broken plural or number-format block shows up as raw syntax rather than being assumed to work.
// 2. Screenshot the Add-ons tab three times: the main Emigration rows, the Pacing section (turn values), and the
//    War & violence section (percentages, multipliers, Off). Sections are opened via the mod's own context.
const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function composeChecks() {
  const cases = [["LOC_EMIG_VAL_TURNS", 1], ["LOC_EMIG_VAL_TURNS", 3], ["LOC_EMIG_VAL_EVERY", 2], ["LOC_EMIG_VAL_COUNT", 40000],
    ["LOC_EMIG_VAL_COUNT", 150000], ["LOC_EMIG_CHOICE_INSTANT"], ["LOC_EMIG_CHOICE_EVERY_TURN"], ["LOC_EMIG_ADVGRP_BRAKES"],
    ["LOC_EMIG_T_VDECAY"], ["LOC_OPTIONS_EMIG_DOCK"]];
  let bad = 0;
  for (const [k, arg] of cases) {
    const out = safe(() => (arg === undefined ? Locale.compose(k) : Locale.compose(k, arg)), "ERR");
    const raw = !out || String(out).startsWith("LOC_") || /[{}]|plural|number #/.test(String(out)) || String(out).startsWith("ERR");
    if (raw) bad++;
    emit("COMPOSE " + k + (arg === undefined ? "" : "(" + arg + ")") + " = " + out + (raw ? "   <-- RAW" : ""));
  }
  emit("COMPOSE bad=" + bad);
}
// One open of the Options screen with both sections expanded, then three scrolls within it. Reopening the screen per
// shot (mod test 125) left the previous screen's scroller in the document, so later scrolls moved a closed screen.
const SHOTS = [
  ["main", "emigration-preset"],
  ["pacing", "emigration-adv-cooldownTurns"],
  ["violence", "emigration-adv-minorViolenceScale"]
];
function shot(i) {
  const api = safe(() => globalThis.emigration, null);
  if (!api || typeof api.options !== "function") { emit("NO options()"); emit("DONE modtest126 finished"); return; }
  if (i >= SHOTS.length) { safe(() => api.closeOptions()); setTimeout(() => emit("DONE modtest126 finished"), 4000); return; }
  const [name, row] = SHOTS[i];
  emit("SCROLL " + name + " found=" + safe(() => api.optionsScrollTo(row), "ERR"));
  setTimeout(() => { emit("SHOT relabel_" + name); setTimeout(() => shot(i + 1), 9000); }, 3000);
}
function openOnce() {
  const api = safe(() => globalThis.emigration, null);
  safe(() => api.options(0, "violence"));
  setTimeout(() => { safe(() => api.closeOptions()); setTimeout(() => { safe(() => api.options(0, "pacing")); setTimeout(() => shot(0), 7000); }, 4000); }, 1000);
}
let tries = 0;
function stateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function poll() {
  if (stateName() === "GameStarted") { setTimeout(() => { openOnce(); }, 15000); return; }
  tries++;
  if (tries % 5 === 0 || tries < 3) safe(() => UI.notifyUIReady());
  if (tries < 90) setTimeout(poll, 2000); else { emit("LOAD gave up"); emit("DONE modtest126 finished"); }
}
emit("modtest126 attached");
setTimeout(poll, 3000);
