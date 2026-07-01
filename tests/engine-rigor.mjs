// engine-rigor.mjs
//
// MUTATION-RIGOR harness for emigration-engine.js (see mods_quality_analyses/emigration-quality-
// analysis/mutation-rigor-remediation-plan.md). engine-pass.mjs / engine-legacy-snapshots.mjs cover
// that the pass *runs*; this pins the exact boundary/arithmetic/branch behaviour of the engine's
// decision + sizing helpers via the `__test` surface, to kill the 302 survivors (97 conditional /
// 45 equality / 33 arithmetic / …).
//
// Determinism: CONFIG.gameSpeedTuningEnabled=false makes speedBar/speedTurns/speedShock/speedDecay the
// identity, and warSiege=false makes siegeEscalation()=1, so every figure below is an exact integer.

import assert from "node:assert/strict";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { __test as E, runPass } from "/emigration/ui/emigration-engine.js";
import { marginalPeople } from "/emigration/ui/emigration-population.js";

// ── Engine globals (only what the helpers under test read) ────────────────────
globalThis.YieldTypes = { YIELD_FOOD: "YIELD_FOOD", YIELD_PRODUCTION: "YIELD_PRODUCTION", YIELD_GOLD: "YIELD_GOLD", YIELD_SCIENCE: "YIELD_SCIENCE", YIELD_CULTURE: "YIELD_CULTURE", YIELD_HAPPINESS: "YIELD_HAPPINESS" };
globalThis.GameplayMap = { getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by) };
globalThis.Database = { makeHash: (t) => t };
globalThis.GameContext = { localPlayerID: 1 };
globalThis.Locale = { compose: (s) => s };
globalThis.Game = { turn: 1 };
const kv = {};
globalThis.Configuration = { getGame: () => ({ getValue: (k) => kv[k] }), editGame: () => ({ setValue: (k, v) => (kv[k] = v) }) };

// A baseline deterministic CONFIG regime; individual cases override the few knobs they exercise.
function pin() {
  Object.assign(CONFIG, {
    gameSpeedTuningEnabled: false, // speed* helpers become identity
    warSiege: false, // siegeEscalation() => 1
    minRuralToEmigrate: 1, emigrationBar: 10, deltaExponent: 1, cooldownTurns: 4,
    maxMovesPerTurn: 5, movesPerCity: 2, movesPerSiege: 3, maxLossPerCityPerTurn: 0,
    warSurgeMax: 1, violenceFleeThreshold: 10, disasterFleeThreshold: 10, unhappyCauseThreshold: -5,
    transitLagTurns: 0, transitHexPerTurn: 5, splitTracksEnabled: true, splitBudgetsEnabled: true,
    attritionEnabled: true, attritionMinDistress: 10, attritionThreshold: 10, crisisDeathEnabled: true,
    crisisDeathShare: 0.5, crisisSeverityCap: 100, crisisParticipantMax: 10, crisisParticipantWeight: 0.5,
    crisisCombatMax: 10, crisisCombatWeight: 0.01, bordersEnabled: false,
    // knobs various cases mutate, reset here so each pin() is a clean, leak-free baseline
    poachBlock: 0, crossCivEnabled: true, maxGainPerCityPerTurn: 0, starvationModifier: 0,
    foodFactor: 2.5, deltaExponent: 1
  });
}
pin();

// A plain source signal (the fields the helpers read).
function sig(o = {}) {
  return {
    owner: o.owner ?? 1, key: o.key ?? "k", rural: o.rural ?? 5, population: o.population ?? 5,
    violence: o.violence ?? 0, disaster: o.disaster ?? 0, happiness: o.happiness ?? 0,
    siege: o.siege ?? false, infected: o.infected ?? false,
    city: o.city ?? { name: o.name ?? "City", location: o.loc ?? { x: 0, y: 0 }, id: o.id }
  };
}

// ════════════════════════════════════════════════════════════════════════════
// P2/P4, pure classification + sizing helpers (exact boundaries)
// ════════════════════════════════════════════════════════════════════════════

// ── transitLag (L74,75,79,80,81) ──────────────────────────────────────────────
{
  pin();
  CONFIG.transitLagTurns = 0;
  assert.equal(E.transitLag(sig({ key: "a" }), sig({ key: "b", loc: { x: 9, y: 0 } }), "prosperity"), 0,
    "lag is 0 when the feature is off");
  CONFIG.transitLagTurns = 10; CONFIG.transitHexPerTurn = 5;
  // distance 20 / 5 = 4 (exact division, then round)
  assert.equal(E.transitLag(sig({ key: "c", loc: { x: 0, y: 0 } }), sig({ key: "d", loc: { x: 20, y: 0 } }), "prosperity"), 4,
    "lag = round(distance / hexPerTurn)");
  // refugee floor: distance 0 → 0, floored to 1
  assert.equal(E.transitLag(sig({ key: "e", loc: { x: 0, y: 0 } }), sig({ key: "f", loc: { x: 0, y: 0 } }), "war"), 1,
    "a refugee camps at least one turn even at distance 0");
  // a NON-refugee at distance 0 stays 0 (proves the floor is refugee-only)
  assert.equal(E.transitLag(sig({ key: "e2", loc: { x: 0, y: 0 } }), sig({ key: "f2", loc: { x: 0, y: 0 } }), "prosperity"), 0,
    "a voluntary move at distance 0 has no floor");
  // cap at transitLagTurns: distance 100 / 5 = 20, capped to 10
  assert.equal(E.transitLag(sig({ key: "g", loc: { x: 0, y: 0 } }), sig({ key: "h", loc: { x: 100, y: 0 } }), "prosperity"), 10,
    "lag is capped at transitLagTurns");
  // hexPerTurn 0 → divisor defaults to 1: distance 3 / 1 = 3
  CONFIG.transitHexPerTurn = 0;
  assert.equal(E.transitLag(sig({ key: "i", loc: { x: 0, y: 0 } }), sig({ key: "j", loc: { x: 3, y: 0 } }), "prosperity"), 3,
    "a zero hexPerTurn defaults the divisor to 1");
}

// ── warSurgeBudget (L94,98,99,100) ────────────────────────────────────────────
{
  pin();
  CONFIG.warSurgeMax = 1;
  assert.equal(E.warSurgeBudget(sig({ violence: 100 }), "war"), 1, "warSurgeMax 1 → no surge");
  CONFIG.warSurgeMax = 3; CONFIG.violenceFleeThreshold = 10;
  assert.equal(E.warSurgeBudget(sig({ violence: 100 }), "disaster"), 1, "a non-war cause never surges");
  // violence 15, thr 10 → over=0.5, scale=0.5, 1 + round(0.5 * (3-1)) = 1 + 1 = 2
  assert.equal(E.warSurgeBudget(sig({ violence: 15 }), "war"), 2,
    "a partial over-threshold war sheds a 2-point burst (exact)");
  // violence 20 → over=1, scale=1, 1 + round(1 * 2) = 3 (full surge)
  assert.equal(E.warSurgeBudget(sig({ violence: 20 }), "war"), 3, "a full over-threshold war sheds the max burst");
  // at threshold exactly → over=0 → 1 (boundary)
  assert.equal(E.warSurgeBudget(sig({ violence: 10 }), "war"), 1, "violence exactly at the threshold sheds 1");
}

// ── inCrisis (L111,112,113) ───────────────────────────────────────────────────
{
  pin(); CONFIG.violenceFleeThreshold = 10; CONFIG.disasterFleeThreshold = 10;
  assert.equal(E.inCrisis(sig({ siege: true, violence: 0, disaster: 0 })), true, "a siege is a crisis");
  assert.equal(E.inCrisis(sig({ violence: 10 })), true, "violence exactly at threshold is a crisis");
  assert.equal(E.inCrisis(sig({ violence: 9 })), false, "violence just below threshold is not a crisis");
  assert.equal(E.inCrisis(sig({ disaster: 10 })), true, "disaster exactly at threshold is a crisis");
  assert.equal(E.inCrisis(sig({ disaster: 9 })), false, "disaster just below threshold is not a crisis");
}

// ── restingOnCooldown (L119) ──────────────────────────────────────────────────
{
  assert.equal(E.restingOnCooldown({ cooldown: 5 }, false), true, "voluntary + cooldown → resting");
  assert.equal(E.restingOnCooldown({ cooldown: 5 }, true), false, "forced never rests even on cooldown");
  assert.equal(E.restingOnCooldown({ cooldown: 0 }, false), false, "no cooldown → not resting");
}

// ── belowEmigrationBar (L283) ─────────────────────────────────────────────────
{
  pin(); CONFIG.emigrationBar = 10;
  assert.equal(E.belowEmigrationBar(true, 0), false, "forced is never below the bar");
  assert.equal(E.belowEmigrationBar(false, 9), true, "voluntary under the bar waits");
  assert.equal(E.belowEmigrationBar(false, 10), false, "voluntary exactly at the bar moves (boundary)");
}

