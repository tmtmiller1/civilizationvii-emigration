import assert from "node:assert/strict";

// The call-home cooldown lives in the save (EmigrationCallHomeCooldown_v1), so a save and load, or a UI reload,
// doesn't let every civilization call again at once. A stored last call later than the current turn (a save from
// later, loaded earlier) counts as over rather than blocking for an age.

let TURN = 40;
globalThis.Game = { get turn() { return TURN; } };
globalThis.GameContext = { localPlayerID: 0 };
const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const action = await import("/emigration/ui/emigration-call-home-action.js");
const { CALL_HOME_SCOPE, CALL_HOME_CURRENCY } = await import("/emigration/ui/emigration-call-home.js");

const ME = 0;
const IN = CALL_HOME_SCOPE.INTERNAL;
const EX = CALL_HOME_SCOPE.EXTERNAL;
const FLOWS = [{ src: ME, dest: ME, srcCity: "Rome", destCity: "Ostia", points: 3, byCause: { war: 300 } }];
const KEY = "EmigrationCallHomeCooldown_v1";

CONFIG.callHomeEnabled = true;
CONFIG.callHomeCooldownTurns = 8;
action._resetCallHomeCooldowns();

// A call starts the cooldown and writes it to the save.
const r = action.callHomeNow(ME, IN, CALL_HOME_CURRENCY.GOLD, { flows: FLOWS, move: () => true, resolvable: () => true });
assert.equal(r.ok, true);
assert.equal(action.callHomeCooldownLeft(ME, IN), 8, "a fresh cooldown");
assert.deepEqual(JSON.parse(KV[KEY]), { "0|internal": 40 }, "the last call is in the save, by pid and scope");
assert.equal(action.callHomeCooldownLeft(ME, EX), 0, "the other scope has its own clock");

// A reload drops the memory; the next read comes from the save and the cooldown is still running.
TURN = 43;
action._forgetCallHomeCooldownMemory();
assert.equal(action.callHomeCooldownLeft(ME, IN), 5, "the cooldown survives a reload");

// A save from later than now (loaded an earlier autosave): the cooldown counts as over, never as an age-long block.
KV[KEY] = JSON.stringify({ "0|internal": 60 });
action._forgetCallHomeCooldownMemory();
assert.equal(action.callHomeCooldownLeft(ME, IN), 0, "a last call after now is over");

// Junk in the save is ignored.
KV[KEY] = JSON.stringify({ "x|internal": 40, "0|internal": "40", "0|external": 41 });
action._forgetCallHomeCooldownMemory();
assert.equal(action.callHomeCooldownLeft(ME, IN), 0);
assert.equal(action.callHomeCooldownLeft(ME, EX), 6, "a clean entry is kept");
KV[KEY] = "{not json";
action._forgetCallHomeCooldownMemory();
assert.equal(action.callHomeCooldownLeft(ME, EX), 0, "an unreadable save means no cooldown, as before");

// Resetting clears the save too.
action._resetCallHomeCooldowns();
assert.equal(KV[KEY], "{}");
console.log("call-home-cooldown harness passed");

// A call made for one settlement's people (the Displaced tab's Hasten) runs on that settlement's own clock, so
// hastening Philadelphia doesn't lock Boston's button for eight turns (watched 2026-10-25).
TURN = 100;
action._resetCallHomeCooldowns();
const r2 = action.callHomeNow(ME, IN, CALL_HOME_CURRENCY.GOLD, { flows: FLOWS, move: () => true, resolvable: () => true, home: "Rome" });
assert.equal(r2.ok, true);
assert.equal(action.callHomeCooldownLeft(ME, IN, "Rome"), 8, "Rome's own cooldown");
assert.equal(action.callHomeCooldownLeft(ME, IN, "Boston"), 0, "Boston's button stays open");
assert.equal(action.callHomeCooldownLeft(ME, IN), 0, "the civilization-wide clock (the pop-up, the AI) is untouched");

