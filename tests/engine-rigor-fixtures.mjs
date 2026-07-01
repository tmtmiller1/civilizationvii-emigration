// engine-rigor-fixtures.mjs
//
// Mutation-rigor cases that need SEEDED war + combat + siege engine state, kept in their own process
// (fresh module caches) so the war-aggressor map, the combat-loss tracker, and the violence/siege
// ledger load cleanly from the stubbed Configuration / DemographicsData. Targets the
// state-dependent arithmetic that engine-rigor.mjs can't reach off a blank world:
//   • crisisSeverity's gang multiplier (war aggressors) + combat co-factor (casualties);
//   • processOutletDeath's crisis-vs-trapped death RATE (turns-to-die differ with the rate).

import assert from "node:assert/strict";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { __test as E } from "/emigration/ui/emigration-engine.js";

// ── Seed engine state BEFORE first read (fresh caches in this process) ─────────
const WAR_KEY = "EmigrationWar_v1";
const VIOLENCE_KEY = "EmigrationViolence_v2";
const kv = {
  // civ 1 is at war with civs 2 and 3 → warAggressors(1).size === 2 → gang extra = 1
  [WAR_KEY]: JSON.stringify({ wars: { 1: [2, 3] } }),
  // besieged city "9:1" at tenure 1 (fresh raid): siege escalation sits at siegeFloor (see siege test)
  [VIOLENCE_KEY]: JSON.stringify({ tenure: { "9:1": 1 }, onsetPop: { "9:1": 10 }, warLoss: { "9:1": 0 } })
};
globalThis.Configuration = { getGame: () => ({ getValue: (k) => kv[k] }), editGame: () => ({ setValue: (k, v) => (kv[k] = v) }) };
globalThis.Game = { turn: 1 };
// Combat casualties read off Demographics; prime the tracker across two turns so the loss is nonzero.
let casualties = 0;
globalThis.DemographicsData = { casualtyCumFor: (pid) => (pid === 1 ? casualties : 0) };

function pinSeverity() {
  Object.assign(CONFIG, {
    gameSpeedTuningEnabled: false, warSiege: false,
    attritionMinDistress: 10, crisisSeverityCap: 100,
    crisisParticipantMax: 10, crisisParticipantWeight: 0.5, // extra 1 → gang = 1 + min(10, 0.5) = 1.5
    crisisCombatMax: 10, crisisCombatWeight: 0.01, // loss 100 → combat = min(10, 1) = 1
    crisisDeathEnabled: true, crisisDeathShare: 0.5, attritionThreshold: 10, deltaExponent: 1, attritionEnabled: true
  });
}
pinSeverity();

const src = { owner: 1, key: "s", city: { name: "S", location: { x: 0, y: 0 } } };

// ── crisisSeverity: gang (war aggressors) + combat (casualties) both engaged (L500,L504) ──
import { combatLossFor } from "/emigration/ui/emigration-combat.js";
{
  // Prime the combat tracker: turn 1 baseline 0, then turn 2 with 100 cumulative casualties.
  casualties = 0; combatLossFor(1);            // baseline at turn 1
  globalThis.Game.turn = 2; casualties = 100;  // a turn later, 100 casualties
  // severity = intensity * gang + combat = min(100, 50/10) * 1.5 + min(10, 0.01*100)
  //          = 5 * 1.5 + 1 = 8.5
  assert.equal(E.crisisSeverity(src, 50), 8.5,
    "crisisSeverity = intensity*gang + combat with war aggressors (gang 1.5) and casualties (combat 1)");
  // With no casualties on a different civ, combat term is 0 and a single-aggressor gang is 1.
  globalThis.Game.turn = 2;
  assert.equal(E.crisisSeverity({ owner: 9, key: "x", city: { name: "X", location: { x: 0, y: 0 } } }, 50), 5,
    "an unattacked civ has gang 1 and combat 0 → severity = intensity (5)");
}

