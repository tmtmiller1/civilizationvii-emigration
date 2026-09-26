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
const { resolveApplied, quarterView, accrueContestedStrain, tileKeyOf, enclaveCountForCiv, MAX_ENCLAVES_PER_CIV, applyOwnerQuarterYields, retireDisplacedEnclaves, hostOwners, recordOwners, RECOGNITION, settleTakeover, payTakeoverCompensation, fadeStep, stanceButton } = quarter.__test;

// ── resolveApplied: a one-time payout sized from the host's income, with per-age floors ──────────
{
  // Game.age 1 has no GameInfo here, so the age reads as Antiquity: floor 60, price floor 90.
  const embrace = resolveApplied({ benefitYield: "YIELD_CULTURE" }, 0, 3);
  assert.equal(embrace.once, true, "a stance is paid once, never per turn");
  assert.equal(embrace.benefitYield, "YIELD_CULTURE");
  assert.equal(embrace.benefitAmount, 60, "with no income to read, the payout is the age floor");
  assert.equal(embrace.penaltyYield, "YIELD_GOLD", "a non-Gold stance costs Gold");
  assert.equal(embrace.penaltyAmount, 90, "the price floor is 1.5x the payout floor");
  const atWar = resolveApplied({ benefitYield: "YIELD_CULTURE" }, 0, 2);
  assert.equal(atWar.benefitAmount, 30, "an enclave whose homeland is at war with the host pays half");
  assert.equal(atWar.penaltyAmount, 90, "its price is unchanged");
  const tax = resolveApplied({ benefitYield: "YIELD_GOLD" }, 0, 3);
  assert.equal(tax.penaltyYield, null, "a Gold stance costs nothing");
  const passive = resolveApplied({ benefitYield: null }, 0, 3);
  assert.equal(passive.benefitAmount, 0, "the passive stance pays nothing");
  assert.equal(passive.penaltyAmount, 0, "and costs nothing");
  const food = resolveApplied({ benefitYield: "YIELD_FOOD" }, 0, 3);
  assert.equal(food.benefitAmount, 0, "a yield a script cannot grant is never promised");
}

// ── tileKeyOf: city-center plot key, defensive ──────────────────────────────
{
  assert.equal(tileKeyOf({ location: { x: 3, y: 4 } }), "3,4", "plot key is x,y");
  assert.equal(tileKeyOf(null), null, "no city yields no key");
  assert.equal(tileKeyOf({ location: {} }), null, "an unreadable location yields no key");
}

// ── quarterView: the decision modal model ───────────────────────────────────
{
  const view = quarterView({ civ: 2, name: "Rome", share: 0.4, where: "by the harbor" }, 0);
  assert.equal(view.eyebrow, "Cultural Enclave", "the modal eyebrow marks a cultural-enclave decision");
  assert.equal(view.eyebrowIcon, "CITY_UNIQUE_QUARTER");
  assert.equal(view.dismissId, "ignore", "dismissing resolves as the passive stance");
  assert.equal(view.choices.length, 3, "the three stances are offered");
  assert.ok(typeof view.title === "string" && view.title.length, "the view has a title");
  assert.ok(typeof view.body === "string" && view.body.length, "the view has body prose");
  assert.ok(view.body.includes("By the harbor"), "the body weaves in the capitalized edge phrase");
  // Exactly ONE quote, at the view level — the options themselves carry none.
  assert.equal(typeof view.quote, "string", "the view exposes a single enclave-level quote string");
  assert.ok(view.choices.every((c) => c.quote === undefined), "individual options no longer carry quotes");
  // Each button states what its stance pays; the body only says it is paid once.
  assert.deepEqual(view.details, ["Paid once, when you choose."], "one note in the body, no per-stance lines");
  const [c0, , letBe] = view.choices;
  const paid = resolveApplied(c0, 0, 2); // host 0 is at war with civ 2: the payout is halved
  assert.ok(c0.label.includes(": [icon:" + paid.benefitYield + "] +" + paid.benefitAmount),
    "the button carries its payout and the yield's icon: " + c0.label);
  if (paid.penaltyAmount) {
    assert.ok(c0.label.includes("[icon:YIELD_GOLD] -" + paid.penaltyAmount), "and its Gold price");
    assert.ok(c0.label.indexOf(" +") < c0.label.indexOf(" -"), "the gain reads before the cost");
  }
  assert.equal(letBe.label, "Let them be", "the passive stance keeps its bare label");
  assert.ok(view.choices.every((c) => !c.disabled), "with an unreadable treasury nothing is grayed out");
}

