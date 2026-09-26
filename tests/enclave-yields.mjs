// enclave-yields.mjs
//
// What an enclave is worth to its host per turn (emigration-enclave-yields.js), as the lifecycle
// notifications state it; the rule that an "Enclave of X" entry needs a REAL enclave and only fires on
// growth (emigration-diaspora.js); and the two-step lifecycle itself (emigration-quarter.js): the enclave
// is CREATED when its community is established, and RECOGNIZED (stance + stance yields) after the dwell.
// Only GameInfo is stubbed, for the placed tile's native yields.

import assert from "node:assert/strict";

const NATIVE = {
  IMPROVEMENT_EMIG_ENCLAVE_ROME_A: [{ YieldType: "YIELD_CULTURE", YieldChange: 3 }],
  IMPROVEMENT_VILLAGE: []
};
globalThis.GameInfo = {
  Constructible_YieldChanges: {
    filter: (f) => Object.entries(NATIVE)
      .flatMap(([type, rows]) => rows.map((r) => ({ ConstructibleType: type, ...r })))
      .filter(f)
  }
};

const { enclaveYields, stanceYields, yieldsText, yieldsButtonText, withYields } = await import("/emigration/ui/emigration-enclave-yields.js");
const { chronicle, chronicled, clearChronicle } = await import("/emigration/ui/emigration-chronicle.js");
const { __test: dia } = await import("/emigration/ui/emigration-diaspora.js");

// ── An UNBUILT enclave is worth its stance grant ────────────────────────────
{
  const rec = { applied: { benefitYield: "YIELD_CULTURE", benefitAmount: 2, penaltyYield: "YIELD_HAPPINESS", penaltyAmount: 1 } };
  const y = enclaveYields(rec);
  assert.equal(y.YIELD_CULTURE, 2, "the stance benefit is the enclave's gift while unbuilt");
  assert.equal(y.YIELD_HAPPINESS, -1, "the stance drawback is carried as a negative");
  assert.equal(yieldsText(y), "+2 Culture, −1 Happiness", "signed, sorted, named");
  assert.equal(yieldsText(y, -1), "−2 Culture, +1 Happiness", "stated as a loss, every sign flips");
}

// ── An ESTABLISHED enclave is worth its TILE; RECOGNITION adds the stance on top ──
{
  const none = { benefitYield: null, benefitAmount: 0, penaltyYield: null, penaltyAmount: 0 };
  const placed = { plot: 10, type: "IMPROVEMENT_EMIG_ENCLAVE_ROME_A" };
  const established = { applied: none, placed, recognized: false };
  assert.deepEqual(enclaveYields(established), { YIELD_CULTURE: 3 }, "established: the tile's native yield alone");
  assert.deepEqual(stanceYields(established), {}, "an established enclave has no stance yet");
  const recognized = {
    applied: { benefitYield: "YIELD_CULTURE", benefitAmount: 2, penaltyYield: "YIELD_HAPPINESS", penaltyAmount: 1 },
    placed, recognized: true
  };
  assert.deepEqual(stanceYields(recognized), { YIELD_CULTURE: 2, YIELD_HAPPINESS: -1 }, "recognition adds the stance");
  assert.deepEqual(enclaveYields(recognized), { YIELD_CULTURE: 5, YIELD_HAPPINESS: -1 }, "tile + stance is the whole worth");
}

// ── Defensive: a malformed or empty record states nothing ───────────────────
{
  assert.deepEqual(enclaveYields(null), {}, "no record, no yields");
  assert.deepEqual(enclaveYields({ applied: { benefitYield: null, penaltyYield: null } }), {}, "a passive stance is worth nothing");
  assert.equal(yieldsText({}), "", "an empty map has no text");
  assert.equal(yieldsButtonText({ YIELD_GOLD: -1410, YIELD_SCIENCE: 375 }), "[icon:YIELD_SCIENCE] +375, [icon:YIELD_GOLD] -1410",
    "a button figure: icon then amount (the refugee / call-home shape), the gain first although Gold sorts first");
  assert.equal(yieldsButtonText({}), "", "an empty map has no button figure either");
  assert.equal(withYields("The enclave fades.", ""), "The enclave fades.", "no figure, no parenthetical");
  assert.equal(withYields("The enclave fades.", "−2 Culture"), "The enclave fades. (−2 Culture)", "the figure is appended");
}

// ── A yield that nets to zero is dropped, not printed as "+0" ───────────────
{
  const y = enclaveYields({ applied: { benefitYield: "YIELD_CULTURE", benefitAmount: 2, penaltyYield: "YIELD_CULTURE", penaltyAmount: 2 } });
  assert.deepEqual(y, {}, "a benefit cancelled by its own drawback is no yield at all");
}

