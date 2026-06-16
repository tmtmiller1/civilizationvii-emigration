import assert from "node:assert/strict";

// The resolver reads leader/civ type off a player and resolves a string name via
// GameInfo; here the lookup treats the type value AS the string for simplicity.
const LEADER = {};
const CIV = {};
globalThis.Players = { get: (pid) => ({ leaderType: LEADER[pid], civilizationType: CIV[pid] }) };
globalThis.GameInfo = {
  Leaders: { lookup: (lt) => (lt ? { LeaderType: lt } : null) },
  Civilizations: { lookup: (ct) => (ct ? { CivilizationType: ct } : null) }
};

const { civTuning } = await import("/emigration/ui/emigration-civ-tuning.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

function testDisabledIsNeutral() {
  CONFIG.civTuningEnabled = false;
  LEADER[1] = "LEADER_ISABELLA";
  const t = civTuning(1);
  assert.equal(t.happinessPull, 1);
  assert.equal(t.assimilationEase, 1);
  assert.equal(t.sourceBias, 0);
  assert.equal(t.overcrowdDiscount, null);
}

function testLeaderEntryApplies() {
  CONFIG.civTuningEnabled = true;
  LEADER[2] = "LEADER_ISABELLA";
  const t = civTuning(2);
  assert.equal(t.happinessPull, 0.85);
  assert.equal(t.assimilationEase, 1.2);
}

function testCivEntryApplies() {
  CONFIG.civTuningEnabled = true;
  CIV[3] = "CIVILIZATION_NORMAN";
  const t = civTuning(3);
  assert.equal(t.warRetention, 1.4);
  assert.equal(t.happinessPull, 1); // untouched
}

function testAltPersonaNormalizes() {
  CONFIG.civTuningEnabled = true;
  LEADER[4] = "LEADER_ASHOKA_ALT"; // normalizes to LEADER_ASHOKA
  assert.equal(civTuning(4).happinessPull, 0.9);
}

function testLeaderOverridesCiv() {
  CONFIG.civTuningEnabled = true;
  LEADER[5] = "LEADER_ISABELLA"; // happinessPull 0.85, ease 1.2
  CIV[5] = "CIVILIZATION_KHMER"; // sourceBias 1.5
  const t = civTuning(5);
  assert.equal(t.sourceBias, 1.5); // from civ
  assert.equal(t.happinessPull, 0.85); // from leader
  assert.equal(t.assimilationEase, 1.2);
}

function testUnknownIsNeutral() {
  CONFIG.civTuningEnabled = true;
  LEADER[6] = "LEADER_NOBODY";
  assert.equal(civTuning(6).happinessPull, 1);
  assert.equal(civTuning(6).sourceBias, 0);
}

testDisabledIsNeutral();
testLeaderEntryApplies();
testCivEntryApplies();
testAltPersonaNormalizes();
testLeaderOverridesCiv();
testUnknownIsNeutral();
CONFIG.civTuningEnabled = false;

console.log("civ-tuning harness passed");
