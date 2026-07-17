// explain-view.mjs
//
// Feature L: the push/pull explainer surface. The reasoning itself is pinned by tests/explain.mjs
// (the reconstruction identities); what is covered HERE is the formatting contract this surface
// promises a player, and the three things it must never conflate:
//
//   • FACTORS carry weights, and a weight is a share of the whole decomposition.
//   • PERMEABILITY is a multiplier, reported as one - never as a weight (it is not an addend).
//   • COMMUNITY is context, and must NOT enter the weights at all (chain migration is unbuilt;
//     see the file header of emigration-explain-view.js). The load-bearing case is
//     `testCommunityDoesNotDisturbWeights`: a fabricated community row would land in weigh()'s
//     denominator and silently falsify every other row's share, so it is asserted that the rows are
//     byte-identical with and without a community present.

import assert from "node:assert/strict";

// Deterministic deps, matching tests/explain.mjs: Manhattan hex distance, no slotted policy cards,
// no Game (so no diplomacy).
globalThis.GameplayMap = { getPlotDistance: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by) };
globalThis.Players = { get: () => ({ Culture: { isTraditionActive: () => false } }) };
globalThis.Database = { makeHash: (s) => "H_" + s };

// A minimal DOM (elements track parentNode + support removeChild, which renderExplain's GameFace-safe
// clear needs), so the render half actually mounts.
function makeEl(tag) {
  return {
    tagName: tag, id: "", className: "", textContent: "", style: {},
    children: [], parentNode: null,
    get firstChild() { return this.children[0] || null; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; }
  };
}
const head = makeEl("head");
globalThis.document = {
  head, body: makeEl("body"), documentElement: makeEl("html"),
  createElement: makeEl,
  getElementById: (id) => head.children.find((e) => e.id === id) || null
};

const { buildExplainModel, renderExplain, explainModel } = await import("/emigration/ui/emigration-explain-view.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");

// Pin every knob the two formulas read, so the fixtures survive re-tuning (same set as explain.mjs).
Object.assign(CONFIG, {
  migrationExplainer: true,
  baseReluctance: 4,
  perExtraPop: 0.5,
  cityStateBarrier: 5,
  poachBlock: 12,
  refugeePoachBlock: 2,
  crisisEscapeBonus: 0,
  distanceFactor: 0.6,
  congestWeight: 0,
  antiSnowballWeight: 0,
  aggressorPenalty: 0,
  bordersEnabled: false,
  crossCivEnabled: true,
  tiltCap: 14,
  permeFloor: 0.25,
  permeCeil: 2,
  happinessShaped: false,
  overcrowdDiscount: 0,
  polityModelEnabled: false,
  warSiege: false,
  foodFactor: 1,
  productionFactor: 1,
  goldFactor: 1,
  scienceFactor: 0.25,
  cultureFactor: 0.5,
  localHappinessFactor: 6,
  populationFactor: 1,
  violencePerPoint: 8,
  violenceCapPct: 90,
  disasterPerPoint: 6,
  disasterCapPct: 80,
  siegeModifier: -60,
  starvationModifier: -25,
  unrestModifier: -20,
  violenceFleeThreshold: 3,
  disasterFleeThreshold: 3,
  unhappyCauseThreshold: -2
});

/**
 * A signal carrying BOTH shapes: the pull fields (key/owner/pros/population/location) and the
 * prosperity fields explainPush decomposes. One fixture, because the explainer feeds the same
 * settlement to both sides.
 */
const sig = (owner, pros, x, y, over) =>
  Object.assign(
    {
      key: `${owner}:${x}:${y}`, owner, pros, isCityState: false, rural: 5,
      city: { id: `c${x}${y}`, name: `City${x}${y}`, location: { x, y } },
      food: 0, production: 0, gold: 0, science: 0, culture: 0,
      population: 5, urban: 0, happiness: 0, violence: 0, disaster: 0,
      siege: false, starving: false, unrest: false
    },
    over
  );

// A miserable source (besieged, starving, unhappy) next to a thriving neighbour: both groups have
// something to say.
const POOR = sig(1, 10, 0, 0, { happiness: -6, siege: true, starving: true, food: -2, production: 1 });
const RICH = sig(2, 40, 3, 0, { happiness: 4, food: 6, production: 6, gold: 4 });
const FIELD = { meanHappiness: 0 };

const build = (over) =>
  buildExplainModel(Object.assign({ signal: POOR, ranked: [POOR, RICH], field: FIELD }, over));

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const totalWeight = (rows) => rows.reduce((a, r) => a + r.weight, 0);