// ── processOutletDeath: crisis-while-fleeing dies SLOWER than trapped (rate < 1) (L531,L535) ──
import { distress } from "/emigration/ui/emigration-prosperity.js";
{
  pinSeverity();
  globalThis.ComponentID = { toBitfield: (cid) => cid.owner + ":" + cid.n };
  Object.assign(CONFIG, { attritionEnabled: true, disasterFleeThreshold: 1, starvationModifier: 0, warSiege: false, crisisDeathEnabled: true, crisisDeathShare: 0.5, deltaExponent: 1 });
  function cityObj() { let rural = 50, pop = 50; return { get ruralPopulation() { return rural; }, set ruralPopulation(v) { rural = v; }, get population() { return pop; }, set population(v) { pop = v; }, addRuralPopulation(x) { rural += x; pop += x; }, name: "C", location: { x: 0, y: 0 }, id: { owner: 9, n: 1 } }; }
  const mk = (k) => ({ owner: 9, key: k, population: 50, rural: 50, disaster: 80, violence: 0, happiness: 0, city: cityObj() });
  const d = distress(mk("probe")); // the per-turn lethal distress for this fixture (owner 9: gang 1, combat 0)
  assert.ok(d > 1, "fixture sanity: the source is lethally distressed");
  const dpow = Math.pow(Math.max(d, 1), 1); // deltaExponent 1 → the per-turn pressure unit before *rate
  // ref = d/1.5 → intensity = 1.5 → severity 1.5 → crisis rate = min(1, 0.5*1.5) = 0.75; trapped rate = 1.
  // threshold = 4 * dpow → trapped dies in ceil(4/1)=4 turns, fleeing in ceil(4/0.75)=6 turns (EXACT, so
  // the rate ARITHMETIC matters: a `/rate` mutation would give different turn counts).
  const T = 4 * dpow;
  Object.assign(CONFIG, { attritionMinDistress: Math.round(d / 1.5), attritionThreshold: T });
  const state = { monoTurn: 0, transit: [] };
  const turnsToDeath = (s, st, hasRefuge) => { for (let i = 1; i <= 500; i++) if (E.processOutletDeath(s, st, state, hasRefuge)) return i; return Infinity; };

  // ── Exact-turn rate arithmetic (ramp OFF so accrual is constant per turn) ──
  CONFIG.deathRampEnabled = false;
  const tTrap = turnsToDeath(mk("trap"), { deathPressure: 0 }, false); // rate 1   → ceil(4/1)   = 4
  const tFlee = turnsToDeath(mk("flee"), { deathPressure: 0 }, true);   // rate 0.75 → ceil(4/0.75) = 6
  assert.equal(tTrap, 4, "trapped (rate 1) dies in exactly 4 turns (kills the death-pressure arithmetic)");
  assert.equal(tFlee, 6, "crisis-while-fleeing (rate 0.75) dies in exactly 6 turns (kills the rate `*`→`/` mutant)");

  // A fired death removes exactly one RURAL and one population point (kills L540 `src.rural -= 1` → `+= 1`).
  const dead = mk("decr"); const rBefore = dead.rural, pBefore = dead.population;
  const st = { deathPressure: 0 };
  for (let i = 1; i <= 500 && dead.population === pBefore; i++) E.processOutletDeath(dead, st, state, false);
  assert.equal(dead.rural, rBefore - 1, "a fired attrition death removes exactly one rural point");
  assert.equal(dead.population, pBefore - 1, "and exactly one population point");

  // ── Onset SMOOTHING (ramp ON): the same trapped crisis takes LONGER to first death, but still fires ──
  // Ramp OFF trapped = 4 turns (above). Ramp ON accrues dpow·deathRamp(tenure) each turn; with floor 0.25,
  // rampTurns 6 the cumulative crosses 4·dpow at turn 7, gentle onset, no cap (it DOES eventually kill).
  Object.assign(CONFIG, { deathRampEnabled: true, deathRampFloor: 0.25, deathRampTurns: 6 });
  const tRampOn = turnsToDeath(mk("ramp"), { deathPressure: 0, crisisTenure: 0 }, false);
  assert.ok(Number.isFinite(tRampOn), "onset smoothing still eventually kills, it is NOT a cap");
  assert.ok(tRampOn > tTrap, `smoothing delays the first death vs the un-ramped rate (${tRampOn} > ${tTrap})`);
  assert.equal(tRampOn, 7, "with floor 0.25 / rampTurns 6 the first death lands exactly on turn 7 (ramp is wired in)");

  // ── Reversibility: a turn of relief RELAXES the crisis tenure (the onset ramp winds back down) ──
  CONFIG.attritionEnabled = false; // no lethal distress this turn → coping branch
  const relief = { deathPressure: 4, crisisTenure: 5 };
  assert.equal(E.processOutletDeath(mk("cope"), relief, state, false), null, "no lethal distress → no death");
  assert.equal(relief.deathPressure, 2, "deathPressure decays by speedDecay(0.5)=0.5 (4 → 2), it doesn't snap to 0");
  assert.equal(relief.crisisTenure, 4, "a turn of relief relaxes crisisTenure (5 → 4) so a renewed crisis re-onsets gently");
}

// ── warSurgeBudget: siege escalation scales the burst (esc in (0,1)) (L99) ────
{
  Object.assign(CONFIG, {
    gameSpeedTuningEnabled: false, warSiege: true, siegeFloor: 0.5, siegeRampTurns: 100,
    siegeLossCapPct: 0.6, warRetention: 1, warSurgeMax: 3, violenceFleeThreshold: 10
  });
  // tenure 1 → ramp 0 → esc = siegeFloor = 0.5 (retention 1). violence 20, thr 10 → over=1, scale=min(1,1)*0.5=0.5.
  // budget = 1 + round(0.5 * (3-1)) = 1 + round(1) = 2.  A `*esc`→`/esc` mutation would give 1+round(2*2)=5.
  const besieged = { owner: 9, violence: 20, city: { name: "B", location: { x: 0, y: 0 }, id: { owner: 9, id: 1 } } };
  const b = E.warSurgeBudget(besieged, "war");
  assert.equal(b, 2, "a half-escalated siege sheds a 2-point burst (esc scales the surge; kills the *esc→/esc mutant)");
}

console.log("engine-rigor-fixtures harness passed");
