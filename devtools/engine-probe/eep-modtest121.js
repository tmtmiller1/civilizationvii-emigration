// eep-modtest121.js - Screenshot the real Options screen: Mods tab, conflict sliders, collapsible advanced sections.
//
// Probes cannot draw the game's interface from their own script context, so this asks the mod to open the Options
// screen (globalThis.emigration.options, run in the mod's context) with the War & violence section expanded, on
// each tab index in turn, and screenshots each. The Mods tab's index is not fixed, so several are captured.
const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
const TABS = [3, 4, 5, 6, 7, 8, 9];
function step(i) {
  const api = safe(() => globalThis.emigration, null);
  if (!api || typeof api.options !== "function") { emit("NO options() on globalThis.emigration"); emit("DONE modtest121 finished"); return; }
  if (i >= TABS.length) { setTimeout(() => emit("DONE modtest121 finished"), 3000); return; }
  const tab = TABS[i];
  emit("OPEN tab " + tab);
  safe(() => api.options(tab, "violence"));
  setTimeout(() => {
    emit("SHOT options_tab" + tab);
    setTimeout(() => { safe(() => api.closeOptions()); setTimeout(() => step(i + 1), 4000); }, 9000);
  }, 6000);
}
let tries = 0;
function stateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function poll() {
  if (stateName() === "GameStarted") { setTimeout(() => step(0), 15000); return; }
  tries++;
  if (tries % 5 === 0 || tries < 3) safe(() => UI.notifyUIReady());
  if (tries < 90) setTimeout(poll, 2000); else { emit("LOAD gave up"); emit("DONE modtest121 finished"); }
}
emit("modtest121 attached");
setTimeout(poll, 3000);
