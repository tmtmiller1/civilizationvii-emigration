// scripts/snowball-stress.mjs
//
// Does the 1.4.1 balance rebalance (economy weighted ×2.5, happiness de-saturated) let a rich, growing
// civ SNOWBALL — accrete cross-civ migrants faster than the anti-snowball brake can counter? The brake
// (emigration-pull.js dominanceFor) scales with POPULATION dominance, not economy, so making economy
// matter more could open a window where a rich-but-not-yet-huge leader runs away.
//
// We compute the DOMINANCE CEILING: the population ratio (civPop / world-average civ pop) at which a
// leader's cities stop out-pulling the field, i.e. where cross-civ inflow to the leader hits zero.
//   net cross-civ pull ≈ (leaderPros − fieldPros) − poachBlock − antiSnowballWeight·(ratio−thr)^exp
//   ceiling = thr + ((prosGap − poachBlock) / antiSnowballWeight)^(1/exp)   [if prosGap > poachBlock]
// A HIGHER ceiling = the leader keeps vacuuming migrants until it's larger ⇒ worse snowball. We compare
// the old defaults, the new calibration, and show what antiSnowballWeight holds a chosen safe ceiling.
//
// Run: node --loader ./tests/loader.mjs ./scripts/snowball-stress.mjs

import { prosperity } from "/emigration/ui/emigration-prosperity.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";

const BASE = { food: 18, production: 16, gold: 11, science: 7, culture: 5 };
const POP = 10;
const MEAN_H = 2.9; // same field mean as the calibration sweep
const ctx = { meanHappiness: MEAN_H };

function net(h, e) {
  const f = 1 - Math.min(0.8, 0.05 * Math.max(0, -h));
  return { food: BASE.food * e, production: BASE.production * e * f, gold: BASE.gold * e * f,
    science: BASE.science * e * f, culture: BASE.culture * e * f };
}
function sig(h, e) {
  return { ...net(h, e), population: POP, urban: 0, happiness: h, stage: 0, polity: undefined,
    siege: false, starving: false, unrest: false, violence: 0, disaster: 0 };
}
const P = (h, e) => prosperity(sig(h, e), ctx);

const CALIBS = {
  "old defaults": { happyFloor: 8, happyAmp: 0.8, happyRepulsion: 2.0, happyScale: 8, yieldGain: 1.0 },
  "new (aggressive)": { happyFloor: 4, happyAmp: 0.2, happyRepulsion: 1.8, happyScale: 8, yieldGain: 2.5 },
  "conservative-A": { happyFloor: 6, happyAmp: 0.4, happyRepulsion: 2.0, happyScale: 8, yieldGain: 1.6 },
  "conservative-B": { happyFloor: 6, happyAmp: 0.3, happyRepulsion: 2.0, happyScale: 10, yieldGain: 1.8 }
};

function apply(c) {
  CONFIG.happinessShaped = true;
  CONFIG.polityModelEnabled = false;
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

// The dominance ceiling for a given prosperity gap and brake settings.
function ceiling(prosGap, weight) {
  const thr = CONFIG.antiSnowballThreshold; // 1.25
  const exp = CONFIG.antiSnowballExponent; // 1.5
  const headroom = prosGap - CONFIG.poachBlock; // net pull before the size brake
  if (headroom <= 0) return thr; // field friction alone stops inflow at/under fair share
  return thr + Math.pow(headroom / weight, 1 / exp);
}

// Leader profiles: happiness-driven, economy-driven (the stress case for the ×2.5 yield change), and
// both. Field reference: an average city. The economy-driven leader is where amplifying yields could
// most widen the prosperity gap and feed a snowball.
const LEADERS = {
  "happy leader  (h20,e1.4)": { h: 20, e: 1.4 },
  "RICH leader   (h5, e1.6)": { h: 5, e: 1.6 },
  "rich+happy    (h20,e1.6)": { h: 20, e: 1.6 }
};
const FIELD = { h: MEAN_H, e: 1.0 };

console.log(`Anti-snowball brake: weight=${CONFIG.antiSnowballWeight} thr=${CONFIG.antiSnowballThreshold} ` +
  `exp=${CONFIG.antiSnowballExponent}; cross-civ friction poachBlock=${CONFIG.poachBlock}.`);
console.log(`Dominance ceiling = popRatio where the leader stops gaining cross-civ migrants ` +
  `(higher = more snowball). Field city: happ ${MEAN_H}, economy ×1.0.\n`);

for (const [lname, L] of Object.entries(LEADERS)) {
  console.log(`${lname}:`);
  console.log("  calibration        | leaderPros  fieldPros  prosGap | ceiling@w=15  ceiling@w=25");
  for (const [name, c] of Object.entries(CALIBS)) {
    apply(c);
    const lp = P(L.h, L.e);
    const fp = P(FIELD.h, FIELD.e);
    const gap = lp - fp;
    const ceils = [15, 25].map((w) => ceiling(gap, w).toFixed(2).padStart(12)).join(" ");
    console.log(`  ${name.padEnd(18)} | ${lp.toFixed(1).padStart(9)} ${fp.toFixed(1).padStart(10)} ` +
      `${gap.toFixed(1).padStart(8)} | ${ceils}`);
  }
  console.log("");
}

console.log(`Reading: ceiling near ${CONFIG.antiSnowballThreshold}–1.6 = migration barely feeds a leader ` +
  `past fair share (safe); > ~2.2 = migration alone can drive a civ past 2× average (snowball).`);
