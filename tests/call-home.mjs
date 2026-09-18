import assert from "node:assert/strict";

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const {
  CALL_HOME_CURRENCY, CALL_HOME_SCOPE, callHomeCandidates, callHomeChance, callHomeCost,
  callHomeQuote, callHomeRoll, resolveCallHome
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

function testInternalOddsAreFarBetterThanExternal() {
  const inside = callHomeChance(CALL_HOME_SCOPE.INTERNAL);
  const outside = callHomeChance(CALL_HOME_SCOPE.EXTERNAL);
  assert.ok(inside > 0 && outside > 0, "both variants are possible");
  assert.ok(inside >= outside * 2.5, `internal (${inside}) must be dramatically likelier than external (${outside})`);
}

function testFeeIsPerAttemptedPointAndCurrencyAware() {
  const gold = callHomeCost(3, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD);
  const infl = callHomeCost(3, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.INFLUENCE);
  assert.equal(gold, 3 * CONFIG.callHomeGoldPerPoint, "gold scales with the people who came");
  assert.equal(infl, 3 * CONFIG.callHomeInfluencePerPoint, "influence is its own price");
  assert.notEqual(gold, infl, "the two currencies are genuinely different offers");
  const ext = callHomeCost(3, CALL_HOME_SCOPE.EXTERNAL, CALL_HOME_CURRENCY.GOLD);
  assert.ok(ext > gold, "calling people out of a rival's cities costs more");
  assert.equal(callHomeCost(0, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD), 0, "no points, no fee");
}

function testQuoteCapsAtTheAttemptLimit() {
  const q = callHomeQuote(ME, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD, FLOWS);
  assert.equal(q.available, 4, "four internal points are away");
  assert.equal(q.points, Math.min(4, CONFIG.callHomeMaxPointsPerAttempt), "capped per attempt");
  assert.equal(q.cost, callHomeCost(q.points, q.scope, CALL_HOME_CURRENCY.GOLD), "the fee matches the points");
}

function testYouPayOnlyForThoseWhoCome() {
  // The whole point of the rework: a call never charges for people who refused.
  const seen = [];
  const r = resolveCallHome(ME, CALL_HOME_SCOPE.EXTERNAL, CALL_HOME_CURRENCY.GOLD, {
    turn: 5, gameId: "g", flows: FLOWS,
    pay: (n) => { seen.push(n); return true; },
    move: () => true
  });
  assert.equal(r.ok, true);
  assert.ok(r.returned >= 1, "a call is never wasted: at least one comes home");
  assert.equal(seen.length, 1, "billed once");
  assert.equal(seen[0], callHomeCost(r.returned, CALL_HOME_SCOPE.EXTERNAL, CALL_HOME_CURRENCY.GOLD),
    "the bill is exactly the people who came, at the external rate");
}

function testACallIsNeverWasted() {
  // Even at odds of zero, somebody comes: no "full price, nobody came" outcome exists any more.
  const was = CONFIG.callHomeChanceExternal;
  CONFIG.callHomeChanceExternal = 0;
  let paid = 0;
  const r = resolveCallHome(ME, CALL_HOME_SCOPE.EXTERNAL, CALL_HOME_CURRENCY.GOLD, {
    turn: 9, gameId: "g", flows: FLOWS, pay: (n) => { paid = n; return true; }, move: () => true
  });
  CONFIG.callHomeChanceExternal = was;
  assert.equal(r.returned, 1, "the floor brings one person home");
  assert.equal(paid, callHomeCost(1, CALL_HOME_SCOPE.EXTERNAL, CALL_HOME_CURRENCY.GOLD), "and bills for one");
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
  const a = callHomeRoll("g|0|internal|Rome|Ostia|12|1", 0.5);
  const b = callHomeRoll("g|0|internal|Rome|Ostia|12|1", 0.5);
  assert.equal(a, b, "the same seed gives the same answer");
  assert.equal(callHomeRoll("x", 1), true, "chance 1 always returns them");
  assert.equal(callHomeRoll("x", 0), false, "chance 0 never does");
}

function testOddsActuallyDifferOverManyRolls() {
  // The point of the two variants: far more people come home from inside your own borders.
  const n = 3000;
  const hits = (chance) => {
    let k = 0;
    for (let i = 0; i < n; i++) if (callHomeRoll("seed|" + i, chance)) k++;
    return k / n;
  };
  const inside = hits(callHomeChance(CALL_HOME_SCOPE.INTERNAL));
  const outside = hits(callHomeChance(CALL_HOME_SCOPE.EXTERNAL));
  assert.ok(inside > outside * 2, `internal ${inside.toFixed(2)} vs external ${outside.toFixed(2)}`);
  assert.ok(Math.abs(inside - callHomeChance(CALL_HOME_SCOPE.INTERNAL)) < 0.06, "the roll matches its stated odds");
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
testInternalOddsAreFarBetterThanExternal();
testFeeIsPerAttemptedPointAndCurrencyAware();
testQuoteCapsAtTheAttemptLimit();
testYouPayOnlyForThoseWhoCome();
testACallIsNeverWasted();
testAThinTreasuryBringsBackWhatItCanAfford();
testNothingHappensWhenItCannotBePaid();
testNobodyToCall();
testRollIsSeededAndStable();
testOddsActuallyDifferOverManyRolls();
testDisabledOffersNothing();

console.log("call-home harness passed");
