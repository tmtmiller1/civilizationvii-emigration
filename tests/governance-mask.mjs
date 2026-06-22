import assert from "node:assert/strict";

// Guardrail for the analytics-visibility masking (emigration-governance.js): civHidden(pid) must
// follow the effective policy (shared host ceiling + local preference), so the dashboard/lens never
// reveal a civ the policy withholds — independent of the simulation scope.

// ── Stub the engine surfaces governance reads ──────────────────────────────
let _ls = {};
globalThis.localStorage = {
  getItem: (k) => (k in _ls ? _ls[k] : null),
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
  clear: () => { _ls = {}; },
  get length() { return Object.keys(_ls).length; },
  key: (i) => Object.keys(_ls)[i]
};
globalThis.GameContext = { localPlayerID: 1 };
const _met = new Set([1, 2]); // local = 1; civ 2 met; civ 3 unmet
globalThis.Players = {
  get: (pid) => (pid === 1 ? { Diplomacy: { hasMet: (o) => _met.has(o) } } : null)
};
let _hostKV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => _hostKV[k] }),
  editGame: () => ({ setValue: (k, v) => (_hostKV[k] = v) })
};
const HOST = "DemographicsAnalyticsPolicy_v1";
const PUBLISHED = "DemographicsAnalyticsPolicyEffective_v1";

const G = await import("/emigration/ui/emigration-governance.js");

function setLocal(p) { _ls = {}; if (p) _ls.modSettings = JSON.stringify({ demographics: { analyticsPolicy: p } }); }
function setHost(p) { _hostKV = {}; if (p) _hostKV[HOST] = p; }
function reset() { _ls = {}; _hostKV = {}; }
function setPublished(p) { reset(); if (p) _hostKV[PUBLISHED] = p; }

// Default: no host, no local pref → met-civs-only (today's behaviour).
setLocal(null); setHost(null);
assert.equal(G.effectivePolicy(), "met-civs-only");
assert.equal(G.civHidden(1), false, "local civ never hidden");
assert.equal(G.civHidden(2), false, "met civ shown under met-civs-only");
assert.equal(G.civHidden(3), true, "unmet civ hidden under met-civs-only");

// Full: reveal everyone.
setLocal("full");
assert.equal(G.effectivePolicy(), "full");
assert.equal(G.civHidden(3), false, "unmet civ shown under full");

// Own-civ-only: hide every non-local civ, even met ones.
setLocal("own-civ-only");
assert.equal(G.civHidden(1), false, "local civ shown under own-civ-only");
assert.equal(G.civHidden(2), true, "met non-local civ hidden under own-civ-only");
assert.equal(G.civHidden(3), true, "unmet civ hidden under own-civ-only");

// Host ceiling overrides a more permissive local preference.
setLocal("full"); setHost("met-civs-only");
assert.equal(G.effectivePolicy(), "met-civs-only", "host ceiling wins");
assert.equal(G.civHidden(3), true, "unmet hidden because the host capped at met-civs-only");

// Local can still be MORE restrictive than the host.
setLocal("own-civ-only"); setHost("full");
assert.equal(G.effectivePolicy(), "own-civ-only");
assert.equal(G.civHidden(2), true, "local own-civ-only still hides a met rival under a full host");

// The policy Demographics PUBLISHES to GameConfiguration is the primary source (the shared
// localStorage is wiped between reads in the Coherent UI, so a direct read of it can't be trusted).
setPublished("full");
assert.equal(G.effectivePolicy(), "full", "published effective policy is read");
assert.equal(G.civHidden(3), false, "unmet civ shown when Demographics published 'full'");
setPublished("met-civs-only");
assert.equal(G.effectivePolicy(), "met-civs-only");
assert.equal(G.civHidden(3), true, "unmet civ hidden when Demographics published 'met-civs-only'");

// The published value wins even over a stale/empty local read (the real-world failure: localStorage
// returns nothing, so the old code defaulted to met and never revealed unmet civs the player chose).
reset(); _hostKV[PUBLISHED] = "full"; // local read empty, but Demographics published "full"
assert.equal(G.effectivePolicy(), "full", "published 'full' overrides an empty local read");
assert.equal(G.civHidden(3), false, "unmet civ shown despite the wiped localStorage");

console.log("governance-mask harness passed");
