import assert from "node:assert/strict";

import { prosperity, rankByProsperity, distress, lethalDistress, fieldContext } from "/emigration/ui/emigration-prosperity.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";

// These tests verify the prosperity FORMULA's structure with clean round-number fixtures, so they pin
// the scoring weights explicitly rather than tracking the shipped calibration (which the 1.4.1 balance
// pass re-tuned: yield factors ×2.5, happiness de-saturated). Pinning the canonical weights here keeps
// the hand-computed expectations valid and decouples these tests from future re-tuning. Individual
// tests toggle happinessShaped on and restore it to this legacy baseline.
CONFIG.happinessShaped = false;
CONFIG.overcrowdDiscount = 0;
CONFIG.foodFactor = 1.0;
CONFIG.productionFactor = 1.0;
CONFIG.goldFactor = 1.0;
CONFIG.scienceFactor = 0.25;
CONFIG.cultureFactor = 0.5;
CONFIG.localHappinessFactor = 6.0;
CONFIG.happyFloor = 8;
CONFIG.happyAmp = 0.8;
CONFIG.happyRepulsion = 2.0;
CONFIG.happyScale = 8;

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

function testProsperityUsesAllWeightedYields() {
  // weighted = food*1 + production*1 + gold*1 + science*0.25 + culture*0.5
  //          = 1 + 2 + 3 + 1 + 2.5 = 9.5; / pop(5) = 1.9
  // base = 1.9 + happiness*6 - pop*1 = 1.9 + 6 - 5 = 2.9
  const p = prosperity(
    signal({ food: 1, production: 2, gold: 3, science: 4, culture: 5, population: 5, happiness: 1 })
  );
  assert.ok(Math.abs(p - 2.9) < 1e-9);
}

function testPopulationFloorAtOne() {
  // population <= 0 still divides by 1 via Math.max(1, population)
  const p = prosperity(signal({ food: 10, production: 10, population: 0, happiness: 0 }));
  // productiveness 20/1, popPenalty 0, no situational modifiers
  assert.equal(p, 20);
}

