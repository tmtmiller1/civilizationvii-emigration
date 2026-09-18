// emigration-tile-score.js
//
// The per-TILE prosperity scale shared by the Prosperity lens (emigration-prosperity-lens.js) and its cursor panel
// (emigration-prosperity-tooltip.js): one place that decides what a tile is worth, which tiles count, how a tile is
// normalized against its OWN settlement, and what colour that deviation paints. Kept as a leaf module (engine globals
// only, no mod imports) so both surfaces can import it without an import cycle, and so the number the panel prints is
// by construction the number the colour came from.
//
// Why per settlement: scaling every tile against the world's most extreme tile left 94% of tiles within 15% of the
// mean and painted 1120 of 1775 plots in one shade (mod test 77). Why built water counts but empty sea does not: an
// unworked ocean plot scores 0 and dragged a coastal city's scale (mod test 79 found London's "worst tile" was open
// water), while a pier or fishing boat is part of what the settlement works. Why a wonder is not land: a wonder's
// worth is its modifier, not what the hex under it produces. The Hanging Gardens has NO yield rows in the compiled
// database (it is +10% growth; 6 of 63 wonders yield nothing at all, and most others 2-3), so on the yield scale
// it read as London's worst tile at -100% with a 0 next to a 7 (in-game, 2026-09-17). A wonder plot is a LANDMARK:
// kept out of its settlement's scale (like empty sea), painted its own colour off the red/green axis, and credited
// where the model actually counts it, the settlement's built-environment term (emigration-built.js).

const FILL_ALPHA_MIN = 0.45; // a middling tile stays readable as terrain
const FILL_ALPHA_MAX = 0.85; // a settlement's best and worst land is unmistakable
const CONTRAST_GAMMA = 0.55; // < 1 saturates the middle: most tiles sit close to their settlement's mean
// Gradient endpoints (0-255): grey (neutral) → green (above its settlement's mean) / red (below).
const GREY = [150, 150, 150];
const GREEN = [24, 224, 72];
const RED = [238, 40, 32];
const LANDMARK = [232, 178, 52]; // amber: a wonder, off the red/grey/green yield axis
const LANDMARK_ALPHA = 0.7;

/**
 * Clamp v into [lo, hi].
 * @param {number} v Value. @param {number} lo Min. @param {number} hi Max.
 * @returns {number} Clamped.
 */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * The 0-1 saturation for a normalized deviation: a curve, so the crowded middle of the range still reads.
 * @param {number} t Normalized deviation in [-1, 1].
 * @returns {number} Saturation in [0, 1].
 */
function saturation(t) {
  return Math.pow(clamp(Math.abs(t), 0, 1), CONTRAST_GAMMA);
}

/**
 * The 0-255 channel value for one colour component at deviation t.
 * @param {number} t Normalized deviation. @param {number} i Channel index (0-2).
 * @returns {number} Channel value 0-255.
 */
function channel(t, i) {
  const to = t >= 0 ? GREEN : RED;
  return GREY[i] + (to[i] - GREY[i]) * saturation(t);
}

/**
 * The lens fill colour (the engine's float4 {x,y,z,w}) for a deviation t: grey→green above, grey→red below,
 * with opacity rising with strength.
 * @param {number} t Normalized deviation in [-1, 1].
 * @returns {{x:number, y:number, z:number, w:number}} Float4 RGBA (0-1).
 */
export function tierFill(t) {
  return {
    x: channel(t, 0) / 255,
    y: channel(t, 1) / 255,
    z: channel(t, 2) / 255,
    w: FILL_ALPHA_MIN + (FILL_ALPHA_MAX - FILL_ALPHA_MIN) * saturation(t)
  };
}

/**
 * The same colour as `#RRGGBB`, for the cursor panel's swatch.
 * @param {number} t Normalized deviation in [-1, 1].
 * @returns {string} Hex colour.
 */
export function tierHex(t) {
  const hex = (/** @type {number} */ i) => {
    const v = Math.round(clamp(channel(t, i), 0, 255));
    return (v < 16 ? "0" : "") + v.toString(16);
  };
  return "#" + hex(0) + hex(1) + hex(2);
}

