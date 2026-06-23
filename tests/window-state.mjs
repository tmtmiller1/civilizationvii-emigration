import assert from "node:assert/strict";

// Import the main gatherDashboard function from the window module.
// Note: module expects GlobalThis.GameContext, Players, and EmigrationData globals.
const { gatherDashboard } = await import(
  "/emigration/ui/emigration-window.js"
);

/**
 * Mock GameContext with localPlayerID. Tests can override this.
 */
function setupGameContext(localId = 0) {
  globalThis.GameContext = { localPlayerID: localId };
}

/**
 * Mock EmigrationData for test scenarios.
 */
function setupEmigrationData() {
  globalThis.EmigrationData = {
    grossInCumFor: () => 0,
    grossOutCumFor: () => 0,
    netCumFor: () => 0,
    refugeesCumFor: () => 0,
    deathsCumFor: () => 0,
    externalLossesCumFor: () => 0,
    grossInPtsFor: () => 0,
    grossOutPtsFor: () => 0,
    netPtsFor: () => 0,
    refugeesPtsFor: () => 0,
    deathsPtsFor: () => 0,
    externalLossesPtsFor: () => 0,
    emigrationByCauseFor: () => ({}),
    immigrationByCauseFor: () => ({}),
    stanceImpactFor: () => ({ in: 0, out: 0, inPts: 0, outPts: 0 }),
    recentEventsFor: () => [],
    migrationFlowHistory: () => []
  };
}

/**
 * Setup minimalist Configuration.getValue() for STATE_KEY retrieval.
 */
function setupConfiguration() {
  globalThis.Configuration = {
    getGame: () => ({
      getValue: () => ({
        cum: {}, lastSampled: {}, out: {}, in: {}, refugees: {}, deaths: {},
        flows: {}, flowHistory: []
      })
    }),
    editGame: () => ({})
  };
}

function testGatherDashboardReturnsModel() {
  setupGameContext(0);
  setupEmigrationData();
  setupConfiguration();

  globalThis.monoTurn = () => 10;
  globalThis.effectivePolicy = () => 1;
  globalThis.getSampleData = () => false;
  globalThis.getSnapshotInterval = () => 20;

  const model = gatherDashboard();
  assert.ok(model, "model returned");
  assert.ok(Array.isArray(model.civs), "civs array present");
  assert.ok(typeof model.byCause === "object", "byCause object present");
  assert.ok(Array.isArray(model.flows), "flows array present");
  assert.ok(Array.isArray(model.myCities), "myCities array present");
}

function testGatherDashboardStructure() {
  setupGameContext(0);
  setupEmigrationData();
  setupConfiguration();

  globalThis.monoTurn = () => 10;
  globalThis.effectivePolicy = () => 1;
  globalThis.getSampleData = () => false;
  globalThis.getSnapshotInterval = () => 20;

  const model = gatherDashboard();
  // Verify all expected properties exist
  assert.ok("civs" in model, "civs property exists");
  assert.ok("byCause" in model, "byCause property exists");
  assert.ok("eventsByOwner" in model, "eventsByOwner property exists");
  assert.ok("flows" in model, "flows property exists");
  assert.ok("pops" in model, "pops property exists");
  assert.ok("intra" in model, "intra property exists");
  assert.ok("history" in model, "history property exists");
  assert.ok("events" in model, "events property exists");
  assert.ok("cities" in model, "cities property exists");
  assert.ok("myCities" in model, "myCities property exists");
}

function testGatherDashboardWithSampleData() {
  setupGameContext(0);
  setupEmigrationData();
  setupConfiguration();

  globalThis.getSampleData = () => true;
  globalThis.getSnapshotInterval = () => 30;
  globalThis.sampleDashboard = (interval) => ({
    civs: [{ name: "Sample" }], byCause: { war: 100 }, flows: [], pops: {},
    myCities: [], intra: [], history: [], events: [], cities: [],
    eventsByOwner: {}
  });

  const model = gatherDashboard();
  assert.ok(model, "sample data model returned");
  // Sample mode should return sample data
  assert.ok(Array.isArray(model.civs), "civs is array");
}

