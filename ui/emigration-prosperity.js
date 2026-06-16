// emigration-prosperity.js
//
// The per-city Prosperity score that drives emigration, adapted from the Civ V
// Emigration (v6) model:
//
//   Prosperity = ( Productiveness + LocalHappiness - PopulationPenalty )
//                × (1 + Σ situationalModifiers/100)
//
//   Productiveness = ( food·wF + production·wP + gold·wG + science·wS
//                     + culture·wC ) / population         (per-citizen)
//
// Food is sustenance; production is the "work available" proxy; happiness is the
// pull; population is a mild equalizer so small thriving towns still attract.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { siegeEscalation } from "/emigration/ui/emigration-violence.js";
import { civTuning } from "/emigration/ui/emigration-civ-tuning.js";

/**
 * Per-citizen weighted yield output - the core attractiveness of a city.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @returns {number} Productiveness.
 */
function productiveness(s) {
  const weighted =
    s.food * CONFIG.foodFactor +
    s.production * CONFIG.productionFactor +
    s.gold * CONFIG.goldFactor +
    s.science * CONFIG.scienceFactor +
    s.culture * CONFIG.cultureFactor;
  const pop = Math.max(1, s.population);
  return weighted / pop;
}

/**
 * Clamp `v` to [lo, hi].
 * @param {number} v Value.
 * @param {number} lo Lower bound.
 * @param {number} hi Upper bound.
 * @returns {number} Clamped value.
 */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Shared per-pass context for prosperity (e.g. the field-relative mean happiness
 * the shaped happiness model centres on). Computed once per ranking.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal[]} signals Signals.
 * @returns {{meanHappiness:number}} The context.
 */
export function fieldContext(signals) {
  let sum = 0;
  let n = 0;
  for (const s of signals) {
    if (typeof s.happiness === "number" && isFinite(s.happiness)) {
      sum += s.happiness;
      n++;
    }
  }
  return { meanHappiness: n ? sum / n : 0 };
}

/**
 * The happiness value used for scoring: net happiness plus the overcrowding
 * discount (Algorithm B) - a credit-back for unhappiness that's actually the
 * deliberate cost of urban density (which already suppresses the city's yields),
 * so tall play isn't double-punished. The per-civ table can override the discount.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @param {import("/emigration/ui/emigration-civ-tuning.js").CivTuning} tune Civ tuning.
 * @returns {number} Happiness for scoring.
 */
function happinessForScore(s, tune) {
  const disc = tune.overcrowdDiscount != null ? tune.overcrowdDiscount : CONFIG.overcrowdDiscount;
  if (!(disc > 0)) return s.happiness;
  const over = Math.max(0, (s.urban || 0) - CONFIG.overcrowdThreshold);
  return s.happiness + disc * over;
}

/**
 * The base (pre-situational) attractiveness of a city. Two models:
 *  • legacy linear (default): productiveness + happiness·w − pop·w
 *  • shaped (Algorithm A): happiness is field-relative and saturating, and it
 *    AMPLIFIES the economy (bounded multiplier) plus a bounded standalone term,
 *    so a happy-but-poor city can't run away and misery still steeply repels.
 * Both apply the per-civ overcrowding discount, happiness-pull, and source bias.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @param {{meanHappiness:number}|null} ctx Per-pass context (for the shaped model).
 * @returns {number} Base score.
 */
function baseScore(s, ctx) {
  const tune = civTuning(s.owner);
  const prod = productiveness(s);
  const popPenalty = s.population * CONFIG.populationFactor;
  const h = happinessForScore(s, tune);
  if (!CONFIG.happinessShaped) {
    const happy = h * CONFIG.localHappinessFactor * tune.happinessPull;
    return prod + happy - popPenalty + tune.sourceBias;
  }
  const mean = ctx && typeof ctx.meanHappiness === "number" ? ctx.meanHappiness : 0;
  const hNorm = Math.tanh((h - mean) / CONFIG.happyScale);
  const hShaped = (hNorm >= 0 ? hNorm : hNorm * CONFIG.happyRepulsion) * tune.happinessPull;
  const mult = clamp(1 + CONFIG.happyAmp * hShaped, CONFIG.happyMultMin, CONFIG.happyMultMax);
  return prod * mult + CONFIG.happyFloor * hShaped - popPenalty + tune.sourceBias;
}

/**
 * The percent score penalty from violence inside the city's borders - a sliding
 * scale that grows with accumulated combat intensity up to a cap. This (not the
 * empire being at war) is what makes refugees flee: a city with no fighting in
 * its territory has zero violence penalty even if its civ is at war elsewhere.
 * Under the warSiege model (Algorithm D) the penalty is additionally scaled by a
 * siege-duration escalation that drops to 0 once the city has lost its capped
 * share of population to war (the remnant digs in).
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @returns {number} A non-positive percent (0 when there's no violence).
 */
function violencePercent(s) {
  const v = s.violence;
  if (!(v > 0)) return 0;
  let pct = -Math.min(CONFIG.violenceCapPct, v * CONFIG.violencePerPoint);
  if (CONFIG.warSiege) pct *= siegeEscalation(s.city);
  return pct;
}

/**
 * The percent penalty from environmental-disaster distress (§11): a sliding scale up
 * to a cap, like violence. 0 when there's no distress.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @returns {number} A non-positive percent.
 */
function disasterPercent(s) {
  const d = s.disaster;
  if (!(d > 0)) return 0;
  return -Math.min(CONFIG.disasterCapPct, d * CONFIG.disasterPerPoint);
}

/**
 * Sum of situational percent modifiers for a city (violence, disaster, siege,
 * starvation, unrest).
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @returns {number} Total percent (e.g. -210 means -210%).
 */
function situationalPercent(s) {
  let pct = violencePercent(s) + disasterPercent(s);
  if (s.siege) pct += CONFIG.siegeModifier;
  if (s.starving) pct += CONFIG.starvationModifier;
  if (s.unrest) pct += CONFIG.unrestModifier;
  return pct;
}

/**
 * A city's distress: the magnitude of its negative situational percent (violence,
 * disaster, siege, starvation, unrest). 0 when the city is content. Drives the attrition
 * outlet - a trapped, highly-distressed city loses population when it can't flee.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @returns {number} Distress (>= 0).
 */
export function distress(s) {
  const pct = situationalPercent(s);
  return pct < 0 ? -pct : 0;
}

/**
 * Compute a city's Prosperity score.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @param {{meanHappiness:number}|null} [ctx] Per-pass context (shaped happiness).
 * @returns {number} Prosperity (higher = more attractive).
 */
export function prosperity(s, ctx) {
  const base = baseScore(s, ctx || null);
  const factor = 1 + situationalPercent(s) / 100;
  const p = base * factor;
  return isFinite(p) ? p : 0;
}

/**
 * Attach a `pros` field to each signal and return them sorted by prosperity
 * descending (best destinations first). The field context (e.g. mean happiness)
 * is computed once and shared across the scoring.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal[]} signals Signals.
 * @returns {(import("/emigration/ui/emigration-cities.js").CitySignal & {pros:number})[]} Ranked.
 */
export function rankByProsperity(signals) {
  const ctx = fieldContext(signals);
  const ranked = signals.map((s) => Object.assign(s, { pros: prosperity(s, ctx) }));
  ranked.sort((a, b) => b.pros - a.pros);
  return ranked;
}
