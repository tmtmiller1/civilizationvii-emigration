// Dev-only ESLint flat config. Enforces the modularization gate (function length +
// cyclomatic complexity) and catches real bugs. Not shipped; release.sh excludes it.
// Mirrors the Demographics mod's config so both mods hold to the same standard.

const ENGINE_GLOBALS = {
  // Civ7 true globals used without importing.
  Game: "readonly",
  GameContext: "readonly",
  Players: "readonly",
  GameInfo: "readonly",
  GameplayMap: "readonly",
  Configuration: "readonly",
  Locale: "readonly",
  engine: "readonly",
  Database: "readonly",
  Controls: "readonly",
  Cities: "readonly",
  ComponentID: "readonly",
  MapConstructibles: "readonly",
  Constructibles: "readonly",
  Modding: "readonly",
  UI: "readonly",
  YieldTypes: "readonly",
  DiplomacyPlayerRelationships: "readonly",
  WorldUI: "readonly",
  InputActionStatuses: "readonly"
};

const BROWSER_GLOBALS = {
  window: "readonly",
  document: "readonly",
  console: "readonly",
  localStorage: "readonly",
  globalThis: "readonly",
  structuredClone: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly"
};

export default [
  {
    // The dev probe is a throwaway diagnostic with a separate modinfo; not
    // shipped and not held to the gate.
    ignores: ["ui/migration-probe.js"]
  },
  {
    files: ["ui/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...ENGINE_GLOBALS, ...BROWSER_GLOBALS }
    },
    rules: {
      // The modularization gate.
      complexity: ["error", 10],
      "max-lines-per-function": [
        "error",
        { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true }
      ],
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
      // Soft quality guardrails.
      "max-len": [
        "warn",
        {
          code: 100,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true
        }
      ],
      "max-params": ["error", 5],
      "max-depth": ["error", 4],
      "max-statements": ["error", 18],
      // Correctness checks.
      "no-undef": "error",
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ],
      // Match the engine's own `== null` undefined-check idiom.
      eqeqeq: ["error", "always", { null: "ignore" }]
    }
  },
  {
    // The tunable settings catalog is data, not logic; exempt from the length gate.
    files: ["ui/emigration-config.js"],
    rules: { "max-lines-per-function": "off", "max-lines": "off" }
  }
];
