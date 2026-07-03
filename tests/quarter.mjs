// quarter.mjs
//
// The Cultural Quarter DECISION runtime (emigration-quarter.js): the pure decision pieces exercised
// off-engine. The modal + yield grants are exercised in-game; here we test the yield resolution, the
// modal view model, the tile-key helper, and the contested war-strain accrual (which marks quarters
// contested while the host is at war with their homeland). A Configuration KV stub plus a small
// Players/Diplomacy stub drive the war-state read.

import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => { KV[k] = v; } })
};
globalThis.Game = { age: 1, turn: 5 };
globalThis.GameContext = { localPlayerID: 0 };
// Owner 0 is at war with civ 2 (the homeland of one seeded quarter), not civ 3.
globalThis.Players = {
  getAlive: () => [{ id: 0 }, { id: 2 }, { id: 3 }],
  get: (id) => ({ Diplomacy: { isAtWarWith: (other) => id === 0 && other === 2 } }),
  grantYield: () => {}
};

const quarter = await import("/emigration/ui/emigration-quarter.js");
const stateMod = await import("/emigration/ui/emigration-quarter-state.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { resolveApplied, quarterView, accrueContestedStrain, tileKeyOf } = quarter.__test;

// ── resolveApplied: CONFIG amounts, null yields contribute nothing ──────────
{
  const embrace = resolveApplied({ benefitYield: "YIELD_CULTURE", penaltyYield: "YIELD_HAPPINESS" });
  assert.equal(embrace.benefitYield, "YIELD_CULTURE");
  assert.equal(embrace.benefitAmount, CONFIG.quarterRewardAmount, "benefit uses the CONFIG reward");
  assert.equal(embrace.penaltyAmount, CONFIG.quarterDrawbackAmount, "drawback uses the CONFIG amount");
  const passive = resolveApplied({ benefitYield: null, penaltyYield: null });
  assert.equal(passive.benefitAmount, 0, "a null benefit yield grants nothing");
  assert.equal(passive.penaltyAmount, 0, "a null penalty yield costs nothing");
}

// ── tileKeyOf: city-centre plot key, defensive ──────────────────────────────
{
  assert.equal(tileKeyOf({ location: { x: 3, y: 4 } }), "3,4", "plot key is x,y");
  assert.equal(tileKeyOf(null), null, "no city yields no key");
  assert.equal(tileKeyOf({ location: {} }), null, "an unreadable location yields no key");
}

// ── quarterView: the decision modal model ───────────────────────────────────
{
  const view = quarterView({ civ: 2, name: "Rome", share: 0.4 });
  assert.equal(view.eyebrow, "Cultural Quarter", "the modal eyebrow marks a quarter decision");
  assert.equal(view.dismissId, "ignore", "dismissing resolves as the passive stance");
  assert.equal(view.choices.length, 3, "the three stances are offered");
  assert.ok(typeof view.title === "string" && view.title.length, "the view has a title");
  assert.ok(typeof view.body === "string" && view.body.length, "the view has body prose");
}

// ── accrueContestedStrain: war with a homeland turns its quarter contested ──
{
  const applied = { benefitYield: "YIELD_CULTURE", benefitAmount: 40, penaltyYield: "YIELD_HAPPINESS", penaltyAmount: 20 };
  stateMod.putQuarter("5,5", { civ: 2, owner: 0, optionId: "embrace", turn: 5, applied, contested: false, contestedTurn: -999 });
  stateMod.putQuarter("6,6", { civ: 3, owner: 0, optionId: "tax", turn: 5, applied, contested: false, contestedTurn: -999 });
  const strain = accrueContestedStrain(0, 10);
  assert.equal(strain, CONFIG.contestedQuarterPenalty, "one contested quarter accrues one unit of strain");
  assert.equal(stateMod.quarterAt("5,5").contested, true, "the at-war homeland's quarter is contested");
  assert.equal(stateMod.quarterAt("6,6").contested, false, "a peaceful homeland's quarter is not contested");
  // A later peace clears it.
  globalThis.Players.get = () => ({ Diplomacy: { isAtWarWith: () => false } });
  const calm = accrueContestedStrain(0, 20);
  assert.equal(calm, 0, "with no wars, no strain accrues");
  assert.equal(stateMod.quarterAt("5,5").contested, false, "peace clears the contested flag");
}

console.log("quarter harness passed");
