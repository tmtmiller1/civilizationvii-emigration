// emigration-tile-score.js
//
// The per-TILE prosperity score shared by the Prosperity lens (emigration-prosperity-lens.js) and its cursor panel
// (emigration-prosperity-tooltip.js): one place that decides what a tile is worth, which tiles are painted, and
// what colour a score paints. Kept as a leaf module (engine globals only, no mod imports) so both surfaces can
// import it without an import cycle, and so the number the panel prints is by construction the number the colour
// came from.
//
// A tile's prosperity is a sum of named POINTS, and the panel lists every non-zero term, so the number is its own
// explanation. It replaced a raw yield sum (2026-09-17): on that scale the Hanging Gardens, which has no yield rows
// in the compiled database (its worth is +10% growth), read as London's "worst land" at -100%, and a farm out-scored
// the palace. What a settlement has BUILT on a hex is the evidence of its prosperity - it takes a prosperous
// settlement to raise a wonder - so the built terms dominate, the hex's own yield is one modest term, and ruin and
// its neighbourhood pull the score down. The scale is ABSOLUTE (a wonder tile reads the same in every settlement),
// banded like a rating, and coloured on the same grey→green / grey→red gradient the lens always used.
//
// Every classification comes from the compiled database through the instance on the map (ConstructibleClass,
// Feature_NaturalWonders), never from a list of names, so a wonder or natural wonder added by an age, a DLC or
// another mod is scored like the shipped ones. Water the settlement has not built on is not painted at all: an
// empty ocean hex is nobody's prosperity (it dragged a coastal city's scale in the yield model, mod test 79).

/** The points each term is worth. Exported so the panel and tests read the same table. */
export const WEIGHTS = Object.freeze({
  wonder: 6, // the most expensive thing a settlement ever builds
  cityCenter: 3,
  building: 2, // each undamaged building on the hex
  quarter: 1, // two or more buildings on one hex: a completed quarter
  improvement: 1, // a worked rural hex
  yieldPer: 3, // +1 per this many yield on the hex
  river: 1,
  naturalWonder: 3, // the hex IS a natural wonder
  adjacentNaturalWonder: 2, // per neighbouring hex that is one
  adjacentWonder: 1, // per neighbouring hex holding a wonder
  pillaged: -3, // each pillaged constructible on the hex (which then earns no build points)
  adjacentPillaged: -1 // per neighbouring hex with anything pillaged on it
});

/**
 * Band floors, in points, highest first. The band is the panel's headline word for the tile.
 * @type {ReadonlyArray<readonly [string, number]>}
 */
export const BANDS = Object.freeze([
  Object.freeze(/** @type {readonly [string, number]} */ (["flourishing", 8])),
  Object.freeze(/** @type {readonly [string, number]} */ (["thriving", 5])),
  Object.freeze(/** @type {readonly [string, number]} */ (["ordinary", 2])),
  Object.freeze(/** @type {readonly [string, number]} */ (["meagre", 0]))
]);
const BLIGHTED = "blighted"; // below every floor

// Colour: `ordinary` is centred on grey, and the gradient saturates at the flourishing floor above and at blighted
// (-2, a pillaged hex) below, so the whole band scale is visible on the map rather than clipped at the ends.
const T_CENTER = 3;
const T_SPAN = 5;

const FILL_ALPHA_MIN = 0.45; // a middling tile stays readable as terrain
const FILL_ALPHA_MAX = 0.85; // a settlement's best and worst land is unmistakable
const CONTRAST_GAMMA = 0.55; // < 1 saturates the middle: most tiles sit close to ordinary
// Gradient endpoints (0-255): grey (neutral) → green (above ordinary) / red (below).
const GREY = [150, 150, 150];
const GREEN = [24, 224, 72];
const RED = [238, 40, 32];

/** The six hex neighbours, named rather than counted so an enum reorder cannot silently skip a direction. */
const ADJACENT_DIRECTIONS = Object.freeze([
  "DIRECTION_EAST", "DIRECTION_WEST", "DIRECTION_NORTHEAST",
  "DIRECTION_NORTHWEST", "DIRECTION_SOUTHEAST", "DIRECTION_SOUTHWEST"
]);

/**
 * One scored term of a tile: which rule fired, what it was worth, and (for a constructible or feature) the display
 * name LOC key so the panel can name it. `count` is the number of neighbours for the adjacency terms, and `amount`
 * the raw yield for the yield term.
 * @typedef {{kind:string, points:number, name?:string, count?:number, amount?:number}} TileTerm
 */

