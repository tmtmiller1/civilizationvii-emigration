// emigration-quarter.js
//
// The Cultural Quarter DECISION system: an ESTABLISHED foreign community creates an enclave (record +
// map tile + Chronicle line); after the dwell period it is RECOGNIZED with a host stance that pays once
// (the local player chooses via the refugee-dilemma modal, other hosts automatically). One quarter per
// host tile (a new origin replaces the record); a quarter whose homeland is at war with the host is
// "contested" and strains happiness. State persists via emigration-quarter-state.js. Never throws into a pass.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { monoTurn } from "/emigration/ui/emigration-migration-stats.js";
import { relaxFor, capReached } from "/emigration/ui/emigration-enclave-pacing.js";
import { establishedQuarterForCity, establishedStockBar, chronicleEnclaveFounding } from "/emigration/ui/emigration-diaspora.js";
import {
  quarterAt, putQuarter, quartersForOwner, canDecide, noteDecision, setContested, saveQuarters,
  candidacyAt, putCandidacy, dropCandidacy, dropQuarter, allCandidacyEntries, allQuarterEntries, dwellSatisfied, noteFormed } from "/emigration/ui/emigration-quarter-state.js";
import { quarterOptionsFor, quarterOptionFor } from "/emigration/ui/emigration-quarter-registry.js";
import { quarterQuote, quarterQuoteKey, quoteDisplay, renderableLine } from "/emigration/ui/emigration-quarter-bonuses.js";
import { applyQuarterYields, deduct, grantSigned } from "/emigration/ui/emigration-effects.js";
import { stancePayout, affordable, payStance } from "/emigration/ui/emigration-stance-payout.js";
import { quarterName, narrativeCiv, civType } from "/emigration/ui/emigration-naming.js";
import { warOpponents } from "/emigration/ui/emigration-war.js";
import { chronicle } from "/emigration/ui/emigration-chronicle.js";
import { showDilemma } from "/emigration/ui/emigration-dilemma-view.js";
import {
  placeEnclave, enclaveTypeFor, enclaveStanding, placedPlotOccupied, plotYieldsAt, nativeYieldsOf,
  takeoverCompensation, destroyPlacedTile
} from "/emigration/ui/emigration-enclave-place.js";
import { cityCompositionByKey } from "/emigration/ui/emigration-composition.js";
import { enclaveYields, paidYields, yieldsText, yieldsButtonText, withYields } from "/emigration/ui/emigration-enclave-yields.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { toast } from "/emigration/ui/emigration-feedback.js";
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
 * Capitalize the first letter of an edge phrase for sentence-initial use ("by the harbor" →
 * "By the harbor"), with a safe fallback when the phrase is missing.
 * @param {string|null|undefined} s The edge phrase. @returns {string} The capitalized phrase.
 */
