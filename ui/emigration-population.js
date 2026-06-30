// emigration-population.js
//
// Population read/write + the Demographics-aligned scaling that turns Civ's
// abstract population points (1, 2, 3, …) into historically representative
// people counts (thousands … hundreds of millions).
//
// The scaling formula is IDENTICAL to the Demographics mod's
// scaleCityPopulationAt(raw, turn, ageType, ageProgressPct), so a town's
// population reads the same in both mods, and a migration of one population
// point reports the marginal people that one point represents.

// ── Population scaling — grounded in Civ VII's REAL per-era growth formula ──────────────────────────
// IDENTICAL to Demographics' demographics-metrics-helpers.js (eraGrowthParams / growthEffort /
// scaleCityPopulationAt), pinned by scaling-demographics-parity.mjs, so a town reads the same in both
// mods. Civ VII charges food per size step, cost(x)=Flat+Scalar·x+Exponent·x², with per-AGE params;
// W(N)=Σcost(1..N) is a settlement's demographic weight and POP_K turns it into people. Per-age by
// construction, continuous across age boundaries (params blend), no turn-based multiplier.
/** @type {Record<string, {flat:number,scalar:number,exp:number}>} */
const ERA_GROWTH_PARAMS = {
  AGE_ANTIQUITY: { flat: 5, scalar: 20, exp: 4 },
  AGE_EXPLORATION: { flat: 30, scalar: 50, exp: 5 },
  AGE_MODERN: { flat: 60, scalar: 60, exp: 6 }
};
const ERA_ORDER = ["AGE_ANTIQUITY", "AGE_EXPLORATION", "AGE_MODERN"];
const POP_K = 31; // people per food-unit — the single global scale anchor
const BLEND_PCT = 25; // blend prev→cur era params over the first 25% of an age (cross-age continuity)
// Modern-only megacity bump (super-linear above MEGA_KNEE, age-ramped) + per-era ceiling with smooth
// C¹ saturation. Mirrors Demographics; doubles as the safety bound (any out-of-range size degrades to
// the era's max-city, never billions). See demographics-metrics-helpers.js.
const MEGA_KNEE = 35;
const MEGA_STRENGTH = 5.0;
const MEGA_POW = 1.3;
/** @type {Record<string, number>} */
const ERA_CEILING = { AGE_ANTIQUITY: 1.6e6, AGE_EXPLORATION: 2.5e6, AGE_MODERN: 38e6 };
const CEIL_KNEE = 0.7;
// "One more turn": Modern ceiling expands once age-progress runs past 100% (overtime). Smoothstep-eased
// (C¹ at p=100) and capped at OVERTIME_MAX so it can never resurrect a multi-billion city. Mirrors Demographics.
const OVERTIME_CEILING_RATE = 1.0;
const OVERTIME_EASE = 0.1;
const OVERTIME_MAX = 5;

/**
 * Smoothstep on [0,1].
 * @param {number} x Input.
 * @returns {number} Smoothed value.
 */
function smoothstep(x) {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
}

/**
 * Effective per-era growth params for an age, blended from the previous era's over the opening
 * BLEND_PCT so the people curve is continuous across age boundaries.
 * @param {string | undefined} ageType Age type.
 * @param {number | undefined} ageProgressPct Age progress percent [0,100].
 * @returns {{flat:number,scalar:number,exp:number}} Effective params.
 */
function eraGrowthParams(ageType, ageProgressPct) {
  const key = typeof ageType === "string" && ERA_GROWTH_PARAMS[ageType] ? ageType : "AGE_EXPLORATION";
  const cur = ERA_GROWTH_PARAMS[key];
  const idx = ERA_ORDER.indexOf(key);
  const prev = idx > 0 ? ERA_GROWTH_PARAMS[ERA_ORDER[idx - 1]] : cur;
  if (prev === cur) return cur;
  const p = typeof ageProgressPct === "number" && isFinite(ageProgressPct) ? ageProgressPct : 100;
  const s = smoothstep(p / BLEND_PCT);
  if (s <= 0) return prev; // exact at the boundary (bit-identical continuity)
  if (s >= 1) return cur;
  return {
    flat: prev.flat + (cur.flat - prev.flat) * s,
    scalar: prev.scalar + (cur.scalar - prev.scalar) * s,
    exp: prev.exp + (cur.exp - prev.exp) * s
  };
}

