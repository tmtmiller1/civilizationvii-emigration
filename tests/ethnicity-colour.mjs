// ethnicity-colour.mjs
//
// The ethnicity lens's tile colour (emigration-ethnicity-colour.js): a share-weighted BLEND of origin
// colours, replacing a winner-takes-all fill that painted every tile one banner colour or another with a
// hard flip at 50%. Pure, so no engine stubs. Asserts the properties a gradient has and a flip does not:
//   1. a single-origin tile is exactly that origin's colour;
//   2. the hue moves MONOTONICALLY toward an origin as its share rises, with no jump at the 50% line;
//   3. a minority below half of a tile still shifts the colour (the old fill showed it not at all);
//   4. opacity carries density only, and is independent of who lives on the tile;
//   5. unusable shares / colours degrade to a finite colour (a NaN in the Metal overlay is a crash vector).

import assert from "node:assert/strict";
import { tileFill, blendColour, mixWeights, unit, __test } from "/emigration/ui/emigration-ethnicity-colour.js";

const { MIN_ALPHA, MAX_ALPHA } = __test;

const PURPLE = { r: 0.5, g: 0.1, b: 0.8 }; // host (civ 1)
const PALE = { r: 0.85, g: 0.85, b: 0.8 }; // diaspora (civ 2)
const RED = { r: 0.9, g: 0.1, b: 0.1 }; // second diaspora (civ 3)
const colourOf = (civ) => ({ 1: PURPLE, 2: PALE, 3: RED }[civ] || { r: 0.5, g: 0.5, b: 0.5 });
const mix = (share2) => blendColour([{ civ: 1, share: 1 - share2 }, { civ: 2, share: share2 }], colourOf, 1);
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
const close = (a, b) => dist(a, b) < 1e-9;

// ── 1. A single origin is exactly its own colour ─────────────────────────────
assert.ok(close(blendColour([{ civ: 1, share: 1 }], colourOf, 1), PURPLE), "100% host → the host's colour");
assert.ok(close(blendColour([{ civ: 2, share: 1 }], colourOf, 1), PALE), "100% diaspora → the diaspora's colour");

// ── 2. Monotone gradient, and NO jump across the 50% line ────────────────────
{
  const steps = [];
  for (let s = 0; s <= 1.0001; s += 0.02) steps.push(mix(Math.min(1, s)));
  for (let i = 1; i < steps.length; i++) {
    assert.ok(dist(steps[i], PALE) < dist(steps[i - 1], PALE) + 1e-12,
      "every extra share moves the tile closer to that origin's colour");
  }
  // The old fill flipped from one banner colour to the other between 49% and 51%.
  const whole = dist(PURPLE, PALE);
  assert.ok(dist(mix(0.49), mix(0.51)) < whole * 0.06, "49% → 51% is a small step, not a flip of colour");
  let biggest = 0;
  for (let i = 1; i < steps.length; i++) biggest = Math.max(biggest, dist(steps[i], steps[i - 1]));
  assert.ok(biggest < whole * 0.15, "no single 2% step is a jump anywhere along the gradient");
}

// ── 3. A sub-majority community is VISIBLE (the old fill ignored it entirely) ─
{
  assert.ok(dist(mix(0.30), PURPLE) > dist(PURPLE, PALE) * 0.2,
    "a community at the 30% enclave bar shifts the tile clearly off the host's colour");
  assert.ok(dist(mix(0.12), PURPLE) > dist(mix(0.03), PURPLE), "12% reads stronger than 3%");
  // The curve is symmetric, so the host's remaining 8% is lifted exactly as an 8% minority would be.
  assert.ok(dist(mix(0.92), PALE) < dist(PURPLE, PALE) * 0.2, "an enclave tile at 92% reads as the diaspora's own");
  assert.ok(Math.abs(dist(mix(0.5), PURPLE) - dist(mix(0.5), PALE)) < 1e-9, "an even split sits exactly halfway");
  assert.ok(Math.abs(dist(mix(0.08), PURPLE) - dist(mix(0.92), PALE)) < 1e-9,
    "the lift is symmetric: 8% of either people moves the tile the same distance");
}

// ── Three origins blend, and input order does not matter ─────────────────────
{
  const a = blendColour([{ civ: 1, share: 0.5 }, { civ: 2, share: 0.3 }, { civ: 3, share: 0.2 }], colourOf, 1);
  const b = blendColour([{ civ: 3, share: 0.2 }, { civ: 1, share: 0.5 }, { civ: 2, share: 0.3 }], colourOf, 1);
  assert.ok(close(a, b), "the blend is order-independent");
  assert.ok(a.r > mix(0.3).r - 0.2 && dist(a, RED) < dist(mix(0.375), RED), "the third origin pulls the hue its way");
  const w = mixWeights([{ civ: 1, share: 0.5 }, { civ: 2, share: 0.3 }, { civ: 3, share: 0.2 }]);
  assert.ok(Math.abs(w.reduce((s, x) => s + x.weight, 0) - 1) < 1e-12, "visual weights sum to 1");
  assert.ok(w[0].weight > w[1].weight && w[1].weight > w[2].weight, "visual weights keep the share order");
}

// ── 4. Opacity is density, not ethnicity ─────────────────────────────────────
{
  const tile = (s2) => ({ shares: [{ civ: 1, share: 1 - s2 }, { civ: 2, share: s2 }] });
  const sparse = tileFill(tile(0.5), colourOf, { hostCiv: 1, densityNorm: 0 });
  const dense = tileFill(tile(0.5), colourOf, { hostCiv: 1, densityNorm: 1 });
  assert.ok(dense.w > sparse.w, "a denser tile is more opaque");
  assert.ok(Math.abs(dense.w - MAX_ALPHA) < 1e-9, "the densest tile reaches the ceiling");
  assert.ok(sparse.w >= MIN_ALPHA, "the sparsest tile never drops below the floor");
  assert.equal(tileFill(tile(0.05), colourOf, { hostCiv: 1, densityNorm: 0.6 }).w,
    tileFill(tile(0.92), colourOf, { hostCiv: 1, densityNorm: 0.6 }).w,
    "who lives on a tile does not change its opacity (hue carries that)");
}

// ── 5. Degenerate inputs stay finite ─────────────────────────────────────────
{
  const finite = (f) => [f.x, f.y, f.z, f.w].every((n) => Number.isFinite(n) && n >= 0 && n <= 1);
  const ctx = { hostCiv: 1, densityNorm: NaN };
  for (const shares of [undefined, null, [], [{ civ: 1, share: NaN }], [{ civ: 1, share: -2 }], [null],
    [{ civ: "x", share: 1 }], [{ civ: 1, share: 0 }]]) {
    const f = tileFill({ shares }, colourOf, ctx);
    assert.ok(finite(f), "an unusable share list still yields a finite float4");
    assert.ok(close({ r: f.x, g: f.y, b: f.z }, PURPLE), "and falls back to the settlement's main origin");
  }
  assert.ok(finite(tileFill(null, colourOf, ctx)), "a null tile is finite");
  assert.ok(finite(tileFill({ shares: [{ civ: 1, share: 1 }] }, () => ({ r: NaN, g: undefined, b: 9 }), ctx)),
    "a garbage colour resolver cannot leak NaN or out-of-range channels");
  assert.ok(finite(tileFill({ shares: [{ civ: 1, share: 1 }] }, () => null, ctx)), "a null colour is finite");
  assert.equal(unit(Infinity), 0, "non-finite clamps to 0");
  assert.equal(unit(3), 1, "over-range clamps to 1");
}

console.log("ethnicity-colour harness passed");
