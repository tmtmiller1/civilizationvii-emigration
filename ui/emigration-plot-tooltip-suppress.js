// emigration-plot-tooltip-suppress.js
//
// Suppress / restore the base game's plot tooltip while one of the mod's map lenses is active (or while
// the enclave tooltip is up), so it doesn't clash with the mod's own cursor-following panel. Shared by
// the Ethnicity and Prosperity lenses and the enclave tooltip so they all behave identically.
//
// The ui-next plot tooltip gates its show on TWO independent signals: `IsPlotTooltipVisible` (written by
// SetIsPlotTooltipVisible(), shared un-ref-counted state that several base panels reset to true when they
// close) and `isGlobalRuleVisible` (written by the `ui-hide-plot-tooltips` / `ui-show-plot-tooltips`
// window events, which nothing else dispatches). We drive BOTH; the event gate is the one that actually
// holds the tooltip down, so do not "clean up" the dispatch. The `display:none` on `.plot-tooltip` is a
// pre-ui-next backstop kept because it costs nothing. See docs/tooltip-mod-compatibility.md.

import { SetIsPlotTooltipVisible } from "/base-standard/ui-next/tooltips/plot-tooltip/plot-tooltip.js";

const HIDE_TIP_STYLE_ID = "emig-hide-plot-tip-style";
const HIDE_TIP_CLASS = "emig-hide-plot-tip";

/** The DESIRED suppression state (only one lens is ever active, so one shared flag is enough). */
let _hidden = false;
/** The pending re-assert timer id, or null when the game owns the tooltip. @type {*} */
let _holdTimer = null;
/** How often suppression is re-asserted against another writer. Well under a hover's dwell time. */
const RE_ASSERT_MS = 750;

/** Inject (once) the legacy CSS backstop that hides `.plot-tooltip` when the root carries our class. */
function ensureHideTipStyle() {
  if (typeof document === "undefined" || document.getElementById(HIDE_TIP_STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = HIDE_TIP_STYLE_ID;
  st.textContent = "html." + HIDE_TIP_CLASS + " .plot-tooltip{display:none !important;}";
  (document.head || document.documentElement).appendChild(st);
}

/** Apply or clear the suppression (both gates + the pre-ui-next CSS). @param {boolean} hidden Hide it. */
function apply(hidden) {
  try {
    if (typeof SetIsPlotTooltipVisible === "function") SetIsPlotTooltipVisible(!hidden);
  } catch (_) {
    /* ignore - fall through to the legacy backstops */
  }
  try {
    if (typeof document !== "undefined") {
      ensureHideTipStyle();
      document.documentElement.classList.toggle(HIDE_TIP_CLASS, hidden);
    }
    if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(hidden ? "ui-hide-plot-tooltips" : "ui-show-plot-tooltips"));
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * Hide or restore the plot tooltip. Suppression is not a one-shot write: other writers can undo it
 * (base panels reset `SetIsPlotTooltipVisible` to true when they close, and the event gate resets when
 * the plot-tooltip component remounts) and neither is readable from here, so while suppression is
 * wanted a timer re-asserts it every RE_ASSERT_MS, and the timer is cleared the moment it is not.
 * @param {boolean} hidden True to hide the plot tooltip, false to restore it.
 */
export function setBasePlotTooltipHidden(hidden) {
  if (hidden === _hidden) return;
  _hidden = hidden;
  apply(hidden);
  stopHold();
  if (hidden) startHold();
}

/**
 * Begin re-asserting suppression, so another writer cannot quietly restore the tooltip. A
 * self-rescheduling `setTimeout` rather than `setInterval`: the latter is not used anywhere else in
 * this mod, so it is not known to behave in GameFace, and a chain cannot pile up if a tick is slow.
 */
function startHold() {
  if (_holdTimer !== null || typeof setTimeout !== "function") return;
  _holdTimer = setTimeout(function tick() {
    _holdTimer = null;
    if (!_hidden) return;
    apply(true);
    _holdTimer = setTimeout(tick, RE_ASSERT_MS);
  }, RE_ASSERT_MS);
}

/** Stop re-asserting (suppression was lifted, so the game owns the tooltip again). */
function stopHold() {
  if (_holdTimer === null) return;
  try {
    if (typeof clearTimeout === "function") clearTimeout(_holdTimer);
  } catch (_) {
    /* ignore */
  }
  _holdTimer = null;
}
