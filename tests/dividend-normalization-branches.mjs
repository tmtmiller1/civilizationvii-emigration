import assert from "node:assert/strict";

const KEY = "EmigrationDividend_v1";
let TURN = 5;
const kv = {
  [KEY]: JSON.stringify({
    v: 2,
    data: {
      pool: {
        "10:YIELD_GOLD": 3,
        "": 9,
        "10:YIELD_CULTURE": -1,
        "10:YIELD_SCIENCE": 0,
        junk: "x"
      },
      tickedTurn: {
        "10": 3.9,
        "11": -2,
        broken: "bad"
      }
    }
  })
};

globalThis.Game = {
  get turn() {
    return TURN;
  }
};

globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in kv ? kv[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (kv[k] = v) })
};

const grants = [];
globalThis.YieldTypes = { YIELD_SCIENCE: 1, YIELD_CULTURE: 2, YIELD_GOLD: 3 };
globalThis.Players = { grantYield: (pid, yt, amt) => grants.push({ pid, yt, amt }) };

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
Object.assign(CONFIG, { dividendDecay: 0.5, dividendCap: 9 });

const {
  addAttractionDividend,
  tickAttractionDividend,
  dividendFor
} = await import("/emigration/ui/emigration-dividend.js");

assert.equal(dividendFor(10, "YIELD_GOLD"), 3, "valid legacy value should survive normalization");
assert.equal(dividendFor(10, "YIELD_CULTURE"), 0, "non-positive values should be dropped");
assert.equal(dividendFor("bad", "YIELD_GOLD"), 0, "invalid pid should be guarded");
assert.deepEqual(tickAttractionDividend("bad"), {}, "invalid tick pid should no-op");
assert.deepEqual(tickAttractionDividend(99), {}, "unknown pid should no-op");

// Normal grant path.
const g1 = tickAttractionDividend(10);
assert.ok(g1.YIELD_GOLD > 0, "normalized carry should grant");
assert.ok(grants.length >= 1, "grant callback should run");

// Guarded accrual inputs.
assert.equal(addAttractionDividend("x", "YIELD_SCIENCE", 1), 0);
assert.equal(addAttractionDividend(10, "YIELD_SCIENCE", 0), 0);

// grant catch path: callback throws, should never bubble.
globalThis.Players.grantYield = () => {
  throw new Error("grant boom");
};
addAttractionDividend(10, "YIELD_CULTURE", 1);
TURN += 1;
assert.doesNotThrow(() => tickAttractionDividend(10));

// grant skip path: missing YieldTypes mapping.
globalThis.YieldTypes = {};
addAttractionDividend(10, "YIELD_GOLD", 1);
TURN += 1;
assert.doesNotThrow(() => tickAttractionDividend(10));

// Small pool drop path (< 0.05 after decay).
Object.assign(CONFIG, { dividendDecay: 0.01 });
addAttractionDividend(10, "YIELD_SCIENCE", 1);
TURN += 1;
const dropped = tickAttractionDividend(10);
assert.equal(dropped.YIELD_SCIENCE ?? 0, 0, "tiny pool should be culled without grant");

const persisted = JSON.parse(kv[KEY]);
assert.equal(persisted.v, 2);
assert.ok(persisted.data && persisted.data.pool && persisted.data.tickedTurn);

delete globalThis.Game;
delete globalThis.Configuration;
delete globalThis.YieldTypes;
delete globalThis.Players;

console.log("dividend-normalization-branches harness passed");
