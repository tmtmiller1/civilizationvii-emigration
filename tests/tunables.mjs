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

const { getTunable, setTunable, applyTunableOverrides, applyPresetIndex, getPresetIndex } =
  await import("/emigration/ui/emigration-settings.js");
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

testDefaultBeforeOverride();
testSetPersistsAndMutatesConfig();
testApplyOverridesPushesSavedIntoConfig();
testPresetAppliesProfile();
testCustomPresetLeavesValuesUntouched();

console.log("tunables harness passed");
