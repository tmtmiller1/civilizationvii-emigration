// Off-engine stub for /core/* and /base-standard/* imports during tests. The
// real modules are served by the game engine; here they just need to resolve.
export const CategoryType = {};
export const CategoryData = {};
export const OptionType = { Checkbox: 1, Dropdown: 2 };
export const Options = {
  addOption() {},
  addInitCallback() {}
};
export default {};
