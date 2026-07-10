import assert from "node:assert/strict";

const { startAnim } = await import("/emigration/ui/emigration-network-viz.js");
const { buildChronoDots } = await import("/emigration/ui/emigration-network-dots.js");

// A pop-poor settlement (native pop below one `unit`, e.g. a freshly-founded town) must still (a) be
// drawn — sub-cluster radius floored so the paint guard `subR > 0` passes, bornFrame finite — AND (b)
// carry at least one dot so its INITIAL POPULATION shows instead of an empty disc. This is the "only 4
// of my 12 settlements show" + "new settlements don't pick up their population" fix.
function testEverySettlementLaidOutRegardlessOfDotCount() {
  const centers = [{ id: 10, x: 0, y: 0, name: "Civ10", cities: [] }];
  const byId = new Map([[10, 0]]);
  const colorMap = new Map([[10, 0]]);
  // "Big" clears the unit (2 dots); "Tiny" is far below it (would be 0 dots → now floored to 1).
  const frames = [{
    pops: { 10: { cities: [{ name: "Big", pop: 5000, pts: 20 }, { name: "Tiny", pop: 10, pts: 1 }] } },
    network: { edges: [] }, intra: []
  }];
  const dots = buildChronoDots(frames, centers, byId, colorMap, 2000);
  const cities = centers[0].cities;
  const tiny = cities.find((c) => c.name === "Tiny");
  const big = cities.find((c) => c.name === "Big");
  assert.ok(tiny, "the pop-poor settlement is present in the layout");
  assert.ok(tiny.subR > 0, "a sub-unit settlement still gets a drawable radius");
  assert.ok(Number.isFinite(tiny.bornFrame), "a sub-unit settlement has a finite bornFrame (not Infinity)");
  assert.ok(big.subR >= tiny.subR, "the larger settlement is at least as large");
  assert.ok(Number.isFinite(big.bornFrame), "the populated settlement is born on a real frame");
  // Big → floor(5000/2000)=2 dots; Tiny → sub-unit but populated → floored to 1 dot. So 3 native dots
  // total (was 2 before the floor). This proves a new/small settlement's initial population is shown.
  assert.equal(dots.length, 3, "a populated sub-unit settlement contributes at least one dot");
}

// Two civ centres: index 0 is the ORIGIN, index 1 the DESTINATION. The origin sitting at node index 0
// is the regression case, `byId.get(originId)` returns 0, and the old `0 || d.ci` collapsed to the
// destination, so an immigrant flew out of the civ it was moving TO (reading as home-grown).
function scene() {
  return {
    centers: [
      { id: 10, x: 0, y: 0, cities: [] }, // index 0, ORIGIN
      { id: 20, x: 100, y: 50, cities: [] } // index 1, DESTINATION
    ],
    byId: new Map([[10, 0], [20, 1]])
  };
}

function testImmigrantFliesFromOriginNotDestination() {
  const s = scene();
  // An immigrant FROM civ 10 (node index 0) arriving in civ 20 (its resting `ci` is the destination, 1).
  const d = { scope: "immigrant", originId: 10, ci: 1 };
  startAnim(d, s);
  assert.equal(d.anim.fromX, 0, "immigrant flies from the ORIGIN civ (x=0), not the destination");
  assert.equal(d.anim.fromY, 0);
  assert.ok(d.anim.fromX !== 100, "must NOT start at the destination it's moving to");
}

function testImmigrantFromHigherIndexAlsoFromOrigin() {
  const s = scene();
  // Origin at index 1, destination at index 0, the symmetric case.
  const d = { scope: "immigrant", originId: 20, ci: 0 };
  startAnim(d, s);
  assert.equal(d.anim.fromX, 100, "flies from civ 20 (x=100), the origin");
}

function testInternalMoverFliesFromItsOwnCiv() {
  const s = scene();
  // An internal (intra-civ) mover lives in civ 20 (ci=1) and, with no source-city sub-centre, flies
  // from its own civ's centre.
  const d = { scope: "internal", ci: 1, fromCityIdx: undefined };
  startAnim(d, s);
  assert.equal(d.anim.fromX, 100);
  assert.equal(d.anim.fromY, 50);
}

testEverySettlementLaidOutRegardlessOfDotCount();
testImmigrantFliesFromOriginNotDestination();
testImmigrantFromHigherIndexAlsoFromOrigin();
testInternalMoverFliesFromItsOwnCiv();
console.log("network-anim harness passed");