// ── civMoveCeilings (L146,147) ────────────────────────────────────────────────
{
  pin(); CONFIG.maxMovesPerTurn = 5; CONFIG.movesPerCity = 2; CONFIG.movesPerSiege = 3;
  CONFIG.violenceFleeThreshold = 10;
  const ranked = [sig({ owner: 1, key: "a" }), sig({ owner: 1, key: "b", violence: 20 })]; // 2 cities, 1 in crisis
  const c = E.civMoveCeilings(ranked).get(1);
  assert.equal(c.voluntary, 9, "voluntary ceiling = maxMovesPerTurn + cities*movesPerCity = 5 + 2*2");
  assert.equal(c.crisis, 3, "crisis ceiling = crises*movesPerSiege = 1*3");
}

// ── sourceState (L156,158) ────────────────────────────────────────────────────
{
  const state = { sources: {} };
  const s = E.sourceState(state, "x");
  assert.deepEqual(s, { pressure: 0, cooldown: 0, crisisPressure: 0, crisisCooldown: 0, deathPressure: 0, crisisTenure: 0 },
    "a fresh source state has all tracks zeroed");
  state.sources.y = { pressure: 3, cooldown: 1, crisisPressure: 0, crisisCooldown: 0 }; // older save: no deathPressure
  assert.equal(E.sourceState(state, "y").deathPressure, 0, "a legacy state's missing deathPressure is normalized to 0");
  assert.equal(E.sourceState(state, "y").pressure, 3, "existing fields are preserved");
}

// ── isCrisisTrack / CRISIS_TRACK membership (L163,166) ────────────────────────
{
  for (const c of ["war", "disaster", "conquest", "attrition"]) assert.equal(E.isCrisisTrack(c), true, `${c} is a crisis-track cause`);
  for (const c of ["prosperity", "unhappiness", "return", "opportunity"]) assert.equal(E.isCrisisTrack(c), false, `${c} is not a crisis-track cause`);
}

// ── crisisCause / voluntaryCause (L172,178) ───────────────────────────────────
{
  pin(); CONFIG.disasterFleeThreshold = 10; CONFIG.unhappyCauseThreshold = -5;
  assert.equal(E.crisisCause(sig({ disaster: 10 })), "disaster", "disaster at threshold → disaster");
  assert.equal(E.crisisCause(sig({ disaster: 9 })), "war", "disaster below threshold → war");
  assert.equal(E.voluntaryCause(sig({ happiness: -6 })), "unhappiness", "happiness below the unhappy threshold → unhappiness");
  assert.equal(E.voluntaryCause(sig({ happiness: -5 })), "prosperity", "happiness exactly at the threshold → prosperity (boundary)");
}

// ── cityMigrationCap (L358) ───────────────────────────────────────────────────
{
  pin(); CONFIG.maxLossPerCityPerTurn = 7;
  assert.equal(E.cityMigrationCap(), 7, "a positive cap is used as-is");
  CONFIG.maxLossPerCityPerTurn = 0;
  assert.equal(E.cityMigrationCap(), Infinity, "a zero cap disables the limit (Infinity)");
}

// ── remainingBudgets (L751,754,756) ───────────────────────────────────────────
{
  pin();
  const ceilings = new Map([[1, { voluntary: 9, crisis: 3 }]]);
  CONFIG.splitBudgetsEnabled = true;
  let used = { 1: { voluntary: 2, crisis: 1 } };
  let r = E.remainingBudgets(1, ceilings, used);
  assert.deepEqual(r, { voluntary: 7, crisis: 2, shared: false }, "split budgets subtract per-track usage");
  CONFIG.splitBudgetsEnabled = false;
  used = { 1: { voluntary: 2, crisis: 1 } };
  r = E.remainingBudgets(1, ceilings, used);
  // shared pool: 9 + 3 - (2 + 1) = 9
  assert.deepEqual(r, { voluntary: 9, crisis: 9, shared: true }, "shared pool merges both tracks (9+3-(2+1)=9)");
  // unknown owner → default ceiling, fresh usage
  CONFIG.splitBudgetsEnabled = true; CONFIG.maxMovesPerTurn = 5;
  const u2 = {};
  assert.deepEqual(E.remainingBudgets(2, ceilings, u2), { voluntary: 5, crisis: 0, shared: false },
    "an unseen owner falls back to maxMovesPerTurn voluntary / 0 crisis");
}

// ── tallyUse (L763-765) ───────────────────────────────────────────────────────
{
  const used = {};
  E.tallyUse(used, 1, "war"); E.tallyUse(used, 1, "disaster"); E.tallyUse(used, 1, "prosperity");
  assert.deepEqual(used[1], { voluntary: 1, crisis: 2 }, "crisis causes tally crisis, voluntary causes tally voluntary");
}

// ════════════════════════════════════════════════════════════════════════════
// P2, crisisSeverity (L497-504)
// ════════════════════════════════════════════════════════════════════════════
{
  pin();
  CONFIG.attritionMinDistress = 10; CONFIG.crisisSeverityCap = 100;
  // No war state / first combat sighting → aggressors size 0 (extra 0, gang 1), combat 0.
  // severity = min(cap, d/ref) * gang + combat = min(100, 50/10) * 1 + 0 = 5
  assert.equal(E.crisisSeverity(sig({ owner: 1 }), 50), 5, "severity = distress/ref when no gang/combat (5 = 50/10)");
  // cap: d/ref above the cap clamps
  assert.equal(E.crisisSeverity(sig({ owner: 1 }), 5000), 100, "severity intensity is capped at crisisSeverityCap");
}

// ── deathRamp: the crisis-onset smoothing multiplier [floor,1], NOT a cap (L: deathRamp) ──
{
  pin();
  Object.assign(CONFIG, { gameSpeedTuningEnabled: false, deathRampEnabled: true, deathRampFloor: 0.25, deathRampTurns: 6 });
  assert.equal(E.deathRamp(1), 0.25, "turn 1 of a lethal crisis accrues at the floor (0.25), gentle onset");
  assert.equal(E.deathRamp(4), 0.625, "mid-crisis (tenure 4) has ramped to 0.25 + 0.75*(3/6) = 0.625");
  assert.equal(E.deathRamp(7), 1, "after deathRampTurns of sustained crisis the ramp reaches the FULL rate (1)");
  assert.equal(E.deathRamp(100), 1, "the ramp holds at 1 (no cap beyond full) for a long crisis");
  assert.ok(E.deathRamp(3) > E.deathRamp(2) && E.deathRamp(2) > E.deathRamp(1), "the ramp is monotonically increasing");
  CONFIG.deathRampEnabled = false;
  assert.equal(E.deathRamp(1), 1, "disabled → no smoothing (multiplier 1, legacy behaviour)");
}

console.log("engine-rigor (part 1) wired; continuing in part 2 below");

// ════════════════════════════════════════════════════════════════════════════
// P1, the stance planner: planBump / planApply (exact banking)
// ════════════════════════════════════════════════════════════════════════════

// ── planBump (L571-578) ───────────────────────────────────────────────────────
{
  const acc = new Map();
  E.planBump(acc, 1, "out", 100);
  assert.deepEqual(acc.get(1), { inPts: 0, outPts: 1, inP: 0, outP: 100 }, "first out bump: 1 point, 100 people");
  E.planBump(acc, 1, "out", 50);
  assert.deepEqual(acc.get(1), { inPts: 0, outPts: 2, inP: 0, outP: 150 }, "second out bump accumulates exactly");
  E.planBump(acc, 1, "in", 10);
  assert.deepEqual(acc.get(1), { inPts: 1, outPts: 2, inP: 10, outP: 150 }, "an in bump touches only the in fields");
  assert.equal(acc.size, 1, "no spurious owners created");
}