/**
 * Cumulative growth effort W(N) = Flat·N + Scalar·N(N+1)/2 + Exp·N(N+1)(2N+1)/6 for size N.
 * @param {number} n Settlement size. @param {{flat:number,scalar:number,exp:number}} params Era params.
 * @returns {number} The cumulative effort (0 for non-positive size).
 */
function growthEffort(n, params) {
  if (typeof n !== "number" || !isFinite(n) || n <= 0) return 0;
  const s1 = (n * (n + 1)) / 2;
  const s2 = (n * (n + 1) * (2 * n + 1)) / 6;
  return params.flat * n + params.scalar * s1 + params.exp * s2;
}

/**
 * Modern-only megacity multiplier (super-linear above MEGA_KNEE, ramped by age-progress). Mirrors
 * Demographics. 1 for non-Modern ages, sizes ≤ knee, or the opening of the Modern age.
 * @param {number} n Settlement size.
 * @param {string|undefined} ageType Age.
 * @param {number|undefined} ageProgressPct Progress %.
 * @returns {number} Multiplier (>= 1).
 */
function modernMegacityBoost(n, ageType, ageProgressPct) {
  if (ageType !== "AGE_MODERN" || n <= MEGA_KNEE) return 1;
  const p = typeof ageProgressPct === "number" && isFinite(ageProgressPct) ? ageProgressPct : 100;
  const ramp = smoothstep((p / 100 - 0.1) / 0.8);
  if (ramp <= 0) return 1;
  return 1 + MEGA_STRENGTH * ramp * Math.pow((n - MEGA_KNEE) / MEGA_KNEE, MEGA_POW);
}

/**
 * Per-era population ceiling, blended (geometric) across boundaries. Mirrors Demographics.
 * @param {string|undefined} ageType Age. @param {number|undefined} ageProgressPct Progress %.
 * @returns {number} Ceiling (people).
 */
function eraCeiling(ageType, ageProgressPct) {
  const key = typeof ageType === "string" && ERA_CEILING[ageType] ? ageType : "AGE_EXPLORATION";
  const cur = ERA_CEILING[key];
  const idx = ERA_ORDER.indexOf(key);
  const prev = idx > 0 ? ERA_CEILING[ERA_ORDER[idx - 1]] : cur;
  if (prev === cur) return cur;
  const p = typeof ageProgressPct === "number" && isFinite(ageProgressPct) ? ageProgressPct : 100;
  const s = smoothstep(p / BLEND_PCT);
  if (s <= 0) return prev; // exact at the boundary (bit-identical continuity)
  if (s >= 1) return cur;
  return Math.exp(Math.log(prev) + (Math.log(cur) - Math.log(prev)) * s);
}

/**
 * Endgame ("one more turn") ceiling multiplier — grows once the final age runs past 100%. Mirrors
 * Demographics. Modern-only.
 * @param {string|undefined} ageType Age. @param {number|undefined} ageProgressPct Progress % (may exceed 100).
 * @returns {number} Multiplier (>= 1).
 */
function overtimeCeilingFactor(ageType, ageProgressPct) {
  if (ageType !== "AGE_MODERN") return 1;
  if (typeof ageProgressPct !== "number" || !isFinite(ageProgressPct) || ageProgressPct <= 100) return 1;
  const over = (ageProgressPct - 100) / 100;
  const grown = OVERTIME_CEILING_RATE * over * smoothstep(over / OVERTIME_EASE);
  return 1 + Math.min(OVERTIME_MAX - 1, grown);
}

