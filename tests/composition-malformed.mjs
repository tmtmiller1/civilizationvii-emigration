import assert from "node:assert/strict";

// Regression guard for the composition load-normalization hardening: seed a CORRUPT / old-schema
// persisted blob BEFORE the module's lazy load() runs, then assert the read paths
// (compositionForCity / compositionForOwner) never throw and drop the bad entries. The bug this
// guards against: entries were trusted wholesale, so a malformed `byCiv` made `Object.keys(e.byCiv)`
// throw on the uncaught lens / hover-tooltip / city-readout render paths.

const STATE_KEY = "EmigrationEthnos_v1";
const blob = {
  cities: {
    "1,1": { owner: 0, byCiv: { 0: 5 }, total: 5, name: "Good", seenTurn: 3 }, // valid
    "2,2": { owner: 1, total: 9, name: "NoByCiv", seenTurn: 2 }, // byCiv missing
    "3,3": { owner: 2, byCiv: null, total: 4, seenTurn: 1 }, // byCiv null
    "4,4": { owner: 3, byCiv: { 3: "x" }, total: "y", seenTurn: "z" }, // non-numeric buckets/total
    "5,5": "garbage", // entry not an object
    "6,6": { owner: 4, byCiv: { 4: 7 } } // total/seenTurn missing → derive from sum
  }
};
const KV = { [STATE_KEY]: JSON.stringify(blob) };
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Game = { turn: 10 };

const { compositionForCity, compositionForOwner } =
  await import("/emigration/ui/emigration-composition.js");

const city = (x, y) => ({ location: { x, y } });

// A valid entry still summarizes correctly after normalization.
const good = compositionForCity(city(1, 1));
assert.ok(good && good.total === 5 && good.civs.length === 1, "valid entry should survive normalization");

// Every malformed entry drops to null WITHOUT throwing.
for (const [x, y] of [[2, 2], [3, 3], [4, 4], [5, 5]]) {
  assert.equal(compositionForCity(city(x, y)), null, `malformed ${x},${y} should drop to null, not throw`);
}

// Missing total is derived from the bucket sum rather than crashing or producing NaN.
const derived = compositionForCity(city(6, 6));
assert.ok(derived && derived.total === 7, "missing total should derive from the byCiv sum");

// compositionForCity is self-guarding: even a LIVE city whose `location` accessor THROWS degrades to
// null (the one residual throw vector load-normalization can't reach, since locKey reads city.location
// off the engine object). Without the source guard this propagates onto the uncaught lens / tooltip /
// readout / diaspora / return paths, or is silently masked by the network window's broad per-city catch.
const throwingCity = { get location() { throw new Error("unreadable plot accessor"); } };
assert.equal(compositionForCity(throwingCity), null, "a throwing city read must drop to null, not throw");

// Owner aggregates over a map that still contains (pre-normalization) malformed entries never throw.
assert.doesNotThrow(() => compositionForOwner(0), "owner 0 aggregate must not throw");
assert.doesNotThrow(() => compositionForOwner(4), "owner 4 aggregate must not throw");
assert.doesNotThrow(() => compositionForOwner(99), "absent owner must not throw");

delete globalThis.Configuration;
delete globalThis.Game;
console.log("composition-malformed harness passed");
