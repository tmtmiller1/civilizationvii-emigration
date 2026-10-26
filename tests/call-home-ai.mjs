import assert from "node:assert/strict";

// AI civilizations call their people home: the rule fires only when the civ is calm, only off cooldown, only
// when it can afford the quote, never for a human; internal before external, external only with money to
// spare after the internal bill; the currency with more headroom pays; a human host whose city lost people
// gets one notice per city.

globalThis.Game = { turn: 40 };
const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { CALL_HOME_CURRENCY, CALL_HOME_SCOPE, callHomeQuote } = await import("/emigration/ui/emigration-call-home.js");
const { aiCallHomeOnTurn, isCalmFromSignals, personValue, pickCurrency, planAiCalls, sizeByTreasury, sizeByValue } =
  await import("/emigration/ui/emigration-call-home-ai.js");

const ROME = 2;
const HUMAN = 0;
const IN = CALL_HOME_SCOPE.INTERNAL;
const EX = CALL_HOME_SCOPE.EXTERNAL;
const GOLD = CALL_HOME_CURRENCY.GOLD;
const INFL = CALL_HOME_CURRENCY.INFLUENCE;

/** Rome's people: 2 fled Rome for its own Ostia; 3 fled Rome into the human's Lagash. */
const FLOWS = [
  { src: ROME, dest: ROME, srcCity: "Rome", destCity: "Ostia", points: 2, byCause: { war: 200 } },
  { src: ROME, dest: HUMAN, srcCity: "Rome", destCity: "Lagash", points: 3, byCause: { war: 300 } }
];
/** A calm Rome: two settlements, neither in distress (no situational terms at all). Rome itself yields 60 a turn
 * over 10 heads, so one returning person is worth 6 a turn: 96 over two cooldowns of 8. */
const CALM = [
  { owner: ROME, key: "r", name: "Rome", population: 10, food: 20, production: 15, gold: 10, science: 10, culture: 5, pros: 40 },
  { owner: ROME, key: "o", name: "Ostia", population: 4, food: 8, production: 4, gold: 2, science: 1, culture: 1, pros: 10 },
  { owner: HUMAN, key: "l", name: "Lagash", population: 8 }
];
/** The live-city stand-in: the kept signal's own name, so `homeSignal` finds a pair's home. */
const LIVE_NAMED = (/** @type {*} */ sig) => ({ owner: sig.owner, name: sig.name });

/** @type {{pid:number, scope:string, currency:number}[]} */
let calls = [];
/** @type {{caller:number, city:string, host:number, people:number}[]} */
let notices = [];

function seams(over = {}) {
  return {
    isAi: (pid) => pid === ROME,
    isHumanOwner: (pid) => pid === HUMAN,
    signals: () => CALM,
    resolve: LIVE_NAMED,
    balance: (_pid, c) => (c === GOLD ? 4000 : 4000),
    income: () => 10,
    favour: () => null,
    cooldown: () => 0,
    flows: FLOWS,
    call: (pid, scope, currency, deps) => {
      calls.push({ pid, scope, currency });
      // Move everyone the quote lists, as a certain internal call would.
      let returned = 0;
      for (const f of FLOWS) {
        const external = f.dest !== ROME;
        if ((scope === EX) !== external) continue;
        for (let i = 0; i < f.points; i++) if (deps.move({ from: f.destCity, home: f.srcCity, host: f.dest, points: f.points })) returned++;
      }
      return { ok: returned > 0, reason: returned > 0 ? "returned" : "nobody-came", scope, paid: 100, attempted: returned, returned };
    },
    move: () => true,
    notify: (caller, city, host, people) => notices.push({ caller, city, host, people }),
    ...over
  };
}

function reset() {
  calls = [];
  notices = [];
  CONFIG.callHomeEnabled = true;
  CONFIG.callHomeAi = true;
  CONFIG.callHomeMaxPointsPerAttempt = 3;
  CONFIG.callHomeGoldPerPoint = 60;
  CONFIG.callHomeInfluencePerPoint = 12;
  CONFIG.callHomeExternalCostScale = 1.5;
  CONFIG.callHomeAgeCostStep = 3;
  CONFIG.callHomeCooldownTurns = 8;
  CONFIG.homecomingEnabled = false; // these cover the paid internal call, which homecoming replaces
}

