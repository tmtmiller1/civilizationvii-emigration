// return.mjs
//
// Return migration's pure decision helpers (emigration-return.js). No engine globals: atWarBetween
// reads no Players (→ not at war), and the cooldown state degrades to empty. The engine-mutating
// move itself (removeRural/addRural) is exercised in-game, not here.

import assert from "node:assert/strict";

const KV = {
  EmigrationReturn_v1: JSON.stringify({
    lastByHost: { HostFromSave: 99, Bad: "x" }
  })
};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

const { __test } = await import("/emigration/ui/emigration-return.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { eligibleDiaspora, prosperingOwners, homelandCitiesByOwner, returnAllowed, returnRoll, hasRoots, returnRateFor } = __test;

const sig = (owner, population, happiness, starving) => ({ owner, population, happiness, starving: !!starving });

// ── eligibleDiaspora: largest foreign origin over the floors ────────────────
{
  // 70 owner / 25 foreign(9) / 5 foreign(4): the lead foreign is 9, well over the share/points floors.
  const comp = { owner: 1, civs: [{ civ: 1, share: 0.7, pts: 70 }, { civ: 9, share: 0.25, pts: 25 }, { civ: 4, share: 0.05, pts: 5 }] };
  const d = eligibleDiaspora(comp);
  assert.equal(d.civ, 9, "the largest foreign origin is chosen");

  // Below the share floor → not eligible.
  const tiny = { owner: 1, civs: [{ civ: 1, share: 0.97, pts: 97 }, { civ: 9, share: 0.03, pts: 3 }] };
  assert.equal(eligibleDiaspora(tiny), null, "a sub-threshold minority draws no returnees");
  assert.equal(eligibleDiaspora({ owner: 1, civs: [{ civ: 1, share: 1, pts: 50 }] }), null, "single-origin → null");
}

// ── prosperingOwners: non-negative happiness + at least one fed city ────────
{
  const p = prosperingOwners([sig(1, 10, 5), sig(1, 8, -2), sig(2, 6, -9, true)]);
  assert.ok(p.has(1), "owner 1 nets positive happiness and is fed → prospering");
  assert.ok(!p.has(2), "owner 2 is unhappy and starving → not a homeland worth returning to");
}

// ── homelandCitiesByOwner: each owner's largest settlement, never a city-state ──
{
  const m = homelandCitiesByOwner([sig(9, 4), sig(9, 11), sig(9, 7), sig(3, 5)]);
  assert.equal(m.get(9).population, 11, "owner 9's largest city is the homeland target");
  assert.equal(m.get(3).population, 5, "owner 3's only city");
  // City-states are never civ homelands (so returns can't target them).
  const cs = homelandCitiesByOwner([{ owner: 5, population: 20, isCityState: true }, sig(6, 8)]);
  assert.ok(!cs.has(5), "a city-state owner is excluded from homelands");
  assert.ok(cs.has(6), "a major civ owner is included");
  assert.ok(!prosperingOwners([{ owner: 5, population: 9, happiness: 50, isCityState: true }]).has(5),
    "a city-state is never a prospering return homeland");
}

// ── returnAllowed: homeland exists, prospers, peace, off cooldown ───────────
{
  const ctx = { turn: 100, homelands: new Map([[9, sig(9, 11)]]), prospering: new Set([9]) };
  assert.ok(returnAllowed(1, 9, "FreshHost", ctx), "all conditions met → allowed");
  assert.ok(!returnAllowed(1, 9, "FreshHost", { ...ctx, homelands: new Map() }), "no homeland → blocked");
  assert.ok(!returnAllowed(1, 9, "FreshHost", { ...ctx, prospering: new Set() }), "homeland not prospering → blocked");
  assert.ok(!returnAllowed(9, 9, "FreshHost", ctx), "origin == host → blocked");
  assert.ok(!returnAllowed(1, 9, "HostFromSave", ctx), "legacy persisted cooldown should be honored");
  // A used config value should be present (sanity that the module is wired to CONFIG).
  assert.equal(typeof CONFIG.returnCooldownTurns, "number", "cooldown config is present");
}

// ── put down roots: an origin whose enclave stands in the host returns at a reduced rate ──
{
  const { putQuarter, dropQuarter } = await import("/emigration/ui/emigration-quarter-state.js");
  const city = { location: { x: 7, y: 3 } };
  const base = CONFIG.returnRate;
  assert.equal(returnRateFor(city, 9), base, "no enclave → the full rate");
  putQuarter("7,3", { civ: 9, originCiv: "CIVILIZATION_CARTHAGE", owner: 1, optionId: "a", turn: 1,
    applied: { benefitYield: null, benefitAmount: 0, penaltyYield: null, penaltyAmount: 0 }, contested: false, contestedTurn: -999,
    placed: { type: "IMPROVEMENT_CARAVANSERAI", plot: 102, enclave: "IMPROVEMENT_EMIG_ENCLAVE_CARTHAGE_A" } });
  assert.ok(hasRoots(city, 9), "the enclave's own origin has put down roots");
  assert.ok(!hasRoots(city, 4), "another origin in the same city has not");
  assert.ok(!hasRoots({ location: { x: 1, y: 1 } }, 9), "the same origin elsewhere has not");
  assert.equal(returnRateFor(city, 9), base * CONFIG.quarterRootsReturnScale, "rooted → the scaled rate");
  assert.equal(returnRateFor(city, 4), base, "a different origin keeps the full rate");
  const was = CONFIG.quarterRootsReturnScale;
  CONFIG.quarterRootsReturnScale = 0;
  assert.equal(returnRateFor(city, 9), 0, "Strong: none return");
  CONFIG.quarterRootsReturnScale = 1;
  assert.equal(returnRateFor(city, 9), base, "Off: the normal rate");
  CONFIG.quarterRootsReturnScale = was;
  dropQuarter("7,3");
}

// ── the return roll: reload-stable, near its rate, and varied per game by the seed ──
{
  const hosts = Array.from({ length: 2000 }, (_, i) => "Host" + i);
  const hitsA = hosts.filter((h) => returnRoll(h, 50, 0.06));
  assert.deepEqual(hosts.filter((h) => returnRoll(h, 50, 0.06)), hitsA, "same inputs → same outcome");
  assert.ok(hitsA.length > 60 && hitsA.length < 180, "about 6% of hosts roll a return: " + hitsA.length);
  assert.equal(hosts.filter((h) => returnRoll(h, 50, 0)).length, 0, "rate 0 never returns");
  const game = globalThis.Configuration.getGame;
  globalThis.Configuration.getGame = () => ({ ...game(), gameSeed: 424242 });
  const hitsB = hosts.filter((h) => returnRoll(h, 50, 0.06));
  assert.notDeepEqual(hitsB, hitsA, "a different game seed changes which hosts return");
  assert.ok(hitsB.length > 60 && hitsB.length < 180, "the seeded roll keeps its rate: " + hitsB.length);
  assert.deepEqual(hosts.filter((h) => returnRoll(h, 50, 0.06)), hitsB, "the same game stays reload-stable");
  // Consecutive turns for ONE host must also roll near the rate (mod test 68: without a final avalanche the
  // turn-suffixed seed rolled almost the same value every turn, so London could never return).
  for (const host of ["London", "Kumbi Saleh", "Leeds"]) {
    let n = 0;
    for (let t = 1; t <= 2000; t++) if (returnRoll(host, t, 0.06)) n++;
    assert.ok(n > 80 && n < 160, host + " rolls near 6% across consecutive turns: " + n + "/2000");
  }
  globalThis.Configuration.getGame = game;
}

delete globalThis.Configuration;

console.log("return harness passed");
