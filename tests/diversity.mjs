import assert from "node:assert/strict";

// The composition-diversity metrics + ranking (roadmap Features S/T) and their view rows. All pure:
// the metrics take a composition literal, and the ranking takes its per-owner lookups by injection,
// so no engine globals are needed. The live diverseCityRanking() reads the composition ledger, which
// off-engine is simply empty (persistence no-ops without Configuration).
const { diversityScore, cosmopolitanism, rankDiversity, diverseCityRanking, COSMO_TIERS } =
  await import("/emigration/ui/emigration-diversity.js");
const { diverseCityRows, diversitySections } = await import("/emigration/ui/emigration-detail-views.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

/**
 * A composition literal in compositionForCity's shape. `shares` maps origin civ id → share; the
 * dominant is derived, and pts are scaled off `total` so the entries look like the real thing.
 */
function comp(owner, shares, total = 100) {
  const civs = Object.keys(shares)
    .map((c) => ({ civ: Number(c), pts: shares[c] * total, share: shares[c] }))
    .sort((a, b) => b.pts - a.pts);
  return { total, owner, civs, dominant: civs.length ? { civ: civs[0].civ, share: civs[0].share } : null };
}

/** A ledger entry as allCityCompositions() yields it. */
function entry(key, name, owner, shares, total = 100) {
  return { key, name, owner, comp: comp(owner, shares, total) };
}

// ── Feature S: the metric ───────────────────────────────────────────────────

function testEntropyZeroForSingleOrigin() {
  const s = diversityScore(comp(1, { 1: 1 }));
  assert.equal(s.index, 0); // one origin at 100% → no diversity at all
  assert.equal(s.originsAbove5, 1);
  assert.equal(s.noMajority, false); // a 100% dominant is emphatically a majority
  assert.equal(s.largestNonOwner, 0); // every point is the owner's own origin
}

function testEntropyMaximalForEvenSplit() {
  // For a FIXED origin count, an even split maximizes entropy: perturbing it away must lower it.
  const even = diversityScore(comp(1, { 1: 0.25, 2: 0.25, 3: 0.25, 4: 0.25 })).index;
  const skewed = diversityScore(comp(1, { 1: 0.7, 2: 0.1, 3: 0.1, 4: 0.1 })).index;
  assert.ok(even > skewed, `even ${even} should beat skewed ${skewed}`);
  assert.ok(Math.abs(even - Math.log(4)) < 1e-9); // an even n-way split is exactly ln(n) nats
}

function testEntropyRisesWithMoreCommunities() {
  // Deliberately UNNORMALIZED: a 5-way even city must outrank a 2-way even one, which a per-city
  // normalized entropy would tie at 1.0. This is what makes the ranking prefer richer mixes.
  const two = diversityScore(comp(1, { 1: 0.5, 2: 0.5 })).index;
  const five = diversityScore(comp(1, { 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 })).index;
  assert.ok(five > two, `5-way ${five} should beat 2-way ${two}`);
}

function testNoMajorityBoundaryAtFiftyPercent() {
  // Exactly 50% is still a majority (not "no majority"); a hair under is not.
  assert.equal(diversityScore(comp(1, { 1: 0.5, 2: 0.3, 3: 0.2 })).noMajority, false);
  assert.equal(diversityScore(comp(1, { 1: 0.49, 2: 0.31, 3: 0.2 })).noMajority, true);
}

function testCountsOnlyCommunitiesAboveFivePercent() {
  const s = diversityScore(comp(1, { 1: 0.6, 2: 0.3, 3: 0.05, 4: 0.04, 5: 0.01 }));
  assert.equal(s.originsAbove5, 3); // 0.05 counts (inclusive); 0.04 and 0.01 are trace
}

function testLargestNonOwnerIgnoresTheHostOrigin() {
  const s = diversityScore(comp(1, { 1: 0.6, 2: 0.3, 3: 0.1 }));
  assert.equal(s.largestNonOwner, 0.3); // the owner's own 0.6 doesn't count as a diaspora
}

function testEmptyCompositionScoresZeroAndNeverThrows() {
  for (const bad of [null, undefined, {}, { civs: [] }, { civs: null }]) {
    const s = diversityScore(/** @type {*} */ (bad));
    assert.equal(s.index, 0);
    assert.equal(s.originsAbove5, 0);
    assert.equal(s.noMajority, false);
  }
}

// ── Feature T: the cosmopolitanism score ────────────────────────────────────

function testTierBoundariesAreMonotonic() {
  for (let i = 1; i < COSMO_TIERS.length; i++) {
    assert.ok(COSMO_TIERS[i].min > COSMO_TIERS[i - 1].min, "tier mins must ascend");
  }
}

function testHomogeneousCityLandsLowestTier() {
  const { score, tierKey } = cosmopolitanism(comp(1, { 1: 1 }), { openness: 0.4, inboundNorm: 0 });
  assert.equal(tierKey, "homogeneous");
  assert.ok(score < 0.2);
}

function testDiverseOpenInboundCityLandsTopTier() {
  const c = comp(1, { 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 }); // max diversity at the reference
  const { score, tierKey } = cosmopolitanism(c, { openness: 1.5, inboundNorm: 1 });
  assert.equal(tierKey, "world");
  assert.ok(score >= 0.8);
}

function testScoreRisesWithOpennessAndInbound() {
  const c = comp(1, { 1: 0.5, 2: 0.5 });
  const base = cosmopolitanism(c, { openness: 1, inboundNorm: 0 }).score;
  assert.ok(cosmopolitanism(c, { openness: 1.5, inboundNorm: 0 }).score > base);
  assert.ok(cosmopolitanism(c, { openness: 1, inboundNorm: 1 }).score > base);
}

function testMissingContextDegradesToNeutralNotZero() {
  // No borders/stats lookups available → neutral openness, zero inbound, score driven by diversity
  // alone. Must not throw and must not silently read as "homogeneous" for a genuinely mixed city.
  const c = comp(1, { 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 });
  const a = cosmopolitanism(c, undefined);
  const b = cosmopolitanism(c, { openness: NaN, inboundNorm: NaN });
  assert.deepEqual(a, b);
  assert.ok(a.score > 0.2);
  assert.ok(a.score <= 1);
}

// ── The ranking ─────────────────────────────────────────────────────────────

function testRankingSortsByDiversityAndCaps() {
  const rows = rankDiversity([
    entry("a", "Rome", 1, { 1: 1 }), // homogeneous → last
    entry("b", "Carthage", 2, { 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 }), // richest → first
    entry("c", "Athens", 3, { 3: 0.6, 1: 0.4 })
  ], {}, 2);
  assert.equal(rows.length, 2); // capped
  assert.equal(rows[0].name, "Carthage");
  assert.equal(rows[1].name, "Athens");
}

function testZeroLimitMeansUncapped() {
  // How gather asks for EVERY settlement: the view needs the full set for its "All settlements" list
  // and applies the CONFIG row cap itself to the podium. A 0 that read as "no rows" would empty it.
  const entries = [
    entry("a", "Rome", 1, { 1: 0.5, 2: 0.5 }),
    entry("b", "Athens", 1, { 1: 0.6, 2: 0.4 }),
    entry("c", "Sparta", 1, { 1: 1 })
  ];
  assert.equal(rankDiversity(entries, {}, 0).length, 3);
  assert.equal(rankDiversity(entries, {}).length, 3); // omitted → also uncapped
}

function testRankingIsStableForTiedCities() {
  // Identical mixes must not reorder between passes (the ledger's key order isn't guaranteed).
  const mk = () => [entry("a", "Zeta", 1, { 1: 0.5, 2: 0.5 }), entry("b", "Alpha", 2, { 2: 0.5, 3: 0.5 })];
  const first = rankDiversity(mk(), {}).map((r) => r.name);
  const second = rankDiversity(mk().reverse(), {}).map((r) => r.name);
  assert.deepEqual(first, ["Alpha", "Zeta"]); // tie broken by name
  assert.deepEqual(first, second);
}

function testRankingCarriesDominantAndRunnerUp() {
  const [r] = rankDiversity([entry("a", "Alexandria", 1, { 2: 0.45, 1: 0.35, 3: 0.2 })], {});
  assert.equal(r.dominantCiv, 2);
  assert.ok(Math.abs(r.dominantShare - 0.45) < 1e-9);
  assert.ok(Math.abs(r.runnerUpShare - 0.35) < 1e-9); // the view needs the gap to name a plurality
}

function testRankingCarriesRawOriginSharesForTheBar() {
  // The view draws a slice per origin, so the row must hand it the unresolved breakdown (civ ids —
  // gather resolves names/colours/masking); dropping it would leave the bar with nothing to draw.
  const [r] = rankDiversity([entry("a", "Alexandria", 1, { 2: 0.45, 1: 0.35, 3: 0.2 })], {});
  assert.equal(r.civs.length, 3);
  assert.equal(r.civs[0].civ, 2); // share-sorted, largest first
  assert.ok(Math.abs(r.civs[0].share - 0.45) < 1e-9);
  assert.equal(r.total, 100); // and the population the bar's width scales against
}

function testRankingDropsSpoilerMaskedOwnersBeforeTheCap() {
  // The hidden civ's city is the most diverse; masking it must not spend one of the two rows.
  const rows = rankDiversity([
    entry("a", "Secret", 9, { 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 }),
    entry("b", "Rome", 1, { 1: 0.5, 2: 0.5 }),
    entry("c", "Athens", 1, { 1: 0.6, 2: 0.4 })
  ], { visible: (pid) => pid !== 9 }, 2);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.name), ["Rome", "Athens"]);
}

