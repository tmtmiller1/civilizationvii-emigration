import assert from "node:assert/strict";

// Stub the engine surface the disasters module polls.
let TURN = 1;
globalThis.Game = {
  get turn() {
    return TURN;
  }
};
globalThis.ComponentID = { toBitfield: (cid) => (cid ? cid.owner * 1000 + cid.id : 0) };
const KV = {};
KV["EmigrationDisaster_v1"] = JSON.stringify({
  byCity: { "0:9": 5, bad: -2 },
  typeByCity: { "0:9": "RANDOM_EVENT_TEST" },
  observedTurn: { "0:9": 1 },
  decayTurn: 1
});
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

const { observeDisaster, tickDisasters, recordDisaster, disasterKey } = await import(
  "/emigration/ui/emigration-disasters.js"
);
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

const close = (a, b) => Math.abs(a - b) < 1e-9;
const cityA = { id: { owner: 0, id: 1 }, owner: 0, isInfected: false };
const cityLegacy = { id: { owner: 0, id: 9 }, owner: 0, isInfected: false };

function step(city, n) {
  TURN = n;
  tickDisasters();
  return observeDisaster(city);
}

function testDisabledIsInert() {
  CONFIG.disastersEnabled = false;
  cityA.isInfected = true;
  assert.equal(observeDisaster(cityA), 0); // off → no distress, no state
}

function testLegacyStateLoads() {
  CONFIG.disastersEnabled = true;
  const v = observeDisaster(cityLegacy);
  assert.ok(v >= 0, "legacy persisted distress should be readable");
}

function testInfectedAccruesDistress() {
  CONFIG.disastersEnabled = true;
  CONFIG.disasterPlagueWeight = 8;
  cityA.isInfected = true;
  assert.ok(close(step(cityA, 2), 8)); // one infected turn → +8
}

function testIdempotentWithinTurn() {
  assert.ok(close(observeDisaster(cityA), 8)); // re-poll same turn must not re-add
}

function testStandingPlagueAccumulatesThenDecays() {
  CONFIG.disasterDecay = 0.5;
  // turn 3: prior 8 decays ×0.5 = 4, plus a fresh infected +8 = 12.
  assert.ok(close(step(cityA, 3), 12));
  cityA.isInfected = false; // outbreak ends
  // turn 4: 12 decays ×0.5 = 6, no fresh add.
  assert.ok(close(step(cityA, 4), 6));
}

function testEventSpikeScalesBySeverity() {
  const key = disasterKey(cityA);
  const before = observeDisaster(cityA);
  recordDisaster("CLASS_VOLCANO", 2, [key]); // 12 × 2 = +24
  assert.ok(close(observeDisaster(cityA) - before, 24));
}

function testPersistWritesSchemaEnvelope() {
  const persisted = JSON.parse(KV["EmigrationDisaster_v1"]);
  assert.equal(persisted.v, 2, "disaster state should persist as schema envelope");
  assert.ok(persisted.data && persisted.data.byCity, "envelope should include data.byCity");
}

testDisabledIsInert();
testLegacyStateLoads();
testInfectedAccruesDistress();
testIdempotentWithinTurn();
testStandingPlagueAccumulatesThenDecays();
testEventSpikeScalesBySeverity();
testPersistWritesSchemaEnvelope();

CONFIG.disastersEnabled = false; // restore default
console.log("disasters harness passed");
