// tile-score.mjs
//
// The per-tile prosperity POINTS scale shared by the Prosperity lens and its cursor panel (emigration-tile-score.js):
// what each thing on and around a hex is worth, the band and color a score paints, and which plots are painted at
// all. Pure functions over engine globals, so they are stubbed here. The lens and the panel both read this module,
// which is what keeps the printed score and the fill color the same number.

import assert from "node:assert/strict";

// A 5×3 map. Row y=1 is London: center at (1,1), a two-building quarter at (2,1), the Hanging Gardens at (3,1), a
// river farm at (4,1). Row y=0 has a pillaged granary at (1,0), a natural wonder at (2,0), bare land at (3,0), empty
// sea at (4,0) and a pier at (0,0). Row y=2 is bare land except a wonder at (2,2). Plot index = y*5 + x.
const W = 5;
const idxOf = (x, y) => y * W + x;
const LOC = {};
for (let y = 0; y < 3; y++) for (let x = 0; x < W; x++) LOC[idxOf(x, y)] = { x, y };
const WATER = new Set(["4,0", "0,0"]);
const RIVER = new Set(["4,1"]);
const NATURAL = new Set(["2,0"]);
// What stands where: [type, damaged]
const BUILT = {
  "1,1": [["BUILDING_PALACE", false]],
  "2,1": [["BUILDING_GRANARY", false], ["BUILDING_MONUMENT", false]],
  "3,1": [["WONDER_HANGING_GARDENS", false]],
  "4,1": [["IMPROVEMENT_FARM", false]],
  "1,0": [["BUILDING_GRANARY", true]],
  "0,0": [["IMPROVEMENT_FISHING_BOAT", false]],
  "2,2": [["WONDER_COLOSSUS", false]]
};
const DEFS = {
  BUILDING_PALACE: { ConstructibleClass: "BUILDING", Name: "LOC_BUILDING_PALACE_NAME" },
  BUILDING_GRANARY: { ConstructibleClass: "BUILDING", Name: "LOC_BUILDING_GRANARY_NAME" },
  BUILDING_MONUMENT: { ConstructibleClass: "BUILDING", Name: "LOC_BUILDING_MONUMENT_NAME" },
  WONDER_HANGING_GARDENS: { ConstructibleClass: "WONDER", Name: "LOC_WONDER_HANGING_GARDENS_NAME" },
  WONDER_COLOSSUS: { ConstructibleClass: "WONDER" },
  IMPROVEMENT_FARM: { ConstructibleClass: "IMPROVEMENT", Name: "LOC_IMPROVEMENT_FARM_NAME" },
  IMPROVEMENT_FISHING_BOAT: { ConstructibleClass: "IMPROVEMENT", Name: "LOC_IMPROVEMENT_FISHING_BOAT_NAME" }
};
const YIELDS = {}; // idx → yields list
YIELDS[idxOf(1, 1)] = [["F", 4], ["P", 3]]; // 7 → +2
YIELDS[idxOf(2, 1)] = [["C", 2]]; // 2 → +0
YIELDS[idxOf(3, 1)] = []; // the Gardens: no yield at all
YIELDS[idxOf(4, 1)] = [["F", 5]]; // 5 → +1
YIELDS[idxOf(3, 0)] = [["F", 1]];
YIELDS[idxOf(4, 0)] = [["F", 1]];
YIELDS[idxOf(0, 0)] = [["F", 3]];
YIELDS[idxOf(1, 0)] = "not-an-array";
// Odd-r hex neighbors (the engine does this; the stub only needs to be a consistent hex grid).
const DIRS = ["DIRECTION_EAST", "DIRECTION_WEST", "DIRECTION_NORTHEAST", "DIRECTION_NORTHWEST", "DIRECTION_SOUTHEAST", "DIRECTION_SOUTHWEST"];
function adjacent(l, d) {
  const odd = l.y % 2 === 1;
  const dx = { DIRECTION_EAST: 1, DIRECTION_WEST: -1, DIRECTION_NORTHEAST: odd ? 1 : 0, DIRECTION_NORTHWEST: odd ? 0 : -1,
    DIRECTION_SOUTHEAST: odd ? 1 : 0, DIRECTION_SOUTHWEST: odd ? 0 : -1 }[d];
  const dy = { DIRECTION_EAST: 0, DIRECTION_WEST: 0, DIRECTION_NORTHEAST: -1, DIRECTION_NORTHWEST: -1, DIRECTION_SOUTHEAST: 1, DIRECTION_SOUTHWEST: 1 }[d];
  const x = l.x + dx;
  const y = l.y + dy;
  return x < 0 || y < 0 || x >= W || y >= 3 ? { x: -1, y: -1 } : { x, y };
}

