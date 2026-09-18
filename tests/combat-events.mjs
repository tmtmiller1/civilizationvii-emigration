import assert from "node:assert/strict";

// ── Stub the engine surface the combat tracker listens to ────────────────────────────────────────────
let TURN = 1;
globalThis.Game = { get turn() { return TURN; } };

/** Plot -> owning city ComponentID. Anything unlisted is wilderness (no owning city). */
const OWNING = {
  "10:10": { owner: 0, id: 1 }, // our capital's territory
  "11:10": { owner: 0, id: 1 },
  "50:50": { owner: 4, id: 9 } // a foreign city's territory, far away and never revealed
};
globalThis.GameplayMap = {
  getOwningCityFromXY: (/** @type {number} */ x, /** @type {number} */ y) => OWNING[x + ":" + y] || null
};

/** Live units by "owner:id". Deleting one models a unit that has died and can no longer be resolved. */
/** @type {*} */
let UNITS = {};
const ukey = (/** @type {*} */ c) => c.owner + ":" + c.id;
globalThis.Units = { get: (/** @type {*} */ cid) => UNITS[ukey(cid)] || null };

/** Captured handlers, so the test can drive the engine's event stream directly. */
/** @type {*} */
const HANDLERS = {};
globalThis.engine = {
  on: (/** @type {string} */ n, /** @type {*} */ fn) => { (HANDLERS[n] = HANDLERS[n] || []).push(fn); },
  off: (/** @type {string} */ n, /** @type {*} */ fn) => {
    HANDLERS[n] = (HANDLERS[n] || []).filter((/** @type {*} */ f) => f !== fn);
  }
};
const fire = (/** @type {string} */ n, /** @type {*} */ d) => (HANDLERS[n] || []).forEach((/** @type {*} */ f) => f(d));

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { takeCombatEvidence, peekCombatEvidence, startCombatEvents, stopCombatEvents, _resetCombatEvents } =
  await import("/emigration/ui/emigration-combat-events.js");
// Most tests only look; they read as their own reader so nothing is consumed between assertions.
const combatEvidence = (/** @type {*} */ key) => peekCombatEvidence(key, "test");
const eventAttackers = (/** @type {*} */ key) => new Set(combatEvidence(key).attackers);

const HOME = "0:1";
const unit = (/** @type {number} */ owner, /** @type {number} */ id, /** @type {*} */ loc) => {
  UNITS[owner + ":" + id] = { owner, id, location: loc };
  return { owner, id, type: 26 };
};
function reset(turn) {
  TURN = turn;
  UNITS = {};
  _resetCombatEvents();
}

function testTrackerAttaches() {
  assert.equal(startCombatEvents(), true, "the tracker subscribes");
  assert.ok(HANDLERS.Combat?.length, "Combat is watched");
  assert.ok(HANDLERS.UnitKilledInCombat?.length, "kills are watched");
  assert.ok(HANDLERS.DistrictDamageChanged?.length, "district damage is watched");
  assert.equal(startCombatEvents(), false, "subscribing twice attaches nothing more");
}

function testDistrictDamageIsAttributedToItsCity() {
  reset(5);
  fire("DistrictDamageChanged", {
    cityID: { owner: 0, id: 1 }, maxDamage: 100, prevDamage: 20, newDamage: 60, location: { x: 10, y: 10 }
  });
  const ev = combatEvidence(HOME);
  assert.ok(Math.abs(ev.dmg - 0.4) < 1e-9, "the delta is recorded as a fraction of max health");
}

function testRepairIsNotViolence() {
  reset(6);
  fire("DistrictDamageChanged", { cityID: { owner: 0, id: 1 }, maxDamage: 100, prevDamage: 60, newDamage: 10 });
  assert.equal(combatEvidence(HOME).dmg, 0, "healing a district is not an attack");
}

function testAFieldBattleRegistersWithNoDistrictDamage() {
  // The case no polled signal can see: a fight in the city's fields that never scratches the walls.
  reset(7);
  const atk = unit(7, 100, { x: 11, y: 10 });
  const def = unit(0, 200, { x: 11, y: 10 });
  fire("Combat", { attacker: atk, defender: def });
  const ev = combatEvidence(HOME);
  assert.equal(ev.battles, 1, "the battle is counted");
  assert.equal(ev.dmg, 0, "with no district damage at all");
  assert.deepEqual(ev.attackers, [7], "and the attacker is named");
}

function testTheDeadAreStillLocated() {
  // UnitKilledInCombat fires AFTER the unit is gone from Units.get. Without the position cached during the
  // Combat event, the casualty could not be attributed to any city.
  reset(8);
  const atk = unit(7, 100, { x: 11, y: 10 });
  const def = unit(0, 200, { x: 11, y: 10 });
  fire("Combat", { attacker: atk, defender: def });
  delete UNITS["0:200"]; // the defender dies and is unresolvable
  assert.equal(globalThis.Units.get(def), null, "the dead unit really is unreachable");
  fire("UnitKilledInCombat", { unitKilled: def, unitKiller: atk });
  const ev = combatEvidence(HOME);
  assert.equal(ev.kills, 1, "the casualty is still placed at the right city");
  assert.deepEqual(ev.attackers, [7]);
}

