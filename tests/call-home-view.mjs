// call-home-view.mjs
//
// The "call our people home" dialog (emigration-call-home-view.js): the internal and external variants must
// read as different offers, name the cities involved, price every button with the currency icon, and only
// offer what the treasury covers.
import assert from "node:assert/strict";

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { CALL_HOME_CURRENCY, CALL_HOME_SCOPE, callHomeCost } = await import("/emigration/ui/emigration-call-home.js");
const { callHomeView, parseChoice, GOLD_ICON, INFLUENCE_ICON } =
  await import("/emigration/ui/emigration-call-home-view.js");

const ME = 0;
const THEM = 3;
const OTHERS = 5;
const FLOWS = [
  { src: ME, dest: ME, srcCity: "Rome", destCity: "Ostia", points: 4, byCause: { war: 400 } },
  { src: ME, dest: THEM, srcCity: "Rome", destCity: "Carthage", points: 3, byCause: { war: 300 } }
];
const MANY = FLOWS.concat([
  { src: ME, dest: ME, srcCity: "Veii", destCity: "Neapolis", points: 2, byCause: { disaster: 200 } },
  { src: ME, dest: OTHERS, srcCity: "Veii", destCity: "Athens", points: 1, byCause: { war: 100 } }
]);
const CIVS = { [THEM]: "Carthage", [OTHERS]: "Greece" };
const civ = (pid) => CIVS[pid] || "?";
const rich = () => Infinity;
const G = CALL_HOME_CURRENCY.GOLD;
const I = CALL_HOME_CURRENCY.INFLUENCE;
const perGold = CONFIG.callHomeGoldPerPoint;
const perInfl = CONFIG.callHomeInfluencePerPoint;

function testInternalIsAPurchaseThatNamesBothCities() {
  const v = callHomeView(ME, CALL_HOME_SCOPE.INTERNAL, { flows: FLOWS, afford: rich, civ });
  assert.ok(v, "somebody is callable");
  assert.equal(v.eyebrow, "From our own settlements");
  assert.equal(v.title, "Call our people home");
  assert.ok(v.body.includes("driven out of Rome") && v.body.includes("live in Ostia"), "names where from and where to: " + v.body);
  assert.ok(v.body.includes("every one we call will come"), "reads as a certainty");
  assert.ok(!/chance|%/.test(v.body), "no odds on a purchase");
  assert.deepEqual(v.details, ["4 from Ostia back to Rome"], "the pair is listed with everyone away, not the per-call cap");
  const ids = v.choices.map((c) => c.id);
  assert.deepEqual(ids, ["0:1", "0:2", "0:3", "1:1", "1:2", "1:3", "no"], "a ladder of sizes per currency, then leave");
  const gold = (n) => callHomeCost(n, CALL_HOME_SCOPE.INTERNAL, G);
  const infl = (n) => callHomeCost(n, CALL_HOME_SCOPE.INTERNAL, I);
  assert.equal(v.choices[0].label, `Bring one home for ${GOLD_ICON} ${perGold}`);
  assert.equal(v.choices[1].label, `Bring 2 home for ${GOLD_ICON} ${gold(2)}`);
  assert.equal(v.choices[2].label, `Bring 3 home for ${GOLD_ICON} ${gold(3)}`);
  assert.deepEqual([gold(1), gold(2), gold(3)], [60, 170, 312], "the convex ladder, not 60/120/180");
  assert.equal(v.choices[3].label, `Bring one home for ${INFLUENCE_ICON} ${perInfl}`);
  assert.equal(v.choices[5].label, `Bring 3 home for ${INFLUENCE_ICON} ${infl(3)}`);
  assert.equal(v.dismissId, "no");
  assert.ok(v.choices.slice(0, 6).every((c) => /Exactly this many come home/.test(c.note)), "each size is a promise");
}

