// dilemma.mjs
//
// Refugee-dilemma decision logic (emigration-dilemma.js) + its prompt prose (emigration-narrative.js).
// No engine globals: the modal + effects are exercised in-game; here we test the pure trigger/throttle
// logic and the prose. The plague trigger reads the crisis cache, which the event-attribution test
// hook can set.

import assert from "node:assert/strict";
const KV = {
  EmigrationDilemma_v1: JSON.stringify({
    spree: {
      "2": [
        { turn: 10, victim: 3, points: 2 },
        { turn: 11, victim: "bad", points: 1 }
      ]
    },
    age: 1,
    count: 2,
    lastTurn: 50
  })
};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

const { __test } = await import("/emigration/ui/emigration-dilemma.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const attribution = await import("/emigration/ui/emigration-event-attribution.js");
const { dilemmaPrompt } = await import("/emigration/ui/emigration-narrative.js");
const { recordCaptures, canFire, detectConquestDilemma, detectPlagueDilemma } = __test;

const capture = (prevOwner, newOwner, points) => ({ prevOwner, newOwner, name: "City", points });

// ── persistence: legacy state migrates + v2 envelope writes ─────────────────
{
  const s = __test.readStateForTest();
  assert.equal(s.age, 1, "legacy persisted age should load");
  assert.equal(s.count, 2, "legacy persisted count should load");
  assert.equal((s.spree["2"] || []).length, 1, "invalid spree rows should be dropped on load");
  __test.persistStateForTest();
  const persisted = JSON.parse(KV["EmigrationDilemma_v1"]);
  assert.equal(persisted.v, 2, "dilemma state should be persisted with schema envelope");
  assert.ok(persisted.data && persisted.data.spree, "envelope should include data.spree");
}

// ── recordCaptures: per-aggressor spree, pruned to the window ───────────────
{
  const s = { spree: {} };
  recordCaptures(s, [capture(3, 2, 2), capture(4, 2, 1)], 100); // civ 2 takes two cities at turn 100
  assert.equal(s.spree["2"].length, 2, "captures tracked per aggressor");
  recordCaptures(s, [capture(5, 2, 1)], 100 + CONFIG.dilemmaWindowTurns + 1); // window has passed
  assert.equal(s.spree["2"].length, 1, "stale captures pruned, only the fresh one remains");
}

// ── canFire: per-age cap + cooldown, cap resets on a new age ────────────────
{
  const s = { age: 0, count: 0, lastTurn: -999 };
  assert.ok(canFire(s, 50, 0), "first dilemma allowed");
  s.count = CONFIG.dilemmaMaxPerAge;
  s.lastTurn = 50;
  assert.ok(!canFire(s, 50 + CONFIG.dilemmaCooldownTurns + 1, 0), "blocked once the per-age cap is hit");
  // A new age resets the cap; the cooldown still applies, so use a turn past it.
  assert.ok(canFire(s, 50 + CONFIG.dilemmaCooldownTurns + 1, 1), "a new age resets the cap");
  assert.equal(s.count, 0, "the count was reset on the age change");
  s.count = 1; s.lastTurn = 60;
  assert.ok(!canFire(s, 61, 1), "blocked while inside the cooldown");
}

// ── detectConquestDilemma: a neighbour's spree, victims fleeing toward you ──
{
  const me = 1;
  const s = { spree: { 2: [{ turn: 90, victim: 3, points: 2 }, { turn: 95, victim: 3, points: 1 }, { turn: 99, victim: 3, points: 2 }] } };
  const d = detectConquestDilemma(s, me);
  assert.equal(d.kind, "conquest");
  assert.equal(d.instigator, 2, "the aggressor");
  assert.equal(d.origin, 3, "the victim whose people flee");
  assert.equal(d.points, 5, "the wave scale sums the spree");
  // Below the spree threshold → no dilemma.
  assert.equal(detectConquestDilemma({ spree: { 2: [{ turn: 99, victim: 3, points: 1 }] } }, me), null,
    "a single capture is not a spree");
  // Your own conquests, or your own fall, are not a bystander's dilemma.
  assert.equal(detectConquestDilemma({ spree: { 1: [{ turn: 99, victim: 3, points: 1 }, { turn: 99, victim: 3, points: 1 }, { turn: 99, victim: 3, points: 1 }] } }, me), null,
    "your own spree does not prompt you");
}

// ── detectPlagueDilemma: needs an active plague crisis + a wave from a neighbour ──
{
  const me = 1;
  attribution.__test.setCrisis(null);
  assert.equal(detectPlagueDilemma([{ cause: "disaster", srcOwner: 3, points: 4 }], me), null,
    "no crisis → no plague dilemma");
  attribution.__test.setCrisis({ type: "MODERN_CRISIS_PLAGUE", category: "disaster" });
  const d = detectPlagueDilemma([
    { cause: "disaster", srcOwner: 3, points: 4 },
    { cause: "disaster", srcOwner: 1, points: 9 }, // the local player's own losses are excluded
    { cause: "war", srcOwner: 4, points: 9 } // non-disaster excluded
  ], me);
  assert.equal(d.kind, "plague");
  assert.equal(d.origin, 3, "the stricken neighbour's survivors");
  attribution.__test.setCrisis(null);
}

// ── prompts: prose composes, names framed for unmet, no em dashes ───────────
{
  const met = { adj: "Roman", framed: false };
  const unmet = { adj: "Norse", framed: true };
  const conquest = dilemmaPrompt({ kind: "conquest", instigator: unmet, origin: met, people: "120,000", seed: "x" });
  assert.ok(conquest.title.length && conquest.body.includes("120,000"), "conquest prompt composes with the count");
  assert.ok(conquest.body.includes("we have heard called the Norse"), "an unmet instigator is framed as hearsay");
  const plague = dilemmaPrompt({ kind: "plague", instigator: met, origin: met, people: "40,000", seed: "y" });
  assert.ok(plague.title === "The Sick at the Gates" && plague.body.includes("Roman"), "plague prompt composes");
  assert.ok(!(conquest.body + plague.body + conquest.title).includes("—"), "no em dashes in dilemma prose");
}

console.log("dilemma harness passed");

delete globalThis.Configuration;
