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

// Grouped settings: one slider moves several tunables along a curve; 50 is the shipped defaults (the behaviour
// measured at scale in mod tests 90 to 93), 100 is free movement between civilizations, positions between anchors
// interpolate, and setting a position writes every member tunable.
{
  const { GROUPED_SETTINGS, groupedValues } = await import("/emigration/ui/emigration-tunables.js");
  const { getGroupedSetting, setGroupedSetting } = await import("/emigration/ui/emigration-settings.js");
  for (const [name, g] of Object.entries(GROUPED_SETTINGS)) {
    const mid = g.anchors.find((a) => a.at === 50);
    assert.ok(mid, name + " has a 50 anchor");
    for (const [k, v] of Object.entries(mid.values)) assert.equal(CONFIG_DEFAULTS[k], v, name + " at 50 equals the default " + k);
    assert.equal(CONFIG_DEFAULTS[name], 50, name + " defaults to 50");
  }
  assert.deepEqual(groupedValues("crossCivMovement", 100),
    { poachBlock: 12, crisisEscapeBonus: 14, antiDrainWeight: 0, crisisInternalBonus: 0 });
  assert.deepEqual(groupedValues("crossCivMovement", 75),
    { poachBlock: 21, crisisEscapeBonus: 7, antiDrainWeight: 12, crisisInternalBonus: 12 });
  assert.deepEqual(groupedValues("crossCivMovement", -10), groupedValues("crossCivMovement", 0), "clamped below 0");
  assert.deepEqual(groupedValues("nope", 50), {}, "unknown group");
  assert.equal(getGroupedSetting("crossCivMovement"), 50, "unsaved slider reads its default");
  setGroupedSetting("crossCivMovement", 100);
  assert.equal(getGroupedSetting("crossCivMovement"), 100);
  assert.equal(getTunable("poachBlock"), 12, "the slider wrote poachBlock");
  assert.equal(CONFIG.crisisEscapeBonus, 14, "and the live CONFIG");
  assert.equal(CONFIG.antiDrainWeight, 0);
  setGroupedSetting("crossCivMovement", 50);
  assert.equal(CONFIG.poachBlock, 30, "back to the middle: the settled cross-civ friction");
  assert.equal(CONFIG.crisisInternalBonus, 24, "and the homeland preference the middle ships with");

  // Refugees from minor-power raids: 50 is the balance measured in mod test 118, 100 scores a raid exactly like a
  // war with a major civilization, 0 lets raids add no pressure. Its members are small fractions, so it keeps two
  // decimals -- rounding to one would turn the 0.08 floor into 0.1 and the middle would no longer be the default.
  assert.deepEqual(groupedValues("minorRaidRefugees", 50), { minorViolenceScale: 0.4, minorSiegeBesiegedFloor: 0.08 });
  assert.deepEqual(groupedValues("minorRaidRefugees", 100),
    { minorViolenceScale: 1, minorSiegeBesiegedFloor: CONFIG_DEFAULTS.siegeBesiegedFloor },
    "100 is exactly war scoring: no scaling and the ordinary besieged floor");
  assert.deepEqual(groupedValues("minorRaidRefugees", 0), { minorViolenceScale: 0, minorSiegeBesiegedFloor: 0 });
  assert.deepEqual(groupedValues("minorRaidRefugees", 75), { minorViolenceScale: 0.7, minorSiegeBesiegedFloor: 0.19 });
  assert.deepEqual(groupedValues("minorRaidRefugees", 25), { minorViolenceScale: 0.2, minorSiegeBesiegedFloor: 0.04 });
  for (let p = 0; p <= 100; p += 10) {
    const v = groupedValues("minorRaidRefugees", p);
    assert.ok(v.minorViolenceScale >= 0 && v.minorViolenceScale <= 1, "scale stays within 0..1 at " + p);
  }
  assert.equal(getGroupedSetting("minorRaidRefugees"), 50, "unsaved raid slider reads its default");
  setGroupedSetting("minorRaidRefugees", 100);
  assert.equal(CONFIG.minorViolenceScale, 1, "the raid slider wrote the live scale");
  assert.equal(getTunable("minorSiegeBesiegedFloor"), 0.3, "and persisted the floor");
  setGroupedSetting("minorRaidRefugees", 50);
  assert.equal(CONFIG.minorViolenceScale, 0.4);
  assert.equal(CONFIG.minorSiegeBesiegedFloor, 0.08, "back to the measured default");

  // Refugees from major-power wars: 50 is the war balance the mod has always shipped, 100 doubles it, 0 removes it.
  assert.deepEqual(groupedValues("majorWarRefugees", 50), { majorViolenceScale: 1, siegeBesiegedFloor: 0.3 });
  assert.deepEqual(groupedValues("majorWarRefugees", 100), { majorViolenceScale: 2, siegeBesiegedFloor: 0.6 });
  assert.deepEqual(groupedValues("majorWarRefugees", 0), { majorViolenceScale: 0, siegeBesiegedFloor: 0 });
}

