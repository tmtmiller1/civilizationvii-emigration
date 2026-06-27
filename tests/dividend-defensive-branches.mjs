import assert from "node:assert/strict";

const KEY = "EmigrationDividend_v1";

let throwTurn = true;
globalThis.Game = {
  get turn() {
    if (throwTurn) throw new Error("turn unreadable");
    return 8;
  }
};

// getGame throw path should be swallowed by module load path.
globalThis.Configuration = {
  getGame: () => {
    throw new Error("config unavailable");
  },
  editGame: () => ({ setValue: () => {} })
};

const { addAttractionDividend, tickAttractionDividend, dividendFor } = await import(
  "/emigration/ui/emigration-dividend.js"
);

assert.equal(dividendFor(1, "YIELD_GOLD"), 0, "failed load should fall back to empty state");
assert.deepEqual(tickAttractionDividend(1), {}, "no baseline should no-op");

// gameTurn catch path in accrual baseline.
assert.equal(addAttractionDividend(1, "YIELD_SCIENCE", 2), 2);
throwTurn = false;
assert.doesNotThrow(() => tickAttractionDividend(1));

// divPersist should tolerate editGame failures.
globalThis.Configuration = {
  getGame: () => ({ getValue: () => null }),
  editGame: () => {
    throw new Error("persist unavailable");
  }
};
assert.doesNotThrow(() => addAttractionDividend(2, "YIELD_GOLD", 1));

// dividendFor guard branch.
assert.equal(dividendFor(null, "YIELD_GOLD"), 0);

delete globalThis.Game;
delete globalThis.Configuration;

console.log("dividend-defensive-branches harness passed");
