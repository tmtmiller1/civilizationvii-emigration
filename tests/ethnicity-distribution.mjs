// ethnicity-distribution.mjs
//
// The per-tile ethnicity-lens distribution model (emigration-ethnicity-distribution.js). Pure logic,
// so no engine stubs. Asserts the properties the lens + tooltip rely on:
//   1. degenerate inputs → [] (no throw);
//   2. a single origin gives every tile a 100% share of that origin;
//   3. denser (higher-weight, urban) tiles carry more people → higher opacity than sparse tiles;
//   4. each origin's people total still equals its citywide share (CONSERVATION), the per-tile local
//      shares VARY (a diaspora is concentrated, not smeared evenly), and at least one tile reads the
//      diaspora strongly (VISIBILITY), all deterministically.

import assert from "node:assert/strict";
import { distributeTiles, __test } from "/emigration/ui/emigration-ethnicity-distribution.js";

const { tileDensity, originsSmallestFirst } = __test;

const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
// People attributed to each origin = Σ over tiles of (local share × tile people).
const peopleByCiv = (tiles) => {
  /** @type {Record<number, number>} */
  const m = {};
  for (const t of tiles) for (const s of t.shares) m[s.civ] = (m[s.civ] || 0) + s.share * t.people;
  return m;
};
const localShareOf = (tile, civ) => {
  const e = tile.shares.find((s) => s.civ === civ);
  return e ? e.share : 0;
};

// ── 1. Degenerate inputs → [] ───────────────────────────────────────────────
assert.deepEqual(distributeTiles([], { civs: [{ civ: 1, share: 1 }], dominant: { civ: 1 } }, 1000), [],
  "no plots → []");
assert.deepEqual(distributeTiles([{ x: 0, y: 0, weight: 1 }], { civs: [] }, 1000), [],
  "no origins → []");
assert.deepEqual(distributeTiles(null, null, 0), [], "null inputs → []");

// ── 2. Single origin → every tile is 100% that origin ───────────────────────
{
  const plots = [
    { x: 0, y: 0, weight: 3.6 }, { x: 1, y: 0, weight: 1 },
    { x: 0, y: 1, weight: 1 }, { x: 1, y: 1, weight: 0.4 }
  ];
  const comp = { civs: [{ civ: 7, share: 1 }], dominant: { civ: 7 } };
  const tiles = distributeTiles(plots, comp, 200000);
  assert.equal(tiles.length, 4, "one tile per plot");
  assert.ok(tiles.every((t) => t.primary === 7 && t.shares.length === 1 && t.shares[0].civ === 7),
    "every tile is 100% the single origin");
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

// ── 4. Conservation + per-tile variation + visibility ───────────────────────
{
  // 80% civ 1 (dominant) / 20% civ 2 (minority) across a dense centre, an urban ring, rurals + fringe.
  const plots = [
    { x: 0, y: 0, weight: 3.6 },
    { x: 1, y: 0, weight: 2.4 }, { x: 0, y: 1, weight: 2.4 },
    { x: 1, y: 1, weight: 1 }, { x: 2, y: 0, weight: 1 }, { x: 0, y: 2, weight: 1 },
    { x: 2, y: 1, weight: 1 }, { x: 1, y: 2, weight: 1 },
    { x: 3, y: 3, weight: 0.4 }, { x: 4, y: 4, weight: 0.4 }
  ];
  const comp = { civs: [{ civ: 1, share: 0.8 }, { civ: 2, share: 0.2 }], dominant: { civ: 1 } };
  const total = 500000;
  const tiles = distributeTiles(plots, comp, total);
  const by = peopleByCiv(tiles);

  // CONSERVATION: each origin's people equals its citywide share of the total (within float dust).
  assert.ok(Math.abs(by[2] - 0.2 * total) < 1, `minority people = 20% of total (got ${by[2]})`);
  assert.ok(Math.abs(by[1] - 0.8 * total) < 1, `dominant people = 80% of total (got ${by[1]})`);
  assert.ok(Math.abs(sum(tiles, (t) => t.people) - total) < 1, "tile people sum to the total");

  // VARIATION: the minority's local share differs across the tiles it touches (not a flat smear).
  const minShares = tiles.map((t) => localShareOf(t, 2)).filter((s) => s > 0);
  assert.ok(minShares.length >= 2, "the minority appears on several tiles");
  assert.ok(Math.max(...minShares) - Math.min(...minShares) > 0.1,
    "the minority's local share varies tile to tile (some more, some less)");

  // VISIBILITY: at least one tile reads strongly as the minority (a cluster centre).
  assert.ok(Math.max(...minShares) >= 0.4, "a cluster tile is strongly the minority's colour");

  // Most tiles remain all-dominant (the city still reads as predominantly its own).
  const allDom = tiles.filter((t) => t.shares.length === 1 && t.primary === 1).length;
  assert.ok(allDom >= tiles.length / 2, "the majority of tiles stay all-dominant");

  // Per-tile shares each sum to ~1.
  for (const t of tiles) {
    assert.ok(Math.abs(t.shares.reduce((a, s) => a + s.share, 0) - 1) < 1e-6, "tile shares sum to 1");
  }

  // Determinism.
  assert.deepEqual(distributeTiles(plots, comp, total), tiles, "distribution is deterministic");
}

// ── 4b. A tiny minority still reads on at least one tile ─────────────────────
{
  const plots = Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0, weight: 1 }));
  const comp = { civs: [{ civ: 1, share: 0.97 }, { civ: 2, share: 0.03 }], dominant: { civ: 1 } };
  const tiles = distributeTiles(plots, comp, 800000);
  const maxMin = Math.max(...tiles.map((t) => localShareOf(t, 2)));
  assert.ok(maxMin >= 0.4, "even a 3% diaspora has one tile where it is the dominant local colour");
  const by = peopleByCiv(tiles);
  assert.ok(Math.abs(by[2] - 0.03 * 800000) < 1, "and its people still total its 3% share");
}

// ── 5. With no scaled people yet, everything falls back to the dominant ──────
{
  const plots = [{ x: 0, y: 0, weight: 1 }, { x: 1, y: 1, weight: 1 }];
  const comp = { civs: [{ civ: 1, share: 0.5 }, { civ: 2, share: 0.5 }], dominant: { civ: 2 } };
  const tiles = distributeTiles(plots, comp, 0);
  assert.ok(tiles.every((t) => t.primary === 2 && t.shares.length === 1),
    "no people scaled → all dominant (no spurious split)");
}

// ── helpers ─────────────────────────────────────────────────────────────────
assert.equal(tileDensity(0), 0, "no people → 0 density");
assert.ok(tileDensity(60000) > 0.5 && tileDensity(60000) < 0.7, "~ref people → ~0.63 density");
assert.ok(tileDensity(1e6) > 0.99, "huge density saturates toward 1");
assert.ok(tileDensity(200000) > tileDensity(100000), "density is monotone in people");
{
  const ordered = originsSmallestFirst([{ civ: 1, share: 0.9 }, { civ: 2, share: 0.1 }]);
  assert.equal(ordered[0].civ, 2, "smallest minority first");
  assert.equal(ordered[ordered.length - 1].civ, 1, "dominant last");
}

console.log("ethnicity-distribution harness passed");
