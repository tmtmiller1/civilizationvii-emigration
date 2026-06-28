// emigration-ethnicity-distribution.js
//
// The ETHNICITY-LENS distribution model: turns a settlement's single ethnic-composition record
// (emigration-composition.js — "this city is 91% Roman, 9% Carthaginian") into a believable PER-TILE
// mosaic the lens can paint, instead of washing every tile with the same dominant colour.
//
// Two things vary per tile, deterministically (no RNG, so the map is stable across redraws):
//   • DENSITY — each owned tile carries a share of the city's scaled population weighted by how
//     built-up it is (city centre ≫ urban district > worked rural > owned wilderness). The lens maps
//     a tile's people to OPACITY, so the dense urban core reads vivid and the rural fringe reads faint
//     — "urban districts have higher populations", as requested.
//   • ETHNICITY — origins are assigned to WHOLE tiles so a minority reads as distinct coloured tiles
//     rather than tinting every tile by its small fraction. Each origin gets a tile count proportional
//     to its share (with a floor of one tile, so even a small diaspora is always visible), and those
//     tiles are SPREAD evenly across the density gradient — fringe, rural, urban, and the core alike —
//     so an immigrant community shows up as a mix of locations across the city (a downtown block, a
//     rural hamlet, a tile with a single warehouse), not banished to the barren outskirts. The
//     dominant origin keeps the majority of tiles, so the city still reads as predominantly its own.
//
// Pure: no engine reads. The lens (emigration-ethnicity-lens.js) supplies the classified plots +
// scaled population and maps the returned per-tile origin/density to a colour + alpha.

/**
 * @typedef {Object} PlotWeight
 * @property {number} x Plot x.
 * @property {number} y Plot y.
 * @property {number} weight Relative population density weight (city centre high … wilderness low).
 */

/**
 * @typedef {Object} TilePaint
 * @property {number} x Plot x.
 * @property {number} y Plot y.
 * @property {number} civ Origin civ id assigned to this tile.
 * @property {number} people Scaled people living on this tile.
 * @property {number} density Opacity driver in [0,1] (saturating fn of `people`).
 */

// People on a single tile that reads as "fully dense" (opacity saturates). Tuned so a built-up urban
// tile in a mid-size city reads vivid while a sparse rural tile in a town reads faint — the absolute
// per-tile figure drives opacity, so a metropolis core out-reads a hamlet without any extra size term.
const REF_TILE_PEOPLE = 60000;

/**
 * A small stable hash of a plot's coordinates, for a deterministic tiebreak when two tiles share a
 * weight (so equal-weight tiles don't band in raw iteration order). Not security-sensitive.
 * @param {number} x Plot x. @param {number} y Plot y.
 * @returns {number} A stable non-negative number.
 */
function plotHash(x, y) {
  let h = (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663)) >>> 0;
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
 * Order origins so the SMALLEST minority is assigned first and the dominant origin LAST (it becomes
 * the catch-all for the dense core). Ties broken by civ id for determinism.
 * @param {{civ:number, share:number}[]} civs Composition origins.
 * @returns {{civ:number, share:number}[]} Origins ascending by share.
 */
function originsSmallestFirst(civs) {
  return civs.slice().sort((a, b) => a.share - b.share || a.civ - b.civ);
}

/**
 * Distribute a settlement's population across its owned tiles by density, and assign each tile a
 * single origin civ so a diaspora reads as distinct coloured tiles SPREAD across the whole city —
 * the per-tile mosaic the ethnicity lens paints.
 *
 * Algorithm: weight tiles → per-tile people (urban dense, rural sparse), sorted sparse→dense. Give
 * each origin a tile COUNT proportional to its share (floored to one tile so a small diaspora is
 * never invisible; trimmed smallest-first if the floors would crowd out the dominant). Then stamp
 * each origin's tiles at EVENLY-SPACED positions along the density-sorted order, so every origin —
 * dominant and minority alike — is spread across fringe, rural, urban and core tiles rather than
 * banded into one corner. The dominant keeps the majority of tiles, so the city still reads as its.
 * @param {PlotWeight[]} plots The settlement's owned tiles with density weights.
 * @param {{civs:{civ:number, share:number}[], dominant:{civ:number}|null}} comp The composition.
 * @param {number} scaledPeople The settlement's scaled population (people).
 * @returns {TilePaint[]} Per-tile paint instructions (one origin + density per tile).
 */
export function distributeTiles(plots, comp, scaledPeople) {
  if (!hasDistributableInputs(plots, comp)) return [];
  const people = typeof scaledPeople === "number" && scaledPeople > 0 ? scaledPeople : 0;
  const tiles = weightedTiles(plots, people);
  const dominantCiv = comp.dominant ? comp.dominant.civ
    : originsSmallestFirst(comp.civs)[comp.civs.length - 1].civ;
  // No people scaled yet (early game / unreadable population): paint everything dominant rather than
  // inventing a split that the numbers don't support yet.
  if (!(people > 0)) return tiles.map((t) => paintTile(t, dominantCiv));
  const civForTile = assignOrigins(tiles.length, comp.civs, dominantCiv);
  return tiles.map((t, i) => paintTile(t, civForTile[i]));
}

