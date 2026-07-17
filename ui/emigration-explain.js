// emigration-explain.js
//
// The single source of "WHY": push and pull decomposed into labeled, signed contributions. This is
// INFRASTRUCTURE (roadmap §15.0a) - it has no config flag and renders nothing. Its consumers (the
// explainer tooltip, the forecast, the advisor, the policy preview) gate themselves and format these
// rows; they must never re-derive the reasoning.
//
// HOW THE ATTRIBUTION WORKS. Both scores are sums that end in a multiply, so each contribution is
// exact arithmetic, not an estimate:
//
//   pull       = (Σ additive terms) × PERMEABILITY      → a term contributes  raw × permeability
//   prosperity = base × (1 + Σ situational%/100)        → a base term contributes its raw value,
//                                                         a situational% contributes base × %/100
//
// The terms come from `pullBreakdown` (emigration-pull.js) and `baseBreakdown`/`situationalBreakdown`
// (emigration-prosperity.js), which are the same functions the sim scores with - so an explanation
// can never drift from the decision it explains. tests/explain.mjs pins that by reconstructing
// `adjustedPull`/`prosperity` from these rows.
//
// (The roadmap originally specced leave-one-out re-evaluation. That is unusable here - the factors
// live in CONFIG globals and private helpers, so neutralizing one would mean mutating global state,
// which is not pure and would race the engine's own stance counterfactual. It is also degenerate:
// for a sum-then-multiply the leave-one-out delta of a term IS `raw × permeability`, which is what
// this computes directly and exactly.)
//
// THE HONESTY RULE, and why it is load-bearing. These are contributions to a MODEL SCORE, not a
// headcount and not a probability. A caller must render them as RELATIVE WEIGHTS ({@link weigh}),
// never as "-42% of your population". The score has no unit a player would recognize; only the ratios
// between factors are meaningful. Every consumer inherits this rule.

import { pullBreakdown } from "/emigration/ui/emigration-pull.js";
import { baseBreakdown, situationalBreakdown } from "/emigration/ui/emigration-prosperity.js";
import { loc } from "/emigration/ui/emigration-loc.js";

/**
 * One labeled contribution.
 *  • `delta` is signed in score points: > 0 makes the settlement MORE attractive, < 0 less.
 *  • `kind` reads that sign from the migrant's side: "pull" draws people, "push" drives them out.
 *    (Both builders use this one rule, so a row means the same thing wherever it is rendered. The
 *    roadmap sketched a fixed `kind:"push"` for the push side; a fixed kind would have to lie about
 *    the terms that RETAIN people, which are exactly what an advisor needs to name.)
 *  • `scale` is the odd one out: the multiplicative permeability channel, reported for context and
 *    EXCLUDED from the additive sum (see {@link explainPull}).
 * @typedef {{key:string, label:string, delta:number, kind:"pull"|"push"|"scale", factor?:number}} Factor
 */

// English fallbacks. Neutral, factual names for what the term IS - the surfaces that phrase these
// for players (Feature L) own the prose. Lowercase-free: these are row labels, not inline clauses.
/** @type {Record<string, string>} */
const FALLBACK = {
  // Pull-side terms (emigration-pull.js `pullBreakdown`).
  gradient: "Prosperity gap",
  tilt: "Targeted attraction",
  reluctance: "Reluctance to move",
  crowding: "Overcrowding",
  cityState: "City-state barrier",
  crossCiv: "Foreign border",
  dominance: "Dominant power",
  distance: "Distance",
  aggressor: "Aggressor avoidance",
  flight: "Away from the fighting",
  congestion: "Congestion",
  permeability: "Border permeability",
  // Push-side terms (emigration-prosperity.js `baseBreakdown` / `situationalBreakdown`).
  economy: "Economy",
  happiness: "Happiness",
  population: "Population size",
  civBias: "Local character",
  polity: "Government & celebrations",
  violence: "Fighting",
  disaster: "Disaster",
  siege: "Siege",
  starvation: "Famine",
  unrest: "Unrest",
  warWeariness: "War weariness"
};

// LOC keys, one per term. Defined alongside the first surface that RENDERS them (Feature L); until
// then `loc()` resolves to the English fallback above, which is why this module ships no player-
// visible string of its own and adds no locale-parity debt.
/** @type {Record<string, string>} */
const LOC = Object.keys(FALLBACK).reduce((m, k) => {
  m[k] = "LOC_EMIG_EXPLAIN_" + k.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase();
  return m;
}, /** @type {Record<string, string>} */({}));

/**
 * The display label for a term key.
 * @param {string} key The term key.
 * @returns {string} The localized (or English) label.
 */
export function factorLabel(key) {
  const fb = FALLBACK[key];
  return fb ? loc(LOC[key], fb) : key;
}

/**
 * Build a {@link Factor} row, or null when the term contributes nothing (a zero row is noise, and
 * dropping it cannot change a sum).
 * @param {string} key The term key.
 * @param {number} delta The signed contribution in score points.
 * @returns {Factor|null} The row, or null.
 */
function row(key, delta) {
  if (!delta || !isFinite(delta)) return null;
  return { key, label: factorLabel(key), delta, kind: delta > 0 ? "pull" : "push" };
}

/**
 * Sort rows by magnitude, biggest contribution first. Ties keep insertion order (stable sort), which
 * is the terms' declared order, so the output is deterministic.
 * @param {Factor[]} rows The rows.
 * @returns {Factor[]} The same array, sorted.
 */