globalThis.GameContext = { localPlayerID: 0 };
globalThis.DirectionTypes = Object.fromEntries(DIRS.map((d, i) => [d, i]));
globalThis.DistrictTypes = { CITY_CENTER: 11, URBAN: 12, RURAL: 13 };
globalThis.Districts = { getAtLocation: (l) => (l.x === 1 && l.y === 1 ? { type: 11 } : { type: 13 }) };
globalThis.GameplayMap = {
  getLocationFromIndex: (i) => LOC[i] || null,
  getIndexFromLocation: (l) => (LOC[idxOf(l.x, l.y)] ? idxOf(l.x, l.y) : -1),
  isWater: (x, y) => WATER.has(x + "," + y),
  isRiver: (x, y) => RIVER.has(x + "," + y),
  getFeatureType: (x, y) => (NATURAL.has(x + "," + y) ? 7 : 0),
  getAdjacentPlotLocation: (l, d) => adjacent(l, DIRS[d]),
  getYields: (idx) => YIELDS[idx]
};
globalThis.MapConstructibles = { getConstructibles: (x, y) => (BUILT[x + "," + y] || []).map(([type, damaged]) => ({ type, damaged })) };
globalThis.Constructibles = { getByComponentID: (cid) => ({ type: cid.type, damaged: cid.damaged }) };
globalThis.GameInfo = {
  Constructibles: { lookup: (t) => DEFS[t] || null },
  Features: { lookup: (f) => (f === 7 ? { FeatureType: "FEATURE_GULLFOSS", Name: "LOC_FEATURE_GULLFOSS_NAME" } : { FeatureType: "NO_FEATURE" }) },
  Feature_NaturalWonders: [{ FeatureType: "FEATURE_GULLFOSS" }, { FeatureType: "FEATURE_ULURU" }]
};

const { WEIGHTS, BANDS, scorable, plotYield, tileScore, tierOf, bandOf, cityTileTiers, tileTierAt, tierFill, tierHex,
  resetTileScoreCaches } = await import("/emigration/ui/emigration-tile-score.js");

const kinds = (r) => r.terms.map((t) => t.kind + ":" + t.points);

// ── which plots are painted ──────────────────────────────────────────────────
{
  assert.equal(scorable(3, 0), true, "land is painted");
  assert.equal(scorable(4, 0), false, "empty sea is not: it is nobody's prosperity");
  assert.equal(scorable(0, 0), true, "water the settlement has built on is");
  const was = globalThis.GameplayMap.isWater;
  globalThis.GameplayMap.isWater = () => { throw new Error("no map"); };
  assert.equal(scorable(9, 9), true, "a failed read paints the tile, so the lens degrades to painting everything");
  globalThis.GameplayMap.isWater = was;
}

// ── the yield read ───────────────────────────────────────────────────────────
{
  assert.equal(plotYield(idxOf(1, 1)), 7, "a plot's yield is the sum of its yields");
  assert.equal(plotYield(idxOf(1, 0)), null, "an unreadable yields list is null (the yield term is then skipped)");
}