function capFirst(s) {
  const t = typeof s === "string" && s.length ? s : "at the city's edge";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Chronicle one enclave lifecycle moment and, when it happened in one of the LOCAL player's cities, also
 * raise it as an on-screen notification (the same line, yields included). Other hosts' enclaves reach
 * the Notifications log through the chronicle alone, so the HUD only speaks about the player's own.
 * @param {number} owner Host player id. @param {*} entry The chronicle entry (kind/title/body/civ/dedupeKey).
 */
function announce(owner, entry) {
  if (chronicle(entry) && owner === localPid()) toast(entry.body, "chronicle");
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
 * The city-center plot key "x,y", or null when the location is unreadable.
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
 * Resolve what a stance pays its host, once, at recognition (emigration-stance-payout.js): sized from the
 * host's own income, with the payout reduced while the host is at war with the enclave's homeland. The
 * passive "let be" stance pays and costs nothing.
 * @param {{benefitYield:(string|null)}|null} option The chosen option (null: no stance yet).
 * @param {number} [owner] Host player id. @param {number} [originPid] The enclave's origin player id.
 * @returns {*} The payout ({benefitYield, benefitAmount, penaltyYield, penaltyAmount, once}).
 */
function resolveApplied(option, owner, originPid) {
  const atWar = typeof owner === "number" && typeof originPid === "number"
    && safeHas(() => warOpponents(owner), originPid);
  return stancePayout(option || { benefitYield: null }, typeof owner === "number" ? owner : -1,
    atWar ? clampFactor(CONFIG.contestedQuarterYieldFactor) : 1);
}

/**
 * Whether a set read from the engine holds a value, false when the read throws.
 * @param {() => Set<number>} read The set reader. @param {number} v The value. @returns {boolean} True when held.
 */
function safeHas(read, v) {
  try {
    return read().has(v);
  } catch (_) {
    return false;
  }
}

/** Most enclaves ONE origin civilization may hold across a host's cities (a different origin overtaking
 * a tile is a change-of-hands, not a new one). Beyond this, a fresh same-origin enclave is not offered. */
const MAX_ENCLAVES_PER_CIV = 2;

/**
 * How many enclaves the owner already holds from the SAME origin civilization, excluding `exceptTileKey`
 * (the candidate's own tile). Identity is by CivilizationType (each record carries its `originCiv`),
 * falling back to the raw origin player id when either side's type is unavailable.
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
  // A RECOGNIZED enclave of this origin is settled. An ESTABLISHED one (the tile stands, no stance yet)
  // is exactly what the recognition step is waiting to decide, so it stays offerable.
  if (existing && existing.civ === quarter.civ && existing.recognized) return null;
  return { tileKey, quarter };
}

/**
 * The candidate-quarter record for one city signal, or null when it isn't offerable (see
 * {@link offerableQuarter}), hasn't dwelt long enough, or the origin civ is at its per-civ enclave cap.
 * `ordinal` (the count of the origin's existing enclaves) selects which quote the modal shows.
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
  if (!force && !dwellSatisfied(tileKey, originCiv, quarter.civ, turn, relaxFor(me))) return null;
  const ordinal = enclaveCountForCiv(me, quarter.civ, originCiv, tileKey);
  if (ordinal >= MAX_ENCLAVES_PER_CIV) return null; // cap enclaves PER origin civilization (not global)
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
 * Update the per-tile dwell clocks for the local player's established enclaves, every pass. A clock
 * starts when an origin is first seen, keeps its start while the same origin persists, restarts when a
 * different origin overtakes the tile, and is pruned once the enclave has lapsed for more than quarterDwellGrace turns.
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
 * option; the passive stance keeps its own line.
 * @param {{id:string,label:string,note:string,benefitYield:(string|null)}} option The chosen option.
 * @param {{civ:number,name:string,where:string}} quarter The quarter.
 * @param {{civ:number}|null} prior The prior record on the tile, or null. @param {number} turn Now.
 * @param {{gave:string, lost:string}} worth What the new enclave gives per turn, and (for a
 *   change-of-hands) what the old one stopped giving.
 */
function chronicleDecision(option, quarter, prior, turn, worth) {
  const name = quarterName(quarter.civ);
  if (prior && prior.civ !== quarter.civ) {
    chronicle({
      kind: "founding", title: tr("LOC_EMIG_QTR_CHRON_HANDS_TITLE", "The Enclave Changes Hands"),
      body: withYields(tr("LOC_EMIG_QTR_CHRON_HANDS_BODY",
        "The old {1_Name} has faded as its families moved on, married in, or were overtaken by new arrivals. {2_Where}, {3_Adj} households now give the ward its name, its customs, and its bargains.",
        quarterName(prior.civ), capFirst(quarter.where), narrativeCiv(quarter.civ).adj), worth.gave),
      civ: narrativeCiv(quarter.civ).adj, dedupeKey: "quarter:hands:" + quarter.name + "|" + quarter.civ + "|" + turn
    });
  }
  const stance = option.benefitYield
    ? tr("LOC_EMIG_QTR_STANCE_ACTIVE_" + option.id,
      "In {1_Place}, you chose to {2_Act} — the {3_Name} takes its place in the city's life.",
      quarter.name, String(option.label || "").toLowerCase(), name)
    : tr("LOC_EMIG_QTR_STANCE_LETBE", "You let the {1_Name} keep to itself.", name);
  chronicle({
    kind: "founding", title: tr("LOC_EMIG_QTR_CHRON_DECISION_TITLE", "A {1_Name}", name),
    body: withYields(stance, worth.gave),
    civ: narrativeCiv(quarter.civ).adj, dedupeKey: "quarter:decision:" + quarter.name + "|" + quarter.civ + "|" + turn
  });
}

/**
 * The stance an enclave is placed with at ESTABLISHMENT, before any stance is chosen: it picks the tile's
 * skin and label only (the themed skins follow the origin's first stance), and grants nothing.
 */
const ESTABLISH_SKIN_STANCE = "a";

/**
 * ESTABLISH one enclave: the community has just reached the established stage, so the enclave now EXISTS.
 * Writes its record (no stance yet: `recognized` false, zero stance yields), places its tile, counts it
 * toward the host's per-age pacing, logs it, and announces it in the Chronicle with the tile's yield.
 * @param {*} city The host city object. @param {{tileKey:string, quarter:*}} base The offerable quarter.
 * @param {string|null} originCiv The origin CivilizationType. @param {number} owner Host player id.
 * @param {number} turn Now (monotonic).
 */
function establishEnclave(city, base, originCiv, owner, turn) {
  const { tileKey, quarter } = base;
  putQuarter(tileKey, {
    civ: quarter.civ, originCiv: originCiv || null, owner, optionId: "ignore", turn, recognized: false,
    applied: resolveApplied(null), contested: false, contestedTurn: -999,
    placed: placeEnclave(city, originCiv, ESTABLISH_SKIN_STANCE)
  });
  const rec = quarterAt(tileKey);
  if (!rec) return; // the store is full: nothing was created, so nothing is announced
  noteFormed(owner); // per-age pacing: this host has one more this age
  const gave = enclaveWorth(rec).gave;
  dlog("enclave ESTABLISHED " + quarterName(quarter.civ) + " in " + quarter.name + " at " + tileKey
    + " (host " + owner + ", tile " + (rec.placed ? rec.placed.type : "none placed") + ")"
    + (gave ? "; host gains " + gave : ""));
  const line = chronicleEnclaveFounding(city, quarter.civ, gave);
  if (line && owner === localPid()) toast(line, "chronicle");
}

/**
 * ESTABLISH every enclave one host's cities have earned this pass: an established foreign community on
 * a tile that holds no enclave yet, within the host's per-age cap and the per-origin cap. No dwell gate
 * here (that gates RECOGNITION); a tile held by ANOTHER origin is left to the recognition path.
 * @param {*[]} signals The pass's city signals. @param {number} owner Host player id. @param {number} turn Now.
 * @param {boolean} force The force option (relaxes the share bar to foothold and ignores the per-age cap).
 */
function establishEnclaves(signals, owner, turn, force) {
  for (const s of signals || []) {
    if (!force && capReached(owner)) return; // this host's age is full (quarterCapPerAge)
    const base = offerableQuarter(s, owner, force);
    if (!base || quarterAt(base.tileKey)) continue;
    const originCiv = civType(base.quarter.civ);
    if (enclaveCountForCiv(owner, base.quarter.civ, originCiv, base.tileKey) >= MAX_ENCLAVES_PER_CIV) continue;
    establishEnclave(s.city, base, originCiv, owner, turn);
  }
}

/**
 * The record to write when a stance is chosen. RECOGNIZING an established enclave of the same origin
 * keeps the existing record and adds the stance (the tile's label follows an active stance); any other
 * case (a change of hands, or an empty tile) FORMS the enclave outright with a fresh placement.
 * @param {*} prior The record on the tile, or null. @param {*} option The chosen option.
 * @param {{civ:number, city?:*}} quarter The quarter. @param {{ct:(string|null), me:number, turn:number}} ctx
 *   The origin CivilizationType, host player id, and turn.
 * @returns {{rec:*, formed:boolean}} The record to store, and whether it is a NEW enclave.
 */
function recordForChoice(prior, option, quarter, ctx) {
  const applied = resolveApplied(option, ctx.me, quarter.civ);
  if (prior && prior.civ === quarter.civ && !prior.recognized) {
    const label = enclaveTypeFor(ctx.ct, option.id);
    const placed = prior.placed && label ? { ...prior.placed, enclave: label } : prior.placed;
    return { rec: { ...prior, optionId: option.id, applied, placed, recognized: true }, formed: false };
  }
  // A recognized enclave becomes a real tile (emigration-enclave-place.js), natively attributed.
  const placed = option.id === "ignore" ? null : placeEnclave(quarter.city, ctx.ct, option.id);
  return {
    rec: { civ: quarter.civ, originCiv: ctx.ct || null, owner: ctx.me, optionId: option.id, turn: ctx.turn,
      applied, contested: false, contestedTurn: -999, placed, recognized: true },
    formed: true
  };
}

/**
 * Apply the chosen stance (RECOGNITION): write the tile record (one quarter per tile, so a different
 * origin simply REPLACES it), pay the stance once, stamp the throttle, chronicle it, and persist.
 * Fully guarded.
 * @param {string} optionId The chosen option id. @param {string} tileKey The plot key.
 * @param {{civ:number,owner:number,name:string,where:string,city?:*}} quarter The quarter.
 * @param {number} me Host player id. @param {number} turn Now. The quarter may carry `city` (the host
 *   city object) for placing the enclave improvement; absent off-engine.
 */
function applyQuarterChoice(optionId, tileKey, quarter, me, turn) {
  try {
    const ct = civType(quarter.civ);
    const option = quarterOptionFor(ct, optionId);
    const prior = quarterAt(tileKey);
    const { rec, formed } = recordForChoice(prior, option, quarter, { ct, me, turn });
    putQuarter(tileKey, rec);
    const stored = quarterAt(tileKey);
    if (stored) payStance(me, stored.applied); // the stance pays ONCE, now (never per turn)
    dropCandidacy(tileKey); // the enclave is recognized: its dwell clock has done its job
    noteDecision(turn);
    if (formed) noteFormed(me); // an established enclave was already counted when it was created
    const stance = yieldsText(paidYields(stored));
    dlog("enclave RECOGNIZED " + quarterName(quarter.civ) + " in " + quarter.name + " at " + tileKey
      + " (host " + me + ", stance " + option.id + ")" + (stance ? "; stance paid once " + stance : ""));
    chronicleDecision(option, quarter, prior, turn, { gave: stance, lost: "" });
    saveQuarters();
  } catch (_) {
    /* a quarter outcome must never break anything */
  }
}

/**
 * The single flavor quote shown for an enclave: the origin's FIRST enclave shows quote "a", its SECOND
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
 * A stance's button caption: its label followed by what it pays and costs, once, with each yield's game
 * icon ("Learn their engineering: [icon:YIELD_SCIENCE] +375, [icon:YIELD_GOLD] -1410"), built by the same
 * {@link resolveApplied} the choice pays from. An unaffordable stance adds "(not enough Gold)"; the
 * passive stance keeps its bare label.
 * @param {{label:string, benefitYield:(string|null)}} option The offered option. @param {number} owner Host.
 * @param {number} originPid The enclave's origin player id.
 * @returns {{caption:string, affordable:boolean}} The caption, and whether the host can pay it.
 */
function stanceButton(option, owner, originPid) {
  const payout = resolveApplied(option, owner, originPid);
  const figure = yieldsButtonText(paidYields({ applied: payout }));
  if (!figure) return { caption: option.label, affordable: true };
  const caption = option.label + ": " + figure;
  if (affordable(payout, owner)) return { caption, affordable: true };
  return { caption: caption + " " + tr("LOC_EMIG_QTR_FX_SHORT", "(not enough Gold)"), affordable: false };
}

/**
 * The modal view model for a quarter decision (the "Cultural Enclave" eyebrow, a titled prompt, a note
 * that a stance pays once, ONE attributed quote, and the three stances, each button stating what it
 * pays). Dismissing (click-outside / Escape) resolves as the passive "ignore" stance.
 * @param {{civ:number,name:string,share:number,where:string}} quarter The quarter.
 * @param {number} [ordinal] Count of the origin's existing enclaves (0 = first, 1 = second).
 * @param {number} [owner] Host player id (default: the local player), whose income sizes the payouts.
 * @returns {{title:string, body:string, eyebrow:string, eyebrowIcon:string, details:string[], dismissId:string,
 *   quote:string, choices:*[]}} The view.
 */
function quarterView(quarter, ordinal, owner) {
  const name = quarterName(quarter.civ);
  const ct = civType(quarter.civ);
  const host = typeof owner === "number" ? owner : localPid() ?? -1;
  // Each button states what its stance pays; one the host cannot pay for is grayed out (the dialog ignores a
  // disabled choice).
  const choices = quarterOptionsFor(ct).map((c) => {
    const button = stanceButton(c, host, quarter.civ);
    return button.affordable ? { ...c, label: button.caption } : { ...c, label: button.caption, disabled: true };
  });
  return {
    details: [tr("LOC_EMIG_QTR_FX_NOTE", "Paid once, when you choose.")],
    eyebrow: tr("LOC_EMIG_QTR_EYEBROW", "Cultural Enclave"),
    eyebrowIcon: "CITY_UNIQUE_QUARTER",
    dismissId: "ignore",
    title: tr("LOC_EMIG_QTR_TITLE", "The {1_Name}", name),
    body: tr("LOC_EMIG_QTR_BODY",
      "The {1_Adj} families of {2_Place} have become more than new arrivals. {3_Where}, their shops, shrines, workshops, festivals, and habits now draw a life of their own — a district with a memory from elsewhere. Recognize the enclave, and decide what tradition the city will make room for.",
      narrativeCiv(quarter.civ).adj, quarter.name, capFirst(quarter.where)),
    quote: enclaveQuote(ct, ordinal || 0),
    choices
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
    const force = !!CONFIG.quarterForce;
    for (const owner of hostOwners(signals, me)) {
      // Keep the dwell clocks current EVERY pass — including passes where a refugee dilemma fired or the
      // throttle blocks an offer — so a persistent enclave keeps accruing dwell toward its recognition.
      observeQuarterDwell(signals, owner, turn);
      establishEnclaves(signals, owner, turn, force); // the enclave EXISTS from the established stage
      if (recognitionMode() === RECOGNITION.ASK && owner === me) offerToPlayer(signals, me, turn, force, dilemmaFired);
      else recognizeAutomatically(signals, owner, turn, force);
    }
  } catch (_) {
    /* never disrupt a pass */
  }
}

/** The recognition modes (CONFIG.quarterRecognition). */
const RECOGNITION = Object.freeze({ ASK: 0, AUTO_ME: 1, AUTO_ALL: 2 });

/** The configured recognition mode (unknown values read as automatic everywhere). @returns {number} */
function recognitionMode() {
  const v = Number(CONFIG.quarterRecognition);
  return v === RECOGNITION.ASK || v === RECOGNITION.AUTO_ME ? v : RECOGNITION.AUTO_ALL;
}

/**
 * The host players whose cities may recognize enclaves this pass: every major civilization with a city
 * signal under "automatic everywhere", else the local player alone.
 * @param {*[]} signals The pass's city signals. @param {number} me Local player id.
 * @returns {number[]} Host player ids.
 */
function hostOwners(signals, me) {
  if (recognitionMode() !== RECOGNITION.AUTO_ALL) return [me];
  /** @type {Set<number>} */
  const owners = new Set([me]);
  for (const s of signals || []) if (s && typeof s.owner === "number" && !s.isCityState) owners.add(s.owner);
  return Array.from(owners);
}

/**
 * The ASK path: the decision modal for the local player, ranked below the refugee dilemma and throttled
 * per age. Force mode (a testing option) ignores the dilemma ranking and the throttle and relaxes the
 * share bar to foothold; the min-stock floor and per-civ cap still apply.
 * @param {*[]} signals The pass's city signals. @param {number} me Local player id. @param {number} turn Now.
 * @param {boolean} force The force option. @param {boolean} dilemmaFired Whether a refugee dilemma fired.
 */
function offerToPlayer(signals, me, turn, force, dilemmaFired) {
  if (!force && dilemmaFired) return; // ranked BELOW the refugee dilemma: never race two modals in one pass
  if (!force && !canDecide(turn, currentAge())) return;
  const cand = pickCandidate(signals, me, turn, force);
  if (!cand) return;
  showDilemma(quarterView(cand.quarter, cand.ordinal, me), (/** @type {string} */ id) =>
    applyQuarterChoice(id, cand.tileKey, { ...cand.quarter, city: cand.city }, me, turn));
}

/**
 * The AUTOMATIC path for one host: the best candidate whose dwell period is complete forms an enclave
 * with its people's first stance the host can afford (option "a", else "b", else it lets them be), no
 * modal, one per host per pass. The chronicle records where it took root and what the stance paid.
 * @param {*[]} signals The pass's city signals. @param {number} owner Host player id. @param {number} turn Now.
 * @param {boolean} force The force option (relaxes the bar and skips the dwell gate).
 */
function recognizeAutomatically(signals, owner, turn, force) {
  const cand = pickCandidate(signals, owner, turn, force);
  if (!cand) return;
  // The per-age cap binds CREATING an enclave; one already established was counted then and is only
  // being recognized now.
  if (!force && !quarterAt(cand.tileKey) && capReached(owner)) return;
  const option = quarterOptionsFor(cand.originCiv)
    .find((o) => o.id !== "ignore" && affordable(resolveApplied(o, owner, cand.quarter.civ), owner));
  applyQuarterChoice(option ? option.id : "ignore", cand.tileKey, { ...cand.quarter, city: cand.city }, owner, turn);
  const gave = yieldsText(paidYields(quarterAt(cand.tileKey)));
  announce(owner, {
    kind: "founding", title: tr("LOC_EMIG_QTR_CHRON_AUTO_TITLE", "An Enclave Takes Root"),
    body: withYields(tr("LOC_EMIG_QTR_CHRON_AUTO_BODY",
      "The {1_Name} has taken root {2_Where} in {3_City}: its families have stayed long enough to make the ward their own.",
      quarterName(cand.quarter.civ), cand.quarter.where, cand.quarter.name), gave),
    civ: narrativeCiv(cand.quarter.civ).adj, dedupeKey: "quarter:auto:" + cand.tileKey + "|" + turn
  });
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
          "War with {1_Adj} falls hard on the {2_Name}: its families are cut off from kin in the fighting, and some neighbors meet them with cold looks, forgetting they did not choose this war. Until peace returns, that strain keeps the enclave from settling fully into the city's life.",
          narrativeCiv(rec.civ).adj, quarterName(rec.civ)),
        civ: narrativeCiv(rec.civ).adj, dedupeKey: "quarter:contested:" + tileKey + "|" + rec.civ + "|" + turn
      });
    }
    if (nowContested) strain += per;
  }
  return strain;
}

