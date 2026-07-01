// emigration-ethnicity-distribution.js
//
// The ETHNICITY-LENS distribution model: turns a settlement's single ethnic-composition record
// (emigration-composition.js, "this city is 80% Roman, 20% Carthaginian") into a believable PER-TILE
// mosaic the lens can paint, where every tile carries its OWN local mix instead of a flat citywide one.
//
// Three things vary per tile, deterministically (no RNG, so the map is stable across redraws):
//   • DENSITY, each owned tile carries a share of the city's scaled population weighted by how
//     built-up it is (city centre ≫ urban district > worked rural > owned wilderness). The lens maps
//     a tile's people to OPACITY, so the dense urban core reads vivid and the rural fringe reads faint.
//   • LOCAL MIX, each tile gets its own per-origin SHARES (summing to 1), and they DIFFER tile to
//     tile: a diaspora concentrates into a few "neighbourhood" tiles where its local share is high
//     (the hottest tile near PEAK_SHARE, the rest tapering off), while most tiles stay all-dominant.
//     So no two immigrant tiles read the same, yet the people totals per origin still add up to the
//     city's composition, "some tiles have more, others less, and the total matches".
//   • COLOUR ENCODES THE MIX, the lens blends each tile's colour from its origins weighted by those
//     local shares, so the colour you see and the percentages in the tile's tooltip are the same data.
//
// Pure: no engine reads. The shared tiles module (emigration-ethnicity-tiles.js) supplies the
// classified plots + scaled population and both the lens and the hover tooltip map the returned
// per-tile shares to a blended colour / a breakdown.

/**
 * @typedef {Object} PlotWeight
 * @property {number} x Plot x.
 * @property {number} y Plot y.
 * @property {number} weight Relative population density weight (city centre high … wilderness low).
 */

/**
 * @typedef {Object} TileShare
 * @property {number} civ Origin civ id.
 * @property {number} share This origin's LOCAL share of the tile's people, in (0,1].
 */

/**
 * @typedef {Object} TilePaint
 * @property {number} x Plot x.
 * @property {number} y Plot y.
 * @property {number} people Scaled people living on this tile.
 * @property {number} density Opacity driver in [0,1] (saturating fn of `people`).
 * @property {TileShare[]} shares Per-origin local shares (sum ~1), largest first.
 * @property {number} primary The largest-share origin on this tile.
 */

// People on a single tile that reads as "fully dense" (opacity saturates). Tuned so a built-up urban
// tile in a mid-size city reads vivid while a sparse rural tile in a town reads faint.
const REF_TILE_PEOPLE = 60000;

// A diaspora's local share on the HOTTEST tile of its cluster, the geometric falloff of that share
// across the next tiles it claims, and a floor so the taper never drops to a thin smear. PEAK gives a
// cluster centre that reads clearly as that origin's colour; FALLOFF + FLOOR give a gradient (≈ 0.6,
// 0.36, 0.25, 0.25 …) that fades at the edges yet still concentrates, so the quota lands in a few
// neighbourhood tiles, not spread across the whole city. The people each tile takes is capped by these
// AND by the tile's capacity; any remainder is drained to capacity so the origin's TOTAL always lands.
const PEAK_SHARE = 0.6;
const FALLOFF = 0.6;
const FLOOR_SHARE = 0.25;
// Tiles are ordered for a diaspora by population (so its cluster forms on populated tiles, not the
// barren fringe), perturbed per-civ in this range so different diasporas prefer different tiles.
const JITTER_LO = 0.6;
// Local shares below this are dropped as float dust before a tile's shares are reported.
const SHARE_EPS = 1e-4;

/**
 * A small stable hash of a plot's coordinates (optionally salted by an origin civ), for deterministic
 * ordering with no RNG. Salting by civ makes each diaspora prefer a DIFFERENT set of tiles, so two
 * communities cluster in different neighbourhoods rather than stacking on the same tiles.
 * @param {number} x Plot x. @param {number} y Plot y. @param {number} [salt] Optional civ salt.
 * @returns {number} A stable non-negative number.
 */
function plotHash(x, y, salt = 0) {
  let h = (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663)
    ^ Math.imul(salt | 0, 83492791)) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/**
 * Per-tile density (opacity driver) from its scaled people: a saturating curve so opacity rises with
 * population but never blows past the ceiling. 0 people → 0; ~REF_TILE_PEOPLE → ~0.63; dense → ~1.
 * @param {number} people Scaled people on the tile.
 * @returns {number} Density in [0,1].
 */
function tileDensity(people) {
  if (!(people > 0)) return 0;
  return 1 - Math.exp(-people / REF_TILE_PEOPLE);
}

