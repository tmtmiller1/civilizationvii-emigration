// emigration-plot-tooltip-suppress.js
//
// Suppress / restore the base game's plot tooltip while one of the mod's map lenses is active (or while
// the enclave tooltip is up), so it doesn't clash with the mod's own cursor-following panel. Shared by
// the Ethnicity and Prosperity lenses and the enclave tooltip so they all behave identically.
//
// On 1.5.0 the plot tooltip is the ui-next one, and it gates its show on TWO independent signals
// (base-standard/ui-next/tooltips/plot-tooltip/plot-tooltip.js, the createEffect at ~1321):
//
//   1. `IsPlotTooltipVisible`, written by the exported SetIsPlotTooltipVisible().
//   2. `isGlobalRuleVisible`, written by the `ui-hide-plot-tooltips` / `ui-show-plot-tooltips` window
//      events the component listens for onMount (~1348).
//
// We drive BOTH, and the second one is the load-bearing one - the reverse of what this file used to
// claim. The signal is shared, un-ref-counted state: tutorial-callout, screen-endgame,
// panel-unit-combat-preview and panel-pantheon-complete all set it back to true when they close, which
// would silently un-suppress the tooltip mid-lens (our `_hidden` latch would never re-apply it). The
// event gate is ours alone - nothing in base-standard, nothing in core, and no installed mod dispatches
// either event - so it is the one that actually holds the tooltip down. Do not "clean up" the dispatch
// as a legacy backstop.
//
// The `display:none` on `.plot-tooltip` is the only genuinely legacy piece, and it is dead on 1.5.0: the
// ui-next tooltip does not emit that class. It is kept because it costs nothing and still works on a
// pre-ui-next build. There is nothing left to fight over there in any case - the legacy plot-tooltip
// path the tooltip mods hooked is gone in 1.5.0 (`base-standard/ui/tooltips/plot-tooltip.js` no longer
// exists, so TCS Improved Plot Tooltip's ImportFiles override lands on nothing, and
// `/core/ui/tooltips/tooltip-manager.js` no longer exports `PlotTooltipPriority`, so bz-map-trix's
// bz-plot-tooltip.js cannot even load). See docs/tooltip-mod-compatibility.md.

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
 * Hide or restore the plot tooltip.
 *
 * Suppression is not a one-shot write, because two other writers can undo it and neither is readable
 * from here:
 *
 *   - `SetIsPlotTooltipVisible` is shared, un-ref-counted state. tutorial-callout, screen-endgame,
 *     panel-unit-combat-preview and panel-pantheon-complete each set it back to `true` when they
 *     close. Against a tooltip mod that honours ONLY that signal - QD Improved Plot Tooltip replaces
 *     the whole PlotTooltip component via ComponentRegistry and drops the event gate - closing a
 *     combat preview under an active lens would un-suppress the tooltip for the rest of the session.
 *   - `isGlobalRuleVisible`, the event gate, is created INSIDE the plot-tooltip component, so it
 *     resets to `true` whenever that component remounts.
 *
 * So rather than try to detect a stomp, we hold the state down: while suppression is wanted a timer
 * re-asserts it every RE_ASSERT_MS, and the timer is cleared the moment it is not. That is one signal
 * write plus one event per interval, only while a lens (or the enclave tooltip) is actually up.
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
