import assert from "node:assert/strict";

// Per-settlement ethnic-composition ledger (the ethnicity lens / readout data core). No engine
// globals needed — Configuration/Game/Locale are absent, so persistence no-ops and cityName falls
// back to city.name. The internal state is reset between cases via the __test surface.
const { __test } = await import("/emigration/ui/emigration-composition.js");

/** A city signal with a stable centre location. */
function city(x, y, name, owner, population) {
  return { city: { location: { x, y }, name }, owner, population };
}

/** An instantaneous cross-civ move record (both owners present). */
function move(srcOwner, srcName, destOwner, destName, points) {
  return { srcOwner, srcName, destOwner, destName, points, cause: "opportunity" };
}

/** A pure departure (source side only — the lagged-move shape). */
function departure(srcOwner, srcName, destName, points) {
  return { srcOwner, srcName, destName, points, cause: "war" };
}

function shareOf(comp, civ) {
  const e = comp.civs.find((c) => c.civ === civ);
  return e ? e.share : 0;
}

/** Sum the per-origin points in a composition summary. */
function sumPts(comp) {
  return comp.civs.reduce((a, c) => a + c.pts, 0);
}

/**
 * Consistency invariants every composition summary must hold: the per-origin points sum EXACTLY to
 * the reported total (the city/empire population), and the shares sum to 1.
 */
function assertConsistent(comp, expectedTotal) {
  assert.ok(Math.abs(comp.total - expectedTotal) < 1e-6, "total matches reported population");
  assert.ok(Math.abs(sumPts(comp) - comp.total) < 1e-6, "origin points sum to the total");
  const shareSum = comp.civs.reduce((a, c) => a + c.share, 0);
  assert.ok(Math.abs(shareSum - 1) < 1e-6, "shares sum to 1");
}

// The user's scenario: civ 0 founds Rome (pop 10), war empties 6, civ 1 conquers it, then it grows
// to 12. Expect the original 4 to read as civ 0 and the +8 growth as civ 1.
function testFoundWarConquestRegrowth() {
  __test.reset();
  const loc = { x: 5, y: 7 };
  const rome = (owner, pop) => ({ city: { location: loc, name: "Rome" }, owner, population: pop });

  __test.recordCompositionPass([rome(0, 10)], []); // founded, all civ 0
  let comp = __test.compositionForCity({ location: loc });
  assert.equal(comp.total, 10);
  assert.equal(shareOf(comp, 0), 1);

  // War: 6 leave Rome (proportional removal); pop drops to 4.
  __test.recordCompositionPass([rome(0, 4)], [departure(0, "Rome", "Refuge", 6)]);
  comp = __test.compositionForCity({ location: loc });
  assert.equal(comp.total, 4);
  assert.equal(shareOf(comp, 0), 1); // still all civ 0

  // Civ 1 conquers Rome (owner flips, population unchanged, no migration). The pass reports the
  // capture so the conqueror can be credited the absorbed population in the net-migration tally.
  const conquests = __test.recordCompositionPass([rome(1, 4)], []);
  assert.deepEqual(conquests, [{ prevOwner: 0, newOwner: 1, name: "Rome", points: 4 }]);
  comp = __test.compositionForCity({ location: loc });
  assert.equal(comp.owner, 1);
  assert.equal(shareOf(comp, 0), 1); // conquered populace keeps its origin

  // A pass with no ownership change reports no captures.
  assert.deepEqual(__test.recordCompositionPass([rome(1, 4)], []), []);

  // Held a while, grows 4 → 12 (natural growth → current owner civ 1).
  __test.recordCompositionPass([rome(1, 12)], []);
  comp = __test.compositionForCity({ location: loc });
  assert.equal(comp.total, 12);
  assertConsistent(comp, 12); // total + shares reconcile to the real population
  assert.equal(Math.round(shareOf(comp, 0) * 100), 33); // original 4 of 12
  assert.equal(Math.round(shareOf(comp, 1) * 100), 67); // grown 8 of 12
  assert.equal(comp.dominant.civ, 1);
}

