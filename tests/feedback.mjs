import assert from "node:assert/strict";

// Count toasts by counting appends to the HUD root.
let toasts = 0;
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({
    style: {},
    set textContent(_v) {},
    remove() {},
    appendChild() {}
  }),
  head: { appendChild: () => {} },
  body: { appendChild: () => (toasts += 1) }
};
globalThis.setTimeout = () => 0;
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
let CUM = {};
globalThis.EmigrationData = { refugeesCumFor: (pid) => CUM[pid] || 0 };

const { reportPassFeedback, announceImportant } = await import("/emigration/ui/emigration-feedback.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { notificationLog, clearNotifications } = await import(
  "/emigration/ui/emigration-notifications.js"
);

function testImportantModeNoPerPassSpam() {
  CONFIG.notifyMode = 1;
  CONFIG.notifyWorldNews = true;
  CONFIG.worldRefugeeThreshold = 40000;
  CONFIG.notifyCooldownTurns = 0;
  CUM = {};
  toasts = 0;
  TURN = 10;
  // War migration this pass, but the civ's cumulative is below the crisis threshold:
  // important mode must stay silent (no per-turn toast).
  reportPassFeedback([{ cause: "war", srcOwner: 1, people: 5000 }]);
  assert.equal(toasts, 0);
}

function testCrisisFiresOncePerTier() {
  CONFIG.notifyMode = 1;
  CONFIG.notifyCooldownTurns = 0;
  toasts = 0;
  TURN = 11;
  CUM[1] = 45000; // tier 1 (≥ 40k)
  reportPassFeedback([{ cause: "war", srcOwner: 1, people: 5000 }]);
  assert.equal(toasts, 1); // crisis headline fires
  toasts = 0;
  CUM[1] = 50000; // still tier 1
  reportPassFeedback([{ cause: "war", srcOwner: 1, people: 5000 }]);
  assert.equal(toasts, 0); // same tier → no repeat (no spam)
  toasts = 0;
  CUM[1] = 85000; // tier 2
  reportPassFeedback([{ cause: "war", srcOwner: 1, people: 5000 }]);
  assert.equal(toasts, 1); // new milestone → fires again
}

function testVerboseModeSummarizesEachPass() {
  CONFIG.notifyMode = 2;
  CONFIG.notifyCooldownTurns = 0;
  CUM = {};
  toasts = 0;
  TURN = 20;
  reportPassFeedback([{ cause: "disaster", srcOwner: 3, people: 1000 }]);
  assert.ok(toasts >= 1); // verbose → per-pass toast
}

function testCooldownThrottlesImportant() {
  CONFIG.notifyMode = 1;
  CONFIG.notifyCooldownTurns = 5;
  toasts = 0;
  TURN = 40;
  announceImportant("a");
  assert.equal(toasts, 1); // fires, stamps turn 40
  toasts = 0;
  TURN = 42;
  announceImportant("b");
  assert.equal(toasts, 0); // within cooldown → suppressed
  toasts = 0;
  TURN = 46;
  announceImportant("c");
  assert.equal(toasts, 1); // cooldown elapsed → fires
}

function testOffModeSilent() {
  CONFIG.notifyMode = 0;
  toasts = 0;
  announceImportant("x");
  reportPassFeedback([{ cause: "war", srcOwner: 1, people: 99999 }]);
  assert.equal(toasts, 0);
  CONFIG.notifyMode = 1; // restore
}

function testLocalDigestExplainsTheLocalPlayersLoss() {
  // With a local player set, a loss from THEIR cities fires one explanatory toast.
  globalThis.GameContext = { localPlayerID: 0 };
  CONFIG.notifyMode = 1;
  CONFIG.notifyWorldNews = false; // isolate from crisis milestones
  CONFIG.notifyCooldownTurns = 0;
  toasts = 0;
  TURN = 60;
  reportPassFeedback([
    { srcOwner: 0, destOwner: 1, people: 5000, cause: "unhappiness", crossCiv: true, srcName: "Rome", destName: "Carthage" }
  ]);
  assert.equal(toasts, 1); // the local-player digest
  // A pass with no LOCAL loss (only an AI civ loses) → no digest.
  toasts = 0;
  reportPassFeedback([{ srcOwner: 1, destOwner: 2, people: 5000, cause: "war", srcName: "Sparta" }]);
  assert.equal(toasts, 0);
}

function testLocalDigestIsPerEvent() {
  // A pass where several of the local player's settlements shed people for different reasons must
  // produce ONE notification PER EVENT (source settlement + cause) with accurate counts — never one
  // confusing pass-wide aggregate — while only the LARGEST event toasts, so the HUD isn't flooded.
  globalThis.GameContext = { localPlayerID: 0 };
  CONFIG.notifyMode = 1;
  CONFIG.notifyWorldNews = false;
  CONFIG.notifyCooldownTurns = 0;
  clearNotifications();
  toasts = 0;
  TURN = 80;
  reportPassFeedback([
    { srcOwner: 0, destOwner: 1, people: 6000, points: 1, cause: "war", crossCiv: true, srcName: "Rome", destName: "Carthage" },
    { srcOwner: 0, destOwner: 1, people: 4000, points: 1, cause: "war", crossCiv: true, srcName: "Rome", destName: "Carthage" },
    { srcOwner: 0, destOwner: 2, people: 2000, points: 1, cause: "unhappiness", crossCiv: true, srcName: "Athens", destName: "Sparta" }
  ]);
  assert.equal(toasts, 1); // only the largest event (Rome/war) toasts
  const log = notificationLog();
  assert.equal(log.length, 2); // one entry per event, NOT three records and NOT one lumped aggregate
  const rome = log.find((e) => e.fromCity === "Rome");
  assert.equal(rome.cause, "war");
  assert.equal(rome.points, 2); // the two Rome/war records merged into one event with the real count
  assert.equal(notificationLog().find((e) => e.fromCity === "Athens").points, 1);
  delete globalThis.GameContext;
}

function testLocalDigestRespectsCooldown() {
  globalThis.GameContext = { localPlayerID: 0 };
  CONFIG.notifyMode = 1;
  CONFIG.notifyWorldNews = false;
  CONFIG.notifyCooldownTurns = 5;
  const loss = [{ srcOwner: 0, destOwner: 1, people: 3000, cause: "unhappiness", srcName: "Rome" }];
  toasts = 0;
  TURN = 70;
  reportPassFeedback(loss);
  assert.equal(toasts, 1); // fires, stamps turn 70
  toasts = 0;
  TURN = 72;
  reportPassFeedback(loss);
  assert.equal(toasts, 0); // within cooldown → throttled like any important toast
  delete globalThis.GameContext;
}

testImportantModeNoPerPassSpam();
testCrisisFiresOncePerTier();
testVerboseModeSummarizesEachPass();
testCooldownThrottlesImportant();
testOffModeSilent();
testLocalDigestExplainsTheLocalPlayersLoss();
testLocalDigestRespectsCooldown();
testLocalDigestIsPerEvent(); // last: it advances the turn/cooldown state, so it can't perturb others

console.log("feedback harness passed");
