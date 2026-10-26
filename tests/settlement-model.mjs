// settlement-model.mjs
//
// The Settlements tab's dashboard numbers (emigration-settlement-model.js): who pulls on a settlement's people and
// whom it draws, read off the same ranked field the simulation decides with, the score's terms for the pressure
// hover, the prescription as a lever, and the stance read. Pure, with the pass built from synthetic signals the
// way tests/prescribe.mjs builds them.

import assert from "node:assert/strict";

globalThis.Locale = { compose: (s) => s };
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { prosperity, fieldContext, rankByProsperity } = await import("/emigration/ui/emigration-prosperity.js");
const { settlementModel, pulledToward, drawnFrom } = await import("/emigration/ui/emigration-settlement-model.js");
const { pressureTip, prosperityLedgerFor } = await import("/emigration/ui/emigration-settlement-card.js");

CONFIG.readoutPrescribe = true;
CONFIG.bordersEnabled = false;
CONFIG.crossCivEnabled = true;

/** A settlement signal with sane numbers. */
function sig(name, owner, over) {
  return {
    key: owner + ":" + name, owner, city: { name, location: { x: name.length, y: owner } }, population: 6, rural: 4, urban: 2,
    food: 6, production: 4, gold: 2, science: 2, culture: 2, happiness: 4, violence: 0, disaster: 0, siege: false,
    starving: false, unrest: false, atWar: false, distance: 5, isCityState: false, ...(over || {})
  };
}

const poor = sig("Rome", 0, { food: 3, production: 2, happiness: 1 });
const rich = sig("Ostia", 0, { food: 9, production: 5, happiness: 6, built: 2.3,
  builtItems: [{ name: "LOC_W", role: "prestige", points: 1.5, wonder: true }, { name: "LOC_WALLS", role: "safety", points: 0.8, wonder: false }] });
const foreign = sig("Athens", 4, { food: 8, production: 5, happiness: 5 });
const ranked = rankByProsperity([rich, poor, foreign]);
const pass = { ranked, ownerPop: { 0: 12, 4: 6 }, field: fieldContext(ranked) };
const nameOf = (s) => s.city.name;
const off = { slotted: false, unlocked: false, civic: "Citizenship" };
const stance = () => ({ open: off, closed: off });
const compositionOf = (city) => (city.name === "Rome"
  ? { total: 6, owner: 0, civs: [{ civ: 0, pts: 3, share: 0.5 }, { civ: 4, pts: 2, share: 0.34 }, { civ: 7, pts: 1, share: 0.16 }], dominant: null }
  : null);

function testPulls() {
  const away = pulledToward(poor, ranked, pass.ownerPop, nameOf);
  assert.ok(away.length >= 1 && away.length <= 3, "the strongest destinations, up to three");
  assert.equal(away[0].name, "Ostia", "the rich neighbour pulls hardest on the poor settlement");
  assert.equal(away[0].crossCiv, false);
  assert.equal(away[0].civ, "");
  assert.ok(away[0].pull > 0);
  assert.ok(away[0].why.length > 0 && away[0].why[0].weight > 0, "each carries the explainer's rows");
  assert.ok(away.every((r, i) => i === 0 || r.pull <= away[i - 1].pull), "strongest first");
  const drawn = drawnFrom(rich, ranked, pass.ownerPop, nameOf);
  assert.ok(drawn.rows.some((r) => r.name === "Rome"), "Rome's best destination is Ostia, so Ostia draws from Rome");
  assert.equal(drawn.count, drawn.rows.length);
  assert.ok(drawn.rows.every((r) => r.pull > 0 && r.why.length > 0));
  assert.deepEqual(pulledToward(rich, ranked, pass.ownerPop, nameOf).filter((r) => r.name === "Rome"), [],
    "nobody is pulled from the richer settlement toward the poorer one");
}

