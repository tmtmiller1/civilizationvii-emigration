import assert from "node:assert/strict";

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const {
  CALL_HOME_CURRENCY, CALL_HOME_SCOPE, callHomeAgeScale, callHomeCandidates, callHomeChance, callHomeCost,
  callHomeQuote, callHomeRoll, callHomeTiers, resolveCallHome
} = await import("/emigration/ui/emigration-call-home.js");

const ME = 0;
const THEM = 3;
/** Flow rows: points split by cause, people mirrored so the refugee share resolves. */
const FLOWS = [
  // my people who fled Rome for my own Ostia (internal), all of it war
  { src: ME, dest: ME, srcCity: "Rome", destCity: "Ostia", points: 4, byCause: { war: 400 } },
  // my people who fled Rome into a rival's Carthage (external), war
  { src: ME, dest: THEM, srcCity: "Rome", destCity: "Carthage", points: 3, byCause: { war: 300 } },
  // ordinary migrants: not refugees, so never callable
  { src: ME, dest: ME, srcCity: "Rome", destCity: "Neapolis", points: 5, byCause: { prosperity: 500 } },
  // someone else's flow: never mine to call
  { src: THEM, dest: ME, srcCity: "Carthage", destCity: "Rome", points: 9, byCause: { war: 900 } }
];

function testCandidatesSplitByOwner() {
  const c = callHomeCandidates(ME, FLOWS);
  assert.equal(c.internal.length, 1, "one internal pair");
  assert.equal(c.internal[0].home, "Rome");
  assert.equal(c.internal[0].from, "Ostia");
  assert.equal(c.internal[0].points, 4);
  assert.equal(c.external.length, 1, "one external pair");
  assert.equal(c.external[0].from, "Carthage");
  assert.equal(c.external[0].points, 3);
}

function testOnlyRefugeesAreCallable() {
  // The prosperity row is the biggest internal flow but must not be offered: those people chose to go.
  const c = callHomeCandidates(ME, FLOWS);
  assert.ok(!c.internal.some((p) => p.from === "Neapolis"), "voluntary migrants are not called home");
  assert.ok(!c.internal.some((p) => p.home === "Carthage"), "another civ's displaced are not mine to call");
}

function testInternalIsCertainAndExternalIsNot() {
  // The two variants are different offers: a purchase inside your borders, a gamble abroad.
  assert.equal(callHomeChance(CALL_HOME_SCOPE.INTERNAL), 1, "an internal call is certain");
  const outside = callHomeChance(CALL_HOME_SCOPE.EXTERNAL);
  assert.ok(outside > 0 && outside < 0.5, `an external call is a long shot (${outside})`);
  assert.ok(!("callHomeChanceInternal" in CONFIG), "the internal-chance tunable is gone: nothing is rolled");
}

function testFeeIsConvexAndDearerAbroad() {
  const base = CONFIG.callHomeGoldPerPoint;
  const inside = (n) => callHomeCost(n, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD);
  assert.equal(inside(1), base, "a call for one costs the base price");
  assert.equal(inside(2), Math.round(base * Math.pow(2, 1.5)), "two cost about 2.8 times it");
  assert.equal(inside(3), Math.round(base * Math.pow(3, 1.5)), "three about 5.2 times it");
  assert.deepEqual([inside(1), inside(2), inside(3)], [60, 170, 312], "the shipped ladder");
  assert.ok(inside(3) - inside(2) > inside(2) - inside(1), "each extra person is dearer than the last (convex)");
  assert.ok(inside(3) > 3 * base, "well above three times the price of one");
  const infl = callHomeCost(3, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.INFLUENCE);
  assert.equal(infl, Math.round(CONFIG.callHomeInfluencePerPoint * Math.pow(3, 1.5)), "influence rides the same curve at its own price");
  assert.notEqual(inside(3), infl, "the two currencies are genuinely different offers");
  const ext = (n) => callHomeCost(n, CALL_HOME_SCOPE.EXTERNAL, CALL_HOME_CURRENCY.GOLD);
  assert.equal(ext(3), Math.round(base * Math.pow(3, 1.5) * CONFIG.callHomeExternalCostScale), "abroad is the same curve, scaled up");
  assert.ok(ext(1) > inside(1) && ext(3) > inside(3), "calling people out of a rival's cities costs more at every size");
  assert.equal(inside(0), 0, "no points, no fee");
}

