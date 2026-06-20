// emigration-demographics.js
//
// Cross-mod bridge to the Demographics mod: contributes the migration line-charts when Demographics
// is installed, and does nothing when it isn't. Demographics exposes a companion-mod hook
// (globalThis.DemographicsMetricsAPI: registerMetric + registerMetricToPage). On boot we detect it;
// if present we register per-civ metrics that flow through Demographics' normal sample → store →
// line-chart pipeline. If the hook is absent, registration is a silent, order-independent no-op
// (the job is queued on the shared hook for Demographics to drain when it initializes).
//
// The metric data itself (the per-civ tallies + samplers) lives in emigration-migration-stats.js;
// this module is purely the graph wiring. Two cumulative per-civ line graphs on Emigration's Migration
// page, each registered in two units so the "Graphs" group's units toggle just swaps the charted spec:
//   • Net migration - running immigration − emigration (positive = net inflow).
//   • Refugees - running war/disaster/conquest-driven displacement.
// Gross in/out, the emigration cause breakdown, and the war/disaster/conquest refugee split are folded
// into each line's tooltip instead of being their own graphs.

import { formatPeople } from "/emigration/ui/emigration-population.js";
import { causeLabel, isRefugeeCause } from "/emigration/ui/emigration-causes.js";
import {
  refugeesFor,
  refugeesInFor,
  emigrationByCause,
  immigrationByCause
} from "/emigration/ui/emigration-migration-stats.js";

/**
 * Read a cumulative-tally function off the live EmigrationData global (those tallies are exposed as
 * methods there, not module exports). Returns 0 when absent.
 * @param {string} fn Method name (e.g. "netCumFor").
 * @param {number} [id] Player id.
 * @returns {number} The cumulative value, or 0.
 */
function cumFor(fn, id) {
  const D = /** @type {*} */ (globalThis).EmigrationData || {};
  return typeof D[fn] === "function" ? D[fn](id) || 0 : 0;
}

/**
 * Format a net people count with a sign, e.g. "+12 thousand" / "-5 thousand".
 * @param {number} n Net people.
 * @returns {string} Display string.
 */
function formatSignedPeople(n) {
  if (typeof n !== "number" || !isFinite(n) || n === 0) return "0";
  return (n > 0 ? "+" : "-") + formatPeople(Math.abs(n));
}

/**
 * Insert thousands separators into a non-negative integer (e.g. 12400 → "12,400").
 * @param {number} v A non-negative integer.
 * @returns {string} Grouped string.
 */
