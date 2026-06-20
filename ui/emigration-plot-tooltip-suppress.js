// emigration-plot-tooltip-suppress.js
//
// Suppress / restore the base game's plot tooltip while one of the mod's map lenses is active, so it
// doesn't clash with that lens's own cursor-following composition / prosperity panel. Shared by the
// Ethnicity and Prosperity lenses so they behave identically.
//
// The lever is the ui-next plot tooltip's own visibility signal: SetIsPlotTooltipVisible(false). The
// tooltip component gates its show on that signal (base-standard plot-tooltip.js:
// `if (!isVisible) hidePlotTooltip()`), and the signal is a normal enable flag - toggled only by
// view/cinematic lifecycle, never per-hover - so forcing it false keeps the tooltip hidden across
// hovers until we set it true again. This is the same mechanism the engine uses to hide the tooltip
// during cinematics, so it's honored regardless of any tooltip mod layered on top. The CSS
// `display:none` on `.plot-tooltip` and the `ui-hide-plot-tooltips` event are kept only as harmless
// backstops for the legacy (non-ui-next / bz-map-trix / TCS) tooltip path.

import { SetIsPlotTooltipVisible } from "/base-standard/ui-next/tooltips/plot-tooltip/plot-tooltip.js";

const HIDE_TIP_STYLE_ID = "emig-hide-plot-tip-style";
const HIDE_TIP_CLASS = "emig-hide-plot-tip";

/** The current suppression state, so we only act on transitions (only one lens is ever active). */
let _hidden = false;

/** Inject (once) the legacy CSS backstop that hides `.plot-tooltip` when the root carries our class. */
function ensureHideTipStyle() {
  if (typeof document === "undefined" || document.getElementById(HIDE_TIP_STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = HIDE_TIP_STYLE_ID;
  st.textContent = "html." + HIDE_TIP_CLASS + " .plot-tooltip{display:none !important;}";
  (document.head || document.documentElement).appendChild(st);
}

/** Apply or clear the suppression (signal + legacy backstops). @param {boolean} hidden Hide it. */
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
 * Hide or restore the base plot tooltip. Idempotent - only acts on a state transition. One lens is
 * active at a time, so a simple shared flag is enough.
 * @param {boolean} hidden True to hide the base plot tooltip, false to restore it.
 */
export function setBasePlotTooltipHidden(hidden) {
  if (hidden === _hidden) return;
  _hidden = hidden;
  apply(hidden);
}
