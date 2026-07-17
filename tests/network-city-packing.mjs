// network-city-packing.mjs
//
// How a civ circle gets its size: the city sub-cluster packing in emigration-network-dots.layoutCiv.
//
// The bugs this guards (2026-07-17), all of which read as a huge, mostly-empty civ circle:
//
//  1. City discs were spread onto a ring of radius `1.75·√(Σ subR²)` regardless of their own size,
//     so a dominant city flung its 1-dot hamlets out to ~1.75x its radius — a single hamlet took a
//     lone 400-dot city's circle from r=54 to r=102.
//  2. Discs were positioned by ARRAY INDEX, and `center.cities` arrives in the engine's (founding)
//     order, so the SAME civ drew a ~47% bigger circle when its largest city was founded last.
//  3. The first packing fix anchored the biggest disc at the origin and fanned the rest to one side,
//     so the circle had to reach the farthest satellite while the opposite half sat empty (two equal
//     cities filled only ~20% of the circle).
//
// Now: packed biggest-first with no overlap, then re-centred on the enclosing circle. These assert
// the properties that must hold, NOT the exact radii (which are free to be tuned).

import assert from "node:assert/strict";

const { buildChronoDots } = await import("/emigration/ui/emigration-network-dots.js");

// One dot per person keeps the arithmetic readable: `unit` 1 => a city of pop N gets N dots.
const UNIT = 1;

/**
 * Lay out ONE civ whose cities have the given populations, and return its centre.
 * Drives the real buildChronoDots so the packing under test is the shipped path.
 * @param {number[]} pops Population per city (dot count at UNIT 1).
 * @returns {*} The civ centre ({clusterR, cities:[{sx,sy,subR}]}).
 */
function layout(pops) {
  const cities = pops.map((pop, i) => ({ name: "C" + i, town: false, pop, pts: pop }));
  const frames = [{
    turn: 1, age: "AGE_ANTIQUITY", year: "",
    network: { nodes: [{ id: 1, name: "Civ1" }], edges: [], cityEdges: [], maxEdge: 0, maxNode: 0 },
    pops: { 1: { cities } },
    intra: []
  }];
  const centers = [{ id: 1, name: "Civ1", x: 0, y: 0 }];
  const byId = new Map([[1, 0]]);
  buildChronoDots(frames, centers, byId, new Map([[1, 0]]), UNIT);
  return centers[0];
}

/** The worst overlap between any two of a civ's city discs (>0 means they collide). */
function worstOverlap(center) {
  const cs = center.cities;
  let worst = -Infinity;
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      const d = Math.hypot(cs[i].sx - cs[j].sx, cs[i].sy - cs[j].sy);
      worst = Math.max(worst, (cs[i].subR + cs[j].subR) - d);
    }
  }
  return worst === -Infinity ? 0 : worst;
}

function testCityDiscsNeverOverlap() {
  // The whole reason the old layout over-spread: keeping discs apart. Packing must not regress it.
  for (const pops of [[400, 1], [400, 1, 1, 1, 1], [100, 100, 100, 100], [300, 4, 3, 2, 1],
    Array(16).fill(25), [1, 1, 1], [500, 250, 120, 60, 30, 15, 7, 3]]) {
    const c = layout(pops);
    assert.ok(worstOverlap(c) <= 0, `discs must not overlap for [${pops}] (worst ${worstOverlap(c)})`);
  }
}

function testEveryDiscFitsInsideTheCircle() {
  // clusterR is what the civ circle is drawn at and what the sim's collision spacing uses — every
  // city disc has to be inside it or discs spill outside their own civ.
  for (const pops of [[400], [400, 1, 1, 1, 1], [120, 100, 80, 5, 5], Array(9).fill(40)]) {
    const c = layout(pops);
    for (const ct of c.cities) {
      const reach = Math.hypot(ct.sx, ct.sy) + ct.subR;
      assert.ok(reach <= c.clusterR + 1e-6,
        `city disc escapes clusterR for [${pops}]: ${reach.toFixed(1)} > ${c.clusterR.toFixed(1)}`);
    }
  }
}

function testSizeIsIndependentOfCityOrder() {
  // THE regression: `center.cities` comes in engine/founding order, which must not change the size.
  const base = [400, 1, 37, 2, 90];
  const perms = [[400, 1, 37, 2, 90], [1, 400, 37, 90, 2], [90, 2, 37, 1, 400], [2, 37, 90, 400, 1]];
  const radii = perms.map((p) => layout(p).clusterR);
  for (const r of radii) {
    assert.ok(Math.abs(r - radii[0]) < 1e-6,
      `clusterR must not depend on city order (${radii.map((x) => x.toFixed(1)).join(" vs ")})`);
  }
  assert.equal(radii.length, perms.length);
  assert.ok(base.length === 5);
}

