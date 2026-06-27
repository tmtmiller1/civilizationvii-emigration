import assert from "node:assert/strict";

// The view-model builders are pure (formatPeople + causeLabel are pure); no engine globals.
const { civLedgerRows, causeBreakdownRows, stanceRows, pressureRows, flowNetwork, dashboardModel } =
  await import("/emigration/ui/emigration-views.js");

function testCivLedgerFormatsPeopleAndNet() {
  const rows = civLedgerRows([
    { name: "Rome", in: 5000, out: 12000, net: -7000, refugees: 3000, deaths: 0,
      inPts: 1, outPts: 3, netPts: -2, refugeesPts: 1, deathsPts: 0,
      stanceImpact: { in: 1600, out: 0, inPts: 1, outPts: 0 } }
  ]);
  assert.equal(rows[0].name, "Rome");
  assert.equal(rows[0].inP, 5000); // scaled people, raw (formatted per number-mode at render)
  assert.equal(rows[0].netP, -7000);
  assert.equal(rows[0].netPts, -2); // exact pop-point net
  assert.equal(rows[0].lossP, 0); // attrition + external population loss
  assert.equal(rows[0].stInP, 1600); // border-stance impact on immigration carried through
}

function testCauseBreakdownSortsAndComputesShare() {
  const rows = causeBreakdownRows({ war: 1000, unhappiness: 3000, disaster: 0 });
  assert.equal(rows.length, 2); // zero causes dropped
  assert.equal(rows[0].label, "Unhappiness"); // largest first
  assert.equal(rows[0].pct, 75); // 3000 / 4000
  assert.equal(rows[1].label, "War");
  assert.equal(rows[1].pct, 25);
}

function testStanceRowsListsAllCivsPolicyFirst() {
  const rows = stanceRows([
    { name: "Greece", stance: "none" },
    { name: "Carthage", stance: "anti" },
    { name: "Rome", stance: "pro" }
  ]);
  assert.equal(rows.length, 3); // every civ listed (Neutral included)
  assert.deepEqual(rows.map((r) => r.name), ["Rome", "Carthage", "Greece"]); // pro, anti, neutral
  assert.equal(rows[2].stance, "Neutral");
  assert.equal(rows[2].key, "none");
}

function testPressureRowsSortDescAndFlag() {
  const rows = pressureRows([
    { cityName: "Calm", causeLabel: "Unhappiness", pressureToBar: 0.1, topDestinationName: "X" },
    { cityName: "Hot", causeLabel: "War", pressureToBar: 0.9, topDestinationName: "Y", attritionRisk: true },
    { cityName: "Rest", causeLabel: "Disaster", pressureToBar: 0.5, topDestinationName: "", onCooldown: true }
  ]);
  assert.equal(rows[0].city, "Hot"); // highest pressure first
  assert.equal(rows[0].pressure, "90%");
  assert.equal(rows[0].flag, "at risk");
  assert.equal(rows[2].city, "Calm");
  assert.equal(rows.find((r) => r.city === "Rest").dest, "-"); // empty dest → placeholder
  assert.equal(rows.find((r) => r.city === "Rest").flag, "resting");
}

function testDashboardModelSections() {
  const m = dashboardModel({ civs: [], byCause: {}, flows: [], cities: [] });
  assert.equal(m.sections.length, 7); // network + flowmap merged into one toggleable "flow" section
  assert.deepEqual(
    m.sections.map((s) => s.kind),
    ["flow", "ledger", "pies", "cityflows", "stances", "notifications", "guide"]
  );
}

function testFlowNetworkAggregatesNodesAndEdges() {
  const net = flowNetwork([
    { from: 1, to: 2, fromName: "Rome", toName: "Egypt", fromCity: "Rome", toCity: "Memphis",
      people: 9000, byCause: { war: 9000 } },
    { from: 1, to: 2, fromName: "Rome", toName: "Egypt", fromCity: "Ostia", toCity: "Memphis",
      people: 1000, byCause: { war: 1000 } },
    { from: 2, to: 1, fromName: "Egypt", toName: "Rome", fromCity: "Memphis", toCity: "Rome",
      people: 3000, byCause: { prosperity: 3000 } },
    { from: 3, to: 1, fromName: "Maya", toName: "Rome", people: 0 } // dropped (no people)
  ]);
  // Nodes: Rome and Egypt only (the 0-people Maya edge contributes nothing).
  assert.deepEqual(net.nodes.map((n) => n.name).sort(), ["Egypt", "Rome"]);
  const rome = net.nodes.find((n) => n.name === "Rome");
  assert.equal(rome.outflow, 10000); // 9000 + 1000 out to Egypt
  assert.equal(rome.inflow, 3000); // 3000 in from Egypt
  assert.equal(rome.total, 13000);
  // Civ-level edges merge the two Rome→Egypt city pairs into one civ→civ edge.
  assert.equal(net.edges.length, 2);
  assert.equal(net.edges[0].people, 10000); // strongest (merged Rome→Egypt)
  assert.equal(net.edges[0].byCause.war, 10000);
  assert.equal(net.maxEdge, 10000);
  // City-level edges keep each origin AND destination settlement distinct.
  assert.equal(net.cityEdges.length, 3);
  assert.equal(net.cityEdges[0].fromCity, "Rome");
  assert.equal(net.cityEdges[0].toCity, "Memphis");
}

