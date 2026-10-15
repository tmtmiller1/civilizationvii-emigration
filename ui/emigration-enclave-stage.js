// emigration-enclave-stage.js
//
// How an enclave grows, in one place. Every surface that names a stage (the Chronicle, the city readout,
// the enclave tooltip and marker, the Diversity table) reads it from here; the code that acts on a stage
// (emigration-quarter.js) uses the same classification. Pure: callers hand in what they read.
//
// A settlement's leading foreign community (one origin civilization that isn't the host's own) moves
// through three stages:
//
//   Foothold      The origin holds QUARTER_FOOTHOLD_SHARE (25%) of the settlement and at least
//                 quarterMinStock standing population points. The Chronicle notes it once. No tile.
//   Established   The origin holds quarterEstablishedShare (30%), or quarterEstablishedStock points
//                 (scaled to settlement size, 0 = off) at any share, and still the quarterMinStock floor.
//                 The enclave forms that pass: a record (recognized: false) and a tile on the city's edge.
//                 Two things hold formation back: the host's per-age cap (quarterCapPerAge enclaves formed
//                 this age) and the per-origin cap (ORIGIN_CAP enclaves of one origin in one host's cities).
//   Recognized    The community has stayed established for quarterDwellTurns (8), with short dips of up
//                 to quarterDwellGrace (3) turns forgiven. A stance is then chosen, by the host
//                 automatically or by the player through the pop-up, and pays once. Recognition waits
//                 while the community is below the established bar, and while the origin is at its
//                 per-origin cap. When the player is asked, it also waits out quarterCooldownTurns after
//                 the last decision and stops once quarterCapPerAge decisions are made this age.
//
// Per-age pacing (emigration-enclave-pacing.js) lowers the share bar, the size bar and the dwell period
// while a host has formed fewer enclaves this age than quarterTargetPerAge.
//
// An enclave ends when it fades (its people stay below quarterFadeShare and below the size bar for
// quarterFadeTurns turns), when its tile is built over, or when the settlement is destroyed. A settlement
// taken by a city-state or independent keeps the record on file, with no upkeep, until a major civilization
// holds it again. A war with the homeland makes an enclave contested, which is a condition, not a stage.

/** The stages, in order. "none" is a community below the foothold. */
export const STAGE = Object.freeze({
  NONE: "none",
  FOOTHOLD: "foothold",
  ESTABLISHED: "established",
  RECOGNIZED: "recognized"
});

/** What can hold an enclave back from its next stage. */
export const BLOCKER = Object.freeze({
  STOCK_FLOOR: "stock-floor", // the share is there but the community is under quarterMinStock
  AGE_CAP: "age-cap", // the host has formed quarterCapPerAge enclaves this age
  ORIGIN_CAP: "origin-cap", // the host already holds ORIGIN_CAP enclaves of this origin elsewhere
  BELOW_BAR: "below-bar", // an established enclave whose community has dropped under the bar
  COOLDOWN: "cooldown", // asking the player: too soon after the last decision
  DECISION_CAP: "decision-cap" // asking the player: this age's decisions are all made
});

/** Most enclaves one origin civilization may hold across one host's cities. */
export const ORIGIN_CAP = 2;

/**
 * The display word for each stage and condition, as [LOC key, English]. Shared by the readout, the tooltip,
 * the marker and the Diversity table so they all say the same thing.
 */
export const STAGE_WORD = Object.freeze({
  foothold: ["LOC_EMIG_ETIP_MARK_FOOTHOLD", "Foothold"],
  established: ["LOC_EMIG_ETIP_MARK_ESTABLISHED", "Established"],
  recognized: ["LOC_EMIG_ETIP_MARK_RECOGNIZED", "Recognized"],
  contested: ["LOC_EMIG_ETIP_MARK_CONTESTED", "Contested"],
  fading: ["LOC_EMIG_ETIP_MARK_FADING", "Fading"]
});

/**
 * @typedef {Object} StageBars The bars a community is measured against (pacing already applied).
 * @property {number} foothold The foothold share. @property {number} established The established share.
 * @property {number} stockBar The size bar (0 = off). @property {number} minStock The standing-points floor.
 */