// ── planApply (L591-602) ──────────────────────────────────────────────────────
{
  pin();
  const monoTurn = 3;
  const ppl = marginalPeople(5, monoTurn, "Src", null); // the exact people one point off pop 5 represents
  // cross-civ: owner 1 → owner 2, budget 3, rural 5 (min 1) → 3 points moved
  {
    const src = sig({ owner: 1, rural: 5, population: 5, key: "s", name: "Src" });
    const ctx = { acc: new Map(), monoTurn };
    const moved = E.planApply(src, ctx, { dest: { owner: 2 } }, 3);
    assert.equal(moved, 3, "planApply sheds exactly the budget");
    assert.equal(src.rural, 2, "rural decremented by exactly the moved count (5 → 2)");
    assert.equal(src.population, 2, "population decremented by exactly the moved count");
    assert.equal(ctx.acc.get(1).outPts, 3, "the source civ banks 3 out-points");
    assert.equal(ctx.acc.get(2).inPts, 3, "the destination civ banks 3 in-points");
    assert.ok(ctx.acc.get(1).outP > 0 && Math.abs(ctx.acc.get(1).outP - ctx.acc.get(2).inP) < 1e-9,
      "out-people equals in-people (conserved), and is the scaled people");
  }
  // same-civ: no banking, but population still decrements (proves the cross-civ guard, L593)
  {
    const src = sig({ owner: 1, rural: 5, population: 5, key: "s2" });
    const ctx = { acc: new Map(), monoTurn };
    const moved = E.planApply(src, ctx, { dest: { owner: 1 } }, 2);
    assert.equal(moved, 2, "a same-civ move still counts against the budget");
    assert.equal(ctx.acc.size, 0, "a same-civ move banks no cross-civ flow");
    assert.equal(src.rural, 3, "same-civ move still decrements rural (5 → 3)");
  }
  // rural floor boundary: rural exactly min+1 → exactly one point
  {
    const src = sig({ owner: 1, rural: 2, population: 2, key: "s3" });
    const moved = E.planApply(src, { acc: new Map(), monoTurn }, { dest: { owner: 2 } }, 9);
    assert.equal(moved, 1, "the rural floor stops shedding at minRuralToEmigrate (2 → 1, one move)");
  }
  assert.ok(ppl > 0, "sanity: a point off pop 5 is a positive number of people");
}

// ════════════════════════════════════════════════════════════════════════════
// World-based integration (planTurn / bankStanceImpact / outlet death / move mechanics / passes)
// ════════════════════════════════════════════════════════════════════════════
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { rankByProsperity, distress } from "/emigration/ui/emigration-prosperity.js";
import { loadState, prepareState, ownerPopulations } from "/emigration/ui/emigration-state.js";
import { stanceImpactFor } from "/emigration/ui/emigration-migration-stats.js";
import { makeInboundCtx, noteInbound } from "/emigration/ui/emigration-inbound.js";

function makeCity(owner, localId, o = {}) {
  return {
    owner, localId, name: o.name || "C" + owner + "_" + localId, isTown: false,
    isBeingRazed: !!o.siege, isInfected: false, urbanPopulation: 0,
    population: o.population, ruralPopulation: o.rural, location: { x: o.x || 0, y: o.y || 0 },
    addRuralPopulation(d) { this.ruralPopulation += d; this.population += d; },
    Yields: { getYield: (ev) => (o.yields && o.yields[ev]) || 0 },
    Happiness: { netHappinessPerTurn: o.happiness || 0, hasUnrest: false }
  };
}
function major(cities, o = {}) {
  return {
    isAlive: true, isMajor: true, isMinor: false, Cities: { getCities: () => cities },
    Diplomacy: { hasMet: () => true, getWarCount: () => 0, isAtWar: () => false },
    Culture: {
      isTraditionActive: (h) => typeof h !== "string" ? false
        : (!!o.open && /OPEN/i.test(h)) || (!!o.closed && /CLOSED/i.test(h))
    }
  };
}
function installWorld(byId) {
  globalThis.Players = { get: (pid) => byId[pid] || null, getAlive: () => Object.values(byId) };
}
function freshConfigStore() { for (const k of Object.keys(kv)) delete kv[k]; }
function rankedWorld() { return rankByProsperity(collectCitySignals()); }

// ── planTurn: the per-civ ceiling binds (L656-659) ────────────────────────────
// Two poor same-owner cities pull cross-civ to one rich civ; the owner's ceiling is 1, so planTurn
// banks EXACTLY one cross-civ point for that owner no matter how many of its cities want to leave.
{
  pin();
  Object.assign(CONFIG, { maxMovesPerTurn: 1, movesPerCity: 0, movesPerSiege: 0, emigrationBar: 0, warSurgeMax: 1, cooldownTurns: 0, bordersEnabled: false });
  freshConfigStore();
  globalThis.Game = { turn: 1 };
  const a = makeCity(2, 1, { population: 8, rural: 8, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 });
  const b = makeCity(2, 2, { population: 8, rural: 8, yields: { YIELD_FOOD: 1 }, x: 1, y: 0 });
  const rich = makeCity(1, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 2, y: 0 });
  installWorld({ 1: major([rich]), 2: major([a, b]) });
  const ranked = rankedWorld();
  const state = loadState(); prepareState(state, ranked);
  const acc = E.planTurn(ranked, state);
  assert.equal(acc.get(2)?.outPts, 1, "planTurn banks exactly the owner's ceiling (1) of cross-civ out-points");
  assert.equal(acc.get(1)?.inPts, 1, "the destination civ banks exactly 1 cross-civ in-point");
  assert.ok(acc.get(2).outP > 0 && Math.abs(acc.get(2).outP - acc.get(1).inP) < 1e-9, "planned people are conserved");
}

// ── anyStance (L670,675) ──────────────────────────────────────────────────────
{
  pin();
  CONFIG.bordersEnabled = false;
  freshConfigStore();
  globalThis.Game = { turn: 1 };
  const poor = makeCity(2, 1, { population: 8, rural: 8, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 });
  const rich = makeCity(1, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 1, y: 0 });
  installWorld({ 1: major([rich], { open: true }), 2: major([poor]) });
  const ranked = rankedWorld();
  assert.equal(E.anyStance(ranked), false, "no stance is detected when borders are disabled");
  CONFIG.bordersEnabled = true;
  assert.equal(E.anyStance(ranked), true, "an Open-Borders civ is detected as holding a stance");
}

// ── bankStanceImpact guards (L687): no-op unless ≥2 cities AND a stance exists ──
{
  pin();
  CONFIG.bordersEnabled = true;
  // Single city → guard returns, nothing banked.
  freshConfigStore();
  globalThis.Game = { turn: 1 };
  installWorld({ 1: major([makeCity(1, 1, { population: 5, rural: 5, yields: { YIELD_FOOD: 1 } })], { open: true }) });
  let ranked = rankedWorld();
  let state = loadState(); prepareState(state, ranked);
  E.bankStanceImpact(ranked, state);
  assert.deepEqual(stanceImpactFor(1), { in: 0, out: 0, inPts: 0, outPts: 0 }, "one city → no stance impact banked");

  // ≥2 cities but NO stance (borders off) → guard returns, nothing banked.
  CONFIG.bordersEnabled = false;
  freshConfigStore();
  const poor = makeCity(2, 1, { population: 8, rural: 8, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 });
  const rich = makeCity(1, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 1, y: 0 });
  installWorld({ 1: major([rich], { open: true }), 2: major([poor]) });
  ranked = rankedWorld(); state = loadState(); prepareState(state, ranked);
  E.bankStanceImpact(ranked, state);
  assert.deepEqual(stanceImpactFor(1), { in: 0, out: 0, inPts: 0, outPts: 0 }, "no stance → no impact banked");
}

// ── processOutletDeath (L524,526,531,536-541) ─────────────────────────────────
{
  pin();
  Object.assign(CONFIG, { attritionEnabled: true, attritionMinDistress: 1, attritionThreshold: 1, starvationModifier: -50, crisisDeathEnabled: true });
  freshConfigStore();
  globalThis.Game = { turn: 1 };
  // A starving city (negative food) is distressed; verify our fixture actually clears the lethal floor.
  const starving = makeCity(1, 1, { population: 6, rural: 6, yields: { YIELD_FOOD: -5 }, x: 0, y: 0 });
  installWorld({ 1: major([starving]) });
  const ranked = rankedWorld();
  const src = ranked[0];
  assert.ok(distress(src) >= CONFIG.attritionMinDistress, "fixture sanity: the starving source is lethally distressed");
  const state = loadState(); prepareState(state, ranked);
  const st = E.sourceState(state, src.key);
  const before = src.population;
  let death = null;
  for (let i = 0; i < 8 && !death; i++) death = E.processOutletDeath(src, st, state, false); // no refuge → full rate
  assert.ok(death, "a trapped, lethally-distressed source eventually dies off");
  assert.equal(death.cause, "attrition", "the death record carries cause 'attrition'");
  assert.equal(death.points, 1, "exactly one point dies per fired death");
  assert.equal(death.crossCiv, false, "a death is not a cross-civ move");
  assert.equal(death.destName, "", "a death has no destination");
  assert.equal(src.population, before - 1, "the source actually loses one population");

  // No distress → no death, and deathPressure decays toward 0 (the coping branch, L527).
  CONFIG.attritionEnabled = false; // forces d=0 regardless of the source
  const st2 = { deathPressure: 4 };
  assert.equal(E.processOutletDeath(src, st2, state, false), null, "no lethal distress → no death");
  assert.ok(st2.deathPressure < 4, "deathPressure decays when the crisis isn't lethal");
}

