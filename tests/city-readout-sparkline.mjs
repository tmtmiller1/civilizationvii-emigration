// city-readout-sparkline.mjs
//
// Feature E: the per-city net-migration sparkline. Covers the data substrate (cityNetSeries recorded
// by recordMigrations, keyed "owner|cityName", bounded and last-n sliced) and the readout view-model's
// `spark` field (present only when the option is on and the city has history).

import assert from "node:assert/strict";

const kv = {};
globalThis.Configuration = { getGame: () => ({ getValue: (k) => (k in kv ? kv[k] : null) }), editGame: () => ({ setValue: (k, v) => (kv[k] = v) }) };
globalThis.Game = { turn: 1 };

const { recordMigrations, cityNetSeries } = await import("/emigration/ui/emigration-migration-stats.js");

// An instantaneous same-civ move: the source loses a point, the destination gains one.
const move = (srcName, destName, pts) => ({ srcOwner: 1, srcName, destOwner: 1, destName, points: pts, people: pts * 100, cause: "prosperity", phase: "move" });
const pass = (turn, migs) => { globalThis.Game.turn = turn; recordMigrations(migs); };

// ── Recording: net per city per pass ("owner|cityName") ───────────────────────
pass(1, [move("Rome", "Ostia", 1)]);
pass(2, [move("Rome", "Ostia", 1)]);
pass(3, [move("Rome", "Ostia", 1)]);
assert.deepEqual(cityNetSeries("1|Rome", 100), [-1, -1, -1], "the source city records a -1 net each pass");
assert.deepEqual(cityNetSeries("1|Ostia", 100), [1, 1, 1], "the destination city records a +1 net each pass");
assert.deepEqual(cityNetSeries("1|Nowhere", 100), [], "an untouched city has an empty series");

// ── Last-n slicing ────────────────────────────────────────────────────────────
for (let t = 4; t <= 20; t++) pass(t, [move("Rome", "Ostia", 1)]); // 20 recorded passes for Rome
assert.equal(cityNetSeries("1|Rome", 5).length, 5, "returns at most n values");
assert.deepEqual(cityNetSeries("1|Rome", 5), [-1, -1, -1, -1, -1], "returns the most recent n, oldest first");
assert.deepEqual(cityNetSeries("1|Rome", 0), [], "n <= 0 returns nothing");

// ── Bounded storage (MAX_CITYNET_SERIES = 24) ────────────────────────────────
for (let t = 21; t <= 40; t++) pass(t, [move("Rome", "Ostia", 1)]); // 40 passes total
const full = cityNetSeries("1|Rome", 1000);
assert.ok(full.length <= 24, `series is capped at 24 (got ${full.length})`);

// ── A balanced pass (equal in and out) records a net 0, not a skip ────────────
pass(41, [move("Rome", "Ostia", 1), move("Ostia", "Rome", 1)]);
assert.equal(cityNetSeries("1|Rome", 1)[0], 0, "a pass with equal in and out records net 0 for the city");

// ── Mixed magnitudes preserved ────────────────────────────────────────────────
pass(42, [move("Rome", "Ostia", 3)]); // Rome -3
assert.equal(cityNetSeries("1|Rome", 1)[0], -3, "the exact per-pass net magnitude is stored");

// ── readoutModel.spark reflects the option + the series ───────────────────────
const { readoutModel } = await import("/emigration/ui/emigration-city-readout.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const snap = (netSeries) => ({ cityName: "Rome", cause: "prosperity", causeLabel: "Attraction", ownerNet: -5, pressureToBar: 0, netSeries });

CONFIG.cityReadoutSparkline = true;
assert.deepEqual(readoutModel(snap([-2, 1, 3])).spark, [-2, 1, 3], "spark carries the series when the option is on");
assert.equal(readoutModel(snap([])).spark, null, "no history -> no spark");
assert.equal(readoutModel(snap(undefined)).spark, null, "missing series -> no spark");

CONFIG.cityReadoutSparkline = false;
assert.equal(readoutModel(snap([-2, 1, 3])).spark, null, "spark is null when the option is off");
CONFIG.cityReadoutSparkline = true;

console.log("city-readout-sparkline harness passed");
