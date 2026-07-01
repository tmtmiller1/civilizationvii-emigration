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

import { formatPeople, scaleCityPopulation } from "/emigration/ui/emigration-population.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { causeLabel, isRefugeeCause } from "/emigration/ui/emigration-causes.js";
import { getNumberMode, setNumberMode, NumberMode } from "/emigration/ui/emigration-settings.js";
import {
  refugeesFor,
  refugeesInFor,
  emigrationByCause,
  immigrationByCause,
  monoTurn
} from "/emigration/ui/emigration-migration-stats.js";

const REGISTERED_FLAG = "__emigMetricsRegistered";
const QUEUED_FLAG = "__emigMetricsQueued";

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
 * Group an integer with the player's locale digit separators (e.g. en `12,400`, de `12.400`,
 * fr `12 400`) via Intl.NumberFormat when the runtime exposes it, falling back to plain US-style
 * grouping otherwise (the GameFace runtime's locale APIs have historically been unreliable, so this
 * never assumes Intl is present or correct).
 * @param {number} v A non-negative integer.
 * @returns {string} Grouped string.
 */
function groupInt(v) {
  const n = Math.round(v);
  try {
    if (typeof Intl !== "undefined" && typeof Intl.NumberFormat === "function") {
      const s = new Intl.NumberFormat().format(n);
      if (typeof s === "string" && s.length) return s;
    }
  } catch (_) {
    /* ignore, fall through to the locale-independent grouping */
  }
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
// Each is a cumulative per-civ line, registered twice, once in Demographics' historically-scaled
// "people" and once in raw Civ population points, so the "Graphs" group's units toggle (Scaled / Civ
// numbers) just swaps which spec it charts. Cause breakdowns / splits ride in each line's tooltip.
// Labels are plain strings (Demographics renders metric labels raw, not as LOC keys). ──
const NET_CUM_SPEC = {
  id: "emig_net_cum",
  label: "Net Migration",
  title: "Net Migration Over Time",
  subtitle: "Net people gained minus lost to date; positive means more people arrive than leave.",
  description: "Running total of net people gained minus lost, to date (positive = net inflow).",
  category: "people",
  tooltipMode: "index", // net lines cluster near zero, hover a turn to list every civ at once
  accessor: (/** @type {*} */ ctx) => cumFor("netCumFor", ctx?.id),
  format: formatSignedPeople,
  unit: "people"
  // Tooltip shows just the net total; the per-cause breakdown lives on the Net Migration Table tab.
};
const NET_CUM_PTS_SPEC = {
  id: "emig_net_cum_pts",
  label: "Net Migration",
  title: "Net Migration Over Time",
  subtitle: "Net people gained minus lost to date; positive means more people arrive than leave.",
  description: "Running total of net population points gained minus lost: the exact Civ figures.",
  category: "people",
  tooltipMode: "index", // net lines cluster near zero, hover a turn to list every civ at once
  accessor: (/** @type {*} */ ctx) => cumFor("netPtsFor", ctx?.id),
  format: formatSignedPoints,
  unit: "points"
  // Tooltip shows just the net total; the per-cause breakdown lives on the Net Migration Table tab.
};
const REF_SPEC = {
  id: "emig_refugees",
  label: "Refugees Out",
  title: "Refugees that left over time",
  subtitle: "People displaced FROM this civilization by war, disaster, or conquest, to date.",
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
  title: "Refugees that left over time",
  subtitle: "People displaced FROM this civilization by war, disaster, or conquest, to date.",
  description: "Running total of population points displaced from this civ by war, disaster, or conquest.",
  category: "people",
  accessor: (/** @type {*} */ ctx) => cumFor("refugeesPtsFor", ctx?.id),
  format: formatPoints,
  unit: "points",
  tooltipAttribution: refugeesTooltip
};
// Refugee IMMIGRATION, war/disaster/conquest arrivals this civ has RECEIVED (the inflow counterpart
// of Refugees Out), so a civ taking in the displaced shows it distinct from economic immigration.
const REF_IN_SPEC = {
  id: "emig_refugees_in",
  label: "Refugees In",
  title: "Refugees that arrived over time",
  subtitle: "People who fled war, disaster, or conquest elsewhere and resettled HERE, to date.",
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
  title: "Refugees that arrived over time",
  subtitle: "People who fled war, disaster, or conquest elsewhere and resettled HERE, to date.",
  description: "Running total of population points who fled war, disaster, or conquest and resettled here.",
  category: "people",
  accessor: (/** @type {*} */ ctx) => cumFor("refugeesInPtsFor", ctx?.id),
  format: formatPoints,
  unit: "points",
  tooltipAttribution: refugeesInTooltip
};
// Gross emigration (people leaving) and immigration (people arriving), each in scaled people + raw
// Civ points, the per-flow detail alongside the Net Migration and Refugees headlines.
const OUT_CUM_SPEC = {
  id: "emig_out_cum",
  label: "Emigration",
  title: "Emigration Over Time",
  subtitle: "Total people who have left this civilization's cities to date.",
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
  title: "Emigration Over Time",
  subtitle: "Total people who have left this civilization's cities to date.",
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
  title: "Immigration Over Time",
  subtitle: "Total people who have arrived in this civilization's cities to date.",
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
  title: "Immigration Over Time",
  subtitle: "Total people who have arrived in this civilization's cities to date.",
  description: "Running total of population points that have arrived into this civilization's cities.",
  category: "people",
  accessor: (/** @type {*} */ ctx) => cumFor("grossInPtsFor", ctx?.id),
  format: formatPoints,
  unit: "points",
  tooltipAttribution: inTooltip
};
// All stay registered so the sampler tallies them every turn; the group below decides which one is
// charted for the (metric, units) selection.
// Per-civ CURRENT population in historically-scaled "people", computed with the SAME system as every
// other scaled figure: sum scaleCityPopulation(cityPoints, turn) over the civ's settlements (per-city,
// NOT on the aggregate, the curve is nonlinear, so sum-of-scaled ≠ scaled-of-sum). Cached per mono-turn
// since the host samples every civ in one tick. This is the "Scaled" series for the Population pill; the
// "Civ numbers" series is the host's raw `population_civ` (exact points).
/** @type {{turn:number, people:Record<number, number>}} */
let _popCache = { turn: -1, people: {} };
/**
 * Current scaled-people population for a civ (designed scaling, matches the flow graphs).
 * @param {number} [pid] Player id.
 * @returns {number} Scaled people, or 0.
 */
function civPeople(pid) {
  if (typeof pid !== "number") return 0;
  const turn = monoTurn();
  if (_popCache.turn !== turn) {
    /** @type {Record<number, number>} */
    const people = {};
    for (const s of collectCitySignals()) {
      const o = s.owner;
      if (typeof o === "number") people[o] = (people[o] || 0) + scaleCityPopulation(s.population || 0, turn);
    }
    _popCache = { turn, people };
  }
  return _popCache.people[pid] || 0;
}

const POP_PEOPLE_SPEC = {
  id: "emig_population",
  label: "Population",
  title: "Population Over Time",
  subtitle: "Current population, historically scaled to people (the same scaling as the flow graphs).",
  description: "Each civilization's current population, scaled to historical people per the shared model.",
  category: "people",
  accessor: (/** @type {*} */ ctx) => civPeople(ctx?.id),
  format: formatPeople,
  unit: "people"
};

const SPECS = [
  POP_PEOPLE_SPEC,
  NET_CUM_SPEC, NET_CUM_PTS_SPEC,
  OUT_CUM_SPEC, OUT_CUM_PTS_SPEC,
  IN_CUM_SPEC, IN_CUM_PTS_SPEC,
  REF_SPEC, REF_PTS_SPEC,
  REF_IN_SPEC, REF_IN_PTS_SPEC
];

// The "Graphs" section's two-toggle group: pick a metric (Net Migration / Emigration / Immigration /
// Refugees Out / Refugees In) and the units, Scaled (historical "people", consistent w/ Demographics
// chart) or Civ numbers (raw population points, reconciling with the in-game Emigration window). Each
// (member, view) maps to one of the registered specs above.
// The "Net Migration (Table)" pill charts nothing, it routes to the existing ledger sub-tab of the
// Migration panel (emigration-migration-page.js's "ledger" tab) via its panel-subtab id, so the table
// lives as a pill in this section right after the Net Migration graph. "<panelId>::<subId>" matches
// the host's PANEL_SUBTAB_SEP scheme; the host's group-merge then drops this id from the standalone
// sub-tab row. Both views map to the same id (the table carries its own units toggle).
const LEDGER_SUBTAB_ID = "emig_migration_panel::ledger";
// Bind the group's Scaled / Civ-numbers VIEW to the shared Emigration number mode, so this toggle
// and the "Numbers:" chip on the Network / Causes / Settlements tabs are one persistent setting,
// switching either one sticks, and reopening restores whatever was selected last.
const VIEW_BINDING = {
  get: () => (getNumberMode() === NumberMode.CIV ? "civ" : "scaled"),
  set: (/** @type {string} */ v) =>
    setNumberMode(v === "civ" ? NumberMode.CIV : NumberMode.HISTORICAL)
};

const GRAPHS_GROUP = {
  id: "emig_graphs",
  label: "Data",
  first: true,
  views: [{ id: "scaled", label: "Scaled Population" }, { id: "civ", label: "Civ Population" }],
  viewBinding: VIEW_BINDING,
  members: [
    // Population (the host's own metric) leads the group so the Migration hub's first page is
    // "Population & Migration": the population level + the flows that explain it. Both units map to the
    // same metric (population is a raw count with no Scaled/Civ points variant), like the ledger member.
    // Scaled → Emigration's people-scaled population (emig_population, the SAME per-city scaling as the
    // flow graphs); Civ → host's raw population points (population_civ). One scaling system everywhere.
    { label: "Population", scaled: "emig_population", civ: "population_civ" },
    { label: "Net Migration (Graph)", scaled: NET_CUM_SPEC.id, civ: NET_CUM_PTS_SPEC.id },
    { label: "Net Migration (Table)", scaled: LEDGER_SUBTAB_ID, civ: LEDGER_SUBTAB_ID },
    { label: "Emigration", scaled: OUT_CUM_SPEC.id, civ: OUT_CUM_PTS_SPEC.id },
    { label: "Immigration", scaled: IN_CUM_SPEC.id, civ: IN_CUM_PTS_SPEC.id },
    { label: "Refugees (Left)", scaled: REF_SPEC.id, civ: REF_PTS_SPEC.id },
    { label: "Refugees (Arrived)", scaled: REF_IN_SPEC.id, civ: REF_IN_PTS_SPEC.id }
  ]
};

/**
 * Register all specs + the Graphs group against a ready Demographics API.
 * @param {*} api The DemographicsMetricsAPI.
 */
function doRegister(api) {
  if (api && api[REGISTERED_FLAG]) return;
  for (const spec of SPECS) api.registerMetric(spec);
  // Collapse the migration graphs into ONE group with two toggles: the metric (Net Migration /
  // Refugees / …) and the units (Scaled / Civ numbers). Each (member, view) maps to a registered spec;
  // all stay registered above so they're still sampled. No-op on a host lacking the group hook.
  //  • hub mode (Phase 3): the group lives on the host's flat "Net Migration" Migration-hub page.
  //  • legacy: the group lives on the Emigration sibling panel page.
  const hubMode = typeof api.registerHubPages === "function"
    && Array.isArray(api.HUB_IDS) && api.HUB_IDS.includes("migration");
  const pageId = hubMode ? "emig_net_migration" : "emig_migration_panel"; // match the page that hosts it
  if (typeof api.registerMetricGroup === "function") {
    api.registerMetricGroup(Object.assign({ pageId }, GRAPHS_GROUP));
  }
  api[REGISTERED_FLAG] = true;
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
    if (api[REGISTERED_FLAG]) return true;
    if (typeof api.registerMetric === "function") {
      doRegister(api);
      return true;
    }
    api.pending ??= [];
    if (!api[QUEUED_FLAG]) {
      api.pending.push(doRegister);
      api[QUEUED_FLAG] = true;
    }
    return false;
  } catch (_) {
    return false;
  }
}
