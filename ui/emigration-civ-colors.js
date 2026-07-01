// emigration-civ-colors.js
//
// Readable per-civ display colours for the migration views, derived from the game's banner colours
// the same way the Demographics mod colours its graph lines: prefer a civ's PRIMARY banner colour,
// fall back to its SECONDARY when the primary is a dark grey/black (which would just become a dull
// grey), then lift any still-dark colour to a minimum lightness so it never vanishes on the dark
// canvas. Off-engine / unresolved players fall back to the caller's synthetic-palette colour.
//
// Readability is gauged by HSL lightness (not raw luminance): a saturated pure red reads fine on a
// dark background while a desaturated dark grey of the same luminance does not.

// Minimum HSL lightness a colour needs on the dark canvas, higher for greys (no hue to aid it).
const MIN_L_GREY = 0.65;
const MIN_L_SAT = 0.5;
// A primary banner colour worth replacing with the secondary: dark AND nearly colourless.
const DARK_GREY_MAX_L = 0.42;
const DARK_GREY_MAX_S = 0.3;

/**
 * Parse a `#RRGGBB`/`#AARRGGBB` or `rgb()/rgba()` colour into channels, or null.
 * @param {*} input Colour string.
 * @returns {{r:number, g:number, b:number}|null} Channels or null.
 */
function parse(input) {
  if (typeof input !== "string") return null;
  const hex = input.match(/^#?([0-9a-fA-F]{6,8})$/);
  if (hex) {
    const v = hex[1].slice(-6);
    return {
      r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16)
    };
  }
  const m = input.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  return { r: parseInt(m[1], 10), g: parseInt(m[2], 10), b: parseInt(m[3], 10) };
}

/**
 * Format RGB channels as `#RRGGBB`.
 * @param {number} r Red. @param {number} g Green. @param {number} b Blue.
 * @returns {string} Hex colour.
 */
function toHex(r, g, b) {
  const h2 = (/** @type {number} */ n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return "#" + h2(r) + h2(g) + h2(b);
}

/**
 * Convert RGB (0-255) to HSL.
 * @param {number} r Red. @param {number} g Green. @param {number} b Blue.
 * @returns {{h:number, s:number, l:number}} Hue [0,360), sat/light [0,1].
 */
function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

/**
 * Base RGB channels for an HSL hue sector (before the lightness offset).
 * @param {number} hp Hue partition (h/60). @param {number} c Chroma. @param {number} x Secondary.
 * @returns {{r:number, g:number, b:number}} Base channels (0-1).
 */
function hslBase(hp, c, x) {
  if (hp < 1) return { r: c, g: x, b: 0 };
  if (hp < 2) return { r: x, g: c, b: 0 };
  if (hp < 3) return { r: 0, g: c, b: x };
  if (hp < 4) return { r: 0, g: x, b: c };
  if (hp < 5) return { r: x, g: 0, b: c };
  return { r: c, g: 0, b: x };
}

/**
 * Convert HSL to a `#RRGGBB` string.
 * @param {number} h Hue. @param {number} s Saturation. @param {number} l Lightness.
 * @returns {string} Hex colour.
 */
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const base = hslBase(hp, c, x);
  const m = l - c / 2;
  const ch = (/** @type {number} */ v) => Math.round((v + m) * 255);
  return toHex(ch(base.r), ch(base.g), ch(base.b));
}

/**
 * Whether a colour is a dark, nearly-colourless grey/black (lifting it yields a dull grey).
 * @param {{r:number, g:number, b:number}} c Channels.
 * @returns {boolean} True for dark greys.
 */
function isDarkGrey(c) {
  const { s, l } = rgbToHsl(c.r, c.g, c.b);
  return l < DARK_GREY_MAX_L && s < DARK_GREY_MAX_S;
}

/**
 * Lift a colour to the minimum readable lightness for the dark canvas, preserving hue + saturation.
 * @param {string} color Colour string.
 * @returns {string} A readable `#RRGGBB` (or the input unchanged when unparseable).
 */
function safeColor(color) {
  const ch = parse(color);
  if (!ch) return color;
  const { h, s, l } = rgbToHsl(ch.r, ch.g, ch.b);
  const minL = MIN_L_GREY + (MIN_L_SAT - MIN_L_GREY) * Math.min(1, Math.max(0, s));
  if (l >= minL) return toHex(ch.r, ch.g, ch.b);
  return hslToHex(h, s, minL);
}

/**
 * Choose the more readable of a civ's two banner colours: the primary, unless it's a dark grey
 * (then the secondary, when it carries a real hue).
 * @param {*} primary Primary banner colour. @param {*} secondary Secondary banner colour.
 * @returns {*} The chosen colour.
 */
function preferReadable(primary, secondary) {
  const p = parse(primary);
  if (!p || !isDarkGrey(p)) return primary;
  const s = parse(secondary);
  if (s && !isDarkGrey(s)) return secondary;
  return primary;
}

/**
 * A live player's banner colour string via UI.Player, or undefined.
 * @param {number} pid Player id. @param {string} fn Getter name.
 * @returns {string|undefined} Colour string.
 */
function bannerColor(pid, fn) {
  try {
    if (typeof UI !== "undefined" && UI.Player && typeof UI.Player[fn] === "function") {
      const c = UI.Player[fn](pid);
      if (typeof c === "string" && c.length > 0) return c;
    }
  } catch (_) {
    /* unresolved player */
  }
  return undefined;
}

/**
 * A civ's readable display colour for the dark canvas: its real banner colour (primary, or the
 * secondary when the primary is a dark grey), lifted to a readable lightness. Falls back to
 * `fallbackHex` (a synthetic-palette colour) off-engine or when no banner colour is available.
 * @param {number} pid Civ/player id.
 * @param {string} fallbackHex Fallback `#RRGGBB`.
 * @returns {string} A readable `#RRGGBB`.
 */
export function civDisplayColor(pid, fallbackHex) {
  const primary = bannerColor(pid, "getPrimaryColorValueAsString");
  if (!primary) return fallbackHex;
  const secondary = bannerColor(pid, "getSecondaryColorValueAsString");
  const readable = safeColor(preferReadable(primary, secondary));
  const ch = parse(readable);
  return ch ? toHex(ch.r, ch.g, ch.b) : fallbackHex;
}

/**
 * A colour string at a given alpha (for translucent fills); passes through when unparseable.
 * @param {string} color A `#RRGGBB` (or rgb) colour.
 * @param {number} a Alpha 0..1.
 * @returns {string} An `rgba(...)` string.
 */
export function withAlpha(color, a) {
  const ch = parse(color);
  return ch ? "rgba(" + ch.r + "," + ch.g + "," + ch.b + "," + a + ")" : color;
}
