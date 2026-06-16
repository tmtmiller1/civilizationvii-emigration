import assert from "node:assert/strict";

// In-memory GameConfiguration so the tallies persist within the test.
let KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

const { recordMigrations, recentEventsFor } = await import(
  "/emigration/ui/emigration-migration-stats.js"
);
const { registerMigrationMetric } = await import("/emigration/ui/emigration-demographics.js");

function testNetIsGainForDestLossForSrc() {
  // Player 1 → player 0: 0 loses 12k, 1 gains 12k. (Same-civ moves net to 0.)
  recordMigrations([
    { srcOwner: 1, destOwner: 0, people: 12000 },
    { srcOwner: 3, destOwner: 3, people: 5000 }
  ]);
  // Registration is needed to reach the accessor; do it via a capturing stub.
  const spec = captureSpec();
  assert.equal(spec.accessor({ id: 0 }), 12000); // net immigration
  // Re-reading a fresh stub player: player 1 lost 12k.
  assert.equal(captureSpec().accessor({ id: 1 }), -12000);
  assert.equal(captureSpec().accessor({ id: 3 }), 0); // intra-civ nets to zero
}

function testDeltaAdvancesPerSample() {
  // After the first read above consumed player 0's 12k, a second read with no new
  // migration is 0; then a new migration shows only the new delta.
  let spec = captureSpec();
  assert.equal(spec.accessor({ id: 0 }), 0); // already sampled, nothing new
  recordMigrations([{ srcOwner: 2, destOwner: 0, people: 4000 }]);
  spec = captureSpec();
  assert.equal(spec.accessor({ id: 0 }), 4000); // just the new flow
  assert.equal(captureSpec().accessor({ id: 0 }), 0); // and it's consumed
}

function testFormatIsSignedPeople() {
  const spec = captureSpec();
  assert.equal(spec.format(0), "0");
  assert.equal(spec.format(12000), "+12 thousand");
  assert.equal(spec.format(-5000), "-5 thousand");
}

const EXPECTED_PAGES = [
  ["power", "emig_net_migration"],
  ["power", "emig_out"],
  ["power", "emig_in"],
  ["conflicts", "emig_refugees"]
];

function testReadyApiRegistersImmediately() {
  const pages = [];
  const ids = [];
  globalThis.DemographicsMetricsAPI = {
    registerMetric: (s) => ids.push(s.id),
    registerMetricToPage: (page, id) => pages.push([page, id])
  };
  assert.equal(registerMigrationMetric(), true);
  assert.ok(ids.includes("emig_net_migration") && ids.includes("emig_refugees"));
  assert.deepEqual(pages, EXPECTED_PAGES);
}

function testDeferredRegistrationIsOrderIndependent() {
  // Demographics not loaded yet (its metrics module is dynamic-imported later):
  // registration queues and returns false, without registering anything.
  delete globalThis.DemographicsMetricsAPI;
  assert.equal(registerMigrationMetric(), false);
  const api = globalThis.DemographicsMetricsAPI;
  assert.equal(api.pending.length, 1);
  // Demographics loads later and drains the queue (mirrors demographics-metrics).
  const pages = [];
  const ids = [];
  api.registerMetric = (s) => ids.push(s.id);
  api.registerMetricToPage = (page, id) => pages.push([page, id]);
  for (const job of api.pending.splice(0)) job(api);
  assert.ok(ids.includes("emig_net_migration")); // registered after drain
  assert.deepEqual(pages, EXPECTED_PAGES);
}

function testNeverInstalledNeverRegisters() {
  // If Demographics is never present, the queued job is simply never drained -
  // no metric, no graph. (We assert the queue holds it and nothing consumed it.)
  delete globalThis.DemographicsMetricsAPI;
  registerMigrationMetric();
  assert.equal(typeof globalThis.DemographicsMetricsAPI.registerMetric, "undefined");
  assert.equal(globalThis.DemographicsMetricsAPI.pending.length, 1);
}

// Re-register against a capturing stub to obtain the live metric spec (with its
// closure over the real tallies), without disturbing the no-op test ordering.
function captureSpec(id = "emig_net_migration") {
  const specs = {};
  globalThis.DemographicsMetricsAPI = {
    registerMetric: (s) => (specs[s.id] = s),
    registerMetricToPage: () => {}
  };
  registerMigrationMetric();
  return specs[id];
}

