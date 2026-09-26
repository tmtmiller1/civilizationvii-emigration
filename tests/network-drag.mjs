// network-drag.mjs
//
// Dragging on the network diagram, driven through the REAL pointer handlers (wireEvents) and the REAL
// painter, so what's asserted is what the canvas would show.
//
// The bugs/gaps these guard (2026-09-17):
//
//  1. Dragging a civ circle moved the circle and its dots but NOT the migrant-flow arrows. The arrow
//     overlay is memoized, and its cache key covered the frame + filters only — no geometry — so every
//     arrow stayed pinned at the coordinates it was first built at. The force sim's initial settle had
//     the same problem.
//  2. City sub-circles couldn't be grabbed at all, so there was no way to pull a settlement clear of
//     the pile to read its internal flows. Now a city drag re-aims its offset and re-grows the civ
//     circle around it (civReach), and its dots + arrows travel with it.

import assert from "node:assert/strict";

const { buildChronoDots } = await import("/emigration/ui/emigration-network-dots.js");
const { paint, dotInCity } = await import("/emigration/ui/emigration-network-paint.js");
const { wireEvents } = await import("/emigration/ui/emigration-network-interact.js");
const { buildFlowSegments } = await import("/emigration/ui/emigration-network-flow-arrows.js");

const WX = 1120;
const WY = 560;
const noop = () => {};

/** A canvas ctx stub recording arc centers (discs + dots) and quadratic curves (flow arrows). */
function recorder() {
  const arcs = [];
  const curves = [];
  const ctx = new Proxy({}, {
    get: (_t, k) => {
      if (k === "createLinearGradient") return () => ({ addColorStop: noop });
      if (k === "measureText") return () => ({ width: 10 });
      if (k === "arc") return (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ r) => arcs.push([x, y, r]);
      if (k === "quadraticCurveTo") return (/** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ x1, /** @type {number} */ y1) => curves.push([cx, cy, x1, y1]);
      return noop;
    },
    set: () => true
  });
  return { ctx, arcs, curves };
}

/** A canvas element stub that hands back the listeners wireEvents registers. */
function fakeCanvas() {
  /** @type {Record<string, Function>} */
  const on = {};
  return {
    style: {},
    addEventListener: (/** @type {string} */ t, /** @type {Function} */ f) => {
      on[t] = f;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: WX, height: WY }),
    fire: (/** @type {string} */ t, /** @type {number} */ x, /** @type {number} */ y) => {
      if (on[t]) on[t]({ clientX: x, clientY: y });
    }
  };
}

/** A scene with two civs (3 cities each), one cross-civ flow and one internal move. */
function makeScene() {
  const cities = () => [
    { name: "C0", town: false, pop: 100, pts: 10 },
    { name: "C1", town: false, pop: 60, pts: 6 },
    { name: "C2", town: true, pop: 30, pts: 3 }
  ];
  const frames = [{
    turn: 1, age: "AGE_ANTIQUITY", year: "",
    network: {
      nodes: [{ id: 1, name: "Alpha" }, { id: 2, name: "Beta" }],
      edges: [{ from: 1, to: 2, people: 5000, fromCity: "C0", toCity: "C0", byCause: { other: 5000 } }],
      cityEdges: [], maxEdge: 0, maxNode: 0
    },
    pops: { 1: { cities: cities() }, 2: { cities: cities() } },
    intra: [{ civId: 1, fromCity: "C0", toCity: "C1", people: 2000, points: 2 }]
  }];
  const centers = [
    { id: 1, name: "Alpha", x: 300, y: 280, fillColor: "#5aa9e6", color: "#5aa9e6" },
    { id: 2, name: "Beta", x: 800, y: 280, fillColor: "#f4a259", color: "#f4a259" }
  ];
  const byId = new Map([[1, 0], [2, 1]]);
  const dots = buildChronoDots(frames, centers, byId, new Map([[1, 0], [2, 1]]), 50);
  const state = {
    causes: new Set(), origin: null, focusDest: null, scope: null,
    show: { resident: true, internal: true, immigrant: true }, showFlows: true,
    lens: "origin", frameIdx: 0, expanded: new Set([1, 2])
  };
  return { WX, WY, centers, dots, state, byId, events: [], civMode: false, frames };
}

