import assert from "node:assert/strict";

const { sampleDashboard } = await import("/emigration/ui/emigration-demo-data.js");

function testDefaultShapeAndMarkers() {
  const d = sampleDashboard();
  assert.equal(d.sample, true);
  assert.ok(Array.isArray(d.civs) && d.civs.length > 0);
  assert.ok(Array.isArray(d.flows) && d.flows.length > 0);
  assert.ok(Array.isArray(d.history) && d.history.length > 0);
  assert.ok(Array.isArray(d.events) && d.events.length > 0);
  assert.ok(Array.isArray(d.myCities) && d.myCities.length > 0);
}

function testHistoryDensityTracksStep() {
  const dense = sampleDashboard(1);
  const defaultStep = sampleDashboard();
  const coarse = sampleDashboard(5);

  assert.equal(dense.history.length, 225);
  assert.equal(defaultStep.history.length, 75);
  assert.equal(coarse.history.length, 45);
}

function testOutOfRangeStepFallsBackToDefault() {
  const invalid = sampleDashboard(99);
  assert.equal(invalid.history.length, 75);
}

function testEventsAndCityCivPointsAreResolved() {
  const d = sampleDashboard(2);

  for (const e of d.events) {
    assert.ok(e.from >= 0);
    assert.ok(e.to >= e.from);
    assert.ok(e.to < d.history.length);
  }

  for (const city of d.myCities) {
    for (const dir of [city.in, city.out]) {
      for (const civ of dir.civs || []) {
        assert.equal(typeof civ.points, "number");
        assert.ok(civ.points >= 1);
      }
    }
  }

  const first = d.history[0];
  const last = d.history[d.history.length - 1];
  assert.equal(first.turn, 2);
  assert.ok(typeof first.year === "string");
  assert.ok(last.flows.length >= first.flows.length);
}

testDefaultShapeAndMarkers();
testHistoryDensityTracksStep();
testOutOfRangeStepFallsBackToDefault();
testEventsAndCityCivPointsAreResolved();

console.log("demo-data harness passed");
