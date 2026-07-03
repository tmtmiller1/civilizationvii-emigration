// ethnicity-distribution.mjs
//
// The per-tile ethnicity-lens distribution model (emigration-ethnicity-distribution.js) — the SMOOTH
// GRADIENT blend model: each tile carries its own local origin mix, a diaspora forming a spatial cluster
// (high local share at its anchor, fading with hex distance) that the lens blends into a colour gradient.
// Pure logic, so no engine stubs. Asserts the properties the lens + tooltip rely on:
//   1. degenerate inputs → [] (no throw);
//   2. a single origin gives every tile a 100% share of that origin;
//   3. denser (higher-weight, urban) tiles carry more people → higher opacity than sparse tiles;
//   4. each origin's people total its citywide share (CONSERVATION); the minority's local share VARIES
//      tile to tile (a gradient, not a flat smear); every tile stays a BLEND (the host is always present,
//      so no tile fully switches colour), all deterministically.

import assert from "node:assert/strict";
import { distributeTiles, __test } from "/emigration/ui/emigration-ethnicity-distribution.js";

const { tileDensity, originsSmallestFirst, hexDistance, MINORITY_CAP } = __test;

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

// ── 4. Conservation + gradient variation + always-a-blend ───────────────────
{
  // 60% civ 1 (host) / 40% civ 2 (diaspora) across a dense centre, an urban ring, rurals + fringe.
  const plots = [
    { x: 3, y: 3, weight: 3.6 },
    { x: 4, y: 3, weight: 2.4 }, { x: 3, y: 4, weight: 2.4 },
    { x: 4, y: 4, weight: 1 }, { x: 5, y: 3, weight: 1 }, { x: 3, y: 5, weight: 1 },
    { x: 5, y: 4, weight: 1 }, { x: 4, y: 5, weight: 1 },
    { x: 7, y: 7, weight: 0.4 }, { x: 8, y: 8, weight: 0.4 }
  ];
  const comp = { civs: [{ civ: 1, share: 0.6 }, { civ: 2, share: 0.4 }], dominant: { civ: 1 } };
  const total = 500000;
  const tiles = distributeTiles(plots, comp, total);
  const by = peopleByCiv(tiles);

  // CONSERVATION: each origin's people equals its citywide share of the total (within float dust).
  assert.ok(Math.abs(by[2] - 0.4 * total) < 1, `diaspora people = 40% of total (got ${by[2]})`);
  assert.ok(Math.abs(by[1] - 0.6 * total) < 1, `host people = 60% of total (got ${by[1]})`);
  assert.ok(Math.abs(sum(tiles, (t) => t.people) - total) < 1, "tile people sum to the total");

  // GRADIENT: the diaspora's local share varies smoothly across tiles (not a flat smear).
  const minShares = tiles.map((t) => localShareOf(t, 2));
  assert.ok(Math.max(...minShares) - Math.min(...minShares) > 0.2,
    "the diaspora's local share varies tile to tile (a gradient)");
  // The cluster centre reads strongly as the diaspora, the far fringe barely at all.
  assert.ok(Math.max(...minShares) >= 0.5, "the cluster centre reads strongly as the diaspora");
  assert.ok(Math.min(...minShares) < 0.3, "distant tiles fade toward the host");

  // ALWAYS A BLEND: no tile fully switches to the diaspora — the host keeps at least (1-CAP) everywhere.
  assert.ok(tiles.every((t) => localShareOf(t, 2) <= MINORITY_CAP + 1e-9),
    "no tile exceeds the minority cap (the host is always present → colours blend, never switch)");
  assert.ok(tiles.every((t) => localShareOf(t, 1) > 0), "every tile keeps some host share");

  // Per-tile shares each sum to ~1.
  for (const t of tiles) {
    assert.ok(Math.abs(t.shares.reduce((a, s) => a + s.share, 0) - 1) < 1e-6, "tile shares sum to 1");
  }

  // Determinism.
  assert.deepEqual(distributeTiles(plots, comp, total), tiles, "distribution is deterministic");
}

// ── 4b. A tiny minority still tints a cluster (conserved, gradient) ──────────
{
  const plots = Array.from({ length: 16 }, (_, i) => ({ x: 1 + (i % 4), y: 1 + Math.floor(i / 4), weight: 1 }));
  const comp = { civs: [{ civ: 1, share: 0.93 }, { civ: 2, share: 0.07 }], dominant: { civ: 1 } };
  const tiles = distributeTiles(plots, comp, 800000);
  const minShares = tiles.map((t) => localShareOf(t, 2));
  assert.ok(Math.max(...minShares) > Math.min(...minShares) + 0.02,
    "even a 7% diaspora forms a visible gradient (anchor tint > fringe tint)");
  const by = peopleByCiv(tiles);
  assert.ok(Math.abs(by[2] - 0.07 * 800000) < 1, "and its people still total its 7% share");
}

// ── 5. With no scaled people yet, everything falls back to the host ──────────
{
  const plots = [{ x: 0, y: 0, weight: 1 }, { x: 1, y: 1, weight: 1 }];
  const comp = { civs: [{ civ: 1, share: 0.5 }, { civ: 2, share: 0.5 }], dominant: { civ: 2 } };
  const tiles = distributeTiles(plots, comp, 0);
  assert.ok(tiles.every((t) => t.primary === 2 && t.shares.length === 1),
    "no people scaled → all host (no spurious split)");
}

// ── helpers ─────────────────────────────────────────────────────────────────
assert.equal(tileDensity(0), 0, "no people → 0 density");
assert.ok(tileDensity(60000) > 0.5 && tileDensity(60000) < 0.7, "~ref people → ~0.63 density");
assert.ok(tileDensity(1e6) > 0.99, "huge density saturates toward 1");
assert.ok(tileDensity(200000) > tileDensity(100000), "density is monotone in people");
assert.equal(hexDistance(3, 3, 3, 3), 0, "hex distance to self is 0");
assert.ok(hexDistance(0, 0, 3, 0) === 3, "hex distance along a row");
assert.ok(hexDistance(0, 0, 5, 5) > 0, "hex distance is positive for distinct tiles");
{
  const ordered = originsSmallestFirst([{ civ: 1, share: 0.9 }, { civ: 2, share: 0.1 }]);
  assert.equal(ordered[0].civ, 2, "smallest minority first");
  assert.equal(ordered[ordered.length - 1].civ, 1, "dominant last");
}

console.log("ethnicity-distribution harness passed");
