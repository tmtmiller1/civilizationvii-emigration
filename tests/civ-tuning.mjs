import assert from "node:assert/strict";

// The resolver reads leader/civ type off a player and resolves a string name via
// GameInfo; here the lookup treats the type value AS the string for simplicity.
const LEADER = {};
const CIV = {};
const MEMENTOS = {};
globalThis.Players = { get: (pid) => ({ leaderType: LEADER[pid], civilizationType: CIV[pid] }) };
globalThis.GameInfo = {
  Leaders: { lookup: (lt) => (lt ? { LeaderType: lt } : null) },
  Civilizations: { lookup: (ct) => (ct ? { CivilizationType: ct } : null) }
};
globalThis.Online = {
  Metaprogression: {
    getEquippedMementos: (pid) => MEMENTOS[pid] || []
  }
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

function testBrushAndBladeEntries() {
  CONFIG.civTuningEnabled = true;
  LEADER[10] = "LEADER_HIMIKO"; // happiness magnet
  assert.equal(civTuning(10).happinessPull, 0.85);
  LEADER[11] = "LEADER_TOYOTOMI_HIDEYOSHI"; // fragile-on-defense conqueror
  assert.equal(civTuning(11).warRetention, 0.85);
  assert.equal(civTuning(11).assimilationEase, 1.2);
  CIV[12] = "CIVILIZATION_SENGOKU"; // defensive
  assert.equal(civTuning(12).warRetention, 1.4);
  CIV[13] = "CIVILIZATION_PIRATE_REPUBLIC"; // net source
  assert.equal(civTuning(13).sourceBias, -0.5);
  CIV[14] = "CIVILIZATION_OTTOMANS"; // multi-lever
  const ott = civTuning(14);
  assert.equal(ott.happinessPull, 0.85);
  assert.equal(ott.assimilationEase, 1.25);
  assert.equal(ott.overcrowdDiscount, 0.5);
}

function testUnknownIsNeutral() {
  CONFIG.civTuningEnabled = true;
  LEADER[6] = "LEADER_NOBODY";
  assert.equal(civTuning(6).happinessPull, 1);
  assert.equal(civTuning(6).sourceBias, 0);
}

// civTuningStrength compresses every field toward neutral; 0.5 lands halfway.
function testFlattenCompresses() {
  CONFIG.civTuningEnabled = true;
  CONFIG.civTuningStrength = 0.5;
  LEADER[7] = "LEADER_ISABELLA"; // happinessPull 0.85, assimilationEase 1.2
  CIV[7] = "CIVILIZATION_KHMER"; // sourceBias 1.5
  const t = civTuning(7);
  assert.equal(t.happinessPull, 0.925); // 1 + (0.85-1)*0.5
  assert.equal(t.assimilationEase, 1.1); // 1 + (1.2-1)*0.5
  assert.equal(t.sourceBias, 0.75); // 1.5*0.5
  CONFIG.civTuningStrength = 1;
}

// overcrowdDiscount lerps toward the global discount; a null entry stays null.
function testFlattenOvercrowd() {
  CONFIG.civTuningEnabled = true;
  CONFIG.civTuningStrength = 0.5;
  const prev = CONFIG.overcrowdDiscount;
  CONFIG.overcrowdDiscount = 0.3;
  CIV[8] = "CIVILIZATION_ABBASID"; // overcrowdDiscount 0.7 → 0.3 + (0.7-0.3)*0.5 = 0.5
  assert.equal(civTuning(8).overcrowdDiscount, 0.5);
  CIV[9] = "CIVILIZATION_NORMAN"; // no overcrowd override → stays null
  assert.equal(civTuning(9).overcrowdDiscount, null);
  CONFIG.overcrowdDiscount = prev;
  CONFIG.civTuningStrength = 1;
}

// Strength 0 fully flattens every entry back to neutral.
function testFlattenZeroIsNeutral() {
  CONFIG.civTuningEnabled = true;
  CONFIG.civTuningStrength = 0;
  CIV[15] = "CIVILIZATION_KHMER";
  LEADER[15] = "LEADER_ISABELLA";
  const t = civTuning(15);
  assert.equal(t.happinessPull, 1);
  assert.equal(t.assimilationEase, 1);
  assert.equal(t.sourceBias, 0);
  assert.equal(t.warRetention, 1);
  CONFIG.civTuningStrength = 1;
}

function testMementoEntryApplies() {
  CONFIG.civTuningEnabled = true;
  MEMENTOS[16] = [{ mementoTypeId: "MEMENTO_BENJAMIN_FRANKLIN_GLASS_ARMONICA" }];
  const t = civTuning(16);
  assert.equal(t.happinessPull, 0.9);
}

function testMementoAndLeaderCompose() {
  CONFIG.civTuningEnabled = true;
  LEADER[17] = "LEADER_ISABELLA"; // happinessPull 0.85, assimilationEase 1.2
  MEMENTOS[17] = [{ mementoTypeId: "MEMENTO_FOUNDATION_LYDIAN_LION" }]; // assimilationEase 1.1
  const t = civTuning(17);
  assert.equal(t.happinessPull, 0.85);
  assert.equal(t.assimilationEase, 1.32);
}

function testMementoParserAcceptsDifferentShapes() {
  CONFIG.civTuningEnabled = true;
  MEMENTOS[18] = [
    { mementoType: "MEMENTO_LAFAYETTE_LETTER_ADRIENNE" },
    { value: "MEMENTO_FOUNDATION_TRAVELS_MARCO_POLO" }
  ];
  const t = civTuning(18);
  assert.equal(t.happinessPull, 0.93);
  assert.equal(t.assimilationEase, 1.08);
}

function testMementoStackIsBounded() {
  CONFIG.civTuningEnabled = true;
  MEMENTOS[19] = [
    { id: "MEMENTO_FOUNDATION_LYDIAN_LION" },
    { id: "MEMENTO_FOUNDATION_TRAVELS_MARCO_POLO" },
    { id: "MEMENTO_AMINA_KWALKWALI" },
    { id: "MEMENTO_XERXES_KING_GOLDEN_SCEPTRE" },
    { id: "MEMENTO_XERXES_KING_LOTUS_BLOSSOM" }
  ];
  const t = civTuning(19);
  assert.ok(t.assimilationEase <= 1.35);
}

CONFIG.civTuningStrength = 1; // exact-value tests below assume the full table
testDisabledIsNeutral();
testLeaderEntryApplies();
testCivEntryApplies();
testAltPersonaNormalizes();
testLeaderOverridesCiv();
testBrushAndBladeEntries();
testUnknownIsNeutral();
testFlattenCompresses();
testFlattenOvercrowd();
testFlattenZeroIsNeutral();
testMementoEntryApplies();
testMementoAndLeaderCompose();
testMementoParserAcceptsDifferentShapes();
testMementoStackIsBounded();
CONFIG.civTuningEnabled = false;

console.log("civ-tuning harness passed");
