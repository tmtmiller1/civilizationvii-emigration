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
// If the installed Demographics predates `registerPanel`, registration is a silent no-op, the
// standalone window still covers the same content, so nothing is lost.

import { dashboardModel, renderDashboardSubtab } from "/emigration/ui/emigration-views.js";
import { gatherDashboard } from "/emigration/ui/emigration-window.js";
import { setNumberMode, NumberMode, getMinimizeAnalytics } from "/emigration/ui/emigration-settings.js";
import { loc } from "/emigration/ui/emigration-loc.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";

// The Migration page's sub-tabs, one per dashboard section, so the embedded page shows the SAME
// content as the standalone window but presented as NATIVE Demographics sub-tabs (the same metric
// sub-tab row the Crises / Conflicts pages use), instead of a single "Overview" tab wrapping the
// emigration tab bar. `id` is the section kind (handed back to render); `label` is the short sub-tab
// label; `title` is the descriptive chart title. Mirrors emigration-views.js dashboardModel() order
// + TAB_LABELS.
// `labelKey`/`titleKey` are the LOC keys (composed at registration by locTab); `label`/`title` are the
// English fallbacks. Labels/titles reuse the standalone dashboard's already-translated keys
// (emigration-views.js) where the text is identical, so translators touch each string once; the few
// migration-page-only strings carry their own LOC_EMIG_PAGE_* keys.
const SUBTABS = [
  { id: "flow", labelKey: "LOC_EMIG_VIEW_TAB_NETWORK", label: "Network", titleKey: "LOC_EMIG_PAGE_FLOW_TITLE", title: "Migration network & flows" },
  // Kept declared so its panel sub-tab synthetic registers (the host needs it for metricExists), but
  // it no longer appears as a standalone sub-tab: emigration-demographics.js's "Data" group claims
  // this id as the "Net Migration (Table)" pill, and the host's group-merge drops it from the tab row.
  { id: "ledger", labelKey: "LOC_EMIG_VIEW_TAB_NET_TABLE", label: "Net Migration (Table)", titleKey: "LOC_EMIG_PAGE_LEDGER_TITLE", title: "Net migration by civilization" },
  { id: "pies", labelKey: "LOC_EMIG_VIEW_TAB_CAUSES", label: "Causes", titleKey: "LOC_EMIG_VIEW_SEC_WHY", title: "Why people move" },
  { id: "cityflows", labelKey: "LOC_EMIG_VIEW_SEC_SETTLEMENTS", label: "Settlements", titleKey: "LOC_EMIG_VIEW_SEC_SETTLEMENTS", title: "Settlements" },
  { id: "diversity", labelKey: "LOC_EMIG_VIEW_TAB_DIVERSITY", label: "Diversity", titleKey: "LOC_EMIG_PAGE_DIVERSITY_TITLE", title: "Most diverse cities" },
  { id: "stances", labelKey: "LOC_EMIG_PAGE_STANCES_TAB", label: "Immigration Policies", titleKey: "LOC_EMIG_VIEW_SEC_POLICIES", title: "Immigration policies" },
  { id: "notifications", labelKey: "LOC_EMIG_VIEW_TAB_NOTIFICATIONS", label: "Notifications", titleKey: "LOC_EMIG_VIEW_SEC_NOTIFICATIONS", title: "Migration notifications" },
  // The Guide is a static reference matrix with no per-civ data, so the host's analytics-visibility
  // policy banner is meaningless there, opt it out (the host reads `hidePolicyBanner`).
  { id: "guide", labelKey: "LOC_EMIG_VIEW_TAB_GUIDE", label: "Guide", titleKey: "LOC_EMIG_GUIDE_VIEW_REF", title: "What counts", hidePolicyBanner: true }
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
const HIDDEN_SUBTAB_IDS = new Set(["flow", "pies"]);
const HIDDEN_HUB_IDS = new Set(["emig_network", "emig_causes"]);

/**
 * Whether a tab must be dropped for a reason other than "simplify dashboard": the Diversity tab is
 * flag-gated (CONFIG.diversityRanking), and dashboardModel omits its section entirely when the flag
 * is off. Registering the tab anyway would be worse than useless — renderDashboardSubtab falls back
 * to sections[0] for an unknown kind, so a "Diversity" tab would render the Network.
 * @param {string} kind The section kind the tab renders.
 * @returns {boolean} True to drop it.
 */
function tabGatedOff(kind) {
  return kind === "diversity" && !CONFIG.diversityRanking;
}

/** The sub-tabs to show, dropping the Network + Causes analytics tabs when "simplify dashboard" is on. */
function visibleSubtabs() {
  const shown = SUBTABS.filter((t) => !tabGatedOff(t.id));
  const list = getMinimizeAnalytics() ? shown.filter((t) => !HIDDEN_SUBTAB_IDS.has(t.id)) : shown;
  return list.map(locTab);
}

/** The hub pages to contribute, dropping the Network + Causes pages when "simplify dashboard" is on. */
function visibleHubPages() {
  const shown = HUB_PAGES.filter((p) => !(p.id === "emig_diversity" && tabGatedOff("diversity")));
  const list = getMinimizeAnalytics() ? shown.filter((p) => !HIDDEN_HUB_IDS.has(p.id)) : shown;
  return list.map(locTab);
}
const QUEUED_FLAG = "__emigMigrationPageQueued";

/** @param {*} container */
function isValidContainer(container) {
  return !!container
    && typeof container.appendChild === "function"
    && typeof container.innerHTML === "string";
}

// Host-fill rules for the EMBEDDED page only (the standalone window has its own host and is left
// alone). Lives here rather than in the shared sheet because it is purely about how the dashboard
// meets THIS host — which is exactly what this module owns.
//
// Demographics' render-page host now stretches to its view-host column (screen-demographics-base.css)
// instead of sizing to content; these make our boxes fill it in turn. That matters because the
// network diagram sizes itself by MEASURING `.emig-tabbody`: while that box was content-sized, the
// measurement was circular — it reported the space the diagram already occupied, never the space
// left over — so the diagram sat at its CSS ceiling with a large empty band beneath it. (Probe,
// 2026-07-17 @2880x1800: budget 915 vs a stage of 900; ~297px below it unused.)
//
// `max-height` has to go with the flex: 74vh (1332px at that height) would otherwise re-cap the box
// below the ~1399px actually available.
const HOST_FILL_CSS =
  ".demographics-history-render-page > .emig-dash{height:100%;}" +
  ".demographics-history-render-page .emig-tabbody{flex:1 1 auto;min-height:0;max-height:none;}";

/** Inject the embedded-page host-fill rules once. Never throws (styling is best-effort). */
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
 * toggle, so the Net Migration (Table) follows those pills (mapping the view to the units NumberMode)
 * and its own redundant units chip is suppressed. On the standalone sub-tabs (no group), the chip stays.
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
  { id: NET_MIGRATION_PAGE_ID, labelKey: "LOC_EMIG_HUB_POP_MIGRATION", label: "Population & Migration", tier: "basic", metrics: [] },
  { id: "emig_network", labelKey: "LOC_EMIG_VIEW_TAB_NETWORK", label: "Network", tier: "standard", render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "flow", c) },
  { id: "emig_causes", labelKey: "LOC_EMIG_VIEW_TAB_CAUSES", label: "Causes", tier: "standard", render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "pies", c) },
  { id: "emig_cities", labelKey: "LOC_EMIG_VIEW_TAB_MY_CITIES", label: "My Cities", tier: "standard", render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "cityflows", c) },
  { id: "emig_diversity", labelKey: "LOC_EMIG_VIEW_TAB_DIVERSITY", label: "Diversity", tier: "standard", render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "diversity", c) },
  { id: "emig_policies", labelKey: "LOC_EMIG_VIEW_TAB_POLICIES", label: "Policies", tier: "standard", render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "stances", c) },
  { id: "emig_notifications", labelKey: "LOC_EMIG_VIEW_TAB_NOTIFICATIONS", label: "Notifications", tier: "standard", render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "notifications", c) },
  { id: "emig_guide", labelKey: "LOC_EMIG_VIEW_TAB_GUIDE", label: "Guide", tier: "standard", hidePolicyBanner: true, render: (/** @type {*} */ b, /** @type {*} */ c) => renderInto(b, "guide", c) }
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
    // Keep the panel (NON top-level) for the ledger group-member routing; contribute the flat pages.
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
