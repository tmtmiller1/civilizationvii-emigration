// quarter-dwell.mjs
//
// The enclave PERSISTENCE (dwell) gate: observeQuarterDwell tracks a per-tile clock for the local
// player's established enclaves each pass, and candidateFromSignal refuses to OFFER a decision until the
// enclave has persisted for quarterDwellTurns. Driven end-to-end through the real composition ledger
// (seeded via its __test surface) so establishedQuarterForCity fires on a genuine foreign majority. A
// Configuration KV stub (no gameSeed → no cache reset) backs quarter-state persistence.

import assert from "node:assert/strict";

// Non-persisting Configuration: both ledgers run off their in-memory caches here, so a per-block
// composition reset() reloads a clean (empty) slate instead of stale persisted data from a prior block.
globalThis.Configuration = {
  getGame: () => ({ getValue: () => null }),
  editGame: () => ({ setValue: () => {} })
};
globalThis.Game = { age: 1, turn: 100 };
globalThis.GameContext = { localPlayerID: 0 };

const comp = await import("/emigration/ui/emigration-composition.js");
const stateMod = await import("/emigration/ui/emigration-quarter-state.js");
const quarter = await import("/emigration/ui/emigration-quarter.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { establishedQuarterForCity } = await import("/emigration/ui/emigration-diaspora.js");

const { observeQuarterDwell, candidateFromSignal } = quarter.__test;
const { candidacyAt } = stateMod;

// Deterministic composition (no per-turn integration drift) + a known dwell/grace window.
CONFIG.integrationEnabled = false;
CONFIG.quartersEnabled = true;
CONFIG.quarterEstablishedShare = 0.35;
CONFIG.quarterMinStock = 5;
CONFIG.quarterDwellTurns = 8;
CONFIG.quarterDwellGrace = 2;

/** A city signal with a stable centre location. */
const sig = (x, y, name, owner, population) => ({ city: { location: { x, y }, name }, owner, population });

/** Reset both ledgers so each block starts clean. */
function clearState() {
  comp.__test.reset();
  const s = stateMod.__test.readStateForTest();
  s.tiles = {};
  s.candidacy = {};
}

/** Seed an owner-0 city whose lead FOREIGN origin (civ `foreign`) holds `foreign`/(host+foreign) share. */
function seedForeignMajority(x, y, name, hostPts, foreign, foreignPts) {
  comp.__test.recordCompositionPass([sig(x, y, name, 0, hostPts), sig(90, 90, "Home", foreign, foreignPts + 50)], []);
  comp.__test.recordCompositionPass(
    [sig(x, y, name, 0, hostPts + foreignPts, ), sig(90, 90, "Home", foreign, 50)],
    [{ srcOwner: foreign, srcName: "Home", destOwner: 0, destName: name, points: foreignPts, cause: "opportunity" }]
  );
}

// ── the ledger genuinely reports an established foreign enclave (test-setup sanity) ──
{
  clearState();
  seedForeignMajority(1, 1, "Athens", 10, 2, 10); // 10 civ0 + 10 civ2 → civ2 = 50%, stock 10
  const q = establishedQuarterForCity({ location: { x: 1, y: 1 }, name: "Athens" });
  assert.ok(q && q.civ === 2, "civ 2 is the established foreign enclave");
  assert.ok(q.share >= 0.35 && q.stock >= 5, "it clears the share + stock bar");
}

// ── clock starts on first sighting; no offer until the dwell window elapses ──
{
  clearState();
  seedForeignMajority(1, 1, "Athens", 10, 2, 10);
  const athens = sig(1, 1, "Athens", 0, 20);
  observeQuarterDwell([athens], 0, 100);
  assert.equal(candidacyAt("1,1").since, 100, "the dwell clock starts the turn the enclave is first seen");
  assert.equal(candidateFromSignal(athens, 0, 100), null, "no offer on the turn it forms (dwell not met)");
  assert.equal(candidateFromSignal(athens, 0, 107), null, "still no offer one turn short of the window");
}

// ── the same origin persisting KEEPS its clock start; offer fires at the window ──
{
  clearState();
  seedForeignMajority(1, 1, "Athens", 10, 2, 10);
  const athens = sig(1, 1, "Athens", 0, 20);
  observeQuarterDwell([athens], 0, 100);
  observeQuarterDwell([athens], 0, 105); // same origin, mid-window
  assert.equal(candidacyAt("1,1").since, 100, "a persisting enclave keeps its original clock start");
  assert.equal(candidacyAt("1,1").lastSeen, 105, "last-seen advances to the current pass");
  const cand = candidateFromSignal(athens, 0, 108);
  assert.ok(cand && cand.tileKey === "1,1" && cand.quarter.civ === 2, "at the dwell window the decision is offered");
}

// ── a DIFFERENT origin overtaking the tile restarts the clock ──
{
  clearState();
  seedForeignMajority(1, 1, "Athens", 10, 2, 10);
  const athens0 = sig(1, 1, "Athens", 0, 20);
  observeQuarterDwell([athens0], 0, 100); // civ 2 clock starts at 100
  // Civ 3 pours in and overtakes: 10 civ0 + 10 civ2 + 15 civ3 → civ3 is the lead foreign origin.
  comp.__test.recordCompositionPass([sig(1, 1, "Athens", 0, 20), sig(80, 80, "Xian", 3, 30)], []); // seed source
  comp.__test.recordCompositionPass([sig(1, 1, "Athens", 0, 35), sig(80, 80, "Xian", 3, 15)],
    [{ srcOwner: 3, srcName: "Xian", destOwner: 0, destName: "Athens", points: 15, cause: "opportunity" }]);
  const athens1 = sig(1, 1, "Athens", 0, 35);
  const q = establishedQuarterForCity({ location: { x: 1, y: 1 }, name: "Athens" });
  assert.equal(q.civ, 3, "civ 3 is now the lead foreign origin");
  observeQuarterDwell([athens1], 0, 120);
  assert.equal(candidacyAt("1,1").civ, 3, "the candidacy now names the new origin");
  assert.equal(candidacyAt("1,1").since, 120, "the clock restarts when a different origin overtakes the tile");
}

// ── a lapsed enclave is pruned once it stays below the bar past the grace window ──
{
  clearState();
  seedForeignMajority(1, 1, "Athens", 10, 2, 10);
  const athens = sig(1, 1, "Athens", 0, 20);
  observeQuarterDwell([athens], 0, 108); // clock present, lastSeen 108
  assert.ok(candidacyAt("1,1"), "candidacy exists while established");
  // Athens' host population balloons; every foreign origin falls below the share bar (no longer established).
  comp.__test.recordCompositionPass([sig(1, 1, "Athens", 0, 200)], []);
  assert.equal(establishedQuarterForCity({ location: { x: 1, y: 1 }, name: "Athens" }), null, "no longer established");
  observeQuarterDwell([athens], 0, 110); // 110 - 108 = 2 ≤ grace → a brief dip is forgiven
  assert.ok(candidacyAt("1,1"), "a dip within the grace window does not drop the clock");
  observeQuarterDwell([athens], 0, 111); // 111 - 108 = 3 > grace → pruned
  assert.equal(candidacyAt("1,1"), null, "past the grace window the lapsed clock is pruned");
}

console.log("quarter-dwell harness passed");
