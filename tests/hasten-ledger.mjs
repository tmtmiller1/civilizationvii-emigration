// hasten-ledger.mjs
//
// What a paid call buys, as the Displaced card and the call dialog spell it out (emigration-hasten-ledger.js): the
// tile a returnee works at home, the tile they leave where they live now, the civilization's net per person, and
// the turns the fee saves over the free homecoming. The owner's ask (2026-10-26): "WHAT ARE WE PAYING FOR?"

import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Locale = { compose: (s) => s };

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { CALL_HOME_SCOPE } = await import("/emigration/ui/emigration-call-home.js");
const L = await import("/emigration/ui/emigration-hasten-ledger.js");
const { callHomeView } = await import("/emigration/ui/emigration-call-home-view.js");
const { displacedModel } = await import("/emigration/ui/emigration-displaced.js");

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

const ME = 0;
const TILES = {
  Rome: { YIELD_FOOD: 2.4, YIELD_PRODUCTION: 1, YIELD_CULTURE: 0.5, YIELD_HAPPINESS: 1 },
  Ostia: { YIELD_FOOD: 1, YIELD_GOLD: 2 },
  Ravenna: { YIELD_FOOD: 3, YIELD_PRODUCTION: 1 }
};
const lostText = (lost) => lost.map((e) => e.type.replace("IMPROVEMENT_", "").toLowerCase() + (e.count > 1 ? " ×" + e.count : "")).join(", ");

/** Rome's people in Ostia (9) and Ravenna (3) and Athens (2), with a farm torn down. */
function rome(over) {
  return displacedModel(ME, {
    candidates: () => ({
      internal: [{ from: "Ostia", home: "Rome", host: ME, points: 9 }, { from: "Ravenna", home: "Rome", host: ME, points: 3 }],
      external: [{ from: "Athens", home: "Rome", host: 4, points: 2 }]
    }),
    resolvable: () => () => true,
    homecoming: () => ({ calm: 5, needed: 3, every: 4, last: 20, kind: "other", turn: 22 }),
    firstTurns: () => ({ Rome: 71 }),
    tileYields: (pid, city) => TILES[city] || null,
    cooldown: () => 0,
    civ: () => "Greece",
    lostTiles: () => [{ t: "IMPROVEMENT_FARM", p: 201, turn: 40 }],
    ...(over || {})
  })[0];
}

function testArithmetic() {
  const r = rome();
  assert.deepEqual(r.internal.map((p) => p.tile), [TILES.Ostia, TILES.Ravenna], "each host's tile rides on the row");
  const loss = L.hostLoss(r.internal);
  assert.deepEqual(loss, { YIELD_FOOD: 1.5, YIELD_PRODUCTION: 0.3, YIELD_GOLD: 1.5, YIELD_SCIENCE: 0, YIELD_CULTURE: 0, YIELD_HAPPINESS: 0 },
    "the tile left behind is the hosts' average, weighted by how many are in each");
  assert.equal(L.hostLoss([{ from: "X", points: 2, tile: null }]), null, "unreadable hosts give no loss");
  const net = L.netPerPerson(TILES.Rome, loss);
  assert.equal(net.YIELD_FOOD, 0.9);
  assert.equal(net.YIELD_GOLD, -1.5);
  assert.equal(L.signedYieldsText(net), "+1 Food, +1 Production, −1 Gold", "signed, the three largest, zeroes dropped");
  assert.equal(L.signedYieldsText(net, true), "+1 Food, +1 Production, +1 Culture", "gains only");
  assert.deepEqual(L.turnsForN({ nextIn: 2, every: 4, batch: 2 }, 3), { first: 2, last: 6 },
    "three people: the first batch in two turns, the second four later");
  assert.deepEqual(L.turnsForN({ nextIn: 0, every: 4, batch: 3 }, 3), { first: 0, last: 0 }, "all in the next batch");
  assert.equal(L.turnsForN(null, 3), null);
}