// ── applyOneMove: instant move record fields (L196-208) + lagged depart (L213-231) ──
{
  pin();
  Object.assign(CONFIG, { transitLagTurns: 0, minRuralToEmigrate: 1 });
  freshConfigStore();
  globalThis.Game = { turn: 1 };
  const s1 = makeCity(1, 1, { population: 6, rural: 6, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 });
  const d1 = makeCity(2, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 1, y: 0 });
  installWorld({ 1: major([s1]), 2: major([d1]) });
  let ranked = rankedWorld();
  let src = ranked.find((r) => r.owner === 1); let dest = ranked.find((r) => r.owner === 2);
  let state = loadState(); prepareState(state, ranked);
  const inbound = makeInboundCtx();
  const rec = E.applyOneMove(src, dest, src.population, state, "prosperity", inbound);
  assert.ok(rec, "an instantaneous move emits a record");
  assert.equal(rec.cause, "prosperity", "the move carries its cause");
  assert.equal(rec.srcOwner, 1, "the record names the source owner");
  assert.equal(rec.destOwner, 2, "an instantaneous move credits the destination owner");
  assert.equal(rec.crossCiv, true, "owner 1 → owner 2 is a cross-civ move");
  assert.ok(rec.people > 0, "the move scales a positive number of people");
  assert.equal(src.rural, 5, "the source lost exactly one rural point (6 → 5)");

  // Lagged: arriveTurn = monoTurn + lag, source loses now, transit row queued, NOT yet credited.
  Object.assign(CONFIG, { transitLagTurns: 10, transitHexPerTurn: 1 }); // distance 1 → lag 1
  freshConfigStore();
  installWorld({ 1: major([makeCity(1, 1, { population: 6, rural: 6, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 })]),
    2: major([makeCity(2, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 1, y: 0 })]) });
  ranked = rankedWorld(); src = ranked.find((r) => r.owner === 1); dest = ranked.find((r) => r.owner === 2);
  state = loadState(); prepareState(state, ranked);
  const rec2 = E.applyOneMove(src, dest, src.population, state, "war", makeInboundCtx());
  assert.ok(rec2, "a lagged move emits a departure record");
  assert.equal(state.transit.length, 1, "the in-flight migrant is queued on the transit list");
  assert.equal(state.transit[0].arriveTurn, state.monoTurn + 1, "arriveTurn = monoTurn + lag (lag 1)");
  assert.equal(state.transit[0].crossCiv, true, "the queued row records cross-civ correctly");
}

// ── shedBurst: emits exactly the budget (down to the rural floor) (L251-256) ──
{
  pin();
  Object.assign(CONFIG, { transitLagTurns: 0, minRuralToEmigrate: 1 });
  freshConfigStore();
  globalThis.Game = { turn: 1 };
  installWorld({ 1: major([makeCity(1, 1, { population: 6, rural: 6, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 })]),
    2: major([makeCity(2, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 1, y: 0 })]) });
  let ranked = rankedWorld();
  let src = ranked.find((r) => r.owner === 1); let dest = ranked.find((r) => r.owner === 2);
  let state = loadState(); prepareState(state, ranked);
  const out = E.shedBurst(src, dest, state, "war", 3, makeInboundCtx());
  assert.equal(out.length, 3, "shedBurst emits exactly the budget (3) when the rural pool allows");
  assert.equal(src.rural, 3, "the source shed exactly 3 rural points (6 → 3)");
  // rural floor stops it short: budget 9 but only 2 above the floor
  installWorld({ 1: major([makeCity(1, 1, { population: 3, rural: 3, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 })]),
    2: major([makeCity(2, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 1, y: 0 })]) });
  ranked = rankedWorld(); src = ranked.find((r) => r.owner === 1); dest = ranked.find((r) => r.owner === 2);
  state = loadState(); prepareState(state, ranked);
  const out2 = E.shedBurst(src, dest, state, "war", 9, makeInboundCtx());
  assert.equal(out2.length, 2, "shedBurst stops at the rural floor (rural 3, min 1 → 2 moves)");
}

// ── processDepartures: the budget guard + tally (L785-789) ─────────────────────
{
  pin();
  Object.assign(CONFIG, { transitLagTurns: 0, emigrationBar: 0, cooldownTurns: 0, warSurgeMax: 1, maxMovesPerTurn: 5, movesPerCity: 0, splitTracksEnabled: true, splitBudgetsEnabled: true });
  freshConfigStore();
  globalThis.Game = { turn: 1 };
  installWorld({ 1: major([makeCity(1, 1, { population: 8, rural: 8, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 })]),
    2: major([makeCity(2, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 1, y: 0 })]) });
  const ranked = rankedWorld();
  const state = loadState(); prepareState(state, ranked);
  const recs = E.processDepartures(state, ranked, makeInboundCtx());
  assert.ok(recs.length >= 1, "processDepartures sheds at least one voluntary mover under a zero bar");
  assert.ok(recs.every((m) => typeof m.cause === "string"), "every emitted record carries a cause");
}

// ════════════════════════════════════════════════════════════════════════════
// Part 3, direct unit tests for the per-source passes + planner guards
// ════════════════════════════════════════════════════════════════════════════

// A reusable cross-civ world: a poor owner-1 source and a rich owner-2 destination.
function crossCivWorld(opts = {}) {
  freshConfigStore();
  globalThis.Game = { turn: 1 };
  const poor = makeCity(1, 1, { population: opts.pop ?? 8, rural: opts.rural ?? 8, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 });
  const rich = makeCity(2, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 1, y: 0 });
  installWorld({ 1: major([poor]), 2: major([rich]) });
  const ranked = rankedWorld();
  const state = loadState(); prepareState(state, ranked);
  const src = ranked.find((r) => r.owner === 1);
  const dest = ranked.find((r) => r.owner === 2);
  return { ranked, src, dest, state, ownerPop: ownerPopulations(ranked), inbound: makeInboundCtx() };
}

// ── applyMoveToRanking (L58-61) ───────────────────────────────────────────────
{
  const src = { rural: 5, population: 5 };
  const dest = { rural: 2, population: 2 };
  E.applyMoveToRanking(src, dest);
  assert.deepEqual([src.rural, src.population, dest.rural, dest.population], [4, 4, 3, 3],
    "applyMoveToRanking moves exactly one point: source -1, destination +1");
}

// ── FORCED_CAUSES / CRISIS_TRACK / ZERO_PLAN literals ─────────────────────────
{
  for (const c of ["war", "disaster", "conquest"]) assert.equal(E.FORCED_CAUSES.has(c), true, `${c} is a forced cause`);
  assert.equal(E.FORCED_CAUSES.has("prosperity"), false, "prosperity is not forced");
  assert.equal(E.FORCED_CAUSES.has("unhappiness"), false, "unhappiness is not forced");
  for (const c of ["war", "disaster", "conquest", "attrition"]) assert.equal(E.CRISIS_TRACK.has(c), true, `${c} is crisis-track`);
  assert.deepEqual(E.ZERO_PLAN, { inPts: 0, outPts: 0, inP: 0, outP: 0 }, "ZERO_PLAN is fully zeroed");
}

// ── planSource guards (L614,618,620) ──────────────────────────────────────────
{
  pin();
  // rural at the floor → 0, before any destination work.
  assert.equal(E.planSource(sig({ rural: 1 }), { sig: [], st: {}, ownerPop: {}, acc: new Map(), monoTurn: 0 }, 5), 0,
    "planSource sheds nothing at the rural floor");
  // maxThisSource 0 → 0.
  assert.equal(E.planSource(sig({ rural: 8 }), { sig: [], st: {}, ownerPop: {}, acc: new Map(), monoTurn: 0 }, 0), 0,
    "planSource sheds nothing with no remaining budget");
  // voluntary + cooldown → resting → 0 (no destination lookup needed).
  {
    const s = sig({ rural: 8, key: "rest", happiness: 0 });
    const ctx = { sig: [s], st: { rest: { pressure: 0, cooldown: 5 } }, ownerPop: {}, acc: new Map(), monoTurn: 0 };
    assert.equal(E.planSource(s, ctx, 5), 0, "a voluntary source on cooldown plans nothing");
  }
  // no viable destination (only itself in the world) → 0.
  {
    const s = sig({ rural: 8, key: "lonely" });
    const ctx = { sig: [s], st: {}, ownerPop: { 1: 8 }, acc: new Map(), monoTurn: 0 };
    assert.equal(E.planSource(s, ctx, 5), 0, "planSource with no destination plans nothing");
  }
}