/**
 * Clamp v into [lo, hi].
 * @param {number} v Value. @param {number} lo Min. @param {number} hi Max.
 * @returns {number} Clamped.
 */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** @param {() => *} fn A read. @param {*} fb Fallback on throw. @returns {*} The read or the fallback. */
function safe(fn, fb) {
  try {
    return fn();
  } catch (_) {
    return fb;
  }
}

// ── colour ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The [-1, 1] colour position of a score: 0 at the centre of `ordinary`, +1 at the flourishing floor and beyond,
 * -1 at a pillaged hex and below.
 * @param {number} points A tile score.
 * @returns {number} Normalized position.
 */
export function tierOf(points) {
  return clamp((points - T_CENTER) / T_SPAN, -1, 1);
}

/**
 * The band a score falls in.
 * @param {number} points A tile score.
 * @returns {string} "flourishing" | "thriving" | "ordinary" | "meagre" | "blighted".
 */
export function bandOf(points) {
  for (const [band, floor] of BANDS) if (points >= floor) return band;
  return BLIGHTED;
}

/**
 * The 0-1 saturation for a colour position: a curve, so the crowded middle of the range still reads.
 * @param {number} t Position in [-1, 1].
 * @returns {number} Saturation in [0, 1].
 */
function saturation(t) {
  return Math.pow(clamp(Math.abs(t), 0, 1), CONTRAST_GAMMA);
}

/**
 * The 0-255 channel value for one colour component at position t.
 * @param {number} t Position. @param {number} i Channel index (0-2).
 * @returns {number} Channel value 0-255.
 */
function channel(t, i) {
  const to = t >= 0 ? GREEN : RED;
  return GREY[i] + (to[i] - GREY[i]) * saturation(t);
}

/**
 * The lens fill colour (the engine's float4 {x,y,z,w}) for a position t: grey→green above ordinary, grey→red
 * below, with opacity rising with strength.
 * @param {number} t Position in [-1, 1].
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
 * @param {number} t Position in [-1, 1].
 * @returns {string} Hex colour.
 */
export function tierHex(t) {
  const hex = (/** @type {number} */ i) => {
    const v = Math.round(clamp(channel(t, i), 0, 255));
    return (v < 16 ? "0" : "") + v.toString(16);
  };
  return "#" + hex(0) + hex(1) + hex(2);
}

// ── reading a hex ────────────────────────────────────────────────────────────────────────────────────────────────

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
 * Whether a plot is painted and scored: all land, and water the settlement has built on (a pier, fishing boats, a
 * coastal wonder). A failed read counts the tile in, so the lens degrades to painting everything.
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
 * The total yield on a plot, read for the local player. Null when per-plot yields aren't available.
 * @param {number} idx Plot index.
 * @returns {number|null} The yield total, or null.
 */