/** Paint the scene and return the recorded arcs + curves. */
function snapshot(scene) {
  const rec = recorder();
  paint(rec.ctx, scene);
  return rec;
}

/** Drive a press-drag-release through the real handlers. */
function drag(canvas, from, to) {
  canvas.fire("mousedown", from.x, from.y);
  canvas.fire("mousemove", to.x, to.y);
  canvas.fire("mouseup", to.x, to.y);
}

/**
 * A point on a civ's grab ring: inside its hit radius (clusterR + 14) but clear of every city disc.
 * Cities take priority on press, so this ring — plus the gaps between city discs — is how the whole
 * group is dragged. Asserting it exists keeps a future layout change from sealing the civ off.
 */
function civGrabPoint(civ) {
  const p = { x: civ.x, y: civ.y - (civ.clusterR + 8) };
  for (const ct of civ.cities || []) {
    const d = Math.hypot(civ.x + (ct.sx || 0) - p.x, civ.y + (ct.sy || 0) - p.y);
    assert.ok(d > (ct.subR || 0) + 5, "the civ grab ring must not be covered by a city disc");
  }
  assert.ok(Math.hypot(p.x - civ.x, p.y - civ.y) <= (civ.clusterR || 6) + 14,
    "the civ grab ring must be inside the civ hit radius");
  return p;
}

function wire(scene) {
  const canvas = fakeCanvas();
  const holder = { scene, dirty: false };
  wireEvents(/** @type {*} */ (canvas), holder, scene.state, { hide: noop, show: noop, move: noop, setHTML: noop });
  return canvas;
}

function testFlowArrowsFollowACivDrag() {
  const scene = makeScene();
  const canvas = wire(scene);
  const before = snapshot(scene);
  assert.ok(before.curves.length > 0, "the scene should draw at least one flow arrow to begin with");

  const c = scene.centers[0];
  const grab = civGrabPoint(c);
  drag(canvas, grab, { x: grab.x + 120, y: grab.y + 60 });
  assert.ok(Math.abs(scene.centers[0].x - 300) > 100, "the civ should have moved");

  const after = snapshot(scene);
  assert.equal(after.curves.length, before.curves.length, "the same arrows should still be drawn");
  const moved = after.curves.filter((cur, i) => cur.join() !== before.curves[i].join()).length;
  assert.equal(moved, before.curves.length,
    `every arrow should follow the drag; ${before.curves.length - moved} stayed behind`);
}

function testCityDragMovesItsDotsAndGrowsTheCivCircle() {
  const scene = makeScene();
  const canvas = wire(scene);
  const civ = scene.centers[0];
  const city = civ.cities[1];
  const r0 = civ.clusterR;
  const from = { x: civ.x + city.sx, y: civ.y + city.sy };
  const to = { x: from.x, y: from.y - 170 }; // haul it clear of the cluster

  drag(canvas, from, to);

  assert.ok(Math.abs((civ.y + city.sy) - to.y) < 1, "the city should sit under the cursor it was dropped at");
  assert.ok(civ.clusterR > r0 + 100, `the civ circle should expand around it (${r0} -> ${civ.clusterR})`);
  assert.equal(civ.x, 300, "dragging a city must not move its civ center");

  // Its dots came along: the painter must draw dot-sized arcs near the city's NEW sub-center.
  const cx = civ.x + city.sx;
  const cy = civ.y + city.sy;
  const near = snapshot(scene).arcs
    .filter((/** @type {number[]} */ a) => a[2] <= 2) // dots are r<=1.5; discs are far bigger
    .filter((/** @type {number[]} */ a) => Math.hypot(a[0] - cx, a[1] - cy) <= (city.subR || 0) + 2);
  assert.ok(near.length > 0, "the dragged city's dots should be drawn around its new position");
}