// ── planSource forced shed (world): a war source bypasses bar+cooldown and banks cross-civ ──
{
  pin();
  Object.assign(CONFIG, { emigrationBar: 1e9, cooldownTurns: 99, warSurgeMax: 1, violenceFleeThreshold: 10, bordersEnabled: false });
  const w = crossCivWorld({ rural: 8 });
  w.src.violence = 20; // force a war cause → bypasses the (huge) bar and cooldown
  const ctx = { sig: w.ranked, st: { [w.src.key]: { pressure: 0, cooldown: 50 } }, ownerPop: w.ownerPop, acc: new Map(), monoTurn: 0 };
  const moved = E.planSource(w.src, ctx, 5);
  assert.equal(moved, 1, "a forced (war) source plans one cross-civ point even over a huge bar + cooldown");
  assert.equal(ctx.acc.get(1)?.outPts, 1, "the war source's civ banks the planned out-point");
  assert.equal(ctx.acc.get(2)?.inPts, 1, "the destination civ banks the planned in-point");
}

// ── shedVoluntary (L374,376,385-388) ──────────────────────────────────────────
{
  pin();
  Object.assign(CONFIG, { emigrationBar: 10, cooldownTurns: 4, transitLagTurns: 0, minRuralToEmigrate: 1 });
  // cooldown → [] (no shed).
  {
    const w = crossCivWorld({ rural: 8 });
    const out = E.shedVoluntary(w.src, { dest: w.dest, adjusted: 0 }, w.state, { pressure: 100, cooldown: 3 }, 5, w.inbound);
    assert.equal(out.length, 0, "shedVoluntary on cooldown sheds nothing");
  }
  // maxVol 0 → [].
  {
    const w = crossCivWorld({ rural: 8 });
    const out = E.shedVoluntary(w.src, { dest: w.dest, adjusted: 0 }, w.state, { pressure: 100, cooldown: 0 }, 0, w.inbound);
    assert.equal(out.length, 0, "shedVoluntary with no voluntary budget sheds nothing");
  }
  // pressure just below the bar → [] (boundary); pre-pressure 9, adjusted 0 → stays 9 < 10.
  {
    const w = crossCivWorld({ rural: 8 });
    const out = E.shedVoluntary(w.src, { dest: w.dest, adjusted: 0 }, w.state, { pressure: 9, cooldown: 0 }, 5, w.inbound);
    assert.equal(out.length, 0, "below the bar (9 < 10) sheds nothing");
  }
  // pressure at the bar → sheds exactly one, then resets pressure + arms cooldown.
  {
    const w = crossCivWorld({ rural: 8 });
    const st = { pressure: 10, cooldown: 0 };
    const out = E.shedVoluntary(w.src, { dest: w.dest, adjusted: 0 }, w.state, st, 5, w.inbound);
    assert.equal(out.length, 1, "at the bar (10) sheds exactly one voluntary mover");
    assert.equal(st.pressure, 0, "pressure resets to 0 after a voluntary move");
    assert.equal(st.cooldown, CONFIG.cooldownTurns, "the cooldown is armed after a voluntary move");
  }
}

// ── processSource dispatch + guards (L464,465,471) ────────────────────────────
{
  pin();
  Object.assign(CONFIG, { emigrationBar: 0, transitLagTurns: 0, cooldownTurns: 0, warSurgeMax: 1, minRuralToEmigrate: 1 });
  // rural floor → [].
  {
    const w = crossCivWorld({ rural: 1 });
    assert.deepEqual(E.processSource(w.src, w.ranked, w.state, w.ownerPop, { voluntary: 5, crisis: 5 }, w.inbound), [],
      "processSource at the rural floor returns no records");
  }
  // both budgets spent → [].
  {
    const w = crossCivWorld({ rural: 8 });
    assert.deepEqual(E.processSource(w.src, w.ranked, w.state, w.ownerPop, { voluntary: 0, crisis: 0 }, w.inbound), [],
      "processSource with no budget returns no records");
  }
  // split path (default) sheds a voluntary mover under a zero bar.
  {
    CONFIG.splitTracksEnabled = true;
    const w = crossCivWorld({ rural: 8 });
    const out = E.processSource(w.src, w.ranked, w.state, w.ownerPop, { voluntary: 5, crisis: 5 }, w.inbound);
    assert.ok(out.length >= 1, "the split pass sheds a voluntary mover");
  }
  // legacy path also sheds (splitTracksEnabled off).
  {
    CONFIG.splitTracksEnabled = false;
    const w = crossCivWorld({ rural: 8 });
    const out = E.processSource(w.src, w.ranked, w.state, w.ownerPop, { voluntary: 5, crisis: 5 }, w.inbound);
    assert.ok(out.length >= 1, "the legacy pass sheds a mover");
    CONFIG.splitTracksEnabled = true;
  }
}

// ── processSourceLegacy + legacyEmigrate (L301,303,306,307,325) ───────────────
{
  pin();
  Object.assign(CONFIG, { splitTracksEnabled: false, emigrationBar: 10, cooldownTurns: 4, transitLagTurns: 0, warSurgeMax: 1, minRuralToEmigrate: 1 });
  // below the bar → no records, pressure accrues but nobody moves.
  {
    Object.assign(CONFIG, { emigrationBar: 1e9 });
    const w = crossCivWorld({ rural: 8 });
    const out = E.processSourceLegacy(w.src, w.ranked, w.state, w.ownerPop, 5, w.inbound);
    assert.deepEqual(out, [], "legacy below the bar emits nothing");
    assert.equal(w.src.rural, 8, "and the source keeps its population");
  }
  // over a zero bar → sheds exactly one (voluntary), pressure resets + cooldown armed.
  {
    Object.assign(CONFIG, { emigrationBar: 0, cooldownTurns: 4 });
    const w = crossCivWorld({ rural: 8 });
    const out = E.processSourceLegacy(w.src, w.ranked, w.state, w.ownerPop, 5, w.inbound);
    assert.equal(out.length, 1, "legacy over a zero bar sheds exactly one voluntary mover");
    assert.equal(w.state.sources[w.src.key].cooldown, CONFIG.cooldownTurns, "the cooldown is armed after a legacy move");
  }
  CONFIG.splitTracksEnabled = true;
}

// ── processSourceSplit: concurrent crisis + voluntary tracks (L415,425,431-434,447) ──
{
  pin();
  Object.assign(CONFIG, { splitTracksEnabled: true, splitBudgetsEnabled: true, emigrationBar: 0, cooldownTurns: 0, transitLagTurns: 0, warSurgeMax: 3, violenceFleeThreshold: 10, minRuralToEmigrate: 1, maxLossPerCityPerTurn: 0 });
  const w = crossCivWorld({ rural: 12 });
  w.src.violence = 20; // in crisis → the crisis track fires AND the voluntary track can still run
  const out = E.processSourceSplit(w.src, w.ranked, w.state, w.ownerPop, { voluntary: 5, crisis: 5 }, w.inbound);
  assert.ok(out.some((m) => m.cause === "war"), "a besieged source sheds war refugees on the crisis track");
  assert.ok(out.length >= 1, "the split pass produces at least the crisis records");
}

// ── processDepartures: a civ whose budget is spent is skipped (L786) ───────────
{
  pin();
  Object.assign(CONFIG, { emigrationBar: 0, transitLagTurns: 0, cooldownTurns: 0, warSurgeMax: 1, maxMovesPerTurn: 0, movesPerCity: 0, movesPerSiege: 0, splitBudgetsEnabled: true, minRuralToEmigrate: 1 });
  // ceilings are all zero → every civ's budget is spent → no departures at all.
  const w = crossCivWorld({ rural: 8 });
  const recs = E.processDepartures(w.state, w.ranked, w.inbound);
  assert.deepEqual(recs, [], "with zero ceilings every civ is skipped (budget guard)");
}

// ── anyStance: borders enabled but every civ neutral → false (L675 equality) ──
{
  pin();
  CONFIG.bordersEnabled = true;
  freshConfigStore();
  globalThis.Game = { turn: 1 };
  // no civ slots Open Borders → all stances "none"
  installWorld({ 1: major([makeCity(1, 1, { population: 8, rural: 8, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 })]),
    2: major([makeCity(2, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 1, y: 0 })]) });
  assert.equal(E.anyStance(rankedWorld()), false, "borders on but all civs neutral → no stance");
}

// ════════════════════════════════════════════════════════════════════════════
// Part 4, bankStanceImpact banking (exact delta) + remaining branches
// ════════════════════════════════════════════════════════════════════════════

