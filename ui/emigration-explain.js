// emigration-explain.js
//
// The one place "why" is worked out: push and pull decomposed into labeled, signed contributions. It has no
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
// The honesty rule: these are contributions to a model score, not a headcount or a probability. A
// caller must render them as relative weights ({@link weigh}), never as "-42% of your population".

import { pullBreakdown } from "/emigration/ui/emigration-pull.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { baseBreakdown, baseDetails, situationalBreakdown } from "/emigration/ui/emigration-prosperity.js";
import { disasterName } from "/emigration/ui/emigration-naming.js";
import { speedDecay } from "/emigration/ui/emigration-game-speed.js";
import { loc } from "/emigration/ui/emigration-loc.js";

/**
 * One labeled contribution. `delta` is signed in score points (> 0 makes the settlement more
 * attractive); `kind` reads that sign from the migrant's side ("pull" draws people, "push" drives
 * them out); `scale` is the multiplicative permeability channel, excluded from the additive sum.
 * @typedef {{key:string, label:string, delta:number, kind:"pull"|"push"|"scale", factor?:number}} Factor
 */

// English fallbacks. Neutral, factual names for what the term is; the surfaces that phrase these
// for players own the prose. Capitalized, since these are row labels, not inline clauses.
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
  unsafe: "Under attack",
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
  warWeariness: "War weariness",
  // The ledger's own lines (explainLedger): the polity and built terms by piece, the economy by yield.
  wonders: "Wonders",
  buildings: "Buildings",
  government: "Government",
  celebration: "Celebrations",
  stage: "Happiness stage",
  happinessShaped: "Against the empire's average",
  capTrim: "Cap on what's built",
  food: "Food",
  production: "Production",
  gold: "Gold",
  science: "Science",
  culture: "Culture"
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
 * @returns {Factor|null}
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
 * Why people are drawn from `src` to `dest`, biggest factor first. The additive rows sum exactly to
 * the pair's `adjustedPull`; the permeability row is `kind:"scale"`, a multiplier not an addend, so
 * callers summing rows must skip it ({@link weigh} does). Returns [] for a pair that would not move anyone.
 * @param {*} src Source signal.
 * @param {*} dest Candidate destination signal.
 * @param {{flee?:{x:number,y:number}|null, ownerPop?:Record<number,number>|null,
 *   aggressors?:Set<number>|null}} [ctx] The pass context `adjustedPull` is scored with.
 * @returns {Factor[]}
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
 * aggressors", the same neutral inputs the sim itself passes when those are unknown.
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
 * exactly neutral: there is nothing to say about a border that changed nothing.
 * @param {number} gross The summed additive terms, before the multiply.
 * @param {number} scale The clamped permeability multiplier.
 * @returns {Factor|null}
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
 * driving people out; positive rows are holding them. The situational penalties are percentages of
 * the base score, converted to points against `|base|`: the magnitude keeps every penalty a push
 * even when the base has gone negative, and is the exact contribution for a positive base.
 * @param {*} s The settlement's signal.
 * @param {{meanHappiness:number}|null} [ctx] Per-pass field context (shaped happiness model).
 * @returns {Factor[]}
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
 * the only form these numbers should reach a player in. Multiplicative (`kind:"scale"`) rows are
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

/**
 * @typedef {Object} LedgerLine One line under a ledger row.
 * @property {string} label
 * @property {number} [delta] Its points, when the line is an addend of the row.
 * @property {string} [note] Context when it isn't ("28 people", "15% of the base score").
 */

/** @typedef {Factor & {sub:LedgerLine[]}} LedgerRow A ledger row with the lines its accordion opens to. */

/** The rows a ledger always shows, zero or not (the owner, 2026-10-26: "on their own lines"). */
const LEDGER_ALWAYS = new Set(["wonders", "buildings", "government", "celebration"]);

/**
 * The prosperity ledger: {@link explainPush}'s accounting with the polity and built terms split into their pieces
 * as rows of their own (Wonders, Buildings, Government, Celebrations; the happiness-stage piece joins the Happiness
 * row), and under each row the lines its accordion opens to: the economy by yield, the credited wonders and
 * buildings, and a note where a term is one formula. The rows still sum to the score exactly. Biggest first, the
 * four named rows kept even at zero, every other zero row dropped.
 * @param {*} s The settlement's signal.
 * @param {{meanHappiness:number}|null} [ctx] Per-pass field context.
 * @returns {LedgerRow[]}
 */
