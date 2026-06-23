import assert from "node:assert/strict";

// emigration-polity reads the 1.4.1 happiness-stage / government / celebration / war-weariness signals
// off live game globals. Stub them the way civ-tuning's test does (the lookup treats the type value AS
// the string). The HappinessStages table mirrors the real 1.4.1 Antiquity thresholds.
const HAPPINESS_STAGES = [
  { HappinessStageType: "HAPPINESS_STAGE_ECSTATIC", StageMinThreshold: 40, StageMaxThreshold: Infinity },
  { HappinessStageType: "HAPPINESS_STAGE_JOYOUS", StageMinThreshold: 20, StageMaxThreshold: 40 },
  { HappinessStageType: "HAPPINESS_STAGE_HAPPY", StageMinThreshold: 0, StageMaxThreshold: 20 },
  { HappinessStageType: "HAPPINESS_STAGE_UNHAPPY", StageMinThreshold: -20, StageMaxThreshold: 0 },
  { HappinessStageType: "HAPPINESS_STAGE_ANGRY", StageMinThreshold: -Infinity, StageMaxThreshold: -20 }
];

// Per-player state the stubbed globals expose. Tests mutate these.
const GOV = {}; // pid → government type id
const HAP = {}; // pid → { isInGoldenAge, goldenAgeTurnsLeft, hasWarWeariness }

globalThis.GameInfo = {
  HappinessStages: { forEach: (fn) => HAPPINESS_STAGES.forEach(fn) },
  Governments: { lookup: (g) => (g ? { GovernmentType: g } : null) }
};
globalThis.Players = {
  get: (pid) => ({
    Culture: { getGovernmentType: () => GOV[pid] },
    Happiness: HAP[pid] || {}
  })
};

const { cityHappinessStage, readPolity, resetPolityCache, governmentLean } = await import(
  "/emigration/ui/emigration-polity.js"
);

/** A city whose Happiness.netHappinessPerTurn is `h`. */
function city(h) {
  return { Happiness: { netHappinessPerTurn: h } };
}

function testStageBucketing() {
  assert.equal(cityHappinessStage(city(60)), 2); // ECSTATIC
  assert.equal(cityHappinessStage(city(40)), 2); // boundary → ECSTATIC (min inclusive)
  assert.equal(cityHappinessStage(city(25)), 1); // JOYOUS
  assert.equal(cityHappinessStage(city(10)), 0); // HAPPY
  assert.equal(cityHappinessStage(city(0)), 0); // boundary 0 → HAPPY (its min is inclusive)
  assert.equal(cityHappinessStage(city(-10)), -1); // UNHAPPY
  assert.equal(cityHappinessStage(city(-50)), -2); // ANGRY
}

function testStageNeutralWhenUnreadable() {
  assert.equal(cityHappinessStage(null), 0);
  assert.equal(cityHappinessStage({}), 0); // no Happiness component
  assert.equal(cityHappinessStage(city(NaN)), 0); // non-finite happiness
}

function testReadPolityExtractsAll() {
  resetPolityCache();
  GOV[1] = "GOVERNMENT_DESPOTISM";
  HAP[1] = { isInGoldenAge: true, goldenAgeTurnsLeft: 4, hasWarWeariness: true };
  const p = readPolity(1);
  assert.equal(p.government, "GOVERNMENT_DESPOTISM");
  assert.equal(p.celebrating, true);
  assert.equal(p.goldenAgeTurnsLeft, 4);
  assert.equal(p.warWeary, true);
}

function testReadPolityNeutralDefaults() {
  resetPolityCache();
  HAP[2] = {}; // no golden-age / war-weariness fields, no government
  const p = readPolity(2);
  assert.equal(p.government, "");
  assert.equal(p.celebrating, false);
  assert.equal(p.goldenAgeTurnsLeft, 0);
  assert.equal(p.warWeary, false);
}

function testReadPolityMemoizesPerPass() {
  resetPolityCache();
  GOV[3] = "GOVERNMENT_OLIGARCHY";
  const first = readPolity(3);
  GOV[3] = "GOVERNMENT_AUTHORITARIANISM"; // changes underneath
  const second = readPolity(3);
  assert.equal(second.government, "GOVERNMENT_OLIGARCHY"); // memoized: same object, not re-read
  assert.equal(first, second);
  resetPolityCache();
  assert.equal(readPolity(3).government, "GOVERNMENT_AUTHORITARIANISM"); // re-read after reset
}

function testGovernmentLean() {
  assert.equal(governmentLean("GOVERNMENT_CLASSICAL_REPUBLIC"), 1);
  assert.equal(governmentLean("GOVERNMENT_AUTHORITARIANISM"), -1);
  assert.equal(governmentLean("GOVERNMENT_OLIGARCHY"), 0);
  assert.equal(governmentLean("GOVERNMENT_MODDED_UNKNOWN"), 0);
  assert.equal(governmentLean(""), 0);
}

testStageBucketing();
testStageNeutralWhenUnreadable();
testReadPolityExtractsAll();
testReadPolityNeutralDefaults();
testReadPolityMemoizesPerPass();
testGovernmentLean();

console.log("polity harness passed");
