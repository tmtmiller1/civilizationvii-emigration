// returned.mjs
//
// Who has come home (emigration-returned.js). The flow ledger call-home reads is an all-game tally and never goes
// down. Watched in a lab game on 2026-10-25 (roadmap section 31): the AI made five internal calls, each brought
// one person home, and no civilization's displaced total dropped once in 130 turns, so the quote and the offer kept
// listing people who were already home. Returns are now counted and taken off the ledger.

import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Locale = { compose: (s) => s };
globalThis.GameContext = { localPlayerID: 9 };

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const returned = await import("/emigration/ui/emigration-returned.js");
const { callHomeCandidates, callHomeQuote, CALL_HOME_SCOPE, CALL_HOME_CURRENCY } =
  await import("/emigration/ui/emigration-call-home.js");
const { moveReturnees } = await import("/emigration/ui/emigration-return.js");

const KEY = "EmigrationReturned_v1";
const pair = (from, home, host, points) => ({ from, home, host, points });

function testNetOfReturns() {
  const pairs = [pair("Athens", "Rome", 2, 4), pair("Ostia", "Rome", 1, 3), pair("Ostia", "Capua", 1, 2)];
  assert.deepEqual(returned.netOfReturns(pairs, {}), pairs, "no returns, nothing changes");
  assert.deepEqual(returned.netOfReturns(pairs, { 1: { Ostia: { Rome: 2 } } }).map((p) => [p.from, p.home, p.points]),
    [["Athens", "Rome", 4], ["Ostia", "Capua", 2], ["Ostia", "Rome", 1]], "an exact return comes off its own pair");
  assert.deepEqual(returned.netOfReturns(pairs, { 1: { Ostia: { Rome: 4 } } }).map((p) => [p.from, p.home, p.points]),
    [["Athens", "Rome", 4], ["Ostia", "Capua", 1]],
    "a return beyond its pair spills to the other homes from the same host settlement");
  assert.deepEqual(returned.netOfReturns(pairs, { 1: { Ostia: { Neapolis: 2 } } }).map((p) => [p.home, p.points]),
    [["Rome", 4], ["Rome", 1], ["Capua", 2]].sort((a, b) => b[1] - a[1]),
    "a drift home to a city they didn't leave comes off the largest pair from that host settlement");
  assert.deepEqual(returned.netOfReturns(pairs, { 1: { Ostia: { Rome: 99 } }, 2: { Athens: { Rome: 99 } } }), [],
    "pairs never go below zero, and empty ones drop out");
  assert.equal(pairs[1].points, 3, "the input pairs aren't changed");
}

function testSaveRoundTrip() {
  returned._forgetReturned();
  returned.recordReturn(0, 0, "Ostia", "Rome");
  returned.recordReturn(0, 0, "Ostia", "Rome", 2);
  returned.recordReturn(0, 3, "Athens", "Rome");
  returned.recordReturn(0, 3, "", "Rome");
  returned.recordReturn("0", 3, "Athens", "Rome");
  assert.deepEqual(JSON.parse(KV[KEY]), { 0: { 0: { Ostia: { Rome: 3 } }, 3: { Athens: { Rome: 1 } } } },
    "counts add up by origin, host civ, host settlement and home; malformed calls are ignored");
  returned._forgetReturned();
  assert.deepEqual(returned.returnedFor(0), { 0: { Ostia: { Rome: 3 } }, 3: { Athens: { Rome: 1 } } },
    "a reload reads them back from the save");
  assert.deepEqual(returned.cleanReturned({ 0: { 1: { A: { B: "2", C: -1, D: "x" } }, 2: 5 }, x: [] }),
    { 0: { 1: { A: { B: 2 } } } }, "junk in the save is dropped");
}

function testCandidatesNetOfReturns() {
  const flows = [
    { src: 0, dest: 0, srcCity: "Rome", destCity: "Ostia", points: 5, byCause: { war: 500 } },
    { src: 0, dest: 3, srcCity: "Rome", destCity: "Athens", points: 2, byCause: { war: 200 } }
  ];
  assert.equal(callHomeCandidates(0, flows).internal[0].points, 2, "the saved returns come off by default");
  const none = callHomeCandidates(0, flows, {});
  assert.equal(none.internal[0].points, 5);
  assert.equal(none.external[0].points, 2);
  const after = callHomeCandidates(0, flows, { 0: { Ostia: { Rome: 5 } }, 3: { Athens: { Rome: 1 } } });
  assert.equal(after.internal.length, 0, "everyone called home from Ostia is no longer listed");
  assert.equal(after.external[0].points, 1, "one of two came home from abroad");
  CONFIG.callHomeMaxPointsPerAttempt = 3;
  const q = callHomeQuote(0, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD, flows);
  assert.equal(q.available, 2, "the quote counts only the people still away");
}

function testMoveReturneesRecords() {
  returned._forgetReturned();
  delete KV[KEY];
  CONFIG.departureRemovesTile = false;
  const city = (owner, name) => ({ owner, name, pop: 5, addRuralPopulation(n) { this.pop += n; } });
  const host = city(4, "Ostia");
  const home = city(4, "Rome");
  const r = moveReturnees(host, home, "", 4);
  assert.equal(r.ok, true);
  assert.deepEqual([host.pop, home.pop], [4, 6], "one person moved");
  assert.deepEqual(returned.returnedFor(4), { 4: { Ostia: { Rome: 1 } } }, "the return is counted");
  const broken = { owner: 4, name: "Capua" }; // can't take a person
  assert.equal(moveReturnees(host, broken, "", 4).ok, false);
  assert.deepEqual(returned.returnedFor(4), { 4: { Ostia: { Rome: 1 } } }, "a return that didn't land isn't counted");
}

testNetOfReturns();
testSaveRoundTrip();
testCandidatesNetOfReturns();
testMoveReturneesRecords();
console.log("returned: ok");
