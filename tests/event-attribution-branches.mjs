import assert from "node:assert/strict";

const WAR_KEY = "EmigrationWar_v1";
const DISASTER_KEY = "EmigrationDisaster_v1";

const kv = {
  [WAR_KEY]: JSON.stringify({ wars: { "2": [7] } }),
  [DISASTER_KEY]: JSON.stringify({ byCity: { "2:10": 9 }, typeByCity: { "2:10": "RANDOM_EVENT_VOLCANO" }, observedTurn: {}, decayTurn: 0 })
};

let crisisValues = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in crisisValues ? crisisValues[k] : kv[k] ?? null) }),
  editGame: () => ({ setValue: (k, v) => (kv[k] = v) })
};

globalThis.Game = {};
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
Object.assign(CONFIG, { disasterFleeThreshold: 5, violenceFleeThreshold: 4 });

const A = await import("/emigration/ui/emigration-event-attribution.js");

function testPollCrisisGuards() {
  delete globalThis.Game.CrisisManager;
  A.pollCrisis();
  assert.equal(A.activeCrisis(), null);

  delete globalThis.Game;
  A.pollCrisis();
  assert.equal(A.activeCrisis(), null);
  globalThis.Game = {};

  globalThis.Game.CrisisManager = {
    getCurrentCrisisStage: () => 1,
    isCrisisEnabled: () => false
  };
  A.pollCrisis();
  assert.equal(A.activeCrisis(), null);

  globalThis.Game.CrisisManager = {
    getCurrentCrisisStage: () => -1,
    isCrisisEnabled: () => true
  };
  A.pollCrisis();
  assert.equal(A.activeCrisis(), null);

  crisisValues = { AgeCrisisEventType: "NOT_A_CRISIS" };
  globalThis.Game.CrisisManager = {
    getCurrentCrisisStage: () => 1,
    isCrisisEnabled: () => true
  };
  A.pollCrisis();
  assert.equal(A.activeCrisis(), null);

  crisisValues = { CrisisEventType: "ANTIQUITY_CRISIS_INVASION" };
  A.pollCrisis();
  assert.deepEqual(A.activeCrisis(), { type: "ANTIQUITY_CRISIS_INVASION", category: "war" });

  globalThis.Game.CrisisManager = {
    getCurrentCrisisStage: () => {
      throw new Error("bad stage");
    }
  };
  A.pollCrisis();
  assert.equal(A.activeCrisis(), null);
}

function testMoveAndDeathFallbacks() {
  assert.equal(A.crisisCategory(null), null);
  assert.equal(A.crisisCategory("MODERN_CRISIS_WORLD_WAR"), "war");
  assert.equal(A.crisisCategory("ANTIQUITY_CRISIS_PLAGUE"), "disaster");
  assert.equal(A.crisisCategory("ANTIQUITY_CRISIS_REVOLT"), "unhappiness");

  // war key from tracked aggressor list
  kv[WAR_KEY] = JSON.stringify({ wars: { "2": [9, 7] } });
  A.__test.setCrisis(null);
  assert.equal(A.eventKeyForMove({ owner: 2, city: { id: { owner: 2, id: 10 } } }, "war"), "war:2:7");

  // war with non-number owner
  assert.equal(A.eventKeyForMove({ owner: "x" }, "war"), "");

  // disaster key from city id mapping and missing city fallback
  assert.equal(
    A.eventKeyForMove({ owner: 2, city: { id: { owner: 2, id: 10 } } }, "disaster"),
    "disaster:RANDOM_EVENT_VOLCANO"
  );
  assert.equal(A.eventKeyForMove({ owner: 2, city: null }, "disaster"), "");

  // crisis-matching death/event paths
  A.__test.setCrisis({ type: "ANTIQUITY_CRISIS_PLAGUE", category: "disaster" });
  assert.equal(
    A.eventKeyForMove({ owner: 2, city: { id: { owner: 2, id: 10 } } }, "disaster"),
    "crisis:ANTIQUITY_CRISIS_PLAGUE"
  );
  assert.equal(A.eventKeyForDeath({ owner: 2, disaster: 7 }), "crisis:ANTIQUITY_CRISIS_PLAGUE");

  A.__test.setCrisis({ type: "ANTIQUITY_CRISIS_INVASION", category: "war" });
  assert.equal(A.eventKeyForDeath({ owner: 2, violence: 10 }), "crisis:ANTIQUITY_CRISIS_INVASION");

  A.__test.setCrisis(null);
  assert.equal(A.eventKeyForDeath({ owner: 2, violence: 10 }), "war:2:7");
  assert.equal(A.eventKeyForDeath({ owner: 2, disaster: 7, city: { id: { owner: 2, id: 10 } } }), "disaster:RANDOM_EVENT_VOLCANO");
  assert.equal(A.eventKeyForDeath({ owner: 2, starving: true }), "famine");
  assert.equal(A.eventKeyForDeath({ owner: 2 }), "");

  assert.equal(A.eventGroupCause(""), "");
  assert.equal(A.eventGroupCause("war:1:2"), "war");
  assert.equal(A.eventGroupCause("disaster:RANDOM_EVENT_VOLCANO"), "disaster");
  assert.equal(A.eventGroupCause("misc"), "");
  assert.equal(A.eventGroupCause("crisis:UNKNOWN_CRISIS_TYPE"), "war");
}

testPollCrisisGuards();
testMoveAndDeathFallbacks();

delete globalThis.Configuration;
delete globalThis.Game;

console.log("event-attribution-branches harness passed");
