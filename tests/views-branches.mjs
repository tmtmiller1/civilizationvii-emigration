import assert from "node:assert/strict";

const {
  civLedgerRows,
  causeBreakdownRows,
  stanceRows,
  pressureRows,
  flowNetwork,
  nativeTotal
} = await import("/emigration/ui/emigration-views.js");

function testCivLedgerRowsSortsAndFormats() {
  const civs = [
    { name: "Rome", net: 1000, in: 2000, out: 1000, refugees: 500, deaths: 0, byCause: { war: 500 }, inByCause: { war: 200 } },
    { name: "Egypt", net: 500, in: 1000, out: 500, refugees: 0, deaths: 100, byCause: {}, inByCause: {} },
    { name: "Persia", net: 3000, in: 5000, out: 2000, refugees: 1500, deaths: 50, byCause: { disaster: 1500 }, inByCause: {} }
  ];

  const rows = civLedgerRows(civs);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, "Persia", "largest net should come first");
  assert.equal(rows[1].name, "Rome");
  assert.equal(rows[2].name, "Egypt");

  assert.equal(rows[0].netP, 3000);
  assert.ok(rows[0].drivers);
}

function testCauseBreakdownRowsWithZeroAndEmpty() {
  const rows1 = causeBreakdownRows({ war: 5000, disaster: 3000, prosperity: 2000 });
  assert.equal(rows1.length, 3);
  assert.equal(rows1[0].label, "War", "war should be largest (5000)");
  assert.ok(rows1[0].pct >= 50);

  const rows2 = causeBreakdownRows({ war: 0, disaster: 0 });
  assert.equal(rows2.length, 0, "zero values should be filtered");

  const rows3 = causeBreakdownRows(null);
  assert.equal(rows3.length, 0);
}

function testStanceRowsOrderingAndLabeling() {
  const civs = [
    { name: "Rome", stance: "none" },
    { name: "Egypt", stance: "pro" },
    { name: "Persia", stance: "anti" }
  ];

  const rows = stanceRows(civs);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].stance, "Pro-Immigration", "pro should come first");
  assert.equal(rows[1].stance, "Anti-Immigration", "anti should come second");
  assert.equal(rows[2].stance, "Neutral", "none should come last");

  const noStance = stanceRows([{ name: "Barbarians" }]);
  assert.equal(noStance[0].stance, "Neutral");
}

function testPressureRowsSortingAndFormatting() {
  const snapshots = [
    { cityName: "Rome", causeLabel: "War", pressureToBar: 0.3, topDestinationName: "Carthage", onCooldown: false, attritionRisk: false },
    { cityName: "Athens", causeLabel: "Unhappiness", pressureToBar: 0.8, topDestinationName: "Sparta", onCooldown: false, attritionRisk: false },
    { cityName: "Alexandria", causeLabel: "Disaster", pressureToBar: 0.1, topDestinationName: null, onCooldown: false, attritionRisk: true }
  ];

  const rows = pressureRows(snapshots);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].city, "Athens", "highest pressure first (0.8)");
  assert.equal(rows[0].pressure, "80%");
  assert.equal(rows[2].flag, "at risk");
}

function testFlowNetworkAggregationAndCapping() {
  const flows = [
    { from: 1, to: 2, fromName: "Rome", toName: "Egypt", fromCity: "Rome", toCity: "Alexandria", people: 1000, points: 1, byCause: { war: 1000 } },
    { from: 1, to: 2, fromName: "Rome", toName: "Egypt", people: 500, points: 1, byCause: { disaster: 500 } },
    { from: 2, to: 3, fromName: "Egypt", toName: "Persia", people: 2000, points: 2, byCause: { prosperity: 2000 } },
    { from: 1, to: 3, fromName: "Rome", toName: "Persia", people: 300, points: 1, byCause: { unhappiness: 300 } }
  ];

  const net = flowNetwork(flows, 2);
  assert.ok(net.nodes.length >= 3);
  assert.equal(net.edges.length, 2, "should cap at maxEdges (2)");
  // Top 2 edges by people: Rome→Egypt (1500) and Egypt→Persia (2000)
  const top1 = net.edges[0];
  const top2 = net.edges[1];
  assert.ok((top1.people === 1500 && top2.people === 2000) || (top1.people === 2000 && top2.people === 1500), 
    `top 2 edges should be 1500 + 2000, got ${top1.people}, ${top2.people}`);
  assert.ok(net.cityEdges.length > 0, "should include city-level edges");

  const node1 = net.nodes.find((n) => n.id === 1);
  assert.ok(node1);
  assert.ok(node1.outflow >= 1800);
  assert.ok(node1.inflow === 0);
}

function testNativeTotal() {
  assert.equal(nativeTotal({ cities: [{ pop: 100 }, { pop: 200 }] }), 300);
  assert.equal(nativeTotal(1000), 1000);
  assert.equal(nativeTotal(null), 0);
}

testCivLedgerRowsSortsAndFormats();
testCauseBreakdownRowsWithZeroAndEmpty();
testStanceRowsOrderingAndLabeling();
testPressureRowsSortingAndFormatting();
testFlowNetworkAggregationAndCapping();
testNativeTotal();

console.log("views-branches harness passed");
