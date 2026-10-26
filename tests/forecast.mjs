// forecast.mjs
//
// The departure forecast (roadmap §15, Feature M): monotonic in the rate of rise, held back by a cooldown, never
// more than the rural pool above its floor, the stable branch for flat or falling pressure or a crossing past the
// horizon, nothing when the option is off; and the pressure samples it reads, recorded with each pass's moves in
// the stats store and read back by source key.

import assert from "node:assert/strict";

const kv = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in kv ? kv[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (kv[k] = v) })
};
globalThis.Game = { turn: 1 };

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { forecastFor, forecastLine } = await import("/emigration/ui/emigration-forecast.js");
const { recordMigrations, recordPressureSamples, cityPressureSeries } = await import("/emigration/ui/emigration-migration-stats.js");
const { buildCitySnapshot } = await import("/emigration/ui/emigration-city-readout-data.js");

Object.assign(CONFIG, {
  cityReadoutForecast: true, forecastTurns: 5, emigrationBar: 24, gameSpeedTuningEnabled: false,
  maxLossPerCityPerTurn: 2, minRuralToEmigrate: 1
});
const loc = (_k, fallback, ...args) => fallback.replace("{1_Count}", String(args[0])).replace("{2_Turns}", String(args[1]));

// Rising at 4 a turn with the bar at 24 and 12 banked: 3 turns to the bar, 2 people at most, damped by distance.
{
  const f = forecastFor({ pressure: 12, pressureToBar: 0.5, pressureSeries: [0, 4, 8], onCooldown: false, cooldown: 0, rural: 6 });
  assert.equal(f.stable, false);
  assert.equal(f.turns, 3, "(24 − 12) / 4 = 3 turns");
  assert.equal(f.people, 1, "2 at most, 0.85² of it rounds to 1");
  assert.match(forecastLine(f, loc), /^About 1 people are likely to leave in the next 3 turns$/);
}

// Monotonic in the rate: a faster rise crosses sooner and projects more people.
{
  const slow = forecastFor({ pressure: 12, pressureToBar: 0.5, pressureSeries: [6, 8, 10], rural: 10 });
  const fast = forecastFor({ pressure: 12, pressureToBar: 0.5, pressureSeries: [0, 4, 8], rural: 10 });
  const faster = forecastFor({ pressure: 12, pressureToBar: 0.5, pressureSeries: [0, 12], rural: 10 });
  assert.ok(slow.stable, "2 a turn needs 6 turns, past the horizon of 5: stable");
  assert.equal(fast.turns, 3);
  assert.equal(faster.turns, 1, "12 a turn crosses next turn");
  assert.ok(faster.people >= fast.people, "a nearer crossing is damped less");
  assert.equal(faster.people, 2, "the per-city cap, undamped at one turn out");
}

// Held back by a cooldown: the turns the settlement still rests are added.
{
  const free = forecastFor({ pressure: 12, pressureToBar: 0.5, pressureSeries: [0, 4, 8], rural: 10 });
  const resting = forecastFor({ pressure: 12, pressureToBar: 0.5, pressureSeries: [0, 4, 8], onCooldown: true, cooldown: 2, rural: 10 });
  assert.equal(resting.turns, free.turns + 2);
  assert.ok(resting.people <= free.people);
  const long = forecastFor({ pressure: 12, pressureToBar: 0.5, pressureSeries: [0, 4, 8], onCooldown: true, cooldown: 4, rural: 10 });
  assert.ok(long.stable, "a cooldown that pushes the crossing past the horizon reads stable");
}

// Never below the rural floor: a settlement at the floor forecasts nobody; one person above it, one.
{
  const floor = forecastFor({ pressure: 23, pressureToBar: 0.96, pressureSeries: [0, 12], rural: 1 });
  assert.ok(floor.stable, "nobody may leave a settlement at the rural floor");
  const one = forecastFor({ pressure: 23, pressureToBar: 0.96, pressureSeries: [0, 12], rural: 2 });
  assert.equal(one.people, 1, "the pool above the floor bounds the count");
}

// The stable branch: flat, falling, or no history.
{
  assert.ok(forecastFor({ pressure: 12, pressureToBar: 0.5, pressureSeries: [12, 12, 12], rural: 10 }).stable, "flat");
  assert.ok(forecastFor({ pressure: 12, pressureToBar: 0.5, pressureSeries: [20, 16, 14], rural: 10 }).stable, "falling");
  assert.ok(forecastFor({ pressure: 12, pressureToBar: 0.5, pressureSeries: [], rural: 10 }).stable, "no history yet");
  assert.equal(forecastLine(forecastFor({ pressure: 0, pressureToBar: 0, pressureSeries: [], rural: 10 }), loc),
    "Nobody is likely to leave soon");
}

// Off: nothing to draw, on either surface.
{
  CONFIG.cityReadoutForecast = false;
  assert.equal(forecastFor({ pressure: 12, pressureToBar: 0.5, pressureSeries: [0, 4, 8], rural: 10 }), null);
  assert.equal(forecastLine(null, loc), "");
  const snap = buildCitySnapshot({ signal: { rural: 5 }, cause: "prosperity", source: { pressure: 12, cooldown: 0 }, pressureSeries: [0, 4, 8] });
  assert.equal(snap.forecast, null, "the snapshot carries no forecast when off");
  CONFIG.cityReadoutForecast = true;
  const on = buildCitySnapshot({ signal: { rural: 5 }, cause: "prosperity", source: { pressure: 12, cooldown: 0 }, pressureSeries: [0, 4, 8] });
  assert.equal(on.forecast.turns, 3, "the snapshot's forecast reads the source's pressure and the samples");
  assert.deepEqual(on.pressureSeries, [0, 4, 8]);
}

// The samples: handed over by the pass, recorded with that pass's moves, bounded, dropped with the source.
{
  recordPressureSamples({ "1:1": { pressure: 3 }, "1:2": { pressure: 0 } });
  recordMigrations([]);
  assert.deepEqual(cityPressureSeries("1:1"), [3]);
  for (let t = 2; t <= 9; t++) {
    globalThis.Game.turn = t;
    recordPressureSamples({ "1:1": { pressure: 3 * t } });
    recordMigrations([]);
  }
  assert.deepEqual(cityPressureSeries("1:1"), [12, 15, 18, 21, 24, 27], "the last six samples, oldest first");
  assert.deepEqual(cityPressureSeries("1:1", 2), [24, 27]);
  assert.deepEqual(cityPressureSeries("1:2"), [], "a source the engine dropped is dropped here too");
  // Round trip: the samples live in the persisted stats blob.
  assert.ok(String(kv.EmigrationMigrationStats_v1 || Object.values(kv).find((v) => /pressureSeries/.test(String(v)))).includes("pressureSeries"));
}

console.log("forecast harness passed");

// A crisis source (war, disaster) sheds on the crisis cadence, which ignores the bar: its own line, not "stable".
{
  const f = forecastFor({ pressure: 0, pressureToBar: 0, pressureSeries: [], rural: 10, cause: "war" });
  assert.equal(f.crisis, true);
  assert.equal(f.stable, false);
  assert.match(forecastLine(f, loc), /^People are fleeing now/);
  assert.equal(forecastFor({ pressure: 0, pressureToBar: 0, pressureSeries: [], rural: 10, cause: "prosperity" }).crisis, undefined);
  const snap = buildCitySnapshot({ signal: { rural: 5 }, cause: "disaster", source: { pressure: 0, cooldown: 0 }, pressureSeries: [] });
  assert.equal(snap.forecast.crisis, true, "the snapshot passes its cause to the forecast");
  console.log("forecast crisis line passed");
}