function testInboundIsNormalizedAcrossOwners() {
  // inboundNorm is relative to the busiest destination, so the top inbound civ gets the full term.
  const opts = { inbound: (pid) => (pid === 1 ? 100 : 25) };
  const rows = rankDiversity([
    entry("a", "Big", 1, { 1: 0.5, 2: 0.5 }),
    entry("b", "Small", 2, { 2: 0.5, 3: 0.5 })
  ], opts);
  const big = rows.find((r) => r.name === "Big");
  const small = rows.find((r) => r.name === "Small");
  assert.ok(big.cosmo.score > small.cosmo.score); // same mix; inbound is the only difference
}

function testEmptyWorldRanksEmpty() {
  assert.deepEqual(rankDiversity([], {}), []);
  assert.deepEqual(rankDiversity(null, {}), []);
  assert.deepEqual(rankDiversity([null, {}, { comp: null }], {}), []); // junk entries skipped
}

function testLiveRankingIsEmptyWhenFlagOff() {
  const prev = CONFIG.diversityRanking;
  CONFIG.diversityRanking = false;
  try {
    assert.deepEqual(diverseCityRanking({}), []);
  } finally {
    CONFIG.diversityRanking = prev;
  }
}

// ── The view rows ───────────────────────────────────────────────────────────

