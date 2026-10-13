import assert from "node:assert/strict";

// "Leave them where they are" on the call-home offer: the people that dialog listed are not offered again,
// in this session or after a reload; people displaced afterward are offered alone; a pair whose numbers fall
// is trimmed so later growth counts as new; a paid call never moves someone who was left; the console call
// still lists everyone. Drives the real offerCallHome through the native-dialog stub.

let TURN = 40;
globalThis.Game = {
  get turn() {
    return TURN;
  }
};
globalThis.GameContext = { localPlayerID: 0 };
const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const action = await import("/emigration/ui/emigration-call-home-action.js");
const { CALL_HOME_SCOPE, CALL_HOME_CURRENCY, callHomeQuote, withoutDeclined, pairKey, resolveCallHome } =
  await import("/emigration/ui/emigration-call-home.js");

const ME = 0;
const IN = CALL_HOME_SCOPE.INTERNAL;
/** @param {string} from @param {string} home @param {number} points */
const row = (from, home, points) => ({ src: ME, dest: ME, srcCity: home, destCity: from, points, byCause: { war: points * 100 } });

/** The flow rows the offer reads, swapped per test. */
let FLOWS = [];
/** @type {{view:*, onChoice:(id:string)=>void}[]} The dialogs the offer opened. */
let dialogs = [];
/** @type {string[]} Where the mover took people from. */
let moved = [];
const seams = () => ({
  flows: FLOWS,
  show: (/** @type {*} */ view, /** @type {*} */ onChoice) => dialogs.push({ view, onChoice }),
  move: (/** @type {*} */ p) => (moved.push(p.from), true)
});
/** @param {*} [extra] @returns {boolean} */
const offer = (extra) => action.offerCallHome(ME, IN, { ...seams(), ...(extra || {}) });

/** Answer the last dialog. @param {string} id */
function answer(id) {
  const d = dialogs[dialogs.length - 1];
  assert.ok(d, "a dialog was shown");
  d.onChoice(id);
}

function reset() {
  delete KV.EmigrationCallHomeDeclined_v1;
  action._resetCallHomeDeclined();
  action._resetCallHomeCooldowns();
  dialogs = [];
  moved = [];
  CONFIG.callHomeEnabled = true;
  CONFIG.callHomeMaxPointsPerAttempt = 3;
}

function testPureSubtraction() {
  const pairs = [{ from: "Ostia", home: "Rome", host: 0, points: 7 }, { from: "Tikal", home: "Rome", host: 0, points: 5 }];
  assert.deepEqual(withoutDeclined(pairs, undefined), pairs);
  const left = withoutDeclined(pairs, { [pairKey(pairs[0])]: 7, [pairKey(pairs[1])]: 2 });
  assert.deepEqual(left.map((p) => [p.from, p.points]), [["Tikal", 3]], "a fully declined pair drops out");
  assert.equal(pairs[1].points, 5, "the input is not changed");
  const q = callHomeQuote(ME, IN, CALL_HOME_CURRENCY.GOLD,
    [row("Ostia", "Rome", 7)], { declined: { [pairKey({ from: "Ostia", home: "Rome", host: ME })]: 7 } });
  assert.equal(q.points, 0, "a quote with everyone declined offers nobody");
}

function testLeaveIsNotAskedAgain() {
  reset();
  FLOWS = [row("Ostia", "Rome", 7), row("Tikal", "Chichen Itza", 5)];
  assert.equal(offer(), true, "the first offer opens");
  answer("no");
  dialogs = [];
  TURN += 1;
  assert.equal(offer(), false, "the same people are not offered next turn");
  assert.equal(dialogs.length, 0);
  TURN += 10;
  assert.equal(offer(), false, "nor ten turns later");
}

function testCloseCountsAsLeave() {
  reset();
  FLOWS = [row("Ostia", "Rome", 4)];
  assert.equal(offer(), true);
  // The dialog's close button and Escape resolve to the view's dismiss id, which is the leave choice.
  const d = dialogs[0];
  assert.ok(d.view.choices.some((c) => c.id === d.view.dismissId), "closing the dialog is the leave choice");
  answer(d.view.dismissId);
  dialogs = [];
  assert.equal(offer(), false);
}

