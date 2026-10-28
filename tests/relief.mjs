// relief.mjs
//
// The old People who left buildings (emigration-relief.js): nothing places them now, and each pass takes down any
// still standing in a save from the first 4.0.0 build.

import assert from "node:assert/strict";

const rl = await import("/emigration/ui/emigration-relief.js");

function testType() {
  assert.ok(rl.isReliefBuilding("BUILDING_EMIG_RELIEF_3"));
  assert.ok(!rl.isReliefBuilding("BUILDING_GRANARY"));
  assert.ok(!rl.isReliefBuilding(undefined));
}

/** A fake world: the city's constructibles, and the requests sent to take one down. */
function testSweep() {
  const types = { 1: "BUILDING_EMIG_RELIEF_2", 2: "BUILDING_GRANARY", 3: "BUILDING_EMIG_RELIEF_1" };
  const sent = [];
  const city = { Constructibles: { getIds: () => [1, 2, 3].map((id) => ({ owner: 0, id })) } };
  globalThis.GameContext = { localPlayerID: 0 };
  globalThis.Players = { getAlive: () => [{ isMajor: true, Cities: { getCities: () => [city] } },
    { isMajor: false, Cities: { getCities: () => [city] } }] };
  globalThis.Constructibles = { getByComponentID: (id) => ({ type: id.id }) };
  globalThis.GameInfo = { Constructibles: { lookup: (t) => ({ ConstructibleType: types[t] }) } };
  globalThis.Game = { PlayerOperations: { sendRequest: (who, op, args) => sent.push({ who, op, args }) } };
  assert.equal(rl.reliefSweep(), 2, "two relief buildings in the major's city; the minor's settlements are left alone");
  assert.deepEqual(sent.map((s) => s.args.LocalID), [1, 3]);
  assert.ok(sent.every((s) => s.op === "DESTROY_ELEMENT" && s.args.Kind === "CONSTRUCTIBLE"));
  assert.equal(rl.reliefSweep({ clearStanding: () => 0 }), 0);
}

testType();
testSweep();
console.log("relief: ok");
