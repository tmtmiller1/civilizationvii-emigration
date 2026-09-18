import assert from "node:assert/strict";

// With no engine globals (Locale/GameInfo/Players absent), the naming module must fall
// back to readable English - the deterministic path we can assert here.
const {
  refugeeHeadline,
  disasterName,
  civAdjective,
  civName,
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
  assert.equal(civName(0), "a people"); // civ NAME variant falls back the same way off-engine
}

function testActionHintFallsBackToSharedHint() {
  // No Locale → the LOC lookup fails and we fall back to the shared English causeHint.
  assert.match(actionHint("war"), /fighting/i);
  assert.match(actionHint("war"), /pillaged/i); // names the lever the violence model actually reads
  assert.match(actionHint("unhappiness"), /happiness/i);
  assert.equal(actionHint(undefined), ""); // no cause → no hint
}

function testActionHintNeverLeaksAnUnfilledPlaceholder() {
  // A hint that names the settlement must fill it; with no name to give (the verbose per-cause toast
  // aggregates across cities) it switches to the city-less variant instead of printing "{1_City}".
  for (const cause of ["unhappiness", "prosperity", "war", "disaster", "conquest", "attrition", "return"]) {
    assert.doesNotMatch(actionHint(cause), /\{\d+_/, cause + " (no city)");
    assert.doesNotMatch(actionHint(cause, "Rome"), /\{\d+_/, cause + " (city)");
  }
  assert.match(actionHint("prosperity", "Rome"), /Rome/);
  assert.match(actionHint("unhappiness", "Rome"), /Rome/);
  assert.doesNotMatch(actionHint("prosperity"), /Rome/);
}

function testHintsCarryNoModelJargon() {
  // The hints are player text: no internal-model vocabulary (the old disaster hint read "subsides on its
  // own as the distress decays").
  for (const cause of ["unhappiness", "prosperity", "war", "disaster", "conquest", "attrition", "return"]) {
    assert.doesNotMatch(actionHint(cause, "Rome"), /distress|decay|outflow|displacement|pressure/i, cause);
  }
}

function testStanceTipOnlyWhenTheCallerAsks() {
  const base = { cause: "unhappiness", people: "12,000 people", city: "Rome", crossCiv: true, destName: "Carthage" };
  assert.doesNotMatch(localDigestMessage(base), /Anti-Immigration/);
  const tipped = localDigestMessage({ ...base, stanceTip: true });
  assert.match(tipped, /Anti-Immigration Stance/);
  assert.match(tipped, /\(External Move\)$/); // the scope tag still closes the message
}

function testPermanenceCueSelection() {
  assert.equal(permanenceCue("war"), ""); // temporary cue dropped (the action hint already implies it)
  assert.equal(permanenceCue("disaster"), "");
  assert.equal(permanenceCue("unhappiness"), "Migrants will continue to leave until you address the cause."); // persistent
  assert.equal(permanenceCue("attrition"), "Those people are gone for good."); // permanent
}

function testLossHeadlineNamesCauseAndCity() {
  assert.match(lossHeadline("unhappiness", "12,000 people", "Rome"), /Rome/);
  assert.match(lossHeadline("war", "5,000 people", "Akrotiri"), /Akrotiri/);
  assert.match(lossHeadline("attrition", "3,000 people", "Ur"), /casualties/);
  assert.match(lossHeadline("attrition", "3,000 people", "Ur"), /Ur/);
}

function testCostNote() {
  assert.match(costNote("Carthage", 3), /Carthage/);
  assert.match(costNote("Carthage", 3), /3/);
}

function testLocalDigestComposesAndGatesCostNote() {
  const base = { cause: "unhappiness", people: "12,000 people", city: "Rome" };
  const msg = localDigestMessage(base);
  assert.match(msg, /Rome/); // headline
  assert.match(msg, /happiness/i); // hint
  // The hint already conveys how durable the loss is, so the digest no longer repeats a permanence line.
  assert.doesNotMatch(msg, /continue to leave until/i);
  assert.doesNotMatch(msg, /pays about/); // no cross-civ cost note
  // Cross-civ loss with a material destination cost → the cost note is appended.
  const withCost = localDigestMessage({ ...base, crossCiv: true, destName: "Carthage", destGold: 4 });
  assert.match(withCost, /Carthage pays about 4/);
  // Below the materiality floor (gold < 1) → no cost note.
  const noCost = localDigestMessage({ ...base, crossCiv: true, destName: "Carthage", destGold: 0 });
  assert.doesNotMatch(noCost, /pays about/);
}

function testLocalDigestNamesDestinationAndTagsScope() {
  const base = { cause: "prosperity", people: "12,000 people", city: "Rome" };
  // An internal prosperity move reads as one flowing sentence naming the neighbor (not a separate
  // "Bound for …" clause) and is still tagged as an internal move.
  const internal = localDigestMessage({ ...base, crossCiv: false, destName: "Neapolis" });
  assert.match(internal, /for its more prosperous neighbor, Neapolis\./);
  assert.doesNotMatch(internal, /Bound for/);
  assert.match(internal, /\(Internal Move\)$/);
  assert.doesNotMatch(internal, /\(External Move\)/);
  // A cross-civ prosperity move reads with the SAME one-sentence neighbor pattern as internal (no
  // separate "Bound for …" clause) and is tagged as an external move.
  const external = localDigestMessage({ ...base, crossCiv: true, destName: "Carthage" });
  assert.match(external, /for its more prosperous neighbor, Carthage\./);
  assert.doesNotMatch(external, /Bound for/);
  assert.match(external, /\(External Move\)$/);
  assert.doesNotMatch(external, /\(Internal Move\)/);
  // A death (attrition) went nowhere → no destination clause and no scope tag.
  const death = localDigestMessage({ cause: "attrition", people: "3,000 people", city: "Ur", destName: "Ur" });
  assert.doesNotMatch(death, /Bound for/);
  assert.doesNotMatch(death, /\((Internal|External) Move\)/);
  // A move with no resolved destination → no destination clause (no dangling "Bound for .").
  const noDest = localDigestMessage({ ...base, crossCiv: false });
  assert.doesNotMatch(noDest, /Bound for/);
}

function testConquestNamesTheConqueror() {
  // Conquest names the CONQUERING civ (its "destination" is the captured city itself), not a "to <dest>".
  const msg = localDigestMessage({ cause: "conquest", people: "4,000 people", city: "Veii",
    crossCiv: true, destName: "Veii", byCiv: "Rome" });
  assert.match(msg, /were captured when Veii was conquered by Rome\./);
  assert.doesNotMatch(msg, /to Veii/); // never "captured from Veii to Veii"
  // No conqueror resolved → the plain capture headline, still no dangling destination.
  const noBy = localDigestMessage({ cause: "conquest", people: "4,000 people", city: "Veii", crossCiv: true });
  assert.doesNotMatch(noBy, /conquered by/);
  assert.doesNotMatch(noBy, /Bound for/);
}

testHeadlineFallbacks();
testDisasterNameFallback();
testCivAdjectiveFallback();
testActionHintFallsBackToSharedHint();
testActionHintNeverLeaksAnUnfilledPlaceholder();
testHintsCarryNoModelJargon();
testStanceTipOnlyWhenTheCallerAsks();
testPermanenceCueSelection();
testLossHeadlineNamesCauseAndCity();
testCostNote();
testLocalDigestComposesAndGatesCostNote();
testLocalDigestNamesDestinationAndTagsScope();
testConquestNamesTheConqueror();
console.log("naming harness passed");

// ── an unknown player id never reaches the engine's independent-power lookup (a native crash, 2026-09-13) ──
{
  const oldGame = globalThis.Game, oldPlayers = globalThis.Players;
  let asked = 0;
  globalThis.Game = { ...(oldGame || {}), IndependentPowers: { independentName: () => { asked++; return "LOC_X"; } } };
  globalThis.Players = { get: (pid) => (pid === 1 ? { isMajor: false, isMinor: true } : null) };
  const { civAdjective } = await import("/emigration/ui/emigration-naming.js");
  civAdjective(99);
  assert.equal(asked, 0, "no engine lookup for a player that does not exist");
  civAdjective(1);
  assert.ok(asked >= 1, "a real minor player is still named through the engine");
  globalThis.Game = oldGame; globalThis.Players = oldPlayers;
}
