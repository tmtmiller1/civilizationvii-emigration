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
import "/emigration/ui/options/mod-options.js"; // create the shared "Mods" category
import "/emigration/ui/options/emigration-advanced-editor.js"; // register the Advanced sub-window
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
  setShowDockButton
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

/** Register the dock-button toggle (show/hide the Emigration button on the in-game dock). */
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

Options.addInitCallback(() => {
  registerNumberMode();
  registerPreset();
  registerDataMode();
  registerSnapshotInterval();
  registerDockButton();
  registerAdvancedEditor();
});
