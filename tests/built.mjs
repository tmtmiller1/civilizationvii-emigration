// built.mjs
//
// The built-environment term (emigration-built.js): what a settlement HOLDS as a reason to stay, on
// top of what it produces.
//
// Two things are worth pinning here and nothing else is. First, that roles are DERIVED from the
// compiled database rather than from a list of building names, because a name list would silently miss
// every building an age, a DLC or another mod adds — so the tests feed database-shaped rows, not
// building names. Second, that the term is BOUNDED: each role counts once however many markets a city
// builds, wonders are capped, and the whole thing is clamped. An unbounded "reason to stay" term would
// let a tall build order park a settlement permanently above every neighbour.

import assert from "node:assert/strict";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { __test as B, scoreKinds, builtFor } from "/emigration/ui/emigration-built.js";

const { roleFor, ROLE_ORDER } = B;

/** A database-shaped constructible row. @param {*} o Overrides. @returns {*} The row. */
function def(o = {}) {
  return { ConstructibleType: "BUILDING_TEST", ConstructibleClass: "BUILDING", Name: "LOC_TEST", ...o };
}
/** A kind as the index would produce it. */
function kind(role, name = "LOC_" + role.toUpperCase(), wonder = false) {
  return { role, name, wonder };
}

// Pin the weights the assertions below hand-compute, so this suite tests the STRUCTURE and never
// tracks a future re-tuning of the shipped numbers.
CONFIG.builtEnabled = true;
CONFIG.builtWonderCap = 3;
CONFIG.builtCap = 100; // effectively off; the clamp gets its own case
CONFIG.builtRoleWeights = {
  prestige: 1.5, amenity: 1.0, safety: 0.8, sustenance: 0.8, learning: 0.8,
  trade: 0.8, shelter: 0.6, culture: 0.6, work: 0.6, civic: 0.3
};

// ── Roles come from what the database says a building DOES ───────────────────
{
  const none = new Set();
  assert.equal(roleFor(def({ ConstructibleClass: "WONDER" }), null, none), "prestige",
    "the wonder class is prestige regardless of what it yields");
  assert.equal(roleFor(def(), { Housing: 2 }, none), "shelter", "housing alone is shelter");
  assert.equal(roleFor(def(), null, new Set(["YIELD_FOOD"])), "sustenance", "a granary is sustenance");
  assert.equal(roleFor(def(), null, new Set(["YIELD_SCIENCE"])), "learning", "a school is learning");
  assert.equal(roleFor(def(), null, new Set(["YIELD_GOLD"])), "trade", "a market is trade");
  assert.equal(roleFor(def(), null, new Set(["YIELD_CULTURE"])), "culture", "an amphitheater is culture");
  assert.equal(roleFor(def(), { CitizenSlots: 2 }, none), "work", "citizen slots are work even with no yield");
  assert.equal(roleFor(def(), null, new Set(["YIELD_PRODUCTION"])), "work", "production is work");
}

// ── Defence outranks yields: walls are a reason to stay that is not output ────
{
  const rich = new Set(["YIELD_GOLD", "YIELD_FOOD", "YIELD_SCIENCE"]);
  assert.equal(roleFor(def({ Defense: 5 }), null, rich), "safety",
    "a defensive building is safety even when it also yields (kills a yields-first ordering)");
  for (const field of ["DefenseModifier", "OuterDefenseStrength", "GrantFortification"]) {
    assert.equal(roleFor(def(), { [field]: 3 }, new Set()), "safety", `${field} counts as defence`);
  }
}

// ── DistrictDefense is the flag real walls actually carry ────────────────────
// Found by running the derivation against the compiled gameplay database: BUILDING_ANCIENT_WALLS,
// BUILDING_MOTTE, BUILDING_BAILEY and BUILDING_CITADEL all have Defense 0 and DistrictDefense 1, so a
// numeric-only test classed the walls themselves as "civic". These are their real rows.
{
  const ancientWalls = def({ ConstructibleType: "BUILDING_ANCIENT_WALLS", Defense: 0, DistrictDefense: 1 });
  assert.equal(roleFor(ancientWalls, { DefenseModifier: 0 }, new Set()), "safety", "Ancient Walls are safety");
  const motte = def({ ConstructibleType: "BUILDING_MOTTE", Defense: 0, DistrictDefense: 1 });
  assert.equal(roleFor(motte, {}, new Set(["YIELD_HAPPINESS"])), "safety",
    "a fortification is safety even though it also grants happiness");
  assert.equal(roleFor(def({ DistrictDefense: true }), {}, new Set()), "safety",
    "the runtime's boolean true is accepted as well as the compiled 1");
  assert.equal(roleFor(def({ DistrictDefense: 0 }), {}, new Set()), "civic", "an unset flag does not count");
}

