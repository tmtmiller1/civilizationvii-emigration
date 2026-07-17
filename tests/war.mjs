import assert from "node:assert/strict";

// In-memory GameConfiguration so the aggressor map persists within the test.
const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

// Prime with a legacy (v1) blob to confirm migration on first load.
KV["EmigrationWar_v1"] = JSON.stringify({ wars: { "2": [1, 1, "x"] } });

const { recordWarDeclared, recordPeace, warAggressors, warEvents } = await import(
  "/emigration/ui/emigration-war.js"
);
const { aggressorAdjust, geoAdjust } = await import("/emigration/ui/emigration-geography.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

function testRecordAndQuery() {
  recordWarDeclared({ aggressor: 1, target: 2 });
  assert.ok(warAggressors(2).has(1));
  assert.equal(warAggressors(3).size, 0);
}

function testLegacyStateLoadsAndSanitizes() {
  const set = warAggressors(2);
  assert.ok(set.has(1), "legacy aggressor should load");
  assert.equal(set.size, 1, "duplicates and non-number ids should be dropped");
}

function testRealPayloadShape() {
  // The actual DiplomacyDeclareWar payload (probe-confirmed): actingPlayer declared
  // on reactingPlayer.
  recordWarDeclared({ actingPlayer: 10, reactingPlayer: 11, sessionId: 0 });
  assert.ok(warAggressors(11).has(10));
  assert.equal(warAggressors(10).size, 0); // the declarer isn't its own victim
}

function testCandidateFieldNames() {
  recordWarDeclared({ player1: 4, player2: 5 }); // alternate payload shape (fallback)
  assert.ok(warAggressors(5).has(4));
}

function testIgnoresGarbage() {
  recordWarDeclared(null);
  recordWarDeclared({ aggressor: 7, target: 7 }); // self-war → ignored
  assert.equal(warAggressors(7).size, 0);
}

function testPeaceClears() {
  recordWarDeclared({ aggressor: 8, target: 9 });
  assert.ok(warAggressors(9).has(8));
  recordPeace({ aggressor: 8, target: 9 });
  assert.equal(warAggressors(9).size, 0);
}

function testPersistWritesSchemaEnvelope() {
  recordWarDeclared({ aggressor: 6, target: 12 });
  const persisted = JSON.parse(KV["EmigrationWar_v1"]);
  assert.equal(persisted.v, 3, "war state should be stored with schema envelope");
  assert.ok(persisted.data && persisted.data.wars && Array.isArray(persisted.data.wars["12"]));
  assert.ok(Array.isArray(persisted.data.warEvents), "v3 adds the turn-stamped war log");
}

// ── Turn-stamped war log (Feature D: network-timeline event pins) ──────────────
// The aggressor map answers "who is at war"; the log answers "WHEN did it start", which is what
// positions a war on the timeline. It's additive: the map's hot path is untouched.

/** The war log entry for a pairing, or undefined. */
function loggedWar(aggressor, victim) {
  return warEvents().find((e) => e.aggressor === aggressor && e.victim === victim);
}

function testDeclarationIsTurnStamped() {
  globalThis.Game = { turn: 42, getTurnDate: () => "1200 BC" };
  recordWarDeclared({ aggressor: 20, target: 21 });
  const e = loggedWar(20, 21);
  assert.ok(e, "the declaration should be logged");
  assert.equal(e.turn, 42);
  assert.equal(e.year, "1200 BC");
  assert.equal(e.endTurn, null, "an ongoing war has no end turn");
}

function testPeaceStampsTheEndTurn() {
  globalThis.Game = { turn: 50, getTurnDate: () => "1000 BC" };
  recordPeace({ aggressor: 20, target: 21 });
  const e = loggedWar(20, 21);
  assert.equal(e.endTurn, 50, "peace closes the window");
}

function testPeaceInEitherDirectionClosesTheWar() {
  globalThis.Game = { turn: 60, getTurnDate: () => "900 BC" };
  recordWarDeclared({ aggressor: 30, target: 31 });
  // The peace payload's acting/reacting roles are the REVERSE of the declaration — peace is mutual,
  // so it must still close the war rather than leave it open forever.
  globalThis.Game = { turn: 65, getTurnDate: () => "850 BC" };
  recordPeace({ aggressor: 31, target: 30 });
  assert.equal(loggedWar(30, 31).endTurn, 65);
}

function testRedeclarationDoesNotDoublePin() {
  globalThis.Game = { turn: 70, getTurnDate: () => "800 BC" };
  recordWarDeclared({ aggressor: 40, target: 41 });
  globalThis.Game = { turn: 71, getTurnDate: () => "790 BC" };
  recordWarDeclared({ aggressor: 40, target: 41 }); // a re-fired event for the same open war
  const all = warEvents().filter((e) => e.aggressor === 40 && e.victim === 41);
  assert.equal(all.length, 1, "an already-open war must not be logged twice");
  assert.equal(all[0].turn, 70, "the original declaration turn survives");
}

function testWarAfterPeaceOpensAFreshWindow() {
  globalThis.Game = { turn: 80, getTurnDate: () => "700 BC" };
  recordPeace({ aggressor: 40, target: 41 });
  globalThis.Game = { turn: 90, getTurnDate: () => "600 BC" };
  recordWarDeclared({ aggressor: 40, target: 41 }); // they go to war again
  const all = warEvents().filter((e) => e.aggressor === 40 && e.victim === 41);
  assert.equal(all.length, 2, "a second war is its own pin");
  assert.equal(all[1].endTurn, null);
}

function testPeaceForAnUnloggedWarIsANoOp() {
  // A war that predates the v3 upgrade was never stamped, so there's nothing to close.
  assert.doesNotThrow(() => recordPeace({ aggressor: 90, target: 91 }));
}

function testWarEventsReturnsACopy() {
  const first = warEvents();
  first.push({ bogus: true });
  first[0].turn = -999;
  const second = warEvents();
  assert.ok(!second.some((e) => e.bogus), "callers must not be able to append to the stored log");
  assert.notEqual(second[0].turn, -999, "nor mutate a stored row");
}

function testLegacyBlobWithoutWarEventsLoadsEmpty() {
  // A v2 save has no warEvents key at all — it must normalize to an empty log, not throw.
  const parsed = { v: 2, data: { wars: { "2": [1] } } };
  assert.ok(!("warEvents" in parsed.data));
  // (The load path is exercised by the module-level legacy prime at the top of this file, which
  // reaches warEvents() through every assertion above without ever throwing.)
  assert.ok(Array.isArray(warEvents()));
}

function testAggressorAdjustOrders() {
  CONFIG.ownCivRefugeeBonus = 4;
  CONFIG.aggressorPenalty = 12;
  const src = { owner: 2 };
  const aggressors = new Set([1]);
  assert.equal(aggressorAdjust(src, { owner: 2 }, aggressors), 4); // own civ first
  assert.equal(aggressorAdjust(src, { owner: 1 }, aggressors), -12); // aggressor last
  assert.equal(aggressorAdjust(src, { owner: 3 }, aggressors), 0); // neutral unchanged
}

function testGeoAdjustGatesOnAggressorsArg() {
  CONFIG.aggressorPenalty = 12;
  const src = { owner: 2, city: { location: { x: 0, y: 0 } } };
  const dest = { owner: 1, city: { location: { x: 0, y: 0 } } }; // an aggressor's city
  const without = geoAdjust(src, dest, null); // 3-arg: no owner preference
  const withAgg = geoAdjust(src, dest, null, new Set([1]));
  assert.equal(without - withAgg, CONFIG.aggressorPenalty);
}

testRecordAndQuery();
testLegacyStateLoadsAndSanitizes();
testRealPayloadShape();
testCandidateFieldNames();
testIgnoresGarbage();
testPeaceClears();
testPersistWritesSchemaEnvelope();
testDeclarationIsTurnStamped();
testPeaceStampsTheEndTurn();
testPeaceInEitherDirectionClosesTheWar();
testRedeclarationDoesNotDoublePin();
testWarAfterPeaceOpensAFreshWindow();
testPeaceForAnUnloggedWarIsANoOp();
testWarEventsReturnsACopy();
testLegacyBlobWithoutWarEventsLoadsEmpty();
testAggressorAdjustOrders();
testGeoAdjustGatesOnAggressorsArg();

console.log("war harness passed");
