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
//   • ETHNICITY — origins are assigned to WHOLE tiles so a minority concentrates on a few tiles
//     rather than tinting every tile by its small fraction. Minorities settle the sparse FRINGE
//     (immigrant outskirts); the dominant origin holds the dense core. The people totals per origin
//     still match the composition's shares, so "the percentages follow".
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
 * single origin civ so minorities concentrate on the sparse fringe while the dominant origin holds
 * the dense core — the per-tile mosaic the ethnicity lens paints.
 *
 * Algorithm: weight tiles → per-tile people (urban dense, rural sparse). Sort tiles sparse→dense.
 * Walk them filling each origin's PEOPLE quota (share × total) in turn, smallest minority first; when
 * a quota is spent, advance to the next origin. The dominant origin is last and absorbs the dense
 * remainder. So minorities claim a few sparse fringe tiles (totalling their share) and the core stays
 * dominant — counts per origin still match the composition.
 * @param {PlotWeight[]} plots The settlement's owned tiles with density weights.
 * @param {{civs:{civ:number, share:number}[], dominant:{civ:number}|null}} comp The composition.
 * @param {number} scaledPeople The settlement's scaled population (people).
 * @returns {TilePaint[]} Per-tile paint instructions (one origin + density per tile).
 */
export function distributeTiles(plots, comp, scaledPeople) {
  if (!hasDistributableInputs(plots, comp)) return [];
  const people = typeof scaledPeople === "number" && scaledPeople > 0 ? scaledPeople : 0;
  const tiles = weightedTiles(plots, people);
  const origins = originsSmallestFirst(comp.civs);
  const dominantCiv = comp.dominant ? comp.dominant.civ : origins[origins.length - 1].civ;
  return assignOrigins(tiles, origins, people, dominantCiv);
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
 * Walk the sparse→dense tiles filling each origin's people quota (share × total) in turn — smallest
 * minority first, dominant (last) as the dense-core catch-all — so minorities concentrate on a few
 * fringe tiles and the counts per origin still match the composition.
 * @param {{x:number, y:number, people:number}[]} tiles Sorted per-tile people.
 * @param {{civ:number, share:number}[]} origins Origins ascending by share.
 * @param {number} people The settlement's scaled people.
 * @param {number} dominantCiv The dominant origin (fallback when no people are scaled yet).
 * @returns {TilePaint[]} Per-tile paints.
 */
function assignOrigins(tiles, origins, people, dominantCiv) {
  /** @type {TilePaint[]} */
  const out = [];
  let oi = 0;
  let remaining = origins[0].share * people; // people quota for the current origin
  for (const t of tiles) {
    while (oi < origins.length - 1 && remaining <= 0) {
      oi++;
      remaining = origins[oi].share * people;
    }
    const civ = people > 0 ? origins[oi].civ : dominantCiv; // no people scaled yet → all dominant
    remaining -= t.people;
    out.push({ x: t.x, y: t.y, civ, people: t.people, density: tileDensity(t.people) });
  }
  return out;
}

// Test-only re-exports (the lens uses distributeTiles directly).
export const __test = { tileDensity, originsSmallestFirst, REF_TILE_PEOPLE };
