import assert from "node:assert/strict";

// Stub the engine globals the geography module reads, BEFORE exercising it.
// getPlotDistance: a Manhattan proxy (monotonic in separation - all the module
// needs). Players 0 and 1 are at war; everyone else is at peace.
globalThis.GameplayMap = {
  getPlotDistance: (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2)
};
const WARS = new Set(["0-1", "1-0"]);
globalThis.Players = {
  get: (id) => ({ Diplomacy: { isAtWarWith: (o) => WARS.has(id + "-" + o) } })
};
// Players 0 and 2 share a base-game Open Borders agreement (a joint diplomatic event).
const OPEN_BORDERS = new Set(["0-2", "2-0"]);
globalThis.Game = {
  Diplomacy: {
    getJointEvents: (a, b) =>
      OPEN_BORDERS.has(a + "-" + b) ? [{ actionTypeName: "DIPLOMACY_ACTION_OPEN_BORDERS" }] : []
  }
};

const { hexDistance, fleeVector, geoAdjust, openBordersBonus } = await import(
  "/emigration/ui/emigration-geography.js"
);
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

// A signal at (x, y) owned by `owner`. The source under attack sets violence
// (the flee gate keys off accumulated border violence, not the empire's war).
function at(owner, x, y, over) {
  return { city: { location: { x, y } }, owner, violence: 0, ...over };
}

// Player 0's city at (10,0) is under attack (violence above the flee threshold);
// player 1's invader sits to the east at (30,0); two neutral refuges lie west
// (2,0) and east (18,0).
const src = at(0, 10, 0, { violence: 5 });
const invader = at(1, 30, 0);
const westRefuge = at(2, 2, 0);
const eastRefuge = at(3, 18, 0);
const ranked = [src, invader, westRefuge, eastRefuge];

function testHexDistance() {
  assert.equal(hexDistance(src, eastRefuge), 8); // |10-18| = 8
  assert.equal(hexDistance(at(0, 0, 0), { city: {} }), 0); // unreadable → 0
}

function testFleePointsAwayFromInvader() {
  // Invader east at (30,0) → refugees flee due west.
  assert.deepEqual(fleeVector(src, ranked), { x: -1, y: 0 });
}

function testNotThreatenedHasNoFlee() {
  assert.equal(fleeVector(at(0, 10, 0), ranked), null);
}

function testThreatenedButNoLocatableEnemyHasNoFlee() {
  assert.equal(fleeVector(src, [src, westRefuge]), null);
}

function testDistanceOnlyPenaltyWhenNoFlee() {
  // -distanceFactor (0.6) * 8 hexes.
  assert.ok(Math.abs(geoAdjust(src, eastRefuge, null) - -4.8) < 1e-9);
}

function testFleeRewardsAwayPenalizesToward() {
  const flee = fleeVector(src, ranked);
  // West refuge is in the flee direction; east refuge is back toward the invader.
  assert.ok(geoAdjust(src, westRefuge, flee) > geoAdjust(src, eastRefuge, flee));
}

function testOpenBordersBonus() {
  CONFIG.openBordersBonus = 8;
  assert.equal(openBordersBonus(0, 2), 8); // active Open Borders deal → bonus
  assert.equal(openBordersBonus(0, 3), 0); // no deal → 0
  assert.equal(openBordersBonus(0, 0), 0); // same civ → 0
  CONFIG.openBordersBonus = 0;
  assert.equal(openBordersBonus(0, 2), 0); // disabled → 0
  CONFIG.openBordersBonus = 8; // restore the shipped default
}

testHexDistance();
testFleePointsAwayFromInvader();
testNotThreatenedHasNoFlee();
testThreatenedButNoLocatableEnemyHasNoFlee();
testDistanceOnlyPenaltyWhenNoFlee();
testFleeRewardsAwayPenalizesToward();
testOpenBordersBonus();

console.log("geography harness passed");
