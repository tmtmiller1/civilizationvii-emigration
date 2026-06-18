// emigration-migration-page.js
//
// Phase 4 (the in-game-legibility plan, L3): contribute a dedicated "Migration" PAGE to the
// Demographics screen when that mod supports it. The page mounts the SAME shared render core
// (emigration-views.js) as the standalone window (L4), so there's one source of dashboard content.
//
// Cross-mod handshake (mirrors emigration-demographics.js): Demographics exposes
// globalThis.DemographicsMetricsAPI; the new hook is `registerPanel(spec)`, where spec.render is an
// Emigration-owned callback the screen invokes with a container element. We register now if the
// hook is up, else queue on the shared `pending` array for Demographics to drain when it loads.
// If the installed Demographics predates `registerPanel`, registration is a silent no-op , the
// standalone window still covers the same content, so nothing is lost.

import { dashboardModel, renderDashboardSubtab } from "/emigration/ui/emigration-views.js";
import { gatherDashboard } from "/emigration/ui/emigration-window.js";

// The Migration page's sub-tabs — one per dashboard section, so the embedded page shows the SAME
// content as the standalone window but presented as NATIVE Demographics sub-tabs (the same metric
// sub-tab row the Crises / Conflicts pages use), instead of a single "Overview" tab wrapping the
// emigration tab bar. `id` is the section kind (handed back to render); `label` is the short sub-tab
// label; `title` is the descriptive chart title. Mirrors emigration-views.js dashboardModel() order
// + TAB_LABELS.
const SUBTABS = [
  { id: "network", label: "Network", title: "Migration network" },
  { id: "flowmap", label: "Flows", title: "Migration flows" },
  { id: "ledger", label: "Civilizations", title: "Civilizations" },
  { id: "pies", label: "Causes", title: "Why people move" },
  { id: "cityflows", label: "Settlements", title: "Settlements" },
  { id: "stances", label: "Immigration Policies", title: "Immigration policies" }
];

/**
 * Render one migration dashboard section into a Demographics-provided container.
 * @param {*} container The page's content element.
 * @param {string} [kind] The section kind (sub-tab id); defaults to the first sub-tab.
 */
function renderInto(container, kind) {
  try {
    renderDashboardSubtab(container, dashboardModel(gatherDashboard()), kind || SUBTABS[0].id);
  } catch (_) {
    /* a render failure must never break the Demographics screen */
  }
}

/** The panel spec handed to Demographics: a page whose sub-tabs Emigration renders per section. */
const PANEL_SPEC = {
  id: "emig_migration_panel",
  pageLabel: "Migration",
  title: "Migration",
  tabs: SUBTABS,
  render: (/** @type {*} */ container, /** @type {*} */ _ctx, /** @type {*} */ subId) =>
    renderInto(container, subId)
};

/**
 * Register the page against a ready Demographics API. Returns false if the API lacks the
 * panel hook (an older Demographics), so the caller can leave it queued / no-op.
 * @param {*} api The DemographicsMetricsAPI.
 * @returns {boolean} Whether the panel registered.
 */
function doRegister(api) {
  if (typeof api.registerPanel === "function") {
    api.registerPanel(PANEL_SPEC);
    return true;
  }
  return false;
}

/**
 * Contribute the Migration page to Demographics. Order-independent: registers now if the panel hook
 * is up, else queues on the shared hook for Demographics to drain when its screen module loads.
 * No-op if Demographics is absent or predates `registerPanel`.
 * @returns {boolean} True if registered immediately; false if queued/absent/unsupported.
 */
export function registerMigrationPage() {
  try {
    const api = (/** @type {*} */ (globalThis).DemographicsMetricsAPI ??= {});
    if (doRegister(api)) return true;
    (api.pending ??= []).push(doRegister);
    return false;
  } catch (_) {
    return false;
  }
}
