// emigration-ethnicity-distribution.js
//
// The ETHNICITY-LENS distribution model: turns a settlement's ethnic-composition record
// (emigration-composition.js, "this city is 80% Roman, 20% Carthaginian") into a per-tile mosaic the
// lens paints, where every tile carries its OWN local origin mix and the lens BLENDS each tile's colour
// from those local shares (a tile that's 30% a diaspora reads 30% of the way toward that diaspora's
// banner colour). The mix varies SMOOTHLY tile to tile: each diaspora forms a spatial CLUSTER around a
// deterministic per-civ anchor tile and fades with hex distance, so the map shows a gradient — strongest
// where the diaspora concentrates, tapering to the host colour at the edges — not a hard on/off switch.
//
// Two things vary per tile, deterministically (no RNG, stable across redraws):
//   • DENSITY — each owned tile carries a share of the city's scaled population weighted by how built-up
//     it is (city centre ≫ urban > rural > wilderness). The lens maps a tile's people to OPACITY.
//   • LOCAL MIX — each tile's per-origin SHARES (sum to 1). A minority's PEOPLE are laid down by affinity
//     (exp(-anchorDist/SCALE)) via water-filling: it pours into the highest-affinity tiles first, capped
//     at MINORITY_CAP of each tile so the host always keeps a sliver (every tile stays a BLEND, never a
//     full colour switch), and any capped overflow spills to the next tiles. The result CONSERVES: each
//     origin's people across all tiles total its citywide share exactly.
//
// Pure: no engine reads. The shared tiles module (emigration-ethnicity-tiles.js) supplies the classified
// plots + scaled population; the lens blends each tile's colour from its shares and the hover tooltip
// lists the same shares as percentages, so colour and numbers always agree.

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

// People on a single tile that reads as "fully dense" (opacity saturates).
const REF_TILE_PEOPLE = 60000;
// The spatial spread of a diaspora cluster, in hexes: a tile's minority affinity is exp(-dist/SCALE) from
// the diaspora's anchor. Smaller = tighter, more concentrated cluster; larger = a broader, gentler
// gradient. Tight so even a SMALL diaspora piles onto a few tiles and reads as a distinct colour patch
// (its citywide share spread evenly would be invisible), fading over ~2 hexes to the host.
const CLUSTER_SCALE = 1.1;
// The host origin keeps at least (1 - MINORITY_CAP) of every tile, so even the densest diaspora tile is a
// BLEND of host + diaspora colour rather than a full switch — but high enough that the cluster centre
// reads STRONGLY as the diaspora's colour.
const MINORITY_CAP = 0.92;
// Local shares below this are dropped as float dust before a tile's shares are reported.
const SHARE_EPS = 1e-3;

/**
 * A small stable hash of a plot's coordinates (optionally salted by an origin civ), for deterministic
 * per-civ anchoring with no RNG. Salting by civ makes each diaspora anchor on a DIFFERENT tile.
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
 * Hex distance between two plots in "odd-r" offset coordinates (odd rows shifted right), via a
 * conversion to cube coordinates. A smooth, spatially-coherent metric for the diaspora gradient.
 * @param {number} ax @param {number} ay @param {number} bx @param {number} by
 * @returns {number} The hex distance (>= 0).
 */
function hexDistance(ax, ay, bx, by) {
  const acx = (ax | 0) - (((ay | 0) - ((ay | 0) & 1)) / 2);
  const acz = ay | 0;
  const acy = -acx - acz;
  const bcx = (bx | 0) - (((by | 0) - ((by | 0) & 1)) / 2);
  const bcz = by | 0;
  const bcy = -bcx - bcz;
  return (Math.abs(acx - bcx) + Math.abs(acy - bcy) + Math.abs(acz - bcz)) / 2;
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
 * Distribute a settlement's population across its owned tiles, giving each tile its own LOCAL origin mix:
 * each diaspora forms a smooth spatial cluster (its people water-filled into the highest-affinity tiles,
 * capped per tile so the host always shows) while the host fills the rest, so the lens reads as a colour
 * gradient and each origin's people still total its citywide share.
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
  // No people scaled yet (early game / unreadable population): paint everything the host rather than
  // inventing a split the numbers don't support yet.
  if (!(people > 0)) return tiles.map((t) => paintShares(t, [{ civ: dominantCiv, share: 1 }]));
  // Largest diaspora first, so it gets first pick of tile capacity.
  const minorities = comp.civs
    .filter((c) => c.civ !== dominantCiv && c.share > 0)
    .sort((a, b) => b.share - a.share || a.civ - b.civ);
  /** @type {Map<number, number>[]} Per-tile {minority civ → placed people}. */
  const placed = tiles.map(() => new Map());
  // Remaining minority-people capacity per tile (shared across all minorities so a tile's total minority
  // never exceeds MINORITY_CAP of its people → the host always keeps ≥ (1 - CAP)).
  const capLeft = tiles.map((t) => MINORITY_CAP * t.people);
  for (const m of minorities) waterFill(tiles, placed, capLeft, m, people);
  return tiles.map((t, i) => finalizeTile(t, placed[i], dominantCiv));
}

