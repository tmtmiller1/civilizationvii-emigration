// Stub for engine-served `/core/*` and `/base-standard/*` modules the mod
// imports by absolute path but which don't live in the mod folder. Routed here
// via tsconfig `paths`. Everything is `any` - this is the untyped engine boundary.
declare const _default: any;
export default _default;

// Options-screen surface (model-options.js / options-helpers.js) used by the
// settings/options pages.
export const CategoryType: any;
export const OptionType: any;
export const Options: any;
export const CategoryData: any;

// Panel/screen surface used by the custom Advanced-settings sub-window
// (emigration-advanced-editor.js).
export const InputEngineEventName: any;
export const FocusManager: any;

// ui-next plot-tooltip visibility signal setter, used by the Ethnicity lens to
// suppress the base plot tooltip while the lens (and its own panel) is active.
export const SetIsPlotTooltipVisible: any;
