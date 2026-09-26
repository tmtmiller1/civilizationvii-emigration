// emigration-options.js
//
// Registers the Emigration settings under the shared "Mods" tab of the Options screen, in both shell
// and game scopes: the simple dropdowns, sliders and toggles, plus an "Advanced settings…" row that
// opens the tunables sub-window (emigration-advanced-editor.js). Kept separate from
// emigration-settings.js so the gameplay loop never depends on the Options-screen chunk loading.

import { CategoryType, OptionType, Options } from "/core/ui/options/model-options.js";
import { CategoryData } from "/core/ui/options/options-helpers.js";
import { ADVANCED_CLOSED_EVENT } from "/emigration/ui/options/emigration-advanced-editor.js"; // registers the window

// Create the community-convention shared "Mods" Options-screen category (idempotent: the first mod
// to load this creates it, later mods reuse it). Lives here because the gameplay loop can't link the
// Options-screen modules this needs.
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
  setTunable,
  getGroupedSetting,
  setGroupedSetting,
  getCompositeSetting,
  setCompositeSetting
} from "/emigration/ui/emigration-settings.js";
import { PRESET_NAMES, COMPOSITE_SETTINGS } from "/emigration/ui/emigration-tunables.js";

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
  { label: "LOC_OPTIONS_EMIG_SNAP_1" },
  { label: "LOC_OPTIONS_EMIG_SNAP_2" },
  { label: "LOC_OPTIONS_EMIG_SNAP_3" },
  { label: "LOC_OPTIONS_EMIG_SNAP_4" },
  { label: "LOC_OPTIONS_EMIG_SNAP_5" }
];
const PRESET_ITEMS = PRESET_NAMES.map((n) => ({ label: "LOC_EMIG_PRESET_" + n.toUpperCase() }));
// Emigration's own analytics-visibility control for its dashboard tabs (0 follow Demographics,
// 1 hide unmet, 2 show all).
const VISIBILITY_ITEMS = [
  { label: "LOC_OPTIONS_EMIG_VISIBILITY_FOLLOW" },
  { label: "LOC_OPTIONS_EMIG_VISIBILITY_HIDE" },
  { label: "LOC_OPTIONS_EMIG_VISIBILITY_SHOWALL" }
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

/** @type {*} The preset dropdown's option info, so an inline edit can show it switching to Custom. */
let _presetInfo = null;

/** Register the intensity preset dropdown. */
function registerPreset() {
  _presetInfo = {
    category: CategoryType.Mods,
    group: MAIN_GROUP,
    type: OptionType.Dropdown,
    id: "emigration-preset",
    initListener: (/** @type {*} */ info) => (info.selectedItemIndex = getPresetIndex()),
    updateListener: (/** @type {*} */ _i, /** @type {number} */ v) => applyPresetIndex(v),
    label: "LOC_EMIG_PRESET",
    description: "LOC_EMIG_PRESET_D",
    dropdownItems: PRESET_ITEMS
  };
  Options.addOption(_presetInfo);
}

/** After edits in the Advanced settings window, show the preset as Custom if they took the player off it. */
function presetBecameCustom() {
  if (!_presetInfo) return;
  _presetInfo.selectedItemIndex = getPresetIndex();
  try {
    _presetInfo.forceRender?.();
  } catch (_) {
    /* the screen is not open */
  }
}

/**
 * Register the "Advanced settings…" row. It's an Editor option: activating it pushes the
 * custom `emigration-advanced-editor` screen (the tunables sub-window) via ContextManager,
 * keeping the 85 individual knobs off the main Mods tab.
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
    label: "LOC_OPTIONS_EMIG_MINIMIZE",
    description: "LOC_OPTIONS_EMIG_MINIMIZE_DESCRIPTION"
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
    label: "LOC_OPTIONS_EMIG_NOTIFICATIONS",
    description: "LOC_OPTIONS_EMIG_NOTIFICATIONS_DESCRIPTION"
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
    label: "LOC_OPTIONS_EMIG_VISIBILITY",
    description: "LOC_OPTIONS_EMIG_VISIBILITY_DESCRIPTION",
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
    label: "LOC_OPTIONS_EMIG_DILEMMAS",
    description: "LOC_OPTIONS_EMIG_DILEMMAS_DESCRIPTION"
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
    label: "LOC_OPTIONS_EMIG_ETHNIC",
    description: "LOC_OPTIONS_EMIG_ETHNIC_DESCRIPTION"
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
    label: "LOC_OPTIONS_EMIG_RETURN",
    description: "LOC_OPTIONS_EMIG_RETURN_DESCRIPTION"
  });
}

/** @type {Array<{info: *, read: () => boolean}>} Checkboxes that mirror an Advanced setting, redrawn when it closes. */
const _mirrors = [];

/**
 * Register a checkbox that mirrors one Advanced tunable: ticked when it holds `on`, and ticking or unticking
 * writes `on` or `off`. The Advanced window edits the same value, so these are redrawn when it closes.
 * @param {{id:string, key:string, on:*, off:*, label:string, description:string}} spec The option id, the
 *   tunable, the values for ticked and unticked, and the LOC keys.
 */
function registerTunableToggle(spec) {
  const { id, key, on, off, label, description } = spec;
  const read = () => getTunable(key) === on;
  const info = {
    category: CategoryType.Mods,
    group: MAIN_GROUP,
    type: OptionType.Checkbox,
    id,
    initListener: (/** @type {*} */ i) => (i.currentValue = read()),
    updateListener: (/** @type {*} */ _i, /** @type {*} */ v) => setTunable(key, v ? on : off),
    label,
    description
  };
  _mirrors.push({ info, read });
  Options.addOption(info);
}

/** Redraw the mirroring checkboxes after the Advanced window closes, in case it changed their settings. */
function refreshMirrors() {
  for (const { info, read } of _mirrors) {
    info.currentValue = read();
    try {
      info.forceRender?.();
    } catch (_) {
      /* the screen is not open */
    }
  }
}

/** @type {Map<string, *>} Registered slider option infos by grouped/composite setting name, for cross-refresh. */
const _sliders = new Map();
/** True while one slider is pushing values into others, so their change events do not echo back. */
let _syncing = false;

/**
 * Show a new value on an already-registered slider without treating it as a player edit. Setting the element's
 * value makes the slider fire its own change event, which would run that slider's listener again; the _syncing
 * guard makes that echo a no-op.
 * @param {string} name The setting the slider shows. @param {number} value The position to display.
 */
function showSlider(name, value) {
  const info = _sliders.get(name);
  if (!info) return;
  info.currentValue = value;
  info.formattedValue = value + "%";
  try {
    info.forceRender?.();
    if (info.sliderValue) info.sliderValue.textContent = info.formattedValue;
  } catch (_) {
    /* the Options screen is not open: the new value is picked up when it next renders */
  }
}

/**
 * After a child slider moves, redraw every composite slider it belongs to.
 * @param {string} child The grouped setting that moved.
 */
function refreshComposites(child) {
  for (const [composite, kids] of Object.entries(COMPOSITE_SETTINGS)) {
    if (kids.includes(child)) showSlider(composite, getCompositeSetting(composite));
  }
}

/**
 * Register a 0-100% slider on the Mods tab.
 * @param {{name:string, id:string, label:string, description:string}} spec The setting it shows (for
 *   cross-refresh), the option id, and its LOC keys.
 * @param {() => number} read Current position. @param {(n:number) => void} write Apply a new position.
 */
function registerSlider(spec, read, write) {
  const { name, id, label, description } = spec;
  const info = {
    category: CategoryType.Mods,
    group: MAIN_GROUP,
    type: OptionType.Slider,
    id,
    min: 0,
    max: 100,
    steps: 10,
    initListener: (/** @type {*} */ i) => {
      i.currentValue = read();
      i.formattedValue = i.currentValue + "%";
    },
    updateListener: (/** @type {*} */ i, /** @type {*} */ v) => {
      if (_syncing) return;
      const n = Math.round(Number(v));
      i.currentValue = n;
      i.formattedValue = n + "%";
      _syncing = true;
      try {
        write(n);
      } finally {
        _syncing = false;
      }
    },
    label,
    description
  };
  _sliders.set(name, info);
  Options.addOption(info);
}

/**
 * Register a grouped-setting slider: moving it writes every member tunable along the group's curve, then redraws
 * any overall slider it is part of.
 * @param {string} name The grouped setting (GROUPED_SETTINGS key). @param {string} id The option id.
 * @param {string} label LOC key. @param {string} description LOC key.
 */
function registerGroupedSlider(name, id, label, description) {
  registerSlider({ name, id, label, description }, () => getGroupedSetting(name), (n) => {
    setGroupedSetting(name, n);
    refreshComposites(name);
  });
}

/**
 * Register an overall slider made of several grouped sliders: it shows their average and moving it shifts each of
 * them by the same amount, redrawing them in place.
 * @param {string} name The composite (COMPOSITE_SETTINGS key). @param {string} id The option id.
 * @param {string} label LOC key. @param {string} description LOC key.
 */
function registerCompositeSlider(name, id, label, description) {
  registerSlider({ name, id, label, description }, () => getCompositeSetting(name), (n) => {
    const kids = setCompositeSetting(name, n);
    for (const [child, pos] of Object.entries(kids)) showSlider(child, pos);
    // The children may have clamped at an edge, so the overall value is re-read rather than assumed.
    showSlider(name, getCompositeSetting(name));
  });
}

/**
 * Register the decision pop-up checkboxes besides Refugee decisions, each switching the Advanced setting that
 * raises its pop-up. Unticked is the automatic choice: the city places newcomers itself (1), and enclaves are
 * recognized on their own everywhere (2).
 */
function registerDecisionToggles() {
  registerTunableToggle({ id: "emigration-ask-arrivals", key: "arrivalPlacement", on: 2, off: 1,
    label: "LOC_OPTIONS_EMIG_ASK_ARRIVALS", description: "LOC_OPTIONS_EMIG_ASK_ARRIVALS_DESCRIPTION" });
  registerTunableToggle({ id: "emigration-callhome-offer", key: "callHomeOfferWhenCalm", on: true, off: false,
    label: "LOC_OPTIONS_EMIG_CALLHOME_OFFER", description: "LOC_OPTIONS_EMIG_CALLHOME_OFFER_DESCRIPTION" });
  registerTunableToggle({ id: "emigration-ask-enclaves", key: "quarterRecognition", on: 0, off: 2,
    label: "LOC_OPTIONS_EMIG_ASK_ENCLAVES", description: "LOC_OPTIONS_EMIG_ASK_ENCLAVES_DESCRIPTION" });
}

/** Redraw the preset dropdown whenever the Advanced settings window closes (registered once). */
let _watching = false;
function watchAdvancedWindow() {
  if (_watching || typeof window === "undefined") return;
  _watching = true;
  window.addEventListener(ADVANCED_CLOSED_EVENT, presetBecameCustom);
  window.addEventListener(ADVANCED_CLOSED_EVENT, refreshMirrors);
}

Options.addInitCallback(() => {
  registerNumberMode();
  registerPreset();
  registerGroupedSlider("crossCivMovement", "emigration-crossciv-movement", "LOC_OPTIONS_EMIG_CROSSCIV", "LOC_OPTIONS_EMIG_CROSSCIV_D");
  // Refugees from conflict: one overall slider, then the two it is made of.
  registerCompositeSlider("conflictRefugees", "emigration-conflict-refugees", "LOC_OPTIONS_EMIG_CONFLICTREF",
    "LOC_OPTIONS_EMIG_CONFLICTREF_D");
  registerGroupedSlider("majorWarRefugees", "emigration-major-war-refugees", "LOC_OPTIONS_EMIG_MAJORWAR",
    "LOC_OPTIONS_EMIG_MAJORWAR_D");
  registerGroupedSlider("minorRaidRefugees", "emigration-minor-raid-refugees", "LOC_OPTIONS_EMIG_MINORRAID",
    "LOC_OPTIONS_EMIG_MINORRAID_D");
  registerDataMode();
  registerSnapshotInterval();
  registerDockButton();
  registerMinimizeAnalytics();
  registerNotifications();
  registerVisibility();
  registerIntegration();
  registerReturn();
  registerDilemmas();
  registerDecisionToggles();
  // Every individual setting, in its own window: the last row of the Emigration group.
  registerAdvancedEditor();
  watchAdvancedWindow();
});
