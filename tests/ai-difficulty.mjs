// ai-difficulty.mjs
//
// The AI's price discount for the game's difficulty (emigration-ai-difficulty.js): the game's Gold handicap level
// step for the difficulty in play, times the setting, off the mod's prices for AI civilizations. Deity (step 5) at
// the default 4% a step is 20% off.

import assert from "node:assert/strict";

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const d = await import("/emigration/ui/emigration-ai-difficulty.js");
const { CALL_HOME_SCOPE, CALL_HOME_CURRENCY, callHomeCost } = await import("/emigration/ui/emigration-call-home.js");

// The game's own Gold rows (base-standard difficulties.xml, 1.5.0): a percentage, not a step count. Read as raw
// numbers they put King and up on the half-price floor; ranked, they give Settler 0 ... Deity 5.
const rows = [
  { DifficultyType: "DIFFICULTY_SETTLER", HandicapSystemType: "HANDICAP_GOLD", HandicapLevel: -20 },
  { DifficultyType: "DIFFICULTY_PRINCE", HandicapSystemType: "HANDICAP_GOLD", HandicapLevel: 0 },
  { DifficultyType: "DIFFICULTY_KING", HandicapSystemType: "HANDICAP_GOLD", HandicapLevel: 20 },
  { DifficultyType: "DIFFICULTY_EMPEROR", HandicapSystemType: "HANDICAP_GOLD", HandicapLevel: 40 },
  { DifficultyType: "DIFFICULTY_IMMORTAL", HandicapSystemType: "HANDICAP_GOLD", HandicapLevel: 60 },
  { DifficultyType: "DIFFICULTY_DEITY", HandicapSystemType: "HANDICAP_GOLD", HandicapLevel: 80 },
  { DifficultyType: "DIFFICULTY_DEITY", HandicapSystemType: "HANDICAP_COMBAT", HandicapLevel: 8 }
];
assert.equal(d.goldHandicapLevel("DIFFICULTY_PRINCE", rows), 1, "Prince is one step up from Settler");
assert.equal(d.goldHandicapLevel("DIFFICULTY_KING", rows), 2, "King is two steps, not 20");
// Another mod's extra difficulty between King and Emperor moves the ladder: Deity becomes step 6.
assert.equal(d.goldHandicapLevel("DIFFICULTY_DEITY",
  [...rows, { DifficultyType: "DIFFICULTY_MOD_EXTRA", HandicapSystemType: "HANDICAP_GOLD", HandicapLevel: 30 }]), 6);
assert.equal(d.goldHandicapLevel("DIFFICULTY_DEITY", rows), 5, "the Gold system's level, not another system's");
assert.equal(d.goldHandicapLevel("DIFFICULTY_SETTLER", rows), 0);
assert.equal(d.goldHandicapLevel("DIFFICULTY_UNKNOWN", rows), 0, "unknown: no discount");
CONFIG.aiDifficultyDiscountPerLevel = 0.04;
assert.equal(d.aiPriceScale(5), 0.8, "Deity: 20% off");
assert.equal(d.aiPriceScale(0), 1);
assert.equal(d.aiPriceScale(50), 0.5, "never under half price");
CONFIG.aiDifficultyDiscountPerLevel = 0;
assert.equal(d.aiPriceScale(5), 1, "the setting at zero: the player's price");
assert.equal(d.difficultyType(() => "DIFFICULTY_KING"), "DIFFICULTY_KING");
assert.equal(d.difficultyType(() => null), "", "unreadable reads as empty");

// Off-engine, with nothing to read, the live scale is 1 and the AI's call price is the player's.
d._forgetDifficulty();
CONFIG.aiDifficultyDiscountPerLevel = 0.04;
assert.equal(d.aiPriceScale(), 1);
const { aiPrice } = await import("/emigration/ui/emigration-call-home-ai.js");
assert.equal(aiPrice(2, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD),
  callHomeCost(2, CALL_HOME_SCOPE.INTERNAL, CALL_HOME_CURRENCY.GOLD));
console.log("ai-difficulty: ok");