// ── quarterView: a stance the host cannot pay for is grayed out and says why ──
{
  const realGet = globalThis.Players.get;
  globalThis.Players.get = (id) => ({ ...realGet(id), Treasury: { goldBalance: 10 } });
  const view = quarterView({ civ: 3, name: "Rome", share: 0.4, where: "by the harbor" }, 0);
  const costly = view.choices.filter((c) => c.penaltyYield === "YIELD_GOLD");
  assert.ok(costly.length && costly.every((c) => c.disabled), "every Gold-costing stance is grayed out at 10 Gold");
  assert.ok(view.choices.find((c) => c.id === "ignore").disabled !== true, "letting them be is always open");
  assert.ok(costly.every((c) => c.label.endsWith("(not enough Gold)")), "its button says why");
  globalThis.Players.get = realGet;
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

// ── enclaveCountForCiv + per-civ cap: 2 PER origin civilization, NOT a global cap ──
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

// ── stance grant: every established quarter pays its "recognized" reward each pass ──
// (The old "built enclave replaces the stance grant" path was removed with the cultural-enclave BUILD
//  feature; nothing is ever built now, so every established quarter always pays its stance grant.)
{
  const applied = { benefitYield: "YIELD_CULTURE", benefitAmount: 2, penaltyYield: "YIELD_HAPPINESS", penaltyAmount: 1 };
  // A FRESH host (11), so the quarters seeded for host 0 above cannot leak into the grant tally.
  stateMod.putQuarter("80,80", { civ: 2, originCiv: "CIVILIZATION_ROME", owner: 11, optionId: "a", turn: 5, applied, contested: false, contestedTurn: -999 });
  stateMod.putQuarter("81,81", { civ: 3, originCiv: "CIVILIZATION_GREECE", owner: 11, optionId: "a", turn: 5, applied, contested: false, contestedTurn: -999 });

  // grantSigned resolves the yield KEY through YieldTypes before granting, so the stub must supply it.
  globalThis.YieldTypes = { YIELD_CULTURE: "yt-culture", YIELD_HAPPINESS: "yt-happiness" };

  /** @type {{yield:string, amount:number}[]} */
  let granted = [];
  const realPlayers = globalThis.Players;
  globalThis.Players = { grantYield: (_pid, y, amount) => { granted.push({ yield: y, amount }); } };

  applyOwnerQuarterYields(11);
  // Both quarters pay their +2 Culture / -1 Happiness stance grant: 2 quarters x 2 yields = 4.
  assert.equal(granted.length, 4, "every established quarter's stance grant pays (Roman and Greek)");

  globalThis.Players = realPlayers;
}

// ── contested stance grant: a contested enclave pays a REDUCED benefit, full drawback ──
{
  const applied = { benefitYield: "YIELD_CULTURE", benefitAmount: 2, penaltyYield: "YIELD_HAPPINESS", penaltyAmount: 1 };
  stateMod.putQuarter("90,90", { civ: 2, originCiv: "CIVILIZATION_ROME", owner: 12, optionId: "a", turn: 5, applied, contested: true, contestedTurn: 5 });
  globalThis.YieldTypes = { YIELD_CULTURE: "yt-culture", YIELD_HAPPINESS: "yt-happiness" };

  const priorFactor = CONFIG.contestedQuarterYieldFactor;
  CONFIG.contestedQuarterYieldFactor = 0.5;
  /** @type {{yield:string, amount:number}[]} */
  let granted = [];
  const realPlayers = globalThis.Players;
  globalThis.Players = { grantYield: (_pid, y, amount) => { granted.push({ yield: y, amount }); } };

  applyOwnerQuarterYields(12);
  const benefit = granted.find((g) => g.yield === "yt-culture");
  const penalty = granted.find((g) => g.yield === "yt-happiness");
  assert.equal(benefit.amount, 1, "a contested enclave's +2 benefit is halved to +1");
  assert.equal(penalty.amount, -1, "a contested enclave's drawback stays full");

  CONFIG.contestedQuarterYieldFactor = priorFactor;
  globalThis.Players = realPlayers;
}

console.log("quarter harness passed");

// ── built over: a placed enclave that stood and then vanished is DESTROYED (record dropped, chronicled);
//    one that never landed is written off after a short grace and keeps paying from the treasury ──
{
  const applied = { benefitYield: "YIELD_CULTURE", benefitAmount: 2, penaltyYield: null, penaltyAmount: 0 };
  // A minimal map: plot 500 holds a Gama at (50,50); plot 501 at (51,50) is empty.
  const oldMap = globalThis.GameplayMap, oldMC = globalThis.MapConstructibles, oldCons = globalThis.Constructibles, oldInfo = globalThis.GameInfo;
  const onMap = { "50,50": ["gama"] };
  globalThis.GameplayMap = { ...(oldMap || {}), getLocationFromIndex: (i) => (i === 500 ? { x: 50, y: 50 } : i === 501 ? { x: 51, y: 50 } : null) };
  globalThis.MapConstructibles = { getConstructibles: (x, y) => onMap[x + "," + y] || [] };
  globalThis.Constructibles = { getByComponentID: (id) => ({ type: id }) };
  globalThis.GameInfo = { ...(oldInfo || {}), Constructibles: { lookup: (t) => (t === "gama" ? { ConstructibleType: "IMPROVEMENT_GAMA" } : null) } };
  stateMod.putQuarter("90,90", { civ: 2, originCiv: "CIVILIZATION_GORYEO", owner: 12, optionId: "a", turn: 10, applied, contested: false, contestedTurn: -999,
    placed: { type: "IMPROVEMENT_GAMA", plot: 500, enclave: "IMPROVEMENT_EMIG_ENCLAVE_GORYEO_A" } });
  stateMod.putQuarter("91,91", { civ: 3, originCiv: "CIVILIZATION_ROME", owner: 12, optionId: "a", turn: 10, applied, contested: false, contestedTurn: -999,
    placed: { type: "IMPROVEMENT_HIDDEN_FORTRESS", plot: 501, enclave: "IMPROVEMENT_EMIG_ENCLAVE_ROME_A" } });
  retireDisplacedEnclaves(12, 10);
  assert.equal(stateMod.quarterAt("90,90").placed.stood, true, "a standing tile is marked as having stood");
  assert.ok(stateMod.quarterAt("91,91") && stateMod.quarterAt("91,91").placed, "a fresh placement gets its grace");
  retireDisplacedEnclaves(12, 12);
  assert.equal(stateMod.quarterAt("91,91").placed, null, "never landed (empty plot) after the grace: cleared, the stance keeps its treasury grant");
  onMap["50,50"] = ["wonder"]; // the city built a wonder over the Gama
  retireDisplacedEnclaves(12, 13);
  assert.equal(stateMod.quarterAt("90,90"), null, "built over: the enclave is destroyed and its record dropped");
  // A wonder can complete over the tile before any pass saw it standing: an OCCUPIED plot is built over, not
  // "never landed", but only AFTER the placement grace (a brand-new record's plot still shows the tile it replaces).
  onMap["51,50"] = ["wonder"];
  stateMod.putQuarter("92,92", { civ: 3, originCiv: "CIVILIZATION_ROME", owner: 12, optionId: "a", turn: 20, applied, contested: false, contestedTurn: -999,
    placed: { type: "IMPROVEMENT_HIDDEN_FORTRESS", plot: 501, enclave: "IMPROVEMENT_EMIG_ENCLAVE_ROME_A" } });
  retireDisplacedEnclaves(12, 20);
  assert.ok(stateMod.quarterAt("92,92"), "same pass as the placement: untouched (the replaced tile may still show)");
  retireDisplacedEnclaves(12, 22);
  assert.equal(stateMod.quarterAt("92,92"), null, "displaced before it was ever seen standing: destroyed after the grace");
  delete onMap["51,50"];
  stateMod.dropQuarter("91,91");
  globalThis.GameplayMap = oldMap; globalThis.MapConstructibles = oldMC; globalThis.Constructibles = oldCons; globalThis.GameInfo = oldInfo;
}

// ── recognition mode: who may host an enclave this pass, and whose records get per-turn upkeep ──
{
  const signals = [{ owner: 0, isCityState: false }, { owner: 3, isCityState: false }, { owner: 7, isCityState: true }, { owner: 3, isCityState: false }];
  CONFIG.quarterRecognition = RECOGNITION.ASK;
  assert.deepEqual(hostOwners(signals, 0), [0], "ask: the local player only");
  CONFIG.quarterRecognition = RECOGNITION.AUTO_ME;
  assert.deepEqual(hostOwners(signals, 0), [0], "automatic in your cities: the local player only");
  CONFIG.quarterRecognition = RECOGNITION.AUTO_ALL;
  assert.deepEqual(hostOwners(signals, 0), [0, 3], "automatic everywhere: every major with a city signal, city-states excluded, no duplicates");
  const applied = { benefitYield: "YIELD_CULTURE", benefitAmount: 2, penaltyYield: null, penaltyAmount: 0 };
  stateMod.putQuarter("95,95", { civ: 2, originCiv: "CIVILIZATION_ROME", owner: 3, optionId: "a", turn: 30, applied, contested: false, contestedTurn: -999 });
  const owners = recordOwners(0);
  assert.ok(owners[0] === 0 && owners.includes(3), "the local player first, and an AI host with a record is ticked like the player");
  stateMod.dropQuarter("95,95");
  CONFIG.quarterRecognition = 2;
}

// ── takeover compensation is settled once the tile stands and paid every tick while it stands ──
{
  const applied = { benefitYield: null, benefitAmount: 0, penaltyYield: null, penaltyAmount: 0 };
  const oldMap = globalThis.GameplayMap, oldMC = globalThis.MapConstructibles, oldCons = globalThis.Constructibles, oldInfo = globalThis.GameInfo, oldPlayers = globalThis.Players;
  globalThis.GameplayMap = { ...(oldMap || {}), getLocationFromIndex: (i) => (i === 700 ? { x: 70, y: 70 } : null), getYields: () => [["YIELD_FOOD", 2], ["YIELD_CULTURE", 3]] };
  globalThis.MapConstructibles = { getConstructibles: (x, y) => (x === 70 && y === 70 ? ["gama"] : []) };
  globalThis.Constructibles = { getByComponentID: (id) => ({ type: id }) };
  globalThis.GameInfo = { ...(oldInfo || {}), Constructibles: { lookup: (t) => (t === "gama" ? { ConstructibleType: "IMPROVEMENT_GAMA" } : null) }, Yields: { lookup: (t) => ({ YieldType: t }) },
    Constructible_YieldChanges: { filter: (f) => [{ ConstructibleType: "IMPROVEMENT_GAMA", YieldType: "YIELD_CULTURE", YieldChange: 3 }].filter(f) } };
  const granted = [];
  globalThis.YieldTypes = { ...(globalThis.YieldTypes || {}), YIELD_FOOD: "FOOD", YIELD_CULTURE: "CULTURE" };
  globalThis.Players = { grantYield: (pid, y, amount) => granted.push([pid, y, amount]) };
  stateMod.putQuarter("97,97", { civ: 2, originCiv: "CIVILIZATION_GORYEO", owner: 13, optionId: "a", turn: 40, applied, contested: false, contestedTurn: -999,
    placed: { type: "IMPROVEMENT_GAMA", plot: 700, enclave: "IMPROVEMENT_EMIG_ENCLAVE_GORYEO_A", replaced: "IMPROVEMENT_FARM", before: { YIELD_FOOD: 3, YIELD_PRODUCTION: 1 } } });
  retireDisplacedEnclaves(13, 40); // first seen standing → settled
  const rec = stateMod.quarterAt("97,97");
  assert.equal(rec.placed.stood, true);
  assert.deepEqual(rec.placed.compensation, { YIELD_FOOD: 1, YIELD_PRODUCTION: 1 }, "the farm's food and production the Gama tile lacks");
  payTakeoverCompensation(13);
  assert.deepEqual(granted, [[13, "FOOD", 1], [13, "PRODUCTION", 1]].filter((g) => g[1] !== "PRODUCTION"), "paid to the host each tick (production has no YieldTypes stub here)");
  settleTakeover(rec);
  assert.deepEqual(rec.placed.compensation, { YIELD_FOOD: 1, YIELD_PRODUCTION: 1 }, "settled once, not recomputed");
  stateMod.dropQuarter("97,97");
  globalThis.GameplayMap = oldMap; globalThis.MapConstructibles = oldMC; globalThis.Constructibles = oldCons; globalThis.GameInfo = oldInfo; globalThis.Players = oldPlayers;
}

// ── fade: below the share bar (and the stock bar) for the period → dissolve; either bar keeps it ──
{
  const cfg = { fadeShare: 0.125, fadeTurns: 12, stockBar: 6 };
  assert.equal(fadeStep({ fadeSince: null }, { share: 0.2, pts: 2 }, 50, cfg), "above", "share over the bar keeps it");
  assert.equal(fadeStep({ fadeSince: null }, { share: 0.05, pts: 7 }, 50, cfg), "above", "a big community in a big city keeps it whatever its share");
  assert.equal(fadeStep({ fadeSince: null }, { share: 0.05, pts: 2 }, 50, cfg), "counting", "below both bars: the clock starts");
  assert.equal(fadeStep({ fadeSince: 40 }, { share: 0.05, pts: 2 }, 51, cfg), "counting", "11 turns below: not yet");
  assert.equal(fadeStep({ fadeSince: 40 }, { share: 0.05, pts: 2 }, 52, cfg), "fade", "12 turns below: dissolve");
  assert.equal(fadeStep({ fadeSince: 40 }, { share: 0.3, pts: 2 }, 60, cfg), "above", "recovered: the clock resets");
  assert.equal(fadeStep({ fadeSince: 40 }, null, 60, cfg), "unknown", "an untracked settlement is left alone");
  assert.equal(fadeStep({ fadeSince: 40 }, { share: 0, pts: 0 }, 99, { ...cfg, fadeShare: 0 }), "unknown", "0 = never fade");
}
