// emigration-demographics-per-cause-metrics.js
//
// OPTIONAL: Register per-cause emigration and immigration metrics for granular tracking.
// This module is NOT loaded by default - it's provided as an example for mods that want
// detailed per-cause line charts in addition to the tooltip-based source attribution.
//
// Usage: Add this to emigration-main.js if granular cause tracking is desired — import
// registerPerCauseMetrics from this module and call it once at startup, after the
// Demographics API is available.

import { formatPeople } from "/emigration/ui/emigration-population.js";
import {
  sampleOutByCause,
  sampleInByCause
} from "/emigration/ui/emigration-migration-stats.js";

/**
 * Format a signed people count for per-cause metrics.
 * @param {number} n Net people.
 * @returns {string} Display string.
 */
function formatCauseMetric(n) {
  if (typeof n !== "number" || !isFinite(n) || n === 0) return "0";
  return formatPeople(Math.abs(n));
}

// Per-cause emigration specs
const WAR_EMIGRATION_SPEC = {
  id: "emig_war_emigration",
  label: "War Emigration",
  title: "Refugees from war per turn",
  category: "people",
  accessor: (/** @type {*} */ ctx) => (sampleOutByCause(ctx?.id).war || 0),
  format: formatCauseMetric,
  unit: "people / turn"
};

const DISASTER_EMIGRATION_SPEC = {
  id: "emig_disaster_emigration",
  label: "Disaster Emigration",
  title: "Refugees from disaster per turn",
  category: "people",
  accessor: (/** @type {*} */ ctx) => (sampleOutByCause(ctx?.id).disaster || 0),
  format: formatCauseMetric,
  unit: "people / turn"
};

const PROSPERITY_EMIGRATION_SPEC = {
  id: "emig_prosperity_emigration",
  label: "Prosperity Emigration",
  title: "Attracted emigration per turn",
  category: "people",
  accessor: (/** @type {*} */ ctx) => (sampleOutByCause(ctx?.id).prosperity || 0),
  format: formatCauseMetric,
  unit: "people / turn"
};

const UNHAPPINESS_EMIGRATION_SPEC = {
  id: "emig_unhappiness_emigration",
  label: "Unhappiness Emigration",
  title: "Unhappiness-driven emigration per turn",
  category: "people",
  accessor: (/** @type {*} */ ctx) => (sampleOutByCause(ctx?.id).unhappiness || 0),
  format: formatCauseMetric,
  unit: "people / turn"
};

// Per-cause immigration specs
const WAR_IMMIGRATION_SPEC = {
  id: "emig_war_immigration",
  label: "War Immigration",
  title: "War refugees received per turn",
  category: "people",
  accessor: (/** @type {*} */ ctx) => (sampleInByCause(ctx?.id).war || 0),
  format: formatCauseMetric,
  unit: "people / turn"
};

const DISASTER_IMMIGRATION_SPEC = {
  id: "emig_disaster_immigration",
  label: "Disaster Immigration",
  title: "Disaster refugees received per turn",
  category: "people",
  accessor: (/** @type {*} */ ctx) => (sampleInByCause(ctx?.id).disaster || 0),
  format: formatCauseMetric,
  unit: "people / turn"
};

const PROSPERITY_IMMIGRATION_SPEC = {
  id: "emig_prosperity_immigration",
  label: "Prosperity Immigration",
  title: "Attracted immigration per turn",
  category: "people",
  accessor: (/** @type {*} */ ctx) => (sampleInByCause(ctx?.id).prosperity || 0),
  format: formatCauseMetric,
  unit: "people / turn"
};

const ALL_SPECS = [
  WAR_EMIGRATION_SPEC,
  DISASTER_EMIGRATION_SPEC,
  PROSPERITY_EMIGRATION_SPEC,
  UNHAPPINESS_EMIGRATION_SPEC,
  WAR_IMMIGRATION_SPEC,
  DISASTER_IMMIGRATION_SPEC,
  PROSPERITY_IMMIGRATION_SPEC
];

/**
 * Register all per-cause metrics with Demographics.
 * @param {*} [api] Optional pre-loaded DemographicsMetricsAPI. If omitted, uses globalThis.
 */
export function registerPerCauseMetrics(api) {
  try {
    const metricsApi = api || (/** @type {*} */ (globalThis).DemographicsMetricsAPI);
    if (!metricsApi || typeof metricsApi.registerMetric !== "function") return;
    
    for (const spec of ALL_SPECS) metricsApi.registerMetric(spec);
    
    // Optional: Place cause metrics on a new "Causes" page or after the main migration metrics
    if (typeof metricsApi.registerMetricToPage === "function") {
      // Place under "power" page, grouped after the main migration metrics
      metricsApi.registerMetricToPage("power", WAR_EMIGRATION_SPEC.id, "emig_in");
      metricsApi.registerMetricToPage("power", DISASTER_EMIGRATION_SPEC.id, WAR_EMIGRATION_SPEC.id);
      metricsApi.registerMetricToPage("power", PROSPERITY_EMIGRATION_SPEC.id, DISASTER_EMIGRATION_SPEC.id);
      metricsApi.registerMetricToPage("power", UNHAPPINESS_EMIGRATION_SPEC.id, PROSPERITY_EMIGRATION_SPEC.id);
      metricsApi.registerMetricToPage("power", WAR_IMMIGRATION_SPEC.id, UNHAPPINESS_EMIGRATION_SPEC.id);
      metricsApi.registerMetricToPage("power", DISASTER_IMMIGRATION_SPEC.id, WAR_IMMIGRATION_SPEC.id);
      metricsApi.registerMetricToPage("power", PROSPERITY_IMMIGRATION_SPEC.id, DISASTER_IMMIGRATION_SPEC.id);
    }
  } catch (_) {
    /* Silently ignore if Demographics is unavailable */
  }
}

/**
 * Deferred registration: queue registration for when Demographics initializes.
 * Call this at module load time if Demographics may not be ready yet.
 */
export function queuePerCauseMetrics() {
  try {
    const api = (/** @type {*} */ (globalThis).DemographicsMetricsAPI ??= {});
    if (typeof api.registerMetric === "function") {
      registerPerCauseMetrics(api);
    } else {
      (api.pending ??= []).push(registerPerCauseMetrics);
    }
  } catch (_) {
    /* Ignore */
  }
}
