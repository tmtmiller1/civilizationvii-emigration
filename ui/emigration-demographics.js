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
// this module is purely the graph wiring. Metrics (in Demographics' historically-scaled "people"):
//   • Net migration  - immigration − emigration per turn (Power page).
//   • Emigration / Immigration - gross out / in per turn (Power page).
//   • Refugees - cumulative war/disaster/conquest-driven emigration (Conflicts page).

import { formatPeople } from "/emigration/ui/emigration-population.js";
import { causeLabel } from "/emigration/ui/emigration-causes.js";
import {
  netDeltaForPlayer,
  sampleOut,
  sampleIn,
  refugeesFor,
  emigrationByCause,
  immigrationByCause
} from "/emigration/ui/emigration-migration-stats.js";

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

const NET_SPEC = {
  id: "emig_net_migration",
  // Demographics renders the metric `label` raw (its own labels are plain English, e.g.
  // "Population"), so this must be a plain string, not a LOC key.
  label: "Net Migration",
  title: "Net migration per turn",
  category: "people",
  accessor: (/** @type {*} */ ctx) => netDeltaForPlayer(ctx?.id),
  format: formatSignedPeople,
  unit: "people / turn"
};
const OUT_SPEC = {
  id: "emig_out",
  label: "Emigration",
  title: "Emigration per turn",
  category: "people",
  accessor: (/** @type {*} */ ctx) => sampleOut(ctx?.id),
  format: formatPeople,
  unit: "people / turn",
  tooltipAttribution: (/** @type {*} */ ctx) => {
    const causes = emigrationByCause(ctx?.id);
    const att = formatCauseBreakdown(causes);
    return att ? `Sources: ${att}` : "";
  }
};
const IN_SPEC = {
  id: "emig_in",
  label: "Immigration",
  title: "Immigration per turn",
  category: "people",
  accessor: (/** @type {*} */ ctx) => sampleIn(ctx?.id),
  format: formatPeople,
  unit: "people / turn",
  tooltipAttribution: (/** @type {*} */ ctx) => {
    const causes = immigrationByCause(ctx?.id);
    const att = formatCauseBreakdown(causes);
    return att ? `Sources: ${att}` : "";
  }
};
const REF_SPEC = {
  id: "emig_refugees",
  label: "Refugees",
  title: "Refugees generated (cumulative)",
  category: "people",
  accessor: (/** @type {*} */ ctx) => refugeesFor(ctx?.id),
  format: formatPeople,
  unit: "people"
};
const SPECS = [NET_SPEC, OUT_SPEC, IN_SPEC, REF_SPEC];

/**
 * Register all specs + their page placements against a ready Demographics API.
 * @param {*} api The DemographicsMetricsAPI.
 */
function doRegister(api) {
  for (const spec of SPECS) api.registerMetric(spec);
  if (typeof api.registerMetricToPage !== "function") return;
  // Place the three migration tabs right after the native "population" tab, in order (each
  // anchored to the previous). Falls back to append on an older Demographics that ignores the arg.
  api.registerMetricToPage("power", NET_SPEC.id, "population");
  api.registerMetricToPage("power", OUT_SPEC.id, NET_SPEC.id);
  api.registerMetricToPage("power", IN_SPEC.id, OUT_SPEC.id);
  api.registerMetricToPage("conflicts", REF_SPEC.id);
  // If Demographics supports tooltip registration, register per-cause attribution handlers.
  if (typeof api.registerMetricTooltip === "function") {
    api.registerMetricTooltip(OUT_SPEC.id, OUT_SPEC.tooltipAttribution);
    api.registerMetricTooltip(IN_SPEC.id, IN_SPEC.tooltipAttribution);
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