export function explainLedger(s, ctx) {
  if (!s) return [];
  const base = baseBreakdown(s, ctx || null);
  const d = baseDetails(s, ctx || null);
  const sum = BASE_KEYS.reduce((n, k) => n + base[k], 0);
  const rows = baseRows(s, base, d);
  const sit = situationalBreakdown(s);
  for (const k of SIT_KEYS) {
    const pct = loc("LOC_EMIG_LEDGER_PCT_NOTE", "{1_Pct}% of the base", Math.round(Math.abs(sit[k])));
    pushRow(rows, k, Math.abs(sum) * sit[k] / 100, k === "disaster" ? disasterLines(s, pct) : [{ label: factorLabel(k), note: pct }]);
  }
  return rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * Adds a ledger row, unless it would print as 0.0 and isn't one of the rows always shown.
 * @param {LedgerRow[]} rows @param {string} key @param {number} delta @param {LedgerLine[]} sub
 */
function pushRow(rows, key, delta, sub) {
  if (!isFinite(delta)) return;
  if (Math.abs(delta) < 0.05 && !LEDGER_ALWAYS.has(key)) return;
  rows.push({ key, label: factorLabel(key), delta, kind: delta > 0 ? "pull" : "push", sub });
}

/**
 * The base terms as ledger rows: the economy with its yields, happiness with its two pieces, population, the
 * local character, the wonders and the buildings each with what was credited, the government and the celebration.
 * @param {*} s The signal. @param {import("/emigration/ui/emigration-prosperity.js").BaseTerms} base
 * @param {import("/emigration/ui/emigration-prosperity.js").BaseDetails} d @returns {LedgerRow[]}
 */
function baseRows(s, base, d) {
  /** @type {LedgerRow[]} */
  const rows = [];
  pushRow(rows, "economy", base.economy, ["food", "production", "gold", "science", "culture"]
    .map((k) => ({ label: factorLabel(k), delta: d.economy[/** @type {keyof typeof d.economy} */ (k)] })));
  pushRow(rows, "happiness", base.happiness + d.polity.stage, [
    { label: factorLabel("happinessShaped"), delta: base.happiness,
      note: loc("LOC_EMIG_LEDGER_HAPPY_NOTE", "{1_H} here, {2_Mean} across the empire",
        round1(d.happiness.h), round1(d.happiness.mean)) },
    { label: factorLabel("stage"), delta: d.polity.stage }
  ]);
  pushRow(rows, "population", base.population, [{ label: factorLabel("population"),
    note: loc("LOC_EMIG_LEDGER_POP_NOTE", "{1_Pop} people", Math.round(s.population || 0)) }]);
  pushRow(rows, "civBias", base.civBias, []);
  const item = (/** @type {{name:string, points:number}} */ i) => ({ label: loc(i.name, i.name), delta: i.points });
  pushRow(rows, "wonders", d.built.wonders, d.built.items.filter((i) => i.wonder).map(item));
  const buildings = d.built.items.filter((i) => !i.wonder).map(item);
  if (d.built.trim > 0) buildings.push({ label: factorLabel("capTrim"), delta: -d.built.trim });
  pushRow(rows, "buildings", d.built.buildings, buildings);
  pushRow(rows, "government", d.polity.government, [{ label: factorLabel("government"), note: governmentNote(s) }]);
  pushRow(rows, "celebration", d.polity.celebration, [{ label: factorLabel("celebration"),
    note: s.polity && s.polity.celebrating ? loc("LOC_EMIG_LEDGER_CELEBRATING", "celebrating now")
      : loc("LOC_EMIG_LEDGER_NOT_CELEBRATING", "no celebration running") }]);
  return rows;
}

/**
 * The line under Disaster: the disaster by name, with the turns its distress has left before it fades (the owner,
 * 2026-10-26: "their name and then in parenthesis turns remaining"). Distress decays by `disasterDecay` a turn at
 * this game speed and is dropped under 0.05, so the turns left follow from the current level.
 * @param {*} s The signal. @param {string} pct The share-of-base note. @returns {LedgerLine[]}
 */
function disasterLines(s, pct) {
  const d = Number(s.disaster) || 0;
  const f = speedDecay(CONFIG_DISASTER_DECAY());
  const turns = d > 0.05 && f > 0 && f < 1 ? Math.ceil(Math.log(0.05 / d) / Math.log(f)) : 0;
  const name = s.disasterType ? disasterName(s.disasterType) : factorLabel("disaster");
  const left = turns > 0 ? loc("LOC_EMIG_LEDGER_TURNS_LEFT", "{1_Turns} turns remaining", turns) : loc("LOC_EMIG_LEDGER_FADING", "fading");
  return [{ label: name, note: left + " \u00b7 " + pct }];
}

/** @returns {number} The configured per-turn disaster decay, read late so a tuning change shows at once. */
function CONFIG_DISASTER_DECAY() {
  return Number(CONFIG.disasterDecay) || 0;
}

/** @param {number} n @returns {string} */
function round1(n) {
  return (Math.round(n * 10) / 10).toFixed(1);
}

/** @param {*} s @returns {string} The government's name for the ledger, or that it wasn't read. */
function governmentNote(s) {
  const g = s.polity && typeof s.polity.government === "string" ? s.polity.government : "";
  if (!g) return loc("LOC_EMIG_LEDGER_NO_GOVT", "no government read");
  const words = g.replace(/^GOVERNMENT_/, "").toLowerCase().replace(/_/g, " ");
  return loc("LOC_" + g + "_NAME", words.charAt(0).toUpperCase() + words.slice(1));
}
