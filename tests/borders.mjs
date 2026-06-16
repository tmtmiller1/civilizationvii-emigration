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

const { immigrationOpenness, emigrationRetention } = await import("/emigration/ui/emigration-borders.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

const close = (a, b) => Math.abs(a - b) < 1e-9;

function testNeutralWhenOff() {
  CONFIG.bordersEnabled = false;
  ACTIVE[1] = new Set(["H_TRADITION_EMIG_CLOSED_BORDERS_ANTIQUITY"]);
  assert.equal(immigrationOpenness(1), 1); // feature off → no effect even with a card slotted
}

function testNeutralWithNoCard() {
  CONFIG.bordersEnabled = true;
  ACTIVE[2] = new Set();
  assert.equal(immigrationOpenness(2), 1); // no Open/Closed card → neutral
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

testNeutralWhenOff();
testNeutralWithNoCard();
testClosedBordersThrottles();
testOpenBordersBoosts();
testOpennessFloor();
testRetentionNeutralWhenOff();
testClosedBordersRetains();
testNoRetentionWithoutClosed();

CONFIG.bordersEnabled = false;
console.log("borders harness passed");
