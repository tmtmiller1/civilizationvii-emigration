import assert from "node:assert/strict";

// readoutModel is pure (no engine reads); actionHint/permanenceCue fall back to English with no
// Locale present, which is the deterministic path asserted here.
const { readoutModel } = await import("/emigration/ui/emigration-city-readout.js");

const has = (lines, re) => lines.some((l) => re.test(l));

function testProsperityPullReadout() {
  const m = readoutModel({
    cityName: "Rome",
    cause: "prosperity",
    causeLabel: "Attraction",
    onCooldown: false,
    cooldown: 0,
    pressureToBar: 0.5,
    topDestinationName: "Carthage",
    crossCiv: true,
    assimLoad: 2,
    assimCostGold: 3,
    ownerNet: -5000,
    atRisk: false,
    attritionRisk: false
  });
  assert.equal(m.title, "Rome - Migration");
  assert.equal(m.lines[0], "Pressure: Attraction (50% to next move)");
  assert.ok(has(m.lines, /Pulled toward Carthage \(rival civ\)/));
  assert.ok(has(m.lines, /Assimilation cost: ~3 gold\/turn/));
  assert.ok(has(m.lines, /Civ net migration: -5 thousand people/));
  assert.ok(has(m.lines, /prosper|yields/i)); // localized action hint (English fallback)
  assert.ok(has(m.lines, /until you address the cause/)); // persistent permanence cue
  assert.equal(m.warn, null);
}

function testTrappedWarReadout() {
  const m = readoutModel({
    cityName: "Ur",
    cause: "war",
    causeLabel: "War",
    onCooldown: true,
    cooldown: 3,
    pressureToBar: 0,
    topDestinationName: "",
    crossCiv: false,
    assimLoad: 0,
    assimCostGold: 0,
    ownerNet: 0,
    atRisk: true,
    attritionRisk: true
  });
  assert.equal(m.lines[0], "Pressure: War (resting 3)"); // cooldown status, not pressure %
  assert.ok(!has(m.lines, /Pulled toward/)); // no destination → no pull line
  assert.ok(!has(m.lines, /Assimilation cost/)); // no load → no cost line
  assert.equal(m.warn, "At risk: trapped with nowhere to flee"); // attrition outranks distress
}

function testDistressWithoutAttrition() {
  const m = readoutModel({
    cityName: "Tyre",
    cause: "unhappiness",
    causeLabel: "Unhappiness",
    pressureToBar: 0.2,
    ownerNet: 0,
    atRisk: true,
    attritionRisk: false
  });
  assert.match(m.warn, /Under distress/);
}

function testNullSnapshot() {
  assert.equal(readoutModel(null), null);
}

testProsperityPullReadout();
testTrappedWarReadout();
testDistressWithoutAttrition();
testNullSnapshot();

console.log("city-readout harness passed");
