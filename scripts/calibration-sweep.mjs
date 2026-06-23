// scripts/calibration-sweep.mjs
//
// Full-parameter calibration search for the shaped prosperity model, scored against a PLAYER-EXPERIENCE
// rubric. Drives the real shipped prosperity() (via tests/loader.mjs) over a synthetic world of cities
// spanning happiness × economy, sweeps the five interacting balance parameters, filters by hard
// constraints, and ranks by a weighted player-quality score. Prints the current-defaults baseline, the
// top calibrations, and the recommendation. Read-only (mutates only its in-process CONFIG copy).
//
// Run: node --loader ./tests/loader.mjs ./scripts/calibration-sweep.mjs

import { prosperity } from "/emigration/ui/emigration-prosperity.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";

// ── world: cities spanning happiness (H) × economy multiplier (E) ───────────────────────────
const H = [-25, -15, -8, 0, 8, 20, 40]; // unhappy → ecstatic
const E = [0.6, 1.0, 1.5]; // weak / average / strong economy
const BASE = { food: 18, production: 16, gold: 11, science: 7, culture: 5 }; // gross, pop 10
const POP = 10;
const MEAN_H = H.reduce((a, b) => a + b, 0) / H.length; // field-relative centre
const ctx = { meanHappiness: MEAN_H };

// Net yields after the 1.4.1 unhappiness penalty (rate r/point, cap 0.80, Food exempt), economy e.
function net(h, e, r) {
  const f = 1 - Math.min(0.8, r * Math.max(0, -h));
  return {
    food: BASE.food * e,
    production: BASE.production * e * f,
    gold: BASE.gold * e * f,
    science: BASE.science * e * f,
    culture: BASE.culture * e * f
  };
}

function sig(h, e, r) {
  return { ...net(h, e, r), population: POP, urban: 0, happiness: h, stage: 0, polity: undefined,
    siege: false, starving: false, unrest: false, violence: 0, disaster: 0 };
}

// Replicate the shaped happiness multiplier so we can detect clamp saturation (prosperity() hides it).
function mult(h) {
  const hNorm = Math.tanh((h - MEAN_H) / CONFIG.happyScale);
  const hShaped = hNorm >= 0 ? hNorm : hNorm * CONFIG.happyRepulsion;
  return Math.max(CONFIG.happyMultMin, Math.min(CONFIG.happyMultMax, 1 + CONFIG.happyAmp * hShaped));
}

// Apply a calibration to CONFIG (yield factors scale together by yieldGain, preserving sci/cul ratios).
function apply(c) {
  CONFIG.happinessShaped = true;
  CONFIG.polityModelEnabled = false; // isolate the core happiness/yield balance; polity re-added after
  CONFIG.overcrowdDiscount = 0;
  CONFIG.civTuningEnabled = false;
  CONFIG.populationFactor = 1.0;
  CONFIG.happyMultMin = 0.2;
  CONFIG.happyMultMax = 1.8;
  CONFIG.happyFloor = c.happyFloor;
  CONFIG.happyAmp = c.happyAmp;
  CONFIG.happyRepulsion = c.happyRepulsion;
  CONFIG.happyScale = c.happyScale;
  CONFIG.foodFactor = 1.0 * c.yieldGain;
  CONFIG.productionFactor = 1.0 * c.yieldGain;
  CONFIG.goldFactor = 1.0 * c.yieldGain;
  CONFIG.scienceFactor = 0.25 * c.yieldGain;
  CONFIG.cultureFactor = 0.5 * c.yieldGain;
}

function P(h, e, r = 0.05) {
  return prosperity(sig(h, e, r), ctx);
}

