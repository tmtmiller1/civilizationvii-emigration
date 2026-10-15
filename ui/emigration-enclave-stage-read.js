// emigration-enclave-stage-read.js
//
// Reads one settlement's enclave stage for the player-facing surfaces (the city readout and the enclave
// tooltip) and words it. The stages and their rules are in emigration-enclave-stage.js; this module only
// gathers the live inputs (the composition ledger, the enclave record, the dwell clock, the caps) and turns
// the result into plain lines: the stage, the next step, and anything holding it back.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { enclaveProgressForCity, stageBars } from "/emigration/ui/emigration-diaspora.js";
import { quarterAt, quartersForOwner, dwellProgress, decisionThrottle } from "/emigration/ui/emigration-quarter-state.js";
import { relaxFor, capReached } from "/emigration/ui/emigration-enclave-pacing.js";
import { quarterOptionFor } from "/emigration/ui/emigration-quarter-registry.js";
import { civAdjective, civType } from "/emigration/ui/emigration-naming.js";
import { STAGE, BLOCKER, ORIGIN_CAP, enclaveStage, countOriginEnclaves } from "/emigration/ui/emigration-enclave-stage.js";
import { loc } from "/emigration/ui/emigration-loc.js";

/**
 * @typedef {Object} StageView A settlement's enclave stage, ready to word.
 * @property {number} civ The origin. @property {string} civAdj Its adjective.
 * @property {*} record The standing enclave record, or null.
 * @property {import("/emigration/ui/emigration-enclave-stage.js").StageInfo} info The stage and next step.
 * @property {string} stanceLabel The chosen stance's label ("" before recognition or when let be).
 */

/** @returns {number} */
function gameAge() {
  try {
    return typeof Game !== "undefined" && typeof Game.age === "number" ? Game.age : 0;
  } catch (_) {
    return 0;
  }
}

/** @returns {number|null} */
function localPid() {
  try {
    return typeof GameContext !== "undefined" && typeof GameContext.localPlayerID === "number"
      ? GameContext.localPlayerID : null;
  } catch (_) {
    return null;
  }
}

/** @param {*} rec @returns {string} */
function stanceLabelOf(rec) {
  if (!rec || rec.recognized === false || !rec.optionId || rec.optionId === "ignore") return "";
  try {
    return quarterOptionFor(rec.originCiv, rec.optionId).label || "";
  } catch (_) {
    return "";
  }
}

/**
 * The community to measure: the enclave's own origin when one stands (its share only while it is still the
 * leading foreign community, as recognition requires), else the leading foreign community.
 * @param {*} p The progress read (enclaveProgressForCity), or null. @param {*} rec The record, or null.
 * @returns {{civ:number, share:number, stock:number}|null}
 */
function measured(p, rec) {
  if (rec && p && p.civ === rec.civ) return { civ: rec.civ, share: p.share, stock: p.stock };
  if (rec) return { civ: rec.civ, share: 0, stock: 0 };
  return p ? { civ: p.civ, share: p.share, stock: p.stock } : null;
}

/**
 * Gather a settlement's stage. Null when it has no foreign community and no enclave.
 * @param {*} city The live city object. @param {string} tileKey Its centre key "x,y".
 * @param {number} owner The host player id. @param {number} turn Now (monotonic).
 * @returns {StageView|null}
 */
export function enclaveStageAt(city, tileKey, owner, turn) {
  const p = city ? enclaveProgressForCity(city) : null;
  const record = tileKey ? quarterAt(tileKey) : null;
  const m = measured(p, record);
  if (!m) return null;
  const relax = p ? p.relax : relaxFor(owner);
  const ct = civType(m.civ);
  const asks = owner === localPid() && Number(CONFIG.quarterRecognition) === 0;
  const info = enclaveStage({
    share: m.share, stock: m.stock, bars: stageBars(relax), relax, record,
    dwell: tileKey ? dwellProgress(tileKey, ct, m.civ, turn, relax) : null,
    turn, fadeTurns: Number(CONFIG.quarterFadeTurns) || 12,
    ageCapReached: capReached(owner),
    originCount: countOriginEnclaves(quartersForOwner(owner), m.civ, ct, tileKey, civType),
    throttle: { asks, ...decisionThrottle(turn, gameAge()) }
  });
  return { civ: m.civ, civAdj: civAdjective(m.civ), record, info, stanceLabel: stanceLabelOf(record) };
}

/** @param {number} v @returns {number} A share as a whole percent. */
const pct = (v) => Math.round((Number(v) || 0) * 100);
/** @param {number} v @returns {number} Points to one decimal. */
const one = (v) => Math.round((Number(v) || 0) * 10) / 10;

/**
 * The stage line: "Greek community: foothold", "Greek enclave: established", and so on.
 * @param {StageView} v @returns {string}
 */