/**
 * Apply a host's per-turn STANCE yields (only records without a one-time `once` payout carry any),
 * fresh each turn from the current tile record, on top of the enclave tile's own native yield. A
 * CONTESTED quarter pays only `contestedQuarterYieldFactor` of its benefit, so the caller updates
 * contested status BEFORE this runs.
 * @param {number} owner Host player id.
 */
function applyOwnerQuarterYields(owner) {
  for (const { rec } of quartersForOwner(owner)) {
    // A stance with `once` was paid at recognition; only a record from an older save (no `once`)
    // keeps its small per-turn stance yields.
    if (rec.applied && !rec.applied.once) applyQuarterYields(owner, rec.applied, contestedBenefitScale(rec));
  }
}

/** Turns a placement may take to appear before it is written off as never landed. */
const PLACEMENT_GRACE_TURNS = 2;

/**
 * The fade decision for one enclave, pure: "above" (share at or over the bar: the clock resets),
 * "counting" (below, clock running), or "fade" (below for the full period).
 * @param {{fadeSince?:number|null}} rec The record (its fadeSince is read, not written).
 * @param {{share:number, pts:number}|null} community The origin's current share and points in the host, or
 *   null when unreadable.
 * @param {number} turn Now. @param {{fadeShare:number, fadeTurns:number, stockBar:number}} cfg The bars.
 * @returns {"above"|"counting"|"fade"|"unknown"} The decision.
 */
