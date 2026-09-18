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
//      so no tile fully switches colour), all deterministically;
//   5. an enclave ANCHOR PIN moves a diaspora's cluster onto the pinned tile while leaving every citywide
//      share and the settlement's people untouched, and an absent/unusable pin falls back to the hash anchor;
//   6. only an ENCLAVE tile may read past the enclave formation bar: plain tiles are capped at it, the
//      enclave tile fills first, and every case still conserves.

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

// ── 6. An enclave pin MOVES the cluster without changing any share ───────────
// The enclave tile is chosen by a land/adjacency rule that knows nothing about the hash anchor, so the
// pin is what makes the colour patch and the on-map enclave marker name the same tile.
{
  // A row of tiles far enough apart that the anchor's identity is unmistakable in the result.
  const plots = [
    { x: 0, y: 0, weight: 1 }, { x: 1, y: 0, weight: 1 }, { x: 2, y: 0, weight: 1 },
    { x: 3, y: 0, weight: 1 }, { x: 4, y: 0, weight: 1 }, { x: 5, y: 0, weight: 1 }
  ];
  const comp = { civs: [{ civ: 1, share: 0.8 }, { civ: 2, share: 0.2 }], dominant: { civ: 1 } };
  const peak = (tiles) => tiles.reduce((a, t) => (localShareOf(t, 2) > localShareOf(a, 2) ? t : a));

  const unpinned = distributeTiles(plots, comp, 500000);
  const hashPeak = peak(unpinned);

  // Pin civ 2 to a tile that is NOT where the hash put it, so the assertion can't pass by luck.
  const pinTo = plots.find((p) => p.x !== hashPeak.x);
  const pinned = distributeTiles(plots, comp, 500000, { anchors: new Map([[2, { x: pinTo.x, y: pinTo.y }]]) });
  const pinnedPeak = peak(pinned);

  assert.equal(pinnedPeak.x, pinTo.x, "the diaspora's densest tile is the PINNED (enclave) tile");
  assert.notEqual(pinnedPeak.x, hashPeak.x, "and the pin genuinely moved it off the hash anchor");

  // The pin is POSITIONAL only: the citywide split is untouched, which is what keeps the lens honest
  // about the formation/fade bars read elsewhere in the mod.
  const by = peopleByCiv(pinned);
  assert.ok(Math.abs(by[2] - 0.2 * 500000) < 1, "the pinned diaspora still totals its 20% citywide share");
  assert.ok(Math.abs(sum(pinned, (t) => t.people) - sum(unpinned, (t) => t.people)) < 1,
    "and the settlement's people are unchanged");
  assert.ok(pinned.every((t) => localShareOf(t, 1) > 0), "every tile still blends the host (no full switch)");

  // Degenerate pins fall back to the hash anchor rather than throwing or blanking the lens.
  for (const bad of [undefined, null, new Map(), new Map([[2, { x: NaN, y: 0 }]]), new Map([[99, { x: 5, y: 0 }]])]) {
    const out = distributeTiles(plots, comp, 500000, { anchors: bad });
    assert.equal(peak(out).x, hashPeak.x, "an absent/unusable pin falls back to the hash anchor");
  }
  assert.equal(peak(distributeTiles(plots, comp, 500000, { anchors: { get: 3, forEach: 4 } })).x, hashPeak.x,
    "a non-Map 'anchors' argument is ignored, not called");
  assert.equal(peak(distributeTiles(plots, comp, 500000, null)).x, hashPeak.x, "null opts paints as before");
}

