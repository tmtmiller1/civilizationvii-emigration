// emigration-polity.js
//
// 1.4.1 POLITY signals: the parts of the patch's happiness/government/celebration rework that the
// migration model reads. Three live signals, all fully defensive (any unreadable read degrades to a
// neutral value, never throws):
//
//   • cityHappinessStage(city)  - the per-settlement 5-stage ordinal (1.4.1 formalized happiness into
//     named stages with Age-scaled thresholds in GameInfo.HappinessStages). Buckets the city's
//     netHappinessPerTurn exactly the way the base-game city banner does.
//   • readPolity(owner)         - per-CIV government type, celebration (Golden Age) state, and war
//     weariness. Memoized per pass (resetPolityCache() at the top of collectCitySignals) so the same
//     owner isn't re-read once per city.
//   • governmentLean(type)      - a small, bounded flavor lean per known government. Deliberately
//     small: a government's real weight already reaches the model through the happiness and yields it
//     produces (which the city signal already reads), so this is a tie-breaker, not a primary driver.
//
// None of these existed pre-1.4.1; nothing here removes or renames an existing read.

/**
 * Per-pass memo of readPolity results, keyed by owner id. Cleared by resetPolityCache() at the start
 * of each city-collection pass so government/celebration/war-weariness are read at most once per civ.
 * @type {Map<number, Polity>}
 */
const _polityCache = new Map();

/**
 * The parsed happiness-stage table (HappinessStageType → ordinal + thresholds), built lazily once
 * from GameInfo.HappinessStages and reused. null until first successful build.
 * @type {{ordinal:number, min:number, max:number}[]|null}
 */
let _stages = null;

/**
 * A civ's polity state for one pass.
 * @typedef {Object} Polity
 * @property {string} government Government type id (e.g. "GOVERNMENT_DESPOTISM"), or "" if unknown.
 * @property {boolean} celebrating Whether the civ is in a Golden Age (player-facing: a Celebration).
 * @property {number} goldenAgeTurnsLeft Turns left in the current celebration (0 if none/unknown).
 * @property {boolean} warWeary Whether the civ has war weariness (empire-wide unhappiness from war).
 */

/** A neutral polity for civs we can't read (frozen so callers can't mutate the shared default). */
const NEUTRAL_POLITY = Object.freeze({
  government: "",
  celebrating: false,
  goldenAgeTurnsLeft: 0,
  warWeary: false
});

/** @type {Record<string, number>} Ordinal per happiness stage (ANGRY most negative … ECSTATIC most positive). */
const STAGE_ORDINAL = {
  HAPPINESS_STAGE_ANGRY: -2,
  HAPPINESS_STAGE_UNHAPPY: -1,
  HAPPINESS_STAGE_HAPPY: 0,
  HAPPINESS_STAGE_JOYOUS: 1,
  HAPPINESS_STAGE_ECSTATIC: 2
};

/**
 * A small, bounded attractiveness lean per known 1.4.1 government. Happiness/celebration-leaning
 * governments tilt slightly positive; militaristic/conquest ones slightly negative. Kept small on
 * purpose - the dominant part of a government's effect already flows through the happiness and yields
 * the city signal reads, so this only breaks ties between otherwise-similar destinations. Unknown
 * (modded / future) governments lean 0. The caller scales by governmentWeight and clamps the result.
 * @type {Record<string, number>}
 */
const GOVERNMENT_LEAN = {
  // Antiquity
  GOVERNMENT_CLASSICAL_REPUBLIC: 1, // +Culture in Happy/Joyous settlements → happiness-leaning
  GOVERNMENT_DESPOTISM: -1, // conquest-/militarism-leaning (mitigates unhappiness but war-focused)
  GOVERNMENT_OLIGARCHY: 0, // production/purchasing → economically neutral for attractiveness
  // Exploration
  GOVERNMENT_FEUDAL_MONARCHY: 0,
  GOVERNMENT_PLUTOCRACY: 1, // gold/growth-leaning
  GOVERNMENT_THEOCRACY: 0,
  GOVERNMENT_CONSTITUTIONAL_MONARCHY: 1,
  GOVERNMENT_REVOLUTIONARY_AUTHORITARIANISM: -1,
  GOVERNMENT_REVOLUTIONARY_REPUBLIC: 0,
  // Modern
  GOVERNMENT_AUTHORITARIANISM: -1,
  GOVERNMENT_BUREAUCRATIC_MONARCHY: 1, // joyous-keyed purchase discount → happiness-leaning
  GOVERNMENT_ELECTIVE_REPUBLIC: 1,
  GOVERNMENT_REVOLUCION: 0
};

/**
 * Clear the per-pass polity memo. Call once at the top of each city-collection pass.
 */
export function resetPolityCache() {
  _polityCache.clear();
}

/**
 * Build (once) the stage lookup from GameInfo.HappinessStages, mirroring the base-game city banner:
 * each row contributes an ordinal plus its [StageMinThreshold, StageMaxThreshold] band (defaulting to
 * ±Infinity, exactly as city-banners.js does). Returns null if the table isn't available yet.
 * @returns {{ordinal:number, min:number, max:number}[]|null} The bands, or null.
 */