function testInternalGreysOutWhatTheTreasuryCannotCover() {
  const goldHave = callHomeCost(2, CALL_HOME_SCOPE.INTERNAL, G) + 5;
  const afford = (c) => (c === G ? goldHave : perInfl - 1);
  const v = callHomeView(ME, CALL_HOME_SCOPE.INTERNAL, { flows: FLOWS, afford, civ });
  assert.deepEqual(v.choices.map((c) => c.id), ["0:1", "0:2", "0:3", "1:1", "1:2", "1:3", "no"],
    "every size stays in the list whatever the balance");
  assert.deepEqual(v.choices.map((c) => !!c.disabled), [false, false, true, true, true, true, false],
    "the sizes the treasury cannot cover are greyed out; leaving never is");
  const gold3 = v.choices[2];
  assert.equal(gold3.note, `Not enough Gold: this needs ${callHomeCost(3, CALL_HOME_SCOPE.INTERNAL, G)} and we have ${goldHave}.`,
    "the greyed size says how short the treasury is");
  assert.equal(v.choices[3].note, `Not enough Influence: this needs ${perInfl} and we have ${perInfl - 1}.`);
  assert.ok(/Exactly this many/.test(v.choices[0].note), "an affordable size keeps its promise");
  const poor = callHomeView(ME, CALL_HOME_SCOPE.INTERNAL, { flows: FLOWS, afford: () => 0, civ });
  assert.ok(poor.choices.slice(0, 6).every((c) => c.disabled), "nothing affordable greys every size");
  assert.ok(!poor.choices[6].disabled, "leaving them is always possible");
  assert.equal(poor.details[poor.details.length - 1],
    `Not enough to call even one home: ${GOLD_ICON} ${perGold} or ${INFLUENCE_ICON} ${perInfl}.`);
  const fractional = callHomeView(ME, CALL_HOME_SCOPE.INTERNAL, { flows: FLOWS, afford: () => perGold - 0.4, civ });
  assert.ok(/we have \d+\.$/.test(fractional.choices[0].note), "a fractional treasury is shown whole: " + fractional.choices[0].note);
}

function testInternalWithSeveralPairsListsThemAll() {
  const v = callHomeView(ME, CALL_HOME_SCOPE.INTERNAL, { flows: MANY, afford: rich, civ });
  assert.ok(v.body.includes("other settlements of ours"), "the prose goes general: " + v.body);
  assert.ok(!v.body.includes("Ostia"), "no single city is singled out in the prose");
  assert.deepEqual(v.details, ["4 from Ostia back to Rome", "2 from Neapolis back to Veii"], "richest pair first");
  assert.equal(v.choices[2].id, "0:3", "the ladder still stops at the per-call cap");
}

function testExternalIsAGambleThatNamesTheForeignRuler() {
  const v = callHomeView(ME, CALL_HOME_SCOPE.EXTERNAL, { flows: FLOWS, afford: rich, civ });
  assert.ok(v, "somebody is callable abroad");
  assert.equal(v.eyebrow, "From foreign cities");
  assert.equal(v.title, "Call our people back from abroad");
  const pct = Math.round(CONFIG.callHomeChanceExternal * 100);
  assert.ok(v.body.includes("driven out of Rome") && v.body.includes("live in Carthage, a city of Carthage"),
    "names the city and its ruler: " + v.body);
  assert.ok(v.body.includes(`${pct}% chance`) && v.body.includes("may bring nobody") && v.body.includes("paid for either way"),
    "states the odds, the risk, and that the fee is spent regardless");
  assert.ok(!v.body.includes("will come"), "no promise is made");
  assert.deepEqual(v.details, ["3 from Carthage (Carthage) back to Rome"]);
  const ext = (n) => callHomeCost(n, CALL_HOME_SCOPE.EXTERNAL, G);
  assert.deepEqual(v.choices.map((c) => c.id), ["0:1", "0:2", "0:3", "1:1", "1:2", "1:3", "no"], "the same ladder of sizes as inside");
  assert.equal(v.choices[0].label, `Call one home for ${GOLD_ICON} ${ext(1)}`);
  assert.equal(v.choices[2].label, `Call 3 home for ${GOLD_ICON} ${ext(3)}`);
  assert.deepEqual([ext(1), ext(2), ext(3)], [90, 255, 468], "scaled up from the internal ladder");
  assert.equal(v.choices[5].label, `Call 3 home for ${INFLUENCE_ICON} ${callHomeCost(3, CALL_HOME_SCOPE.EXTERNAL, I)}`);
  assert.ok(v.choices.slice(0, 6).every((c) => c.note.includes(`${pct}% chance`) && /paid for either way/.test(c.note)),
    "every size says it is odds, paid regardless");
}

