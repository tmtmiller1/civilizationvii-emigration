// emigration-network-fit.js
//
// Viewport-fit sizing for the network / flow diagram's 2:1 stage. The stage holds its aspect via
// padding-bottom, so its height is driven by setting maxWidth = 2 × budget (`width:100%` still caps
// it on a narrow panel). Shared by the dot (network) and flow views.

const STAGE_BOTTOM_PAD = 14; // px kept clear below the diagram + its legend/timeline
const STAGE_MIN_W = 360;     // px floor so a very short viewport still shows a usable chart


/** @returns {number} Viewport height in CSS px (0 if unavailable). */
function viewportHeight() {
  const g = /** @type {*} */ (globalThis);
  const doc = g.document && g.document.documentElement;
  return g.innerHeight || (doc && doc.clientHeight) || 0;
}

/** @returns {((el:Element)=>*)|null} The environment's getComputedStyle, or null. */
function styleReader() {
  const g = /** @type {*} */ (globalThis);
  if (typeof g.getComputedStyle === "function") return g.getComputedStyle;
  const view = g.document && g.document.defaultView;
  return view && typeof view.getComputedStyle === "function" ? view.getComputedStyle.bind(view) : null;
}

/**
 * Whether a computed overflow-y value makes an element clip / scroll its content (so it bounds a
 * child's visible height).
 * @param {string} overflowY The computed `overflow-y`. @returns {boolean} True when it clips.
 */
function clipsVertically(overflowY) {
  return overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden";
}

/**
 * The nearest ancestor of `stage` (excluding body/root) that clips its content vertically, or null.
 * @param {*} stage The 2:1 stage. @param {((el:Element)=>*)|null} getStyle Style reader.
 * @returns {{node:*, style:*}|null} The clip box and its computed style, or null.
 */
function nearestClipBox(stage, getStyle) {
  const body = document.body;
  const root = document.documentElement;
  let node = /** @type {*} */ (stage.parentElement);
  while (node && node.nodeType === 1 && node !== body && node !== root) {
    const st = getStyle ? getStyle(node) : null;
    if (st && clipsVertically(st.overflowY)) return { node, style: st };
    node = node.parentElement;
  }
  return null;
}

/**
 * The bottom edge (viewport CSS px) that actually BOUNDS the stage: the nearest scrollable / clipped
 * ancestor (the dashboard's `.emig-tabbody` or the screen body), less its bottom padding, clamped to
 * the viewport. Falls back to the viewport bottom when no bounding ancestor is found.
 * @param {HTMLElement} stage The 2:1 stage. @returns {number} The bounding bottom in CSS px.
 */
function boundingBottom(stage) {
  const vh = viewportHeight();
  let bottom = vh;
  try {
    const box = nearestClipBox(stage, styleReader());
    if (box) {
      const rect = box.node.getBoundingClientRect();
      const padB = parseFloat(box.style.paddingBottom) || 0;
      if (rect && rect.height) bottom = Math.min(bottom, rect.bottom - padB);
    }
  } catch (_) {
    /* best-effort; fall back to the viewport bottom */
  }
  return vh ? Math.min(bottom, vh) : bottom;
}

/**
 * Total px height of the wrapper children that sit BELOW the stage (legend, timeline, caption).
 * @param {HTMLElement} wrap The viz wrapper.
 * @param {HTMLElement} stage
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
    const bottom = boundingBottom(stage);
    const rect = stage.getBoundingClientRect();
    if (!bottom || !rect || !rect.width) return;
    const budget = bottom - rect.top - heightBelowStage(wrap, stage) - STAGE_BOTTOM_PAD;
    const next = Math.max(STAGE_MIN_W, Math.round(budget * 2)) + "px";
    // Skip a no-op write: re-assigning the same maxWidth still invalidates layout, and on a resize
    // burst that needless reflow is what makes the diagram visibly jump.
    if (stage.style.maxWidth !== next) stage.style.maxWidth = next;
  } catch (_) {
    /* best-effort; the CSS vh cap stays as the fallback */
  }
}

// The single live stage to keep fitted on resize, and whether the one shared resize listener is bound.
// Only one diagram is on screen at a time and the view is rebuilt on every tab switch, so ONE listener
// for the module's lifetime is repointed at the newest stage rather than accumulating per render.
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
 * Schedule the fit to run once layout settles, then again after the standalone window's open
 * animation + flex layout have finished resolving, since a single rAF-time fit measures the tabbody
 * while the frame is still growing in. The no-op write guard makes the repeat passes free.
 * @param {*} g The global (timer/rAF host). @param {()=>void} run The guarded fit call.
 */
function scheduleFit(g, run) {
  if (g.requestAnimationFrame) g.requestAnimationFrame(() => g.requestAnimationFrame(run));
  else run();
  if (typeof g.setTimeout === "function") {
    g.setTimeout(run, 120); // after the open animation's first frames
    g.setTimeout(run, 360); // after the flex frame has fully settled
  }
}

/**
 * Fit the stage once layout settles and again after the window finishes resolving, and keep it fitted
 * across viewport resizes via the one shared resize listener (each call makes `stage` the tracked one).
 * @param {HTMLElement} wrap The viz wrapper.
 * @param {HTMLElement} stage The 2:1 stage holding the canvas.
 */
export function installStageFit(wrap, stage) {
  _activeFit = { wrap, stage };
  const g = /** @type {*} */ (globalThis);
  // Only fit if this stage is still the tracked one when the callback fires (a newer render may supersede it).
  const run = () => { if (_activeFit && _activeFit.stage === stage) fitStageToViewport(wrap, stage); };
  scheduleFit(g, run);
  if (!_resizeBound && typeof g.addEventListener === "function") {
    g.addEventListener("resize", onViewportResize);
    _resizeBound = true;
  }
}

// Test hook.
export const __test = { fitStageToViewport, boundingBottom, heightBelowStage };
