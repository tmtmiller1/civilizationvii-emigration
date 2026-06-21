import assert from "node:assert/strict";

const { startAnim } = await import("/emigration/ui/emigration-network-viz.js");

// Two civ centres: index 0 is the ORIGIN, index 1 the DESTINATION. The origin sitting at node index 0
// is the regression case — `byId.get(originId)` returns 0, and the old `0 || d.ci` collapsed to the
// destination, so an immigrant flew out of the civ it was moving TO (reading as home-grown).
function scene() {
  return {
    centers: [
      { id: 10, x: 0, y: 0, cities: [] }, // index 0 — ORIGIN
      { id: 20, x: 100, y: 50, cities: [] } // index 1 — DESTINATION
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
  // Origin at index 1, destination at index 0 — the symmetric case.
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

testImmigrantFliesFromOriginNotDestination();
testImmigrantFromHigherIndexAlsoFromOrigin();
testInternalMoverFliesFromItsOwnCiv();
console.log("network-anim harness passed");