// ── Share steps only fire UPWARD (the Mérida repeat, watched turn 72-80) ────
{
  clearChronicle();
  const rec = { civ: 1, turn: 70 };
  assert.equal(dia.tierAlreadyReached("Mérida", rec, 6), false, "nothing recorded yet");
  chronicle({ kind: "founding", title: "t", body: "b", dedupeKey: dia.shareStepKey("Mérida", rec, 6) });
  assert.equal(chronicled(dia.shareStepKey("Mérida", rec, 6)), true, "the peak step is recorded");
  // The community then SHRANK: 99% (step 6) → 66% (step 4) → 47% (step 3).
  assert.equal(dia.tierAlreadyReached("Mérida", rec, 4), true, "a smaller share does not re-announce the enclave");
  assert.equal(dia.tierAlreadyReached("Mérida", rec, 3), true, "nor does a smaller one still");
  assert.equal(dia.tierAlreadyReached("Mérida", rec, 7), false, "a share beyond the peak is new");
  assert.equal(dia.tierAlreadyReached("Mérida", { civ: 2, turn: 70 }, 3), false, "another origin is unaffected");
  // An enclave that faded and FORMED AGAIN (a later formation turn) is a new series: it is announced again.
  assert.equal(dia.tierAlreadyReached("Mérida", { civ: 1, turn: 120 }, 3), false, "a re-formed enclave announces itself");
  clearChronicle();
}

// ── The "Enclave of X" story needs a REAL enclave of that origin on the city ──
{
  const { putQuarter, dropQuarter } = await import("/emigration/ui/emigration-quarter-state.js");
  const merida = { location: { x: 38, y: 50 } };
  assert.equal(dia.enclaveOf(merida, 1), null, "no record: the story may not claim an enclave");
  putQuarter("38,50", { civ: 1, owner: 2, optionId: "ignore", turn: 80, recognized: false,
    applied: { benefitYield: null, benefitAmount: 0, penaltyYield: null, penaltyAmount: 0 },
    contested: false, contestedTurn: -999, placed: null });
  assert.equal(dia.enclaveOf(merida, 1).turn, 80, "an ESTABLISHED enclave of that origin vouches for the story");
  assert.equal(dia.enclaveOf(merida, 3), null, "another origin's enclave does not vouch for this one");
  assert.equal(dia.enclaveOf({ location: {} }, 1), null, "an unreadable location claims nothing");
  dropQuarter("38,50");
  assert.equal(dia.enclaveOf(merida, 1), null, "once the enclave is gone the story stops");
}

// ── Lifecycle: ESTABLISHED creates the enclave; RECOGNIZED adds the stance to the SAME record ──
{
  const state = await import("/emigration/ui/emigration-quarter-state.js");
  const { __test: q } = await import("/emigration/ui/emigration-quarter.js");
  globalThis.Game = { age: 1, turn: 40 };
  const option = { id: "a", label: "Embrace", benefitYield: "YIELD_CULTURE", penaltyYield: "YIELD_HAPPINESS" };
  const quarter = { civ: 4, owner: 9, name: "Ostia", where: "by the harbor" };

  // A legacy record (saved before the flag existed) was created at recognition: it reads as recognized.
  state.putQuarter("1,1", { civ: 4, owner: 9, optionId: "a", turn: 3, applied: {}, contested: false, contestedTurn: -999 });
  assert.equal(state.quarterAt("1,1").recognized, true, "an absent flag reads as recognized");
  state.dropQuarter("1,1");

  // Established: exists, tile standing, no stance.
  const placed = { plot: 10, type: "IMPROVEMENT_EMIG_ENCLAVE_ROME_A", enclave: "IMPROVEMENT_EMIG_ENCLAVE_ROME_A", stood: true };
  state.putQuarter("7,7", { civ: 4, originCiv: "CIVILIZATION_ROME", owner: 9, optionId: "ignore", turn: 40, recognized: false,
    applied: { benefitYield: null, benefitAmount: 0, penaltyYield: null, penaltyAmount: 0 },
    contested: false, contestedTurn: -999, placed, fadeSince: null });
  const est = state.quarterAt("7,7");
  assert.equal(est.recognized, false, "an established enclave is not yet recognized");

  // Recognition 8 turns on keeps the formation turn and the standing tile, and adds the stance.
  const up = q.recordForChoice(est, option, quarter, { ct: "CIVILIZATION_ROME", me: 9, turn: 48 });
  assert.equal(up.formed, false, "recognizing an established enclave does not create a second one");
  assert.equal(up.rec.turn, 40, "the enclave keeps its formation turn");
  assert.equal(up.rec.recognized, true, "it is now recognized");
  assert.equal(up.rec.placed.plot, 10, "its tile is the one that already stands (no second placement)");
  assert.equal(up.rec.applied.benefitYield, "YIELD_CULTURE", "the chosen stance is recorded");

  // A different origin on the tile is a change of hands: a NEW, recognized enclave.
  const hands = q.recordForChoice(est, option, { ...quarter, civ: 5 }, { ct: "CIVILIZATION_ROME", me: 9, turn: 48 });
  assert.equal(hands.formed, true, "another origin forms its own enclave");
  assert.equal(hands.rec.turn, 48, "with its own formation turn");
  state.dropQuarter("7,7");
}

console.log("enclave-yields OK");