export function stageLine(v) {
  const i = v.info;
  if (i.fading) return loc("LOC_EMIG_RO_STAGE_FADING", "{1_Civ} enclave: fading, {2_Turns} turns left", v.civAdj, i.fadeTurnsLeft);
  if (i.stage === STAGE.RECOGNIZED) {
    return v.stanceLabel
      ? loc("LOC_EMIG_RO_STAGE_RECOGNIZED", "{1_Civ} enclave: recognized ({2_Stance})", v.civAdj, v.stanceLabel)
      : loc("LOC_EMIG_RO_STAGE_RECOGNIZED_LETBE", "{1_Civ} enclave: recognized, left to itself", v.civAdj);
  }
  if (i.stage === STAGE.ESTABLISHED && !i.forming) {
    return loc("LOC_EMIG_RO_STAGE_ESTABLISHED", "{1_Civ} enclave: established", v.civAdj);
  }
  if (i.forming) return loc("LOC_EMIG_RO_STAGE_FORMING", "{1_Civ} community: ready to become an enclave", v.civAdj);
  if (i.stage === STAGE.FOOTHOLD) {
    return loc("LOC_EMIG_RO_STAGE_FOOTHOLD", "{1_Civ} community: foothold", v.civAdj);
  }
  return loc("LOC_EMIG_RO_STAGE_NONE", "{1_Civ} community", v.civAdj);
}

/**
 * The next-step line, or "" at the end of the road (recognized and not fading).
 * @param {StageView} v @param {string} cityName The settlement's name. @returns {string}
 */
export function nextLine(v, cityName) {
  const i = v.info;
  const n = i.next;
  if (i.fading) {
    return loc("LOC_EMIG_RO_NEXT_FADE", "Stays if its people get back to {1_Bar}% of {2_City}",
      Math.round((Number(CONFIG.quarterFadeShare) || 0) * 1000) / 10, cityName);
  }
  if (!n) return "";
  if (n.stage === STAGE.RECOGNIZED) {
    return n.turnsLeft
      ? loc("LOC_EMIG_RO_NEXT_RECOGNIZED", "Recognized in {1_Turns} turns if it holds", n.turnsLeft)
      : loc("LOC_EMIG_RO_NEXT_RECOGNIZED_DUE", "Ready to be recognized");
  }
  if (n.stage === STAGE.FOOTHOLD) {
    return loc("LOC_EMIG_RO_NEXT_FOOTHOLD", "Gains a foothold at {1_Bar}% of {2_City} (now {3_Share}%)",
      pct(n.shareBar), cityName, pct(n.share));
  }
  if (i.forming) {
    return i.blockers.length ? "" : loc("LOC_EMIG_RO_NEXT_FORMING", "The enclave forms at the next migration");
  }
  if (n.stockBar > 0) {
    return loc("LOC_EMIG_RO_NEXT_ENCLAVE_OR_SIZE",
      "Becomes an enclave at {1_Bar}% of {2_City} (now {3_Share}%) or at {4_Size} population (now {5_Stock})",
      pct(n.shareBar), cityName, pct(n.share), one(n.stockBar), one(n.stock));
  }
  return loc("LOC_EMIG_RO_NEXT_ENCLAVE", "Becomes an enclave at {1_Bar}% of {2_City} (now {3_Share}%)",
    pct(n.shareBar), cityName, pct(n.share));
}

/**
 * One plain line per thing holding the enclave back, then a note when the bars are lowered for this age.
 * @param {StageView} v @param {string} cityName The settlement's name. @returns {string[]}
 */
export function blockerLines(v, cityName) {
  const i = v.info;
  const n = i.next;
  const out = i.blockers.map((b) => blockerText(b, v, cityName));
  if (i.relax > 0 && n && n.stage !== STAGE.RECOGNIZED && !i.fading) {
    out.push(loc("LOC_EMIG_RO_PACING", "The bars are {1_Pct}% lower this age, until an enclave forms", pct(i.relax)));
  }
  return out.filter((s) => !!s);
}

/** @param {string} b @param {StageView} v @param {string} cityName @returns {string} */
function blockerText(b, v, cityName) {
  const n = v.info.next;
  switch (b) {
    case BLOCKER.STOCK_FLOOR:
      return loc("LOC_EMIG_RO_BLOCK_FLOOR", "Needs at least {1_Min} population of its own (now {2_Stock})",
        one(n ? n.minStock : 0), one(n ? n.stock : 0));
    case BLOCKER.AGE_CAP:
      return loc("LOC_EMIG_RO_BLOCK_AGE_CAP", "This age's enclaves are all formed");
    case BLOCKER.ORIGIN_CAP:
      return loc("LOC_EMIG_RO_BLOCK_ORIGIN_CAP", "This civilization already has {1_Count} {2_Civ} enclaves in other cities",
        ORIGIN_CAP, v.civAdj);
    case BLOCKER.BELOW_BAR:
      return loc("LOC_EMIG_RO_BLOCK_BELOW_BAR", "Waits while its people are below {1_Bar}% of {2_City}",
        pct(n ? n.shareBar : 0), cityName);
    case BLOCKER.COOLDOWN:
      return loc("LOC_EMIG_RO_BLOCK_COOLDOWN", "Waiting {1_Turns} turns after the last enclave decision",
        v.info.cooldownLeft);
    case BLOCKER.DECISION_CAP:
      return loc("LOC_EMIG_RO_BLOCK_DECISIONS", "This age's enclave decisions are all made");
    default:
      return "";
  }
}