function fadeStep(rec, community, turn, cfg) {
  if (!(cfg.fadeShare > 0) || !community) return "unknown";
  // A community above the fade share, OR big enough in absolute points (the stock qualifier), stays.
  if (community.share >= cfg.fadeShare || (cfg.stockBar > 0 && community.pts >= cfg.stockBar)) return "above";
  const since = typeof rec.fadeSince === "number" ? rec.fadeSince : turn;
  return turn - since >= Math.max(1, cfg.fadeTurns) ? "fade" : "counting";
}

/**
 * The origin's current share of a host settlement, from the composition ledger (keyed like quarter
 * tiles, "x,y"), or null when the settlement is untracked.
 * @param {string} tileKey The host tile key. @param {*} rec The quarter record.
 * @returns {{share:number, pts:number}|null} Share in [0, 1] and standing points, or null.
 */
function originCommunityOf(tileKey, rec) {
  try {
    const entry = cityCompositionByKey(tileKey);
    if (!entry || !entry.comp) return null;
    const mine = (entry.comp.civs || []).find((x) => x.civ === rec.civ);
    return mine ? { share: mine.share, pts: mine.pts } : { share: 0, pts: 0 };
  } catch (_) {
    return null;
  }
}

/**
 * Enclaves FADE when their community does: an origin whose share of the host has stayed below
 * `quarterFadeShare` for `quarterFadeTurns` consecutive turns loses its enclave (tile removed, record
 * dropped, chronicled), so enclaves persist where migration keeps flowing and dissolve where it stops.
 * @param {number} owner Host player id. @param {number} turn Now (monotonic).
 */
