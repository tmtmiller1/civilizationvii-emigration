// treatment.mjs
//
// The community treatment cards and the Consular Protection card (emigration-borders.js readers,
// emigration-treatment.js payout share and Chronicle line, emigration-consular.js Influence and grievances),
// and enclave records following a captured settlement (emigration-quarter-hosts.js). Engine surfaces are
// small stubs: slotted traditions per player, a war table, a city table, and a recorded Diplomacy call.

import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => { KV[k] = v; } })
};
globalThis.Game = { age: 1, turn: 5 };
globalThis.GameContext = { localPlayerID: 0 };
globalThis.Database = { makeHash: (s) => "H_" + s };
globalThis.YieldTypes = { YIELD_DIPLOMACY: "YD", YIELD_CULTURE: "YC", YIELD_GOLD: "YG", YIELD_HAPPINESS: "YH" };

/** @type {Record<number, Set<string>>} */
const ACTIVE = {};
/** @type {Set<string>} "a>b" pairs at war (mutual). */
const WARS = new Set();
const GRANTS = [];
const GRIEVANCES = [];
const MINORS = new Set([9]);
let grievanceApi = true;
const slot = (pid, ...types) => { ACTIVE[pid] = new Set(types.map((t) => "H_" + t)); };
globalThis.Players = {
  getAlive: () => [0, 1, 2, 3, 4, 5, 6, 9].map((id) => ({ id })),
  get: (pid) => ({
    id: pid,
    isMajor: !MINORS.has(pid),
    Culture: { isTraditionActive: (h) => !!(ACTIVE[pid] && ACTIVE[pid].has(h)) },
    Diplomacy: {
      isAtWarWith: (o) => WARS.has(pid + ">" + o) || WARS.has(o + ">" + pid),
      ...(grievanceApi ? { changeNumGrievances: (target, n) => GRIEVANCES.push({ on: pid, target, n }) } : {})
    }
  }),
  grantYield: (pid, yt, amount) => GRANTS.push({ pid, yt, amount })
};
/** @type {Record<string, {owner:number, name:string}>} */
const CITIES = {};
globalThis.MapCities = { getCity: (x, y) => (CITIES[x + "," + y] ? x + "," + y : null) };
globalThis.Cities = {
  get: (id) => {
    const c = CITIES[id];
    if (!c) return null;
    const [x, y] = id.split(",").map(Number);
    return { location: { x, y }, owner: c.owner, name: c.name };
  }
};

