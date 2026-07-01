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

function testPresentDestinationThatCannotAcceptDefers() {
  // The destination EXISTS in the ranking but can't take a point right now (no addRural API): it should
  // DEFER (try again next turn), not charge a death, only a GONE destination dies.
  const sig = { key: "2:9", city: {}, rural: 7, population: 13 };
  const state = { monoTurn: 5, transit: [makeTransit({ destKey: "2:9" })] };

  const out = processArrivals(state, [sig]);
  assert.equal(out.length, 0, "a present-but-unable destination defers, not dies");
  assert.equal(state.transit.length, 1, "the arrival stays in transit");
  assert.equal(state.transit[0].defers, 1, "the deferral is counted");
  assert.equal(sig.rural, 7);
  assert.equal(sig.population, 13);
}

/** A live signal with a working addRural API at a destination. */
function destSignal() {
  return {
    key: "2:9",
    city: {
      ruralPopulation: 2,
      population: 8,
      addRuralPopulation(n) {
        this.ruralPopulation += n;
        this.population += n;
      }
    },
    rural: 2,
    population: 8
  };
}

function testInboundCapDefersDueArrival() {
  const sig = destSignal();
  const state = { monoTurn: 5, transit: [makeTransit({ destKey: "2:9", arriveTurn: 5 })] };
  const ctx = { byCity: new Map([["2:9", 1]]), cap: 1 }; // already at cap

  const out = processArrivals(state, [sig], ctx);
  assert.equal(out.length, 0, "arrival at a saturated destination should defer");
  assert.equal(state.transit.length, 1, "deferred arrivals stay in transit");
  assert.equal(state.transit[0].arriveTurn, 6, "deferred arrival should retry next turn");
  assert.equal(state.transit[0].defers, 1, "deferral is counted");
  assert.equal(sig.population, 8, "deferred arrivals should not mutate destination this turn");
}

function testInboundCounterIncrementsOnSuccessfulArrival() {
  const sig = destSignal();
  const state = { monoTurn: 5, transit: [makeTransit({ destKey: "2:9", arriveTurn: 5 })] };
  const ctx = { byCity: new Map(), cap: 3 };

  const out = processArrivals(state, [sig], ctx);
  assert.equal(out.length, 1);
  assert.equal(ctx.byCity.get("2:9"), 1, "successful arrivals should consume inbound capacity");
}

function testPerishesAfterMaxDefers() {
  const sig = destSignal();
  // Already deferred MAX_DEFERS (4) times and the destination is still saturated → the refugees perish
  // waiting (a death), and the cap is NOT overrun (they don't force-land).
  const e = makeTransit({ destKey: "2:9", arriveTurn: 5, defers: 4 });
  const state = { monoTurn: 5, transit: [e] };
  const ctx = { byCity: new Map([["2:9", 9]]), cap: 1 }; // saturated

  const out = processArrivals(state, [sig], ctx);
  assert.equal(out.length, 1, "a long-blocked arrival is resolved (not deferred again)");
  assert.equal(out[0].cause, "attrition", "it perishes rather than force-landing past the cap");
  assert.equal(out[0].destOwner, undefined, "no destination credited");
  assert.equal(state.transit.length, 0, "it leaves the transit queue (no permanent limbo)");
  assert.equal(sig.population, 8, "the destination is not mutated");
  assert.equal(ctx.byCity.get("2:9"), 9, "the inbound cap is not overrun");
}

function testLongestWaitingLandsFirst() {
  const sig = destSignal();
  const fresh = makeTransit({ destKey: "2:9", arriveTurn: 5, defers: 0, srcName: "Fresh" });
  const waited = makeTransit({ destKey: "2:9", arriveTurn: 5, defers: 2, srcName: "Waited" });
  const state = { monoTurn: 5, transit: [fresh, waited] };
  const ctx = { byCity: new Map(), cap: 1 }; // only room for one this turn

  const out = processArrivals(state, [sig], ctx);
  assert.equal(out.length, 1, "only one lands under a cap of 1");
  assert.equal(out[0].srcName, "Waited", "the longest-waiting arrival lands first");
  assert.equal(state.transit.length, 1, "the fresh one defers");
  assert.equal(state.transit[0].srcName, "Fresh");
}

testSkipsWhenNoTransitOrNoRanked();
testConsumesOnlyDueTransitEntries();
testDestinationGoneBecomesAttritionArrival();
testSuccessfulArrivalCreditsDestinationAndUpdatesSignal();
testPresentDestinationThatCannotAcceptDefers();
testInboundCapDefersDueArrival();
testInboundCounterIncrementsOnSuccessfulArrival();
testPerishesAfterMaxDefers();
testLongestWaitingLandsFirst();

console.log("arrivals harness passed");