/**
 * The lens fill for a landmark plot (a wonder): one fixed amber, so a wonder never reads as a verdict on yield.
 * @returns {{x:number, y:number, z:number, w:number}} Float4 RGBA (0-1).
 */
export function landmarkFill() {
  return { x: LANDMARK[0] / 255, y: LANDMARK[1] / 255, z: LANDMARK[2] / 255, w: LANDMARK_ALPHA };
}

/** The same amber as `#RRGGBB`, for the cursor panel's swatch. */
export const LANDMARK_HEX = "#" + LANDMARK.map((v) => (v < 16 ? "0" : "") + v.toString(16)).join("");

/**
 * A settlement's owned plots as {x, y, idx}: `idx` reads the per-plot yields, `{x, y}` is what the overlay paints.
 * @param {*} city City object.
 * @returns {{x:number, y:number, idx:number}[]} Plot coordinates + index.
 */
export function plotsOf(city) {
  /** @type {{x:number, y:number, idx:number}[]} */
  const out = [];
  try {
    const idx = city && typeof city.getPurchasedPlots === "function" ? city.getPurchasedPlots() : [];
    for (const i of idx || []) {
      const loc = GameplayMap.getLocationFromIndex(i);
      if (loc) out.push({ x: loc.x, y: loc.y, idx: i });
    }
  } catch (_) {
    /* ignore unreadable city */
  }
  return out;
}

/**
 * Whether a plot belongs in a settlement's own scale: all land, and water it has built on (a pier, fishing boats,
 * a coastal wonder). A failed read counts the tile in, so the scale degrades to including everything.
 * @param {number} x Plot x. @param {number} y Plot y.
 * @returns {boolean} True when the tile counts.
 */
export function scorable(x, y) {
  try {
    if (typeof GameplayMap === "undefined" || typeof GameplayMap.isWater !== "function") return true;
    if (!GameplayMap.isWater(x, y)) return true;
    const built = typeof MapConstructibles !== "undefined" ? MapConstructibles.getConstructibles(x, y) : null;
    return !!(built && built.length);
  } catch (_) {
    return true;
  }
}

/**
 * The wonder standing on a plot, or null. A wonder makes the plot a LANDMARK: its worth is its modifier, not the
 * hex's yield, so the yield scale must not measure it. Read from the compiled database's ConstructibleClass via
 * the instance on the map (the same lookup emigration-built.js uses), never from a list of wonder names, so a
 * wonder added by an age, a DLC or another mod is a landmark too. A pillaged wonder is still not land. An
 * unreadable plot is not a landmark, so the scale degrades to the old behaviour (every plot is land).
 * @param {number} x Plot x. @param {number} y Plot y.
 * @returns {{name:string}|null} The wonder's display-name LOC key ("" when unnamed), or null when no wonder stands here.
 */
