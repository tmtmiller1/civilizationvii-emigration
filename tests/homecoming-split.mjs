// homecoming-split.mjs
//
// Not everyone who fled goes back (emigration-homecoming-split.js). Once home is calm, each group decides once how
// many go back: most after a short absence, fewer the longer they've been away, and fewer again when the settlement
// they live in now is clearly better off than home. The rest settle where they are.

import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const sp = await import("/emigration/ui/emigration-homecoming-split.js");
const hc = await import("/emigration/ui/emigration-homecoming.js");

const ME = 0;
const near = (a, b) => Math.abs(a - b) < 1e-9;

function defaults() {
  for (const k of Object.keys(KV)) delete KV[k];
  hc._forgetHomecoming();
  Object.assign(CONFIG, {
    homecomingEnabled: true, homecomingCalmTurns: 3, homecomingCalmTurnsAfterWar: 10, homecomingEveryTurns: 4,
    homecomingBatchPer: 8, homecomingReturnShare: 0.8, homecomingShareGraceTurns: 5,
    homecomingShareDropPerTurn: 0.02, homecomingShareFloor: 0.3, homecomingHostBetterScale: 0.75,
    homecomingHostBetterGap: 15
  });
}

function testShare() {
  defaults();
  assert.ok(near(sp.returnShare(0, false), 0.8), "a short absence: the base share");
  assert.ok(near(sp.returnShare(5, false), 0.8), "still the base at the end of the grace");
  assert.ok(near(sp.returnShare(10, false), 0.7), "two points fewer for each turn after");
  assert.ok(near(sp.returnShare(30, false), 0.3), "the floor at twenty-five turns past the grace");
  assert.ok(near(sp.returnShare(200, false), 0.3), "never under the floor");
  assert.ok(near(sp.returnShare(0, true), 0.6), "a quarter fewer when they're better off where they are");
  assert.ok(near(sp.returnShare(200, true), 0.225), "the floor, then the quarter");
  CONFIG.homecomingReturnShare = 0.2;
  assert.ok(near(sp.returnShare(0, false), 0.2), "a base under the floor keeps the base");
  assert.ok(sp.hostClearlyBetter(40, 25), "fifteen above home is clearly better");
  assert.ok(!sp.hostClearlyBetter(39, 25), "fourteen isn't");
  assert.ok(!sp.hostClearlyBetter(undefined, 25), "unknown isn't");
}

function testSplitCount() {
  defaults();
  assert.equal(sp.splitCount(10, 0.8, "a"), 8, "a whole share needs no roll");
  assert.equal(sp.splitCount(0, 0.8, "a"), 0);
  assert.equal(sp.splitCount(5, 1, "a"), 5);
  assert.equal(sp.splitCount(5, 0, "a"), 0);
  assert.equal(sp.splitCount(3, 0.5, "seed"), sp.splitCount(3, 0.5, "seed"), "the same seed decides the same way");
  let ones = 0;
  for (let i = 0; i < 2000; i++) ones += sp.splitCount(1, 0.3, "g" + i);
  assert.ok(ones > 500 && ones < 700, "a group of one goes back at the share's odds (" + ones + " of 2000)");
}

function testReconcile() {
  const e = { go: 3, stay: 2 };
  assert.equal(sp.reconcile(e, 7), 2, "two more away than decided: two undecided");
  assert.deepEqual(e, { go: 3, stay: 2 });
  assert.equal(sp.reconcile(e, 4), 0);
  assert.deepEqual(e, { go: 2, stay: 2 }, "a paid call takes those going back first");
  sp.reconcile(e, 1);
  assert.deepEqual(e, { go: 0, stay: 1 }, "then the settled");
  const book = { "A|Rome|0": { go: 1, stay: 1 }, "Gone|Rome|0": { go: 2, stay: 0 } };
  sp.observe(book, [{ from: "A", home: "Rome", host: ME, points: 4 }], 12);
  assert.deepEqual(book, { "A|Rome|0": { go: 1, stay: 1, seen: 12 } }, "new people are undecided from now; empty groups go");
  sp.observe(book, [{ from: "A", home: "Rome", host: ME, points: 4 }], 13);
  assert.equal(book["A|Rome|0"].seen, 12, "the first turn seen is kept");
  assert.equal(JSON.stringify(sp.cleanSplit({ 0: { k: { go: "2", stay: -1, seen: null }, j: 5 }, x: [] })),
    JSON.stringify({ 0: { k: { go: 2, stay: 0 } } }), "junk in the save is dropped");
}

/** A world for the full turn: Rome fled to Ostia and Capua during a war, then calm. */
function world(pros) {
  const w = {
    turn: 10, trouble: true,
    pairs: [{ from: "Ostia", home: "Rome", host: ME, points: 12 }, { from: "Capua", home: "Rome", host: ME, points: 6 }],
    moves: [], reports: [], splits: []
  };
  const names = ["Rome", "Ostia", "Capua"];
  const deps = {
    signals: () => names.map((name) => ({ owner: ME, name, pros: pros[name] })),
    resolve: (s) => ({ name: s.name }),
    distressOf: (s) => (s.name === "Rome" && w.trouble ? 5 : 0),
    troubleOf: () => "war",
    nameOf: (c) => c.name,
    pairs: () => w.pairs.filter((p) => p.points > 0).sort((a, b) => b.points - a.points),
    resolvable: () => () => true,
    move: (pid, pair) => {
      const live = w.pairs.find((p) => p.from === pair.from && p.home === pair.home);
      live.points -= 1;
      w.moves.push([w.turn, pair.from]);
      return true;
    },
    turn: () => w.turn,
    report: (pid, home, done) => w.reports.push([w.turn, home, done ? "done" : "start"]),
    reportSplit: (pid, home, go, stay) => w.splits.push([w.turn, home, go, stay]),
    local: ME
  };
  const run = (n) => {
    for (let i = 0; i < n; i++) {
      hc.homecomingOnTurn(ME, deps);
      w.turn += 1;
    }
  };
  return { w, deps, run };
}

