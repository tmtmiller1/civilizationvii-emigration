import assert from "node:assert/strict";

const { distributeTiles, __test } = await import(
  "/emigration/ui/emigration-ethnicity-distribution.js"
);

const localShareOf = (tile, civ) => {
  const e = tile.shares.find((s) => s.civ === civ);
  return e ? e.share : 0;
};

function testGuardsAndHelpers() {
  assert.deepEqual(distributeTiles(null, null, 10), []);
  assert.deepEqual(distributeTiles([], { civs: [{ civ: 1, share: 1 }] }, 10), []);
  assert.deepEqual(distributeTiles([{ x: 0, y: 0, weight: 1 }], { civs: [] }, 10), []);

  assert.equal(__test.tileDensity(0), 0);
  assert.equal(__test.tileDensity(-4), 0);
  assert.ok(__test.tileDensity(__test.REF_TILE_PEOPLE) > 0.6);

  const sorted = __test.originsSmallestFirst([
    { civ: 4, share: 0.4 },
    { civ: 1, share: 0.1 },
    { civ: 3, share: 0.1 }
  ]);
  assert.deepEqual(sorted.map((x) => x.civ), [1, 3, 4], "ties should break by civ id");
}

function testDistributionAndFallbacks() {
  // Non-positive weights → zero per-tile people → every tile falls back to the dominant origin.
  const zeroWeights = distributeTiles(
    [{ x: 1, y: 1, weight: 0 }, { x: 2, y: 2, weight: -1 }, { x: 3, y: 3, weight: 0 }],
    { civs: [{ civ: 1, share: 0.8 }, { civ: 2, share: 0.2 }], dominant: { civ: 1 } },
    100
  );
  assert.equal(zeroWeights.length, 3);
  assert.ok(zeroWeights.every((t) => t.primary === 1 && t.shares.length === 1),
    "no per-tile people → all dominant (no spurious minority split)");
  assert.equal(zeroWeights.reduce((a, t) => a + t.people, 0), 0, "zero effective population");
  assert.ok(zeroWeights.every((t) => t.density >= 0 && t.density <= 1));

  // No scaled population yet: assign the dominant civ to every tile.
  const zero = distributeTiles(
    [{ x: 5, y: 5, weight: 1 }],
    { civs: [{ civ: 3, share: 1 }], dominant: { civ: 9 } },
    0
  );
  assert.equal(zero[0].primary, 9);
  assert.equal(zero[0].people, 0);

  // No explicit dominant should fall back to the largest-share origin (which then fills every tile,
  // the other origin having zero share).
  const noDominant = distributeTiles(
    [{ x: 9, y: 1, weight: 1 }, { x: 9, y: 2, weight: 2 }],
    { civs: [{ civ: 8, share: 0 }, { civ: 6, share: 1 }], dominant: null },
    100
  );
  assert.ok(noDominant.every((t) => t.primary === 6), "largest-share origin is the dominant");

  // A zero-share origin places nothing; the lone real origin holds every tile.
  const oneReal = distributeTiles(
    [{ x: 4, y: 4, weight: 1 }, { x: 4, y: 5, weight: 1 }],
    { civs: [{ civ: 3, share: 0 }, { civ: 2, share: 1 }], dominant: { civ: 2 } },
    50
  );
  assert.ok(oneReal.every((t) => t.primary === 2 && localShareOf(t, 3) === 0),
    "a zero-share origin claims no tiles");
}

testGuardsAndHelpers();
testDistributionAndFallbacks();

console.log("ethnicity-distribution-branches harness passed");
