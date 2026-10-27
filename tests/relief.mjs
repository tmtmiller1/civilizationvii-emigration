// relief.mjs
//
// Fewer people, less strain (emigration-relief.js): a settlement that loses people over unhappiness gets +1
// Happiness for each until it grows back to the size it was when they left. Only departures over unhappiness count.

import assert from "node:assert/strict";

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const rl = await import("/emigration/ui/emigration-relief.js");

function testNote() {
  const book = {};
  const migs = [
    { cause: "unhappiness", phase: "move", srcLoc: "5,5", points: 1 },
    { cause: "unhappiness", phase: "depart", srcLoc: "5,5", points: 1 },
    { cause: "unhappiness", phase: "arrive", srcLoc: "5,5", points: 1 },
    { cause: "war", phase: "move", srcLoc: "5,5", points: 1 },
    { cause: "disaster", phase: "move", srcLoc: "5,5", points: 1 },
    { cause: "prosperity", phase: "move", srcLoc: "5,5", points: 1 },
    { cause: "unhappiness", phase: "move", srcLoc: "9,9", points: 1 }
  ];
  const n = rl.noteDepartures(book, migs, (loc) => (loc === "5,5" ? 8 : null));
  assert.equal(n, 2, "two left 5,5 over unhappiness; arrivals, war, disaster and prosperity moves don't count");
  assert.deepEqual(book, { "5,5": [9, 10] }, "it was 10, then 9; it's 8 now");
}

function testHold() {
  assert.deepEqual(rl.holdRelief([9, 10], 8), { kept: [9, 10], tier: 2 });
  assert.deepEqual(rl.holdRelief([9, 10], 9), { kept: [10], tier: 1 }, "grown back to 9: one is made up");
  assert.deepEqual(rl.holdRelief([9, 10], 10), { kept: [], tier: 0 }, "back to its size: no relief");
  assert.equal(rl.holdRelief(Array.from({ length: 14 }, (_, i) => 20 + i), 5).tier, rl.RELIEF_TIERS, "capped");
  assert.equal(rl.tierOf("BUILDING_EMIG_RELIEF_3"), 3);
  assert.equal(rl.tierOf("BUILDING_EMIG_RELIEF_11"), 0);
  assert.equal(rl.tierOf("BUILDING_GRANARY"), 0);
  assert.deepEqual(rl.cleanBook({ "1,2": [3, "x", -1, 4], bad: [1], "3,4": "no" }), { "1,2": [3, 4] });
}

/** A fake world: settlement sizes, the tiers standing, the saved book. */
function world(sizes) {
  const w = { sizes: { ...sizes }, tiers: {}, saved: {}, sets: [] };
  const deps = {
    load: () => JSON.parse(JSON.stringify(w.saved)), save: (b) => (w.saved = b),
    sizeAt: (loc) => (loc in w.sizes ? w.sizes[loc] : null),
    placedAt: () => Object.keys(w.tiers).filter((k) => w.tiers[k] > 0),
    tierAt: (loc) => w.tiers[loc] || 0,
    setTier: (loc, t) => { w.tiers[loc] = t; w.sets.push([loc, t]); return true; }
  };
  return { w, deps };
}

function testPass() {
  const saved = { m: CONFIG.happinessModel, r: CONFIG.reliefEnabled };
  CONFIG.happinessModel = "field";
  const off = world({ "1,1": 4 });
  assert.equal(rl.reliefPass([{ cause: "unhappiness", srcLoc: "1,1" }], off.deps).added, 0, "off under the field model");
  CONFIG.happinessModel = "stage"; CONFIG.reliefEnabled = true;
  const { w, deps } = world({ "1,1": 4, "2,2": 7 });
  rl.reliefPass([{ cause: "unhappiness", phase: "move", srcLoc: "1,1", points: 1 }], deps);
  assert.equal(w.tiers["1,1"], 1, "one left: +1");
  w.sizes["1,1"] = 3;
  rl.reliefPass([{ cause: "unhappiness", phase: "move", srcLoc: "1,1", points: 1 }], deps);
  assert.equal(w.tiers["1,1"], 2, "a second left: +2");
  w.sizes["1,1"] = 4;
  rl.reliefPass([], deps);
  assert.equal(w.tiers["1,1"], 1, "grown back by one: +1");
  w.sizes["1,1"] = 5;
  rl.reliefPass([], deps);
  assert.equal(w.tiers["1,1"], 0, "back to its size: the building comes down");
  assert.deepEqual(w.saved, {}, "and the book is empty");
  w.tiers["2,2"] = 3;
  rl.reliefPass([], deps);
  assert.equal(w.tiers["2,2"], 0, "a stray building with nothing on the book comes down");
  const sets = w.sets.length;
  rl.reliefPass([], deps);
  assert.equal(w.sets.length, sets, "nothing changes, nothing is sent");
  w.tiers["3,3"] = 2;
  rl.reliefPass([], deps);
  assert.equal(w.tiers["3,3"], 2, "a settlement that can't be read is left alone");
  CONFIG.happinessModel = saved.m; CONFIG.reliefEnabled = saved.r;
}

testNote();
testHold();
testPass();
console.log("relief: ok");
