// displaced.mjs
//
// The Displaced tab's model and its lines (emigration-displaced.js, emigration-displaced-view.js). Designed
// 2026-10-25 to replace the call-home pop-up: where your displaced people are, what a returnee is worth (a tile at
// home, not the AI's city average), when they come home free, and what hastening or calling from abroad costs,
// with the gamble's cost per person who actually comes.

import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Locale = { compose: (s) => s };

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { displacedModel, waitFor, abroadCallFor } = await import("/emigration/ui/emigration-displaced.js");
const { yieldsText, whereText, waitText, abroadText, freeLines } = await import("/emigration/ui/emigration-displaced-view.js");

const ME = 0;
CONFIG.callHomeEnabled = true;
CONFIG.homecomingEnabled = true;
CONFIG.homecomingCalmTurns = 3;
CONFIG.homecomingCalmTurnsAfterWar = 10;
CONFIG.homecomingEveryTurns = 4;
CONFIG.homecomingBatchPer = 8;
CONFIG.callHomeMaxPointsPerAttempt = 3;
CONFIG.callHomeGoldPerPoint = 60;
CONFIG.callHomeInfluencePerPoint = 12;
CONFIG.callHomeExternalCostScale = 1.5;
CONFIG.callHomeAgeCostStep = 3;
CONFIG.callHomeChanceExternal = 0.18;

/** Seams for one world: Rome's people in Ostia, Ravenna and Athens; Capua lost, its people in Ostia. */
function seams(over) {
  return {
    candidates: () => ({
      internal: [
        { from: "Ostia", home: "Rome", host: ME, points: 9 }, { from: "Ravenna", home: "Rome", host: ME, points: 3 },
        { from: "Ostia", home: "Capua", host: ME, points: 2 }
      ],
      external: [{ from: "Athens", home: "Rome", host: 4, points: 2 }]
    }),
    resolvable: () => (p) => p.home !== "Capua",
    homecoming: (pid, home) => ({ calm: 5, needed: 3, every: 4, last: 20, kind: "other", turn: 22 }),
    firstTurns: () => ({ Rome: 71, Capua: 80 }),
    tileYields: (pid, home) => (home === "Rome" ? { YIELD_FOOD: 2.4, YIELD_PRODUCTION: 1, YIELD_CULTURE: 0.5 } : null),
    cooldown: (pid, scope) => (scope === "external" ? 3 : 0),
    civ: (host) => (host === 4 ? "Greece" : "?"),
    ...(over || {})
  };
}

function testModel() {
  const rows = displacedModel(ME, seams());
  assert.deepEqual(rows.map((r) => [r.home, r.total, r.held]), [["Rome", 14, true], ["Capua", 2, false]],
    "one row per home, most away first; a lost home is marked");
  const rome = rows[0];
  assert.deepEqual(rome.internal, [{ from: "Ostia", points: 9, stay: 0, tile: null }, { from: "Ravenna", points: 3, stay: 0, tile: null }],
    "each host carries what a tile there yields, when it can be read");
  assert.deepEqual(rome.abroad, [{ from: "Athens", host: 4, civ: "Greece", points: 2 }]);
  assert.equal(rome.since, 71);
  assert.deepEqual(rome.wait, { calm: 5, needed: 3, every: 4, nextIn: 2, allIn: 2 + 8 * 4, batch: 2 },
    "calm enough: the next return (two people, twelve away) is two turns after the last; nine returns clear twelve");
  assert.equal(rome.tile.total, 3.9);
  assert.deepEqual(rome.hasten, { n: 3, gold: 312, influence: 62, cooldown: 0 }, "three at the internal price");
  assert.equal(rome.abroadCall.n, 2);
  assert.equal(rome.abroadCall.chance, 0.18);
  assert.equal(rome.abroadCall.expected, 0.4);
  assert.equal(rome.abroadCall.gold, 255, "60 × 2^1.5 × 1.5");
  assert.equal(rome.abroadCall.perGold, Math.round(255 / 0.36), "what each person who comes really costs");
  assert.equal(rome.abroadCall.cooldown, 3);
  const capua = rows[1];
  assert.equal(capua.wait, null);
  assert.equal(capua.hasten, null);
  assert.equal(capua.tile, null, "a lost home gets no worth, wait or prices");
  assert.equal(capua.since, 80);
}

function testWaitCases() {
  assert.deepEqual(waitFor({ calm: 1, needed: 3, every: 4, last: null, turn: 10 }, 5),
    { calm: 1, needed: 3, every: 4, nextIn: 2, allIn: 18, batch: 1 }, "not calm long enough: two more calm turns, then four each");
  assert.deepEqual(waitFor({ calm: 3, needed: 3, every: 4, last: null, turn: 10 }, 1),
    { calm: 3, needed: 3, every: 4, nextIn: 0, allIn: 0, batch: 1 }, "calm and never returned: the first comes next turn");
  assert.equal(waitFor({ calm: 3, needed: 3, every: 4, last: null, turn: 10 }, 23).batch, 3, "twenty-three away: three a return");
  assert.deepEqual(waitFor({ calm: 12, needed: 10, every: 4, last: 9, turn: 10 }, 2).nextIn, 3, "three turns after the last");
  assert.equal(abroadCallFor(0, 0), null);
}

