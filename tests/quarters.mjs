// quarters.mjs
//
// The truthful "quarter" engine for diaspora chronicle lines (emigration-quarters.js) and its contract
// with the prose engine (emigration-narrative.js). The core guarantee under test: a quarter phrase
// NEVER names a city feature that wasn't supplied (no "granary" unless the city has one) while a
// supplied feature is named, and the choice is deterministic per seed.

import assert from "node:assert/strict";
import { resolveQuarter, __test as q } from "/emigration/ui/emigration-quarters.js";
import { foundingLine } from "/emigration/ui/emigration-narrative.js";

const FEATURE_WORDS = ["harbour", "waterfront", "dock", "river", "mountain", "high ground",
  "granar", "temple", "market", "stalls", "wall", "gate"];

/** Words that only ever appear in a SPECIFIC feature's phrases (for the truthfulness assertions). */
function mentionsAnyFeature(text) {
  return FEATURE_WORDS.some((w) => text.toLowerCase().includes(w));
}

// ── Truthfulness: no feature is named unless its key was supplied ─────────────
{
  // No keys at all → a generic, always-true phrase that names no feature.
  for (let i = 0; i < 40; i++) {
    const phrase = resolveQuarter(new Set(), "city" + i + "|civ|2");
    assert.ok(!mentionsAnyFeature(phrase), `generic quarter names no feature: "${phrase}"`);
    assert.ok(q.GENERIC_QUARTERS.includes(phrase), "no-feature city draws from GENERIC_QUARTERS");
  }
  // Empty / missing inputs never throw and stay generic.
  for (const bad of [null, undefined, [], new Set()]) {
    const phrase = resolveQuarter(bad, "seed");
    assert.ok(q.GENERIC_QUARTERS.includes(phrase), "missing keys → generic phrase");
  }
}

// ── A supplied feature is named, and ONLY supplied features are named ─────────
{
  // A coastal city never gets a granary phrase; a granary city never gets a harbour phrase.
  const coast = resolveQuarter(["coast"], "Athens|Greek|2");
  assert.ok(q.FEATURE_QUARTERS.coast.includes(coast), "coast city draws a coast phrase");
  assert.ok(!coast.toLowerCase().includes("granar"), "coast city never claims a granary");

  const granary = resolveQuarter(new Set(["granary"]), "Ur|Sumerian|3");
  assert.ok(q.FEATURE_QUARTERS.granary.includes(granary), "granary city draws a granary phrase");
  assert.ok(!granary.toLowerCase().includes("harbour"), "granary city never claims a harbour");

  // With several features present, the phrase is always one of the PRESENT features' phrases.
  const keys = ["river", "market", "walls"];
  for (let i = 0; i < 60; i++) {
    const phrase = resolveQuarter(keys, "Rome" + i + "|Gaul|2");
    const fromPresent = keys.some((k) => q.FEATURE_QUARTERS[k].includes(phrase));
    assert.ok(fromPresent, `multi-feature phrase comes from a present feature: "${phrase}"`);
    assert.ok(!q.FEATURE_QUARTERS.granary.includes(phrase), "absent granary is never named");
    assert.ok(!q.FEATURE_QUARTERS.temple.includes(phrase), "absent temple is never named");
  }
}

// ── Determinism + spread ──────────────────────────────────────────────────────
{
  const a = resolveQuarter(["coast", "river"], "Lutetia|Frankish|2");
  const b = resolveQuarter(["coast", "river"], "Lutetia|Frankish|2");
  assert.equal(a, b, "same keys + seed → same quarter (deterministic)");

  const variants = new Set();
  for (let i = 0; i < 50; i++) variants.add(resolveQuarter(new Set(), "town" + i + "|civ|" + i));
  assert.ok(variants.size >= 3, "generic quarters spread across the list");
}

// ── Contract with the prose engine: foundingLine honours a truthful `where` ────
{
  const base = { origin: "Carthaginian", host: "Roman", city: "Ostia", pct: 31, seed: "Ostia|3|2" };
  const withWhere = foundingLine({ ...base, where: "by the harbour" });
  assert.ok(withWhere.includes("by the harbour"), "foundingLine uses the supplied truthful quarter");

  // Without a `where`, the line falls back to a generic edge phrase and invents no feature.
  for (let i = 0; i < 40; i++) {
    const line = foundingLine({ origin: "Norman", host: "Frankish", city: "Rouen" + i, pct: 15 + (i % 20), seed: "f" + i });
    assert.ok(!mentionsAnyFeature(line), `no-where founding line invents no feature: "${line}"`);
  }
}

console.log("quarters.mjs: all assertions passed");
