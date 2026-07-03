import assert from "node:assert/strict";

// Stub the Culture / policy surface emigration-borders.js reads. Governments no longer
// factor into emigration (the Open/Closed Borders cards are the whole mechanic), and the
// cards' Influence is a native DB modifier - so this only exercises the immigration-openness
// multiplier the engine reads.
let ACTIVE = {}; // pid → Set of active tradition hashes
globalThis.Players = {
  get: (pid) => ({
    Culture: { isTraditionActive: (h) => !!(ACTIVE[pid] && ACTIVE[pid].has(h)) }
  })
};
globalThis.Database = { makeHash: (s) => "H_" + s }; // hash = "H_" + type string

const { immigrationOpenness, emigrationRetention, borderStance, resetBorderCache } = await import(
  "/emigration/ui/emigration-borders.js"
);
const { activeAttractions, hasAsylum, __test } = await import("/emigration/ui/emigration-borders.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

const OPEN = "H_TRADITION_EMIG_OPEN_BORDERS_MODERN";
const CLOSED = "H_TRADITION_EMIG_CLOSED_BORDERS_MODERN";

const close = (a, b) => Math.abs(a - b) < 1e-9;

function testNeutralWhenOff() {
  CONFIG.bordersEnabled = false;
  ACTIVE[1] = new Set(["H_TRADITION_EMIG_CLOSED_BORDERS_ANTIQUITY"]);
  assert.equal(immigrationOpenness(1), 1); // feature off → no effect even with a card slotted
  assert.equal(borderStance(1), "none");
}

function testNeutralWithNoCard() {
  CONFIG.bordersEnabled = true;
  ACTIVE[2] = new Set();
  assert.equal(immigrationOpenness(2), 1); // no Open/Closed card → neutral
}

function testNeutralFlooredAboveOne() {
  CONFIG.bordersEnabled = true;
  CONFIG.opennessFloor = 1.2;
  ACTIVE[14] = new Set();
  assert.equal(immigrationOpenness(14), 1.2); // neutral is max(opennessFloor, 1)
}

function testClosedBordersThrottles() {
  CONFIG.bordersEnabled = true;
  CONFIG.closedBordersOpenness = 0.4;
  CONFIG.opennessFloor = 0.15;
  ACTIVE[3] = new Set(["H_TRADITION_EMIG_CLOSED_BORDERS_ANTIQUITY"]);
  assert.ok(close(immigrationOpenness(3), 0.4));
}

function testOpenBordersBoosts() {
  CONFIG.bordersEnabled = true;
  CONFIG.openBordersOpenness = 1.5;
  ACTIVE[4] = new Set(["H_TRADITION_EMIG_OPEN_BORDERS_EXPLORATION"]);
  assert.ok(close(immigrationOpenness(4), 1.5));
}

function testOpennessFloor() {
  CONFIG.bordersEnabled = true;
  CONFIG.closedBordersOpenness = 0.1;
  CONFIG.opennessFloor = 0.15;
  ACTIVE[5] = new Set(["H_TRADITION_EMIG_CLOSED_BORDERS_MODERN"]);
  assert.ok(close(immigrationOpenness(5), 0.15)); // 0.1 floored up to 0.15
}

// ── Emigration retention: Closed Borders keeps your own people from leaving for rivals ──

function testRetentionNeutralWhenOff() {
  CONFIG.bordersEnabled = false;
  ACTIVE[6] = new Set(["H_TRADITION_EMIG_CLOSED_BORDERS_ANTIQUITY"]);
  assert.equal(emigrationRetention(6), 1); // feature off → no retention even with the card
}

function testClosedBordersRetains() {
  CONFIG.bordersEnabled = true;
  CONFIG.closedBordersRetention = 0.6;
  ACTIVE[7] = new Set(["H_TRADITION_EMIG_CLOSED_BORDERS_MODERN"]);
  assert.ok(close(emigrationRetention(7), 0.6)); // Closed → outbound cross-civ pull ×0.6
}

function testNoRetentionWithoutClosed() {
  CONFIG.bordersEnabled = true;
  ACTIVE[8] = new Set(["H_TRADITION_EMIG_OPEN_BORDERS_MODERN"]); // Open does not retain
  assert.equal(emigrationRetention(8), 1);
  ACTIVE[9] = new Set();
  assert.equal(emigrationRetention(9), 1); // no card → neutral
}

// ── Both cards slotted: Open and Closed cancel each other out → fully neutral ──

function testBothBordersCancelOut() {
  CONFIG.bordersEnabled = true;
  CONFIG.closedBordersOpenness = 0.4;
  CONFIG.openBordersOpenness = 1.5;
  CONFIG.closedBordersRetention = 0.6;
  ACTIVE[10] = new Set([OPEN, CLOSED]); // both slotted simultaneously
  resetBorderCache();
  assert.equal(immigrationOpenness(10), 1, "Open + Closed cancel → neutral openness");
  assert.equal(borderStance(10), "none", "Open + Closed cancel → no stance");
  assert.equal(emigrationRetention(10), 1, "Open + Closed cancel → no retention");
}

function testStanceSingleCard() {
  CONFIG.bordersEnabled = true;
  ACTIVE[11] = new Set([OPEN]);
  ACTIVE[12] = new Set([CLOSED]);
  resetBorderCache();
  assert.equal(borderStance(11), "pro");
  assert.equal(borderStance(12), "anti");
}

function testAttractionFamiliesResolveToYieldKeys() {
  ACTIVE[15] = new Set([
    "H_TRADITION_EMIG_TALENT_EXPLORATION",
    "H_TRADITION_EMIG_TALENT_MODERN",
    "H_TRADITION_EMIG_CULTPULL_MODERN",
    "H_TRADITION_EMIG_CULTPULL_EXPLORATION",
    "H_TRADITION_EMIG_TRADEPULL_EXPLORATION",
    "H_TRADITION_EMIG_TRADEPULL_MODERN"
  ]);
  resetBorderCache();
  assert.deepEqual(activeAttractions(15), ["YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_GOLD"]);
}

function testAsylumAndAttractionDefaults() {
  ACTIVE[16] = new Set(["H_TRADITION_EMIG_ASYLUM_MODERN"]);
  ACTIVE[17] = new Set();
  resetBorderCache();
  assert.equal(hasAsylum(16), true);
  assert.equal(hasAsylum(17), false);
  assert.deepEqual(activeAttractions(17), []);
}

function testAllAgesResolveForPolicyFamilies() {
  CONFIG.bordersEnabled = true;
  CONFIG.openBordersOpenness = 1.5;
  CONFIG.closedBordersOpenness = 0.4;

  const openAges = [
    "H_TRADITION_EMIG_OPEN_BORDERS_ANTIQUITY",
    "H_TRADITION_EMIG_OPEN_BORDERS_EXPLORATION",
    "H_TRADITION_EMIG_OPEN_BORDERS_MODERN"
  ];
  const closedAges = [
    "H_TRADITION_EMIG_CLOSED_BORDERS_ANTIQUITY",
    "H_TRADITION_EMIG_CLOSED_BORDERS_EXPLORATION",
    "H_TRADITION_EMIG_CLOSED_BORDERS_MODERN"
  ];
  const asylumAges = [
    "H_TRADITION_EMIG_ASYLUM_EXPLORATION",
    "H_TRADITION_EMIG_ASYLUM_MODERN"
  ];

  let pid = 30;
  for (const h of openAges) {
    ACTIVE[pid] = new Set([h]);
    resetBorderCache();
    assert.ok(close(immigrationOpenness(pid), 1.5));
    pid++;
  }
  for (const h of closedAges) {
    ACTIVE[pid] = new Set([h]);
    resetBorderCache();
    assert.ok(close(immigrationOpenness(pid), 0.4));
    pid++;
  }
  for (const h of asylumAges) {
    ACTIVE[pid] = new Set([h]);
    resetBorderCache();
    assert.equal(hasAsylum(pid), true);
    pid++;
  }
}

function testAllAgesResolveForAttractionFamilies() {
  const attractionAges = [
    ["H_TRADITION_EMIG_TALENT_EXPLORATION", "H_TRADITION_EMIG_TALENT_MODERN", "YIELD_SCIENCE"],
    ["H_TRADITION_EMIG_CULTPULL_EXPLORATION", "H_TRADITION_EMIG_CULTPULL_MODERN", "YIELD_CULTURE"],
    ["H_TRADITION_EMIG_TRADEPULL_EXPLORATION", "H_TRADITION_EMIG_TRADEPULL_MODERN", "YIELD_GOLD"]
  ];

  let pid = 50;
  for (const [a, b, yieldKey] of attractionAges) {
    for (const h of [a, b]) {
      ACTIVE[pid] = new Set([h]);
      resetBorderCache();
      assert.deepEqual(activeAttractions(pid), [yieldKey]);
      pid++;
    }
  }
}

function testHashCacheSurvivesMissingDatabaseAfterWarmup() {
  CONFIG.bordersEnabled = true;
  CONFIG.openBordersOpenness = 1.5;
  const openHash = "H_TRADITION_EMIG_OPEN_BORDERS_ANTIQUITY";
  globalThis.Database = {
    makeHash: (s) => "H_" + s
  };
  ACTIVE[70] = new Set([openHash]);
  resetBorderCache();
  assert.ok(close(immigrationOpenness(70), 1.5));

  // After warmup, hashFor should use the cached hash even if DB hash API breaks.
  globalThis.Database.makeHash = () => {
    throw new Error("hash backend unavailable");
  };
  resetBorderCache();
  assert.ok(close(immigrationOpenness(70), 1.5));
}

// ── Per-pass cache: a civ's slotted cards are read once per pass and held until reset ──

function testBorderCacheHoldsUntilReset() {
  CONFIG.bordersEnabled = true;
  CONFIG.closedBordersOpenness = 0.4;
  CONFIG.opennessFloor = 0.15;
  resetBorderCache();
  ACTIVE[13] = new Set([CLOSED]);
  assert.ok(close(immigrationOpenness(13), 0.4), "first read sees the Closed card");
  ACTIVE[13] = new Set(); // policy changes mid-pass...
  assert.ok(close(immigrationOpenness(13), 0.4), "...but the cached value holds within the pass");
  resetBorderCache(); // next pass
  assert.equal(immigrationOpenness(13), 1, "after reset the fresh (empty) policy is read");
}

testNeutralWhenOff();
testNeutralWithNoCard();
testNeutralFlooredAboveOne();
testClosedBordersThrottles();
testOpenBordersBoosts();
testOpennessFloor();
testRetentionNeutralWhenOff();
testClosedBordersRetains();
testNoRetentionWithoutClosed();
testBothBordersCancelOut();
testStanceSingleCard();
testAttractionFamiliesResolveToYieldKeys();
testAsylumAndAttractionDefaults();
testAllAgesResolveForPolicyFamilies();
testAllAgesResolveForAttractionFamilies();
testHashCacheSurvivesMissingDatabaseAfterWarmup();
testBorderCacheHoldsUntilReset();

__test.clearHashCache();
const priorDatabase = globalThis.Database;
delete globalThis.Database;
resetBorderCache();
assert.equal(immigrationOpenness(71), 1);
assert.equal(borderStance(71), "none");
globalThis.Database = priorDatabase;

const priorPlayers = globalThis.Players;
delete globalThis.Players;
resetBorderCache();
assert.equal(borderStance(80), "none");
assert.equal(hasAsylum(80), false);
assert.equal(activeAttractions(80).length, 0);
globalThis.Players = priorPlayers;

CONFIG.bordersEnabled = false;
console.log("borders harness passed");
