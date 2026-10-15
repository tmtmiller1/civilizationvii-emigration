// enclave-stage.mjs
//
// The enclave lifecycle in one module (emigration-enclave-stage.js): each stage, each thing that holds an
// enclave back, each ending, pinned against the shipped config; the classification the old code used agrees
// with the new one on a spread of inputs; and the readout words (emigration-enclave-stage-read.js) say the
// stage first and the next step in plain words.

import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => { KV[k] = v; } })
};
globalThis.Game = { age: 1, turn: 40 };
globalThis.GameContext = { localPlayerID: 0 };
globalThis.Players = { get: (pid) => ({ id: pid, isMajor: true }), getAlive: () => [] };

const stage = await import("/emigration/ui/emigration-enclave-stage.js");
const read = await import("/emigration/ui/emigration-enclave-stage-read.js");
const diaspora = await import("/emigration/ui/emigration-diaspora.js");
const quarter = await import("/emigration/ui/emigration-quarter.js");
const stateMod = await import("/emigration/ui/emigration-quarter-state.js");
const { QUARTER_FOOTHOLD_SHARE } = await import("/emigration/ui/emigration-tunables.js");
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const tipData = await import("/emigration/ui/emigration-enclave-tooltip-data.js");
const { STAGE, BLOCKER, enclaveStage, communityStage } = stage;

// The shipped config the stages are described against
{
  assert.equal(QUARTER_FOOTHOLD_SHARE, 0.25);
  assert.equal(CONFIG.quarterEstablishedShare, 0.3);
  assert.equal(CONFIG.quarterMinStock, 3);
  assert.equal(CONFIG.quarterEstablishedStock, 6);
  assert.equal(CONFIG.quarterDwellTurns, 8);
  assert.equal(CONFIG.quarterDwellGrace, 3);
  assert.equal(CONFIG.quarterCapPerAge, 3);
  assert.equal(CONFIG.quarterCooldownTurns, 12);
  assert.equal(CONFIG.quarterFadeShare, 0.125);
  assert.equal(CONFIG.quarterFadeTurns, 12);
  assert.equal(stage.ORIGIN_CAP, 2);
  assert.equal(quarter.__test.MAX_ENCLAVES_PER_CIV, stage.ORIGIN_CAP, "the formation code uses the same cap");
  assert.ok(Object.isFrozen(STAGE) && Object.isFrozen(BLOCKER));
}

const bars = { foothold: 0.25, established: 0.3, stockBar: 6, minStock: 3 };

// The old classification (emigration-diaspora.js before the stage module), kept here to prove agreement
function oldStage(share, stock, b) {
  const stockQ = b.stockBar > 0 && stock >= b.stockBar;
  if ((share >= b.established || stockQ) && stock >= b.minStock) return "established";
  if (share >= b.foothold && stock >= b.minStock) return "foothold";
  return "none";
}
{
  const shares = [0, 0.1, 0.249, 0.25, 0.29, 0.3, 0.45, 1, NaN];
  const stocks = [0, 2.9, 3, 5.9, 6, 12, NaN];
  const barSets = [bars, { ...bars, stockBar: 0 }, { foothold: 0.25, established: 0.18, stockBar: 3.6, minStock: 3 },
    { foothold: 0.25, established: 0.3, stockBar: 6, minStock: 0 }];
  let n = 0;
  for (const b of barSets) for (const sh of shares) for (const st of stocks) {
    assert.equal(communityStage(sh, st, b), oldStage(sh, st, b), `share ${sh} stock ${st} ${JSON.stringify(b)}`);
    n++;
  }
  assert.ok(n > 200);
  // The live path: diaspora's quarterStage now goes through the module and reads the same bars.
  const relaxes = [0, 0.2, 0.4];
  for (const r of relaxes) for (const sh of shares) for (const st of stocks) {
    const b = diaspora.stageBars(r);
    assert.equal(diaspora.__test.quarterStage(sh, st, r), oldStage(sh, st, b));
  }
  assert.equal(communityStage(0.5, 10, null), STAGE.NONE, "no bars, no stage");
}

