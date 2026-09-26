// emigration-enclave-tooltip-data.js
//
// WHAT the enclave tooltip says, as plain data. Pure: every engine read is done by the caller
// (emigration-enclave-tooltip.js) and handed in, so the wording and the arithmetic are testable off-engine.
// The game's own tooltip can only describe the BORROWED improvement an enclave is drawn with, so this
// model lists the enclave's NAME and STAGE plus its SOURCES (the land or the displaced holding whose
// yields the host keeps, the enclave's own works, and the per-turn stance grant), each with the reason for it.

import { loc } from "/emigration/ui/emigration-loc.js";
import { yieldsText } from "/emigration/ui/emigration-enclave-yields.js";

/**
 * @typedef {Object} EnclaveTipInput
 * @property {*} rec The quarter record.
 * @property {string} enclaveName The enclave's display name ("Norman Enclave").
 * @property {string} originAdj The origin's adjective ("Norman").
 * @property {string} [cityName] The host settlement's name.
 * @property {string} [terrain] The plot's terrain/biome label.
 * @property {string} [skinName] Display name of the improvement on the map ("Hidden Fortress").
 * @property {string} [replacedName] Display name of the improvement the enclave took over, if any.
 * @property {Record<string, number>} [before] The plot's yields before the takeover (with the old improvement).
 * @property {Record<string, number>} [native] The enclave tile's own native yields.
 * @property {Record<string, number>} [now] The plot's yields as the map shows them now.
 * @property {Record<string, number>} [stance] The stance's signed per-turn yields (empty before recognition).
 * @property {string} [stanceLabel] The chosen stance's label ("Raise their knights").
 * @property {string} [why] The stance's one-line reasoning.
 * @property {number} [benefitScale] 1, or the contested factor while at war with the homeland.
 * @property {{elapsed:number, needed:number}|null} [dwell] Progress toward recognition.
 * @property {number} [turn] Now (monotonic). @property {number} [fadeTurns] Turns below the bar before dissolving.
 */

/**
 * @typedef {{key:string, label:string, detail:string, amounts:Record<string,number>, yields:string,
 *   note:string}} EnclaveTipSource A row: its name, an optional smaller detail under it, its yields as
 *   raw amounts (so the panel can draw the game's yield icons) and as text (for logs), and its reasoning.
 * @typedef {{title:string, subtitle:string, stage:{key:string, text:string, detail:string},
 *   sources:EnclaveTipSource[], totalAmounts:Record<string,number>, total:string}} EnclaveTipModel
 */

/** @param {*} v Any value. @returns {number} A finite number, or 0. */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** @param {*} m A yield map. @returns {boolean} Whether it holds any non-zero yield. */
function hasYields(m) {
  return !!m && typeof m === "object" && Object.keys(m).some((k) => num(m[k]) !== 0);
}

/**
 * The land's own share of the tile: what the plot yields now minus what the enclave's improvement adds,
 * never below zero. Used when nothing was displaced (an enclave on empty land has no `before`).
 * @param {Record<string, number>} now The plot's current yields. @param {Record<string, number>} native The tile's.
 * @returns {Record<string, number>} The land's yields.
 */
export function landYields(now, native) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of Object.keys(now || {})) {
    const v = Math.round((num(now[k]) - num((native || {})[k])) * 100) / 100;
    if (v > 0) out[k] = v;
  }
  return out;
}

/**
 * Scale a stance's BENEFIT (its positive yields) by the contested factor; the drawback is charged in
 * full either way, exactly as the per-turn grant does it.
 * @param {Record<string, number>} stance Signed stance yields. @param {number} scale The benefit factor.
 * @returns {Record<string, number>} The yields actually paid this turn.
 */
export function scaledStance(stance, scale) {
  const s = Number.isFinite(Number(scale)) ? Math.max(0, Math.min(1, Number(scale))) : 1;
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of Object.keys(stance || {})) {
    const v = num(stance[k]);
    const paid = v > 0 ? Math.round(v * s * 100) / 100 : v;
    if (paid) out[k] = paid;
  }
  return out;
}

/**
 * Which stage an enclave has reached. Fading outranks everything (it is about to go), a war outranks a
 * quiet recognition, and an unrecognized record is merely established.
 * @param {*} rec The quarter record. @returns {"fading"|"contested"|"recognized"|"established"} The stage key.
 */
