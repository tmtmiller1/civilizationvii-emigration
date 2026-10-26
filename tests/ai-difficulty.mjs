// ai-difficulty.mjs
//
// The AI's price discount for the game's difficulty (emigration-ai-difficulty.js): the game's Gold handicap level
// for the difficulty in play, times the setting, off the mod's prices for AI civilizations. Deity (level 5) at the
// default 4% a level is 20% off, matching the base game's Gold scaling there.

import assert from "node:assert/strict";

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const d = await import("/emigration/ui/emigration-ai-difficulty.js");
const { CALL_HOME_SCOPE, CALL_HOME_CURRENCY, callHomeCost } = await import("/emigration/ui/emigration-call-home.js");

const rows = [
  { DifficultyType: "DIFFICULTY_SETTLER", HandicapSystemType: "HANDICAP_GOLD", HandicapLevel: 0 },
  { DifficultyType: "DIFFICULTY_DEITY", HandicapSystemType: "HANDICAP_GOLD", HandicapLevel: 5 },
  { DifficultyType: "DIFFICULTY_DEITY", HandicapSystemType: "HANDICAP_COMBAT", HandicapLevel: 8 }
];
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