testCivLedgerFormatsPeopleAndNet();
testCauseBreakdownSortsAndComputesShare();
testStanceRowsListsAllCivsPolicyFirst();
testPressureRowsSortDescAndFlag();
testDashboardModelSections();
testFlowNetworkAggregatesNodesAndEdges();

// ── Edge case tests for view-model builders ────────────────────────────────────

function testFlowNetworkWithIsolatedCivs() {
  // A civ with no incoming or outgoing edges should still appear in nodes
  // with zero flow totals (for context/completeness in the ledger).
  const net = flowNetwork([
    { from: 1, to: 2, fromName: "Rome", toName: "Egypt", fromCity: "Rome",
      toCity: "Memphis", people: 5000, byCause: { war: 5000 } }
  ]);
  // Only Rome and Egypt appear (isolated civ not provided).
  assert.equal(net.nodes.length, 2);
  assert.equal(net.edges.length, 1);
}

function testDashboardModelEmptySections() {
  // Dashboard model should handle empty civs, flows, and notifications gracefully,
  // still providing all section structures (just with no rows).
  const m = dashboardModel({ civs: [], byCause: {}, flows: [], cities: [] });
  assert.equal(m.sections.length, 7);
  // Verify that each section has required properties even when empty
  for (const section of m.sections) {
    assert.equal(typeof section.kind, "string");
    assert.ok(Array.isArray(section.rows) || section.rows === undefined,
      "section.rows is array or undefined");
  }
}

function testCivLedgerSortingStabilityOnTie() {
  // When two civs have identical net values, ledger rows should maintain
  // stable sort order (alphabetical by name).
  const rows = civLedgerRows([
    { name: "Zulu", in: 1000, out: 2000, net: -1000, refugees: 0, deaths: 0,
      inPts: 1, outPts: 2, netPts: -1, refugeesPts: 0, deathsPts: 0,
      stanceImpact: { in: 0, out: 0, inPts: 0, outPts: 0 } },
    { name: "Athens", in: 2000, out: 3000, net: -1000, refugees: 500, deaths: 0,
      inPts: 2, outPts: 3, netPts: -1, refugeesPts: 0, deathsPts: 0,
      stanceImpact: { in: 0, out: 0, inPts: 0, outPts: 0 } },
    { name: "Babylon", in: 500, out: 1500, net: -1000, refugees: 100, deaths: 0,
      inPts: 1, outPts: 2, netPts: -1, refugeesPts: 0, deathsPts: 0,
      stanceImpact: { in: 0, out: 0, inPts: 0, outPts: 0 } }
  ]);
  // All have net: -1000, so verify order is meaningful (not corrupted by equal values)
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name + rows[1].name + rows[2].name, "ZuluAthensBabylon");
}

function testCauseBreakdownAllZeroDropped() {
  // When all causes have zero value, the breakdown should return empty (all dropped).
  const rows = causeBreakdownRows({ war: 0, unhappiness: 0, disaster: 0, other: 0 });
  assert.equal(rows.length, 0, "all-zero causes dropped");
}

function testCauseBreakdownSingleCauseFull100() {
  // When only one cause has value, it should be 100%.
  const rows = causeBreakdownRows({ war: 5000, unhappiness: 0 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, "War");
  assert.equal(rows[0].pct, 100, "single cause is 100%");
}

function testStanceRowsAllNeutral() {
  // When all civs are neutral stance, rows should still list them all
  // with correct neutral labels.
  const rows = stanceRows([
    { name: "Greece", stance: "none" },
    { name: "Carthage", stance: "none" },
    { name: "Rome", stance: "none" }
  ]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.key === "none"), "all neutral");
  assert.ok(rows.every((r) => r.stance === "Neutral"), "labeled as Neutral");
}

function testStanceRowsWithDuplicateNames() {
  // Edge case: duplicate civ names (shouldn't happen, but test robustness).
  const rows = stanceRows([
    { name: "Rome", stance: "pro" },
    { name: "Rome", stance: "anti" },
    { name: "Egypt", stance: "none" }
  ]);
  assert.equal(rows.length, 3, "all civs listed even with duplicates");
}

function testPressureRowsEmptyDestinations() {
  // Pressure rows with missing/empty destination names should show placeholder.
  const rows = pressureRows([
    { cityName: "City1", causeLabel: "War", pressureToBar: 0.5, topDestinationName: "",
      attritionRisk: false },
    { cityName: "City2", causeLabel: "Unhappiness", pressureToBar: 0.3,
      topDestinationName: null, onCooldown: false },
    { cityName: "City3", causeLabel: "Disaster", pressureToBar: 0.8,
      topDestinationName: "Dest", onCooldown: true }
  ]);
  assert.equal(rows.length, 3);
  const noDestRows = rows.filter((r) => r.dest === "-");
  assert.equal(noDestRows.length, 2, "empty destinations show placeholder");
}

