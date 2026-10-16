import assert from "node:assert/strict";

// The Self-Test screen's "Notification clarity" row runs against the live notification helpers. It has to
// agree with the color rule the toasts and log rows actually use, or a lab game reads FAIL on a correct build.
const { runChecks } = await import("/emigration/ui/emigration-selftest-checks.js");
const { digestAccent } = await import("/emigration/ui/emigration-causes.js");

function clarityRow() {
  const r = runChecks().find((x) => x && x.label === "Notification clarity");
  assert.ok(r, "the battery includes the Notification clarity row");
  return r;
}

function testClarityPassesOnTheShippedHelpers() {
  const r = clarityRow();
  assert.equal(r.status, "PASS", "Notification clarity reads PASS: " + r.detail);
}

function testClarityMatchesTheDirectionRule() {
  // The rule the check encodes: rival red, arrival green, internal neutral (neither of the other two).
  const rival = digestAccent(true, true), internal = digestAccent(true, false), arrival = digestAccent(false, true);
  assert.notEqual(internal, arrival, "moves between your own cities aren't green");
  assert.notEqual(internal, rival, "moves between your own cities aren't red");
  assert.equal(clarityRow().status, "PASS");
}

testClarityPassesOnTheShippedHelpers();
testClarityMatchesTheDirectionRule();
console.log("selftest-notification-clarity: ok");
