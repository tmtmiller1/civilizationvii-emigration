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
  LEADER_RIZAL: { happinessPull: 0.9 },

  // --- Brush & Blade expansion leaders (types verified against Contents_1.4.1/resources/DLC) ---
  // Conquerors profit from taking cities → pay MORE gold to digest the spoils (Xerxes class).
  LEADER_ALEXANDER: { assimilationEase: 1.2 }, // wonder-conquest; renames towns he converts
  LEADER_GENGHIS_KHAN: { assimilationEase: 1.2 }, // archetypal conqueror; sacks, not holds
  LEADER_EDWARD_TEACH: { assimilationEase: 1.25 }, // naval war-profiteer: plunder + unit capture
  // Bolivar INTEGRATES: free building + purchase-through-unrest in conquests → cheaper to absorb.
  LEADER_BOLIVAR: { assimilationEase: 0.85 },
  // Napoleon's base persona carries a FOOD_BANE; cushion the slower growth (Confucius-shaped).
  LEADER_NAPOLEON: { sourceBias: 0.5 },
  LEADER_HIMIKO: { happinessPull: 0.85 }, // happiness-building + celebration yields = magnet
  // Toyotomi takes double damage defending → a conqueror whose cities fall FASTER under siege.
  LEADER_TOYOTOMI_HIDEYOSHI: { assimilationEase: 1.2, warRetention: 0.85 }, // <1 = sheds pop fast
  LEADER_SAYYIDA_AL_HURRA: { warRetention: 1.2 } // naval-on-district yields reward garrisons
  // NEUTRAL (no migration outlier): ADA_LOVELACE (science), GILGAMESH (diplomacy), LAKSHMIBAI
  // (city-state incorporation + influence, no defense mechanic), FRIEDRICH (culture/Great Works).
  // TRUNG_TRAC ships no leader trait data in this DLC set, so it is left untuned (cf. RIZAL above).
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
  CIVILIZATION_QING: { sourceBias: 0.5 },

  // --- Brush & Blade expansion civilizations (types verified against Contents_1.4.1/DLC) ---
  // Conquest economies: yields/rewards from CAPTURING settlements → pay more gold for the spoils.
  CIVILIZATION_ASSYRIA: { assimilationEase: 1.25 }, // tech/codex + yields in captured settlements
  CIVILIZATION_BULGARIA: { assimilationEase: 1.2 }, // Krum's Dynasty pillage/production spoils
  // war-funded Celebrations (magnet) + conquest + Kulliye specialists
  CIVILIZATION_OTTOMANS: { happinessPull: 0.85, assimilationEase: 1.25, overcrowdDiscount: 0.5 },
  // settlers only by capture (conquest) + inland −Happiness makes cities a net SOURCE
  CIVILIZATION_PIRATE_REPUBLIC: { assimilationEase: 1.25, sourceBias: -0.5 },
  // Tall / few-settlement shapes: shield dense play from the density penalty.
  CIVILIZATION_CARTHAGE: { overcrowdDiscount: 0.5, integrationSpeed: 1.15 }, // 1-City cap + colonists
  // tall + mountain fortification defense + mountain Food carrying a happiness upkeep
  CIVILIZATION_NEPAL: { overcrowdDiscount: 0.6, warRetention: 1.3, sourceBias: 0.5 },
  // capital-concentrated tall: Bāq Celebration magnet + Eram specialists + capital Food growth
  CIVILIZATION_QAJAR: { happinessPull: 0.85, overcrowdDiscount: 0.6, sourceBias: 0.5 },
  // Defensive civs: empowered fortifications → cities retain population under siege (Norman class).
  CIVILIZATION_DAI_VIET: { warRetention: 1.4, sourceBias: 0.5 }, // wall Culture + forts + farm Food
  CIVILIZATION_SENGOKU: { warRetention: 1.4 }, // Himeji "must be conquered" + Daimyo undamaged
  // Happiness/celebration magnets: damp the over-attraction.
  CIVILIZATION_HEIAN: { happinessPull: 0.85 }, // Insei happiness/celebration engine + appeal theme
  CIVILIZATION_SILLA: { happinessPull: 0.9 }, // Pagoda +Happiness + resource-happiness traditions
  // High unconditional growth: per-capita diluted, so cushion it so the civ doesn't bleed pop.
  CIVILIZATION_SHAWNEE: { sourceBias: 0.75 } // navigable-river Food + Bread Dance town Food
  // NEUTRAL (no migration outlier): ICELAND (offensive-naval raiding, no defense/growth/happiness),
  // TONGA (wide coastal-trade; width already handled by the growth model), GREAT_BRITAIN (its only
  // outlier is a town→city conversion-cost penalty; gold/prod already reach the model via yields).
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
 * Compress a resolved profile toward neutral by CONFIG.civTuningStrength - the global
 * "flatten between civilizations" knob. 1 = the table as written (full identity); 0 = fully
 * flat (every civ neutral). Each field is interpolated toward its own neutral, so relative
 * ordering is preserved (the most defensive civ stays the most defensive) while the absolute
 * spread - the gap that feeds a snowball - shrinks uniformly across base AND new entries.
 * The overcrowd discount lerps toward CONFIG.overcrowdDiscount (the value a null entry uses),
 * and a null entry stays null. An unset/invalid strength is treated as 1 (no compression).
 * @param {CivTuning} t The merged profile.
 * @returns {CivTuning} The compressed profile.
 */
function flatten(t) {
  const raw = CONFIG.civTuningStrength;
  const s = typeof raw === "number" ? Math.max(0, Math.min(1, raw)) : 1;
  if (s >= 1) return t;
  const oc = CONFIG.overcrowdDiscount; // the discount a null (neutral) entry falls back to
  return {
    happinessPull: 1 + (t.happinessPull - 1) * s,
    integrationSpeed: 1 + (t.integrationSpeed - 1) * s,
    assimilationEase: 1 + (t.assimilationEase - 1) * s,
    overcrowdDiscount: t.overcrowdDiscount == null ? null : oc + (t.overcrowdDiscount - oc) * s,
    warRetention: 1 + (t.warRetention - 1) * s,
    sourceBias: t.sourceBias * s
  };
}

/**
 * The tuning profile for a player: the neutral profile merged with its civ entry
 * then its leader entry (leader wins on conflict), then compressed toward neutral by
 * CONFIG.civTuningStrength. Returns the shared neutral profile (and touches no globals)
 * when the table is disabled or nothing matches.
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
  return flatten({ ...NEUTRAL, ...civ, ...lead });
}
