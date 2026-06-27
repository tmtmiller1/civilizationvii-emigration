import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Game = { turn: 1 };

const { recordCompositionPass, compositionForCity, compositionForOwner, __test } = 
  await import("/emigration/ui/emigration-composition.js");

function testCompositionRecordingAndRetrieval() {
  __test.reset();

  const signals = [
    {
      key: "0:1",
      owner: 0,
      population: 10,
      city: {
        name: "Rome",
        location: { x: 10, y: 20 }
      }
    },
    {
      key: "1:2",
      owner: 1,
      population: 8,
      city: {
        name: "Alexandria",
        location: { x: 30, y: 40 }
      }
    }
  ];

  const migs = [
    { srcOwner: 0, srcName: "Rome", destOwner: 1, destName: "Alexandria", points: 1, cause: "war" }
  ];

  recordCompositionPass(signals, migs);

  const comp0 = __test.compositionForCity(signals[0].city);
  assert.ok(comp0);
  assert.equal(comp0.owner, 0);
  assert.ok(comp0.civs);

  const comp1 = __test.compositionForOwner(1);
  assert.ok(comp1);
  assert.equal(comp1.owner, 1);
}

function testCompositionFiltersAndSorts() {
  __test.reset();

  const signals = [
    {
      key: "10:1",
      owner: 10,
      population: 15,
      city: { name: "City1", location: { x: 1, y: 1 } }
    },
    {
      key: "10:2",
      owner: 10,
      population: 8,
      city: { name: "City2", location: { x: 2, y: 2 } }
    },
    {
      key: "11:3",
      owner: 11,
      population: 5,
      city: { name: "City3", location: { x: 3, y: 3 } }
    }
  ];

  const migs = [
    { srcOwner: 10, srcName: "City1", destOwner: 11, destName: "City3", points: 3, cause: "war" },
    { srcOwner: 10, srcName: "City2", destOwner: 11, destName: "City3", points: 2, cause: "disaster" }
  ];

  recordCompositionPass(signals, migs);

  const comp10 = __test.compositionForOwner(10);
  assert.ok(comp10);
  assert.ok(comp10.total > 0);
  assert.ok(comp10.dominant);
  assert.equal(comp10.dominant.civ, 10);

  const comp11 = __test.compositionForOwner(11);
  assert.ok(comp11);
  assert.ok(comp11.total > 0);
  assert.ok(comp11.civs.some((c) => c.civ === 10), "should include origin civ 10 from migration");
}

function testCompositionNullsWhenEmpty() {
  __test.reset();

  assert.equal(__test.compositionForCity({ location: { x: 99, y: 99 } }), null);
  assert.equal(__test.compositionForOwner(99), null);
}

testCompositionRecordingAndRetrieval();
testCompositionFiltersAndSorts();
testCompositionNullsWhenEmpty();

delete globalThis.Configuration;
delete globalThis.Game;

console.log("composition-branches harness passed");
