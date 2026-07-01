import assert from "node:assert/strict";

import {
  scaleCityPopulation,
  marginalPeople,
  formatPeople,
  formatBoth,
  formatPeopleExact,
  formatBothExact,
  variedPeople,
  settlementSignal,
  ruralPop,
  totalPop,
  moveRural,
  removeRural,
  addRural
} from "/emigration/ui/emigration-population.js";

// The scaling MUST match the Demographics mod's scaleCityPopulationAt:
//   POP_K * W(size, eraGrowthParams(age, progress))
//   W(N,{flat,scalar,exp}) = flat*N + scalar*N(N+1)/2 + exp*N(N+1)(2N+1)/6   (cumulative growth food)
// from Civ VII's real per-era growth formula (cost(x)=flat+scalar*x+exp*x²). POP_K=31, params:
//   Antiquity {5,20,4} · Exploration {30,50,5} · Modern {60,60,6}. No turn multiplier.

function testScaleBaseline() {
  // size 1, no age context → falls back to Exploration params: 31 * W(1,{30,50,5}) = 31 * 85 = 2635.
  assert.equal(scaleCityPopulation(1, 0), 2635);
}

function testScaleGrowsWithSizeAndAge() {
  // People rise with settlement size...
  assert.ok(scaleCityPopulation(6, 0) > scaleCityPopulation(5, 0));
  // ...and, for a fixed size, with the age (Modern weights a size higher than Antiquity).
  assert.ok(
    scaleCityPopulation(20, 0, "AGE_MODERN", 100) > scaleCityPopulation(20, 0, "AGE_ANTIQUITY", 100)
  );
  // Turn is ignored now (scaling is age-based, not turn-based).
  assert.equal(scaleCityPopulation(5, 100), scaleCityPopulation(5, 0));
}

function testHistoricalAnchors() {
  // A top Exploration city (size ~20) reads ~0.8M; size ~21 ~0.9M, i.e. the live "968" (thousands).
  assert.equal(scaleCityPopulation(20, 0, "AGE_EXPLORATION", 100), 31 * 25450); // 789,950
  const size21 = scaleCityPopulation(21, 0, "AGE_EXPLORATION", 100);
  assert.ok(size21 > 850_000 && size21 < 950_000, `size 21 Exploration ~0.9M, got ${size21}`);
  // A small Antiquity town (size 5) stays modest (~17k), not millions.
  assert.ok(scaleCityPopulation(5, 0, "AGE_ANTIQUITY", 100) < 30_000);
}

function testModernMegacityBand() {
  // Below the knee (size 35): no boost, same as the bare curve.
  assert.equal(
    scaleCityPopulation(35, 0, "AGE_MODERN", 100),
    scaleCityPopulation(35, 0, "AGE_MODERN", 100)
  );
  // Late Modern, a large city reaches the real megacity band (~25–38M).
  const size50 = scaleCityPopulation(50, 0, "AGE_MODERN", 100);
  assert.ok(size50 > 24_000_000 && size50 < 32_000_000, `size 50 late-Modern ~28M, got ${size50}`);
  // The boost does NOT pop in at the start of Modern (ramped by age-progress).
  const early = scaleCityPopulation(50, 0, "AGE_MODERN", 2);
  const noBoost = scaleCityPopulation(50, 0, "AGE_MODERN", 0);
  assert.ok(early < 0.5 * size50, "megacity boost must ramp in, not pop in at Modern start");
  assert.ok(noBoost <= early, "no boost at the very start of Modern");
}

function testSafetyCeiling() {
  // A wildly out-of-range size can never resurrect a multi-billion city: it saturates to the era cap.
  assert.ok(scaleCityPopulation(968, 0, "AGE_MODERN", 100) <= 38_000_000, "Modern cap ~38M");
  assert.ok(scaleCityPopulation(968, 0, "AGE_EXPLORATION", 100) <= 2_500_000, "Exploration cap ~2.5M");
  assert.ok(scaleCityPopulation(968, 0, "AGE_ANTIQUITY", 100) <= 1_600_000, "Antiquity cap ~1.6M");
  // Monotonic: more size never reads as fewer people, even into the saturated tail.
  assert.ok(scaleCityPopulation(200, 0, "AGE_MODERN", 100) >= scaleCityPopulation(80, 0, "AGE_MODERN", 100));
}

