// emigration-ethnicity-distribution.js
//
// The ETHNICITY-LENS distribution model: turns a settlement's ethnic-composition record
// (emigration-composition.js) into a per-tile mosaic where every tile carries its OWN local origin mix.
// Each diaspora water-fills by affinity (exp(-anchorDist/SCALE)) around a deterministic anchor tile, so
// the map shows a gradient; a standing enclave pins the anchor to the enclave's own tile and seats its
// people there first (up to MINORITY_CAP), while every other tile is capped at `plainCap`, so a tile
// burning with a diaspora's color means an enclave stands there. People only move BETWEEN tiles;
// every citywide share is conserved exactly. Per-tile DENSITY (built-up weight x scaled population)
// drives opacity. Pure: no engine reads; emigration-ethnicity-tiles.js supplies the plots + population.

/**
 * @typedef {Object} PlotWeight
 * @property {number} x Plot x.
 * @property {number} y Plot y.
 * @property {number} weight Relative population density weight (city center high … wilderness low).
 */

/**
 * @typedef {Object} DistributeOpts
 * @property {Map<number, {x:number, y:number}>} [anchors] Origins whose cluster is TIED to a known tile
 *   (a standing Cultural Enclave), civ → plot. Overrides the hash anchor for those origins only; every
 *   other origin still anchors deterministically by hash. Purely positional: it moves WHERE a cluster
 *   centers, not how many people it holds, so the citywide shares are untouched.
 * @property {number} [plainCap] The most of a tile any diaspora may hold where NO enclave stands — the
 *   enclave formation share. Omitted, tiles keep the historical MINORITY_CAP everywhere.
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
// The spatial spread of a diaspora cluster, in hexes: affinity is exp(-dist/SCALE) from the anchor.
// Tight, so even a SMALL diaspora piles onto a few tiles and reads as a distinct color patch.
const CLUSTER_SCALE = 1.1;
// The host origin keeps at least (1 - MINORITY_CAP) of every tile, so even the densest diaspora tile is a
// BLEND of host + diaspora color rather than a full switch — but high enough that the cluster center
// reads STRONGLY as the diaspora's color.
const MINORITY_CAP = 0.92;
// How fast the plain-tile (non-enclave) ceiling rises once a settlement's combined foreign share is PAST
// the enclave bar: ceiling = bar + (share - bar) x this. Must exceed 1, or every tile fills to the brim
// and the settlement paints dead flat (see capacities()).
const CAP_HEADROOM = 2;
// How far the plain ceiling sits above the water-filled origins' combined share when that share passes
// MINORITY_CAP (a small owner), so the tiles do not all fill to the brim and paint one flat value.
const CEILING_EPS = 0.02;
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
 * capped per tile so the host always shows) while the host fills the rest, so the lens reads as a color
 * gradient and each origin's people still total its citywide share.
 * @param {PlotWeight[]} plots The settlement's owned tiles with density weights.
 * @param {{civs:{civ:number, share:number}[], dominant:{civ:number}|null}} comp The composition.
 * @param {number} scaledPeople The settlement's scaled population (people).
 * @param {DistributeOpts} [opts] Enclave anchors + the plain-tile concentration bar (see the typedef).
 * @returns {TilePaint[]} Per-tile paints (local shares + density), one per plot.
 */