// Each stage and its next step
{
  const none = enclaveStage({ share: 0.1, stock: 4, bars, relax: 0 });
  assert.equal(none.stage, STAGE.NONE);
  assert.equal(none.next.stage, STAGE.FOOTHOLD);
  assert.equal(none.next.shareBar, 0.25);
  assert.deepEqual(none.blockers, []);

  const foothold = enclaveStage({ share: 0.22 + 0.05, stock: 4, bars, relax: 0 });
  assert.equal(foothold.stage, STAGE.FOOTHOLD);
  assert.equal(foothold.next.stage, STAGE.ESTABLISHED);
  assert.equal(foothold.next.shareBar, 0.3);
  assert.equal(foothold.next.stockBar, 6, "the size bar is the other way in");

  const forming = enclaveStage({ share: 0.35, stock: 4, bars, relax: 0 });
  assert.equal(forming.stage, STAGE.ESTABLISHED);
  assert.equal(forming.forming, true, "qualifies, but no enclave has formed yet");

  const est = enclaveStage({ share: 0.35, stock: 4, bars, relax: 0, record: { recognized: false },
    dwell: { elapsed: 3, needed: 8 } });
  assert.equal(est.stage, STAGE.ESTABLISHED);
  assert.equal(est.forming, false);
  assert.equal(est.next.stage, STAGE.RECOGNIZED);
  assert.equal(est.next.turnsLeft, 5);
  assert.deepEqual(est.blockers, []);

  const rec = enclaveStage({ share: 0.35, stock: 4, bars, relax: 0, record: { recognized: true } });
  assert.equal(rec.stage, STAGE.RECOGNIZED);
  assert.equal(rec.next, null, "recognized is the last stage");
  assert.equal(rec.fading, false);
  const legacy = enclaveStage({ share: 0, stock: 0, bars, relax: 0, record: {} });
  assert.equal(legacy.stage, STAGE.RECOGNIZED, "a record with no flag was made at recognition");
}

// Each blocker
{
  const floor = enclaveStage({ share: 0.4, stock: 2, bars, relax: 0 });
  assert.equal(floor.stage, STAGE.NONE);
  assert.deepEqual(floor.blockers, [BLOCKER.STOCK_FLOOR], "the share is there but the people aren't");
  assert.deepEqual(enclaveStage({ share: 0.1, stock: 2, bars, relax: 0 }).blockers, [],
    "below the foothold share the floor isn't what holds it back");

  const capped = enclaveStage({ share: 0.27, stock: 4, bars, relax: 0, ageCapReached: true, originCount: 2 });
  assert.deepEqual(capped.blockers, [BLOCKER.AGE_CAP, BLOCKER.ORIGIN_CAP]);
  assert.deepEqual(enclaveStage({ share: 0.27, stock: 4, bars, relax: 0, originCount: 1 }).blockers, [],
    "one other enclave of the origin is allowed");

  const recRec = { recognized: false };
  const below = enclaveStage({ share: 0.2, stock: 4, bars, relax: 0, record: recRec, dwell: { elapsed: 1, needed: 8 } });
  assert.deepEqual(below.blockers, [BLOCKER.BELOW_BAR]);
  const asks = { asks: true, cooldownLeft: 6, decisionCapReached: false };
  const cool = enclaveStage({ share: 0.4, stock: 4, bars, relax: 0, record: recRec, throttle: asks });
  assert.deepEqual(cool.blockers, [BLOCKER.COOLDOWN]);
  assert.equal(cool.cooldownLeft, 6);
  const decided = enclaveStage({ share: 0.4, stock: 4, bars, relax: 0, record: recRec,
    throttle: { ...asks, decisionCapReached: true } });
  assert.deepEqual(decided.blockers, [BLOCKER.DECISION_CAP], "a spent age outranks the cooldown");
  const auto = enclaveStage({ share: 0.4, stock: 4, bars, relax: 0, record: recRec,
    throttle: { ...asks, asks: false } });
  assert.deepEqual(auto.blockers, [], "the decision throttle only applies when the player is asked");
  assert.equal(auto.cooldownLeft, 0);
  const originHeld = enclaveStage({ share: 0.4, stock: 4, bars, relax: 0, record: recRec, originCount: 2 });
  assert.deepEqual(originHeld.blockers, [BLOCKER.ORIGIN_CAP]);
  assert.equal(enclaveStage({ share: 0.27, stock: 4, bars, relax: 0.3 }).relax, 0.3, "pacing in force is reported");
}

