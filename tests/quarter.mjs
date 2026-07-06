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
const { resolveApplied, quarterView, accrueContestedStrain, tileKeyOf, enclaveCountForCiv, MAX_ENCLAVES_PER_CIV } = quarter.__test;

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
  const view = quarterView({ civ: 2, name: "Rome", share: 0.4, where: "by the harbour" }, 0);
  assert.equal(view.eyebrow, "Cultural Enclave", "the modal eyebrow marks a cultural-enclave decision");
  assert.equal(view.dismissId, "ignore", "dismissing resolves as the passive stance");
  assert.equal(view.choices.length, 3, "the three stances are offered");
  assert.ok(typeof view.title === "string" && view.title.length, "the view has a title");
  assert.ok(typeof view.body === "string" && view.body.length, "the view has body prose");
  assert.ok(view.body.includes("By the harbour"), "the body weaves in the capitalised edge phrase");
  // Exactly ONE quote, at the view level — the options themselves carry none.
  assert.equal(typeof view.quote, "string", "the view exposes a single enclave-level quote string");
  assert.ok(view.choices.every((c) => c.quote === undefined), "individual options no longer carry quotes");
}

// ── accrueContestedStrain: war with a homeland turns its quarter contested ──
{
  const applied = { benefitYield: "YIELD_CULTURE", benefitAmount: 40, penaltyYield: "YIELD_HAPPINESS", penaltyAmount: 20 };
  stateMod.putQuarter("5,5", { civ: 2, owner: 0, optionId: "a", turn: 5, applied, contested: false, contestedTurn: -999 });
  stateMod.putQuarter("6,6", { civ: 3, owner: 0, optionId: "b", turn: 5, applied, contested: false, contestedTurn: -999 });
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

// ── enclaveCountForCiv + per-civ cap: 2 PER origin civilisation, NOT a global cap ──
{
  const ap = { benefitYield: "YIELD_CULTURE", benefitAmount: 40, penaltyYield: "YIELD_HAPPINESS", penaltyAmount: 20 };
  const put = (key, civ, originCiv) =>
    stateMod.putQuarter(key, { civ, originCiv, owner: 9, optionId: "a", turn: 5, applied: ap, contested: false, contestedTurn: -999 });
  // Two enclaves of civ ROME (different origin PLAYER ids 7 and 17, same CivilizationType) + one of NORMAN.
  put("70,70", 7, "CIVILIZATION_ROME");
  put("71,71", 17, "CIVILIZATION_ROME");
  put("72,72", 8, "CIVILIZATION_NORMAN");

  // Identity is by CivilizationType: the two Roman-origin players count TOGETHER.
  assert.equal(enclaveCountForCiv(9, 7, "CIVILIZATION_ROME", null), 2, "same civ across two origin players counts together");
  assert.equal(enclaveCountForCiv(9, 7, "CIVILIZATION_ROME", "70,70"), 1, "excludes the candidate's own tile");
  // The cap is PER civ, not global: Norman is independent — a host can still hold up to two Normans.
  assert.equal(enclaveCountForCiv(9, 8, "CIVILIZATION_NORMAN", null), 1, "a different origin civ counts independently (not global)");
  assert.ok(enclaveCountForCiv(9, 8, "CIVILIZATION_NORMAN", null) < MAX_ENCLAVES_PER_CIV, "two Romans don't block forming a Norman");
  // Deterministic fallback to origin player id when the CivilizationType is unavailable (legacy record).
  stateMod.putQuarter("73,73", { civ: 5, originCiv: null, owner: 9, optionId: "a", turn: 5, applied: ap, contested: false, contestedTurn: -999 });
  assert.equal(enclaveCountForCiv(9, 5, null, null), 1, "legacy record with no CivilizationType falls back to origin player id");
  assert.equal(MAX_ENCLAVES_PER_CIV, 2, "the per-civ enclave cap is two");
}

console.log("quarter harness passed");
