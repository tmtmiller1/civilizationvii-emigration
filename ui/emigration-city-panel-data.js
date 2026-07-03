// emigration-city-panel-data.js
//
// The PURE view-model for the emigration sections injected into the base game's City Details panel.
// Two blocks are surfaced there (emigration-city-panel.js does the engine reads + DOM; this module
// is DOM-free and unit-tested, mirroring the readoutModel split in emigration-city-readout.js):
//   • population (on the "Citizen Growth" tab): where the settlement's people came from, plus the
//     recent emigration OUT (with destinations) and immigration IN (with origins) and any refugees
//     still held awaiting settlement.
//   • quarters (on the "Building Breakdown" tab): the established Cultural Quarter record, if any -
//     its origin, the stance the player took, its one-time yields, and whether it is contested.
//
// The engine host resolves civ ids to display names BEFORE calling cityPanelModel(), so this module
// only formats already-resolved data. Localization follows the mod's `loc(key, ...args) || English`
// idiom, but injected: the host passes a `compose` resolver (the real Locale.compose wrapper); the
// pure model calls it with an English fallback for every label, so it stays deterministic and testable
// off-engine (no compose -> English) while rendering localized text in-game.

import { formatPeople } from "/emigration/ui/emigration-population.js";

// The most flow rows to list per direction before collapsing the remainder into a "(+N more)" tail;
// keeps a busy capital's panel legible without an unbounded wall of city names.
const MAX_FLOW_ROWS = 6;

// English yield nouns, the fallback when the base-game yield-name LOC key can't be composed, so the
// panel reads "40 Culture" rather than the raw "YIELD_CULTURE" key. Unknown keys fall back to the
// de-prefixed key.
/** @type {Record<string, string>} */
const YIELD_LABELS = {
  YIELD_CULTURE: "Culture",
  YIELD_GOLD: "Gold",
  YIELD_HAPPINESS: "Happiness",
  YIELD_SCIENCE: "Science",
  YIELD_FOOD: "Food",
  YIELD_PRODUCTION: "Production",
  YIELD_INFLUENCE: "Influence",
  YIELD_DIPLOMACY: "Influence"
};

/**
 * A compose resolver: returns a localized string for a LOC key + args, or null when unavailable.
 * @typedef {(key:string, ...args:*) => (string|null)} Compose
 */

/**
 * A flow row for one direction of migration (a destination for outflow, an origin for inflow), with
 * the civ name already resolved by the engine host.
 * @typedef {Object} CityPanelFlow
 * @property {string} place The other settlement's name.
 * @property {string} civName The other settlement's civilization adjective (resolved).
 * @property {number} people The historically-scaled people moved along this edge.
 */

/**
 * The already-resolved quarter record for the selected city (civ ids turned into display strings by
 * the engine host).
 * @typedef {Object} CityPanelQuarter
 * @property {string} originName The quarter's display name (e.g. "Roman Quarter").
 * @property {string} stanceLabel The label of the stance the player chose.
 * @property {boolean} contested Whether the host is at war with the origin's homeland.
 * @property {string|null} benefitYield The yield the quarter grants (or null).
 * @property {number} benefitAmount The amount granted.
 * @property {string|null} penaltyYield The yield the quarter costs (or null).
 * @property {number} penaltyAmount The amount cost.
 */

/**
 * The resolved inputs the engine host gathers for the selected city.
 * @typedef {Object} CityPanelInput
 * @property {string} cityName The settlement's display name.
 * @property {{total:number, parts:{name:string, share:number}[]}|null} composition Origin mix.
 * @property {CityPanelFlow[]} outflows Recent emigration OUT of this settlement.
 * @property {CityPanelFlow[]} inflows Recent immigration INTO this settlement.
 * @property {number} refugeePool Refugees held here awaiting settlement (points).
 * @property {CityPanelQuarter|null} quarter The established quarter, or null.
 */

/**
 * The no-op compose (used when the host injects none): always defers to the English fallback.
 * @returns {null} Always null.
 */
function noCompose() {
  return null;
}

/**
 * Resolve a localized string for a LOC key, falling back to English when compose yields nothing.
 * @param {Compose} compose The resolver.
 * @param {string} key The LOC key.
 * @param {*[]} args The substitution args.
 * @param {string} fallback The English fallback.
 * @returns {string} The localized string, or the fallback.
 */
