// emigration-log.js
//
// Dev debug logging for the mod, written to UI.log through console.warn (grep "[Emigration]" in
// ~/Library/Application Support/Civilization VII/Logs/UI.log; console.log does not reach it). Gated on DBG,
// which release.sh flips to false in the shipped copy, so a published build runs silently (it still moves
// population, it just stops emitting diagnostics).
//
// This used to ALSO write each message as an unparseable CSS declaration (the "Unable to parse declaration:
// border-top-color - EMIG_..." lines), from when console output did not reach UI.log. It does now: on 2026-09-18
// every such line had an intact "[Emigration]" twin, so that second channel was removed.

const DBG = true;

/**
 * Debug log to UI.log via console.warn. No-op unless DBG.
 * @param {string} msg Message.
 */
export function dlog(msg) {
  if (!DBG) return;
  try {
    console.warn("[Emigration] " + msg);
  } catch (_) {
    /* ignore */
  }
}
