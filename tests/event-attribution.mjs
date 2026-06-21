import assert from "node:assert/strict";

// Specific-event attribution: the engine resolves an eventKey (war/disaster/crisis/famine) for each
// move/death, and the view layer turns a key back into a display name + groups it under a cause.
const A = await import("/emigration/ui/emigration-event-attribution.js");
const { eventDisplayName } = await import("/emigration/ui/emigration-naming.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

// ── crisisCategory: which mechanism each age crisis manifests through ──
function testCrisisCategory() {
  assert.equal(A.crisisCategory("ANTIQUITY_CRISIS_INVASION"), "war");
  assert.equal(A.crisisCategory("MODERN_CRISIS_WORLD_WAR"), "war");
  assert.equal(A.crisisCategory("ANTIQUITY_CRISIS_PLAGUE"), "disaster");
  assert.equal(A.crisisCategory("ANTIQUITY_CRISIS_LOYALTY"), "unhappiness");
  assert.equal(A.crisisCategory("EXPLORATION_CRISIS_REVOLUTION"), "unhappiness");
  assert.equal(A.crisisCategory("SOMETHING_UNRELATED"), null);
}

// ── eventGroupCause: which cause a key drills down under ──
function testEventGroupCause() {
  assert.equal(A.eventGroupCause("war:1:2"), "war");
  assert.equal(A.eventGroupCause("disaster:RANDOM_EVENT_VOLCANO"), "disaster");
  assert.equal(A.eventGroupCause("famine"), "disaster");
  assert.equal(A.eventGroupCause("crisis:ANTIQUITY_CRISIS_INVASION"), "war");
  assert.equal(A.eventGroupCause("crisis:ANTIQUITY_CRISIS_PLAGUE"), "disaster");
  assert.equal(A.eventGroupCause("crisis:EXPLORATION_CRISIS_REVOLUTION"), "unhappiness");
  assert.equal(A.eventGroupCause(""), "");
}

// ── crisis precedence: an active crisis whose category matches the move's cause names the event ──
function testCrisisOverride() {
  A.__test.setCrisis({ type: "ANTIQUITY_CRISIS_PLAGUE", category: "disaster" });
  const src = { owner: 0, disaster: 999, violence: 0 };
  assert.equal(A.eventKeyForMove(src, "disaster"), "crisis:ANTIQUITY_CRISIS_PLAGUE",
    "a disaster move during a Plague crisis is attributed to the crisis");
  assert.equal(A.eventKeyForMove(src, "war"), "",
    "a war move during a Plague (disaster) crisis is NOT attributed to it (category mismatch)");
  assert.equal(A.eventKeyForMove(src, "prosperity"), "",
    "prosperity moves never carry a crisis event");
  // A disaster DEATH during the same crisis is attributed to it too.
  const dyingSrc = { owner: 0, disaster: CONFIG.disasterFleeThreshold + 1 };
  assert.equal(A.eventKeyForDeath(dyingSrc), "crisis:ANTIQUITY_CRISIS_PLAGUE");
  A.__test.setCrisis(null);
}

// ── famine: a starvation death names itself even with no engine event / no crisis ──
function testFamineDeath() {
  A.__test.setCrisis(null);
  assert.equal(A.eventKeyForDeath({ owner: 0, disaster: 0, violence: 0, starving: true }), "famine");
  assert.equal(A.eventKeyForDeath({ owner: 0, disaster: 0, violence: 0, starving: false }), "",
    "an unattributable death carries no event key");
}

// ── eventDisplayName: a key resolves to a readable name (off-engine fallbacks) ──
function testDisplayNames() {
  assert.equal(eventDisplayName(""), null);
  assert.equal(eventDisplayName("famine"), "Famine");
  assert.equal(eventDisplayName("crisis:ANTIQUITY_CRISIS_PLAGUE"), "Antiquity Plague Crisis");
  assert.ok(/War$/.test(eventDisplayName("war:1:2")), "a war key reads as a '…–… War'");
}

testCrisisCategory();
testEventGroupCause();
testCrisisOverride();
testFamineDeath();
testDisplayNames();
console.log("event-attribution harness passed");
