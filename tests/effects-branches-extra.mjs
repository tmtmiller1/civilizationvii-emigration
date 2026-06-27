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
  congestionPenalty
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
assert.ok(rich.gold >= rich.load * CONFIG.assimilationGold, "wealth multiplier should bend cost upward");

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
CONFIG.congestWeight = 4;
assert.ok(congestionPenalty(2, 10) >= 0);
assert.equal(congestionPenalty(999, 10), 0);

delete globalThis.Game;
delete globalThis.Configuration;
delete globalThis.Players;
delete globalThis.YieldTypes;

console.log("effects-branches-extra harness passed");
