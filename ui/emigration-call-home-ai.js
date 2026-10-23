// emigration-call-home-ai.js
//
// AI civilizations call their people home. The player gets the call as a dialog once the empire is calm
// (emigration-main.js, offerCallHomeWhenCalm); an AI civilization gets no dialog, so before this it never
// paid to bring anyone back. This runs the same rule for it on its own turn, through the same quote, price,
// odds and cooldown (emigration-call-home.js, emigration-call-home-action.js): nothing is stood in for, the
// AI pays from its own treasury and the people come home the way the player's do.
//
// The rule: on an AI civilization's turn activation, when none of its settlements is in distress and its people
// are away, it sizes a call by value: each extra person must earn their share of the fee back over two cooldowns
// (the home city's yields per head, the leader's favoured yield counted twice), the odds of coming are priced in
// for the external call, one call spends at most a quarter of the balance, and a civ in deficit keeps a reserve.
// The internal call (its people in its own settlements) comes first; the external call (its people under another
// ruler) only from what the internal bill leaves. It pays in the currency that buys the larger call. The home
// city that needs people most is served first.
//
// The distress read reuses the ranked city signals from the most recent pass (emigration-pass-signals.js),
// so an AI turn costs no second read of the map. With a pass interval above one turn the signals can be a
// few turns old, which only delays a call; it never makes one during a crisis the pass saw.
//
// When a call takes people out of a human player's city, that player gets a notice on the train and a
// Chronicle line naming who called and from where, so the loss is explained.
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { msg, msgText } from "/emigration/ui/emigration-loc.js";
import { CALL_HOME_CURRENCY, CALL_HOME_SCOPE, callHomeCost, callHomeQuote } from "/emigration/ui/emigration-call-home.js";
import {
  callHomeBalance, callHomeCooldownLeft, callHomeNow, callHomeResolvable, movePointHome
} from "/emigration/ui/emigration-call-home-action.js";
import { freshCity, lastPassRanked } from "/emigration/ui/emigration-pass-signals.js";
import { distress } from "/emigration/ui/emigration-prosperity.js";
import { chronicle } from "/emigration/ui/emigration-chronicle.js";
import { toast } from "/emigration/ui/emigration-feedback.js";
import { civNameMsg } from "/emigration/ui/emigration-naming.js";
import { leaderFavouredYield } from "/emigration/ui/emigration-ai-host.js";

/**
 * @typedef {Object} AiCallHomeDeps Seams for the rule, all optional in the game, all supplied by the tests.
 * @property {(pid:number)=>boolean} [isAi] Whether this owner is a living major AI civilization.
 * @property {(pid:number)=>boolean} [isHumanOwner] Whether this owner is a human player (for the notice).
 * @property {()=>*[]} [signals] The ranked city signals the distress read uses.
 * @property {(s:*)=>*} [resolve] The live city for a kept signal, or null (default: `freshCity`).
 * @property {(pid:number, currency:number)=>number} [balance] What the civ can spend of a currency.
 * @property {(pid:number, currency:number)=>number} [income] Net income per turn in a currency.
 * @property {(pid:number)=>(string|null)} [favour] The yield the civ's leader favours (default: the AI data read).
 * @property {(pid:number, scope:string)=>number} [cooldown] Turns of cooldown left for a scope.
 * @property {(pid:number, scope:string, currency:number, flows?:*[], ask?:*)=>*} [quote] The call's quote.
 * @property {(pair:*)=>boolean} [resolvable] Whether a pair's cities still exist under the owners the ledger names.
 * @property {(pid:number, scope:string, currency:number, deps:*)=>*} [call] Run the call (callHomeNow).
 * @property {(pair:*)=>boolean} [move] Move one point home (the default mover, wrapped to record the pair).
 * @property {*[]} [flows] Flow rows (defaults to the live matrix inside the quote).
 * @property {(pid:number, hostCity:string, hostOwner:number, people:number)=>void} [notify] Tell a human host.
 */

/** @typedef {{scope:string, currency:number, cost:number, points:number}} PlannedCall */

/**
 * Whether a player id is a living major AI civilization: `isHuman` false on the player object, never
 * "not the local id" (several humans in one game would otherwise be treated as AI).
 * @param {number} pid The player id. @returns {boolean}
 */
