// emigration-explain.js
//
// The single source of "WHY": push and pull decomposed into labeled, signed contributions. It has no
// config flag and renders nothing; its consumers (the explainer tooltip, the forecast, the advisor,
// the policy preview) gate themselves and format these rows, never re-deriving the reasoning.
//
// Both scores are sums that end in a multiply, so each contribution is exact arithmetic:
//
//   pull       = (Σ additive terms) × PERMEABILITY      → a term contributes  raw × permeability
//   prosperity = base × (1 + Σ situational%/100)        → a base term contributes its raw value,
//                                                         a situational% contributes base × %/100
//
// The terms come from the same breakdown functions the sim scores with (emigration-pull.js,
// emigration-prosperity.js), so an explanation can never drift from the decision it explains.
//
// THE HONESTY RULE: these are contributions to a MODEL SCORE, not a headcount or a probability. A
// caller must render them as RELATIVE WEIGHTS ({@link weigh}), never as "-42% of your population".

import { pullBreakdown } from "/emigration/ui/emigration-pull.js";
import { baseBreakdown, situationalBreakdown } from "/emigration/ui/emigration-prosperity.js";
import { loc } from "/emigration/ui/emigration-loc.js";

/**
 * One labeled contribution. `delta` is signed in score points (> 0 makes the settlement MORE
 * attractive); `kind` reads that sign from the migrant's side ("pull" draws people, "push" drives
 * them out); `scale` is the multiplicative permeability channel, EXCLUDED from the additive sum.
 * @typedef {{key:string, label:string, delta:number, kind:"pull"|"push"|"scale", factor?:number}} Factor
 */

// English fallbacks. Neutral, factual names for what the term IS - the surfaces that phrase these
// for players own the prose. Lowercase-free: these are row labels, not inline clauses.
/** @type {Record<string, string>} */
const FALLBACK = {
  // Pull-side terms (emigration-pull.js `pullBreakdown`).
  gradient: "Prosperity gap",
  tilt: "Targeted attraction",
  reluctance: "Reluctance to move",
  crowding: "Overcrowding",
  downsizing: "Leaving a larger settlement",
  cityState: "City-state barrier",
  crossCiv: "Foreign border",
  dominance: "Dominant power",
  drain: "Small civilization brake",
  internal: "Shelter at home",
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
  built: "Wonders & buildings",
  violence: "Fighting",
  disaster: "Disaster",
  siege: "Siege",
  starvation: "Famine",
  unrest: "Unrest",
  warWeariness: "War weariness"
};

// LOC keys, one per term; `loc()` resolves to the English fallback above when a key is undefined.
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
 * @param {Factor[]} rows
 * @returns {Factor[]} The same array, sorted.
 */
function byMagnitude(rows) {
  return rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * Why people are drawn from `src` to `dest`, biggest factor first. The additive rows sum EXACTLY to
 * the pair's `adjustedPull`; the permeability row is `kind:"scale"`, a multiplier not an addend, so
 * callers summing rows must skip it ({@link weigh} does). Returns [] for a pair that would not move anyone.
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
const BASE_KEYS = ["economy", "happiness", "population", "civBias", "polity", "built"];
/**
 * The situational percent terms, in their declared order.
 * @type {(keyof import("/emigration/ui/emigration-prosperity.js").SituationalTerms)[]}
 */
const SIT_KEYS = ["violence", "disaster", "siege", "starvation", "unrest", "warWeariness"];

/**
 * Why people are leaving `s`: its own prosperity decomposed, biggest factor first. Negative rows are
 * driving people out; positive rows are holding them. The situational penalties are percentages OF
 * the base score, converted to points against `|base|`: the magnitude keeps every penalty a push
 * even when the base has gone negative, and is the exact contribution for a positive base.
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
 * The honesty rule, applied: turn signed contributions into relative weights (`|delta| / Σ|delta|`),
 * the ONLY form these numbers should reach a player in. Multiplicative (`kind:"scale"`) rows are
 * excluded, since they are not addends.
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