function testOurOwnGarrisonIsNotAnAttacker() {
  // The city's own owner is never listed among those attacking it, however the fight started. The enemy it
  // sallied out against IS listed: an earlier version of this test expected nobody at all, which was wrong --
  // see testTheEnemyIsNamedEvenWhenTheDefenderWins, caught in game at Lille.
  reset(9);
  const atk = unit(0, 300, { x: 11, y: 10 }); // our own unit sallying out
  const def = unit(7, 400, { x: 11, y: 10 });
  fire("Combat", { attacker: atk, defender: def });
  const named = combatEvidence(HOME).attackers;
  assert.ok(!named.includes(0), "we are never an attacker of our own city");
  assert.deepEqual(named, [7], "but the foreign army we struck is still a foreign army in our land");
}

function testTheEnemyIsNamedEvenWhenTheDefenderWins() {
  // Watched failing in game (mod test 115, Lille): the city's owner killed an invader in its own territory,
  // so the enemy appeared as the VICTIM rather than the aggressor and went unnamed. Who brought violence
  // into this city's land is the question; losing the fight does not answer it differently.
  reset(18);
  const defender = unit(0, 310, { x: 10, y: 10 }); // the city owner's garrison
  const invader = unit(7, 311, { x: 10, y: 10 });
  fire("Combat", { attacker: defender, defender: invader });
  assert.deepEqual(combatEvidence(HOME).attackers, [7], "the outsider is named though it never struck first");

  reset(19);
  const d2 = unit(0, 320, { x: 10, y: 10 });
  const i2 = unit(7, 321, { x: 10, y: 10 });
  fire("Combat", { attacker: d2, defender: i2 });
  delete UNITS["7:321"];
  fire("UnitKilledInCombat", { unitKilled: i2, unitKiller: d2 });
  const ev = combatEvidence(HOME);
  assert.equal(ev.kills, 1);
  assert.deepEqual(ev.attackers, [7], "an invader we killed is still an invader");
}

function testFightingInTheWildernessBelongsToNoCity() {
  reset(10);
  const atk = unit(7, 500, { x: 99, y: 99 });
  const def = unit(0, 600, { x: 99, y: 99 });
  fire("Combat", { attacker: atk, defender: def });
  assert.equal(combatEvidence(HOME).battles, 0, "a battle outside any territory is nobody's siege");
}

function testForeignCitiesAreTrackedToo() {
  // Fog-independence in the model, matching what was watched in game: the migration sim scores every met
  // civilization, so a war we cannot see must still register at the city it is happening to.
  reset(11);
  fire("DistrictDamageChanged", { cityID: { owner: 4, id: 9 }, maxDamage: 100, prevDamage: 0, newDamage: 50 });
  assert.ok(combatEvidence("4:9").dmg > 0, "someone else's war is recorded at their city");
  assert.equal(combatEvidence(HOME).dmg, 0, "and is not charged to ours");
}

function testEveryFightIsReadExactlyOnce() {
  // Replaces a "current turn, else previous turn" window that both lost and repeated evidence once fighting
  // landed before the model's once-a-turn read (seen as double counting in mod test 116).
  reset(12);
  const dmg = (/** @type {number} */ to) => fire("DistrictDamageChanged",
    { cityID: { owner: 0, id: 1 }, maxDamage: 100, prevDamage: 0, newDamage: to });

  dmg(30); // fighting on turn 12, before the model reads
  TURN = 13; // the model does not read until the next turn
  const first = takeCombatEvidence(HOME);
  assert.ok(Math.abs(first.dmg - 0.3) < 1e-9, "a fight from an earlier turn is not lost when the turn rolls");
  assert.equal(takeCombatEvidence(HOME).dmg, 0, "and taking again gives nothing: it is never counted twice");

  dmg(20); // early fighting on turn 13, BEFORE this turn's read -- the case the old window got wrong
  const early = takeCombatEvidence(HOME);
  dmg(10); // later fighting on the same turn
  TURN = 14;
  const later = takeCombatEvidence(HOME);
  assert.ok(Math.abs(early.dmg - 0.2) < 1e-9, "the early fight is read once");
  assert.ok(Math.abs(later.dmg - 0.1) < 1e-9, "and the next read has only what came after it");
}