function testExternalGreysOutWhatTheTreasuryCannotCover() {
  const one = callHomeCost(1, CALL_HOME_SCOPE.EXTERNAL, G);
  const v = callHomeView(ME, CALL_HOME_SCOPE.EXTERNAL, { flows: FLOWS, afford: (c) => (c === G ? one + 1 : 0), civ });
  assert.deepEqual(v.choices.map((c) => !!c.disabled), [false, true, true, true, true, true, false],
    "gold covers a call for one; every other size is greyed");
  assert.equal(v.choices[0].label, `Call one home for ${GOLD_ICON} ${one}`);
  assert.ok(/^Not enough Gold/.test(v.choices[1].note));
}

function testTheTwoVariantsCannotBeMistaken() {
  const a = callHomeView(ME, CALL_HOME_SCOPE.INTERNAL, { flows: FLOWS, afford: rich, civ });
  const b = callHomeView(ME, CALL_HOME_SCOPE.EXTERNAL, { flows: FLOWS, afford: rich, civ });
  assert.notEqual(a.eyebrow, b.eyebrow);
  assert.notEqual(a.title, b.title);
  assert.notEqual(a.body, b.body);
  assert.equal(a.choices.length, b.choices.length, "both offer the same ladder of sizes");
  assert.ok(a.choices[0].label.startsWith("Bring") && b.choices[0].label.startsWith("Call"), "but the verb differs: a purchase brings, a gamble calls");
  assert.notEqual(a.choices[0].note, b.choices[0].note, "and the notes say why");
  assert.ok(b.choices[0].label.endsWith(String(callHomeCost(1, CALL_HOME_SCOPE.EXTERNAL, G))) && callHomeCost(1, CALL_HOME_SCOPE.EXTERNAL, G) > callHomeCost(1, CALL_HOME_SCOPE.INTERNAL, G), "abroad is dearer at the same size");
}

function testNobodyCallableGivesNoDialog() {
  assert.equal(callHomeView(ME, CALL_HOME_SCOPE.INTERNAL, { flows: [], afford: rich, civ }), null);
  assert.equal(callHomeView(THEM, CALL_HOME_SCOPE.EXTERNAL, { flows: FLOWS, afford: rich, civ }), null);
}

function testEachDialogCarriesAHomecomingEpigraph() {
  const a = callHomeView(ME, CALL_HOME_SCOPE.INTERNAL, { flows: FLOWS, afford: rich, civ });
  const b = callHomeView(ME, CALL_HOME_SCOPE.EXTERNAL, { flows: FLOWS, afford: rich, civ });
  for (const v of [a, b]) {
    assert.equal(typeof v.quote, "string");
    assert.ok(v.quote.startsWith("\"") && v.quote.length > 40, "a quoted line with an attribution: " + v.quote);
  }
  const given = callHomeView(ME, CALL_HOME_SCOPE.INTERNAL, { flows: FLOWS, afford: rich, civ, quote: "\"x\" y" });
  assert.equal(given.quote, "\"x\" y", "an injected epigraph is used as is");
  const s1 = callHomeView(ME, CALL_HOME_SCOPE.INTERNAL, { flows: FLOWS, afford: rich, civ, seed: "t1" }).quote;
  const s2 = callHomeView(ME, CALL_HOME_SCOPE.INTERNAL, { flows: FLOWS, afford: rich, civ, seed: "t1" }).quote;
  assert.equal(s1, s2, "one seed always gives one quote");
}

function testChoiceIdsRoundTrip() {
  assert.deepEqual(parseChoice("0:2"), { currency: G, want: 2 });
  assert.deepEqual(parseChoice("1:3"), { currency: I, want: 3 });
  assert.equal(parseChoice("no"), null);
  assert.equal(parseChoice("7:1"), null, "an unknown currency is not a call");
  assert.equal(parseChoice("0:0"), null, "zero people is not a call");
  assert.equal(parseChoice(undefined), null);
}

testInternalIsAPurchaseThatNamesBothCities();
testInternalGreysOutWhatTheTreasuryCannotCover();
testInternalWithSeveralPairsListsThemAll();
testExternalIsAGambleThatNamesTheForeignRuler();
testExternalGreysOutWhatTheTreasuryCannotCover();
testTheTwoVariantsCannotBeMistaken();
testNobodyCallableGivesNoDialog();
testEachDialogCarriesAHomecomingEpigraph();
testChoiceIdsRoundTrip();

console.log("call-home-view harness passed");
