import assert from "node:assert/strict";

// In-memory localStorage so the cascade-safe ModOptions store can persist.
globalThis.localStorage = (() => {
  let store = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    }
  };
})();

const {
  getTunable, setTunable, applyTunableOverrides, applyPresetIndex, getPresetIndex,
  resetTunable, resetAllTunables, isTunableModified, markPresetCustom
} = await import("/emigration/ui/emigration-settings.js");
const { CONFIG, CONFIG_DEFAULTS } = await import("/emigration/ui/emigration-config.js");
const { PRESETS } = await import("/emigration/ui/emigration-tunables.js");

function testDefaultBeforeOverride() {
  // With nothing saved, a tunable reads its pristine default.
  assert.equal(getTunable("emigrationBar"), CONFIG_DEFAULTS.emigrationBar);
}

function testSetPersistsAndMutatesConfig() {
  setTunable("emigrationBar", 18);
  assert.equal(getTunable("emigrationBar"), 18); // persisted
  assert.equal(CONFIG.emigrationBar, 18); // live CONFIG updated immediately
}

function testApplyOverridesPushesSavedIntoConfig() {
  CONFIG.emigrationBar = 999; // simulate a fresh module load with stale CONFIG
  applyTunableOverrides();
  assert.equal(CONFIG.emigrationBar, 18); // saved override restored
  assert.equal(CONFIG.cooldownTurns, CONFIG_DEFAULTS.cooldownTurns); // unsaved → default
}

function testPresetAppliesProfile() {
  applyPresetIndex(3); // PRESET_NAMES = [custom, low, medium, high] → "high"
  assert.equal(getPresetIndex(), 3);
  for (const [k, v] of Object.entries(PRESETS.high)) {
    assert.equal(CONFIG[k], v); // live CONFIG matches the profile
    assert.equal(getTunable(k), v); // and it persisted
  }
}

function testCustomPresetLeavesValuesUntouched() {
  setTunable("fleeFactor", 15);
  applyPresetIndex(0); // "custom" → applies no profile
  assert.equal(getTunable("fleeFactor"), 15);
  assert.equal(getPresetIndex(), 0);
}

function testResetAndModified() {
  setTunable("emigrationBar", 18);
  assert.equal(isTunableModified("emigrationBar"), true, "changed knob reads as modified");
  resetTunable("emigrationBar");
  assert.equal(getTunable("emigrationBar"), CONFIG_DEFAULTS.emigrationBar, "reset restores the default");
  assert.equal(CONFIG.emigrationBar, CONFIG_DEFAULTS.emigrationBar, "reset restores live CONFIG");
  assert.equal(isTunableModified("emigrationBar"), false, "a reset knob is no longer modified");
}

function testResetAll() {
  setTunable("emigrationBar", 12);
  setTunable("cooldownTurns", 2);
  resetAllTunables();
  assert.equal(getTunable("emigrationBar"), CONFIG_DEFAULTS.emigrationBar, "reset-all clears emigrationBar");
  assert.equal(getTunable("cooldownTurns"), CONFIG_DEFAULTS.cooldownTurns, "reset-all clears cooldownTurns");
}

function testMarkPresetCustom() {
  applyPresetIndex(2); // medium
  assert.equal(getPresetIndex(), 2);
  markPresetCustom(); // hand-edit signal
  assert.equal(getPresetIndex(), 0, "editing a value flips the preset to custom");
}

function testGainCapTunableExposed() {
  // The symmetric inbound cap is a real tunable + preset knob.
  assert.equal(typeof CONFIG_DEFAULTS.maxGainPerCityPerTurn, "number");
  for (const name of ["low", "medium", "high"]) {
    assert.equal(typeof PRESETS[name].maxGainPerCityPerTurn, "number", name + " preset sets the gain cap");
  }
}

testDefaultBeforeOverride();
testSetPersistsAndMutatesConfig();
testApplyOverridesPushesSavedIntoConfig();
testPresetAppliesProfile();
testCustomPresetLeavesValuesUntouched();
testResetAndModified();
testResetAll();
testMarkPresetCustom();
testGainCapTunableExposed();

console.log("tunables harness passed");