// ── Happiness outranks the economic yields (an amenity is not a market) ──────
{
  assert.equal(roleFor(def(), null, new Set(["YIELD_HAPPINESS", "YIELD_GOLD"])), "amenity",
    "a building granting happiness is an amenity, not trade");
}

// ── A building the database cannot explain still counts, never nothing ───────
{
  assert.equal(roleFor(def(), null, new Set()), "civic", "an unrecognized building falls back to civic");
  assert.equal(roleFor(null, null, null), "civic", "a wholly unreadable row is survivable and still civic");
  assert.ok(ROLE_ORDER.includes("civic"), "the catch-all is part of the declared role order");
}

// ── THE BOUND: a role counts ONCE, however many of that building there are ───
{
  const one = scoreKinds([kind("trade")]);
  const three = scoreKinds([kind("trade", "LOC_A"), kind("trade", "LOC_B"), kind("trade", "LOC_C")]);
  assert.equal(one.score, 0.8, "one market scores its role weight");
  assert.equal(three.score, 0.8, "three markets are ONE reason to stay, not three");
  assert.deepEqual(three.names, ["LOC_A"], "and only the first is named");
}

// ── Distinct roles add; the names name them ─────────────────────────────────
{
  const r = scoreKinds([kind("sustenance", "LOC_GRANARY"), kind("trade", "LOC_MARKET"), kind("learning", "LOC_SCHOOL")]);
  assert.ok(Math.abs(r.score - (0.8 + 0.8 + 0.8)) < 1e-9, "three different roles add up");
  assert.equal(r.names.length, 3, "each contributing building is named");
  assert.ok(r.names.includes("LOC_GRANARY") && r.names.includes("LOC_MARKET") && r.names.includes("LOC_SCHOOL"),
    "the granary, the market and the school are all named");
}

// ── Wonders are the one PER-INSTANCE role, and they are capped ───────────────
{
  const two = scoreKinds([kind("prestige", "LOC_W1", true), kind("prestige", "LOC_W2", true)]);
  assert.ok(Math.abs(two.score - 3.0) < 1e-9, "two wonders count twice (unlike every other role)");
  const many = scoreKinds(Array.from({ length: 9 }, (_, i) => kind("prestige", "LOC_W" + i, true)));
  assert.ok(Math.abs(many.score - 3 * 1.5) < 1e-9, "wonders stop counting at builtWonderCap");
  assert.equal(many.names.length, 3, "and only the credited wonders are named");
}

// ── The whole term is clamped, so it can never become the entire score ───────
{
  const prev = CONFIG.builtCap;
  CONFIG.builtCap = 2;
  const r = scoreKinds([kind("prestige", "LOC_W", true), kind("trade"), kind("learning"), kind("safety")]);
  assert.equal(r.score, 2, "the total is clamped to builtCap");
  CONFIG.builtCap = prev;
}

// ── Degenerate input is survivable ──────────────────────────────────────────
{
  assert.equal(scoreKinds([]).score, 0, "a settlement with nothing built scores 0");
  assert.equal(scoreKinds(null).score, 0, "a missing kinds list scores 0, it does not throw");
  assert.equal(scoreKinds([null, undefined]).score, 0, "null entries are skipped");
  assert.deepEqual(scoreKinds([kind("trade", "")]).names, [], "a building with no name tag is not named as an empty string");
}

// ── An unweighted role contributes nothing rather than NaN ──────────────────
{
  const prev = CONFIG.builtRoleWeights;
  CONFIG.builtRoleWeights = { trade: 0.8 }; // every other role unset
  const r = scoreKinds([kind("trade"), kind("learning"), kind("safety")]);
  assert.equal(r.score, 0.8, "roles with no configured weight add 0, never NaN");
  CONFIG.builtRoleWeights = prev;
}

// ── Disabling the term is total: builtFor short-circuits before any engine read ──
{
  CONFIG.builtEnabled = false;
  const off = builtFor({ owner: 1, id: { id: 1 } });
  assert.equal(off.score, 0, "a disabled term reads 0");
  assert.deepEqual(off.names, [], "and names nothing");
  CONFIG.builtEnabled = true;
}

// ── Off-engine (no GameInfo / no map) the term is 0, never a throw ───────────
// The mod's suites run without an engine, and a settlement whose plots cannot be read must contribute
// nothing rather than take the whole scoring pass down.
{
  B.reset();
  const r = builtFor({ owner: 2, id: { id: 7 } });
  assert.equal(r.score, 0, "an unreadable settlement scores 0 off-engine");
  assert.equal(builtFor({}).score, 0, "a settlement with no usable id scores 0");
}

console.log("built tests passed");