// An immigrant arrival adds the migrant's ORIGIN civ to the destination mix.
function testImmigrationAddsOriginCiv() {
  __test.reset();
  __test.recordCompositionPass(
    [city(1, 1, "Athens", 0, 10), city(2, 2, "Memphis", 2, 20)],
    []
  ); // seed both (Athens 10 = all civ 0)
  // 3 people migrate Memphis → Athens; Athens grows 10 → 13 by that arrival.
  __test.recordCompositionPass(
    [city(1, 1, "Athens", 0, 13), city(2, 2, "Memphis", 2, 17)],
    [move(2, "Memphis", 0, "Athens", 3)]
  );
  const comp = __test.compositionForCity({ location: { x: 1, y: 1 } });
  assert.equal(comp.total, 13);
  assert.equal(shareOf(comp, 2) > 0, true, "civ 2 minority present");
  assert.equal(Math.round(shareOf(comp, 2) * 100), 23); // 3 of 13
  assert.equal(comp.dominant.civ, 0);
}

// Emigration removes proportionally across a mixed population.
function testProportionalEmigration() {
  __test.reset();
  // Seed a mixed city by founding (civ 0), immigration (civ 2), then emigrate proportionally.
  __test.recordCompositionPass([city(3, 3, "Tyre", 0, 6)], []);
  __test.recordCompositionPass(
    [city(3, 3, "Tyre", 0, 10), city(9, 9, "Carthage", 2, 5)],
    [move(2, "Carthage", 0, "Tyre", 4)]
  );
  let comp = __test.compositionForCity({ location: { x: 3, y: 3 } });
  assert.equal(comp.total, 10); // 6 civ0 + 4 civ2
  // Now 5 emigrate (proportional): expect ~3 civ0, ~2 civ2 remain.
  __test.recordCompositionPass([city(3, 3, "Tyre", 0, 5)], [departure(0, "Tyre", "Away", 5)]);
  comp = __test.compositionForCity({ location: { x: 3, y: 3 } });
  assert.equal(comp.total, 5);
  assert.equal(Math.round(shareOf(comp, 0) * 100), 60); // 6/10 preserved
  assert.equal(Math.round(shareOf(comp, 2) * 100), 40); // 4/10 preserved
}

// Untracked settlement → null (no crash).
function testUntrackedIsNull() {
  __test.reset();
  assert.equal(__test.compositionForCity({ location: { x: 0, y: 0 } }), null);
  assert.equal(__test.compositionForCity({}), null);
  assert.equal(__test.compositionForOwner(0), null);
}

// A whole-population departure leaves no phantom dust origins, and the total tracks the population.
function testNoPhantomDust() {
  __test.reset();
  __test.recordCompositionPass([city(4, 4, "Sparta", 0, 3)], []);
  // 2 of 3 leave: total 1, still 100% civ 0 (no float-crumb minorities).
  __test.recordCompositionPass([city(4, 4, "Sparta", 0, 1)], [departure(0, "Sparta", "Away", 2)]);
  const comp = __test.compositionForCity({ location: { x: 4, y: 4 } });
  assertConsistent(comp, 1);
  assert.equal(comp.civs.length, 1);
  assert.equal(comp.civs[0].civ, 0);
}

// The per-civ (empire-wide) aggregate is consistent with the sum of that civ's city populations.
function testOwnerAggregateConsistency() {
  __test.reset();
  // Civ 0 holds two cities; one is mixed (took an immigrant from civ 2).
  __test.recordCompositionPass(
    [city(1, 1, "A", 0, 10), city(2, 2, "B", 0, 6), city(8, 8, "Z", 2, 9)],
    []
  );
  __test.recordCompositionPass(
    [city(1, 1, "A", 0, 14), city(2, 2, "B", 0, 6), city(8, 8, "Z", 2, 5)],
    [move(2, "Z", 0, "A", 4)] // 4 civ-2 people settle in A; A grows 10 → 14
  );
  const a = __test.compositionForCity({ location: { x: 1, y: 1 } });
  const b = __test.compositionForCity({ location: { x: 2, y: 2 } });
  assertConsistent(a, 14);
  assertConsistent(b, 6);
  // Empire aggregate for civ 0 = A (14) + B (6) = 20, mix = 16 civ-0 + 4 civ-2.
  const emp = __test.compositionForOwner(0);
  assertConsistent(emp, 20);
  assert.equal(emp.total, a.total + b.total); // matches the sum of its cities' populations
  assert.equal(Math.round(shareOf(emp, 2) * 100), 20); // 4 of 20
  assert.equal(Math.round(shareOf(emp, 0) * 100), 80);
}

testFoundWarConquestRegrowth();
testImmigrationAddsOriginCiv();
testProportionalEmigration();
testUntrackedIsNull();
testNoPhantomDust();
testOwnerAggregateConsistency();

console.log("composition harness passed");
