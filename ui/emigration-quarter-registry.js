// emigration-quarter-registry.js
//
// Assembles the CHOICES a player is offered when a foreign diaspora grows into an established Cultural
// Quarter, for a SPECIFIC origin civilization. Each origin offers two identity-grounded trade-off
// options (its benefit/penalty yields + a one-line "why", from emigration-quarter-bonuses.js) plus a
// universal passive "let them be" stance. The concrete AMOUNTS live in CONFIG (balance in one place);
// this module only names the identities and composes the button label + consequence note, so it stays
// deterministic, engine-free, unit-testable, and never throws.
//
// The origin's NAME ("the Roman Quarter") is resolved separately by emigration-naming.js. Here the
// origin shapes the option YIELDS and flavour: a Roman Quarter offers Production/Gold, a Persian one
// Gold/Culture, and so on (emigration-quarter-bonuses.js, plan §7). Unknown/DLC civs fall back to a
// neutral pair so the feature never breaks on a civ with no row.

import { quarterBonus } from "/emigration/ui/emigration-quarter-bonuses.js";
import { loc } from "/emigration/ui/emigration-loc.js";

/**
 * @typedef {Object} QuarterOption
 * @property {string} id Stable option id (persisted on the tile record): "a", "b", or "ignore".
 * @property {string} label The button label.
 * @property {string} note A one-line consequence cue.
 * @property {string|null} benefitYield The yield the quarter grants (null = no benefit).
 * @property {string|null} penaltyYield The yield the quarter costs (null = no drawback).
 */

/** Benefit yield → the action-verb button label (civ-agnostic; the flavour is in the note).
 * @type {Record<string,string>} */
const ACT_LABEL = {
  YIELD_CULTURE: "Embrace their culture",
  YIELD_GOLD: "Tax their trade",
  YIELD_PRODUCTION: "Employ their crafts",
  YIELD_SCIENCE: "Fund their learning",
  YIELD_FAITH: "Honour their faith",
  YIELD_FOOD: "Take up their farming",
  YIELD_HAPPINESS: "Join their festivals"
};

/** Yield type → short display name, for the note's "(+X, −Y)" cue.
 * @type {Record<string,string>} */
const YIELD_SHORT = {
  YIELD_CULTURE: "Culture",
  YIELD_GOLD: "Gold",
  YIELD_PRODUCTION: "Production",
  YIELD_SCIENCE: "Science",
  YIELD_FAITH: "Faith",
  YIELD_FOOD: "Food",
  YIELD_HAPPINESS: "Happiness"
};

/** The universal passive stance (localized fresh each build, since loc() is a runtime call). */
function ignoreOption() {
  return {
    id: "ignore",
    label: loc("LOC_EMIG_QTR_LABEL_IGNORE", "Let them be"),
    note: loc("LOC_EMIG_QTR_NOTE_IGNORE", "You neither court nor tax them; the enclave keeps to itself and asks nothing of you."),
    benefitYield: null,
    penaltyYield: null
  };
}

/** The option shown when the player dismisses the modal without choosing (the passive stance). */
const DEFAULT_OPTION_ID = "ignore";

/** @type {Set<string>} The valid option ids, for fast membership tests. */
const OPTION_IDS = new Set(["a", "b", "ignore"]);

/** @param {string} y @returns {string} A yield token's short suffix ("YIELD_CULTURE" → "CULTURE"). */
function yieldTag(y) {
  return String(y || "").replace(/^YIELD_/, "");
}

/** @param {string} s @returns {string} s with its first letter capitalised. */
function cap(s) {
  return s && s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** @param {string|null} y @returns {string} Localized short yield name for the "(+X, −Y)" cue. */
function yieldShort(y) {
  return y ? loc("LOC_EMIG_QTR_YIELD_" + yieldTag(y), YIELD_SHORT[y] || yieldTag(y)) : "";
}

/** @param {string} benefit @returns {string} Localized default action-verb label for a benefit yield. */
function actLabel(benefit) {
  return ACT_LABEL[benefit]
    ? loc("LOC_EMIG_QTR_ACT_" + yieldTag(benefit), ACT_LABEL[benefit])
    : loc("LOC_EMIG_QTR_ACT_DEFAULT", "Encourage the enclave");
}

/**
 * Turn one per-civ bonus option ({id, benefit, penalty, why}) into a full offered QuarterOption: an
 * action-verb label from the benefit yield, and a consequence note = the "why" flavour + a compact
 * "(+Benefit, −Penalty)" cue. Every player-facing string is localized through its own LOC key with the
 * English (registry) text as the fallback: `LOC_EMIG_QTR_WHY_<civ>_<id>`, `..._LABEL_<civ>_<id>` for a
 * martial override, `..._ACT_<yield>` for the default verb, `..._YIELD_<yield>` for the cue. The
 * enclave's single attributed quote is shown once at the modal level (emigration-quarter.js), not here.
 * @param {{id:string, benefit:string, penalty:string, why:string, label?:string}} b The bonus option.
 * @param {string} civKey The origin's short key ("ROME"), or "NEUTRAL" for the fallback pair.
 * @returns {QuarterOption} The offered option.
 */
function toOption(b, civKey) {
  const suffix = civKey + "_" + b.id.toUpperCase();
  const why = loc("LOC_EMIG_QTR_WHY_" + suffix, b.why);
  const label = b.label ? loc("LOC_EMIG_QTR_LABEL_" + suffix, b.label) : actLabel(b.benefit);
  return {
    id: b.id,
    label,
    note: cap(why) + " (+" + yieldShort(b.benefit) + ", −" + yieldShort(b.penalty) + ").",
    benefitYield: b.benefit,
    penaltyYield: b.penalty
  };
}

/**
 * The choices offered for an established quarter of a given origin: the origin's two identity options
 * (a, b) followed by the universal passive "let them be". Fresh copies each call, so a caller can
 * decorate labels without mutating anything.
 * @param {string|null} civType The origin CivilizationType, e.g. "CIVILIZATION_ROME".
 * @returns {QuarterOption[]} The options (a, b, ignore).
 */
export function quarterOptionsFor(civType) {
  const bonus = quarterBonus(civType);
  const civKey = civType ? civType.replace(/^CIVILIZATION_/, "") : "NEUTRAL";
  return [...bonus.options.map((b) => toOption(b, civKey)), ignoreOption()];
}

/**
 * The offered option for an id within an origin's set, or the passive default when the id is unknown.
 * Never null, so callers always have a well-formed record to persist.
 * @param {string|null} civType The origin CivilizationType.
 * @param {string} id The option id ("a", "b", "ignore").
 * @returns {QuarterOption} The option (a copy).
 */
export function quarterOptionFor(civType, id) {
  const opts = quarterOptionsFor(civType);
  return opts.find((o) => o.id === id) || opts.find((o) => o.id === DEFAULT_OPTION_ID) || opts[opts.length - 1];
}

/**
 * Whether an id names a known option ("a", "b", "ignore").
 * @param {string} id Candidate id.
 * @returns {boolean} True when known.
 */
export function isQuarterOption(id) {
  return typeof id === "string" && OPTION_IDS.has(id);
}

// Test hook.
export const __test = { ACT_LABEL, YIELD_SHORT, ignoreOption, OPTION_IDS, DEFAULT_OPTION_ID, toOption };
