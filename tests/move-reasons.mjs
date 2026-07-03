// move-reasons.mjs
//
// P0.1 per-move "why here" reason tags. Covers three layers: the display helpers
// (emigration-move-reasons.js), the truthful tag derivation (emigration-pull.js deriveMoveReasons,
// which must mirror the terms the scorer uses), and that the migration records actually carry the
// reasons through to the notification/metrics layer.

import assert from "node:assert/strict";

// Off-engine hex distance so the "nearby" term is computable (mirrors the geography read).
globalThis.GameplayMap = { getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by) };

const { REASON, DEATH_REASON, reasonLabel, reasonsPhrase } = await import("/emigration/ui/emigration-move-reasons.js");
const { deriveMoveReasons, deriveDeathReasons, crisisTypeReasons } = await import("/emigration/ui/emigration-pull.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { moveRecord, departRecord, arriveRecord } = await import("/emigration/ui/emigration-migration-records.js");

// Deterministic tuning for the derivation (independent of preset drift).
Object.assign(CONFIG, {
  distanceFactor: 0.6, violenceFleeThreshold: 2, disasterFleeThreshold: 2, unhappyCauseThreshold: 0,
  asylumPushWeight: 3, ownCivRefugeeBonus: 1, crisisEscapeBonus: 14, aggressorPenalty: 12,
  bordersEnabled: false // keeps openness neutral so the diplomacy-driven tags stay off in this harness
});

const city = (x) => ({ location: { x, y: 0 } });
const sig = (o) => ({ key: o.key, owner: o.owner, pros: o.pros, population: o.population || 5,
  violence: o.violence || 0, disaster: o.disaster || 0, happiness: o.happiness || 5, city: city(o.x || 0) });

// ── Display helpers ─────────────────────────────────────────────────────────
assert.equal(reasonLabel(REASON.NEARBY), "nearby", "known tag maps to its phrase");
assert.equal(reasonLabel("mystery-tag"), "mystery-tag", "unknown tag passes through");
assert.equal(reasonsPhrase(["nearby", "open-borders"]), "nearby, open borders", "joins localized phrases");
assert.equal(reasonsPhrase(["nearby", "nearby", "richer"]), "nearby, more prosperous", "dedupes");
assert.equal(reasonsPhrase(["a", "b", "c", "d"], 2).split(", ").length, 2, "caps to max");
assert.equal(reasonsPhrase([]), "", "empty for no reasons");
assert.equal(reasonsPhrase(undefined), "", "empty for missing reasons");

// ── Derivation: voluntary cross-civ move to a richer, nearby city ────────────
{
  const src = sig({ key: "1:1", owner: 1, pros: 10, x: 0, happiness: 5 });
  const dest = sig({ key: "2:1", owner: 2, pros: 20, x: 2 });
  const r = deriveMoveReasons(src, dest, null, null, null);
  assert.ok(r.includes(REASON.RICHER), "richer destination is a reason");
  assert.ok(r.includes(REASON.NEARBY), "a short hop is a reason");
  assert.ok(!r.includes(REASON.CRISIS_ESCAPE), "a peaceful move is not a crisis escape");
  assert.ok(r.length <= 3, "at most three tags");
}

// ── Derivation: war refugee fleeing INTERNALLY prefers safer own lands ───────
{
  const src = sig({ key: "1:1", owner: 1, pros: 5, x: 0, violence: 4 });
  const dest = sig({ key: "1:2", owner: 1, pros: 5, x: 2 }); // same civ, no prosperity gap
  const r = deriveMoveReasons(src, dest, null, null, new Set([9]));
  assert.ok(r.includes(REASON.OWN_CIV), "an internal refugee move reads as safer interior");
}

// ── Derivation: war refugee crossing to a NEUTRAL civ escapes + avoids the aggressor ──
{
  const src = sig({ key: "1:1", owner: 1, pros: 5, x: 0, violence: 4 });
  const dest = sig({ key: "3:1", owner: 3, pros: 5, x: 3 }); // neutral third party
  const aggressors = new Set([2]); // civ 2 attacked us; dest is civ 3, not an aggressor
  const r = deriveMoveReasons(src, dest, null, null, aggressors);
  assert.ok(r.includes(REASON.CRISIS_ESCAPE), "a cross-border refugee move reads as escaping the crisis");
  assert.ok(r.includes(REASON.AGGRESSOR_AVOIDED), "choosing a neutral over the aggressor is a reason");
}

// ── Derivation: directional flight is surfaced when a flee vector is present ──
{
  const src = sig({ key: "1:1", owner: 1, pros: 5, x: 0, violence: 4 });
  const dest = sig({ key: "1:2", owner: 1, pros: 5, x: 4 }); // to the +x side
  const flee = { x: 1, y: 0 }; // fleeing toward +x (away from an enemy at -x)
  const r = deriveMoveReasons(src, dest, flee, null, new Set());
  assert.ok(r.includes(REASON.SAFER_DIR), "a move along the flee vector reads as away from the fighting");
}

// ── Death reasons (P0.2): crisis type + trapped/fleeing qualifier ─────────────
{
  const besieged = sig({ key: "1:1", owner: 1, pros: 2, x: 0, violence: 5 });
  besieged.siege = true;
  const trapped = deriveDeathReasons(besieged, false);
  assert.ok(trapped.includes(DEATH_REASON.SIEGE), "a besieged death names the siege");
  assert.ok(trapped.includes(DEATH_REASON.NO_REFUGE), "a trapped death names the lack of refuge");

  const starving = sig({ key: "1:2", owner: 1, pros: 2, x: 0 });
  starving.starving = true;
  starving.disaster = 5;
  const fleeing = deriveDeathReasons(starving, true);
  assert.ok(fleeing.includes(DEATH_REASON.DISASTER), "a disaster death names the disaster");
  assert.ok(fleeing.includes(DEATH_REASON.FAMINE), "a famine death names the famine");
  assert.ok(fleeing.includes(DEATH_REASON.CRISIS_LOSSES), "losses-while-fleeing when a refuge existed");
  assert.ok(fleeing.length <= 3, "death reasons cap at three");

  const calm = sig({ key: "1:3", owner: 1, pros: 5, x: 0 });
  assert.deepEqual(crisisTypeReasons(calm), [], "a content city has no crisis-type reasons");
}

// ── Records carry the reasons through to the notification/metrics layer ───────
{
  const src = { owner: 1, city: { name: "Rome" } };
  const dest = { owner: 2, city: { name: "Thebes" } };
  const reasons = ["nearby", "open-borders"];
  const mv = moveRecord(src, dest, 3000, "prosperity", { destPaidCost: 1, eventKey: "", reasons });
  assert.deepEqual(mv.reasons, reasons, "moveRecord carries reasons");
  const dp = departRecord(src, dest, 3000, "war", "", reasons);
  assert.deepEqual(dp.reasons, reasons, "departRecord carries reasons");
  const ar = arriveRecord({ srcName: "Rome", destName: "Thebes", destOwner: 2, srcOwner: 1,
    crossCiv: true, people: 3000, cause: "war", reasons }, true, 1);
  assert.deepEqual(ar.reasons, reasons, "arriveRecord forwards the departure-time reasons");
  const mvNone = moveRecord(src, dest, 3000, "prosperity", { destPaidCost: 1 });
  assert.deepEqual(mvNone.reasons, [], "a record with no reasons defaults to an empty list");
}

console.log("move-reasons harness passed");
