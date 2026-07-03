// quarter-registry.mjs
//
// The PURE Cultural Quarter option catalogue (emigration-quarter-registry.js). No engine globals:
// the stances and their yield identities are static data, exercised directly.

import assert from "node:assert/strict";

const { quarterOptions, quarterOption, isQuarterOption, __test } =
  await import("/emigration/ui/emigration-quarter-registry.js");

// ── quarterOptions: the three stances, as fresh copies ──────────────────────
{
  const opts = quarterOptions();
  assert.equal(opts.length, 3, "three stances offered");
  const ids = opts.map((o) => o.id);
  assert.deepEqual(ids, ["embrace", "tax", "ignore"], "stances in the intended order");
  // A returned copy must not mutate the catalogue.
  opts[0].label = "MUTATED";
  assert.notEqual(quarterOptions()[0].label, "MUTATED", "quarterOptions returns fresh copies");
}

// ── each stance names well-formed yield identities ──────────────────────────
{
  const embrace = quarterOption("embrace");
  assert.equal(embrace.benefitYield, "YIELD_CULTURE", "embrace grants culture");
  assert.equal(embrace.penaltyYield, "YIELD_HAPPINESS", "embrace strains happiness");
  const tax = quarterOption("tax");
  assert.equal(tax.benefitYield, "YIELD_GOLD", "tax grants gold");
  assert.equal(tax.penaltyYield, "YIELD_HAPPINESS", "tax strains happiness");
  const ignore = quarterOption("ignore");
  assert.equal(ignore.benefitYield, null, "let-be grants nothing");
  assert.equal(ignore.penaltyYield, null, "let-be costs nothing");
}

// ── quarterOption: unknown id degrades to the passive default ───────────────
{
  const fallback = quarterOption("not-a-real-option");
  assert.equal(fallback.id, __test.DEFAULT_OPTION_ID, "unknown id falls back to the default stance");
  assert.equal(__test.DEFAULT_OPTION_ID, "ignore", "the default stance is the passive one");
}

// ── isQuarterOption: membership ─────────────────────────────────────────────
{
  assert.ok(isQuarterOption("embrace"), "embrace is a known option");
  assert.ok(!isQuarterOption("nope"), "unknown id is rejected");
  assert.ok(!isQuarterOption(42), "non-string id is rejected");
}

console.log("quarter-registry harness passed");