function testModel() {
  const m = settlementModel(poor, pass, { nameOf, stance, compositionOf });
  assert.equal(m.name, "Rome");
  assert.equal(m.pros, poor.pros);
  assert.ok(m.score.length >= 2, "the score's own terms");
  assert.ok(Math.abs(m.score.reduce((n, r) => n + r.weight, 0) - 1) < 1e-9, "the terms are shares that sum to one");
  assert.equal(m.pulledToward[0].name, "Ostia");
  assert.ok(m.fix && m.fix.options.length, "the poor settlement has a prescription");
  assert.deepEqual(m.stance, { open: off, closed: off });
  assert.equal(m.newcomers.count, 3, "three of Rome's six came from other civilizations");
  assert.deepEqual(m.newcomers.origins.map((o) => o.people), [2, 1], "by origin, largest first, the owner's own left out");
  assert.deepEqual(m.newcomers.all.map((o) => [o.name, o.people, o.ours]), [["Our own people", 3, true], ["an unmet people", 2, false], ["an unmet people", 1, false]],
    "the whole composition for the pie, the owner's own people named as such");
  assert.ok(m.bar > 0);
  const top = settlementModel(rich, pass, { nameOf, stance, compositionOf });
  assert.ok(top.drawnFrom.length >= 1, "the rich settlement draws from somewhere");
  assert.equal(top.fix, null, "and has no gap to close");
  // The hover lists the score's terms as signed shares, then the strongest pull's.
  const tip = pressureTip(m);
  assert.match(tip, /^What makes this settlement's score:\n  .+%/);
  assert.match(tip, /What pulls people toward Ostia:/);
  assert.equal(pressureTip(null), "");
  // The ledger: every term that prints, biggest first, and the total.
  const ledger = prosperityLedgerFor(m);
  const kept = m.score.filter((r) => Math.abs(r.delta) >= 0.05);
  assert.equal(ledger.total.toFixed(1), kept.reduce((n, r) => n + r.delta, 0).toFixed(1));
  const split = { "Government & celebrations": true, "Wonders & buildings": true }; // these appear as their pieces
  for (const r of kept) if (!split[r.label]) assert.ok(ledger.rows.some((l) => l.label === r.label), r.label + " keeps its row");
  assert.ok(ledger.rows.every((r, i) => i === 0 || Math.abs(r.delta) <= Math.abs(ledger.rows[i - 1].delta)), "biggest first");
  assert.deepEqual(prosperityLedgerFor(null), { total: 0, rows: [] });
  // The ledger: the four named rows always there, the pieces summing to the score, lines under the rows.
  const L = top.ledger;
  const labels = L.map((r) => r.label);
  for (const want of ["Wonders", "Buildings", "Government", "Celebrations"]) assert.ok(labels.includes(want), want + " is a row of its own");
  assert.ok(Math.abs(L.reduce((n, r) => n + r.delta, 0) - top.pros) < 1e-6, "the rows still sum to the score");
  const wonders = L.find((r) => r.key === "wonders");
  assert.equal(wonders.delta, 1.5);
  assert.deepEqual(wonders.sub, [{ label: "LOC_W", delta: 1.5 }], "the wonder named under it");
  assert.deepEqual(L.find((r) => r.key === "buildings").sub, [{ label: "LOC_WALLS", delta: 0.8 }]);
  const economy = L.find((r) => r.key === "economy");
  assert.ok(Math.abs(economy.sub.reduce((n, l) => n + l.delta, 0) - economy.delta) < 1e-9, "the yields sum to the economy row");
  assert.deepEqual(economy.sub.map((l) => l.label), ["Food", "Production", "Gold", "Science", "Culture"]);
  assert.match(L.find((r) => r.key === "population").sub[0].note, /^6 people/);
  assert.equal(L.find((r) => r.key === "celebration").sub[0].note, "no celebration running");
  const struck = settlementModel(sig("Veii", 0, { disaster: 2, disasterType: "RANDOM_EVENT_FLOOD" }), pass, { nameOf, stance, compositionOf });
  const dis = struck.ledger.find((r) => r.key === "disaster");
  assert.ok(dis && dis.delta < 0, "a struck settlement carries a Disaster row");
  assert.match(dis.sub[0].note, /^\d+ turns remaining \u00b7 \d+% of the base$/, "the turns its distress has left, then its share");
}

testPulls();
testModel();
console.log("settlement-model: ok");
