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
// The lens is tied to the CULTURAL ENCLAVE rule in two ways, so that a tile burning with a diaspora's
// colour MEANS an enclave stands there:
//   • A diaspora with a standing enclave anchors on the enclave's own tile (the `anchors` pin) and seats
//     its people there FIRST, up to MINORITY_CAP, before anything spills outward. The enclave tile is
//     chosen by an unrelated rule — the nearest empty LAND plot to the city centre (emigration-enclave-
//     place.js) — so without the pin the colour patch and the enclave's on-map marker were picked
//     independently and sat hexes apart, each naming a different tile as that community's home.
//   • Every OTHER tile is capped at `plainCap`, the share an origin must hold for an enclave to form.
//     Uncapped, the water-fill ran ANY minority up to 0.92 on its best tile: a settlement that was 12%
//     Norman, well short of an enclave, painted a "Norman 92%" tile (watched in game 2026-09-17).
// Both only move people BETWEEN tiles. Every citywide share is conserved exactly, and nothing here feeds
// back into how enclaves form, how many may form, or where they are placed.
//
// Two things vary per tile, deterministically (no RNG, stable across redraws):
//   • DENSITY — each owned tile carries a share of the city's scaled population weighted by how built-up
//     it is (city centre ≫ urban > rural > wilderness). The lens maps a tile's people to OPACITY.
//   • LOCAL MIX — each tile's per-origin SHARES (sum to 1). A minority's PEOPLE are laid down by affinity
//     (exp(-anchorDist/SCALE)) via water-filling: it pours into the highest-affinity tiles first, capped
//     per tile (the enclave bar on a plain tile, MINORITY_CAP on an enclave tile) so the host always
//     keeps a sliver (every tile stays a BLEND, never a full colour switch), and any capped overflow
//     spills to the next tiles. The result CONSERVES: each origin's people across all tiles total its
//     citywide share exactly.
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
 * @typedef {Object} DistributeOpts
 * @property {Map<number, {x:number, y:number}>} [anchors] Origins whose cluster is TIED to a known tile
 *   (a standing Cultural Enclave), civ → plot. Overrides the hash anchor for those origins only; every
 *   other origin still anchors deterministically by hash. Purely positional: it moves WHERE a cluster
 *   centres, not how many people it holds, so the citywide shares are untouched.
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
// The spatial spread of a diaspora cluster, in hexes: a tile's minority affinity is exp(-dist/SCALE) from
// the diaspora's anchor. Smaller = tighter, more concentrated cluster; larger = a broader, gentler
// gradient. Tight so even a SMALL diaspora piles onto a few tiles and reads as a distinct colour patch
// (its citywide share spread evenly would be invisible), fading over ~2 hexes to the host.
const CLUSTER_SCALE = 1.1;
// The host origin keeps at least (1 - MINORITY_CAP) of every tile, so even the densest diaspora tile is a
// BLEND of host + diaspora colour rather than a full switch — but high enough that the cluster centre
// reads STRONGLY as the diaspora's colour.
const MINORITY_CAP = 0.92;
// How fast the plain-tile (non-enclave) ceiling rises once a settlement's combined foreign share is PAST
// the enclave bar: ceiling = bar + (share - bar) x this. It must exceed 1 — at exactly 1 the ceiling
// equals the share, every tile has to fill to the brim, and the settlement paints dead flat (see
// capacities()). It applies only to the excess over the bar, so below the bar the ceiling IS the bar.
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
 * capped per tile so the host always shows) while the host fills the rest, so the lens reads as a colour
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
 * The origin that fills whatever the water-filled origins leave: the dominant origin, unless it holds an enclave
 * pin, and then the largest origin WITHOUT one. Not simply the dominant origin: an enclave people that is the
 * city's majority (Rostov on Don, 60% Bulgarian under Norman rule, watched 2026-09-18) would otherwise be the
 * base, never seated on its own tile, while the enclave tile's headroom went to the owner's people and painted
 * the enclave in the owner's colour. Falls back to the dominant origin when every origin is pinned.
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
 * Each tile's minority-people capacity — the ceiling that decides how DARK a diaspora's colour can get
 * anywhere in this settlement, and the one place the lens is tied to the enclave rule.
 *
 * An ENCLAVE tile (a pinned anchor) gets the full MINORITY_CAP: its quarter really is that community's,
 * so it may read almost entirely their colour. Every other tile is capped at `plainCap` — the share an
 * origin must hold for an enclave to form at all. Without that ceiling the water-fill poured ANY
 * minority into its best tile until it hit 0.92, so a settlement that was 12% Norman painted a 92%
 * Norman tile, indistinguishable from a real enclave and nowhere near the actual one (watched in game
 * 2026-09-17). With it, a tile burning with a diaspora's colour means an enclave stands there, and a
 * community still below the bar reads as a genuine but unmistakably lighter tint.
 *
 * While the minorities' COMBINED citywide share is under the bar, the plain cap is exactly the bar. Past
 * it the cap rises with the excess (x CAP_HEADROOM), continuously, for two reasons. It must stay at or
 * above the combined share or there is not room to place everyone, and the distribution stops conserving
 * (each origin's people must still total its citywide share). And it must stay strictly above it to keep
 * a GRADIENT: with the cap equal to the share every tile fills to the brim, and a 45% diaspora painted
 * one dead-flat 45% across the whole settlement. A first attempt scaled the whole share instead of the
 * excess, which lifted the ceiling from 19% up — a 25% community with no enclave could paint a 40% tile.
 *
 * The enclave tile's extra headroom is its OWN people's only. Every origin may take the plain ceiling on any
 * tile; on its enclave tile the pinned origin may go up to the enclave cap, and anyone else is still held to the
 * plain ceiling there (and to what the enclave cap leaves). Otherwise the owner's people could take the enclave
 * tile's 92% when their hash anchor landed nearby, and paint the enclave in the host colour.
 *
 * A small base origin lifts the ceiling past MINORITY_CAP: with the owner at 5%, the water-filled origins
 * total 95%, and the plain ceiling must hold them or the distribution stops conserving. The owner then keeps
 * only the sliver its share allows.
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
 * @param {Room} room The room. @param {number} i The tile. @param {number} civ The origin.
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
 * Water-fill one minority's people (share · total) into the tiles by affinity (exp(-anchorDist/SCALE)):
 * pour proportional to affinity·people, cap each tile at its remaining capacity, and spill any overflow
 * to the still-open tiles over repeated rounds until it's all placed (or capacity runs out). Mutates
 * `placed` and `room`. Conserves: the placed people total share·total whenever capacity allows (always
 * true for a real minority, share < host share ≤ … ≤ MINORITY_CAP citywide).
 * @param {{x:number, y:number, people:number}[]} tiles Per-tile people.
 * @param {Map<number,number>[]} placed Per-tile {civ → people} (mutated).
 * @param {Room} room Per-tile room left (mutated).
 * @param {Minority} m The minority origin, the people it is owed here, and where its cluster centres.
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
 * @property {{x:number, y:number}} anchor The tile its cluster centres on.
 * @property {boolean} pinned Whether that anchor is a standing enclave (vs the hash anchor).
 */

/**
 * Seat a diaspora in its ENCLAVE tile before anything spills outward: the tile takes as many of the
 * community's people as it has room for (its full MINORITY_CAP capacity), and only the remainder is
 * water-filled around it. The enclave is by definition where that community lives, so it fills first.
 *
 * Proportional pouring alone could not do this. The enclave tile is one hex among many, so even at
 * affinity 1 it drew only its proportional slice and read about 37% for a 12% diaspora — above its
 * neighbours, but not the unmistakable quarter the marker on the map is announcing. Filled first, the
 * same settlement's enclave tile reads at the cap. Conserving: what is seated here is subtracted from
 * what the water-fill then places, so the origin still totals its citywide share exactly.
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
 * A diaspora's PINNED anchor, when one was supplied: the tile its Cultural Enclave stands on. Without
 * this the cluster anchors on a civ-salted hash tile picked with no knowledge of the enclave, so the
 * colour patch and the enclave's own on-map marker could sit hexes apart and disagree about where that
 * community lives. The pin only has to carry finite coordinates; it does NOT have to be one of the
 * settlement's own plots (an enclave on a since-transferred tile still pulls its gradient the right way).
 * Null when this origin has no pin, so the caller falls back to the hash anchor.
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
export const __test = {
  tileDensity, originsSmallestFirst, hexDistance, pinnedAnchor, anchorFor, REF_TILE_PEOPLE, MINORITY_CAP
};