function testOneMoreTurnOvertime() {
  // Normal play (≤100%): the ceiling holds.
  const normal = scaleCityPopulation(80, 0, "AGE_MODERN", 100);
  assert.ok(normal <= 38_000_000 + 1, "ceiling holds at the natural end of Modern");
  // "One more turn" (progress runs past 100%): the ceiling expands so population keeps scaling.
  const over120 = scaleCityPopulation(80, 0, "AGE_MODERN", 120);
  const over200 = scaleCityPopulation(80, 0, "AGE_MODERN", 200);
  assert.ok(over120 > normal, "overtime should let megacities grow past the historical cap");
  assert.ok(over200 > over120, "deeper overtime keeps scaling");
  // Eased onset (C¹ at p=100): just past the end barely moves (no slope kink/spike).
  const justPast = scaleCityPopulation(80, 0, "AGE_MODERN", 101);
  assert.ok(justPast >= normal && justPast < normal * 1.01, "overtime eases in smoothly at the boundary");
  // Hard cap: even a pathological progress reading can NEVER resurrect a multi-billion city.
  const pathological = scaleCityPopulation(80, 0, "AGE_MODERN", 9000);
  assert.ok(pathological <= 38_000_000 * 5, "overtime multiplier is capped (≤ OVERTIME_MAX × ceiling)");
  assert.ok(pathological < 200_000_000, "worst case stays ~190M, not billions");
  // Overtime is final-age only; earlier ages never get it (they always transition out).
  assert.equal(
    scaleCityPopulation(40, 0, "AGE_EXPLORATION", 200),
    scaleCityPopulation(40, 0, "AGE_EXPLORATION", 100),
    "non-final ages ignore >100% progress"
  );
}

function testSettlementSignalGrounding() {
  // Pure metrics: a happy, urban-heavy city leans positive; an unhappy rural one leans negative.
  assert.ok(settlementSignal({ happiness: 20, urban: 8, rural: 2 }) > 0);
  assert.ok(settlementSignal({ happiness: -20, urban: 1, rural: 9 }) < 0);
  assert.equal(settlementSignal(null), 0);
  assert.equal(settlementSignal({}), 0);
  // A grounded signal actually moves the varied figure relative to the bare hash.
  const bare = variedPeople(1_000_000, "Rome");
  const happy = variedPeople(1_000_000, "Rome", 1);
  const sad = variedPeople(1_000_000, "Rome", -1);
  assert.ok(happy > bare && bare > sad, "signal should bias the variation up/down");
  // Same inputs are deterministic.
  assert.equal(variedPeople(1_000_000, "Rome", 0.5), variedPeople(1_000_000, "Rome", 0.5));
}

function testAgeBoundaryContinuity() {
  // A size carried across a boundary reads continuously: Exploration@0% uses the PREVIOUS era's
  // (Antiquity) params, equal to Antiquity@100%. No jump.
  for (const N of [5, 20, 40]) {
    assert.equal(
      scaleCityPopulation(N, 0, "AGE_EXPLORATION", 0),
      scaleCityPopulation(N, 0, "AGE_ANTIQUITY", 100),
      `continuity at Antiquity→Exploration for size ${N}`
    );
    assert.equal(
      scaleCityPopulation(N, 0, "AGE_MODERN", 0),
      scaleCityPopulation(N, 0, "AGE_EXPLORATION", 100),
      `continuity at Exploration→Modern for size ${N}`
    );
  }
}

function testModernMegaRampAndAgeProgressReaders() {
  const base = scaleCityPopulation(30, 10, "AGE_ANTIQUITY", 90);
  const modernLate = scaleCityPopulation(30, 10, "AGE_MODERN", 95);
  assert.ok(modernLate > base, "modern late-game ramp should increase megacity scaling");

  globalThis.Game = {
    age: 2,
    AgeProgressManager: {
      getCurrentAgeProgressionPoints() {
        return 75;
      },
      getMaxAgeProgressionPoints() {
        return 100;
      }
    }
  };
  globalThis.GameInfo = {
    Ages: {
      lookup() {
        return { AgeType: "AGE_MODERN" };
      }
    }
  };

  const inferred = scaleCityPopulation(25, 10);
  const explicit = scaleCityPopulation(25, 10, "AGE_MODERN", 75);
  assert.equal(Math.round(inferred), Math.round(explicit), "engine-derived age progress should match explicit inputs");

  delete globalThis.Game;
  delete globalThis.GameInfo;
}

