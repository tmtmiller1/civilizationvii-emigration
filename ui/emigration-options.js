// emigration-options.js
//
// Registers the Emigration settings under the shared "Mods" tab of the Options
// screen, in BOTH shell and game scopes (main-menu and in-game alike):
//   • Number display dropdown (how migration counts are shown).
//   • Intensity PRESET dropdown (Custom / Low / Medium / High) - the simple knob.
//   • An "Advanced settings…" row that opens a dedicated sub-window
//     (emigration-advanced-editor.js) holding the ~57 individual tunables, so the
//     Mods tab itself stays uncluttered. Applying a preset writes the relevant
//     advanced values; advanced edits (made in the sub-window) layer on top.
//
// Kept separate from emigration-settings.js so the gameplay loop never depends on
// the Options-screen chunk loading.

import { CategoryType, OptionType, Options } from "/core/ui/options/model-options.js";
import { CategoryData } from "/core/ui/options/options-helpers.js";
import "/emigration/ui/options/emigration-advanced-editor.js"; // register the Advanced sub-window

// Create the community-convention shared "Mods" Options-screen category (idempotent: the first mod
// to load this creates it, later mods reuse it). Lives HERE, in the Options-context module, NOT in
// mod-options.js - that store is imported by the gameplay loop, which can't link the Options-screen
// modules this needs.
if (!CategoryType.Mods) CategoryType["Mods"] = "mods";
if (!CategoryData[CategoryType.Mods]) {
  CategoryData[CategoryType.Mods] = {
    title: "LOC_UI_CONTENT_MGR_SUBTITLE",
    description: "LOC_UI_CONTENT_MGR_SUBTITLE_DESCRIPTION"
  };
}
import {
  getNumberMode,
  setNumberMode,
  getPresetIndex,
  applyPresetIndex,
  getSampleData,
  setSampleData,
  getSnapshotInterval,
  setSnapshotInterval,
  getShowDockButton,
  setShowDockButton,
  getMinimizeAnalytics,
  setMinimizeAnalytics,
  getVisibilityOverride,
  setVisibilityOverride,
  getDilemmasEnabled,
  setDilemmasEnabled,
  getIntegrationEnabled,
  setIntegrationEnabled,
  getReturnEnabled,
  setReturnEnabled,
  getTunable,
  setTunable
} from "/emigration/ui/emigration-settings.js";
import { PRESET_NAMES } from "/emigration/ui/emigration-tunables.js";

const MAIN_GROUP = "emigration";

const NUMBER_MODE_ITEMS = [
  { label: "LOC_OPTIONS_EMIGRATION_NUMBERS_BOTH" },
  { label: "LOC_OPTIONS_EMIGRATION_NUMBERS_CIV" },
  { label: "LOC_OPTIONS_EMIGRATION_NUMBERS_HISTORICAL" }
];
const DATA_MODE_ITEMS = [
  { label: "LOC_OPTIONS_EMIG_DATA_LIVE" },
  { label: "LOC_OPTIONS_EMIG_DATA_SAMPLE" }
];
// Timeline detail: turns per snapshot (index 0 → every turn … index 4 → every 5 turns).
const SNAP_ITEMS = [
  { label: "Every turn (finest)" },
  { label: "Every 2 turns" },
  { label: "Every 3 turns" },
  { label: "Every 4 turns" },
  { label: "Every 5 turns" }
];
const PRESET_ITEMS = PRESET_NAMES.map((n) => ({ label: "LOC_EMIG_PRESET_" + n.toUpperCase() }));
// Emigration's own analytics-visibility control for its dashboard tabs (0 follow Demographics,
// 1 hide unmet, 2 show all). Plain-string item labels, no localization round-trip needed.
const VISIBILITY_ITEMS = [
  { label: "Follow Demographics setting" },
  { label: "Hide civilizations I haven't met" },
  { label: "Show all civilizations" }
];

/** Register the number-display dropdown. */
function registerNumberMode() {
  Options.addOption({
    category: CategoryType.Mods,
    group: MAIN_GROUP,
    type: OptionType.Dropdown,
    id: "emigration-number-mode",
    initListener: (/** @type {*} */ info) => (info.selectedItemIndex = getNumberMode()),
    updateListener: (/** @type {*} */ _i, /** @type {number} */ v) => setNumberMode(v),
    label: "LOC_OPTIONS_EMIGRATION_NUMBERS",
    description: "LOC_OPTIONS_EMIGRATION_NUMBERS_DESCRIPTION",
    dropdownItems: NUMBER_MODE_ITEMS
  });
}