// Endings: fading, with the tooltip's old countdown formula
{
  const oldLeft = (fadeTurns, turn, since) => Math.max(1, Math.ceil(fadeTurns - (turn - since)));
  for (const [turn, since] of [[40, 32], [40, 40], [40, 20], [41.5, 33]]) {
    assert.equal(stage.fadeTurnsLeft(since, turn, 12), oldLeft(12, turn, since));
  }
  assert.equal(stage.fadeTurnsLeft(null, 40, 12), null);
  const fading = enclaveStage({ share: 0.05, stock: 1, bars, relax: 0, record: { recognized: true, fadeSince: 32 },
    turn: 40, fadeTurns: 12 });
  assert.equal(fading.stage, STAGE.RECOGNIZED);
  assert.equal(fading.fading, true);
  assert.equal(fading.fadeTurnsLeft, 4);
  // The tooltip's stage, condition order unchanged
  const old = (rec) => {
    if (rec && typeof rec.fadeSince === "number") return "fading";
    if (rec && rec.contested) return "contested";
    return !rec || rec.recognized !== false ? "recognized" : "established";
  };
  for (const r of [null, {}, { recognized: false }, { recognized: true, contested: true },
    { recognized: false, contested: true }, { recognized: true, contested: true, fadeSince: 3 }]) {
    assert.equal(tipData.stageOf(r), old(r));
    assert.equal(stage.recordStage(r), old(r));
  }
}

// Per-origin count: the shared helper matches the formation code's count
{
  const entries = [
    { tileKey: "1,1", rec: { civ: 5, originCiv: "CIVILIZATION_ROME" } },
    { tileKey: "2,2", rec: { civ: 6, originCiv: "CIVILIZATION_ROME" } },
    { tileKey: "3,3", rec: { civ: 5, originCiv: null } },
    { tileKey: "4,4", rec: { civ: 7, originCiv: "CIVILIZATION_GREECE" } }
  ];
  const typeOf = (pid) => (pid === 5 ? "CIVILIZATION_ROME" : null);
  assert.equal(stage.countOriginEnclaves(entries, 5, "CIVILIZATION_ROME", null, typeOf), 3, "by civilization type");
  assert.equal(stage.countOriginEnclaves(entries, 5, "CIVILIZATION_ROME", "1,1", typeOf), 2, "its own tile left out");
  assert.equal(stage.countOriginEnclaves(entries, 7, null, null, typeOf), 1, "by player id without a type");
  for (const [k, rec] of [["9,1", { civ: 2 }], ["9,2", { civ: 2 }], ["9,3", { civ: 3 }]]) {
    stateMod.putQuarter(k, { owner: 0, optionId: "ignore", turn: 1, applied: {}, contested: false, contestedTurn: -999,
      recognized: true, ...rec });
  }
  assert.equal(quarter.__test.enclaveCountForCiv(0, 2, null, null), 2);
  assert.equal(quarter.__test.enclaveCountForCiv(0, 2, null, "9,1"), 1);
}

// The decision throttle read leaves the throttle alone
{
  const before = JSON.stringify(stateMod.__test.readStateForTest());
  const t = stateMod.decisionThrottle(100, 1);
  assert.equal(t.decisionCapReached, false);
  assert.equal(t.cooldownLeft, 0);
  stateMod.noteDecision(95);
  assert.equal(stateMod.decisionThrottle(100, 1).cooldownLeft, 7, "12 turns after turn 95");
  assert.equal(stateMod.decisionThrottle(100, 9).decisionCapReached, false, "a new age reads as a fresh count");
  assert.notEqual(JSON.stringify(stateMod.__test.readStateForTest()), before, "noteDecision did change it");
  const mid = JSON.stringify(stateMod.__test.readStateForTest());
  stateMod.decisionThrottle(200, 9);
  assert.equal(JSON.stringify(stateMod.__test.readStateForTest()), mid, "the read itself changes nothing");
}

