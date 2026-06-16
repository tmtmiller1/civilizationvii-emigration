import assert from "node:assert/strict";

// In-memory GameConfiguration so the aggressor map persists within the test.
const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

const { recordWarDeclared, recordPeace, warAggressors } = await import(
  "/emigration/ui/emigration-war.js"
);
const { aggressorAdjust, geoAdjust } = await import("/emigration/ui/emigration-geography.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

function testRecordAndQuery() {
  recordWarDeclared({ aggressor: 1, target: 2 });
  assert.ok(warAggressors(2).has(1));
  assert.equal(warAggressors(3).size, 0);
}

function testRealPayloadShape() {
  // The actual DiplomacyDeclareWar payload (probe-confirmed): actingPlayer declared
  // on reactingPlayer.
  recordWarDeclared({ actingPlayer: 10, reactingPlayer: 11, sessionId: 0 });
  assert.ok(warAggressors(11).has(10));
  assert.equal(warAggressors(10).size, 0); // the declarer isn't its own victim
}

function testCandidateFieldNames() {
  recordWarDeclared({ player1: 4, player2: 5 }); // alternate payload shape (fallback)
  assert.ok(warAggressors(5).has(4));
}

function testIgnoresGarbage() {
  recordWarDeclared(null);
  recordWarDeclared({ aggressor: 7, target: 7 }); // self-war → ignored
  assert.equal(warAggressors(7).size, 0);
}

function testPeaceClears() {
  recordWarDeclared({ aggressor: 8, target: 9 });
  assert.ok(warAggressors(9).has(8));
  recordPeace({ aggressor: 8, target: 9 });
  assert.equal(warAggressors(9).size, 0);
}

function testAggressorAdjustOrders() {
  CONFIG.ownCivRefugeeBonus = 4;
  CONFIG.aggressorPenalty = 12;
  const src = { owner: 2 };
  const aggressors = new Set([1]);
  assert.equal(aggressorAdjust(src, { owner: 2 }, aggressors), 4); // own civ first
  assert.equal(aggressorAdjust(src, { owner: 1 }, aggressors), -12); // aggressor last
  assert.equal(aggressorAdjust(src, { owner: 3 }, aggressors), 0); // neutral unchanged
}

function testGeoAdjustGatesOnAggressorsArg() {
  CONFIG.aggressorPenalty = 12;
  const src = { owner: 2, city: { location: { x: 0, y: 0 } } };
  const dest = { owner: 1, city: { location: { x: 0, y: 0 } } }; // an aggressor's city
  const without = geoAdjust(src, dest, null); // 3-arg: no owner preference
  const withAgg = geoAdjust(src, dest, null, new Set([1]));
  assert.equal(without - withAgg, CONFIG.aggressorPenalty);
}

testRecordAndQuery();
testRealPayloadShape();
testCandidateFieldNames();
testIgnoresGarbage();
testPeaceClears();
testAggressorAdjustOrders();
testGeoAdjustGatesOnAggressorsArg();

console.log("war harness passed");
