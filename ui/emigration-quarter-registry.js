// emigration-quarter-registry.js
//
// The PURE catalogue of choices a player is offered when a foreign diaspora grows into an established
// Cultural Quarter (a district of their own within one of your cities). Each option names a stance
// toward the newcomers and the bounded, one-time yield consequence of taking it: a benefit yield the
// quarter grants and a drawback yield it costs. The concrete AMOUNTS live in CONFIG (so balance stays
// in one place); this module only names the identities, so it is deterministic, engine-free, and
// unit-testable, and it never throws.
//
// The stances are universal (they read the same for any origin civ) because the flavour that makes a
// quarter feel specific comes from the origin's NAME ("the Roman Quarter"), resolved separately by
// emigration-naming.js. Keeping the option set civ-agnostic avoids a brittle per-civ table that could
// drift out of step with the base game's civ roster.

/**
 * @typedef {Object} QuarterOption
 * @property {string} id Stable option id (persisted on the tile record).
 * @property {string} label The button label.
 * @property {string} note A one-line consequence cue.
 * @property {string|null} benefitYield The yield the quarter grants (null = no benefit).
 * @property {string|null} penaltyYield The yield the quarter costs (null = no drawback).
 */

/** @type {QuarterOption[]} The three stances toward an established quarter. */
const OPTIONS = [
  {
    id: "embrace",
    label: "Embrace the quarter",
    note: "Their customs enrich the city (a gift of Culture), at some strain on your people as two ways of life settle side by side.",
    benefitYield: "YIELD_CULTURE",
    penaltyYield: "YIELD_HAPPINESS"
  },
  {
    id: "tax",
    label: "Tax their trade",
    note: "Their quarter pays into your treasury (a gift of Gold), and resents the levy (a strain on your people).",
    benefitYield: "YIELD_GOLD",
    penaltyYield: "YIELD_HAPPINESS"
  },
  {
    id: "ignore",
    label: "Let them be",
    note: "You neither court nor tax them; the quarter keeps to itself and asks nothing of you.",
    benefitYield: null,
    penaltyYield: null
  }
];

/** @type {Set<string>} The valid option ids, for fast membership tests. */
const OPTION_IDS = new Set(OPTIONS.map((o) => o.id));

/** The option shown when the player dismisses the modal without choosing (the passive stance). */
const DEFAULT_OPTION_ID = "ignore";

/**
 * The choices offered for an established quarter (the same universal set for every origin). A fresh
 * shallow copy each call, so a caller can safely decorate labels without mutating the catalogue.
 * @returns {QuarterOption[]} The options.
 */
export function quarterOptions() {
  return OPTIONS.map((o) => ({ ...o }));
}

/**
 * The catalogue option for an id, or the default (passive) option when the id is unknown. Never null,
 * so callers always have a well-formed record to persist.
 * @param {string} id The option id.
 * @returns {QuarterOption} The option (a copy).
 */
export function quarterOption(id) {
  const found = OPTIONS.find((o) => o.id === id) || OPTIONS.find((o) => o.id === DEFAULT_OPTION_ID);
  return { ...(found || OPTIONS[OPTIONS.length - 1]) };
}

/**
 * Whether an id names a known option.
 * @param {string} id Candidate id.
 * @returns {boolean} True when known.
 */
export function isQuarterOption(id) {
  return typeof id === "string" && OPTION_IDS.has(id);
}

// Test hook.
export const __test = { OPTIONS, OPTION_IDS, DEFAULT_OPTION_ID };
