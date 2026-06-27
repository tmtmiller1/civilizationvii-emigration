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
