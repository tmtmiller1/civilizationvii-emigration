// tile-score.mjs
//
// The per-tile prosperity scale shared by the Prosperity lens and its cursor panel
// (emigration-tile-score.js): which plots count, how a tile is normalized against its OWN settlement,
// and the colour that deviation paints. Pure functions over engine globals, so they are stubbed here.
// The lens and the panel both read this module, which is what keeps the printed % and the fill colour
// the same number (mod tests 77 to 81).

import assert from "node:assert/strict";

// Plot index → location; 0,0 / 1,0 land, 2,0 empty sea, 3,0 sea with a pier, 4,0 land.
const LOC = { 0: { x: 0, y: 0 }, 1: { x: 1, y: 0 }, 2: { x: 2, y: 0 }, 3: { x: 3, y: 0 }, 4: { x: 4, y: 0 } };
const WATER = new Set(["2,0", "3,0"]);
const BUILT = new Set(["3,0"]);
const YIELDS = { 0: [["F", 10]], 1: [["F", 2]], 2: [["F", 0]], 3: [["F", 6]], 4: "not-an-array" };

globalThis.GameContext = { localPlayerID: 0 };
globalThis.GameplayMap = {
  getLocationFromIndex: (i) => LOC[i] || null,
  isWater: (x, y) => WATER.has(x + "," + y),
  getYields: (idx) => YIELDS[idx]
};
globalThis.MapConstructibles = { getConstructibles: (x, y) => (BUILT.has(x + "," + y) ? [{}] : []) };

const { scorable, plotScore, plotScoreAt, cityTileTiers, cityLandmarks, landmarkAt, tileTierAt, tierFill, tierHex,
  landmarkFill, LANDMARK_HEX } = await import("/emigration/ui/emigration-tile-score.js");

const city = { getPurchasedPlots: () => [0, 1, 2, 3] };

// ── which plots count ────────────────────────────────────────────────────────
{
  assert.equal(scorable(0, 0), true, "land counts");
  assert.equal(scorable(2, 0), false, "empty sea does not count: it reads 0 and would drag the settlement's scale");
  assert.equal(scorable(3, 0), true, "water the settlement has built on counts");
  const was = globalThis.GameplayMap.isWater;
  globalThis.GameplayMap.isWater = () => { throw new Error("no map"); };
  assert.equal(scorable(9, 9), true, "a failed read counts the tile in, so the scale degrades to including everything");
  globalThis.GameplayMap.isWater = was;
}

// ── the tile score ───────────────────────────────────────────────────────────
{
  assert.equal(plotScore(0), 10, "a tile scores the sum of its yields");
  assert.equal(plotScore(4), null, "an unreadable yields list scores null (caller falls back per settlement)");
}

// ── normalized against its OWN settlement ────────────────────────────────────
{
  // Counting plots are 10, 2 and 6 (the empty sea at 2,0 is out): mean 6, spread 4.
  const tiers = cityTileTiers(city);
  assert.equal(tiers.length, 3, "the empty sea plot is excluded from the settlement's tiles");
  const by = new Map(tiers.map((r) => [r.x + "," + r.y, r]));
  assert.equal(by.get("0,0").t, 1, "the settlement's best tile saturates at +1");
  assert.equal(by.get("1,0").t, -1, "its worst tile saturates at -1");
  assert.equal(by.get("3,0").t, 0, "a tile at the settlement's mean is neutral");
  assert.equal(by.get("0,0").mean, 6, "the mean is the settlement's own, not the world's");
  assert.deepEqual(cityTileTiers({ getPurchasedPlots: () => [] }), [], "a settlement with no plots has no tiers");
}