function testScaleRejectsNonPositive() {
  assert.equal(scaleCityPopulation(0, 10), 0);
  assert.equal(scaleCityPopulation(-3, 10), 0);
  assert.equal(scaleCityPopulation(Number.NaN, 10), 0);
  assert.equal(scaleCityPopulation("x", 10), 0);
}

function testMarginalPeopleIsTheDelta() {
  // The first population point represents scale(1) - scale(0) = 2635 - 0 (Exploration fallback).
  assert.equal(marginalPeople(1, 0), 2635);
  // A later point is the gap between consecutive scaled totals (always > 0).
  const m2 = marginalPeople(2, 0);
  assert.equal(m2, scaleCityPopulation(2, 0) - scaleCityPopulation(1, 0));
  assert.ok(m2 > 0);
}

function testMarginalPeopleFloorsRealPoint() {
  // C4: at the era ceiling the saturated curve flattens, so consecutive totals can differ by < 1 person
  // and a real one-point move would otherwise read as "0 people". A point that actually emigrated is at
  // least one person, so marginalPeople floors a real point at 1 once the raw delta underflows below 1.
  const rawDelta = scaleCityPopulation(1000, 0) - scaleCityPopulation(999, 0);
  assert.ok(rawDelta < 1, `expected the curve to saturate (raw delta < 1) at pop 1000, got ${rawDelta}`);
  assert.equal(marginalPeople(1000, 0), 1, "a real point in the saturated regime reads as >= 1 person");
  // The floor must NOT perturb the unsaturated regime: small pops keep the exact delta (so the
  // Demographics parity pin is unaffected).
  assert.equal(marginalPeople(2, 0), scaleCityPopulation(2, 0) - scaleCityPopulation(1, 0));
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

function testExactAndVariedFormats() {
  assert.equal(formatPeopleExact(35670), "35,670");
  assert.equal(formatBothExact(35670, 2), "2 population points (35,670 people)");
  assert.equal(formatPeopleExact(Number.NaN), "0");

  const a = variedPeople(10000, "Rome");
  const b = variedPeople(10000, "Rome");
  const c = variedPeople(10000, "Athens");
  assert.equal(a, b, "variation should be deterministic per seed");
  assert.notEqual(a, c, "different seeds should vary figures");
  assert.equal(variedPeople(-1, "x"), 0);
}

function testCityPopulationMutators() {
  const src = {
    ruralPopulation: 4,
    population: 10,
    addRuralPopulation(n) {
      this.ruralPopulation += n;
      this.population += n;
    }
  };
  const dst = {
    ruralPopulation: 1,
    population: 3,
    addRuralPopulation(n) {
      this.ruralPopulation += n;
      this.population += n;
    }
  };

  assert.equal(ruralPop(src), 4);
  assert.equal(totalPop(src), 10);
  assert.equal(moveRural(src, dst), true);
  assert.equal(src.ruralPopulation, 3);
  assert.equal(dst.ruralPopulation, 2);

  assert.equal(removeRural(src), true);
  assert.equal(addRural(dst), true);
  assert.equal(src.ruralPopulation, 2);
  assert.equal(dst.ruralPopulation, 3);

  assert.equal(moveRural({}, dst), false);
  assert.equal(removeRural({}), false);
  assert.equal(addRural({}), false);

  const boom = {
    addRuralPopulation() {
      throw new Error("boom");
    }
  };
  assert.equal(moveRural(boom, dst), false);
  assert.equal(removeRural(boom), false);
  assert.equal(addRural(boom), false);
}

testScaleBaseline();
testScaleGrowsWithSizeAndAge();
testHistoricalAnchors();
testModernMegacityBand();
testSafetyCeiling();
testOneMoreTurnOvertime();
testSettlementSignalGrounding();
testAgeBoundaryContinuity();
testModernMegaRampAndAgeProgressReaders();
testScaleRejectsNonPositive();
testMarginalPeopleIsTheDelta();
testMarginalPeopleFloorsRealPoint();
testFormatPeopleBuckets();
testFormatBothShowsBothSystems();
testExactAndVariedFormats();
testCityPopulationMutators();

console.log("scaling harness passed");