/** A gathered row as window's gatherDiversity() yields it (parts already named/coloured/masked). */
function gathered(name, parts, extra) {
  const sorted = parts.slice().sort((a, b) => b.share - a.share);
  return Object.assign({
    name, parts: sorted, pts: 40, people: 12000,
    dominantName: sorted[0].name, dominantShare: sorted[0].share,
    runnerUpShare: sorted.length > 1 ? sorted[1].share : 0,
    cosmo: { tierKey: "mixed" }
  }, extra);
}

function testRowsNameMajorityPluralityAndNoMajority() {
  const rows = diverseCityRows([
    gathered("Rome", [{ name: "Roman", share: 0.6, color: "#a00" }, { name: "Greek", share: 0.3, color: "#0a0" },
      { name: "Punic", share: 0.1, color: "#00a" }], { cosmo: { tierKey: "local" } }),
    gathered("Alexandria", [{ name: "Egyptian", share: 0.45, color: "#aa0" },
      { name: "Greek", share: 0.3, color: "#0a0" }, { name: "Roman", share: 0.25, color: "#a00" }]),
    // Top two effectively tied → no leader worth naming.
    gathered("Carthage", [{ name: "Punic", share: 0.22, color: "#00a" }, { name: "Roman", share: 0.21, color: "#a00" },
      { name: "Greek", share: 0.21, color: "#0a0" }, { name: "Egyptian", share: 0.2, color: "#aa0" },
      { name: "Nubian", share: 0.16, color: "#0aa" }], { cosmo: { tierKey: "world" } })
  ], { cosmo: true });
  assert.equal(rows[0].mix, "Roman majority");
  assert.equal(rows[1].mix, "Egyptian plurality");
  assert.equal(rows[2].mix, "no majority"); // a 1-point lead is not a plurality worth naming
  assert.equal(rows[0].origins, "3 origins");
  assert.equal(rows[2].character, "World City");
}

function testRowsNeverNameASpoilerMaskedOrigin() {
  // gather nulls dominantName for a hidden civ; the row must fall back, not print "undefined".
  const [row] = diverseCityRows([
    Object.assign(gathered("Frontier", [{ name: "Unknown", share: 0.8, color: "#6d6a63" },
      { name: "Roman", share: 0.2, color: "#a00" }]), { dominantName: null })
  ], { cosmo: true });
  assert.equal(row.mix, "no majority"); // an 80% majority, but the holder is not named
}

function testOriginCountMatchesTheBarNotTheRawMetric() {
  // The count is derived from the DISPLAYED slices: trace origins under 5% don't get counted, so the
  // text can never claim more origins than the bar visibly shows.
  const [row] = diverseCityRows([
    gathered("Rome", [{ name: "Roman", share: 0.9, color: "#a00" }, { name: "Greek", share: 0.06, color: "#0a0" },
      { name: "Punic", share: 0.04, color: "#00a" }])
  ], { cosmo: true });
  assert.equal(row.origins, "2 origins"); // the 4% trace is drawn but not counted
  assert.equal(row.parts.length, 3); // …and every slice is still handed to the bar
}

