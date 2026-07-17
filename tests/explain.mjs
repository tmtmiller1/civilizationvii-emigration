import assert from "node:assert/strict";

// The push/pull explainer substrate (roadmap §15.0a). Pure and read-only: it decomposes the scores
// the sim already computes into labeled contributions.
//
// The load-bearing cases here are the RECONSTRUCTION ones. emigration-explain.js attributes by exact
// arithmetic over the same breakdowns the sim scores with, so its rows must add back up to the real
// adjustedPull() / prosperity() — if a term is ever added to one side and not the other, or an
// attribution is mis-scaled, these fail. That is the whole guard against an explanation drifting away
// from the decision it claims to explain, so do not relax them to "close enough".

// Deterministic deps: Manhattan hex distance, and the policy surface emigration-borders.js reads
// (Players → Culture → isTraditionActive over a "H_"-prefixed type hash, as tests/borders.mjs stubs
// it). ACTIVE starts empty, so no card is slotted unless a case slots one. No Game → no diplomacy.
globalThis.GameplayMap = { getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by) };
/** @type {Record<number, Set<string>>} pid → active tradition hashes. */
let ACTIVE = {};
globalThis.Players = {
  get: (pid) => ({ Culture: { isTraditionActive: (h) => !!(ACTIVE[pid] && ACTIVE[pid].has(h)) } })
};
globalThis.Database = { makeHash: (s) => "H_" + s };