function fadeLapsedEnclaves(owner, turn) {
  const cfg = { fadeShare: Number(CONFIG.quarterFadeShare) || 0, fadeTurns: Number(CONFIG.quarterFadeTurns) || 12,
    stockBar: establishedStockBar() };
  for (const { tileKey, rec } of quartersForOwner(owner)) {
    const step = fadeStep(rec, originCommunityOf(tileKey, rec), turn, cfg);
    if (step === "above") rec.fadeSince = null;
    else if (step === "counting") noteFadeClock(tileKey, rec, turn, cfg);
    else if (step === "fade") dissolveEnclave(tileKey, rec, turn);
  }
}

/**
 * Start (or continue) one enclave's fade clock, logging the turn it FIRST drops below the bar with the
 * share that put it there — so a dissolution some turns later is traceable to when the community shrank.
 * @param {string} tileKey The host tile key. @param {*} rec The record (its fadeSince is set).
 * @param {number} turn Now. @param {{fadeShare:number, fadeTurns:number}} cfg The bars.
 */
function noteFadeClock(tileKey, rec, turn, cfg) {
  if (typeof rec.fadeSince === "number") return; // already counting
  rec.fadeSince = turn;
  const community = originCommunityOf(tileKey, rec);
  const share = community ? Math.round(community.share * 100) : -1;
  dlog("enclave fade clock started " + quarterName(rec.civ) + " in " + hostCityName(tileKey) + " at "
    + tileKey + ": share " + share + "pct below " + Math.round(cfg.fadeShare * 100) + "pct, dissolves in "
    + Math.max(1, cfg.fadeTurns) + " turns unless it recovers");
}