// ── what each hex is worth, and why ──────────────────────────────────────────
{
  // The Hanging Gardens: no yield at all, yet the best hex in London. Next to the quarter (no term) and the farm
  // (no term); its odd-row NE/SE neighbors are (4,0) sea and (4,2) bare, NW/SW (3,0) bare and (3,2) bare.
  const g = tileScore(3, 1, idxOf(3, 1));
  assert.deepEqual(kinds(g), ["wonder:6"], "a wonder is worth its flat term, whatever the hex yields");
  assert.equal(g.terms[0].name, "LOC_WONDER_HANGING_GARDENS_NAME", "and the term carries the wonder's name for the panel");
  assert.equal(bandOf(g.points), "thriving", "6 points: thriving");

  // The center: district + palace + 7 yield. Neighbors (odd row): E (2,1) quarter, W (0,1) bare, NE (2,0) NATURAL
  // wonder, NW (1,0) PILLAGED granary, SE (2,2) Colosseus WONDER, SW (1,2) bare.
  const c = tileScore(1, 1, idxOf(1, 1));
  assert.deepEqual(kinds(c), ["cityCenter:3", "building:2", "yield:2", "adjacentWonder:1", "adjacentNaturalWonder:2", "adjacentPillaged:-1"],
    "the center: its district, its palace, its yield, and everything around it, each a named term");
  assert.equal(c.points, 9, "the terms sum to the score");
  assert.equal(bandOf(c.points), "flourishing", "9 points: flourishing");
  assert.equal(c.terms.find((t) => t.kind === "yield").amount, 7, "the yield term remembers the raw yield for the panel");
  assert.equal(c.terms.find((t) => t.kind === "adjacentNaturalWonder").count, 1, "adjacency terms remember the count");

  // The quarter: two buildings plus the completed-quarter bonus; its 2 yield is below one yield step, so no term.
  const q = tileScore(2, 1, idxOf(2, 1));
  assert.deepEqual(kinds(q), ["building:2", "building:2", "quarter:1", "adjacentWonder:2", "adjacentNaturalWonder:2"],
    "two buildings make a quarter; yield under the step is not a term; the Gardens (E), the Colosseus (SW) and Gullfoss (NW) are next door");
  assert.equal(q.points, 9);

  // The river farm.
  const f = tileScore(4, 1, idxOf(4, 1));
  assert.deepEqual(kinds(f), ["improvement:1", "yield:1", "river:1", "adjacentWonder:1"], "a worked rural hex on a river next to the Gardens");
  assert.equal(bandOf(f.points), "ordinary", "4 points: ordinary");

  // Ruin: the pillaged granary earns its penalty and NOT its building points; Gullfoss (E) is next door.
  const r = tileScore(1, 0, idxOf(1, 0));
  assert.deepEqual(kinds(r), ["pillaged:-3", "adjacentNaturalWonder:2"], "a pillaged building is a penalty, not a building");
  assert.equal(r.terms[0].name, "LOC_BUILDING_GRANARY_NAME", "named, so the panel can say which building");
  assert.equal(bandOf(r.points), "blighted", "-1: blighted");

  // The natural wonder hex itself.
  const n = tileScore(2, 0, idxOf(2, 0));
  assert.deepEqual(kinds(n), ["naturalWonder:3", "adjacentPillaged:-1"], "a natural wonder is a term in its own right; the ruin next door pulls it down");
  assert.equal(n.terms[0].name, "LOC_FEATURE_GULLFOSS_NAME");

  // Bare land in the corner (0,2): its only neighbors are bare land and the map edge.
  const b = tileScore(0, 2, idxOf(0, 2));
  assert.deepEqual(kinds(b), [], "bare land far from anything: no terms");
  assert.equal(bandOf(b.points), "meager", "0: meager");
  assert.deepEqual(kinds(tileScore(0, 2, null)), [], "no plot index: the yield term is skipped, nothing else changes");
  assert.deepEqual(kinds(tileScore(3, 2, idxOf(3, 2))), ["adjacentWonder:2"], "bare land between the Colosseus (W) and the Gardens (NE, even row) picks up both");
}