// The overall conflict-refugees slider: shows the average of its children and shifts them all by the same amount,
// keeping the gap a player set between them wherever the 0-100 edges allow.
{
  const { COMPOSITE_SETTINGS, GROUPED_SETTINGS, compositePosition, compositeShift } =
    await import("/emigration/ui/emigration-tunables.js");
  const { getCompositeSetting, setCompositeSetting, getGroupedSetting } = await import("/emigration/ui/emigration-settings.js");
  for (const [name, kids] of Object.entries(COMPOSITE_SETTINGS)) {
    for (const k of kids) assert.ok(GROUPED_SETTINGS[k], name + " child " + k + " is a grouped setting");
  }
  assert.equal(compositePosition([30, 70]), 50, "average");
  assert.equal(compositePosition([]), 50, "no children reads as the middle");
  assert.deepEqual(compositeShift([30, 70], 60), [40, 80], "both shift by the same amount");
  assert.deepEqual(compositeShift([30, 90], 80), [50, 100], "clamped at 100; the other still moves");
  assert.deepEqual(compositeShift([10, 40], 0), [0, 15], "clamped at 0");
  assert.deepEqual(compositeShift([50, 50], 150), [100, 100], "target is clamped too");
  assert.equal(getCompositeSetting("conflictRefugees"), 50, "defaults to the middle");
  const moved = setCompositeSetting("conflictRefugees", 20);
  assert.deepEqual(moved, { majorWarRefugees: 20, minorRaidRefugees: 20 });
  assert.equal(getGroupedSetting("majorWarRefugees"), 20, "the child position is saved");
  assert.ok(Math.abs(CONFIG.majorViolenceScale - 0.4) < 1e-9, "and its tunables written (20 -> 0.4)");
  setCompositeSetting("conflictRefugees", 50);
  assert.equal(CONFIG.majorViolenceScale, 1, "back to defaults");
  assert.equal(CONFIG.minorViolenceScale, 0.4);
}

// Every tunable belongs to a group the Advanced editor knows how to title. An unknown group still renders, but
// under the raw key LOC_OPTIONS_GROUP_<GROUP>, which no locale defines: the minor-power raid settings sat at
// the bottom under exactly such a header ("war") until this was checked.
{
  const { TUNABLES, ADVANCED_GROUPS } = await import("/emigration/ui/emigration-tunables.js");
  const known = new Set(ADVANCED_GROUPS.map((g) => g.key));
  assert.ok(known.size >= 5, "read the shared section list");
  const orphans = TUNABLES.filter((t) => !known.has(t.group)).map((t) => t.key + ":" + t.group);
  assert.deepEqual(orphans, [], "every tunable is in a titled Advanced-editor group");
}

// Every titled group sits in exactly one collapsible section of the Advanced window, so no group is drawn twice
// or dropped from the window.
{
  const { ADVANCED_GROUPS, ADVANCED_SECTIONS } = await import("/emigration/ui/emigration-tunables.js");
  const placed = ADVANCED_SECTIONS.flatMap((s) => s.groups);
  assert.equal(new Set(placed).size, placed.length, "no group is in two sections");
  assert.deepEqual([...placed].sort(), ADVANCED_GROUPS.map((g) => g.key).sort(), "every group is in a section");
}

