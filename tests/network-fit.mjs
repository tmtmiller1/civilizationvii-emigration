// network-fit.mjs
//
// The diagram's viewport-fit sizing (emigration-network-fit.js). The bug this guards: the 2:1 stage
// was sized against the full viewport, but the migration diagram lives inside the dashboard's
// `.emig-tabbody` scroll box (max-height:74vh). On a near-fullscreen modal the viewport bottom sits
// well below that box, so the stage was over-budgeted and the lowest civ clusters spilled past the
// panel and were clipped. The fit must measure the bounding scroll/clip box, not the viewport.

import assert from "node:assert/strict";

// ── Minimal DOM: a stage inside a clipped tab-body inside the page ────────────
// Each node carries an explicit getBoundingClientRect; the tab-body is the overflow:auto box that
// actually bounds the stage. innerHeight is the (taller) viewport.

const VIEWPORT_H = 1000;

function makeNode(rect, style, parent) {
  /** @type {*} */
  const node = {
    nodeType: 1,
    parentElement: parent || null,
    style: style || {},
    children: [],
    offsetHeight: rect ? rect.height : 0,
    getBoundingClientRect: () => rect
  };
  if (parent) parent.children.push(node);
  return node;
}

// Page root → tabBody (overflow:auto, clipped to 740px tall) → wrap → [stage, legend].
const root = makeNode({ top: 0, bottom: VIEWPORT_H, height: VIEWPORT_H, width: 1600 }, { overflowY: "visible" }, null);
const body = makeNode({ top: 0, bottom: VIEWPORT_H, height: VIEWPORT_H, width: 1600 }, { overflowY: "visible" }, root);
// The tab body starts 120px down the page and is clipped to 740px tall (its real bottom = 860),
// even though the viewport extends to 1000.
const tabBody = makeNode(
  { top: 120, bottom: 860, height: 740, width: 1600 },
  { overflowY: "auto", paddingBottom: "20px" },
  body
);
const wrap = makeNode({ top: 180, bottom: 860, height: 680, width: 1200 }, { overflowY: "visible" }, tabBody);
// Stage sits below ~60px of controls; legend/timeline below it total 160px.
const stage = makeNode({ top: 240, bottom: 600, height: 360, width: 1100 }, {}, wrap);
const legend = makeNode({ top: 600, bottom: 760, height: 160, width: 1200 }, {}, wrap);
wrap.children = [stage, legend];

const installed = {
  innerHeight: VIEWPORT_H,
  getComputedStyle: (/** @type {*} */ n) => n.style,
  document: {
    body,
    documentElement: root,
    contains: () => true
  }
};

const prior = {};
for (const k of Object.keys(installed)) {
  prior[k] = /** @type {*} */ (globalThis)[k];
  /** @type {*} */ (globalThis)[k] = installed[k];
}

const { __test, installStageFit } = await import("/emigration/ui/emigration-network-fit.js");
const { boundingBottom, fitStageToViewport } = __test;

// ── boundingBottom stops at the clipped tab-body, not the viewport ────────────
{
  const bottom = boundingBottom(stage);
  // The tab body's bottom (860) minus its 20px bottom padding = 840 — NOT the 1000 viewport bottom.
  assert.equal(bottom, 840, "bounding bottom is the clipped tab-body, less its padding");
  assert.ok(bottom < VIEWPORT_H, "the bound is above the viewport bottom (no over-budget)");
}

// ── The fitted stage stays inside the tab-body (no clipped clusters) ──────────
{
  fitStageToViewport(wrap, stage);
  const px = parseInt(stage.style.maxWidth, 10);
  // budget = 840 (bound) - 240 (stage top) - 160 (legend) - 14 (pad) = 426 → maxWidth = 852.
  assert.equal(px, 852, "stage max-width is twice the in-box height budget");
  // The resulting stage height (half its width) must fit between the stage top and the box bottom.
  const stageHeight = px / 2;
  assert.ok(240 + stageHeight <= 840, "the 2:1 stage fits above the tab-body bottom");
}

// ── A no-op re-fit doesn't rewrite the style (avoids reflow jump on resize) ───
{
  stage.style.maxWidth = "852px";
  let writes = 0;
  let stored = "852px";
  Object.defineProperty(stage.style, "maxWidth", {
    get: () => stored,
    set: (v) => { writes++; stored = v; },
    configurable: true
  });
  fitStageToViewport(wrap, stage);
  assert.equal(writes, 0, "an unchanged max-width is not re-written");
}

