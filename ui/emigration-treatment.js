// emigration-treatment.js
//
// What a host's immigration stance does to an enclave's stance payout (the Pro-Immigration Stance
// protects, the Anti-Immigration Stance watches), and the Chronicle line written when war first reaches
// an enclave. The cards' flat yields are native modifiers; the slotted-card read lives in
// emigration-borders.js. The retired treatment cards of 3.5.0 are named here too, for saves that hold them.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { treatmentStance, treatmentCard } from "/emigration/ui/emigration-borders.js";
import { civNameMsg, narrativeCiv, quarterNameMsg } from "/emigration/ui/emigration-naming.js";
import { cityCompositionByKey } from "/emigration/ui/emigration-composition.js";
import { msg } from "/emigration/ui/emigration-loc.js";

/** A suspicious host pays an enclave's stance at this share, in peace and war alike. */
export const SUSPECT_PAYOUT_FACTOR = 0.5;

/** Each card's display name, for the Chronicle line that names the host's policy. */
/** @type {Record<string, [string, string]>} */
const CARD_NAMES = {
  TRADITION_EMIG_OPEN_BORDERS_ANTIQUITY: ["LOC_EMIG_POLICY_OPEN_BORDERS_NAME", "Pro-Immigration Stance"],
  TRADITION_EMIG_OPEN_BORDERS_EXPLORATION: ["LOC_EMIG_POLICY_OPEN_BORDERS_NAME", "Pro-Immigration Stance"],
  TRADITION_EMIG_OPEN_BORDERS_MODERN: ["LOC_EMIG_POLICY_OPEN_BORDERS_NAME", "Pro-Immigration Stance"],
  TRADITION_EMIG_CLOSED_BORDERS_ANTIQUITY: ["LOC_EMIG_POLICY_CLOSED_BORDERS_NAME", "Anti-Immigration Stance"],
  TRADITION_EMIG_CLOSED_BORDERS_EXPLORATION: ["LOC_EMIG_POLICY_CLOSED_BORDERS_NAME", "Anti-Immigration Stance"],
  TRADITION_EMIG_CLOSED_BORDERS_MODERN: ["LOC_EMIG_POLICY_CLOSED_BORDERS_NAME", "Anti-Immigration Stance"],
  TRADITION_EMIG_PROTECT_ANTIQUITY: ["LOC_EMIG_POLICY_PROTECT_AQ_NAME", "Guest Right"],
  TRADITION_EMIG_PROTECT_EXPLORATION: ["LOC_EMIG_POLICY_PROTECT_EX_NAME", "Charter of Communities"],
  TRADITION_EMIG_PROTECT_MODERN: ["LOC_EMIG_POLICY_PROTECT_MO_NAME", "Equal Protection"],
  TRADITION_EMIG_SUSPECT_ANTIQUITY: ["LOC_EMIG_POLICY_SUSPECT_AQ_NAME", "Watched Quarters"],
  TRADITION_EMIG_SUSPECT_EXPLORATION: ["LOC_EMIG_POLICY_SUSPECT_EX_NAME", "Oaths of Loyalty"],
  TRADITION_EMIG_SUSPECT_MODERN: ["LOC_EMIG_POLICY_SUSPECT_MO_NAME", "Registration of Residents"]
};

/** @param {*} v @returns {number} */
function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

/** @param {number} owner @returns {"protect"|"suspect"|null} */
function stanceOf(owner) {
  try {
    return treatmentStance(owner);
  } catch (_) {
    return null;
  }
}

/**
 * The share of a stance's payout a host's enclave receives: a protective card keeps the full payout while
 * the host is at war with the enclave's homeland (otherwise the contested factor applies), and a suspicion
 * card halves it always, on top of any wartime cut.
 * @param {number} owner Host player id. @param {boolean} atWar Whether the host is at war with the homeland.
 * @returns {number} The factor in [0, 1].
 */