export function stageOf(rec) {
  if (rec && typeof rec.fadeSince === "number") return "fading";
  // Contested regardless of recognition: the mod marks EVERY one of a host's enclaves contested while it
  // is at war with the homeland and charges the happiness strain for them, recognized or not, so an
  // established-but-unrecognized enclave can be costing the player happiness.
  if (rec && rec.contested) return "contested";
  return !rec || rec.recognized !== false ? "recognized" : "established";
}

/**
 * The stage: a short headline (what a player scans for), and the explanation under it.
 * @param {EnclaveTipInput} i The input. @returns {{key:string, text:string, detail:string}} The stage.
 */
function stageLine(i) {
  const key = stageOf(i.rec);
  if (key === "fading") {
    const left = Math.max(1, Math.ceil(num(i.fadeTurns) - (num(i.turn) - num(i.rec.fadeSince))));
    return { key,
      text: loc("LOC_EMIG_ETIP_STAGE_FADING", "Fading, {1_Turns} turns left", left),
      detail: loc("LOC_EMIG_ETIP_STAGE_FADING_D", "Too few of them are left to keep it going.") };
  }
  if (key === "contested") {
    const pending = i.rec.recognized === false
      ? " " + loc("LOC_EMIG_ETIP_STAGE_CONTESTED_PENDING", "It isn't recognized yet.")
      : "";
    return { key,
      text: loc("LOC_EMIG_ETIP_STAGE_CONTESTED", "Contested"),
      detail: loc("LOC_EMIG_ETIP_STAGE_CONTESTED_D", "You're at war with their homeland, so the enclave gives less until you make peace.") + pending };
  }
  if (key === "recognized") {
    return { key,
      text: i.stanceLabel
        ? loc("LOC_EMIG_ETIP_STAGE_RECOGNIZED", "Recognized: {1_Stance}", i.stanceLabel)
        : loc("LOC_EMIG_ETIP_STAGE_RECOGNIZED_LETBE", "Recognized. You left them alone."),
      detail: "" };
  }
  const d = i.dwell;
  const left = d ? Math.max(0, Math.ceil(num(d.needed) - num(d.elapsed))) : 0;
  return { key,
    text: left > 0
      ? loc("LOC_EMIG_ETIP_STAGE_ESTABLISHED", "Established, recognized in {1_Turns} turns", left)
      : loc("LOC_EMIG_ETIP_STAGE_ESTABLISHED_DUE", "Established, ready to be recognized"),
    detail: loc("LOC_EMIG_ETIP_STAGE_ESTABLISHED_D", "You'll pick how to treat them when that happens.") };
}

/**
 * The land (and whatever stood on it before) as a source.
 * @param {EnclaveTipInput} i The input. @returns {EnclaveTipSource|null} The row, or null when it yields nothing.
 */
function landSource(i) {
  const displaced = !!i.replacedName && hasYields(i.before);
  const y = baseYields(i);
  if (!hasYields(y)) return null;
  return row("land", loc("LOC_EMIG_ETIP_SRC_LAND", "The land"),
    displaced ? loc("LOC_EMIG_ETIP_SRC_LAND_REPLACED", "Used to be a {1_Improvement}", i.replacedName) : "",
    y,
    displaced ? loc("LOC_EMIG_ETIP_WHY_LAND_REPLACED", "The enclave built over it, but you still get what it gave.") : "");
}

/**
 * The enclave's own tile as a source. The improvement it is DRAWN with is a detail under the name, never
 * part of it.
 * @param {EnclaveTipInput} i The input. @returns {EnclaveTipSource|null} The row, or null.
 */
function tileSource(i) {
  if (!hasYields(i.native)) return null;
  return row("tile", loc("LOC_EMIG_ETIP_SRC_TILE", "What the enclave built"),
    i.skinName ? loc("LOC_EMIG_ETIP_SRC_TILE_SKIN", "Shows on the map as a {1_Improvement}", i.skinName) : "",
    /** @type {Record<string, number>} */ (i.native),
    loc("LOC_EMIG_ETIP_WHY_TILE", "{1_Adj} settlers built it. It pays from the day the enclave forms.", i.originAdj));
}

/**
 * The stance as a source: what the host's choice pays each turn, and why.
 * @param {EnclaveTipInput} i The input. @returns {EnclaveTipSource|null} The row, or null before recognition.
 */
