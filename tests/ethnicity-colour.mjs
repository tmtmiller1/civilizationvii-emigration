// ethnicity-colour.mjs
//
// The ethnicity lens's tile color (emigration-ethnicity-colour.js): a share-weighted BLEND of origin
// colors, replacing a winner-takes-all fill that painted every tile one banner color or another with a
// hard flip at 50%. Pure, so no engine stubs. Asserts the properties a gradient has and a flip does not:
//   1. a single-origin tile is exactly that origin's color;
//   2. the hue moves MONOTONICALLY toward an origin as its share rises, with no jump at the 50% line;
//   3. a minority below half of a tile still shifts the color (the old fill showed it not at all);
//   4. density drives saturation (gray → the blend) and opacity together, like the Prosperity lens, and
//      neither depends on who lives on the tile;
//   5. unusable shares / colors degrade to a finite color (a NaN in the Metal overlay is a crash vector).

import assert from "node:assert/strict";
import { tileFill, blendColour, mixWeights, unit, saturation, rampEnds, __test } from "/emigration/ui/emigration-ethnicity-colour.js";

const { MIN_ALPHA, MAX_ALPHA, GREY, DARK, SAT_FLOOR, toHsl } = __test;

const PURPLE = { r: 0.5, g: 0.1, b: 0.8 }; // host (civ 1)
const PALE = { r: 0.85, g: 0.85, b: 0.8 }; // diaspora (civ 2)
const RED = { r: 0.9, g: 0.1, b: 0.1 }; // second diaspora (civ 3)
const colourOf = (civ) => ({ 1: PURPLE, 2: PALE, 3: RED }[civ] || { r: 0.5, g: 0.5, b: 0.5 });
const mix = (share2) => blendColour([{ civ: 1, share: 1 - share2 }, { civ: 2, share: share2 }], colourOf, 1);
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
const close = (a, b) => dist(a, b) < 1e-9;
// A hued color (hue 0) at HSL saturation `sat`, lightness 0.5.
const fromHs = (sat) => ({ r: 0.5 + sat / 2, g: 0.5 - sat / 2, b: 0.5 - sat / 2 });

// ── 1. A single origin is exactly its own color ─────────────────────────────
assert.ok(close(blendColour([{ civ: 1, share: 1 }], colourOf, 1), PURPLE), "100% host → the host's color");
assert.ok(close(blendColour([{ civ: 2, share: 1 }], colourOf, 1), PALE), "100% diaspora → the diaspora's color");

// ── 2. Monotone gradient, and NO jump across the 50% line ────────────────────
{
  const steps = [];
  for (let s = 0; s <= 1.0001; s += 0.02) steps.push(mix(Math.min(1, s)));
  for (let i = 1; i < steps.length; i++) {
    assert.ok(dist(steps[i], PALE) < dist(steps[i - 1], PALE) + 1e-12,
      "every extra share moves the tile closer to that origin's color");
  }
  // The old fill flipped from one banner color to the other between 49% and 51%.
  const whole = dist(PURPLE, PALE);
  assert.ok(dist(mix(0.49), mix(0.51)) < whole * 0.06, "49% → 51% is a small step, not a flip of color");
  let biggest = 0;
  for (let i = 1; i < steps.length; i++) biggest = Math.max(biggest, dist(steps[i], steps[i - 1]));
  assert.ok(biggest < whole * 0.15, "no single 2% step is a jump anywhere along the gradient");
}

