// composition-stamp.mjs
//
// Ethnicity audit items O1 and O4 step 1, on the ledger.
//
// O1: a reader that loaded the ledger in turn N BEFORE the recorder's pass for turn N saved must not keep the
// previous turn's mix for the rest of turn N. The recorder bumps a pass stamp (its own configuration key) on every
// save, and readers key their cache on turn + stamp. Simulated as in composition-reload.mjs: one module instance,
// with the other context's save written straight into the shared configuration store.
//
// O4 step 1: a settlement the ledger first meets already conquered (a captured city first seen after the capture,
// a mid-game install, a save from before the ledger) seeds as its ORIGINAL owner's people when that owner is a
// major civ, not as 100% the conqueror. A minor original owner (a captured city-state) still seeds as the owner.

import assert from "node:assert/strict";

let _turn = 1;
const _store = new Map();
globalThis.Game = { get turn() { return _turn; } };
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (_store.has(k) ? _store.get(k) : null) }),
  editGame: () => ({ setValue: (k, v) => { _store.set(k, v); } })
};
const PLAYERS = { 0: { isMajor: true }, 5: { isMajor: true }, 19: { isMajor: false, isMinor: true } };
globalThis.Players = { get: (id) => PLAYERS[id] || null };

const { __test, compositionVersion } = await import("/emigration/ui/emigration-composition.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
CONFIG.integrationEnabled = false;

const STATE_KEY = "EmigrationEthnos_v1";
const STAMP_KEY = "EmigrationEthnosStamp_v1";
const sig = (x, y, name, owner, pop, originalOwner) =>
  ({ city: { location: { x, y }, name, originalOwner }, owner, population: pop });
const shareOf = (comp, civ) => { const e = comp && comp.civs.find((c) => c.civ === civ); return e ? e.share : 0; };

// ── O1 ────────────────────────────────────────────────────────────────────────────────────
__test.reset();
_turn = 1;
__test.recordCompositionPass([sig(1, 1, "H", 0, 10)], []);
const s1 = _store.get(STAMP_KEY);
assert.ok(s1 != null, "a recorder save writes the pass stamp");
const v1 = compositionVersion();
assert.equal(shareOf(__test.compositionForCity({ location: { x: 1, y: 1 } }), 2), 0, "reader caches turn 1's mix");

// The other context's recorder saves this turn's pass AFTER the reader cached: a richer blob and a new stamp.
_store.set(STATE_KEY, JSON.stringify({ cities: { "1,1": { owner: 0, byCiv: { 0: 9, 2: 1 }, total: 10, name: "H", seenTurn: 1 } }, passTurn: 1 }));
_store.set(STAMP_KEY, String(Number(s1) + 1));
assert.notEqual(compositionVersion(), v1, "the version moves with the stamp");
assert.equal(Math.round(shareOf(__test.compositionForCity({ location: { x: 1, y: 1 } }), 2) * 100), 10,
  "same turn, new stamp: the reader picks up the pass that saved after it cached");

// A second save bumps the stamp again.
__test.recordCompositionPass([sig(1, 1, "H", 0, 10)], []);
assert.equal(_store.get(STAMP_KEY), String(Number(s1) + 2), "every save bumps the stamp");

// ── O4 step 1 ─────────────────────────────────────────────────────────────────────────────
__test.reset();
_turn = 5;
__test.recordCompositionPass([
  sig(2, 2, "Madrid", 0, 8, 5), // taken by 0 from major 5 before the ledger first saw it
  sig(3, 3, "Monte Alban", 0, 6, 19), // a captured city-state
  sig(4, 4, "Paris", 0, 7, 0), // founded by its owner
  sig(6, 6, "Ghost", 0, 4, 77) // an original owner the engine cannot resolve
], []);
const at = (x, y) => __test.compositionForCity({ location: { x, y } });
assert.equal(shareOf(at(2, 2), 5), 1, "a conquered city first seen now seeds as its original major owner");
assert.equal(at(2, 2).owner, 0, "while its owner is the conqueror");
assert.equal(shareOf(at(3, 3), 0), 1, "a captured city-state still seeds as the conqueror");
assert.equal(shareOf(at(4, 4), 0), 1, "a city founded by its owner seeds as the owner");
assert.equal(shareOf(at(6, 6), 0), 1, "an unresolvable original owner seeds as the owner");

console.log("composition-stamp: all assertions passed");
