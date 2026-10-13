import assert from "node:assert/strict";

// The game's notification train as the surface for the mod's notices (ui/emigration-train.js): the lines of
// one tick batch into one notification per channel, a later line in the same turn replaces the live one with
// every line so far, a new turn starts clean, and emigration-feedback.js routes to the train only when the
// engine's API is here and notifyTrain is on (else the HUD toast). Timers are captured and run by hand.

/** @type {Function[]} */
const timers = [];
globalThis.setTimeout = (fn) => {
  timers.push(fn);
  return timers.length;
};
function runTimers() {
  for (const fn of timers.splice(0)) fn();
}

let TURN = 5;
/** @type {*[]} */
const sent = [];
/** @type {*[]} */
const dismissed = [];
/** @type {Map<string, number[]>} */
let live = new Map();
const notifications = {
  send(o, player) {
    const id = sent.length + 1;
    sent.push({ ...o, player, id });
    live.set(o.Type, [...(live.get(o.Type) || []), id]);
    return id;
  },
  getIdsOfTypeForPlayer(_player, type) {
    return live.get(type) || [];
  },
  dismiss(id) {
    dismissed.push(id);
    for (const [t, ids] of live) live.set(t, ids.filter((x) => x !== id));
  },
  find() {
    return { Type: 1, GroupType: 0 };
  }
};
globalThis.Game = {
  get turn() {
    return TURN;
  },
  getHash: (s) => "#" + s,
  Notifications: notifications
};
globalThis.GameContext = { localPlayerID: 0 };
const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
let domToasts = 0;
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, set textContent(_v) {}, remove() {}, appendChild() {} }),
  head: { appendChild() {} },
  body: { appendChild: () => (domToasts += 1) }
};

const train = await import("/emigration/ui/emigration-train.js");
const { toast, announceImportant } = await import("/emigration/ui/emigration-feedback.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

function reset() {
  sent.length = 0;
  dismissed.length = 0;
  live = new Map();
  timers.length = 0;
  domToasts = 0;
  CONFIG.notifyMode = 1;
  CONFIG.notifyTrain = true;
  CONFIG.notifyToasts = true;
  CONFIG.notifyCooldownTurns = 0;
}

function testChannelFor() {
  assert.equal(train.channelFor("crisis"), "world");
  assert.equal(train.channelFor("disaster", true), "disaster");
  assert.equal(train.channelFor("war", true), "loss");
  assert.equal(train.channelFor("war", false), "note");
  assert.equal(train.channelFor("prosperity"), "note");
  assert.equal(train.channelFor("chronicle"), "note");
}

function testAvailability() {
  assert.equal(train.trainAvailable(), true);
  const saved = globalThis.Game.Notifications;
  globalThis.Game.Notifications = undefined;
  assert.equal(train.trainAvailable(), false);
  globalThis.Game.Notifications = saved;
}

function testBatchesOneTick() {
  reset();
  TURN = 5;
  assert.equal(train.trainNotify("loss", "Roma lost 2 people."), true);
  assert.equal(train.trainNotify("loss", "Ostia lost 1 person."), true);
  assert.equal(train.trainNotify("arrival", "3 settled in Roma."), true);
  assert.equal(sent.length, 0, "nothing goes out before the tick ends");
  assert.equal(timers.length, 1, "one flush timer for the tick");
  runTimers();
  assert.equal(sent.length, 2, "one notification per channel");
  const loss = sent.find((s) => s.Type === "#NOTIFICATION_EMIGRATION_LOSS");
  assert.ok(loss);
  assert.equal(loss.player, 0);
  assert.equal(loss.Message, "People are leaving");
  assert.equal(loss.Summary, "Roma lost 2 people.[N]Ostia lost 1 person.");
  const arrival = sent.find((s) => s.Type === "#NOTIFICATION_EMIGRATION_ARRIVAL");
  assert.equal(arrival.Summary, "3 settled in Roma.");
  assert.equal(dismissed.length, 0);
}

function testSameTurnReplacesLiveOne() {
  // continues the state of testBatchesOneTick: the loss notification (id 1 or 2) is live on turn 5
  const liveLoss = live.get("#NOTIFICATION_EMIGRATION_LOSS");
  assert.equal(liveLoss.length, 1);
  train.trainNotify("loss", "Neapolis lost 1 person.");
  runTimers();
  assert.deepEqual(dismissed, liveLoss, "the live one of the type is dismissed first");
  const again = sent[sent.length - 1];
  assert.equal(again.Type, "#NOTIFICATION_EMIGRATION_LOSS");
  assert.equal(again.Summary, "Roma lost 2 people.[N]Ostia lost 1 person.[N]Neapolis lost 1 person.",
    "the earlier lines ride along");
  assert.equal(live.get("#NOTIFICATION_EMIGRATION_LOSS").length, 1);
}

function testNewTurnStartsClean() {
  TURN = 6;
  dismissed.length = 0;
  train.trainNotify("loss", "Roma lost 1 person.");
  runTimers();
  assert.equal(dismissed.length, 0, "last turn's copy is the engine's to clear");
  assert.equal(sent[sent.length - 1].Summary, "Roma lost 1 person.");
}

function testSummaryAndBlanks() {
  assert.equal(train.summaryOf(["Situation.\n\nGuidance."]), "Situation.[N]Guidance.");
  assert.equal(train.summaryOf(["a", "b"]), "a[N]b");
  reset();
  assert.equal(train.trainNotify("loss", "   "), false);
  assert.equal(train.trainNotify("nope", "text"), false);
  runTimers();
  assert.equal(sent.length, 0);
}

function testNoLocalPlayer() {
  reset();
  globalThis.GameContext = {};
  train.trainNotify("note", "x");
  runTimers();
  assert.equal(sent.length, 0, "no send without a local player");
  globalThis.GameContext = { localPlayerID: 0 };
}

function testFeedbackRoutesToTrain() {
  reset();
  TURN = 9;
  toast("A war-driven loss.", "war", true);
  toast("A crisis.", "crisis");
  toast("A story.", "chronicle");
  announceImportant("A disaster.", "disaster", undefined, undefined, "disaster");
  assert.equal(domToasts, 0, "no HUD toast while the train is on");
  runTimers();
  assert.deepEqual(sent.map((s) => s.Type).sort(), [
    "#NOTIFICATION_EMIGRATION_DISASTER", "#NOTIFICATION_EMIGRATION_LOSS",
    "#NOTIFICATION_EMIGRATION_NOTE", "#NOTIFICATION_EMIGRATION_WORLD"
  ]);
}

function testExplicitChannelWins() {
  reset();
  TURN = 10;
  announceImportant("Others' loss.", "war", false, undefined, "world");
  runTimers();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].Type, "#NOTIFICATION_EMIGRATION_WORLD");
}

