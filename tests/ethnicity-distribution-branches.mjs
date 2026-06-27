import assert from "node:assert/strict";

const { distributeTiles, __test } = await import(
  "/emigration/ui/emigration-ethnicity-distribution.js"
);

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
  assert.deepEqual(
    sorted.map((x) => x.civ),
    [1, 3, 4],
    "ties should break by civ id"
  );
}

function testDistributionAndFallbacks() {
  const plots = [
    { x: 1, y: 1, weight: 0 },
    { x: 2, y: 2, weight: -1 },
    { x: 3, y: 3, weight: 0 }
  ];

  const comp = {
    civs: [
      { civ: 1, share: 0.8 },
      { civ: 2, share: 0.2 }
    ],
    dominant: { civ: 1 }
  };

  const out = distributeTiles(plots, comp, 100);
  assert.equal(out.length, 3);
  assert.ok(out.some((t) => t.civ === 2), "minority should claim fringe tiles first");
  assert.ok(out.every((t) => t.people >= 0));
  assert.ok(out.every((t) => t.density >= 0 && t.density <= 1));
  const total = out.reduce((a, t) => a + t.people, 0);
  assert.equal(total, 0, "non-positive weights should produce empty effective population");

  // No scaled population yet: assign dominant civ to all tiles.
  const zero = distributeTiles(
    [{ x: 5, y: 5, weight: 1 }],
    { civs: [{ civ: 3, share: 1 }], dominant: { civ: 9 } },
    0
  );
  assert.equal(zero[0].civ, 9);
  assert.equal(zero[0].people, 0);

  // No explicit dominant should fall back to the largest share origin.
  const noDominant = distributeTiles(
    [
      { x: 9, y: 1, weight: 1 },
      { x: 9, y: 2, weight: 2 }
    ],
    { civs: [{ civ: 8, share: 0 }, { civ: 6, share: 1 }], dominant: null },
    100
  );
  assert.ok(noDominant.every((t) => t.civ === 6));

  // Zero-share first origin should advance to the next via the remaining<=0 while-branch.
  const advancesOrigin = distributeTiles(
    [
      { x: 4, y: 4, weight: 1 },
      { x: 4, y: 5, weight: 1 }
    ],
    { civs: [{ civ: 3, share: 0 }, { civ: 2, share: 1 }], dominant: { civ: 2 } },
    50
  );
  assert.ok(advancesOrigin.every((t) => t.civ === 2));
}

testGuardsAndHelpers();
testDistributionAndFallbacks();

console.log("ethnicity-distribution-branches harness passed");
