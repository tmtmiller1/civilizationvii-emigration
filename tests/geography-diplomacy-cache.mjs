import assert from "node:assert/strict";

// Regression guard for P2 (improvement review): the open-borders / alliance / war reads are memoized
// per pass on the owner pair, and resetDiplomacyCache() clears them. Each is a per-pair engine call
// inside the O(N^2) pull loop, so they must be read at most once per owner pair per pass.

let warCalls = 0;
let allyCalls = 0;
let jointCalls = 0;
globalThis.Players = {
  get: (id) => ({
    Diplomacy: {
      isAtWarWith: (o) => { warCalls += 1; return id === 0 && o === 1; },
      hasAllied: (o) => { allyCalls += 1; return id === 0 && o === 2; }
    }
  })
};
globalThis.Game = {
  Diplomacy: {
    getJointEvents: (a, b) => {
      jointCalls += 1;
      return (a === 0 && b === 3) ? [{ actionTypeName: "DIPLOMACY_ACTION_OPEN_BORDERS" }] : [];
    }
  }
};

const { atWar, hasAlliance, hasOpenBordersDeal, atWarBetween, resetDiplomacyCache } =
  await import("/emigration/ui/emigration-geography.js");

resetDiplomacyCache();
warCalls = allyCalls = jointCalls = 0;

// War: first read hits the engine, repeats are cached.
assert.equal(atWar(0, 1), true, "0 at war with 1");
assert.equal(atWar(0, 1), true, "repeat");
assert.equal(warCalls, 1, "war read cached per pair");
assert.equal(atWar(0, 2), false, "0 not at war with 2");
assert.equal(warCalls, 2, "distinct pair reads again");

// atWarBetween shares the same per-pair cache as atWar (same underlying read).
assert.equal(atWarBetween(0, 1), true, "atWarBetween reuses the cached 0:1 read");
assert.equal(warCalls, 2, "no new engine read for an already-cached pair");

// a === b short-circuits without an engine read.
assert.equal(atWar(5, 5), false, "self is never at war");
assert.equal(warCalls, 2, "self-pair short-circuits, no engine read");

// Alliance + open-borders memoize the same way.
assert.equal(hasAlliance(0, 2), true, "0 allied with 2");
assert.equal(hasAlliance(0, 2), true, "repeat");
assert.equal(allyCalls, 1, "alliance read cached per pair");

assert.equal(hasOpenBordersDeal(0, 3), true, "0 open borders with 3");
assert.equal(hasOpenBordersDeal(0, 3), true, "repeat");
assert.equal(jointCalls, 1, "open-borders read cached per pair");

// Reset busts every cache.
resetDiplomacyCache();
assert.equal(atWar(0, 1), true, "after reset");
assert.equal(hasAlliance(0, 2), true, "after reset");
assert.equal(hasOpenBordersDeal(0, 3), true, "after reset");
assert.equal(warCalls, 3, "reset forces a fresh war read");
assert.equal(allyCalls, 2, "reset forces a fresh alliance read");
assert.equal(jointCalls, 2, "reset forces a fresh open-borders read");

delete globalThis.Players;
delete globalThis.Game;
console.log("geography-diplomacy-cache harness passed");
