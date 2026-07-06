// quarter-state.mjs
//
// The persistent per-tile Cultural Quarter store (emigration-quarter-state.js): one quarter per tile
// (no stacking / change-of-hands replacement), the per-age decision throttle (cap + cooldown), the
// contested flag, and defensive persistence normalization. Only a Configuration KV stub is needed.

import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => { KV[k] = v; } })
};
globalThis.Game = { age: 1, turn: 5 };

const state = await import("/emigration/ui/emigration-quarter-state.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const {
  quarterAt, putQuarter, dropQuarter, quartersForOwner,
  canDecide, noteDecision, setContested, saveQuarters, __test
} = state;

const rec = (civ, optionId) => ({
  civ, owner: 0, optionId, turn: 5,
  applied: { benefitYield: "YIELD_CULTURE", benefitAmount: 40, penaltyYield: "YIELD_HAPPINESS", penaltyAmount: 20 },
  contested: false, contestedTurn: -999
});

// ── put / get / owner listing ───────────────────────────────────────────────
{
  putQuarter("3,4", rec(2, "embrace"));
  assert.equal(quarterAt("3,4").civ, 2, "quarter is stored on its tile");
  assert.equal(quartersForOwner(0).length, 1, "owner listing finds the quarter");
  assert.equal(quartersForOwner(9).length, 0, "a different owner has none");
}

// ── no stacking: a different origin REPLACES the tile record ────────────────
{
  putQuarter("3,4", rec(7, "tax"));
  assert.equal(quarterAt("3,4").civ, 7, "a new origin replaces the tile record (no stacking)");
  assert.equal(quartersForOwner(0).length, 1, "still exactly one quarter on the tile");
}

// ── contested flag stamps the turn on the rising edge ───────────────────────
{
  setContested("3,4", true, 9);
  assert.equal(quarterAt("3,4").contested, true, "quarter marked contested");
  assert.equal(quarterAt("3,4").contestedTurn, 9, "contested turn stamped");
  setContested("3,4", true, 20);
  assert.equal(quarterAt("3,4").contestedTurn, 9, "already-contested keeps its original stamp");
  setContested("3,4", false, 25);
  assert.equal(quarterAt("3,4").contested, false, "quarter can be cleared of contest");
}

// ── drop ────────────────────────────────────────────────────────────────────
{
  dropQuarter("3,4");
  assert.equal(quarterAt("3,4"), null, "quarter can be removed from its tile");
}

// ── decision throttle: per-age cap + cooldown, reset on a new age ───────────
{
  const s = __test.readStateForTest();
  s.age = 1; s.count = 0; s.lastTurn = -999; // fresh throttle
  assert.ok(canDecide(100, 1), "first decision allowed");
  noteDecision(100);
  assert.ok(!canDecide(105, 1), "cooldown blocks a too-soon decision");
  assert.ok(canDecide(100 + CONFIG.quarterCooldownTurns, 1), "past the cooldown is allowed again");
  noteDecision(120); noteDecision(150);
  assert.ok(!canDecide(200, 1), "the per-age cap blocks further decisions");
  assert.ok(canDecide(220, 2), "a new age resets the cap");
}

// ── persistence: schema envelope + defensive normalization ──────────────────
{
  putQuarter("1,1", rec(4, "embrace"));
  saveQuarters();
  const blob = JSON.parse(KV.EmigrationQuarters_v1);
  assert.equal(blob.v, 1, "quarters state persisted with a schema envelope");
  assert.ok(blob.data && blob.data.tiles && blob.data.tiles["1,1"], "envelope includes the tile record");
  // A malformed record (missing civ) is dropped on normalization.
  assert.equal(__test.normalizeRecord({ owner: 0 }), null, "a record without a civ is rejected");
  const normalized = __test.normalizeState({ tiles: { "9,9": { civ: 3, owner: 0 }, bad: { owner: 1 } } });
  assert.ok(normalized.tiles["9,9"], "a valid record survives normalization");
  assert.ok(!normalized.tiles.bad, "an invalid record is dropped on normalization");
}

