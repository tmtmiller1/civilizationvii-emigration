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

  assert.doesNotThrow(() => applyDepartureConsequences(src, "war"), "high-violence departure should be safe");
}

function testApplyDepartureConsequencesWithLowViolence() {
  const src = {
    violence: 0.2,
    city: { location: { x: 10, y: 20 } }
  };

  assert.doesNotThrow(() => applyDepartureConsequences(src, "war"), "low-violence departure should be safe");
}

function testApplyDepartureConsequencesAtThreshold() {
  const src = {
    violence: 0.5,
    city: { location: { x: 10, y: 20 } }
  };

  assert.doesNotThrow(() => applyDepartureConsequences(src, "war"), "threshold departure should be safe");
}

function testApplyDepartureConsequencesWithNullCity() {
  warLossRecorded = false;
  const src = { violence: 1.0, city: null };

  try {
    applyDepartureConsequences(src, "war");
  } catch (e) {
    assert.fail(`should handle null city: ${e.message}`);
  }
}

// The siege loss cap governs the flee-the-violence channel only: a departure from a besieged
// city that leaves for an ECONOMIC reason (prosperity/unhappiness) must NOT book a war-loss,
// or economic movers would drain the cap and shut off the war exodus early. Observed via the
// real violence module's siege escalation (recordWarLoss is a no-op off-engine, so we exercise
// the whole path against a real besieged city).
async function testCauseGatesTheSiegeCap() {
  const KV = {};
  const HEALTH = {};
  const hkey = (owner, loc) => `${owner}:${loc.x}:${loc.y}`;
  let TURN = 1;
  globalThis.Game = { get turn() { return TURN; } };
  globalThis.Players = {
    Districts: {
      get: (owner) => ({
        getDistrictHealth: (loc) => HEALTH[hkey(owner, loc)]?.cur ?? 100,
        getDistrictMaxHealth: (loc) => HEALTH[hkey(owner, loc)]?.max ?? 100
      })
    }
  };
  globalThis.ComponentID = { toBitfield: (cid) => (cid ? cid.owner * 1000 + cid.id : 0) };
  globalThis.GameplayMap = { getLocationFromIndex: () => null };
  globalThis.MapConstructibles = { getConstructibles: () => [] };
  globalThis.Constructibles = { getByComponentID: () => ({ damaged: false }) };
  globalThis.Configuration = {
    getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
    editGame: () => ({ setValue: (k, v) => { KV[k] = v; } })
  };
  const { tickViolence, observeCity, siegeEscalation } =
    await import("/emigration/ui/emigration-violence.js");

  const city = { id: { owner: 0, id: 1 }, owner: 0, location: { x: 5, y: 0 }, population: 10 };
  HEALTH[hkey(0, city.location)] = { cur: 50, max: 100 }; // ≈ half-health → intensity ≥ threshold
  TURN = 1; tickViolence(); observeCity(city); // tenure 1, onsetPop = 10, warLoss = 0
  const escStart = siegeEscalation(city);
  assert.ok(escStart > 0, "siege should be active before any losses");

  const src = { violence: 10, city };
  // onsetPop 10 → cap = siegeLossCapPct*10 = 6 losses would zero the escalation.
  for (let i = 0; i < 6; i++) applyDepartureConsequences(src, "prosperity");
  assert.ok(siegeEscalation(city) > 0, "economic (prosperity) departures must NOT drain the war cap");

  for (let i = 0; i < 6; i++) applyDepartureConsequences(src, "war");
  assert.equal(siegeEscalation(city), 0, "war departures DO drain the cap (real channel intact)");

  delete globalThis.Game;
  delete globalThis.Players;
  delete globalThis.ComponentID;
  delete globalThis.GameplayMap;
  delete globalThis.MapConstructibles;
  delete globalThis.Constructibles;
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
await testCauseGatesTheSiegeCap();

delete globalThis.recordWarLoss;
delete globalThis.addDistress;
delete globalThis.disasterKey;
delete globalThis.addAssimilationLoad;
delete globalThis.addAttractionDividend;
delete globalThis.activeAttractions;
delete globalThis.onRaidIntake;

console.log("consequences-branches harness passed");