function testLines() {
  const rows = displacedModel(ME, seams());
  const rome = rows[0];
  assert.equal(yieldsText(rome.tile.perTile), "+2 Food, +1 Production, +1 Culture", "whole numbers, the three largest");
  assert.equal(whereText(rome), "9 in Ostia, 3 in Ravenna, 2 in Athens (Greece)");
  assert.equal(waitText(rome), "Free: the next 2 come home in 2 turns, and the last in about 34 turns.");
  assert.equal(abroadText(rome.abroadCall),
    "Call 2 from abroad: 18% each, about 0.4 expected to come, for 255 Gold or 51 Influence. "
    + "That's about 708 Gold or 142 Influence for each person who comes.");
  // Everyone in these groups has already decided to go back (an earlier calm spell), so the old pacing holds.
  const allGoing = () => ({ "Ostia|Rome|0": { go: 9, stay: 0 }, "Ravenna|Rome|0": { go: 3, stay: 0 } });
  const soon = displacedModel(ME, seams({ split: allGoing,
    homecoming: () => ({ calm: 1, needed: 10, every: 4, last: null, turn: 5 }) }))[0];
  assert.equal(waitText(soon), "Free, once Rome has been calm for 9 more turns; then 2 come home every 4 turns, all of them in about 41 turns.");
  const now = displacedModel(ME, seams({ homecoming: () => ({ calm: 3, needed: 3, every: 4, last: null, turn: 5 }) }))[0];
  assert.equal(waitText(now), "Free: 2 come home next turn, and the last in about 32 turns.");
  // The table's Free homecoming column: the same facts in short lines.
  assert.deepEqual(freeLines(rome), ["next 2 in 2 turns", "all in about 34 turns"]);
  assert.deepEqual(freeLines(soon), ["calm in 9 more turns", "then 2 every 4 turns", "all in about 41 turns"]);
  assert.deepEqual(freeLines(now), ["next 2 next turn", "all in about 32 turns"]);
  testSplitLines();
  CONFIG.homecomingEnabled = false;
  const off = displacedModel(ME, seams())[0];
  assert.equal(off.wait, null);
  assert.equal(waitText(off), "People at home only come back when called.");
  assert.deepEqual(freeLines(off), ["only when called"]);
  CONFIG.homecomingEnabled = true;
}

/** Groups that haven't decided, that have partly settled, and that have all settled where they went. */
function testSplitLines() {
  const calmLater = () => ({ calm: 1, needed: 10, every: 4, last: null, turn: 5 });
  const deciding = displacedModel(ME, seams({ homecoming: calmLater }))[0];
  assert.equal(deciding.deciding, true, "nobody has decided before home is calm");
  assert.equal(waitText(deciding), "Once Rome has been calm for 9 more turns, the people who fled it decide whether "
    + "to come home. The longer they've been away, and the better off they are where they live now, the more of them stay.");
  assert.deepEqual(freeLines(deciding), ["calm in 9 more turns", "then they decide whether to return"]);

  const partSplit = () => ({ "Ostia|Rome|0": { go: 6, stay: 3 }, "Ravenna|Rome|0": { go: 1, stay: 2 } });
  const part = displacedModel(ME, seams({ split: partSplit }))[0];
  assert.equal(part.settled, 5, "three in Ostia and two in Ravenna stay");
  assert.equal(part.deciding, false);
  assert.deepEqual(part.internal.map((p) => p.stay), [3, 2]);
  assert.equal(part.wait.batch, 1, "seven still coming: one a return");
  assert.deepEqual(freeLines(part), ["next 1 in 2 turns", "the last in about 26 turns", "5 staying where they are"]);
  assert.match(waitText(part), /5 of them have settled where they went and will stay unless you pay to bring them back\.$/);
  assert.ok(part.hasten, "Hasten still offers to bring people back");

  const allStay = () => ({ "Ostia|Rome|0": { go: 0, stay: 9 }, "Ravenna|Rome|0": { go: 0, stay: 3 } });
  const stayed = displacedModel(ME, seams({ split: allStay }))[0];
  assert.equal(stayed.wait, null, "nobody is coming, so there's no timing");
  assert.deepEqual(freeLines(stayed), ["12 staying where they are"]);
  assert.equal(waitText(stayed), "12 of them have settled where they went and will stay unless you pay to bring them back.");
  assert.ok(stayed.hasten, "Hasten can still bring the settled back");

  // A paid call brought four of Ostia's people home: they come off those going back first.
  const fewer = displacedModel(ME, seams({ split: partSplit, candidates: () => ({
    internal: [{ from: "Ostia", home: "Rome", host: ME, points: 5 }, { from: "Ravenna", home: "Rome", host: ME, points: 3 }],
    external: [] }) }))[0];
  assert.deepEqual(fewer.internal.map((p) => p.stay), [3, 2], "the settled stay settled");
}

testModel();
testWaitCases();
testLines();
console.log("displaced: ok");
