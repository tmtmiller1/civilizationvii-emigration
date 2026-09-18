// eep-modtest127.js - Advanced settings back in their own window: the button on the Add-ons tab, and the window.
//
// Shot 1: the Add-ons tab scrolled to the Emigration group (renamed first row, sliders, Advanced settings button).
// Shot 2: the Advanced settings window opened on its own, with the War & violence section expanded and the rest
//         collapsed, to see the section headers, the units on values and the remembered open section.
const TAG = "[EmigTest]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function run() {
  const api = safe(() => globalThis.emigration, null);
  if (!api || typeof api.options !== "function" || typeof api.advancedSettings !== "function") {
    emit("NO diagnostics on globalThis.emigration"); emit("DONE modtest127 finished"); return;
  }
  emit("TEXT numbers=" + safe(() => Locale.compose("LOC_OPTIONS_EMIGRATION_NUMBERS"), "ERR")
    + " advanced=" + safe(() => Locale.compose("LOC_OPTIONS_EMIGRATION_ADVANCED"), "ERR"));
  safe(() => api.options(0));
  setTimeout(() => {
    emit("SCROLL found=" + safe(() => api.optionsScrollTo("emigration-advanced"), "ERR"));
    setTimeout(() => {
      emit("SHOT tab");
      setTimeout(() => {
        safe(() => api.closeOptions());
        setTimeout(() => {
          safe(() => api.advancedSettings("violence"));
          setTimeout(() => {
            emit("SHOT window");
            setTimeout(() => { safe(() => api.closeAdvancedSettings()); setTimeout(() => emit("DONE modtest127 finished"), 4000); }, 9000);
          }, 7000);
        }, 4000);
      }, 9000);
    }, 3000);
  }, 7000);
}
let tries = 0;
function stateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function poll() {
  if (stateName() === "GameStarted") { setTimeout(run, 15000); return; }
  tries++;
  if (tries % 5 === 0 || tries < 3) safe(() => UI.notifyUIReady());
  if (tries < 90) setTimeout(poll, 2000); else { emit("LOAD gave up"); emit("DONE modtest127 finished"); }
}
emit("modtest127 attached");
setTimeout(poll, 3000);
