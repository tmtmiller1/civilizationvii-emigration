import assert from "node:assert/strict";

import { prosperity, rankByProsperity, distress } from "/emigration/ui/emigration-prosperity.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";

// Ship defaults now enable the advanced model (Algorithms A/B). These tests pin the
// legacy-linear baseline, so establish it explicitly rather than relying on defaults;
// individual tests toggle a flag on and restore it to this baseline.
CONFIG.happinessShaped = false;
CONFIG.overcrowdDiscount = 0;

// A minimal CitySignal with neutral situational flags; override per test.
function signal(over) {
  return {
    food: 0,
    production: 0,
    gold: 0,
    science: 0,
    culture: 0,
    population: 1,
    urban: 0,
    happiness: 0,
    atWar: false,
    siege: false,
    starving: false,
    unrest: false,
    violence: 0,
    ...over
  };
}

function testProsperityFormula() {
  // productiveness = (food+prod)/pop = 20/2 = 10
  // base = 10 + happiness*6 - pop*1 = 10 + 30 - 2 = 38; no situational → ×1
  const p = prosperity(signal({ food: 10, production: 10, population: 2, happiness: 5 }));
  assert.equal(p, 38);
}

function testStarvationStronglyReducesScore() {
  // starvation applies starvationModifier% as a situational penalty: score = base × (1 + mod/100). At
  // the default −90 that's ×0.1 — a deeply unattractive city people flee — without flipping negative.
  // (Death no longer comes from this penalty; it comes from the famine death channel in the engine.)
  const base = signal({ food: 10, production: 10, population: 2, happiness: 5 }); // base 38
  const factor = 1 + CONFIG.starvationModifier / 100;
  assert.ok(Math.abs(prosperity({ ...base, starving: true }) - 38 * factor) < 1e-9);
  assert.ok(prosperity({ ...base, starving: true }) < 38 * 0.5, "starvation at least halves the score");
}

function testRankSortsDescendingAndAttachesPros() {
  const poor = signal({ food: 2, population: 4, happiness: -2 });
  const rich = signal({ food: 20, production: 20, population: 2, happiness: 8 });
  const ranked = rankByProsperity([poor, rich]);
  assert.equal(typeof ranked[0].pros, "number");
  assert.ok(ranked[0].pros > ranked[1].pros);
  assert.equal(ranked[0], rich);
}

function testToleratesDegenerateInput() {
  // Non-finite arithmetic must degrade to 0, never NaN.
  assert.equal(prosperity(signal({ food: Infinity })), 0);
}

function testViolenceSlidesScoreDown() {
  // base = (10+10)/2 + 5*6 - 2 = 38. Empire-at-war ALONE (no violence) must not
  // change the score - only actual border violence does.
  const calm = signal({ food: 10, production: 10, population: 2, happiness: 5, atWar: true });
  assert.equal(prosperity(calm), 38);
  // violence 5 → 5*12 = 60% penalty → ×0.4 → 15.2 (the sliding scale).
  const fought = { ...calm, violence: 5 };
  assert.ok(Math.abs(prosperity(fought) - 15.2) < 1e-9);
  // Heavy violence saturates at violenceCapPct (220%) → ×(1-2.2) = -1.2 → -45.6.
  const routed = { ...calm, violence: 100 };
  assert.ok(Math.abs(prosperity(routed) - -45.6) < 1e-9);
}

// ── Algorithm A: shaped happiness (field-relative, saturating, asymmetric) ──

// prosperity of the test city at happiness h, centred on a given field mean.
function shaped(h, mean) {
  return prosperity(
    signal({ food: 10, production: 10, population: 2, happiness: h }),
    { meanHappiness: mean }
  );
}

function testShapedPullSaturates() {
  CONFIG.happinessShaped = true;
  // Diminishing positive returns: the jump 10→20 is far smaller than 0→10.
  const d0to10 = shaped(10, 0) - shaped(0, 0);
  const d10to20 = shaped(20, 0) - shaped(10, 0);
  assert.ok(d10to20 > 0 && d10to20 < d0to10);
  CONFIG.happinessShaped = false;
}

function testShapedMiseryIsSteeperThanPull() {
  CONFIG.happinessShaped = true;
  // Asymmetry: dropping from average into misery costs more than the symmetric gain.
  const downFromMean = shaped(0, 0) - shaped(-10, 0);
  const upFromMean = shaped(10, 0) - shaped(0, 0);
  assert.ok(downFromMean > upFromMean);
  CONFIG.happinessShaped = false;
}

function testShapedIsFieldRelative() {
  CONFIG.happinessShaped = true;
  // The same absolute happiness pulls less when the world is happier on average.
  assert.ok(shaped(5, 0) > shaped(5, 10));
  CONFIG.happinessShaped = false;
}

function testShapedLeavesLegacyUntouchedWhenOff() {
  // With the flag off, the score is exactly the legacy linear formula.
  assert.equal(prosperity(signal({ food: 10, production: 10, population: 2, happiness: 5 })), 38);
}

// ── Algorithm B: overcrowding discount ────────────────────────────────────

function testOvercrowdDiscountCreditsTallCities() {
  CONFIG.overcrowdDiscount = 0.5;
  CONFIG.overcrowdThreshold = 2;
  // urban 10 → over = 8 → +0.5×8 = +4 happiness → +4×localHappinessFactor(6) = +24.
  const dense = prosperity(signal({ food: 10, production: 10, population: 2, urban: 10 }));
  const sparse = prosperity(signal({ food: 10, production: 10, population: 2, urban: 2 }));
  assert.ok(Math.abs(dense - sparse - 24) < 1e-9);
  CONFIG.overcrowdDiscount = 0; // restore default (off)
}

function testOvercrowdOffByDefault() {
  // With the discount at 0, urban density doesn't change the score.
  const dense = prosperity(signal({ food: 10, production: 10, population: 2, urban: 50 }));
  const sparse = prosperity(signal({ food: 10, production: 10, population: 2, urban: 0 }));
  assert.equal(dense, sparse);
}

testProsperityFormula();
testStarvationStronglyReducesScore();
testRankSortsDescendingAndAttachesPros();
testToleratesDegenerateInput();
testViolenceSlidesScoreDown();
testShapedPullSaturates();
testShapedMiseryIsSteeperThanPull();
testShapedIsFieldRelative();
testShapedLeavesLegacyUntouchedWhenOff();
testOvercrowdDiscountCreditsTallCities();
testOvercrowdOffByDefault();

// ── Distress (drives the attrition outlet) ────────────────────────────────

function testDistressIsMagnitudeOfSituational() {
  assert.equal(distress(signal({ food: 10, production: 10, population: 2 })), 0); // content
  assert.equal(distress(signal({ starving: true })), Math.abs(CONFIG.starvationModifier)); // starving
  assert.equal(distress(signal({ unrest: true })), Math.abs(CONFIG.unrestModifier)); // unrest
}

testDistressIsMagnitudeOfSituational();

console.log("prosperity harness passed");
