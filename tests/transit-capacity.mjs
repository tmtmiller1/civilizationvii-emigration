import assert from "node:assert/strict";

// Regression guard for C2 (improvement review): the transit queue cap is enforced at ENQUEUE via
// transitAtCapacity(state), so a lagged departure is never started when the row couldn't be persisted
// (the load-time normalizeTransitList truncation would otherwise drop it AFTER the source shed the
// point, destroying in-flight population). This pins the boundary the engine guard relies on.

const { transitAtCapacity } = await import("/emigration/ui/emigration-state.js");

const CAP = 4096; // mirrors MAX_TRANSIT_ENTRIES in emigration-state.js

const stateWith = (n) => ({ transit: new Array(n).fill(0).map((_, i) => ({ destKey: "k" + i })) });

assert.equal(transitAtCapacity(stateWith(0)), false, "empty queue is not at capacity");
assert.equal(transitAtCapacity(stateWith(CAP - 1)), false, "one below the cap is not at capacity");
assert.equal(transitAtCapacity(stateWith(CAP)), true, "exactly at the cap is at capacity");
assert.equal(transitAtCapacity(stateWith(CAP + 500)), true, "above the cap is at capacity");

// Malformed / missing state must never report capacity (degrade open, don't block all migration).
assert.equal(transitAtCapacity(null), false, "null state is not at capacity");
assert.equal(transitAtCapacity({}), false, "state without a transit array is not at capacity");
assert.equal(transitAtCapacity({ transit: "nope" }), false, "non-array transit is not at capacity");

console.log("transit-capacity harness passed");
