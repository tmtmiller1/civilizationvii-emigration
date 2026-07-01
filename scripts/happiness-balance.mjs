// scripts/happiness-balance.mjs
//
// Balance analysis for the Civ VII 1.4.1 happiness change (unhappiness yield penalty ~−2% → −5% per
// point of negative happiness, capped at −80%, Food exempt). Drives the REAL shipped prosperity model
// off-engine (via tests/loader.mjs) to measure how a city's attractiveness, and the emigration pull
// gradient between an unhappy city and a content one, shifts between the two penalty regimes, and how
// much the new polity stage term adds on top. No game globals needed (owner-less signals → neutral civ
// tuning). Run: node --loader ./tests/loader.mjs ./scripts/happiness-balance.mjs
//
// This is read-only analysis tooling; it mutates only its own CONFIG copy in-process.

import { prosperity } from "/emigration/ui/emigration-prosperity.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";

// A representative mid-game city: total (not per-capita) GROSS yields before any unhappiness penalty.
const GROSS = { food: 20, production: 18, gold: 12, science: 8, culture: 6 };
const POP = 10;
const URBAN = 5;
const FIELD_MEAN = 5; // the field-relative shaped model centres on the world's mean happiness

// 1.4.1 Antiquity stage thresholds → ordinal, for the stage signal.
function stageOf(h) {
  if (h >= 40) return 2; // ECSTATIC
  if (h >= 20) return 1; // JOYOUS
  if (h >= 0) return 0; // HAPPY
  if (h >= -20) return -1; // UNHAPPY
  return -2; // ANGRY
}

// Apply the game's unhappiness yield penalty at rate r/point (cap 0.80), Food EXEMPT, to get the NET
// yields the mod would read via getNetYield.
function netYields(h, r) {
  const factor = 1 - Math.min(0.8, r * Math.max(0, -h));
  return {
    food: GROSS.food, // exempt
    production: GROSS.production * factor,
    gold: GROSS.gold * factor,
    science: GROSS.science * factor,
    culture: GROSS.culture * factor
  };
}

function signal(h, r, withPolity) {
  const y = netYields(h, r);
  return {
    ...y,
    population: POP,
    urban: URBAN,
    happiness: h,
    stage: withPolity ? stageOf(h) : 0,
    polity: withPolity ? { celebrating: false, government: "", warWeary: false } : undefined,
    siege: false,
    starving: false,
    unrest: false,
    violence: 0,
    disaster: 0
  };
}

const ctx = { meanHappiness: FIELD_MEAN };
const score = (h, r, withPolity) => prosperity(signal(h, r, withPolity), ctx);

function table(label, withPolity) {
  console.log(`\n=== ${label} (shaped model, polity terms ${withPolity ? "ON" : "OFF"}) ===`);
  console.log("  happ  stage |  P@-2%   P@-5%   Δ(5−2)  | gap-vs-content@-2%  gap@-5%");
  const contentTwo = score(5, 0.02, withPolity);
  const contentFive = score(5, 0.05, withPolity);
  for (const h of [40, 20, 10, 5, 0, -5, -10, -15, -20, -30]) {
    const p2 = score(h, 0.02, withPolity);
    const p5 = score(h, 0.05, withPolity);
    const gap2 = contentTwo - p2; // how far this city sits BELOW a content (h=+5) reference → pull out
    const gap5 = contentFive - p5;
    const row = [
      String(h).padStart(5),
      String(stageOf(h)).padStart(5),
      p2.toFixed(1).padStart(7),
      p5.toFixed(1).padStart(7),
      (p5 - p2).toFixed(1).padStart(7),
      gap2.toFixed(1).padStart(16),
      gap5.toFixed(1).padStart(9)
    ];
    console.log("  " + row.join(" "));
  }
}

console.log("Representative city: gross yields", JSON.stringify(GROSS), "pop", POP, "urban", URBAN);
console.log("Penalty: net = gross × (1 − min(0.80, rate × max(0,−happiness))); Food exempt.");
console.log("'gap-vs-content' = prosperity(content h=+5) − prosperity(this city): the emigration pull");
console.log("gradient. Bigger gap ⇒ this city is more strongly out-pulled by a content neighbour.");

table("Pre-polity model (yields-only reaction to the −5% change)", false);
table("With 1.4.1 polity model", true);

// Headline deltas the user cares about.
const g2 = score(5, 0.02, true) - score(-15, 0.02, true);
const g5 = score(5, 0.05, true) - score(-15, 0.05, true);
console.log(`\nHeadline: pull gradient (content +5 → unhappy −15), polity ON:`);
console.log(`  −2% world: ${g2.toFixed(1)}   −5% world: ${g5.toFixed(1)}   ` +
  `→ ${((g5 / g2 - 1) * 100).toFixed(0)}% steeper misery push under 1.4.1.`);
const stageOnly = score(-15, 0.05, true) - score(-15, 0.05, false);
console.log(`  Of which the new stage term contributes ${stageOnly.toFixed(1)} at h=−15 ` +
  `(happinessStageWeight=${CONFIG.happinessStageWeight}).`);
