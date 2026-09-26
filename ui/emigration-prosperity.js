// emigration-prosperity.js
//
// The per-city Prosperity score that drives emigration:
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
import { governmentLean } from "/emigration/ui/emigration-polity.js";

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
  // population^popExponent, not population. A straight per-head average divides away everything a
  // settlement has built in proportion to its own size, so a big city could never out-build the flat
  // populationFactor penalty; an exponent below 1 lets it keep more of what it has. See CONFIG.
  const pop = Math.max(1, s.population);
  const e = Number(CONFIG.popExponent);
  const divisor = Number.isFinite(e) && e > 0 && e < 1 ? Math.pow(pop, e) : pop;
  return weighted / divisor;
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
 * the shaped happiness model centers on). Computed once per ranking.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal[]} signals
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
 * The happiness value used for scoring: net happiness plus the overcrowding discount, a credit-back
 * for unhappiness that is the cost of urban density (which already suppresses yields), so tall play
 * isn't double-punished. The per-civ table can override the discount.
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
 * The POLITY bonus added to a city's base attractiveness (0 when polityModelEnabled is off, or when
 * the signal lacks the polity fields): happinessStageWeight × stage, celebrationPull while the civ
 * celebrates, and a clamped government lean, all scaled by the per-civ happinessPull.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @param {import("/emigration/ui/emigration-civ-tuning.js").CivTuning} tune Civ tuning.
 * @returns {number} The polity bonus (signed).
 */
function polityBonus(s, tune) {
  if (!CONFIG.polityModelEnabled) return 0;
  // The stage term is PULL-BIASED: an unhappy city is already repelled by the happiness term and its
  // suppressed yields, so a negative stage is scaled down by happinessStageMiseryScale, while positive
  // happiness does not boost yields and so gets full weight.
  const stage = s.stage || 0;
  const stageW = stage >= 0
    ? CONFIG.happinessStageWeight
    : CONFIG.happinessStageWeight * CONFIG.happinessStageMiseryScale;
  let b = stageW * stage * tune.happinessPull;
  const p = s.polity;
  if (p) {
    if (p.celebrating) b += CONFIG.celebrationPull * tune.happinessPull;
    const lean = CONFIG.governmentWeight * governmentLean(p.government);
    b += clamp(lean, -CONFIG.governmentLeanCap, CONFIG.governmentLeanCap);
  }
  return b;
}

/**
 * The built-environment bonus: the settlement's wonders and civic infrastructure as a reason to stay,
 * read off the signal (emigration-built.js scores and caches it). Clamped defensively so a corrupted
 * or hand-edited signal cannot swamp the score, and 0 when the term is off or the signal predates it.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @returns {number} The bonus (>= 0).
 */
function builtBonus(s) {
  if (!CONFIG.builtEnabled) return 0;
  const v = Number(s && s.built);
  if (!Number.isFinite(v) || v <= 0) return 0;
  const cap = Number(CONFIG.builtCap);
  return Number.isFinite(cap) && cap > 0 ? Math.min(v, cap) : v;
}

/**
 * The signed terms of {@link baseScore}, in score points, summing to it exactly. `economy` is
 * `productiveness × mult` (the shaped model's happiness amplification); `happiness` is the
 * standalone happiness term; `population` is already negated.
 * @typedef {{economy:number, happiness:number, population:number, civBias:number, polity:number,
 *   built:number}} BaseTerms
 */

/**
 * The base (pre-situational) attractiveness of a city, decomposed; {@link baseScore} is just its sum,
 * so the explainer (emigration-explain.js) and the score can never disagree. Linear model:
 * productiveness + happiness·w − pop·w; shaped model: happiness is field-relative and saturating and
 * AMPLIFIES the economy (bounded multiplier) plus a bounded standalone term.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @param {{meanHappiness:number}|null} ctx Per-pass context (for the shaped model).
 * @returns {BaseTerms} The base terms.
 */
export function baseBreakdown(s, ctx) {
  const tune = civTuning(s.owner);
  const prod = productiveness(s);
  const h = happinessForScore(s, tune);
  const common = {
    population: -(s.population * CONFIG.populationFactor),
    civBias: tune.sourceBias,
    polity: polityBonus(s, tune),
    // NOT divided by population and NOT scaled by happiness: what a settlement has built is a reason to
    // stay in its own right, and the yields those buildings produce are already counted in `economy`.
    built: builtBonus(s)
  };
  if (!CONFIG.happinessShaped) {
    const happy = h * CONFIG.localHappinessFactor * tune.happinessPull;
    return Object.assign({ economy: prod, happiness: happy }, common);
  }
  const mean = ctx && typeof ctx.meanHappiness === "number" ? ctx.meanHappiness : 0;
  const hNorm = Math.tanh((h - mean) / CONFIG.happyScale);
  const hShaped = (hNorm >= 0 ? hNorm : hNorm * CONFIG.happyRepulsion) * tune.happinessPull;
  const mult = clamp(1 + CONFIG.happyAmp * hShaped, CONFIG.happyMultMin, CONFIG.happyMultMax);
  return Object.assign({ economy: prod * mult, happiness: CONFIG.happyFloor * hShaped }, common);
}