function testTrainOffKeepsToasts() {
  reset();
  CONFIG.notifyTrain = false;
  toast("Legacy line.", "war", true);
  runTimers();
  assert.equal(sent.length, 0);
  assert.equal(domToasts, 1, "the HUD toast is the surface with the train off");
  CONFIG.notifyToasts = false;
  toast("Hidden line.", "war", true);
  assert.equal(domToasts, 1, "notifyToasts still gates the HUD toast");
}

function testNotifyModeOffSilencesBoth() {
  reset();
  CONFIG.notifyMode = 0;
  toast("x", "war", true);
  runTimers();
  assert.equal(sent.length, 0);
  assert.equal(domToasts, 0);
}

function testApiAbsentFallsBackToToast() {
  reset();
  const saved = globalThis.Game.Notifications;
  globalThis.Game.Notifications = undefined;
  toast("Off-engine line.", "war", true);
  assert.equal(domToasts, 1);
  globalThis.Game.Notifications = saved;
}

async function testHandlerInstallOffEngine() {
  // The test loader serves a stub for /base-standard/, which has no NotificationModel: the install resolves
  // false and throws nothing.
  const ok = await train.installTrainHandler(() => {});
  assert.equal(ok, false);
  const saved = globalThis.Game.Notifications;
  globalThis.Game.Notifications = undefined;
  assert.equal(await train.installTrainHandler(() => {}), false);
  globalThis.Game.Notifications = saved;
}

testChannelFor();
testAvailability();
testBatchesOneTick();
testSameTurnReplacesLiveOne();
testNewTurnStartsClean();
testSummaryAndBlanks();
testNoLocalPlayer();
testFeedbackRoutesToTrain();
testExplicitChannelWins();
testTrainOffKeepsToasts();
testNotifyModeOffSilencesBoth();
testApiAbsentFallsBackToToast();
await testHandlerInstallOffEngine();
console.log("train harness passed");
