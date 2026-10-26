import assert from "node:assert/strict";

let store = {};
const kv = {};

function resetEnv() {
  store = {};
  for (const k of Object.keys(kv)) delete kv[k];
}

resetEnv();

globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { store = {}; }
};

globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => kv[k] }),
  editGame: () => ({ setValue: (k, v) => { kv[k] = v; } })
};

globalThis.GameContext = { localPlayerID: 1 };
globalThis.Players = {
  get: (id) => ({ Diplomacy: { hasMet: (other) => id === 1 && other === 2 } })
};

const S = await import("/emigration/ui/emigration-settings.js");
const G = await import("/emigration/ui/emigration-governance.js");

// Spoil Guard branches: on hides unmet, off shows everyone when nobody else guards
S.setVisibilityOverride(1);
assert.equal(G.effectivePolicy(), "met-civs-only");
S.setVisibilityOverride(2);
assert.equal(G.effectivePolicy(), "full");
// ...and the stricter of the two mods wins when Demographics guards too (2026-10-26)
kv.DemographicsAnalyticsPolicyEffective_v1 = "met-civs-only";
assert.equal(G.effectivePolicy(), "met-civs-only", "guard off here, but Demographics still guards");
S.setVisibilityOverride(1);
kv.DemographicsAnalyticsPolicyEffective_v1 = "own-civ-only";
assert.equal(G.effectivePolicy(), "own-civ-only", "Demographics stricter than our guard");
kv.DemographicsAnalyticsPolicyEffective_v1 = "full";
assert.equal(G.effectivePolicy(), "met-civs-only", "our guard stricter than Demographics");
delete kv.DemographicsAnalyticsPolicyEffective_v1;
S.setVisibilityOverride(0);

// published policy branch
kv.DemographicsAnalyticsPolicyEffective_v1 = "disabled";
assert.equal(G.effectivePolicy(), "disabled");

// host/local reconciliation branches
delete kv.DemographicsAnalyticsPolicyEffective_v1;
kv.DemographicsAnalyticsPolicy_v1 = "own-civ-only";
store.modSettings = JSON.stringify({ demographics: { analyticsPolicy: "full" } });
G.__test.forgetLocalRead();
assert.equal(G.effectivePolicy(), "own-civ-only");

kv.DemographicsAnalyticsPolicy_v1 = "full";
store.modSettings = JSON.stringify({ demographics: { analyticsPolicy: "met-civs-only" } });
G.__test.forgetLocalRead();
assert.equal(G.effectivePolicy(), "met-civs-only");

// localPolicy legacy branch hideUnmetStats=false
resetEnv();
store.modSettings = JSON.stringify({ demographics: { hideUnmetStats: false } });
G.__test.forgetLocalRead();
assert.equal(G.effectivePolicy(), "full");

// localPolicy parse catch / missing localStorage branch fallback
const priorLocalStorage = globalThis.localStorage;
globalThis.localStorage = {
  getItem: () => {
    throw new Error("storage boom");
  }
};
G.__test.forgetLocalRead();
assert.equal(G.effectivePolicy(), "met-civs-only");
globalThis.localStorage = priorLocalStorage;

// localPlayerId catch branch
const priorGC = globalThis.GameContext;
Object.defineProperty(globalThis, "GameContext", {
  configurable: true,
  get() {
    throw new Error("gc boom");
  }
});
assert.equal(G.localPlayerId(), undefined);
Object.defineProperty(globalThis, "GameContext", { configurable: true, value: priorGC, writable: true });

// civHidden decision branches + catch fallback
S.setVisibilityOverride(0);
resetEnv();
store.modSettings = JSON.stringify({ demographics: { analyticsPolicy: "met-civs-only" } });
G.__test.forgetLocalRead();
assert.equal(G.civHidden(1), false);
assert.equal(G.civHidden(2), false);
assert.equal(G.civHidden(3), true);

store.modSettings = JSON.stringify({ demographics: { analyticsPolicy: "own-civ-only" } });
G.__test.forgetLocalRead();
assert.equal(G.civHidden(2), true);

const priorPlayers = globalThis.Players;
globalThis.Players = {
  get: () => {
    throw new Error("diplomacy boom");
  }
};
assert.equal(G.civHidden(3), true, "on failure policy should fail-safe hidden");

globalThis.Players = priorPlayers;
S.setVisibilityOverride(0);

delete globalThis.localStorage;
delete globalThis.Configuration;
delete globalThis.GameContext;
delete globalThis.Players;

console.log("governance-branches-extra harness passed");
