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
  assert.equal(panels[0].pageLabel, "Emigration"); // labels its own top-level Demographics tab
  assert.equal(panels[0].topLevel, true); // shown as a top-level view tab, not a Historical-Data page
  assert.equal(typeof panels[0].render, "function"); // Emigration owns the render callback
}

function testRenderIgnoresInvalidContainer() {
  const panels = [];
  globalThis.DemographicsMetricsAPI = { registerPanel: (/** @type {*} */ s) => panels.push(s) };
  assert.equal(registerMigrationPage(), true);
  assert.equal(panels.length, 1);
  assert.doesNotThrow(() => panels[0].render(null, {}, "flow"));
  assert.doesNotThrow(() => panels[0].render({}, {}, "flow"));
}

function testRegisterIsIdempotentWhenApiReady() {
  const panels = [];
  globalThis.DemographicsMetricsAPI = { registerPanel: (/** @type {*} */ s) => panels.push(s) };
  assert.equal(registerMigrationPage(), true);
  assert.equal(registerMigrationPage(), true);
  assert.equal(panels.length, 1, "registerPanel should run once");
}

function testHubModeRegistersPanelAndHubPagesOnce() {
  const panels = [];
  const hubs = [];
  globalThis.DemographicsMetricsAPI = {
    HUB_IDS: ["migration"],
    registerPanel: (/** @type {*} */ s) => panels.push(s),
    registerHubPages: (/** @type {*} */ hubId, /** @type {*} */ pages, /** @type {*} */ opts) =>
      hubs.push({ hubId, pages, opts })
  };
  assert.equal(registerMigrationPage(), true);
  assert.equal(registerMigrationPage(), true);
  assert.equal(panels.length, 1, "hub mode panel registration should be idempotent");
  assert.equal(hubs.length, 1, "hub pages registration should be idempotent");
  assert.equal(hubs[0].hubId, "migration");
  assert.equal(Array.isArray(hubs[0].pages), true);
  assert.equal(hubs[0].opts.after, "population");
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
  registerMigrationPage(); // should not duplicate pending callbacks
  const api = globalThis.DemographicsMetricsAPI;
  assert.equal(api.pending.length, 1, "pending registration should be queued once");
  // Older Demographics: drains pending but has no registerPanel → registration must no-op.
  let anyRegistered = false;
  for (const job of api.pending.splice(0)) anyRegistered = job(api) || anyRegistered;
  assert.equal(anyRegistered, false);
}

function testDeferredQueueDedupeBeforeDrain() {
  delete globalThis.DemographicsMetricsAPI;
  assert.equal(registerMigrationPage(), false);
  assert.equal(registerMigrationPage(), false);
  const api = globalThis.DemographicsMetricsAPI;
  assert.equal(api.pending.length, 1, "pending queue remains bounded under repeated calls");
}

testRegistersWhenPanelHookPresent();
testRenderIgnoresInvalidContainer();
testRegisterIsIdempotentWhenApiReady();
testHubModeRegistersPanelAndHubPagesOnce();
testQueuesWhenApiNotReadyThenDrains();
testNoOpOnOlderDemographicsWithoutHook();
testDeferredQueueDedupeBeforeDrain();

console.log("migration-page harness passed");