const LIVE = (/** @type {*} */ sig) => ({ owner: sig.owner });

function testCalmRead() {
  assert.equal(isCalmFromSignals(CALM, ROME, LIVE), true, "no distress is calm");
  assert.equal(isCalmFromSignals(CALM, 7, LIVE), false, "no settlement of its own is not calm");
  assert.equal(isCalmFromSignals([], ROME, LIVE), false, "no signals is not calm");
  assert.equal(isCalmFromSignals(null, ROME, LIVE), false);
  // A siege on one settlement: situationalPercent goes negative through the siege term.
  const sieged = [{ owner: ROME, key: "r", siege: 1, war: 0 }, { owner: ROME, key: "o" }];
  assert.equal(isCalmFromSignals(sieged, ROME, LIVE), false, "a settlement under siege is not calm");
  // A settlement gone or changed hands since the pass: not calm, and its distress is never read.
  const lostOne = (/** @type {*} */ sig) => (sig.key === "o" ? null : { owner: sig.owner });
  assert.equal(isCalmFromSignals(CALM, ROME, lostOne), false, "a settlement lost since the pass is not calm");
}

async function testPassCacheHoldsNoCityObject() {
  const ps = await import("/emigration/ui/emigration-pass-signals.js");
  let touched = 0;
  const city = { get id() { touched++; return { owner: ROME, id: 7, type: 1 }; } };
  const ranked = [{ owner: ROME, key: "r", violence: 2, city }];
  assert.equal(ps.rememberPassRanked(ranked), ranked, "the pass gets its own list back");
  const kept = ps.lastPassRanked()[0];
  assert.equal("city" in kept, false, "the kept signal holds no engine city object");
  assert.deepEqual(kept.cid, { owner: ROME, id: 7, type: 1 }, "it holds the city's id as plain numbers");
  assert.equal(touched, 1, "the city object is read once, at the pass");
  // freshCity resolves through Cities.get and refuses a city whose owner changed.
  globalThis.Cities = { get: (cid) => (cid.id === 7 ? { owner: 4 } : null) };
  assert.equal(ps.freshCity(kept), null, "a city now owned by someone else resolves to null");
  globalThis.Cities = { get: () => ({ owner: ROME }) };
  assert.deepEqual(ps.freshCity(kept), { owner: ROME }, "a city still held resolves to the live object");
  globalThis.Cities = { get: () => { throw new Error("gone"); } };
  assert.equal(ps.freshCity(kept), null, "a lookup that throws resolves to null");
  delete globalThis.Cities;
  assert.equal(ps.freshCity(kept), null, "off-engine resolves to null");
}

function testCurrencyPick() {
  assert.deepEqual(pickCurrency({ gold: 500, influence: 50 }, { gold: 100, influence: 20 }), { currency: GOLD, cost: 100 }, "5x vs 2.5x headroom: gold");
  assert.deepEqual(pickCurrency({ gold: 150, influence: 90 }, { gold: 100, influence: 20 }), { currency: INFL, cost: 20 }, "1.5x vs 4.5x: influence");
  assert.deepEqual(pickCurrency({ gold: 50, influence: 90 }, { gold: 100, influence: 20 }), { currency: INFL, cost: 20 }, "only influence covers it");
  assert.equal(pickCurrency({ gold: 50, influence: 10 }, { gold: 100, influence: 20 }), null, "neither covers it");
}

