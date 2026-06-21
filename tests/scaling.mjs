import assert from "node:assert/strict";

import {
  scaleCityPopulation,
  marginalPeople,
  formatPeople,
  formatBoth
} from "/emigration/ui/emigration-population.js";

// The scaling MUST match the Demographics mod's scaleCityPopulationAt:
//   raw^1.11 * 12000 * 1.009^turn
// so a settlement reads the same population in both mods. (Base is 12000 in both:
// emigration-config.js `scaleBase: 12000` and Demographics
// `demographics-metrics-helpers.js` scaleCityPopulationAt.)

function testScaleBaseline() {
  // raw 1 at turn 0 is exactly the scale base (1^1.11 = 1, 1.009^0 = 1).
  assert.equal(scaleCityPopulation(1, 0), 12000);
}

function testScaleGrowsWithTurn() {
  // The era multiplier 1.009^turn makes later turns scale higher.
  assert.ok(scaleCityPopulation(5, 100) > scaleCityPopulation(5, 0));
}

function testScaleRejectsNonPositive() {
  assert.equal(scaleCityPopulation(0, 10), 0);
  assert.equal(scaleCityPopulation(-3, 10), 0);
  assert.equal(scaleCityPopulation(Number.NaN, 10), 0);
  assert.equal(scaleCityPopulation("x", 10), 0);
}

function testMarginalPeopleIsTheDelta() {
  // The first population point represents scale(1) - scale(0) = 12000 - 0.
  assert.equal(marginalPeople(1, 0), 12000);
  // A later point is the gap between consecutive scaled totals (always > 0).
  const m2 = marginalPeople(2, 0);
  assert.equal(m2, scaleCityPopulation(2, 0) - scaleCityPopulation(1, 0));
  assert.ok(m2 > 0);
}

function testFormatPeopleBuckets() {
  assert.equal(formatPeople(0), "0");
  assert.equal(formatPeople(500), "500");
  assert.equal(formatPeople(3000), "3 thousand");
  assert.equal(formatPeople(1_300_000), "1.3 million");
  assert.equal(formatPeople(240_000_000), "240 million");
  assert.equal(formatPeople(1_100_000_000), "1.1 billion");
}

function testFormatBothShowsBothSystems() {
  // Popups present BOTH measuring systems at once: raw Civ points + scaled people, singular at 1.
  assert.equal(formatBoth(12000, 1), "1 population point (12 thousand people)");
  assert.equal(formatBoth(36000, 3), "3 population points (36 thousand people)");
  assert.equal(formatBoth(12000), "1 population point (12 thousand people)"); // points defaults to 1
}

testScaleBaseline();
testScaleGrowsWithTurn();
testScaleRejectsNonPositive();
testMarginalPeopleIsTheDelta();
testFormatPeopleBuckets();
testFormatBothShowsBothSystems();

console.log("scaling harness passed");
