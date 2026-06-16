import assert from "node:assert/strict";

// With no engine globals (Locale/GameInfo/Players absent), the naming module must fall
// back to readable English - the deterministic path we can assert here.
const {
  refugeeHeadline,
  disasterName,
  civAdjective,
  actionHint,
  permanenceCue,
  lossHeadline,
  costNote,
  localDigestMessage
} = await import("/emigration/ui/emigration-naming.js");

function testHeadlineFallbacks() {
  assert.match(refugeeHeadline({ cause: "disaster", eventName: "Thera", people: "80,000 people" }), /Thera/);
  assert.match(refugeeHeadline({ cause: "war", warName: "Roman War", people: "12,000 people" }), /Roman/);
  assert.match(refugeeHeadline({ cause: "conquest", cityName: "Rome", people: "5,000 people" }), /Rome/);
  assert.match(refugeeHeadline({ cause: "unhappiness", cityName: "Carthage", people: "1,000 people" }), /Carthage/);
}

function testDisasterNameFallback() {
  assert.equal(disasterName(123), "a disaster"); // GameInfo absent → generic
}

function testCivAdjectiveFallback() {
  assert.equal(civAdjective(0), "a people"); // Players absent → generic
}

function testActionHintFallsBackToSharedHint() {
  // No Locale → the LOC lookup fails and we fall back to the shared English causeHint.
  assert.match(actionHint("war"), /peace|siege/i);
  assert.match(actionHint("unhappiness"), /happiness/i);
  assert.equal(actionHint(undefined), ""); // no cause → no hint
}

function testPermanenceCueSelection() {
  assert.equal(permanenceCue("war"), "The pressure is temporary."); // temporary
  assert.equal(permanenceCue("disaster"), "The pressure is temporary.");
  assert.equal(permanenceCue("unhappiness"), "It continues until you address the cause."); // persistent
  assert.equal(permanenceCue("attrition"), "Those people are gone for good."); // permanent
}

function testLossHeadlineNamesCauseAndCity() {
  assert.match(lossHeadline("unhappiness", "12 thousand people", "Rome"), /Rome/);
  assert.match(lossHeadline("war", "5,000 people", "Akrotiri"), /Akrotiri/);
  assert.match(lossHeadline("attrition", "3,000 people", "Ur"), /nowhere to flee/);
}

function testCostNote() {
  assert.match(costNote("Carthage", 3), /Carthage/);
  assert.match(costNote("Carthage", 3), /3/);
}

function testLocalDigestComposesAndGatesCostNote() {
  const base = { cause: "unhappiness", people: "12 thousand people", city: "Rome" };
  const msg = localDigestMessage(base);
  assert.match(msg, /Rome/); // headline
  assert.match(msg, /happiness/i); // hint
  assert.match(msg, /continues until/i); // permanence cue
  assert.doesNotMatch(msg, /pays about/); // no cross-civ cost note
  // Cross-civ loss with a material destination cost → the cost note is appended.
  const withCost = localDigestMessage({ ...base, crossCiv: true, destName: "Carthage", destGold: 4 });
  assert.match(withCost, /Carthage pays about 4/);
  // Below the materiality floor (gold < 1) → no cost note.
  const noCost = localDigestMessage({ ...base, crossCiv: true, destName: "Carthage", destGold: 0 });
  assert.doesNotMatch(noCost, /pays about/);
}

testHeadlineFallbacks();
testDisasterNameFallback();
testCivAdjectiveFallback();
testActionHintFallsBackToSharedHint();
testPermanenceCueSelection();
testLossHeadlineNamesCauseAndCity();
testCostNote();
testLocalDigestComposesAndGatesCostNote();
console.log("naming harness passed");
