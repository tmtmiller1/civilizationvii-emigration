// network-flow-arrows.mjs
//
// The "Migrant flows" arrow overlay (emigration-network-flow-arrows), driven through the SHIPPED
// layout (emigration-network-dots.buildChronoDots) so the geometry under test is the one the canvas
// actually paints.
//
// The bug these guard (2026-09-17, found in a live game: internal migrants had dots but no arrows):
// `trimmed()` dropped any flow whose endpoints were closer than `a.r + b.r + 6`. The city packing
// (packCityDiscs) seats each disc exactly CITY_GAP (6) clear of the disc that constrains it, and the
// endpoints here are struck at `subR + 3` apiece — so a tangent pair fell exactly 6px short of the
// threshold AT EVERY SCALE. Consequences, all silent:
//
//  1. A two-city civ drew NO internal arrow, ever.
//  2. Packing anchors the biggest city at the origin with the next discs tangent to it, so the
//     LARGEST city's internal flows — the most-travelled corridors — were the likeliest to vanish.
//
// The trim now shrinks to fit instead of dropping, and keeps the full trim wherever the old guard
// would have passed (so long-haul arrows are unchanged).

import assert from "node:assert/strict";

const { buildChronoDots } = await import("/emigration/ui/emigration-network-dots.js");
const { buildFlowSegments } = await import("/emigration/ui/emigration-network-flow-arrows.js");

const UNIT = 1; // one dot per person keeps the arithmetic readable

/**
 * Lay out one civ with the given city populations and ask for the flow segments of a frame carrying
 * an internal move for EVERY ordered city pair.
 * @param {number[]} pops Population per city.
 * @returns {{segs:*[], pairs:number, center:*}} Segments, the pair count fed in, the civ centre.
 */
function internalSegments(pops) {
  const cities = pops.map((pop, i) => ({ name: "C" + i, town: false, pop, pts: pop }));
  /** @type {*[]} */
  const intra = [];
  for (let a = 0; a < pops.length; a++) {
    for (let b = 0; b < pops.length; b++) {
      if (a !== b) intra.push({ civId: 1, fromCity: "C" + a, toCity: "C" + b, people: 1000, points: 1 });
    }
  }
  const frames = [{
    turn: 1, age: "AGE_ANTIQUITY", year: "",
    network: { nodes: [{ id: 1, name: "Civ1" }], edges: [], cityEdges: [], maxEdge: 0, maxNode: 0 },
    pops: { 1: { cities } },
    intra
  }];
  const centers = [{ id: 1, name: "Civ1", x: 400, y: 300 }];
  const byId = new Map([[1, 0]]);
  buildChronoDots(frames, centers, byId, new Map([[1, 0]]), UNIT);
  const state = {
    frameIdx: 0, expanded: new Set([1]), origin: null, focusDest: null,
    show: { resident: true, internal: true, immigrant: true }
  };
  return { segs: buildFlowSegments({ state, centers, byId, frames }), pairs: intra.length, center: centers[0] };
}

function testEveryInternalMoveDrawsAnArrow() {
  // Sizes chosen to cover the shapes that failed: a two-city civ (every pair tangent), and civs
  // where the big city is tangent to several satellites.
  for (const pops of [[40, 40], [3, 3], [120, 60, 30], [300, 120, 60, 30, 10], [400, 250, 150, 90, 60, 40, 20, 10]]) {
    const { segs, pairs } = internalSegments(pops);
    assert.equal(segs.length, pairs,
      `pops=[${pops}]: ${pairs} internal moves fed in but only ${segs.length} arrows came back`);
  }
}

function testArrowsHaveVisibleLength() {
  // A drawn-but-zero-length arrow would pass the count check and still show nothing.
  for (const pops of [[40, 40], [300, 120, 60, 30, 10]]) {
    for (const s of internalSegments(pops).segs) {
      const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
      assert.ok(len >= 5.9, `pops=[${pops}]: arrow is only ${len.toFixed(2)}px long`);
    }
  }
}

function testTangentPairsAreTheTightOnes() {
  // Pin the MECHANISM, not just the symptom: the pairs that need the shrunk trim are exactly the
  // ones the packing seated tangent (centre distance <= the full-trim span).
  const { segs, center } = internalSegments([300, 120, 60, 30, 10]);
  const cs = center.cities;
  let tangent = 0;
  for (let a = 0; a < cs.length; a++) {
    for (let b = a + 1; b < cs.length; b++) {
      const d = Math.hypot(cs[a].sx - cs[b].sx, cs[a].sy - cs[b].sy);
      if (d <= (cs[a].subR + 3) + (cs[b].subR + 3) + 6) tangent += 2; // both directions
    }
  }
  assert.ok(tangent > 0, "expected the packing to seat at least one pair tangent");
  assert.equal(segs.filter((/** @type {*} */ s) => s.tight).length, tangent,
    "the shrunk-trim arrows should be exactly the tangent pairs");
}

function testDistantFlowsKeepTheFullTrim() {
  // No regression for the cross-civ case: two civs far apart still get the untouched full trim.
  const mk = (/** @type {number} */ id, /** @type {number} */ x) => ({ id, name: "Civ" + id, x, y: 300 });
  const centers = [mk(1, 100), mk(2, 900)];
  const byId = new Map([[1, 0], [2, 1]]);
  const cities = [{ name: "A", town: false, pop: 50, pts: 50 }];
  const frames = [{
    turn: 1, age: "AGE_ANTIQUITY", year: "",
    network: {
      nodes: centers.map((c) => ({ id: c.id, name: c.name })),
      edges: [{ from: 1, to: 2, people: 5000, fromCity: "A", toCity: "A" }],
      cityEdges: [], maxEdge: 0, maxNode: 0
    },
    pops: { 1: { cities }, 2: { cities } },
    intra: []
  }];
  buildChronoDots(frames, centers, byId, new Map([[1, 0], [2, 1]]), UNIT);
  const state = {
    frameIdx: 0, expanded: new Set(), origin: null, focusDest: null,
    show: { resident: true, internal: true, immigrant: true }
  };
  const segs = buildFlowSegments({ state, centers, byId, frames });
  assert.equal(segs.length, 1, "the cross-civ flow should draw one arrow");
  assert.ok(!segs[0].tight, "a far-apart cross-civ flow must keep the full (untightened) trim");
}

testEveryInternalMoveDrawsAnArrow();
testArrowsHaveVisibleLength();
testTangentPairsAreTheTightOnes();
testDistantFlowsKeepTheFullTrim();
console.log("network-flow-arrows: ok");
