import assert from "node:assert/strict";

const { isRefugeeCause, causeLabel, causePermanence, causeHint } = await import(
  "/emigration/ui/emigration-causes.js"
);

function testRefugeeCausesAreForcedDisplacementOnly() {
  for (const c of ["war", "disaster", "conquest"]) {
    assert.equal(isRefugeeCause(c), true, `${c} should be a refugee cause`);
  }
  // Economic migration + the outlet + unknowns are NOT refugees.
  for (const c of ["unhappiness", "prosperity", "attrition", "crisis", "other", undefined, ""]) {
    assert.equal(isRefugeeCause(c), false, `${c} should NOT be a refugee cause`);
  }
}

function testEveryEmittedCauseHasALabel() {
  // Each emitted/headline cause maps to a non-"Other" label (so nothing renders as the fallback).
  const named = {
    unhappiness: "Unhappiness",
    prosperity: "Attraction",
    war: "War",
    disaster: "Disaster",
    conquest: "Conquest",
    attrition: "Attrition",
    crisis: "Crisis"
  };
  for (const [cause, label] of Object.entries(named)) {
    assert.equal(causeLabel(cause), label);
  }
  // Unknown / missing falls back to "Other".
  assert.equal(causeLabel("bogus"), "Other");
  assert.equal(causeLabel(undefined), "Other");
}

function testPermanenceClassifier() {
  assert.equal(causePermanence("war"), "temporary");
  assert.equal(causePermanence("disaster"), "temporary");
  assert.equal(causePermanence("conquest"), "temporary");
  assert.equal(causePermanence("unhappiness"), "persistent");
  assert.equal(causePermanence("prosperity"), "persistent");
  assert.equal(causePermanence("attrition"), "permanent");
  // Unknown defaults to persistent (the safe "until you fix it" reading).
  assert.equal(causePermanence("bogus"), "persistent");
}

function testHintsExistForEmittedCauses() {
  for (const c of ["unhappiness", "prosperity", "war", "disaster", "conquest", "attrition"]) {
    assert.ok(causeHint(c).length > 0, `${c} should have an action hint`);
  }
  assert.equal(causeHint("crisis"), ""); // headline-only pseudo-cause has no per-city hint
  assert.equal(causeHint(undefined), "");
}

testRefugeeCausesAreForcedDisplacementOnly();
testEveryEmittedCauseHasALabel();
testPermanenceClassifier();
testHintsExistForEmittedCauses();

console.log("causes harness passed");