// ── one outstanding tile must not flatten the rest (the two-sided scale) ─────
{
  // A wonder tile at 100 with ordinary land at 10, 8 and 6: mean 31. Scaled against the single widest deviation
  // (69), the worst tile would read only -36% and the whole settlement would look uniform (mod test 83). Scaled
  // per side, the best tile is +100% and the worst -100%, and the ordinary tiles spread across the red half.
  Object.assign(LOC, { 10: { x: 0, y: 5 }, 11: { x: 1, y: 5 }, 12: { x: 2, y: 5 }, 13: { x: 3, y: 5 } });
  Object.assign(YIELDS, { 10: [["F", 100]], 11: [["F", 10]], 12: [["F", 8]], 13: [["F", 6]] });
  const tiers = cityTileTiers({ getPurchasedPlots: () => [10, 11, 12, 13] });
  const by = new Map(tiers.map((r) => [r.x + "," + r.y, r]));
  assert.equal(by.get("0,5").t, 1, "the best tile is +100%");
  assert.equal(by.get("3,5").t, -1, "the worst tile is -100%, not a fraction of the wonder's lead");
  assert.ok(by.get("1,5").t < -0.7 && by.get("1,5").t > -0.9,
    "ordinary land spreads across the lower half instead of hugging the mean: " + by.get("1,5").t);
}

// ── the hovered tile's standing (what the cursor panel prints) ───────────────
{
  const hit = tileTierAt(city, 0, 0);
  assert.deepEqual([hit.t, hit.score, hit.mean, hit.best, hit.worst], [1, 10, 6, 10, 2],
    "the panel reads the same deviation the lens coloured the tile from, plus its settlement's context");
  assert.equal(tileTierAt(city, 2, 0), null, "an excluded sea tile has no standing");
  assert.equal(tileTierAt(city, 9, 9), null, "a plot outside the settlement has no standing");
  assert.equal(tileTierAt({ getPurchasedPlots: () => [] }, 0, 0), null, "no plots, no standing");
}