/** Register the intensity preset dropdown. */
function registerPreset() {
  Options.addOption({
    category: CategoryType.Mods,
    group: MAIN_GROUP,
    type: OptionType.Dropdown,
    id: "emigration-preset",
    initListener: (/** @type {*} */ info) => (info.selectedItemIndex = getPresetIndex()),
    updateListener: (/** @type {*} */ _i, /** @type {number} */ v) => applyPresetIndex(v),
    label: "LOC_EMIG_PRESET",
    description: "LOC_EMIG_PRESET_D",
    dropdownItems: PRESET_ITEMS
  });
}

/**
 * Register the "Advanced settings…" row. It's an Editor option: activating it pushes the
 * custom `emigration-advanced-editor` screen (the tunables sub-window) via ContextManager,
 * keeping the ~57 individual knobs off the main Mods tab.
 */
function registerAdvancedEditor() {
  Options.addOption({
    category: CategoryType.Mods,
    group: MAIN_GROUP,
    type: OptionType.Editor,
    id: "emigration-advanced",
    editorTagName: "emigration-advanced-editor",
    label: "LOC_OPTIONS_EMIGRATION_ADVANCED",
    description: "LOC_OPTIONS_EMIGRATION_ADVANCED_DESCRIPTION",
    caption: "LOC_OPTIONS_EMIGRATION_ADVANCED_OPEN"
  });
}

/** Register the dashboard data-source dropdown (Live vs Sample preview). */
function registerDataMode() {
  Options.addOption({
    category: CategoryType.Mods,
    group: MAIN_GROUP,
    type: OptionType.Dropdown,
    id: "emigration-data-mode",
    initListener: (/** @type {*} */ info) => (info.selectedItemIndex = getSampleData() ? 1 : 0),
    updateListener: (/** @type {*} */ _i, /** @type {number} */ v) => setSampleData(v === 1),
    label: "LOC_OPTIONS_EMIG_DATA",
    description: "LOC_OPTIONS_EMIG_DATA_DESCRIPTION",
    dropdownItems: DATA_MODE_ITEMS
  });
}

/** Register the timeline-detail dropdown (turns per migration snapshot, 1..5). */
function registerSnapshotInterval() {
  Options.addOption({
    category: CategoryType.Mods,
    group: MAIN_GROUP,
    type: OptionType.Dropdown,
    id: "emigration-snap-interval",
    initListener: (/** @type {*} */ info) => (info.selectedItemIndex = getSnapshotInterval() - 1),
    updateListener: (/** @type {*} */ _i, /** @type {number} */ v) => setSnapshotInterval(v + 1),
    label: "LOC_OPTIONS_EMIG_SNAP",
    description: "LOC_OPTIONS_EMIG_SNAP_DESCRIPTION",
    dropdownItems: SNAP_ITEMS
  });
}

/** Register the dock-button toggle (show/hide the standalone Emigration button on the in-game dock;
 * the full dashboard always also lives in the Demographics screen's Migration tab). */
function registerDockButton() {
  Options.addOption({
    category: CategoryType.Mods,
    group: MAIN_GROUP,
    type: OptionType.Checkbox,
    id: "emigration-dock-button",
    initListener: (/** @type {*} */ info) => (info.currentValue = getShowDockButton()),
    updateListener: (/** @type {*} */ _i, /** @type {*} */ v) => setShowDockButton(!!v),
    label: "LOC_OPTIONS_EMIG_DOCK",
    description: "LOC_OPTIONS_EMIG_DOCK_DESCRIPTION"
  });
}

/** Register the "minimize analytics" toggle: hide the heavy dashboard tabs (Network diagram + Causes
 * pies), keeping the simple numbers-first tabs and the Demographics graphs. Default off. */
function registerMinimizeAnalytics() {
  Options.addOption({
    category: CategoryType.Mods,
    group: MAIN_GROUP,
    type: OptionType.Checkbox,
    id: "emigration-minimize-analytics",
    initListener: (/** @type {*} */ info) => (info.currentValue = getMinimizeAnalytics()),
    updateListener: (/** @type {*} */ _i, /** @type {*} */ v) => setMinimizeAnalytics(!!v),
    label: "Emigration • simplify dashboard",
    description: "Hide the heavy migration analytics, the animated Network diagram and the Causes pie "
      + "charts, and keep the simple, numbers-first tabs: Net Migration, My Cities (with the per-city "
      + "migration meter), Policies, Notifications and the Guide, plus the Demographics graphs. Takes "
      + "effect next time you open the dashboard."
  });
}

