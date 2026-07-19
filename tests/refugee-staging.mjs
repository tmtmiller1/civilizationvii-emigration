// Pins the per-city refugee SETTLEMENT budget's border throttle: Anti-Immigration slows how fast a
// closed civ drains its holding pool, floored on the SAME `opennessFloor` the pull path uses (not the
// old hard-coded 0.25). See emigration-refugee-staging.js:refugeeSettlementBudget.
import assert from "node:assert/strict";

// Stub the Culture / policy surface emigration-borders.js reads (same shape as tests/borders.mjs).
let ACTIVE = {}; // pid → Set of active tradition hashes
globalThis.Players = {
  get: (pid) => ({
    Culture: { isTraditionActive: (h) => !!(ACTIVE[pid] && ACTIVE[pid].has(h)) }
  })
};
globalThis.Database = { makeHash: (s) => "H_" + s };

const { resetBorderCache } = await import("/emigration/ui/emigration-borders.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { __test } = await import("/emigration/ui/emigration-refugee-staging.js");

const CLOSED = "H_TRADITION_EMIG_CLOSED_BORDERS_MODERN";

// A content, uncrowded host so only the border throttle shapes the budget: base × 1 (happyScale) × openness.
CONFIG.refugeePoolEnabled = true;
CONFIG.refugeePoolSettlePerCityPerTurn = 20; // large base so the floor difference survives Math.floor
CONFIG.refugeePoolHappyScale = 1;
CONFIG.overcrowdThreshold = 100; // sig.urban below → no overcrowd penalty
CONFIG.bordersEnabled = true;
CONFIG.opennessFloor = 0.15;

const closedSig = { owner: 3, happiness: 0, urban: 0 };
ACTIVE[3] = new Set([CLOSED]);

// A1: openness tuned BELOW the floor (0.05) → immigrationOpenness floors to 0.15, and the staging
// budget now uses that same 0.15 (was 0.25 under the old hard-coded floor). 20 × 0.15 = 3 (not 5).
CONFIG.closedBordersOpenness = 0.05;
resetBorderCache();
assert.equal(
  __test.refugeeSettlementBudget(closedSig),
  3,
  "closed-borders settle budget floors on opennessFloor (0.15), not the old 0.25"
);

// A2: openness BETWEEN the two floors (0.20) passes through unclamped → 20 × 0.20 = 4 (old: 20 × 0.25 = 5).
CONFIG.closedBordersOpenness = 0.2;
resetBorderCache();
assert.equal(
  __test.refugeeSettlementBudget(closedSig),
  4,
  "an openness between 0.15 and 0.25 is honoured, not lifted to 0.25"
);

// A3: at the default openness (0.4, above both floors) the floor is inert — 20 × 0.4 = 8.
CONFIG.closedBordersOpenness = 0.4;
resetBorderCache();
assert.equal(
  __test.refugeeSettlementBudget(closedSig),
  8,
  "default openness sits above both floors → unchanged by the floor fix"
);

CONFIG.bordersEnabled = false;
console.log("refugee-staging budget floor harness passed");
