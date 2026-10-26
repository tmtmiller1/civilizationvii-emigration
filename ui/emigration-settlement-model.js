// emigration-settlement-model.js
//
// What one settlement's dashboard card says, read off the pass the simulation itself decided with (the owner,
// 2026-10-26: a "control dashboard" with an Immigrant half and an Emigrant half, where the pressure stops being a
// black box and the player can see who is pulling on them and whom they pull). Pure given a pass
// ({ranked, ownerPop, field}); `liveSettlementModels` reads the live one from emigration-explain-view.js.
//
// Pull is `adjustedPull(src, dest)` from emigration-pull.js: the prosperity gradient plus friction, times
// permeability. "Pulled toward" lists the destinations with the greatest pull on this settlement's people;
// "Drawing from" lists the settlements whose best destination is this one. Both carry the explainer's rows
// (emigration-explain.js), so a hover can show the same terms the score is made of.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { adjustedPull, bestDestination, pullContext } from "/emigration/ui/emigration-pull.js";
import { explainPull, explainPush, explainLedger, weigh } from "/emigration/ui/emigration-explain.js";
import { prescribe } from "/emigration/ui/emigration-prescribe.js";
import { policyState, POLICY_TYPES } from "/emigration/ui/emigration-borders.js";
import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { loc } from "/emigration/ui/emigration-loc.js";
import { livePass, destNameOf } from "/emigration/ui/emigration-explain-view.js";
import { civAdjective } from "/emigration/ui/emigration-naming.js";
import { speedBar } from "/emigration/ui/emigration-game-speed.js";

/** How many destinations and origins a card names. */
export const PULL_ROWS = 3;
export const DRAW_ROWS = 4;

/**
 * @typedef {Object} PullRow One settlement on the other end of a pull.
 * @property {string} name
 * @property {number} owner
 * @property {string} civ The owner's adjective ("" for the player's own).
 * @property {boolean} crossCiv
 * @property {number} pull The adjusted pull, in score points.
 * @property {{key:string, label:string, delta:number, kind:string, weight:number}[]} why The explainer's
 *   rows, biggest first.
 */

/**
 * @typedef {Object} SettlementModel
 * @property {string} name
 * @property {*} city The live city object (the enclave decision needs it).
 * @property {number} pros The settlement's own prosperity score.
 * @property {{key:string, label:string, delta:number, kind:string, weight:number}[]} score The score's own
 *   terms (economy, happiness, population, what's built, the situational penalties), biggest first.
 * @property {import("/emigration/ui/emigration-explain.js").LedgerRow[]} ledger The same accounting as the
 *   prosperity ledger shows it: the polity and built terms split into rows of their own, and the lines under each.
 * @property {PullRow[]} pulledToward The destinations pulling hardest on this settlement's people.
 * @property {PullRow[]} drawnFrom The settlements whose people are drawn here first.
 * @property {number} drawnFromCount How many settlements that is in all.
 * @property {{gap:number, options:{yield:string, amount:number, building:string|null, buildingGives:number}[]}|null}
 *   fix What would close the gap to the best destination (emigration-prescribe.js), or null when there is none.
 * @property {{open:StanceStatus, closed:StanceStatus}} stance The two stance cards: slotted, or unlocked and
 *   waiting for a slot, or behind a civic.
 * @property {{count:number, origins:{civ:number, name:string, people:number}[],
 *   all:{civ:number, name:string, people:number, ours:boolean}[]}} newcomers The people living here who came from
 *   another civilization, by origin, largest first (the Arrived block), and `all` the whole composition with the
 *   owner's own people in it (the "Who lives here" pie).
 * @property {number} bar The move bar at this game speed: pressure accumulates toward it; a move fires at it.
 */

/**
 * @typedef {Object} StanceStatus
 * @property {boolean} slotted
 * @property {boolean} unlocked Whether the card can be slotted (its civic is done); true when it can't be read.
 * @property {string} civic The civic that unlocks the card, named, or "" when unknown.
 */

