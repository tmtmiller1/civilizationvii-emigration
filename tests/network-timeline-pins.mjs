// network-timeline-pins.mjs
//
// The timeline's event-pin layer (emigration-network-timeline.js): makeEventPins /
// clusterPinsByColumn. Pins mark the wars/disasters that drove the migration onto the playback
// scrubber, positioned as a % of the timeline width (the same scale the age separators use), with
// click-to-scrub.
//
// The canvas isn't unit-tested; these assert the geometry + the DOM the layer builds, which is where
// the bugs actually live (a mis-scaled % puts a pin under the wrong spike).

import assert from "node:assert/strict";

// A minimal DOM: the shared dom-stub's MockElement has no setAttribute/classList, which the pin
// builder needs, so we supply a self-contained one (as tests/city-readout-panel.mjs does).
function makeEl(tag) {
  /** @type {*} */
  const e = {
    tagName: tag, className: "", textContent: "", title: "", style: {},
    children: [], attrs: {}, _listeners: {},
    appendChild(c) { e.children.push(c); return c; },
    setAttribute(k, v) { e.attrs[k] = v; },
    addEventListener(ev, fn) { (e._listeners[ev] || (e._listeners[ev] = [])).push(fn); },
    click() { for (const fn of e._listeners.click || []) fn(); }
  };
  return e;
}
globalThis.document = { createElement: makeEl };

const { makeEventPins, clusterPinsByColumn } = await import(
  "/emigration/ui/emigration-network-timeline.js"
);
// The pin palette must come from the SHARED cause taxonomy the notifications log themes with — assert
// against causeAccent itself, never a copied hex, so the two can't silently drift apart.
const { causeAccent } = await import("/emigration/ui/emigration-causes.js");

// 5 frames → indices 0..4, so `last` = 4 and each frame is 25% of the width.
const FRAMES = [
  { turn: 0, age: "AGE_ANTIQUITY", year: "4000 BC" },
  { turn: 5, age: "AGE_ANTIQUITY", year: "3500 BC" },
  { turn: 10, age: "AGE_ANTIQUITY", year: "3000 BC" },
  { turn: 15, age: "AGE_ANTIQUITY", year: "2500 BC" },
  { turn: 20, age: "AGE_ANTIQUITY", year: "2000 BC" }
];

const ev = (kind, label, from) => ({ kind, label, from, to: from, civs: [] });

function testPinPositionedAtTheRightPercent() {
  const layer = makeEventPins(FRAMES, [ev("war", "Roman–Greek War", 1)]);
  assert.equal(layer.children.length, 1);
  assert.equal(layer.children[0].style.left, "25%", "frame 1 of 0..4 sits a quarter along");
}

function testFirstAndLastFramesPinAtTheEdges() {
  const layer = makeEventPins(FRAMES, [ev("war", "A", 0), ev("disaster", "B", 4)]);
  assert.equal(layer.children[0].style.left, "0%");
  assert.equal(layer.children[1].style.left, "100%");
}

function testKindDrivesTheClass() {
  const layer = makeEventPins(FRAMES, [ev("war", "A", 0), ev("disaster", "B", 2)]);
  assert.ok(layer.children[0].className.includes("war"));
  assert.ok(layer.children[1].className.includes("disaster"));
}

function testPinColourMatchesTheSharedCauseTaxonomy() {
  const layer = makeEventPins(FRAMES, [ev("war", "A", 0), ev("disaster", "B", 2)]);
  assert.equal(layer.children[0].style.backgroundColor, causeAccent("war"),
    "a war pin is the same red as a war notification row");
  assert.equal(layer.children[1].style.backgroundColor, causeAccent("disaster"),
    "a disaster pin is the same amber as a disaster notification row");
  assert.notEqual(causeAccent("war"), causeAccent("disaster"), "the two kinds must be distinguishable");
}

