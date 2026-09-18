// emigration-enclave-skins.js
//
// WHAT a recognized Cultural Enclave looks like on the map, and what its tile yields, themed by the origin
// civilization. The engine binds improvement art by type name inside its art packs (no data table can
// point a custom type at a model), so a themed tile must be an EXISTING improvement type. Two sources:
//
//   1. The origin's own UNIQUE IMPROVEMENT (22 civilizations have one): a Goryeo enclave is a Gama, a
//      Mongol enclave an Ortoo. Its native yields are the civilization's signature yield already.
//   2. For the rest, a FALLBACK by yield family, taken from the enclave's stance benefits in
//      emigration-quarter-bonuses.js (option "a" first, then "b"): another civilization's improvement whose
//      native yield matches (a Roman enclave, production, is a hill fortress; a Carthaginian one, gold, a
//      caravanserai), else the base Village (+2 Culture from data/emigration-enclave-village.xml).
//
// Watched 2026-09-13 (devtools/engine-probe, mod test 16): another civilization's trait-locked unique
// improvement placed with CREATE_ELEMENT in a human city and in an AI city, carried its native yields for
// the foreign owner (Gama +3 Culture, Ortoo +5 Gold, Caravanserai +5 Gold, Hidden Fortress +4 Production,
// Thing +4 Happiness, Mawaskawe Skote +4 Food) and stood through AI turns. Two constraints, handled here:
// a type from an age not yet reached is not loaded (a Modern civ's improvement cannot be placed in
// Exploration; enclaveIndex reads null), and some types are terrain-bound (Ortoo flat, Terrace Farm hill).
// Candidates are therefore an ORDERED list; the placer takes the first that is loaded and has a plot.
//
// Pure module (no engine reads), so the tables are unit-testable off-engine.

import { QUARTER_BONUSES } from "/emigration/ui/emigration-quarter-bonuses.js";

/** The base game's Village: the last-resort skin (art; +2 Culture on the tile for major civilizations). */
export const VILLAGE_TYPE = "IMPROVEMENT_VILLAGE";

/**
 * Each civilization's unique IMPROVEMENT (from the game's progression-tree data, all ages and DLC,
 * 2026-09-13). Civilizations with unique quarters/buildings instead are absent.
 * @type {Record<string, string>}
 */
export const UNIQUE_IMPROVEMENTS = Object.freeze({
  CIVILIZATION_AKSUM: "IMPROVEMENT_HAWELT",
  CIVILIZATION_BABYLON: "IMPROVEMENT_KIRIMAHU",
  CIVILIZATION_HAN: "IMPROVEMENT_HAN_GREAT_WALL",
  CIVILIZATION_HEIAN: "IMPROVEMENT_JINJA_LAND",
  CIVILIZATION_KHMER: "IMPROVEMENT_BARAY",
  CIVILIZATION_MISSISSIPPIAN: "IMPROVEMENT_POTKOP",
  CIVILIZATION_PERSIA: "IMPROVEMENT_PAIRIDAEZA",
  CIVILIZATION_BULGARIA: "IMPROVEMENT_HIDDEN_FORTRESS",
  CIVILIZATION_DAI_VIET: "IMPROVEMENT_WATER_PUPPET_THEATER",
  CIVILIZATION_GORYEO: "IMPROVEMENT_GAMA",
  CIVILIZATION_HAWAII: "IMPROVEMENT_LO_I_KALO",
  CIVILIZATION_ICELAND: "IMPROVEMENT_THING",
  CIVILIZATION_INCA: "IMPROVEMENT_TERRACE_FARM",
  CIVILIZATION_MING: "IMPROVEMENT_MING_GREAT_WALL",
  CIVILIZATION_MONGOLIA: "IMPROVEMENT_ORTOO",
  CIVILIZATION_SENGOKU: "IMPROVEMENT_TEA_HOUSE",
  CIVILIZATION_SHAWNEE: "IMPROVEMENT_MAWASKAWE_SKOTE",
  CIVILIZATION_SONGHAI: "IMPROVEMENT_CARAVANSERAI",
  CIVILIZATION_BUGANDA: "IMPROVEMENT_KABAKAS_LAKE",
  CIVILIZATION_MUGHAL: "IMPROVEMENT_STEPWELL",
  CIVILIZATION_NEPAL: "IMPROVEMENT_HIGHLAND_POWER_STATION",
  CIVILIZATION_RUSSIA: "IMPROVEMENT_OBSHCHINA",
  CIVILIZATION_SIAM: "IMPROVEMENT_BANG"
});