function testValueAndSizes() {
  // One Roman is worth (20+15+10+10+5)/10 = 6 a turn, over two cooldowns of 8: 96. A favoured yield counts twice.
  CONFIG.callHomeCooldownTurns = 8;
  assert.equal(personValue(CALM[0], null), 96);
  assert.equal(personValue(CALM[0], "YIELD_FOOD"), 128, "the favoured yield counts twice");
  assert.equal(personValue(null, null), 0, "a home the pass didn't see is worth nothing");
  // Internal in Gold: the 1st person's fee is 60 (under 96), the 2nd's marginal 110 (over): one.
  const qIn = { scope: IN, points: 3, chance: 1 };
  assert.equal(sizeByValue(qIn, GOLD, 96), 1);
  // Internal in Influence: 12, 22, 28 marginal: all three.
  assert.equal(sizeByValue(qIn, INFL, 96), 3);
  // Worth nothing: no call. A rich city (worth 300): all three even in Gold (60, 110, 142).
  assert.equal(sizeByValue(qIn, GOLD, 0), 0);
  assert.equal(sizeByValue(qIn, GOLD, 300), 3);
  // External: the odds price in. At 18%, 96 is worth 17.3 per attempt: under the 1st Gold fee (90), under the
  // 1st Influence fee (18) too: no external call unless the person is worth a lot.
  const qEx = { scope: EX, points: 3, chance: 0.18 };
  assert.equal(sizeByValue(qEx, GOLD, 96), 0);
  assert.equal(sizeByValue(qEx, INFL, 96), 0);
  assert.equal(sizeByValue(qEx, INFL, 300), 3, "a rich home (54 per attempt) makes abroad worth three in Influence (18, 33, 43)");
  assert.equal(sizeByValue(qEx, INFL, 200), 2, "at 36 per attempt, two (the third marginal is 43)");
  // Treasury: a quarter of the balance caps the call; a deficit without a reserve stops it.
  assert.equal(sizeByTreasury(3, IN, GOLD, 4000, 10), 3);
  assert.equal(sizeByTreasury(3, IN, GOLD, 500, 10), 1, "125 covers one (60), not two (170)");
  assert.equal(sizeByTreasury(3, IN, GOLD, 200, 10), 0, "50 covers nobody");
  assert.equal(sizeByTreasury(3, IN, GOLD, 4000, -600), 0, "in deficit under eight turns of reserve: no call");
  assert.equal(sizeByTreasury(3, IN, GOLD, 5000, -600), 3, "in deficit with the reserve: fine");
  assert.equal(sizeByTreasury(0, IN, GOLD, 4000, 10), 0);
}

function testPlanOrderAndSpare() {
  // Rich and calm: two Romans are away internally; Influence buys both (Gold would buy one), and the external
  // call is not worth it at 18% odds, so only the internal call is planned.
  let plan = planAiCalls(ROME, seams());
  assert.deepEqual(plan.map((p) => [p.scope, p.currency, p.points]), [[IN, INFL, 2]], "internal, both who are away, in Influence (Gold would buy one)");
  // No Influence: Gold buys one person (the second isn't worth 110).
  plan = planAiCalls(ROME, seams({ balance: (_p, c) => (c === GOLD ? 4000 : 0) }));
  assert.deepEqual(plan.map((p) => [p.scope, p.currency, p.points]), [[IN, GOLD, 1]]);
  // A poor civ: 100 Gold, no Influence, a quarter is 25: nobody.
  plan = planAiCalls(ROME, seams({ balance: (_p, c) => (c === GOLD ? 100 : 0) }));
  assert.deepEqual(plan, [], "cannot pay within the treasury share: no call");
  // A deficit without a reserve: nobody, however rich the home.
  plan = planAiCalls(ROME, seams({ income: () => -600 }));
  assert.deepEqual(plan, [], "in deficit without eight turns of reserve: no call");
  // A home that is worth a lot and a favoured yield: the external call is planned too, from what is left.
  const rich = [{ ...CALM[0], food: 200, production: 200, gold: 200, science: 200, culture: 200 }, CALM[1], CALM[2]];
  plan = planAiCalls(ROME, seams({ signals: () => rich, favour: () => "YIELD_SCIENCE" }));
  assert.deepEqual(plan.map((p) => p.scope), [IN, EX], "internal first, then external when worth it");
  // The internal call on cooldown: the external one still goes.
  plan = planAiCalls(ROME, seams({ signals: () => rich, cooldown: (_p, scope) => (scope === IN ? 3 : 0) }));
  assert.deepEqual(plan.map((p) => p.scope), [EX], "internal on cooldown, external off it");
  // Nobody away: nothing.
  plan = planAiCalls(ROME, seams({ flows: [] }));
  assert.deepEqual(plan, []);
  // A home the pass didn't see is worth nothing: nobody is called back to it.
  plan = planAiCalls(ROME, seams({ signals: () => [CALM[1], CALM[2]] }));
  assert.deepEqual(plan, [], "an unseen home city gets nobody");
}

