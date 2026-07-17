// timeline-events.mjs
//
// buildTimelineEvents (emigration-timeline-events.js): positioning the turn-stamped war + disaster
// logs onto the network timeline's frames.
//
// The thing that makes this non-trivial: both logs stamp an AGE-LOCAL turn (turns reset at every age
// boundary), while frames are sparse snapshots. So an event is placed on the first frame at-or-after
// it WITHIN ITS OWN AGE — never by turn number alone, which would collide across ages.

import assert from "node:assert/strict";

// Off-engine: no Game/GameInfo/Players. warRefugeeName degrades to its "{Victim} War" fallback and
// loc() to its English default, which is exactly the environment we want to assert against.
const { buildTimelineEvents } = await import("/emigration/ui/emigration-timeline-events.js");

// Two ages, snapshots every 5 turns. Age-local turns RESET at the boundary — note turn 10 appears in
// both ages, which is the collision the age-scoping has to survive.
const FRAMES = [
  { turn: 0, age: "AGE_ANTIQUITY", year: "4000 BC" },   // 0
  { turn: 5, age: "AGE_ANTIQUITY", year: "3500 BC" },   // 1
  { turn: 10, age: "AGE_ANTIQUITY", year: "3000 BC" },  // 2
  { turn: 0, age: "AGE_EXPLORATION", year: "1000 AD" }, // 3
  { turn: 5, age: "AGE_EXPLORATION", year: "1200 AD" }, // 4
  { turn: 10, age: "AGE_EXPLORATION", year: "1400 AD" } // 5
];

const disaster = (turn, age, name) => ({ turn, age, year: "", name, severity: 2 });
const war = (turn, age, aggressor, victim, endTurn = null, endAge = "") =>
  ({ turn, age, year: "", aggressor, victim, endTurn, endAge });

function testDisasterLandsOnFirstFrameAtOrAfter() {
  // Struck on turn 6 of Antiquity: the turn-5 snapshot predates it, so the first frame that could
  // reflect the flight is turn 10 (index 2).
  const [e] = buildTimelineEvents(FRAMES, [disaster(6, "AGE_ANTIQUITY", "Nile flood")], []);
  assert.equal(e.kind, "disaster");
  assert.equal(e.label, "Nile flood");
  assert.equal(e.from, 2);
  assert.equal(e.to, 2, "a disaster is a point event — only the onset is stamped");
  assert.deepEqual(e.civs, [], "onsets are not civ-stamped");
}

function testExactTurnMatchLandsOnThatFrame() {
  const [e] = buildTimelineEvents(FRAMES, [disaster(5, "AGE_ANTIQUITY", "Quake")], []);
  assert.equal(e.from, 1, "an exact turn hit uses that frame, not the next");
}

function testAgeScopingDoesNotCollideAcrossAges() {
  // The SAME age-local turn in each age must resolve to different frames.
  const [a] = buildTimelineEvents(FRAMES, [disaster(10, "AGE_ANTIQUITY", "A")], []);
  const [b] = buildTimelineEvents(FRAMES, [disaster(10, "AGE_EXPLORATION", "B")], []);
  assert.equal(a.from, 2);
  assert.equal(b.from, 5, "turn 10 of Exploration is NOT turn 10 of Antiquity");
}

function testEventAfterLastSnapshotOfItsAgeClampsToThatAge() {
  // Turn 99 of Antiquity fired after Antiquity's final snapshot: clamp to the age's last frame (2),
  // NOT forward into Exploration, which would blame the wrong age for it.
  const [e] = buildTimelineEvents(FRAMES, [disaster(99, "AGE_ANTIQUITY", "Late flood")], []);
  assert.equal(e.from, 2);
}

function testUnplaceableEventIsDropped() {
  // An age with no frames at all can't be placed honestly, so it yields no pin rather than a guess.
  const out = buildTimelineEvents(FRAMES, [disaster(3, "AGE_MODERN", "Smog")], []);
  assert.deepEqual(out, []);
}

function testOngoingWarRunsToTheLatestFrame() {
  const [e] = buildTimelineEvents(FRAMES, [], [war(5, "AGE_ANTIQUITY", 1, 2)]);
  assert.equal(e.kind, "war");
  assert.equal(e.from, 1);
  assert.equal(e.to, FRAMES.length - 1, "endTurn null = still being fought");
  assert.deepEqual(e.civs, [1, 2], "both belligerents ride along for the canvas badges");
}