/**
 * Fallback skins per yield family, best first: later-age types (richer, +3 to +5) before Antiquity ones
 * (+2 to +3), so the first LOADED type is the strongest the current age allows. Native yields in brackets.
 * Science has no improvement in the game that yields it, so a science stance falls through to the
 * enclave's other stance (see skinCandidates).
 * @type {Record<string, string[]>}
 */
export const FAMILY_SKINS = Object.freeze({
  YIELD_CULTURE: ["IMPROVEMENT_GAMA", "IMPROVEMENT_PAIRIDAEZA", "IMPROVEMENT_MEGALITH"], // 3C | 2C+1G | 2C (flat)
  YIELD_PRODUCTION: ["IMPROVEMENT_HIDDEN_FORTRESS", "IMPROVEMENT_HILLFORT"], // 4P (hill) | 2P (hill)
  YIELD_GOLD: ["IMPROVEMENT_CARAVANSERAI", "IMPROVEMENT_ORTOO", "IMPROVEMENT_HAWELT"], // 5G | 5G (flat) | 2G (flat)
  YIELD_FOOD: ["IMPROVEMENT_MAWASKAWE_SKOTE", "IMPROVEMENT_WATER_PUPPET_THEATER", "IMPROVEMENT_BARAY"], // 4F | 4F | 3F (flat)
  YIELD_HAPPINESS: ["IMPROVEMENT_THING", "IMPROVEMENT_JINJA_LAND"] // 4H | 2H
});

/** Yield families that borrow another family's skins. Faith does not exist as a tile yield.
 * @type {Record<string, string>} */
const FAMILY_ALIAS = Object.freeze({ YIELD_FAITH: "YIELD_CULTURE" });

/**
 * The stance benefit yields of an origin civilization, option "a" first (from the bonuses registry).
 * @param {string|null|undefined} originCiv The origin CivilizationType.
 * @returns {string[]} Benefit yield types, possibly empty.
 */
function stanceBenefits(originCiv) {
  const entry = originCiv ? QUARTER_BONUSES[originCiv] : null;
  if (!entry || !Array.isArray(entry.options)) return [];
  const ordered = entry.options.slice().sort((x, y) => (x.id === "a" ? -1 : y.id === "a" ? 1 : 0));
  return ordered.map((o) => o && o.benefit).filter((b) => typeof b === "string");
}

/**
 * The ordered skin candidates for an origin civilization: its unique improvement, then the fallback
 * skins of each stance benefit's family, then the Village. Pure; duplicates removed.
 * @param {string|null|undefined} originCiv The origin CivilizationType.
 * @returns {string[]} Improvement types, best first, always ending with the Village.
 */
export function skinCandidates(originCiv) {
  /** @type {string[]} */
  const out = [];
  const push = (/** @type {string} */ t) => { if (!out.includes(t)) out.push(t); };
  const unique = originCiv ? UNIQUE_IMPROVEMENTS[originCiv] : null;
  if (unique) push(unique);
  for (const benefit of stanceBenefits(originCiv)) {
    const family = FAMILY_ALIAS[benefit] || benefit;
    for (const t of FAMILY_SKINS[family] || []) push(t);
  }
  push(VILLAGE_TYPE);
  return out;
}

/**
 * Whether a type is one of the skins this module may place (a unique or fallback improvement, or the
 * Village), so callers can tell an enclave-skin tile from the owner's genuine improvement of that type
 * only by RECORD, never by type. Pure.
 * @param {string} type A ConstructibleType. @returns {boolean} True when it is a skin type.
 */
export function isSkinType(type) {
  if (type === VILLAGE_TYPE) return true;
  if (Object.values(UNIQUE_IMPROVEMENTS).includes(type)) return true;
  return Object.values(FAMILY_SKINS).some((list) => list.includes(type));
}
