// emigration-diversity.js
//
// The COMPOSITION-DIVERSITY metrics and the "most diverse cities" ranking (roadmap Features S + T).
// Read-only over the composition ledger the sim already keeps — no model change, no balance risk.
//
//   • diversityScore(comp)      — Feature S's per-city metric (entropy, origins ≥ 5%, no-majority).
//   • cosmopolitanism(comp,ctx) — Feature T's derived 0..1 score → one of five COSMO_TIERS.
//   • rankDiversity(entries, …) — the ranking (sorted by entropy, capped).
//   • diverseCityRanking(…)     — the ranking over the live ledger (allCityCompositions).
//
// FRAMING (carry into every consumer): these describe the MIX of origins living in a settlement.
// They are not a quality judgment and grant no yields — T is explicitly cosmetic. All wording stays
// about "communities" and "composition"; never rank peoples.
//
// Everything here is pure and deterministic over its inputs. The engine-touching seam is confined to
// diverseCityRanking(), which reads the composition ledger and takes its per-owner lookups by
// INJECTION (opts.openness / opts.inbound) rather than importing the borders/stats modules — that
// keeps the metrics unit-testable off-engine and avoids an import cycle through emigration-borders.

import { allCityCompositions } from "/emigration/ui/emigration-composition.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";

/** A share at or above this counts as a distinct "community" in the headline count. */
const COMMUNITY_MIN_SHARE = 0.05;

/** Below this the dominant origin is a plurality, not a majority. */
const MAJORITY_SHARE = 0.5;

/**
 * The origin count whose even split reads as "maximally mixed" when normalizing entropy for the
 * cosmopolitanism blend. Entropy itself is left UNNORMALIZED for ranking (so a 5-way even city
 * outranks a 2-way even one); this reference only bounds the 0..1 score in cosmopolitanism().
 */
const DIVERSITY_REF_ORIGINS = 5;

/** The immigration-openness value that reads as fully open (matches CONFIG.openBordersOpenness). */
const OPENNESS_REF = 1.5;

/** Blend weights for the cosmopolitanism score (must sum to 1). */
const COSMO_W_DIVERSITY = 0.6;
const COSMO_W_OPENNESS = 0.2;
const COSMO_W_INBOUND = 0.2;

/**
 * The five cosmopolitanism tiers, ascending by `min` score. Descriptive labels only — the tier says
 * how MIXED a settlement's origins are, nothing about how good it is.
 * @type {readonly {key:string, min:number}[]}
 */
export const COSMO_TIERS = Object.freeze([
  { key: "homogeneous", min: 0 },
  { key: "local", min: 0.2 },
  { key: "mixed", min: 0.4 },
  { key: "center", min: 0.6 },
  { key: "world", min: 0.8 }
]);

/**
 * Clamp `v` into [0,1].
 * @param {number} v Value.
 * @returns {number} The clamped value (0 for non-finite input).
 */