function pick(compose, key, args, fallback) {
  const v = compose(key, ...args);
  return typeof v === "string" && v.length ? v : fallback;
}

/**
 * The display noun for a yield key ("YIELD_CULTURE" -> "Culture"), localized via the base-game
 * yield-name LOC key when possible, else the English map.
 * @param {Compose} compose The resolver.
 * @param {string|null|undefined} key The yield key.
 * @returns {string} The friendly label (or "").
 */
function yieldLabel(compose, key) {
  if (typeof key !== "string" || !key.length) return "";
  const english = YIELD_LABELS[key] || key.replace(/^YIELD_/, "");
  return pick(compose, "LOC_" + key + "_NAME", [], english);
}

/**
 * The composition line for one origin ("Roman 62%").
 * @param {{name:string, share:number}} p An origin part.
 * @returns {string} The line.
 */
function originLine(p) {
  return p.name + " " + Math.round((p.share || 0) * 100) + "%";
}

/**
 * Whether an origin part is well-formed enough to display.
 * @param {*} p A candidate origin part.
 * @returns {boolean} True when it has a name and a positive share.
 */
function validPart(p) {
  return !!p && typeof p.name === "string" && p.name.length > 0 && (p.share || 0) > 0;
}

/**
 * The origin composition lines, largest share first, or empty when nothing is tracked yet.
 * @param {{parts:{name:string, share:number}[]}|null|undefined} comp The composition.
 * @returns {string[]} The lines.
 */
function originLines(comp) {
  const parts = comp && Array.isArray(comp.parts) ? comp.parts : [];
  return parts.filter(validPart).map(originLine);
}

/**
 * One flow row ("Memphis (Egyptian): 12,000").
 * @param {CityPanelFlow} f The flow.
 * @returns {string} The row text.
 */
function flowRow(f) {
  return f.place + " (" + f.civName + "): " + formatPeople(f.people);
}

/**
 * The flow rows for one direction, largest first and capped at {@link MAX_FLOW_ROWS} with a
 * "(+N more)" tail. Ignores malformed or zero-people edges.
 * @param {Compose} compose The resolver.
 * @param {CityPanelFlow[]|null|undefined} flows The flows.
 * @returns {string[]} The rows.
 */
function flowRows(compose, flows) {
  const list = (Array.isArray(flows) ? flows : [])
    .filter((f) => f && typeof f.place === "string" && f.people > 0)
    .sort((a, b) => b.people - a.people);
  const top = list.slice(0, MAX_FLOW_ROWS);
  const rows = top.map(flowRow);
  const extra = list.length - top.length;
  if (extra > 0) rows.push(pick(compose, "LOC_EMIGRATION_PANEL_MORE", [extra], "(+" + extra + " more)"));
  return rows;
}

/**
 * The refugee-holding line, or "" when none are held.
 * @param {Compose} compose The resolver.
 * @param {number} pool The refugee pool size (points).
 * @returns {string} The line.
 */
function refugeeText(compose, pool) {
  const n = typeof pool === "number" && pool > 0 ? Math.floor(pool) : 0;
  if (!n) return "";
  const key = n === 1 ? "LOC_EMIGRATION_PANEL_REFUGEE_ONE" : "LOC_EMIGRATION_PANEL_REFUGEE_MANY";
  const english = n + (n === 1 ? " refugee awaits" : " refugees await") + " settlement here.";
  return pick(compose, key, [n], english);
}

/**
 * The "quarter grants a yield" line.
 * @param {Compose} compose The resolver.
 * @param {number} amount The amount granted.
 * @param {string} yieldKey The yield key.
 * @returns {string} The line.
 */
function grantsLine(compose, amount, yieldKey) {
  const y = yieldLabel(compose, yieldKey);
  const english = "Grants " + amount + " " + y + " to the city.";
  return pick(compose, "LOC_EMIGRATION_PANEL_QUARTER_GRANTS", [amount, y], english);
}

/**
 * The "quarter costs a yield" line.
 * @param {Compose} compose The resolver.
 * @param {number} amount The amount cost.
 * @param {string} yieldKey The yield key.
 * @returns {string} The line.
 */
