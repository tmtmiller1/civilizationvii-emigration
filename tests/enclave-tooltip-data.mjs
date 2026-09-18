// enclave-tooltip-data.mjs
//
// What the enclave tooltip SAYS (emigration-enclave-tooltip-data.js). The model exists because three
// things were invisible in game (reported 2026-09-17): the enclave's name and stage, the improvement it
// displaced, and the stance yields, which are paid to the city and never touch the tile. So the things
// worth pinning are: the borrowed improvement never becomes the tile's identity, a displaced improvement
// is still listed as a source, the stance appears only once recognized and is dimmed while contested, and
// the total is the sum of exactly the sources shown.

import assert from "node:assert/strict";
import {
  enclaveTipModel, stageOf, landYields, scaledStance, totalYields, markerStageLine
} from "/emigration/ui/emigration-enclave-tooltip-data.js";

const P = "YIELD_PRODUCTION", H = "YIELD_HAPPINESS", F = "YIELD_FOOD";
function input(over) {
  return {
    rec: { recognized: true, optionId: "a", contested: false, fadeSince: null },
    enclaveName: "Norman Enclave", originAdj: "Norman", cityName: "Lāhainā", terrain: "Tropical Hills",
    skinName: "Hidden Fortress", replacedName: "", before: {},
    native: { [P]: 4 }, now: { [P]: 6, [F]: 1 },
    stance: { [P]: 2, [H]: -1 }, stanceLabel: "Raise their knights",
    why: "their castle-masons and knights raise strong works", benefitScale: 1,
    dwell: null, turn: 100, fadeTurns: 12, ...over
  };
}
const keys = (m) => m.sources.map((s) => s.key);

