// Unit test for the carried dividend (§1b ; the assimilation mirror) in emigration-effects.js:
// accrual on arrival, per-turn decay + grant, idempotency within a turn, stacking, and the cap.
import assert from "node:assert/strict";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import {
  addAttractionDividend,
  tickAttractionDividend,
  dividendFor
} from "/emigration/ui/emigration-dividend.js";

let TURN = 1;
globalThis.Game = {
  get turn() {
    return TURN;
  }
};
const KV = {
  EmigrationDividend_v1: JSON.stringify({
    pool: { "99:YIELD_GOLD": 2.5, bad: -3 },
    tickedTurn: { "99": 4, x: "bad" }
  })
};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.YieldTypes = { YIELD_SCIENCE: 1, YIELD_CULTURE: 2, YIELD_GOLD: 3 };
const grants = [];
globalThis.Players = { grantYield: (pid, yt, amt) => grants.push({ pid, yt, amt }) };

Object.assign(CONFIG, { dividendPerMigrant: 1.5, dividendDecay: 0.7, dividendCap: 12 });
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: got ${a}, expected ≈ ${b}`);
const PID = 5;

// Legacy pool should load for unrelated pid as a migration sanity check.
close(dividendFor(99, "YIELD_GOLD"), 2.5, "legacy pool migration");

// Turn 1, a migrant arrives under Talent: accrue 1.5 into the Science pool, seed the clock.
addAttractionDividend(PID, "YIELD_SCIENCE", CONFIG.dividendPerMigrant);
close(dividendFor(PID, "YIELD_SCIENCE"), 1.5, "accrued pool");

// No grant on the accrual turn (elapsed 0).
assert.deepEqual(tickAttractionDividend(PID), {}, "no grant on accrual turn");
assert.equal(grants.length, 0, "no grant yet");

// Turn 2, decay 1.5 × 0.7 = 1.05, grant 1.05 Science.
TURN = 2;
close(tickAttractionDividend(PID).YIELD_SCIENCE, 1.05, "turn-2 grant");
assert.equal(grants.length, 1, "one grant");
assert.equal(grants[0].yt, 1, "granted Science yield");
close(grants[0].amt, 1.05, "grant amount");

// Idempotent within a turn, re-tick turn 2 grants nothing more.
assert.deepEqual(tickAttractionDividend(PID), {}, "idempotent within a turn");
assert.equal(grants.length, 1, "still one grant");

// Turn 3, decay again 1.05 × 0.7 = 0.735.
TURN = 3;
close(tickAttractionDividend(PID).YIELD_SCIENCE, 0.735, "turn-3 grant");

// A second migrant stacks onto the (decayed) pool.
addAttractionDividend(PID, "YIELD_SCIENCE", 1.5);
close(dividendFor(PID, "YIELD_SCIENCE"), 0.735 + 1.5, "stacked pool");

// Cap, a huge pool grants at most dividendCap per turn.
addAttractionDividend(PID, "YIELD_GOLD", 100);
TURN = 4;
const g4 = tickAttractionDividend(PID);
assert.ok(g4.YIELD_GOLD <= CONFIG.dividendCap + 1e-9, "gold capped at dividendCap");
close(g4.YIELD_GOLD, CONFIG.dividendCap, "gold grant equals the cap");

const persisted = JSON.parse(KV["EmigrationDividend_v1"]);
assert.equal(persisted.v, 2, "dividend state should persist as schema envelope");
assert.ok(persisted.data && persisted.data.pool, "envelope should include data.pool");

console.log("dividend harness passed");

delete globalThis.Configuration;