/**
 * Order origins ascending by share (smallest minority first, dominant last). Ties broken by civ id.
 * @param {{civ:number, share:number}[]} civs Composition origins.
 * @returns {{civ:number, share:number}[]} Origins ascending by share.
 */
function originsSmallestFirst(civs) {
  return civs.slice().sort((a, b) => a.share - b.share || a.civ - b.civ);
}

/**
 * Distribute a settlement's population across its owned tiles, giving each tile its own LOCAL origin
 * mix: diasporas concentrate into a few neighbourhood tiles (high local share, tapering) while most
 * tiles stay all-dominant, so tiles differ, yet each origin's people still total its citywide share.
 * @param {PlotWeight[]} plots The settlement's owned tiles with density weights.
 * @param {{civs:{civ:number, share:number}[], dominant:{civ:number}|null}} comp The composition.
 * @param {number} scaledPeople The settlement's scaled population (people).
 * @returns {TilePaint[]} Per-tile paints (local shares + density), one per plot.
 */
export function distributeTiles(plots, comp, scaledPeople) {
  if (!hasDistributableInputs(plots, comp)) return [];
  const people = typeof scaledPeople === "number" && scaledPeople > 0 ? scaledPeople : 0;
  const tiles = weightedTiles(plots, people);
  const dominantCiv = comp.dominant ? comp.dominant.civ
    : originsSmallestFirst(comp.civs)[comp.civs.length - 1].civ;
  // No people scaled yet (early game / unreadable population): paint everything dominant rather than
  // inventing a split the numbers don't support yet.
  if (!(people > 0)) return tiles.map((t) => soloTile(t, dominantCiv));
  const alloc = allocate(tiles, comp.civs, dominantCiv, people);
  return tiles.map((t, i) => shareTile(t, alloc[i], dominantCiv));
}

/**
 * A tile owned entirely by one origin (the no-people fallback, and zero-capacity tiles).
 * @param {{x:number, y:number, people:number}} t A weighted tile. @param {number} civ Origin civ id.
 * @returns {TilePaint} The paint record.
 */
function soloTile(t, civ) {
  return {
    x: t.x, y: t.y, people: t.people, density: tileDensity(t.people),
    shares: [{ civ, share: 1 }], primary: civ
  };
}

/**
 * Whether the inputs can be distributed (non-empty plots + a composition with origins).
 * @param {*} plots Candidate plots. @param {*} comp Candidate composition.
 * @returns {boolean} True when distributable.
 */
function hasDistributableInputs(plots, comp) {
  return Array.isArray(plots) && plots.length > 0
    && !!comp && Array.isArray(comp.civs) && comp.civs.length > 0;
}

/**
 * The plots as per-tile people (density weight × the settlement's scaled people), in stable
 * coordinate order. Order here is incidental, allocation walks each origin's own hashed order.
 * @param {PlotWeight[]} plots Weighted plots. @param {number} people The settlement's scaled people.
 * @returns {{x:number, y:number, people:number}[]} Per-tile people.
 */
function weightedTiles(plots, people) {
  const totalW = plots.reduce((a, p) => a + (p.weight > 0 ? p.weight : 0), 0) || plots.length;
  return plots
    .map((p) => {
      const w = p.weight > 0 ? p.weight : 0;
      return { x: p.x, y: p.y, people: people * w / totalW };
    })
    .sort((a, b) => plotHash(a.x, a.y) - plotHash(b.x, b.y));
}

/**
 * Allocate people to each tile by origin: every minority pours its quota (share × total) into a
 * gradient cluster of tiles (capped by PEAK_SHARE·FALLOFFʲ and by tile capacity), then any remainder
 * drains to capacity so its total is exact; the dominant origin absorbs whatever capacity is left on
 * each tile. Largest diaspora placed first so it gets first pick of its neighbourhood.
 * @param {{x:number, y:number, people:number}[]} tiles Per-tile people.
 * @param {{civ:number, share:number}[]} civs Composition origins.
 * @param {number} dominantCiv The dominant origin id.
 * @param {number} total The settlement's scaled people.
 * @returns {Record<number, number>[]} Per-tile {civ → people} allocation maps.
 */
function allocate(tiles, civs, dominantCiv, total) {
  /** @type {{tiles:{x:number,y:number,people:number}[], cap:number[], alloc:Record<number,number>[]}} */
  const ctx = { tiles, cap: tiles.map((t) => t.people), alloc: tiles.map(() => ({})) };
  const minorities = civs
    .filter((c) => c.civ !== dominantCiv && c.share > 0)
    .sort((a, b) => b.share - a.share || a.civ - b.civ);
  for (const m of minorities) placeMinority(ctx, m.civ, m.share * total);
  for (let i = 0; i < tiles.length; i++) {
    if (ctx.cap[i] > 0) ctx.alloc[i][dominantCiv] = (ctx.alloc[i][dominantCiv] || 0) + ctx.cap[i];
  }
  return ctx.alloc;
}

