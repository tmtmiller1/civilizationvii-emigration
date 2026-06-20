import assert from "node:assert/strict";

// In-memory GameConfiguration so the tallies persist within the test.
let KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

const { recordMigrations, recentEventsFor, netDeltaForPlayer } = await import(
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
  // netDeltaForPlayer is the per-sample delta of the cumulative net tally: each read returns the flow
  // since the previous read (advancing a watermark), so an unchanged tally reads 0. (The registered
  // graphs now chart the cumulative net via emig_net_cum; this exercises the underlying delta fn on a
  // fresh player so it's independent of the cumulative reads above.)
  recordMigrations([{ srcOwner: 30, destOwner: 31, people: 7000 }]);
  assert.equal(netDeltaForPlayer(31), 7000); // first read: the new flow
  assert.equal(netDeltaForPlayer(31), 0); // consumed; nothing new
  recordMigrations([{ srcOwner: 30, destOwner: 31, people: 2000 }]);
  assert.equal(netDeltaForPlayer(31), 2000); // just the new delta
}

function testFormatIsSignedPeople() {
  const spec = captureSpec();
  assert.equal(spec.format(0), "0");
  assert.equal(spec.format(12000), "+12 thousand");
  assert.equal(spec.format(-5000), "-5 thousand");
}

// All migration graphs are collapsed into one "Graphs" metric-group tab placed FIRST on Emigration's
// Migration page, with two toggle rows: a metric (Net/Emigration/Immigration/Refugees) and the units
// (Scaled / Civ numbers). Each (member, units) maps to a registered metric id.
function assertGraphsGroup(/** @type {*[]} */ groups) {
  assert.equal(groups.length, 1);
  const g = groups[0];
  assert.equal(g.id, "emig_graphs");
  assert.equal(g.pageId, "emig_migration_panel");
  assert.equal(g.first, true);
  assert.deepEqual(g.views.map((/** @type {*} */ v) => v.id), ["scaled", "civ"]);
  assert.deepEqual(g.members.map((/** @type {*} */ m) => m.label),
    ["Net Migration (Graph)", "Net Migration (Table)", "Emigration", "Immigration",
      "Refugees (Left)", "Refugees (Arrived)"]);
  for (const m of g.members) {
    assert.equal(typeof m.scaled, "string");
    assert.equal(typeof m.civ, "string");
  }
}

function testReadyApiRegistersImmediately() {
  const groups = [];
  const ids = [];
  globalThis.DemographicsMetricsAPI = {
    registerMetric: (s) => ids.push(s.id),
    registerMetricGroup: (g) => groups.push(g)
  };
  assert.equal(registerMigrationMetric(), true);
  assert.ok(ids.includes("emig_net_cum") && ids.includes("emig_refugees"));
  assertGraphsGroup(groups);
}

function testDeferredRegistrationIsOrderIndependent() {
  // Demographics not loaded yet (its metrics module is dynamic-imported later):
  // registration queues and returns false, without registering anything.
  delete globalThis.DemographicsMetricsAPI;
  assert.equal(registerMigrationMetric(), false);
  const api = globalThis.DemographicsMetricsAPI;
  assert.equal(api.pending.length, 1);
  // Demographics loads later and drains the queue (mirrors demographics-metrics).
  const groups = [];
  const ids = [];
  api.registerMetric = (s) => ids.push(s.id);
  api.registerMetricGroup = (g) => groups.push(g);
  for (const job of api.pending.splice(0)) job(api);
  assert.ok(ids.includes("emig_net_cum")); // registered after drain
  assertGraphsGroup(groups);
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
function captureSpec(id = "emig_net_cum") {
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
  const refIn0 = D.refugeesInCumFor(6);
  recordMigrations([{ srcOwner: 5, destOwner: 6, people: 8000, cause: "war" }]);
  assert.equal(D.grossOutCumFor(5) - out0, 8000);
  assert.equal(D.grossInCumFor(6) - in0, 8000);
  assert.equal(D.refugeesCumFor(5) - ref0, 8000); // war → counts as refugees OUT for the source
  assert.equal(D.refugeesInCumFor(6) - refIn0, 8000); // and refugees IN for the destination
  // An unhappiness move adds to gross out/in but NOT to refugees (out or in).
  const ref1 = D.refugeesCumFor(5);
  const refIn1 = D.refugeesInCumFor(6);
  recordMigrations([{ srcOwner: 5, destOwner: 6, people: 1000, cause: "unhappiness" }]);
  assert.equal(D.refugeesCumFor(5) - ref1, 0);
  assert.equal(D.refugeesInCumFor(6) - refIn1, 0);
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
