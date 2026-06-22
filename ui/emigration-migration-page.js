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
import { setNumberMode, NumberMode } from "/emigration/ui/emigration-settings.js";

// The Migration page's sub-tabs — one per dashboard section, so the embedded page shows the SAME
// content as the standalone window but presented as NATIVE Demographics sub-tabs (the same metric
// sub-tab row the Crises / Conflicts pages use), instead of a single "Overview" tab wrapping the
// emigration tab bar. `id` is the section kind (handed back to render); `label` is the short sub-tab
// label; `title` is the descriptive chart title. Mirrors emigration-views.js dashboardModel() order
// + TAB_LABELS.
const SUBTABS = [
  { id: "flow", label: "Network", title: "Migration network & flows" },
  // Kept declared so its panel sub-tab synthetic registers (the host needs it for metricExists), but
  // it no longer appears as a standalone sub-tab: emigration-demographics.js's "Data" group claims
  // this id as the "Net Migration (Table)" pill, and the host's group-merge drops it from the tab row.
  { id: "ledger", label: "Net Migration (Table)", title: "Net migration by civilization" },
  { id: "pies", label: "Causes", title: "Why people move" },
  { id: "cityflows", label: "Settlements", title: "Settlements" },
  { id: "stances", label: "Immigration Policies", title: "Immigration policies" },
  { id: "notifications", label: "Notifications", title: "Migration notifications" },
  // The Guide is a static reference matrix with no per-civ data, so the host's analytics-visibility
  // policy banner is meaningless there — opt it out (the host reads `hidePolicyBanner`).
  { id: "guide", label: "Guide", title: "What counts", hidePolicyBanner: true }
];

/**
 * Render one migration dashboard section into a Demographics-provided container. When the host renders
 * this panel as a member of the "Data" metric-group, `ctx.groupView` carries the group's Scaled / Civ
 * toggle — so the Net Migration (Table) follows those pills (mapping the view to the units NumberMode)
 * and its own redundant units chip is suppressed. On the standalone sub-tabs (no group), the chip stays.
 * @param {*} container The page's content element.
 * @param {string} [kind] The section kind (sub-tab id); defaults to the first sub-tab.
 * @param {*} [ctx] The Demographics render context (may carry `groupView`).
 */
function renderInto(container, kind, ctx) {
  try {
    const groupControlled = ctx && (ctx.groupView === "scaled" || ctx.groupView === "civ");
    if (groupControlled) {
      setNumberMode(ctx.groupView === "civ" ? NumberMode.CIV : NumberMode.HISTORICAL);
    }
    renderDashboardSubtab(container, dashboardModel(gatherDashboard()), kind || SUBTABS[0].id,
      { hideUnitsToggle: !!groupControlled, rebuild: () => renderInto(container, kind, ctx),
        controlsHost: ctx && ctx.panelControls });
  } catch (_) {
    /* a render failure must never break the Demographics screen */
  }
}

/**
 * The panel spec handed to Demographics: a permanent "Migration" page whose sub-tabs Emigration
 * renders per section. This is the single home for all emigration content in Demographics - the
 * dashboard views (network / flows / ledger / causes / settlements / policies / guide) plus the
 * per-civ migration line graphs registered onto this same page by emigration-demographics.js.
 */
const PANEL_SPEC = {
  id: "emig_migration_panel",
  pageLabel: "Emigration",
  title: "Migration",
  tabs: SUBTABS,
  // Present this panel as its OWN top-level tab in the Demographics screen (to the right of
  // Historical Data) rather than as a page buried inside Historical Data. The Demographics screen
  // reads this flag to add the tab and to exclude the panel from the Historical-Data page row.
  topLevel: true,
  render: (/** @type {*} */ container, /** @type {*} */ ctx, /** @type {*} */ subId) =>
    renderInto(container, subId, ctx)
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