// ── metrics for the applied calibration ─────────────────────────────────────────────────────
function metrics() {
  let monoH = 0;
  let monoE = 0;
  for (const e of E) {
    for (let i = 1; i < H.length; i++) if (P(H[i], e) <= P(H[i - 1], e)) monoH++;
  }
  for (const h of H) {
    for (let i = 1; i < E.length; i++) if (P(h, E[i]) <= P(h, E[i - 1])) monoE++;
  }
  const happSignal = P(H[H.length - 1], 1.0) - P(H[0], 1.0);
  let econSum = 0;
  for (const h of H) econSum += P(h, 1.5) - P(h, 0.6);
  const econSignal = econSum / H.length;
  const ratio = econSignal / (econSignal + happSignal || 1);
  // non-saturation: fraction of happiness levels whose multiplier isn't pinned at a clamp
  let notPinned = 0;
  for (const h of H) {
    const m = mult(h);
    if (m > CONFIG.happyMultMin + 1e-6 && m < CONFIG.happyMultMax - 1e-6) notPinned++;
  }
  const nonSat = notPinned / H.length;
  // 1.4.1 visibility: mean |P(-5%) − P(-2%)| over unhappy cities at average economy
  let visSum = 0;
  let visN = 0;
  for (const h of H) if (h < 0) { visSum += Math.abs(P(h, 1.0, 0.05) - P(h, 1.0, 0.02)); visN++; }
  const vis5 = visN ? visSum / visN : 0;
  const gradient = P(H[H.length - 1], 1.5) - P(H[0], 0.6);
  // misery bite: a clearly-unhappy city (−15) must sit well below a content one (+8) at avg economy,
  // so unhappiness still visibly drives migration even after we de-saturate the happiness term.
  const miseryBite = P(8, 1.0) - P(-15, 1.0);
  return { monoH, monoE, happSignal, econSignal, ratio, nonSat, vis5, gradient, miseryBite };
}

// player-quality score (only meaningful when monoH==monoE==0)
const RATIO_TARGET = 0.40;
function score(m) {
  if (m.monoH || m.monoE) return -Infinity;
  const s1 = 1 - Math.min(1, Math.abs(m.ratio - RATIO_TARGET) / RATIO_TARGET); // balance
  const s2 = Math.min(1, m.vis5 / (0.10 * Math.max(1, m.happSignal))); // −5% visibility ≥10% of happ
  const s3 = m.nonSat; // non-saturation
  const inBand = m.gradient >= 25 && m.gradient <= 70;
  const s4 = inBand ? 1 : Math.max(0, 1 - Math.abs(m.gradient - 47.5) / 47.5); // bounded gradient
  return 0.40 * s1 + 0.25 * s2 + 0.20 * s3 + 0.15 * s4;
}

// ── sweep ────────────────────────────────────────────────────────────────────────────────────
const GRID = [];
for (const happyFloor of [2, 3, 4, 5, 6, 7, 8]) {
  for (const happyAmp of [0.2, 0.3, 0.4, 0.5, 0.6, 0.8]) {
    for (const happyRepulsion of [1.0, 1.3, 1.5, 1.8, 2.0]) {
      for (const happyScale of [6, 8, 10, 12, 14]) {
        for (const yieldGain of [1.0, 1.5, 2.0, 2.5, 3.0]) {
          GRID.push({ happyFloor, happyAmp, happyRepulsion, happyScale, yieldGain });
        }
      }
    }
  }
}

const results = [];
for (const c of GRID) {
  apply(c);
  const m = metrics();
  results.push({ c, m, s: score(m) });
}

function fmt(c) {
  return `floor=${c.happyFloor} amp=${c.happyAmp} rep=${c.happyRepulsion} scale=${c.happyScale} yGain=${c.yieldGain}`;
}
function line(r) {
  const m = r.m;
  return `s=${r.s === -Infinity ? "  REJECT" : r.s.toFixed(3)}  ratio=${m.ratio.toFixed(2)} ` +
    `nonSat=${m.nonSat.toFixed(2)} vis5=${m.vis5.toFixed(1)} grad=${m.gradient.toFixed(0)} ` +
    `bite=${m.miseryBite.toFixed(0)} mono(H${m.monoH}/E${m.monoE})  | ${fmt(r.c)}`;
}

// Normalized distance of a calibration from the current shipped defaults (for the least-disruption
// tie-break among equally-good picks).
const DEFAULTS = { happyFloor: 8, happyAmp: 0.8, happyRepulsion: 2.0, happyScale: 8, yieldGain: 1.0 };
function disruption(c) {
  return Math.abs(c.happyFloor - DEFAULTS.happyFloor) / 8 +
    Math.abs(c.happyAmp - DEFAULTS.happyAmp) / 0.8 +
    Math.abs(c.happyRepulsion - DEFAULTS.happyRepulsion) / 2 +
    Math.abs(c.happyScale - DEFAULTS.happyScale) / 14 +
    Math.abs(c.yieldGain - DEFAULTS.yieldGain) / 3;
}

