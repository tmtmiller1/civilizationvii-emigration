// emigration-call-home-view.js
//
// The dialog that offers a call (emigration-call-home.js holds the rules; emigration-call-home-action.js
// binds them to the game). Pure: balances, flows and civilization names are injected, so the exact prose
// and buttons a player sees are testable off-engine.
//
// Both variants offer a ladder of sizes per currency ("Bring 2 home for 170 Gold" / "Call 2 home for 255
// Gold") and name the settlement people are pulled back from and the one they return to. Every size is always
// listed; one the treasury cannot cover is greyed out and cannot be picked, with a tooltip saying how short
// the treasury is, so the ladder never changes shape with the balance. They must still read as different offers:
//   • INTERNAL is a purchase: the body promises that every one called will come.
//   • EXTERNAL is a gamble: the body names the foreign ruler, states the odds for each person and that the
//     call is paid for either way, and the verb on the buttons is "call", not "bring".
// Costs carry the game's own Gold and Influence icons ([icon:YIELD_GOLD], [icon:YIELD_DIPLOMACY]) in the
// buttons; the engine draws them (watched 2026-09-17), and emigration-dilemma-view.js keeps a fallback.
// Each dialog closes on a homecoming epigraph in the player's own civilization's voice (the "return" kind
// in emigration-displaced-quotes.js), drawn in the framed quote block the other decision pop-ups use.
import { loc } from "/emigration/ui/emigration-loc.js";
import { civName } from "/emigration/ui/emigration-naming.js";
import { displacedQuoteFor } from "/emigration/ui/emigration-displaced-quotes.js";
import {
  CALL_HOME_CURRENCY, CALL_HOME_SCOPE, callHomeCost, callHomeQuote, callHomeTiers
} from "/emigration/ui/emigration-call-home.js";

/** The engine's inline icon tags for the two currencies. */
export const GOLD_ICON = "[icon:YIELD_GOLD]";
export const INFLUENCE_ICON = "[icon:YIELD_DIPLOMACY]";

/** The dismiss choice id. */
const NO = "no";
/** How many origin/destination lines the dialog lists before summarising the rest. */
const MAX_PAIR_LINES = 4;

/**
 * Decode a choice id from the dialog: "<currency>:<count>" for a paid call, anything else means "leave them".
 * @param {string} id The choice id. @returns {{currency:number, want:number}|null} The call to make, or null.
 */
export function parseChoice(id) {
  const m = typeof id === "string" ? id.match(/^(\d+):(\d+)$/) : null;
  if (!m) return null;
  const currency = Number(m[1]);
  const want = Number(m[2]);
  if (currency !== CALL_HOME_CURRENCY.GOLD && currency !== CALL_HOME_CURRENCY.INFLUENCE) return null;
  return want > 0 ? { currency, want } : null;
}

/**
 * The dialog view for one variant, or null when nobody is callable.
 * @param {number} pid Player id. @param {string} scope A CALL_HOME_SCOPE.
 * @param {{flows?:*[], afford?:(currency:number)=>number, civ?:(pid:number)=>string, seed?:string, quote?:string}}
 *   [deps] Injected reads: the flow rows (default live), the treasury balance per currency (default
 *   unlimited), a civ's name, the epigraph seed (one quote per offer), or the epigraph itself.
 * @returns {{eyebrow:string, title:string, body:string, details:string[], dismissId:string, quote:string,
 *   choices:*[]}|null}
 */
export function callHomeView(pid, scope, deps) {
  const d = deps || /** @type {*} */ ({});
  const quote = callHomeQuote(pid, scope, CALL_HOME_CURRENCY.GOLD, d.flows);
  if (quote.points <= 0) return null;
  const external = scope === CALL_HOME_SCOPE.EXTERNAL;
  const civ = (/** @type {number} */ host) => (typeof d.civ === "function" ? d.civ(host) : civName(host)) || "";
  const gold = tierChoices(quote, CALL_HOME_CURRENCY.GOLD, d);
  const infl = tierChoices(quote, CALL_HOME_CURRENCY.INFLUENCE, d);
  const details = pairLines(quote.pairs, external ? civ : null);
  if (!gold.concat(infl).some((c) => !c.disabled)) {
    details.push(loc("LOC_EMIG_CALLHOME_TOO_POOR",
      "Not enough to call even one home: [icon:YIELD_GOLD] {1_Gold} or [icon:YIELD_DIPLOMACY] {2_Infl}.",
      callHomeCost(1, scope, CALL_HOME_CURRENCY.GOLD), callHomeCost(1, scope, CALL_HOME_CURRENCY.INFLUENCE)));
  }
  return {
    eyebrow: external
      ? loc("LOC_EMIG_CALLHOME_EYEBROW_EX", "From foreign cities")
      : loc("LOC_EMIG_CALLHOME_EYEBROW_IN", "From our own settlements"),
    title: external
      ? loc("LOC_EMIG_CALLHOME_TITLE_EX", "Call our people back from abroad")
      : loc("LOC_EMIG_CALLHOME_TITLE_IN", "Call our people home"),
    body: external ? externalBody(quote, civ) : internalBody(quote),
    details, dismissId: NO,
    quote: epigraph(pid, scope, d),
    choices: [...gold, ...infl, leaveChoice()]
  };
}