/**
 * The stage a community has reached from its share and standing points. This is the one classification
 * the enclave code and every readout use.
 * @param {number} share The origin's share of the settlement. @param {number} stock Its standing points.
 * @param {StageBars|null} bars The bars. @returns {"none"|"foothold"|"established"} The stage.
 */
export function communityStage(share, stock, bars) {
  if (!bars || !(stock >= bars.minStock)) return STAGE.NONE;
  const bySize = bars.stockBar > 0 && stock >= bars.stockBar;
  if (share >= bars.established || bySize) return STAGE.ESTABLISHED;
  return share >= bars.foothold ? STAGE.FOOTHOLD : STAGE.NONE;
}

/**
 * How many enclaves a host holds from one origin, leaving out one tile (the candidate's own). Identity is by
 * CivilizationType when both sides have one, else by origin player id.
 * @param {{tileKey:string, rec:*}[]} entries The host's enclave records. @param {number} originPid
 * @param {string|null} originCiv The origin's CivilizationType. @param {string|null} exceptKey
 * @param {(pid:number) => (string|null)} civTypeOf Resolves a legacy record's CivilizationType.
 * @returns {number} The count.
 */
export function countOriginEnclaves(entries, originPid, originCiv, exceptKey, civTypeOf) {
  let n = 0;
  for (const { tileKey, rec } of entries || []) {
    if (tileKey === exceptKey) continue;
    const recCiv = rec.originCiv || civTypeOf(rec.civ);
    if (originCiv && recCiv ? recCiv === originCiv : rec.civ === originPid) n++;
  }
  return n;
}

/**
 * The stage of a standing enclave record, with its conditions folded in the way the tooltip and marker
 * show them: fading outranks contested, which outranks the plain stage.
 * @param {*} rec The record. @returns {"fading"|"contested"|"recognized"|"established"}
 */
export function recordStage(rec) {
  if (rec && typeof rec.fadeSince === "number") return "fading";
  if (rec && rec.contested) return "contested";
  return !rec || rec.recognized !== false ? STAGE.RECOGNIZED : STAGE.ESTABLISHED;
}

/**
 * Turns left before a fading enclave dissolves (at least 1), or null when it isn't fading.
 * @param {*} fadeSince The turn the fade clock started. @param {number} turn Now (monotonic).
 * @param {number} fadeTurns The fade period. @returns {number|null}
 */
export function fadeTurnsLeft(fadeSince, turn, fadeTurns) {
  if (typeof fadeSince !== "number") return null;
  return Math.max(1, Math.ceil(num(fadeTurns) - (num(turn) - fadeSince)));
}

/** @param {{elapsed:number, needed:number}|null|undefined} d @returns {number|null} */
export function dwellTurnsLeft(d) {
  return d ? Math.max(0, Math.ceil(num(d.needed) - num(d.elapsed))) : null;
}

/** @param {*} v @returns {number} */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @typedef {Object} StageInput What a caller reads for one settlement.
 * @property {number} share The share of the community in question (the record's origin when one stands;
 *   0 when that origin is no longer the leading foreign community). @property {number} stock Its points.
 * @property {StageBars|null} bars The live bars. @property {number} relax The pacing relaxation in force.
 * @property {*} [record] The enclave record on the settlement, or null.
 * @property {{elapsed:number, needed:number}|null} [dwell] The dwell clock, when one runs.
 * @property {number} [turn] Now (monotonic). @property {number} [fadeTurns] The fade period.
 * @property {boolean} [ageCapReached] The host has formed this age's enclaves.
 * @property {number} [originCount] The host's other enclaves of this origin.
 * @property {{asks:boolean, cooldownLeft:number, decisionCapReached:boolean}} [throttle] The decision
 *   throttle, which only applies when the player is asked.
 */

