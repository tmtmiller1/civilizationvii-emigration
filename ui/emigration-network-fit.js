// emigration-network-fit.js
//
// Viewport-fit sizing for the network / flow diagram's 2:1 stage. The stage holds its 2:1 aspect
// (height = width / 2) via padding-bottom, so its height is driven by setting maxWidth = 2 × budget;
// `width:100%` still caps it to the panel width, so on a narrow panel it stays width-bound. This lets
// the diagram fill a tall, high-resolution window instead of leaving an empty band beneath it, while
// still shrinking to fit small resolutions. Shared by the dot (network) and flow views, both of which
// build their chrome through emigration-network-viz.js.

const STAGE_BOTTOM_PAD = 14; // px kept clear below the diagram + its legend/timeline
const STAGE_MIN_W = 360;     // px floor so a very short viewport still shows a usable chart

/** @returns {number} Viewport height in CSS px (0 if unavailable). */
function viewportHeight() {
  const g = /** @type {*} */ (globalThis);
  const doc = g.document && g.document.documentElement;
  return g.innerHeight || (doc && doc.clientHeight) || 0;
}

/**
 * Total px height of the wrapper children that sit BELOW the stage (legend, timeline, caption).
 * @param {HTMLElement} wrap The viz wrapper.
 * @param {HTMLElement} stage The stage.
 * @returns {number} The summed height in px.
 */
function heightBelowStage(wrap, stage) {
  let below = 0;
  let afterStage = false;
  for (const child of wrap.children) {
    if (child === stage) afterStage = true;
    else if (afterStage) below += /** @type {*} */ (child).offsetHeight || 0;
  }
  return below;
}

/**
 * Size the stage to fill the space between its top and the viewport bottom (less the legend/timeline
 * below it). Idempotent (the stage top is fixed by the chrome above it). Best-effort: on failure the
 * CSS max-width:100vh cap remains.
 * @param {HTMLElement} wrap The viz wrapper.
 * @param {HTMLElement} stage The 2:1 stage.
 */
function fitStageToViewport(wrap, stage) {
  try {
    if (!wrap || !stage || !document.contains(stage)) return;
    const vh = viewportHeight();
    const rect = stage.getBoundingClientRect();
    if (!vh || !rect || !rect.width) return;
    const budget = vh - rect.top - heightBelowStage(wrap, stage) - STAGE_BOTTOM_PAD;
    stage.style.maxWidth = Math.max(STAGE_MIN_W, Math.round(budget * 2)) + "px";
  } catch (_) {
    /* best-effort; the CSS vh cap stays as the fallback */
  }
}

// The single live stage to keep fitted on resize, and whether the one shared resize listener is bound.
// Only one network/flow diagram is on screen at a time, and the view is torn down + rebuilt on every
// tab switch / Dots⟷Flow toggle / Units rebuild. A per-call listener would accumulate on globalThis
// (it can only self-remove when a resize later fires), leaking handlers + detached DOM for the whole
// session and causing a reflow burst on the next resize. Instead we bind ONE listener for the module's
// lifetime and just repoint it at the newest stage; a superseded stage is simply forgotten.
/** @type {{wrap:HTMLElement, stage:HTMLElement}|null} */
let _activeFit = null;
let _resizeBound = false;

/** Re-fit the current live stage on a viewport resize; drop it once it has detached. */
function onViewportResize() {
  if (!_activeFit) return;
  if (!document.contains(_activeFit.stage)) { _activeFit = null; return; }
  fitStageToViewport(_activeFit.wrap, _activeFit.stage);
}

/**
 * Fit the stage once layout settles (double rAF so the legend/timeline below it are measurable), and
 * keep it fitted across viewport resizes. Binds exactly ONE shared resize listener for the module's
 * lifetime (no per-render accumulation); each call just makes `stage` the one tracked stage.
 * @param {HTMLElement} wrap The viz wrapper.
 * @param {HTMLElement} stage The 2:1 stage holding the canvas.
 */
export function installStageFit(wrap, stage) {
  _activeFit = { wrap, stage };
  const g = /** @type {*} */ (globalThis);
  // Only fit if this stage is still the tracked one when the rAF fires (a newer render may supersede it).
  const run = () => { if (_activeFit && _activeFit.stage === stage) fitStageToViewport(wrap, stage); };
  if (g.requestAnimationFrame) g.requestAnimationFrame(() => g.requestAnimationFrame(run));
  else run();
  if (!_resizeBound && typeof g.addEventListener === "function") {
    g.addEventListener("resize", onViewportResize);
    _resizeBound = true;
  }
}
