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
 * The 1.4.1 POLITY bonus added to a city's base attractiveness (0 when polityModelEnabled is off, or
 * when the signal predates the polity fields). Three bounded, additive terms, all scaled by the
 * per-civ happinessPull so the civ-tuning table still modulates them:
 *  • happinessStageWeight × stage - a magnitude-insensitive ordinal happiness response (1.4.1
 *    formalized happiness into 5 stages); complements the field-relative term so the patch's sharper
 *    happiness swings get a bounded voice without re-tuning the raw-magnitude knobs.
 *  • celebrationPull while the civ is in a Golden Age - now a scarcer, tourism-feeding attractor.
 *  • the clamped government flavor lean - a tie-breaker (most government effect already reaches the
 *    model through happiness/yields, so this is deliberately small).
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @param {import("/emigration/ui/emigration-civ-tuning.js").CivTuning} tune Civ tuning.
 * @returns {number} The polity bonus (signed).
 */
function polityBonus(s, tune) {
  if (!CONFIG.polityModelEnabled) return 0;
  // The stage term is PULL-BIASED. On the misery side an unhappy city is already strongly repelled by
  // the happiness term AND by its now-harsher (−5%/point, 1.4.1) suppressed yields, so a full-weight
  // negative stage would triple-count; it's scaled down by happinessStageMiseryScale. On the happy
  // side positive happiness does NOT boost yields in 1.4.1 (it feeds celebrations), so the attraction
  // of happy/joyous/ecstatic settlements is genuinely under-modeled and gets full weight.
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
 * The signed terms of {@link baseScore}, in score points, summing to it exactly. `economy` carries
 * the shaped model's happiness AMPLIFICATION (it is `productiveness × mult`, kept as one term so the
 * sum reproduces `baseScore` bit-for-bit rather than re-associating the multiply); `happiness` is
 * then only the standalone happiness term. `population` is already negated.
 * @typedef {{economy:number, happiness:number, population:number, civBias:number, polity:number}} BaseTerms
 */

/**
 * The base (pre-situational) attractiveness of a city, decomposed. THE source of truth for the base
 * score: {@link baseScore} is just its sum, so the explainer (emigration-explain.js) and the score
 * can never disagree. Two models:
 *  • legacy linear (default): productiveness + happiness·w − pop·w
 *  • shaped (Algorithm A): happiness is field-relative and saturating, and it
 *    AMPLIFIES the economy (bounded multiplier) plus a bounded standalone term,
 *    so a happy-but-poor city can't run away and misery still steeply repels.
 * Both apply the per-civ overcrowding discount, happiness-pull, and source bias.
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
    polity: polityBonus(s, tune)
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
 * their declared order so the arithmetic is identical to the pre-decomposition implementation.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @param {{meanHappiness:number}|null} ctx Per-pass context (for the shaped model).
 * @returns {number} Base score.
 */
function baseScore(s, ctx) {
  const b = baseBreakdown(s, ctx);
  return b.economy + b.happiness + b.population + b.civBias + b.polity;
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
    // 1.4.1 war weariness: an empire-wide unhappiness from prolonged war, distinct from the in-border
    // violence terms above. A modest push that composes with (and is dominated by) violence, so a city
    // already under siege isn't double-punished.
    warWeariness: CONFIG.polityModelEnabled && s.polity && s.polity.warWeary ? CONFIG.warWearinessModifier : 0
  };
}

/**
 * Sum of situational percent modifiers for a city (violence, disaster, siege,
 * starvation, unrest), summed in the terms' declared order so the arithmetic is identical to the
 * pre-decomposition implementation.
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @returns {number} Total percent (e.g. -210 means -210%).
 */
function situationalPercent(s) {
  const b = situationalBreakdown(s);
  return b.violence + b.disaster + b.siege + b.starvation + b.unrest + b.warWeariness;
}

/**
 * A city's distress: the magnitude of its negative situational percent (violence,
 * disaster, siege, starvation, unrest, war weariness). 0 when the city is content. This is the FULL
 * push measure - it drives prosperity/attractiveness and the per-city readout, so unrest lowers a
 * city's standing and pushes economic emigration the moment it appears. The DEATH gate uses the
 * narrower `lethalDistress` instead (unrest only kills after sustained neglect).
 * @param {import("/emigration/ui/emigration-cities.js").CitySignal} s Signal.
 * @returns {number} Distress (>= 0).
 */
export function distress(s) {
  const pct = situationalPercent(s);
  return pct < 0 ? -pct : 0;
}

/**
 * A city's LETHAL distress: the magnitude of the negative situational terms that can KILL. The
 * immediate crises - violence, disaster, siege, famine - plus war weariness always count. Unrest is
 * lethal TOO, but only after sustained neglect, so the caller (the engine, which alone tracks the
 * unrest tenure) passes `unrestCounts` once the city has been in unrest long enough. Below that gate
 * unrest still shows up in `distress`/prosperity (it pushes economic emigration) but not here, so a
 * peaceful unrest city bleeds migrants immediately yet only starts dying after prolonged neglect.
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
  // F2: situationalPercent can drop below −100 (siege+starvation+unrest stack), making
  // factor negative. For a positive base that correctly slides the score negative (a
  // routed city is unattractive). But a NEGATIVE base (poor, unhappy, high-pop) × a
  // negative factor flips the product POSITIVE, ranking a devastated city as an
  // attractive destination. Force the magnitude negative in exactly that case so
  // distress can never make a poor city read as a magnet.
  if (base < 0 && factor < 0) p = -Math.abs(p);
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