// ── bands and color ─────────────────────────────────────────────────────────
{
  assert.deepEqual(BANDS.map((b) => b[0]), ["flourishing", "thriving", "ordinary", "meager"], "the bands, best first");
  assert.equal(bandOf(8), "flourishing");
  assert.equal(bandOf(7), "thriving");
  assert.equal(bandOf(5), "thriving");
  assert.equal(bandOf(4), "ordinary");
  assert.equal(bandOf(2), "ordinary");
  assert.equal(bandOf(1), "meager");
  assert.equal(bandOf(0), "meager");
  assert.equal(bandOf(-1), "blighted");
  assert.equal(tierOf(3), 0, "the middle of ordinary is neutral gray");
  assert.equal(tierOf(8), 1, "the flourishing floor saturates green");
  assert.equal(tierOf(20), 1, "and beyond it is clamped");
  assert.equal(tierOf(-2), -1, "a pillaged hex saturates red");
  assert.ok(tierOf(6) > 0.5 && tierOf(6) < 0.7, "a wonder alone is clearly green but not saturated: " + tierOf(6));
  const neutral = tierFill(0);
  const best = tierFill(1);
  const worst = tierFill(-1);
  assert.equal(Math.round(neutral.w * 100), 45, "an ordinary tile is the most transparent");
  assert.equal(Math.round(best.w * 100), 85, "an extreme tile is the most opaque");
  assert.ok(best.y > best.x && best.y > best.z, "above ordinary paints green");
  assert.ok(worst.x > worst.y && worst.x > worst.z, "below it paints red");
  assert.equal(tierHex(0), "#969696", "neutral gray");
  assert.equal(tierHex(1), "#18e048", "flourishing");
  assert.equal(tierHex(-1), "#ee2820", "blighted");
}

// ── a settlement's painted plots (what the lens draws) ───────────────────────
{
  const london = { getPurchasedPlots: () => [idxOf(1, 1), idxOf(2, 1), idxOf(3, 1), idxOf(4, 1), idxOf(4, 0), idxOf(0, 0)] };
  const tiers = cityTileTiers(london);
  assert.equal(tiers.length, 5, "the empty sea plot is not painted; the pier is");
  const by = new Map(tiers.map((r) => [r.x + "," + r.y, r]));
  assert.equal(by.get("1,1").score, 9);
  assert.equal(by.get("1,1").t, tierOf(9), "the color position is the score's, so the lens and the panel agree by construction");
  assert.equal(by.get("3,1").score, 6, "the Gardens are the second-best hex in London, not the worst");
  assert.ok(by.get("3,1").score > by.get("4,1").score, "and out-score the farm");
  assert.deepEqual(cityTileTiers({ getPurchasedPlots: () => [] }), [], "a settlement with no plots has no tiers");
  // The per-pass neighbor cache is shared: a second city sees the same facts and reads nothing twice.
  const cache = new Map();
  cityTileTiers(london, cache);
  const before = cache.size;
  cityTileTiers({ getPurchasedPlots: () => [idxOf(2, 2)] }, cache);
  assert.ok(cache.size >= before, "the cache only grows across settlements in one paint");
}

// ── the hovered tile (what the panel prints) ─────────────────────────────────
{
  const hit = tileTierAt(3, 1);
  assert.deepEqual([hit.score, hit.band, hit.t], [6, "thriving", tierOf(6)], "the panel reads the same score, band and color the lens painted");
  assert.deepEqual(hit.terms.map((t) => t.kind), ["wonder"], "with the terms behind it");
  assert.equal(tileTierAt(4, 0), null, "an unpainted sea tile has no reading");
}

// ── degradation without the engine tables ────────────────────────────────────
{
  resetTileScoreCaches();
  const wasGI = globalThis.GameInfo;
  globalThis.GameInfo = { Constructibles: wasGI.Constructibles, Features: wasGI.Features }; // no natural-wonder table
  assert.deepEqual(kinds(tileScore(2, 0, idxOf(2, 0))), ["adjacentPillaged:-1"], "no natural-wonder table: that term is 0, the rest still scores");
  globalThis.GameInfo = wasGI;
  resetTileScoreCaches();
  const wasC = globalThis.Constructibles;
  delete globalThis.Constructibles;
  assert.deepEqual(kinds(tileScore(3, 1, idxOf(3, 1))), [], "no Constructibles global: nothing built can be read anywhere, the hex scores its land");
  globalThis.Constructibles = wasC;
  const wasD = globalThis.Districts;
  globalThis.Districts = { getAtLocation: () => { throw new Error("no districts"); } };
  assert.equal(tileScore(1, 1, idxOf(1, 1)).terms[0].kind, "building", "an unreadable district is simply not the center");
  globalThis.Districts = wasD;
  assert.equal(WEIGHTS.wonder, 6, "the wonder is the largest single term");
  assert.ok(WEIGHTS.wonder > WEIGHTS.cityCenter && WEIGHTS.cityCenter > WEIGHTS.building, "wonder > center > building");
}

console.log("tile-score harness passed");