// ── Fallback: no clipping ancestor → the viewport bottom is used ──────────────
{
  const loneWrap = makeNode({ top: 100, bottom: 900, height: 800, width: 1200 }, { overflowY: "visible" }, body);
  const loneStage = makeNode({ top: 160, bottom: 520, height: 360, width: 1100 }, {}, loneWrap);
  const loneLegend = makeNode({ top: 520, bottom: 620, height: 100, width: 1200 }, {}, loneWrap);
  loneWrap.children = [loneStage, loneLegend];
  const bottom = boundingBottom(loneStage);
  assert.equal(bottom, VIEWPORT_H, "with no clip box, the viewport bottom is the bound");
}

// ── Standalone window: its tab-body fills the 94vh frame (max-height:none), so the diagram grows
// to fill the window instead of stopping at the embedded page's 74vh cap (the empty-band regression).
{
  // The dedicated window's tab-body (overflow:auto, max-height:none) reaches near the viewport bottom.
  const tallBody = makeNode(
    { top: 120, bottom: 980, height: 860, width: 1600 },
    { overflowY: "auto", paddingBottom: "0px" },
    body
  );
  const tallWrap = makeNode({ top: 180, bottom: 980, height: 800, width: 1500 }, { overflowY: "visible" }, tallBody);
  const tallStage = makeNode({ top: 240, bottom: 600, height: 360, width: 1400 }, {}, tallWrap);
  const tallLegend = makeNode({ top: 600, bottom: 760, height: 160, width: 1500 }, {}, tallWrap);
  tallWrap.children = [tallStage, tallLegend];
  const cappedPx = 852; // what the embedded 74vh tab-body produced above
  fitStageToViewport(tallWrap, tallStage);
  const px = parseInt(tallStage.style.maxWidth, 10);
  // budget = 980 (bound) - 240 (stage top) - 160 (legend) - 14 (pad) = 566 → maxWidth = 1132.
  assert.equal(px, 1132, "the window-filling tab-body grows the stage to use the taller frame");
  assert.ok(px > cappedPx, "the standalone window no longer leaves an empty band below the diagram");
  assert.ok(240 + px / 2 <= 980, "the taller 2:1 stage still fits above the window's bottom");
}

// ── installStageFit schedules SETTLE-time re-fits, not just one rAF-time pass ──
// The standalone window's 94vh frame is still growing in when the first view (Dots) renders, so a
// single rAF-time fit measures a not-yet-settled box. Re-fitting after the open animation settles is
// what makes the Dots and Flow views size identically (the regression: Dots oversized/clipped while
// Flow stayed small with an empty band). Guard that more than one fit pass is scheduled.
{
  /** @type {*[]} */
  const rafCalls = [];
  /** @type {number[]} */
  const timeoutDelays = [];
  const g = /** @type {*} */ (globalThis);
  const priorRaf = g.requestAnimationFrame;
  const priorTimeout = g.setTimeout;
  const priorAdd = g.addEventListener;
  g.requestAnimationFrame = (/** @type {*} */ cb) => { rafCalls.push(cb); return rafCalls.length; };
  g.setTimeout = (/** @type {*} */ _cb, /** @type {number} */ ms) => { timeoutDelays.push(ms); return timeoutDelays.length; };
  g.addEventListener = () => {};
  installStageFit(wrap, stage);
  assert.ok(rafCalls.length >= 1, "installStageFit schedules a rAF-time fit");
  assert.ok(timeoutDelays.length >= 2, "installStageFit also schedules settle-time re-fits");
  assert.ok(timeoutDelays.every((ms) => ms > 0), "the settle-time re-fits use positive delays");
  g.requestAnimationFrame = priorRaf;
  g.setTimeout = priorTimeout;
  g.addEventListener = priorAdd;
}

for (const k of Object.keys(installed)) {
  if (prior[k] === undefined) delete (/** @type {*} */ (globalThis)[k]);
  else /** @type {*} */ (globalThis)[k] = prior[k];
}

console.log("network-fit.mjs: all assertions passed");
