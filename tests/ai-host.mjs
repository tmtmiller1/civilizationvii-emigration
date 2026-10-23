import assert from "node:assert/strict";

// AI hosts' choices (emigration-ai-host.js): the enclave stance (let be at war or under an Anti-Immigration
// card, else the affordable stance paying the leader's favoured yield, else the first affordable one) and the
// refugee decision (away at war, welcome under the congestion bar, frontier over it with a smaller
// settlement, away otherwise; an option the host cannot pay for is skipped). Plus the dilemma state carrying
// each AI host's own throttle across a reload.

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { AI_CONGESTION_BAR, aiRefugeeChoice, chooseAiStance } = await import("/emigration/ui/emigration-ai-host.js");
const { __test } = await import("/emigration/ui/emigration-dilemma.js");

const HOST = 3;
const ORIGIN = 5;
const OPTIONS = [
  { id: "a", benefitYield: "YIELD_SCIENCE" },
  { id: "b", benefitYield: "YIELD_CULTURE" },
  { id: "ignore", benefitYield: null }
];

function stanceDeps(over = {}) {
  return { atWar: () => false, stance: () => null, affordable: () => true, favour: () => null, ...over };
}

function testStance() {
  assert.equal(chooseAiStance(HOST, ORIGIN, OPTIONS, stanceDeps()), "a", "first affordable by default");
  assert.equal(chooseAiStance(HOST, ORIGIN, OPTIONS, stanceDeps({ favour: () => "YIELD_CULTURE" })), "b",
    "the leader's favoured yield wins");
  assert.equal(chooseAiStance(HOST, ORIGIN, OPTIONS, stanceDeps({ favour: () => "YIELD_GOLD" })), "a",
    "a favoured yield nobody pays falls back to the first affordable");
  assert.equal(chooseAiStance(HOST, ORIGIN, OPTIONS, stanceDeps({ atWar: (h, o) => h === HOST && o === ORIGIN })),
    "ignore", "at war with the homeland: let be");
  assert.equal(chooseAiStance(HOST, ORIGIN, OPTIONS, stanceDeps({ stance: () => "suspect" })), "ignore",
    "an Anti-Immigration card slotted: let be");
  assert.equal(chooseAiStance(HOST, ORIGIN, OPTIONS, stanceDeps({ stance: () => "protect" })), "a",
    "a Pro-Immigration card changes nothing");
  assert.equal(chooseAiStance(HOST, ORIGIN, OPTIONS, stanceDeps({ affordable: (o) => o.id === "b" })), "b",
    "only what it can pay for");
  assert.equal(chooseAiStance(HOST, ORIGIN, OPTIONS, stanceDeps({ affordable: () => false })), "ignore",
    "nothing affordable: let be");
  assert.equal(chooseAiStance(HOST, ORIGIN, [], stanceDeps()), "ignore");
}

const CAP = { owner: HOST, population: 12, city: "capital" };
const TOWN = { owner: HOST, population: 4, city: "town" };

function refugeeDeps(over = {}) {
  return { atWar: () => false, congestion: () => 0, gold: () => 1000, influence: () => 1000, ...over };
}

function testRefugees() {
  CONFIG.dilemmaGoldWelcome = 100;
  CONFIG.dilemmaGoldFrontier = 50;
  CONFIG.dilemmaInfluenceAway = 30;
  let r = aiRefugeeChoice(HOST, ORIGIN, [CAP, TOWN], refugeeDeps());
  assert.deepEqual(r, { id: "welcome", city: CAP }, "calm, rich, under the bar: welcome into the capital");
  r = aiRefugeeChoice(HOST, ORIGIN, [CAP, TOWN], refugeeDeps({ congestion: () => AI_CONGESTION_BAR }));
  assert.deepEqual(r, { id: "frontier", city: TOWN }, "over the bar with a smaller settlement: frontier");
  r = aiRefugeeChoice(HOST, ORIGIN, [CAP], refugeeDeps({ congestion: () => AI_CONGESTION_BAR + 1 }));
  assert.deepEqual(r, { id: "away", city: null }, "over the bar, one city: turn them away");
  r = aiRefugeeChoice(HOST, ORIGIN, [CAP, TOWN], refugeeDeps({ atWar: () => true }));
  assert.deepEqual(r, { id: "away", city: null }, "at war with the refugees' civ: away");
  r = aiRefugeeChoice(HOST, ORIGIN, [CAP, TOWN], refugeeDeps({ atWar: () => true, influence: () => 10 }));
  assert.equal(r, null, "at war but cannot pay the Influence: no decision");
  r = aiRefugeeChoice(HOST, ORIGIN, [CAP, TOWN], refugeeDeps({ gold: () => 60 }));
  assert.deepEqual(r, { id: "frontier", city: TOWN }, "cannot pay to welcome, can pay the frontier");
  r = aiRefugeeChoice(HOST, ORIGIN, [CAP], refugeeDeps({ gold: () => 60 }));
  assert.equal(r, null, "under the bar, one city, cannot pay to welcome: nothing");
  r = aiRefugeeChoice(HOST, ORIGIN, [CAP, TOWN], refugeeDeps({ gold: () => 10, congestion: () => 5, influence: () => 5 }));
  assert.equal(r, null, "over the bar and broke: nothing");
  assert.equal(aiRefugeeChoice(HOST, ORIGIN, [], refugeeDeps()), null, "no city: nothing");
}

function testThrottleState() {
  const ai = __test.normalizeAi({ "3": { age: 1, count: 2, lastTurn: 40 }, x: { count: 1 }, "4": "bad", "5": {} });
  assert.deepEqual(ai, { "3": { age: 1, count: 2, lastTurn: 40 }, "5": { age: 0, count: 0, lastTurn: -999 } },
    "numeric keys with clean throttles survive, the rest is dropped");
  assert.deepEqual(__test.normalizeAi(null), {});
  // A persisted blob without `ai` loads with an empty map, and the map round-trips through persist.
  KV.EmigrationDilemma_v1 = JSON.stringify({ v: 2, data: { spree: {}, age: 0, count: 0, lastTurn: -999 } });
  let s = __test.readStateForTest();
  assert.deepEqual(s.ai, {}, "a save from before AI hosts decided loads with no throttles");
  s.ai["7"] = { age: 0, count: 1, lastTurn: 12 };
  __test.persistStateForTest();
  assert.deepEqual(JSON.parse(KV.EmigrationDilemma_v1).data.ai, { "7": { age: 0, count: 1, lastTurn: 12 } });
}

testStance();
testRefugees();
testThrottleState();
console.log("ai-host passed");