function testDraggingACivCarriesItsCitiesAlong() {
  const scene = makeScene();
  const canvas = wire(scene);
  const civ = scene.centers[0];
  // Press on the civ's grab ring, clear of every city disc, so this is a CIV drag.
  const gap = civGrabPoint(civ);
  const offsets = civ.cities.map((/** @type {*} */ ct) => [ct.sx, ct.sy]);
  drag(canvas, gap, { x: gap.x + 60, y: gap.y });

  assert.ok(Math.abs(civ.x - 360) < 1, "the civ should have moved with the cursor");
  assert.deepEqual(civ.cities.map((/** @type {*} */ ct) => [ct.sx, ct.sy]), offsets,
    "a civ drag must leave the city offsets untouched (they ride along with the center)");
}

function testClickingACivRingStillIsolates() {
  const scene = makeScene();
  const canvas = wire(scene);
  const at = civGrabPoint(scene.centers[0]);
  drag(canvas, at, at); // press + release, no movement
  assert.equal(scene.state.focusDest, 1, "clicking a civ's ring should isolate the civ");
  drag(canvas, at, at);
  assert.equal(scene.state.focusDest, null, "clicking it again should clear the isolate");
}

/** Arrows as "from>to" civ-city labels, recovered by matching segment endpoints to city centers. */
function arrowLabels(scene) {
  const pts = [];
  for (const c of scene.centers) {
    for (const ct of c.cities) {
      pts.push({ label: c.name + "/" + ct.name, x: c.x + ct.sx, y: c.y + ct.sy, r: (ct.subR || 4) + 3 });
    }
  }
  // Nearest RELATIVE to each disc's trim radius: a tight arrow's end can sit inside the neighboring
  // disc too, but always at a smaller fraction of its own city's radius.
  const rel = (/** @type {*} */ p, /** @type {number} */ x, /** @type {number} */ y) => Math.hypot(p.x - x, p.y - y) / p.r;
  const near = (/** @type {number} */ x, /** @type {number} */ y) =>
    pts.reduce((b, p) => (rel(p, x, y) < rel(b, x, y) ? p : b)).label;
  return buildFlowSegments({ state: scene.state, centers: scene.centers, byId: scene.byId, frames: scene.frames })
    .map((/** @type {*} */ s) => near(s.x0, s.y0) + ">" + near(s.x1, s.y1)).sort();
}

function testClickingACitySelectsJustItsFlows() {
  const scene = makeScene();
  scene.state.showFlows = false; // selecting a city must show its arrows even with the overlay off
  const canvas = wire(scene);
  const civ = scene.centers[0];
  const at = (/** @type {number} */ k) => ({ x: civ.x + civ.cities[k].sx, y: civ.y + civ.cities[k].sy });

  assert.equal(snapshot(scene).curves.length, 0, "no arrows before anything is selected");
  drag(canvas, at(1), at(1));
  assert.deepEqual(scene.state.focusCity, { civId: 1, idx: 1, name: "C1" }, "clicking a city should select it");
  assert.equal(scene.state.focusDest, null, "selecting a city is not a civ isolate");
  // C1 only receives the internal C0 -> C1 move; the cross-civ Alpha/C0 -> Beta/C0 flow is not its own.
  assert.deepEqual(arrowLabels(scene), ["Alpha/C0>Alpha/C1"], "only the selected city's flows");
  assert.equal(snapshot(scene).curves.length, 1, "the painter should draw exactly that one arrow");

  drag(canvas, at(0), at(0)); // C0: the source of both the internal move and the emigration
  assert.deepEqual(arrowLabels(scene), ["Alpha/C0>Alpha/C1", "Alpha/C0>Beta/C0"].sort(),
    "selecting another city should swap to its flows, outbound as well as inbound");

  drag(canvas, at(0), at(0));
  assert.equal(scene.state.focusCity, null, "clicking the selected city again should clear it");
  drag(canvas, at(0), at(0));
  drag(canvas, { x: 20, y: 20 }, { x: 20, y: 20 }); // empty canvas
  assert.equal(scene.state.focusCity, null, "clicking empty space should clear the selection");
}