function testEndedWarRunsToItsPeaceFrame() {
  const [e] = buildTimelineEvents(FRAMES, [], [war(0, "AGE_ANTIQUITY", 1, 2, 5, "AGE_ANTIQUITY")]);
  assert.equal(e.from, 0);
  assert.equal(e.to, 1);
}

function testWarEndingInALaterAgeSpansTheBoundary() {
  const [e] = buildTimelineEvents(FRAMES, [], [war(10, "AGE_ANTIQUITY", 1, 2, 5, "AGE_EXPLORATION")]);
  assert.equal(e.from, 2);
  assert.equal(e.to, 4, "peace is stamped with its own age, so the window crosses the boundary");
}

function testPeaceBeforeDeclarationCannotInvertTheWindow() {
  // A corrupt/degenerate pairing must never produce to < from (the pin layer would place it wrong).
  const [e] = buildTimelineEvents(FRAMES, [], [war(10, "AGE_ANTIQUITY", 1, 2, 0, "AGE_ANTIQUITY")]);
  assert.ok(e.to >= e.from, `window must not invert (got ${e.from}..${e.to})`);
}

function testSortedByFirstFrame() {
  const out = buildTimelineEvents(
    FRAMES,
    [disaster(10, "AGE_EXPLORATION", "Late"), disaster(0, "AGE_ANTIQUITY", "Early")],
    [war(5, "AGE_EXPLORATION", 1, 2)]
  );
  const froms = out.map((e) => e.from);
  assert.deepEqual(froms, [...froms].sort((a, b) => a - b), "specs come out in timeline order");
}

function testDegenerateInputsNeverThrow() {
  assert.deepEqual(buildTimelineEvents([], [], []), [], "no frames");
  assert.deepEqual(buildTimelineEvents(FRAMES, [], []), [], "no records");
  assert.deepEqual(buildTimelineEvents(FRAMES), [], "records absent entirely");
  assert.deepEqual(buildTimelineEvents(null, null, null), [], "everything null");
  assert.deepEqual(buildTimelineEvents(FRAMES, [null], [null]), [], "null rows are skipped");
  // A single frame can't host a timeline (makeTimeline needs >= 2), so nothing is pinned.
  assert.deepEqual(buildTimelineEvents([FRAMES[0]], [disaster(0, "AGE_ANTIQUITY", "X")], []), []);
  // The views' no-history fallback frame carries turn:null/age:null — must not throw.
  const nullish = [{ turn: null, age: null, year: "" }, { turn: null, age: null, year: "" }];
  assert.doesNotThrow(() => buildTimelineEvents(nullish, [disaster(1, "AGE_ANTIQUITY", "X")], []));
}

function testDisasterWithoutANameFallsBackToTheGenericLabel() {
  const [e] = buildTimelineEvents(FRAMES, [disaster(0, "AGE_ANTIQUITY", "")], []);
  assert.equal(e.label, "Disaster", "off-engine loc() fallback for LOC_EMIG_TL_PIN_DISASTER");
}

function testWarLabelIsResolvedNotRaw() {
  const [e] = buildTimelineEvents(FRAMES, [], [war(0, "AGE_ANTIQUITY", 1, 2)]);
  assert.equal(typeof e.label, "string");
  assert.ok(e.label.length, "a war always names itself, even off-engine");
  assert.ok(!e.label.includes("war:"), "the raw event key must never reach the player");
}

testDisasterLandsOnFirstFrameAtOrAfter();
testExactTurnMatchLandsOnThatFrame();
testAgeScopingDoesNotCollideAcrossAges();
testEventAfterLastSnapshotOfItsAgeClampsToThatAge();
testUnplaceableEventIsDropped();
testOngoingWarRunsToTheLatestFrame();
testEndedWarRunsToItsPeaceFrame();
testWarEndingInALaterAgeSpansTheBoundary();
testPeaceBeforeDeclarationCannotInvertTheWindow();
testSortedByFirstFrame();
testDegenerateInputsNeverThrow();
testDisasterWithoutANameFallsBackToTheGenericLabel();
testWarLabelIsResolvedNotRaw();

console.log("timeline-events: OK");
