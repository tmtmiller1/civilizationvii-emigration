import assert from "node:assert/strict";

// dlog writes one console.warn line per message, prefixed "[Emigration] " and otherwise unchanged (that is the line
// UI.log records), never touches the DOM (the old CSS-parse channel is gone), and never throws, even when
// console.warn itself does.

const warned = [];
const realWarn = console.warn;
console.warn = (m) => { warned.push(m); };
let domTouched = 0;
globalThis.document = { createElement: () => { domTouched++; return { style: {} }; } };

const { dlog } = await import("/emigration/ui/emigration-log.js");

function testMessagePassesThrough() {
  warned.length = 0;
  dlog("boot start (turnInterval 1, crossCiv true)");
  assert.deepEqual(warned, ["[Emigration] boot start (turnInterval 1, crossCiv true)"], "one line, punctuation intact");
}

function testLongMessageIsOneLine() {
  warned.length = 0;
  dlog("a".repeat(500));
  assert.equal(warned.length, 1, "no chunking");
  assert.equal(warned[0], "[Emigration] " + "a".repeat(500));
}

function testNonStringInput() {
  warned.length = 0;
  dlog(123);
  dlog(null);
  dlog("");
  assert.deepEqual(warned, ["[Emigration] 123", "[Emigration] null", "[Emigration] "]);
}

function testNoDomWrites() {
  dlog("anything");
  assert.equal(domTouched, 0, "the CSS-parse channel is gone: no elements created");
}

function testThrowingConsoleIsSwallowed() {
  console.warn = () => { throw new Error("console unavailable"); };
  assert.doesNotThrow(() => dlog("still safe"));
  console.warn = (m) => { warned.push(m); };
}

testMessagePassesThrough();
testLongMessageIsOneLine();
testNonStringInput();
testNoDomWrites();
testThrowingConsoleIsSwallowed();

console.warn = realWarn;
delete globalThis.document;

console.log("log-branches harness passed");
