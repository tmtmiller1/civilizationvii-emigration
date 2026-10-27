// homecoming.mjs
//
// People displaced inside their own civilization go home on their own once home is calm (emigration-homecoming.js).
// Designed 2026-10-25 to replace the paid internal call that came back every eight turns as a pop-up. The lab run
// before building (roadmap section 31) showed homes that survive get calm runs of 19 to 45 turns, so a return every
// few turns after a short calm heals them within an age, and nothing comes home to a settlement still in trouble.

import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const hc = await import("/emigration/ui/emigration-homecoming.js");

const ME = 0;
const AI = 2;

/** A world: city signals with a distress each, and the internal pairs still away. */
function world() {
  const w = {
    turn: 10,
    distress: { Rome: 0, Ostia: 0, Capua: 0, Pella: 0 },
    owner: { Rome: ME, Ostia: ME, Capua: ME, Pella: AI },
    lost: new Set(),
    pairs: { [ME]: [{ from: "Ostia", home: "Rome", host: ME, points: 3 }, { from: "Capua", home: "Rome", host: ME, points: 1 }] },
    moves: [],
    reports: []
  };
  w.trouble = {}; // settlement -> "war" | "other" while distressed (default "other")
  const deps = {
    troubleOf: (s) => w.trouble[s.name] || "other",
    signals: () => Object.keys(w.owner).map((name) => ({ owner: w.owner[name], name })),
    resolve: (s) => (w.lost.has(s.name) ? null : { name: s.name }),
    distressOf: (s) => w.distress[s.name],
    nameOf: (c) => c.name,
    pairs: (pid) => (w.pairs[pid] || []).filter((p) => p.points > 0).sort((a, b) => b.points - a.points),
    resolvable: () => (p) => !w.lost.has(p.home) && !w.lost.has(p.from),
    move: (pid, pair) => {
      w.moves.push([w.turn, pair.from, pair.home]);
      // The homecoming moves copies of the pairs (only those going back); the live count is the world's.
      const live = (w.pairs[pid] || []).find((p) => p.from === pair.from && p.home === pair.home);
      (live || pair).points -= 1;
      return true;
    },
    turn: () => w.turn,
    report: (pid, home, done) => w.reports.push([w.turn, home, done ? "done" : "start"]),
    local: ME
  };
  return { w, deps };
}

function reset() {
  for (const k of Object.keys(KV)) delete KV[k];
  hc._forgetHomecoming();
  CONFIG.homecomingEnabled = true;
  CONFIG.homecomingCalmTurns = 3;
  CONFIG.homecomingCalmTurnsAfterWar = 10;
  CONFIG.homecomingEveryTurns = 4;
  CONFIG.homecomingBatchPer = 8;
  // The tests before the split ran with everyone going back; they keep that, and the split has its own tests.
  CONFIG.homecomingReturnShare = 1;
  CONFIG.homecomingShareFloor = 1;
  CONFIG.homecomingHostBetterScale = 1;
}

/** Run turns from the world's current turn, each civ once per turn. */
function run(w, deps, turns, pids = [ME]) {
  for (let i = 0; i < turns; i++) {
    for (const pid of pids) hc.homecomingOnTurn(pid, deps);
    w.turn += 1;
  }
}

function testCalmStreaks() {
  reset();
  const { w, deps } = world();
  let calm = hc.updateCalm(ME, {}, deps);
  assert.deepEqual(calm, { Rome: 1, Ostia: 1, Capua: 1 }, "each of our calm settlements starts a streak; theirs aren't ours");
  w.distress.Rome = 5;
  calm = hc.updateCalm(ME, calm, deps);
  assert.equal(calm.Rome, 0, "trouble starts the count again");
  assert.equal(calm.Ostia, 2);
  w.lost.add("Capua");
  calm = hc.updateCalm(ME, calm, deps);
  assert.equal("Capua" in calm, false, "a settlement we no longer hold drops out");
}

function testTrickle() {
  reset();
  const { w, deps } = world();
  run(w, deps, 2);
  assert.equal(w.moves.length, 0, "nobody before three calm turns");
  run(w, deps, 1);
  assert.deepEqual(w.moves, [[12, "Ostia", "Rome"]], "on the third calm turn, one comes home from the largest group");
  assert.deepEqual(w.reports, [[12, "Rome", "start"]], "the player hears when their people start coming home");
  run(w, deps, 3);
  assert.equal(w.moves.length, 1, "then nobody until the wait is over");
  run(w, deps, 1);
  assert.deepEqual(w.moves.at(-1), [16, "Ostia", "Rome"], "four turns later, the next");
  run(w, deps, 8);
  assert.equal(w.moves.length, 4, "all four came home, one at a time");
  assert.deepEqual(w.moves.map((m) => m[0]), [12, 16, 20, 24], "every four turns");
  assert.deepEqual(w.reports.at(-1), [24, "Rome", "done"], "and the player hears when the last is back");
  run(w, deps, 10);
  assert.equal(w.moves.length, 4, "nobody comes home who wasn't away");
}

function testTroubleStopsIt() {
  reset();
  const { w, deps } = world();
  run(w, deps, 3);
  assert.equal(w.moves.length, 1);
  w.distress.Rome = 2;
  run(w, deps, 10);
  assert.equal(w.moves.length, 1, "nobody comes home while home is in trouble");
  w.distress.Rome = 0;
  run(w, deps, 2);
  assert.equal(w.moves.length, 1, "and the calm count starts over");
  run(w, deps, 1);
  assert.equal(w.moves.length, 2, "three calm turns later they start again");
}

