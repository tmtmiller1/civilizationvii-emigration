import assert from "node:assert/strict";

// In-memory GameConfiguration so the tallies persist within the test.
let KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

const {
  recordMigrations, recentEventsFor, netDeltaForPlayer, migrationFlowHistory,
  recordDisasterEvent, sampleOut, sampleIn, migrationFlows
} = await import("/emigration/ui/emigration-migration-stats.js");
const { capFlows } = await import("/emigration/ui/emigration-flow-history.js");
const { registerMigrationMetric } = await import(
  "/emigration/ui/emigration-demographics.js"
);

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
    ["Population", "Net Migration (Graph)", "Net Migration (Table)", "Emigration", "Immigration",
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

function testEmptyPassRecordsPopulationFrame() {
  // A peaceful pass (ZERO migrations) must still record a timeline frame carrying the per-civ
  // population snapshot, so the network/flow timeline is available and plays population growth before
  // any emigration occurs. Advance the game turn well past the 1..5 snapshot interval between passes
  // so a fresh frame opens each time, then confirm the empty passes appended frames (with a `pop`).
  globalThis.Game = { turn: 500 };
  const before = migrationFlowHistory().length;
  recordMigrations([]); // peaceful pass
  globalThis.Game = { turn: 520 };
  recordMigrations([]); // another peaceful pass, well past any interval
  const after = migrationFlowHistory();
  assert.ok(after.length > before, "empty passes still append timeline frames (population history)");
  const newest = after[after.length - 1];
  assert.ok(newest.pop && typeof newest.pop === "object", "frame carries a population snapshot");
  delete globalThis.Game;
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
function testCapFlowsBoundsTheMatrixEvictingSmallest() {
  // The cumulative flow matrices must not grow unbounded: past MAX_FLOW_KEYS, the lowest-volume edges
  // are evicted (from flows AND flowsPts together) so the persisted blob stays bounded.
  const s = { flows: {}, flowsPts: {} };
  for (let i = 0; i < 4100; i++) {
    s.flows["k" + i] = { war: i + 1 }; // k0 = smallest (1 person), k4099 = largest
    s.flowsPts["k" + i] = { war: 1 };
  }
  capFlows(s.flows, s.flowsPts, 4000);
  const n = Object.keys(s.flows).length;
  assert.ok(n <= 4000 && n >= 3000, "capped near MAX_FLOW_KEYS (was " + n + ")");
  assert.ok(!("k0" in s.flows), "the lowest-volume edge was evicted");
  assert.ok("k4099" in s.flows, "the highest-volume edge was retained");
  assert.equal(Object.keys(s.flowsPts).length, n, "flowsPts evicted in lockstep with flows");
}

testRecentEventsFeedIsPlayerFilteredNewestFirst();
testEmptyPassRecordsPopulationFrame();
testCapFlowsBoundsTheMatrixEvictingSmallest();

// ── Edge case tests for complex scenarios ────────────────────────────────────
// Note: Tests share cumulative KV state, so use unique player IDs (100+) to avoid
// interference with earlier tests.

function testIntraCivMovesNetToZero() {
  // Intra-civ moves (srcOwner === destOwner) should cancel from net but count
  // as emigration/immigration for the flows. Net should be zero since people
  // stay within the same civ.
  recordMigrations([
    { srcOwner: 100, destOwner: 100, people: 3000 },
    { srcOwner: 100, destOwner: 100, people: 2000 }
  ]);
  const D = /** @type {*} */ (globalThis).EmigrationData;
  assert.equal(D.netCumFor(100), 0, "intra-civ moves net to zero");
  assert.equal(D.grossOutCumFor(100), 5000, "but count as gross emigration");
  assert.equal(D.grossInCumFor(100), 5000, "and gross immigration");
}

function testZeroPopulationFlowsIgnored() {
  // Flows with 0 people should not affect tallies or appear in flow history.
  const before = migrationFlows().length;
  recordMigrations([
    { srcOwner: 101, destOwner: 102, people: 0 },
    { srcOwner: 101, destOwner: 102, people: 100 }
  ]);
  const D = /** @type {*} */ (globalThis).EmigrationData;
  assert.equal(D.netCumFor(101), -100);
  assert.equal(D.netCumFor(102), 100);
  const flows = migrationFlows();
  const edge = flows.filter((f) => f.src === 101 && f.dest === 102)[0];
  assert.ok(edge, "flow edge exists");
  assert.equal(edge.people, 100, "zero-person flow not included");
}

function testCauseBreakdownAggregation() {
  // Cause breakdowns with identical values should aggregate correctly,
  // and zero-only causes should be dropped from display.
  recordMigrations([
    { srcOwner: 103, destOwner: 104, people: 1000, cause: "war" },
    { srcOwner: 103, destOwner: 104, people: 1000, cause: "unhappiness" },
    { srcOwner: 103, destOwner: 104, people: 1000, cause: "prosperity" }
  ]);
  const D = /** @type {*} */ (globalThis).EmigrationData;
  assert.equal(D.netCumFor(103), -3000);
  assert.equal(D.netCumFor(104), 3000);
  const byExit = D.emigrationByCauseFor(103);
  assert.equal((byExit.war || 0) + (byExit.unhappiness || 0) + (byExit.prosperity || 0), 3000);
}

function testWatermarkConsumptionIndependence() {
  // Each call to sampleDelta should advance the watermark, making subsequent
  // calls return 0 if no new migrations occurred.
  recordMigrations([{ srcOwner: 105, destOwner: 106, people: 5000 }]);
  // First read: 5000 change
  const first = netDeltaForPlayer(106);
  assert.equal(first, 5000, "initial delta");
  // Second read (no new): 0
  const second = netDeltaForPlayer(106);
  assert.equal(second, 0, "watermark advanced");
  // New migration: delta again
  recordMigrations([{ srcOwner: 105, destOwner: 106, people: 3000 }]);
  const third = netDeltaForPlayer(106);
  assert.equal(third, 3000, "new delta");
}

function testRefugeeCauseFiltering() {
  // Only certain causes (war, disaster, conquest) count as refugees.
  // Economic causes (prosperity, unhappiness) do NOT.
  const refBefore = migrationFlows();
  recordMigrations([
    { srcOwner: 107, destOwner: 108, people: 1000, cause: "war" },
    { srcOwner: 107, destOwner: 108, people: 1000, cause: "disaster" },
    { srcOwner: 107, destOwner: 108, people: 1000, cause: "prosperity" }
  ]);
  const D = /** @type {*} */ (globalThis).EmigrationData;
  // Only war + disaster are refugees; prosperity is economic
  assert.equal(D.refugeesCumFor(107), 2000, "only forced displacement counts");
  assert.equal(D.grossOutCumFor(107), 3000, "but gross includes all causes");
}

function testMissingCauseHandling() {
  // Migration without a cause should still count in all tallies (treated as "other").
  recordMigrations([
    { srcOwner: 109, destOwner: 110, people: 500 }, // no cause
    { srcOwner: 109, destOwner: 110, people: 500, cause: "" }
  ]);
  const D = /** @type {*} */ (globalThis).EmigrationData;
  assert.equal(D.grossOutCumFor(109), 1000, "missing cause still counts");
  assert.equal(D.netCumFor(110), 1000);
}

function testDeathAttritionIsNotEmigration() {
  // Attrition deaths (srcOwner only, no destOwner) increment deaths but NOT
  // emigration or net (death is loss, not migration).
  recordMigrations([
    { srcOwner: 111, people: 2000, cause: "attrition" },
    { srcOwner: 111, destOwner: 112, people: 1000, cause: "war" }
  ]);
  const D = /** @type {*} */ (globalThis).EmigrationData;
  assert.equal(D.deathsCumFor(111), 2000, "attrition counted as deaths");
  assert.equal(D.grossOutCumFor(111), 1000, "but NOT as emigration");
  assert.equal(D.netCumFor(111), -1000, "net only includes war");
  assert.equal(D.netCumFor(112), 1000, "dest sees only the war");
}

function testLargePopulationAccumulation() {
  // Large flows (millions) should accumulate correctly without overflow.
  const big1 = 1000000;  // 1M
  const big2 = 2000000;  // 2M
  recordMigrations([
    { srcOwner: 113, destOwner: 114, people: big1, cause: "war" },
    { srcOwner: 113, destOwner: 115, people: big2, cause: "prosperity" }
  ]);
  const D = /** @type {*} */ (globalThis).EmigrationData;
  assert.equal(D.grossOutCumFor(113), big1 + big2, "large totals accumulate");
  assert.equal(D.netCumFor(113), -(big1 + big2));
  assert.equal(D.netCumFor(114), big1);
  assert.equal(D.netCumFor(115), big2);
}

function testFlowHistoryFrameCreation() {
  // Flow history should create frames even for empty passes (population snapshots).
  globalThis.Game = { turn: 100 };
  recordMigrations([]); // empty pass
  globalThis.Game = { turn: 150 };
  recordMigrations([{ srcOwner: 116, destOwner: 117, people: 500 }]);
  globalThis.Game = { turn: 200 };
  recordMigrations([]); // another empty
  const history = migrationFlowHistory();
  assert.ok(history.length >= 2, "flow history includes multiple frames");
  const mostRecent = history[history.length - 1];
  assert.ok(mostRecent.turn !== undefined, "frames carry turn data");
  delete globalThis.Game;
}

function testEventKeyAggregation() {
  // Migrations with eventKey should be tallied per-event for detailed ledgers.
  recordMigrations([
    { srcOwner: 118, destOwner: 119, people: 300, cause: "war", eventKey: "war_1" },
    { srcOwner: 118, destOwner: 120, people: 200, cause: "disaster", eventKey: "dis_1" }
  ]);
  const D = /** @type {*} */ (globalThis).EmigrationData;
  const outByEvent = D.emigrationByEventFor(118);
  assert.ok(outByEvent !== null && typeof outByEvent === "object", "event tally exists");
  assert.equal(D.grossOutCumFor(118), 500, "total gross emigration");
}

function testSampleOutIndependence() {
  // sampleOut and netDelta should use independent watermarks.
  recordMigrations([{ srcOwner: 121, destOwner: 122, people: 1000 }]);
  const out121 = sampleOut(121);
  assert.equal(out121, 1000, "first sample of sampleOut");
  // Second call: watermark already advanced
  assert.equal(sampleOut(121), 0, "sampleOut watermark advanced");
  // netDeltaForPlayer uses a different watermark
  const net121 = netDeltaForPlayer(121);
  assert.equal(net121, -1000, "net delta independent of sampleOut");
}

function testSampleInIncrement() {
  // sampleIn should track gross immigration independently.
  recordMigrations([{ srcOwner: 123, destOwner: 124, people: 1000 }]);
  const in124 = sampleIn(124);
  assert.equal(in124, 1000, "gross immigration sampled");
  assert.equal(sampleIn(124), 0, "watermark advanced");
}

function testDisasterEventStamping() {
  // recordDisasterEvent should log events with turn, age, year, name, severity.
  globalThis.Game = { turn: 250 };
  recordDisasterEvent("Volcano", 5);
  recordDisasterEvent("Meteor", 10);
  const D = /** @type {*} */ (globalThis).EmigrationData;
  const events = D.disasterEvents();
  assert.ok(events.length >= 2, "events recorded");
  const meteor = events.find((e) => e.name === "Meteor");
  assert.ok(meteor, "meteor event found");
  assert.equal(meteor.severity, 10);
  delete globalThis.Game;
}

testIntraCivMovesNetToZero();
testZeroPopulationFlowsIgnored();
testCauseBreakdownAggregation();
testWatermarkConsumptionIndependence();
testRefugeeCauseFiltering();
testMissingCauseHandling();
testDeathAttritionIsNotEmigration();
testLargePopulationAccumulation();
testFlowHistoryFrameCreation();
testEventKeyAggregation();
testSampleOutIndependence();
testSampleInIncrement();
testDisasterEventStamping();

console.log("migration-stats harness passed");