function unit(v) {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * A finite number, or `fallback`. The lookups are injected by callers (and one reads a live engine
 * value), so a missing/NaN reading must degrade to the neutral default rather than poison the score.
 * @param {number|undefined} v The candidate.
 * @param {number} fallback The neutral default.
 * @returns {number} A finite number.
 */
function num(v, fallback) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Shannon entropy (natural log) over a composition's origin shares: 0 for a single-origin settlement,
 * maximal for an even split, and rising with the number of origins. Left unnormalized so the ranking
 * prefers a settlement with MORE communities over an evenly-split pair.
 * @param {{share:number}[]} civs Origin shares.
 * @returns {number} Entropy in nats (≥ 0).
 */
function entropy(civs) {
  let h = 0;
  for (const c of civs) {
    const p = c && c.share;
    if (!(p > 0)) continue; // a zero/absent bucket contributes nothing (p·ln p → 0)
    h -= p * Math.log(p);
  }
  return h;
}

/**
 * Feature S's per-settlement diversity metric.
 * @param {{civs:{civ:number, share:number}[], dominant:{civ:number, share:number}|null,
 *   owner:number}|null} comp A composition (compositionForCity / compositionForOwner shape).
 * @returns {{originsAbove5:number, index:number, largestNonOwner:number, noMajority:boolean}}
 *   The metric; all-zero / noMajority=false for an empty or unreadable composition.
 */
export function diversityScore(comp) {
  const civs = (comp && Array.isArray(comp.civs) ? comp.civs : []).filter((c) => c && c.share > 0);
  if (!civs.length) return { originsAbove5: 0, index: 0, largestNonOwner: 0, noMajority: false };
  const dom = comp && comp.dominant ? comp.dominant.share : 0;
  return {
    originsAbove5: civs.filter((c) => c.share >= COMMUNITY_MIN_SHARE).length,
    index: entropy(civs),
    largestNonOwner: largestNonOwnerShare(civs, comp ? comp.owner : null),
    // A single-origin settlement has a 100% dominant, so this is false there, as it should be.
    noMajority: dom > 0 && dom < MAJORITY_SHARE
  };
}

/**
 * The biggest share held by an origin OTHER than the host civ — the size of the largest diaspora.
 * @param {{civ:number, share:number}[]} civs The (non-empty, positive-share) origin shares.
 * @param {number|null} owner The host civ, whose own people don't count as a diaspora.
 * @returns {number} The share, or 0 when every origin is the host's own.
 */
function largestNonOwnerShare(civs, owner) {
  let largest = 0;
  for (const c of civs) if (c.civ !== owner && c.share > largest) largest = c.share;
  return largest;
}

/**
 * The tier key for a 0..1 cosmopolitanism score (the highest tier whose `min` it reaches).
 * @param {number} score The score.
 * @returns {string} A COSMO_TIERS key.
 */
function tierFor(score) {
  let key = COSMO_TIERS[0].key;
  for (const t of COSMO_TIERS) if (score >= t.min) key = t.key;
  return key;
}

/**
 * Feature T's derived cosmopolitanism score: how mixed, open and inbound-fed a settlement is, blended
 * into [0,1] and bucketed into five descriptive tiers. COSMETIC — grants no yields.
 * @param {*} comp A composition.
 * @param {{openness?:number, inboundNorm?:number}} [ctx] `openness` is the owner's immigration
 *   openness (1 = neutral); `inboundNorm` is its inbound flow normalized to the largest civ's (0..1).
 *   Both default to neutral, so the score degrades to pure diversity when unavailable.
 * @returns {{score:number, tierKey:string}} The score and its tier.
 */
export function cosmopolitanism(comp, ctx) {
  const c = ctx || {};
  const div = unit(diversityScore(comp).index / Math.log(DIVERSITY_REF_ORIGINS));
  const open = unit(num(c.openness, 1) / OPENNESS_REF);
  const inb = unit(num(c.inboundNorm, 0));
  const score = unit(COSMO_W_DIVERSITY * div + COSMO_W_OPENNESS * open + COSMO_W_INBOUND * inb);
  return { score, tierKey: tierFor(score) };
}

/**
 * The per-owner context for one settlement's cosmopolitanism, via the injected lookups.
 * @param {number} owner Owner player id.
 * @param {{openness?:(pid:number)=>number, inbound?:(pid:number)=>number}} opts Lookups.
 * @param {number} maxInbound The largest inbound total across owners (the normalizer).
 * @returns {{openness:number, inboundNorm:number}} The context.
 */
function cosmoCtx(owner, opts, maxInbound) {
  const openness = typeof opts.openness === "function" ? opts.openness(owner) : 1;
  const inbound = typeof opts.inbound === "function" ? opts.inbound(owner) : 0;
  return {
    openness: num(openness, 1),
    inboundNorm: maxInbound > 0 ? num(inbound, 0) / maxInbound : 0
  };
}

/**
 * The largest inbound total across the entries' owners — the normalizer that makes `inboundNorm`
 * relative to the busiest destination in the game rather than an arbitrary constant.
 * @param {*[]} entries Ledger entries ({owner}).
 * @param {{inbound?:(pid:number)=>number}} opts Lookups.
 * @returns {number} The max (0 when unavailable).
 */
function maxInboundOf(entries, opts) {
  if (typeof opts.inbound !== "function") return 0;
  let max = 0;
  for (const pid of new Set(entries.map((e) => e.owner))) {
    const v = opts.inbound(pid);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max;
}

/**
 * Rank settlements by diversity: score each, sort by entropy (descending), cap to `limit`. Ties break
 * on community count then name, so the order is stable across passes for an unchanged world.
 * @param {{key:string, name:string, owner:number, comp:*}[]} entries The ledger entries.
 * @param {{openness?:(pid:number)=>number, inbound?:(pid:number)=>number,
 *   visible?:(pid:number)=>boolean}} [opts] Per-owner lookups for the cosmopolitanism context
 *   (omitted → neutral openness, zero inbound), plus `visible`: the caller's spoiler-mask predicate.
 *   Hidden owners' settlements are dropped BEFORE the cap, so masking never spends a visible row.
 * @param {number} [limit] Max rows.
 * @returns {*[]} Ranked rows ({key, name, owner, total, civs, originsAbove5, index, noMajority,
 *   dominantCiv, dominantShare, runnerUpShare, cosmo}).
 */
export function rankDiversity(entries, opts, limit) {
  const o = opts || {};
  const vis = typeof o.visible === "function" ? o.visible : null;
  const src = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && e.comp && (!vis || vis(e.owner)));
  const maxInbound = maxInboundOf(src, o);
  const rows = src.map((e) => {
    const s = diversityScore(e.comp);
    const dom = e.comp.dominant;
    return {
      key: e.key, name: e.name, owner: e.owner, total: e.comp.total,
      // The raw origin breakdown, share-sorted. The VIEW needs it to draw the composition bar; it is
      // passed through unresolved (civ ids, not names/colours) so this module stays engine-free —
      // gather resolves and spoiler-masks it.
      civs: e.comp.civs,
      originsAbove5: s.originsAbove5, index: s.index, noMajority: s.noMajority,
      dominantCiv: dom ? dom.civ : null, dominantShare: dom ? dom.share : 0,
      // The second-largest origin's share: the view needs the GAP to the dominant one to tell a named
      // plurality ("Egyptian plurality") from a genuine scatter with no clear leader ("no majority").
      runnerUpShare: e.comp.civs.length > 1 ? e.comp.civs[1].share : 0,
      cosmo: cosmopolitanism(e.comp, cosmoCtx(e.owner, o, maxInbound))
    };
  });
  rows.sort((a, b) => (b.index - a.index)
    || (b.originsAbove5 - a.originsAbove5)
    || String(a.name).localeCompare(String(b.name)));
  const n = num(limit, 0) > 0 ? num(limit, 0) : rows.length;
  return rows.slice(0, n);
}

/**
 * The live "most diverse cities" ranking over the persisted composition ledger. Empty when the
 * feature is off or nothing is tracked yet (the ledger is empty until the first pass).
 * @param {{openness?:(pid:number)=>number, inbound?:(pid:number)=>number,
 *   visible?:(pid:number)=>boolean}} [opts] Per-owner lookups + the spoiler-mask predicate.
 * @param {number} [limit] Max rows (defaults to CONFIG.diversityRows).
 * @returns {*[]} Ranked rows (see rankDiversity).
 */
export function diverseCityRanking(opts, limit) {
  if (!CONFIG.diversityRanking) return [];
  return rankDiversity(allCityCompositions(), opts, num(limit, CONFIG.diversityRows));
}
