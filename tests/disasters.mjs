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

const { observeDisaster, tickDisasters, recordDisaster, disasterSpike, disasterKey } = await import(
  "/emigration/ui/emigration-disasters.js"
);
const { resetGameSpeedCache } = await import("/emigration/ui/emigration-game-speed.js");
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

// ── §3 impact-scaled disaster damage ────────────────────────────────────────
// Defaults for the impact-scaling block (each test restores what it changes).
function setImpactDefaults() {
  CONFIG.disastersEnabled = true;
  CONFIG.disasterImpactScalingEnabled = true;
  CONFIG.disasterImpactGamma = 0.6;
  CONFIG.disasterSpeedShockEnabled = true;
  CONFIG.disasterAccumCap = 18;
  CONFIG.disasterStackFalloff = true;
  CONFIG.disasterPerPoint = 10;
  CONFIG.disasterDecay = 0.55;
}

let CID = 100;
/** A fresh, non-infected city with a unique key (so per-test state never collides). */
function freshCity() {
  return { id: { owner: 0, id: CID++ }, owner: 0, isInfected: false };
}

// (1) A thunderstorm that pillages nothing (m=0) costs the city nothing.
function testNoPillageThunderstormIsFree() {
  setImpactDefaults();
  const city = freshCity();
  const key = disasterKey(city);
  recordDisaster("CLASS_THUNDERSTORM", 0, [key]);
  assert.ok(close(observeDisaster(city), 0), "0-impact thunderstorm must add ~0 distress");
}

// (2) For a fixed type, the spike rises continuously with impact (no cliff at the old 35% step).
function testImpactMonotonicity() {
  setImpactDefaults();
  let prev = -1;
  for (const m of [0.05, 0.1, 0.25, 0.5, 0.75, 1.0]) {
    const w = disasterSpike("CLASS_VOLCANO", m);
    assert.ok(w > prev, `spike must strictly increase with impact (m=${m})`);
    prev = w;
  }
}

// (3) Type is a ceiling: a max-impact thunderstorm can never out-punish even a gentle volcano.
function testTypeCeiling() {
  setImpactDefaults();
  const stormMax = disasterSpike("CLASS_THUNDERSTORM", 1.0);
  const volcanoGentle = disasterSpike("CLASS_VOLCANO", 0.2);
  assert.ok(stormMax < volcanoGentle, "a storm at full impact must stay below a gentle volcano");
}

/** Mock the engine speed globals to a CostMultiplier (Standard 100, Marathon 300) and clear the cache. */
function setSpeed(costMultiplier) {
  globalThis.Configuration.getGame = () => ({
    gameSpeedType: "T" + costMultiplier,
    getValue: (k) => (k in KV ? KV[k] : null)
  });
  globalThis.GameInfo = { GameSpeeds: { lookup: () => ({ CostMultiplier: costMultiplier }) } };
  resetGameSpeedCache();
}
function clearSpeed() {
  globalThis.Configuration.getGame = () => ({ getValue: (k) => (k in KV ? KV[k] : null) });
  delete globalThis.GameInfo;
  resetGameSpeedCache();
}

let BASE = 1000;
/** Total distress summed over a single event's full decay tail at the given speed. */
function decayTailSum(costMultiplier) {
  setSpeed(costMultiplier);
  const city = freshCity();
  const key = disasterKey(city);
  BASE += 1000;
  TURN = BASE;
  tickDisasters(); // sync decayTurn to BASE (and clear any faded cities)
  recordDisaster("CLASS_VOLCANO", 0.4, [key]); // ÷S applied inside per current speed
  let sum = 0;
  for (let t = 0; t < 400; t++) {
    TURN = BASE + t;
    tickDisasters();
    const d = observeDisaster(city);
    if (d < 0.05) break;
    sum += d;
  }
  return sum;
}

// (4) The ÷S shock makes the TOTAL bite (area under the decay tail) roughly speed-invariant, Marathon
// costs about the same overall as Standard, instead of ~S× more.
function testSpeedInvarianceOfTotalBite() {
  setImpactDefaults();
  CONFIG.gameSpeedTuningEnabled = true;
  const std = decayTailSum(100); // Standard, S=1
  const mar = decayTailSum(300); // Marathon, S=3
  assert.ok(Math.abs(mar - std) / std < 0.35, `Marathon total (${mar.toFixed(1)}) ≈ Standard (${std.toFixed(1)})`);
  // And prove the fix matters: with the shock OFF, Marathon's total balloons well past Standard.
  CONFIG.disasterSpeedShockEnabled = false;
  const marNoShock = decayTailSum(300);
  assert.ok(marNoShock > std * 1.5, "without the shock, Marathon pays far more than Standard");
  CONFIG.disasterSpeedShockEnabled = true;
  CONFIG.gameSpeedTuningEnabled = false;
  clearSpeed();
}

// (5) Repeated catastrophes never exceed the accumulation cap, and the city always decays back to ~0.
function testAccumCapAndRecovery() {
  setImpactDefaults();
  const city = freshCity();
  const key = disasterKey(city);
  BASE += 1000;
  TURN = BASE;
  tickDisasters();
  for (let i = 0; i < 5; i++) recordDisaster("CLASS_VOLCANO", 1.0, [key]); // five back-to-back volcanoes
  assert.ok(observeDisaster(city) <= CONFIG.disasterAccumCap, "distress never exceeds the accumulation cap");
  let turns = 0;
  for (let t = 1; t <= 100; t++) {
    TURN = BASE + t;
    tickDisasters();
    turns = t;
    if (observeDisaster(city) < 0.05) break;
  }
  assert.ok(observeDisaster(city) < 0.05, "city recovers (distress decays to ~0)");
  assert.ok(turns < 60, "recovery happens in bounded game-time");
}

// (6) With both master flags off, the spike reproduces the legacy CLASS_WEIGHT × severity exactly.
function testFlagsOffIsLegacy() {
  setImpactDefaults();
  CONFIG.disasterImpactScalingEnabled = false;
  CONFIG.disasterSpeedShockEnabled = false;
  assert.ok(close(disasterSpike("CLASS_VOLCANO", 0.99, 2), 24), "legacy: 12 × severity 2 = 24");
  assert.ok(close(disasterSpike("CLASS_THUNDERSTORM", 0.0, 1), 3), "legacy: 3 × severity 1 = 3");
  setImpactDefaults();
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
testNoPillageThunderstormIsFree();
testImpactMonotonicity();
testTypeCeiling();
testSpeedInvarianceOfTotalBite();
testAccumCapAndRecovery();
testFlagsOffIsLegacy();
testPersistWritesSchemaEnvelope();

CONFIG.disastersEnabled = false; // restore default
console.log("disasters harness passed");