export function landmarkAt(x, y) {
  try {
    if (typeof MapConstructibles === "undefined" || typeof Constructibles === "undefined"
      || typeof GameInfo === "undefined" || !GameInfo.Constructibles) return null;
    for (const cid of MapConstructibles.getConstructibles(x, y) || []) {
      const inst = Constructibles.getByComponentID(cid);
      const def = inst ? GameInfo.Constructibles.lookup(inst.type) : null;
      if (def && def.ConstructibleClass === "WONDER") return { name: typeof def.Name === "string" ? def.Name : "" };
    }
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * The amount from one `GameplayMap.getYields` entry, defensive across the engine's possible shapes: a
 * [yieldType, amount] tuple (the base UI's shape), a {amount}/{value} object, or a bare number.
 * @param {*} e A yields entry.
 * @returns {number} The numeric amount (0 if unreadable).
 */
function yieldAmount(e) {
  if (typeof e === "number") return isFinite(e) ? e : 0;
  if (Array.isArray(e)) return Number(e[1]) || 0;
  if (e && typeof e === "object") return Number(e.amount ?? e.value ?? 0) || 0;
  return 0;
}

/**
 * A TILE's worth: the total yield output on that plot, read for the local player. Null when per-plot yields
 * aren't available (callers fall back to a per-settlement score).
 * @param {number} idx Plot index.
 * @returns {number|null} The tile score, or null.
 */
export function plotScore(idx) {
  try {
    if (typeof GameplayMap === "undefined" || typeof GameplayMap.getYields !== "function") return null;
    const ys = GameplayMap.getYields(idx, GameContext.localPlayerID);
    if (!Array.isArray(ys)) return null;
    let s = 0;
    for (const y of ys) s += yieldAmount(y);
    return s;
  } catch (_) {
    return null;
  }
}

/**
 * {@link plotScore} by plot coordinates, for the cursor panel's landmark row (which has no plot index in hand).
 * @param {number} x Plot x. @param {number} y Plot y.
 * @returns {number|null} The tile score, or null when the index or the yields can't be read.
 */
export function plotScoreAt(x, y) {
  try {
    if (typeof GameplayMap === "undefined" || typeof GameplayMap.getIndexFromLocation !== "function") return null;
    const idx = GameplayMap.getIndexFromLocation({ x, y });
    return typeof idx === "number" && idx >= 0 ? plotScore(idx) : null;
  } catch (_) {
    return null;
  }
}

/**
 * A settlement's landmark plots (its wonders), for the lens to paint in the landmark colour. Disjoint from
 * {@link cityTileTiers}: a plot is scored land or a landmark, never both.
 * @param {*} city City object.
 * @returns {{x:number, y:number}[]} Landmark plot coordinates.
 */
export function cityLandmarks(city) {
  /** @type {{x:number, y:number}[]} */
  const out = [];
  for (const p of plotsOf(city)) if (landmarkAt(p.x, p.y)) out.push({ x: p.x, y: p.y });
  return out;
}

/**
 * One settlement's counting plots (its land: not empty sea, not a wonder), each normalized to a [-1, 1] deviation
 * from THAT settlement's own mean, so the gradient saturates at its own best and worst tile.
 * @param {*} city City object.
 * @returns {{x:number, y:number, score:number, t:number, mean:number}[]} Per-plot rows (empty when nothing counts).
 */
export function cityTileTiers(city) {
  /** @type {{x:number, y:number, score:number}[]} */
  const tiles = [];
  for (const p of plotsOf(city)) {
    if (!scorable(p.x, p.y) || landmarkAt(p.x, p.y)) continue; // empty sea and wonders are not this settlement's land
    const score = plotScore(p.idx);
    if (score !== null) tiles.push({ x: p.x, y: p.y, score });
  }
  if (!tiles.length) return [];
  const mean = tiles.reduce((a, r) => a + r.score, 0) / tiles.length;
  // Scale the two sides SEPARATELY: above the mean against the settlement's best tile, below it against its worst.
  // One outstanding tile otherwise swallows the range from inside the settlement too - London's 62-yield tile left
  // its 0-yield tile reading -26% and everything else within a few percent of the mean (mod test 83).
  let up = 0;
  let down = 0;
  for (const r of tiles) {
    if (r.score > mean) up = Math.max(up, r.score - mean);
    else down = Math.max(down, mean - r.score);
  }
  return tiles.map((r) => {
    const d = r.score - mean;
    const scale = d >= 0 ? up : down;
    return { ...r, mean, t: scale > 0 ? clamp(d / scale, -1, 1) : 0 };
  });
}

/**
 * The hovered tile's standing inside its own settlement: the very row the lens coloured it from, plus the
 * settlement's mean and its best/worst tile score for context. Null when the tile doesn't count (empty sea, or a
 * landmark, see {@link landmarkAt}) or the settlement has no readable plots.
 * @param {*} city City object. @param {number} x Plot x. @param {number} y Plot y.
 * @returns {{t:number, score:number, mean:number, best:number, worst:number}|null} The tile's standing.
 */
export function tileTierAt(city, x, y) {
  const tiles = cityTileTiers(city);
  if (!tiles.length) return null;
  const hit = tiles.find((r) => r.x === x && r.y === y);
  if (!hit) return null;
  let best = tiles[0].score;
  let worst = tiles[0].score;
  for (const r of tiles) {
    if (r.score > best) best = r.score;
    if (r.score < worst) worst = r.score;
  }
  return { t: hit.t, score: hit.score, mean: hit.mean, best, worst };
}