const borders = await import("/emigration/ui/emigration-borders.js");
const treatment = await import("/emigration/ui/emigration-treatment.js");
const consular = await import("/emigration/ui/emigration-consular.js");
const stateMod = await import("/emigration/ui/emigration-quarter-state.js");
const quarter = await import("/emigration/ui/emigration-quarter.js");
const hosts = await import("/emigration/ui/emigration-quarter-hosts.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { msgText } = await import("/emigration/ui/emigration-loc.js");

const P_AQ = "TRADITION_EMIG_PROTECT_ANTIQUITY";
const S_AQ = "TRADITION_EMIG_SUSPECT_ANTIQUITY";
const S_MO = "TRADITION_EMIG_SUSPECT_MODERN";
const C_EX = "TRADITION_EMIG_CONSULAR_EXPLORATION";
const close = (a, b) => Math.abs(a - b) < 1e-9;
const fresh = () => borders.resetBorderCache();

// treatmentStance / treatmentCard / hasConsular, and the cancel rule
{
  slot(1);
  slot(2, P_AQ);
  slot(3, S_MO);
  slot(4, P_AQ, S_AQ);
  slot(5, C_EX);
  fresh();
  assert.equal(borders.treatmentStance(1), null, "no treatment card reads as null");
  assert.equal(borders.treatmentStance(2), "protect");
  assert.equal(borders.treatmentStance(3), "suspect");
  assert.equal(borders.treatmentStance(4), null, "one card of each kind cancels to null");
  assert.equal(borders.treatmentCard(3), S_MO, "the slotted card's type is readable for naming it");
  assert.equal(borders.treatmentCard(4), null);
  assert.equal(borders.treatmentStance(undefined), null, "a missing player id reads as null");
  assert.equal(borders.hasConsular(5), true);
  assert.equal(borders.hasConsular(2), false);
  CONFIG.bordersEnabled = false;
  assert.equal(borders.treatmentStance(3), "suspect", "the treatment read doesn't depend on the border option");
  CONFIG.bordersEnabled = true;
}

// A reader outside the pass (a tooltip, an AI civ's turn) sees a card change once the turn moves on
{
  slot(7, S_AQ);
  fresh();
  assert.equal(borders.treatmentStance(7), "suspect");
  slot(7, P_AQ);
  assert.equal(borders.treatmentStance(7), "suspect", "within a turn the cached read stands");
  Game.turn += 1;
  assert.equal(borders.treatmentStance(7), "protect", "a new turn reads the cards again");
}

// immigrationOpenness: a suspicion card multiplies the border stance, still floored
{
  CONFIG.openBordersOpenness = 1.5;
  CONFIG.closedBordersOpenness = 0.4;
  CONFIG.opennessFloor = 0.15;
  slot(11, S_AQ);
  slot(12, S_AQ, "TRADITION_EMIG_CLOSED_BORDERS_ANTIQUITY");
  slot(13, S_AQ, "TRADITION_EMIG_OPEN_BORDERS_ANTIQUITY");
  slot(14, S_AQ, P_AQ);
  slot(15);
  fresh();
  assert.ok(close(borders.immigrationOpenness(11), 0.75), "suspicion alone: 25% fewer arrivals");
  assert.ok(close(borders.immigrationOpenness(12), 0.3), "with Anti-Immigration: 0.4 x 0.75");
  assert.ok(close(borders.immigrationOpenness(13), 1.125), "with Pro-Immigration: 1.5 x 0.75");
  assert.equal(borders.immigrationOpenness(14), 1, "cancelled treatment leaves openness alone");
  assert.equal(borders.immigrationOpenness(15), 1);
  CONFIG.closedBordersOpenness = 0.18;
  fresh();
  assert.ok(close(borders.immigrationOpenness(12), 0.15), "the floor still holds: 0.135 floors to 0.15");
  CONFIG.closedBordersOpenness = 0.4;
}

// payout share: protect / suspect / neither, in war and peace
{
  CONFIG.contestedQuarterYieldFactor = 0.5;
  slot(1);
  slot(2, P_AQ);
  slot(3, S_AQ);
  fresh();
  const f = treatment.treatmentPayoutFactor;
  assert.equal(f(1, false), 1, "neither, peace: full");
  assert.equal(f(1, true), 0.5, "neither, war: the contested half");
  assert.equal(f(2, false), 1, "protect, peace: full");
  assert.equal(f(2, true), 1, "protect, war: still full");
  assert.equal(f(3, false), 0.5, "suspect, peace: half");
  assert.equal(f(3, true), 0.25, "suspect, war: half of the contested half");
  assert.equal(treatment.treatmentBenefitScale({ owner: 2, contested: true }), 1);
  assert.equal(treatment.treatmentBenefitScale({ owner: 3, contested: false }), 0.5);
  assert.equal(quarter.contestedBenefitScale({ contested: true }), 0.5, "a record with no host keeps the old cut");
  assert.equal(quarter.contestedBenefitScale(null), 1);

  // The one-off payout at recognition: Game.age has no GameInfo here, so the age floor is 60.
  const { resolveApplied } = quarter.__test;
  WARS.add("2>6");
  WARS.add("1>6");
  const opt = { benefitYield: "YIELD_CULTURE" };
  assert.equal(resolveApplied(opt, 1, 4).benefitAmount, 60, "neither, peace: the full floor");
  assert.equal(resolveApplied(opt, 1, 6).benefitAmount, 30, "neither, at war with the homeland: half");
  assert.equal(resolveApplied(opt, 2, 6).benefitAmount, 60, "protect at war: full");
  assert.equal(resolveApplied(opt, 3, 4).benefitAmount, 30, "suspect in peace: half, at payout time");
  assert.equal(resolveApplied(opt, 3, 4).penaltyAmount, 90, "the price is unchanged");
}

// the contested Chronicle line names the host's card
{
  const rec = { civ: 6, owner: 3, contested: true };
  const suspect = msgText(treatment.contestedEntry("1,1", rec, 9).body);
  assert.ok(suspect.includes("Watched Quarters") && suspect.includes("falls hardest"), suspect);
  const protect = msgText(treatment.contestedEntry("1,1", { ...rec, owner: 2 }, 9).body);
  assert.ok(protect.includes("Guest Right") && protect.includes("holds"), protect);
  const plain = treatment.contestedEntry("1,1", { ...rec, owner: 1 }, 9);
  assert.equal(plain.body.k, "LOC_EMIG_QTR_CHRON_RESTLESS_BODY", "without a card the shipped line stays");
  assert.equal(plain.dedupeKey, "quarter:contested:1,1|6|9");
  for (const s of [suspect, protect]) {
    assert.ok(!/disloyal|traitor|fifth column|threat/i.test(s), "the line never casts the families as a threat");
  }
}

// Consular Protection: +1 Influence per recognised enclave abroad, capped, once per turn
{
  const rec = (civ, owner, extra) => ({ civ, owner, optionId: "ignore", turn: 1, applied: {}, contested: false,
    contestedTurn: -999, recognized: true, ...extra });
  stateMod.putQuarter("1,0", rec(5, 1));
  stateMod.putQuarter("2,0", rec(5, 2));
  stateMod.putQuarter("3,0", rec(5, 3));
  stateMod.putQuarter("4,0", rec(5, 4));
  stateMod.putQuarter("6,0", rec(5, 6));
  stateMod.putQuarter("7,0", rec(5, 1, { recognized: false }));
  stateMod.putQuarter("8,0", rec(5, 5));
  slot(5, C_EX);
  fresh();
  assert.equal(consular.enclavesAbroad(5), 5, "unrecognised and home enclaves don't count");
  assert.equal(consular.consularInfluence(5), consular.CONSULAR_INFLUENCE_CAP, "capped at +4");
  GRANTS.length = 0;
  assert.equal(consular.tickConsular(5), 4);
  assert.deepEqual(GRANTS, [{ pid: 5, yt: "YD", amount: 4 }], "granted as Influence through grantYield");
  assert.equal(consular.tickConsular(5), 0, "a second tick in the same turn pays nothing");
  Game.turn += 1;
  assert.equal(consular.tickConsular(5), 4, "the next turn pays again");
  slot(5);
  fresh();
  assert.equal(consular.consularInfluence(5), 0, "without the card it pays nothing");
  assert.equal(consular.tickConsular(5), 0);
}

// Consular grievances: once per host per age, only against a host with a suspicion card
{
  slot(5, C_EX);
  slot(1, S_AQ); // host 1 watches the enclave at 1,0 (and the unrecognised one at 7,0)
  slot(2, P_AQ);
  slot(3);
  slot(4, S_AQ, P_AQ); // cancelled
  slot(6, S_AQ);
  fresh();
  GRIEVANCES.length = 0;
  assert.equal(consular.checkConsularGrievances(), 2, "hosts 1 and 6 have a suspicion card");
  assert.deepEqual(GRIEVANCES.map((g) => g.on).sort(), [1, 6], "booked on each host, the civ that did the wrong");
  assert.ok(GRIEVANCES.every((g) => g.target === 5 && g.n === consular.CONSULAR_GRIEVANCES * 1000),
    "aimed at the consular civ, in n/1000 units");
  assert.equal(consular.checkConsularGrievances(), 0, "stamped: once per host per age");
  assert.ok(String(KV[consular.__test.STATE_KEY]).includes("5>1"), "the stamp is saved with the game");
  Game.age = 2;
  assert.equal(consular.checkConsularGrievances(), 2, "a new age allows one more");
  Game.age = 3;
  grievanceApi = false;
  GRIEVANCES.length = 0;
  assert.equal(consular.checkConsularGrievances(), 0, "a missing engine call lodges nothing");
  grievanceApi = true;
  assert.equal(consular.checkConsularGrievances(), 2, "and leaves no stamp, so it goes through later");
  slot(5);
  fresh();
  Game.age = 4;
  assert.equal(consular.checkConsularGrievances(), 0, "without Consular Protection nothing is lodged");
  Game.age = 1;
}

// Enclave records follow a captured settlement
{
  const rec = { civ: 6, owner: 1, optionId: "ignore", turn: 1, applied: {}, contested: false, contestedTurn: -999,
    recognized: true };
  stateMod.putQuarter("10,10", rec);
  CITIES["10,10"] = { owner: 1, name: "Argos" };
  hosts.reconcileQuarterHosts();
  assert.equal(stateMod.quarterAt("10,10").owner, 1, "an unchanged owner stays");
  assert.equal(stateMod.quarterAt("10,10").hostName, "Argos", "the settlement's name is kept on the record");
  CITIES["10,10"].owner = 2;
  hosts.reconcileQuarterHosts();
  assert.equal(stateMod.quarterAt("10,10").owner, 2, "the record follows the city to its captor");
  assert.ok(stateMod.quartersForOwner(2).some((e) => e.tileKey === "10,10"), "the new host's upkeep finds it");
  assert.ok(!stateMod.quartersForOwner(1).some((e) => e.tileKey === "10,10"), "the old host's doesn't");
  CITIES["10,10"].owner = 9; // an independent takes it
  hosts.reconcileQuarterHosts();
  assert.equal(stateMod.quarterAt("10,10").owner, 9);
  assert.ok(!quarter.__test.recordOwners(0).includes(9), "a minor holder gets no upkeep");
  stateMod.saveQuarters();
  const saved = JSON.parse(KV[stateMod.__test.STATE_KEY]).data.tiles["10,10"];
  assert.equal(saved.owner, 9, "the new owner persists");
  assert.equal(saved.hostName, "Argos", "and so does the name");
  delete CITIES["10,10"];
  hosts.reconcileQuarterHosts();
  assert.ok(stateMod.quarterAt("10,10"), "a vanished settlement with no burned chapter keeps current behaviour");
  const saveMap = globalThis.MapCities;
  globalThis.MapCities = undefined;
  CITIES["11,11"] = { owner: 3, name: "Delphi" };
  stateMod.putQuarter("11,11", { ...rec, owner: 1 });
  hosts.reconcileQuarterHosts();
  assert.equal(stateMod.quarterAt("11,11").owner, 1, "an unreadable city lookup leaves the record alone");
  globalThis.MapCities = saveMap;
  assert.deepEqual(hosts.settlementAt("bad"), null);
}

console.log("treatment.mjs: all assertions passed");
