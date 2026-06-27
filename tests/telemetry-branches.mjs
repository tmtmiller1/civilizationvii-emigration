import assert from "node:assert/strict";

globalThis.Game = { age: 1 };
globalThis.GameInfo = {
  Ages: {
    lookup: (id) => ({ AgeType: "AGE_TEST" })
  }
};
globalThis.EmigrationData = {
  netCumFor: (pid) => {
    const data = { 1: 100, 2: 50, 3: 20 };
    return data[pid] || 0;
  },
  refugeesCumFor: (pid) => {
    const data = { 1: 80, 2: 30, 3: 10 };
    return data[pid] || 0;
  }
};

const { logNetDistribution, reportBalanceSignals } = 
  await import("/emigration/ui/emigration-telemetry.js");

function testReportBalanceSignalsWithHighDominance() {
  const owners = [1, 2, 3];
  // Should not throw when reporting net flow outlier
  try {
    reportBalanceSignals(owners, 100);
  } catch (e) {
    assert.fail(`reportBalanceSignals should not throw: ${e.message}`);
  }
}

function testReportBalanceSignalsWithHighRefugeeConcentration() {
  const owners = [1, 2, 3];
  // Should not throw when reporting refugee concentration
  try {
    reportBalanceSignals(owners, 200);
  } catch (e) {
    assert.fail(`reportBalanceSignals should not throw: ${e.message}`);
  }
}

function testReportBalanceSignalsThrottled() {
  const owners = [1, 2, 3];
  
  // First call should not throw
  try {
    reportBalanceSignals(owners, 100);
  } catch (e) {
    assert.fail(`first call should not throw: ${e.message}`);
  }
  
  // Immediate second call within throttle window should not throw
  try {
    reportBalanceSignals(owners, 105);
  } catch (e) {
    assert.fail(`throttled call should not throw: ${e.message}`);
  }
}

function testReportBalanceSignalsWithEmptyOwners() {
  // Should not throw and should return early
  try {
    reportBalanceSignals([], 150);
  } catch (e) {
    assert.fail(`should handle empty owners: ${e.message}`);
  }
}

function testReportBalanceSignalsWithNonNumberTurn() {
  const owners = [1, 2, 3];
  // Should handle non-number turn gracefully
  try {
    reportBalanceSignals(owners, null);
    reportBalanceSignals(owners, "string");
    reportBalanceSignals(owners, {});
  } catch (e) {
    assert.fail(`should handle non-number turn: ${e.message}`);
  }
}

function testLogNetDistributionWithValidStats() {
  const stats = {
    cumPts: { 1: 500, 2: 200 },
    cum: { 1: 150, 2: 75 }
  };
  const migs = [
    { phase: "arrive", crossCiv: false, srcOwner: 1, destOwner: 2 }
  ];
  
  try {
    logNetDistribution(stats, migs);
  } catch (e) {
    assert.fail(`should log net distribution: ${e.message}`);
  }
}

function testLogNetDistributionWithZeroCums() {
  const stats = {
    cumPts: {},
    cum: {}
  };
  const migs = [];
  
  try {
    logNetDistribution(stats, migs);
  } catch (e) {
    assert.fail(`should log even with zero cums: ${e.message}`);
  }
}

function testLogNetDistributionWithComplexMigrations() {
  const stats = {
    cumPts: { 1: 100 },
    cum: { 1: 50 }
  };
  const migs = [
    { phase: "arrive", crossCiv: true, srcOwner: 2, destOwner: 1 },
    { phase: "depart", crossCiv: false, srcOwner: 1, destOwner: -1 }
  ];
  
  try {
    logNetDistribution(stats, migs);
  } catch (e) {
    assert.fail(`should log complex migrations: ${e.message}`);
  }
}

function testLogNetDistributionErrorHandling() {
  // Should handle null inputs gracefully without throwing
  try {
    logNetDistribution(null, null);
    logNetDistribution(undefined, undefined);
    logNetDistribution("string", "string");
  } catch (e) {
    assert.fail(`should handle error cases: ${e.message}`);
  }
}

function testReportBalanceSignalsAgeResolution() {
  const owners = [1];
  // Test age resolution with missing Game.age
  const origAge = globalThis.Game.age;
  delete globalThis.Game.age;
  
  try {
    reportBalanceSignals(owners, 300);
  } catch (e) {
    assert.fail(`should handle missing Game.age: ${e.message}`);
  }
  
  globalThis.Game.age = origAge;
}

function testLogNetDistributionWithMissingFields() {
  const stats = {
    cumPts: { 1: 100 }
    // cum is missing
  };
  const migs = [
    { phase: "arrive" }
    // crossCiv, srcOwner, destOwner missing
  ];
  
  try {
    logNetDistribution(stats, migs);
  } catch (e) {
    assert.fail(`should handle missing fields: ${e.message}`);
  }
}

testReportBalanceSignalsWithHighDominance();
testReportBalanceSignalsWithHighRefugeeConcentration();
testReportBalanceSignalsThrottled();
testReportBalanceSignalsWithEmptyOwners();
testReportBalanceSignalsWithNonNumberTurn();
testLogNetDistributionWithValidStats();
testLogNetDistributionWithZeroCums();
testLogNetDistributionWithComplexMigrations();
testLogNetDistributionErrorHandling();
testReportBalanceSignalsAgeResolution();
testLogNetDistributionWithMissingFields();

delete globalThis.Game;
delete globalThis.GameInfo;
delete globalThis.EmigrationData;

console.log("telemetry-branches harness passed");