// ── 3. A sub-majority community is VISIBLE (the old fill ignored it entirely) ─
{
  assert.ok(dist(mix(0.30), PURPLE) > dist(PURPLE, PALE) * 0.2,
    "a community at the 30% enclave bar shifts the tile clearly off the host's color");
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

// ── 4. Density drives saturation ─────────────────────────────────────────────
{
  const rgb = (f) => ({ r: f.x, g: f.y, b: f.z });
  const host = { shares: [{ civ: 1, share: 1 }] };
  const at = (d) => rgb(tileFill(host, colourOf, { hostCiv: 1, densityNorm: d }));
  const { vivid } = rampEnds(PURPLE);
  assert.ok(close(at(1), vivid), "the densest tile is the banner color at its vivid end");
  assert.ok(dist(at(0), GREY) < dist(at(0), vivid), "the sparsest tile is closer to gray than to the banner");
  assert.ok(Math.abs(dist(at(0), GREY) - SAT_FLOOR * dist(vivid, GREY)) < 1e-9,
    "the sparsest tile keeps exactly the floor share of its color, so a fringe still shows whose it is");
  for (let d = 0.1; d <= 1.0001; d += 0.1) {
    assert.ok(dist(at(d), vivid) < dist(at(d - 0.1), vivid), "every step of density saturates the tile further");
  }
}

// ── 4b. The vivid end widens the ramp without changing whose color it is ────
{
  const hue = (c) => toHsl(c).h;
  for (const c of [PURPLE, PALE, RED, { r: 0.9, g: 0.46, b: 0.45 }, { r: 0.72, g: 0.5, b: 0.9 }]) {
    const { vivid } = rampEnds(c);
    assert.ok(Math.abs(hue(vivid) - hue(c)) < 0.5, "the vivid end keeps the banner's hue");
    assert.ok(Math.abs(toHsl(vivid).l - toHsl(c).l) < 1e-6, "and its lightness");
    assert.ok(dist(vivid, GREY) >= dist(c, GREY) - 1e-9, "and is never closer to gray than the banner itself");
  }
  const pink = { r: 229 / 255, g: 117 / 255, b: 116 / 255 };
  assert.ok(dist(rampEnds(pink).vivid, GREY) > dist(pink, GREY) * 1.3, "a pastel banner gets a clearly wider ramp");
  // A colorless banner ramps from charcoal, not from gray (gray → gray would draw nothing).
  const silver = { r: 166 / 255, g: 166 / 255, b: 166 / 255 };
  const ends = rampEnds(silver);
  assert.ok(close(ends.neutral, DARK) && close(ends.vivid, silver), "a gray civ ramps charcoal → its own gray");
  assert.ok(dist(ends.vivid, ends.neutral) > 0.5, "and that ramp is as wide as a colored civ's");
  assert.ok(close(rampEnds(PURPLE).neutral, GREY), "a colored banner keeps the Prosperity gray as its neutral");
  const ramp = [0, 0.1, 0.2, 0.3, 0.4].map((sat) => rampEnds(fromHs(sat)).neutral.r);
  for (let i = 1; i < ramp.length; i++) assert.ok(ramp[i] >= ramp[i - 1], "the neutral slides, it never flips");
}

// ── 4c. Opacity follows density only ─────────────────────────────────────────
{
  const tile = (s2) => ({ shares: [{ civ: 1, share: 1 - s2 }, { civ: 2, share: s2 }] });
  assert.ok(saturation(0.5) > saturation(0.2) && saturation(NaN) === SAT_FLOOR, "saturation is monotone and safe");
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
    const main = tileFill({ shares: [{ civ: 1, share: 1 }] }, colourOf, ctx);
    assert.ok(close({ r: f.x, g: f.y, b: f.z }, { r: main.x, g: main.y, b: main.z }),
      "and falls back to the settlement's main origin");
  }
  assert.ok(finite(tileFill(null, colourOf, ctx)), "a null tile is finite");
  assert.ok(finite(tileFill({ shares: [{ civ: 1, share: 1 }] }, () => ({ r: NaN, g: undefined, b: 9 }), ctx)),
    "a garbage color resolver cannot leak NaN or out-of-range channels");
  assert.ok(finite(tileFill({ shares: [{ civ: 1, share: 1 }] }, () => null, ctx)), "a null color is finite");
  assert.equal(unit(Infinity), 0, "non-finite clamps to 0");
  assert.equal(unit(3), 1, "over-range clamps to 1");
}

console.log("ethnicity-color harness passed");
