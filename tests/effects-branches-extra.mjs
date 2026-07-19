import assert from "node:assert/strict";

const KEY = "EmigrationAssim_v1";
let TURN = 20;
const kv = {
  [KEY]: "{bad-json"
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

globalThis.YieldTypes = { YIELD_HAPPINESS: 1, YIELD_GOLD: 2 };
const grants = [];
globalThis.Players = {
  grantYield: (pid, yt, amt) => grants.push({ pid, yt, amt }),
  get: (pid) => ({ Treasury: { goldBalance: 500 } })
};

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
Object.assign(CONFIG, {
  assimilationLoadPerMigrant: 1,
  assimilationCostPerPop: 0,
  assimilationDecay: 0.5,
  assimilationHappiness: 1,
  assimilationGold: 1,
  assimilationWealthWeight: 0,
  congestWeight: 0
});

const {
  deduct,
  addAssimilationLoad,
  tickAssimilation,
  assimLoadFor,
  assimilationCostFor,
  congestionPenalty,
  applyQuarterYields,
  reverseQuarterYields
} = await import("/emigration/ui/emigration-effects.js");

// deduct guards
assert.doesNotThrow(() => deduct(1, "YIELD_GOLD", 0));
assert.doesNotThrow(() => deduct(1, "YIELD_GOLD", 1));
assert.equal(grants.length, 0);

// invalid load input + added<=0 branch
CONFIG.assimilationLoadPerMigrant = 0;
assert.equal(addAssimilationLoad(2, 5), 0);
CONFIG.assimilationLoadPerMigrant = 1;
assert.equal(addAssimilationLoad("x", 5), 0);

// bad persisted JSON falls back to empty state, then normal accrual/tick
assert.equal(addAssimilationLoad(2, 5), 1);
assert.equal(assimLoadFor("bad"), 0);
assert.deepEqual(assimilationCostFor("bad"), { load: 0, happiness: 0, gold: 0 });

// elapsed <= 0 path
const sameTurn = tickAssimilation(2);
assert.equal(sameTurn.happiness, 0);
assert.equal(sameTurn.gold, 0);

// normal tick path
TURN += 1;
const t1 = tickAssimilation(2);
assert.ok(t1.load > 0);
assert.ok(t1.happiness > 0);
assert.ok(t1.gold > 0);
assert.ok(grants.some((g) => g.amt < 0));

// wealth multiplier: weight>0 and getGoldBalance fallback
CONFIG.assimilationWealthWeight = 1;
CONFIG.assimilationWealthRef = 100;
CONFIG.assimilationWealthMin = 0.5;
CONFIG.assimilationWealthMax = 2;
globalThis.Players.get = () => ({ Treasury: { getGoldBalance: () => 10000 } });
assert.equal(addAssimilationLoad(3, 5), 1);
TURN += 1;
const rich = tickAssimilation(3);
assert.equal(rich.gold, 1, "wealth multiplier should clamp upward at max");

// wealth multiplier: poor treasury clamps down to min
globalThis.Players.get = () => ({ Treasury: { goldBalance: 0 } });
assert.equal(addAssimilationLoad(31, 5), 1);
TURN += 1;
const poor = tickAssimilation(31);
assert.equal(poor.gold, 0.25, "wealth multiplier should clamp downward at min");

// wealth multiplier: unreadable treasury -> neutral multiplier 1
CONFIG.assimilationWealthWeight = 1;
globalThis.Players.get = () => {
  throw new Error("treasury unavailable");
};
assert.equal(addAssimilationLoad(4, 5), 1);
TURN += 1;
assert.doesNotThrow(() => tickAssimilation(4));

// persist catch path
const prior = globalThis.Configuration;
globalThis.Configuration = {
  getGame: () => ({ getValue: () => null }),
  editGame: () => {
    throw new Error("persist unavailable");
  }
};
assert.doesNotThrow(() => addAssimilationLoad(5, 3));
TURN += 1;
assert.doesNotThrow(() => tickAssimilation(5));
globalThis.Configuration = prior;

// load fade drop path
CONFIG.assimilationDecay = 0.001;
assert.equal(addAssimilationLoad(6, 5), 1);
TURN += 1;
const faded = tickAssimilation(6);
assert.deepEqual(faded, { load: 0, happiness: 0, gold: 0 });

// congestion guards and positive path
CONFIG.congestWeight = 0;
assert.equal(congestionPenalty(2, 10), 0);

// quarter one-time yields apply with exact signs and reverse exactly mirrors them
grants.length = 0;
globalThis.YieldTypes.YIELD_CULTURE = 3;
const quarterApplied = {
  benefitYield: "YIELD_CULTURE",
  benefitAmount: 7,
  penaltyYield: "YIELD_GOLD",
  penaltyAmount: 3
};
applyQuarterYields(42, quarterApplied);
assert.deepEqual(grants.slice(-2), [
  { pid: 42, yt: 3, amt: 7 },
  { pid: 42, yt: 2, amt: -3 }
]);

reverseQuarterYields(42, quarterApplied);
assert.deepEqual(grants.slice(-2), [
  { pid: 42, yt: 3, amt: -7 },
  { pid: 42, yt: 2, amt: 3 }
]);

// a benefitScale < 1 (contested enclave) shrinks ONLY the benefit; the drawback is charged in full
grants.length = 0;
applyQuarterYields(42, quarterApplied, 0.5);
assert.deepEqual(grants.slice(-2), [
  { pid: 42, yt: 3, amt: 3.5 }, // 7 x 0.5
  { pid: 42, yt: 2, amt: -3 }   // drawback unscaled
]);

// falsey / non-positive branch guards: none of these should emit yields
const beforeGuards = grants.length;
applyQuarterYields(42, {
  benefitYield: "YIELD_CULTURE",
  benefitAmount: 0,
  penaltyYield: "YIELD_GOLD",
  penaltyAmount: 0
});
applyQuarterYields(42, {
  benefitYield: "YIELD_CULTURE",
  benefitAmount: -1,
  penaltyYield: "YIELD_GOLD",
  penaltyAmount: -1
});
applyQuarterYields(42, {
  benefitYield: "",
  benefitAmount: 9,
  penaltyYield: null,
  penaltyAmount: 9
});
assert.equal(grants.length, beforeGuards, "non-positive or missing yield keys should no-op");

// grantSigned should no-op when yield mapping is unavailable
const ytBackup = globalThis.YieldTypes;
delete globalThis.YieldTypes;
applyQuarterYields(42, quarterApplied);
assert.equal(grants.length, beforeGuards, "missing YieldTypes should no-op safely");
globalThis.YieldTypes = ytBackup;

// grantSigned should no-op when owner id is invalid
applyQuarterYields("not-a-number", quarterApplied);
reverseQuarterYields("not-a-number", quarterApplied);
assert.equal(grants.length, beforeGuards, "invalid owner id should no-op safely");

const beforeNoop = grants.length;
applyQuarterYields(42, null);
reverseQuarterYields(42, null);
assert.equal(grants.length, beforeNoop, "null applied payload should no-op");
CONFIG.congestWeight = 4;
assert.ok(congestionPenalty(2, 10) >= 0);
assert.equal(congestionPenalty(999, 10), 0);

delete globalThis.Game;
delete globalThis.Configuration;
delete globalThis.Players;
delete globalThis.YieldTypes;

console.log("effects-branches-extra harness passed");
