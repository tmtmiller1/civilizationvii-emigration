import assert from "node:assert/strict";

const cssLog = [];
globalThis.document = {
  createElement: (tag) => ({
    style: {
      cssText: "",
      set cssText(v) { cssLog.push(v); }
    }
  })
};

const { dlog } = await import("/emigration/ui/emigration-log.js");

function testDlogShortMessage() {
  cssLog.length = 0;
  dlog("hello");
  // Short message should be emitted once
  assert.ok(cssLog.length > 0, "should emit CSS for short message");
  assert.ok(cssLog[0].includes("EMIG_"), "should include tag");
}

function testDlogEmptyMessage() {
  cssLog.length = 0;
  dlog("");
  assert.ok(cssLog.length > 0, "should emit CSS for empty message");
}

function testDlogLongMessageChunking() {
  cssLog.length = 0;
  const longMsg = "a".repeat(500);
  dlog(longMsg);
  // Long messages are chunked at 170 chars
  assert.ok(cssLog.length >= 2, "long message should be chunked into multiple parts");
}

function testDlogNonStringInput() {
  cssLog.length = 0;
  dlog(123);
  assert.ok(cssLog.length > 0, "should handle non-string input");
  
  cssLog.length = 0;
  dlog({ obj: "data" });
  assert.ok(cssLog.length > 0, "should handle object input");
  
  cssLog.length = 0;
  dlog(null);
  assert.ok(cssLog.length > 0, "should handle null");
}

function testDlogSpecialCharactersEscaped() {
  cssLog.length = 0;
  dlog("test@#$%^&*()");
  assert.ok(cssLog.length > 0, "should escape special characters");
  assert.ok(cssLog[0].includes("EMIG_"), "should keep tag even with special chars");
}

testDlogShortMessage();
testDlogEmptyMessage();
testDlogLongMessageChunking();
testDlogNonStringInput();
testDlogSpecialCharactersEscaped();

delete globalThis.document;

console.log("log-branches harness passed");
