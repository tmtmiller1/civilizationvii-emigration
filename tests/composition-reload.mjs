// composition-reload.mjs
//
// The cross-context staleness guard for the ethnic-composition ledger. The recorder (gameplay
// context) and the readers (ethnicity lens, its hover tooltip, the city readout) run in SEPARATE V8
// contexts, each with its OWN module instance of emigration-composition.js, sharing state ONLY
// through the persisted GameConfiguration blob. A reader that cached its in-memory state forever
// would freeze on the city mix at its first paint/hover (typically near-mono early game) and never
// see the diaspora the recorder banks turn after turn, so immigration never shows on the lens.
//
// This simulates that split in ONE process: an in-memory GameConfiguration stands in for the shared
// blob, and a hand-rolled `Game.turn` drives the per-turn reload. We prove that once the recorder
// saves a multi-origin mix and the turn advances, a read reflects it (instead of the stale snapshot).

import assert from "node:assert/strict";

// ── Minimal engine stubs: a shared K/V config + a mutable turn clock ──────────────────────
let _turn = 1;
const _store = new Map();
globalThis.Game = { get turn() { return _turn; } };
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (_store.has(k) ? _store.get(k) : null) }),
  editGame: () => ({ setValue: (k, v) => { _store.set(k, v); } })
};

const { __test } = await import("/emigration/ui/emigration-composition.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
CONFIG.integrationEnabled = false; // isolate the reload behaviour from drift

const city = (x, y, name, owner, pop) => ({ city: { location: { x, y }, name }, owner, population: pop });
const shareOf = (comp, civ) => { const e = comp.civs.find((c) => c.civ === civ); return e ? e.share : 0; };

__test.reset();

// Turn 1: the recorder seeds a mono city (100% owner 0) and persists it.
_turn = 1;
__test.recordCompositionPass([city(1, 1, "H", 0, 10)], []);
let comp = __test.compositionForCity({ location: { x: 1, y: 1 } });
assert.equal(shareOf(comp, 0), 1, "turn 1: city reads 100% owner");

// A reader in ANOTHER context loaded this turn-1 snapshot and would cache it. We emulate that other
// context having since recorded an immigrant arrival and SAVED a richer blob to the shared config,
// without our in-memory state knowing. (Hand-write the blob the recorder would have produced: 9 owner
// + 1 origin-2, summing to the reconciled total.)
_store.set("EmigrationEthnos_v1", JSON.stringify({
  cities: { "1,1": { owner: 0, byCiv: { 0: 9, 2: 1 }, total: 10, name: "H", seenTurn: 2 } }
}));

// Still turn 1: a read MUST return the cached (stale) snapshot, no churn within a turn/pass.
comp = __test.compositionForCity({ location: { x: 1, y: 1 } });
assert.equal(shareOf(comp, 2), 0, "same turn: read stays on the cached snapshot (no mid-pass reload)");

// Turn advances → the next read reloads the shared blob and now SEES the immigrant (the fix).
_turn = 2;
comp = __test.compositionForCity({ location: { x: 1, y: 1 } });
assert.ok(shareOf(comp, 2) > 0, "turn advanced: reader picks up the recorder's newer save");
assert.equal(Math.round(shareOf(comp, 2) * 100), 10, "immigrant origin reads its real 10% share");

console.log("composition-reload harness passed");
