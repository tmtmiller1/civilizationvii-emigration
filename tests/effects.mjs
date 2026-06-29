import assert from "node:assert/strict";

// Engine surface the effects module reads: grantYield (capture), unit lists,
// Game.turn, and a GameConfiguration KV for the persisted assimilation pool.
const calls = [];
const playerUnits = {};
const LEADER = {}; // pid → leader type string (for civ-tuning resolution)
const MEMENTOS = {}; // pid → equipped memento descriptors
let TURN = 1;
const KV = {};
globalThis.Game = {
  get turn() {
    return TURN;
  }
};
globalThis.Players = {
  grantYield: (pid, yt, amt) => calls.push([pid, yt, amt]),
  get: (pid) => ({ Units: { getUnits: () => playerUnits[pid] || [] }, leaderType: LEADER[pid] })
};
globalThis.YieldTypes = { YIELD_HAPPINESS: "HAPPY", YIELD_GOLD: "GOLD" };
globalThis.Database = { makeHash: (s) => "HASH_" + s };
// GameInfo: the civ-tuning resolver treats leaderType/civType as already the string.
globalThis.GameInfo = {
  Leaders: { lookup: (lt) => (lt ? { LeaderType: lt } : null) },
  Civilizations: { lookup: (ct) => (ct ? { CivilizationType: ct } : null) }
};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Online = {
  Metaprogression: {
    getEquippedMementos: (pid) => MEMENTOS[pid] || []
  }
};

const { addAssimilationLoad, tickAssimilation, congestionPenalty } =
  await import("/emigration/ui/emigration-effects.js");
