// quarter-registry.mjs
//
// The Cultural Quarter option assembler (emigration-quarter-registry.js). No engine globals: it reads
// the pure per-civ bonus registry and composes the offered options (origin's two identity options +
// the universal passive "let them be"), exercised directly.

import assert from "node:assert/strict";

const { quarterOptionsFor, quarterOptionFor, isQuarterOption, __test } =
  await import("/emigration/ui/emigration-quarter-registry.js");

// ── quarterOptionsFor: origin's two identity options + the passive stance ────
{
  const opts = quarterOptionsFor("CIVILIZATION_ROME");
  assert.equal(opts.length, 3, "two identity options plus the passive stance");
  assert.deepEqual(opts.map((o) => o.id), ["a", "b", "ignore"], "options in the intended order");
  // Rome: a = its engineers' learning (Science, for Gold), b = its roads' trade (Gold, free).
  assert.equal(opts[0].benefitYield, "YIELD_SCIENCE", "Roman option A pays Science");
  assert.equal(opts[0].penaltyYield, "YIELD_GOLD", "Roman option A costs Gold");
  assert.equal(opts[0].label, "Learn their engineering", "Roman option A keeps its own verb");
  assert.equal(opts[1].benefitYield, "YIELD_GOLD", "Roman option B pays Gold");
  assert.equal(opts[1].penaltyYield, null, "a Gold stance costs nothing");
  const ignore = opts[2];
  assert.equal(ignore.benefitYield, null, "the passive stance grants nothing");
  assert.equal(ignore.penaltyYield, null, "the passive stance costs nothing");
  // Each active option has a well-formed label + note.
  for (const o of opts.slice(0, 2)) {
    assert.ok(typeof o.label === "string" && o.label.length, "an option has a label");
    assert.ok(typeof o.note === "string" && o.note.length, "an option has a consequence note");
  }
}

// ── a different origin yields different identity yields ──────────────────────
{
  const persia = quarterOptionsFor("CIVILIZATION_PERSIA");
  assert.equal(persia[0].benefitYield, "YIELD_GOLD", "Persian option A grants Gold (satrapal tribute)");
  assert.equal(persia[1].benefitYield, "YIELD_CULTURE", "Persian option B grants Culture (pleasure-gardens)");
  // Rome and Persia must not offer the identical option set.
  const rome = quarterOptionsFor("CIVILIZATION_ROME");
  assert.notDeepEqual(persia.map((o) => o.benefitYield), rome.map((o) => o.benefitYield),
    "different origins offer different yield identities");
}

// ── fresh copies each call (a caller can decorate labels safely) ─────────────
{
  const opts = quarterOptionsFor("CIVILIZATION_ROME");
  opts[0].label = "MUTATED";
  assert.notEqual(quarterOptionsFor("CIVILIZATION_ROME")[0].label, "MUTATED", "returns fresh copies");
}

// ── unknown / DLC civ falls back to a neutral pair (never throws) ────────────
{
  const unknown = quarterOptionsFor("CIVILIZATION_NOT_REAL");
  assert.equal(unknown.length, 3, "an unknown origin still offers a full option set");
  assert.deepEqual(unknown.map((o) => o.id), ["a", "b", "ignore"], "neutral fallback keeps the shape");
  assert.ok(unknown[0].benefitYield, "the neutral option A still grants a yield");
  const nullOrigin = quarterOptionsFor(null);
  assert.equal(nullOrigin.length, 3, "a null origin still offers a full option set");
}

// ── quarterOptionFor: id lookup, unknown id degrades to the passive default ──
{
  const a = quarterOptionFor("CIVILIZATION_ROME", "a");
  assert.equal(a.id, "a", "resolves the requested option");
  const fallback = quarterOptionFor("CIVILIZATION_ROME", "not-a-real-option");
  assert.equal(fallback.id, "ignore", "an unknown id degrades to the passive stance");
}

// ── isQuarterOption: membership ──────────────────────────────────────────────
{
  assert.ok(isQuarterOption("a"), "a is a known option");
  assert.ok(isQuarterOption("b"), "b is a known option");
  assert.ok(isQuarterOption("ignore"), "ignore is a known option");
  assert.ok(!isQuarterOption("embrace"), "the legacy id is no longer a known option");
  assert.ok(!isQuarterOption(42), "a non-string id is rejected");
}

// ── label map + note composition (pure helpers) ─────────────────────────────
{
  const opt = __test.toOption({ id: "a", pays: "YIELD_CULTURE", why: "traders enrich the docks" }, "ROME");
  assert.equal(opt.label, __test.ACT_LABEL.YIELD_CULTURE, "the label comes from the yield it pays (LOC fallback = English)");
  assert.ok(opt.note.includes("Traders enrich the docks"), "the note leads with the capitalized 'why'");
  assert.ok(opt.note.endsWith("(+Culture, −Gold)."), "a non-Gold stance's cue names its Gold price: " + opt.note);
  const tax = __test.toOption({ id: "b", pays: "YIELD_GOLD", why: "the wharves pay" }, "ROME");
  assert.ok(tax.note.endsWith("(+Gold)."), "a Gold stance's cue names no price: " + tax.note);
  const envoys = __test.toOption({ id: "b", pays: "YIELD_DIPLOMACY", why: "envoys arrive" }, "ROME");
  assert.equal(envoys.label, "Welcome their envoys", "an Influence stance has its own verb");
}

// ── every origin's stances pay only what a script can grant, and differ ───────
{
  const { QUARTER_BONUSES } = await import("/emigration/ui/emigration-quarter-bonuses.js");
  const PAYABLE = ["YIELD_GOLD", "YIELD_DIPLOMACY", "YIELD_SCIENCE", "YIELD_CULTURE"];
  for (const civ of Object.keys(QUARTER_BONUSES).concat([null])) {
    const [a, b] = quarterOptionsFor(civ);
    for (const o of [a, b]) {
      assert.ok(PAYABLE.includes(o.benefitYield), civ + "/" + o.id + " pays a grantable yield: " + o.benefitYield);
      assert.equal(o.penaltyYield, o.benefitYield === "YIELD_GOLD" ? null : "YIELD_GOLD", civ + "/" + o.id + " costs Gold unless it pays Gold");
    }
    assert.notEqual(a.benefitYield, b.benefitYield, civ + " offers two different payouts");
  }
}

console.log("quarter-registry harness passed");
