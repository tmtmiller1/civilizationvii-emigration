import assert from "node:assert/strict";

const KEY = "EmigrationDisaster_v1";
let TURN = 10;
const kv = {
  [KEY]: JSON.stringify({
    v: 2,
    data: {
      byCity: {
        "1:1": 4,
        "": 8,
        bad: -3,
        bad2: "x"
      },
      typeByCity: {
        "1:1": "RANDOM_EVENT_FLOOD",
        "2:2": "",
        "": "RANDOM_EVENT_BAD"
      },
      observedTurn: {
        "1:1": 9,
        "3:3": -5,
        oops: "bad"
      },
      decayTurn: "not-number"
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

globalThis.ComponentID = {
  toBitfield: (cid) => (cid && cid.fallback ? cid.fallback : 0)
};

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
Object.assign(CONFIG, {
  disastersEnabled: true,
  disasterPlagueWeight: 7,
  disasterDecay: 0.5
});

const {
  observeDisaster,
  tickDisasters,
  recordDisaster,
  disasterTypeFor,
  worstDisasterTypeForOwner,
  addDistress,
  disasterKey
} = await import("/emigration/ui/emigration-disasters.js");

// Normalized load should keep only valid entries.
assert.equal(disasterTypeFor("1:1"), "RANDOM_EVENT_FLOOD");
assert.equal(disasterTypeFor(""), null);
assert.equal(disasterTypeFor("2:2"), null);
assert.equal(worstDisasterTypeForOwner("x"), null);

// keyFromCID owner:id path.
const city = { id: { owner: 1, id: 1 }, isInfected: false };
assert.equal(disasterKey(city), "1:1");

// keyFromCID fallback-to-bitfield path.
assert.equal(disasterKey({ id: { fallback: "CITY_BF_10" } }), "CITY_BF_10");

// keyFromCID catch path.
globalThis.ComponentID.toBitfield = () => {
  throw new Error("bitfield boom");
};
assert.equal(disasterKey({ id: { fallback: 77 } }), null);
globalThis.ComponentID.toBitfield = (cid) => (cid && cid.fallback ? cid.fallback : 0);

// observeDisaster guard: unreadable key and idempotent-by-turn behavior.
assert.equal(observeDisaster({ id: null, isInfected: true }), 0);
const v1 = observeDisaster({ id: { owner: 5, id: 9 }, isInfected: true });
const v2 = observeDisaster({ id: { owner: 5, id: 9 }, isInfected: true });
assert.equal(v1, v2, "same-turn polling should not double-add");

// polledDistress catch path with throwing getter.
const throwingCity = {
  id: { owner: 5, id: 10 },
  get isInfected() {
    throw new Error("infected unreadable");
  }
};
assert.doesNotThrow(() => observeDisaster(throwingCity));

// recordDisaster guards and default-weight fallback.
recordDisaster("CLASS_PLAGUE", 1, []);
recordDisaster("CLASS_PLAGUE", 1, null);
recordDisaster("CLASS_UNKNOWN", 0, ["5:9"], "");
assert.equal(disasterTypeFor("5:9"), null, "blank eventType should not stamp type");
recordDisaster("CLASS_VOLCANO", 2, ["5:9"], "RANDOM_EVENT_VOLCANO");
assert.equal(disasterTypeFor("5:9"), "RANDOM_EVENT_VOLCANO");

// addDistress guards and valid path.
addDistress("", 2);
addDistress("5:9", 0);
addDistress("5:9", 2);

// tickDisasters elapsed=0 and elapsed>0 paths, including prune branch.
TURN = 10;
tickDisasters();
TURN = 11;
Object.assign(CONFIG, { disasterDecay: 0.001 });
tickDisasters();
assert.equal(disasterTypeFor("1:1"), null, "tiny decayed entries should prune stale type");

// worst-type selection by owner.
recordDisaster("CLASS_FLOOD", 1, ["8:1"], "RANDOM_EVENT_FLOOD");
recordDisaster("CLASS_VOLCANO", 3, ["8:2"], "RANDOM_EVENT_VOLCANO");
assert.equal(worstDisasterTypeForOwner(8), "RANDOM_EVENT_VOLCANO");

// Disabled-mode guards.
CONFIG.disastersEnabled = false;
assert.equal(observeDisaster(city), 0);
addDistress("8:1", 5);
tickDisasters();

const persisted = JSON.parse(kv[KEY]);
assert.equal(persisted.v, 2);
assert.ok(persisted.data && persisted.data.byCity && persisted.data.typeByCity);

delete globalThis.Game;
delete globalThis.Configuration;
delete globalThis.ComponentID;

console.log("disasters-branches-extra harness passed");