export function plotYield(idx) {
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

/** @type {Set<string>|null} Natural-wonder feature types, from the compiled database. */
let _naturalWonders = null;

/**
 * The natural-wonder feature types (`GameInfo.Feature_NaturalWonders`), read once. Empty off-engine, which makes
 * the natural-wonder terms 0 rather than wrong.
 * @returns {Set<string>} FeatureType strings.
 */
function naturalWonders() {
  if (_naturalWonders) return _naturalWonders;
  const set = new Set();
  for (const r of safe(() => (GameInfo.Feature_NaturalWonders ? [...GameInfo.Feature_NaturalWonders] : []), [])) {
    if (r && typeof r.FeatureType === "string") set.add(r.FeatureType);
  }
  _naturalWonders = set;
  return set;
}

/** Test seam: forget the cached natural-wonder table. */
export function resetTileScoreCaches() {
  _naturalWonders = null;
}

/**
 * The constructibles standing on a plot, classified: class, display-name LOC key, and whether pillaged. Unreadable
 * instances are skipped.
 * @param {number} x Plot x. @param {number} y Plot y.
 * @returns {{cls:string, name:string, damaged:boolean}[]} What stands here.
 */
function constructiblesOn(x, y) {
  /** @type {{cls:string, name:string, damaged:boolean}[]} */
  const out = [];
  if (typeof MapConstructibles === "undefined" || typeof Constructibles === "undefined"
    || typeof GameInfo === "undefined" || !GameInfo.Constructibles) return out;
  for (const cid of safe(() => MapConstructibles.getConstructibles(x, y) || [], [])) {
    const inst = safe(() => Constructibles.getByComponentID(cid), null);
    const def = inst ? safe(() => GameInfo.Constructibles.lookup(inst.type), null) : null;
    if (!def || typeof def.ConstructibleClass !== "string") continue;
    out.push({ cls: def.ConstructibleClass, name: typeof def.Name === "string" ? def.Name : "", damaged: !!inst.damaged });
  }
  return out;
}

/**
 * Whether the plot's district is the city centre (`DistrictTypes.CITY_CENTER`, the enum the base UI compares on).
 * @param {number} x Plot x. @param {number} y Plot y.
 * @returns {boolean} True for the centre.
 */
function isCityCenter(x, y) {
  return safe(() => {
    if (typeof Districts === "undefined" || typeof DistrictTypes === "undefined") return false;
    const d = Districts.getAtLocation({ x, y });
    return !!d && d.type != null && d.type === DistrictTypes.CITY_CENTER;
  }, false);
}

/**
 * The natural wonder this plot is, or null: the feature's display-name LOC key.
 * @param {number} x Plot x. @param {number} y Plot y.
 * @returns {{name:string}|null} The natural wonder, or null.
 */
function naturalWonderAt(x, y) {
  return safe(() => {
    if (typeof GameplayMap === "undefined" || typeof GameInfo === "undefined" || !GameInfo.Features) return null;
    const def = GameInfo.Features.lookup(GameplayMap.getFeatureType(x, y));
    if (!def || !naturalWonders().has(def.FeatureType)) return null;
    return { name: typeof def.Name === "string" ? def.Name : "" };
  }, null);
}

/**
 * What a NEIGHBOURING hex contributes to this one: does it hold a wonder, is it a natural wonder, is anything on
 * it pillaged. Cached per pass, since a hex is a neighbour of six others.
 * @param {number} x Plot x. @param {number} y Plot y. @param {Map<string, *>} cache The per-pass cache.
 * @returns {{wonder:boolean, natural:boolean, pillaged:boolean}} The neighbour facts.
 */
function neighbourFacts(x, y, cache) {
  const key = x + "," + y;
  let f = cache.get(key);
  if (f) return f;
  const built = constructiblesOn(x, y);
  f = {
    wonder: built.some((c) => c.cls === "WONDER" && !c.damaged),
    natural: !!naturalWonderAt(x, y),
    pillaged: built.some((c) => c.damaged)
  };
  cache.set(key, f);
  return f;
}

/**
 * The six neighbours of a plot that exist on the map.
 * @param {number} x Plot x. @param {number} y Plot y.
 * @returns {{x:number, y:number}[]} Neighbour coordinates.
 */
function neighbours(x, y) {
  /** @type {{x:number, y:number}[]} */
  const out = [];
  if (typeof GameplayMap === "undefined" || typeof DirectionTypes === "undefined"
    || typeof GameplayMap.getAdjacentPlotLocation !== "function") return out;
  for (const dir of ADJACENT_DIRECTIONS) {
    const l = safe(() => GameplayMap.getAdjacentPlotLocation({ x, y }, DirectionTypes[dir]), null);
    if (l && typeof l.x === "number" && typeof l.y === "number" && l.x >= 0 && l.y >= 0) out.push({ x: l.x, y: l.y });
  }
  return out;
}

// ── scoring ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** @param {TileTerm[]} terms The list. @param {TileTerm} t A term; appended only when it is worth something. */
function add(terms, t) {
  if (t.points !== 0) terms.push(t);
}

/**
 * The terms for what STANDS on a hex: the centre district, and each constructible by class. A pillaged
 * constructible earns its penalty and not its build points; two or more standing buildings make a quarter.
 * @param {number} x Plot x. @param {number} y Plot y.
 * @returns {TileTerm[]} The built terms, in map order.
 */
function builtTerms(x, y) {
  /** @type {TileTerm[]} */
  const terms = [];
  let buildings = 0;
  if (isCityCenter(x, y)) add(terms, { kind: "cityCenter", points: WEIGHTS.cityCenter });
  for (const c of constructiblesOn(x, y)) {
    if (c.damaged) {
      add(terms, { kind: "pillaged", points: WEIGHTS.pillaged, name: c.name });
    } else if (c.cls === "WONDER") {
      add(terms, { kind: "wonder", points: WEIGHTS.wonder, name: c.name });
    } else if (c.cls === "BUILDING") {
      buildings++;
      add(terms, { kind: "building", points: WEIGHTS.building, name: c.name });
    } else if (c.cls === "IMPROVEMENT") {
      add(terms, { kind: "improvement", points: WEIGHTS.improvement, name: c.name });
    }
  }
  if (buildings >= 2) add(terms, { kind: "quarter", points: WEIGHTS.quarter });
  return terms;
}

/**
 * The terms for the hex ITSELF: its yield (one point per `yieldPer`), a river, being a natural wonder.
 * @param {number} x Plot x. @param {number} y Plot y.
 * @param {number|null} idx Plot index for the yield read (null: the yield term is skipped).
 * @returns {TileTerm[]} The ground terms.
 */
function groundTerms(x, y, idx) {
  /** @type {TileTerm[]} */
  const terms = [];
  const y0 = idx == null ? null : plotYield(idx);
  if (y0 !== null && y0 > 0) add(terms, { kind: "yield", points: Math.floor(y0 / WEIGHTS.yieldPer), amount: y0 });
  if (safe(() => typeof GameplayMap !== "undefined" && GameplayMap.isRiver(x, y), false)) {
    add(terms, { kind: "river", points: WEIGHTS.river });
  }
  const natural = naturalWonderAt(x, y);
  if (natural) add(terms, { kind: "naturalWonder", points: WEIGHTS.naturalWonder, name: natural.name });
  return terms;
}

/**
 * The terms for the NEIGHBOURHOOD: wonders, natural wonders and ruin on the six adjacent hexes, one term per kind
 * with the count.
 * @param {number} x Plot x. @param {number} y Plot y. @param {Map<string, *>} cache Per-pass neighbour cache.
 * @returns {TileTerm[]} The adjacency terms.
 */
function neighbourTerms(x, y, cache) {
  let wonder = 0;
  let natural = 0;
  let pillaged = 0;
  for (const n of neighbours(x, y)) {
    const f = neighbourFacts(n.x, n.y, cache);
    if (f.wonder) wonder++;
    if (f.natural) natural++;
    if (f.pillaged) pillaged++;
  }
  /** @type {TileTerm[]} */
  const terms = [];
  add(terms, { kind: "adjacentWonder", points: wonder * WEIGHTS.adjacentWonder, count: wonder });
  add(terms, { kind: "adjacentNaturalWonder", points: natural * WEIGHTS.adjacentNaturalWonder, count: natural });
  add(terms, { kind: "adjacentPillaged", points: pillaged * WEIGHTS.adjacentPillaged, count: pillaged });
  return terms;
}

/**
 * Score one hex: the sum of every term that fires, with the terms. On-hex terms first (what stands here, in
 * map order), then the hex's own yield and geography, then the neighbourhood.
 * @param {number} x Plot x. @param {number} y Plot y.
 * @param {number|null} idx Plot index for the yield read (null when unknown: the yield term is skipped).
 * @param {Map<string, *>} [cache] Per-pass neighbour cache (one per lens paint; a fresh one otherwise).
 * @returns {{points:number, terms:TileTerm[]}} The score and its explanation.
 */
export function tileScore(x, y, idx, cache) {
  const terms = [...builtTerms(x, y), ...groundTerms(x, y, idx), ...neighbourTerms(x, y, cache || new Map())];
  let points = 0;
  for (const t of terms) points += t.points;
  return { points, terms };
}

/**
 * One settlement's painted plots, scored, with the colour position of each.
 * @param {*} city City object.
 * @param {Map<string, *>} [cache] Per-pass neighbour cache, shared across the settlements of one paint.
 * @returns {{x:number, y:number, score:number, t:number, terms:TileTerm[]}[]} Per-plot rows (empty with no plots).
 */
export function cityTileTiers(city, cache) {
  const nc = cache || new Map();
  /** @type {{x:number, y:number, score:number, t:number, terms:TileTerm[]}[]} */
  const out = [];
  for (const p of plotsOf(city)) {
    if (!scorable(p.x, p.y)) continue;
    const s = tileScore(p.x, p.y, p.idx, nc);
    out.push({ x: p.x, y: p.y, score: s.points, t: tierOf(s.points), terms: s.terms });
  }
  return out;
}

/**
 * The hovered tile's score, band, colour position and terms: the very number the lens coloured it from. Null when
 * the tile isn't painted (empty sea).
 * @param {number} x Plot x. @param {number} y Plot y.
 * @returns {{t:number, score:number, band:string, terms:TileTerm[]}|null} The tile's reading.
 */
export function tileTierAt(x, y) {
  if (!scorable(x, y)) return null;
  const idx = safe(() => {
    const i = GameplayMap.getIndexFromLocation({ x, y });
    return typeof i === "number" && i >= 0 ? i : null;
  }, null);
  const s = tileScore(x, y, idx);
  return { t: tierOf(s.points), score: s.points, band: bandOf(s.points), terms: s.terms };
}