const { countMigrants, applyMigrantHoldingPenalty } =
  await import("/emigration/ui/emigration-migrant-units.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

const close = (a, b) => Math.abs(a - b) < 1e-9;
function reset() {
  calls.length = 0;
}

// ── Assimilation (duration-based migration cost) ──────────────────────────

function testAddLoadScalesWithPop() {
  CONFIG.assimilationLoadPerMigrant = 1;
  CONFIG.assimilationCostPerPop = 0.1;
  TURN = 5;
  const added = addAssimilationLoad(7, 10); // 1 × (1 + 0.1×10) = 2
  assert.ok(close(added, 2));
}

function testTickDecaysAndCharges() {
  reset();
  CONFIG.assimilationDecay = 0.5;
  CONFIG.assimilationHappiness = 0.5;
  CONFIG.assimilationGold = 2;
  TURN = 6; // one turn elapsed since the load was added (turn 5)
  const r = tickAssimilation(7);
  // load = 2 × 0.5 = 1 → happiness 0.5×1, gold 2×1, both DEDUCTED from player 7.
  assert.ok(close(r.load, 1) && close(r.happiness, 0.5) && close(r.gold, 2));
  assert.deepEqual(calls, [
    [7, "HAPPY", -0.5],
    [7, "GOLD", -2]
  ]);
}

function testTickIdempotentWithinTurn() {
  reset();
  const r = tickAssimilation(7); // still turn 6 → already ticked → no further charge
  assert.equal(calls.length, 0);
  assert.ok(close(r.load, 1));
}

function testNoLoadCivIsNoOp() {
  reset();
  TURN = 7;
  const r = tickAssimilation(99); // never received a migrant
  assert.deepEqual(r, { load: 0, happiness: 0, gold: 0 });
  assert.equal(calls.length, 0);
}

function testLoadFadesToZero() {
  reset();
  TURN = 25; // many turns later: 1 × 0.5^(25-6) ≪ 0.05 → dropped, no charge
  const r = tickAssimilation(7);
  assert.deepEqual(r, { load: 0, happiness: 0, gold: 0 });
}

// ── Migrant-holding penalty (unchanged) ───────────────────────────────────

function testCountMigrantsByHashAndName() {
  playerUnits[5] = [
    { type: "HASH_UNIT_MIGRANT", name: "Migrant" },
    { type: "HASH_UNIT_SETTLER", name: "Settler" },
    { type: 999, name: "Roman Migrant" }
  ];
  assert.equal(countMigrants(5), 2);
}

function testMigrantHoldPenaltyScalesWithCount() {
  reset();
  CONFIG.migrantHoldHappiness = 0.5;
  CONFIG.migrantHoldGold = 2;
  playerUnits[5] = [{ type: "HASH_UNIT_MIGRANT" }, { type: "HASH_UNIT_MIGRANT" }, { type: "HASH_UNIT_MIGRANT" }];
  const r = applyMigrantHoldingPenalty(5);
  assert.deepEqual(r, { count: 3, happiness: 1.5, gold: 6 });
  assert.deepEqual(calls, [
    [5, "HAPPY", -1.5],
    [5, "GOLD", -6]
  ]);
}

function testNoMigrantsNoCharge() {
  reset();
  playerUnits[5] = [{ type: "HASH_UNIT_SETTLER" }];
  const r = applyMigrantHoldingPenalty(5);
  assert.deepEqual(r, { count: 0, happiness: 0, gold: 0 });
  assert.equal(calls.length, 0);
}

// ── Algorithm C: congestion headwind + per-civ leader variance ────────────

function testCongestionPenaltyScalesWithLoadAndOffByDefault() {
  CONFIG.assimilationLoadPerMigrant = 1;
  CONFIG.assimilationCostPerPop = 0;
  TURN = 50;
  addAssimilationLoad(3, 0); // load 1 on a fresh civ
  CONFIG.congestWeight = 4;
  assert.ok(Math.abs(congestionPenalty(3, 10) - 0.4) < 1e-9); // 4 × (1 / 10)
  CONFIG.congestWeight = 0;
  assert.equal(congestionPenalty(3, 10), 0); // off by default
}

function testCivTuningEaseScalesGoldCost() {
  reset();
  CONFIG.civTuningEnabled = true;
  CONFIG.civTuningStrength = 1; // assert the raw table value, not the flattened default
  CONFIG.assimilationLoadPerMigrant = 1;
  CONFIG.assimilationCostPerPop = 0;
  CONFIG.assimilationDecay = 0.5;
  CONFIG.assimilationHappiness = 0;
  CONFIG.assimilationGold = 2;
  LEADER[8] = "LEADER_ISABELLA"; // assimilationEase 1.2 in the table
  TURN = 100;
  addAssimilationLoad(8, 0); // load 1 at turn 100
  TURN = 101;
  const r = tickAssimilation(8); // load 0.5; gold = 2 × 0.5 × 1.2 (ease) = 1.2
  assert.ok(Math.abs(r.gold - 1.2) < 1e-9);
  assert.deepEqual(calls, [[8, "GOLD", -1.2]]);
  CONFIG.civTuningEnabled = false;
}

function testMementoTuningScalesGoldCost() {
  reset();
  CONFIG.civTuningEnabled = true;
  CONFIG.civTuningStrength = 1;
  CONFIG.assimilationLoadPerMigrant = 1;
  CONFIG.assimilationCostPerPop = 0;
  CONFIG.assimilationDecay = 0.5;
  CONFIG.assimilationHappiness = 0;
  CONFIG.assimilationGold = 2;
  MEMENTOS[18] = [{ mementoTypeId: "MEMENTO_FOUNDATION_LYDIAN_LION" }]; // assimilationEase 1.1
  TURN = 110;
  addAssimilationLoad(18, 0);
  TURN = 111;
  const r = tickAssimilation(18); // load 0.5; gold = 2 × 0.5 × 1.1 = 1.1
  assert.ok(Math.abs(r.gold - 1.1) < 1e-9);
  assert.deepEqual(calls, [[18, "GOLD", -1.1]]);
  CONFIG.civTuningEnabled = false;
}

testAddLoadScalesWithPop();
testTickDecaysAndCharges();
testTickIdempotentWithinTurn();
testNoLoadCivIsNoOp();
testLoadFadesToZero();
testCountMigrantsByHashAndName();
testMigrantHoldPenaltyScalesWithCount();
testNoMigrantsNoCharge();
testCongestionPenaltyScalesWithLoadAndOffByDefault();
testCivTuningEaseScalesGoldCost();
testMementoTuningScalesGoldCost();

console.log("effects harness passed");
