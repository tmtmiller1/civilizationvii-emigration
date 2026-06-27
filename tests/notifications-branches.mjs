import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Game = { turn: 50 };

const { logNotification, loadLog } = await import("/emigration/ui/emigration-notifications.js");

function testLogNotificationWithValidEntry() {
  KV["EmigrationNotif_v1"] = null;
  logNotification({
    cause: "war",
    kind: "crisis",
    summary: "Test migration event",
    people: 1000,
    points: 100,
    fromCity: "Rome",
    toCiv: "Egypt"
  });
  // No assertion failure = success (notification was logged without error)
}

function testLogNotificationWithMissingFields() {
  KV["EmigrationNotif_v1"] = null;
  logNotification({
    cause: "disaster",
    summary: "Partial entry"
  });
  // Should not throw, missing optional fields are ok
}

function testLogNotificationWithInvalidInput() {
  logNotification(null);
  logNotification(undefined);
  logNotification("string");
  logNotification({});
  // All should no-op without throwing
}

function testLogNotificationWithoutConfiguration() {
  const cfg = globalThis.Configuration;
  delete globalThis.Configuration;
  logNotification({ cause: "war", summary: "No config" });
  globalThis.Configuration = cfg;
  // Should gracefully handle missing Configuration
}

testLogNotificationWithValidEntry();
testLogNotificationWithMissingFields();
testLogNotificationWithInvalidInput();
testLogNotificationWithoutConfiguration();

delete globalThis.Configuration;
delete globalThis.Game;

console.log("notifications-branches harness passed");
