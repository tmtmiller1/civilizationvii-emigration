import assert from "node:assert/strict";

const STATE_KEY = "EmigrationMigStats_v1";
const kv = {
  [STATE_KEY]: JSON.stringify({
    outByCause: { "7": { war: 3, disaster: 2, prosperity: 1, unhappiness: 4 } },
    inByCause: { "7": { war: 5, disaster: 6, prosperity: 7 } },
    wmOutByCause: {},
    wmInByCause: {}
  })
};

globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in kv ? kv[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (kv[k] = v) })
};

globalThis.Game = { turn: 1 };

const { registerPerCauseMetrics, queuePerCauseMetrics } = await import(
  "/emigration/ui/emigration-demographics-per-cause-metrics.js"
);

// No API available should be a no-op.
delete globalThis.DemographicsMetricsAPI;
registerPerCauseMetrics();

const registered = [];
const pages = [];
const api = {
  registerMetric: (spec) => registered.push(spec),
  registerMetricToPage: (page, metric, anchor) => pages.push({ page, metric, anchor })
};

registerPerCauseMetrics(api);
assert.equal(registered.length, 7);
assert.equal(pages.length, 7);

const warOut = registered.find((m) => m.id === "emig_war_emigration");
const warIn = registered.find((m) => m.id === "emig_war_immigration");
assert.ok(warOut);
assert.ok(warIn);
assert.equal(warOut.accessor({ id: 7 }), 3);
assert.equal(warIn.accessor({ id: 7 }), 5);
assert.equal(warIn.accessor({ id: 999 }), 0);
assert.equal(warOut.accessor({ id: 999 }), 0);
assert.equal(warOut.format(NaN), "0");
assert.equal(warOut.format(0), "0");
assert.notEqual(warOut.format(12), "0");

// queuePerCauseMetrics: immediate register path.
globalThis.DemographicsMetricsAPI = {
  registerMetric: () => {},
  registerMetricToPage: () => {}
};
queuePerCauseMetrics();

// queuePerCauseMetrics: pending queue path.
globalThis.DemographicsMetricsAPI = {};
queuePerCauseMetrics();
assert.equal(Array.isArray(globalThis.DemographicsMetricsAPI.pending), true);
assert.equal(globalThis.DemographicsMetricsAPI.pending.length, 1);

// registerPerCauseMetrics catch path.
registerPerCauseMetrics({ registerMetric: () => { throw new Error("boom"); } });

// queuePerCauseMetrics catch path (throwing global getter).
const orig = Object.getOwnPropertyDescriptor(globalThis, "DemographicsMetricsAPI");
Object.defineProperty(globalThis, "DemographicsMetricsAPI", {
  configurable: true,
  get() {
    throw new Error("getter boom");
  }
});
queuePerCauseMetrics();

if (orig) {
  Object.defineProperty(globalThis, "DemographicsMetricsAPI", orig);
} else {
  delete globalThis.DemographicsMetricsAPI;
}

delete globalThis.Configuration;
delete globalThis.Game;

console.log("per-cause-metrics harness passed");
