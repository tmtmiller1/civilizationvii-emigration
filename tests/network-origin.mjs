import assert from "node:assert/strict";

// buildChronoDots must colour a CAPTURED city's residents by the civ they ORIGINATED from (the
// prior owner) — not the new owner — while any NEW home-grown population counts as the new owner.
// The origin breakdown rides in on each city's `origins` (built by the composition ledger).
const { buildChronoDots } = await import("/emigration/ui/emigration-network-dots.js");
const { civColorByIndex } = await import("/emigration/ui/emigration-network-paint.js");

// Civ 20 is the conqueror (colour index 0); civ 10 is the civ it took the city from (index 1).
function centers() {
  return [
    { id: 20, name: "Conqueror", x: 0, y: 0 },
    { id: 10, name: "Old Owner", x: 80, y: 0 }
  ];
}
const byId = new Map([[20, 0], [10, 1]]);
const colorMap = new Map([[20, 0], [10, 1]]);

// Resident dots for one origin civ that are still live at the final frame.
function residentDots(dots, originId) {
  return dots.filter((d) => d.scope === "resident" && d.originId === originId && d.disappearFrame == null);
}

function frame(turn, cities) {
  return { turn, age: "A", network: { nodes: centers() }, pops: { 20: { cities } } };
}

// A city civ 20 just took from civ 10: 8 of its 10 residents trace to the old owner, 2 are new.
function testCapturedResidentsKeepOrigin() {
  const city = { name: "Carthage", town: false, pop: 10, pts: 10,
    origins: [{ civ: 10, pts: 8 }, { civ: 20, pts: 2 }] };
  const dots = buildChronoDots([frame(1, [city])], centers(), byId, colorMap, 1);
  const old = residentDots(dots, 10);
  const neu = residentDots(dots, 20);
  assert.equal(old.length, 8, "8 resident dots keep the prior owner (civ 10) as their origin");
  assert.equal(neu.length, 2, "2 home-grown resident dots are the new owner (civ 20)");
  assert.equal(old[0].colors.origin, civColorByIndex(1), "prior-owner residents use civ 10's colour");
  assert.equal(neu[0].colors.origin, civColorByIndex(0), "home-grown residents use civ 20's colour");
  assert.equal(old[0].originName, "Old Owner", "the dot names the civ the people came from");
  assert.ok(old.every((d) => d.destId === 20), "captured residents live in the new owner's cluster");
}

// As the captured city grows, the NEW population is the new owner — the old-owner cohort is frozen.
function testGrowthAfterCaptureIsNewOwner() {
  const f0 = { name: "Carthage", town: false, pop: 10, pts: 10,
    origins: [{ civ: 10, pts: 8 }, { civ: 20, pts: 2 }] };
  const f1 = { name: "Carthage", town: false, pop: 14, pts: 14,
    origins: [{ civ: 10, pts: 8 }, { civ: 20, pts: 6 }] };
  const dots = buildChronoDots([frame(1, [f0]), frame(2, [f1])], centers(), byId, colorMap, 1);
  assert.equal(residentDots(dots, 10).length, 8, "prior-owner residents are unchanged as the city grows");
  assert.equal(residentDots(dots, 20).length, 6, "the 4 new residents count as the new owner");
}

// No composition (older saves / unconquered cities) → every resident is the owner, as before.
function testNoCompositionFallsBackToOwner() {
  const city = { name: "Rome", town: false, pop: 6, pts: 6 };
  const dots = buildChronoDots([frame(1, [city])], centers(), byId, colorMap, 1);
  assert.equal(residentDots(dots, 20).length, 6, "without composition, all residents are the owner");
  assert.equal(residentDots(dots, 10).length, 0, "no foreign-origin residents appear");
}

testCapturedResidentsKeepOrigin();
testGrowthAfterCaptureIsNewOwner();
testNoCompositionFallsBackToOwner();
console.log("network-origin harness passed");