// Build a 2-civ stance world: the rich civ (food `rf`, holds the named border policy) and a poor civ.
// `rich`/`poor` owner ids are parameterized so the open and closed cases bank into DISJOINT civs
// (stanceImpactFor is cumulative + persists in the shared in-memory stats state across cases).
function stanceWorld(rf, policy, richOwner = 1, poorOwner = 2) {
  freshConfigStore();
  globalThis.Game = { turn: 1 };
  const rich = makeCity(richOwner, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: rf }, x: 1, y: 0 });
  const poor = makeCity(poorOwner, 1, { population: 8, rural: 8, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 });
  installWorld({ [richOwner]: major([rich], policy), [poorOwner]: major([poor]) });
  const ranked = rankedWorld();
  const state = loadState(); prepareState(state, ranked);
  return { ranked, state };
}

// ── bankStanceImpact: OPEN borders ADD a cross-civ move → +1 banked (L686-700) ──
{
  pin();
  Object.assign(CONFIG, { bordersEnabled: true, crossCivEnabled: true, emigrationBar: 3, cooldownTurns: 0, warSurgeMax: 1, openBordersOpenness: 1.5, closedBordersOpenness: 0.4, opennessFloor: 0.15, deltaExponent: 1, maxMovesPerTurn: 5, movesPerCity: 2, movesPerSiege: 3, poachBlock: 0, foodFactor: 1 });
  const { ranked, state } = stanceWorld(2, { open: true }); // rf=2, bar=3 → withStance pulls 1, neutral pulls 0
  E.bankStanceImpact(ranked, state);
  assert.equal(stanceImpactFor(1).inPts, 1, "open borders banked +1 cross-civ immigration point for the importer");
  assert.equal(stanceImpactFor(2).outPts, 1, "and +1 emigration point released by the source civ");
  assert.ok(stanceImpactFor(1).in > 0, "the banked people figure is positive");
}

// ── bankStanceImpact: CLOSED borders REMOVE a move → -1 banked (kills L701-702 sign) ──
// withStance plans 0, neutral plans 1, so the banked delta is NEGATIVE, only a true subtraction
// (a - b), not a + mutation, yields -1 here.
{
  pin();
  Object.assign(CONFIG, { bordersEnabled: true, crossCivEnabled: true, emigrationBar: 1, cooldownTurns: 0, warSurgeMax: 1, openBordersOpenness: 1.5, closedBordersOpenness: 0.4, opennessFloor: 0.15, deltaExponent: 1, maxMovesPerTurn: 5, movesPerCity: 2, movesPerSiege: 3, poachBlock: 0, foodFactor: 1 });
  // distinct civ ids (3 rich / 4 poor) so this banks separately from the open case above
  const { ranked, state } = stanceWorld(2, { closed: true }, 3, 4); // rf=2, bar=1 → withStance pulls 0, neutral pulls 1
  E.bankStanceImpact(ranked, state);
  assert.equal(stanceImpactFor(3).inPts, -1, "closed borders banked -1: it blocked an immigration point it would otherwise have taken");
  assert.equal(stanceImpactFor(4).outPts, -1, "and -1 emigration the source would otherwise have released");
  assert.ok(stanceImpactFor(3).in < 0, "the banked people figure (inbound) is negative (blocked inflow)");
  assert.ok(stanceImpactFor(4).out < 0, "the banked people figure (outbound) is negative, kills the outP `a-b`→`a+b` mutant");
}

// ── planSource VOLUNTARY shed (L621,622,625,627) ──────────────────────────────
{
  pin();
  Object.assign(CONFIG, { emigrationBar: 10, cooldownTurns: 4, warSurgeMax: 1, bordersEnabled: false });
  const w = crossCivWorld({ rural: 8 });
  // voluntary source, pressure pre-loaded to the bar so the first plan crosses and sheds exactly one.
  const ctx = { sig: w.ranked, st: { [w.src.key]: { pressure: 10, cooldown: 0 } }, ownerPop: w.ownerPop, acc: new Map(), monoTurn: 0 };
  const moved = E.planSource(w.src, ctx, 5);
  assert.equal(moved, 1, "a voluntary source at the bar plans exactly one cross-civ point");
  assert.equal(ctx.st[w.src.key].pressure, 0, "pressure resets after a voluntary plan");
  assert.equal(ctx.st[w.src.key].cooldown, CONFIG.cooldownTurns, "a voluntary plan arms the cooldown");
}

// ── planTurn: a crisis ceiling (voluntary + crisis) binds the planned count (L656) ──
{
  pin();
  // A single war city wants a 3-point surge, but its civ ceiling is voluntary 0 + crisis 2 = 2.
  Object.assign(CONFIG, { bordersEnabled: false, emigrationBar: 0, cooldownTurns: 0, warSurgeMax: 3, violenceFleeThreshold: 10, maxMovesPerTurn: 0, movesPerCity: 0, movesPerSiege: 2, minRuralToEmigrate: 1 });
  freshConfigStore();
  globalThis.Game = { turn: 1 };
  // Inject violence via a wrecked district so the source reads as a war crisis.
  globalThis.ComponentID = { toBitfield: (cid) => cid.owner + ":" + cid.n };
  const besieged = makeCity(2, 1, { population: 12, rural: 12, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 }); besieged.id = { owner: 2, n: 1 };
  const haven = makeCity(1, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 1, y: 0 }); haven.id = { owner: 1, n: 2 };
  installWorld({ 1: major([haven]), 2: major([besieged]) });
  globalThis.Players.Districts = { get: () => ({ getDistrictMaxHealth: () => 100, getDistrictHealth: (loc) => (loc && loc.x === 0 ? 0 : 100) }) };
  const ranked = rankedWorld();
  const state = loadState(); prepareState(state, ranked);
  const src = ranked.find((r) => r.owner === 2);
  // Unconditional precondition: if the fixture failed to inject violence, FAIL LOUDLY (never skip).
  assert.ok(src && src.violence >= CONFIG.violenceFleeThreshold,
    "fixture precondition: the wrecked district injected war-level violence onto the source");
  const acc = E.planTurn(ranked, state);
  assert.equal(acc.get(2)?.outPts, 2, "the crisis ceiling (0 voluntary + 2 crisis) caps the war surge at 2 planned points");
  delete globalThis.Players.Districts;
}

// ── applyOneMove: a full inbound cap refuses the instant move (L200) ───────────
{
  pin();
  Object.assign(CONFIG, { transitLagTurns: 0, minRuralToEmigrate: 1, maxGainPerCityPerTurn: 1 });
  freshConfigStore();
  globalThis.Game = { turn: 1 };
  installWorld({ 1: major([makeCity(1, 1, { population: 6, rural: 6, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 })]),
    2: major([makeCity(2, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 1, y: 0 })]) });
  const ranked = rankedWorld();
  const src = ranked.find((r) => r.owner === 1); const dest = ranked.find((r) => r.owner === 2);
  const state = loadState(); prepareState(state, ranked);
  const fullInbound = makeInboundCtx(); // cap 1
  noteInbound(dest.key, fullInbound); // fill the destination's one slot → now at cap
  const before = src.rural;
  const rec = E.applyOneMove(src, dest, src.population, state, "prosperity", fullInbound);
  assert.equal(rec, null, "a full inbound cap refuses the move");
  assert.equal(src.rural, before, "and the source keeps its population when the move is refused");
}

// ════════════════════════════════════════════════════════════════════════════
// Part 5, applyOneMove record fields + sourceState preservation (distinguishable kills)
// ════════════════════════════════════════════════════════════════════════════

// A lagged 2-city world; `sameCiv` puts both cities under owner 1, else owner 1 → owner 2.
function laggedWorld(sameCiv) {
  freshConfigStore();
  globalThis.Game = { turn: 1 };
  Object.assign(CONFIG, { transitLagTurns: 10, transitHexPerTurn: 1, minRuralToEmigrate: 1, maxGainPerCityPerTurn: 0, warSurgeMax: 1 });
  const s = makeCity(1, 1, { population: 6, rural: 6, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 });
  const d = makeCity(sameCiv ? 1 : 2, sameCiv ? 2 : 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 1, y: 0 });
  installWorld(sameCiv ? { 1: major([s, d]) } : { 1: major([s]), 2: major([d]) });
  const ranked = rankedWorld();
  const src = ranked.find((r) => r.city.location.x === 0);
  const dest = ranked.find((r) => r.city.location.x === 1);
  const state = loadState(); prepareState(state, ranked);
  return { src, dest, state };
}

// ── applyOneMove instant record carries its meta (destPaidCost + eventKey) (L208) ──
{
  pin();
  Object.assign(CONFIG, { transitLagTurns: 0, minRuralToEmigrate: 1, maxGainPerCityPerTurn: 0 });
  freshConfigStore(); globalThis.Game = { turn: 1 };
  installWorld({ 1: major([makeCity(1, 1, { population: 6, rural: 6, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 })]),
    2: major([makeCity(2, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 1, y: 0 })]) });
  const ranked = rankedWorld();
  const src = ranked.find((r) => r.owner === 1); const dest = ranked.find((r) => r.owner === 2);
  const state = loadState(); prepareState(state, ranked);
  const rec = E.applyOneMove(src, dest, src.population, state, "prosperity", makeInboundCtx());
  assert.ok(rec && "destPaidCost" in rec && rec.destPaidCost !== undefined,
    "an instant move record carries destPaidCost from its meta (kills the empty-options mutant)");
}