export function treatmentPayoutFactor(owner, atWar) {
  const stance = stanceOf(owner);
  const war = atWar && stance !== "protect" ? clamp01(CONFIG.contestedQuarterYieldFactor) : 1;
  return stance === "suspect" ? war * SUSPECT_PAYOUT_FACTOR : war;
}

/**
 * The per-turn benefit scale for a quarter record (older saves still pay per turn): the payout factor for
 * its host, read against its contested flag.
 * @param {*} rec A quarter record. @returns {number} The factor in [0, 1].
 */
export function treatmentBenefitScale(rec) {
  if (!rec) return 1;
  const owner = typeof rec.owner === "number" ? rec.owner : -1;
  return treatmentPayoutFactor(owner, !!rec.contested);
}

/** @param {string} tileKey @returns {string} */
function cityName(tileKey) {
  try {
    const entry = cityCompositionByKey(tileKey);
    return entry && entry.name ? String(entry.name) : "the city";
  } catch (_) {
    return "the city";
  }
}

/** @param {number} owner @returns {{stance:string, name:*}|null} The slotted card and its name node. */
function slottedCard(owner) {
  try {
    const stance = treatmentStance(owner);
    const names = stance ? CARD_NAMES[treatmentCard(owner) || ""] : null;
    return stance && names ? { stance, name: msg(names[0], names[1]) } : null;
  } catch (_) {
    return null;
  }
}

/**
 * The body of the line written when war first reaches an enclave: the host's suspicion card named as the
 * thing that falls on the families, a protective card named as holding, or the plain line otherwise.
 * @param {string} tileKey The host tile key. @param {*} rec The quarter record.
 * @returns {*} The body message node.
 */
function contestedBody(tileKey, rec) {
  const card = slottedCard(rec.owner);
  const adj = narrativeCiv(rec.civ).adjMsg;
  if (card && card.stance === "suspect") {
    return msg("LOC_EMIG_QTR_CHRON_RESTLESS_SUSPECT_BODY",
      "{1_Host}'s {2_Policy} falls hardest on the {3_Adj} families of {4_City} now that war has come with {5_Homeland}. They're cut off from kin in the fighting and watched at home over a war they didn't choose, and until peace returns the enclave can't settle fully into the city's life.",
      civNameMsg(rec.owner), card.name, adj, cityName(tileKey), civNameMsg(rec.civ));
  }
  if (card && card.stance === "protect") {
    return msg("LOC_EMIG_QTR_CHRON_RESTLESS_PROTECT_BODY",
      "War with {5_Homeland} reaches the {3_Adj} families of {4_City}, but {1_Host}'s {2_Policy} holds: their rights, their trade and their place in the city stand as before while the fighting lasts.",
      civNameMsg(rec.owner), card.name, adj, cityName(tileKey), civNameMsg(rec.civ));
  }
  return msg("LOC_EMIG_QTR_CHRON_RESTLESS_BODY",
    "War with {1_Adj} falls hard on the {2_Name}: its families are cut off from kin in the fighting, and some neighbors meet them with cold looks, forgetting they did not choose this war. Until peace returns, that strain keeps the enclave from settling fully into the city's life.",
    adj, quarterNameMsg(rec.civ));
}

/**
 * The Chronicle entry for an enclave that has just turned contested.
 * @param {string} tileKey The host tile key. @param {*} rec The quarter record. @param {number} turn Now.
 * @returns {*} The chronicle input.
 */
export function contestedEntry(tileKey, rec, turn) {
  return {
    kind: "founding",
    title: msg("LOC_EMIG_QTR_CHRON_RESTLESS_TITLE", "War Tests the {1_Name}", quarterNameMsg(rec.civ)),
    body: contestedBody(tileKey, rec),
    civ: narrativeCiv(rec.civ).adj,
    dedupeKey: "quarter:contested:" + tileKey + "|" + rec.civ + "|" + turn
  };
}
