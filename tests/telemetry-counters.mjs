// telemetry-counters.mjs
//
// P0.4 balance counters, full set: pass denominator + zero-move passes, voluntary/crisis moves
// (crisis + overall cross-civ split), return moves, outlet attrition (trapped vs fleeing), transit
// deaths (razed vs capped), arrived-into-crisis, refugee pool in/out, and the reason histogram. Plus
// the dumpCounters() console snapshot with derived shares. Runs in a fresh process, so counters start
// at zero and can be asserted absolutely.

import assert from "node:assert/strict";

const { DEATH_REASON } = await import("/emigration/ui/emigration-move-reasons.js");
const {
  recordPassCounters, telemetryCounters, telemetryReasonHits, dumpCounters,
  bumpTransitDeath, bumpArrivedIntoCrisis, bumpRefugeesQueued, bumpRefugeesSettled
} = await import("/emigration/ui/emigration-telemetry.js");

// ── One pass with a mix of relocations, a return, and two outlet deaths ───────
recordPassCounters([
  { cause: "prosperity", phase: "move", crossCiv: false, reasons: ["nearby", "richer"] },
  { cause: "unhappiness", phase: "depart", crossCiv: true, reasons: ["open-borders"] },
  { cause: "war", phase: "depart", crossCiv: true, reasons: ["crisis-escape"] }, // crisis abroad
  { cause: "war", phase: "move", crossCiv: false, reasons: ["own-civ"] }, // crisis own-civ
  { cause: "return", crossCiv: true }, // homecoming
  { cause: "prosperity", phase: "arrive" }, // arrival half → not re-counted
  { cause: "attrition", reasons: [DEATH_REASON.SIEGE, DEATH_REASON.NO_REFUGE] }, // trapped
  { cause: "attrition", reasons: [DEATH_REASON.DISASTER, DEATH_REASON.CRISIS_LOSSES] } // fleeing
]);

let c = telemetryCounters();
assert.equal(c.passes, 1, "one pass recorded");
assert.equal(c.zeroMovePasses, 0, "this pass relocated people, so not a zero-move pass");
assert.equal(c.voluntaryMoves, 2, "two voluntary moves");
assert.equal(c.crisisMoves, 2, "two crisis moves");
assert.equal(c.crisisInternal, 1, "one crisis move within own civ");
assert.equal(c.crisisCrossCiv, 1, "one crisis move abroad");
assert.equal(c.crossCivMoves, 2, "two cross-civ moves overall (one voluntary + one crisis)");
assert.equal(c.returnMoves, 1, "one return move");
assert.equal(c.attritionTrapped, 1, "one trapped death");
assert.equal(c.attritionFleeing, 1, "one lost-while-fleeing death");

// Reason histogram: move reasons folded; death reasons excluded.
const r = telemetryReasonHits();
assert.equal(r.nearby, 1);
assert.equal(r.richer, 1);
assert.equal(r["open-borders"], 1);
assert.equal(r["crisis-escape"], 1);
assert.equal(r["own-civ"], 1);
assert.equal(r["no-refuge"], undefined, "death-reason tags do not pollute the move histogram");

// ── A pass that relocates nobody bumps zeroMovePasses ─────────────────────────
recordPassCounters([{ cause: "attrition", reasons: [DEATH_REASON.NO_REFUGE] }]); // a death, no move
c = telemetryCounters();
assert.equal(c.passes, 2, "second pass recorded");
assert.equal(c.zeroMovePasses, 1, "a pass with only a death counts as zero-move");
assert.equal(c.attritionTrapped, 2, "the death still tallies");

// ── Arrival-side bumps: transit deaths, arrived-into-crisis, pool flow ────────
bumpTransitDeath("razed");
bumpTransitDeath("capped");
bumpTransitDeath("capped");
bumpArrivedIntoCrisis();
bumpRefugeesQueued(5);
bumpRefugeesSettled(2);
bumpRefugeesQueued(0); // ignored
bumpRefugeesSettled(-3); // ignored
c = telemetryCounters();
assert.equal(c.transitRazed, 1);
assert.equal(c.transitCapped, 2);
assert.equal(c.arrivedIntoCrisis, 1);
assert.equal(c.refugeesQueued, 5, "only positive queue amounts count");
assert.equal(c.refugeesSettled, 2, "only positive settle amounts count");

// ── dumpCounters(): derived shares + reason histogram + a copy ────────────────
const d = dumpCounters();
assert.equal(d.derived.totalMoves, 4, "voluntary + crisis moves");
assert.equal(d.derived.volSharePct, 50, "2 of 4 moves are voluntary");
assert.equal(d.derived.crossCivSharePct, 50, "2 of 4 moves are cross-civ");
assert.equal(d.derived.poolBacklog, 3, "queued 5 minus settled 2 still held");
assert.equal(d.derived.zeroMovePassPct, 50, "1 of 2 passes moved nobody");
assert.equal(d.reasons.nearby, 1, "dump carries the reason histogram");
d.counters.passes = 999;
assert.notEqual(telemetryCounters().passes, 999, "dump returns a copy, not the live counters");

// ── Junk input is tolerated and never aborts the batch ────────────────────────
const volBefore = telemetryCounters().voluntaryMoves;
recordPassCounters([null, {}, { cause: "prosperity", phase: "move" }]);
assert.equal(telemetryCounters().voluntaryMoves, volBefore + 1, "the valid element still counts past junk");

console.log("telemetry-counters harness passed");
