// emigration-migration-page.js
//
// Contribute a dedicated "Migration" page to the Demographics screen when that mod supports it. The
// page mounts the same shared render core (emigration-views.js) as the standalone window. Cross-mod
// handshake (mirrors emigration-demographics.js): `registerPanel(spec)` on globalThis.DemographicsMetricsAPI,
// registered now if the hook is up, else queued on the shared `pending` array; a silent no-op on a
// Demographics that lacks `registerPanel`.

import { dashboardModel, renderDashboardSubtab } from "/emigration/ui/emigration-views.js";
import { gatherDashboard } from "/emigration/ui/emigration-window.js";
import { setNumberMode, NumberMode, getMinimizeAnalytics } from "/emigration/ui/emigration-settings.js";
import { loc } from "/emigration/ui/emigration-loc.js";

// The Migration page's sub-tabs, one per dashboard section, presented as native Demographics sub-tabs.
// `id` is the section kind (handed back to render); `labelKey`/`titleKey` are the LOC keys (composed
// at registration by locTab) and `label`/`title` the English fallbacks. Mirrors emigration-views.js
// dashboardModel() order + TAB_LABELS and reuses its keys where the text is identical.
const SUBTABS = [
  { id: "cityflows", labelKey: "LOC_EMIG_VIEW_TAB_MY_CITIES", label: "Settlements", titleKey: "LOC_EMIG_VIEW_SEC_SETTLEMENTS", title: "Settlements" },
  { id: "flow", labelKey: "LOC_EMIG_VIEW_TAB_NETWORK", label: "Network", titleKey: "LOC_EMIG_PAGE_FLOW_TITLE", title: "Migration network & flows" },
  // Kept declared so its panel sub-tab synthetic registers (the host needs it for metricExists), but
  // not shown as a standalone sub-tab: emigration-demographics.js's "Data" group claims this id as
  // the "Net Migration (Table)" pill, and the host's group-merge drops it from the tab row.
  { id: "ledger", labelKey: "LOC_EMIG_VIEW_TAB_NET_TABLE", label: "Net Migration (Table)", titleKey: "LOC_EMIG_PAGE_LEDGER_TITLE", title: "Net migration by civilization" },
  { id: "stances", labelKey: "LOC_EMIG_PAGE_STANCES_TAB", label: "Immigration Policies", titleKey: "LOC_EMIG_VIEW_SEC_POLICIES", title: "Immigration policies" },
  { id: "notifications", labelKey: "LOC_EMIG_VIEW_TAB_NOTIFICATIONS", label: "Notifications", titleKey: "LOC_EMIG_VIEW_SEC_NOTIFICATIONS", title: "Migration notifications" }
];

/**
 * A registration-time copy of a sub-tab / hub-page with its label (and title, when present) composed.
 * The host renders panel tab + hub-page labels verbatim, so the LOC keys are resolved here (at runtime,
 * where Locale is ready); the helper `*Key` props are stripped from the object handed to the host.
 * @param {*} t A SUBTABS or HUB_PAGES entry. @returns {*} The localized copy.
 */
function locTab(t) {
  const { labelKey, titleKey, ...rest } = t;
  rest.label = loc(labelKey, t.label);
  if (titleKey) rest.title = loc(titleKey, t.title);
  return rest;
}

const PANEL_ID = "emig_migration_panel";
const REGISTERED_FLAG = "__emigMigrationPageRegistered";

// The "simplify dashboard" option (emigration-settings) hides the heavy analytics tabs. On the embedded
// Demographics page the host owns the tab list after registration, so the option is read at registration
// (game load) here, matching the standalone dashboard's section filter (emigration-views.visibleSections).
const HIDDEN_SUBTAB_IDS = new Set(["flow"]);
const HIDDEN_HUB_IDS = new Set(["emig_network"]);

function visibleSubtabs() {
  const list = getMinimizeAnalytics() ? SUBTABS.filter((t) => !HIDDEN_SUBTAB_IDS.has(t.id)) : SUBTABS;
  return list.map(locTab);
}

function visibleHubPages() {
  const list = getMinimizeAnalytics() ? HUB_PAGES.filter((p) => !HIDDEN_HUB_IDS.has(p.id)) : HUB_PAGES;
  return list.map(locTab);
}
const QUEUED_FLAG = "__emigMigrationPageQueued";

/** @param {*} container */
function isValidContainer(container) {
  return !!container
    && typeof container.appendChild === "function"
    && typeof container.innerHTML === "string";
}

// Host-fill rules for the embedded page only (the standalone window has its own host). Demographics'
// render-page host stretches to its view-host column; these make our boxes fill it in turn, because the
// network diagram sizes itself by measuring `.emig-tabbody` and a content-sized box makes that
// measurement circular. `max-height` is unset with the flex so a vh cap cannot re-cap the box.
const HOST_FILL_CSS =
  ".demographics-history-render-page > .emig-dash{height:100%;}" +
  ".demographics-history-render-page .emig-tabbody{flex:1 1 auto;min-height:0;max-height:none;}";

