// emigration-log.js
//
// Dev debug logging for the mod, written to UI.log through console.warn (grep "[Emigration]" in
// ~/Library/Application Support/Civilization VII/Logs/UI.log; console.log does not reach it). Gated on DBG,
// which release.sh flips to false in the shipped copy, so a published build runs silently (it still moves
// population, it just stops emitting diagnostics).
//
// This used to also write each message as an unparseable CSS declaration (the "Unable to parse declaration:
// border-top-color - EMIG_..." lines), from when console output did not reach UI.log. It does now (checked
// 2026-09-18), so that second channel was removed.

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

/**
 * Milliseconds from a monotonic clock where the host has one, else the wall clock. For the "perf:" timing
 * lines that measure how long the Emigration screen and its network diagram take to open.
 * @returns {number} Milliseconds.
 */
export function nowMs() {
  const p = /** @type {*} */ (globalThis).performance;
  return p && typeof p.now === "function" ? p.now() : Date.now();
}

/**
 * A timing line, "[Emigration] perf: ...", so one grep pulls every measurement from UI.log.
 * @param {string} msg Message.
 */
export function plog(msg) {
  dlog("perf: " + msg);
}

/**
 * Frame counters for an animation that settles after it opens: frames, paints, paint time, and the worst gap
 * between frames (the gap includes the game's own layout and drawing, which the paint time alone misses).
 * Logs one "perf:" line on the first frame with nothing left to do, or on close if that never came.
 * @param {string} label What is settling, e.g. "network".
 * @returns {{paint:(ms:number)=>void, tick:(start:number, busy:boolean)=>void, close:()=>void}} The counters.
 */
export function frameTimer(label) {
  const t = nowMs();
  const s = { start: t, last: t, ticks: 0, paints: 0, paintMs: 0, worstPaint: 0, worstGap: 0, done: false };
  const report = (/** @type {string} */ how) => {
    s.done = true;
    const avg = s.paints ? s.paintMs / s.paints : 0;
    plog(label + " " + how + " after " + Math.round(nowMs() - s.start) + " ms: " + s.ticks + " frames, " +
      s.paints + " paints, paint avg " + avg.toFixed(1) + " ms / worst " + Math.round(s.worstPaint) +
      " ms, worst frame gap " + Math.round(s.worstGap) + " ms");
  };
  return {
    paint(ms) {
      s.paints++;
      s.paintMs += ms;
      if (ms > s.worstPaint) s.worstPaint = ms;
    },
    tick(start, busy) {
      if (s.done) return;
      s.ticks++;
      if (s.ticks > 1 && start - s.last > s.worstGap) s.worstGap = start - s.last;
      s.last = start;
      if (!busy) report("settled");
    },
    close() {
      if (!s.done) report("closed before settling");
    }
  };
}
