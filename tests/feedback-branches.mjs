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
const { reportPassFeedback, reportInboundFeedback, announceImportant } = await import("/emigration/ui/emigration-feedback.js");
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

function testFirstImportantToastNotSuppressedEarlyGame() {
  // Regression: the empty news state seeds lastToastTurn:0, and the old cooldown check ("is a number")
  // then suppressed EVERY important toast for the first notifyCooldownTurns of a fresh game (turn-0<6).
  // Runs FIRST, while the news state is still pristine (KV unseeded → lastToastTurn 0). The first toast
  // must fire even at a low turn well inside the cooldown window.
  CONFIG.notifyMode = 1;
  CONFIG.notifyToasts = true;
  CONFIG.notifyCooldownTurns = 6;
  toasts = 0;
  TURN = 2;
  announceImportant("early", "war", true);
  assert.equal(toasts, 1, "the first important toast must not be suppressed early in a fresh game");
}

function testInboundDigestAnnouncesImmigration() {
  // A prosperous, peaceful empire RECEIVING migrants gets important news too: cross-civ arrivals
  // credited to the local player (arrival records carry destOwner + originCiv, no srcOwner) group into
  // one inbound event that, over the floor, toasts once and logs as a GAIN (ownLoss:false).
  clearNotifications();
  settings.setVisibilityOverride(2); // show all civs → name the origin
  CONFIG.notifyMode = 1;
  CONFIG.notifyWorldNews = false;
  CONFIG.notifyCooldownTurns = 0;
  CONFIG.inboundNotifyPoints = 2;
  toasts = 0;
  TURN = 40;
  reportInboundFeedback([
    { destOwner: 0, originCiv: 1, people: 6000, points: 1, cause: "prosperity", crossCiv: true, phase: "arrive", srcName: "Persepolis", destName: "Rome" },
    { destOwner: 0, originCiv: 1, people: 4000, points: 1, cause: "prosperity", crossCiv: true, phase: "arrive", srcName: "Persepolis", destName: "Rome" }
  ]);
  assert.equal(toasts, 1, "an inbound immigration wave toasts");
  const rows = notificationLog();
  assert.equal(rows.length, 1, "the two arrivals merge into one logged inbound event");
  assert.equal(rows[0].ownLoss, false, "immigration is a gain, not a loss");
  assert.equal(rows[0].toCity, "Rome");
  assert.equal(rows[0].points, 2, "the merged event carries the real point count");
  assert.ok(rows[0].fromCiv, "the origin civ is named");
}

function testInboundBelowFloorStaysQuiet() {
  // A single 1-point arrival (below inboundNotifyPoints) must not toast OR fill the log - a steady
  // trickle stays quiet so it never buries war/disaster history.
  clearNotifications();
  CONFIG.notifyMode = 1;
  CONFIG.notifyWorldNews = false;
  CONFIG.notifyCooldownTurns = 0;
  CONFIG.inboundNotifyPoints = 2;
  toasts = 0;
  TURN = 42;
  reportInboundFeedback([
    { destOwner: 0, originCiv: 1, people: 3000, points: 1, cause: "prosperity", crossCiv: true, phase: "arrive", srcName: "Persepolis", destName: "Rome" }
  ]);
  assert.equal(toasts, 0, "a sub-floor trickle stays quiet");
  assert.equal(notificationLog().length, 0, "and does not fill the log");
}

function testInboundExcludesInternalMoves() {
  // An internal relocation within the player's own empire (crossCiv:false) is NOT immigration and must
  // never produce an inbound (gain) notification, even at the lowest floor.
  clearNotifications();
  CONFIG.notifyMode = 1;
  CONFIG.notifyWorldNews = false;
  CONFIG.notifyCooldownTurns = 0;
  CONFIG.inboundNotifyPoints = 1;
  toasts = 0;
  TURN = 44;
  // Mirror the real pass: reportPassFeedback (loss side) THEN reportInboundFeedback (gain side).
  const internal = [
    { srcOwner: 0, destOwner: 0, people: 9000, points: 3, cause: "prosperity", crossCiv: false, srcName: "Ostia", destName: "Rome" }
  ];
  reportPassFeedback(internal);
  reportInboundFeedback(internal);
  const log = notificationLog();
  assert.equal(log.filter((r) => r.ownLoss === false).length, 0, "an internal move is not immigration (no gain row)");
  assert.equal(log.filter((r) => r.ownLoss === true).length, 1, "an internal move is still the player's own-loss digest");
}

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

testFirstImportantToastNotSuppressedEarlyGame(); // FIRST: needs the pristine (lastToastTurn 0) news state
testImportantToastRespectsNotifyToastsFlag();
testLocalDigestMasksUnmetDestinations();
testVerboseCauseToastsExcludeUnhappiness();
testInboundDigestAnnouncesImmigration();
testInboundBelowFloorStaysQuiet();
testInboundExcludesInternalMoves();

delete globalThis.EmigrationData;
delete globalThis.Players;
delete globalThis.GameContext;
delete globalThis.Configuration;
delete globalThis.Game;
delete globalThis.localStorage;

console.log("feedback-branches harness passed");