// ── A distressed city explains both sides ────────────────────────────────────

function testDistressedCityHasBothGroups() {
  const m = build();
  assert.ok(m, "a ranked distressed city yields a model");
  assert.ok(m.leaving.length > 0, "a besieged, starving, unhappy city has push factors to name");
  assert.ok(m.drawnTo.length > 0, "a viable rich neighbour gives it pull factors to name");
  assert.equal(m.destName, "City30", "the model names the destination it explains");
  assert.equal(m.crossCiv, true, "a move to another owner is flagged cross-civ");
}

// ── The honesty rule: weights are shares, and they sum to the whole ──────────

function testWeightsNormalizeWithinEachGroup() {
  // MAX_ROWS truncation must not renormalize: a shown row's weight is its share of the FULL
  // decomposition, so a truncated group sums to <= 1, never back up to 1.
  const m = build();
  for (const [name, rows] of [["leaving", m.leaving], ["drawnTo", m.drawnTo]]) {
    const t = totalWeight(rows);
    assert.ok(t > 0 && t <= 1 + 1e-9, `${name} weights are shares in (0, 1]: got ${t}`);
    for (const r of rows) {
      assert.ok(r.weight > 0 && r.weight <= 1, `${name} row ${r.key} has a weight in (0, 1]`);
      assert.ok(r.kind === "push" || r.kind === "pull", `${name} row ${r.key} has no "scale" kind`);
    }
  }
}

function testUntruncatedGroupSumsToOne() {
  // With few enough terms to escape MAX_ROWS, the shares must account for the whole decomposition.
  const plain = sig(1, 10, 0, 0, { food: 3 });
  const m = buildExplainModel({ signal: plain, ranked: [plain, RICH], field: FIELD });
  assert.ok(m.leaving.length < 5, "fixture is chosen to fit under the row cap");
  assert.ok(near(totalWeight(m.leaving), 1), `an untruncated group sums to 1: got ${totalWeight(m.leaving)}`);
}

function testRowsAreSortedByWeight() {
  const m = build();
  for (const rows of [m.leaving, m.drawnTo]) {
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].weight >= rows[i].weight, "rows descend by weight");
    }
  }
}

// ── Permeability is a multiplier, not a factor row ───────────────────────────

function testNeutralBorderReportsNoMultiplier() {
  const m = build();
  assert.equal(m.permeability, null, "a neutral border (x1) has nothing to report");
  assert.ok(!m.drawnTo.some((r) => r.key === "permeability"), "permeability is never a weighted row");
}

function testThrottledBorderReportsItsMultiplier() {
  // permeFloor clamps the product, so a permeCeil/Floor squeeze is the portable way to force a
  // non-neutral scale without depending on a policy card being slotted.
  const prev = CONFIG.permeCeil;
  CONFIG.permeCeil = 0.5; // clamps the neutral 1.0 down to 0.5
  try {
    const m = build();
    assert.ok(m.permeability, "a non-neutral border is reported");
    assert.equal(m.permeability.factor, 0.5, "reported as the literal multiplier, not a weight");
    assert.ok(!m.drawnTo.some((r) => r.key === "permeability"), "and still never a weighted row");
  } finally {
    CONFIG.permeCeil = prev;
  }
}

// ── Community is context, and must not touch the weights ────────────────────

function testCommunityOnlyWhenDestHostsTheOrigin() {
  assert.equal(build().community, null, "no resolver → no community note");
  assert.equal(build({ communityOf: () => null }).community, null,
    "a destination hosting none of the origin → no note");
  const note = { name: "Roman", share: 0.24, color: "#c0392b" };
  assert.deepEqual(build({ communityOf: () => note }).community, note,
    "a destination hosting the origin surfaces the note");
}

function testCommunityDoesNotDisturbWeights() {
  const without = build();
  const with_ = build({ communityOf: () => ({ name: "Roman", share: 0.9, color: "#c0392b" }) });
  assert.deepEqual(with_.drawnTo, without.drawnTo,
    "a community is CONTEXT: it must not add a row, and must not shift any other row's share");
  assert.deepEqual(with_.leaving, without.leaving, "and it cannot touch the push side at all");
}

function testCommunityNeedsAViableDestination() {
  // Nowhere to go → nothing is "drawn" anywhere, so a community note would be about a move that
  // isn't happening.
  const trapped = sig(1, 10, 0, 0);
  const m = buildExplainModel({
    signal: trapped, ranked: [trapped], field: FIELD, communityOf: () => ({ name: "Roman", share: 0.5, color: "#fff" })
  });
  assert.equal(m.drawnTo.length, 0, "a lone city has no destination to be drawn to");
  assert.equal(m.community, null, "and so carries no community note");
  assert.equal(m.destName, "", "and names no destination");
}