// ── 7. Only an ENCLAVE tile may blaze: plain tiles stop at the enclave formation bar ─
// Watched in game 2026-09-17: Lahaina was 88% Mongolian / 12% Norman with NO enclave (12% of the 30% it
// needs), yet one tile read "Norman 92%" — the water-fill ran any minority up to MINORITY_CAP — while the
// real Norman enclave, another settlement's, sat hexes away. A blazing tile has to MEAN an enclave.
{
  const BAR = 0.30;
  const plots = [];
  for (let i = 0; i < 14; i++) plots.push({ x: i % 5, y: Math.floor(i / 5), weight: i === 0 ? 3.6 : (i < 4 ? 2.4 : 1) });
  const lahaina = { civs: [{ civ: 1, share: 0.88 }, { civ: 2, share: 0.12 }], dominant: { civ: 1 } };
  const top = (tiles) => Math.max(...tiles.map((t) => localShareOf(t, 2)));
  const at = (tiles, x, y) => tiles.find((t) => t.x === x && t.y === y);

  // The defect, pinned: with no bar the 12% diaspora still runs a tile far past enclave strength.
  assert.ok(top(distributeTiles(plots, lahaina, 500000)) > 0.8, "unbarred, a 12% diaspora paints an 80%+ tile");

  const plain = distributeTiles(plots, lahaina, 500000, { plainCap: BAR });
  assert.ok(top(plain) <= BAR + 1e-9, "with no enclave, no tile reads above the enclave formation bar");
  assert.ok(top(plain) > 0.12 + 0.05, "but the diaspora still CONCENTRATES (a gradient, not a flat 12%)");
  assert.ok(Math.abs(peopleByCiv(plain)[2] - 0.12 * 500000) < 1, "and still totals its 12% citywide share");

  // With an enclave, its tile — and only its tile — goes past the bar, because it fills FIRST.
  const enclave = distributeTiles(plots, lahaina, 500000, { plainCap: BAR, anchors: new Map([[2, { x: 2, y: 0 }]]) });
  assert.ok(localShareOf(at(enclave, 2, 0), 2) > 0.9, "the enclave tile reads as the diaspora's own quarter");
  assert.ok(enclave.every((t) => (t.x === 2 && t.y === 0) || localShareOf(t, 2) <= BAR + 1e-9),
    "every other tile stays at or under the bar");
  assert.ok(localShareOf(at(enclave, 2, 0), 2) <= MINORITY_CAP + 1e-9 && localShareOf(at(enclave, 2, 0), 1) > 0,
    "even the enclave tile keeps a sliver of the host (a blend, never a full switch)");
  assert.ok(Math.abs(peopleByCiv(enclave)[2] - 0.12 * 500000) < 1, "filling the enclave first still conserves");

  // A settlement already past the bar: the cap lifts with it so everyone can still be placed, and keeps
  // headroom so the result is a gradient. (A cap equal to the citywide share painted one dead-flat value.)
  const big = { civs: [{ civ: 1, share: 0.55 }, { civ: 2, share: 0.45 }], dominant: { civ: 1 } };
  const bigPlain = distributeTiles(plots, big, 500000, { plainCap: BAR });
  assert.ok(Math.abs(peopleByCiv(bigPlain)[2] - 0.45 * 500000) < 1, "a 45% diaspora is still fully placed");
  const bigShares = bigPlain.map((t) => localShareOf(t, 2));
  assert.ok(Math.max(...bigShares) - Math.min(...bigShares) > 0.2, "and still reads as a gradient, not a slab");
  assert.ok(Math.max(...bigShares) < MINORITY_CAP - 0.05, "while staying short of enclave strength");

  // Two diasporas share the bar on a tile; both conserve.
  const two = { civs: [{ civ: 1, share: 0.75 }, { civ: 2, share: 0.15 }, { civ: 3, share: 0.1 }], dominant: { civ: 1 } };
  const twoTiles = distributeTiles(plots, two, 500000, { plainCap: BAR });
  assert.ok(twoTiles.every((t) => localShareOf(t, 2) + localShareOf(t, 3) <= BAR + 1e-9),
    "the bar bounds a tile's COMBINED minorities");
  const by = peopleByCiv(twoTiles);
  assert.ok(Math.abs(by[2] - 0.15 * 500000) < 1 && Math.abs(by[3] - 0.1 * 500000) < 1, "both diasporas conserve");

  // The bar holds all the way up to it (an earlier rule lifted the ceiling from a 19% community up), and
  // the knife-edge — a foreign population of exactly the bar, so capacity equals demand — still conserves.
  for (const share of [0.2, 0.25, 0.29, 0.3]) {
    const c = { civs: [{ civ: 1, share: 1 - share }, { civ: 2, share }], dominant: { civ: 1 } };
    const t = distributeTiles(plots, c, 500000, { plainCap: BAR });
    assert.ok(top(t) <= BAR + 1e-9, `a ${share * 100}% community with no enclave never paints past the bar`);
    assert.ok(Math.abs(peopleByCiv(t)[2] - share * 500000) < 1, `and a ${share * 100}% community conserves`);
  }

  // A bad bar is ignored rather than zeroing the lens.
  for (const bad of [0, -1, NaN, "x"]) {
    assert.ok(top(distributeTiles(plots, lahaina, 500000, { plainCap: bad })) > 0.8, "an unusable bar means no bar");
  }
}

