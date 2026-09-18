import assert from "node:assert/strict";

// The conflict-refugee sliders on the Options Mods tab: an overall slider made of two detail sliders. Drives the
// real registration code through the core stub and checks the three behaviours that matter on screen: moving the
// overall slider moves and redraws both details, moving a detail redraws the overall, and the redraw -- which in
// game makes each slider fire its own change event -- never loops back or applies a change twice.

// In-memory localStorage so slider positions persist through the cascade-safe ModOptions store, as in game.
/** @type {Record<string, string>} */
const store = {};
/** @type {*} */ (globalThis).localStorage = {
  get length() { return Object.keys(store).length; },
  getItem: (/** @type {string} */ k) => (k in store ? store[k] : null),
  setItem: (/** @type {string} */ k, /** @type {*} */ v) => { store[k] = String(v); },
  removeItem: (/** @type {string} */ k) => { delete store[k]; },
  key: (/** @type {number} */ i) => Object.keys(store)[i] ?? null,
  clear: () => { for (const k of Object.keys(store)) delete store[k]; }
};
// A window to hear the Advanced settings window's close event (see the preset check at the end).
/** @type {*} */ (globalThis).window = new EventTarget();
// The Advanced sub-window registers itself with Controls at load; that is not under test here.
/** @type {*} */ (globalThis).Controls = { define() {}, decorate() {} };
const model = await import("/core/ui/options/model-options.js");
/** @type {Array<() => void>} */
const inits = [];
/** @type {Map<string, *>} */
const byId = new Map();
model.OptionType.Slider = 3;
model.Options.addInitCallback = (/** @type {() => void} */ cb) => inits.push(cb);
model.Options.addOption = (/** @type {*} */ info) => {
  byId.set(info.id, info);
  info.initListener?.(info);
};