// ── Degenerate inputs ────────────────────────────────────────────────────────

function testNoSignalYieldsNoModel() {
  assert.equal(buildExplainModel({ signal: null, ranked: [] }), null, "a missing signal yields no model");
  assert.equal(buildExplainModel({ signal: POOR, ranked: null }), null, "a missing field yields no model");
}

function testContentCityWithNoDestinationExplainsNothingToDo() {
  const only = sig(1, 10, 0, 0);
  const m = buildExplainModel({ signal: only, ranked: [only], field: FIELD });
  assert.deepEqual(m.drawnTo, [], "no viable destination → no pull rows (not a fabricated empty pair)");
  assert.equal(m.permeability, null, "and no border multiplier to report");
}

// ── Render ───────────────────────────────────────────────────────────────────

/** Every element in a rendered tree, depth-first. */
const flatten = (el) => [el, ...el.children.flatMap(flatten)];
const byClass = (el, cls) => flatten(el).filter((e) => e.className === cls);

function testRenderMountsRowsAndBars() {
  const host = makeEl("div");
  const m = build();
  const root = renderExplain(host, m);
  assert.ok(root, "a model with rows renders");
  assert.equal(host.children.length, 1, "the explainer mounts exactly one container into its host");
  assert.equal(byClass(root, "emig-ex-row").length, m.leaving.length + m.drawnTo.length,
    "one row element per model row, across both groups");
  assert.equal(byClass(root, "emig-ex-group").length, 2, "both group headings render");
  for (const fill of byClass(root, "emig-ex-fill")) {
    assert.match(fill.style.width, /^\d+%$/, "each weight bar is sized as a percentage");
    assert.ok(fill.style.background, "and coloured by its row's direction");
  }
}

function testRenderInjectsItsStylesheetOnce() {
  renderExplain(makeEl("div"), build());
  renderExplain(makeEl("div"), build());
  assert.equal(head.children.filter((e) => e.id === "emig-explain-style").length, 1,
    "the stylesheet is injected once, not once per render");
}

function testRenderIsANoOpWhenThereIsNothingToSay() {
  const host = makeEl("div");
  assert.equal(renderExplain(host, null), null, "a null model renders nothing");
  assert.equal(renderExplain(null, build()), null, "an absent host renders nothing");
  assert.equal(renderExplain(host, { leaving: [], drawnTo: [] }), null, "an empty model renders nothing");
  assert.equal(host.children.length, 0, "and none of those touched the host");
}

function testRenderShowsCommunityAndPermeabilityAsNotesNotRows() {
  const host = makeEl("div");
  CONFIG.permeCeil = 0.5;
  try {
    const m = build({ communityOf: () => ({ name: "Roman", share: 0.24, color: "#c0392b" }) });
    const root = renderExplain(host, m);
    const notes = byClass(root, "emig-ex-note");
    assert.equal(notes.length, 2, "the multiplier and the community both render as notes");
    assert.equal(byClass(root, "emig-ex-row").length, m.leaving.length + m.drawnTo.length,
      "and NEITHER adds a weighted row");
    assert.equal(byClass(root, "emig-ex-swatch").length, 1, "the community note carries a civ swatch");
  } finally {
    CONFIG.permeCeil = 2;
  }
}

function testOffFlagExplainsNothing() {
  CONFIG.migrationExplainer = false;
  try {
    assert.equal(explainModel("1:0:0"), null, "the option gates the whole feature off");
  } finally {
    CONFIG.migrationExplainer = true;
  }
}

const TESTS = [
  testDistressedCityHasBothGroups,
  testWeightsNormalizeWithinEachGroup,
  testUntruncatedGroupSumsToOne,
  testRowsAreSortedByWeight,
  testNeutralBorderReportsNoMultiplier,
  testThrottledBorderReportsItsMultiplier,
  testCommunityOnlyWhenDestHostsTheOrigin,
  testCommunityDoesNotDisturbWeights,
  testCommunityNeedsAViableDestination,
  testNoSignalYieldsNoModel,
  testContentCityWithNoDestinationExplainsNothingToDo,
  testRenderMountsRowsAndBars,
  testRenderInjectsItsStylesheetOnce,
  testRenderIsANoOpWhenThereIsNothingToSay,
  testRenderShowsCommunityAndPermeabilityAsNotesNotRows,
  testOffFlagExplainsNothing
];

for (const t of TESTS) t();
console.log(`explain-view harness passed (${TESTS.length} cases)`);
