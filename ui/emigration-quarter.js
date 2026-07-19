// emigration-quarter.js
//
// The Cultural Quarter DECISION system: the runtime that turns an established foreign diaspora (one
// that already reads as a "quarter" in the Migration Chronicle) into a persistent, player-shaped
// district. Three responsibilities, all defensive and flag-gated:
//
//   1. FORM + DECIDE. When one of the local player's cities hosts a newly-established quarter, offer a
//      short choice (embrace / tax / let be); the chosen stance's small bounded yields are then applied
//      every turn (see tickContestedQuarters), so the effect actually persists and reads in the city's
//      yields. Throttled with a per-age cap + a cooldown, and RANKED BELOW the refugee dilemma: if a
//      dilemma modal already fired this pass, the quarter waits for a later pass, so two modals never race.
//      The stance grant is the "recognized but UNBUILT" reward: once the origin's enclave IMPROVEMENT is
//      built in that city, its native yield takes over and the grant steps aside, so one enclave is never
//      paid for twice (roadmap §22a; see emigration-enclave-built.js).
//   2. NO STACKING / CHANGE OF HANDS. One quarter per host tile (the city-centre plot). If a different
//      origin overtakes the tile, the record is simply replaced; because yields are applied per-turn
//      from the current record, nothing needs reversing (the Chronicle notes the quarter changing hands).
//   3. CONTESTED WAR-STRAIN. While the host is at war with a quarter's homeland, the quarter turns
//      "contested": a bounded per-pass happiness strain on the host, capped across all its quarters.
//      This reacts to war WITHOUT assuming any callable native-revolt trigger (the engine owns revolts).
//
// The player-facing decision reuses the refugee-dilemma modal (emigration-dilemma-view.js) with a
// "Cultural Enclave" eyebrow. State persists via emigration-quarter-state.js. Never throws into a pass.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { establishedQuarterForCity } from "/emigration/ui/emigration-diaspora.js";
import {
  quarterAt, putQuarter, quartersForOwner, canDecide, noteDecision, setContested, saveQuarters,
  candidacyAt, putCandidacy, dropCandidacy, allCandidacyEntries, dwellSatisfied
} from "/emigration/ui/emigration-quarter-state.js";
import { quarterOptionsFor, quarterOptionFor } from "/emigration/ui/emigration-quarter-registry.js";
import { quarterQuote, quarterQuoteKey, quoteDisplay, renderableLine } from "/emigration/ui/emigration-quarter-bonuses.js";
import { applyQuarterYields, deduct } from "/emigration/ui/emigration-effects.js";
import { quarterName, narrativeCiv, civType } from "/emigration/ui/emigration-naming.js";
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
 * Capitalise the first letter of an edge phrase for sentence-initial use ("by the harbour" →
 * "By the harbour"), with a safe fallback when the phrase is missing.
 * @param {string|null|undefined} s The edge phrase. @returns {string} The capitalised phrase.
 */