// Labels and values, as the player reads them. A section heading already names the topic and the dropdown shows
// the unit, so a label repeats neither: no "War: " style prefix, no "(%)", "(turns)" or "(0 = off)". Values carry
// their unit ("55%", "×1.5", "3 turns") or a word ("Off", "Instant") instead of a bare number.
{
  const fs = await import("node:fs");
  const { TUNABLES, tunableValueText } = await import("/emigration/ui/emigration-tunables.js");
  const xml = fs.readFileSync("text/en_us/ModText.xml", "utf8");
  const text = new Map([...xml.matchAll(/Tag="(LOC_[A-Z0-9_]+)"><Text>([^<]*)<\/Text>/g)].map((m) => [m[1], m[2]]));
  const PREFIX = /^(Pacing|Scope|Borders|Prosperity weight|Happiness|Overcrowding|War|War \(siege\)|Disasters|Geography|Crisis|Integration|Cost|Departures|Arrivals|Enclaves|Call home|Outlet|Notifications|Diversity ranking|Per-city readout|Diagnostics): /;
  for (const t of TUNABLES) {
    const label = text.get(t.label);
    assert.ok(label, t.key + " has English label text");
    assert.ok(!PREFIX.test(label), `${t.key}: label repeats its section as a prefix ("${label}")`);
    assert.ok(!/\((%|turns?|0 = off|1 = off|0 = instant)\)/i.test(label), `${t.key}: label carries a unit or value note ("${label}")`);
  }
  const tv = (/** @type {string} */ k, /** @type {number} */ v) => tunableValueText(TUNABLES.find((t) => t.key === k), v);
  assert.equal(tv("violenceDecay", 0.55), "55%", "a fraction reads as a percentage");
  assert.equal(tv("violencePerPoint", 12), "12%", "an existing percentage keeps its number");
  assert.equal(tv("openBordersOpenness", 1.5), "×1.5", "a multiplier reads with ×");
  assert.equal(tv("majorViolenceScale", 0), "LOC_EMIG_CHOICE_OFF", "0 on an off-able setting is a word, not a number");
  assert.equal(tv("transitLagTurns", 0), "LOC_EMIG_CHOICE_INSTANT");
  assert.equal(tv("turnInterval", 1), "LOC_EMIG_CHOICE_EVERY_TURN");
  assert.equal(tv("disasterLossCapPct", 1), "LOC_EMIG_CHOICE_UNCAPPED", "named choices still win");
  assert.equal(tv("antiDrainThreshold", 0.8), "80%");
  // Every value of every setting produces text, and no percentage or multiplier setting shows a bare number.
  for (const t of TUNABLES) {
    for (const v of t.values || []) {
      const out = tunableValueText(t, v);
      assert.ok(typeof out === "string" && out.length > 0, t.key + " value " + v + " has text");
      if (["pct", "frac", "mult"].includes(t.format || "") && !(t.special && t.special[String(v)])) {
        assert.ok(/[%×]/.test(out), `${t.key} value ${v} shows its unit (got "${out}")`);
      }
    }
  }
  // The keys the formatter composes exist in English.
  for (const k of ["LOC_EMIG_VAL_TURNS", "LOC_EMIG_VAL_EVERY", "LOC_EMIG_VAL_COUNT", "LOC_EMIG_CHOICE_OFF",
    "LOC_EMIG_CHOICE_INSTANT", "LOC_EMIG_CHOICE_NO_LIMIT", "LOC_EMIG_CHOICE_EVERY_TURN"]) {
    assert.ok(text.has(k), k + " is defined");
  }
  for (const t of TUNABLES) for (const w of Object.values(t.special || {})) assert.ok(text.has(w), t.key + " special " + w + " is defined");
}

// The Advanced settings window's dropdowns: a value between the choices (set by a grouped slider) is listed as an
// extra, exact entry in order, and a value on a choice lists the choices alone.
{
  const { TUNABLES, tunableDropdown } = await import("/emigration/ui/emigration-tunables.js");
  const t = TUNABLES.find((x) => x.key === "minorViolenceScale");
  const on = tunableDropdown(t, 0.4);
  assert.deepEqual(on.values, t.values, "on a real choice there is no extra entry");
  assert.equal(on.values[on.index], 0.4);
  const between = tunableDropdown(t, 0.64);
  assert.equal(between.values.length, t.values.length + 1, "an in-between value adds one entry");
  assert.equal(between.values[between.index], 0.64, "and it is the one selected");
  assert.equal(between.items[between.index].label, "×0.64", "shown exactly, with its unit");
  for (let i = 1; i < between.values.length; i++) assert.ok(between.values[i] > between.values[i - 1], "entries stay ascending");
  const above = tunableDropdown(t, 1.5);
  assert.equal(above.index, above.values.length - 1, "a value above every choice goes last");
}

console.log("tunables harness passed");