function testStarvationStronglyReducesScore() {
  // starvation applies starvationModifier% as a situational penalty: score = base × (1 + mod/100). At
  // the default −90 that's ×0.1 (a deeply unattractive city people flee) without flipping negative.
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

function testDisasterSlidesAndCaps() {
  // base = 38 as in testViolenceSlidesScoreDown
  const calm = signal({ food: 10, production: 10, population: 2, happiness: 5 });
  const basePros = prosperity(calm);
  // disaster uses the same sliding and cap pattern as violence.
  const stressed = { ...calm, disaster: 4 };
  const stressedPct = -Math.min(CONFIG.disasterCapPct, 4 * CONFIG.disasterPerPoint);
  assert.ok(Math.abs(prosperity(stressed) - basePros * (1 + stressedPct / 100)) < 1e-9);
  // heavy disaster saturates at disasterCapPct
  const collapsed = { ...calm, disaster: 100 };
  const collapsedPct = -Math.min(CONFIG.disasterCapPct, 100 * CONFIG.disasterPerPoint);
  assert.ok(Math.abs(prosperity(collapsed) - basePros * (1 + collapsedPct / 100)) < 1e-9);
}

function testSituationalCompositionAddsLinearlyInPercentSpace() {
  const base = signal({ food: 10, production: 10, population: 2, happiness: 5 }); // 38
  const modded = signal({
    food: 10,
    production: 10,
    population: 2,
    happiness: 5,
    starving: true,
    unrest: true,
    siege: true,
    violence: 2,
    disaster: 1,
    polity: { warWeary: true, celebrating: false, government: "" }
  });
  const totalPct =
    -Math.min(CONFIG.violenceCapPct, 2 * CONFIG.violencePerPoint) +
    -Math.min(CONFIG.disasterCapPct, 1 * CONFIG.disasterPerPoint) +
    CONFIG.siegeModifier +
    CONFIG.starvationModifier +
    CONFIG.unrestModifier +
    CONFIG.warWearinessModifier;
  assert.ok(Math.abs(prosperity(modded) - 38 * (1 + totalPct / 100)) < 1e-9);
  assert.equal(distress(modded), Math.abs(totalPct));
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

function testFieldContextMeanAndFiltering() {
  const ctx = fieldContext([
    { happiness: 2 },
    { happiness: 8 },
    { happiness: Number.POSITIVE_INFINITY },
    { happiness: "bad" }
  ]);
  assert.deepEqual(ctx, { meanHappiness: 5 });
}

function testFieldContextRejectsNumericStrings() {
  const ctx = fieldContext([
    { happiness: 2 },
    { happiness: 8 },
    { happiness: "6" }
  ]);
  assert.deepEqual(ctx, { meanHappiness: 5 });
}

function testShapedNullContextFallsBackToZeroMean() {
  CONFIG.happinessShaped = true;
  const p = prosperity(signal({ food: 10, production: 10, population: 2, happiness: 5 }), null);
  assert.ok(Number.isFinite(p));
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
testProsperityUsesAllWeightedYields();
testPopulationFloorAtOne();
testStarvationStronglyReducesScore();
testRankSortsDescendingAndAttachesPros();
testToleratesDegenerateInput();
testViolenceSlidesScoreDown();
testDisasterSlidesAndCaps();
testSituationalCompositionAddsLinearlyInPercentSpace();
testShapedPullSaturates();
testShapedMiseryIsSteeperThanPull();
testShapedIsFieldRelative();
testFieldContextMeanAndFiltering();
testFieldContextRejectsNumericStrings();
testShapedNullContextFallsBackToZeroMean();
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

// ── Lethal distress (drives the DEATH gate; unrest only counts when earned) ────────────────
// The bug this guards: unrest alone (-60) fed the full distress() into the death gate and, since
// 60 ≥ attritionMinDistress (40), killed a peaceful city with an untagged "unexplained" death.
// lethalDistress excludes unrest unless the caller passes unrestCounts, so unrest kills only after
// the engine's sustained-unrest tenure gate — while distress() keeps it for economic-emigration push.
function testLethalDistressGatesUnrest() {
  const unrestOnly = signal({ unrest: true });
  // The DEATH gate ignores unrest until it's earned...
  assert.equal(lethalDistress(unrestOnly, false), 0);
  // ...and counts it once earned.
  assert.equal(lethalDistress(unrestOnly, true), Math.abs(CONFIG.unrestModifier));
  // The economic-push measure is unaffected either way — unrest still pushes emigration immediately.
  assert.equal(distress(unrestOnly), Math.abs(CONFIG.unrestModifier));
  // Immediate crises (siege/disaster/famine) are lethal regardless of the unrest flag.
  assert.equal(lethalDistress(signal({ starving: true }), false), Math.abs(CONFIG.starvationModifier));
  assert.equal(lethalDistress(signal({ siege: true }), false), Math.abs(CONFIG.siegeModifier));
  // With a real crisis present, the unrest term still only adds when earned.
  const siegeAndUnrest = signal({ siege: true, unrest: true });
  assert.equal(lethalDistress(siegeAndUnrest, false), Math.abs(CONFIG.siegeModifier));
  assert.equal(lethalDistress(siegeAndUnrest, true), Math.abs(CONFIG.siegeModifier) + Math.abs(CONFIG.unrestModifier));
}

testLethalDistressGatesUnrest();

// ── 1.4.1 polity model (happiness stages + government + celebration + war weariness) ──────
// These run in the legacy-linear branch established at the top of the file (happinessShaped=false),
// so a polity term shows up as a clean additive delta on the base score.

function testCelebrationAddsPull() {
  const base = { food: 10, production: 10, population: 2 };
  const plain = prosperity(signal({ ...base }));
  const celeb = prosperity(signal({ ...base, polity: { celebrating: true, government: "", warWeary: false } }));
  assert.equal(celeb - plain, CONFIG.celebrationPull); // +celebrationPull (neutral civ → happinessPull 1)
}

function testStageTermScales() {
  const base = { food: 10, production: 10, population: 2 };
  const neutral = prosperity(signal({ ...base, stage: 0 }));
  const ecstatic = prosperity(signal({ ...base, stage: 2 }));
  const angry = prosperity(signal({ ...base, stage: -2 }));
  // Pull-biased: the happy side gets full weight; the misery side is scaled by happinessStageMiseryScale.
  assert.equal(ecstatic - neutral, CONFIG.happinessStageWeight * 2);
  assert.equal(angry - neutral, CONFIG.happinessStageWeight * CONFIG.happinessStageMiseryScale * -2);
}

function testGovernmentLeanClamped() {
  const base = { food: 10, production: 10, population: 2 };
  const w = CONFIG.governmentWeight;
  CONFIG.governmentWeight = 10; // 10 × lean(1) = 10, clamped to governmentLeanCap (3)
  const plain = prosperity(signal({ ...base }));
  const leaning = prosperity(signal({ ...base, polity: { celebrating: false, government: "GOVERNMENT_CLASSICAL_REPUBLIC", warWeary: false } }));
  assert.equal(leaning - plain, CONFIG.governmentLeanCap);
  CONFIG.governmentWeight = w;
}

function testWarWearinessIsSituationalPush() {
  // War weariness enters the situational percent, so it surfaces as distress magnitude.
  assert.equal(distress(signal({ polity: { warWeary: true, celebrating: false, government: "" } })),
    Math.abs(CONFIG.warWearinessModifier));
}

function testPolityModelOffRestoresBaseline() {
  CONFIG.polityModelEnabled = false;
  const base = { food: 10, production: 10, population: 2 };
  const plain = prosperity(signal({ ...base }));
  const loaded = prosperity(signal({ ...base, stage: 2, polity: { celebrating: true, government: "GOVERNMENT_CLASSICAL_REPUBLIC", warWeary: true } }));
  assert.equal(loaded, plain); // every polity term inert when the flag is off
  CONFIG.polityModelEnabled = true;
}

testCelebrationAddsPull();
testStageTermScales();
testGovernmentLeanClamped();
testWarWearinessIsSituationalPush();
testPolityModelOffRestoresBaseline();

console.log("prosperity harness passed");