function stageTable() {
  if (_stages) return _stages;
  try {
    const t = typeof GameInfo !== "undefined" ? GameInfo.HappinessStages : undefined;
    if (!t || typeof t.forEach !== "function") return null;
    /** @type {{ordinal:number, min:number, max:number}[]} */
    const rows = [];
    /** @param {*} row A GameInfo.HappinessStages row. */
    const addRow = (row) => {
      const ord = STAGE_ORDINAL[row?.HappinessStageType];
      if (typeof ord !== "number") return;
      rows.push({
        ordinal: ord,
        min: typeof row.StageMinThreshold === "number" ? row.StageMinThreshold : -Infinity,
        max: typeof row.StageMaxThreshold === "number" ? row.StageMaxThreshold : Infinity
      });
    };
    t.forEach(addRow);
    if (!rows.length) return null;
    _stages = rows;
    return _stages;
  } catch (_) {
    return null;
  }
}

/**
 * The per-settlement happiness STAGE as an ordinal in [-2, +2] (ANGRY −2 … ECSTATIC +2). Reads the
 * city's net happiness and buckets it against GameInfo.HappinessStages the way the base-game banner
 * does (`h >= min && h <= max`). Returns 0 (the HAPPY/neutral midpoint) whenever the stage can't be
 * resolved, so an unreadable game state never injects a spurious push or pull.
 * @param {*} city City object.
 * @returns {number} Stage ordinal in [-2, +2]; 0 when unavailable.
 */
export function cityHappinessStage(city) {
  try {
    const h = city?.Happiness?.netHappinessPerTurn;
    if (typeof h !== "number" || !isFinite(h)) return 0;
    const table = stageTable();
    if (!table) return 0;
    for (const s of table) {
      if (h >= s.min && h <= s.max) return s.ordinal;
    }
  } catch (_) {
    /* fall through to neutral */
  }
  return 0;
}

/**
 * Read a civ's polity state (government, celebration, war weariness), memoized for the current pass.
 * Every field degrades independently to its neutral default, so a partial API still yields a usable
 * Polity rather than throwing.
 * @param {number} owner Owner player id.
 * @returns {Polity} The civ's polity (NEUTRAL_POLITY when nothing is readable).
 */
export function readPolity(owner) {
  if (typeof owner !== "number") return NEUTRAL_POLITY;
  const cached = _polityCache.get(owner);
  if (cached) return cached;

  let player;
  try {
    player = typeof Players !== "undefined" ? Players.get(owner) : undefined;
  } catch (_) {
    player = undefined;
  }
  if (!player) {
    _polityCache.set(owner, NEUTRAL_POLITY);
    return NEUTRAL_POLITY;
  }

  /** @type {Polity} */
  const polity = {
    government: readGovernment(player),
    celebrating: readBool(() => player?.Happiness?.isInGoldenAge),
    goldenAgeTurnsLeft: readNumber(() => player?.Happiness?.goldenAgeTurnsLeft),
    warWeary: readBool(() => player?.Happiness?.hasWarWeariness)
  };
  _polityCache.set(owner, polity);
  return polity;
}

/**
 * The government type id for a player (e.g. "GOVERNMENT_DESPOTISM"), or "" when unreadable. Uses the
 * probe-confirmed path Culture.getGovernmentType() → GameInfo.Governments.lookup().GovernmentType.
 * @param {*} player Player object.
 * @returns {string} Government type id, or "".
 */
function readGovernment(player) {
  try {
    const culture = player && player.Culture;
    const g = typeof culture?.getGovernmentType === "function" ? culture.getGovernmentType() : null;
    return g == null ? "" : governmentName(g);
  } catch (_) {
    return "";
  }
}

/**
 * Resolve a government type value to its string id via GameInfo, or "" when unavailable.
 * @param {*} g A government type value from getGovernmentType().
 * @returns {string} The GovernmentType id, or "".
 */
function governmentName(g) {
  if (typeof GameInfo === "undefined") return "";
  const name = GameInfo.Governments?.lookup?.(g)?.GovernmentType;
  return typeof name === "string" ? name : "";
}

/**
 * The bounded flavor lean for a government id (0 for unknown/empty). The caller scales and clamps it.
 * @param {string} [government] Government type id.
 * @returns {number} A small signed lean.
 */
export function governmentLean(government) {
  return (government && GOVERNMENT_LEAN[government]) || 0;
}

/**
 * Evaluate a getter to a boolean, defaulting to false on any error/undefined.
 * @param {() => *} get Thunk reading the value.
 * @returns {boolean} The coerced boolean.
 */
function readBool(get) {
  try {
    return !!get();
  } catch (_) {
    return false;
  }
}

/**
 * Evaluate a getter to a finite number, defaulting to 0 on any error/undefined.
 * @param {() => *} get Thunk reading the value.
 * @returns {number} The numeric value, or 0.
 */
function readNumber(get) {
  try {
    const v = get();
    return typeof v === "number" && isFinite(v) ? v : 0;
  } catch (_) {
    return 0;
  }
}
