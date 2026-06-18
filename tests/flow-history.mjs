import assert from "node:assert/strict";

// Pure delta-encoding helpers (combined design plan P0.3). No engine globals
// needed — these operate on plain flow matrices (key → { cause: people }).
const {
  addFlows,
  sumDeltas,
  subtractFlows,
  mergeAdjacentDeltas,
  migrateCumulativeToDeltas
} = await import("/emigration/ui/emigration-flow-history.js");

/**
 * Reconstruct each frame's CUMULATIVE matrix from delta-encoded frames the same
 * way migrationFlowHistory() does (running sum of deltas).
 * @param {{delta:object}[]} frames Delta frames.
 * @returns {object[]} Per-frame cumulative matrices.
 */
function reconstructCumulatives(frames) {
  const running = {};
  return frames.map((f) => {
    addFlows(running, f.delta || {});
    // deep clone the running snapshot so later mutation can't alias it
    const snap = {};
    for (const k of Object.keys(running)) snap[k] = { ...running[k] };
    return snap;
  });
}

// Build N>96 cumulative frames the OLD way: a growing cumulative matrix cloned
// into every frame (the exact shape legacy saves persisted).
function buildLegacyCumulativeFrames(n) {
  const cum = {};
  const frames = [];
  for (let i = 0; i < n; i += 1) {
    // Each turn, some city-pair corridor gains people under a rotating cause.
    const key = "0>1>CityA" + (i % 7) + ">CityB" + (i % 5);
    const cause = i % 2 === 0 ? "economy" : "war";
    if (!cum[key]) cum[key] = {};
    cum[key][cause] = (cum[key][cause] || 0) + (i + 1);
    // clone the cumulative into this frame (legacy behaviour)
    const flows = {};
    for (const k of Object.keys(cum)) flows[k] = { ...cum[k] };
    frames.push({ turn: i, age: i < 60 ? "AGE_ANTIQUITY" : "AGE_EXPLORATION", chartTurn: i, flows });
  }
  return frames;
}

function testSubtractIsInverseOfAdd() {
  const a = { "0>1>X>Y": { economy: 5, war: 2 } };
  const b = { "0>1>X>Y": { economy: 5, war: 2 }, "1>2>P>Q": { plague: 3 } };
  const delta = subtractFlows(b, a);
  assert.deepEqual(delta, { "1>2>P>Q": { plague: 3 } });
  // adding the delta back onto `a` reproduces `b`
  const back = addFlows({ "0>1>X>Y": { economy: 5, war: 2 } }, delta);
  assert.deepEqual(back, b);
}

function testMigrationIsLossless() {
  const legacy = buildLegacyCumulativeFrames(130);
  const expected = legacy.map((f) => f.flows); // cumulative per frame, pre-migration
  const migrated = migrateCumulativeToDeltas(legacy.map((f) => ({ ...f })));
  // every frame is now delta-encoded (no cumulative clone left)
  assert.ok(migrated.every((f) => f.delta && !f.flows));
  const got = reconstructCumulatives(migrated);
  assert.deepEqual(got, expected, "reconstructed cumulatives must match the originals exactly");
}

function testSumDeltasEqualsFinalCumulative() {
  const legacy = buildLegacyCumulativeFrames(40);
  const finalCum = legacy[legacy.length - 1].flows;
  const migrated = migrateCumulativeToDeltas(legacy.map((f) => ({ ...f })));
  assert.deepEqual(sumDeltas(migrated), finalCum);
}

function testMergePreservesCumulativeTotals() {
  const legacy = buildLegacyCumulativeFrames(130);
  const migrated = migrateCumulativeToDeltas(legacy.map((f) => ({ ...f })));
  const finalBefore = sumDeltas(migrated);
  const merged = mergeAdjacentDeltas(migrated, 96);
  assert.ok(merged.length <= migrated.length, "merge must not grow the history");
  assert.ok(merged.length <= 97, "merged history stays near the cap");
  // total migration is conserved across the merge
  assert.deepEqual(sumDeltas(merged), finalBefore);
}

function testMergeKeepsAgeBoundaryFrame() {
  const legacy = buildLegacyCumulativeFrames(130);
  const migrated = migrateCumulativeToDeltas(legacy.map((f) => ({ ...f })));
  const merged = mergeAdjacentDeltas(migrated, 96);
  // both ages still represented after decimation
  const ages = new Set(merged.map((f) => f.age));
  assert.ok(ages.has("AGE_ANTIQUITY") && ages.has("AGE_EXPLORATION"));
}

function testMigrationIsIdempotent() {
  const legacy = buildLegacyCumulativeFrames(20);
  const once = migrateCumulativeToDeltas(legacy.map((f) => ({ ...f })));
  const twice = migrateCumulativeToDeltas(once.map((f) => ({ ...f })));
  assert.deepEqual(reconstructCumulatives(twice), reconstructCumulatives(once));
}

testSubtractIsInverseOfAdd();
testMigrationIsLossless();
testSumDeltasEqualsFinalCumulative();
testMergePreservesCumulativeTotals();
testMergeKeepsAgeBoundaryFrame();
testMigrationIsIdempotent();

console.log("flow-history harness passed");