/**
 * One stance card's standing for a player this age: slotted, unlocked, and the civic that unlocks it. The age's
 * database holds only the current age's card, so the first type the Traditions table knows is the one.
 * @param {number} pid @param {boolean} slotted @param {readonly string[]} types The family's types, one per age.
 * @returns {StanceStatus}
 */
function stanceStatus(pid, slotted, types) {
  /** @type {StanceStatus} */
  const out = { slotted, unlocked: true, civic: "" };
  try {
    const nodeType = unlockNodeFor(types);
    if (!nodeType) return out;
    const node = GameInfo.ProgressionTreeNodes.lookup(nodeType);
    out.civic = node && node.Name ? loc(node.Name, node.Name) : "";
    const culture = typeof Players !== "undefined" ? Players.get(pid)?.Culture : null;
    if (culture && typeof culture.isNodeUnlocked === "function") {
      out.unlocked = !!culture.isNodeUnlocked(nodeType);
    }
  } catch (_) {
    /* an unreadable tree leaves the card as slottable */
  }
  return out;
}

/**
 * The civic node that unlocks this age's card of a family, or null off-engine or when the age has no such card.
 * @param {readonly string[]} types @returns {string|null}
 */
function unlockNodeFor(types) {
  if (typeof GameInfo === "undefined") return null;
  const type = types.find((t) => !!GameInfo.Traditions.lookup(t));
  if (!type) return null;
  const unlock = GameInfo.ProgressionTreeNodeUnlocks.find((/** @type {*} */ u) => u.TargetType === type);
  return unlock ? String(unlock.ProgressionTreeNodeType) : null;
}

/** @param {number} pid @returns {{open:StanceStatus, closed:StanceStatus}} */
function liveStances(pid) {
  const p = policyState(pid);
  return {
    open: stanceStatus(pid, !!p.open, POLICY_TYPES.open),
    closed: stanceStatus(pid, !!p.closed, POLICY_TYPES.closed)
  };
}

/**
 * The settlement's residents from other civilizations, by origin, from its composition record. A civilization the
 * player hasn't met is counted without its name.
 * @param {*} sig @param {(city:*)=>*} compositionOf @returns {SettlementModel["newcomers"]}
 */
export function newcomersOf(sig, compositionOf) {
  const comp = compositionOf(sig.city);
  if (!comp || !Array.isArray(comp.civs)) return { count: 0, origins: [], all: [] };
  /** @type {{civ:number, pts:number}[]} */
  const civs = comp.civs;
  const all = civs
    .filter((c) => c.pts > 0)
    .map((c) => ({
      civ: c.civ, people: Math.round(c.pts), ours: c.civ === sig.owner,
      name: c.civ === sig.owner ? loc("LOC_EMIG_SC_OUR_OWN", "Our own people")
        : civHidden(c.civ) ? loc("LOC_EMIG_SC_UNMET", "an unmet people") : civAdjective(c.civ)
    }))
    .filter((o) => o.people > 0)
    .sort((a, b) => b.people - a.people);
  const origins = all.filter((o) => !o.ours).map((o) => ({ civ: o.civ, name: o.name, people: o.people }));
  return { count: origins.reduce((n, o) => n + o.people, 0), origins, all };
}