function capFirst(s) {
  const t = typeof s === "string" && s.length ? s : "at the city's edge";
  return t.charAt(0).toUpperCase() + t.slice(1);
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

/** Most enclaves ONE origin civilisation may hold across a host's cities (a different origin overtaking
 * a tile is a change-of-hands, not a new one). Beyond this, a fresh same-origin enclave is not offered. */
const MAX_ENCLAVES_PER_CIV = 2;

/**
 * How many enclaves the owner already holds from the SAME origin CIVILISATION, excluding `exceptTileKey`
 * (the candidate's own tile). This is a **per-civ** count, not a global one — it only sees enclaves whose
 * origin matches, so a host can hold up to the cap from EACH distinct origin civ independently.
 *
 * Identity is by **CivilizationType**, not player: two players sharing a civ count together, and an
 * origin player that later changes civ across an age does not merge its old and new enclaves. Each record
 * carries its `originCiv` (the CivilizationType captured when it formed); the target civ (`originCiv`) is
 * resolved once by the caller. When either side's CivilizationType is unavailable (a legacy record or an
 * unreadable player), the comparison falls back deterministically to the raw origin player id.
 * @param {number} owner Host player id. @param {number} originPid Origin player id.
 * @param {string|null} originCiv The origin's resolved CivilizationType, or null.
 * @param {string|null} exceptTileKey A tile to exclude, or null.
 * @returns {number} The count of existing same-origin enclaves.
 */
function enclaveCountForCiv(owner, originPid, originCiv, exceptTileKey) {
  let n = 0;
  for (const { tileKey, rec } of quartersForOwner(owner)) {
    if (tileKey === exceptTileKey) continue;
    const recCiv = rec.originCiv || civType(rec.civ); // persisted identity, else resolve a legacy record
    const same = originCiv && recCiv ? recCiv === originCiv : rec.civ === originPid;
    if (same) n++;
  }
  return n;
}

/**
 * The fresh established quarter on a city's tile, or null when it isn't a fresh offer (not the local
 * player's, unreadable tile, no established quarter, or already recorded for the same origin). Shared by
 * the offer path and the dwell-clock observer so both agree on what "an offerable enclave" is.
 * @param {*} s A city signal. @param {number} me Local player id. @param {boolean} [force] Relax the
 *   established-share bar to the foothold share (the "Force enclave" option).
 * @returns {{tileKey:string, quarter:*}|null} The tile + established quarter, or null.
 */
function offerableQuarter(s, me, force) {
  if (!s || s.owner !== me || !s.city) return null;
  const tileKey = tileKeyOf(s.city);
  if (!tileKey) return null;
  const quarter = establishedQuarterForCity(s.city, force);
  if (!quarter) return null;
  const existing = quarterAt(tileKey);
  if (existing && existing.civ === quarter.civ) return null; // already settled this origin's enclave
  return { tileKey, quarter };
}

/**
 * The candidate-quarter record for one city signal, or null when it isn't offerable (see
 * {@link offerableQuarter}), the enclave hasn't dwelt long enough yet, or the origin civ is already at
 * its per-civ enclave cap. `ordinal` is the count of the origin's existing enclaves (0 for the first, 1
 * for the second) — it selects which single quote the modal shows.
 * @param {*} s A city signal. @param {number} me Local player id. @param {number} turn Now (monotonic).
 * @param {boolean} [force] Bypass the dwell gate and relax the share bar to foothold (the "Force enclave"
 *   option); the per-civ enclave cap and "already settled this origin" checks still apply.
 * @returns {{city:*, tileKey:string, quarter:*, pop:number, ordinal:number, originCiv:(string|null)}|null}
 *   The candidate, or null.
 */
function candidateFromSignal(s, me, turn, force) {
  const base = offerableQuarter(s, me, force);
  if (!base) return null;
  const { tileKey, quarter } = base;
  const originCiv = civType(quarter.civ);
  // Persistence gate: the enclave must have stayed established for quarterDwellTurns (its dwell clock is
  // tracked per pass by observeQuarterDwell), so a transient spike never triggers a permanent enclave.
  // Forcing skips this so a tester can trigger the decision without waiting out the dwell clock.
  if (!force && !dwellSatisfied(tileKey, originCiv, quarter.civ, turn)) return null;
  const ordinal = enclaveCountForCiv(me, quarter.civ, originCiv, tileKey);
  if (ordinal >= MAX_ENCLAVES_PER_CIV) return null; // §3: cap enclaves PER origin civilisation (not global)
  return { city: s.city, tileKey, quarter, pop: s.population || 0, ordinal, originCiv };
}

/**
 * Whether a candidacy record still names the same origin (by CivilizationType, else by raw player id).
 * @param {*} cur The current candidacy record, or null. @param {string|null} originCiv The origin's
 *   CivilizationType, or null. @param {number} civ The origin player id (legacy fallback).
 * @returns {boolean} True when the record names this origin.
 */
function sameCandidacyOrigin(cur, originCiv, civ) {
  if (!cur) return false;
  return originCiv && cur.originCiv ? cur.originCiv === originCiv : cur.civ === civ;
}

/**
 * Refresh (or start) one local city's dwell clock this pass. Non-established cities are left to lapse.
 * @param {*} s A city signal. @param {number} me Local player id. @param {number} turn Now (monotonic).
 */
function touchDwellClock(s, me, turn) {
  if (!s || s.owner !== me || !s.city) return;
  const tileKey = tileKeyOf(s.city);
  if (!tileKey) return;
  const quarter = establishedQuarterForCity(s.city);
  if (!quarter) return; // not established this pass → its clock (if any) may lapse in the prune
  const originCiv = civType(quarter.civ);
  const cur = candidacyAt(tileKey);
  if (cur && sameCandidacyOrigin(cur, originCiv, quarter.civ)) cur.lastSeen = turn; // keep start, refresh last-seen
  else putCandidacy(tileKey, { civ: quarter.civ, originCiv, since: turn, lastSeen: turn });
}

/**
 * Update the per-tile dwell clocks for the local player's established enclaves. Called EVERY pass (before
 * the offer gate, even on passes where nothing is offered) so the clocks stay current. For each of the
 * owner's cities currently hosting an established foreign enclave: start a clock the first time the origin
 * is seen, keep the existing clock's start while the SAME origin persists (only refreshing lastSeen), and
 * restart it when a DIFFERENT origin has overtaken the tile. A candidacy whose enclave has lapsed for
 * longer than quarterDwellGrace turns is pruned, so a diaspora that shrinks below the bar (integrated,
 * returned home, fled) loses its accrued dwell — but a brief dip within the grace window does not.
 * @param {*[]} signals The pass's city signals. @param {number} me Local player id. @param {number} turn Now.
 */
function observeQuarterDwell(signals, me, turn) {
  for (const s of signals || []) touchDwellClock(s, me, turn);
  const grace = Math.max(0, Number(CONFIG.quarterDwellGrace) || 0);
  for (const { tileKey, rec } of allCandidacyEntries()) {
    if (turn - rec.lastSeen > grace) dropCandidacy(tileKey);
  }
}

/**
 * The candidate quarter to offer this pass: the largest local city hosting an established quarter that
 * ISN'T already recorded for the same origin (a fresh quarter, or a change-of-hands to a new origin).
 * @param {*[]} signals The pass's city signals. @param {number} me Local player id. @param {number} turn Now.
 * @param {boolean} [force] Forward the "Force enclave" relaxation to each candidate check.
 * @returns {{city:*, tileKey:string, quarter:*, ordinal:number, originCiv:(string|null)}|null} The candidate, or null.
 */
function pickCandidate(signals, me, turn, force) {
  /** @type {{city:*, tileKey:string, quarter:*, pop:number, ordinal:number, originCiv:(string|null)}[]} */
  const found = [];
  for (const s of signals || []) {
    const cand = candidateFromSignal(s, me, turn, force);
    if (cand) found.push(cand);
  }
  found.sort((a, b) => b.pop - a.pop);
  const t = found[0];
  if (!t) return null;
  return { city: t.city, tileKey: t.tileKey, quarter: t.quarter, ordinal: t.ordinal, originCiv: t.originCiv };
}

/**
 * Record the player's stance in the Migration Chronicle, and (on a change-of-hands) that the quarter
 * changed hands to a new origin. The active-stance line is drawn from the chosen origin-specific
 * option (its action + one-line flavour "why"), so the record reads uniquely per civilization; the
 * passive stance keeps its own line.
 * @param {{id:string,label:string,note:string,benefitYield:(string|null)}} option The chosen option.
 * @param {{civ:number,name:string,where:string}} quarter The quarter.
 * @param {{civ:number}|null} prior The prior record on the tile, or null. @param {number} turn Now.
 */
function chronicleDecision(option, quarter, prior, turn) {
  const name = quarterName(quarter.civ);
  if (prior && prior.civ !== quarter.civ) {
    chronicle({
      kind: "founding", title: tr("LOC_EMIG_QTR_CHRON_HANDS_TITLE", "The Enclave Changes Hands"),
      body: tr("LOC_EMIG_QTR_CHRON_HANDS_BODY",
        "The old {1_Name} has faded as its families moved on, married in, or were overtaken by new arrivals. {2_Where}, {3_Adj} households now give the ward its name, its customs, and its bargains.",
        quarterName(prior.civ), capFirst(quarter.where), narrativeCiv(quarter.civ).adj),
      civ: narrativeCiv(quarter.civ).adj, dedupeKey: "quarter:hands:" + quarter.name + "|" + quarter.civ + "|" + turn
    });
  }
  const stance = option.benefitYield
    ? tr("LOC_EMIG_QTR_STANCE_ACTIVE_" + option.id,
      "In {1_Place}, you chose to {2_Act} — the {3_Name} takes its place in the city's life.",
      quarter.name, String(option.label || "").toLowerCase(), name)
    : tr("LOC_EMIG_QTR_STANCE_LETBE", "You let the {1_Name} keep to itself.", name);
  chronicle({
    kind: "founding", title: tr("LOC_EMIG_QTR_CHRON_DECISION_TITLE", "A {1_Name}", name), body: stance,
    civ: narrativeCiv(quarter.civ).adj, dedupeKey: "quarter:decision:" + quarter.name + "|" + quarter.civ + "|" + turn
  });
}

/**
 * Apply the chosen stance: write the tile record (one quarter per tile, so a different origin simply
 * REPLACES it), stamp the throttle, chronicle it, and persist. The stance's yields are not granted here
 * as a one-time lump (a one-time Happiness/Culture grant is wiped by the engine's per-turn recompute, so
 * it never showed up); instead they are applied every turn by {@link tickContestedQuarters} from
 * whatever record currently holds the tile, which also makes a change-of-hands self-correct with no reversal.
 * Fully guarded.
 * @param {string} optionId The chosen option id. @param {string} tileKey The plot key.
 * @param {{civ:number,owner:number,name:string,where:string}} quarter The quarter.
 * @param {number} me Local player id. @param {number} turn Now.
 */
function applyQuarterChoice(optionId, tileKey, quarter, me, turn) {
  try {
    const ct = civType(quarter.civ);
    const option = quarterOptionFor(ct, optionId);
    const applied = resolveApplied(option);
    const prior = quarterAt(tileKey);
    putQuarter(tileKey, {
      civ: quarter.civ, originCiv: ct || null, owner: me, optionId: option.id, turn,
      applied, contested: false, contestedTurn: -999
    });
    dropCandidacy(tileKey); // the enclave has formed — its dwell clock has done its job
    noteDecision(turn);
    chronicleDecision(option, quarter, prior, turn);
    saveQuarters();
  } catch (_) {
    /* a quarter outcome must never break anything */
  }
}

/**
 * The single flavour quote shown for an enclave: the origin's FIRST enclave shows quote "a", its SECOND
 * shows quote "b" (`ordinal` is the count of the origin's existing enclaves). Localized through its LOC
 * key with the English display as the fallback; "" when the civ has no quote.
 * @param {string|null} ct The origin CivilizationType. @param {number} ordinal 0 = first, 1 = second.
 * @returns {string} The composed quote display, or "".
 */
function enclaveQuote(ct, ordinal) {
  if (!ct) return "";
  const qid = ordinal >= 1 ? "b" : "a";
  const q = quarterQuote(ct, qid);
  // The LOC row ships the quote's ORIGINAL script (Arabic/CJK/Greek/…) which the dialog font can't draw,
  // so guard the composed line — the in-game Locale.compose path skips quoteDisplay's own renderable pass.
  return q ? renderableLine(tr(quarterQuoteKey(ct, qid), quoteDisplay(q))) : "";
}

/**
 * The modal view model for a quarter decision (the "Cultural Enclave" eyebrow, a titled prompt, ONE
 * attributed quote, and the three stances). Dismissing (click-outside / Escape) resolves as the passive
 * "ignore" stance. Only a single quote is shown — the origin's first enclave uses quote "a", its second
 * uses quote "b".
 * @param {{civ:number,name:string,share:number,where:string}} quarter The quarter.
 * @param {number} [ordinal] Count of the origin's existing enclaves (0 = first, 1 = second).
 * @returns {{title:string, body:string, eyebrow:string, dismissId:string, quote:string, choices:*[]}} The view.
 */
function quarterView(quarter, ordinal) {
  const name = quarterName(quarter.civ);
  const ct = civType(quarter.civ);
  return {
    eyebrow: tr("LOC_EMIG_QTR_EYEBROW", "Cultural Enclave"),
    dismissId: "ignore",
    title: tr("LOC_EMIG_QTR_TITLE", "The {1_Name}", name),
    body: tr("LOC_EMIG_QTR_BODY",
      "The {1_Adj} families of {2_Place} have become more than new arrivals. {3_Where}, their shops, shrines, workshops, festivals, and habits now draw a life of their own — a district with a memory from elsewhere. Recognize the enclave, and decide what tradition the city will make room for.",
      narrativeCiv(quarter.civ).adj, quarter.name, capFirst(quarter.where)),
    quote: enclaveQuote(ct, ordinal || 0),
    choices: quarterOptionsFor(ct)
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
  if (!CONFIG.quartersEnabled) return;
  const me = localPid();
  if (me == null) return;
  try {
    const turn = monoTurn();
    // Keep the dwell clocks current EVERY pass — including passes where a refugee dilemma fired or the
    // throttle blocks an offer — so a persistent enclave keeps accruing dwell toward its eventual offer.
    observeQuarterDwell(signals, me, turn);
    // Force mode (a testing option) offers the best qualifying diaspora regardless of the soft gates:
    // it ignores the refugee-dilemma ranking and the per-age throttle, and relaxes the share bar to
    // foothold. The min-stock floor and per-civ cap still apply, so it can't manufacture an enclave from
    // nothing — it just skips the waiting.
    const force = !!CONFIG.quarterForce;
    if (!force && dilemmaFired) return; // ranked BELOW the refugee dilemma: never race two modals in one pass
    if (!force && !canDecide(turn, currentAge())) return;
    const cand = pickCandidate(signals, me, turn, force);
    if (!cand) return;
    showDilemma(quarterView(cand.quarter, cand.ordinal), (/** @type {string} */ id) =>
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
        kind: "founding", title: tr("LOC_EMIG_QTR_CHRON_RESTLESS_TITLE", "War Tests the {1_Name}", quarterName(rec.civ)),
        body: tr("LOC_EMIG_QTR_CHRON_RESTLESS_BODY",
          "War with {1_Adj} falls hard on the {2_Name}: its families are cut off from kin in the fighting, and some neighbours meet them with cold looks, forgetting they did not choose this war. Until peace returns, that strain keeps the enclave from settling fully into the city's life.",
          narrativeCiv(rec.civ).adj, quarterName(rec.civ)),
        civ: narrativeCiv(rec.civ).adj, dedupeKey: "quarter:contested:" + tileKey + "|" + rec.civ + "|" + turn
      });
    }
    if (nowContested) strain += per;
  }
  return strain;
}

