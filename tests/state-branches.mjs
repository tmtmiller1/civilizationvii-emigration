import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Game = { turn: 100 };

const { loadState, saveState, prepareState, ownerPopulations } = 
  await import("/emigration/ui/emigration-state.js");

function testLoadStateWhenEmpty() {
  KV["EmigrationState_v1"] = null;
  const state = loadState();
  assert.ok(state);
  assert.ok(state.sources);
  assert.equal(typeof state.monoTurn, "number");
  assert.ok(Array.isArray(state.transit));
}

function testSaveAndLoadState() {
  const original = {
    sources: { "0:1": { pressure: 100, cooldown: 5 } },
    monoTurn: 50,
    transit: [{ destKey: "1:2", arriveTurn: 105, people: 100, srcOwner: 0, destOwner: 1 }]
  };
  
  saveState(original);
  const loaded = loadState();
  
  assert.ok(loaded);
  assert.ok(loaded.sources["0:1"]);
  assert.equal(loaded.monoTurn, 50);
  assert.equal(loaded.transit.length, 1);

  const persisted = JSON.parse(KV["EmigrationState_v1"]);
  assert.equal(persisted.v, 2, "state should persist with schema envelope");
  assert.ok(persisted.data && typeof persisted.data === "object");
}

function testLoadStateWithInvalidJSON() {
  KV["EmigrationState_v1"] = "{ invalid json }";
  const state = loadState();
  assert.ok(state);
  assert.ok(state.sources);
  assert.equal(state.transit.length, 0);
}

function testLoadStateLegacyShapeMigrates() {
  KV["EmigrationState_v1"] = JSON.stringify({
    sources: { "0:1": { pressure: 10, cooldown: 2 } },
    monoTurn: 42,
    transit: []
  });
  const state = loadState();
  assert.equal(state.monoTurn, 42);
  assert.equal(state.sources["0:1"].pressure, 10);
}

function testLoadStateSchemaEnvelope() {
  KV["EmigrationState_v1"] = JSON.stringify({
    v: 2,
    data: {
      sources: { "0:1": { pressure: 7, cooldown: 1, crisisCooldown: 3 } },
      monoTurn: 77,
      transit: [
        { destKey: "1:9", arriveTurn: 80, people: 120, srcOwner: 0, destOwner: 1, cause: "war" }
      ]
    }
  });
  const state = loadState();
  assert.equal(state.monoTurn, 77);
  assert.equal(state.sources["0:1"].crisisCooldown, 3);
  assert.equal(state.transit.length, 1);
}

function testLoadStateSanitizesCorruptEntries() {
  KV["EmigrationState_v1"] = JSON.stringify({
    v: 2,
    data: {
      sources: {
        "0:1": { pressure: "bad", cooldown: -4, crisisCooldown: Number.NaN },
        "": { pressure: 1, cooldown: 1 }
      },
      monoTurn: -10,
      transit: [
        { destKey: "1:2", arriveTurn: 55, people: 99, srcOwner: 0, destOwner: 1, cause: 42 },
        { arriveTurn: 60, people: 10, srcOwner: 0, destOwner: 1 },
        null
      ]
    }
  });
  const state = loadState();
  assert.equal(state.monoTurn, 0, "negative monoTurn should clamp to 0");
  assert.equal(state.sources["0:1"].pressure, 0, "non-numeric pressure should default");
  assert.equal(state.sources["0:1"].cooldown, 0, "negative cooldown should clamp");
  assert.equal(state.sources["0:1"].crisisCooldown, 0, "invalid crisis cooldown should default");
  assert.equal(state.transit.length, 1, "invalid transit rows should be dropped");
  assert.equal(state.transit[0].cause, "other", "non-string cause should default");
}

function testPrepareStateAdvancesMonoTurn() {
  const state = { sources: {}, monoTurn: 0, transit: [] };
  const ranked = [
    { key: "0:1", owner: 0, population: 100 },
    { key: "0:2", owner: 0, population: 50 }
  ];
  
  prepareState(state, ranked);
  assert.ok(state.monoTurn > 0);
}

function testPrepareStatePrunesStalesources() {
  const state = {
    sources: {
      "0:1": { pressure: 100, cooldown: 5 },
      "1:2": { pressure: 50, cooldown: 3 }
    },
    monoTurn: 0,
    transit: []
  };
  const ranked = [{ key: "0:1", owner: 0, population: 100 }];
  
  prepareState(state, ranked);
  assert.ok(state.sources["0:1"]);
  assert.ok(!state.sources["1:2"], "stale source should be deleted");
}

function testPrepareStateTicksCooldowns() {
  const state = {
    sources: { "0:1": { pressure: 100, cooldown: 3, crisisCooldown: 2 } },
    monoTurn: 0,
    transit: []
  };
  const ranked = [{ key: "0:1", owner: 0, population: 100 }];
  
  prepareState(state, ranked);
  assert.equal(state.sources["0:1"].cooldown, 2);
  assert.equal(state.sources["0:1"].crisisCooldown, 1);
}

function testOwnerPopulationsAggregation() {
  const ranked = [
    { key: "0:1", owner: 0, population: 1000 },
    { key: "0:2", owner: 0, population: 500 },
    { key: "1:3", owner: 1, population: 2000 }
  ];
  
  const pops = ownerPopulations(ranked);
  assert.equal(pops[0], 1500);
  assert.equal(pops[1], 2000);
}

function testOwnerPopulationsEmpty() {
  const pops = ownerPopulations([]);
  assert.ok(pops);
  assert.equal(Object.keys(pops).length, 0);
}

testLoadStateWhenEmpty();
testSaveAndLoadState();
testLoadStateWithInvalidJSON();
testLoadStateLegacyShapeMigrates();
testLoadStateSchemaEnvelope();
testLoadStateSanitizesCorruptEntries();
testPrepareStateAdvancesMonoTurn();
testPrepareStatePrunesStalesources();
testPrepareStateTicksCooldowns();
testOwnerPopulationsAggregation();
testOwnerPopulationsEmpty();

delete globalThis.Configuration;
delete globalThis.Game;

console.log("state-branches harness passed");