/**
 * Water-fill one minority's people (share · total) into the tiles by affinity (exp(-anchorDist/SCALE)):
 * pour proportional to affinity·people, cap each tile at its remaining capacity, and spill any overflow
 * to the still-open tiles over repeated rounds until it's all placed (or capacity runs out). Mutates
 * `placed` and `capLeft`. Conserves: the placed people total share·total whenever capacity allows (always
 * true for a real minority, share < host share ≤ … ≤ MINORITY_CAP citywide).
 * @param {{x:number, y:number, people:number}[]} tiles Per-tile people.
 * @param {Map<number,number>[]} placed Per-tile {civ → people} (mutated).
 * @param {number[]} capLeft Per-tile remaining minority capacity (mutated).
 * @param {{civ:number, share:number}} m The minority origin + its citywide share.
 * @param {number} totalPeople The settlement's scaled people.
 */
function waterFill(tiles, placed, capLeft, m, totalPeople) {
  const anchor = anchorFor(tiles, m.civ);
  const aff = tiles.map((t) => Math.exp(-hexDistance(t.x, t.y, anchor.x, anchor.y) / CLUSTER_SCALE));
  const ctx = { tiles, aff, placed, capLeft, civ: m.civ };
  let state = {
    remaining: m.share * totalPeople,
    active: tiles.map((_, i) => i).filter((i) => capLeft[i] > 1e-9 && aff[i] > 0)
  };
  for (let round = 0; round < 64 && state.remaining > 1e-6 && state.active.length; round++) {
    state = pourRound(ctx, state);
  }
}

/**
 * @typedef {{tiles:{x:number,y:number,people:number}[], aff:number[], placed:Map<number,number>[],
 *   capLeft:number[], civ:number}} PourCtx The tiles + affinity + mutable placement state for one civ.
 */

/**
 * One water-filling round: pour `remaining` people into the `active` tiles proportional to
 * affinity·people, capping each at its remaining capacity; return the still-unfilled people and the
 * tiles that still have room. Mutates `ctx.placed` and `ctx.capLeft`.
 * @param {PourCtx} ctx The tiles + affinity + placement state.
 * @param {{remaining:number, active:number[]}} state Unplaced people + open tiles.
 * @returns {{remaining:number, active:number[]}} The next state.
 */
function pourRound(ctx, state) {
  const { tiles, aff, placed, capLeft, civ } = ctx;
  const { remaining, active } = state;
  let wsum = 0;
  for (const i of active) wsum += aff[i] * tiles[i].people;
  if (!(wsum > 0)) return { remaining: 0, active: [] };
  const scale = remaining / wsum; // people per unit of (affinity · tile-people)
  let placedThisRound = 0;
  /** @type {number[]} */
  const stillActive = [];
  for (const i of active) {
    const want = scale * aff[i] * tiles[i].people;
    const take = want >= capLeft[i] ? capLeft[i] : want;
    placed[i].set(civ, (placed[i].get(civ) || 0) + take);
    capLeft[i] -= take;
    placedThisRound += take;
    if (want < capLeft[i] + take) stillActive.push(i); // tile still has room next round
  }
  return { remaining: remaining - placedThisRound, active: stillActive };
}

/**
 * The tile a diaspora anchors on: the owned tile with the largest civ-salted hash (deterministic, and
 * different per civ so two diasporas cluster in different neighbourhoods).
 * @param {{x:number, y:number}[]} tiles The tiles. @param {number} civ The origin civ.
 * @returns {{x:number, y:number}} The anchor tile.
 */
function anchorFor(tiles, civ) {
  let best = tiles[0];
  let bestH = -1;
  for (const t of tiles) {
    const h = plotHash(t.x, t.y, civ);
    if (h > bestH) {
      bestH = h;
      best = t;
    }
  }
  return best;
}

/**
 * Turn a tile's placed {minority → people} into a paint record: convert to local shares, add the host as
 * the remainder (always > 0 thanks to the cap), drop dust, sort largest-first, normalize to sum 1.
 * @param {{x:number, y:number, people:number}} t The tile.
 * @param {Map<number, number>} placedMap The tile's {minority civ → placed people}.
 * @param {number} dominantCiv The host origin id.
 * @returns {TilePaint} The paint record.
 */
function finalizeTile(t, placedMap, dominantCiv) {
  const P = t.people;
  /** @type {TileShare[]} */
  const shares = [];
  let minSum = 0;
  for (const [civ, ppl] of placedMap) {
    const s = P > 0 ? ppl / P : 0;
    if (s > SHARE_EPS) {
      shares.push({ civ, share: s });
      minSum += s;
    }
  }
  const hostShare = 1 - minSum;
  if (hostShare > SHARE_EPS) shares.push({ civ: dominantCiv, share: hostShare });
  if (!shares.length) shares.push({ civ: dominantCiv, share: 1 });
  shares.sort((a, b) => b.share - a.share || a.civ - b.civ);
  const tot = shares.reduce((a, s) => a + s.share, 0) || 1;
  for (const s of shares) s.share /= tot; // guard exact sum 1 against float dust
  return { x: t.x, y: t.y, people: P, density: tileDensity(P), shares, primary: shares[0].civ };
}

/**
 * A tile paint with explicit shares (the no-people fallback path).
 * @param {{x:number, y:number, people:number}} t The tile. @param {TileShare[]} shares The shares.
 * @returns {TilePaint} The paint record.
 */
function paintShares(t, shares) {
  return { x: t.x, y: t.y, people: t.people, density: tileDensity(t.people), shares, primary: shares[0].civ };
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
 * The plots as per-tile people (density weight × the settlement's scaled people), in stable coordinate
 * order.
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

// Test-only re-exports.
export const __test = { tileDensity, originsSmallestFirst, hexDistance, REF_TILE_PEOPLE, MINORITY_CAP };