// The readout words: the stage leads, the next step follows, blockers in plain words
{
  const view = (info, extra) => ({ civ: 2, civAdj: "Greek", record: null, info, stanceLabel: "", ...extra });
  const foot = view(enclaveStage({ share: 0.22 + 0.05, stock: 4, bars: { ...bars, stockBar: 0 }, relax: 0 }));
  assert.equal(read.stageLine(foot), "Greek community: foothold");
  assert.equal(read.nextLine(foot, "Mutsu"), "Becomes an enclave at 30% of Mutsu (now 27%)");
  const footSize = view(enclaveStage({ share: 0.27, stock: 4, bars, relax: 0 }));
  assert.equal(read.nextLine(footSize, "Mutsu"),
    "Becomes an enclave at 30% of Mutsu (now 27%) or at 6 population (now 4)");
  const none = view(enclaveStage({ share: 0.1, stock: 4, bars, relax: 0 }));
  assert.equal(read.stageLine(none), "Greek community");
  assert.equal(read.nextLine(none, "Mutsu"), "Gains a foothold at 25% of Mutsu (now 10%)");
  const est = view(enclaveStage({ share: 0.35, stock: 4, bars, relax: 0, record: { recognized: false },
    dwell: { elapsed: 3, needed: 8 } }), { record: { recognized: false } });
  assert.equal(read.stageLine(est), "Greek enclave: established");
  assert.equal(read.nextLine(est, "Mutsu"), "Recognized in 5 turns if it holds");
  const due = view(enclaveStage({ share: 0.35, stock: 4, bars, relax: 0, record: { recognized: false },
    dwell: { elapsed: 9, needed: 8 } }));
  assert.equal(read.nextLine(due, "Mutsu"), "Ready to be recognized");
  const rec = view(enclaveStage({ share: 0.35, stock: 4, bars, relax: 0, record: { recognized: true } }),
    { stanceLabel: "Merchants' Guild" });
  assert.equal(read.stageLine(rec), "Greek enclave: recognized (Merchants' Guild)");
  assert.equal(read.nextLine(rec, "Mutsu"), "");
  assert.equal(read.stageLine({ ...rec, stanceLabel: "" }), "Greek enclave: recognized, left to itself");
  const fading = view(enclaveStage({ share: 0.05, stock: 1, bars, relax: 0, record: { recognized: true, fadeSince: 32 },
    turn: 40, fadeTurns: 12 }));
  assert.equal(read.stageLine(fading), "Greek enclave: fading, 4 turns left");
  assert.equal(read.nextLine(fading, "Mutsu"), "Stays if its people get back to 12.5% of Mutsu");

  const capped = view(enclaveStage({ share: 0.27, stock: 4, bars, relax: 0.4, ageCapReached: true, originCount: 2 }));
  assert.deepEqual(read.blockerLines(capped, "Mutsu"), [
    "This age's enclaves are all formed",
    "This civilization already has 2 Greek enclaves in other cities",
    "The bars are 40% lower this age, until an enclave forms"
  ]);
  const floor = view(enclaveStage({ share: 0.4, stock: 2, bars, relax: 0 }));
  assert.deepEqual(read.blockerLines(floor, "Mutsu"), ["Needs at least 3 population of its own (now 2)"]);
  const cool = view(enclaveStage({ share: 0.4, stock: 4, bars, relax: 0, record: { recognized: false },
    throttle: { asks: true, cooldownLeft: 6, decisionCapReached: false } }));
  assert.deepEqual(read.blockerLines(cool, "Mutsu"), ["Waiting 6 turns after the last enclave decision"]);
  const below = view(enclaveStage({ share: 0.2, stock: 4, bars, relax: 0, record: { recognized: false } }));
  assert.deepEqual(read.blockerLines(below, "Mutsu"), ["Waits while its people are below 30% of Mutsu"]);
  const forming = view(enclaveStage({ share: 0.35, stock: 4, bars, relax: 0 }));
  assert.equal(read.stageLine(forming), "Greek community: ready to become an enclave");
  assert.equal(read.nextLine(forming, "Mutsu"), "The enclave forms at the next migration");
}

// The City Details readout: the stage line leads the enclave lines, then the next step and the blockers
{
  const { readoutModel } = await import("/emigration/ui/emigration-city-readout.js");
  const m = readoutModel({ cityName: "Mutsu", causeLabel: "Prosperity", ownerNet: 0,
    enclave: { stage: "Greek community: foothold", next: "Becomes an enclave at 30% of Mutsu (now 22%)",
      blockers: ["This age's enclaves are all formed"] } });
  const i = m.lines.indexOf("Greek community: foothold");
  assert.ok(i >= 0, m.lines.join(" | "));
  assert.equal(m.lines[i + 1], "Becomes an enclave at 30% of Mutsu (now 22%)");
  assert.equal(m.lines[i + 2], "This age's enclaves are all formed");
  assert.ok(!m.lines.some((l) => /^Enclave: /.test(l)), "the old technical line is gone");
}

console.log("enclave-stage.mjs: all assertions passed");