/**
 * Smoothly saturate `x` toward `ceiling` (C¹: identity below CEIL_KNEE·ceiling, exponential approach
 * above, never exceeding the ceiling). The safety bound. Mirrors Demographics.
 * @param {number} x Raw figure. @param {number} ceiling Asymptotic max.
 * @returns {number} Saturated figure.
 */
function softCeil(x, ceiling) {
  const knee = CEIL_KNEE * ceiling;
  if (x <= knee) return x;
  const span = ceiling - knee;
  if (!(span > 0)) return x; // defensive: a non-positive ceiling would divide by zero
  return knee + span * (1 - Math.exp(-(x - knee) / span));
}

/**
 * Scale a raw settlement population into a representative people count, matching
 * Demographics' scaleCityPopulationAt.
 *
 * `turn` should be a MONOTONIC turn (see monotonicTurn) so the figure doesn't
 * reset at age boundaries.
 * When `seedKey` is given (a settlement's stable identity, e.g. its name), the result carries a
 * deterministic narrow per-settlement variation ({@link variedPeople}) so two same-size settlements
 * never report the identical figure. Both mods seed this the same way, so they agree on a given
 * settlement's number. Omit `seedKey` for a bare aggregate that isn't tied to one settlement.
 * @param {number} raw Raw population points.
 * @param {number} turn Monotonic turn.
 * @param {string | undefined} [ageType] Optional age type (e.g. AGE_MODERN).
 * @param {number | undefined} [ageProgressPct] Optional age progress percent [0,100].
 * @param {string | undefined} [seedKey] Optional per-settlement seed (its name) for the variation.
 * @param {number | undefined} [signal] Optional grounded [-1,1] bias (see {@link settlementSignal}) so
 *   the variation leans on real game metrics, not just the name hash.
 * @returns {number} Scaled people count (0 for non-positive input).
 */
// `signal` is an optional trailing grounding hint; folding it into an options bag would break the many
// positional callers that pass (raw, turn, age, prog, seed), so keep it as a 6th optional param.
// eslint-disable-next-line max-params
export function scaleCityPopulation(raw, turn, ageType, ageProgressPct, seedKey, signal) {
  if (typeof raw !== "number" || !isFinite(raw) || raw <= 0) return 0;
  const scaled = baseScaledPopulation(raw, turn, ageType, ageProgressPct);
  return seedKey ? variedPeople(scaled, seedKey, signal) : scaled;
}

/**
 * The base (un-varied) scaled people figure for a settlement size — the growth-formula curve
 * `POP_K · W(size, eraGrowthParams(age, progress))`, identical to Demographics' scaleCityPopulationAt.
 * Split out so {@link scaleCityPopulation} stays a thin guard + optional per-settlement variation.
 * @param {number} raw Settlement size (already validated > 0).
 * @param {number} _turn Unused (kept for signature compatibility; scaling is age-based now).
 * @param {string | undefined} ageType Optional age type.
 * @param {number | undefined} ageProgressPct Optional age progress percent.
 * @returns {number} The base scaled people count.
 */
function baseScaledPopulation(raw, _turn, ageType, ageProgressPct) {
  const resolvedAgeType = ageType ?? currentAgeType();
  const resolvedAgeProgress =
    typeof ageProgressPct === "number" && isFinite(ageProgressPct)
      ? ageProgressPct
      : currentAgeProgressPct();
  const base = POP_K * growthEffort(raw, eraGrowthParams(resolvedAgeType, resolvedAgeProgress));
  const boosted = base * modernMegacityBoost(raw, resolvedAgeType, resolvedAgeProgress);
  const ceiling = eraCeiling(resolvedAgeType, resolvedAgeProgress)
    * overtimeCeilingFactor(resolvedAgeType, resolvedAgeProgress);
  return softCeil(boosted, ceiling);
}

/**
 * The number of people represented by the pop-th population point at `pop`
 * (i.e. the marginal people who emigrate when population goes pop → pop-1).
 * @param {number} pop The population point in question.
 * @param {number} turn Monotonic turn.
 * @param {string | undefined} [seedKey] Optional per-settlement seed (its name) for the variation.
 * @param {number | undefined} [signal] Optional grounded [-1,1] bias (see {@link settlementSignal}).
 * @returns {number} Marginal people (>= 0).
 */