/**
 * Apply every one of the local player's quarters' recorded stance yields for THIS turn: the small
 * benefit (+) and drawback (−) each quarter grants ongoing. Applied fresh each turn (mirroring the
 * assimilation cost loop) so the effect actually persists and reads in the city's yields, and so a
 * change-of-hands needs no reversal — the current tile record is the single source of truth.
 *
 * A quarter whose origin has its ENCLAVE IMPROVEMENT BUILT in that city is SKIPPED: the improvement's
 * native Constructible_YieldChanges row is then the reward, and granting the stance yield on top would
 * pay twice for one enclave (roadmap §22a). The stance grant is the "recognized but unbuilt" reward and
 * steps aside once the enclave actually stands. The index is read once per turn, not once per quarter.
 *
 * A CONTESTED quarter (host at war with its homeland) pays only `contestedQuarterYieldFactor` of its
 * benefit — the war really does dim what the enclave contributes, not just the host's mood. Requires
 * `rec.contested` to be fresh, so the caller updates contested status BEFORE this runs.
 * @param {number} owner Local player id.
 */
function applyOwnerQuarterYields(owner) {
  for (const { rec } of quartersForOwner(owner)) {
    applyQuarterYields(owner, rec.applied, contestedBenefitScale(rec));
  }
}

/**
 * Clamp a configured yield factor into [0, 1], defaulting to 1 (full) when unset/invalid.
 * @param {*} v The raw config value. @returns {number} A factor in [0, 1].
 */
