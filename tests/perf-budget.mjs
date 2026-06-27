import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const { flowNetwork } = await import("/emigration/ui/emigration-views.js");
const { registerMigrationPage } = await import("/emigration/ui/emigration-migration-page.js");
const { registerMigrationMetric } = await import("/emigration/ui/emigration-demographics.js");
const { recordCompositionPass } = await import("/emigration/ui/emigration-composition.js");
const { recordChroniclePass } = await import("/emigration/ui/emigration-diaspora.js");
const { planReturns } = await import("/emigration/ui/emigration-return.js");

function buildFlows(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      from: i % 128,
      to: (i + 17) % 128,
      fromName: "Civ" + (i % 128),
      toName: "Civ" + ((i + 17) % 128),
      fromCity: "S" + i,
      toCity: "D" + i,
      people: 500 + (i % 1000),
      byCause: { war: 500 + (i % 1000) }
    });
  }
  return out;
}

function testFlowNetworkBudget() {
  const flows = buildFlows(20000);
  const t0 = performance.now();
  const net = flowNetwork(flows, 16);
  const elapsed = performance.now() - t0;

  assert.equal(net.edges.length <= 16, true, "civ edges stay capped");
  assert.equal(net.cityEdges.length <= 80, true, "city edges stay capped");
  assert.equal(elapsed < 1500, true, `flowNetwork exceeded perf budget: ${elapsed.toFixed(2)}ms`);
}

function testRegistrationLoopBudget() {
  const panels = [];
  const hubs = [];
  globalThis.DemographicsMetricsAPI = {
    HUB_IDS: ["migration"],
    registerPanel: (s) => panels.push(s),
    registerHubPages: (id, pages, opts) => hubs.push({ id, pages, opts })
  };

  const t0 = performance.now();
  for (let i = 0; i < 5000; i++) registerMigrationPage();
  const elapsed = performance.now() - t0;

  assert.equal(panels.length, 1, "panel registration remains idempotent under load");
  assert.equal(hubs.length, 1, "hub registration remains idempotent under load");
  assert.equal(elapsed < 500, true, `migration-page registration loop too slow: ${elapsed.toFixed(2)}ms`);
}

function testMetricRegistrationLoopBudget() {
  const ids = [];
  const groups = [];
  globalThis.DemographicsMetricsAPI = {
    registerMetric: (s) => ids.push(s.id),
    registerMetricGroup: (g) => groups.push(g)
  };

  const t0 = performance.now();
  for (let i = 0; i < 5000; i++) registerMigrationMetric();
  const elapsed = performance.now() - t0;

  assert.equal(ids.length > 0, true);
  assert.equal(groups.length, 1, "metric group registration remains idempotent under load");
  assert.equal(elapsed < 500, true, `metric registration loop too slow: ${elapsed.toFixed(2)}ms`);
}

/**
 * Build a synthetic city-signal set (the shape collectCitySignals returns) for a large late-game
 * empire: distinct settlements, a handful of owners, some rural population.
 * @param {number} n Settlement count. @returns {*[]} City signals.
 */
function buildSignals(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      city: { location: { x: i % 40, y: Math.floor(i / 40) }, name: "City" + i },
      owner: i % 8,
      population: 5 + (i % 20),
      rural: 3 + (i % 5),
      happiness: (i % 3) - 1,
      starving: false,
      isCityState: false
    });
  }
  return out;
}

// The per-turn scans this session added (composition + chronicle + return) must stay cheap on a big
// map. This walks a 60-city world many times and budgets the combined per-pass cost. With no foreign
// origins or migrations they short-circuit to the scan cost itself, which is what we're guarding.
function testPerPassScanBudget() {
  const signals = buildSignals(60);
  const migs = [];
  recordCompositionPass(signals, migs); // warm the composition state once
  const PASSES = 300;
  const t0 = performance.now();
  for (let p = 0; p < PASSES; p++) {
    recordCompositionPass(signals, migs);
    recordChroniclePass(signals, migs);
    planReturns(signals);
  }
  const perPass = (performance.now() - t0) / PASSES;
  assert.equal(perPass < 5, true, `per-pass scans (composition+chronicle+return) too slow: ${perPass.toFixed(3)}ms/pass`);
}

testFlowNetworkBudget();
testRegistrationLoopBudget();
testMetricRegistrationLoopBudget();
testPerPassScanBudget();

console.log("perf-budget harness passed");