function testFeeClimbsWithTheAge() {
  const inside = (n, age) => callHomeCost(n, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD, age);
  const step = CONFIG.callHomeAgeCostStep;
  assert.equal(callHomeAgeScale("AGE_ANTIQUITY"), 1);
  assert.equal(callHomeAgeScale("AGE_EXPLORATION"), step);
  assert.equal(callHomeAgeScale("AGE_MODERN"), step * step);
  assert.equal(callHomeAgeScale("AGE_NONSENSE"), 1, "an unknown age is priced as Antiquity");
  assert.equal(callHomeAgeScale(""), 1, "so is a missing one (mid-transition)");
  assert.equal(inside(1, "AGE_EXPLORATION"), 60 * step, "a call for one in Exploration");
  assert.equal(inside(3, "AGE_MODERN"), Math.round(60 * Math.pow(3, 1.5) * step * step), "the curve and the age compound");
  assert.equal(inside(1), inside(1, "AGE_ANTIQUITY"), "off-engine the live age reads as Antiquity");
  const ext = callHomeCost(2, CALL_HOME_SCOPE.EXTERNAL, CALL_HOME_CURRENCY.INFLUENCE, "AGE_MODERN");
  assert.equal(ext, Math.round(12 * Math.pow(2, 1.5) * 1.5 * step * step), "abroad, both scales and the age apply");
}

function testTiersAreOneHalfAndAll() {
  assert.deepEqual(callHomeTiers(3), [1, 2, 3]);
  assert.deepEqual(callHomeTiers(8), [1, 4, 8]);
  assert.deepEqual(callHomeTiers(2), [1, 2], "no duplicate when half rounds up to one");
  assert.deepEqual(callHomeTiers(1), [1]);
  assert.deepEqual(callHomeTiers(0), [], "nothing callable, no sizes");
}

function testQuoteCapsAtTheAttemptLimitAndAtWhatWasAsked() {
  const q = callHomeQuote(ME, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD, FLOWS);
  assert.equal(q.available, 4, "four internal points are away");
  assert.equal(q.points, Math.min(4, CONFIG.callHomeMaxPointsPerAttempt), "capped per attempt");
  assert.equal(q.cost, callHomeCost(q.points, q.scope, CALL_HOME_CURRENCY.GOLD), "the fee matches the points");
  const two = callHomeQuote(ME, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD, FLOWS, 2);
  assert.equal(two.points, 2, "asking for two quotes two");
  const many = callHomeQuote(ME, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD, FLOWS, 99);
  assert.equal(many.points, q.points, "asking for more than the cap still stops at the cap");
}

function testAnInternalCallBringsExactlyWhatYouAskedFor() {
  // The purchase: two asked for, two come, two paid for. No dice anywhere.
  const moved = [];
  let paid = 0;
  const r = resolveCallHome(ME, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.INFLUENCE, {
    turn: 7, gameId: "g", flows: FLOWS, want: 2,
    pay: (n) => { paid = n; return true; }, move: (p) => { moved.push(p.from + ">" + p.home); return true; }
  });
  assert.equal(r.ok, true);
  assert.equal(r.attempted, 2);
  assert.equal(r.returned, 2, "exactly the number asked for comes home");
  assert.deepEqual(moved, ["Ostia>Rome", "Ostia>Rome"], "pulled back from Ostia to Rome");
  assert.equal(paid, callHomeCost(2, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.INFLUENCE));
}

function testAnExternalCallIsPaidForEitherWay() {
  // The gamble: the fee buys the call at the chosen size, before anyone is rolled. Across many turns some
  // calls bring people and some bring nobody, and the bill is the same either way.
  const was = CONFIG.callHomeChanceExternal;
  CONFIG.callHomeChanceExternal = 0.3;
  const fee = callHomeCost(2, CALL_HOME_SCOPE.EXTERNAL, CALL_HOME_CURRENCY.GOLD);
  let answered = 0;
  let refused = 0;
  for (let turn = 1; turn <= 40; turn++) {
    const seen = [];
    const r = resolveCallHome(ME, CALL_HOME_SCOPE.EXTERNAL, CALL_HOME_CURRENCY.GOLD, {
      turn, gameId: "g", flows: FLOWS, want: 2, pay: (n) => { seen.push(n); return true; }, move: () => true
    });
    assert.deepEqual(seen, [fee], "billed once, for a call of two, whatever it brings");
    assert.equal(r.paid, fee);
    assert.equal(r.attempted, 2, "two were asked");
    if (r.ok) {
      answered++;
      assert.ok(r.returned >= 1 && r.returned <= 2, "between one and everyone asked");
    } else {
      refused++;
      assert.equal(r.reason, "nobody-came");
      assert.equal(r.returned, 0);
    }
  }
  CONFIG.callHomeChanceExternal = was;
  assert.ok(answered > 0 && refused > 0, `both outcomes happen (${answered} answered, ${refused} refused)`);
}

