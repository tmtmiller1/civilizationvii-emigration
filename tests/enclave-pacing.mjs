// enclave-pacing.mjs
//
// Per-age pacing of enclave formation (emigration-enclave-pacing.js): the pure relaxation curve, the
// relaxed bars and dwell, the per-host formed counters (with the age reset) in the quarter state, the
// live relaxFor/capReached readers against a stubbed AgeProgressManager, and the relaxed thresholds as
// diaspora.quarterStage and quarter-state.dwellProgress see them.
import assert from "node:assert/strict";

globalThis.Configuration = {
  getGame: () => ({ getValue: () => null }),
  editGame: () => ({ setValue: () => {} })
};
globalThis.Game = { age: 7, turn: 40, AgeProgressManager: { cur: 0, max: 100,
  getCurrentAgeProgressionPoints() { return this.cur; }, getMaxAgeProgressionPoints() { return this.max; } } };
globalThis.GameContext = { localPlayerID: 0 };

const pacing = await import("/emigration/ui/emigration-enclave-pacing.js");
const qs = await import("/emigration/ui/emigration-quarter-state.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const diaspora = await import("/emigration/ui/emigration-diaspora.js");
const { pacingRelax, relaxedBar, relaxedDwell, relaxFor, capReached, ageProgressFraction } = pacing;

function setProgress(pct) { Game.AgeProgressManager.cur = pct; Game.AgeProgressManager.max = 100; }

// The curve: nothing until the age moves, linear to the maximum at `by`, flat after, zero once met.
function testRelaxCurve() {
  const cfg = { max: 0.4, by: 0.6 };
  assert.equal(pacingRelax(0, 1, 0, cfg), 0, "age start");
  assert.ok(Math.abs(pacingRelax(0, 1, 0.3, cfg) - 0.2) < 1e-9, "half way to `by`");
  assert.ok(Math.abs(pacingRelax(0, 1, 0.6, cfg) - 0.4) < 1e-9, "full at `by`");
  assert.ok(Math.abs(pacingRelax(0, 1, 0.95, cfg) - 0.4) < 1e-9, "flat after");
  assert.equal(pacingRelax(1, 1, 0.9, cfg), 0, "target met");
  assert.equal(pacingRelax(0, 0, 0.9, cfg), 0, "target 0 = no catch-up");
  assert.equal(pacingRelax(0, 1, 0.9, { max: 0, by: 0.6 }), 0, "max 0 = off");
  assert.ok(Math.abs(pacingRelax(0, 2, 0.9, cfg) - 0.4) < 1e-9, "target 2 with one formed still relaxes");
  assert.ok(Math.abs(pacingRelax(0, 1, 5, cfg) - 0.4) < 1e-9, "progress clamped");
  assert.equal(pacingRelax(0, 1, NaN, cfg), 0, "unreadable progress = plain bars");
  assert.ok(Math.abs(pacingRelax(0, 1, 0.5, { max: 0.4, by: 0 }) - 0.4) < 1e-9, "by 0 = full at once");
}

// The bars: proportional, floored, dwell rounded with a floor of two turns (0 stays 0).
function testRelaxedBars() {
  assert.ok(Math.abs(relaxedBar(0.3, 0.4) - 0.18) < 1e-9);
  assert.equal(relaxedBar(6, 0), 6);
  assert.equal(relaxedBar(6, 2), 0, "over-relax clamps to 1, never negative");
  assert.equal(relaxedBar(NaN, 0.2), 0);
  assert.equal(relaxedDwell(8, 0.4), 5, "8 x 0.6 = 4.8 rounds to 5");
  assert.equal(relaxedDwell(8, 0), 8);
  assert.equal(relaxedDwell(2, 0.9), 2, "floor of two turns");
  assert.equal(relaxedDwell(0, 0.4), 0, "dwell 0 stays 0");
}

// Counters: per host, reset when the age hash changes, round-trip through normalize.
function testFormedCountersPerAge() {
  const s = qs.__test.readStateForTest();
  s.formed = { age: Game.age, byOwner: {} };
  assert.equal(qs.formedThisAge(0), 0);
  qs.noteFormed(0); qs.noteFormed(0); qs.noteFormed(3);
  assert.equal(qs.formedThisAge(0), 2);
  assert.equal(qs.formedThisAge(3), 1);
  assert.equal(qs.formedThisAge(9), 0);
  const n = qs.__test.normalizeState({ formed: { age: 7, byOwner: { 0: 2, 3: 1, bad: 4, 5: -1, 6: "x" } } });
  assert.deepEqual(n.formed, { age: 7, byOwner: { 0: 2, 3: 1 } });
  assert.deepEqual(qs.__test.normalizeState({}).formed, { age: 0, byOwner: {} }, "missing = empty");
  Game.age = 8; // a new age
  assert.equal(qs.formedThisAge(0), 0, "counters reset on the age change");
  qs.noteFormed(0);
  assert.equal(qs.formedThisAge(0), 1);
  Game.age = 7;
  assert.equal(qs.formedThisAge(0), 0, "and again on the way back (fresh age = fresh counters)");
}

// The live readers: the engine's progression points, the option gate, the target, the cap.
function testLiveRelaxAndCap() {
  const s = qs.__test.readStateForTest();
  s.formed = { age: Game.age, byOwner: {} };
  CONFIG.quarterPacingEnabled = true; CONFIG.quarterTargetPerAge = 1; CONFIG.quarterPacingMax = 0.4;
  CONFIG.quarterPacingBy = 0.6; CONFIG.quarterCapPerAge = 3;
  setProgress(30);
  assert.ok(Math.abs(ageProgressFraction() - 0.3) < 1e-9);
  assert.ok(Math.abs(relaxFor(0) - 0.2) < 1e-9, "30% of the age, no enclave: 20% relaxed");
  setProgress(90);
  assert.ok(Math.abs(relaxFor(0) - 0.4) < 1e-9, "late in the age: the maximum");
  qs.noteFormed(0);
  assert.equal(relaxFor(0), 0, "one formed: plain bars");
  assert.equal(relaxFor(4), 0.4, "another host still catching up");
  assert.equal(capReached(0), false);
  qs.noteFormed(0); qs.noteFormed(0);
  assert.equal(capReached(0), true, "three formed = the cap");
  assert.equal(capReached(4), false);
  CONFIG.quarterCapPerAge = 0;
  assert.equal(capReached(0), false, "0 = uncapped");
  CONFIG.quarterCapPerAge = 3;
  CONFIG.quarterPacingEnabled = false;
  assert.equal(relaxFor(4), 0, "pacing off: plain bars");
  CONFIG.quarterPacingEnabled = true;
  Game.AgeProgressManager.max = 0;
  assert.equal(relaxFor(4), 0, "unreadable progress: plain bars");
  setProgress(90);
  assert.equal(relaxFor("x"), 0, "no owner: plain bars");
  s.formed = { age: Game.age, byOwner: {} };
}

// The thresholds as the mechanic sees them: a community under the plain bars qualifies once relaxed.
function testRelaxedStageAndDwell() {
  CONFIG.quarterEstablishedShare = 0.3; CONFIG.quarterMinStock = 3; CONFIG.quarterEstablishedStock = 0;
  const { quarterStage } = diaspora.__test;
  assert.equal(quarterStage(0.2, 4, 0), "none", "plain bars: 20% is under the 25% foothold");
  assert.equal(quarterStage(0.26, 4, 0), "foothold");
  assert.equal(quarterStage(0.26, 4, 0.4), "established", "relaxed share bar 18%: established");
  assert.equal(quarterStage(0.26, 2, 0.4), "none", "the standing-points floor is never relaxed");
  CONFIG.quarterDwellTurns = 8;
  qs.putCandidacy("5,5", { civ: 2, originCiv: "CIVILIZATION_ROME", since: 100, lastSeen: 105 });
  assert.deepEqual(qs.dwellProgress("5,5", "CIVILIZATION_ROME", 2, 105, 0), { elapsed: 5, needed: 8 });
  assert.equal(qs.dwellSatisfied("5,5", "CIVILIZATION_ROME", 2, 105, 0), false);
  assert.deepEqual(qs.dwellProgress("5,5", "CIVILIZATION_ROME", 2, 105, 0.4), { elapsed: 5, needed: 5 });
  assert.equal(qs.dwellSatisfied("5,5", "CIVILIZATION_ROME", 2, 105, 0.4), true, "relaxed dwell met");
  assert.equal(qs.dwellProgress("5,5", "CIVILIZATION_GREECE", 3, 105, 0.4), null, "another origin");
  assert.equal(qs.dwellProgress("6,6", "CIVILIZATION_ROME", 2, 105, 0.4), null, "no candidacy");
  qs.dropCandidacy("5,5");
}

testRelaxCurve();
testRelaxedBars();
testFormedCountersPerAge();
testLiveRelaxAndCap();
testRelaxedStageAndDwell();
console.log("enclave-pacing: ok");
