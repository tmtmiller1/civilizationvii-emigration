import assert from "node:assert/strict";

const {
  capFlows,
  capByEvent,
  addFlows,
  sumDeltas,
  subtractFlows,
  mergeAdjacentDeltas,
  migrateCumulativeToDeltas
} = await import("/emigration/ui/emigration-flow-history.js");

// capFlows no-op and prune path (with/without flowsPts)
const f1 = { a: { x: 1 }, b: { x: 2 }, c: { x: 3 }, d: { x: 4 } };
const p1 = { a: { x: 1 }, b: { x: 2 }, c: { x: 3 }, d: { x: 4 } };
capFlows(f1, p1, 10);
assert.equal(Object.keys(f1).length, 4);
capFlows(f1, p1, 2);
assert.ok(Object.keys(f1).length <= 2);
assert.ok(Object.keys(p1).length <= 2);

const f2 = { a: { x: 1 }, b: { x: 2 }, c: { x: 3 } };
capFlows(f2, undefined, 1);
assert.ok(Object.keys(f2).length <= 1);
capFlows(null, undefined, 1);

// capByEvent no-op and trim path including undefined civ map branch
const byCiv = { "1": { a: 1, b: 9, c: 3 }, "2": undefined };
capByEvent(byCiv, 2);
assert.deepEqual(Object.keys(byCiv["1"]).sort(), ["b", "c"]);
capByEvent(undefined, 2);
capByEvent({ "3": { a: 0, b: 0, c: 1 } }, 2);

// addFlows guards and sparse cause-map branch
const t = {};
assert.strictEqual(addFlows(t, null), t);
addFlows(t, { k1: { war: 2 }, k2: undefined });
assert.equal(t.k1.war, 2);
assert.deepEqual(t.k2, {});
addFlows(t, { k1: { war: 0 } });

// sumDeltas guard branch
assert.deepEqual(sumDeltas(undefined), {});
assert.deepEqual(sumDeltas([{ delta: null }]), {});

// subtractFlows guard branches
assert.deepEqual(subtractFlows(undefined, {}), {});
assert.deepEqual(subtractFlows({ a: { x: 1 } }, undefined), { a: { x: 1 } });
assert.deepEqual(subtractFlows({ a: { x: 1 }, b: null }, { a: { y: 5 } }), { a: { x: 1 } });
assert.deepEqual(subtractFlows({ a: { x: 1 } }, { a: { x: 1 } }), {});

// mergeAdjacentDeltas early-return and merge branches (with/without pop)
const frames = [
  { turn: 1, age: "A", chartTurn: 1, year: "y1", delta: { a: { x: 1 } }, pop: { 1: 10 } },
  { turn: 2, age: "A", chartTurn: 2, year: "y2", delta: { a: { x: 2 } } },
  { turn: 3, age: "B", chartTurn: 3, year: "y3", delta: { b: { x: 3 } }, pop: { 2: 20 } },
  { turn: 4, age: "B", chartTurn: 4, year: "y4", delta: { b: { x: 4 } } }
];

assert.strictEqual(mergeAdjacentDeltas(frames, 99), frames, "under cap should return same reference");
const merged = mergeAdjacentDeltas(frames, 2);
assert.ok(merged.length <= frames.length);
assert.ok(merged.some((f) => f.age === "B"));

// explicit age-boundary helper behavior through merge logic
const boundaryFrames = [
  { turn: 10, age: "A", chartTurn: 10, year: "y10", delta: { a: { x: 1 } } },
  { turn: 11, age: "B", chartTurn: 11, year: "y11", delta: { a: { x: 1 } } },
  { turn: 12, age: "B", chartTurn: 12, year: "y12", delta: null }
];
const boundaryMerged = mergeAdjacentDeltas(boundaryFrames, 1);
assert.ok(boundaryMerged.length >= 2, "age boundary should prevent full fold");

assert.strictEqual(mergeAdjacentDeltas(null, 1), null);

// migration cumulative->delta guard and idempotent paths
assert.strictEqual(migrateCumulativeToDeltas(null), null);
const already = [{ delta: { a: { x: 1 } } }];
assert.strictEqual(migrateCumulativeToDeltas(already), already);

const legacy = [
  { flows: { a: { x: 1 } } },
  { flows: { a: { x: 3 }, b: { z: 2 } } }
];
const migrated = migrateCumulativeToDeltas(legacy);
assert.deepEqual(migrated[0].delta, { a: { x: 1 } });
assert.deepEqual(migrated[1].delta, { a: { x: 2 }, b: { z: 2 } });
assert.equal("flows" in migrated[0], false);

const emptyLegacy = [{ flows: {} }];
const migratedEmpty = migrateCumulativeToDeltas(emptyLegacy);
assert.deepEqual(migratedEmpty[0].delta, {});

console.log("flow-history-branches-extra harness passed");
