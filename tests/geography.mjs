import assert from "node:assert/strict";

// Stub the engine globals the geography module reads, BEFORE exercising it.
// getPlotDistance: a Manhattan proxy (monotonic in separation - all the module
// needs). Players 0 and 1 are at war; everyone else is at peace.
globalThis.GameplayMap = {
  getPlotDistance: (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2)
};
const WARS = new Set(["0-1", "1-0"]);
globalThis.Players = {
  get: (id) => ({
    Diplomacy: {
      isAtWarWith: (o) => WARS.has(id + "-" + o),
      hasAllied: (o) => id === 0 && o === 4
    }
  })
};
// Players 0 and 2 share a base-game Open Borders agreement (a joint diplomatic event).
const OPEN_BORDERS = new Set(["0-2", "2-0"]);
globalThis.Game = {
  Diplomacy: {
    getJointEvents: (a, b) =>
      OPEN_BORDERS.has(a + "-" + b) ? [{ actionTypeName: "DIPLOMACY_ACTION_OPEN_BORDERS" }] : []
  }
};

const {
  hexDistance,
  fleeVector,
  geoAdjust,
  openBordersBonus,
  geoBreakdown,
  hasAlliance,
  atWar,
  resetDiplomacyCache
} = await import(
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
  assert.equal(hexDistance(undefined, eastRefuge), 0); // undefined source should be safe
  assert.equal(hexDistance(src, undefined), 0); // undefined destination should be safe
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

function testFleeBonusExactDirectionAndMagnitude() {
  const prevThr = CONFIG.violenceFleeThreshold;
  const prevFlee = CONFIG.fleeFactor;
  CONFIG.violenceFleeThreshold = 1;
  CONFIG.fleeFactor = 3;

  const hot = at(0, 10, 0, { violence: 2 }); // >= 2 * threshold -> intensity 1
  const flee = fleeVector(hot, ranked);
  assert.ok(flee, "flee vector should exist for threatened source");
  const away = geoBreakdown(hot, westRefuge, flee, null);
  const toward = geoBreakdown(hot, eastRefuge, flee, null);
  assert.ok(Math.abs(away.flight - 3) < 1e-9, "directly away from invader should get +fleeFactor");
  assert.ok(Math.abs(toward.flight + 3) < 1e-9, "directly toward invader should get -fleeFactor");

  CONFIG.violenceFleeThreshold = prevThr;
  CONFIG.fleeFactor = prevFlee;
}

function testFleeIntensityRampsAtThreshold() {
  const thr = 4;
  CONFIG.violenceFleeThreshold = thr;
  CONFIG.fleeFactor = 2;
  const sourceAtThreshold = at(0, 10, 0, { violence: thr });
  const sourceAboveThreshold = at(0, 10, 0, { violence: thr + 0.01 });
  const flee = fleeVector(sourceAtThreshold, ranked);
  assert.ok(flee, "threatened source should still resolve a flee vector");
  const atBar = geoBreakdown(sourceAtThreshold, westRefuge, flee, null);
  const aboveBar = geoBreakdown(sourceAboveThreshold, westRefuge, flee, null);
  assert.equal(atBar.flight, 0, "flight term should be zero at the exact threshold");
  assert.ok(aboveBar.flight > 0, "flight term should ramp in above threshold");
}

function testAggressorAndBreakdownTerms() {
  CONFIG.distanceFactor = 0.6;
  CONFIG.ownCivRefugeeBonus = 2;
  CONFIG.aggressorPenalty = 4;
  const aggressors = new Set([3]);
  const own = geoBreakdown(src, at(0, 12, 0), null, aggressors);
  const aggressor = geoBreakdown(src, at(3, 12, 0), null, aggressors);
  const neutral = geoBreakdown(src, at(4, 12, 0), null, aggressors);
  assert.equal(own.aggressor, 2);
  assert.equal(aggressor.aggressor, -4);
  assert.equal(neutral.aggressor, 0);
}

function testAllianceAndWarReads() {
  assert.equal(hasAlliance(0, 4), true);
  assert.equal(hasAlliance(0, 5), false);
  assert.equal(atWar(0, 1), true);
  assert.equal(atWar(0, 0), false);
}

function testDiplomacyFailuresFallBackToFalse() {
  resetDiplomacyCache();
  const priorPlayers = globalThis.Players;
  globalThis.Players = {
    get: () => {
      throw new Error("diplomacy unavailable");
    }
  };
  assert.equal(atWar(7, 8), false);
  assert.equal(hasAlliance(7, 8), false);
  globalThis.Players = priorPlayers;
}

function testOptionalChainingFallbacksWhenGlobalsMissing() {
  const priorPlayers = globalThis.Players;
  const priorGame = globalThis.Game;

  delete globalThis.Players;
  delete globalThis.Game;
  resetDiplomacyCache();
  assert.equal(atWar(3, 4), false);
  assert.equal(hasAlliance(3, 4), false);
  CONFIG.openBordersBonus = 8;
  assert.equal(openBordersBonus(3, 4), 0);

  globalThis.Players = priorPlayers;
  globalThis.Game = priorGame;
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

function testOpenBordersIgnoresNonMatchingEvents() {
  const prior = globalThis.Game.Diplomacy.getJointEvents;
  globalThis.Game.Diplomacy.getJointEvents = () => [{ actionTypeName: "DIPLOMACY_ACTION_DECLARE_WAR" }];
  resetDiplomacyCache();
  CONFIG.openBordersBonus = 8;
  assert.equal(openBordersBonus(0, 2), 0);
  globalThis.Game.Diplomacy.getJointEvents = prior;
}

testHexDistance();
testFleePointsAwayFromInvader();
testNotThreatenedHasNoFlee();
testThreatenedButNoLocatableEnemyHasNoFlee();
testDistanceOnlyPenaltyWhenNoFlee();
testFleeRewardsAwayPenalizesToward();
testFleeBonusExactDirectionAndMagnitude();
testFleeIntensityRampsAtThreshold();
testAggressorAndBreakdownTerms();
testOpenBordersBonus();
testOpenBordersIgnoresNonMatchingEvents();
testAllianceAndWarReads();
testDiplomacyFailuresFallBackToFalse();
testOptionalChainingFallbacksWhenGlobalsMissing();

console.log("geography harness passed");
