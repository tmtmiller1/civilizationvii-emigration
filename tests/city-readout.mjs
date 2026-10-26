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
  assert.ok(has(m.lines, /Newcomers: -3 Gold, -[\d.]+ Happiness a turn/));
  assert.ok(has(m.lines, /Civ net migration: -5,000 people/));
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

function testSiegeStalledLine() {
  const m = readoutModel({
    cityName: "Jeonju", cause: "war", causeLabel: "War", pressureToBar: 0.1, ownerNet: 0,
    atRisk: false, attritionRisk: false, siegeStalled: true
  });
  assert.ok(has(m.lines, /^Siege stalled: the besiegers aren't attacking/), "a stalled siege has its own line");
  const live = readoutModel({ cityName: "Jeonju", cause: "war", causeLabel: "War", pressureToBar: 0.1, ownerNet: 0 });
  assert.ok(!has(live.lines, /Siege stalled/), "and a live one doesn't");
}
testSiegeStalledLine();

function testForecastLine() {
  const m = readoutModel({
    cityName: "Cilakofa", cause: "prosperity", causeLabel: "Attraction", pressureToBar: 0.6, ownerNet: 0,
    forecast: { stable: false, turns: 2, people: 2, rate: 0.2 }
  });
  assert.ok(has(m.lines, /^Forecast: About 2 people are likely to leave in the next 2 turns$/));
  const calm = readoutModel({ cityName: "Cilakofa", cause: "prosperity", causeLabel: "Attraction", pressureToBar: 0.1, ownerNet: 0,
    forecast: { stable: true, turns: 0, people: 0, rate: 0 } });
  assert.ok(has(calm.lines, /^Forecast: Nobody is likely to leave soon$/));
  const off = readoutModel({ cityName: "Cilakofa", cause: "prosperity", causeLabel: "Attraction", pressureToBar: 0.1, ownerNet: 0, forecast: null });
  assert.ok(!has(off.lines, /Forecast/), "no line when the option is off");
}
testForecastLine();

function testNullSnapshot() {
  assert.equal(readoutModel(null), null);
}

testProsperityPullReadout();
testTrappedWarReadout();
testDistressWithoutAttrition();
testNullSnapshot();

console.log("city-readout harness passed");