await import("/emigration/ui/emigration-options.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { getGroupedSetting } = await import("/emigration/ui/emigration-settings.js");
for (const cb of inits) cb();

const overall = byId.get("emigration-conflict-refugees");
const major = byId.get("emigration-major-war-refugees");
const minor = byId.get("emigration-minor-raid-refugees");
assert.ok(overall && major && minor, "all three sliders are registered");
for (const s of [overall, major, minor]) {
  assert.equal(s.type, 3, s.id + " is a slider");
  assert.equal(s.currentValue, 50, s.id + " starts at the default");
}

// Simulate the game's slider element: redrawing a slider sets its value, and that fires its change event, which
// calls its updateListener. Count how often each listener really applies something.
let echoes = 0;
for (const s of [overall, major, minor]) {
  s.forceRender = () => {
    // Without the re-entrancy guard the sliders redraw each other forever. Cap it so the test ends; the cap is
    // then reported by the per-move assertion below (an error thrown here is swallowed by showSlider's catch).
    if (++echoes > 200) throw new Error("echo cap");
    s.updateListener(s, s.currentValue);
  };
}
/** Move one slider as a player would, and require that the redraws it causes settle immediately. */
const move = (/** @type {*} */ s, /** @type {number} */ v) => {
  echoes = 0;
  s.updateListener(s, v);
  // A move redraws at most the other two sliders plus itself; anything more means redraws fed back into edits.
  assert.ok(echoes <= 3, `moving ${s.id} caused ${echoes} redraws: the sliders are echoing into each other`);
};

move(overall, 70);
assert.ok(echoes > 0, "the redraw really fired change events (so the guard is exercised, not bypassed)");
assert.equal(getGroupedSetting("majorWarRefugees"), 70, "overall moves the major-war slider");
assert.equal(getGroupedSetting("minorRaidRefugees"), 70, "and the minor-raid slider");
assert.equal(major.currentValue, 70, "and redraws the major slider");
assert.equal(minor.currentValue, 70, "and the minor slider");
assert.equal(major.formattedValue, "70%");
assert.ok(Math.abs(CONFIG.majorViolenceScale - 1.4) < 1e-9, "major scale followed its curve (70 -> 1.4)");
assert.ok(Math.abs(CONFIG.minorViolenceScale - 0.64) < 1e-9, "minor scale followed its curve (70 -> 0.64)");

move(minor, 30);
assert.equal(getGroupedSetting("minorRaidRefugees"), 30, "a detail slider moves on its own");
assert.equal(getGroupedSetting("majorWarRefugees"), 70, "without touching its sibling");
assert.equal(overall.currentValue, 50, "and the overall slider redraws to the new average");

move(overall, 80);
assert.equal(getGroupedSetting("majorWarRefugees"), 100, "overall shifts both by +30; major clamps at 100");
assert.equal(getGroupedSetting("minorRaidRefugees"), 60, "the difference the player set is kept where it can be");
assert.equal(overall.currentValue, 80, "the overall shows the real average after clamping");

move(overall, 50);
assert.equal(getGroupedSetting("majorWarRefugees"), 70);
assert.equal(getGroupedSetting("minorRaidRefugees"), 30);

// Put everything back so the rest of a combined run starts from defaults.
move(major, 50);
move(minor, 50);
assert.equal(overall.currentValue, 50);
assert.equal(CONFIG.majorViolenceScale, 1);
assert.equal(CONFIG.minorViolenceScale, 0.4);

// The Advanced settings button: every individual setting lives in its own window, opened from the last row
// of the Emigration group, and nothing else is drawn inline on the tab.
{
  const all = [...byId.values()];
  const adv = byId.get("emigration-advanced");
  assert.ok(adv, "the Advanced settings button is registered");
  assert.equal(adv.group, "emigration", "in the main Emigration group");
  assert.equal(adv.editorTagName, "emigration-advanced-editor", "and it opens the Advanced settings window");
  assert.equal(adv.label, "LOC_OPTIONS_EMIGRATION_ADVANCED");
  const emig = all.filter((o) => o.group === "emigration").map((o) => o.id);
  assert.equal(emig[emig.length - 1], "emigration-advanced", "it is the last row of the Emigration group");
  assert.ok(!all.some((o) => String(o.id).startsWith("emigration-adv-")), "no individual settings are drawn on the tab");
  assert.ok(!all.some((o) => o.group === "emigration_advanced"), "and there is no inline advanced group");

  // Edits in the window can take the preset off Low/Medium/High; closing the window redraws the preset dropdown.
  const { applyPresetIndex, markPresetCustom } = await import("/emigration/ui/emigration-settings.js");
  const { ADVANCED_CLOSED_EVENT } = await import("/emigration/ui/options/emigration-advanced-editor.js");
  const preset = byId.get("emigration-preset");
  let redraws = 0;
  preset.forceRender = () => redraws++;
  applyPresetIndex(2);
  markPresetCustom(); // what an edit inside the window does
  /** @type {*} */ (globalThis).window.dispatchEvent(new CustomEvent(ADVANCED_CLOSED_EVENT));
  assert.equal(preset.selectedItemIndex, 0, "closing the window shows the preset as Custom");
  assert.ok(redraws > 0, "and redraws the dropdown");
  applyPresetIndex(0);
}

// The decision pop-up checkboxes: each mirrors one Advanced setting, starts from its default, writes the ticked or
// unticked value into the live CONFIG, and redraws when the Advanced window (which edits the same value) closes.
{
  const { setTunable } = await import("/emigration/ui/emigration-settings.js");
  const { ADVANCED_CLOSED_EVENT } = await import("/emigration/ui/options/emigration-advanced-editor.js");
  const cases = [
    { id: "emigration-ask-arrivals", key: "arrivalPlacement", ticked: true, on: 2, off: 1 },
    { id: "emigration-callhome-offer", key: "callHomeOfferWhenCalm", ticked: true, on: true, off: false },
    { id: "emigration-ask-enclaves", key: "quarterRecognition", ticked: false, on: 0, off: 2 }
  ];
  for (const c of cases) {
    const box = byId.get(c.id);
    assert.ok(box, c.id + " is registered");
    assert.equal(box.group, "emigration", c.id + " is in the Emigration group");
    assert.equal(box.currentValue, c.ticked, c.id + " starts at its setting's default");
    box.updateListener(box, !c.ticked);
    assert.equal(CONFIG[c.key], c.ticked ? c.off : c.on, c.id + " writes " + c.key);
    box.updateListener(box, c.ticked);
    assert.equal(CONFIG[c.key], c.ticked ? c.on : c.off, c.id + " writes it back");

    // A change made in the Advanced window shows on the checkbox once the window closes.
    let redraws = 0;
    box.forceRender = () => redraws++;
    setTunable(c.key, c.ticked ? c.off : c.on);
    /** @type {*} */ (globalThis).window.dispatchEvent(new CustomEvent(ADVANCED_CLOSED_EVENT));
    assert.equal(box.currentValue, !c.ticked, c.id + " follows an Advanced edit");
    assert.ok(redraws > 0, c.id + " redraws after the window closes");
    setTunable(c.key, c.ticked ? c.on : c.off);
  }
}

console.log("options conflict-sliders harness passed");