// ── stages, in precedence order ──
assert.equal(stageOf({ recognized: false }), "established", "an unrecognized record is merely established");
assert.equal(stageOf({ recognized: true }), "recognized");
assert.equal(stageOf({}), "recognized", "a legacy record with no flag was created at recognition");
assert.equal(stageOf({ recognized: true, contested: true }), "contested", "a war outranks a quiet recognition");
// An unrecognized enclave IS marked contested by the mod and charged the war strain, so the panel has to
// say so rather than showing the calm established line (watched in game 2026-09-17).
assert.equal(stageOf({ recognized: false, contested: true }), "contested", "an unrecognized enclave under war reads as contested");
{
  const m = enclaveTipModel(input({ rec: { recognized: false, optionId: "ignore", contested: true }, stance: {}, stanceLabel: "", why: "" }));
  assert.equal(m.stage.key, "contested");
  assert.ok(/isn't recognized yet/i.test(m.stage.detail), "and still says recognition has not happened");
  assert.deepEqual(m.sources.map((x) => x.key), ["land", "tile"], "with no stance row, since there is no stance");
}
assert.equal(stageOf({ recognized: true, contested: true, fadeSince: 90 }), "fading", "fading outranks everything");

// ── the borrowed improvement is never the tile's identity ──
{
  const m = enclaveTipModel(input());
  assert.equal(m.title, "Norman Enclave", "the tile is titled as the enclave");
  assert.ok(!/Hidden Fortress/.test(m.title + m.stage.text), "the borrowed improvement names neither title nor stage");
  const tile = m.sources.find((s) => s.key === "tile");
  assert.ok(!/Hidden Fortress/.test(tile.label), "the borrowed name is kept OUT of the row's name, where it wrapped into the note");
  assert.ok(/Hidden Fortress/.test(tile.detail), "it appears as a smaller detail under the name");
  assert.ok(/Norman/.test(tile.note), "with the reason the tile yields anything");
  assert.equal(m.subtitle, "Lāhainā · Tropical Hills");
}

// ── recognized: land, tile and stance, each with its yields and its reasoning ──
{
  const m = enclaveTipModel(input());
  assert.deepEqual(keys(m), ["land", "tile", "stance"]);
  assert.equal(m.sources[0].yields, "+1 Food, +2 Production", "the land is what the plot yields beyond the enclave's works");
  assert.equal(m.sources[1].yields, "+4 Production");
  assert.equal(m.sources[2].yields, "−1 Happiness, +2 Production");
  assert.ok(/castle-masons/.test(m.sources[2].note), "the stance row carries the stance's own reasoning");
  assert.ok(/not this tile/i.test(m.sources[2].detail), "and says why the map's yield icons do not change");
  assert.equal(m.total, "+1 Food, −1 Happiness, +8 Production", "the total is the sum of exactly the sources shown");
  // The panel draws the game's yield icons from the raw amounts, so they must agree with the text.
  assert.deepEqual(m.sources[2].amounts, { [P]: 2, [H]: -1 }, "each row carries its raw signed amounts");
  assert.deepEqual(m.totalAmounts, { [F]: 1, [H]: -1, [P]: 8 }, "and so does the total");
}

// ── established: no stance row, and the stage says when recognition comes ──
{
  const m = enclaveTipModel(input({ rec: { recognized: false, optionId: "ignore" }, dwell: { elapsed: 3, needed: 8 } }));
  assert.deepEqual(keys(m), ["land", "tile"], "an established enclave has no stance yet");
  assert.ok(/5 turns/.test(m.stage.text), "the stage counts the turns left to recognition");
  assert.ok(/treat them/i.test(m.stage.detail), "with the explanation kept out of the headline");
  assert.equal(m.total, "+1 Food, +6 Production", "and the stance is not counted in the total");
  const due = enclaveTipModel(input({ rec: { recognized: false }, dwell: { elapsed: 9, needed: 8 } }));
  assert.ok(/ready to be recognized/i.test(due.stage.text), "a served dwell reads as ready, never a negative count");
}

// ── a displaced improvement is still a source: you can see what stood there AND the enclave ──
{
  const m = enclaveTipModel(input({ replacedName: "Woodcutter", before: { [P]: 3, [F]: 1 } }));
  const land = m.sources[0];
  assert.ok(/Woodcutter/.test(land.detail), "the original improvement is named under the row");
  assert.equal(land.yields, "+1 Food, +3 Production", "with the yields it gave (its `before`), not a subtraction");
  assert.ok(/still get what it gave/i.test(land.note), "and the reason they are still received");
  assert.ok(m.sources.some((s) => s.key === "tile"), "alongside the enclave, not instead of it");
  assert.equal(m.total, "+1 Food, −1 Happiness, +9 Production");
  const bare = enclaveTipModel(input());
  assert.equal(bare.sources[0].detail, "", "an enclave on empty land invents no predecessor");
  assert.equal(bare.sources[0].note, "");
}

// ── contested: the benefit is dimmed, the drawback is not, and the row says so ──
{
  assert.deepEqual(scaledStance({ [P]: 2, [H]: -1 }, 0.5), { [P]: 1, [H]: -1 }, "only the positive side scales");
  assert.deepEqual(scaledStance({ [P]: 2 }, 0), {}, "a benefit scaled to nothing drops out");
  assert.deepEqual(scaledStance({ [P]: 2 }, NaN), { [P]: 2 }, "an unusable scale is full strength, never a wipe");
  const m = enclaveTipModel(input({ rec: { recognized: true, optionId: "a", contested: true }, benefitScale: 0.5 }));
  assert.equal(m.stage.key, "contested");
  const stance = m.sources.find((s) => s.key === "stance");
  assert.equal(stance.yields, "−1 Happiness, +1 Production");
  assert.ok(/50%/.test(stance.note), "the row explains the cut");
  assert.equal(m.total, "+1 Food, −1 Happiness, +7 Production", "and the total uses what is actually paid");
}

// ── fading counts down and never reads zero or negative ──
{
  const m = enclaveTipModel(input({ rec: { recognized: true, optionId: "a", fadeSince: 95 }, turn: 100, fadeTurns: 12 }));
  assert.ok(/7 turns/.test(m.stage.text), "12 turns of fade, 5 elapsed");
  const late = enclaveTipModel(input({ rec: { recognized: true, fadeSince: 50 }, turn: 100, fadeTurns: 12 }));
  assert.ok(/1 turns/.test(late.stage.text), "an overdue fade still reads at least 1");
}

// ── "let be" is recognized with no stance row ──
{
  const m = enclaveTipModel(input({ rec: { recognized: true, optionId: "ignore" }, stance: {}, stanceLabel: "", why: "" }));
  assert.deepEqual(keys(m), ["land", "tile"]);
  assert.ok(/left them alone/i.test(m.stage.text));
}

// ── helpers and degenerate input ──
assert.deepEqual(landYields({ [P]: 6, [F]: 1 }, { [P]: 4 }), { [P]: 2, [F]: 1 });
assert.deepEqual(landYields({ [P]: 3 }, { [P]: 4 }), {}, "the land's share is never negative");
assert.deepEqual(totalYields(input({ now: {}, native: {}, stance: {} })), {}, "nothing in, nothing out");
assert.equal(enclaveTipModel(null), null);
assert.equal(enclaveTipModel({}), null, "no record, no tooltip");
{
  const m = enclaveTipModel(input({ native: {}, now: {}, stance: {} }));
  assert.deepEqual(m.sources, [], "sources with nothing to yield are left out, not shown as blanks");
  assert.equal(m.total, "");
}

// ── the marker's second line ──
assert.equal(markerStageLine({ recognized: false }, { [P]: 2 }), "Established", "no stance yields before recognition");
assert.equal(markerStageLine({ recognized: true }, { [P]: 2, [H]: -1 }), "Recognized  −1 Happiness, +2 Production");
assert.equal(markerStageLine({ recognized: true }, {}), "Recognized", "let be shows the stage alone");
assert.equal(markerStageLine({ recognized: true, contested: true }, {}), "Contested");
assert.equal(markerStageLine({ fadeSince: 3 }, {}), "Fading");

// ── plain wording: no em dashes in anything the panel shows ──
// Asked for directly (2026-09-17). The strings are localized, so this checks the composed output of the
// English fallbacks, which is what the panel renders when a locale has no row.
{
  const shown = [];
  for (const rec of [{ recognized: false }, { recognized: true, optionId: "a" }, { recognized: true, optionId: "ignore" },
    { recognized: true, contested: true }, { recognized: true, fadeSince: 90 }]) {
    const m = enclaveTipModel(input({ rec, dwell: { elapsed: 1, needed: 8 } }));
    shown.push(m.stage.text, m.stage.detail, m.subtitle);
    for (const s of m.sources) shown.push(s.label, s.detail, s.note);
  }
  shown.push(markerStageLine({ recognized: false }, {}), markerStageLine({ recognized: true }, { [P]: 2 }));
  const withDash = shown.filter((t) => typeof t === "string" && t.includes("\u2014"));
  assert.deepEqual(withDash, [], "no tooltip string uses an em dash");
}

console.log("enclave-tooltip-data tests passed");
