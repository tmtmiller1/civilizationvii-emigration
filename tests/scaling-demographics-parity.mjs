import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scaleCityPopulation, marginalPeople } from "/emigration/ui/emigration-population.js";

// Regression guard: pin emigration's people-scaling to the Demographics mod's per-settlement formula
// so migration-event population counts can never silently drift away from what Demographics shows for
// the same settlement (and so events stay believable instead of ballooning to millions).
//
// The contract, Demographics' demographics-metrics-helpers.js scaleCityPopulationAt, from Civ VII's
// real per-era growth formula:
//   W(N,{flat,scalar,exp}) = flat*N + scalar*N(N+1)/2 + exp*N(N+1)(2N+1)/6   (cumulative growth food)
//   eraGrowthParams blends the previous era's {flat,scalar,exp} → the current era's over the opening
//     BLEND_PCT of the age (cross-age continuity); Antiquity {5,20,4}, Exploration {30,50,5}, Modern {60,60,6}
//   result = POP_K * W(size, eraGrowthParams(age, progress))    (POP_K = 31; turn is ignored)
// Encoded below as the canonical reference. Emigration MUST match it across the age matrix. A second
// guard reads Demographics' actual source (when present) so a change to ITS constants also fails here.

const REF_ERA_PARAMS = {
  AGE_ANTIQUITY: { flat: 5, scalar: 20, exp: 4 },
  AGE_EXPLORATION: { flat: 30, scalar: 50, exp: 5 },
  AGE_MODERN: { flat: 60, scalar: 60, exp: 6 }
};
const REF_ERA_ORDER = ["AGE_ANTIQUITY", "AGE_EXPLORATION", "AGE_MODERN"];
const REF_POP_K = 31;
const REF_BLEND_PCT = 25;
const REF_MEGA_KNEE = 35;
const REF_MEGA_STRENGTH = 5.0;
const REF_MEGA_POW = 1.3;
const REF_ERA_CEILING = { AGE_ANTIQUITY: 1.6e6, AGE_EXPLORATION: 2.5e6, AGE_MODERN: 38e6 };
const REF_CEIL_KNEE = 0.7;
const REF_OVERTIME_RATE = 1.0;
const REF_OVERTIME_EASE = 0.1;
const REF_OVERTIME_MAX = 5;

/** Smoothstep on [0,1]. @param {number} x Input. @returns {number} Smoothed. */
function refSmoothstep(x) {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
}

/**
 * Reference copy of Demographics' blended era params.
 * @param {string|undefined} ageType Age. @param {number|undefined} ageProgressPct Progress %.
 * @returns {{flat:number,scalar:number,exp:number}} Params.
 */
function refEraParams(ageType, ageProgressPct) {
  const cur = REF_ERA_PARAMS[ageType] || REF_ERA_PARAMS.AGE_EXPLORATION;
  const idx = REF_ERA_ORDER.indexOf(ageType);
  const prev = idx > 0 ? REF_ERA_PARAMS[REF_ERA_ORDER[idx - 1]] : cur;
  if (prev === cur) return cur;
  const p = typeof ageProgressPct === "number" && isFinite(ageProgressPct) ? ageProgressPct : 100;
  const s = refSmoothstep(p / REF_BLEND_PCT);
  if (s <= 0) return prev;
  if (s >= 1) return cur;
  return {
    flat: prev.flat + (cur.flat - prev.flat) * s,
    scalar: prev.scalar + (cur.scalar - prev.scalar) * s,
    exp: prev.exp + (cur.exp - prev.exp) * s
  };
}

/** Reference copy of Demographics' Modern-only megacity boost. */
function refMegaBoost(n, ageType, ageProgressPct) {
  if (ageType !== "AGE_MODERN" || n <= REF_MEGA_KNEE) return 1;
  const p = typeof ageProgressPct === "number" && isFinite(ageProgressPct) ? ageProgressPct : 100;
  const ramp = refSmoothstep((p / 100 - 0.1) / 0.8);
  if (ramp <= 0) return 1;
  return 1 + REF_MEGA_STRENGTH * ramp * Math.pow((n - REF_MEGA_KNEE) / REF_MEGA_KNEE, REF_MEGA_POW);
}

/** Reference copy of Demographics' per-era ceiling. */
function refEraCeiling(ageType, ageProgressPct) {
  const cur = REF_ERA_CEILING[ageType] || REF_ERA_CEILING.AGE_EXPLORATION;
  const idx = REF_ERA_ORDER.indexOf(ageType);
  const prev = idx > 0 ? REF_ERA_CEILING[REF_ERA_ORDER[idx - 1]] : cur;
  if (prev === cur) return cur;
  const p = typeof ageProgressPct === "number" && isFinite(ageProgressPct) ? ageProgressPct : 100;
  const s = refSmoothstep(p / REF_BLEND_PCT);
  if (s <= 0) return prev;
  if (s >= 1) return cur;
  return Math.exp(Math.log(prev) + (Math.log(cur) - Math.log(prev)) * s);
}