// ── applyOneMove lagged: decrements + infected flag + crossCiv from the meta (L215,216,224,227) ──
{
  // infected source, cross-civ
  const { src, dest, state } = laggedWorld(false);
  src.infected = true;
  const before = src.rural;
  const rec = E.applyOneMove(src, dest, src.population, state, "war", makeInboundCtx());
  assert.ok(rec, "a lagged move emits a departure record");
  assert.equal(src.rural, before - 1, "lagged: the source loses exactly one rural now (L215)");
  assert.equal(src.population, before - 1, "lagged: the source loses exactly one population now (L216)");
  assert.equal(state.transit[0].infected, true, "the queued row carries the source's infected flag (true)");
  assert.equal(state.transit[0].crossCiv, true, "owner 1 → owner 2 queues a cross-civ row");
}
{
  // clean source → infected flag false (kills the `!!`→`!` boolean mutant)
  const { src, dest, state } = laggedWorld(false);
  src.infected = false;
  E.applyOneMove(src, dest, src.population, state, "war", makeInboundCtx());
  assert.equal(state.transit[0].infected, false, "a clean source queues infected:false");
}
{
  // same-civ lagged move → crossCiv false (kills the crossCiv `=> true` mutant)
  const { src, dest, state } = laggedWorld(true);
  E.applyOneMove(src, dest, src.population, state, "war", makeInboundCtx());
  assert.equal(state.transit[0].crossCiv, false, "a same-civ lagged move queues crossCiv:false");
}

// ── applyOneMove refuses to start a journey when transit is at its hard cap (L213) ──
{
  const { src, dest, state } = laggedWorld(false);
  state.transit = Array.from({ length: 4096 }, () => ({})); // fill to MAX_TRANSIT_ENTRIES
  const before = src.rural;
  const rec = E.applyOneMove(src, dest, src.population, state, "war", makeInboundCtx());
  assert.equal(rec, null, "a full transit queue refuses to start a new lagged journey");
  assert.equal(src.rural, before, "and the source keeps its population when the journey is refused");
}

// ── sourceState preserves an EXISTING numeric deathPressure (L158) ─────────────
{
  const state = { sources: { z: { pressure: 1, cooldown: 0, crisisPressure: 0, crisisCooldown: 0, deathPressure: 5 } } };
  assert.equal(E.sourceState(state, "z").deathPressure, 5,
    "an already-numeric deathPressure is preserved, not reset (kills the always-normalize mutant)");
}

// ════════════════════════════════════════════════════════════════════════════
// Part 6, crisis-budget guards, split-pass branches, legacy death channel
// ════════════════════════════════════════════════════════════════════════════

// ── processSource: crisis budget alone (voluntary 0) still sheds for an in-crisis source (L465) ──
{
  pin();
  Object.assign(CONFIG, { splitTracksEnabled: true, splitBudgetsEnabled: true, emigrationBar: 0, transitLagTurns: 0, cooldownTurns: 0, warSurgeMax: 1, violenceFleeThreshold: 10, minRuralToEmigrate: 1, maxLossPerCityPerTurn: 0 });
  const w = crossCivWorld({ rural: 8 });
  w.src.violence = 20; // war crisis
  const out = E.processSource(w.src, w.ranked, w.state, w.ownerPop, { voluntary: 0, crisis: 5 }, w.inbound);
  assert.ok(out.some((m) => m.cause === "war"), "a crisis source with crisis budget but zero voluntary still sheds war refugees");
}

// ── processDepartures: a civ with crisis budget but zero voluntary still runs (L800) ──
{
  pin();
  Object.assign(CONFIG, { splitTracksEnabled: true, splitBudgetsEnabled: true, emigrationBar: 0, transitLagTurns: 0, cooldownTurns: 0, warSurgeMax: 1, violenceFleeThreshold: 10, minRuralToEmigrate: 1, maxMovesPerTurn: 0, movesPerCity: 0, movesPerSiege: 3 });
  // maxMovesPerTurn 0 → voluntary ceiling 0; a war city gets crisis ceiling = movesPerSiege.
  freshConfigStore(); globalThis.Game = { turn: 1 };
  globalThis.ComponentID = { toBitfield: (cid) => cid.owner + ":" + cid.n };
  const besieged = makeCity(1, 1, { population: 10, rural: 10, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 }); besieged.id = { owner: 1, n: 1 };
  const haven = makeCity(2, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 1, y: 0 }); haven.id = { owner: 2, n: 1 };
  installWorld({ 1: major([besieged]), 2: major([haven]) });
  globalThis.Players.Districts = { get: () => ({ getDistrictMaxHealth: () => 100, getDistrictHealth: (loc) => (loc && loc.x === 0 ? 0 : 100) }) };
  const ranked = rankedWorld();
  const src = ranked.find((r) => r.owner === 1);
  assert.ok(src && src.violence >= CONFIG.violenceFleeThreshold,
    "fixture precondition: the wrecked district injected war-level violence onto the besieged source");
  const state = loadState(); prepareState(state, ranked);
  const recs = E.processDepartures(state, ranked, makeInboundCtx());
  assert.ok(recs.some((m) => m.cause === "war"), "a civ with only crisis budget (0 voluntary) still sheds war refugees in processDepartures");
  delete globalThis.Players.Districts;
}

// ── processSourceLegacy: the concurrent death channel is included in the output (L331) ──
{
  pin();
  Object.assign(CONFIG, { splitTracksEnabled: false, emigrationBar: 1e9, attritionEnabled: true, attritionMinDistress: 1, attritionThreshold: 1, disasterFleeThreshold: 1, crossCivEnabled: true, poachBlock: 1000, minRuralToEmigrate: 1 });
  freshConfigStore(); globalThis.Game = { turn: 1 };
  globalThis.ComponentID = { toBitfield: (cid) => cid.owner + ":" + cid.n };
  // A lone distressed city with no reachable refuge → trapped death on the legacy path.
  const trapped = makeCity(1, 1, { population: 10, rural: 10, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 }); trapped.id = { owner: 1, n: 1 };
  const far = makeCity(2, 1, { population: 10, rural: 10, yields: { YIELD_FOOD: 1 }, x: 99, y: 0 }); far.id = { owner: 2, n: 1 };
  installWorld({ 1: major([trapped]), 2: major([far]) });
  const ranked = rankedWorld();
  const src = ranked.find((r) => r.owner === 1);
  assert.ok(src && distress(src) >= CONFIG.attritionMinDistress,
    "fixture precondition: the lone city is lethally distressed");
  const state = loadState(); prepareState(state, ranked);
  const ownerPop = ownerPopulations(ranked);
  let sawDeath = false;
  for (let i = 0; i < 8 && !sawDeath; i++) {
    if (E.processSourceLegacy(src, ranked, state, ownerPop, 5, makeInboundCtx()).some((m) => m.cause === "attrition")) sawDeath = true;
  }
  assert.ok(sawDeath, "processSourceLegacy includes the concurrent attrition death in its output");
}

// ── processSourceSplit: a source with NO destination sheds no crisis/voluntary records (L411) ──
{
  pin();
  Object.assign(CONFIG, { splitTracksEnabled: true, emigrationBar: 0, transitLagTurns: 0, attritionEnabled: false, minRuralToEmigrate: 1 });
  // Lonely source: the only signal in the world → bestOpenDestination null → no shed (block skipped).
  freshConfigStore(); globalThis.Game = { turn: 1 };
  installWorld({ 1: major([makeCity(1, 1, { population: 8, rural: 8, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 })]) });
  const ranked = rankedWorld();
  const src = ranked[0];
  const state = loadState(); prepareState(state, ranked);
  const out = E.processSourceSplit(src, ranked, state, ownerPopulations(ranked), { voluntary: 5, crisis: 5 }, makeInboundCtx());
  assert.deepEqual(out, [], "a source with no destination sheds nothing on the split pass (no spurious move)");
}

// ════════════════════════════════════════════════════════════════════════════
// Part 7, accumulation/reset/cooldown correctness + empty-return shapes
// ════════════════════════════════════════════════════════════════════════════

// ── planSource: a voluntary source ON COOLDOWN rests even with pressure over the bar (L618) ──
{
  pin();
  Object.assign(CONFIG, { emigrationBar: 10, cooldownTurns: 5, warSurgeMax: 1, bordersEnabled: false });
  const w = crossCivWorld({ rural: 8 }); // valid cross-civ destination present
  const ctx = { sig: w.ranked, st: { [w.src.key]: { pressure: 1000, cooldown: 5 } }, ownerPop: w.ownerPop, acc: new Map(), monoTurn: 0 };
  assert.equal(E.planSource(w.src, ctx, 5), 0,
    "a voluntary source on cooldown rests (plans 0) even with pressure already over the bar");
}