function injectHostFillStyle() {
  try {
    if (typeof document === "undefined" || !document.head) return;
    if (document.getElementById("emig-mig-page-style")) return;
    const st = document.createElement("style");
    st.id = "emig-mig-page-style";
    st.textContent = HOST_FILL_CSS;
    document.head.appendChild(st);
  } catch (_) {
    /* best-effort: without it the page still renders, just without filling the host */
  }
}

/**
 * Render one migration dashboard section into a Demographics-provided container. When the host renders
 * this panel as a member of the "Data" metric-group, `ctx.groupView` carries the group's Scaled / Civ
 * toggle, so the Net Migration (Table) follows those pills and its own units chip is suppressed.
 * @param {*} container The page's content element.
 * @param {string} [kind] The section kind (sub-tab id); defaults to the first sub-tab.
 * @param {*} [ctx] The Demographics render context (may carry `groupView`).
 */
function renderInto(container, kind, ctx) {
  if (!isValidContainer(container)) return;
  try {
    injectHostFillStyle();
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
 * renders per section, the single home for all emigration content in Demographics (the dashboard
 * views plus the line graphs emigration-demographics.js registers onto this same page).
 */
const PANEL_SPEC = {
  id: PANEL_ID,
  pageLabel: "Emigration",
  title: "Migration",
  tabs: SUBTABS,
  // Present this panel as its own top-level tab in the Demographics screen (to the right of
  // Historical Data) rather than as a page buried inside Historical Data. The Demographics screen
  // reads this flag to add the tab and to exclude the panel from the Historical-Data page row.
  topLevel: true,
  render: (/** @type {*} */ container, /** @type {*} */ ctx, /** @type {*} */ subId) =>
    renderInto(container, subId, ctx)
};

// Hub mode
// A hub-capable Demographics exposes registerHubPages + HUB_IDS; we then contribute flat pages into the
// host's "Migration" hub instead of a sibling top-level tab: Net Migration (an empty metrics page the
// host fills with the `emig_graphs` group) and render pages reusing renderInto. The panel is still
// registered (non top-level) so the "Net Migration (Table)" group member can route to its ledger sub-tab.
const MIGRATION_ANCHOR = "population"; // host Migration-hub anchor page (Population)
const NET_MIGRATION_PAGE_ID = "emig_net_migration"; // must match emigration-demographics.js group pageId

const HUB_PAGES = [
  { id: NET_MIGRATION_PAGE_ID, labelKey: "LOC_EMIG_HUB_POP_MIGRATION", label: "Population & Migration", tier: "basic", metrics: [] },
  { id: "emig_cities", labelKey: "LOC_EMIG_VIEW_TAB_MY_CITIES", label: "Settlements", tier: "standard", render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "cityflows", c) },
  { id: "emig_network", labelKey: "LOC_EMIG_VIEW_TAB_NETWORK", label: "Network", tier: "standard", render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "flow", c) },
  { id: "emig_policies", labelKey: "LOC_EMIG_VIEW_TAB_POLICIES", label: "Policies", tier: "standard", render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "stances", c) },
  { id: "emig_notifications", labelKey: "LOC_EMIG_VIEW_TAB_NOTIFICATIONS", label: "Notifications", tier: "standard", render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "notifications", c) }
];

/** @param {*} api */
function hostSupportsHubs(api) {
  return typeof api.registerHubPages === "function"
    && Array.isArray(api.HUB_IDS) && api.HUB_IDS.includes("migration");
}

/**
 * A registration-time copy of PANEL_SPEC with its verbatim-rendered `pageLabel` + `title` composed.
 * @param {*} extra Per-host overrides merged last (tabs, topLevel). @returns {*} The localized panel.
 */
function locPanel(extra) {
  return Object.assign({}, PANEL_SPEC, {
    pageLabel: loc("LOC_EMIG_PAGE_LABEL", PANEL_SPEC.pageLabel),
    title: loc("LOC_EMIG_PAGE_TITLE", PANEL_SPEC.title)
  }, extra);
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
    // Keep the panel (non top-level) for the ledger group-member routing; contribute the flat pages.
    api.registerPanel(locPanel({ tabs: visibleSubtabs(), topLevel: false }));
    api.registerHubPages("migration", visibleHubPages(), { after: MIGRATION_ANCHOR });
    api[REGISTERED_FLAG] = true;
    return true;
  }
  if (typeof api.registerPanel === "function") {
    api.registerPanel(locPanel({ tabs: visibleSubtabs() }));
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
