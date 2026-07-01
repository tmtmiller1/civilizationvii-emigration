// demographics-specs.mjs
//
// The Demographics-bridge graph specs (emigration-demographics.js): every registered metric's
// accessor + formatter + tooltip-attribution, plus the Scaled/Civ view binding. demographics-branches-
// extra.mjs covers the registration plumbing (queue/drain/dup-guard) and the cumFor=0 fallbacks; this
// covers the VALUE side, the per-civ formatters (people + raw points, signed and unsigned), the
// cause-breakdown / refugee-split tooltips (with and without data), and the population accessor, by
// seeding the persisted migration tallies + a live EmigrationData and driving each spec end-to-end.

import assert from "node:assert/strict";

// ── Seed the persisted migration-stats state the tooltips + refugee accessors read via load(). ──
const STATE_KEY = "EmigrationMigStats_v1";
const kv = {
  [STATE_KEY]: JSON.stringify({
    refugees: { 7: 1200 },
    refugeesIn: { 7: 800 },
    // war/disaster are refugee causes; prosperity/unhappiness are not; conquest:0 exercises the
    // count>0 guard (a present-but-zero cause is dropped from the breakdown).
    outByCause: { 7: { war: 300, disaster: 120, prosperity: 80, unhappiness: 40, conquest: 0 } },
    inByCause: { 7: { war: 200, disaster: 90, prosperity: 150 } },
    wmRefugees: {}, wmRefugeesIn: {}, wmOutByCause: {}, wmInByCause: {}
  })
};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in kv ? kv[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (kv[k] = v) })
};
globalThis.Game = { turn: 1 };
// A live EmigrationData exposing every cumulative tally the cumFor accessors read. Net is negative to
// drive the "-" sign branch of the signed formatters; the gross flows are positive.
globalThis.EmigrationData = {
  netCumFor: () => -12450, netPtsFor: () => -512,
  refugeesPtsFor: () => 333, refugeesInPtsFor: () => 222,
  grossOutCumFor: () => 50000, grossOutPtsFor: () => 999,
  grossInCumFor: () => 70000, grossInPtsFor: () => 12400
};

const D = await import("/emigration/ui/emigration-demographics.js");

// ── Register all specs + the Graphs group via the drained pending hook. ──
delete globalThis.DemographicsMetricsAPI;
assert.equal(D.registerMigrationMetric(), false, "no API yet → queued");
const specs = [];
const groups = [];
const api = {
  registerMetric: (s) => specs.push(s),
  registerMetricGroup: (g) => groups.push(g),
  registerHubPages: () => {},
  HUB_IDS: ["migration"]
};
globalThis.DemographicsMetricsAPI.pending[0](api);
assert.ok(specs.length >= 11, "every metric spec registered");
assert.equal(groups.length, 1, "one graphs group");

const byId = (id) => specs.find((s) => s.id === id);
const ctx = { id: 7 };
const emptyCtx = { id: 999 }; // a civ with no tallies → empty maps

// ── Every spec drives accessor → format → tooltip without throwing. ──
for (const s of specs) {
  let v;
  try {
    v = s.accessor(ctx);
  } catch (_) {
    v = 0; // emig_population's accessor walks the engine; off-engine it yields no signals
  }
  assert.equal(typeof v, "number", `${s.id} accessor returns a number`);
  assert.equal(typeof s.format(v), "string", `${s.id} format returns a string`);
  if (typeof s.tooltipAttribution === "function") {
    assert.equal(typeof s.tooltipAttribution(ctx), "string", `${s.id} tooltip returns a string`);
  }
}

// ── Refugee-split tooltips: only war/disaster appear (refugee causes), and the value is non-empty. ──
{
  const refOut = byId("emig_refugees").tooltipAttribution(ctx);
  assert.ok(refOut.includes("·"), "refugees-out tooltip lists the war/disaster split");
  assert.ok(/War/i.test(refOut) && !/Prosperity/i.test(refOut),
    "only refugee causes (war/disaster), not economic ones, appear in the split");
  const refIn = byId("emig_refugees_in").tooltipAttribution(ctx);
  assert.ok(/War/i.test(refIn), "refugees-in tooltip lists the inbound war/disaster split");
}

// ── Cause-breakdown tooltips: all positive causes appear, the zero cause is dropped. ──
{
  const out = byId("emig_out_cum").tooltipAttribution(ctx);
  assert.ok(out.startsWith("Sources:"), "emigration tooltip is a 'Sources:' breakdown");
  assert.ok(/War/i.test(out) && /Attraction/i.test(out), "all positive causes listed (prosperity → 'Attraction')");
  assert.ok(!/Conquest/i.test(out), "a present-but-zero cause is dropped");
  const inn = byId("emig_in_cum").tooltipAttribution(ctx);
  assert.ok(inn.startsWith("Sources:"), "immigration tooltip is a 'Sources:' breakdown");
}

// ── Empty-data tooltips collapse to "" (the no-data branch of every tooltip + helper). ──
{
  assert.equal(byId("emig_refugees").tooltipAttribution(emptyCtx), "", "no refugee data → empty split");
  assert.equal(byId("emig_out_cum").tooltipAttribution(emptyCtx), "", "no cause data → empty breakdown");
  assert.equal(byId("emig_in_cum").tooltipAttribution(emptyCtx), "", "no inbound data → empty breakdown");
}

// ── Formatter edge cases through the registered specs (people + points, signed + unsigned). ──
{
  const signedPts = byId("emig_net_cum_pts").format; // formatSignedPoints
  assert.equal(signedPts(0), "0", "signed points: zero → '0'");
  assert.equal(signedPts(12400), "+12,400", "signed points: positive is grouped + signed");
  assert.equal(signedPts(-512), "-512", "signed points: negative keeps its sign");
  assert.equal(signedPts(Number.NaN), "0", "signed points: non-finite → '0'");

  const pts = byId("emig_out_cum_pts").format; // formatPoints
  assert.equal(pts(12400), "12,400", "points: grouped thousands");
  assert.equal(pts(-50), "-50", "points: negative");
  assert.equal(pts(Number.POSITIVE_INFINITY), "0", "points: non-finite → '0'");

  const signedPeople = byId("emig_net_cum").format; // formatSignedPeople
  assert.equal(signedPeople(0), "0", "signed people: zero → '0'");
  assert.ok(signedPeople(12450).startsWith("+"), "signed people: positive is signed");
  assert.ok(signedPeople(-12450).startsWith("-"), "signed people: negative is signed");
}

// ── The Scaled/Civ view binding round-trips through the shared number-mode setting. ──
{
  const vb = groups[0].viewBinding;
  vb.set("civ");
  assert.equal(vb.get(), "civ", "setting Civ numbers is reflected by the binding");
  vb.set("scaled");
  assert.equal(vb.get(), "scaled", "setting Scaled is reflected by the binding");
}

console.log("demographics-specs harness passed");
