// prescribe.mjs
//
// The city readout's fix line (emigration-prescribe.js, emigration-city-readout.js): how much Food, Production or
// Happiness would stop people leaving, and the age's building that gives it. The gap is the prosperity model's
// own: the best destination's adjusted pull over the settlement's hold. Nothing is prescribed when nobody is
// drawn away.

import assert from "node:assert/strict";

globalThis.Locale = { compose: (s) => s };
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { prescribe, amountToClose, bestBuildingFor } = await import("/emigration/ui/emigration-prescribe.js");
const { fixLine } = await import("/emigration/ui/emigration-city-readout.js");
const { prosperity, fieldContext, rankByProsperity } = await import("/emigration/ui/emigration-prosperity.js");

CONFIG.readoutPrescribe = true;
CONFIG.bordersEnabled = false;

/** A settlement signal with sane numbers; owner 0 unless given. */
function sig(name, over) {
  return {
    key: name, owner: 0, city: { name, location: { x: name.length, y: 1 } }, population: 6, rural: 4, urban: 2, food: 6, production: 4, gold: 2,
    science: 2, culture: 2, happiness: 4, violence: 0, disaster: 0, siege: false, starving: false, unrest: false,
    atWar: false, distance: 5, ...(over || {})
  };
}

function testAmountToClose() {
  const s = sig("Rome");
  const ctx = fieldContext([s]);
  const base = prosperity(s, ctx);
  const k = amountToClose(s, "YIELD_FOOD", 0.5, ctx);
  assert.ok(k >= 1, "some Food closes a small gap");
  assert.ok(prosperity({ ...s, food: s.food + k }, ctx) - base >= 0.5, "the amount really closes it");
  assert.ok(prosperity({ ...s, food: s.food + k - 1 }, ctx) - base < 0.5, "and one less doesn't");
  assert.equal(amountToClose(s, "YIELD_FOOD", 1e6, ctx), 0, "a gap no sane amount closes: nothing");
}

function testPrescribe() {
  const poor = sig("Rome", { food: 3, production: 2, happiness: 1 });
  const rich = sig("Ostia", { food: 9, production: 5, happiness: 6 }); // a modest neighbour: a gap a building can close
  const buildings = (y) => (y === "YIELD_FOOD" ? { name: "LOC_BUILDING_GRANARY_NAME", gives: 1 } : null);
  const ranked = rankByProsperity([rich, poor]); // the pass's signals carry their prosperity
  const fix = prescribe(poor, ranked, null, buildings);
  assert.ok(fix && fix.gap > 0, "a poor settlement beside a rich one has a gap");
  assert.equal(fix.options.length, 2, "the two cheapest yields");
  assert.ok(fix.options[0].amount <= fix.options[1].amount, "cheapest first");
  assert.ok(fix.options.some((o) => o.yield === "YIELD_HAPPINESS"), "Happiness closes this gap cheapest");
  const food = fix.options.find((o) => o.yield === "YIELD_FOOD");
  assert.equal(food ? food.building : "LOC_BUILDING_GRANARY_NAME", "LOC_BUILDING_GRANARY_NAME");
  const line = fixLine(fix);
  assert.match(line, /^What would stop it: \+\d+ \w+ or \+\d+ \w+ here/);
  assert.equal(prescribe(rich, ranked, null, buildings), null, "the rich settlement: nobody is drawn away");
  assert.equal(fixLine(null), "");
  CONFIG.readoutPrescribe = false;
  assert.equal(prescribe(poor, ranked, null, buildings), null, "switched off");
  CONFIG.readoutPrescribe = true;
}

function testBuildingLookup() {
  globalThis.GameInfo = {
    Constructible_YieldChanges: [
      { ConstructibleType: "BUILDING_GRANARY", YieldType: "YIELD_FOOD", YieldChange: 1 },
      { ConstructibleType: "BUILDING_FISHING_QUAY", YieldType: "YIELD_FOOD", YieldChange: 2 },
      { ConstructibleType: "BUILDING_LATER", YieldType: "YIELD_FOOD", YieldChange: 5 },
      { ConstructibleType: "IMPROVEMENT_FARM", YieldType: "YIELD_FOOD", YieldChange: 9 }
    ],
    Constructibles: {
      lookup: (t) => ({
        BUILDING_GRANARY: { Name: "Granary", ConstructibleClass: "BUILDING", Age: "AGE_ANTIQUITY" },
        BUILDING_FISHING_QUAY: { Name: "Fishing Quay", ConstructibleClass: "BUILDING", Age: "AGE_ANTIQUITY" },
        BUILDING_LATER: { Name: "Later", ConstructibleClass: "BUILDING", Age: "AGE_MODERN" },
        IMPROVEMENT_FARM: { Name: "Farm", ConstructibleClass: "IMPROVEMENT", Age: "AGE_ANTIQUITY" }
      })[t]
    }
  };
  assert.deepEqual(bestBuildingFor("YIELD_FOOD", "AGE_ANTIQUITY"), { name: "Fishing Quay", gives: 2 },
    "the building of this age that gives most; improvements and other ages don't count");
  assert.equal(bestBuildingFor("YIELD_SCIENCE", "AGE_ANTIQUITY"), null);
  delete globalThis.GameInfo;
}

testAmountToClose();
testPrescribe();
testBuildingLookup();
console.log("prescribe: ok");
