// migration-stats-reload.mjs
//
// The cross-context staleness guard for the migration tallies (§23). The recorder (gameplay context)
// and the readers (City Details Departing/Arriving, the Demographics graphs, the feedback layer) run
// in SEPARATE V8 contexts, each with its OWN module instance of emigration-migration-stats.js,
// sharing the tallies ONLY through the persisted GameConfiguration blob. A reader that cached `_s`
// for the module lifetime would freeze on the tallies as of its first read, so City Details could
// show a frozen Departing/Arriving list beside a Population-origins block that stays fresh (that one
// reloads per turn; see composition-reload.mjs).
//
// This simulates the split in ONE process: an in-memory GameConfiguration stands in for the shared
// blob and a hand-rolled `Game.turn` drives the per-turn reload. We prove that (1) within a turn the
// cached state is reused (no mid-pass churn), (2) once the turn advances a read reflects the other
// context's newer save, and (3) the reload does NOT rewind the per-sample watermarks, which live only
// in memory in a reader context and would otherwise replay flow the graphs had already charted.

import assert from "node:assert/strict";

// ── Minimal engine stubs: a shared K/V config + a mutable turn clock ──────────────────────
let _turn = 1;
const _store = new Map();
globalThis.Game = { get turn() { return _turn; } };
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (_store.has(k) ? _store.get(k) : null) }),
  editGame: () => ({ setValue: (k, v) => { _store.set(k, v); } })
};

const { recordMigrations, sampleOut, netDeltaForPlayer } = await import(
  "/emigration/ui/emigration-migration-stats.js"
);

const STATE_KEY = "EmigrationMigStats_v1";
const stored = () => JSON.parse(_store.get(STATE_KEY));

// Turn 1: this context records a departure and persists it.
recordMigrations([{ srcOwner: 0, destOwner: 1, people: 1000, crossCiv: true }]);
assert.equal(stored().out[0], 1000, "turn 1: the departure is persisted");

// Another context has since recorded more migration and SAVED a richer blob, without this instance
// knowing. Hand-write the blob that context would have produced (its own cumulative tallies).
const other = stored();
other.out[0] = 3000;
other.in[1] = 3000;
other.cum[0] = -3000;
other.cum[1] = 3000;
_store.set(STATE_KEY, JSON.stringify(other));

// Still turn 1: reads MUST stay on the cached snapshot (no mid-pass churn).
assert.equal(sampleOut(0), 1000, "same turn: the cached tally is reused, and this read banks its watermark");

// Turn advances → the next read reloads the shared blob and sees the other context's newer tally.
_turn = 2;
// sampleOut is a DELTA against the watermark banked above (1000). Seeing 2000 proves both halves of
// the fix: the reload picked up the 3000 cumulative, and it carried the watermark forward instead of
// rewinding it to the persisted 0 (which would replay the full 3000).
assert.equal(sampleOut(0), 2000, "turn advanced: reader sees the newer tally, watermark not rewound");
assert.equal(sampleOut(0), 0, "the reloaded delta is consumed once");

// A cumulative read reflects the other context's save too.
assert.equal(netDeltaForPlayer(1), 3000, "turn advanced: net picks up the other context's arrivals");

// An unreadable store on a turn tick must not wipe live tallies (the recorder mid-pass case).
_turn = 3;
_store.delete(STATE_KEY);
recordMigrations([{ srcOwner: 0, destOwner: 1, people: 500, crossCiv: true }]);
assert.equal(stored().out[0], 3500, "empty store on a turn tick keeps the in-memory tallies");

console.log("migration-stats-reload harness passed");