export function marginalPeople(pop, turn, seedKey, signal) {
  const delta = scaleCityPopulation(pop, turn, undefined, undefined, seedKey, signal)
    - scaleCityPopulation(pop - 1, turn, undefined, undefined, seedKey, signal);
  if (delta >= 1) return delta;
  // At the era ceiling the saturated curve flattens, so consecutive totals can differ by less than a
  // whole person and a real one-point move would read as "0 people" (C4). A population point that
  // actually emigrated represents at least one person, so floor a real point at 1. (pop < 1 has no
  // point to move → 0.) This only engages in the sub-1 underflow regime, which the Demographics
  // parity matrix never reaches, so the pinned marginal values (all >> 1) are unchanged.
  return pop >= 1 ? 1 : 0;
}

/**
 * Resolve the active age type from the engine.
 * @returns {string | undefined} Age type (e.g. AGE_MODERN), if available.
 */
function currentAgeType() {
  try {
    if (typeof Game === "undefined" || Game.age === undefined) return undefined;
    const row = GameInfo?.Ages?.lookup?.(Game.age);
    return row && typeof row.AgeType === "string" ? row.AgeType : undefined;
  } catch (_) {
    return undefined;
  }
}

/**
 * Convert a 0–1 progress fraction to a 0–100 percent; undefined when non-finite.
 * @param {*} v Fraction.
 * @returns {number | undefined} Percent, or undefined.
 */
function fractionToPct(v) {
  return typeof v === "number" && isFinite(v) ? v * 100 : undefined;
}

/**
 * Read current age-progress percent from the AgeProgressManager. The REAL engine API is the
 * current/max progression-points pair (the same recipe the base game and the Demographics mod use),
 * `getCurrentAgeProgressionPoints()` / `getMaxAgeProgressionPoints()`. The old `getAgeProgressPercent`
 * / `getAgeProgress` / `getProgress` names DO NOT EXIST on the manager, so the percent was always
 * undefined and the Modern megacity ramp silently never fired (diverging from Demographics' people
 * figure). Those names are kept only as last-ditch fallbacks.
 * @param {*} mgr The Game.AgeProgressManager.
 * @returns {number | undefined} The raw percent, or undefined.
 */
function readAgeProgressPercent(mgr) {
  if (typeof mgr.getCurrentAgeProgressionPoints === "function" &&
      typeof mgr.getMaxAgeProgressionPoints === "function") {
    const cur = mgr.getCurrentAgeProgressionPoints();
    const max = mgr.getMaxAgeProgressionPoints();
    if (typeof cur === "number" && typeof max === "number" && max > 0) return (cur / max) * 100;
  }
  if (typeof mgr.getAgeProgressPercent === "function") return mgr.getAgeProgressPercent();
  if (typeof mgr.getAgeProgress === "function") return fractionToPct(mgr.getAgeProgress());
  return undefined;
}

/**
 * Resolve current age progress percent from the engine.
 * @returns {number | undefined} Progress in [0,100], if available.
 */
function currentAgeProgressPct() {
  try {
    const mgr = Game?.AgeProgressManager;
    if (!mgr) return undefined;
    const pct = readAgeProgressPercent(mgr);
    if (typeof pct !== "number" || !isFinite(pct)) return undefined;
    return Math.max(0, pct); // floor only — allow >100 so "one more turn" overtime expands the cap
  } catch (_) {
    return undefined;
  }
}

/**
 * Format a people count the historical way: "12 thousand", "1.3 million",
 * "240 million", "1.1 billion".
 * @param {number} n People count.
 * @returns {string} Human-readable string.
 */
export function formatPeople(n) {
  if (typeof n !== "number" || !isFinite(n) || n <= 0) return "0";
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + " billion";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + " million";
  if (n >= 1e3) return Math.round(n / 1e3) + " thousand";
  return String(Math.round(n));
}