function testSameKindClusterKeepsItsTypeColour() {
  const layer = makeEventPins(FRAMES, [ev("war", "A War", 2), ev("war", "B War", 2)]);
  assert.equal(layer.children[0].style.backgroundColor, causeAccent("war"),
    "two wars on one frame are still unambiguously a war column");
}

function testMixedKindClusterUsesTheNeutralFallback() {
  const layer = makeEventPins(FRAMES, [ev("war", "A War", 2), ev("disaster", "A Quake", 2)]);
  assert.equal(layer.children[0].style.backgroundColor, causeAccent("other"),
    "a mixed column has no honest single type colour, so it takes the taxonomy's fallback");
}

function testLabelBecomesTheTooltip() {
  const layer = makeEventPins(FRAMES, [ev("disaster", "Nile flood", 2)]);
  const pin = layer.children[0];
  assert.equal(pin.children[0].textContent, "Nile flood", "the CSS tooltip carries the label");
  assert.equal(pin.title, "Nile flood", "and the native title is the clipped-tooltip fallback");
}

function testSameColumnEventsMergeIntoOneMultiPin() {
  const layer = makeEventPins(FRAMES, [ev("war", "A War", 2), ev("disaster", "A Quake", 2)]);
  assert.equal(layer.children.length, 1, "two events on one frame must not stack on one pixel");
  const pin = layer.children[0];
  assert.ok(pin.className.includes("multi"));
  assert.equal(pin.children[0].textContent, "A War · A Quake", "the merged pin names both");
}

function testDifferentColumnsStaySeparate() {
  const layer = makeEventPins(FRAMES, [ev("war", "A", 1), ev("disaster", "B", 3)]);
  assert.equal(layer.children.length, 2);
}

function testClickScrubsToTheEventsFrame() {
  /** @type {number[]} */
  const went = [];
  const layer = makeEventPins(FRAMES, [ev("war", "A", 3)], (i) => went.push(i));
  layer.children[0].click();
  assert.deepEqual(went, [3], "clicking a pin jumps the scrubber to its frame");
}

function testNoGoToHandlerIsSafe() {
  const layer = makeEventPins(FRAMES, [ev("war", "A", 1)]);
  assert.doesNotThrow(() => layer.children[0].click(), "a pin with no scrub handler is inert");
}

function testEmptyEventsYieldNoPins() {
  assert.equal(makeEventPins(FRAMES, []).children.length, 0);
  assert.equal(makeEventPins(FRAMES, null).children.length, 0);
}

function testOutOfRangeAndMalformedFromAreHandled() {
  const cols = clusterPinsByColumn(
    [ev("war", "high", 99), ev("war", "low", -5), ev("war", "nan", NaN), null],
    4
  );
  assert.deepEqual([...cols.keys()].sort((a, b) => a - b), [0, 4], "clamped into range");
  assert.ok(!cols.has(NaN), "a non-finite frame index is dropped, not pinned at NaN%");
}

function testClusterPreservesOrderWithinAColumn() {
  const cols = clusterPinsByColumn([ev("war", "first", 2), ev("war", "second", 2)], 4);
  assert.deepEqual(cols.get(2).map((e) => e.label), ["first", "second"]);
}

testPinPositionedAtTheRightPercent();
testFirstAndLastFramesPinAtTheEdges();
testKindDrivesTheClass();
testPinColourMatchesTheSharedCauseTaxonomy();
testSameKindClusterKeepsItsTypeColour();
testMixedKindClusterUsesTheNeutralFallback();
testLabelBecomesTheTooltip();
testSameColumnEventsMergeIntoOneMultiPin();
testDifferentColumnsStaySeparate();
testClickScrubsToTheEventsFrame();
testNoGoToHandlerIsSafe();
testEmptyEventsYieldNoPins();
testOutOfRangeAndMalformedFromAreHandled();
testClusterPreservesOrderWithinAColumn();

console.log("network-timeline-pins: OK");
