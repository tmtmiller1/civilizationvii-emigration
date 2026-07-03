// emigration-loc.js
//
// The shared localization helper for the mod's runtime UI. `loc(key, fallback, ...args)` composes a
// LOC key through the engine's Locale.compose when available, and otherwise returns the English
// `fallback`. Both paths substitute {1_X} / {2_X} style placeholders from `args`, so a call reads the
// same off-engine (tests, headless) as it does in-game with English selected: the fallback IS the
// canonical English string. Depends only on the global `Locale`, so any UI module can import it
// without creating an import cycle.

/**
 * Substitute {1_X}/{2_X} positional placeholders in a template with `args`.
 * @param {string} template The template string.
 * @param {*[]} args Positional substitution args (1-based in the placeholder).
 * @returns {string} The filled string.
 */
function fill(template, args) {
  return String(template).replace(/\{(\d+)_[A-Za-z]+\}/g, (m, n) => {
    const a = args[Number(n) - 1];
    return a == null ? m : String(a);
  });
}

/**
 * Localize a LOC key with a guaranteed English fallback. Substitutes {1_X} placeholders from `args`
 * on both the localized and fallback paths.
 * @param {string} key The LOC key.
 * @param {string} fallback The canonical English string (may contain {1_X} placeholders).
 * @param {...*} args Positional substitution args.
 * @returns {string} The localized (or fallback) string.
 */
export function loc(key, fallback, ...args) {
  try {
    if (typeof Locale !== "undefined" && Locale.compose) {
      const v = Locale.compose(key, ...args);
      if (typeof v === "string" && v && !v.startsWith("LOC_")) return v;
    }
  } catch (_) {
    /* fall through to the English fallback */
  }
  return fill(fallback, args);
}
