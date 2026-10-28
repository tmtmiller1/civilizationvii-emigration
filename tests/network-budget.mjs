// network-budget.mjs
//
// The network diagram's dot budget (emigration-network-viz.js, dotsWithinBudget): however large the game, the scene
// holds at most DOT_BUDGET dots, each standing for more people as the population grows. A turn-106 game in Scaled
// Pop drew enough dots that the renderer ran out of room for the frame and the game crashed (2026-10-27).

import assert from "node:assert/strict";

const { dotsWithinBudget, DOT_BUDGET } = await import("/emigration/ui/emigration-network-viz.js");
const { buildChronoDots } = await import("/emigration/ui/emigration-network-dots.js");

/** One civilization of `n` settlements, each `pop` people, over `turns` frames of growth. */
function world(n, pop, turns) {
  const frames = [];
  for (let t = 1; t <= turns; t++) {
    const cities = [];
    for (let i = 0; i < n; i++) cities.push({ name: "C" + i, pop: Math.round(pop * t / turns), pts: 10 });
    frames.push({ pops: { 10: { cities } }, network: { edges: [] }, intra: [] });
  }
  return frames;
}
const fresh = () => ({ centers: [{ id: 10, x: 0, y: 0, name: "Civ10", cities: [] }], byId: new Map([[10, 0]]),
  colorMap: new Map([[10, 0]]) });

function testLargeGameStaysUnderBudget() {
  const frames = world(80, 400000, 30);
  const a = fresh();
  const raw = buildChronoDots(frames, a.centers, a.byId, a.colorMap, 2000);
  assert.ok(raw.length > DOT_BUDGET, "the fixed unit alone overshoots in a big game (" + raw.length + ")");
  const b = fresh();
  const dots = dotsWithinBudget(frames, b.centers, b.byId, b.colorMap, 2000);
  assert.ok(dots.length <= DOT_BUDGET, "the budget holds: " + dots.length);
  assert.ok(dots.length > DOT_BUDGET / 4, "and still draws a full picture: " + dots.length);
  assert.equal(b.centers[0].cities.length, 80, "every settlement is still laid out");
}

function testSmallGameUntouched() {
  const frames = world(6, 8000, 5);
  const a = fresh();
  const b = fresh();
  assert.deepEqual(dotsWithinBudget(frames, a.centers, a.byId, a.colorMap, 2000).length,
    buildChronoDots(frames, b.centers, b.byId, b.colorMap, 2000).length, "a game under the budget keeps its unit");
}

function testGrowthKeepsCount() {
  const early = fresh();
  const late = fresh();
  const n1 = dotsWithinBudget(world(80, 100000, 30), early.centers, early.byId, early.colorMap, 2000).length;
  const n2 = dotsWithinBudget(world(80, 1600000, 30), late.centers, late.byId, late.colorMap, 2000).length;
  assert.ok(n1 <= DOT_BUDGET && n2 <= DOT_BUDGET, "both under the budget: " + n1 + ", " + n2);
}

testLargeGameStaysUnderBudget();
testSmallGameUntouched();
testGrowthKeepsCount();
console.log("network-budget: ok");