function testPairOrder() {
  // Two internal pairs: Rome (prosperity 40) and Ostia (10). The quote lists the bigger group first; the AI's
  // order puts the needier home (Ostia) first.
  const flows = [
    { src: ROME, dest: ROME, srcCity: "Rome", destCity: "Tibur", points: 3, byCause: { war: 300 } },
    { src: ROME, dest: ROME, srcCity: "Ostia", destCity: "Tibur", points: 1, byCause: { war: 100 } }
  ];
  /** @type {string[]} */ const homes = [];
  aiCallHomeOnTurn(ROME, seams({ flows, call: (pid, scope, currency, deps) => {
    calls.push({ pid, scope, currency });
    const q = callHomeQuote(pid, scope, currency, flows, { resolvable: deps.resolvable, order: deps.order });
    for (const p of q.pairs) homes.push(p.home);
    return { ok: true, reason: "returned", scope, paid: 1, attempted: 1, returned: 1 };
  } }));
  assert.deepEqual(homes, ["Ostia", "Rome"], "the needier home city is served first");
}

function testGates() {
  reset();
  aiCallHomeOnTurn(HUMAN, seams());
  assert.equal(calls.length, 0, "never for a human");
  aiCallHomeOnTurn(ROME, seams({ signals: () => [{ owner: ROME, key: "r", siege: 1 }] }));
  assert.equal(calls.length, 0, "not while a settlement is in distress");
  aiCallHomeOnTurn(ROME, seams({ cooldown: () => 5 }));
  assert.equal(calls.length, 0, "not on cooldown");
  aiCallHomeOnTurn(ROME, seams({ balance: () => 10 }));
  assert.equal(calls.length, 0, "not when it cannot pay");
  CONFIG.callHomeAi = false;
  aiCallHomeOnTurn(ROME, seams());
  assert.equal(calls.length, 0, "not with the setting off");
  CONFIG.callHomeAi = true;
  CONFIG.callHomeEnabled = false;
  aiCallHomeOnTurn(ROME, seams());
  assert.equal(calls.length, 0, "not with call home off altogether");
}

function testCallsAndNotice() {
  reset();
  const rich = [{ ...CALM[0], food: 200, production: 200, gold: 200, science: 200, culture: 200 }, CALM[1], CALM[2]];
  const r = aiCallHomeOnTurn(ROME, seams({ signals: () => rich }));
  assert.deepEqual(calls.map((c) => c.scope), [IN, EX], "calm, away, off cooldown, rich home: both calls");
  assert.equal(r.called, 2);
  assert.equal(r.returned, 5);
  assert.equal(notices.length, 1, "one notice for the human host city");
  assert.deepEqual(notices[0], { caller: ROME, city: "Lagash", host: HUMAN, people: 3 });
}

function testNoNoticeForAiHost() {
  reset();
  const flows = [{ src: ROME, dest: 4, srcCity: "Rome", destCity: "Athens", points: 2, byCause: { war: 200 } }];
  const rich = [{ ...CALM[0], food: 200, production: 200, gold: 200, science: 200, culture: 200 }, CALM[1], CALM[2]];
  aiCallHomeOnTurn(ROME, seams({ flows, signals: () => rich, call: (pid, scope, currency, deps) => {
    calls.push({ pid, scope, currency });
    deps.move({ from: "Athens", home: "Rome", host: 4, points: 2 });
    return { ok: true, reason: "returned", scope, paid: 50, attempted: 1, returned: 1 };
  } }));
  assert.equal(calls.length, 1);
  assert.equal(notices.length, 0, "an AI host gets no notice");
}

function testHomecomingLeavesInternalCallsOut() {
  // With homecoming on, people at home come back free, so an AI doesn't pay for them; abroad is still worth a call.
  reset();
  CONFIG.homecomingEnabled = true;
  const rich = [{ ...CALM[0], food: 200, production: 200, gold: 200, science: 200, culture: 200 }, CALM[1], CALM[2]];
  assert.deepEqual(planAiCalls(ROME, seams()), [], "the internal call that would have been made isn't");
  assert.deepEqual(planAiCalls(ROME, seams({ signals: () => rich, favour: () => "YIELD_SCIENCE" })).map((p) => p.scope),
    [EX], "the external call still goes when it's worth it");
  reset();
}

reset();
testCalmRead();
await testPassCacheHoldsNoCityObject();
testCurrencyPick();
testValueAndSizes();
testPlanOrderAndSpare();
testPairOrder();
testHomecomingLeavesInternalCallsOut();
testGates();
testCallsAndNotice();
testNoNoticeForAiHost();
console.log("call-home-ai passed");
