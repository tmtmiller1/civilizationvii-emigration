// emigration-ai-host.js
//
// The choices an AI host makes where the player gets a pop-up: which stance its enclave takes, and what it
// does with refugees at its gates. Both are pure decisions over injected reads, so the tests drive every
// branch without the engine; emigration-quarter.js and emigration-dilemma.js call them with the live reads.
//
// Enclave stance (chooseAiStance): let the enclave be when the host is at war with the community's homeland
// or already runs an Anti-Immigration card; otherwise take the affordable stance that pays the yield the
// leader's own planner favours (its YieldBiases list in the game data, so a mod that changes a leader's
// biases changes this too), else the first affordable one, as before. The civ tuning table's
// `enclaveFavour` overrides the data read for a leader that needs it.
//
// Refugees (aiRefugeeChoice): turn them away when at war with their civilization; welcome them into the
// largest city while the civ is under its congestion bar; send them to the smallest settlement when it is
// over the bar and has one; otherwise turn them away. Each option costs the AI what it costs the player
// (CONFIG.dilemmaGold*, dilemmaInfluenceAway), and an option it cannot pay for is skipped.
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { civTuning } from "/emigration/ui/emigration-civ-tuning.js";
import { congestionPenalty } from "/emigration/ui/emigration-effects.js";
import { isMajorHost } from "/emigration/ui/emigration-quarter-hosts.js";

/** The congestion headwind, in pull points, past which an AI host stops welcoming refugees into its capital. */
export const AI_CONGESTION_BAR = 1;

/**
 * Whether a host is a major civilization run by the AI (`isHuman` false on the player object, never "not the
 * local id"). Unreadable counts as not AI, so the player's own automatic choice is never replaced by mistake.
 * @param {number} pid Host player id. @returns {boolean}
 */
export function isAiHost(pid) {
  try {
    const p = typeof Players !== "undefined" && Players.get ? Players.get(pid) : null;
    return !!(p && p.isHuman === false) && isMajorHost(pid);
  } catch (_) {
    return false;
  }
}

/**
 * The yield a leader's own planner favours most, from the game data: the leader's traits, the YieldBiases
 * lists bound to them (AiLists), and the heaviest item on those lists (AiFavoredItems). The civ tuning
 * table's `enclaveFavour` wins when set. Null when nothing is readable.
 * @param {number} pid The host player id. @returns {string|null} A yield type such as "YIELD_SCIENCE".
 */
export function leaderFavouredYield(pid) {
  const tuned = civTuning(pid).enclaveFavour;
  if (typeof tuned === "string" && tuned) return tuned;
  try {
    const leader = GameInfo.Leaders.lookup(Players.get(pid)?.leaderType)?.LeaderType;
    return leader ? heaviestYield(yieldBiasLists(leader)) : null;
  } catch (_) {
    return null;
  }
}

/**
 * The YieldBiases lists bound to a leader's traits (AiLists rows whose LeaderType is one of its TraitTypes).
 * @param {string} leader The LeaderType. @returns {Set<string>} The ListTypes.
 */
function yieldBiasLists(leader) {
  const traits = new Set();
  for (const r of GameInfo.LeaderTraits) if (r.LeaderType === leader) traits.add(r.TraitType);
  const lists = new Set();
  for (const r of GameInfo.AiLists) if (r.System === "YieldBiases" && traits.has(r.LeaderType)) lists.add(r.ListType);
  return lists;
}

/**
 * The yield with the largest Value across the given favour lists (AiFavoredItems), or null.
 * @param {Set<string>} lists The ListTypes to read. @returns {string|null}
 */
function heaviestYield(lists) {
  let best = null;
  for (const r of GameInfo.AiFavoredItems) {
    if (!lists.has(r.ListType) || !/^YIELD_/.test(String(r.Item))) continue;
    if (!best || Number(r.Value) > best.value) best = { item: String(r.Item), value: Number(r.Value) };
  }
  return best ? best.item : null;
}

/**
 * @typedef {Object} StanceDeps
 * @property {(owner:number, origin:number)=>boolean} atWar Whether the host is at war with the homeland.
 * @property {(owner:number)=>("protect"|"suspect"|null)} stance The host's slotted treatment card.
 * @property {(option:*)=>boolean} affordable Whether the host can pay the option's price now.
 * @property {()=>(string|null)} favour The yield the host's leader favours.
 */

/**
 * The stance an AI host takes for a newly recognized enclave of `origin`'s people.
 * @param {number} owner Host player id. @param {number} origin The enclave's origin player id.
 * @param {{id:string, benefitYield:(string|null)}[]} options The offered options (a, b, ignore).
 * @param {StanceDeps} deps The reads. @returns {string} The option id.
 */
export function chooseAiStance(owner, origin, options, deps) {
  if (deps.atWar(owner, origin) || deps.stance(owner) === "suspect") return "ignore";
  const ok = (options || []).filter((o) => o && o.id !== "ignore" && deps.affordable(o));
  if (!ok.length) return "ignore";
  const fav = deps.favour();
  const hit = fav ? ok.find((o) => o.benefitYield === fav) : null;
  return (hit || ok[0]).id;
}

/**
 * @typedef {Object} RefugeeDeps
 * @property {(host:number, origin:number)=>boolean} atWar Whether the host is at war with the refugees' civ.
 * @property {(host:number)=>number} congestion The host's congestion headwind, in pull points.
 * @property {(host:number)=>number} gold What the host can spend in Gold.
 * @property {(host:number)=>number} influence What the host can spend in Influence.
 * @property {number} [priceScale] The host's difficulty discount on the prices (default 1).
 */

/**
 * What an AI host does with refugees at its gates: the choice id and, for the two that take them in, the city
 * signal they settle into. Null when it can afford none of the options that apply.
 * @param {number} host Host player id. @param {number} origin The refugees' origin player id.
 * @param {*[]} cities The host's city signals, largest first. @param {RefugeeDeps} deps The reads.
 * @returns {{id:string, city:*}|null} The decision.
 */
export function aiRefugeeChoice(host, origin, cities, deps) {
  const cost = (/** @type {*} */ v) => Math.round(Math.max(0, Number(v) || 0) * priceScaleOf(deps));
  const away = deps.influence(host) >= cost(CONFIG.dilemmaInfluenceAway) ? { id: "away", city: null } : null;
  if (deps.atWar(host, origin)) return away;
  const list = Array.isArray(cities) ? cities.filter(Boolean) : [];
  if (!list.length) return null;
  const gold = deps.gold(host);
  const over = deps.congestion(host) >= AI_CONGESTION_BAR;
  if (!over && gold >= cost(CONFIG.dilemmaGoldWelcome)) return { id: "welcome", city: list[0] };
  if (list.length > 1 && gold >= cost(CONFIG.dilemmaGoldFrontier)) return { id: "frontier", city: list[list.length - 1] };
  return over ? away : null;
}

/** @param {RefugeeDeps} deps @returns {number} The host's price scale, 1 unless the reads give one. */
function priceScaleOf(deps) {
  return typeof deps.priceScale === "number" && deps.priceScale > 0 ? deps.priceScale : 1;
}

/**
 * The live congestion read for a host: its headwind against further arrivals, from its assimilation load
 * per head of population.
 * @param {number} host Host player id. @param {number} population The host's total population.
 * @returns {number} Pull points.
 */
export function hostCongestion(host, population) {
  try {
    return congestionPenalty(host, population);
  } catch (_) {
    return Infinity;
  }
}