/**
 * @typedef {Object} StageInfo
 * @property {"none"|"foothold"|"established"|"recognized"} stage The stage reached.
 * @property {boolean} forming Established by the bars but no enclave formed yet (something holds it back).
 * @property {{stage:string, share:number, shareBar:number, stock:number, stockBar:number, minStock:number,
 *   turnsLeft:(number|null)}|null} next The next stage and what it takes, or null at the end.
 * @property {string[]} blockers What holds it back (BLOCKER values), in the order to explain them.
 * @property {boolean} fading Whether its enclave is fading. @property {number|null} fadeTurnsLeft
 * @property {number} relax The pacing relaxation in force (0 = the plain bars).
 * @property {number} cooldownLeft Turns left on the decision cooldown (0 when the player isn't asked).
 */

/**
 * A settlement's stage and its progress to the next one: what's needed, how far along it is, and what holds
 * it back. Pure; it reports the rules above and changes none of them.
 * @param {StageInput} i The reads. @returns {StageInfo}
 */
export function enclaveStage(i) {
  const fadeLeft = i.record ? fadeTurnsLeft(i.record.fadeSince, num(i.turn), num(i.fadeTurns)) : null;
  const cooldownLeft = i.throttle && i.throttle.asks ? num(i.throttle.cooldownLeft) : 0;
  const base = { forming: false, fading: fadeLeft != null, fadeTurnsLeft: fadeLeft, relax: num(i.relax), cooldownLeft };
  if (i.record && i.record.recognized !== false) return { ...base, stage: STAGE.RECOGNIZED, next: null, blockers: [] };
  if (i.record) {
    return { ...base, stage: STAGE.ESTABLISHED, next: nextFor(i, STAGE.RECOGNIZED), blockers: recognitionBlockers(i) };
  }
  const stage = communityStage(i.share, i.stock, i.bars);
  if (stage === STAGE.NONE) return { ...base, stage, next: nextFor(i, STAGE.FOOTHOLD), blockers: floorBlocker(i) };
  const blockers = formationBlockers(i);
  if (stage === STAGE.FOOTHOLD) return { ...base, stage, next: nextFor(i, STAGE.ESTABLISHED), blockers };
  return { ...base, stage, forming: true, next: nextFor(i, STAGE.ESTABLISHED), blockers };
}

/** @param {StageInput} i @param {string} stage @returns {NonNullable<StageInfo["next"]>} */
function nextFor(i, stage) {
  const b = i.bars || { foothold: 0, established: 0, stockBar: 0, minStock: 0 };
  return {
    stage,
    share: num(i.share),
    shareBar: stage === STAGE.FOOTHOLD ? b.foothold : b.established,
    stock: num(i.stock),
    stockBar: stage === STAGE.FOOTHOLD ? 0 : b.stockBar,
    minStock: b.minStock,
    turnsLeft: stage === STAGE.RECOGNIZED ? dwellTurnsLeft(i.dwell) : null
  };
}

/** @param {StageInput} i @returns {string[]} */
function floorBlocker(i) {
  const b = i.bars;
  if (!b || num(i.stock) >= b.minStock) return [];
  const shareMet = num(i.share) >= b.foothold || (b.stockBar > 0 && num(i.stock) >= b.stockBar);
  return shareMet ? [BLOCKER.STOCK_FLOOR] : [];
}

/** @param {StageInput} i @returns {string[]} */
function formationBlockers(i) {
  const out = [];
  if (i.ageCapReached) out.push(BLOCKER.AGE_CAP);
  if (num(i.originCount) >= ORIGIN_CAP) out.push(BLOCKER.ORIGIN_CAP);
  return out;
}

/** @param {StageInput} i @returns {string[]} */
function recognitionBlockers(i) {
  const out = [];
  if (communityStage(i.share, i.stock, i.bars) !== STAGE.ESTABLISHED) out.push(BLOCKER.BELOW_BAR);
  if (num(i.originCount) >= ORIGIN_CAP) out.push(BLOCKER.ORIGIN_CAP);
  const t = i.throttle;
  if (t && t.asks && t.decisionCapReached) out.push(BLOCKER.DECISION_CAP);
  else if (t && t.asks && t.cooldownLeft > 0) out.push(BLOCKER.COOLDOWN);
  return out;
}
