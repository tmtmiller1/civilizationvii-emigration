// stance-payout.mjs
//
// What a recognized enclave's stance pays once (emigration-stance-payout.js): a number of turns of the host's
// own income of the yield it pays, a Gold price in turns of its Gold income, each above a per-age floor, all
// multiplied by the game-speed scalar and rounded to 5. Players, YieldTypes, Game and GameInfo are stubbed.

import assert from "node:assert/strict";

const INCOME = { YIELD_GOLD: 705.24, YIELD_CULTURE: 221.27, YIELD_SCIENCE: 251.02, YIELD_DIPLOMACY: -15.64 };
let gold = 804;
const granted = [];
globalThis.YieldTypes = { YIELD_GOLD: "G", YIELD_CULTURE: "C", YIELD_SCIENCE: "S", YIELD_DIPLOMACY: "D", YIELD_FOOD: "F" };
const byType = Object.fromEntries(Object.entries(globalThis.YieldTypes).map(([k, v]) => [v, k]));
globalThis.Players = {
  get: () => ({ Stats: { getNetYield: (yt) => INCOME[byType[yt]] ?? 0 }, Treasury: { get goldBalance() { return gold; } } }),
  grantYield: (pid, yt, n) => granted.push([pid, byType[yt], n])
};
globalThis.Game = { age: "EXPL" };
globalThis.GameInfo = { Ages: { lookup: (h) => ({ AgeType: h === "EXPL" ? "AGE_EXPLORATION" : h === "MOD" ? "AGE_MODERN" : "AGE_ANTIQUITY" }) } };

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { stancePayout, affordable, payStance, ageIndex, __test } = await import("/emigration/ui/emigration-stance-payout.js");
const speed = await import("/emigration/ui/emigration-game-speed.js");
CONFIG.gameSpeedTuningEnabled = false; // S = 1 unless a case sets it

// ── the probe save's economy (Exploration, turn 66): the payout tracks the host's own income ──────────
{
  assert.equal(ageIndex(), 1, "Exploration is age 1");
  const culture = stancePayout({ benefitYield: "YIELD_CULTURE" }, 0);
  assert.deepEqual(culture, { benefitYield: "YIELD_CULTURE", benefitAmount: 665, penaltyYield: "YIELD_GOLD", penaltyAmount: 1410, once: true },
    "3 turns of 221 Culture = 665; 2 turns of 705 Gold = 1410");
  const science = stancePayout({ benefitYield: "YIELD_SCIENCE" }, 0);
  assert.equal(science.benefitAmount, 755, "3 turns of 251 Science, rounded to 5");
  const tax = stancePayout({ benefitYield: "YIELD_GOLD" }, 0);
  assert.equal(tax.benefitAmount, 1060, "a Gold stance pays 1.5 turns of Gold income");
  assert.equal(tax.penaltyAmount, 0, "and costs nothing");
  const envoys = stancePayout({ benefitYield: "YIELD_DIPLOMACY" }, 0);
  assert.equal(envoys.benefitAmount, 150, "a negative Influence income falls back to the Exploration floor");
}

// ── floors hold for a poor host, and rise with the age ─────────────────────────────────────────────
{
  for (const k of Object.keys(INCOME)) INCOME[k] = 0;
  assert.equal(stancePayout({ benefitYield: "YIELD_CULTURE" }, 0).benefitAmount, 150, "Exploration floor");
  assert.equal(stancePayout({ benefitYield: "YIELD_CULTURE" }, 0).penaltyAmount, 225, "price floor 1.5x");
  globalThis.Game.age = "ANT";
  assert.equal(stancePayout({ benefitYield: "YIELD_CULTURE" }, 0).benefitAmount, 60, "Antiquity floor");
  globalThis.Game.age = "MOD";
  assert.equal(stancePayout({ benefitYield: "YIELD_CULTURE" }, 0).benefitAmount, 300, "Modern floor");
  globalThis.Game.age = "EXPL";
}

// ── game speed multiplies the whole figure (research costs scale with speed; income per turn does not) ──
{
  CONFIG.gameSpeedTuningEnabled = true;
  globalThis.Configuration = { getGame: () => ({ gameSpeedType: "MARATHON" }) };
  globalThis.GameInfo.GameSpeeds = { lookup: () => ({ CostMultiplier: 300 }) };
  speed.resetGameSpeedCache();
  const marathon = stancePayout({ benefitYield: "YIELD_CULTURE" }, 0);
  assert.equal(marathon.benefitAmount, 450, "Marathon triples the Exploration floor");
  assert.equal(marathon.penaltyAmount, 675, "and the price");
  CONFIG.gameSpeedTuningEnabled = false;
  speed.resetGameSpeedCache();
}

// ── payout scale (a contested enclave), unpayable yields, affordability, paying ────────────────────
{
  assert.equal(stancePayout({ benefitYield: "YIELD_CULTURE" }, 0, 0.5).benefitAmount, 75, "half of 150");
  assert.equal(stancePayout({ benefitYield: "YIELD_CULTURE" }, 0, 0.5).penaltyAmount, 225, "the price is not halved");
  const food = stancePayout({ benefitYield: "YIELD_FOOD" }, 0);
  assert.equal(food.benefitAmount + food.penaltyAmount, 0, "a yield a script cannot grant pays and costs nothing");
  const culture = stancePayout({ benefitYield: "YIELD_CULTURE" }, 0);
  gold = 224;
  assert.equal(affordable(culture, 0), false, "224 Gold cannot pay a 225 price");
  gold = 225;
  assert.equal(affordable(culture, 0), true, "225 can");
  assert.equal(affordable(stancePayout({ benefitYield: "YIELD_GOLD" }, 0), 0), true, "a free stance is always affordable");
  payStance(7, culture);
  assert.deepEqual(granted, [[7, "YIELD_CULTURE", 150], [7, "YIELD_GOLD", -225]], "the payout is granted and the price charged");
  assert.equal(__test.round5(2), 5, "a positive amount never rounds to nothing");
}

console.log("stance-payout harness passed");
