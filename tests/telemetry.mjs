import assert from "node:assert/strict";

const priorWarn = console.warn;
const lines = [];
console.warn = (...a) => lines.push(a.map(String).join(" "));

globalThis.Game = { age: 2 };
globalThis.GameInfo = { Ages: { lookup: () => ({ AgeType: "AGE_EXPLORATION" }) } };
globalThis.EmigrationData = {
  netCumFor(pid) {
    return pid === 1 ? 100 : 10;
  },
  refugeesCumFor(pid) {
    return pid === 2 ? 50 : 5;
  }
};

const { reportBalanceSignals, logNetDistribution } = await import("/emigration/ui/emigration-telemetry.js");

function testBalanceSignalsAreEmittedAndThrottled() {
  reportBalanceSignals([1, 2], 10);
  const firstBurst = lines.filter((l) => l.includes("BALANCE "));
  assert.equal(firstBurst.length, 2);
  assert.ok(firstBurst.some((l) => l.includes("net-flow outlier") && l.includes("AGE_EXPLORATION")));
  assert.ok(firstBurst.some((l) => l.includes("refugee concentration")));

  const before = lines.length;
  reportBalanceSignals([1, 2], 15);
  assert.equal(lines.length, before, "throttle should suppress reports inside interval");

  reportBalanceSignals([], 25);
  assert.equal(lines.length, before, "empty owners should not emit");
}

function testNetDistributionDiagnosticFormatsBothBranches() {
  logNetDistribution({ cumPts: { 1: 12 }, cum: { 1: 34 } }, [
    { phase: "depart", crossCiv: true, srcOwner: 1, destOwner: 2 },
    { phase: "arrive", crossCiv: false, srcOwner: 2, destOwner: undefined }
  ]);
  assert.ok(lines.some((l) => l.includes("netdist [c1:pts=12,ppl=34]")));

  logNetDistribution({ cumPts: {}, cum: {} }, []);
  assert.ok(lines.some((l) => l.includes("netdist [all-zero]")));
}

testBalanceSignalsAreEmittedAndThrottled();
testNetDistributionDiagnosticFormatsBothBranches();

console.warn = priorWarn;
delete globalThis.Game;
delete globalThis.GameInfo;
delete globalThis.EmigrationData;

console.log("telemetry harness passed");

// Counters that survive a load (session 2f of the 3.7.0 plan): the all-game totals live in the save under
// EmigrationTelemetry_v1, written with each pass; a reload reads them back while the session's own set starts
// from zero; the two are printed side by side.
{
  const KV = {};
  globalThis.Configuration = {
    getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
    editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
  };
  const { recordPassCounters, bumpArrivedIntoCrisis, bumpCrisisDestAvoided, telemetryCounters, telemetrySessionCounters,
    telemetryReasonHits, dumpCounters, __test } = await import("/emigration/ui/emigration-telemetry.js");
  __test.dropMemory();
  bumpArrivedIntoCrisis();
  bumpCrisisDestAvoided();
  recordPassCounters([
    { phase: "move", cause: "prosperity", crossCiv: false, reasons: ["richer"] },
    { phase: "move", cause: "war", crossCiv: true, reasons: ["safer-dir", "richer"] }
  ]);
  const saved = JSON.parse(KV.EmigrationTelemetry_v1);
  assert.equal(saved.counters.passes, 1, "the pass is in the save");
  assert.equal(saved.counters.crisisCrossCiv, 1);
  assert.equal(saved.counters.arrivedIntoCrisis, 1, "bumps before the pass's fold are in the same write");
  assert.equal(saved.counters.crisisDestAvoided, 1);
  assert.deepEqual(saved.reasons, { richer: 2, "safer-dir": 1 });
  // A reload: memory is gone, the save remains.
  __test.dropMemory();
  assert.equal(telemetryCounters().passes, 1, "the totals come back from the save");
  assert.equal(telemetryCounters().voluntaryMoves, 1);
  assert.deepEqual(telemetryReasonHits(), { richer: 2, "safer-dir": 1 });
  assert.equal(telemetrySessionCounters().passes, 0, "the session starts from zero");
  recordPassCounters([{ phase: "move", cause: "unhappiness", crossCiv: false }]);
  const d = dumpCounters();
  assert.equal(d.counters.passes, 2, "all-game: both passes");
  assert.equal(d.counters.voluntaryMoves, 2);
  assert.equal(d.session.passes, 1, "session: the one since the load");
  assert.equal(d.session.voluntaryMoves, 1);
  assert.equal(d.derived.totalMoves, 3, "the derived shares read the all-game numbers");
  assert.equal(JSON.parse(KV.EmigrationTelemetry_v1).counters.passes, 2, "and the save has the new total");
  // A damaged save reads as zeros, never throws.
  KV.EmigrationTelemetry_v1 = "{\"counters\":{\"passes\":\"x\",\"voluntaryMoves\":-4},\"reasons\":5}";
  __test.dropMemory();
  assert.equal(telemetryCounters().passes, 0);
  assert.equal(telemetryCounters().voluntaryMoves, 0);
  assert.deepEqual(telemetryReasonHits(), {});
  KV.EmigrationTelemetry_v1 = "not json";
  __test.dropMemory();
  assert.equal(telemetryCounters().passes, 0);
  console.log("telemetry persistence passed");
}