function byMagnitude(rows) {
  return rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * Why people are drawn from `src` to `dest`, biggest factor first.
 *
 * The additive rows sum EXACTLY to the pair's `adjustedPull` (each is its raw term × the clamped
 * permeability). The permeability row is `kind:"scale"` and is NOT part of that sum: it is a
 * multiplier, not an addend, so its `factor` (the multiplier itself) is the honest number and its
 * `delta` merely records how many points the multiply moved the total. Callers summing rows must
 * skip `kind === "scale"`; {@link weigh} already does.
 *
 * Returns [] for a pair that would not move anyone - `adjustedPull` returning null means there is no
 * decision to explain.
 * @param {*} src Source signal.
 * @param {*} dest Candidate destination signal.
 * @param {{flee?:{x:number,y:number}|null, ownerPop?:Record<number,number>|null,
 *   aggressors?:Set<number>|null}} [ctx] The pass context `adjustedPull` is scored with.
 * @returns {Factor[]} The labeled contributions, or [].
 */
export function explainPull(src, dest, ctx) {
  if (!src || !dest) return [];
  const b = breakdownFor(src, dest, ctx);
  if (b.reject) return [];
  /** @type {Factor[]} */
  const rows = [];
  let gross = 0;
  for (const t of b.terms) {
    gross += t.raw;
    const r = row(t.key, t.raw * b.scale);
    if (r) rows.push(r);
  }
  byMagnitude(rows);
  const perm = scaleRow(gross, b.scale);
  if (perm) rows.push(perm);
  return rows;
}

/**
 * Score the pair, filling in an absent pass context as "no flee vector / no population data / no
 * aggressors" - the same neutral inputs the sim itself passes when those are unknown.
 * @param {*} src Source signal.
 * @param {*} dest Candidate destination signal.
 * @param {{flee?:*, ownerPop?:*, aggressors?:*}} [ctx] The pass context.
 * @returns {import("/emigration/ui/emigration-pull.js").PullBreakdown} The itemized pull.
 */
function breakdownFor(src, dest, ctx) {
  const c = ctx || {};
  return pullBreakdown(src, dest, c.flee || null, c.ownerPop || null, c.aggressors || null);
}

/**
 * The permeability row: the multiplicative channel, reported for context. Null when the multiplier is
 * exactly neutral - there is nothing to say about a border that changed nothing.
 * @param {number} gross The summed additive terms, before the multiply.
 * @param {number} scale The clamped permeability multiplier.
 * @returns {Factor|null} The row, or null.
 */
function scaleRow(gross, scale) {
  if (scale === 1) return null;
  return {
    key: "permeability",
    label: factorLabel("permeability"),
    delta: gross * scale - gross,
    kind: "scale",
    factor: scale
  };
}

/**
 * The base terms of a settlement's prosperity, in their declared order.
 * @type {(keyof import("/emigration/ui/emigration-prosperity.js").BaseTerms)[]}
 */
const BASE_KEYS = ["economy", "happiness", "population", "civBias", "polity"];
/**
 * The situational percent terms, in their declared order.
 * @type {(keyof import("/emigration/ui/emigration-prosperity.js").SituationalTerms)[]}
 */
const SIT_KEYS = ["violence", "disaster", "siege", "starvation", "unrest", "warWeariness"];

/**
 * Why people are leaving `s`: its own prosperity decomposed, biggest factor first. Negative rows are
 * driving people out; positive rows are holding them.
 *
 * The situational penalties are percentages OF the base score, so they are converted to points
 * against `|base|`. The absolute value matters: for a base that has already gone negative (a poor,
 * unhappy, high-population city) a signed multiply would flip a penalty's sign and report "your
 * siege is +3 attractiveness". That is what the model's own F2 guard exists to stop, and it is not
 * something to hand a player. Using the magnitude keeps every penalty a push, and for the ordinary
 * positive-base case it is exactly the true contribution (see tests/explain.mjs, which reconstructs
 * `prosperity()` from these rows whenever the base is positive).
 * @param {*} s The settlement's signal.
 * @param {{meanHappiness:number}|null} [ctx] Per-pass field context (shaped happiness model).
 * @returns {Factor[]} The labeled contributions, or [].
 */
export function explainPush(s, ctx) {
  if (!s) return [];
  const base = baseBreakdown(s, ctx || null);
  const sit = situationalBreakdown(s);
  let sum = 0;
  for (const k of BASE_KEYS) sum += base[k];
  const rows = [];
  for (const k of BASE_KEYS) {
    const r = row(k, base[k]);
    if (r) rows.push(r);
  }
  for (const k of SIT_KEYS) {
    const r = row(k, Math.abs(sum) * sit[k] / 100);
    if (r) rows.push(r);
  }
  return byMagnitude(rows);
}

/**
 * The honesty rule, applied: turn signed contributions into relative weights, each factor's share of
 * the total movement in the score (`|delta| / Σ|delta|`, so the weights sum to ~1). This is the ONLY
 * form these numbers should reach a player in - the raw deltas are model points with no meaning
 * outside their ratios. Multiplicative (`kind:"scale"`) rows are excluded: they are not addends and
 * would double-count.
 * @param {Factor[]} rows Rows from {@link explainPull} or {@link explainPush}.
 * @returns {(Factor & {weight:number})[]} The rows with a `weight` in [0, 1], biggest first.
 */
export function weigh(rows) {
  const add = (rows || []).filter((r) => r.kind !== "scale");
  let total = 0;
  for (const r of add) total += Math.abs(r.delta);
  if (!(total > 0)) return [];
  return add.map((r) => Object.assign({ weight: Math.abs(r.delta) / total }, r));
}