export function isAiOwner(pid) {
  try {
    const p = typeof Players !== "undefined" && Players.get ? Players.get(pid) : null;
    if (!p || p.isHuman !== false) return false;
    return p.isMajor !== false && p.isAlive !== false;
  } catch (_) {
    return false;
  }
}

/** @param {number} pid @returns {boolean} */
function isHumanOwner(pid) {
  try {
    const p = typeof Players !== "undefined" && Players.get ? Players.get(pid) : null;
    return !!(p && p.isHuman === true);
  } catch (_) {
    return false;
  }
}

/**
 * Whether none of an owner's settlements is in situational distress (war, siege, disaster, famine, unrest),
 * read from the pass's kept signals. No settlement of its own, no signals at all, or a settlement lost since the
 * pass counts as not calm, so a read the pass could not make never triggers a call.
 * @param {*[]} ranked The kept signals. @param {number} pid The owner.
 * @param {(s:*)=>*} [resolve] The live city for a kept signal, or null (default: `freshCity`).
 * @returns {boolean}
 */
export function isCalmFromSignals(ranked, pid, resolve = freshCity) {
  if (!Array.isArray(ranked)) return false;
  let any = false;
  for (const s of ranked) {
    if (!s || s.owner !== pid) continue;
    // The kept signal holds no engine object; the distress read gets the live city. A settlement that is gone
    // or changed hands since the pass means the civ just lost it, which is not calm.
    const city = resolve(s);
    if (!city) return false;
    any = true;
    if (distressOf({ ...s, city }) > 0) return false;
  }
  return any;
}

/** @param {*} s A city signal. @returns {number} Its distress, or Infinity when the read throws. */
function distressOf(s) {
  try {
    return Number(distress(s)) || 0;
  } catch (_) {
    return Infinity;
  }
}

/** Turns a returning person is given to pay back the fee: twice the cooldown, so a call is worth making when the
 * person earns the fee before the civilization could call twice more. */
const PAYBACK_COOLDOWNS = 2;
/** The most of a balance one call may spend. */
const TREASURY_SHARE = 0.25;
/** With income in a currency negative, no call while the balance covers fewer than this many turns of the loss. */
const RESERVE_TURNS = 8;

/**
 * Which currency to pay a call in: the one the civ has more of, measured against that currency's price for
 * the call, among the currencies that cover it. Neither covering it is null (the call is not made).
 * @param {{gold:number, influence:number}} balances What it can spend.
 * @param {{gold:number, influence:number}} costs What the call costs in each.
 * @returns {{currency:number, cost:number}|null} The pick.
 */
export function pickCurrency(balances, costs) {
  const g = headroom(balances.gold, costs.gold);
  const i = headroom(balances.influence, costs.influence);
  if (g < 0 && i < 0) return null;
  return g >= i
    ? { currency: CALL_HOME_CURRENCY.GOLD, cost: costs.gold }
    : { currency: CALL_HOME_CURRENCY.INFLUENCE, cost: costs.influence };
}

/**
 * How many times over a balance covers a price: below zero when it does not, Infinity for a free call.
 * @param {number} have The balance. @param {number} cost The price. @returns {number}
 */
function headroom(have, cost) {
  if (!(cost > 0)) return cost === 0 ? Infinity : -1;
  return Number.isFinite(have) && have >= cost ? have / cost : -1;
}

/**
 * What one returning person is worth to the civ, in yield over the payback window: the home city's net yields
 * per head (Food, Production, Gold, Science, Culture, with the leader's favoured yield counted twice), times
 * the cooldown times {@link PAYBACK_COOLDOWNS}. A home city the pass didn't see is worth nothing, so nobody is
 * called back to it.
 * @param {*} home The home city's kept signal, or null. @param {string|null} favour The favoured yield.
 * @returns {number} Yield points.
 */
