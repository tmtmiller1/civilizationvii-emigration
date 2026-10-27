// intake-ai.mjs
//
// When an AI civilization closes a settlement to newcomers, and when it opens one again (emigration-intake-ai.js),
// and the upkeep a closed settlement costs each turn (emigration-intake-upkeep.js): charged for the turns since
// the last charge, once a turn, the AI's at its difficulty discount; a short treasury opens what it can't pay for.

import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Game = { turn: 20 };

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { aiIntakeDecisions, AI_RESERVE_TURNS, AI_MIN_CLOSED_TURNS } = await import("/emigration/ui/emigration-intake-ai.js");
const { chargeIntakeUpkeep, turnsToCharge, intakeUpkeep } = await import("/emigration/ui/emigration-intake-upkeep.js");
const { setCityClosed, isCityClosed, loadState } = await import("/emigration/ui/emigration-state.js");

const city = (key, over = {}) => ({ key, happiness: -2, capital: false, recentNet: 2, closedSince: null, ...over });
const reads = (over = {}) => ({ congestion: 1.5, balance: 100, upkeep: 1, turn: 20, ...over });

// Closing: past the bar, unhappy, taking people in, not the capital, with ten turns of upkeep in hand; one a pass,
// the unhappiest first.
{
  const cs = [city("1:1", { capital: true, happiness: -9 }), city("1:2", { happiness: -1 }), city("1:3", { happiness: -4 })];
  assert.deepEqual(aiIntakeDecisions(cs, reads()), { close: ["1:3"], open: [] }, "the unhappiest non-capital");
  assert.deepEqual(aiIntakeDecisions(cs, reads({ congestion: 0.9 })).close, [], "under the bar: nothing");
  assert.deepEqual(aiIntakeDecisions(cs, reads({ balance: AI_RESERVE_TURNS - 1 })).close, [], "short of the reserve");
  assert.deepEqual(aiIntakeDecisions([city("1:4", { recentNet: 0 })], reads()).close, [], "not taking anyone in");
  assert.deepEqual(aiIntakeDecisions([city("1:4", { happiness: 1 })], reads()).close, [], "content");
  assert.deepEqual(aiIntakeDecisions([city("1:5", { capital: true })], reads()).close, [], "never the capital");
  const six = [1, 2, 3, 4, 5, 6].map((i) => city("1:" + i, { closedSince: i <= 2 ? 19 : null }));
  assert.deepEqual(aiIntakeDecisions(six, reads()).close, [], "a third of six is two, already closed");
  assert.deepEqual(aiIntakeDecisions([city("1:7")], reads({ upkeep: 0 })).close, ["1:7"], "free closing needs no reserve");
}

// Opening: held at least AI_MIN_CLOSED_TURNS, then when the pressure eases, the settlement is content, or Influence runs low.
{
  const held = (since, over = {}) => [city("2:1", { closedSince: since, ...over })];
  assert.deepEqual(aiIntakeDecisions(held(20 - AI_MIN_CLOSED_TURNS + 1, { happiness: 3 }), reads()).open, [], "too soon");
  assert.deepEqual(aiIntakeDecisions(held(10, { happiness: 3 }), reads()).open, ["2:1"], "content again");
  assert.deepEqual(aiIntakeDecisions(held(10), reads({ congestion: 0.4 })).open, ["2:1"], "the pressure eased");
  assert.deepEqual(aiIntakeDecisions(held(10), reads({ balance: 2 })).open, ["2:1"], "Influence running low");
  assert.deepEqual(aiIntakeDecisions(held(10), reads()).open, [], "still unhappy, still congested, still paying");
}

// The upkeep.
{
  assert.equal(turnsToCharge(20, null), 1);
  assert.equal(turnsToCharge(22, 20), 2, "a pass every two turns pays two");
  assert.equal(turnsToCharge(20, 20), 0, "never twice in a turn");
  assert.equal(turnsToCharge(3, 140), 1, "an age change restarts the turn count");
  assert.equal(turnsToCharge(60, 20), 5, "a long gap is capped");
  CONFIG.cityIntakeToggleEnabled = true;
  CONFIG.cityIntakeInfluence = 1;
  assert.equal(intakeUpkeep(), 1);
  setCityClosed("0:10", true);
  setCityClosed("0:11", true);
  setCityClosed("0:12", true);
  setCityClosed("3:20", true);
  const paid = [];
  const deps = (over = {}) => ({
    balance: (pid) => (pid === 0 ? 100 : 100), pay: (pid, n) => paid.push([pid, n]),
    findCity: (owner, id) => (id === 12 ? null : { name: "C" + id }), isAi: (pid) => pid === 3, turn: 20, ...over
  });
  const r1 = chargeIntakeUpkeep(deps());
  assert.deepEqual(paid, [[0, 2], [3, 1]], "two closed settlements for the player, one for the AI");
  assert.equal(r1.charged, 3);
  assert.equal(isCityClosed({ key: "0:12", owner: 0 }), false, "a settlement that's gone drops out");
  assert.ok(!("0:12" in loadState().cities));
  paid.length = 0;
  assert.equal(chargeIntakeUpkeep(deps()).charged, 0, "same turn: nothing more");
  // Two turns later, with Influence for one turn of one settlement: one stays closed, the other opens, a notice.
  const notes = [];
  const r2 = chargeIntakeUpkeep(deps({ turn: 22, balance: () => 2, notify: (m) => notes.push(m) }));
  assert.deepEqual(paid, [[0, 2], [3, 2]], "two turns' upkeep for what can be paid");
  assert.deepEqual(r2.opened, ["C11"], "the one the treasury can't cover opens");
  assert.equal(isCityClosed({ key: "0:10", owner: 0 }), true);
  assert.equal(isCityClosed({ key: "0:11", owner: 0 }), false);
  assert.match(notes[0], /^Not enough Influence to keep dissuading newcomers in C11\. They're welcome there again\.$/);
  // Free: no charge.
  CONFIG.cityIntakeInfluence = 0;
  paid.length = 0;
  assert.equal(chargeIntakeUpkeep(deps({ turn: 25 })).charged, 0);
  assert.deepEqual(paid, []);
  CONFIG.cityIntakeInfluence = 1;
  // The turn a settlement closed is kept in the save, for the AI's minimum hold.
  assert.equal(loadState().cities["0:10"].since, 20);
}

console.log("intake-ai harness passed");