// ── Gross out/in + cause-tagged refugees (EmigrationData) ──────────────────

function testGrossAndRefugeeTallies() {
  const D = /** @type {*} */ (globalThis).EmigrationData;
  const out0 = D.grossOutCumFor(5);
  const in0 = D.grossInCumFor(6);
  const ref0 = D.refugeesCumFor(5);
  recordMigrations([{ srcOwner: 5, destOwner: 6, people: 8000, cause: "war" }]);
  assert.equal(D.grossOutCumFor(5) - out0, 8000);
  assert.equal(D.grossInCumFor(6) - in0, 8000);
  assert.equal(D.refugeesCumFor(5) - ref0, 8000); // war → counts as refugees
  // An unhappiness move adds to gross out but NOT to refugees.
  const ref1 = D.refugeesCumFor(5);
  recordMigrations([{ srcOwner: 5, destOwner: 6, people: 1000, cause: "unhappiness" }]);
  assert.equal(D.refugeesCumFor(5) - ref1, 0);
}

function testAttritionIsDeathsNotMigration() {
  const D = /** @type {*} */ (globalThis).EmigrationData;
  const d0 = D.deathsCumFor(7);
  const out0 = D.grossOutCumFor(7);
  const ref0 = D.refugeesCumFor(7);
  const net0 = D.netCumFor(7);
  recordMigrations([{ srcOwner: 7, people: 3000, cause: "attrition" }]); // no destOwner
  assert.equal(D.deathsCumFor(7) - d0, 3000); // counted as deaths
  assert.equal(D.grossOutCumFor(7) - out0, 0); // NOT emigration
  assert.equal(D.refugeesCumFor(7) - ref0, 0); // NOT refugees
  assert.equal(D.netCumFor(7) - net0, 0); // NOT net migration (a death isn't migration)
}

function testRefugeeCauseRouting() {
  const D = /** @type {*} */ (globalThis).EmigrationData;
  // Forced displacement (disaster, conquest) counts as refugees; economic prosperity does NOT.
  const dis0 = D.refugeesCumFor(10);
  recordMigrations([{ srcOwner: 10, destOwner: 11, people: 2000, cause: "disaster" }]);
  assert.equal(D.refugeesCumFor(10) - dis0, 2000); // disaster → refugees
  const con0 = D.refugeesCumFor(10);
  recordMigrations([{ srcOwner: 10, destOwner: 11, people: 1000, cause: "conquest" }]);
  assert.equal(D.refugeesCumFor(10) - con0, 1000); // conquest → refugees
  const pro0 = D.refugeesCumFor(10);
  recordMigrations([{ srcOwner: 10, destOwner: 11, people: 9000, cause: "prosperity" }]);
  assert.equal(D.refugeesCumFor(10) - pro0, 0); // prosperity is economic, NOT a refugee
  assert.ok(D.grossOutCumFor(10) > 0); // but it still counts as gross emigration
}

function testRecentEventsFeedIsPlayerFilteredNewestFirst() {
  recordMigrations([
    { srcOwner: 20, destOwner: 21, people: 100, cause: "war" },
    { srcOwner: 22, destOwner: 23, people: 200, cause: "unhappiness" }, // unrelated to 20/21
    { srcOwner: 21, destOwner: 20, people: 300, cause: "prosperity" }
  ]);
  const recent = recentEventsFor(20);
  assert.ok(recent.length >= 2);
  assert.equal(recent[0].people, 300); // newest first
  for (const m of recent) {
    assert.ok(m.srcOwner === 20 || m.destOwner === 20); // only player 20's moves
  }
  assert.equal(recentEventsFor(20, 1).length, 1); // limit respected
}

testNetIsGainForDestLossForSrc();
testDeltaAdvancesPerSample();
testFormatIsSignedPeople();
testReadyApiRegistersImmediately();
testDeferredRegistrationIsOrderIndependent();
testNeverInstalledNeverRegisters();
testGrossAndRefugeeTallies();
testAttritionIsDeathsNotMigration();
testRefugeeCauseRouting();
testRecentEventsFeedIsPlayerFilteredNewestFirst();

console.log("migration-stats harness passed");