/** @param {*} s @returns {number} */
function num(s) {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {*} src The settlement. @param {*} dest Another. @param {number} pull @param {*} ctx The pull context.
 * @param {(sig:*)=>string} nameOf @returns {PullRow}
 */
function pullRow(src, dest, pull, ctx, nameOf) {
  const crossCiv = dest.owner !== src.owner;
  return {
    name: nameOf(dest), owner: dest.owner, civ: crossCiv ? civAdjective(dest.owner) : "", crossCiv, pull,
    why: weigh(explainPull(src, dest, ctx))
  };
}

/**
 * The destinations with the greatest pull on this settlement's people.
 * @param {*} sig @param {*[]} ranked @param {Record<number, number>|null} ownerPop
 * @param {(sig:*)=>string} nameOf @returns {PullRow[]}
 */
export function pulledToward(sig, ranked, ownerPop, nameOf) {
  const ctx = pullContext(sig, ranked, ownerPop);
  /** @type {{dest:*, pull:number}[]} */
  const hits = [];
  for (const dest of ranked) {
    const pull = adjustedPull(sig, dest, ctx.flee, ctx.ownerPop, ctx.aggressors);
    if (pull !== null && pull > 0) hits.push({ dest, pull });
  }
  hits.sort((a, b) => b.pull - a.pull);
  return hits.slice(0, PULL_ROWS).map((h) => pullRow(sig, h.dest, h.pull, ctx, nameOf));
}

/**
 * The settlements whose best destination is this one, strongest first, and how many there are in all.
 * @param {*} sig @param {*[]} ranked @param {Record<number, number>|null} ownerPop
 * @param {(sig:*)=>string} nameOf @returns {{rows:PullRow[], count:number}}
 */
export function drawnFrom(sig, ranked, ownerPop, nameOf) {
  /** @type {{src:*, pull:number}[]} */
  const hits = [];
  for (const src of ranked) {
    if (src.key === sig.key) continue;
    const best = bestDestination(src, ranked, ownerPop);
    if (best && best.dest && best.dest.key === sig.key) hits.push({ src, pull: best.adjusted });
  }
  hits.sort((a, b) => b.pull - a.pull);
  const rows = hits.slice(0, DRAW_ROWS).map((h) => {
    const ctx = pullContext(h.src, ranked, ownerPop);
    const row = pullRow(h.src, h.src, h.pull, ctx, nameOf);
    row.why = weigh(explainPull(h.src, sig, ctx));
    return row;
  });
  return { rows, count: hits.length };
}

/**
 * The model for one settlement.
 * @param {*} sig The settlement's ranked signal.
 * @param {{ranked:*[], ownerPop:Record<number,number>|null, field:{meanHappiness:number}|null}} pass
 * @param {{nameOf?:(sig:*)=>string, stance?:(pid:number)=>{open:StanceStatus, closed:StanceStatus},
 *   compositionOf?:(city:*)=>*}} [deps]
 * @returns {SettlementModel}
 */
export function settlementModel(sig, pass, deps) {
  const d = deps || {};
  const nameOf = d.nameOf || destNameOf;
  const stance = d.stance || liveStances;
  const compositionOf = d.compositionOf || compositionForCity;
  const drawn = drawnFrom(sig, pass.ranked, pass.ownerPop, nameOf);
  return {
    name: nameOf(sig), city: sig.city, pros: num(sig.pros),
    score: weigh(explainPush(sig, pass.field || null)),
    ledger: explainLedger(sig, pass.field || null),
    pulledToward: pulledToward(sig, pass.ranked, pass.ownerPop, nameOf),
    drawnFrom: drawn.rows, drawnFromCount: drawn.count,
    fix: prescribe(sig, pass.ranked, pass.ownerPop),
    stance: stance(sig.owner),
    bar: speedBar(CONFIG.emigrationBar) > 0 ? speedBar(CONFIG.emigrationBar) : 1,
    newcomers: newcomersOf(sig, compositionOf)
  };
}

/**
 * The models for the local player's settlements, by composed name, from the live pass. Empty before the first
 * pass or when the world can't be read; the card then shows its bars alone.
 * @param {number} pid The local player. @returns {Map<string, SettlementModel>}
 */
export function liveSettlementModels(pid) {
  /** @type {Map<string, SettlementModel>} */
  const out = new Map();
  const pass = livePass();
  if (!pass) return out;
  for (const sig of pass.ranked) {
    if (sig.owner !== pid) continue;
    try {
      const m = settlementModel(sig, pass);
      if (m.name) out.set(m.name, m);
    } catch (_) {
      /* one unreadable settlement leaves the others their cards */
    }
  }
  return out;
}