function testSelectedCityKeepsItsEmigrantsLit() {
  // The dots of Alpha/C0's story: its residents, plus the people who left it (internal movers now in
  // C1, emigrants now in Beta). Everything else dims.
  const scene = makeScene();
  const canvas = wire(scene);
  const civ = scene.centers[0];
  const at = { x: civ.x + civ.cities[0].sx, y: civ.y + civ.cities[0].sy };
  drag(canvas, at, at);
  const lit = scene.dots.filter((/** @type {*} */ d) => dotInCity(d, scene.state.focusCity));
  const scopes = new Set(lit.map((/** @type {*} */ d) => d.scope + "@" + d.destId + "/" + d.cityIdx));
  assert.ok(scopes.has("resident@1/0"), "C0's own residents stay lit");
  assert.ok([...scopes].some((k) => k.startsWith("internal@1/") && !k.endsWith("/0")),
    "people who moved from C0 to a sibling city stay lit");
  assert.ok([...scopes].some((k) => k.startsWith("immigrant@2/")), "people who emigrated from C0 to Beta stay lit");
  assert.ok(!scopes.has("resident@2/0") && !scopes.has("resident@1/1"), "other cities' residents dim");
}

function testDraggingACityOutOpensUpItsInternalFlow() {
  // The point of the feature: C0 -> C1 is an internal move between two touching discs, so its arrow is
  // a cramped `tight` one. Hauling C1 clear should turn it into a full-length arrow.
  const scene = makeScene();
  const canvas = wire(scene);
  const civ = scene.centers[0];
  const city = civ.cities[1];

  const holder = { state: scene.state, centers: scene.centers, byId: scene.byId, frames: scene.frames };
  const intraBefore = buildFlowSegments(holder).filter((/** @type {*} */ s) => s.people === 2000);
  assert.equal(intraBefore.length, 1, "the internal move should draw exactly one arrow");
  assert.ok(intraBefore[0].tight, "packed side by side, its arrow is the cramped kind");
  const lenBefore = Math.hypot(intraBefore[0].x1 - intraBefore[0].x0, intraBefore[0].y1 - intraBefore[0].y0);

  const from = { x: civ.x + city.sx, y: civ.y + city.sy };
  drag(canvas, from, { x: from.x, y: from.y - 170 });

  const intraAfter = buildFlowSegments(holder).filter((/** @type {*} */ s) => s.people === 2000);
  assert.equal(intraAfter.length, 1, "the internal arrow should survive the drag");
  const lenAfter = Math.hypot(intraAfter[0].x1 - intraAfter[0].x0, intraAfter[0].y1 - intraAfter[0].y0);
  assert.ok(!intraAfter[0].tight, "pulled clear, the arrow should get its full trim back");
  assert.ok(lenAfter > lenBefore + 50,
    `the arrow should be far longer once the city is clear (${lenBefore.toFixed(1)} -> ${lenAfter.toFixed(1)})`);
}

testFlowArrowsFollowACivDrag();
testDraggingACityOutOpensUpItsInternalFlow();
testCityDragMovesItsDotsAndGrowsTheCivCircle();
testDraggingACivCarriesItsCitiesAlong();
testClickingACivRingStillIsolates();
testClickingACitySelectsJustItsFlows();
testSelectedCityKeepsItsEmigrantsLit();
console.log("network-drag: ok");