const { explainPull, explainPush, weigh, factorLabel } = await import("/emigration/ui/emigration-explain.js");
const { adjustedPull } = await import("/emigration/ui/emigration-pull.js");
const { prosperity } = await import("/emigration/ui/emigration-prosperity.js");
const { resetBorderCache } = await import("/emigration/ui/emigration-borders.js");
const { addAssimilationLoad } = await import("/emigration/ui/emigration-effects.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

const OPEN = "H_TRADITION_EMIG_OPEN_BORDERS_MODERN";

/** Slot `hashes` for player 2 with borders on, run `fn`, and restore. */
function withOpenBorders(pid, hashes, fn) {
  CONFIG.bordersEnabled = true;
  ACTIVE[pid] = new Set(hashes);
  resetBorderCache(); // policyState memoizes per pass
  try {
    fn();
  } finally {
    CONFIG.bordersEnabled = false;
    ACTIVE = {};
    resetBorderCache();
  }
}

// Pin every knob the two formulas read, so the fixtures are stable against re-tuning.
Object.assign(CONFIG, {
  baseReluctance: 4,
  perExtraPop: 0.5,
  cityStateBarrier: 5,
  poachBlock: 12,
  refugeePoachBlock: 2,
  crisisEscapeBonus: 0,
  distanceFactor: 0.6,
  congestWeight: 0,
  antiSnowballWeight: 0,
  aggressorPenalty: 0,
  bordersEnabled: false,
  crossCivEnabled: true,
  tiltCap: 14,
  permeFloor: 0.25,
  permeCeil: 2,
  happinessShaped: false,
  overcrowdDiscount: 0,
  polityModelEnabled: false,
  warSiege: false,
  foodFactor: 1,
  productionFactor: 1,
  goldFactor: 1,
  scienceFactor: 0.25,
  cultureFactor: 0.5,
  localHappinessFactor: 6,
  populationFactor: 1,
  violencePerPoint: 8,
  violenceCapPct: 90,
  disasterPerPoint: 6,
  disasterCapPct: 80,
  siegeModifier: -60,
  starvationModifier: -25,
  unrestModifier: -20,
  violenceFleeThreshold: 3,
  disasterFleeThreshold: 3,
  unhappyCauseThreshold: -2
});

/** A destination/source signal in adjustedPull's shape. */
const sig = (owner, pros, population, x, y, over) =>
  Object.assign(
    { key: `${owner}:${x}:${y}:${pros}`, owner, pros, population, isCityState: false, rural: 5, city: { location: { x, y } } },
    over
  );

/** A CitySignal in prosperity's shape, with neutral situational flags. */
const city = (over) =>
  Object.assign(
    {
      food: 0, production: 0, gold: 0, science: 0, culture: 0,
      population: 5, urban: 0, happiness: 0, violence: 0, disaster: 0,
      siege: false, starving: false, unrest: false, owner: 1, city: { id: "c1" }
    },
    over
  );

const sum = (rows) => rows.filter((r) => r.kind !== "scale").reduce((a, r) => a + r.delta, 0);
const keys = (rows) => rows.map((r) => r.key);
const find = (rows, k) => rows.find((r) => r.key === k);

// ── The reconstruction identity: pull ───────────────────────────────────────

function testPullRowsReconstructAdjustedPull() {
  // A cross-civ, downhill-population, distant move: exercises gradient, reluctance, crowding,
  // the foreign-border block and distance all at once.
  const src = sig(1, 10, 5, 0, 0);
  const dest = sig(2, 40, 9, 3, 0);
  const rows = explainPull(src, dest, {});
  const real = adjustedPull(src, dest, null, null, null);
  assert.ok(real !== null, "fixture should be a viable move");
  assert.ok(Math.abs(sum(rows) - real) < 1e-9, `rows sum ${sum(rows)} should reconstruct adjustedPull ${real}`);
}

/** Every additive term pullBreakdown itemizes. If a term is added, this list must grow with it. */
const PULL_TERMS = ["gradient", "tilt", "reluctance", "crowding", "cityState", "crossCiv",
  "dominance", "distance", "aggressor", "flight", "congestion"];

function testPullReconstructionCoversEveryTermAtOnce() {
  // The case above leaves congestion, dominance, tilt, flight and aggressor at ZERO, and a term that
  // is zero in the fixture cannot be pinned by it — delete it from pullBreakdown and the sum still
  // reconstructs, so the mirror would drift undetected. This case turns every remaining channel on and
  // reconstructs again, then asserts each term is actually present: a term that adjustedPull scores
  // and pullBreakdown forgets (or vice versa) fails here, and a fixture that quietly stops exercising
  // one fails too.
  Object.assign(CONFIG, { congestWeight: 0.5, antiSnowballWeight: 2, antiSnowballThreshold: 1,
    antiSnowballExponent: 1, aggressorPenalty: 3, asylumPushWeight: 2, fleeFactor: 3,
    assimilationLoadPerMigrant: 1, assimilationCostPerPop: 0.1 });
  globalThis.Game = { turn: 10 };
  addAssimilationLoad(2, 10); // congestion reads accrued integration load, which is empty by default
  // Asylum is what makes tiltFor non-zero, and disaster 9 × weight 2 = 18 overruns tiltCap 14, so the
  // clamp binds — dropping the clamp changes the answer, which is what pins it.
  withOpenBorders(2, [OPEN, "H_TRADITION_EMIG_ASYLUM_MODERN"], () => {
    // A source under both disaster and attack (tilt via asylum; violence over the flee threshold is
    // what arms directional flight — disaster alone does not), running toward a big civ (dominance)
    // that happens to BE its aggressor (the aggressor term only fires on the attacker's own cities),
    // into a congested, crowded city-state.
    const src = sig(1, 10, 5, 0, 0, { disaster: 9, violence: 6 });
    const dest = sig(2, 60, 9, 4, 2, { isCityState: true });
    const ctx = { flee: { x: 1, y: 1 }, ownerPop: { 1: 10, 2: 400 }, aggressors: new Set([2]) };
    const rows = explainPull(src, dest, ctx);
    const real = adjustedPull(src, dest, ctx.flee, ctx.ownerPop, ctx.aggressors);
    assert.ok(real !== null, "fixture should be a viable move");
    assert.ok(Math.abs(sum(rows) - real) < 1e-9, `rows sum ${sum(rows)} should reconstruct ${real}`);
    for (const k of PULL_TERMS) {
      assert.ok(find(rows, k), `fixture should exercise the ${k} term, got ${keys(rows)}`);
    }
  });
  Object.assign(CONFIG, { congestWeight: 0, antiSnowballWeight: 0, aggressorPenalty: 0 });
  delete globalThis.Game;
}

function testPullReconstructionHoldsUnderAPermeabilityMultiplier() {
  // With borders on, every additive row is scaled by the clamped permeability. The sum must still
  // land on adjustedPull — this is what catches an attribution that forgets the multiply.
  withOpenBorders(2, [OPEN], () => {
    const src = sig(1, 10, 5, 0, 0);
    const dest = sig(2, 40, 5, 1, 0);
    const rows = explainPull(src, dest, {});
    const real = adjustedPull(src, dest, null, null, null);
    assert.ok(real !== null, "fixture should be a viable move");
    assert.ok(Math.abs(sum(rows) - real) < 1e-9, `rows sum ${sum(rows)} should reconstruct ${real}`);
  });
}

function testPermeabilityRowIsReportedAsAScaleAndExcludedFromTheSum() {
  withOpenBorders(2, [OPEN], () => {
    const rows = explainPull(sig(1, 10, 5, 0, 0), sig(2, 40, 5, 1, 0), {});
    const perm = find(rows, "permeability");
    assert.ok(perm, "an open-borders destination should report its permeability");
    assert.equal(perm.kind, "scale");
    assert.ok(perm.factor > 1, "Open Borders should read as a multiplier above 1");
    // It is a multiplier, not an addend: weigh() must not count it.
    assert.equal(weigh(rows).some((r) => r.key === "permeability"), false);
  });
}

function testNeutralPermeabilityReportsNoScaleRow() {
  // Borders off → the multiplier is exactly 1 → there is nothing to say about it.
  const rows = explainPull(sig(1, 10, 5, 0, 0), sig(1, 40, 5, 0, 0), {});
  assert.equal(find(rows, "permeability"), undefined);
}

// ── The reconstruction identity: push ───────────────────────────────────────

function testPushRowsReconstructProsperity() {
  // Positive base × situational penalties: the ordinary case, where the attribution is exact.
  const s = city({ food: 20, production: 20, gold: 10, happiness: 4, violence: 2, unrest: true });
  const rows = explainPush(s, null);
  const real = prosperity(s, null);
  assert.ok(Math.abs(sum(rows) - real) < 1e-9, `rows sum ${sum(rows)} should reconstruct prosperity ${real}`);
}

function testPushReconstructionHoldsUnderTheShapedHappinessModel() {
  // The shaped model routes happiness through a bounded multiplier on the economy. The decomposition
  // keeps that multiply inside the economy term precisely so this identity survives it.
  CONFIG.happinessShaped = true;
  try {
    const s = city({ food: 30, production: 10, happiness: 6, disaster: 2 });
    const rows = explainPush(s, { meanHappiness: 1 });
    const real = prosperity(s, { meanHappiness: 1 });
    assert.ok(Math.abs(sum(rows) - real) < 1e-9, `rows sum ${sum(rows)} should reconstruct ${real}`);
  } finally {
    CONFIG.happinessShaped = false;
  }
}

function testPushRanksTheDominantCrisisFirstAmongThePushes() {
  // Note what is NOT asserted: that violence is the top row overall. For any city worth living in the
  // economy term is the largest single component of prosperity, and it is a PULL. "Why are people
  // leaving" is answered by the negative rows, so that is what is ranked here.
  const s = city({ food: 40, production: 40, violence: 6, unrest: true });
  const pushes = explainPush(s, null).filter((r) => r.kind === "push");
  assert.equal(pushes[0].key, "violence", `expected fighting to lead the pushes, got ${keys(pushes)}`);
  // Heavy fighting must outweigh mere unrest, or the advisor built on this would misdirect.
  assert.ok(Math.abs(find(pushes, "violence").delta) > Math.abs(find(pushes, "unrest").delta));
}

function testPushReportsRetainingFactorsAsPull() {
  // A thriving city: its economy is what holds people. A fixed kind:"push" would have to call the
  // economy a push, which is what an advisor would then recommend "fixing".
  const rows = explainPush(city({ food: 40, production: 40, happiness: 5 }), null);
  const econ = find(rows, "economy");
  assert.ok(econ && econ.kind === "pull", "a strong economy should read as a pull, not a push");
}

function testPenaltiesStayPushesWhenTheBaseHasGoneNegative() {
  // A poor, unhappy, crowded city has a NEGATIVE base. A signed multiply would flip its siege into a
  // positive "attraction" (the same pathology the model's F2 guard exists for). Every penalty must
  // still read as a push.
  const s = city({ food: 0, production: 0, happiness: -8, population: 12, siege: true, unrest: true });
  const rows = explainPush(s, null);
  for (const k of ["siege", "unrest"]) {
    const r = find(rows, k);
    assert.ok(r, `expected a ${k} row`);
    assert.equal(r.kind, "push", `${k} must never read as a pull on a negative-base city`);
  }
}

// ── Ordering, weighting, and the honesty rule ───────────────────────────────

function testRowsAreSortedByMagnitude() {
  const rows = explainPull(sig(1, 10, 5, 0, 0), sig(2, 60, 9, 4, 0), {});
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].kind === "scale") continue;
    assert.ok(
      Math.abs(rows[i - 1].delta) >= Math.abs(rows[i].delta),
      `rows should descend by magnitude: ${keys(rows)}`
    );
  }
}