// ── candidacy (dwell-clock) store: put / get / drop / listing ────────────────
{
  const { candidacyAt, putCandidacy, dropCandidacy, allCandidacyEntries } = state;
  putCandidacy("5,6", { civ: 2, originCiv: "CIVILIZATION_ROME", since: 10, lastSeen: 10 });
  assert.equal(candidacyAt("5,6").civ, 2, "candidacy is stored on its tile");
  assert.equal(candidacyAt("5,6").since, 10, "the dwell clock's start is stored");
  assert.equal(allCandidacyEntries().some((e) => e.tileKey === "5,6"), true, "listing finds the candidacy");
  dropCandidacy("5,6");
  assert.equal(candidacyAt("5,6"), null, "candidacy can be removed");
}

// ── dwellSatisfied: gate on quarterDwellTurns since the streak began ─────────
{
  const { candidacyAt, putCandidacy, dwellSatisfied, dropCandidacy } = state;
  const savedDwell = CONFIG.quarterDwellTurns;
  CONFIG.quarterDwellTurns = 8;
  putCandidacy("7,7", { civ: 2, originCiv: "CIVILIZATION_ROME", since: 100, lastSeen: 100 });
  assert.equal(dwellSatisfied("7,7", "CIVILIZATION_ROME", 2, 107), false, "before the dwell window elapses, not offered");
  assert.equal(dwellSatisfied("7,7", "CIVILIZATION_ROME", 2, 108), true, "at the dwell window it becomes offerable");
  assert.equal(dwellSatisfied("7,7", "CIVILIZATION_GREECE", 9, 200), false, "a different origin does not satisfy this tile's clock");
  assert.equal(dwellSatisfied("nope", "CIVILIZATION_ROME", 2, 200), false, "no candidacy record → never satisfied");
  // legacy fallback: when a CivilizationType is unavailable, identity falls back to the raw origin id.
  putCandidacy("8,8", { civ: 5, originCiv: null, since: 0, lastSeen: 0 });
  assert.equal(dwellSatisfied("8,8", null, 5, 8), true, "legacy record matches by origin player id");
  assert.equal(dwellSatisfied("8,8", null, 6, 8), false, "a mismatched origin id does not satisfy");
  // dwell = 0 is legacy 'offer as soon as it forms'.
  CONFIG.quarterDwellTurns = 0;
  putCandidacy("9,1", { civ: 2, originCiv: "CIVILIZATION_ROME", since: 50, lastSeen: 50 });
  assert.equal(dwellSatisfied("9,1", "CIVILIZATION_ROME", 2, 50), true, "dwell 0 is satisfied the moment a candidacy exists");
  CONFIG.quarterDwellTurns = savedDwell;
  dropCandidacy("7,7"); dropCandidacy("8,8"); dropCandidacy("9,1");
}

// ── candidacy round-trips through the persistence envelope + normalization ───
{
  const { putCandidacy, saveQuarters, __test: st } = state;
  putCandidacy("2,3", { civ: 3, originCiv: "CIVILIZATION_HAN", since: 4, lastSeen: 6 });
  saveQuarters();
  const blob = JSON.parse(KV.EmigrationQuarters_v1);
  assert.ok(blob.data.candidacy && blob.data.candidacy["2,3"], "envelope includes the candidacy record");
  assert.equal(blob.data.candidacy["2,3"].since, 4, "the candidacy start persists");
  // A malformed candidacy record (no civ) is dropped on normalization.
  assert.equal(st.normalizeCandidacyRecord({ since: 1 }), null, "a candidacy without a civ is rejected");
  const normalized = st.normalizeState({ candidacy: { "1,2": { civ: 2, since: 3, lastSeen: 3 }, bad: { since: 1 } } });
  assert.ok(normalized.candidacy["1,2"], "a valid candidacy survives normalization");
  assert.ok(!normalized.candidacy.bad, "an invalid candidacy is dropped on normalization");
}

console.log("quarter-state harness passed");