export function distributeTiles(plots, comp, scaledPeople, opts) {
  if (!hasDistributableInputs(plots, comp)) return [];
  const people = typeof scaledPeople === "number" && scaledPeople > 0 ? scaledPeople : 0;
  const tiles = weightedTiles(plots, people);
  const anchors = opts && opts.anchors;
  const baseCiv = baseFillCiv(comp, anchors);
  // No people scaled yet (early game / unreadable population): paint everything the host rather than
  // inventing a split the numbers don't support yet.
  if (!(people > 0)) return tiles.map((t) => paintShares(t, [{ civ: baseCiv, share: 1 }]));
  // An enclave people first, so it is seated on its own tile before anyone else takes room there; then the
  // largest diaspora, so it gets first pick of the remaining capacity.
  const minorities = comp.civs
    .filter((c) => c.civ !== baseCiv && c.share > 0)
    .map((c) => ({ civ: c.civ, share: c.share, pin: pinnedAnchor(c.civ, anchors) }))
    .sort(pinnedThenLargest);
  /** @type {Map<number, number>[]} Per-tile {minority civ → placed people}. */
  const placed = tiles.map(() => new Map());
  const room = capacities(tiles, minorities, anchors, opts && opts.plainCap);
  for (const m of minorities) {
    // A standing enclave fixes where this diaspora lives; everyone else anchors by hash as before.
    waterFill(tiles, placed, room, {
      civ: m.civ, demand: m.share * people, anchor: m.pin || anchorFor(tiles, m.civ), pinned: !!m.pin
    });
  }
  return tiles.map((t, i) => finalizeTile(t, placed[i], baseCiv));
}

/**
 * Water-fill order: an origin with an enclave pin first, then largest share first, then civ id.
 * @param {{civ:number, share:number, pin:*}} a @param {{civ:number, share:number, pin:*}} b
 * @returns {number} Sort order.
 */
function pinnedThenLargest(a, b) {
  return Number(!!b.pin) - Number(!!a.pin) || b.share - a.share || a.civ - b.civ;
}

/**
 * The origin that fills whatever the water-filled origins leave: the dominant origin, unless it holds an
 * enclave pin, and then the largest origin WITHOUT one (a pinned majority must still be seated on its own
 * tile). Falls back to the dominant origin when every origin is pinned.
 * @param {{civs:{civ:number, share:number}[], dominant:{civ:number}|null}} comp The composition.
 * @param {Map<number, {x:number, y:number}>} [anchors] Enclave anchor pins.
 * @returns {number} The base-fill origin.
 */
function baseFillCiv(comp, anchors) {
  const largestFirst = originsSmallestFirst(comp.civs).reverse();
  const dominant = comp.dominant ? comp.dominant.civ : largestFirst[0].civ;
  if (!pinnedAnchor(dominant, anchors)) return dominant;
  const unpinned = largestFirst.find((c) => !pinnedAnchor(c.civ, anchors) && c.share > 0);
  return unpinned ? unpinned.civ : dominant;
}

/**
 * Each tile's minority-people capacity, the ceiling on how DARK a diaspora's color can get. An ENCLAVE
 * tile (a pinned anchor) gets the full MINORITY_CAP for its OWN people only; every other tile, and every
 * other origin on the enclave tile, is capped at `plainCap`, which rises with the excess over the bar (x
 * CAP_HEADROOM) so the distribution still conserves and keeps a gradient. A small base origin lifts the
 * ceiling past MINORITY_CAP so the water-filled origins still fit.
 * @param {{people:number, x:number, y:number}[]} tiles The settlement's tiles.
 * @param {{civ:number, share:number}[]} minorities The water-filled origins.
 * @param {Map<number, {x:number, y:number}>} [anchors] Enclave anchor pins.
 * @param {number} [plainCap] The non-enclave ceiling (the enclave formation share). Defaults to no extra
 *   ceiling, i.e. the historical MINORITY_CAP everywhere.
 * @returns {Room} Per-tile room, in people.
 */
