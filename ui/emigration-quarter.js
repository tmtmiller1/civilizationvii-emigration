// emigration-quarter.js
//
// The Cultural Quarter DECISION system: the runtime that turns an established foreign diaspora (one
// that already reads as a "quarter" in the Migration Chronicle) into a persistent, player-shaped
// district. Three responsibilities, all defensive and flag-gated:
//
//   1. FORM + DECIDE. When one of the local player's cities hosts a newly-established quarter, offer a
//      short choice (embrace / tax / let be) and apply its bounded one-time yields. Throttled with a
//      per-age cap + a cooldown, and RANKED BELOW the refugee dilemma: if a dilemma modal already
//      fired this pass, the quarter waits for a later pass, so two modals never race.
//   2. NO STACKING / CHANGE OF HANDS. One quarter per host tile (the city-centre plot). If a different
//      origin overtakes the tile, the prior stance's yields are reversed exactly and the record is
//      replaced (the Chronicle notes the quarter changing hands).
//   3. CONTESTED WAR-STRAIN. While the host is at war with a quarter's homeland, the quarter turns
//      "contested": a bounded per-pass happiness strain on the host, capped across all its quarters.
//      This reacts to war WITHOUT assuming any callable native-revolt trigger (the engine owns revolts).
//
// The player-facing decision reuses the refugee-dilemma modal (emigration-dilemma-view.js) with a
// "Cultural Quarter" eyebrow. State persists via emigration-quarter-state.js. Never throws into a pass.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { buildArrivalMassIndex, establishedQuarterForCity } from "/emigration/ui/emigration-diaspora.js";
import {
  quarterAt, putQuarter, quartersForOwner, canDecide, noteDecision, setContested, saveQuarters
} from "/emigration/ui/emigration-quarter-state.js";
import { quarterOptions, quarterOption } from "/emigration/ui/emigration-quarter-registry.js";
import { applyQuarterYields, reverseQuarterYields, deduct } from "/emigration/ui/emigration-effects.js";
import { quarterName, narrativeCiv } from "/emigration/ui/emigration-naming.js";
import { warOpponents } from "/emigration/ui/emigration-war.js";
import { chronicle } from "/emigration/ui/emigration-chronicle.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";
import { loc as tr } from "/emigration/ui/emigration-loc.js";

/**
 * The local (viewing) player id, or null.
 * @returns {number|null} The local player id.
 */
function localPid() {
  try {
    return typeof GameContext !== "undefined" && typeof GameContext.localPlayerID === "number"
      ? GameContext.localPlayerID : null;
  } catch (_) {
    return null;
  }
}

/**
 * The current age ordinal (for the per-age cap), or 0.
 * @returns {number} Game.age or 0.
 */