/**
 * What an enclave GAVE its host per turn, as text ("+2 Culture, −1 Happiness"), and the same figure
 * stated as a loss. Read BEFORE the record is dropped or its tile destroyed.
 * @param {*} rec The record. @returns {{gave:string, lost:string}} The two phrasings (may be "").
 */
function enclaveWorth(rec) {
  const y = enclaveYields(rec);
  return { gave: yieldsText(y), lost: yieldsText(y, -1) };
}

/**
 * Dissolve one enclave: remove its tile, drop its record, chronicle the loss with what the host stops
 * receiving, and log it (the enclave lifecycle is otherwise invisible in UI.log).
 * @param {string} tileKey The host tile key. @param {*} rec The record. @param {number} turn Now.
 */
function dissolveEnclave(tileKey, rec, turn) {
  const worth = enclaveWorth(rec);
  const city = hostCityName(tileKey);
  if (rec.placed && enclaveStanding(rec)) destroyPlacedTile(rec);
  dropQuarter(tileKey);
  dlog("enclave FADED " + quarterName(rec.civ) + " in " + city + " at " + tileKey
    + " after " + (turn - (Number(rec.fadeSince) || turn)) + " turns below the fade bar"
    + (worth.lost ? "; host loses " + worth.lost : ""));
  announce(rec.owner, {
    kind: "founding", title: tr("LOC_EMIG_QTR_CHRON_FADE_TITLE", "The Enclave Fades"),
    body: withYields(tr("LOC_EMIG_QTR_CHRON_FADE_BODY",
      "The {1_Name} in {2_City} is no more: its families married in, moved on, or simply became the city, and the ward has lost its name.",
      quarterName(rec.civ), city), worth.lost),
    civ: narrativeCiv(rec.civ).adj, dedupeKey: "quarter:fade:" + tileKey + "|" + turn
  });
}

