// emigration-ethnicity-colour.js
//
// The ETHNICITY-LENS tile colour: a tile's fill is the BLEND of every origin living on it, each weighted
// by its share of the tile, so the map reads as a continuous gradient between banner colours. A tile that
// is 30% Norman sits 30% of the way (on a gentle contrast curve) from the host's colour toward the
// Normans'; a tile that is 92% Norman is all but their colour.
//
// This replaces a winner-takes-all fill. The lens used to take ONLY the leading origin's colour and grey
// it by how firmly that origin led, so every tile was one banner colour or another with a hard flip at the
// 50% line — watched in game 2026-09-17, a settlement read as flat slabs of the host's purple while the
// hover panel reported anything from 8% to 92% underneath. A diaspora below half of a tile never showed
// its colour at all, which would have made every community under the enclave bar invisible.
//
// Pure: no engine reads and no imports, so the gradient is unit-testable (the lens itself imports the
// game's LensManager and cannot be loaded off-engine). The lens supplies the civ → colour resolver.

/** @typedef {{r:number, g:number, b:number}} RGB Channels in [0,1]. */

// Opacity ramps with a tile's POPULATION DENSITY within its own settlement: the built-up core reads
// vivid, the rural fringe faint. Ethnicity is carried by HUE, density by OPACITY, so neither hides the other.
const MIN_ALPHA = 0.45; // the sparsest tile still reads as a claim on the terrain
const MAX_ALPHA = 0.85; // the densest tile is unmistakable but never fully hides the map
// How much of the opacity range density modulates; the floor keeps a settlement's fringe from vanishing.
const DENSITY_FLOOR = 0.45;
// Contrast curve on an origin's share before mixing (< 1 lifts small shares). Linear mixing is honest but
// hard to read: a 12% community shifts the hue by an amount the eye barely registers against terrain.
// 0.7 lifts it to about 20% while keeping the mix strictly monotone — more people is always more colour —
// and the hover panel still reports the true percentages.
const MIX_GAMMA = 0.7;
// The mix itself is a plain weighted average of the banner colours. Mixing in linear light was tried and
// rejected: it favours whichever colour is BRIGHTER, and stacked on the share curve it let a 2% community
// of a pale-bannered people carry a tile 19% of the way to their colour (30% read as 56%) — the same kind
// of overstatement as the 92% tile this lens was reworked to get rid of. One lift, applied to the share.

/**
 * Clamp a number to a finite [0,1] (NaN / non-finite → 0). Every channel that reaches the Metal plot
 * overlay goes through this: a NaN there is a known Mac crash vector.
 * @param {number} n A value. @returns {number} The clamped value.
 */
export function unit(n) {
  return typeof n === "number" && isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

/**
 * Each origin's VISUAL weight on a tile: its share on the contrast curve, normalized to sum 1. Shares
 * that are not positive finite numbers carry no weight.
 * @param {{civ:number, share:number}[]} shares The tile's local shares.
 * @returns {{civ:number, weight:number}[]} Weights summing to 1 (empty when nothing is usable).
 */
export function mixWeights(shares) {
  /** @type {{civ:number, weight:number}[]} */
  const out = [];
  let total = 0;
  for (const s of shares || []) {
    const share = s ? unit(s.share) : 0;
    if (!(share > 0) || typeof s.civ !== "number") continue;
    const weight = Math.pow(share, MIX_GAMMA);
    out.push({ civ: s.civ, weight });
    total += weight;
  }
  if (!(total > 0)) return [];
  for (const w of out) w.weight /= total;
  return out;
}

/**
 * The blended colour of a tile: the average of every origin's colour, weighted by its visual weight. Falls
 * back to the settlement's main origin when the tile has no usable shares.
 * @param {{civ:number, share:number}[]} shares The tile's local shares.
 * @param {(civ:number) => RGB} colourOf Resolves an origin's banner colour.
 * @param {number} fallbackCiv The settlement's main origin.
 * @returns {RGB} The blend, channels in [0,1].
 */
export function blendColour(shares, colourOf, fallbackCiv) {
  const weights = mixWeights(shares);
  if (!weights.length) return clampRGB(colourOf(fallbackCiv));
  let r = 0;
  let g = 0;
  let b = 0;
  for (const w of weights) {
    const c = clampRGB(colourOf(w.civ));
    r += w.weight * c.r;
    g += w.weight * c.g;
    b += w.weight * c.b;
  }
  return { r: unit(r), g: unit(g), b: unit(b) };
}

/**
 * A colour with every channel finite-clamped (an unreadable colour reads as black rather than NaN).
 * @param {*} c A candidate colour. @returns {RGB} The safe colour.
 */
function clampRGB(c) {
  return { r: unit(c && c.r), g: unit(c && c.g), b: unit(c && c.b) };
}

/**
 * The float4 fill for one tile: hue from the blend of who lives there, opacity from how many.
 * @param {{shares:{civ:number, share:number}[]}} tile A tile paint.
 * @param {(civ:number) => RGB} colourOf Resolves an origin's banner colour.
 * @param {{hostCiv:number, densityNorm:number}} ctx The settlement's main origin, and the tile's density
 *   within its settlement (0 sparsest … 1 densest).
 * @returns {{x:number, y:number, z:number, w:number}} Float4 RGBA, every channel in [0,1].
 */
export function tileFill(tile, colourOf, ctx) {
  const c = blendColour(tile && tile.shares, colourOf, ctx.hostCiv);
  const k = DENSITY_FLOOR + (1 - DENSITY_FLOOR) * unit(ctx.densityNorm);
  return { x: c.r, y: c.g, z: c.b, w: unit(MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * k) };
}

// Test-only re-exports.
export const __test = { MIN_ALPHA, MAX_ALPHA, MIX_GAMMA };