function capacities(tiles, minorities, anchors, plainCap) {
  const totalMinority = minorities.reduce((a, m) => a + m.share, 0);
  const ceiling = Math.min(Math.max(MINORITY_CAP, totalMinority + CEILING_EPS), 1);
  const bar = Number(plainCap);
  const plain = Number.isFinite(bar) && bar > 0
    ? Math.min(ceiling, bar + Math.max(0, totalMinority - bar) * CAP_HEADROOM)
    : ceiling;
  const enclaveCap = Math.max(MINORITY_CAP, plain);
  /** @type {Map<string, number>} Enclave tile "x,y" → the origin whose enclave stands there. */
  const home = new Map();
  if (anchors && typeof anchors.forEach === "function") {
    anchors.forEach((a, civ) => {
      if (a && Number.isFinite(a.x) && Number.isFinite(a.y)) home.set(a.x + "," + a.y, civ);
    });
  }
  return {
    all: tiles.map((t) => (home.has(t.x + "," + t.y) ? enclaveCap : plain) * t.people),
    plain: tiles.map((t) => plain * t.people),
    home: tiles.map((t) => (home.has(t.x + "," + t.y) ? /** @type {number} */ (home.get(t.x + "," + t.y)) : null))
  };
}

/**
 * @typedef {Object} Room Per-tile room left for water-filled people, in people (mutated as they are placed).
 * @property {number[]} all Room for everyone together: the plain ceiling, or the enclave cap on an enclave tile.
 * @property {number[]} plain Room under the plain ceiling, which every origin but the tile's own enclave people
 *   is held to.
 * @property {(number|null)[]} home The origin whose enclave stands on each tile, or null.
 */

/**
 * The room one origin has on a tile: all of it on its own enclave tile, else no more than the plain ceiling.
 * @param {Room} room @param {number} i The tile. @param {number} civ The origin.
 * @returns {number} People it may still place there.
 */
function roomFor(room, i, civ) {
  return room.home[i] === civ ? room.all[i] : Math.min(room.all[i], room.plain[i]);
}

/**
 * Record `take` people of `civ` placed on tile `i`, spending the room they use.
 * @param {Room} room The room (mutated). @param {Map<number,number>[]} placed Per-tile placements (mutated).
 * @param {number} i The tile. @param {number} civ The origin. @param {number} take People placed.
 */
function place(room, placed, i, civ, take) {
  placed[i].set(civ, (placed[i].get(civ) || 0) + take);
  room.all[i] -= take;
  if (room.home[i] !== civ) room.plain[i] -= take;
}

/**
 * Water-fill one minority's people into the tiles by affinity: pour proportional to affinity·people, cap
 * each tile at its remaining capacity, and spill overflow to the still-open tiles over repeated rounds.
 * Mutates `placed` and `room`; conserves the placed total whenever capacity allows.
 * @param {{x:number, y:number, people:number}[]} tiles Per-tile people.
 * @param {Map<number,number>[]} placed Per-tile {civ → people} (mutated).
 * @param {Room} room Per-tile room left (mutated).
 * @param {Minority} m The minority origin, the people it is owed here, and where its cluster centers.
 */
function waterFill(tiles, placed, room, m) {
  const aff = tiles.map((t) => Math.exp(-hexDistance(t.x, t.y, m.anchor.x, m.anchor.y) / CLUSTER_SCALE));
  const ctx = { tiles, aff, placed, room, civ: m.civ };
  const inEnclave = m.pinned ? fillEnclaveFirst(tiles, placed, room, m) : 0;
  let state = {
    remaining: m.demand - inEnclave,
    active: tiles.map((_, i) => i).filter((i) => roomFor(room, i, m.civ) > 1e-9 && aff[i] > 0)
  };
  for (let round = 0; round < 64 && state.remaining > 1e-6 && state.active.length; round++) {
    state = pourRound(ctx, state);
  }
}

/**
 * @typedef {Object} Minority
 * @property {number} civ The origin civ.
 * @property {number} demand The people it is owed here (its citywide share × the settlement's people).
 * @property {{x:number, y:number}} anchor The tile its cluster centers on.
 * @property {boolean} pinned Whether that anchor is a standing enclave (vs the hash anchor).
 */