// ── planSource: a fresh (unseeded) voluntary source ACCUMULATES, it doesn't move on turn 1 (L615) ──
{
  pin();
  Object.assign(CONFIG, { emigrationBar: 1e9, cooldownTurns: 0, warSurgeMax: 1, bordersEnabled: false });
  const w = crossCivWorld({ rural: 8 }); // voluntary (prosperity) source, huge bar
  const ctx = { sig: w.ranked, st: {}, ownerPop: w.ownerPop, acc: new Map(), monoTurn: 0 }; // st UNSEEDED
  assert.equal(E.planSource(w.src, ctx, 5), 0,
    "a fresh voluntary source under a huge bar accumulates (0 moves), the seeded st starts at pressure 0, not undefined");
}

// ── planSource: a forced (war) source does NOT arm a cooldown (L627) ───────────
{
  pin();
  Object.assign(CONFIG, { emigrationBar: 0, cooldownTurns: 7, warSurgeMax: 1, violenceFleeThreshold: 10, bordersEnabled: false });
  const w = crossCivWorld({ rural: 8 });
  w.src.violence = 20; // war → forced
  const ctx = { sig: w.ranked, st: { [w.src.key]: { pressure: 0, cooldown: 0 } }, ownerPop: w.ownerPop, acc: new Map(), monoTurn: 0 };
  assert.ok(E.planSource(w.src, ctx, 5) >= 1, "the forced source plans a move");
  assert.equal(ctx.st[w.src.key].cooldown, 0, "a forced (war) plan does NOT arm the cooldown (only voluntary does)");
}

// ── shedVoluntary: a BLOCKED shed (dest at inbound cap) does NOT reset pressure/cooldown (L385) ──
{
  pin();
  Object.assign(CONFIG, { emigrationBar: 10, cooldownTurns: 4, transitLagTurns: 0, minRuralToEmigrate: 1, maxGainPerCityPerTurn: 1 });
  const w = crossCivWorld({ rural: 8 });
  const inbound = makeInboundCtx();
  noteInbound(w.dest.key, inbound); // destination already at its cap → the shed will be refused
  const st = { pressure: 10, cooldown: 0 }; // at the bar
  const out = E.shedVoluntary(w.src, { dest: w.dest, adjusted: 0 }, w.state, st, 5, inbound);
  assert.equal(out.length, 0, "a blocked voluntary shed produces no records");
  assert.equal(st.pressure, 10, "a blocked shed does NOT reset pressure (only a successful move does)");
  assert.equal(st.cooldown, 0, "a blocked shed does NOT arm the cooldown");
}

// ── legacyEmigrate: a forced (war) source does NOT arm a cooldown (L308) ───────
{
  pin();
  Object.assign(CONFIG, { splitTracksEnabled: false, emigrationBar: 0, cooldownTurns: 9, transitLagTurns: 0, warSurgeMax: 1, violenceFleeThreshold: 10, attritionEnabled: false, minRuralToEmigrate: 1 });
  const w = crossCivWorld({ rural: 8 });
  w.src.violence = 20; // war → forced
  const out = E.processSourceLegacy(w.src, w.ranked, w.state, w.ownerPop, 5, makeInboundCtx());
  assert.ok(out.some((m) => m.cause === "war"), "the legacy forced source sheds a war refugee");
  assert.equal(w.state.sources[w.src.key].cooldown, 0, "a forced legacy shed does NOT arm the cooldown (only voluntary does)");
}

// ── legacyEmigrate: a no-destination source returns an EMPTY array (L301) ───────
{
  pin();
  Object.assign(CONFIG, { splitTracksEnabled: false, emigrationBar: 0, attritionEnabled: false, minRuralToEmigrate: 1 });
  freshConfigStore(); globalThis.Game = { turn: 1 };
  installWorld({ 1: major([makeCity(1, 1, { population: 8, rural: 8, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 })]) }); // lonely
  const ranked = rankedWorld();
  const src = ranked[0];
  const state = loadState(); prepareState(state, ranked);
  const out = E.processSourceLegacy(src, ranked, state, ownerPopulations(ranked), 5, makeInboundCtx());
  assert.deepEqual(out, [], "a lonely legacy source returns an empty array (no phantom record)");
}

// ── processSourceLegacy: every emitted record is a real Migration object (kills the [] → [str], L306/L325) ──
{
  pin();
  Object.assign(CONFIG, { splitTracksEnabled: false, emigrationBar: 0, cooldownTurns: 0, transitLagTurns: 0, warSurgeMax: 1, attritionEnabled: false, minRuralToEmigrate: 1 });
  const w = crossCivWorld({ rural: 8 });
  const out = E.processSourceLegacy(w.src, w.ranked, w.state, w.ownerPop, 5, makeInboundCtx());
  assert.ok(out.length >= 1 && out.every((m) => m && typeof m === "object" && typeof m.cause === "string"),
    "legacy output is real Migration records (objects with a cause), never a sentinel array");
}

// ════════════════════════════════════════════════════════════════════════════
// Part 8, per-city cap, split/legacy dispatch, no-phantom-record guards
// ════════════════════════════════════════════════════════════════════════════

// ── processSource: the per-city migration cap bounds a legacy burst (L477 Math.min→Math.max) ──
{
  pin();
  Object.assign(CONFIG, { splitTracksEnabled: false, emigrationBar: 0, cooldownTurns: 0, transitLagTurns: 0, warSurgeMax: 9, violenceFleeThreshold: 10, minRuralToEmigrate: 1, maxLossPerCityPerTurn: 2, attritionEnabled: false });
  const w = crossCivWorld({ rural: 12 });
  w.src.violence = 20; // war surge would want many, but the per-city cap is 2
  const out = E.processSource(w.src, w.ranked, w.state, w.ownerPop, { voluntary: 50, crisis: 50 }, w.inbound);
  assert.equal(out.length, 2, "the per-city cap (maxLossPerCityPerTurn=2) bounds the burst to 2 (Math.min, not Math.max)");
}

// ── processSource: legacy dispatch merges causes; split keeps them concurrent (L466) ──
// A besieged-AND-attractive source: the SPLIT pass sheds BOTH a war and a voluntary record; the LEGACY
// pass (splitTracksEnabled off) emits a single cause. Forcing split-when-legacy would wrongly concur.
{
  pin();
  Object.assign(CONFIG, { splitTracksEnabled: false, splitBudgetsEnabled: false, emigrationBar: 0, cooldownTurns: 0, transitLagTurns: 0, warSurgeMax: 1, violenceFleeThreshold: 10, minRuralToEmigrate: 1, maxLossPerCityPerTurn: 0 });
  const w = crossCivWorld({ rural: 12 });
  w.src.violence = 20; // war crisis + attractive neighbour
  const out = E.processSource(w.src, w.ranked, w.state, w.ownerPop, { voluntary: 5, crisis: 5 }, w.inbound);
  // Legacy = one merged single-cause step: it does NOT emit both a war AND a prosperity record in one pass.
  const hasWar = out.some((m) => m.cause === "war"); const hasPros = out.some((m) => m.cause === "prosperity");
  assert.ok(!(hasWar && hasPros), "the legacy pass does not shed war AND prosperity concurrently (kills split-forcing)");
}

// ── runPass (legacy): no source ever emits a phantom sentinel record (kills [] → [str], L306/L325) ──
{
  pin();
  Object.assign(CONFIG, { splitTracksEnabled: false, emigrationBar: 0, cooldownTurns: 0, transitLagTurns: 0, warSurgeMax: 1, attritionEnabled: false, minRuralToEmigrate: 1 });
  freshConfigStore(); globalThis.Game = { turn: 1 };
  // A floored source (rural at the min) + a normal source + a rich destination, all legacy mode.
  installWorld({
    1: major([
      makeCity(1, 1, { population: 1, rural: 1, yields: { YIELD_FOOD: 1 }, x: 0, y: 0 }), // floored → hits the guard
      makeCity(1, 2, { population: 8, rural: 8, yields: { YIELD_FOOD: 1 }, x: 1, y: 0 })
    ]),
    2: major([makeCity(2, 1, { population: 2, rural: 2, yields: { YIELD_FOOD: 1000 }, x: 2, y: 0 })])
  });
  const recs = runPass();
  assert.ok(recs.every((m) => m && typeof m === "object" && typeof m.cause === "string"),
    "every migration from a pass is a real record, a floored/guarded source emits no sentinel array element");
}

console.log("engine-rigor harness passed");
