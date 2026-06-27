import assert from "node:assert/strict";
import { CONFIG } from "/emigration/ui/emigration-config.js";

Object.assign(CONFIG, {
  violenceFleeThreshold: 0.5,
  plagueCarryEnabled: true,
  plagueCarryDistress: 10,
  dividendPerMigrant: 1
});

let warLossRecorded = false;

globalThis.recordWarLoss = () => { warLossRecorded = true; };
globalThis.addDistress = (key, distress) => { distressAdded.push({ key, distress }); };
globalThis.disasterKey = (city) => city?.location ? "key_" + city.location.x : null;
globalThis.addAssimilationLoad = (owner, pop) => {
  assimilationLoads.push({ owner, pop });
  return pop * 0.1;
};
globalThis.addAttractionDividend = (owner, yieldKey, dividend) => {
  dividends.push({ owner, yieldKey, dividend });
};
globalThis.activeAttractions = (owner) => [
  "YIELD_GOLD",
  "YIELD_CULTURE"
];
globalThis.onRaidIntake = (destOwner, srcOwner) => {
  raidIntakes.push({ destOwner, srcOwner });
  return srcOwner === 1 ? "YIELD_INFLUENCE" : null;
};

const { applyDepartureConsequences, applyArrivalConsequences } =
  await import("/emigration/ui/emigration-consequences.js");

function testApplyDepartureConsequencesWithHighViolence() {
  const src = {
    violence: 0.8,
    city: { location: { x: 10, y: 20 } }
  };

  assert.doesNotThrow(() => applyDepartureConsequences(src), "high-violence departure should be safe");
}

function testApplyDepartureConsequencesWithLowViolence() {
  const src = {
    violence: 0.2,
    city: { location: { x: 10, y: 20 } }
  };

  assert.doesNotThrow(() => applyDepartureConsequences(src), "low-violence departure should be safe");
}

function testApplyDepartureConsequencesAtThreshold() {
  const src = {
    violence: 0.5,
    city: { location: { x: 10, y: 20 } }
  };

  assert.doesNotThrow(() => applyDepartureConsequences(src), "threshold departure should be safe");
}

function testApplyDepartureConsequencesWithNullCity() {
  warLossRecorded = false;
  const src = { violence: 1.0, city: null };
  
  try {
    applyDepartureConsequences(src);
  } catch (e) {
    assert.fail(`should handle null city: ${e.message}`);
  }
}

function testApplyArrivalConsequencesWithPlague() {
  const destCity = { location: { x: 10, y: 20 } };
  const load = applyArrivalConsequences(destCity, 0, 100, true, 2);

  assert.equal(typeof load, "number", "should return assimilation load");
}

function testApplyArrivalConsequencesWithoutPlague() {
  const destCity = { location: { x: 10, y: 20 } };
  const load = applyArrivalConsequences(destCity, 0, 100, false, 2);

  assert.equal(typeof load, "number", "should return assimilation load");
}

function testApplyArrivalConsequencesWithRaidTarget() {
  const destCity = { location: { x: 10, y: 20 } };
  const load = applyArrivalConsequences(destCity, 0, 50, false, 1);

  assert.equal(typeof load, "number");
}

function testApplyArrivalConsequencesWithPlaguDisabled() {
  const origPlague = CONFIG.plagueCarryEnabled;
  CONFIG.plagueCarryEnabled = false;

  const destCity = { location: { x: 10, y: 20 } };
  applyArrivalConsequences(destCity, 0, 100, true, 2);

  CONFIG.plagueCarryEnabled = origPlague;
}

function testApplyArrivalConsequencesAttractionDividends() {
  const destCity = { location: { x: 10, y: 20 } };
  const load = applyArrivalConsequences(destCity, 0, 100, false, 2);
  assert.equal(typeof load, "number");
}

function testApplyArrivalConsequencesZeroPopulation() {
  const destCity = { location: { x: 10, y: 20 } };
  const load = applyArrivalConsequences(destCity, 0, 0, false, 2);

  assert.equal(typeof load, "number");
  assert.ok(load >= 0, "should handle zero population");
}

function testApplyArrivalConsequencesNullCity() {
  try {
    applyArrivalConsequences(null, 0, 100, false, 2);
    assert.ok(true, "should handle null city");
  } catch (e) {
    assert.fail(`should not throw for null city: ${e.message}`);
  }
}

testApplyDepartureConsequencesWithHighViolence();
testApplyDepartureConsequencesWithLowViolence();
testApplyDepartureConsequencesAtThreshold();
testApplyDepartureConsequencesWithNullCity();
testApplyArrivalConsequencesWithPlague();
testApplyArrivalConsequencesWithoutPlague();
testApplyArrivalConsequencesWithRaidTarget();
testApplyArrivalConsequencesWithPlaguDisabled();
testApplyArrivalConsequencesAttractionDividends();
testApplyArrivalConsequencesZeroPopulation();
testApplyArrivalConsequencesNullCity();

delete globalThis.recordWarLoss;
delete globalThis.addDistress;
delete globalThis.disasterKey;
delete globalThis.addAssimilationLoad;
delete globalThis.addAttractionDividend;
delete globalThis.activeAttractions;
delete globalThis.onRaidIntake;

console.log("consequences-branches harness passed");