function costsLine(compose, amount, yieldKey) {
  const y = yieldLabel(compose, yieldKey);
  const english = "Costs " + amount + " " + y + " each turn.";
  return pick(compose, "LOC_EMIGRATION_PANEL_QUARTER_COSTS", [amount, y], english);
}

/**
 * The display lines for an established quarter.
 * @param {Compose} compose The resolver.
 * @param {CityPanelQuarter} q The resolved quarter.
 * @returns {string[]} The lines.
 */
function quarterLines(compose, q) {
  const rootEn = "A " + q.originName + " has taken root in this settlement.";
  const lines = [pick(compose, "LOC_EMIGRATION_PANEL_QUARTER_ROOT", [q.originName], rootEn)];
  if (q.stanceLabel) {
    const en = "Your stance: " + q.stanceLabel + ".";
    lines.push(pick(compose, "LOC_EMIGRATION_PANEL_QUARTER_STANCE", [q.stanceLabel], en));
  }
  if (q.benefitYield && q.benefitAmount > 0) {
    lines.push(grantsLine(compose, q.benefitAmount, q.benefitYield));
  }
  if (q.penaltyYield && q.penaltyAmount > 0) {
    lines.push(costsLine(compose, q.penaltyAmount, q.penaltyYield));
  }
  if (q.contested) {
    const en = "Contested: you are at war with their homeland, straining the quarter.";
    lines.push(pick(compose, "LOC_EMIGRATION_PANEL_QUARTER_CONTESTED", [], en));
  }
  return lines;
}

/**
 * Assemble the population block of the view-model.
 * @param {Compose} c The resolver.
 * @param {*} i The resolved inputs.
 * @returns {*} The population block.
 */
function populationBlock(c, i) {
  const cityName = i.cityName || "this settlement";
  const origins = originLines(i.composition);
  const outflowLines = flowRows(c, i.outflows);
  const inflowLines = flowRows(c, i.inflows);
  const refugeeLine = refugeeText(c, i.refugeePool);
  return {
    title: pick(c, "LOC_EMIGRATION_PANEL_POP_TITLE", [cityName], "Migration - " + cityName),
    originsHeading: pick(c, "LOC_EMIGRATION_PANEL_ORIGINS", [], "Population origins"),
    departingHeading: pick(c, "LOC_EMIGRATION_PANEL_DEPARTING", [], "Departing to"),
    arrivingHeading: pick(c, "LOC_EMIGRATION_PANEL_ARRIVING", [], "Arriving from"),
    noDataText: pick(c, "LOC_EMIGRATION_PANEL_NO_MIGRATION", [], "No migration recorded for this settlement yet."),
    originLines: origins,
    outflowLines,
    inflowLines,
    refugeeLine,
    hasData: origins.length > 0 || outflowLines.length > 0 || inflowLines.length > 0 || refugeeLine.length > 0
  };
}

/**
 * Build the City Details panel view-model (population + quarters blocks) from already-resolved
 * inputs. Pure and DOM-free. Pass `compose` (a Locale.compose wrapper) for localized text; omit it
 * for the English fallback (tests, off-engine).
 * @param {CityPanelInput|null|undefined} input The resolved inputs.
 * @param {Compose} [compose] The optional localization resolver.
 * @returns {{population:*, quarters:*}} The view-model.
 */
export function cityPanelModel(input, compose) {
  const c = typeof compose === "function" ? compose : noCompose;
  const i = /** @type {*} */ (input || {});
  const q = i.quarter || null;
  return {
    population: populationBlock(c, i),
    quarters: {
      title: pick(c, "LOC_EMIGRATION_PANEL_QUARTER_TITLE", [], "Cultural Quarter"),
      noQuarterText: pick(c, "LOC_EMIGRATION_PANEL_NO_QUARTER", [], "No foreign quarter has taken root here."),
      present: !!q,
      lines: q ? quarterLines(c, q) : []
    }
  };
}

// Test hook: expose the small pure helpers so the harness can exercise their branches directly.
export const __test = { yieldLabel, flowRows, originLines, refugeeText, quarterLines, noCompose };