/**
 * One tile's paint record: its assigned origin civ plus the density (opacity driver) from its people.
 * @param {{x:number, y:number, people:number}} t A weighted tile. @param {number} civ Origin civ id.
 * @returns {TilePaint} The paint record.
 */
function paintTile(t, civ) {
  return { x: t.x, y: t.y, civ, people: t.people, density: tileDensity(t.people) };
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
 * The plots as per-tile people, sorted sparse → dense (fringe first) with a stable coordinate
 * tiebreak so equal-weight tiles don't band by iteration order.
 * @param {PlotWeight[]} plots Weighted plots. @param {number} people The settlement's scaled people.
 * @returns {{x:number, y:number, people:number}[]} Sorted per-tile people.
 */
function weightedTiles(plots, people) {
  const totalW = plots.reduce((a, p) => a + (p.weight > 0 ? p.weight : 0), 0) || plots.length;
  return plots
    .map((p) => {
      const w = p.weight > 0 ? p.weight : 0;
      return { x: p.x, y: p.y, w, people: people * w / totalW };
    })
    .sort((a, b) => a.w - b.w || plotHash(a.x, a.y) - plotHash(b.x, b.y));
}

/**
 * Map each of `n` density-sorted tiles (index 0 = sparsest … n-1 = densest) to an origin civ: the
 * dominant fills the city, then each minority's proportional tile count is stamped at evenly-spaced
 * positions along the order, so every diaspora is spread across the density gradient (fringe→core)
 * instead of clustered. Deterministic.
 * @param {number} n Tile count.
 * @param {{civ:number, share:number}[]} civs Composition origins (any order).
 * @param {number} dominantCiv The dominant origin id (fills every tile a minority doesn't claim).
 * @returns {number[]} The origin civ id per tile index.
 */
function assignOrigins(n, civs, dominantCiv) {
  const civForTile = new Array(n).fill(dominantCiv);
  const slots = minoritySlots(n, civs, dominantCiv);
  if (!slots.length) return civForTile;
  // Stamp the minority slots at evenly-spaced indices across the density-sorted tiles (each slot s at
  // ~ (s + 0.5) · n / slots.length), probing forward on collision so each lands on its own tile. The
  // round-robin slot order (see minoritySlots) means a single minority is spread end-to-end and
  // several minorities interleave, so none bands into one density corner.
  const stride = n / slots.length;
  const used = new Set();
  for (let s = 0; s < slots.length; s++) {
    let idx = Math.min(n - 1, Math.floor(s * stride + stride / 2));
    while (used.has(idx)) idx = (idx + 1) % n;
    used.add(idx);
    civForTile[idx] = slots[s];
  }
  return civForTile;
}

/**
 * The ordered list of minority tile assignments (origin civ ids, one per tile a minority should
 * claim) for `n` tiles: each non-dominant origin gets max(1, round(share·n)) tiles so a small
 * diaspora is never invisible, trimmed smallest-share-first if the floors would leave the dominant
 * fewer than one tile, then flattened ROUND-ROBIN (largest minority first) so multiple diasporas
 * interleave rather than each taking a contiguous density band.
 * @param {number} n Tile count.
 * @param {{civ:number, share:number}[]} civs Composition origins.
 * @param {number} dominantCiv The dominant origin id (excluded from the minority slots).
 * @returns {number[]} Minority origin ids, round-robin ordered (length ≤ n-1).
 */
function minoritySlots(n, civs, dominantCiv) {
  const minorities = civs
    .filter((c) => c.civ !== dominantCiv && c.share > 0)
    .map((c) => ({ civ: c.civ, share: c.share }))
    .sort((a, b) => b.share - a.share || a.civ - b.civ); // largest diaspora first
  const counts = minorities.map((m) => Math.max(1, Math.round(m.share * n)));
  // The dominant must keep at least one tile: if the minority floors overshoot, trim the smallest
  // diasporas (the tail) until they fit, so the rarest origins are the ones that drop out under crowding.
  let total = counts.reduce((a, c) => a + c, 0);
  for (let i = minorities.length - 1; i >= 0 && total > n - 1; i--) {
    const cut = Math.min(counts[i], total - (n - 1));
    counts[i] -= cut;
    total -= cut;
  }
  // Flatten round-robin: A,B,A,B,A,… so each origin's tiles interleave across the spaced positions.
  /** @type {number[]} */
  const slots = [];
  const left = counts.slice();
  let remaining = total;
  let k = 0;
  while (remaining > 0) {
    if (left[k] > 0) {
      slots.push(minorities[k].civ);
      left[k] -= 1;
      remaining -= 1;
    }
    k = (k + 1) % minorities.length;
  }
  return slots;
}

// Test-only re-exports (the lens uses distributeTiles directly).
export const __test = { tileDensity, originsSmallestFirst, REF_TILE_PEOPLE };