/** Reference copy of Demographics' endgame ("one more turn") ceiling multiplier (eased + capped). */
function refOvertime(ageType, ageProgressPct) {
  if (ageType !== "AGE_MODERN") return 1;
  if (typeof ageProgressPct !== "number" || !isFinite(ageProgressPct) || ageProgressPct <= 100) return 1;
  const over = (ageProgressPct - 100) / 100;
  const grown = REF_OVERTIME_RATE * over * refSmoothstep(over / REF_OVERTIME_EASE);
  return 1 + Math.min(REF_OVERTIME_MAX - 1, grown);
}

/** Reference copy of Demographics' C¹ soft ceiling. */
function refSoftCeil(x, ceiling) {
  const knee = REF_CEIL_KNEE * ceiling;
  if (x <= knee) return x;
  const span = ceiling - knee;
  return knee + span * (1 - Math.exp(-(x - knee) / span));
}

/**
 * Reference copy of Demographics' scaleCityPopulationAt, the authoritative scaling contract
 * (growth curve · Modern megacity boost · soft era ceiling).
 * @param {number} raw Settlement size. @param {number} _turn Unused (signature compat).
 * @param {string} [ageType] Age type. @param {number} [ageProgressPct] Progress %.
 * @returns {number} The scaled people figure (0 for non-positive input).
 */
function refScale(raw, _turn, ageType, ageProgressPct) {
  if (typeof raw !== "number" || !isFinite(raw) || raw <= 0) return 0;
  const p = refEraParams(ageType, ageProgressPct);
  const s1 = (raw * (raw + 1)) / 2;
  const s2 = (raw * (raw + 1) * (2 * raw + 1)) / 6;
  const base = REF_POP_K * (p.flat * raw + p.scalar * s1 + p.exp * s2);
  const boosted = base * refMegaBoost(raw, ageType, ageProgressPct);
  const ceiling = refEraCeiling(ageType, ageProgressPct) * refOvertime(ageType, ageProgressPct);
  return refSoftCeil(boosted, ceiling);
}

const REL_TOL = 1e-9; // the formulas are identical, so only floating-point noise is allowed

// (raw, turn, age, progress) spanning antiquity → late modern, including the Modern megacity ramp
// and the soft ceiling (size 60 late-Modern saturates near the era cap).
const MATRIX = [
  [1, 0, undefined, undefined],
  [1, 8, "AGE_ANTIQUITY", 20],
  [2, 30, "AGE_ANTIQUITY", 60],
  [5, 90, "AGE_EXPLORATION", 50],
  [10, 180, "AGE_MODERN", 40],
  [25, 220, "AGE_MODERN", 95], // below megacity knee
  [45, 250, "AGE_MODERN", 100], // megacity ramp active
  [60, 250, "AGE_MODERN", 100], // strong boost → soft-ceiling saturation
  [60, 999, "AGE_MODERN", 180], // "one more turn" overtime → expanded ceiling
  [80, 999, "AGE_MODERN", 250], // deeper overtime
  [80, 999, "AGE_MODERN", 103], // just past the natural end → smoothstep-eased onset
  [80, 999, "AGE_MODERN", 9000] // pathological overtime → multiplier capped at OVERTIME_MAX
];

/**
 * Assert two figures agree within floating-point tolerance.
 * @param {number} got The value under test. @param {number} want The reference. @param {string} msg Label.
 */
function assertClose(got, want, msg) {
  assert.ok(Math.abs(got - want) <= REL_TOL * Math.max(1, Math.abs(want)),
    `${msg}: got ${got}, expected ${want}`);
}

function testScaleMatchesDemographicsAcrossAges() {
  // Un-seeded (no per-settlement variation) so it compares against the bare contract curve.
  for (const [raw, turn, age, prog] of MATRIX) {
    assertClose(scaleCityPopulation(raw, turn, age, prog), refScale(raw, turn, age, prog),
      `scaleCityPopulation(${raw},${turn},${age},${prog})`);
  }
}

function testMarginalMatchesDemographicsAcrossAges() {
  // marginalPeople resolves age from the engine; off-engine (no globalThis.Game) that yields no ramp,
  // so it equals the reference marginal with no age, exactly the antiquity/early-game regime.
  for (const turn of [0, 8, 30, 90, 180, 250]) {
    for (const pop of [1, 2, 5, 10]) {
      const want = Math.max(0, refScale(pop, turn) - refScale(pop - 1, turn));
      assertClose(marginalPeople(pop, turn), want, `marginalPeople(${pop},${turn})`);
    }
  }
}