function groupInt(v) {
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format a raw population-point count as an exact grouped integer (e.g. "12,400"). These are the Civ's
 * own numbers (1 point per migration), shown as-is rather than scaled into historical "people".
 * @param {number} n Points.
 * @returns {string} Display string.
 */
function formatPoints(n) {
  if (typeof n !== "number" || !isFinite(n)) return "0";
  const r = Math.round(n);
  return r < 0 ? "-" + groupInt(-r) : groupInt(r);
}

/**
 * Format a signed point count (e.g. "+12,400" / "-512").
 * @param {number} n Points.
 * @returns {string} Display string.
 */
function formatSignedPoints(n) {
  if (typeof n !== "number" || !isFinite(n) || n === 0) return "0";
  return (n > 0 ? "+" : "-") + groupInt(Math.abs(Math.round(n)));
}

/**
 * Build a per-cause attribution string for a tooltip. Shows the source breakdown of emigration
 * or immigration (e.g., "War: 185, Disaster: 89, Attraction: 68").
 * @param {Record<string, number>} byCause Per-cause breakdown map.
 * @returns {string} Formatted breakdown, or empty string if no data.
 */
function formatCauseBreakdown(byCause) {
  if (!byCause || typeof byCause !== "object") return "";
  const parts = [];
  for (const cause in byCause) {
    const count = byCause[cause];
    if (typeof count === "number" && count > 0) {
      parts.push(`${causeLabel(cause)}: ${formatPeople(count)}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "";
}

/**
 * Net-migration tooltip: a civ's cumulative gross inflow / outflow plus the cause breakdown behind its
 * emigration — the "why" the separate gross-flow graphs used to show. Composition is in people
 * regardless of the line's units (it's supplementary context, not the headline value).
 * @param {*} ctx Tooltip context ({id}).
 * @returns {string} The attribution line, or "".
 */
function netTooltip(ctx) {
  const id = ctx?.id;
  const inP = formatPeople(cumFor("grossInCumFor", id));
  const outP = formatPeople(cumFor("grossOutCumFor", id));
  const sources = formatCauseBreakdown(emigrationByCause(id));
  const flow = `In ${inP} · Out ${outP}`;
  return sources ? `${flow} · Sources: ${sources}` : flow;
}

/**
 * The war / disaster / conquest split of a per-cause people map (refugee causes only), formatted as
 * "War: 1 thousand · Disaster: 400", or "" when none.
 * @param {Record<string, number>} byCause Per-cause people totals.
 * @returns {string} The refugee-cause split, or "".
 */
function refugeeCauseSplit(byCause) {
  const parts = [];
  for (const cause in byCause) {
    if (!isRefugeeCause(cause)) continue;
    const n = byCause[cause];
    if (typeof n === "number" && n > 0) parts.push(`${causeLabel(cause)}: ${formatPeople(n)}`);
  }
  return parts.length ? parts.join(" · ") : "";
}

/**
 * Refugees-generated tooltip: the war / disaster / conquest split behind a civ's cumulative refugee
 * OUTFLOW.
 * @param {*} ctx Tooltip context ({id}).
 * @returns {string} The split (e.g. "War: 1 thousand · Disaster: 400"), or "".
 */
function refugeesTooltip(ctx) {
  return refugeeCauseSplit(emigrationByCause(ctx?.id));
}

/**
 * Refugees-received tooltip: the war / disaster / conquest split behind a civ's refugee INFLOW (which
 * crises the people it took in were fleeing).
 * @param {*} ctx Tooltip context ({id}).
 * @returns {string} The split, or "".
 */
function refugeesInTooltip(ctx) {
  return refugeeCauseSplit(immigrationByCause(ctx?.id));
}

/**
 * Emigration tooltip: the cause breakdown behind a civ's people leaving (why they left).
 * @param {*} ctx Tooltip context ({id}).
 * @returns {string} The breakdown, or "".
 */
function outTooltip(ctx) {
  const sources = formatCauseBreakdown(emigrationByCause(ctx?.id));
  return sources ? `Sources: ${sources}` : "";
}

/**
 * Immigration tooltip: the cause breakdown behind a civ's arrivals (why they came).
 * @param {*} ctx Tooltip context ({id}).
 * @returns {string} The breakdown, or "".
 */
function inTooltip(ctx) {
  const sources = formatCauseBreakdown(immigrationByCause(ctx?.id));
  return sources ? `Sources: ${sources}` : "";
}

// ── The migration graphs: Net Migration (am I winning or losing the population game?), gross
// Emigration / Immigration (the per-flow detail), and Refugees (the human cost of war and disaster).
// Each is a cumulative per-civ line, registered twice — once in Demographics' historically-scaled
// "people" and once in raw Civ population points — so the "Graphs" group's units toggle (Scaled / Civ
// numbers) just swaps which spec it charts. Cause breakdowns / splits ride in each line's tooltip.
// Labels are plain strings (Demographics renders metric labels raw, not as LOC keys). ──
const NET_CUM_SPEC = {
  id: "emig_net_cum",
  label: "Net Migration",
  title: "Net migration (cumulative)",
  description: "Running total of net people gained minus lost, to date (positive = net inflow).",
  category: "people",
  accessor: (/** @type {*} */ ctx) => cumFor("netCumFor", ctx?.id),
  format: formatSignedPeople,
  unit: "people",
  tooltipAttribution: netTooltip
};
const NET_CUM_PTS_SPEC = {
  id: "emig_net_cum_pts",
  label: "Net Migration",
  title: "Net migration (Civ numbers)",
  description: "Running total of net population points gained minus lost — the exact Civ figures.",
  category: "people",
  accessor: (/** @type {*} */ ctx) => cumFor("netPtsFor", ctx?.id),
  format: formatSignedPoints,
  unit: "points",
  tooltipAttribution: netTooltip
};
const REF_SPEC = {
  id: "emig_refugees",
  label: "Refugees Out",
  title: "Refugees generated (cumulative)",
  description: "Running total of people displaced FROM this civilization by war, disaster, or conquest.",
  category: "people",
  accessor: (/** @type {*} */ ctx) => refugeesFor(ctx?.id),
  format: formatPeople,
  unit: "people",
  tooltipAttribution: refugeesTooltip
};
const REF_PTS_SPEC = {
  id: "emig_refugees_pts",
  label: "Refugees Out",
  title: "Refugees generated (Civ numbers)",
  description: "Running total of population points displaced from this civ by war, disaster, or conquest.",
  category: "people",
  accessor: (/** @type {*} */ ctx) => cumFor("refugeesPtsFor", ctx?.id),
  format: formatPoints,
  unit: "points",
  tooltipAttribution: refugeesTooltip
};
// Refugee IMMIGRATION — war/disaster/conquest arrivals this civ has RECEIVED (the inflow counterpart
// of Refugees Out), so a civ taking in the displaced shows it distinct from economic immigration.
const REF_IN_SPEC = {
  id: "emig_refugees_in",
  label: "Refugees In",
  title: "Refugees received (cumulative)",
  description: "Running total of people who fled war, disaster, or conquest and resettled HERE.",
  category: "people",
  accessor: (/** @type {*} */ ctx) => refugeesInFor(ctx?.id),
  format: formatPeople,
  unit: "people",
  tooltipAttribution: refugeesInTooltip
};
const REF_IN_PTS_SPEC = {
  id: "emig_refugees_in_pts",
  label: "Refugees In",
  title: "Refugees received (Civ numbers)",
  description: "Running total of population points who fled war, disaster, or conquest and resettled here.",
  category: "people",
  accessor: (/** @type {*} */ ctx) => cumFor("refugeesInPtsFor", ctx?.id),
  format: formatPoints,
  unit: "points",
  tooltipAttribution: refugeesInTooltip
};
// Gross emigration (people leaving) and immigration (people arriving), each in scaled people + raw
// Civ points — the per-flow detail alongside the Net Migration and Refugees headlines.
const OUT_CUM_SPEC = {
  id: "emig_out_cum",
  label: "Emigration",
  title: "Emigration (cumulative)",
  description: "Running total of people who have left this civilization's cities.",
  category: "people",
  accessor: (/** @type {*} */ ctx) => cumFor("grossOutCumFor", ctx?.id),
  format: formatPeople,
  unit: "people",
  tooltipAttribution: outTooltip
};
const OUT_CUM_PTS_SPEC = {
  id: "emig_out_cum_pts",
  label: "Emigration",
  title: "Emigration (Civ numbers)",
  description: "Running total of population points that have left this civilization's cities.",
  category: "people",
  accessor: (/** @type {*} */ ctx) => cumFor("grossOutPtsFor", ctx?.id),
  format: formatPoints,
  unit: "points",
  tooltipAttribution: outTooltip
};
const IN_CUM_SPEC = {
  id: "emig_in_cum",
  label: "Immigration",
  title: "Immigration (cumulative)",
  description: "Running total of people who have arrived into this civilization's cities.",
  category: "people",
  accessor: (/** @type {*} */ ctx) => cumFor("grossInCumFor", ctx?.id),
  format: formatPeople,
  unit: "people",
  tooltipAttribution: inTooltip
};
const IN_CUM_PTS_SPEC = {
  id: "emig_in_cum_pts",
  label: "Immigration",
  title: "Immigration (Civ numbers)",
  description: "Running total of population points that have arrived into this civilization's cities.",
  category: "people",
  accessor: (/** @type {*} */ ctx) => cumFor("grossInPtsFor", ctx?.id),
  format: formatPoints,
  unit: "points",
  tooltipAttribution: inTooltip
};
// All stay registered so the sampler tallies them every turn; the group below decides which one is
// charted for the (metric, units) selection.
const SPECS = [
  NET_CUM_SPEC, NET_CUM_PTS_SPEC,
  OUT_CUM_SPEC, OUT_CUM_PTS_SPEC,
  IN_CUM_SPEC, IN_CUM_PTS_SPEC,
  REF_SPEC, REF_PTS_SPEC,
  REF_IN_SPEC, REF_IN_PTS_SPEC
];

// The "Graphs" section's two-toggle group: pick a metric (Net Migration / Emigration / Immigration /
// Refugees Out / Refugees In) and the units — Scaled (historical "people", consistent w/ Demographics
// chart) or Civ numbers (raw population points, reconciling with the in-game Emigration window). Each
// (member, view) maps to one of the registered specs above.
const GRAPHS_GROUP = {
  id: "emig_graphs",
  label: "Graphs",
  first: true,
  views: [{ id: "scaled", label: "Scaled" }, { id: "civ", label: "Civ numbers" }],
  members: [
    { label: "Net Migration", scaled: NET_CUM_SPEC.id, civ: NET_CUM_PTS_SPEC.id },
    { label: "Emigration", scaled: OUT_CUM_SPEC.id, civ: OUT_CUM_PTS_SPEC.id },
    { label: "Immigration", scaled: IN_CUM_SPEC.id, civ: IN_CUM_PTS_SPEC.id },
    { label: "Refugees Out", scaled: REF_SPEC.id, civ: REF_PTS_SPEC.id },
    { label: "Refugees In", scaled: REF_IN_SPEC.id, civ: REF_IN_PTS_SPEC.id }
  ]
};

/**
 * Register all specs + the Graphs group against a ready Demographics API.
 * @param {*} api The DemographicsMetricsAPI.
 */
function doRegister(api) {
  for (const spec of SPECS) api.registerMetric(spec);
  // Collapse the migration graphs into ONE "Graphs" section (FIRST on Emigration's Migration page)
  // with two toggles: the metric (Net Migration / Refugees) and the units (Scaled / Civ numbers).
  // Each (member, view) maps to one of the registered specs; all stay registered above so they're
  // still sampled. No-op on an older Demographics that lacks the group hook.
  const MIG_PAGE = "emig_migration_panel"; // must match emigration-migration-page.js PANEL_SPEC.id
  if (typeof api.registerMetricGroup === "function") {
    api.registerMetricGroup(Object.assign({ pageId: MIG_PAGE }, GRAPHS_GROUP));
  }
}

/**
 * Contribute the migration graphs to Demographics. Order-independent: registers now if its API is
 * up, else queues the job on the shared hook for Demographics to drain when its (lazily-loaded)
 * metrics module initializes. No-op if Demographics is absent.
 * @returns {boolean} True if registered immediately; false if queued/absent.
 */
export function registerMigrationMetric() {
  try {
    const api = (/** @type {*} */ (globalThis).DemographicsMetricsAPI ??= {});
    if (typeof api.registerMetric === "function") {
      doRegister(api);
      return true;
    }
    (api.pending ??= []).push(doRegister);
    return false;
  } catch (_) {
    return false;
  }
}