function stanceSource(i) {
  if (stageOf(i.rec) === "established" || !hasYields(i.stance)) return null;
  const scale = i.benefitScale == null ? 1 : num(i.benefitScale);
  const why = i.why ? i.why.charAt(0).toUpperCase() + i.why.slice(1) + "." : "";
  const dimmed = scale < 1
    ? " " + loc("LOC_EMIG_ETIP_WHY_CONTESTED", "The war cuts this to {1_Pct}% until you make peace.", Math.round(scale * 100))
    : "";
  return row("stance",
    i.stanceLabel
      ? loc("LOC_EMIG_ETIP_SRC_STANCE", "How you treat them: {1_Stance}", i.stanceLabel)
      : loc("LOC_EMIG_ETIP_SRC_STANCE_PLAIN", "How you treat them"),
    loc("LOC_EMIG_ETIP_SRC_STANCE_D", "Goes to the city, not this tile"),
    paidStance(i),
    (why + dimmed).trim());
}

/**
 * Build one source row: its amounts are kept raw so the panel can draw the game's yield icons, and also
 * rendered as text for logs and for any surface without icons.
 * @param {string} key Row key. @param {string} label Its name. @param {string} detail A smaller line under it.
 * @param {Record<string, number>} amounts Signed yields. @param {string} note The reasoning.
 * @returns {EnclaveTipSource} The row.
 */
function row(key, label, detail, amounts, note) {  
  return { key, label, detail, amounts, yields: yieldsText(amounts), note };
}

/**
 * Everything the enclave tooltip shows, in display order.
 * @param {EnclaveTipInput} i The gathered input. @returns {EnclaveTipModel|null} The model, or null with no record.
 */
export function enclaveTipModel(i) {
  if (!i || !i.rec) return null;
  const sources = [landSource(i), tileSource(i), stanceSource(i)].filter((s) => !!s);
  return {
    title: i.enclaveName,
    subtitle: [i.cityName, i.terrain].filter((s) => !!s).join(" · "),
    stage: stageLine(i),
    sources: /** @type {EnclaveTipSource[]} */ (sources),
    totalAmounts: totalYields(i),
    total: yieldsText(totalYields(i))
  };
}

/**
 * The sum of every source: the land (or the holding the enclave displaced), the enclave's own works, and
 * the stance as it is actually paid this turn. This is what the host really receives for the tile, which
 * is more than the map's yield icons show once a stance is in play.
 * @param {EnclaveTipInput} i The gathered input. @returns {Record<string, number>} Summed yields by type.
 */
export function totalYields(i) {
  return sumYields([baseYields(i), i.native || {}, paidStance(i)]);
}

/**
 * The land's share: the displaced holding's yields when the enclave took one over, else the bare land.
 * @param {EnclaveTipInput} i The input. @returns {Record<string, number>} Yields by type.
 */
function baseYields(i) {
  if (i.replacedName && hasYields(i.before)) return /** @type {Record<string, number>} */ (i.before);
  return landYields(i.now || {}, i.native || {});
}

/**
 * The stance as actually paid this turn: nothing before recognition, and a dimmed benefit while contested.
 * @param {EnclaveTipInput} i The input. @returns {Record<string, number>} Signed yields by type.
 */
function paidStance(i) {
  if (stageOf(i.rec) === "established") return {};
  return scaledStance(i.stance || {}, i.benefitScale == null ? 1 : num(i.benefitScale));
}

/**
 * Add yield maps together, to two decimals.
 * @param {Record<string, number>[]} maps @returns {Record<string, number>} Their sum.
 */
function sumYields(maps) {
  /** @type {Record<string, number>} */
  const sum = {};
  for (const m of maps) {
    for (const k of Object.keys(m || {})) sum[k] = Math.round((num(sum[k]) + num(m[k])) * 100) / 100;
  }
  return sum;
}

/**
 * The short second line under the on-map marker: the stage, and the stance's yields once there are any.
 * @param {*} rec The quarter record. @param {Record<string, number>} stance The stance's signed yields.
 * @returns {string} e.g. "ESTABLISHED" or "RECOGNIZED  +2 Production, −1 Happiness".
 */
export function markerStageLine(rec, stance) {
  const key = stageOf(rec);
  const word = {
    established: loc("LOC_EMIG_ETIP_MARK_ESTABLISHED", "Established"),
    recognized: loc("LOC_EMIG_ETIP_MARK_RECOGNIZED", "Recognized"),
    contested: loc("LOC_EMIG_ETIP_MARK_CONTESTED", "Contested"),
    fading: loc("LOC_EMIG_ETIP_MARK_FADING", "Fading")
  }[key];
  const y = key === "established" ? "" : yieldsText(stance || {});
  return y ? word + "  " + y : word;
}