/**
 * Format a count in BOTH measuring systems at once, raw Civ population points and the scaled people
 * count, as "3 population points (36 thousand people)" (singular "1 population point (…)"). The
 * canonical dual phrasing (matches the dev log line), used where a message should always show both.
 * @param {number} people Scaled people.
 * @param {number} [points] Raw population points (defaults to 1).
 * @returns {string} The dual-system phrase.
 */
export function formatBoth(people, points) {
  const pts = Math.round(typeof points === "number" && isFinite(points) ? points : 1);
  const civ = pts + (pts === 1 ? " population point" : " population points");
  return civ + " (" + formatPeople(people) + " people)";
}

/**
 * Group an integer with thousands separators ("35670" → "35,670"). Locale-independent (the GameFace
 * runtime's toLocaleString is unreliable), so it reads the same everywhere.
 * @param {number} n An integer.
 * @returns {string} The grouped string.
 */
function groupThousands(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format a people count as an EXACT, comma-grouped number ("35,670") rather than the rounded prose
 * ("36 thousand"). Used for popup/notification event figures, where a precise figure reads as a real
 * census number; prose phrasing stays in the charts/aggregates (see {@link formatPeople}).
 * @param {number} n People count.
 * @returns {string} The exact figure.
 */
export function formatPeopleExact(n) {
  if (typeof n !== "number" || !isFinite(n) || n <= 0) return "0";
  return groupThousands(Math.round(n));
}

/**
 * The dual-system phrase with an EXACT people figure: "1 population point (35,670 people)".
 * @param {number} people Scaled people.
 * @param {number} [points] Raw population points (defaults to 1).
 * @returns {string} The dual-system phrase with an exact people count.
 */
export function formatBothExact(people, points) {
  const pts = Math.round(typeof points === "number" && isFinite(points) ? points : 1);
  const civ = pts + (pts === 1 ? " population point" : " population points");
  return civ + " (" + formatPeopleExact(people) + " people)";
}

// The variation band for displayed event people figures: ±this fraction. Narrow enough to stay
// believable, wide enough that two same-size events never read identically (the immersion break we
// fix). At event scale (~20–40k) this ±10% is comparable to the Demographics settlements board's own
// per-settlement variance floor (±2,500), so the two mods feel like one system. Standing TOTAL
// population displays are NOT varied here — they stay on the shared base curve, matching the
// Demographics base before its board applies its own variance + uniqueness pass.
const PEOPLE_VARIANCE = 0.1;

/**
 * A stable 32-bit hash of a seed string (FNV-1a). Deterministic and dependency-free, so the SAME
 * seed yields the SAME value everywhere — including a sibling mod that copies this function, letting
 * two mods agree on a settlement's varied figure when they seed it the same way.
 * @param {string} s The seed string.
 * @returns {number} An unsigned 32-bit hash.
 */
function hashSeed(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Coerce to a finite number or 0. @param {*} v Value. @returns {number} Finite number. */
function num(v) {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

/** Clamp to [-1,1]. @param {number} x Value. @returns {number} Clamped. */
function clampUnit(x) {
  return x < -1 ? -1 : x > 1 ? 1 : x;
}

/**
 * A directional bias in [-1,1] derived from a settlement's REAL game metrics — net happiness and the
 * urban:rural mix (denser, happier settlements lean a touch larger). Pass the result as the `signal`
 * arg to {@link scaleCityPopulation} / {@link marginalPeople} / {@link variedPeople} so the per-event
 * people figure is grounded in game state, not just the settlement's name. `urban` defaults to
 * `population − rural` when not supplied.
 * @param {{happiness?:number, urban?:number, rural?:number, population?:number}|null|undefined} m Metrics.
 * @returns {number} Bias in [-1,1] (0 when no metrics).
 */
export function settlementSignal(m) {
  if (!m) return 0;
  const happy = num(m.happiness);
  const happySig = happy / (Math.abs(happy) + 10);
  const rural = num(m.rural);
  const urban = typeof m.urban === "number" && isFinite(m.urban) ? m.urban : Math.max(0, num(m.population) - rural);
  const denom = urban + rural;
  const urbanSig = denom > 0 ? (urban / denom - 0.5) * 2 : 0;
  return clampUnit(0.6 * happySig + 0.4 * urbanSig);
}

/**
 * Apply a deterministic, narrow ±{@link PEOPLE_VARIANCE} variation to a scaled people figure. The
 * variation is GROUNDED in real game metrics when a `signal` ({@link settlementSignal}) is supplied —
 * a thriving settlement reads a touch larger than a stagnant one — with the stable `seedKey` hash
 * folded in for entropy/uniqueness (and used alone when no signal is given, preserving prior behaviour).
 * Same inputs → same factor, so a given settlement's figure is consistent across redraws and across
 * both mods. Presentation only: the underlying scaling is untouched, so analytics/aggregates stay exact.
 * @param {number} base The scaled people figure.
 * @param {string} seedKey A stable per-settlement (or per-event) seed.
 * @param {number} [signal] Optional grounded [-1,1] bias from real metrics.
 * @returns {number} The varied figure (>= 0).
 */
export function variedPeople(base, seedKey, signal) {
  if (typeof base !== "number" || !isFinite(base) || base <= 0) return 0;
  const h = hashSeed(typeof seedKey === "string" && seedKey.length ? seedKey : "_");
  const noise = (h / 0xffffffff) * 2 - 1; // hash → [-1, 1)
  const u = typeof signal === "number" && isFinite(signal)
    ? clampUnit(0.6 * signal + 0.4 * noise) // grounded: lean on real metrics, hash for entropy
    : noise; // no signal → prior name-hash behaviour
  return base * (1 + PEOPLE_VARIANCE * u);
}

/**
 * Read a city's rural population defensively.
 * @param {*} city City object.
 * @returns {number} Rural population (0 if unreadable).
 */
export function ruralPop(city) {
  try {
    const r = city?.ruralPopulation;
    return typeof r === "number" && isFinite(r) ? r : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Read a city's total population defensively.
 * @param {*} city City object.
 * @returns {number} Total population (0 if unreadable).
 */
export function totalPop(city) {
  try {
    const p = city?.population;
    return typeof p === "number" && isFinite(p) ? p : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Move one rural population point from `source` to `dest`. Confirmed reachable
 * from the UI VM, including across civilizations (probe Q2). Returns whether the
 * move was applied.
 * @param {*} source Losing city.
 * @param {*} dest Gaining city.
 * @returns {boolean} True if both writes were attempted without throwing.
 */
export function moveRural(source, dest) {
  try {
    if (typeof source?.addRuralPopulation !== "function") return false;
    if (typeof dest?.addRuralPopulation !== "function") return false;
    source.addRuralPopulation(-1);
    dest.addRuralPopulation(1);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Remove one rural population point from a city WITHOUT moving it anywhere - the outlet
 * for a trapped, distressed population with no refuge (attrition / death). Uses the same
 * rural-population accounting the game's own starvation shrinkage uses, so the world's
 * population genuinely drops. Returns whether the write was applied.
 * @param {*} city The city losing a point.
 * @returns {boolean} True if applied.
 */
export function removeRural(city) {
  try {
    if (typeof city?.addRuralPopulation !== "function") return false;
    city.addRuralPopulation(-1);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Add one rural population point to a city WITHOUT taking it from anywhere - the
 * arrival half of a lagged migration (the departure used {@link removeRural} some
 * turns earlier; see the transit queue in emigration-engine.js). Returns whether the
 * write was applied.
 * @param {*} city The city gaining a point.
 * @returns {boolean} True if applied.
 */
export function addRural(city) {
  try {
    if (typeof city?.addRuralPopulation !== "function") return false;
    city.addRuralPopulation(1);
    return true;
  } catch (_) {
    return false;
  }
}
