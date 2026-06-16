import assert from "node:assert/strict";

// The Demographics page handshake (mirrors the metric-registration tests): registers via the
// registerPanel hook when present, queues otherwise, and is a silent no-op on an older
// Demographics that drains the queue but lacks the hook.
const { registerMigrationPage } = await import("/emigration/ui/emigration-migration-page.js");

function testRegistersWhenPanelHookPresent() {
  const panels = [];
  globalThis.DemographicsMetricsAPI = { registerPanel: (/** @type {*} */ s) => panels.push(s) };
  assert.equal(registerMigrationPage(), true);
  assert.equal(panels.length, 1);
  assert.equal(panels[0].id, "emig_migration_panel");
  assert.equal(panels[0].pageLabel, "Migration");
  assert.equal(typeof panels[0].render, "function"); // Emigration owns the render callback
}

function testQueuesWhenApiNotReadyThenDrains() {
  delete globalThis.DemographicsMetricsAPI;
  assert.equal(registerMigrationPage(), false); // API absent → queued
  const api = globalThis.DemographicsMetricsAPI;
  assert.equal(api.pending.length, 1);
  // Demographics loads later WITH the hook and drains the queue.
  const panels = [];
  api.registerPanel = (/** @type {*} */ s) => panels.push(s);
  for (const job of api.pending.splice(0)) job(api);
  assert.equal(panels.length, 1); // registered on drain (order-independent)
}

function testNoOpOnOlderDemographicsWithoutHook() {
  delete globalThis.DemographicsMetricsAPI;
  registerMigrationPage(); // queues
  const api = globalThis.DemographicsMetricsAPI;
  // Older Demographics: drains pending but has no registerPanel → registration must no-op.
  let anyRegistered = false;
  for (const job of api.pending.splice(0)) anyRegistered = job(api) || anyRegistered;
  assert.equal(anyRegistered, false);
}

testRegistersWhenPanelHookPresent();
testQueuesWhenApiNotReadyThenDrains();
testNoOpOnOlderDemographicsWithoutHook();

console.log("migration-page harness passed");
