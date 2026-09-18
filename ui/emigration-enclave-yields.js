// emigration-enclave-yields.js
//
// What one enclave is worth to its host each turn, and that figure as a short display string. Used by
// the enclave lifecycle notifications (formed / fades / built over / changes hands) and their debug log
// lines, so a player reading the log sees what an enclave brought and what its loss cost.
//
// The string is built from signed amounts and the BASE GAME's yield names (LOC_YIELD_*_NAME), so it
// carries no mod-owned words and reads correctly in every locale without new text rows.

import { nativeYieldsOf } from "/emigration/ui/emigration-enclave-place.js";
import { loc as tr } from "/emigration/ui/emigration-loc.js";

/** English yield nouns, the fallback when the base-game name key does not resolve (tests, headless). */
const YIELD_NOUNS = Object.freeze({
  YIELD_FOOD: "Food", YIELD_PRODUCTION: "Production", YIELD_GOLD: "Gold", YIELD_SCIENCE: "Science",
  YIELD_CULTURE: "Culture", YIELD_HAPPINESS: "Happiness", YIELD_DIPLOMACY: "Influence"
});

/** A finite number or 0. @param {*} v Any value. @returns {number} The number. */
function num(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/**
 * Add a signed amount to a yield map, dropping a yield that nets to zero.
 * @param {Record<string, number>} out The map (mutated). @param {*} key The yield type. @param {number} amount Signed.
 */
function add(out, key, amount) {
  if (typeof key !== "string" || !key.length || !amount) return;
  const next = Math.round((num(out[key]) + amount) * 100) / 100;
  if (next) out[key] = next;
  else delete out[key];
}

/**
 * The per-turn yields of an enclave's STANCE alone ({YIELD_X: signed n}): its benefit minus its drawback.
 * Empty until the enclave is recognized (an established enclave has no stance yet) and for "let be".
 * @param {*} rec A quarter record. @returns {Record<string, number>} Signed yields by type (may be empty).
 */
export function stanceYields(rec) {
  /** @type {Record<string, number>} */
  const out = {};
  const applied = rec && typeof rec === "object" && rec.applied ? rec.applied : {};
  add(out, applied.benefitYield, Math.max(0, num(applied.benefitAmount)));
  add(out, applied.penaltyYield, -Math.max(0, num(applied.penaltyAmount)));
  return out;
}

/**
 * Everything one enclave gives its host per turn ({YIELD_X: signed n}): its TILE's native yields (from
 * establishment, while a tile was placed) plus its STANCE yields (from recognition). Takeover
 * compensation is left out: it repays the improvement the tile replaced, so the enclave does not add it.
 * @param {*} rec A quarter record. @returns {Record<string, number>} Signed yields by type (may be empty).
 */
export function enclaveYields(rec) {
  const out = stanceYields(rec);
  const placedType = rec && rec.placed && typeof rec.placed.type === "string" ? rec.placed.type : null;
  if (placedType) for (const [k, v] of Object.entries(nativeYieldsOf(placedType))) add(out, k, num(v));
  return out;
}

/**
 * The display noun for a yield type, from the base game's name key, else English.
 * @param {string} key A YieldType. @returns {string} The noun.
 */
function yieldNoun(key) {
  const english = /** @type {Record<string, string>} */ (YIELD_NOUNS)[key] || key.replace(/^YIELD_/, "");
  return tr("LOC_" + key + "_NAME", english);
}

/**
 * A signed yield map as text ("+2 Culture, −1 Happiness"), or "" when it is empty. Pass `sign` −1 to
 * state the same yields as a LOSS (what the host stops receiving when the enclave goes).
 * @param {Record<string, number>} yields Signed yields by type. @param {number} [sign] 1 (default) or −1.
 * @returns {string} The text.
 */
export function yieldsText(yields, sign) {
  const s = sign === -1 ? -1 : 1;
  const parts = [];
  for (const key of Object.keys(yields || {}).sort()) {
    const n = num(yields[key]) * s;
    if (!n) continue;
    parts.push((n > 0 ? "+" : "−") + Math.abs(n) + " " + yieldNoun(key));
  }
  return parts.join(", ");
}

/**
 * A chronicle body with a yield figure appended in parentheses, or the body unchanged when there is none.
 * @param {string} body The written line. @param {string} text The yields text (may be "").
 * @returns {string} The body to chronicle.
 */
export function withYields(body, text) {
  return text ? body + " (" + text + ")" : body;
}
