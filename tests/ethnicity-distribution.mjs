// ethnicity-distribution.mjs
//
// The per-tile ethnicity-lens distribution model (emigration-ethnicity-distribution.js). Pure logic,
// so no engine stubs. Asserts the four properties the lens relies on:
//   1. degenerate inputs → [] (no throw);
//   2. a single origin paints every tile that origin;
//   3. denser (higher-weight, urban) tiles carry more people → higher opacity than sparse tiles;
//   4. a minority's TILE COUNT tracks its share (with a floor of one tile so it's never invisible),
//      its tiles are SPREAD across the density gradient (fringe → core, not banded in one corner),
//      and the dominant keeps the majority of tiles.

import assert from "node:assert/strict";
import { distributeTiles, __test } from "/emigration/ui/emigration-ethnicity-distribution.js";

const { tileDensity, originsSmallestFirst } = __test;

const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const peopleByCiv = (tiles) => {
  /** @type {Record<number, number>} */
  const m = {};
  for (const t of tiles) m[t.civ] = (m[t.civ] || 0) + t.people;
  return m;
};

// ── 1. Degenerate inputs → [] ───────────────────────────────────────────────
assert.deepEqual(distributeTiles([], { civs: [{ civ: 1, share: 1 }], dominant: { civ: 1 } }, 1000), [],
  "no plots → []");
assert.deepEqual(distributeTiles([{ x: 0, y: 0, weight: 1 }], { civs: [] }, 1000), [],
  "no origins → []");
assert.deepEqual(distributeTiles(null, null, 0), [], "null inputs → []");

// ── 2. Single origin paints every tile ──────────────────────────────────────
{
  const plots = [
    { x: 0, y: 0, weight: 3.6 }, { x: 1, y: 0, weight: 1 },
    { x: 0, y: 1, weight: 1 }, { x: 1, y: 1, weight: 0.4 }
  ];
  const comp = { civs: [{ civ: 7, share: 1 }], dominant: { civ: 7 } };
  const tiles = distributeTiles(plots, comp, 200000);
  assert.equal(tiles.length, 4, "one tile per plot");
  assert.ok(tiles.every((t) => t.civ === 7), "every tile is the single origin");
  // People are conserved: the per-tile people sum to the settlement total.
  assert.ok(Math.abs(sum(tiles, (t) => t.people) - 200000) < 1, "per-tile people sum to the total");
}

// ── 3. Urban (dense) tiles out-weigh sparse tiles in people + opacity ────────
{
  const plots = [{ x: 0, y: 0, weight: 3.6 }, { x: 9, y: 9, weight: 0.4 }];
  const comp = { civs: [{ civ: 1, share: 1 }], dominant: { civ: 1 } };
  const tiles = distributeTiles(plots, comp, 100000);
  const core = tiles.find((t) => t.x === 0 && t.y === 0);
  const fringe = tiles.find((t) => t.x === 9 && t.y === 9);
  assert.ok(core.people > fringe.people * 5, "the urban core carries far more people than the fringe");
  assert.ok(core.density > fringe.density, "denser tile → higher opacity");
  assert.ok(core.density <= 1 && fringe.density >= 0, "density stays in [0,1]");
}

// ── 4. Minority tile count tracks its share, spread across the density gradient ─
{
  // 80% civ 1 (dominant) / 20% civ 2 (minority): a dense centre, urban ring, rurals, sparse fringe —
  // enough tiles that a 20% diaspora claims several, so we can assert it SPREADS rather than bands.
  const plots = [
    { x: 0, y: 0, weight: 3.6 }, // city centre (densest)
    { x: 1, y: 0, weight: 2.4 }, { x: 0, y: 1, weight: 2.4 }, // urban ring
    { x: 1, y: 1, weight: 1 }, { x: 2, y: 0, weight: 1 }, { x: 0, y: 2, weight: 1 },
    { x: 2, y: 1, weight: 1 }, { x: 1, y: 2, weight: 1 }, // rural
    { x: 3, y: 3, weight: 0.4 }, { x: 4, y: 4, weight: 0.4 } // sparse fringe
  ];
  const comp = {
    civs: [{ civ: 1, share: 0.8 }, { civ: 2, share: 0.2 }],
    dominant: { civ: 1 }
  };
  const total = 500000;
  const tiles = distributeTiles(plots, comp, total);
  const minorityTiles = tiles.filter((t) => t.civ === 2);

  // The minority's TILE COUNT tracks its 20% share (2 of 10), and the dominant keeps the majority.
  assert.equal(minorityTiles.length, 2, "minority gets ~share × tiles (20% of 10 → 2)");
  assert.ok(tiles.filter((t) => t.civ === 1).length > minorityTiles.length, "dominant keeps the most tiles");

  // Every origin's people are still conserved across the whole settlement.
  assert.ok(Math.abs(sum(tiles, (t) => t.people) - total) < 1, "per-tile people sum to the total");

  // SPREAD: the two minority tiles sit in DIFFERENT density bands (not banded into one corner).
  const bandOf = (w) => (w >= 3 ? 3 : w >= 2 ? 2 : w >= 1 ? 1 : 0);
  const wOf = new Map(plots.map((p) => [p.x + "," + p.y, p.weight]));
  const bands = new Set(minorityTiles.map((t) => bandOf(wOf.get(t.x + "," + t.y))));
  assert.ok(bands.size >= 2, "minority tiles span more than one density band (spread, not clustered)");

  // Determinism: identical inputs → identical output.
  const again = distributeTiles(plots, comp, total);
  assert.deepEqual(again, tiles, "distribution is deterministic");
}

// ── 4b. A tiny minority is never invisible (floor of one tile) ───────────────
{
  const plots = Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0, weight: 1 }));
  const comp = { civs: [{ civ: 1, share: 0.99 }, { civ: 2, share: 0.01 }], dominant: { civ: 1 } };
  const tiles = distributeTiles(plots, comp, 800000);
  assert.equal(tiles.filter((t) => t.civ === 2).length, 1, "a 1% diaspora still claims one visible tile");
}

// ── 5. With no scaled people yet, everything falls back to the dominant origin ─
{
  const plots = [{ x: 0, y: 0, weight: 1 }, { x: 1, y: 1, weight: 1 }];
  const comp = { civs: [{ civ: 1, share: 0.5 }, { civ: 2, share: 0.5 }], dominant: { civ: 2 } };
  const tiles = distributeTiles(plots, comp, 0);
  assert.ok(tiles.every((t) => t.civ === 2), "no people scaled → all dominant (no spurious split)");
}

// ── helpers: tileDensity saturates and is monotone; origin ordering ──────────
assert.equal(tileDensity(0), 0, "no people → 0 density");
assert.ok(tileDensity(60000) > 0.5 && tileDensity(60000) < 0.7, "~ref people → ~0.63 density");
assert.ok(tileDensity(1e6) > 0.99, "huge density saturates toward 1");
assert.ok(tileDensity(200000) > tileDensity(100000), "density is monotone in people");
{
  const ordered = originsSmallestFirst([{ civ: 1, share: 0.9 }, { civ: 2, share: 0.1 }]);
  assert.equal(ordered[0].civ, 2, "smallest minority first");
  assert.equal(ordered[ordered.length - 1].civ, 1, "dominant last (the dense-core catch-all)");
}

console.log("ethnicity-distribution harness passed");