console.log(`World: ${H.length} happiness × ${E.length} economy levels; field mean happiness ${MEAN_H.toFixed(1)}.`);
console.log(`Rubric: balance ratio target ${RATIO_TARGET} (economy/(economy+happiness) signal), ` +
  `reject non-monotonic, reward non-saturation + −5% visibility + bounded gradient [25,70].\n`);

// current shipped defaults as a baseline
apply({ happyFloor: 8, happyAmp: 0.8, happyRepulsion: 2.0, happyScale: 8, yieldGain: 1.0 });
const baseM = metrics();
console.log("CURRENT DEFAULTS:  " + line({ c: { happyFloor: 8, happyAmp: 0.8, happyRepulsion: 2.0, happyScale: 8, yieldGain: 1.0 }, m: baseM, s: score(baseM) }));

const feasible = results.filter((r) => r.s > -Infinity).sort((a, b) => b.s - a.s);
console.log(`\nFeasible (monotonic) calibrations: ${feasible.length} / ${GRID.length}. Top 12:`);
for (const r of feasible.slice(0, 12)) console.log("  " + line(r));

// RECOMMENDED pick: among calibrations that satisfy the player-experience GUARDS (not the raw argmax,
// which sits at a degenerate grid corner), choose the least-disruptive from current defaults. Guards:
// balanced (ratio 0.28–0.42), de-saturated (nonSat ≥ 0.85), 1.4.1-visible (vis5 ≥ 1.0), misery still
// bites (≥ 10), healthy dynamic range (gradient 30–60), and misery-steeper-than-pull (repulsion ≥ 1.3).
const guarded = feasible.filter((r) => {
  const m = r.m;
  return m.ratio >= 0.28 && m.ratio <= 0.42 && m.nonSat >= 0.85 && m.vis5 >= 1.0 &&
    m.miseryBite >= 10 && m.gradient >= 30 && m.gradient <= 60 && r.c.happyRepulsion >= 1.3;
});
guarded.sort((a, b) => disruption(a.c) - disruption(b.c));
console.log(`\nCalibrations passing all player-experience guards: ${guarded.length}.`);
console.log("Top 6 guarded, by LEAST disruption from current defaults:");
for (const r of guarded.slice(0, 6)) console.log("  " + line(r) + `  [disruption ${disruption(r.c).toFixed(2)}]`);

const rec = guarded[0] || feasible[0];
console.log("\nRECOMMENDED (guarded, least-disruptive):");
console.log("  " + line(rec));
console.log(`  → happyFloor ${rec.c.happyFloor}, happyAmp ${rec.c.happyAmp}, ` +
  `happyRepulsion ${rec.c.happyRepulsion}, happyScale ${rec.c.happyScale}, yield factors ×${rec.c.yieldGain}`);
console.log(`  vs current: ratio ${baseM.ratio.toFixed(2)}→${rec.m.ratio.toFixed(2)} (economy share of signal), ` +
  `nonSat ${baseM.nonSat.toFixed(2)}→${rec.m.nonSat.toFixed(2)}, ` +
  `−5% visibility ${baseM.vis5.toFixed(1)}→${rec.m.vis5.toFixed(1)}, ` +
  `misery-bite ${baseM.miseryBite.toFixed(0)}→${rec.m.miseryBite.toFixed(0)}.`);

// Eyeball the recommended calibration's actual prosperity surface (the aggregate metrics can hide a
// weird curve). Rows = happiness, cols = economy, value = prosperity (−5% world).
apply(rec.c);
console.log("\nRecommended prosperity surface (−5% world):  happ |  weak(0.6)  avg(1.0)  strong(1.5)");
for (const h of H) {
  const row = E.map((e) => P(h, e).toFixed(1).padStart(9)).join(" ");
  console.log(`  ${String(h).padStart(4)} | ${row}`);
}
