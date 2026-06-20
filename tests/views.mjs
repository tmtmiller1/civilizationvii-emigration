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
  assert.equal(m.sections.length, 6); // network + flowmap merged into one toggleable "flow" section
  assert.deepEqual(
    m.sections.map((s) => s.kind),
    ["flow", "ledger", "pies", "cityflows", "stances", "guide"]
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

console.log("views harness passed");