// ── 8. The enclave tile is the MOST enclave tile in the city, whatever the enclave's citywide share ─
// Watched in game 2026-09-18: Rostov on Don, Norman-held and 60% Bulgarian, painted its Bulgar Enclave tile
// "Norman 92%, Bulgarian 8%" while the rest of the city read Bulgarian. A majority enclave people was taken as
// the base fill (never seated on its own tile), and the enclave tile's full MINORITY_CAP went to the owner's
// people instead. Every enclave position in a synthetic 4x4 city, at four enclave shares, must seat the enclave
// people most heavily on its own tile, and still conserve both origins.
{
  const BAR = 0.30;
  const OWNER = 1, ENCLAVE = 2;
  const plots = [];
  for (let i = 0; i < 16; i++) {
    plots.push({ x: i % 4, y: Math.floor(i / 4), weight: i === 5 ? 3.6 : (i === 6 || i === 9 ? 2.4 : 1) });
  }
  for (const share of [0.1, 0.35, 0.6, 0.8]) {
    const civs = [{ civ: OWNER, share: 1 - share }, { civ: ENCLAVE, share }].sort((a, b) => b.share - a.share);
    const comp = { civs, dominant: { civ: civs[0].civ } };
    for (const p of plots) {
      const tiles = distributeTiles(plots, comp, 500000, { plainCap: BAR, anchors: new Map([[ENCLAVE, { x: p.x, y: p.y }]]) });
      const home = localShareOf(tiles.find((t) => t.x === p.x && t.y === p.y), ENCLAVE);
      const best = Math.max(...tiles.map((t) => localShareOf(t, ENCLAVE)));
      assert.ok(home >= best - 1e-9,
        `a ${share * 100}% enclave at ${p.x},${p.y} reads ${home.toFixed(2)} on its tile, below the city's best ${best.toFixed(2)}`);
      const by = peopleByCiv(tiles);
      assert.ok(Math.abs(by[ENCLAVE] - share * 500000) < 1, `a ${share * 100}% enclave conserves at ${p.x},${p.y}`);
      assert.ok(Math.abs(by[OWNER] - (1 - share) * 500000) < 1, `the owner conserves at ${p.x},${p.y}`);
    }
  }

  // A tiny owner: the enclave people are 95% of the city. The plain ceiling must lift past MINORITY_CAP to
  // place them all, and the owner keeps only the sliver its share allows.
  const tiny = { civs: [{ civ: ENCLAVE, share: 0.95 }, { civ: OWNER, share: 0.05 }], dominant: { civ: ENCLAVE } };
  const tinyTiles = distributeTiles(plots, tiny, 500000, { plainCap: BAR, anchors: new Map([[ENCLAVE, { x: 0, y: 0 }]]) });
  const tinyBy = peopleByCiv(tinyTiles);
  assert.ok(Math.abs(tinyBy[ENCLAVE] - 0.95 * 500000) < 1, "a 95% enclave people is fully placed");
  assert.ok(Math.abs(tinyBy[OWNER] - 0.05 * 500000) < 1, "and the 5% owner keeps its share");

  // A third origin on the enclave tile gets only the plain ceiling there: the enclave's headroom is its own.
  const three = { civs: [{ civ: OWNER, share: 0.7 }, { civ: 3, share: 0.2 }, { civ: ENCLAVE, share: 0.1 }], dominant: { civ: OWNER } };
  for (const p of plots) {
    const t3 = distributeTiles(plots, three, 500000, { plainCap: BAR, anchors: new Map([[ENCLAVE, { x: p.x, y: p.y }]]) });
    const home = t3.find((t) => t.x === p.x && t.y === p.y);
    assert.ok(localShareOf(home, 3) <= BAR + 1e-9, `another diaspora stays under the bar on the enclave tile at ${p.x},${p.y}`);
    assert.ok(localShareOf(home, ENCLAVE) >= Math.max(...t3.map((t) => localShareOf(t, ENCLAVE))) - 1e-9,
      `the enclave tile still leads for its people at ${p.x},${p.y}`);
  }
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