/**
 * The homecoming epigraph: the injected one when a test supplies it, else the player's own civilization's
 * "return" quote for this offer's seed.
 * @param {number} pid Player id. @param {string} scope A CALL_HOME_SCOPE. @param {*} d Injected reads.
 * @returns {string} The display line ("" when there is nothing to show).
 */
function epigraph(pid, scope, d) {
  if (typeof d.quote === "string") return d.quote;
  return displacedQuoteFor(pid, "return", typeof d.seed === "string" && d.seed ? d.seed : scope + "|" + pid);
}

/**
 * The purchase prose: cities named when there is one pair, and a promise that everyone called will come.
 * @param {*} quote The internal quote. @returns {string} The body.
 */
function internalBody(quote) {
  const one = quote.pairs.length === 1 ? quote.pairs[0] : null;
  return one
    ? loc("LOC_EMIG_CALLHOME_BODY_IN_ONE",
      "{1_Away} population points were driven out of {2_Home} and now live in {3_From}, another of our "
      + "settlements. They are inside our borders and under our own rule, so every one we call will come. "
      + "Choose how many to bring home.", quote.available, one.home, one.from)
    : loc("LOC_EMIG_CALLHOME_BODY_IN",
      "{1_Away} population points were driven out of their homes and now live in other settlements of ours. "
      + "They are inside our borders and under our own rule, so every one we call will come. "
      + "Choose how many to bring home.", quote.available);
}

/**
 * The gamble prose: the foreign ruler named when there is one pair, the odds per person, and the warning that
 * the call is paid for whether or not anyone answers.
 * @param {*} quote The external quote. @param {(pid:number)=>string} civ Names a host civ.
 * @returns {string} The body.
 */
function externalBody(quote, civ) {
  const pct = Math.round(quote.chance * 100);
  const one = quote.pairs.length === 1 ? quote.pairs[0] : null;
  return one
    ? loc("LOC_EMIG_CALLHOME_BODY_EX_ONE",
      "{1_Away} population points were driven out of {2_Home} and now live in {3_From}, a city of {4_Civ}. "
      + "They have a life there, and a foreign ruler has no reason to help us empty their streets. Choose how "
      + "many to call: each has about a {5_Pct}% chance of answering, the call may bring nobody, and it is "
      + "paid for either way.", quote.available, one.home, one.from, civ(one.host), pct)
    : loc("LOC_EMIG_CALLHOME_BODY_EX",
      "{1_Away} population points were driven out of their homes and now live under other rulers. They have "
      + "a life there, and a foreign ruler has no reason to help us empty their streets. Choose how many to "
      + "call: each has about a {2_Pct}% chance of answering, the call may bring nobody, and it is paid for "
      + "either way.", quote.available, pct);
}

/**
 * The full size ladder for one currency. A size the treasury cannot cover stays in the list, greyed out and
 * unpickable, with a tooltip saying what it needs and what the treasury holds.
 * @param {*} quote The quote. @param {number} currency A CALL_HOME_CURRENCY. @param {*} d Injected reads.
 * @returns {{id:string, label:string, note:string, disabled?:boolean}[]} The choices, cheapest first.
 */
function tierChoices(quote, currency, d) {
  const balance = balanceFor(currency, d);
  const external = quote.scope === CALL_HOME_SCOPE.EXTERNAL;
  const note = external
    ? loc("LOC_EMIG_CALLHOME_CALL_N",
      "Each has about a {1_Pct}% chance of answering. The call is paid for either way.", Math.round(quote.chance * 100))
    : loc("LOC_EMIG_CALLHOME_TIER_N", "Exactly this many come home, from the largest group first.");
  return callHomeTiers(quote.points).map((n) => {
    const cost = callHomeCost(n, quote.scope, currency);
    const label = tierLabel(n, cost, currency, external);
    const id = currency + ":" + n;
    if (cost <= balance) return { id, label, note };
    return { id, label, note: shortNote(currency, cost, balance), disabled: true };
  });
}