// ── a wonder is a landmark, not land (the Hanging Gardens, 2026-09-17) ────────
{
  // London-shaped: land at 10, 8 and 6, and the Hanging Gardens on a plot that yields 0 (it has no yield rows in
  // the compiled database; its worth is +10% growth). On the yield scale the wonder was the settlement's worst
  // tile at -100%. A 12th-plot Colossus at 3 gold is a landmark too: one rule, by ConstructibleClass, not by yield.
  Object.assign(LOC, { 20: { x: 0, y: 7 }, 21: { x: 1, y: 7 }, 22: { x: 2, y: 7 }, 23: { x: 3, y: 7 }, 24: { x: 4, y: 7 } });
  Object.assign(YIELDS, { 20: [["F", 10]], 21: [["F", 8]], 22: [["F", 6]], 23: [], 24: [["G", 3]] });
  const WONDERS = { "3,7": "WONDER_HANGING_GARDENS", "4,7": "WONDER_COLOSSUS" };
  const DEFS = {
    WONDER_HANGING_GARDENS: { ConstructibleType: "WONDER_HANGING_GARDENS", ConstructibleClass: "WONDER", Name: "LOC_WONDER_HANGING_GARDENS_NAME" },
    WONDER_COLOSSUS: { ConstructibleType: "WONDER_COLOSSUS", ConstructibleClass: "WONDER" },
    BUILDING_GRANARY: { ConstructibleType: "BUILDING_GRANARY", ConstructibleClass: "BUILDING", Name: "LOC_BUILDING_GRANARY_NAME" }
  };
  const wasGet = globalThis.MapConstructibles.getConstructibles;
  globalThis.MapConstructibles.getConstructibles = (x, y) => {
    const k = x + "," + y;
    if (WONDERS[k]) return [{ id: WONDERS[k] }];
    if (k === "0,7") return [{ id: "BUILDING_GRANARY" }]; // a building on land: still land
    return wasGet(x, y);
  };
  globalThis.Constructibles = { getByComponentID: (cid) => ({ type: cid.id, damaged: cid.id === "WONDER_COLOSSUS" }) };
  globalThis.GameInfo = { Constructibles: { lookup: (t) => DEFS[t] || null } };
  globalThis.GameplayMap.getIndexFromLocation = (l) => Object.keys(LOC).map(Number).find((i) => LOC[i].x === l.x && LOC[i].y === l.y) ?? -1;

  assert.deepEqual(landmarkAt(3, 7), { name: "LOC_WONDER_HANGING_GARDENS_NAME" }, "a wonder plot is a landmark, named by its LOC key");
  assert.deepEqual(landmarkAt(4, 7), { name: "" }, "a pillaged, unnamed wonder is still a landmark (it is still not land)");
  assert.equal(landmarkAt(0, 7), null, "a building is not a landmark: its yields are the tile's worth");
  assert.equal(landmarkAt(1, 7), null, "bare land is not a landmark");
  assert.equal(landmarkAt(3, 0), null, "a pier on water is not a landmark");

  const london = { getPurchasedPlots: () => [20, 21, 22, 23, 24] };
  const tiers = cityTileTiers(london);
  const by = new Map(tiers.map((r) => [r.x + "," + r.y, r]));
  assert.equal(tiers.length, 3, "the two wonder plots are out of the settlement's land scale");
  assert.equal(by.get("0,7").mean, 8, "the mean is the land's own (10, 8, 6), not dragged to 6.75 by the wonders");
  assert.equal(by.get("2,7").t, -1, "the settlement's worst LAND is its -100% anchor, not the wonder");
  assert.equal(by.get("0,7").t, 1, "and its best land is +100%");
  assert.equal(tileTierAt(london, 3, 7), null, "a landmark has no land standing (the panel prints its own rows)");
  assert.deepEqual(cityLandmarks(london), [{ x: 3, y: 7 }, { x: 4, y: 7 }], "the lens paints exactly the wonder plots as landmarks");
  assert.equal(plotScoreAt(3, 7), 0, "the panel can still print the honest yield figure for the plot");
  assert.equal(plotScoreAt(4, 7), 3, "including a wonder that does carry yield rows");
  assert.equal(plotScoreAt(9, 9), null, "an unknown plot has no score");

  // The landmark colour is off the red/grey/green axis, so it can't be mistaken for a yield verdict.
  const lf = landmarkFill();
  assert.ok(lf.x > lf.z && lf.y > lf.z, "amber: red and green both high, blue low");
  assert.ok(lf.x > 0.85 && lf.y > 0.6 && lf.y < 0.75, "not the pure red or pure green of the yield axis: " + JSON.stringify(lf));
  assert.equal(LANDMARK_HEX, "#e8b234", "the panel swatch is the same amber");

  // Degradation: with the constructible API unreadable, a wonder plot is land again (the pre-landmark behaviour).
  const wasCon = globalThis.Constructibles;
  globalThis.Constructibles = { getByComponentID: () => { throw new Error("no engine"); } };
  assert.equal(landmarkAt(3, 7), null, "an unreadable plot is not a landmark");
  assert.equal(cityTileTiers(london).length, 5, "so the scale includes every plot again");
  delete globalThis.Constructibles;
  assert.equal(landmarkAt(3, 7), null, "no Constructibles global: not a landmark");
  globalThis.Constructibles = wasCon;
  globalThis.MapConstructibles.getConstructibles = wasGet;
}

// ── the colour that deviation paints ─────────────────────────────────────────
{
  const neutral = tierFill(0);
  const best = tierFill(1);
  const worst = tierFill(-1);
  assert.equal(Math.round(neutral.w * 100), 45, "a middling tile is the most transparent");
  assert.equal(Math.round(best.w * 100), 85, "an extreme tile is the most opaque");
  assert.ok(best.y > best.x && best.y > best.z, "above its settlement's mean paints green");
  assert.ok(worst.x > worst.y && worst.x > worst.z, "below it paints red");
  // The curve: a quarter of the way out is already nearly half-saturated, so the crowded middle still reads.
  const quarter = tierFill(0.25);
  assert.ok(quarter.w > 0.6 && quarter.w < 0.68, "the saturation curve lifts the middle of the range: " + quarter.w);
  assert.equal(tierHex(0), "#969696", "neutral grey");
  assert.equal(tierHex(1), "#18e048", "the settlement's best tile");
  assert.equal(tierHex(-1), "#ee2820", "the settlement's worst tile");
  assert.equal(tierFill(5).w, tierFill(1).w, "a deviation beyond the range is clamped");
}

console.log("tile-score harness passed");
