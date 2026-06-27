import assert from "node:assert/strict";

let toasts = 0;
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, set textContent(_v) {}, remove() {}, appendChild() {} }),
  head: { appendChild: () => {} },
  body: { appendChild: () => (toasts += 1) }
};
globalThis.setTimeout = () => 0;

globalThis.localStorage = {
  _m: {},
  getItem(k) {
    return this._m[k] ?? null;
  },
  setItem(k, v) {
    this._m[k] = String(v);
  }
};

let TURN = 1;
globalThis.Game = {
  get turn() {
    return TURN;
  }
};

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

globalThis.GameContext = { localPlayerID: 0 };
globalThis.Players = {
  get(pid) {
    if (pid === 0) {
      return {
        Diplomacy: { hasMet: (other) => other === 1 },
        civilizationType: "ROME",
        civilizationName: "Rome",
        isMajor: true
      };
    }
    if (pid === 1) return { civilizationType: "PERSIA", civilizationName: "Persia", isMajor: true };
    if (pid === 2) return { civilizationType: "EGYPT", civilizationName: "Egypt", isMajor: true };
    return null;
  }
};

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const settings = await import("/emigration/ui/emigration-settings.js");
const { reportPassFeedback, announceImportant } = await import("/emigration/ui/emigration-feedback.js");
const { notificationLog, clearNotifications } = await import("/emigration/ui/emigration-notifications.js");

globalThis.EmigrationData = {
  refugeesCumFor() {
    return 0;
  },
  emigrationByCauseFor() {
    return { war: 1 };
  },
  disasterEvents() {
    return [];
  }
};

function testImportantToastRespectsNotifyToastsFlag() {
  CONFIG.notifyMode = 1;
  CONFIG.notifyToasts = false;
  CONFIG.notifyCooldownTurns = 0;
  toasts = 0;
  TURN = 10;
  announceImportant("x", "war", true);
  assert.equal(toasts, 0, "toast channel should honor notifyToasts=false");
  CONFIG.notifyToasts = true;
}

function testLocalDigestMasksUnmetDestinations() {
  clearNotifications();
  settings.setVisibilityOverride(1); // hide unmet civs
  CONFIG.notifyMode = 1;
  CONFIG.notifyWorldNews = false;
  CONFIG.notifyCooldownTurns = 0;
  toasts = 0;
  TURN = 20;

  reportPassFeedback([
    {
      srcOwner: 0,
      destOwner: 2,
      srcName: "Rome",
      destName: "Alexandria",
      people: 3000,
      points: 1,
      cause: "war",
      crossCiv: true
    }
  ]);

  const rows = notificationLog();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].toCiv, "an unmet civilization");
  assert.equal(rows[0].toCity, undefined);
}

function testVerboseCauseToastsExcludeUnhappiness() {
  clearNotifications();
  settings.setVisibilityOverride(2);
  CONFIG.notifyMode = 2;
  CONFIG.notifyWorldNews = false;
  CONFIG.notifyCooldownTurns = 0;
  toasts = 0;
  TURN = 30;

  reportPassFeedback([
    { srcOwner: 1, destOwner: 0, people: 1000, points: 1, cause: "war" },
    { srcOwner: 1, destOwner: 0, people: 900, points: 1, cause: "disaster" },
    { srcOwner: 1, destOwner: 0, people: 700, points: 1, cause: "unhappiness" }
  ]);

  const causeRows = notificationLog().filter((r) => r.kind === "cause");
  assert.equal(causeRows.length, 2, "verbose per-cause entries should skip unhappiness");
  assert.ok(causeRows.some((r) => r.cause === "war"));
  assert.ok(causeRows.some((r) => r.cause === "disaster"));
}

testImportantToastRespectsNotifyToastsFlag();
testLocalDigestMasksUnmetDestinations();
testVerboseCauseToastsExcludeUnhappiness();

delete globalThis.EmigrationData;
delete globalThis.Players;
delete globalThis.GameContext;
delete globalThis.Configuration;
delete globalThis.Game;
delete globalThis.localStorage;

console.log("feedback-branches harness passed");
