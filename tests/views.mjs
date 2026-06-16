import assert from "node:assert/strict";

// The view-model builders are pure (formatPeople + causeLabel are pure); no engine globals.
const { civLedgerRows, causeBreakdownRows, stanceRows, pressureRows, dashboardModel } = await import(
  "/emigration/ui/emigration-views.js"
);

function testCivLedgerFormatsPeopleAndNet() {
  const rows = civLedgerRows([{ name: "Rome", in: 5000, out: 12000, net: -7000, refugees: 3000, deaths: 0 }]);
  assert.equal(rows[0].name, "Rome");
  assert.equal(rows[0].in, "5 thousand");
  assert.equal(rows[0].out, "12 thousand");
  assert.equal(rows[0].net, "-7 thousand"); // signed
  assert.equal(rows[0].deaths, "0");
}

function testCauseBreakdownSortsAndComputesShare() {
  const rows = causeBreakdownRows({ war: 1000, unhappiness: 3000, disaster: 0 });
  assert.equal(rows.length, 2); // zero causes dropped
  assert.equal(rows[0].label, "Unhappiness"); // largest first
  assert.equal(rows[0].pct, 75); // 3000 / 4000
  assert.equal(rows[1].label, "War");
  assert.equal(rows[1].pct, 25);
}

function testStanceRowsOnlyListsHolders() {
  const rows = stanceRows([
    { name: "Rome", stance: "pro" },
    { name: "Carthage", stance: "anti" },
    { name: "Greece", stance: "none" }
  ]);
  assert.equal(rows.length, 2); // "none" filtered out
  assert.deepEqual(rows.map((r) => r.stance).sort(), ["Anti-Immigration", "Pro-Immigration"]);
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

function testDashboardModelHasFourSections() {
  const m = dashboardModel({ civs: [], byCause: {}, cities: [] });
  assert.equal(m.sections.length, 4);
  assert.deepEqual(m.sections.map((s) => s.kind), ["ledger", "bars", "stances", "pressure"]);
}

testCivLedgerFormatsPeopleAndNet();
testCauseBreakdownSortsAndComputesShare();
testStanceRowsOnlyListsHolders();
testPressureRowsSortDescAndFlag();
testDashboardModelHasFourSections();

console.log("views harness passed");
