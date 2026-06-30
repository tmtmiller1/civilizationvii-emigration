import assert from "node:assert/strict";

// Regression guard for P1 (improvement review): hexDistance is memoized per pass on the symmetric
// city-key pair, and resetDistanceCache() clears it. Keyless signals must bypass the cache so
// off-engine callers (and hand-built test signals) keep computing directly.

let calls = 0;
globalThis.GameplayMap = {
  getPlotDistance: (x1, y1, x2, y2) => {
    calls += 1;
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  }
};

const { hexDistance, resetDistanceCache } = await import("/emigration/ui/emigration-geography.js");

const A = { key: "0:1", city: { location: { x: 0, y: 0 } } };
const B = { key: "1:2", city: { location: { x: 8, y: 0 } } };

resetDistanceCache();
calls = 0;

// First read computes; second (same pair) is served from cache.
assert.equal(hexDistance(A, B), 8, "distance computed");
assert.equal(calls, 1, "first read hits the engine once");
assert.equal(hexDistance(A, B), 8, "second read cached");
assert.equal(calls, 1, "cached read does NOT hit the engine again");

// Symmetric: reversed order resolves to the same cache entry.
assert.equal(hexDistance(B, A), 8, "reversed order cached (symmetric key)");
assert.equal(calls, 1, "reversed order does NOT recompute");

// Reset busts the cache (next pass recomputes).
resetDistanceCache();
assert.equal(hexDistance(A, B), 8, "after reset");
assert.equal(calls, 2, "reset forces a fresh engine read");

// Keyless signals bypass the cache entirely (compute every call).
const k1 = { city: { location: { x: 0, y: 0 } } };
const k2 = { city: { location: { x: 3, y: 0 } } };
const before = calls;
hexDistance(k1, k2);
hexDistance(k1, k2);
assert.equal(calls, before + 2, "keyless signals are never cached");

// A row whose location is unreadable returns 0 (and the 0 is cached per key, harmlessly).
const noLoc = { key: "9:9", city: {} };
resetDistanceCache();
calls = 0;
assert.equal(hexDistance(A, noLoc), 0, "unreadable location → 0");
assert.equal(hexDistance(A, noLoc), 0, "cached 0");
assert.equal(calls, 0, "unreadable pair never reaches the engine");

delete globalThis.GameplayMap;
console.log("geography-distance-cache harness passed");
