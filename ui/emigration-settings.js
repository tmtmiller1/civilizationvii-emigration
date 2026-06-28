// emigration-settings.js
//
// Runtime bridge for the migration-count display preference. Reads/writes the
// "numberMode" choice through the cascade-safe ModOptions store and exposes it
// to the rest of the mod WITHOUT importing the Options-screen UI - so the core
// gameplay loop never depends on the options chunk loading. The Options page
// (emigration-options.js) is the writer; emigration-main.js is the reader.

import { CONFIG, CONFIG_DEFAULTS } from "/emigration/ui/emigration-config.js";
import { TUNABLES, PRESETS, PRESET_NAMES } from "/emigration/ui/emigration-tunables.js";

// Cascade-safe per-mod / per-option settings store (single shared "modSettings" localStorage key).
// Inlined here (rather than imported from a standalone mod-options.js) on purpose: GameFace's module
// linker does not expose the exports of a UIScript that has no `import` statements - it treats such a
// file as a classic script, so `import { ModOptions } from ".../mod-options.js"` failed with "does
// not provide an export named 'ModOptions'". emigration-settings.js always has imports, so the store
// lives here and links reliably in every context (shell, in-game, options).
class ModOptionsStore {
  /**
   * Read the shared `modSettings` object in preparation for a WRITE, guaranteeing we never destroy
   * another mod's slice. `modSettings` is multi-tenant (`{ "<modId>": {...}, ... }`); the danger is
   * that Coherent's localStorage can return a transient empty/`null` read even when data exists, and
   * another mod can leave a value that isn't valid JSON. Treating either as "empty" and writing back
   * only our slice would wipe every sibling — the cross-mod "cannibalized settings" bug. So:
   *   - re-read once on an empty first read (a populated re-read proves the first was flaky);
   *   - REFUSE to write (`safe:false`) when the current value is present but unparseable / non-object,
   *     since siblings exist that we can't round-trip;
   *   - only a genuinely-absent value yields a fresh `{}`.
   * NEVER reset `modSettings` to `{}` — that is itself a sibling-wiping write.
   * @returns {{root: Record<string, *>, safe: boolean}}
   */
  _readForWrite() {
    let raw = null;
    try {
      raw = localStorage.getItem("modSettings");
      if (!raw) raw = localStorage.getItem("modSettings"); // defeat a flaky empty read
    } catch (_) {
      return { root: {}, safe: false };
    }
    if (!raw) return { root: {}, safe: true };
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return { root: {}, safe: false }; // unparseable siblings — do not overwrite
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { root: {}, safe: false };
    }
    return { root: parsed, safe: true };
  }

  /**
   * Persist a value, only ever adding/updating our OWN slice and never dropping a sibling's.
   * @param {string} modID Owning mod id. @param {string} optionID Option id. @param {*} value Value.
   */
  save(modID, optionID, value) {
    try {
      const { root, safe } = this._readForWrite();
      if (!safe) return; // current shared value can't be round-tripped — keep siblings intact
      (root[modID] ??= {})[optionID] = value;
      localStorage.setItem("modSettings", JSON.stringify(root));
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * Read a value.
   * @param {string} modID Owning mod id. @param {string} optionID Option id.
   * @returns {*} The stored value, or null if absent.
   */
  load(modID, optionID) {
    try {
      const raw = localStorage.getItem("modSettings");
      if (!raw) return null;
      const all = JSON.parse(raw);
      return all?.[modID]?.[optionID] ?? null;
    } catch (_) {
      return null;
    }
  }
}

const ModOptions = new ModOptionsStore();

const MOD_ID = "emigration";
const OPT_NUMBER_MODE = "numberMode";
const OPT_PRESET = "preset";
const OPT_SAMPLE = "sampleData";
const OPT_SNAP = "snapshotInterval";
const OPT_DOCK = "showDockButton";
const OPT_VISIBILITY = "visibilityOverride";
const OPT_DILEMMA = "refugeeDilemmas";
const OPT_INTEGRATION = "ethnicIntegration";
const OPT_RETURN = "returnMigration";
const OPT_MINIMIZE = "minimizeAnalytics";
const SNAP_DEFAULT = 1; // turns per migration-timeline snapshot (user-adjustable 1..5; 1 = every turn)

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
 * Timeline-detail setting: turns between migration-flow snapshots (1 = finest). Default 1 (every
 * turn), the per-pass compute is the same at any interval, and the saved frame count is hard-capped
 * (MAX_FLOW_SNAPSHOTS), so the finest setting stays bounded; a coarser interval only spans more turns
 * before the timeline decimates.
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

/** @type {boolean|null} */
let _dock = null;

/** @type {boolean|null} */
let _minimize = null;

/**
 * Whether the migration dashboard hides its heavy analytics tabs (the animated Network diagram and the
 * Causes pie charts), leaving the simple, numbers-first tabs — Net Migration table, My Cities, Policies,
 * Notifications, Guide — plus the Demographics line graphs. Default OFF (everything shown). Re-read each
 * time the dashboard rebuilds its tab list, so toggling it takes effect on the next open.
 * @returns {boolean} True when analytics tabs are hidden.
 */
export function getMinimizeAnalytics() {
  if (_minimize == null) {
    const v = ModOptions.load(MOD_ID, OPT_MINIMIZE);
    _minimize = v == null ? false : v === 1; // default OFF; persisted as 1/0
  }
  return _minimize;
}

/**
 * Set + persist whether the dashboard hides its heavy analytics tabs.
 * @param {boolean} on Whether to minimize analytics.
 */
export function setMinimizeAnalytics(on) {
  _minimize = !!on;
  ModOptions.save(MOD_ID, OPT_MINIMIZE, _minimize ? 1 : 0);
}

/**
 * Whether the Emigration button appears on the in-game subsystem dock. Default true. Turn it off to
 * reach the dashboard only through the Demographics screen's Migration tab. Read once at dock attach
 * (a changed value applies on the next reload / dock rebuild).
 * @returns {boolean} True when the dock button should be shown.
 */
export function getShowDockButton() {
  if (_dock == null) {
    const v = ModOptions.load(MOD_ID, OPT_DOCK);
    _dock = v == null ? true : v === 1; // default ON; persisted as 1/0
  }
  return _dock;
}

/**
 * Set + persist whether the dock button is shown.
 * @param {boolean} on Whether to show the dock button.
 */
export function setShowDockButton(on) {
  _dock = !!on;
  ModOptions.save(MOD_ID, OPT_DOCK, _dock ? 1 : 0);
}

/** @type {boolean|null} */
let _dilemma = null;

/**
 * Whether the occasional refugee-DECISION pop-up is enabled. Default ON. When off, the rare narrative
 * dilemmas never appear (the rest of the mod is unaffected). The simulation never depends on this.
 * @returns {boolean} True when refugee dilemmas may appear.
 */
export function getDilemmasEnabled() {
  if (_dilemma == null) {
    const v = ModOptions.load(MOD_ID, OPT_DILEMMA);
    _dilemma = v == null ? true : v === 1; // default ON; persisted as 1/0
  }
  return _dilemma;
}

/**
 * Set + persist whether refugee dilemmas are enabled.
 * @param {boolean} on Whether dilemmas may appear.
 */
export function setDilemmasEnabled(on) {
  _dilemma = !!on;
  ModOptions.save(MOD_ID, OPT_DILEMMA, _dilemma ? 1 : 0);
}

/** @type {boolean|null} */
let _integration = null;

/**
 * Whether ethnic INTEGRATION (newcomers drifting toward the host identity over time) is enabled.
 * Default ON. Falls back to the CONFIG default when there's no saved preference.
 * @returns {boolean} True when integration runs.
 */
export function getIntegrationEnabled() {
  if (_integration == null) {
    const v = ModOptions.load(MOD_ID, OPT_INTEGRATION);
    _integration = v == null ? CONFIG.integrationEnabled !== false : v === 1;
  }
  return _integration;
}

/**
 * Set + persist whether ethnic integration is enabled.
 * @param {boolean} on Whether integration runs.
 */
export function setIntegrationEnabled(on) {
  _integration = !!on;
  ModOptions.save(MOD_ID, OPT_INTEGRATION, _integration ? 1 : 0);
}

/** @type {boolean|null} */
let _return = null;

/**
 * Whether RETURN migration (diasporas going home when the homeland recovers) is enabled. Default ON.
 * Falls back to the CONFIG default when there's no saved preference.
 * @returns {boolean} True when return migration runs.
 */
export function getReturnEnabled() {
  if (_return == null) {
    const v = ModOptions.load(MOD_ID, OPT_RETURN);
    _return = v == null ? CONFIG.returnEnabled !== false : v === 1;
  }
  return _return;
}

/**
 * Set + persist whether return migration is enabled.
 * @param {boolean} on Whether return migration runs.
 */
export function setReturnEnabled(on) {
  _return = !!on;
  ModOptions.save(MOD_ID, OPT_RETURN, _return ? 1 : 0);
}

/** @type {number|null} */
let _vis = null;

/**
 * Emigration's OWN analytics-visibility override for its dashboard tabs (cached in-memory so it's
 * reliable even though the Coherent UI wipes the shared localStorage). 0 = follow the Demographics
 * "Analytics visibility" setting (default); 1 = always hide unmet civs; 2 = always show all civs.
 * Exists because the cross-mod read of the Demographics setting is unreliable, so this gives a
 * self-contained control that always works for the Emigration tabs.
 * @returns {number} 0 (auto), 1 (hide unmet), or 2 (show all).
 */
export function getVisibilityOverride() {
  if (_vis == null) {
    const v = ModOptions.load(MOD_ID, OPT_VISIBILITY);
    _vis = v === 1 || v === 2 ? v : 0;
  }
  return _vis || 0;
}

/**
 * Set + persist the Emigration visibility override.
 * @param {number} v 0 (auto), 1 (hide unmet), or 2 (show all).
 */
export function setVisibilityOverride(v) {
  _vis = v === 1 || v === 2 ? v : 0;
  ModOptions.save(MOD_ID, OPT_VISIBILITY, _vis);
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

// Every CONFIG key the player can change: the advanced tunables PLUS any key a preset writes (some
// preset keys — e.g. movesPerSiege — aren't individually exposed as tunables, but a preset still sets
// them, so they must be restored here too or they'd silently revert to default on the next re-apply).
const OVERRIDE_KEYS = [...new Set([
  ...TUNABLES.map((t) => t.key),
  ...Object.values(PRESETS).flatMap((p) => Object.keys(p))
])];

/**
 * Push every saved tunable / preset override into the live CONFIG. Called at boot AND at the start of
 * every pass (emigration-main), so a preset or tunable changed mid-game in the Options screen — which
 * runs in a separate isolate and can only persist — takes effect on the next pass instead of next load.
 */
export function applyTunableOverrides() {
  for (const key of OVERRIDE_KEYS) CFG[key] = getTunable(key);
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
