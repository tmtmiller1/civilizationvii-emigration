// Off-engine stub for /core/* and /base-standard/* imports during tests. The
// real modules are served by the game engine; here they just need to resolve.
export const CategoryType = {};
export const CategoryData = {};
export const OptionType = { Checkbox: 1, Dropdown: 2 };
export const Options = {
  addOption() {},
  addInitCallback() {}
};
// Named imports used by the Options sub-window (emigration-advanced-editor.js), so the options modules link.
export const InputEngineEventName = "engine-input";
export const FocusManager = { setFocus() {}, clearFocus() {} };
// The native dialog manager (emigration-dilemma-view.js): records each definition for a test that sets
// globalThis.__emigDialogStub, and is otherwise a silent no-op.
export const DialogBoxManager = {
  createDialog_MultiOption(def) {
    if (typeof globalThis.__emigDialogStub === "function") globalThis.__emigDialogStub(def);
  }
};
export default {};
