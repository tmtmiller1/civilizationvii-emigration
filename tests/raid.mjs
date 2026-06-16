// Unit test for the raid MIGRATION layer (emigration-raid.js): reading the native Extended
// Diplomacy raid actions from the live diplomacy events, the directional tilt (target → raider),
// and the target-gated dividend on intake. The action's cost/duration/grievance are native and
// not exercised here (they live in the Extended Diplomacy mod's data).
import assert from "node:assert/strict";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { raidOf, raidTilt, onRaidIntake } from "/emigration/ui/emigration-raid.js";

// Stub the live diplomacy events. Player 1 runs a Talent Raid (science) against player 2.
/** @type {Record<number, any[]>} */
let EVENTS = {};
globalThis.Game = { Diplomacy: { getPlayerEvents: (pid) => EVENTS[pid] || [] } };
CONFIG.raidTilt = 10;

EVENTS[1] = [{ actionTypeName: "DIPLOMACY_ACTION_TALENT_RAID", initialPlayer: 1, targetPlayer: 2 }];

// raidOf reads the active native action the player INITIATED.
const r = raidOf(1);
assert.equal(r.target, 2, "raid target");
assert.equal(r.domain, "science", "raid domain");
assert.equal(r.yieldKey, "YIELD_SCIENCE", "raid dividend yield");
assert.equal(raidOf(3), null, "no events for player 3 → no raid");

// An action TARGETING you is not a raid you're running.
EVENTS[2] = [{ actionTypeName: "DIPLOMACY_ACTION_TALENT_RAID", initialPlayer: 1, targetPlayer: 2 }];
assert.equal(raidOf(2), null, "an action targeting you is not your raid");

// Non-raid diplomacy actions are ignored.
EVENTS[4] = [{ actionTypeName: "DIPLOMACY_ACTION_DECLARE_WAR", initialPlayer: 4, targetPlayer: 5 }];
assert.equal(raidOf(4), null, "a non-raid action is ignored");

// Directional tilt: only the target's people (src=2) are pulled toward the raider (dest=1).
assert.equal(raidTilt(2, 1), 10, "tilt from target to raider");
assert.equal(raidTilt(3, 1), 0, "no tilt from a non-target source");
assert.equal(raidTilt(2, 3), 0, "no tilt toward a non-raider");

// Intake: a migrant from the TARGET (src=2) banks the domain dividend; others do not.
assert.equal(onRaidIntake(1, 2), "YIELD_SCIENCE", "target intake banks the dividend yield");
assert.equal(onRaidIntake(1, 3), null, "intake from a non-target source: nothing");
assert.equal(onRaidIntake(3, 2), null, "a civ with no raid gets nothing");

// Cultural / Trade offensives map to their domains + yields.
EVENTS[6] = [{ actionTypeName: "DIPLOMACY_ACTION_CULTURAL_OFFENSIVE", initialPlayer: 6, targetPlayer: 7 }];
assert.equal(raidOf(6).yieldKey, "YIELD_CULTURE", "cultural offensive → culture");
EVENTS[8] = [{ actionTypeName: "DIPLOMACY_ACTION_TRADE_OFFENSIVE", initialPlayer: 8, targetPlayer: 9 }];
assert.equal(raidOf(8).yieldKey, "YIELD_GOLD", "trade offensive → gold");

console.log("raid harness passed");
