// emigration-civ-tuning.js
//
// The per-leader / per-civilization VARIANCE layer (Algorithm C / the civ table).
// A small, auditable registry of BOUNDED nudges that let individual leaders and
// civilizations diverge from the global model - magnet damping, integration
// speed, war-time population retention, a flat source bias - WITHOUT any of them
// being able to cause a runaway (the structural guarantees live in the global
// algorithms; this only shifts within bounds).
//
// Keys are the GameInfo string types (probe API3-1): leaderType resolves via
// GameInfo.Leaders.lookup(...).LeaderType, civilizationType via
// GameInfo.Civilizations.lookup(...).CivilizationType. Leader persona variants
// (e.g. LEADER_ASHOKA_ALT) are normalized to their base so both personas share an
// entry. Leader entries override civ entries on conflict.
//
// The whole layer is GATED by CONFIG.civTuningEnabled: when off, civTuning()
// returns the neutral profile and never touches the gameplay globals, so the mod
// behaves exactly as if the table were empty.

import { CONFIG } from "/emigration/ui/emigration-config.js";

/**
 * A civ's tuning profile. All multipliers are 1 (neutral) and biases 0 by default.
 * @typedef {Object} CivTuning
 * @property {number} happinessPull Scales the happiness contribution to prosperity.
 * @property {number} integrationSpeed Scales assimilation-load decay (faster = clears sooner).
 * @property {number} assimilationEase Scales the per-turn assimilation gold cost.
 * @property {number|null} overcrowdDiscount Override of the overcrowd discount (null = CONFIG).
 * @property {number} warRetention Higher = retains more population under siege (Algorithm D).
 * @property {number} sourceBias Flat prosperity nudge (+ keeps people, − pushes them out).
 */

/** @type {CivTuning} */
const NEUTRAL = Object.freeze({
  happinessPull: 1,
  integrationSpeed: 1,
  assimilationEase: 1,
  overcrowdDiscount: null,
  warRetention: 1,
  sourceBias: 0
});

/**
 * Per-leader nudges (the outliers from docs/leader-civ-memento-interactions.md).
 * @type {Record<string, Partial<CivTuning>>}
 */
export const BY_LEADER = {
  LEADER_BENJAMIN_FRANKLIN: { happinessPull: 0.75 }, // Glass Armonica magnet, deflated
  LEADER_ISABELLA: { happinessPull: 0.85, assimilationEase: 1.2 }, // happy+gold double-magnet
  LEADER_XERXES: { assimilationEase: 1.25 }, // profits from war → costs more to absorb spoils
  LEADER_PACHACUTI: { overcrowdDiscount: 0.5 }, // extra specialist relief, above the 0.3 global
  LEADER_CONFUCIUS: { sourceBias: 0.5 }, // growth-heavy, per-capita diluted → small cushion
  LEADER_ASHOKA: { happinessPull: 0.9 }, // trim celebration-pulse magnetism
  // The engine reports this leader's type as LEADER_JOSE_RIZAL (LEADER_RIZAL never matched a leader
  // Type, so the tuning silently never applied). Keep both keys: JOSE_RIZAL is canonical, RIZAL a
  // defensive alias (both strings appear in base data).
  LEADER_JOSE_RIZAL: { happinessPull: 0.9 }, // longer golden ages → longer magnet windows
  LEADER_RIZAL: { happinessPull: 0.9 }
};

/**
 * Per-civilization nudges.
 * @type {Record<string, Partial<CivTuning>>}
 */
export const BY_CIV = {
  CIVILIZATION_KHMER: { sourceBias: 1.5 }, // offset the −5-happiness non-capital bleed
  CIVILIZATION_ABBASID: { overcrowdDiscount: 0.7 }, // lean specialist civ → fully shielded
  CIVILIZATION_NORMAN: { warRetention: 1.4 }, // free walls = deliberate population retention
  CIVILIZATION_ENGLAND: { warRetention: 1.4 },
  CIVILIZATION_HAN: { sourceBias: 0.5 }, // +pop growth, per-capita diluted
  CIVILIZATION_QING: { sourceBias: 0.5 }
};

/**
 * The normalized leader type string for a player (base persona, `_ALT` stripped),
 * or null if unreadable.
 * @param {number} pid Player id.
 * @returns {string|null} e.g. "LEADER_ASHOKA".
 */
function leaderName(pid) {
  try {
    const lt = Players?.get?.(pid)?.leaderType;
    const n = GameInfo?.Leaders?.lookup?.(lt)?.LeaderType;
    return typeof n === "string" ? n.replace(/_ALT$/, "") : null;
  } catch (_) {
    return null;
  }
}

/**
 * The civilization type string for a player, or null if unreadable.
 * @param {number} pid Player id.
 * @returns {string|null} e.g. "CIVILIZATION_NORMAN".
 */
function civName(pid) {
  try {
    const ct = Players?.get?.(pid)?.civilizationType;
    const n = GameInfo?.Civilizations?.lookup?.(ct)?.CivilizationType;
    return typeof n === "string" ? n : null;
  } catch (_) {
    return null;
  }
}

/**
 * The tuning profile for a player: the neutral profile merged with its civ entry
 * then its leader entry (leader wins on conflict). Returns the shared neutral
 * profile (and touches no globals) when the table is disabled or nothing matches.
 * @param {number} pid Player id.
 * @returns {CivTuning} The resolved tuning.
 */
export function civTuning(pid) {
  if (!CONFIG.civTuningEnabled || typeof pid !== "number") return NEUTRAL;
  const civKey = civName(pid);
  const leadKey = leaderName(pid);
  const civ = (civKey && BY_CIV[civKey]) || null;
  const lead = (leadKey && BY_LEADER[leadKey]) || null;
  if (!civ && !lead) return NEUTRAL;
  return { ...NEUTRAL, ...civ, ...lead };
}
