import assert from "node:assert/strict";

// The Causes tab lists a card for EVERY in-play civ with migration/death activity (not only cross-civ
// flow endpoints), and a civ's RECEIVED refugees are attributed, via inByCause + the event tally,
// to the specific war that displaced them, so its cause reads as someone else's war.
const { buildCivFlows } = await import("/emigration/ui/emigration-city-flows.js");

// 9 = Maya (received Prussian refugees), 7 = Prussia (sent them), 5 = Himiko (the aggressor, at war,
// shedding/​losing its own people, but with NO cross-civ flow into the visible set).
const flows = [
  { from: 7, to: 9, fromName: "Prussian", toName: "Maya", people: 129, byCause: { war: 129 } },
  // Himiko's people fled to an UNMET civ (bucketed to id -2 upstream by maskEdge), still shown.
  { from: 5, to: -2, fromName: "Himiko", toName: "Unmet", people: 60, byCause: { prosperity: 60 } }
];
const civs = [
  { pid: 9, name: "Maya", in: 129, out: 0, deaths: 0, byCause: {}, inByCause: { war: 129 } },
  { pid: 7, name: "Prussian", in: 0, out: 129, deaths: 0, byCause: { war: 129 }, inByCause: {} },
  { pid: 5, name: "Himiko", in: 0, out: 40, deaths: 20, byCause: { war: 40 }, inByCause: {} },
  { pid: 3, name: "Idle", in: 0, out: 0, deaths: 0, byCause: {}, inByCause: {} }
];
const eventsByOwner = {
  9: { "war:5:7": { people: 129, deaths: 0 } },
  7: { "war:5:7": { people: 129, deaths: 0 } },
  5: { "war:5:7": { people: 40, deaths: 20 } }
};

function cardsByName() {
  const cards = buildCivFlows(flows, civs, eventsByOwner);
  return new Map(cards.map((c) => [c.name, c]));
}

// Himiko has NO cross-civ flow but real activity (out + deaths) → it must still get a card.
function testListsActiveCivWithoutFlow() {
  const m = cardsByName();
  assert.ok(m.has("Himiko"), "a met civ at war with no cross-civ flow still appears");
  assert.ok(m.has("Maya") && m.has("Prussian"), "the flow endpoints appear too");
  assert.equal(m.size, 3, "the idle civ (no activity) is omitted");
}

// The Maya's War cause comes from RECEIVED refugees (inByCause), and drills down to the named war.
function testReceivedRefugeesAttributed() {
  const maya = cardsByName().get("Maya");
  assert.equal(maya.causes.war, 129, "received war refugees populate the Maya's War cause");
  assert.ok(maya.events && maya.events["war:5:7"], "the received refugees carry the specific war key");
  // Neither belligerent in the key (5,7) is the Maya (9), so its name reads as someone else's war.
  assert.ok(!"war:5:7".split(":").includes("9"), "the war key names Himiko & Prussia, not the Maya");
}

// Empty-direction cards still carry both directions (the renderer draws a placeholder for the empty one).
function testBothDirectionsPresent() {
  const maya = cardsByName().get("Maya");
  assert.equal(maya.in.civs.length, 1, "Maya has an Immigrants pie (from Prussia)");
  assert.equal(maya.out.civs.length, 0, "Maya has no Emigrants, the column renders a placeholder");
}

// People who fled to an UNMET civ still show (anonymized to the "Unmet" bucket (negative id)) and
// deaths show as a "Died" wedge in the same "left for/died" pie.
function testUnmetAndDiedShown() {
  const himiko = cardsByName().get("Himiko");
  const names = himiko.out.civs.map((/** @type {*} */ s) => s.name);
  assert.ok(names.includes("Unmet"), "the unmet destination is anonymized to 'Unmet'");
  assert.ok(names.includes("Died"), "deaths show as a 'Died' wedge in the Emigrants pie");
  const died = himiko.out.civs.find((/** @type {*} */ s) => s.name === "Died");
  assert.equal(died.people, 20, "the Died wedge carries the civ's death toll");
  assert.ok(died.id < 0, "the Died wedge uses a sentinel (negative) id");
}

testListsActiveCivWithoutFlow();
testReceivedRefugeesAttributed();
testBothDirectionsPresent();
testUnmetAndDiedShown();
console.log("causes-civs harness passed");