function testArrangementIsCentredOnTheCircle() {
  // Packing anchors the biggest disc at the origin then fans the rest to one side; the layout then
  // re-centres on the enclosing circle so the civ circle hugs the discs EVENLY (no empty half). The
  // check: the farthest-reaching disc on each axis is balanced — the arrangement isn't shoved to one
  // side of its own circle the way the origin-anchored packing was.
  for (const pops of [[200, 200], [1, 1, 400, 1, 1], [120, 100, 80, 5, 5], [300, 4, 3, 2, 1]]) {
    const c = layout(pops);
    let left = 0, right = 0, up = 0, down = 0;
    for (const ct of c.cities) {
      right = Math.max(right, ct.sx + ct.subR);
      left = Math.max(left, -(ct.sx - ct.subR));
      down = Math.max(down, ct.sy + ct.subR);
      up = Math.max(up, -(ct.sy - ct.subR));
    }
    // The circle's radius is `max extent`; a well-centred arrangement reaches comparably far on both
    // sides of each axis. The old origin-anchored packing failed this hard (one side ~0).
    const spanX = right + left, spanY = up + down;
    assert.ok(Math.min(left, right) >= 0.30 * spanX,
      `[${pops}] x-arrangement is lopsided (l=${left.toFixed(0)} r=${right.toFixed(0)})`);
    assert.ok(Math.min(up, down) >= 0.30 * spanY,
      `[${pops}] y-arrangement is lopsided (u=${up.toFixed(0)} d=${down.toFixed(0)})`);
  }
}

function testCircleIsNotMostlyEmpty() {
  // The reported symptom: a huge circle with a small knot of dots in it. That was the origin-anchored
  // packing leaving an empty half (two equal cities filled only ~20% of the circle). Re-centring must
  // keep a reasonable share of the circle covered by the actual discs.
  for (const pops of [[200, 200], [2, 2], [100, 100, 100, 100]]) {
    const c = layout(pops);
    const discArea = c.cities.reduce((a, ct) => a + Math.PI * ct.subR * ct.subR, 0);
    const circleArea = Math.PI * c.clusterR * c.clusterR;
    assert.ok(discArea / circleArea > 0.32,
      `[${pops}] circle is mostly empty (fill ${(100 * discArea / circleArea).toFixed(0)}%)`);
  }
}

function testAHamletNoLongerInflatesADominantCiv() {
  // The headline symptom: one 1-dot hamlet used to nearly double a lone big city's circle (54 -> 102)
  // by flinging itself out to ~1.75x. It should now sit just clear of the big disc.
  const alone = layout([400]).clusterR;
  const withHamlet = layout([400, 1]).clusterR;
  assert.ok(withHamlet < alone * 1.6,
    `a single hamlet must not balloon the circle (${alone.toFixed(0)} -> ${withHamlet.toFixed(0)})`);
  assert.ok(withHamlet > alone, "but it must still be contained (the circle grows a little)");
}

function testCircleStillGrowsForACivThatEarnsIt() {
  // The counterpart: packing must NOT flatten a civ with several genuinely large cities. Its discs
  // really do need the room, so it should stay close to its old size.
  const dominant = layout([300, 4, 3, 2, 1]).clusterR;
  const spread = layout([120, 100, 80, 5, 5]).clusterR;
  assert.ok(spread > dominant,
    `a civ with 3 real cities should read larger than a one-city civ of the same population `
    + `(${spread.toFixed(0)} vs ${dominant.toFixed(0)})`);
}

function testSingleCityCivIsUnchanged() {
  const c = layout([400]);
  assert.ok(Math.abs(c.cities[0].sx) < 1e-6, "a lone city sits dead centre");
  assert.ok(Math.abs(c.cities[0].sy) < 1e-6);
  assert.ok(Math.abs(c.clusterR - c.cities[0].subR) < 1e-6, "and the circle hugs it exactly");
}

function testTinyCivsAreSane() {
  // Every city at the MIN_CITY_SUB_R floor: the packing still has to separate them cleanly.
  for (const pops of [[1], [1, 1], [1, 1, 1, 1, 1, 1]]) {
    const c = layout(pops);
    assert.ok(isFinite(c.clusterR) && c.clusterR > 0, `[${pops}] yields a usable radius`);
    assert.ok(worstOverlap(c) <= 0, `[${pops}] discs still don't overlap`);
    for (const ct of c.cities) {
      assert.ok(isFinite(ct.sx) && isFinite(ct.sy), `[${pops}] positions stay finite`);
    }
  }
}

function testDotlessCivIsNeverLaidOut() {
  // Pre-existing, and deliberate: placeDots only walks civs that HAVE dots, so a civ with no
  // population never reaches layoutCiv and keeps no clusterR. Consumers default it (`clusterR || 8`
  // in the sim's collision, the flow arrows, and hit-testing). Pinned so the packing above is never
  // "fixed" into fabricating a radius for a civ with nothing to draw.
  const c = layout([0]);
  assert.equal(c.clusterR, undefined, "a dotless civ is not laid out at all");
}

testCityDiscsNeverOverlap();
testEveryDiscFitsInsideTheCircle();
testSizeIsIndependentOfCityOrder();
testArrangementIsCentredOnTheCircle();
testCircleIsNotMostlyEmpty();
testAHamletNoLongerInflatesADominantCiv();
testCircleStillGrowsForACivThatEarnsIt();
testSingleCityCivIsUnchanged();
testTinyCivsAreSane();
testDotlessCivIsNeverLaidOut();

console.log("network-city-packing: OK");
