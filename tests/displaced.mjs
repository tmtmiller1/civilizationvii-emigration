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
const { yieldsText, whereText, waitText, abroadText } = await import("/emigration/ui/emigration-displaced-view.js");

const ME = 0;
CONFIG.callHomeEnabled = true;
CONFIG.homecomingEnabled = true;
CONFIG.homecomingCalmTurns = 3;
CONFIG.homecomingCalmTurnsAfterWar = 10;
CONFIG.homecomingEveryTurns = 4;
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
  assert.deepEqual(rome.internal, [{ from: "Ostia", points: 9 }, { from: "Ravenna", points: 3 }]);
  assert.deepEqual(rome.abroad, [{ from: "Athens", host: 4, civ: "Greece", points: 2 }]);
  assert.equal(rome.since, 71);
  assert.deepEqual(rome.wait, { calm: 5, needed: 3, every: 4, nextIn: 2, allIn: 2 + 11 * 4 },
    "calm enough: the next return is two turns after the last, the twelfth 44 turns after that");
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
    { calm: 1, needed: 3, every: 4, nextIn: 2, allIn: 18 }, "not calm long enough: two more calm turns, then four each");
  assert.deepEqual(waitFor({ calm: 3, needed: 3, every: 4, last: null, turn: 10 }, 1),
    { calm: 3, needed: 3, every: 4, nextIn: 0, allIn: 0 }, "calm and never returned: the first comes next turn");
  assert.deepEqual(waitFor({ calm: 12, needed: 10, every: 4, last: 9, turn: 10 }, 2).nextIn, 3, "three turns after the last");
  assert.equal(abroadCallFor(0, 0), null);
}

function testLines() {
  const rows = displacedModel(ME, seams());
  const rome = rows[0];
  assert.equal(yieldsText(rome.tile.perTile), "+2.4 Food, +1 Production, +0.5 Culture");
  assert.equal(whereText(rome), "9 in Ostia, 3 in Ravenna, 2 in Athens (Greece)");
  assert.equal(waitText(rome), "Free: the next one comes home in 2 turns, and the last in about 46 turns.");
  assert.equal(abroadText(rome.abroadCall),
    "Call 2 from abroad: 18% each, about 0.4 expected to come, for 255 Gold or 51 Influence. "
    + "That's about 708 Gold or 142 Influence for each person who comes.");
  const soon = displacedModel(ME, seams({ homecoming: () => ({ calm: 1, needed: 10, every: 4, last: null, turn: 5 }) }))[0];
  assert.equal(waitText(soon), "Free, once Rome has been calm for 9 more turns; then one comes home every 4 turns.");
  const now = displacedModel(ME, seams({ homecoming: () => ({ calm: 3, needed: 3, every: 4, last: null, turn: 5 }) }))[0];
  assert.equal(waitText(now), "Free: one comes home next turn, and the last in about 44 turns.");
  CONFIG.homecomingEnabled = false;
  const off = displacedModel(ME, seams())[0];
  assert.equal(off.wait, null);
  assert.equal(waitText(off), "People at home only come back when called.");
  CONFIG.homecomingEnabled = true;
}

testModel();
testWaitCases();
testLines();
console.log("displaced: ok");