/**
 * Seat a diaspora in its ENCLAVE tile before anything spills outward: the tile takes as many of the
 * community's people as it has room for, and only the remainder is water-filled around it (proportional
 * pouring alone leaves one hex among many well short of the cap). What is seated here is subtracted
 * from the water-fill, so the origin still totals its citywide share exactly.
 * @param {{x:number, y:number, people:number}[]} tiles Per-tile people.
 * @param {Map<number,number>[]} placed Per-tile {civ → people} (mutated).
 * @param {Room} room Per-tile room left (mutated).
 * @param {Minority} m The pinned minority.
 * @returns {number} The people seated in the enclave tile (0 when the pin is not one of these tiles).
 */
function fillEnclaveFirst(tiles, placed, room, m) {
  const i = tiles.findIndex((t) => t.x === m.anchor.x && t.y === m.anchor.y);
  if (i < 0) return 0;
  const take = Math.min(roomFor(room, i, m.civ), m.demand);
  if (!(take > 0)) return 0;
  place(room, placed, i, m.civ, take);
  return take;
}

/**
 * @typedef {{tiles:{x:number,y:number,people:number}[], aff:number[], placed:Map<number,number>[],
 *   room:Room, civ:number}} PourCtx The tiles + affinity + mutable placement state for one civ.
 */

/**
 * One water-filling round: pour `remaining` people into the `active` tiles proportional to
 * affinity·people, capping each at its remaining capacity; return the still-unfilled people and the
 * tiles that still have room. Mutates `ctx.placed` and `ctx.room`.
 * @param {PourCtx} ctx The tiles + affinity + placement state.
 * @param {{remaining:number, active:number[]}} state Unplaced people + open tiles.
 * @returns {{remaining:number, active:number[]}} The next state.
 */
function pourRound(ctx, state) {
  const { tiles, aff, placed, room, civ } = ctx;
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
    const left = roomFor(room, i, civ);
    const take = want >= left ? left : want;
    place(room, placed, i, civ, take);
    placedThisRound += take;
    if (want < left) stillActive.push(i); // tile still has room next round
  }
  return { remaining: remaining - placedThisRound, active: stillActive };
}

/**
 * A diaspora's PINNED anchor, when one was supplied: the tile its Cultural Enclave stands on, so the
 * color patch and the enclave's on-map marker agree. The pin only has to carry finite coordinates; it
 * need not be one of the settlement's own plots. Null when this origin has no pin (hash anchor fallback).
 * @param {number} civ The origin civ. @param {Map<number, {x:number, y:number}>} [anchors] The pins.
 * @returns {{x:number, y:number}|null} The pinned anchor, or null.
 */
function pinnedAnchor(civ, anchors) {
  if (!anchors || typeof anchors.get !== "function") return null;
  const a = anchors.get(civ);
  return a && Number.isFinite(a.x) && Number.isFinite(a.y) ? { x: a.x, y: a.y } : null;
}

/**
 * The tile a diaspora anchors on: the owned tile with the largest civ-salted hash (deterministic, and
 * different per civ so two diasporas cluster in different neighborhoods).
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
 * @param {number} baseCiv The base-fill origin id (see baseFillCiv).
 * @returns {TilePaint} The paint record.
 */
function finalizeTile(t, placedMap, baseCiv) {
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
  if (hostShare > SHARE_EPS) shares.push({ civ: baseCiv, share: hostShare });
  if (!shares.length) shares.push({ civ: baseCiv, share: 1 });
  shares.sort((a, b) => b.share - a.share || a.civ - b.civ);
  const tot = shares.reduce((a, s) => a + s.share, 0) || 1;
  for (const s of shares) s.share /= tot; // guard exact sum 1 against float dust
  return { x: t.x, y: t.y, people: P, density: tileDensity(P), shares, primary: shares[0].civ };
}

/**
 * A tile paint with explicit shares (the no-people fallback path).
 * @param {{x:number, y:number, people:number}} t The tile. @param {TileShare[]} shares
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
export const __test = {
  tileDensity, originsSmallestFirst, hexDistance, pinnedAnchor, anchorFor, REF_TILE_PEOPLE, MINORITY_CAP
};