function clampFactor(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

/**
 * The share of its benefit yield a quarter pays THIS pass: a contested enclave (host at war with its
 * homeland) pays only the clamped `contestedQuarterYieldFactor`; a settled one pays full. The single
 * source of the contested-yield reduction, so the grant path and any diagnostic read agree.
 * @param {*} rec A quarter record. @returns {number} The benefit factor in [0, 1].
 */
export function contestedBenefitScale(rec) {
  return rec && rec.contested ? clampFactor(CONFIG.contestedQuarterYieldFactor) : 1;
}

/**
 * Per-pass entry point (2): first mark quarters contested while the host is at war with their homeland
 * (charging a bounded, capped happiness strain), THEN apply each quarter's ongoing stance yields so a
 * contested enclave's benefit is already dimmed this pass. Never throws into the pass; never assumes a
 * callable native-revolt trigger.
 * @param {*[]} _signals The pass's city signals (unused; state-driven).
 */
export function tickContestedQuarters(_signals) {
  if (!CONFIG.quartersEnabled) return;
  const me = localPid();
  if (me == null) return;
  try {
    const turn = monoTurn();
    // Refresh contested status FIRST so this pass's yield grant already reflects any new war: a
    // contested enclave pays a reduced benefit (applyOwnerQuarterYields reads the fresh rec.contested).
    const strain = accrueContestedStrain(me, turn);
    applyOwnerQuarterYields(me);
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
export const __test = {
  resolveApplied, pickCandidate, candidateFromSignal, observeQuarterDwell, quarterView, accrueContestedStrain,
  tileKeyOf, enclaveCountForCiv, MAX_ENCLAVES_PER_CIV, applyOwnerQuarterYields
};