/**
 * The tooltip on a greyed-out size: what it needs and what the treasury holds.
 * @param {number} currency A CALL_HOME_CURRENCY. @param {number} cost The fee. @param {number} balance The
 *   treasury. @returns {string} The note.
 */
function shortNote(currency, cost, balance) {
  const have = Math.floor(balance);
  return currency === CALL_HOME_CURRENCY.INFLUENCE
    ? loc("LOC_EMIG_CALLHOME_SHORT_INFL", "Not enough Influence: this needs {1_Cost} and we have {2_Have}.", cost, have)
    : loc("LOC_EMIG_CALLHOME_SHORT_GOLD", "Not enough Gold: this needs {1_Cost} and we have {2_Have}.", cost, have);
}

/**
 * "Bring N home for <icon> cost" (internal) or "Call N home for <icon> cost" (external), singular for one.
 * @param {number} n How many. @param {number} cost The fee. @param {number} currency A CALL_HOME_CURRENCY.
 * @param {boolean} external Whether this is the gamble. @returns {string} The button label.
 */
function tierLabel(n, cost, currency, external) {
  const infl = currency === CALL_HOME_CURRENCY.INFLUENCE;
  if (external) {
    if (infl) {
      return n === 1
        ? loc("LOC_EMIG_CALLHOME_CALL_INFL_ONE", "Call one home for [icon:YIELD_DIPLOMACY] {1_Cost}", cost)
        : loc("LOC_EMIG_CALLHOME_CALL_INFL", "Call {1_Count} home for [icon:YIELD_DIPLOMACY] {2_Cost}", n, cost);
    }
    return n === 1
      ? loc("LOC_EMIG_CALLHOME_CALL_GOLD_ONE", "Call one home for [icon:YIELD_GOLD] {1_Cost}", cost)
      : loc("LOC_EMIG_CALLHOME_CALL_GOLD", "Call {1_Count} home for [icon:YIELD_GOLD] {2_Cost}", n, cost);
  }
  if (infl) {
    return n === 1
      ? loc("LOC_EMIG_CALLHOME_TIER_INFL_ONE", "Bring one home for [icon:YIELD_DIPLOMACY] {1_Cost}", cost)
      : loc("LOC_EMIG_CALLHOME_TIER_INFL", "Bring {1_Count} home for [icon:YIELD_DIPLOMACY] {2_Cost}", n, cost);
  }
  return n === 1
    ? loc("LOC_EMIG_CALLHOME_TIER_GOLD_ONE", "Bring one home for [icon:YIELD_GOLD] {1_Cost}", cost)
    : loc("LOC_EMIG_CALLHOME_TIER_GOLD", "Bring {1_Count} home for [icon:YIELD_GOLD] {2_Cost}", n, cost);
}

/** @returns {{id:string, label:string, note:string}} The dismiss choice. */
function leaveChoice() {
  return { id: NO, label: loc("LOC_EMIG_CALLHOME_NO", "Leave them where they are"),
    note: loc("LOC_EMIG_CALLHOME_NO_N", "They may still drift home on their own in time.") };
}

/**
 * One line per origin/destination pair ("4 from Ostia back to Rome"), the foreign ruler named for external
 * pairs, the tail summarised past MAX_PAIR_LINES.
 * @param {*[]} pairs The candidate pairs, richest first. @param {((pid:number)=>string)|null} civ Names a
 *   host civ, or null for internal pairs. @returns {string[]} The detail lines.
 */
function pairLines(pairs, civ) {
  const lines = pairs.slice(0, MAX_PAIR_LINES).map((p) => (civ
    ? loc("LOC_EMIG_CALLHOME_PAIR_EX", "{4_Count} from {1_From} ({2_Civ}) back to {3_Home}",
      p.from, civ(p.host), p.home, p.points)
    : loc("LOC_EMIG_CALLHOME_PAIR_IN", "{3_Count} from {1_From} back to {2_Home}", p.from, p.home, p.points)));
  const rest = pairs.length - lines.length;
  if (rest > 0) lines.push(loc("LOC_EMIG_CALLHOME_MORE", "and {1_Count} more", rest));
  return lines;
}

/**
 * What the player can spend of a currency, or Infinity when unreadable (so a failed read never hides a button).
 * @param {number} currency A CALL_HOME_CURRENCY. @param {*} d Injected reads. @returns {number} The balance.
 */
function balanceFor(currency, d) {
  const v = typeof d.afford === "function" ? Number(d.afford(currency)) : Infinity;
  return Number.isFinite(v) ? Math.max(0, v) : Infinity;
}
