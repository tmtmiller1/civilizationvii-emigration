import assert from "node:assert/strict";

// In-memory GameConfiguration so the persistent log round-trips within the test.
let KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
let TURN = 1;
globalThis.Game = {
  get turn() {
    return TURN;
  }
};

const { logNotification, notificationLog, clearNotifications } = await import(
  "/emigration/ui/emigration-notifications.js"
);

function testAppendsNewestFirstStampedWithTurn() {
  clearNotifications();
  TURN = 5;
  logNotification({ kind: "digest", cause: "war", summary: "A", people: 36000, points: 3 });
  TURN = 8;
  logNotification({ kind: "cause", cause: "disaster", summary: "B", people: 1000, points: 1 });
  const log = notificationLog();
  assert.equal(log.length, 2);
  assert.equal(log[0].summary, "B"); // newest first
  assert.equal(log[0].turn, 8); // stamped with the current game turn
  assert.equal(log[0].cause, "disaster");
  assert.equal(log[1].summary, "A");
  assert.equal(log[1].turn, 5);
}

function testPersistsToGameConfiguration() {
  // The log must survive save/reload — it writes the full list to GameConfiguration on every append.
  assert.equal(typeof KV.EmigrationNotif_v1, "string");
  const parsed = JSON.parse(KV.EmigrationNotif_v1);
  assert.equal(parsed[0].summary, "B"); // newest-first preserved in the persisted blob
}

function testKeepsStructuredDetail() {
  clearNotifications();
  logNotification({
    kind: "digest", cause: "war", summary: "fled the fighting", people: 12000, points: 1,
    event: "Roman–Carthaginian War",
    fromCity: "Rome", fromCiv: "Roman", toCity: "Carthage", toCiv: "Carthaginian", crossCiv: true
  });
  const e = notificationLog()[0];
  assert.equal(e.fromCity, "Rome");
  assert.equal(e.toCiv, "Carthaginian");
  assert.equal(e.crossCiv, true);
  assert.equal(e.event, "Roman–Carthaginian War"); // the specific named war is retained
}

function testCapsLengthKeepingNewest() {
  clearNotifications();
  for (let i = 0; i < 200; i++) logNotification({ cause: "war", summary: "n" + i });
  const log = notificationLog();
  assert.ok(log.length <= 120, "log is capped");
  assert.equal(log[0].summary, "n199"); // the newest entry is retained
}

testAppendsNewestFirstStampedWithTurn();
testPersistsToGameConfiguration();
testKeepsStructuredDetail();
testCapsLengthKeepingNewest();
console.log("notifications harness passed");
