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
import { setNumberMode, NumberMode, getMinimizeAnalytics } from "/emigration/ui/emigration-settings.js";

// The Migration page's sub-tabs, one per dashboard section, so the embedded page shows the SAME
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
  // policy banner is meaningless there, opt it out (the host reads `hidePolicyBanner`).
  { id: "guide", label: "Guide", title: "What counts", hidePolicyBanner: true }
];

const PANEL_ID = "emig_migration_panel";
const REGISTERED_FLAG = "__emigMigrationPageRegistered";

// The "simplify dashboard" option (emigration-settings) hides the heavy analytics tabs. On the embedded
// Demographics page the host owns the tab list after registration, so the option is read at registration
// (game load) here, matching the standalone dashboard's section filter (emigration-views.visibleSections).
const HIDDEN_SUBTAB_IDS = new Set(["flow", "pies"]);
const HIDDEN_HUB_IDS = new Set(["emig_network", "emig_causes"]);

/** The sub-tabs to show, dropping the Network + Causes analytics tabs when "simplify dashboard" is on. */
function visibleSubtabs() {
  return getMinimizeAnalytics() ? SUBTABS.filter((t) => !HIDDEN_SUBTAB_IDS.has(t.id)) : SUBTABS;
}

/** The hub pages to contribute, dropping the Network + Causes pages when "simplify dashboard" is on. */
function visibleHubPages() {
  return getMinimizeAnalytics() ? HUB_PAGES.filter((p) => !HIDDEN_HUB_IDS.has(p.id)) : HUB_PAGES;
}
const QUEUED_FLAG = "__emigMigrationPageQueued";

/** @param {*} container */
function isValidContainer(container) {
  return !!container
    && typeof container.appendChild === "function"
    && typeof container.innerHTML === "string";
}

/**
 * Render one migration dashboard section into a Demographics-provided container. When the host renders
 * this panel as a member of the "Data" metric-group, `ctx.groupView` carries the group's Scaled / Civ
 * toggle, so the Net Migration (Table) follows those pills (mapping the view to the units NumberMode)
 * and its own redundant units chip is suppressed. On the standalone sub-tabs (no group), the chip stays.
 * @param {*} container The page's content element.
 * @param {string} [kind] The section kind (sub-tab id); defaults to the first sub-tab.
 * @param {*} [ctx] The Demographics render context (may carry `groupView`).
 */
function renderInto(container, kind, ctx) {
  if (!isValidContainer(container)) return;
  try {
    const groupControlled = ctx && (ctx.groupView === "scaled" || ctx.groupView === "civ");
    if (groupControlled) {
      setNumberMode(ctx.groupView === "civ" ? NumberMode.CIV : NumberMode.HISTORICAL);
    }
    renderDashboardSubtab(container, dashboardModel(gatherDashboard()), kind || visibleSubtabs()[0].id,
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
  id: PANEL_ID,
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

// ── Hub mode (Phase 3) ───────────────────────────────────────────────────────
// A hub-capable Demographics exposes registerHubPages + HUB_IDS. We then contribute FLAT pages into
// the host's "Migration" hub (after its Population anchor) instead of a sibling top-level tab:
//   • Net Migration, an empty metrics page the host fills with the relocated `emig_graphs` group
//     (registered in emigration-demographics.js with pageId === NET_MIGRATION_PAGE_ID). Its line charts
//     stay HOST-rendered via their metric accessors; this page just hosts the member/units toggles.
//   • the rest, render pages reusing the dashboard section renderer (renderInto).
// The panel is still registered (NON top-level) so the "Net Migration (Table)" group member can route
// to its ledger sub-tab; with no `topLevel` it shows nowhere as a tab.
const MIGRATION_ANCHOR = "population"; // host Migration-hub anchor page (Population)
const NET_MIGRATION_PAGE_ID = "emig_net_migration"; // must match emigration-demographics.js group pageId

const HUB_PAGES = [
  { id: NET_MIGRATION_PAGE_ID, label: "Population & Migration", tier: "basic", metrics: [] },
  { id: "emig_network", label: "Network", tier: "standard", render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "flow", c) },
  { id: "emig_causes", label: "Causes", tier: "standard", render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "pies", c) },
  { id: "emig_cities", label: "My Cities", tier: "standard", render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "cityflows", c) },
  { id: "emig_policies", label: "Policies", tier: "standard", render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "stances", c) },
  { id: "emig_notifications", label: "Notifications", tier: "standard", render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "notifications", c) },
  { id: "emig_guide", label: "Guide", tier: "standard", hidePolicyBanner: true, render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "guide", c) }
];

/**
 * Whether the host supports hub-targeted contribution (Phase 3).
 * @param {*} api The DemographicsMetricsAPI.
 * @returns {boolean} True when hub mode is available.
 */
function hostSupportsHubs(api) {
  return typeof api.registerHubPages === "function"
    && Array.isArray(api.HUB_IDS) && api.HUB_IDS.includes("migration");
}

/**
 * Register the page against a ready Demographics API. Prefers hub mode (flat pages in the Migration
 * hub); falls back to the legacy sibling-tab panel on an older host. Returns false if the API lacks
 * even registerPanel, so the caller can leave it queued / no-op.
 * @param {*} api The DemographicsMetricsAPI.
 * @returns {boolean} Whether anything registered.
 */
function doRegister(api) {
  if (api && api[REGISTERED_FLAG]) return true;
  if (hostSupportsHubs(api)) {
    // Keep the panel (NON top-level) for the ledger group-member routing; contribute the flat pages.
    api.registerPanel(Object.assign({}, PANEL_SPEC, { tabs: visibleSubtabs(), topLevel: false }));
    api.registerHubPages("migration", visibleHubPages(), { after: MIGRATION_ANCHOR });
    api[REGISTERED_FLAG] = true;
    return true;
  }
  if (typeof api.registerPanel === "function") {
    api.registerPanel(Object.assign({}, PANEL_SPEC, { tabs: visibleSubtabs() }));
    api[REGISTERED_FLAG] = true;
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