function testWeightsNormalizeToOne() {
  const w = weigh(explainPush(city({ food: 20, production: 20, violence: 4, unrest: true }), null));
  const total = w.reduce((a, r) => a + r.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights should sum to 1, got ${total}`);
  assert.ok(w.every((r) => r.weight >= 0 && r.weight <= 1));
}

function testWeightsRankTheSameAsDeltas() {
  const rows = explainPush(city({ food: 20, production: 20, violence: 6, unrest: true }), null);
  const w = weigh(rows);
  assert.deepEqual(keys(w), keys(rows.filter((r) => r.kind !== "scale")));
}

function testWeighIsEmptyForNothingToExplain() {
  assert.deepEqual(weigh([]), []);
  assert.deepEqual(weigh(null), []);
  // Rows that cancel to zero total movement have no meaningful ratios.
  assert.deepEqual(weigh([{ key: "x", label: "x", delta: 0, kind: "pull" }]), []);
}

// ── Edge inputs: never throw, explain nothing rather than guess ─────────────

function testUnviableMoveExplainsNothing() {
  // Downhill prosperity → adjustedPull is null → there is no decision to explain.
  const src = sig(1, 40, 5, 0, 0);
  const dest = sig(1, 10, 5, 0, 0);
  assert.equal(adjustedPull(src, dest, null, null, null), null);
  assert.deepEqual(explainPull(src, dest, {}), []);
}

function testSameCityExplainsNothing() {
  const s = sig(1, 10, 5, 0, 0);
  assert.deepEqual(explainPull(s, s, {}), []);
}

function testCrossCivMoveExplainsNothingWhenCrossCivIsOff() {
  CONFIG.crossCivEnabled = false;
  try {
    assert.deepEqual(explainPull(sig(1, 10, 5, 0, 0), sig(2, 40, 5, 0, 0), {}), []);
  } finally {
    CONFIG.crossCivEnabled = true;
  }
}

function testNullInputsYieldEmptyAndNeverThrow() {
  assert.deepEqual(explainPull(null, sig(1, 10, 5, 0, 0), {}), []);
  assert.deepEqual(explainPull(sig(1, 10, 5, 0, 0), null, {}), []);
  assert.deepEqual(explainPush(null), []);
  assert.deepEqual(explainPush(undefined, null), []);
}

function testMissingContextIsTreatedAsAbsentNotAsAThrow() {
  const rows = explainPull(sig(1, 10, 5, 0, 0), sig(1, 40, 5, 2, 0));
  assert.ok(rows.length > 0, "an omitted ctx should still explain a viable same-civ move");
}

function testContentCityHasNoCrisisRows() {
  const rows = explainPush(city({ food: 20, production: 20, happiness: 2 }), null);
  for (const k of ["violence", "disaster", "siege", "starvation", "unrest"]) {
    assert.equal(find(rows, k), undefined, `a content city should report no ${k} row`);
  }
}

function testZeroTermsAreDroppedRatherThanRenderedAsNoise() {
  // Equal populations → no crowding term at all, rather than a "0" row a surface would have to hide.
  const rows = explainPull(sig(1, 10, 5, 0, 0), sig(1, 40, 5, 0, 0), {});
  assert.equal(find(rows, "crowding"), undefined);
}

// ── Labels ─────────────────────────────────────────────────────────────────

function testEveryTermKeyHasALabel() {
  const rows = explainPull(sig(1, 10, 5, 0, 0), sig(2, 60, 9, 4, 0), {})
    .concat(explainPush(city({ food: 20, violence: 4, unrest: true, siege: true, starving: true }), null));
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(r.label && r.label !== r.key, `term ${r.key} should carry a human label, got "${r.label}"`);
  }
}

function testUnknownKeyFallsBackToItselfRatherThanThrowing() {
  assert.equal(factorLabel("not-a-term"), "not-a-term");
}

const tests = [
  testPullRowsReconstructAdjustedPull,
  testPullReconstructionCoversEveryTermAtOnce,
  testPullReconstructionHoldsUnderAPermeabilityMultiplier,
  testPermeabilityRowIsReportedAsAScaleAndExcludedFromTheSum,
  testNeutralPermeabilityReportsNoScaleRow,
  testPushRowsReconstructProsperity,
  testPushReconstructionHoldsUnderTheShapedHappinessModel,
  testPushRanksTheDominantCrisisFirstAmongThePushes,
  testPushReportsRetainingFactorsAsPull,
  testPenaltiesStayPushesWhenTheBaseHasGoneNegative,
  testRowsAreSortedByMagnitude,
  testWeightsNormalizeToOne,
  testWeightsRankTheSameAsDeltas,
  testWeighIsEmptyForNothingToExplain,
  testUnviableMoveExplainsNothing,
  testSameCityExplainsNothing,
  testCrossCivMoveExplainsNothingWhenCrossCivIsOff,
  testNullInputsYieldEmptyAndNeverThrow,
  testMissingContextIsTreatedAsAbsentNotAsAThrow,
  testContentCityHasNoCrisisRows,
  testZeroTermsAreDroppedRatherThanRenderedAsNoise,
  testEveryTermKeyHasALabel,
  testUnknownKeyFallsBackToItselfRatherThanThrowing
];

for (const t of tests) t();
console.log(`explain harness passed (${tests.length} cases)`);