function testAnExternalCallCanBringNobody() {
  // No floor: at odds of zero nobody comes, nobody moves, and the fee is still gone.
  const was = CONFIG.callHomeChanceExternal;
  CONFIG.callHomeChanceExternal = 0;
  let paid = 0;
  const r = resolveCallHome(ME, CALL_HOME_SCOPE.EXTERNAL, CALL_HOME_CURRENCY.GOLD, {
    turn: 9, gameId: "g", flows: FLOWS,
    pay: (n) => { paid = n; return true; }, move: () => { throw new Error("must not move"); }
  });
  CONFIG.callHomeChanceExternal = was;
  assert.equal(r.ok, false);
  assert.equal(r.reason, "nobody-came");
  assert.equal(r.attempted, 3);
  assert.equal(r.returned, 0);
  assert.equal(paid, callHomeCost(3, CALL_HOME_SCOPE.EXTERNAL, CALL_HOME_CURRENCY.GOLD), "the call was paid for");
  assert.equal(r.paid, paid);
}

function testAThinTreasuryBringsBackWhatItCanAfford() {
  // Enough for one head only: one comes home rather than the call being refused outright.
  const perHead = callHomeCost(1, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD);
  let paid = 0;
  const r = resolveCallHome(ME, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD, {
    turn: 3, gameId: "g", flows: FLOWS, afford: () => perHead,
    pay: (n) => { paid = n; return true; }, move: () => true
  });
  assert.equal(r.ok, true);
  assert.equal(r.returned, 1, "only what the treasury covers comes home");
  assert.equal(paid, perHead, "and it is billed for exactly that");
  // The curve, not a rate: a treasury holding the price of two (170) but not of three (312), asked for three,
  // brings two. Dividing by the price of one would wrongly have said two as well here, but not in general.
  const two = callHomeCost(2, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD);
  const r2 = resolveCallHome(ME, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD, {
    turn: 4, gameId: "g", flows: FLOWS, want: 3, afford: () => two,
    pay: (n) => { paid = n; return true; }, move: () => true
  });
  assert.equal(r2.returned, 2, "the largest count whose fee fits");
  assert.equal(paid, two);
}

function testNothingHappensWhenItCannotBePaid() {
  const r = resolveCallHome(ME, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD, {
    turn: 5, flows: FLOWS, afford: () => 0, pay: () => false, move: () => { throw new Error("must not move"); }
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "cannot-pay");
  assert.equal(r.paid, 0, "a refused payment costs nothing");
}

function testNobodyToCall() {
  const r = resolveCallHome(ME, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD, {
    turn: 5, flows: [], pay: () => { throw new Error("must not charge"); }, move: () => true
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "nobody-to-call", "no fee is taken when there is nobody to call");
}

function testRollIsSeededAndStable() {
  // The same attempt must give the same answer across reloads: no re-rolling by saving and loading.
  const a = callHomeRoll("g|0|external|Rome|Carthage|12|1", 0.5);
  const b = callHomeRoll("g|0|external|Rome|Carthage|12|1", 0.5);
  assert.equal(a, b, "the same seed gives the same answer");
  assert.equal(callHomeRoll("x", 1), true, "chance 1 always returns them");
  assert.equal(callHomeRoll("x", 0), false, "chance 0 never does");
}

function testExternalOddsMatchTheirStatement() {
  const n = 3000;
  let k = 0;
  const chance = callHomeChance(CALL_HOME_SCOPE.EXTERNAL);
  for (let i = 0; i < n; i++) if (callHomeRoll("seed|" + i, chance)) k++;
  assert.ok(Math.abs(k / n - chance) < 0.06, `the roll (${(k / n).toFixed(2)}) matches its stated odds (${chance})`);
}

function testDisabledOffersNothing() {
  const was = CONFIG.callHomeEnabled;
  CONFIG.callHomeEnabled = false;
  const r = resolveCallHome(ME, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD, {
    turn: 1, flows: FLOWS, pay: () => true, move: () => true
  });
  CONFIG.callHomeEnabled = was;
  assert.equal(r.ok, false);
  assert.equal(r.reason, "disabled");
}

testCandidatesSplitByOwner();
testOnlyRefugeesAreCallable();
testInternalIsCertainAndExternalIsNot();
testFeeIsConvexAndDearerAbroad();
testFeeClimbsWithTheAge();
testTiersAreOneHalfAndAll();
testQuoteCapsAtTheAttemptLimitAndAtWhatWasAsked();
testAnInternalCallBringsExactlyWhatYouAskedFor();
testAnExternalCallIsPaidForEitherWay();
testAnExternalCallCanBringNobody();
testAThinTreasuryBringsBackWhatItCanAfford();
testNothingHappensWhenItCannotBePaid();
testNobodyToCall();
testRollIsSeededAndStable();
testExternalOddsMatchTheirStatement();
testDisabledOffersNothing();

console.log("call-home harness passed");