function testRowsUseSingularForOneOrigin() {
  const [row] = diverseCityRows([
    gathered("Rome", [{ name: "Roman", share: 1, color: "#a00" }], { cosmo: { tierKey: "homogeneous" } })
  ], { cosmo: true });
  assert.equal(row.origins, "1 origin"); // not "1 origins"
}

function testRowsCarryPopulationBothWays() {
  // The bar's width and the population column both need these; the Numbers toggle picks which shows.
  const [row] = diverseCityRows([gathered("Rome", [{ name: "Roman", share: 1, color: "#a00" }])], {});
  assert.equal(row.pts, 40);
  assert.equal(row.people, 12000);
}

function testRowsCarryOwnerForTheFullList() {
  // The "All settlements" list groups by owning civ and puts the local player's first, so the row
  // has to carry both. A row from a gather that predates them must not render "undefined".
  const [mine] = diverseCityRows([Object.assign(
    gathered("Rome", [{ name: "Roman", share: 1, color: "#a00" }]), { ownerName: "Roman", own: true })], {});
  assert.equal(mine.ownerName, "Roman");
  assert.equal(mine.own, true);
  const [bare] = diverseCityRows([gathered("Nowhere", [{ name: "Roman", share: 1, color: "#a00" }])], {});
  assert.equal(bare.ownerName, ""); // absent → empty string, never undefined
  assert.equal(bare.own, false);
}

function testCharacterOmittedWhenCosmoFlagOff() {
  const src = [gathered("Rome", [{ name: "Roman", share: 0.6, color: "#a00" },
    { name: "Greek", share: 0.4, color: "#0a0" }])];
  assert.equal(diverseCityRows(src, { cosmo: false })[0].character, null);
  assert.equal(diverseCityRows(src)[0].character, null); // default off
  assert.equal(diverseCityRows(src, { cosmo: true })[0].character, "Mixed City");
}

function testRowsHandleEmptyAndMissingInput() {
  assert.deepEqual(diverseCityRows([], { cosmo: true }), []);
  assert.deepEqual(diverseCityRows(null, { cosmo: true }), []);
}

function testSectionDropsOutEntirelyWhenFlagOff() {
  const prev = CONFIG.diversityRanking;
  CONFIG.diversityRanking = false;
  try {
    // Not an empty tab — no tab at all, so the dashboard never shows a dead section.
    assert.deepEqual(diversitySections({ diversity: [] }), []);
  } finally {
    CONFIG.diversityRanking = prev;
  }
  const [section] = diversitySections({ diversity: [] });
  assert.equal(section.kind, "diversity");
}

const tests = [
  testEntropyZeroForSingleOrigin,
  testEntropyMaximalForEvenSplit,
  testEntropyRisesWithMoreCommunities,
  testNoMajorityBoundaryAtFiftyPercent,
  testCountsOnlyCommunitiesAboveFivePercent,
  testLargestNonOwnerIgnoresTheHostOrigin,
  testEmptyCompositionScoresZeroAndNeverThrows,
  testTierBoundariesAreMonotonic,
  testHomogeneousCityLandsLowestTier,
  testDiverseOpenInboundCityLandsTopTier,
  testScoreRisesWithOpennessAndInbound,
  testMissingContextDegradesToNeutralNotZero,
  testRankingSortsByDiversityAndCaps,
  testZeroLimitMeansUncapped,
  testRankingIsStableForTiedCities,
  testRankingCarriesDominantAndRunnerUp,
  testRankingCarriesRawOriginSharesForTheBar,
  testRankingDropsSpoilerMaskedOwnersBeforeTheCap,
  testInboundIsNormalizedAcrossOwners,
  testEmptyWorldRanksEmpty,
  testLiveRankingIsEmptyWhenFlagOff,
  testRowsNameMajorityPluralityAndNoMajority,
  testRowsNeverNameASpoilerMaskedOrigin,
  testOriginCountMatchesTheBarNotTheRawMetric,
  testRowsUseSingularForOneOrigin,
  testRowsCarryPopulationBothWays,
  testRowsCarryOwnerForTheFullList,
  testCharacterOmittedWhenCosmoFlagOff,
  testRowsHandleEmptyAndMissingInput,
  testSectionDropsOutEntirelyWhenFlagOff
];

for (const t of tests) t();
console.log(`diversity harness passed (${tests.length} cases)`);