// The immersion guard this whole pin exists for: a single point fleeing must read as a believable
// town's worth (a few thousand), NOT hundreds of thousands or millions.
function testSingleEventStaysBelievable() {
  const one = marginalPeople(1, 8); // off-engine → Exploration fallback → ~2.6k
  assert.ok(one > 1000 && one < 10000,
    `one point should be a few thousand people, got ${Math.round(one)}`);
  // And the curve must genuinely grow with the era (same size reads larger later in history).
  const size20 = (age, prog) => refScale(20, 0, age, prog);
  assert.ok(size20("AGE_MODERN", 100) > size20("AGE_ANTIQUITY", 100) * 1.5,
    "a Modern settlement should dwarf the same-size Antiquity one");
}

/**
 * Locate Demographics' scaling helper in the sibling mod (tower_mods/demographics), if present.
 * @returns {string} Absolute path to demographics-metrics-helpers.js.
 */
function demographicsHelperPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "demographics", "ui", "metrics", "demographics-metrics-helpers.js");
}

/**
 * Extract a named function's source body from a module's text (best-effort).
 * @param {string} src The module source. @param {string} name The function name.
 * @returns {string} The slice from the declaration to the next top-level function (or end).
 */
function sliceFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return "";
  const after = src.indexOf("\nexport function ", start + 1);
  const next = src.indexOf("\nfunction ", start + 1);
  const ends = [after, next].filter((i) => i > start);
  return src.slice(start, ends.length ? Math.min(...ends) : src.length);
}

// Cross-mod drift guard: when Demographics' source is present (the normal repo layout), assert its
// scaleCityPopulationAt still carries the exact constants this test pins emigration to. A change on the
// Demographics side (e.g. a new base) then fails HERE, forcing the two mods to be re-aligned together.
function testDemographicsSourceConstantsUnchanged() {
  const p = demographicsHelperPath();
  if (!existsSync(p)) {
    console.log("  (demographics source not present; skipping cross-mod constant guard)");
    return;
  }
  const src = readFileSync(p, "utf8");
  const body = sliceFn(src, "scaleCityPopulationAt");
  assert.ok(body, "could not locate demographics scaleCityPopulationAt");
  assert.ok(/POP_K\s*\*\s*growthEffort\(/.test(body),
    "demographics city scale drifted (expected POP_K * growthEffort(...))");
  // Pin the shared constants this test mirrors.
  assert.ok(/const POP_K = 31\b/.test(src), "demographics POP_K drifted (expected 31)");
  assert.ok(/const BLEND_PCT = 25\b/.test(src), "demographics BLEND_PCT drifted (expected 25)");
  assert.ok(/AGE_ANTIQUITY:\s*\{\s*flat:\s*5,\s*scalar:\s*20,\s*exp:\s*4\s*\}/.test(src),
    "demographics Antiquity growth params drifted (expected {5,20,4})");
  assert.ok(/AGE_EXPLORATION:\s*\{\s*flat:\s*30,\s*scalar:\s*50,\s*exp:\s*5\s*\}/.test(src),
    "demographics Exploration growth params drifted (expected {30,50,5})");
  assert.ok(/AGE_MODERN:\s*\{\s*flat:\s*60,\s*scalar:\s*60,\s*exp:\s*6\s*\}/.test(src),
    "demographics Modern growth params drifted (expected {60,60,6})");
  // Megacity + ceiling constants (must match this test's reference copies above).
  assert.ok(/const MEGA_KNEE = 35\b/.test(src), "demographics MEGA_KNEE drifted (expected 35)");
  assert.ok(/const MEGA_STRENGTH = 5\.0\b/.test(src), "demographics MEGA_STRENGTH drifted (expected 5.0)");
  assert.ok(/const MEGA_POW = 1\.3\b/.test(src), "demographics MEGA_POW drifted (expected 1.3)");
  assert.ok(/const CEIL_KNEE = 0\.7\b/.test(src), "demographics CEIL_KNEE drifted (expected 0.7)");
  assert.ok(/AGE_ANTIQUITY:\s*1\.6e6/.test(src), "demographics Antiquity ceiling drifted (expected 1.6e6)");
  assert.ok(/AGE_EXPLORATION:\s*2\.5e6/.test(src), "demographics Exploration ceiling drifted (expected 2.5e6)");
  assert.ok(/AGE_MODERN:\s*38e6/.test(src), "demographics Modern ceiling drifted (expected 38e6)");
  assert.ok(/const OVERTIME_CEILING_RATE = 1\.0\b/.test(src),
    "demographics OVERTIME_CEILING_RATE drifted (expected 1.0)");
  assert.ok(/const OVERTIME_EASE = 0\.1\b/.test(src), "demographics OVERTIME_EASE drifted (expected 0.1)");
  assert.ok(/const OVERTIME_MAX = 5\b/.test(src), "demographics OVERTIME_MAX drifted (expected 5)");
}

testScaleMatchesDemographicsAcrossAges();
testMarginalMatchesDemographicsAcrossAges();
testSingleEventStaysBelievable();
testDemographicsSourceConstantsUnchanged();

console.log("scaling-demographics-parity harness passed");