export function personValue(home, favour) {
  if (!home) return 0;
  const n = (/** @type {*} */ v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  /** @type {Record<string, number>} */
  const by = { YIELD_FOOD: n(home.food), YIELD_PRODUCTION: n(home.production), YIELD_GOLD: n(home.gold),
    YIELD_SCIENCE: n(home.science), YIELD_CULTURE: n(home.culture) };
  let perTurn = 0;
  for (const v of Object.values(by)) perTurn += Math.max(0, v);
  if (favour && favour in by) perTurn += Math.max(0, by[favour]);
  const heads = Math.max(1, n(home.population));
  const cooldown = Math.max(1, n(CONFIG.callHomeCooldownTurns));
  return (perTurn / heads) * cooldown * PAYBACK_COOLDOWNS;
}

/**
 * The size of a call by value: the largest k, up to what is quoted, whose k-th person's marginal fee is still
 * under what that person is worth, times the odds that they come. Zero means the call isn't worth making.
 * @param {{points:number, chance:number, scope:string}} quote The quote (points is the most callable).
 * @param {number} currency A CALL_HOME_CURRENCY. @param {number} value One person's worth.
 * @returns {number} The size.
 */
export function sizeByValue(quote, currency, value) {
  const worth = value * (Number(quote.chance) || 0);
  let k = 0;
  for (let n = 1; n <= quote.points; n++) {
    const marginal = callHomeCost(n, quote.scope, currency) - callHomeCost(n - 1, quote.scope, currency);
    if (marginal > worth) break;
    k = n;
  }
  return k;
}

/**
 * The largest size, up to `k`, the treasury allows: the fee within {@link TREASURY_SHARE} of the balance, and no
 * call at all while income in that currency is negative and the balance is under {@link RESERVE_TURNS} of it.
 * @param {number} k The size by value. @param {string} scope A CALL_HOME_SCOPE. @param {number} currency
 * @param {number} balance What is unspent. @param {number} income Net income per turn in that currency.
 * @returns {number} The size.
 */
export function sizeByTreasury(k, scope, currency, balance, income) {
  if (!(k > 0) || !Number.isFinite(balance)) return 0;
  if (income < 0 && balance < RESERVE_TURNS * -income) return 0;
  for (let n = k; n > 0; n--) if (callHomeCost(n, scope, currency) <= balance * TREASURY_SHARE) return n;
  return 0;
}

/**
 * Plan one civ's calls this turn without making them: for each scope, the size by value and treasury in each
 * currency, then the currency giving the larger call (headroom breaks a tie). Internal first; the external call
 * only from what the internal bill leaves.
 * @param {number} pid The AI owner. @param {AiCallHomeDeps} d The seams.
 * @returns {PlannedCall[]} The calls, in order.
 */
export function planAiCalls(pid, d) {
  const balance = d.balance || callHomeBalance;
  const cooldown = d.cooldown || callHomeCooldownLeft;
  const left = {
    gold: Number(balance(pid, CALL_HOME_CURRENCY.GOLD)),
    influence: Number(balance(pid, CALL_HOME_CURRENCY.INFLUENCE))
  };
  /** @type {PlannedCall[]} */
  const plan = [];
  for (const scope of [CALL_HOME_SCOPE.INTERNAL, CALL_HOME_SCOPE.EXTERNAL]) {
    if (cooldown(pid, scope) > 0) continue;
    const step = plannedCall(pid, scope, left, d);
    if (!step) continue;
    plan.push(step);
    if (step.currency === CALL_HOME_CURRENCY.GOLD) left.gold -= step.cost;
    else left.influence -= step.cost;
  }
  return plan;
}

/**
 * One scope's call, if anyone is away and it is worth making in some currency the treasury allows.
 * @param {number} pid @param {string} scope A CALL_HOME_SCOPE.
 * @param {{gold:number, influence:number}} left What is still unspent. @param {AiCallHomeDeps} d The seams.
 * @returns {PlannedCall|null}
 */
function plannedCall(pid, scope, left, d) {
  const quote = d.quote || callHomeQuote;
  const ask = { resolvable: d.resolvable || callHomeResolvable(pid), order: pairOrder(pid, d) };
  const q = quote(pid, scope, CALL_HOME_CURRENCY.GOLD, d.flows, ask);
  if (!q || !(q.points > 0)) return null;
  const value = personValue(homeSignal(pid, q.pairs[0], d), (d.favour || leaderFavouredYield)(pid));
  const sizes = sizesFor(q, value, left, pid, d);
  if (sizes.gold <= 0 && sizes.influence <= 0) return null;
  const gold = pickGold(sizes, scope, left);
  const points = gold ? sizes.gold : sizes.influence;
  const currency = gold ? CALL_HOME_CURRENCY.GOLD : CALL_HOME_CURRENCY.INFLUENCE;
  return { scope, currency, cost: callHomeCost(points, scope, currency), points };
}

/**
 * The call size in each currency, by value then by what the treasury allows.
 * @param {*} q The quote. @param {number} value One person's worth. @param {{gold:number, influence:number}} left
 * @param {number} pid @param {AiCallHomeDeps} d @returns {{gold:number, influence:number}}
 */
function sizesFor(q, value, left, pid, d) {
  const income = d.income || netIncome;
  const G = CALL_HOME_CURRENCY.GOLD;
  const I = CALL_HOME_CURRENCY.INFLUENCE;
  return {
    gold: sizeFor(q, G, value, left.gold, income(pid, G)),
    influence: sizeFor(q, I, value, left.influence, income(pid, I))
  };
}

/**
 * The call size in one currency: by value, then by what the treasury allows.
 * @param {*} q The quote. @param {number} currency A CALL_HOME_CURRENCY. @param {number} value One person's worth.
 * @param {number} balance What is unspent in that currency. @param {number} income Net income per turn in it.
 * @returns {number}
 */
function sizeFor(q, currency, value, balance, income) {
  return sizeByTreasury(sizeByValue(q, currency, value), q.scope, currency, balance, income);
}

/**
 * Whether to pay in Gold: the currency buying the larger call, headroom breaking a tie.
 * @param {{gold:number, influence:number}} sizes The sizes by currency. @param {string} scope A CALL_HOME_SCOPE.
 * @param {{gold:number, influence:number}} left What is unspent. @returns {boolean}
 */
function pickGold(sizes, scope, left) {
  if (sizes.gold !== sizes.influence) return sizes.gold > sizes.influence;
  const costs = { gold: callHomeCost(sizes.gold, scope, CALL_HOME_CURRENCY.GOLD),
    influence: callHomeCost(sizes.influence, scope, CALL_HOME_CURRENCY.INFLUENCE) };
  const pick = pickCurrency(left, costs);
  return !!pick && pick.currency === CALL_HOME_CURRENCY.GOLD;
}

/**
 * The kept pass signal of a pair's home city (the caller's city of that name), or null.
 * @param {number} pid The caller. @param {*} pair A candidate pair. @param {AiCallHomeDeps} d The seams.
 * @returns {*} The signal, or null.
 */
function homeSignal(pid, pair, d) {
  if (!pair) return null;
  const resolve = d.resolve || freshCity;
  for (const s of (d.signals || lastPassRanked)()) {
    if (!s || s.owner !== pid) continue;
    const city = resolve(s);
    if (city && cityLabel(city) === pair.home) return s;
  }
  return null;
}

/** @param {*} city @returns {string} The composed name, or "". */
function cityLabel(city) {
  try {
    return typeof Locale !== "undefined" && Locale.compose ? Locale.compose(city.name) : String(city.name || "");
  } catch (_) {
    return "";
  }
}

/**
 * The pair order for an AI's call: the home city that needs people most first (lowest prosperity in the pass),
 * a home the pass didn't see last; richest-first within a home, as the quote had them.
 * @param {number} pid The caller. @param {AiCallHomeDeps} d The seams. @returns {(pairs:*[])=>*[]}
 */
function pairOrder(pid, d) {
  return (pairs) => {
    const need = (/** @type {*} */ pair) => {
      const s = homeSignal(pid, pair, d);
      return s && Number.isFinite(Number(s.pros)) ? Number(s.pros) : Infinity;
    };
    return pairs.map((p, i) => ({ p, i, n: need(p) })).sort((a, b) => a.n - b.n || a.i - b.i).map((x) => x.p);
  };
}

/**
 * A civilization's net income per turn in a call currency, or 0 when unreadable (which never blocks a call on
 * its own: the balance share still applies).
 * @param {number} pid @param {number} currency A CALL_HOME_CURRENCY. @returns {number}
 */
function netIncome(pid, currency) {
  try {
    const key = currency === CALL_HOME_CURRENCY.INFLUENCE ? "YIELD_DIPLOMACY" : "YIELD_GOLD";
    const v = Players.get(pid).Stats.getNetYield(YieldTypes[key]);
    return Number.isFinite(Number(v)) ? Number(v) : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Run the rule for one AI civilization on its turn: calm, people away, off cooldown, affordable, then call.
 * The call itself is the player's `callHomeNow`, so the price, the odds, the move and the cooldown are the
 * same; this only decides, and records which host cities lost people to it.
 * @param {number} pid The owner whose turn it is. @param {AiCallHomeDeps} [deps] Seams for the tests.
 * @returns {{called:number, returned:number, paid:number}} What happened.
 */
export function aiCallHomeOnTurn(pid, deps) {
  const d = deps || {};
  const out = { called: 0, returned: 0, paid: 0 };
  if (!gatesOpen(pid, d)) return out;
  for (const step of planAiCalls(pid, d)) runPlannedCall(pid, step, d, out);
  return out;
}

/**
 * The gates before any quote is read: the settings, a living AI owner, and a calm empire.
 * @param {number} pid @param {AiCallHomeDeps} d @returns {boolean}
 */
function gatesOpen(pid, d) {
  if (!CONFIG.callHomeEnabled || !CONFIG.callHomeAi) return false;
  if (typeof pid !== "number" || pid < 0) return false;
  if (!(d.isAi || isAiOwner)(pid)) return false;
  return isCalmFromSignals((d.signals || lastPassRanked)(), pid, d.resolve || freshCity);
}

/**
 * Make one planned call, tally it, and tell any human host whose city lost people.
 * @param {number} pid @param {PlannedCall} step @param {AiCallHomeDeps} d
 * @param {{called:number, returned:number, paid:number}} out The tally (mutated).
 */
function runPlannedCall(pid, step, d, out) {
  const call = d.call || callHomeNow;
  const mover = d.move || ((/** @type {*} */ pair) => movePointHome(pid, pair));
  /** @type {*[]} */ const moved = [];
  const result = call(pid, step.scope, step.currency, {
    flows: d.flows,
    want: step.points,
    resolvable: d.resolvable || callHomeResolvable(pid),
    order: pairOrder(pid, d),
    move: (/** @type {*} */ pair) => {
      const ok = mover(pair);
      if (ok) moved.push(pair);
      return ok;
    }
  });
  if (!result) return;
  if (result.ok || result.reason === "nobody-came") out.called++;
  out.returned += Number(result.returned) || 0;
  out.paid += Number(result.paid) || 0;
  dlog("AI call home " + pid + " " + step.scope + ": " + JSON.stringify(result));
  noticeHumanHosts(pid, moved, d);
}

/**
 * Tell a human player whose city just lost people to another civilization's call, one notice per host city.
 * @param {number} caller The civilization that called. @param {*[]} moved The pairs that moved.
 * @param {AiCallHomeDeps} d The seams.
 */
function noticeHumanHosts(caller, moved, d) {
  const human = d.isHumanOwner || isHumanOwner;
  /** @type {Map<string, {host:number, city:string, n:number}>} */ const byCity = new Map();
  for (const pair of moved) {
    if (!pair || typeof pair.host !== "number" || pair.host === caller || !human(pair.host)) continue;
    const key = pair.host + "|" + pair.from;
    const e = byCity.get(key) || { host: pair.host, city: String(pair.from), n: 0 };
    e.n++;
    byCity.set(key, e);
  }
  for (const e of byCity.values()) (d.notify || notifyHumanHost)(caller, e.city, e.host, e.n);
}

/**
 * The notice itself: a Chronicle line and a train notice for the human host ("Rome calls its people home
 * from Lagash: 2 population points leave").
 * @param {number} caller The civilization that called. @param {string} city The host city's name.
 * @param {number} host The host player. @param {number} people How many left.
 */
function notifyHumanHost(caller, city, host, people) {
  try {
    const civ = civNameMsg(caller);
    const body = people > 1
      ? msg("LOC_EMIG_CALLHOME_AI_LOSS",
        "{1_Civ} calls its people home from {2_City}: {3_Count} population points leave.", civ, city, people)
      : msg("LOC_EMIG_CALLHOME_AI_LOSS_ONE",
        "{1_Civ} calls its people home from {2_City}: one population point leaves.", civ, city);
    chronicle({
      kind: "return", cause: "return", people,
      title: msg("LOC_EMIG_CALLHOME_AI_LOSS_TITLE", "Called Home By Their Own"),
      body,
      dedupeKey: "callhome-ai:" + caller + "|" + host + "|" + city + "|" + turnNow()
    });
    toast(msgText(body), "return", true, undefined, "loss");
  } catch (e) {
    dlog("AI call home notice threw " + e);
  }
}

/** @returns {number} */
function turnNow() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}
