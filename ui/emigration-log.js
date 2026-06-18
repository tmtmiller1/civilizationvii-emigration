// emigration-log.js
//
// Dev debug logging for the mod. Mod console.log does not reach UI.log from the UI VM, so when
// debugging is on we also emit through the GameFace CSS-parse channel (grep EMIG_ in
// ~/Library/Application Support/Civilization VII/Logs/UI.log). Gated on DBG, which release.sh flips
// to false in the shipped copy , a published build runs silently (it still moves population, it
// just stops emitting diagnostics).

const TAG = "EMIG_";
const DBG = true;

/**
 * Emit a value to UI.log via an unparseable CSS declaration (chunked).
 * @param {string} val Encoded value.
 */
function emitCss(val) {
  const el = document.createElement("div");
  el.style.cssText = "border-top-color:" + val;
}

/**
 * Debug log to console + UI.log (CSS-parse channel). No-op unless DBG.
 * @param {string} msg Message.
 */
export function dlog(msg) {
  if (!DBG) return;
  try {
    console.warn("[Emigration] " + msg);
  } catch (_) {
    /* ignore */
  }
  try {
    const safe = String(msg).replace(/[^A-Za-z0-9]+/g, "_");
    const CH = 170;
    if (safe.length <= CH) {
      emitCss(TAG + safe);
      return;
    }
    for (let i = 0, p = 0; i < safe.length; i += CH, p++) emitCss(TAG + "c" + p + "_" + safe.slice(i, i + CH));
  } catch (_) {
    /* ignore */
  }
}
