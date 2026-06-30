import assert from "node:assert/strict";

// Regression guard for C1 (improvement review): the transit `defers` counter MUST survive a
// save -> load round-trip. runPass reloads + re-saves state every turn, so if normalizeTransitEntry
// drops `defers`, it resets to 0 each turn -- the MAX_DEFERS force-land/perish guard and the
// longest-waiting-first arrival sort can never fire, leaving migrants stuck in transit forever.

const STATE_KEY = "EmigrationState_v1";
const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Game = { turn: 10 };

const { loadState, saveState } = await import("/emigration/ui/emigration-state.js");

// A transit row that has already been deferred 3 times (one short of MAX_DEFERS = 4).
const seeded = {
  monoTurn: 10,
  sources: {},
  transit: [
    { destKey: "1:42", arriveTurn: 11, people: 1000, srcOwner: 0, destOwner: 1,
      crossCiv: true, cause: "war", infected: false, srcName: "Rome", destName: "Carthage", defers: 3 },
    // A row that was never deferred: `defers` must stay absent (kept optional, not written as 0).
    { destKey: "1:43", arriveTurn: 12, people: 500, srcOwner: 0, destOwner: 1,
      crossCiv: true, cause: "prosperity", infected: false, srcName: "Rome", destName: "Utica" }
  ]
};

// Persist, then reload as the next turn's runPass would.
saveState(seeded);
const reloaded = loadState();

assert.equal(reloaded.transit.length, 2, "both transit rows should survive the round-trip");

const deferred = reloaded.transit.find((t) => t.destKey === "1:42");
assert.ok(deferred, "the deferred row should survive");
assert.equal(deferred.defers, 3, "defers must be preserved across save->load (not reset to 0)");

const fresh = reloaded.transit.find((t) => t.destKey === "1:43");
assert.ok(fresh, "the never-deferred row should survive");
assert.ok(!("defers" in fresh), "a never-deferred row must omit `defers`, not carry a 0");

// Malformed `defers` must coerce to omitted, never NaN/negative.
saveState({ monoTurn: 10, sources: {}, transit: [
  { destKey: "1:44", arriveTurn: 11, people: 100, srcOwner: 0, destOwner: 1,
    crossCiv: false, cause: "war", infected: false, srcName: "A", destName: "B", defers: -5 },
  { destKey: "1:45", arriveTurn: 11, people: 100, srcOwner: 0, destOwner: 1,
    crossCiv: false, cause: "war", infected: false, srcName: "A", destName: "B", defers: "x" },
  { destKey: "1:46", arriveTurn: 11, people: 100, srcOwner: 0, destOwner: 1,
    crossCiv: false, cause: "war", infected: false, srcName: "A", destName: "B", defers: 2.9 }
] });
const r2 = loadState();
assert.ok(!("defers" in r2.transit.find((t) => t.destKey === "1:44")), "negative defers omitted");
assert.ok(!("defers" in r2.transit.find((t) => t.destKey === "1:45")), "non-number defers omitted");
assert.equal(r2.transit.find((t) => t.destKey === "1:46").defers, 2, "fractional defers floored");

delete globalThis.Configuration;
delete globalThis.Game;
console.log("transit-defers-persistence harness passed");
