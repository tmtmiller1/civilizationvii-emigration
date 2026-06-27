import assert from "node:assert/strict";

// Setup comprehensive global mocks for integration testing
globalThis.Game = { turn: 100, age: 2 };
globalThis.GameInfo = {
  Ages: { lookup: (id) => ({ AgeType: "AGE_CLASSICAL" }) },
  Units: { lookup: (type) => type === "UNIT_MIGRANT" ? { UnitType: "UNIT_MIGRANT" } : null }
};
globalThis.GameContext = { player: 0 };
globalThis.Players = {
  get: (pid) => ({
    id: pid,
    Units: {
      getUnits: () => [
        { type: "UNIT_MIGRANT", name: "Migrant Unit" },
        { type: "UNIT_WARRIOR", name: "Warrior" }
      ]
    }
  })
};

const KV = {};
globalThis.Configuration = {
  getGame: () => ({
    getValue: (k) => (k in KV ? KV[k] : null)
  }),
  editGame: () => ({
    setValue: (k, v) => (KV[k] = v)
  })
};

globalThis.EmigrationData = {
  netCumFor: (pid) => [100, 150, 75][pid] || 0,
  refugeesCumFor: (pid) => [80, 40, 20][pid] || 0
};

globalThis.Locale = {
  Lookup: (key) => key || "Unknown"
};

// Import multiple modules for integration testing
const { logNetDistribution, reportBalanceSignals } = 
  await import("/emigration/ui/emigration-telemetry.js");
const { countMigrants } = 
  await import("/emigration/ui/emigration-migrant-units.js");
const { chronicled, chronicle, chronicleLog, clearChronicle } =
  await import("/emigration/ui/emigration-chronicle.js");
const { dlog } = 
  await import("/emigration/ui/emigration-log.js");

function testIntegrationMigrantProcessingWithStateTracking() {
  // Simulate a migration flow affecting multiple systems
  clearChronicle();
  
  // Track migrant units
  const migrantCount = countMigrants(0);
  assert.equal(typeof migrantCount, "number", "should count migrants");
  assert.ok(migrantCount >= 0, "migrant count should be non-negative");
  
  // Log chronicle entry for the migration
  chronicle({
    kind: "exodus",
    title: "Migrant Movement",
    body: "Units in motion",
    people: 500,
    civ: "Empire"
  });
  
  const log = chronicleLog();
  assert.ok(log.length > 0, "chronicle should record migration");
  assert.equal(log[0].kind, "exodus", "should be exodus type");
}

function testIntegrationMultipleMigrationWavesWithTelemetry() {
  // Simulate multiple migration events affecting balance signals
  const stats = {
    cumPts: { 0: 300, 1: 400, 2: 150 },
    cum: { 0: 100, 1: 120, 2: 50 }
  };
  
  const migs = [
    { phase: "depart", crossCiv: false, srcOwner: 0, destOwner: -1 },
    { phase: "arrive", crossCiv: true, srcOwner: 1, destOwner: 0 },
    { phase: "assimilate", crossCiv: false, srcOwner: 2, destOwner: 0 }
  ];
  
  // Log distribution and report balance signals
  logNetDistribution(stats, migs);
  reportBalanceSignals([0, 1, 2], 150);
  
  assert.ok(true, "integration logging should complete without error");
}

function testIntegrationChronicleWithStatePersistence() {
  clearChronicle();
  
  // Record multiple migration milestones
  const milestones = [
    { kind: "exodus", title: "Wave 1", body: "Initial departure" },
    { kind: "founding", title: "Settlement", body: "New colony established" },
    { kind: "return", title: "Homecoming", body: "Some return home" }
  ];
  
  for (const m of milestones) {
    chronicle(m);
  }
  
  const log = chronicleLog();
  assert.ok(log.length >= 3, "chronicle should record multiple entries");
  assert.equal(log[0].kind, "return", "most recent should be first (newest-first)");
}

function testIntegrationErrorRecoveryPathsCombined() {
  // Test that all modules handle missing data gracefully
  const origConfig = globalThis.Configuration;
  delete globalThis.Configuration;
  
  try {
    chronicle({ kind: "exodus", title: "Test" });
    reportBalanceSignals([0, 1], 100);
    logNetDistribution(null, null);
  } catch (e) {
    // Should not throw
    assert.fail(`should handle missing Configuration: ${e.message}`);
  }
  
  globalThis.Configuration = origConfig;
}

function testIntegrationCivBoundaryConditions() {
  // Test edge cases with civ 0, negative, and out-of-range
  const stats = {
    cumPts: { 0: 100, "-1": 50, "999": 75 },
    cum: { 0: 50, "-1": 25, "999": 40 }
  };
  
  const migs = [
    { phase: "arrive", crossCiv: true, srcOwner: 999, destOwner: 0 },
    { phase: "depart", crossCiv: false, srcOwner: -1, destOwner: null }
  ];
  
  try {
    logNetDistribution(stats, migs);
    reportBalanceSignals([0, -1, 999], 200);
  } catch (e) {
    assert.fail(`should handle boundary civ ids: ${e.message}`);
  }
}

function testIntegrationLargeScaleMigrationSimulation() {
  clearChronicle();
  
  // Simulate a large-scale migration event
  for (let i = 0; i < 50; i++) {
    chronicle({
      kind: i % 3 === 0 ? "exodus" : i % 3 === 1 ? "founding" : "return",
      title: `Event ${i}`,
      body: `Large-scale migration wave ${i}`,
      people: Math.floor(Math.random() * 1000) + 100,
      civ: `Civ${i % 5}`
    });
  }
  
  const log = chronicleLog();
  assert.ok(log.length > 0, "should have chronicle entries");
  assert.ok(log.length <= 80, "should be capped at 80 entries");
}

