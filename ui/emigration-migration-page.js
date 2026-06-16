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
// If the installed Demographics predates `registerPanel`, registration is a silent no-op — the
// standalone window still covers the same content, so nothing is lost.

import { dashboardModel, renderDashboard } from "/emigration/ui/emigration-views.js";
import { gatherDashboard } from "/emigration/ui/emigration-window.js";

/**
 * Render the migration dashboard into a Demographics-provided container.
 * @param {*} container The page's content element.
 */
function renderInto(container) {
  try {
    renderDashboard(container, dashboardModel(gatherDashboard()));
  } catch (_) {
    /* a render failure must never break the Demographics screen */
  }
}

/** The panel spec handed to Demographics: a page tab whose body Emigration renders. */
const PANEL_SPEC = {
  id: "emig_migration_panel",
  pageLabel: "Migration",
  tabLabel: "Overview",
  title: "Migration",
  render: (/** @type {*} */ container) => renderInto(container)
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