function currentAge() {
  try {
    return typeof Game !== "undefined" && typeof Game.age === "number" ? Game.age : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * The city-centre plot key "x,y", or null when the location is unreadable.
 * @param {*} city A live city object.
 * @returns {string|null} The plot key.
 */
function tileKeyOf(city) {
  try {
    const loc = city && city.location;
    if (!loc || typeof loc.x !== "number" || typeof loc.y !== "number") return null;
    return loc.x + "," + loc.y;
  } catch (_) {
    return null;
  }
}

/**
 * Resolve the one-time yields a chosen stance applies, from the option's yield identities and the
 * CONFIG amounts. A null yield contributes nothing (the passive "let be" stance).
 * @param {{benefitYield:(string|null), penaltyYield:(string|null)}} option The chosen option.
 * @returns {*} The resolved yields (benefit/penalty yield + amount).
 */
function resolveApplied(option) {
  const reward = Math.max(0, Number(CONFIG.quarterRewardAmount) || 0);
  const drawback = Math.max(0, Number(CONFIG.quarterDrawbackAmount) || 0);
  return {
    benefitYield: option.benefitYield || null,
    benefitAmount: option.benefitYield ? reward : 0,
    penaltyYield: option.penaltyYield || null,
    penaltyAmount: option.penaltyYield ? drawback : 0
  };
}

/**
 * The candidate-quarter record for one city signal, or null when it isn't a fresh offer (not the
 * local player's, unreadable tile, no established quarter, or already recorded for the same origin).
 * @param {*} s A city signal. @param {number} me Local player id. @param {Map<string, number>} massIdx Arrival index.
 * @returns {{city:*, tileKey:string, quarter:*, pop:number}|null} The candidate, or null.
 */
function candidateFromSignal(s, me, massIdx) {
  if (!s || s.owner !== me || !s.city) return null;
  const tileKey = tileKeyOf(s.city);
  if (!tileKey) return null;
  const quarter = establishedQuarterForCity(s.city, massIdx);
  if (!quarter) return null;
  const existing = quarterAt(tileKey);
  if (existing && existing.civ === quarter.civ) return null; // already settled this origin's quarter
  return { city: s.city, tileKey, quarter, pop: s.population || 0 };
}

/**
 * The candidate quarter to offer this pass: the largest local city hosting an established quarter that
 * ISN'T already recorded for the same origin (a fresh quarter, or a change-of-hands to a new origin).
 * @param {*[]} signals The pass's city signals. @param {number} me Local player id.
 * @returns {{city:*, tileKey:string, quarter:*}|null} The candidate, or null.
 */
function pickCandidate(signals, me) {
  const massIdx = buildArrivalMassIndex();
  /** @type {{city:*, tileKey:string, quarter:*, pop:number}[]} */
  const found = [];
  for (const s of signals || []) {
    const cand = candidateFromSignal(s, me, massIdx);
    if (cand) found.push(cand);
  }
  found.sort((a, b) => b.pop - a.pop);
  return found.length ? { city: found[0].city, tileKey: found[0].tileKey, quarter: found[0].quarter } : null;
}

/**
 * Record the player's stance in the Migration Chronicle, and (on a change-of-hands) that the quarter
 * changed hands to a new origin.
 * @param {string} optionId The chosen stance. @param {{civ:number,name:string}} quarter The quarter.
 * @param {{civ:number}|null} prior The prior record on the tile, or null. @param {number} turn Now.
 */
function chronicleDecision(optionId, quarter, prior, turn) {
  const name = quarterName(quarter.civ);
  if (prior && prior.civ !== quarter.civ) {
    chronicle({
      kind: "founding", title: tr("LOC_EMIG_QTR_CHRON_HANDS_TITLE", "The Quarter Changes Hands"),
      body: tr("LOC_EMIG_QTR_CHRON_HANDS_BODY",
        "In {1_Place}, the {2_PriorAdj} quarter gave way to the {3_Name}, a new people now holding the district as their own.",
        quarter.name, narrativeCiv(prior.civ).adj, name),
      civ: narrativeCiv(quarter.civ).adj, dedupeKey: "quarter:hands:" + quarter.name + "|" + quarter.civ + "|" + turn
    });
  }
  const stance = optionId === "embrace"
    ? tr("LOC_EMIG_QTR_STANCE_EMBRACE", "You embraced the {1_Name}, and its customs enrich the city.", name)
    : optionId === "tax"
      ? tr("LOC_EMIG_QTR_STANCE_TAX",
        "You taxed the trade of the {1_Name}; its coin flows to your treasury, its people chafe.", name)
      : tr("LOC_EMIG_QTR_STANCE_LETBE", "You let the {1_Name} keep to itself.", name);
  chronicle({
    kind: "founding", title: tr("LOC_EMIG_QTR_CHRON_DECISION_TITLE", "A {1_Name}", name), body: stance,
    civ: narrativeCiv(quarter.civ).adj, dedupeKey: "quarter:decision:" + quarter.name + "|" + quarter.civ + "|" + turn
  });
}

/**
 * Apply the chosen stance: reverse any prior (different-origin) yields, apply the new stance's yields,
 * write the tile record, stamp the throttle, chronicle it, and persist. Fully guarded.
 * @param {string} optionId The chosen option id. @param {string} tileKey The plot key.
 * @param {{civ:number,owner:number,name:string}} quarter The quarter.
 * @param {number} me Local player id. @param {number} turn Now.
 */
function applyQuarterChoice(optionId, tileKey, quarter, me, turn) {
  try {
    const option = quarterOption(optionId);
    const applied = resolveApplied(option);
    const prior = quarterAt(tileKey);
    if (prior && prior.civ !== quarter.civ) reverseQuarterYields(prior.owner, prior.applied);
    applyQuarterYields(me, applied);
    putQuarter(tileKey, {
      civ: quarter.civ, owner: me, optionId: option.id, turn,
      applied, contested: false, contestedTurn: -999
    });
    noteDecision(turn);
    chronicleDecision(option.id, quarter, prior, turn);
    saveQuarters();
  } catch (_) {
    /* a quarter outcome must never break anything */
  }
}

/**
 * The modal view model for a quarter decision (the "Cultural Quarter" eyebrow, a titled prompt, and
 * the three stances). Dismissing (click-outside / Escape) resolves as the passive "ignore" stance.
 * @param {{civ:number,name:string,share:number}} quarter The quarter.
 * @returns {{title:string, body:string, eyebrow:string, dismissId:string, choices:*[]}} The view.
 */
function quarterView(quarter) {
  const name = quarterName(quarter.civ);
  const pct = Math.round((quarter.share || 0) * 100);
  return {
    eyebrow: tr("LOC_EMIG_QTR_EYEBROW", "Cultural Quarter"),
    dismissId: "ignore",
    title: tr("LOC_EMIG_QTR_TITLE", "The {1_Name} Takes Root", name),
    body: tr("LOC_EMIG_QTR_BODY",
      "A lasting community from {1_Adj} now holds a district of its own in {2_Place}, grown to {3_Pct} percent of the city. How will you meet them?",
      narrativeCiv(quarter.civ).adj, quarter.name, pct),
    choices: quarterOptions()
  };
}

/**
 * Per-pass entry point (1): maybe present the Cultural Quarter decision. Gated by CONFIG.quartersEnabled,
 * ranked below the refugee dilemma (skips when one fired this pass), and throttled by a per-age cap +
 * cooldown. Never throws into the pass.
 * @param {*[]} signals The pass's city signals.
 * @param {boolean} dilemmaFired Whether a refugee dilemma fired this pass.
 */
export function maybeQuarter(signals, dilemmaFired) {
  if (!CONFIG.quartersEnabled || dilemmaFired) return;
  const me = localPid();
  if (me == null) return;
  try {
    const turn = monoTurn();
    if (!canDecide(turn, currentAge())) return;
    const cand = pickCandidate(signals, me);
    if (!cand) return;
    showDilemma(quarterView(cand.quarter), (/** @type {string} */ id) =>
      applyQuarterChoice(id, cand.tileKey, cand.quarter, me, turn));
  } catch (_) {
    /* never disrupt a pass */
  }
}

/**
 * Update one owner's contested quarters against its current wars, returning the total happiness strain
 * to charge (bounded by the per-owner cap). A quarter is contested while the owner is at war with its
 * homeland; the first time it turns contested, the Chronicle notes the unrest.
 * @param {number} owner Host player id. @param {number} turn Now.
 * @returns {number} The (uncapped) strain to charge for this owner's contested quarters.
 */
function accrueContestedStrain(owner, turn) {
  const opponents = warOpponents(owner);
  const per = Math.max(0, Number(CONFIG.contestedQuarterPenalty) || 0);
  let strain = 0;
  for (const { tileKey, rec } of quartersForOwner(owner)) {
    const nowContested = opponents.has(rec.civ);
    const wasContested = rec.contested;
    setContested(tileKey, nowContested, turn);
    if (nowContested && !wasContested) {
      chronicle({
        kind: "founding", title: tr("LOC_EMIG_QTR_CHRON_RESTLESS_TITLE", "A Quarter Grows Restless"),
        body: tr("LOC_EMIG_QTR_CHRON_RESTLESS_BODY",
          "War with {1_Adj} sets the {2_Name} on edge; the district simmers.",
          narrativeCiv(rec.civ).adj, quarterName(rec.civ)),
        civ: narrativeCiv(rec.civ).adj, dedupeKey: "quarter:contested:" + tileKey + "|" + rec.civ + "|" + turn
      });
    }
    if (nowContested) strain += per;
  }
  return strain;
}

/**
 * Per-pass entry point (2): react to war strain on the local player's quarters. Marks quarters
 * contested while the host is at war with their homeland and charges a bounded happiness strain
 * (capped across all of the host's quarters). Never throws into the pass; never assumes a callable
 * native-revolt trigger.
 * @param {*[]} _signals The pass's city signals (unused; state-driven).
 */
export function tickContestedQuarters(_signals) {
  if (!CONFIG.quartersEnabled) return;
  const me = localPid();
  if (me == null) return;
  try {
    const turn = monoTurn();
    const strain = accrueContestedStrain(me, turn);
    if (strain > 0) {
      const cap = Math.max(0, Number(CONFIG.diasporaWarStrainCap) || 0);
      const charged = cap > 0 ? Math.min(strain, cap) : strain;
      if (charged > 0) deduct(me, "YIELD_HAPPINESS", -charged);
    }
    saveQuarters();
  } catch (_) {
    /* never disrupt a pass */
  }
}

// Test hook: the pure decision pieces.
export const __test = { resolveApplied, pickCandidate, quarterView, accrueContestedStrain, tileKeyOf };