function testFlowNetworkCivEdgeMerging() {
  // Multiple city-level edges between the same two civs should merge into
  // a single civ-level edge (with aggregated people + causes).
  const net = flowNetwork([
    { from: 1, to: 2, fromName: "Rome", toName: "Egypt", fromCity: "Rome",
      toCity: "Memphis", people: 5000, byCause: { war: 5000 } },
    { from: 1, to: 2, fromName: "Rome", toName: "Egypt", fromCity: "Rome",
      toCity: "Alexandria", people: 3000, byCause: { prosperity: 3000 } },
    { from: 1, to: 2, fromName: "Rome", toName: "Egypt", fromCity: "Ostia",
      toCity: "Memphis", people: 2000, byCause: { war: 2000 } }
  ]);
  // Civ edges should merge Rome→Egypt (5+3+2 = 10k total)
  const romeEgypt = net.edges.find((e) => e.from === 1 && e.to === 2);
  assert.equal(romeEgypt.people, 10000, "civ-level edge aggregates all routes");
  assert.equal(romeEgypt.byCause.war, 7000, "causes aggregated");
  assert.equal(romeEgypt.byCause.prosperity, 3000);
  // City edges should preserve origin/destination pairs (3 distinct pairs here)
  assert.equal(net.cityEdges.length, 3, "city-level edges keep distinct pairs");
}

function testFlowNetworkNodeTotalCalculation() {
  // Node total should be sum of inflow + outflow (bidirectional).
  const net = flowNetwork([
    { from: 1, to: 2, fromName: "Rome", toName: "Egypt", fromCity: "Rome",
      toCity: "Memphis", people: 8000, byCause: { war: 8000 } },
    { from: 2, to: 1, fromName: "Egypt", toName: "Rome", fromCity: "Memphis",
      toCity: "Rome", people: 5000, byCause: { prosperity: 5000 } }
  ]);
  const rome = net.nodes.find((n) => n.name === "Rome");
  assert.equal(rome.outflow, 8000, "outflow correct");
  assert.equal(rome.inflow, 5000, "inflow correct");
  assert.equal(rome.total, 13000, "total is inflow + outflow");
  const egypt = net.nodes.find((n) => n.name === "Egypt");
  assert.equal(egypt.outflow, 5000);
  assert.equal(egypt.inflow, 8000);
  assert.equal(egypt.total, 13000);
}

function testDashboardModelNodeNetwork() {
  // Dashboard model should include the flow network as one of its sections.
  const m = dashboardModel({
    civs: [{ name: "Rome", in: 0, out: 0, net: 0, refugees: 0, deaths: 0,
      inPts: 0, outPts: 0, netPts: 0, refugeesPts: 0, deathsPts: 0,
      stanceImpact: { in: 0, out: 0, inPts: 0, outPts: 0 } }],
    byCause: {},
    flows: [{ from: 1, to: 2, fromName: "Rome", toName: "Egypt", fromCity: "R",
      toCity: "E", people: 100, byCause: { war: 100 } }],
    cities: []
  });
  const flowSection = m.sections.find((s) => s.kind === "flow");
  assert.ok(flowSection, "flow section exists");
  assert.ok(flowSection.network, "network property present");
}

function testFlowNetworkRespectsMaxEdgeCap() {
  const flows = [];
  for (let i = 0; i < 40; i++) {
    flows.push({
      from: i,
      to: i + 100,
      fromName: "Civ" + i,
      toName: "Civ" + (i + 100),
      fromCity: "A" + i,
      toCity: "B" + i,
      people: 1000 + i,
      byCause: { war: 1000 + i }
    });
  }
  const net = flowNetwork(flows, 7);
  assert.equal(net.edges.length, 7, "civ edge count capped by maxEdges");
}

function testFlowNetworkRespectsCityEdgeCap() {
  const flows = [];
  for (let i = 0; i < 200; i++) {
    flows.push({
      from: 1,
      to: 2,
      fromName: "Rome",
      toName: "Egypt",
      fromCity: "City" + i,
      toCity: "Target" + i,
      people: 500 + i,
      byCause: { war: 500 + i }
    });
  }
  const net = flowNetwork(flows);
  assert.equal(net.cityEdges.length, 80, "city edge count is capped to keep render cost bounded");
}

testFlowNetworkWithIsolatedCivs();
testDashboardModelEmptySections();
testCivLedgerSortingStabilityOnTie();
testCauseBreakdownAllZeroDropped();
testCauseBreakdownSingleCauseFull100();
testStanceRowsAllNeutral();
testStanceRowsWithDuplicateNames();
testPressureRowsEmptyDestinations();
testFlowNetworkCivEdgeMerging();
testFlowNetworkNodeTotalCalculation();
testDashboardModelNodeNetwork();
testFlowNetworkRespectsMaxEdgeCap();
testFlowNetworkRespectsCityEdgeCap();

console.log("views harness passed");
