import assert from "node:assert/strict";

const { buildCitySnapshot } = await import("/emigration/ui/emigration-city-readout-data.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

// Deterministic thresholds for the attrition/pressure math.
CONFIG.emigrationBar = 30;
CONFIG.attritionEnabled = true;
CONFIG.attritionMinDistress = 50;

function testProsperityPullSnapshot() {
  const snap = buildCitySnapshot({
    signal: { owner: 1, population: 6, rural: 3, happiness: 4 },
    cityName: "Rome",
    cause: "prosperity",
    distress: 0,
    bestDest: { name: "Carthage", owner: 2, crossCiv: true },
    source: { pressure: 15, cooldown: 0 },
    assim: { load: 2, gold: 3, happiness: 1 },
    owner: { net: -100, in: 50, out: 150 }
  });
  assert.equal(snap.cityName, "Rome");
  assert.equal(snap.causeLabel, "Attraction");
  assert.equal(snap.permanence, "persistent");
  assert.ok(snap.hint.length > 0);
  assert.equal(snap.atRisk, false);
  assert.equal(snap.attritionRisk, false); // content (distress 0), so the outlet can't fire
  assert.equal(snap.pressureToBar, 0.5); // 15 / 30
  assert.equal(snap.onCooldown, false);
  assert.equal(snap.topDestinationName, "Carthage");
  assert.equal(snap.topDestinationOwner, 2);
  assert.equal(snap.crossCiv, true);
  assert.equal(snap.assimCostGold, 3);
  assert.equal(snap.ownerNet, -100);
  assert.equal(snap.ownerOut, 150);
}

function testTrappedWarCityFlagsAttritionRisk() {
  const snap = buildCitySnapshot({
    signal: { owner: 1, population: 4, rural: 1 },
    cityName: "Akrotiri",
    cause: "war",
    distress: 80, // >= attritionMinDistress
    bestDest: null, // no refuge
    source: { pressure: 5, cooldown: 0 }
  });
  assert.equal(snap.permanence, "temporary"); // war loss decays
  assert.equal(snap.atRisk, true);
  assert.equal(snap.attritionRisk, true); // distressed + nowhere to go + feature on
  assert.equal(snap.topDestinationName, ""); // no destination
  assert.equal(snap.crossCiv, false);
}

function testPressureClampsAndCooldown() {
  const snap = buildCitySnapshot({
    signal: { owner: 0, population: 3, rural: 2 },
    cause: "unhappiness",
    source: { pressure: 100, cooldown: 3 } // pressure well over the bar
  });
  assert.equal(snap.pressureToBar, 1); // clamped to 1
  assert.equal(snap.onCooldown, true);
  assert.equal(snap.cooldown, 3);
  assert.equal(snap.causeLabel, "Unhappiness");
}

function testDefensiveDefaults() {
  const snap = buildCitySnapshot({ signal: {} });
  assert.equal(snap.cityName, "a settlement");
  assert.equal(snap.population, 0);
  assert.equal(snap.rural, 0);
  assert.equal(snap.causeLabel, "Other"); // no cause → fallback label
  assert.equal(snap.permanence, "persistent");
  assert.equal(snap.pressure, 0);
  assert.equal(snap.pressureToBar, 0);
  assert.equal(snap.onCooldown, false);
  assert.equal(snap.attritionRisk, false); // not distressed
  assert.equal(snap.ownerNet, 0);
}

testProsperityPullSnapshot();
testTrappedWarCityFlagsAttritionRisk();
testPressureClampsAndCooldown();
testDefensiveDefaults();

console.log("city-readout-data harness passed");