/**
 * @typedef {{tiles:{x:number,y:number,people:number}[], cap:number[], alloc:Record<number,number>[]}}
 *   AllocCtx The per-tile people, remaining capacity, and {civ→people} maps (cap/alloc are mutated).
 */

/**
 * Pour one minority's `quota` people into its cluster: walk the tiles most-populated-first (perturbed
 * per-civ so diasporas pick different neighbourhoods), depositing a tapering share
 * (max(FLOOR_SHARE, PEAK_SHARE·FALLOFFʲ) of each tile's people) up to capacity, then, if any quota
 * remains, a second pass fills remaining capacity flat, so the full quota always lands.
 * @param {AllocCtx} ctx The allocation context. @param {number} civ The minority origin.
 * @param {number} quota People to place.
 */
function placeMinority(ctx, civ, quota) {
  const order = clusterOrder(ctx.tiles, civ);
  const left = pour(ctx, civ, order, quota,
    (j) => Math.max(FLOOR_SHARE, PEAK_SHARE * Math.pow(FALLOFF, j)));
  if (left > 1e-9) pour(ctx, civ, order, left, null);
}

/**
 * Pour up to `quota` people of one origin into tiles in `order`, each tile taking at most
 * `capShare(j)·people` (or its full capacity when `capShare` is null), `j` counting only tiles that
 * actually received people. Mutates the context; returns the people still unplaced.
 * @param {AllocCtx} ctx The allocation context. @param {number} civ Origin id.
 * @param {number[]} order Tile indices to walk. @param {number} quota People to place.
 * @param {((j:number)=>number)|null} capShare Per-tile share cap. @returns {number} People left unplaced.
 */
function pour(ctx, civ, order, quota, capShare) {
  const { tiles, cap, alloc } = ctx;
  let q = quota;
  let placed = 0;
  for (const i of order) {
    if (q <= 1e-9) break;
    const limit = capShare ? capShare(placed) * tiles[i].people : Infinity;
    const dep = Math.min(cap[i], q, limit);
    if (dep > 1e-9) {
      alloc[i][civ] = (alloc[i][civ] || 0) + dep;
      cap[i] -= dep;
      q -= dep;
      placed++;
    }
  }
  return q;
}

/**
 * Tile indices ordered for a diaspora's cluster: most-populated first (so the cluster forms where
 * people actually live, not the barren fringe), with each tile's population perturbed by a per-civ
 * hash in [JITTER_LO, 1] so two diasporas of similar size prefer different tiles. Deterministic.
 * @param {{x:number, y:number, people:number}[]} tiles Per-tile people. @param {number} civ Origin id.
 * @returns {number[]} Tile indices, populated→sparse for this origin.
 */
function clusterOrder(tiles, civ) {
  const key = tiles.map((t) => {
    const jitter = JITTER_LO + (1 - JITTER_LO) * (plotHash(t.x, t.y, civ) / 4294967296);
    return t.people * jitter;
  });
  return tiles.map((t, i) => i).sort((i, j) => key[j] - key[i] || plotHash(tiles[i].x, tiles[i].y, civ)
    - plotHash(tiles[j].x, tiles[j].y, civ));
}

/**
 * Turn a tile's {civ → people} allocation into a paint record: local shares (allocated people ÷ tile
 * people), dust-pruned and sorted largest-first, plus density. Empty/zero-capacity tiles fall back to
 * the dominant origin so every tile still renders.
 * @param {{x:number, y:number, people:number}} t The tile.
 * @param {Record<number, number>} allocMap This tile's {civ → people}.
 * @param {number} dominantCiv Fallback origin for an empty tile.
 * @returns {TilePaint} The paint record.
 */
function shareTile(t, allocMap, dominantCiv) {
  const p = t.people;
  /** @type {TileShare[]} */
  let shares = [];
  if (p > 0) {
    for (const k of Object.keys(allocMap)) {
      const civ = Number(k);
      const s = allocMap[civ] / p;
      if (s > SHARE_EPS) shares.push({ civ, share: s });
    }
  }
  if (!shares.length) return soloTile(t, dominantCiv);
  const sum = shares.reduce((a, s) => a + s.share, 0) || 1;
  for (const s of shares) s.share /= sum; // guard tile shares to sum exactly 1
  shares.sort((a, b) => b.share - a.share || a.civ - b.civ);
  return { x: t.x, y: t.y, people: p, density: tileDensity(p), shares, primary: shares[0].civ };
}

// Test-only re-exports.
export const __test = { tileDensity, originsSmallestFirst, REF_TILE_PEOPLE, PEAK_SHARE };
