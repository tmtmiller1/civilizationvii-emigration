// network-subview.mjs
//
// The merged "Network" tab: the Dots view + a toggleable green/red migrant-flow ARROW overlay
// (emigration-network-flow-arrows.js), which replaced the separate Flows sub-view. Covers the
// pure segment builder — one arrow per civ→civ flow, and that it honours the Dots view's
// origin-isolate / focus-destination / scope filters — plus that the drawer never throws.

import assert from "node:assert/strict";

const { buildFlowSegments, drawFlowArrows } =
  await import("/emigration/ui/emigration-network-flow-arrows.js");

// Two civ centres far enough apart for an arrow to be drawn (trimmed drops too-close pairs).
const centers = [
  { id: 1, x: 0, y: 0, clusterR: 8, cities: [{ name: "Aa", sx: 0, sy: 0, subR: 4 }, { name: "Ab", sx: 40, sy: 0, subR: 4 }] },
  { id: 2, x: 200, y: 0, clusterR: 8, cities: [] }
];
const byId = new Map([[1, 0], [2, 1]]);
const frames = [{
  network: { edges: [{ from: 1, to: 2, people: 100, fromName: "A", toName: "B" }] },
  intra: [{ civId: 1, fromCity: "Aa", toCity: "Ab", people: 20 }]
}];

/** A holder with a default (all-visible, nothing isolated) state, overridable per case. */
function holder(over) {
  const state = Object.assign(
    { frameIdx: 0, expanded: new Set(), origin: null, focusDest: null,
      show: { resident: true, internal: true, immigrant: true } },
    over || {});
  return { centers, byId, frames, state };
}

// 1. A cross-civ edge yields exactly one civ→civ arrow (collapsed, since nothing is expanded).
let segs = buildFlowSegments(holder());
assert.equal(segs.length, 1, "one civ→civ arrow for the single cross-civ edge");
assert.equal(segs[0].people, 100, "the arrow carries the edge's people");

// 2. Isolating a civ filters the arrows: origin must match the edge's source.
assert.equal(buildFlowSegments(holder({ origin: 2 })).length, 0,
  "isolating the DESTINATION civ hides a flow that originates elsewhere");
assert.equal(buildFlowSegments(holder({ origin: 1 })).length, 1,
  "isolating the SOURCE civ keeps its outgoing flow");

// 3. focus-destination filter.
assert.equal(buildFlowSegments(holder({ focusDest: 1 })).length, 0, "focusing a non-destination hides the flow");
assert.equal(buildFlowSegments(holder({ focusDest: 2 })).length, 1, "focusing the real destination keeps it");

// 4. Scope filters: hiding immigrants drops cross-civ arrows; hiding internal drops intra arrows.
assert.equal(buildFlowSegments(holder({ show: { resident: true, internal: true, immigrant: false } })).length, 0,
  "hiding immigrants hides cross-civ arrows");

// 5. Intra (city→city) arrows appear only for an EXPANDED civ.
assert.equal(buildFlowSegments(holder()).length, 1, "collapsed civ → no intra arrow (just the civ→civ one)");
const expanded = buildFlowSegments(holder({ expanded: new Set([1, 2]) }));
assert.ok(expanded.length >= 2, "expanding routes to cities and adds the intra city→city arrow (got " + expanded.length + ")");
assert.ok(expanded.some((s) => s.people === 20), "the expanded view includes the city→city (people=20) arrow");
const noInternal = buildFlowSegments(holder({ expanded: new Set([1, 2]),
  show: { resident: true, internal: false, immigrant: true } }));
assert.ok(!noInternal.some((s) => s.people === 20), "hiding internal drops the city→city (people=20) arrow");

// 6. The drawer never throws with a minimal canvas context.
const noop = () => {};
const ctx = new Proxy({}, { get: (_t, k) =>
  (k === "createLinearGradient" ? () => ({ addColorStop: noop }) : noop) });
assert.doesNotThrow(() => drawFlowArrows(ctx, buildFlowSegments(holder())), "drawFlowArrows is safe");

console.log("network-subview harness passed");