function testLines() {
  const r = rome();
  assert.equal(L.worthText(r),
    "each returnee works a Rome tile, about +2 Food, +1 Production, +1 Culture a turn, and leaves a tile where they live now "
    + "(about +2 Food, +2 Gold a turn).");
  assert.equal(L.hastenText(r), "312 Gold or 62 Influence brings 3 back this turn, instead of over the next 6 turns.");
  assert.equal(L.insteadText({ first: 4, last: 4 }), "instead of in 4 turns", "one batch: a point in time");
  assert.equal(L.insteadText({ first: 0, last: 0 }), "", "next turn anyway: nothing to say");
  assert.equal(L.insteadText(null), "");
  const ledger = L.hastenLedger(r, 3, lostText);
  assert.deepEqual(ledger, [
    "Rome gains: each returnee works a Rome tile, about +2 Food, +1 Production, +1 Culture a turn. farm, torn down as they left, are rebuilt first.",
    "Ostia gives up: 9 of them work Ostia tiles today, about +2 Gold, +1 Food each a turn; those tiles go idle when they leave.",
    "Ravenna gives up: 3 of them work Ravenna tiles today, about +3 Food, +1 Production each a turn; those tiles go idle when they leave.",
    "Overall: per person, your civilization swaps a tile where they live now for a tile at Rome, about +1 Food, +1 Production, "
    + "−1 Gold a turn. The fee buys time: home this turn instead of over the next 6 turns; the free homecoming brings them anyway."
  ]);
  const abroad = L.abroadLedger(r, lostText);
  assert.equal(abroad.length, 3);
  assert.match(abroad[1], /^Nothing of yours is given up/);
  assert.equal(abroad[2],
    "About 18% answer, so calling 2 brings about 0.4. The fee is paid either way: about 708 Gold or 142 Influence for each person who comes.");
  // No readable host tiles: the line falls back to the home's side alone, and the old worth line.
  const blind = rome({ tileYields: (pid, city) => (city === "Rome" ? TILES.Rome : null) });
  assert.match(L.worthText(blind), /^each returnee settles a new tile at Rome/);
  assert.match(L.hastenLedger(blind, 3, lostText)[1], /^Ostia gives up: 9 of them live there today\.$/);
  CONFIG.homecomingEnabled = false;
  const off = rome();
  assert.equal(L.hastenText(off), "bring 3 back now for 312 Gold or 62 Influence.");
  assert.match(L.hastenLedger(off, 3, lostText).at(-1), /They only come home when called\.$/);
  CONFIG.homecomingEnabled = true;
}

function testDialogCarriesTheLedger() {
  const r = rome();
  const flows = [{ src: ME, dest: ME, srcCity: "Rome", destCity: "Ostia", points: 9, byCause: { war: 900 } },
    { src: ME, dest: ME, srcCity: "Rome", destCity: "Ravenna", points: 3, byCause: { war: 300 } }];
  const ledger = L.hastenLedger(r, 3, lostText);
  const v = callHomeView(ME, CALL_HOME_SCOPE.INTERNAL, { flows, afford: () => Infinity, civ: () => "", home: "Rome",
    ledger, wait: r.wait });
  assert.equal(v.title, "Bring Rome's people home");
  assert.equal(v.body, "12 of Rome's people live in other settlements of ours. They come home free, 2 at a time every 4 turns, "
    + "starting in 2 turns, all of them in about 34 turns. Paying brings up to 3 back this turn.");
  assert.deepEqual(v.details, ledger, "the ledger stands in for the pair lines");
  assert.equal(v.choices.at(-1).label, "Wait for the free homecoming");
  assert.equal(v.choices.at(-1).id, "no");
  const plain = callHomeView(ME, CALL_HOME_SCOPE.INTERNAL, { flows, afford: () => Infinity, civ: () => "" });
  assert.equal(plain.title, "Call our people home", "the pop-up without a settlement keeps its old shape");
  assert.deepEqual(plain.details, ["9 from Ostia back to Rome", "3 from Ravenna back to Rome"]);
  CONFIG.homecomingEnabled = false;
  assert.equal(callHomeView(ME, CALL_HOME_SCOPE.INTERNAL, { flows, afford: () => Infinity, civ: () => "" }).choices.at(-1).label,
    "Leave them where they are", "with the free homecoming off, the way out is leaving them");
  CONFIG.homecomingEnabled = true;
}

testArithmetic();
testLines();
testDialogCarriesTheLedger();
console.log("hasten-ledger: ok");
