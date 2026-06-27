import assert from "node:assert/strict";

const store = {};
let throwOnGet = false;

globalThis.localStorage = {
  getItem(k) {
    if (throwOnGet) throw new Error("get blocked");
    return k in store ? store[k] : null;
  },
  setItem(k, v) {
    store[k] = String(v);
  },
  removeItem(k) {
    delete store[k];
  },
  clear() {
    for (const k of Object.keys(store)) delete store[k];
  }
};

const S = await import("/emigration/ui/emigration-settings.js");
const { CONFIG, CONFIG_DEFAULTS } = await import("/emigration/ui/emigration-config.js");

// number mode coercion + persistence
S.setNumberMode(999);
assert.equal(S.getNumberMode(), S.NumberMode.BOTH);
S.setNumberMode(S.NumberMode.CIV);
assert.equal(S.getNumberMode(), S.NumberMode.CIV);

// sample mode
S.setSampleData(true);
assert.equal(S.getSampleData(), true);
S.setSampleData(false);
assert.equal(S.getSampleData(), false);

// snapshot clamp branches
S.setSnapshotInterval(-2);
assert.equal(S.getSnapshotInterval(), 1);
S.setSnapshotInterval(5.4);
assert.equal(S.getSnapshotInterval(), 1);
S.setSnapshotInterval(3);
assert.equal(S.getSnapshotInterval(), 3);

// dock + dilemmas defaults and toggles
assert.equal(S.getShowDockButton(), true);
S.setShowDockButton(false);
assert.equal(S.getShowDockButton(), false);
assert.equal(S.getDilemmasEnabled(), true);
S.setDilemmasEnabled(false);
assert.equal(S.getDilemmasEnabled(), false);

// integration/return default fallback from config
CONFIG.integrationEnabled = false;
CONFIG.returnEnabled = false;
assert.equal(S.getIntegrationEnabled(), false);
assert.equal(S.getReturnEnabled(), false);
S.setIntegrationEnabled(true);
S.setReturnEnabled(true);
assert.equal(S.getIntegrationEnabled(), true);
assert.equal(S.getReturnEnabled(), true);

// visibility override clamp branches
S.setVisibilityOverride(1);
assert.equal(S.getVisibilityOverride(), 1);
S.setVisibilityOverride(2);
assert.equal(S.getVisibilityOverride(), 2);
S.setVisibilityOverride(123);
assert.equal(S.getVisibilityOverride(), 0);

// tunables default+set/apply branches
const firstKey = Object.keys(CONFIG_DEFAULTS)[0];
assert.equal(S.getTunable(firstKey), CONFIG_DEFAULTS[firstKey]);
S.setTunable(firstKey, 12345);
assert.equal(CONFIG[firstKey], 12345);
assert.equal(S.getTunable(firstKey), 12345);
assert.doesNotThrow(() => S.applyTunableOverrides());

// preset index branches
localStorage.setItem("modSettings", JSON.stringify({ emigration: { preset: 999 } }));
assert.equal(S.getPresetIndex(), 0);
localStorage.setItem("modSettings", JSON.stringify({ emigration: { preset: 0 } }));
assert.equal(S.getPresetIndex(), 0);

// apply preset no-profile and normal path
assert.doesNotThrow(() => S.applyPresetIndex(-1));
assert.doesNotThrow(() => S.applyPresetIndex(0));

// load-path parse catch branch
localStorage.setItem("modSettings", "{ bad json");
throwOnGet = false;
assert.equal(S.getSampleData(), false);

// _readForWrite catch branch (save should no-op and not throw)
throwOnGet = true;
assert.doesNotThrow(() => S.setSampleData(true));
throwOnGet = false;

delete globalThis.localStorage;

console.log("settings-branches-extra harness passed");
