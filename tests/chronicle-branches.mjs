import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Game = { turn: 50 };

const { chronicled, chronicle, chronicleLog, clearChronicle } = 
  await import("/emigration/ui/emigration-chronicle.js");

function testChronicleNewEntry() {
  clearChronicle();
  chronicle({
    kind: "exodus",
    title: "The Great Migration",
    body: "A massive exodus occurred",
    civ: "Roman",
    people: 5000,
    cause: "war"
  });
  
  const log = chronicleLog();
  assert.ok(log.length > 0, "entry should be recorded");
  assert.equal(log[0].kind, "exodus");
  assert.equal(log[0].title, "The Great Migration");
}

function testChronicledDeduplication() {
  clearChronicle();
  const key = "test_exodus_2050";
  
  chronicle({
    kind: "exodus",
    title: "First Exodus",
    body: "People left",
    dedupeKey: key
  });
  
  const first = chronicled(key);
  assert.ok(first, "first entry should be recorded");
  
  chronicle({
    kind: "exodus",
    title: "Duplicate",
    body: "Different people",
    dedupeKey: key
  });
  
  const log = chronicleLog();
  const matching = log.filter((e) => e.dedupeKey === key);
  assert.equal(matching.length, 1, "duplicate should not be added");
}

function testChronicleLogLimit() {
  clearChronicle();
  for (let i = 0; i < 100; i++) {
    chronicle({
      kind: "founding",
      title: `Settlement ${i}`,
      body: `City founded`,
      people: 100
    });
  }
  
  const log = chronicleLog();
  assert.ok(log.length <= 80, "should be capped at 80 entries");
}

function testChronicleInvalidEntry() {
  clearChronicle();
  chronicle(null);
  chronicle(undefined);
  chronicle("string");
  chronicle({});
  
  const log = chronicleLog();
  assert.equal(log.length, 0, "invalid entries should not be recorded");
}

function testChronicleWithoutConfiguration() {
  const cfg = globalThis.Configuration;
  delete globalThis.Configuration;
  
  chronicle({
    kind: "return",
    title: "Homecoming",
    body: "People returned"
  });
  
  globalThis.Configuration = cfg;
  // Should not throw
}

testChronicleNewEntry();
testChronicledDeduplication();
testChronicleLogLimit();
testChronicleInvalidEntry();
testChronicleWithoutConfiguration();

delete globalThis.Configuration;
delete globalThis.Game;

console.log("chronicle-branches harness passed");