function testReadersDoNotConsumeEachOther() {
  // A probe reading the ledger must never steal the evidence the migration model is about to score.
  reset(30);
  const atk = unit(7, 960, { x: 10, y: 10 });
  const def = unit(0, 961, { x: 10, y: 10 });
  fire("Combat", { attacker: atk, defender: def });
  assert.equal(takeCombatEvidence(HOME, "probe").battles, 1, "the probe sees the fight");
  const model = takeCombatEvidence(HOME, "violence");
  assert.equal(model.battles, 1, "and the model still sees it too");
  assert.deepEqual(model.attackers, [7], "including who was involved");
  assert.equal(peekCombatEvidence(HOME, "violence").battles, 0, "peeking after a take shows nothing new");
}

function testAttackersAreScopedToTheSpanRead() {
  // An attacker named in an old fight must not be reported as attacking again in a later, quieter span.
  reset(31);
  const a1 = unit(7, 970, { x: 10, y: 10 });
  const d1 = unit(0, 971, { x: 10, y: 10 });
  fire("Combat", { attacker: a1, defender: d1 });
  assert.deepEqual(takeCombatEvidence(HOME).attackers, [7]);
  const a2 = unit(9, 972, { x: 10, y: 10 });
  const d2 = unit(0, 973, { x: 10, y: 10 });
  fire("Combat", { attacker: a2, defender: d2 });
  assert.deepEqual(takeCombatEvidence(HOME).attackers, [9], "only whoever fought since the last read");
}

function testAttackerSetMatchesEvidence() {
  reset(15);
  const atk = unit(11, 700, { x: 10, y: 10 });
  const def = unit(0, 800, { x: 10, y: 10 });
  fire("Combat", { attacker: atk, defender: def });
  assert.deepEqual([...eventAttackers(HOME)], [11], "eventAttackers agrees with the evidence row");
  assert.equal(eventAttackers(null).size, 0, "an unusable key names nobody");
}

function testAMalformedPayloadCannotBreakTheStream() {
  reset(16);
  fire("Combat", null);
  fire("Combat", { attacker: null, defender: null });
  fire("UnitKilledInCombat", {});
  fire("DistrictDamageChanged", { cityID: null });
  const atk = unit(7, 900, { x: 10, y: 10 });
  const def = unit(0, 901, { x: 10, y: 10 });
  fire("Combat", { attacker: atk, defender: def });
  assert.equal(combatEvidence(HOME).battles, 1, "the tracker keeps working after junk payloads");
}

function testDisabledRecordsNothing() {
  reset(17);
  const was = CONFIG.combatEventsEnabled;
  CONFIG.combatEventsEnabled = false;
  fire("DistrictDamageChanged", { cityID: { owner: 0, id: 1 }, maxDamage: 100, prevDamage: 0, newDamage: 90 });
  assert.equal(combatEvidence(HOME).dmg, 0, "the kill switch really silences it");
  CONFIG.combatEventsEnabled = was;
}

function testLedgerIsPublishedForOtherContexts() {
  // A UI script in another mod that imports this file gets its OWN module instance, whose tracker was never
  // started, so an import always reads empty from outside. The global is the real surface.
  reset(20);
  const G = /** @type {*} */ (globalThis).EmigrationCombat;
  assert.ok(G && typeof G.take === "function" && typeof G.peek === "function", "the ledger is published");
  const atk = unit(7, 950, { x: 10, y: 10 });
  const def = unit(0, 951, { x: 10, y: 10 });
  fire("Combat", { attacker: atk, defender: def });
  assert.equal(G.peek(HOME, "probe").battles, 1, "the global reads the live ledger");
  assert.deepEqual(G.take(HOME, "probe").attackers, [7], "including who was involved");
  assert.equal(G.peek(HOME, "probe").battles, 0, "and a take through the global moves only that reader");
  const st = G.stats();
  assert.equal(st.tracking, true, "and reports that the tracker is actually attached");
  assert.ok(st.seen > 0, "a lifetime count separates 'running but quiet' from 'never fired'");
}

function testStopDetaches() {
  stopCombatEvents();
  assert.equal((HANDLERS.Combat || []).length, 0, "stop removes exactly what start added");
}

testTrackerAttaches();
testDistrictDamageIsAttributedToItsCity();
testRepairIsNotViolence();
testAFieldBattleRegistersWithNoDistrictDamage();
testTheDeadAreStillLocated();
testOurOwnGarrisonIsNotAnAttacker();
testTheEnemyIsNamedEvenWhenTheDefenderWins();
testFightingInTheWildernessBelongsToNoCity();
testForeignCitiesAreTrackedToo();
testEveryFightIsReadExactlyOnce();
testReadersDoNotConsumeEachOther();
testAttackersAreScopedToTheSpanRead();
testAttackerSetMatchesEvidence();
testAMalformedPayloadCannotBreakTheStream();
testDisabledRecordsNothing();
testLedgerIsPublishedForOtherContexts();
testStopDetaches();

console.log("combat-events harness passed");