function testWholeTurn() {
  defaults();
  const { w, run } = world({ Rome: 20, Ostia: 25, Capua: 50 });
  run(10); // ten turns of war: everyone counted undecided from turn 10
  w.trouble = false;
  run(10); // ten calm turns after fighting: they decide at turn 29, nineteen turns after they were first seen
  assert.equal(w.splits.length, 1, "one decision for Rome");
  const [turn, home, go, stay] = w.splits[0];
  assert.deepEqual([turn, home], [29, "Rome"]);
  // 19 turns away: 0.8 - 0.02 * 14 = 0.52. Ostia (+5) isn't clearly better: 12 × 0.52 = 6.24. Capua (+30) is:
  // 6 × 0.39 = 2.34. Six or seven from Ostia, two or three from Capua.
  assert.ok(go >= 8 && go <= 10, "about half come home (" + go + ")");
  assert.equal(go + stay, 18);
  run(60);
  assert.equal(w.moves.length, go, "only those going back came home");
  assert.equal(w.pairs.reduce((n, p) => n + p.points, 0), stay, "the rest are still where they went");
  assert.deepEqual(w.reports.at(-1).slice(1), ["Rome", "done"], "the notice when the last of those coming is back");
  const book = hc.homecomingSplitOf(ME);
  assert.equal(Object.values(book).reduce((n, e) => n + e.stay, 0), stay, "the settled are kept in the book");
  assert.equal(Object.values(book).reduce((n, e) => n + e.go, 0), 0);

  // Reload: the book comes back from the save.
  hc._forgetHomecoming();
  assert.equal(Object.values(hc.homecomingSplitOf(ME)).reduce((n, e) => n + e.stay, 0), stay, "kept in the save");
}

function testShortDisasterAllGoing() {
  defaults();
  CONFIG.homecomingReturnShare = 1;
  CONFIG.homecomingShareGraceTurns = 50;
  const { w, deps } = world({});
  deps.troubleOf = () => "other";
  const run = (n) => {
    for (let i = 0; i < n; i++) {
      hc.homecomingOnTurn(ME, deps);
      w.turn += 1;
    }
  };
  run(2);
  w.trouble = false;
  run(80);
  assert.equal(w.splits.length, 0, "with nobody staying, the plain start notice");
  assert.deepEqual(w.reports[0].slice(1), ["Rome", "start"]);
  assert.equal(w.moves.length, 18, "everyone came home");
}

function testNewWaveDecidesAgain() {
  defaults();
  const { w, run } = world({});
  run(1);
  w.trouble = false;
  run(10); // decided at turn 20, one turn away + ten calm: share 0.8 - 0.02 * 5 = 0.7
  const first = w.splits[0];
  assert.ok(first, "a decision");
  w.trouble = true;
  w.pairs[0].points += 5; // a second war drives five more out
  run(3);
  w.trouble = false;
  run(10);
  assert.equal(w.splits.length, 2, "the new people decide when home is calm again");
  assert.equal(w.splits[1][2] + w.splits[1][3], 5, "only the five new people decide; the others already have");
}

/** A save from before the split: its groups are backdated from the flow history, so a long absence counts. */
function testLegacyBackdate() {
  const decideAt100 = (legacy, noState) => {
    defaults();
    if (legacy) KV.EmigrationHomecoming_v1 = JSON.stringify({ calm: {}, last: {}, kind: {}, ran: {} });
    else if (!noState) KV.EmigrationHomecoming_v1 = JSON.stringify({ calm: {}, last: {}, kind: {}, ran: {}, split: {} });
    const { w, deps } = world({});
    deps.history = () => ({ [ME]: { "Ostia|Rome|0": 0, "Capua|Rome|0": 0 } });
    w.turn = 100;
    w.trouble = false;
    for (let i = 0; i < 4; i++) {
      hc.homecomingOnTurn(ME, deps);
      w.turn += 1;
    }
    return w.splits[0];
  };
  const none = decideAt100(false, true);
  assert.ok(none[2] <= 6, "a save from before homecoming is backdated too (" + none[2] + " of 18)");
  const old = decideAt100(true);
  assert.ok(old[2] <= 6, "fled at turn 0, deciding at 102: the floor, about 30% (" + old[2] + " of 18)");
  const fresh = decideAt100(false);
  assert.ok(fresh[2] >= 14, "a save that has the split already: counted from when they were seen (" + fresh[2] + ")");
}

testShare();
testSplitCount();
testLegacyBackdate();
testReconcile();
testWholeTurn();
testShortDisasterAllGoing();
testNewWaveDecidesAgain();
console.log("homecoming-split: ok");