function testLongerWaitAfterFighting() {
  // Watched 2026-10-25: Persia's frontier city Pārsa took four people back after three calm turns while it kept
  // being hit, and Persia lost it with them in it. After fighting or a siege the wait is longer.
  reset();
  const { w, deps } = world();
  w.distress.Rome = 4;
  w.trouble.Rome = "war";
  run(w, deps, 2);
  w.distress.Rome = 0;
  run(w, deps, 9);
  assert.equal(w.moves.length, 0, "nine calm turns after fighting: still nobody");
  run(w, deps, 1);
  assert.equal(w.moves.length, 1, "on the tenth, the first comes home");
  assert.equal(hc.calmNeeded("war"), 10);
  assert.equal(hc.calmNeeded("other"), 3);
  assert.equal(hc.calmNeeded(undefined), 3, "a home never seen in trouble gets the short wait");
  // A later famine at the same home resets to the short wait.
  w.distress.Rome = 2;
  w.trouble.Rome = "other";
  run(w, deps, 1);
  w.distress.Rome = 0;
  run(w, deps, 3);
  assert.equal(w.moves.length, 2, "after a famine, three calm turns are enough again");
  assert.equal(JSON.parse(KV.EmigrationHomecoming_v1).kind[ME].Rome, "other", "the last trouble is in the save");
}

function testLostHomesAndOtherCivs() {
  reset();
  const { w, deps } = world();
  w.lost.add("Rome");
  run(w, deps, 10);
  assert.equal(w.moves.length, 0, "nobody goes back to a settlement we lost");
  reset();
  const b = world();
  b.w.pairs[AI] = [{ from: "Pella", home: "Pella", host: AI, points: 0 }];
  run(b.w, b.deps, 3, [ME, AI]);
  assert.equal(b.w.moves.length, 1, "each civilization only moves its own people");
  b.w.pairs[AI] = [{ from: "Ostia", home: "Pella", host: AI, points: 2 }];
  b.w.owner.Ostia = AI;
  b.w.pairs[ME] = [];
  run(b.w, b.deps, 4, [ME, AI]);
  assert.ok(b.w.moves.some((m) => m[2] === "Pella"), "an AI's people come home the same way");
  assert.equal(b.w.reports.filter((r) => r[1] === "Pella").length, 0, "the player isn't told about an AI's homecoming");
}

function testOncePerTurnAndSwitch() {
  reset();
  const { w, deps } = world();
  w.turn = 12;
  for (let i = 0; i < 5; i++) hc.homecomingOnTurn(ME, deps);
  assert.deepEqual(hc.updateCalm(ME, {}, deps), { Rome: 1, Ostia: 1, Capua: 1 });
  assert.equal(JSON.parse(KV.EmigrationHomecoming_v1).calm[ME].Rome, 1, "five calls in one turn count as one turn");
  reset();
  CONFIG.homecomingEnabled = false;
  const b = world();
  run(b.w, b.deps, 10);
  assert.equal(b.w.moves.length, 0, "switched off, nobody moves");
}

function testSaveAndReload() {
  reset();
  const { w, deps } = world();
  run(w, deps, 3);
  assert.equal(w.moves.length, 1);
  hc._forgetHomecoming(); // a reload
  run(w, deps, 3);
  assert.equal(w.moves.length, 1, "the wait since the last return survives a reload");
  run(w, deps, 1);
  assert.equal(w.moves.length, 2);
  assert.equal(w.reports.filter((r) => r[2] === "start").length, 1, "a reload doesn't announce the homecoming again");
  assert.deepEqual(hc.cleanHomecoming({ calm: { 0: { A: "2", B: "x" } }, last: 5, ran: { 0: 3, 1: null } }),
    { calm: { 0: { A: 2 } }, last: {}, kind: {}, ran: { 0: 3 }, split: {} }, "junk in the save is dropped");
}

testCalmStreaks();
testTrickle();
testTroubleStopsIt();
testLongerWaitAfterFighting();
testLostHomesAndOtherCivs();
testOncePerTurnAndSwitch();
function testBatches() {
  // Twenty-three away: three come home a return, then two, then one, so a big loss refills in a few returns.
  reset();
  const { w, deps } = world();
  w.pairs[ME] = [{ from: "Ostia", home: "Rome", host: ME, points: 20 }, { from: "Capua", home: "Rome", host: ME, points: 3 }];
  run(w, deps, 3);
  assert.equal(w.moves.length, 3, "the first return brings three (1 + 23/8)");
  assert.ok(w.moves.every((m) => m[1] === "Ostia"), "from the largest group first");
  assert.equal(hc.batchFor(23), 3);
  assert.equal(hc.batchFor(7), 1);
  assert.equal(hc.batchFor(8), 2);
  run(w, deps, 50);
  assert.equal(w.moves.length, 23, "everyone came home: 3, 3, 3, 2, 2, 2, 2, then one at a time, thirteen returns");
  assert.ok(w.moves.at(-1)[0] <= 12 + 12 * 4, "in thirteen returns, not twenty-three");
}

testSaveAndReload();
testBatches();
console.log("homecoming: ok");
