import assert from "node:assert/strict";

globalThis.Game = { turn: 1 };
globalThis.Players = { get: () => null };

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { processArrivals } = await import("/emigration/ui/emigration-arrivals.js");

function makeTransit(overrides = {}) {
  return {
    srcName: "From",
    destName: "To",
    srcOwner: 1,
    destOwner: 2,
    destKey: "2:9",
    crossCiv: true,
    people: 1000,
    cause: "war",
    infected: false,
    eventKey: "war:1:2",
    arriveTurn: 5,
    ...overrides
  };
}

function testSkipsWhenNoTransitOrNoRanked() {
  const a = { monoTurn: 5, transit: [] };
  assert.deepEqual(processArrivals(a, [{ key: "2:9" }]), []);

  const e = makeTransit();
  const b = { monoTurn: 5, transit: [e] };
  const out = processArrivals(b, []);
  assert.deepEqual(out, []);
  assert.equal(b.transit.length, 1, "empty ranking should defer rather than consume due arrivals");
}

function testConsumesOnlyDueTransitEntries() {
  const due = makeTransit({ destKey: "2:due", arriveTurn: 5 });
  const later = makeTransit({ destKey: "2:later", arriveTurn: 8 });
  const state = { monoTurn: 5, transit: [due, later] };

  const out = processArrivals(state, [{ key: "2:missing", city: {} }]);
  assert.equal(out.length, 1);
  assert.equal(state.transit.length, 1);
  assert.equal(state.transit[0].destKey, "2:later");
}

function testDestinationGoneBecomesAttritionArrival() {
  const state = { monoTurn: 5, transit: [makeTransit()] };
  const out = processArrivals(state, [{ key: "other:city", city: {} }]);

  assert.equal(out.length, 1);
  assert.equal(out[0].phase, "arrive");
  assert.equal(out[0].cause, "attrition");
  assert.equal(out[0].srcOwner, 1);
  assert.equal(out[0].destOwner, undefined);
}

function testSuccessfulArrivalCreditsDestinationAndUpdatesSignal() {
  const priorLoad = CONFIG.assimilationLoadPerMigrant;
  const priorPerPop = CONFIG.assimilationCostPerPop;
  CONFIG.assimilationLoadPerMigrant = 1;
  CONFIG.assimilationCostPerPop = 0;

  const city = {
    ruralPopulation: 2,
    population: 8,
    addRuralPopulation(n) {
      this.ruralPopulation += n;
      this.population += n;
    }
  };
  const sig = { key: "2:9", city, rural: 2, population: 8 };
  const state = { monoTurn: 5, transit: [makeTransit({ destKey: "2:9" })] };

  const out = processArrivals(state, [sig]);
  assert.equal(out.length, 1);
  assert.equal(out[0].phase, "arrive");
  assert.equal(out[0].cause, "war");
  assert.equal(out[0].destOwner, 2);
  assert.equal(typeof out[0].destPaidCost, "number");
  assert.equal(city.ruralPopulation, 3);
  assert.equal(city.population, 9);
  assert.equal(sig.rural, 3);
  assert.equal(sig.population, 9);

  CONFIG.assimilationLoadPerMigrant = priorLoad;
  CONFIG.assimilationCostPerPop = priorPerPop;
}

function testArrivalWithoutAddRuralApiFallsBackToAttrition() {
  const sig = { key: "2:9", city: {}, rural: 7, population: 13 };
  const state = { monoTurn: 5, transit: [makeTransit({ destKey: "2:9" })] };

  const out = processArrivals(state, [sig]);
  assert.equal(out.length, 1);
  assert.equal(out[0].cause, "attrition");
  assert.equal(sig.rural, 7);
  assert.equal(sig.population, 13);
}

testSkipsWhenNoTransitOrNoRanked();
testConsumesOnlyDueTransitEntries();
testDestinationGoneBecomesAttritionArrival();
testSuccessfulArrivalCreditsDestinationAndUpdatesSignal();
testArrivalWithoutAddRuralApiFallsBackToAttrition();

console.log("arrivals harness passed");