/**
 * The host settlement's name for a tile key, from the composition ledger ("the city" when unknown).
 * @param {string} tileKey The host tile key. @returns {string} A display name.
 */
function hostCityName(tileKey) {
  try {
    const entry = cityCompositionByKey(tileKey);
    return entry && entry.name ? String(entry.name) : "the city";
  } catch (_) {
    return "the city";
  }
}

/**
 * Once a takeover's tile is first seen standing, measure what the replaced improvement gave that the
 * enclave tile does not (base + replaced + enclave is the target), and store it as the per-turn
 * compensation the host receives while the tile stands.
 * @param {*} rec A quarter record whose placed tile is standing.
 */
function settleTakeover(rec) {
  const p = rec.placed;
  if (!p || !p.replaced || !p.before || p.compensation) return;
  const after = plotYieldsAt(p.plot, rec.owner);
  if (!after) return;
  const comp = takeoverCompensation(p.before, nativeYieldsOf(p.type), after);
  if (Object.keys(comp).length) p.compensation = comp;
}

/**
 * Pay one host's takeover compensation for every standing enclave: the replaced improvement's lost
 * yields, granted per turn like the stance yields.
 * @param {number} owner Host player id.
 */
function payTakeoverCompensation(owner) {
  for (const { rec } of quartersForOwner(owner)) {
    const comp = rec.placed && rec.placed.compensation;
    if (!comp || !enclaveStanding(rec)) continue;
    for (const [yieldKey, amount] of Object.entries(comp)) if (amount > 0) grantSigned(owner, yieldKey, amount);
  }
}

/**
 * Enclave tiles may be built over: a wonder, building, or improvement the host places on that plot
 * replaces the enclave improvement, and the enclave is then DESTROYED (record dropped, chronicled). A
 * placement that never appeared is instead cleared after a short grace, and its stance keeps paying from the treasury.
 * @param {number} owner Local player id. @param {number} turn Now (monotonic).
 */
