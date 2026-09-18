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

// SATURATION ramps with a tile's POPULATION DENSITY within its own settlement, the same way the Prosperity lens
// ramps with its score (emigration-tile-score.js): one strength value pulls the colour from neutral grey toward
// the banner blend AND raises the opacity with it, so the built-up core reads as the vivid banner colour and the
// rural fringe as a greyed, faint wash of it. WHO lives there is the hue; HOW MANY is the saturation.
const MIN_ALPHA = 0.45; // the sparsest tile still reads as a claim on the terrain
const MAX_ALPHA = 0.85; // the densest tile is unmistakable but never fully hides the map
// Neutral end of the saturation ramp (0-1): the Prosperity lens's grey, so both lenses share a baseline.
const GREY = { r: 150 / 255, g: 150 / 255, b: 150 / 255 };
// Neutral end for a colourless banner (a grey or white civ). Ramping grey toward grey draws nothing, so a colour
// with no hue ramps up from charcoal instead, and reads as dark fringe → light core. The neutral slides between
// the two by the colour's HSL saturation (full grey at ACHROMATIC_S and above), so there is no flip at a threshold.
const DARK = { r: 56 / 255, g: 56 / 255, b: 56 / 255 };
const ACHROMATIC_S = 0.35;
// Chroma gain on the ramp's vivid end. Prosperity's green and red sit ~0.7 from grey; lifted banner colours run
// from 0.35 (pink, light purple) to 0.9 (red), so the muted ones had half the ramp to work with and a rural tile
// barely left grey. Multiplying HSL saturation (capped at 1) keeps each hue and lightness, pushes pastels toward
// their pure hue, and leaves a near-grey near grey (0.05 × gain is still colourless).
const CHROMA_GAIN = 1.6;
// Saturation of the sparsest tile. Prosperity lets its middle go fully grey (ordinary land carries no signal);
// here the hue IS the signal, so the fringe keeps a quarter of its colour and a rural diaspora stays legible.
const SAT_FLOOR = 0.25;
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
 * RGB (0-1) to HSL (hue in degrees, s/l in 0-1).
 * @param {RGB} c A colour. @returns {{h:number, s:number, l:number}} HSL.
 */
function toHsl(c) {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-9) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === c.r) h = ((c.g - c.b) / d + 6) % 6;
  else if (max === c.g) h = (c.b - c.r) / d + 2;
  else h = (c.r - c.g) / d + 4;
  return { h: h * 60, s: unit(s), l };
}

/**
 * HSL back to RGB (0-1).
 * @param {{h:number, s:number, l:number}} hsl HSL. @returns {RGB} The colour.
 */
function fromHsl({ h, s, l }) {
  const f = (/** @type {number} */ n) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return unit(l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return { r: f(0), g: f(8), b: f(4) };
}

/**
 * The ramp's two ends for a blended colour: its vivid end (the blend with HSL saturation multiplied by
 * CHROMA_GAIN, hue and lightness kept) and its neutral end (grey for a coloured blend, sliding to charcoal as
 * the blend loses its hue).
 * @param {RGB} c The share-weighted blend. @returns {{vivid:RGB, neutral:RGB}} Ramp ends.
 */
export function rampEnds(c) {
  const hsl = toHsl(c);
  const vivid = fromHsl({ h: hsl.h, s: unit(hsl.s * CHROMA_GAIN), l: hsl.l });
  const k = unit(hsl.s / ACHROMATIC_S);
  const neutral = {
    r: DARK.r + (GREY.r - DARK.r) * k, g: DARK.g + (GREY.g - DARK.g) * k, b: DARK.b + (GREY.b - DARK.b) * k
  };
  return { vivid, neutral };
}

/**
 * The 0-1 saturation of a tile from its density within its settlement: the sparsest tile sits at the floor,
 * the densest at full strength. (The lens already puts density on a contrast curve, densityNorms.)
 * @param {number} densityNorm 0 sparsest … 1 densest. @returns {number} Saturation in [SAT_FLOOR, 1].
 */
export function saturation(densityNorm) {
  return SAT_FLOOR + (1 - SAT_FLOOR) * unit(densityNorm);
}

/**
 * The float4 fill for one tile: hue from the blend of who lives there, saturation (neutral → that hue, made
 * vivid) and opacity together from how many.
 * @param {{shares:{civ:number, share:number}[]}} tile A tile paint.
 * @param {(civ:number) => RGB} colourOf Resolves an origin's banner colour.
 * @param {{hostCiv:number, densityNorm:number}} ctx The settlement's main origin, and the tile's density
 *   within its settlement (0 sparsest … 1 densest).
 * @returns {{x:number, y:number, z:number, w:number}} Float4 RGBA, every channel in [0,1].
 */
export function tileFill(tile, colourOf, ctx) {
  const { vivid, neutral } = rampEnds(blendColour(tile && tile.shares, colourOf, ctx.hostCiv));
  const k = saturation(ctx.densityNorm);
  return {
    x: unit(neutral.r + (vivid.r - neutral.r) * k),
    y: unit(neutral.g + (vivid.g - neutral.g) * k),
    z: unit(neutral.b + (vivid.b - neutral.b) * k),
    w: unit(MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * k)
  };
}

// Test-only re-exports.
export const __test = { MIN_ALPHA, MAX_ALPHA, MIX_GAMMA, GREY, DARK, SAT_FLOOR, CHROMA_GAIN, toHsl };
