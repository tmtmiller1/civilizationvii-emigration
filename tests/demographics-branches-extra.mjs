import assert from "node:assert/strict";

const D = await import("/emigration/ui/emigration-demographics.js");

// Queue path when host API is not ready.
delete globalThis.DemographicsMetricsAPI;
assert.equal(D.registerMigrationMetric(), false);
assert.ok(Array.isArray(globalThis.DemographicsMetricsAPI.pending));
assert.equal(globalThis.DemographicsMetricsAPI.pending.length, 1);

// Run queued callback against a ready hub-aware API and inspect registered specs.
const specs = [];
const groups = [];
const api = {
  registerMetric: (s) => specs.push(s),
  registerMetricGroup: (g) => groups.push(g),
  registerHubPages: () => {},
  HUB_IDS: ["migration"]
};

globalThis.DemographicsMetricsAPI.pending[0](api);
assert.ok(specs.length >= 1, "should register metrics when hook is drained");
assert.equal(groups.length, 1, "should register exactly one graphs group");
assert.equal(groups[0].pageId, "emig_net_migration", "hub mode should target migration hub page");

// doRegister early return path via already-registered flag.
const before = specs.length;
globalThis.DemographicsMetricsAPI.pending[0](api);
assert.equal(specs.length, before, "already-registered flag should skip duplicate registration");

// Exercise cumFor fallback branches through registered accessors.
const netPeople = specs.find((s) => s.id === "emig_net_cum");
const netPts = specs.find((s) => s.id === "emig_net_cum_pts");
assert.ok(netPeople && netPts);

delete globalThis.EmigrationData;
assert.equal(netPeople.accessor({ id: 3 }), 0, "missing EmigrationData should return 0");

globalThis.EmigrationData = {
  netCumFor: () => 0,
  netPtsFor: () => 17
};
assert.equal(netPeople.accessor({ id: 3 }), 0, "zero-returning fn should still coerce to 0");
assert.equal(netPts.accessor({ id: 3 }), 17);

// HubMode false branch: hook exists but HUB_IDS not usable.
delete globalThis.DemographicsMetricsAPI;
const legacyGroups = [];
const legacyApi = {
  registerMetric: () => {},
  registerMetricGroup: (g) => legacyGroups.push(g),
  registerHubPages: () => {},
  HUB_IDS: null
};
globalThis.DemographicsMetricsAPI = legacyApi;
assert.equal(D.registerMigrationMetric(), true);
assert.equal(legacyGroups[0].pageId, "emig_migration_panel");

// registerMetricGroup unavailable branch.
delete globalThis.DemographicsMetricsAPI;
globalThis.DemographicsMetricsAPI = {
  registerMetric: () => {}
};
assert.equal(D.registerMigrationMetric(), true);

// Catch path: global accessor throws while resolving API.
const prior = Object.getOwnPropertyDescriptor(globalThis, "DemographicsMetricsAPI");
Object.defineProperty(globalThis, "DemographicsMetricsAPI", {
  configurable: true,
  get() {
    throw new Error("api blocked");
  },
  set() {
    throw new Error("api blocked");
  }
});
assert.equal(D.registerMigrationMetric(), false);

if (prior) Object.defineProperty(globalThis, "DemographicsMetricsAPI", prior);
else delete globalThis.DemographicsMetricsAPI;

delete globalThis.EmigrationData;

console.log("demographics-branches-extra harness passed");