/**
 * The base (pre-situational) attractiveness of a city: the sum of {@link baseBreakdown}'s terms, in
 * their declared order.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @param {{meanHappiness:number}|null} ctx Per-pass context (for the shaped model).
 * @returns {number} Base score.
 */
function baseScore(s, ctx) {
  const b = baseBreakdown(s, ctx);
  return b.economy + b.happiness + b.population + b.civBias + b.polity + b.built;
}

/**
 * The percent score penalty from violence inside the city's borders: a sliding scale that grows with
 * accumulated combat intensity up to a cap (a city with no fighting in its territory has zero penalty
 * even if its civ is at war elsewhere). Under warSiege it is scaled by the siege-duration escalation.
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
 * The percent penalty from environmental-disaster distress: a sliding scale up
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
 * The situational percent modifiers, one per source, summing to {@link situationalPercent}. Each is
 * a percent (e.g. -40 means -40%) and each is a penalty under the shipped constants.
 * @typedef {{violence:number, disaster:number, siege:number, starvation:number, unrest:number,
 *   warWeariness:number}} SituationalTerms
 */

/**
 * The situational percent modifiers for a city, decomposed by source. THE source of truth:
 * {@link situationalPercent} is just its sum, so the explainer (emigration-explain.js) reads the
 * same numbers the score does rather than re-deriving them.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @returns {SituationalTerms} The per-source percents.
 */
export function situationalBreakdown(s) {
  return {
    violence: violencePercent(s),
    disaster: disasterPercent(s),
    siege: s.siege ? CONFIG.siegeModifier : 0,
    starvation: s.starving ? CONFIG.starvationModifier : 0,
    unrest: s.unrest ? CONFIG.unrestModifier : 0,
    // War weariness: an empire-wide unhappiness from prolonged war, distinct from the in-border
    // violence terms above; a modest push dominated by violence, so a besieged city isn't double-punished.
    warWeariness: CONFIG.polityModelEnabled && s.polity && s.polity.warWeary ? CONFIG.warWearinessModifier : 0
  };
}

/**
 * Sum of situational percent modifiers for a city (violence, disaster, siege, starvation, unrest,
 * war weariness), in the terms' declared order.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @returns {number} Total percent (e.g. -210 means -210%).
 */
function situationalPercent(s) {
  const b = situationalBreakdown(s);
  return b.violence + b.disaster + b.siege + b.starvation + b.unrest + b.warWeariness;
}

/**
 * A city's distress: the magnitude of its negative situational percent (violence, disaster, siege,
 * starvation, unrest, war weariness); 0 when content. The FULL push measure, driving attractiveness
 * and the per-city readout; the DEATH gate uses the narrower `lethalDistress` instead.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @returns {number} Distress (>= 0).
 */
export function distress(s) {
  const pct = situationalPercent(s);
  return pct < 0 ? -pct : 0;
}

/**
 * A city's LETHAL distress: the magnitude of the negative situational terms that can KILL. Violence,
 * disaster, siege, famine and war weariness always count; unrest counts only once the caller (which
 * tracks unrest tenure) passes `unrestCounts`, so a peaceful unrest city only starts dying after prolonged neglect.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @param {boolean} unrestCounts Whether sustained unrest has earned lethal status this pass.
 * @returns {number} Lethal distress (>= 0).
 */
export function lethalDistress(s, unrestCounts) {
  const b = situationalBreakdown(s);
  let pct = b.violence + b.disaster + b.siege + b.starvation + b.warWeariness;
  if (unrestCounts) pct += b.unrest;
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
  let p = base * factor;
  // situationalPercent can drop below −100 (siege+starvation+unrest stack), making factor negative;
  // a NEGATIVE base × a negative factor would flip the product POSITIVE, so force it negative there
  // so distress can never make a poor city read as a magnet.
  if (base < 0 && factor < 0) p = -Math.abs(p);
  return isFinite(p) ? p : 0;
}

/**
 * Attach a `pros` field to each signal and return them sorted by prosperity
 * descending (best destinations first). The field context (e.g. mean happiness)
 * is computed once and shared across the scoring.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal[]} signals
 * @returns {(import("/emigration/ui/emigration-cities.js").CitySignal & {pros:number})[]} Ranked.
 */
export function rankByProsperity(signals) {
  const ctx = fieldContext(signals);
  const ranked = signals.map((s) => Object.assign(s, { pros: prosperity(s, ctx) }));
  ranked.sort((a, b) => b.pros - a.pros);
  return ranked;
}