function testSurvivesAReload() {
  reset();
  FLOWS = [row("Ostia", "Rome", 6)];
  offer();
  answer("no");
  assert.ok(KV.EmigrationCallHomeDeclined_v1, "the record is in the save");
  // a fresh session: the in-memory record is gone and only the save is left
  action._resetCallHomeDeclined();
  action._resetCallHomeCooldowns();
  dialogs = [];
  assert.equal(offer(), false, "a reload does not bring them back");
}

function testNewlyDisplacedAreOfferedAlone() {
  reset();
  FLOWS = [row("Ostia", "Rome", 6)];
  offer();
  answer("no");
  dialogs = [];
  FLOWS = [row("Ostia", "Rome", 8), row("Neapolis", "Rome", 2)];
  assert.equal(offer(), true, "people displaced since are offered");
  const lines = dialogs[0].view.details.join(" | ");
  assert.match(lines, /2 from Ostia back to Rome/, "Ostia lists only its two newcomers");
  assert.match(lines, /2 from Neapolis back to Rome/);
  const q = callHomeQuote(ME, IN, CALL_HOME_CURRENCY.GOLD, FLOWS, { declined: action.callHomeDeclined(ME, IN, FLOWS) });
  assert.deepEqual(q.pairs.map((p) => [p.from, p.points]).sort(), [["Neapolis", 2], ["Ostia", 2]]);
}

function testShrinkingPairIsTrimmed() {
  reset();
  FLOWS = [row("Ostia", "Rome", 6)];
  offer();
  answer("no");
  // four drifted home on their own: the record falls to the two still there
  FLOWS = [row("Ostia", "Rome", 2)];
  assert.deepEqual(Object.values(action.callHomeDeclined(ME, IN, FLOWS)), [2]);
  // then three more are driven out: those three are new
  FLOWS = [row("Ostia", "Rome", 5)];
  const q = callHomeQuote(ME, IN, CALL_HOME_CURRENCY.GOLD, FLOWS, { declined: action.callHomeDeclined(ME, IN, FLOWS) });
  assert.equal(q.available, 3);
  // and a pair that is gone entirely is forgotten
  FLOWS = [];
  assert.deepEqual(action.callHomeDeclined(ME, IN, FLOWS), {});
}

function testPaidCallSkipsTheDeclined() {
  // Ostia's 5 were left; Tikal's 2 are new. A paid call for 3 may move only Tikal's 2.
  const declined = { [pairKey({ from: "Ostia", home: "Rome", host: ME })]: 5 };
  /** @type {string[]} */
  const took = [];
  const r = resolveCallHome(ME, IN, CALL_HOME_CURRENCY.GOLD, {
    turn: 1, flows: [row("Ostia", "Rome", 5), row("Tikal", "Rome", 2)], want: 3, declined,
    pay: () => true, move: (p) => (took.push(p.from), true)
  });
  assert.equal(r.ok, true);
  assert.deepEqual(took, ["Tikal", "Tikal"], "nobody left where they are is moved");
  // and through the dialog: after leaving Ostia, a later offer's paid answer moves only the newcomers
  reset();
  FLOWS = [row("Ostia", "Rome", 5)];
  offer();
  answer("no");
  FLOWS = [row("Ostia", "Rome", 5), row("Tikal", "Rome", 2)];
  dialogs = [];
  assert.equal(offer(), true);
  const buy = dialogs[0].view.choices.find((c) => c.id === CALL_HOME_CURRENCY.GOLD + ":2");
  assert.ok(buy, "a two-point purchase is offered");
  answer(buy.id);
  assert.deepEqual(moved, ["Tikal", "Tikal"]);
}

function testConsoleListsEveryone() {
  reset();
  FLOWS = [row("Ostia", "Rome", 6)];
  offer();
  answer("no");
  dialogs = [];
  assert.equal(offer({ includeDeclined: true }), true, "the console call still offers them");
}

testPureSubtraction();
testLeaveIsNotAskedAgain();
testCloseCountsAsLeave();
testSurvivesAReload();
testNewlyDisplacedAreOfferedAlone();
testShrinkingPairIsTrimmed();
testPaidCallSkipsTheDeclined();
testConsoleListsEveryone();
console.log("call-home-decline harness passed");