function testIntegrationDifferentPhasesAndCrossings() {
  const stats = {
    cumPts: { 1: 250, 2: 180, 3: 120, 4: 90 },
    cum: { 1: 100, 2: 75, 3: 50, 4: 35 }
  };
  
  const migs = [
    { phase: "depart", crossCiv: false, srcOwner: 1 },
    { phase: "arrive", crossCiv: true, srcOwner: 1, destOwner: 2 },
    { phase: "depart", crossCiv: true, srcOwner: 2 },
    { phase: "arrive", crossCiv: false, srcOwner: 3, destOwner: 4 },
    { phase: "assimilate", crossCiv: true, srcOwner: 4, destOwner: 1 }
  ];
  
  try {
    logNetDistribution(stats, migs);
  } catch (e) {
    assert.fail(`should handle diverse migration phases: ${e.message}`);
  }
}

function testIntegrationExtendedRebalancingScenarios() {
  // Test various balance scenarios with different distributions
  const scenarios = [
    { netCum: [1000, 100, 10], refugeeCum: [500, 250, 50] },
    { netCum: [500, 500, 500], refugeeCum: [300, 300, 300] },
    { netCum: [1, 1, 1], refugeeCum: [1, 1, 1] }
  ];
  
  for (const scenario of scenarios) {
    globalThis.EmigrationData.netCumFor = (pid) => scenario.netCum[pid] || 0;
    globalThis.EmigrationData.refugeesCumFor = (pid) => scenario.refugeeCum[pid] || 0;
    
    try {
      reportBalanceSignals([0, 1, 2], 300);
    } catch (e) {
      assert.fail(`should handle scenario ${JSON.stringify(scenario)}: ${e.message}`);
    }
  }
}

function testIntegrationChronicleCapacityManagement() {
  clearChronicle();
  
  // Fill chronicle to capacity (80 entries)
  for (let i = 0; i < 100; i++) {
    chronicle({
      kind: i % 3 === 0 ? "exodus" : i % 3 === 1 ? "founding" : "return",
      title: `Entry ${i}`,
      body: `Body ${i}`,
      dedupeKey: i % 5 === 0 ? `key_${i}` : undefined
    });
  }
  
  const log = chronicleLog();
  assert.ok(log.length <= 80, "chronicle capacity should be enforced");
  assert.ok(log.length > 0, "chronicle should retain entries");
}

function testIntegrationMultipleGameTurns() {
  // Test tracking across multiple simulated game turns
  for (let turn = 1; turn <= 5; turn++) {
    globalThis.Game.turn = turn * 10;
    
    clearChronicle();
    chronicle({
      kind: "exodus",
      title: `Turn ${turn}`,
      body: `Events at turn ${turn * 10}`
    });
    
    reportBalanceSignals([0, 1], turn * 10);
    
    const stats = {
      cumPts: { 0: turn * 100, 1: turn * 50 },
      cum: { 0: turn * 50, 1: turn * 25 }
    };
    logNetDistribution(stats, []);
  }
  
  assert.ok(true, "multi-turn simulation should complete");
}

function testIntegrationStateChangeSequences() {
  // Simulate a state change sequence
  const sequence = [
    { kind: "exodus", title: "Start", body: "Test1" },
    { kind: "founding", title: "Middle", body: "Test2" },
    { kind: "return", title: "End", body: "Test3" }
  ];
  
  // Test that operations don't throw
  try {
    for (const entry of sequence) {
      chronicle(entry);
    }
  } catch (e) {
    assert.fail(`chronicle operations should not throw: ${e.message}`);
  }
}

function testIntegrationEdgeCaseDataTypes() {
  // Test with various edge case data types
  const testCases = [
    { stats: { cumPts: {}, cum: {} }, migs: [] },
    { stats: { cumPts: { 0: 0 }, cum: { 0: 0 } }, migs: [] },
    { stats: { cumPts: { "0": 100 }, cum: { "0": 50 } }, migs: [{ phase: null }] },
    { stats: { cumPts: null, cum: null }, migs: null }
  ];
  
  for (const tc of testCases) {
    try {
      logNetDistribution(tc.stats, tc.migs);
    } catch (e) {
      assert.fail(`should handle edge case: ${e.message}`);
    }
  }
}

testIntegrationMigrantProcessingWithStateTracking();
testIntegrationMultipleMigrationWavesWithTelemetry();
testIntegrationChronicleWithStatePersistence();
testIntegrationErrorRecoveryPathsCombined();
testIntegrationCivBoundaryConditions();
testIntegrationLargeScaleMigrationSimulation();
testIntegrationDifferentPhasesAndCrossings();
testIntegrationExtendedRebalancingScenarios();
testIntegrationChronicleCapacityManagement();
testIntegrationMultipleGameTurns();
testIntegrationStateChangeSequences();
testIntegrationEdgeCaseDataTypes();

delete globalThis.Game;
delete globalThis.GameInfo;
delete globalThis.GameContext;
delete globalThis.Players;
delete globalThis.Configuration;
delete globalThis.EmigrationData;
delete globalThis.Locale;

console.log("integration-branches harness passed");
