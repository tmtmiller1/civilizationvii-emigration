// emigration-settings.js
//
// Runtime bridge for the migration-count display preference. Reads/writes the
// "numberMode" choice through the cascade-safe ModOptions store and exposes it
// to the rest of the mod WITHOUT importing the Options-screen UI - so the core
// gameplay loop never depends on the options chunk loading. The Options page
// (emigration-options.js) is the writer; emigration-main.js is the reader.

import ModOptions from "/emigration/ui/options/mod-options.js";
import { CONFIG, CONFIG_DEFAULTS } from "/emigration/ui/emigration-config.js";
import { TUNABLES, PRESETS, PRESET_NAMES } from "/emigration/ui/emigration-tunables.js";

const MOD_ID = "emigration";
const OPT_NUMBER_MODE = "numberMode";
const OPT_PRESET = "preset";
const OPT_SAMPLE = "sampleData";
const OPT_SNAP = "snapshotInterval";
const SNAP_DEFAULT = 3; // turns per migration-timeline snapshot (user-adjustable 1..5)

// String-keyed views over the typed config objects (same references), so the
// generic tunable code can index them by arbitrary CONFIG key.
const CFG = /** @type {Record<string, *>} */ (CONFIG);
const CFG_DEF = /** @type {Record<string, *>} */ (CONFIG_DEFAULTS);

// How migration counts are presented. A two-way toggle: Civ Pop (raw pop-points) or Scaled Pop
// (historical people). BOTH is retained only so older saved values coerce cleanly to Scaled.
export const NumberMode = Object.freeze({
  BOTH: 0, // legacy "1 point (12 thousand people)" , coerced to HISTORICAL on read
  CIV: 1, // "1 population point"
  HISTORICAL: 2 // "12 thousand people" (Scaled Pop)
});

/** @type {number|null} */
let _mode = null;

/**
 * The current display mode (lazily loaded). Civ Pop or Scaled Pop; a legacy BOTH coerces to Scaled.
 * Default Scaled Pop.
 * @returns {number} A NumberMode value (CIV or HISTORICAL).
 */
export function getNumberMode() {
  if (_mode == null) {
    const v = ModOptions.load(MOD_ID, OPT_NUMBER_MODE);
    _mode = v === NumberMode.CIV ? NumberMode.CIV : NumberMode.HISTORICAL;
  }
  return _mode;
}

/**
 * Set + persist the display mode.
 * @param {number} mode A NumberMode value.
 */
export function setNumberMode(mode) {
  _mode = typeof mode === "number" && mode >= 0 && mode <= 2 ? mode : NumberMode.BOTH;
  ModOptions.save(MOD_ID, OPT_NUMBER_MODE, _mode);
}

/** @type {boolean|null} */
let _sample = null;

/**
 * Whether the dashboard should render synthetic SAMPLE data (preview mode). Default false (live).
 * @returns {boolean} True when sample mode is on.
 */
export function getSampleData() {
  if (_sample == null) _sample = ModOptions.load(MOD_ID, OPT_SAMPLE) === 1;
  return _sample;
}

/**
 * Set + persist the sample-data preference.
 * @param {boolean} on Whether to show sample data.
 */
export function setSampleData(on) {
  _sample = !!on;
  ModOptions.save(MOD_ID, OPT_SAMPLE, _sample ? 1 : 0);
}

/** @type {number|null} */
let _snap = null;

/**
 * Clamp a snapshot interval to 1..5 turns (defaulting when invalid).
 * @param {*} n Candidate.
 * @returns {number} Interval in [1,5].
 */
function clampSnap(n) {
  return typeof n === "number" && n >= 1 && n <= 5 ? Math.round(n) : SNAP_DEFAULT;
}

/**
 * Timeline-detail setting: turns between migration-flow snapshots (1 = finest). Default 3.
 * @returns {number} Interval in [1,5].
 */
export function getSnapshotInterval() {
  if (_snap == null) _snap = clampSnap(ModOptions.load(MOD_ID, OPT_SNAP));
  return _snap;
}

/**
 * Set + persist the timeline-detail setting (turns per snapshot).
 * @param {number} n Interval (clamped to 1..5).
 */
export function setSnapshotInterval(n) {
  _snap = clampSnap(n);
  ModOptions.save(MOD_ID, OPT_SNAP, _snap);
}

// ── Tunables (exposed CONFIG knobs) ───────────────────────────────────────

/**
 * The current value of a tunable: its saved override, else the pristine default.
 * @param {string} key A CONFIG key.
 * @returns {*} The value.
 */
export function getTunable(key) {
  const v = ModOptions.load(MOD_ID, "t_" + key);
  return v == null ? CFG_DEF[key] : v;
}

/**
 * Set + persist a tunable and apply it to the live CONFIG immediately.
 * @param {string} key A CONFIG key.
 * @param {*} value The new value.
 */
export function setTunable(key, value) {
  ModOptions.save(MOD_ID, "t_" + key, value);
  CFG[key] = value;
}

/**
 * Push every saved tunable override into the live CONFIG. Call once at boot,
 * before the first pass, so a loaded game reflects the player's settings.
 */
export function applyTunableOverrides() {
  for (const t of TUNABLES) CFG[t.key] = getTunable(t.key);
}

/**
 * The saved preset index (0 = "custom"; see PRESET_NAMES).
 * @returns {number} The index.
 */
export function getPresetIndex() {
  const v = ModOptions.load(MOD_ID, OPT_PRESET);
  return typeof v === "number" && v >= 0 && v < PRESET_NAMES.length ? v : 0;
}

/**
 * Apply a preset by index: persist the selection and write the profile's values
 * into the tunables (and live CONFIG). "custom" applies nothing - it leaves the
 * individual/advanced values untouched.
 * @param {number} index A PRESET_NAMES index.
 */
export function applyPresetIndex(index) {
  ModOptions.save(MOD_ID, OPT_PRESET, index);
  const profile = PRESETS[PRESET_NAMES[index]];
  if (!profile) return;
  for (const key of Object.keys(profile)) setTunable(key, profile[key]);
}