function testGatherDashboardEmptyMyCitiesNoLocalPlayer() {
  setupGameContext(null); // No local player
  setupEmigrationData();
  setupConfiguration();

  globalThis.monoTurn = () => 20;
  globalThis.effectivePolicy = () => 1;
  globalThis.getSampleData = () => false;
  globalThis.getSnapshotInterval = () => 20;

  const model = gatherDashboard();
  assert.ok(Array.isArray(model.myCities), "myCities is array");
  // When no local player, should be empty
  assert.equal(model.myCities.length, 0, "no local player → empty myCities");
}

function testGatherDashboardEventsByOwnerEmpty() {
  setupGameContext(0);
  setupEmigrationData();
  setupConfiguration();

  globalThis.monoTurn = () => 10;
  globalThis.effectivePolicy = () => 1;
  globalThis.getSampleData = () => false;
  globalThis.getSnapshotInterval = () => 20;

  const model = gatherDashboard();
  assert.ok(typeof model.eventsByOwner === "object", "eventsByOwner is object");
  assert.ok(!Array.isArray(model.eventsByOwner), "eventsByOwner not an array");
}

function testGatherDashboardFlowsIsArray() {
  setupGameContext(0);
  setupEmigrationData();
  setupConfiguration();

  globalThis.monoTurn = () => 10;
  globalThis.effectivePolicy = () => 1;
  globalThis.getSampleData = () => false;
  globalThis.getSnapshotInterval = () => 20;

  const model = gatherDashboard();
  assert.ok(Array.isArray(model.flows), "flows is array");
  assert.ok(Array.isArray(model.intra), "intra is array");
  assert.ok(Array.isArray(model.history), "history is array");
}

function testGatherDashboardWithEventData() {
  setupGameContext(0);
  setupEmigrationData();
  setupConfiguration();

  // Mock EmigrationData with event data
  globalThis.EmigrationData.emigrationByEventFor = () => ({ "war_evt_1": 100 });
  globalThis.EmigrationData.immigrationByEventFor = () => ({ "war_evt_1": 30 });
  globalThis.EmigrationData.deathsByEventFor = () => ({});

  globalThis.monoTurn = () => 30;
  globalThis.effectivePolicy = () => 1;
  globalThis.getSampleData = () => false;
  globalThis.getSnapshotInterval = () => 20;

  const model = gatherDashboard();
  assert.ok(typeof model.eventsByOwner === "object", "eventsByOwner present");
  // Note: actual event aggregation depends on inPlayCivs() which requires city signals
}

function testGatherDashboardPopulationsObject() {
  setupGameContext(0);
  setupEmigrationData();
  setupConfiguration();

  globalThis.monoTurn = () => 10;
  globalThis.effectivePolicy = () => 1;
  globalThis.getSampleData = () => false;
  globalThis.getSnapshotInterval = () => 20;

  const model = gatherDashboard();
  assert.ok(typeof model.pops === "object", "pops is object");
  assert.ok(!Array.isArray(model.pops), "pops not an array");
}

function testGatherDashboardHistoryIsArray() {
  setupGameContext(0);
  setupEmigrationData();
  setupConfiguration();

  globalThis.monoTurn = () => 10;
  globalThis.effectivePolicy = () => 1;
  globalThis.getSampleData = () => false;
  globalThis.getSnapshotInterval = () => 20;

  const model = gatherDashboard();
  assert.ok(Array.isArray(model.history), "history is array");
  assert.ok(Array.isArray(model.events), "events is array");
}

testGatherDashboardReturnsModel();
testGatherDashboardStructure();
testGatherDashboardWithSampleData();
testGatherDashboardEmptyMyCitiesNoLocalPlayer();
testGatherDashboardEventsByOwnerEmpty();
testGatherDashboardFlowsIsArray();
testGatherDashboardWithEventData();
testGatherDashboardPopulationsObject();
testGatherDashboardHistoryIsArray();

console.log("window-state harness passed");
