import assert from "node:assert/strict";

let TURN = 100;
globalThis.Game = {
  get turn() {
    return TURN;
  }
};
globalThis.Configuration = {
  getGame: () => ({ getValue: () => null }),
  editGame: () => ({ setValue: () => {} })
};

const casualties = new Map();
globalThis.DemographicsData = {
  casualtyCumFor: (pid) => casualties.get(pid) ?? 0
};

const { combatLossFor } = await import("/emigration/ui/emigration-combat.js");

function testCombatLossForNonNumberInput() {
  assert.equal(combatLossFor(null), 0);
  assert.equal(combatLossFor("string"), 0);
  assert.equal(combatLossFor(undefined), 0);
  assert.equal(combatLossFor({}), 0);
}

function testCombatLossForBaselineAndDelta() {
  casualties.set(0, 10);
  assert.equal(combatLossFor(0), 0, "first read should baseline without spike");

  TURN += 1;
  casualties.set(0, 16);
  const afterDelta = combatLossFor(0);
  assert.ok(afterDelta > 0, "new casualties should increase intensity");

  const sameTurn = combatLossFor(0);
  assert.equal(sameTurn, afterDelta, "reads should be idempotent within a turn");
}

function testCombatLossForNoNegativeDelta() {
  TURN += 1;
  casualties.set(0, 12);
  const v = combatLossFor(0);
  assert.ok(v >= 0, "negative cumulative deltas must be clamped");
}

function testCombatLossForWithoutDemographicsData() {
  const D = globalThis.DemographicsData;
  delete globalThis.DemographicsData;
  const loss = combatLossFor(5);
  assert.equal(loss, 0, "should return 0 when DemographicsData missing");
  globalThis.DemographicsData = D;
}

function testCombatLossForWithThrowingDemographics() {
  const prior = globalThis.DemographicsData;
  globalThis.DemographicsData = {
    casualtyCumFor: () => {
      throw new Error("unreadable casualty");
    }
  };
  assert.equal(combatLossFor(6), 0, "casualty read errors should be swallowed");
  globalThis.DemographicsData = prior;
}

function testCombatLossForWithThrowingGameTurn() {
  const prior = globalThis.Game;
  globalThis.Game = {
    get turn() {
      throw new Error("turn unreadable");
    }
  };
  assert.equal(combatLossFor(7), 0, "turn read errors should degrade to 0-turn baseline");
  globalThis.Game = prior;
}

testCombatLossForNonNumberInput();
testCombatLossForBaselineAndDelta();
testCombatLossForNoNegativeDelta();
testCombatLossForWithoutDemographicsData();
testCombatLossForWithThrowingDemographics();
testCombatLossForWithThrowingGameTurn();

delete globalThis.DemographicsData;
delete globalThis.Game;
delete globalThis.Configuration;

console.log("combat-branches harness passed");