/** Register the notifications on/off toggle. Maps the master notifyMode tunable: on = 1 (important),
 * off = 0 (silence all Emigration toasts and the world-news log). Verbose mode (2) is set from the
 * Advanced editor and reads back as "on" here. */
function registerNotifications() {
  Options.addOption({
    category: CategoryType.Mods,
    group: MAIN_GROUP,
    type: OptionType.Checkbox,
    id: "emigration-notifications",
    initListener: (/** @type {*} */ info) => (info.currentValue = getTunable("notifyMode") >= 1),
    updateListener: (/** @type {*} */ _i, /** @type {*} */ v) => setTunable("notifyMode", v ? 1 : 0),
    label: "Emigration • notifications",
    description: "Show Emigration's in-game notifications (the migration toasts and the world-news "
      + "log). Turn this off to silence all Emigration pop-ups. Notification detail can be tuned "
      + "further under Advanced settings."
  });
}

/** Register the analytics-visibility dropdown (Emigration's own, always-reliable unmet-civ control). */
function registerVisibility() {
  Options.addOption({
    category: CategoryType.Mods,
    group: MAIN_GROUP,
    type: OptionType.Dropdown,
    id: "emigration-visibility",
    initListener: (/** @type {*} */ info) => (info.selectedItemIndex = getVisibilityOverride()),
    updateListener: (/** @type {*} */ _i, /** @type {number} */ v) => setVisibilityOverride(v),
    label: "Emigration • analytics visibility",
    description: "Whether the Emigration tabs show civilizations you haven't met. "
      + "\"Follow Demographics setting\" mirrors the Demographics Spoilers option; the other two are "
      + "self-contained overrides that always apply to the Emigration tabs.",
    dropdownItems: VISIBILITY_ITEMS
  });
}

/** Register the refugee-dilemmas on/off toggle (the occasional narrative decision pop-up). Default
 * on; rare by design. Turning it off never affects the simulation, only the pop-ups. */
function registerDilemmas() {
  Options.addOption({
    category: CategoryType.Mods,
    group: MAIN_GROUP,
    type: OptionType.Checkbox,
    id: "emigration-dilemmas",
    initListener: (/** @type {*} */ info) => (info.currentValue = getDilemmasEnabled()),
    updateListener: (/** @type {*} */ _i, /** @type {*} */ v) => setDilemmasEnabled(!!v),
    label: "Emigration • refugee decisions",
    description: "Occasionally, when a great wave of refugees reaches your lands (a neighbor's "
      + "conquests, a plague), pause for a short decision about how to receive them. Rare by design. "
      + "Turn off to never see these pop-ups; the simulation is unaffected."
  });
}

/** Register the ethnic-integration toggle (newcomers drift toward the host identity over time).
 * Default on; drives the ethnicity lens. */
function registerIntegration() {
  Options.addOption({
    category: CategoryType.Mods,
    group: MAIN_GROUP,
    type: OptionType.Checkbox,
    id: "emigration-integration",
    initListener: (/** @type {*} */ info) => (info.currentValue = getIntegrationEnabled()),
    updateListener: (/** @type {*} */ _i, /** @type {*} */ v) => setIntegrationEnabled(!!v),
    label: "Emigration • ethnic integration",
    description: "Migrants gradually take on their host civilization's identity over time, unless war "
      + "with their homeland or unrest keeps them apart. Shapes the Ethnic Composition lens. On by "
      + "default; turn off to freeze each settlement's origin mix."
  });
}

/** Register the return-migration toggle (diasporas return home when the homeland recovers). Default
 * on; moves real population. */
function registerReturn() {
  Options.addOption({
    category: CategoryType.Mods,
    group: MAIN_GROUP,
    type: OptionType.Checkbox,
    id: "emigration-return",
    initListener: (/** @type {*} */ info) => (info.currentValue = getReturnEnabled()),
    updateListener: (/** @type {*} */ _i, /** @type {*} */ v) => setReturnEnabled(!!v),
    label: "Emigration • return migration",
    description: "When a homeland is at peace and prospering again, some of its people abroad set out "
      + "for home over time. On by default; turn off to keep diasporas where they settled."
  });
}

Options.addInitCallback(() => {
  registerNumberMode();
  registerPreset();
  registerDataMode();
  registerSnapshotInterval();
  registerDockButton();
  registerMinimizeAnalytics();
  registerNotifications();
  registerVisibility();
  registerIntegration();
  registerReturn();
  registerDilemmas();
  registerAdvancedEditor();
});