function retireDisplacedEnclaves(owner, turn) {
  for (const { tileKey: key, rec } of quartersForOwner(owner)) {
    const p = rec.placed;
    if (!p) continue;
    if (enclaveStanding(rec)) {
      if (!p.stood) {
        p.stood = true;
        settleTakeover(rec);
      }
      continue;
    }
    // A fresh placement gets a grace: its destroy + create land asynchronously, so for a moment the plot
    // still shows the tile it replaces. After the grace: a plot holding something else was built over;
    // an EMPTY plot never landed.
    if (!p.stood && turn - (Number(rec.turn) || 0) < PLACEMENT_GRACE_TURNS) continue;
    if (p.stood || placedPlotOccupied(rec)) retireBuiltOver(key, rec, turn);
    else rec.placed = null; // never landed: the stance pays from the treasury
  }
}

/**
 * Retire one enclave whose tile was built over: drop its record, log what the host stops receiving, and
 * chronicle the loss with that figure.
 * @param {string} key The host tile key. @param {*} rec The record. @param {number} turn Now (monotonic).
 */
function retireBuiltOver(key, rec, turn) {
  const lost = enclaveWorth(rec).lost;
  dropQuarter(key);
  dlog("enclave BUILT OVER " + quarterName(rec.civ) + " in " + hostCityName(key) + " at " + key
    + (lost ? "; host loses " + lost : ""));
  announce(rec.owner, {
    kind: "founding", title: tr("LOC_EMIG_QTR_CHRON_BUILT_OVER_TITLE", "The Enclave Is Built Over"),
    body: withYields(tr("LOC_EMIG_QTR_CHRON_BUILT_OVER_BODY",
      "The {1_Name} is gone: the city built over its ward, and its families have scattered into the streets around it.",
      quarterName(rec.civ)), lost),
    civ: narrativeCiv(rec.civ).adj, dedupeKey: "quarter:builtover:" + key + "|" + turn
  });
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
 * contested enclave's benefit is already dimmed this pass. Never throws into the pass.
 * @param {*[]} _signals The pass's city signals (unused; state-driven).
 */
export function tickContestedQuarters(_signals) {
  if (!CONFIG.quartersEnabled) return;
  const me = localPid();
  if (me == null) return;
  try {
    const turn = monoTurn();
    for (const owner of recordOwners(me)) tickOwnerQuarters(owner, turn);
    saveQuarters();
  } catch (_) {
    /* never disrupt a pass */
  }
}

/**
 * Every host player holding a quarter record, the local player first (AI hosts under "automatic
 * everywhere" run the same per-turn upkeep: displaced tiles retired, contested status, stance grants).
 * @param {number} me Local player id. @returns {number[]} Host player ids.
 */
function recordOwners(me) {
  /** @type {Set<number>} */
  const owners = new Set([me]);
  for (const { rec } of allQuarterEntries()) if (rec && typeof rec.owner === "number") owners.add(rec.owner);
  return Array.from(owners);
}

/**
 * One host's per-turn quarter upkeep.
 * @param {number} owner Host player id. @param {number} turn Now (monotonic).
 */
function tickOwnerQuarters(owner, turn) {
  fadeLapsedEnclaves(owner, turn);
  retireDisplacedEnclaves(owner, turn);
  // Refresh contested status FIRST so this pass's yield grant already reflects any new war: a
  // contested enclave pays a reduced benefit (applyOwnerQuarterYields reads the fresh rec.contested).
  const strain = accrueContestedStrain(owner, turn);
  applyOwnerQuarterYields(owner);
  payTakeoverCompensation(owner);
  if (strain > 0) {
    const cap = Math.max(0, Number(CONFIG.diasporaWarStrainCap) || 0);
    const charged = cap > 0 ? Math.min(strain, cap) : strain;
    if (charged > 0) deduct(owner, "YIELD_HAPPINESS", -charged);
  }
}

// Test hook: the pure decision pieces.
export const __test = {
  resolveApplied, pickCandidate, candidateFromSignal, observeQuarterDwell, quarterView, accrueContestedStrain,
  tileKeyOf, enclaveCountForCiv, MAX_ENCLAVES_PER_CIV, applyOwnerQuarterYields, retireDisplacedEnclaves,
  hostOwners, recordOwners, recognizeAutomatically, RECOGNITION, settleTakeover, payTakeoverCompensation,
  fadeStep, fadeLapsedEnclaves, establishEnclaves, applyQuarterChoice, recordForChoice, dissolveEnclave,
  stanceButton
};
