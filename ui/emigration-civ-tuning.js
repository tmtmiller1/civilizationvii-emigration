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
import { CIV_ROSTER, LEADER_ROSTER, MEMENTO_ROSTER } from "/emigration/ui/emigration-civ-roster.js";

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
 * Per-memento nudges.
 *
 * Most mementos are neutral for migration because their effects are military /
 * situational / age-scoped and already read via yields or conflict signals. This
 * table only lists mementos with direct migration-facing pressure (happiness/gold
 * magnetism) and leaves the rest explicitly neutral.
 * @type {Record<string, Partial<CivTuning>>}
 */
export const BY_MEMENTO = {
  MEMENTO_BENJAMIN_FRANKLIN_GLASS_ARMONICA: { happinessPull: 0.9 },
  MEMENTO_ISABELLA_PADRON_REAL: { happinessPull: 0.92 },
  MEMENTO_LAFAYETTE_LETTER_ADRIENNE: { happinessPull: 0.93 },
  MEMENTO_BATTUTA_RIHLA: { happinessPull: 0.95, assimilationEase: 1.1 },
  MEMENTO_FOUNDATION_LYDIAN_LION: { assimilationEase: 1.1 },
  MEMENTO_FOUNDATION_TRAVELS_MARCO_POLO: { assimilationEase: 1.08 },
  MEMENTO_AMINA_KWALKWALI: { assimilationEase: 1.08 },
  MEMENTO_XERXES_KING_GOLDEN_SCEPTRE: { assimilationEase: 1.1 },
  MEMENTO_XERXES_KING_LOTUS_BLOSSOM: { assimilationEase: 1.08 }
};

// Full roster coverage: every leader/civ is either explicitly tuned above or
// explicitly neutral here (decision recorded for regression checks).
export const EXPLICIT_NEUTRAL_LEADERS = Object.freeze(
  LEADER_ROSTER.filter((leaderType) => !Object.hasOwn(BY_LEADER, leaderType))
);

export const EXPLICIT_NEUTRAL_CIVS = Object.freeze(
  CIV_ROSTER.filter((civilizationType) => !Object.hasOwn(BY_CIV, civilizationType))
);

export const EXPLICIT_NEUTRAL_MEMENTOS = Object.freeze(
  MEMENTO_ROSTER.filter((mementoType) => !Object.hasOwn(BY_MEMENTO, mementoType))
);

const MEMENTO_BOUNDS = Object.freeze({
  happinessPull: [0.75, 1.25],
  integrationSpeed: [0.75, 1.35],
  assimilationEase: [0.75, 1.35],
  warRetention: [0.75, 1.35],
  sourceBias: [-1.5, 1.5],
  overcrowdDiscount: [0, 1]
});

/**
 * Clamp a numeric value to [lo, hi].
 * @param {number} v Value.
 * @param {number} lo Lower bound.
 * @param {number} hi Upper bound.
 * @returns {number} Clamped value.
 */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

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

// The memento tuning fields that COMPOSE MULTIPLICATIVELY (a stack multiplies them); sourceBias adds
// and overcrowdDiscount averages, handled separately. Shared by the accumulate/clamp/merge helpers.
const MULT_FIELDS = ["happinessPull", "integrationSpeed", "assimilationEase", "warRetention"];

/**
 * The MEMENTO_* type id carried by one equipped-memento entry, across the runtime's varying shapes
 * (the value itself, or a typed field). Null when none looks like a memento id.
 * @param {*} entry One equipped-memento entry. @returns {string|null} The MEMENTO_ id, or null.
 */
function mementoIdOf(entry) {
  if (!entry) return null;
  const candidates = [entry, entry.mementoTypeId, entry.mementoType, entry.Type, entry.type, entry.id, entry.value];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("MEMENTO_")) return c;
  }
  return null;
}

/**
 * Pull equipped memento type ids for a player from metaprogression runtime APIs.
 * Returns an empty list when unavailable/offline.
 * @param {number} pid Player id.
 * @returns {string[]} Equipped memento type ids (MEMENTO_*), de-duplicated.
 */
function equippedMementos(pid) {
  try {
    const meta = Online?.Metaprogression;
    if (!meta || typeof meta.getEquippedMementos !== "function") return [];
    const raw = meta.getEquippedMementos(pid);
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const entry of raw) {
      const id = mementoIdOf(entry);
      if (id) out.push(id);
    }
    return Array.from(new Set(out));
  } catch (_) {
    return [];
  }
}

/**
 * Merge all equipped memento tuning entries into one bounded profile.
 * Multipliers compose multiplicatively and sourceBias adds; the combined profile
 * is clamped to conservative bounds to prevent stack-driven runaway.
 * @param {number} pid Player id.
 * @returns {Partial<CivTuning>|null} Merged memento profile, or null when no tuned mementos are equipped.
 */
function mementoProfile(pid) {
  const acc = accumulateMementos(equippedMementos(pid));
  return acc ? clampMementoProfile(acc) : null;
}

/**
 * Fold a player's equipped memento tunings into one raw (un-clamped) profile: multiplicative fields
 * multiply, sourceBias adds, overcrowdDiscount averages. A field stays `undefined`/null until some
 * memento sets it (so it's omitted from the output). Null when no recognized memento is equipped.
 * @param {string[]} ids Equipped memento ids.
 * @returns {Record<string, number>|null} The raw accumulator, or null.
 */
function accumulateMementos(ids) {
  /** @type {Record<string, number>} */
  const a = {};
  let any = false;
  let oc = null;
  for (const id of ids) {
    const t = BY_MEMENTO[id];
    if (!t) continue;
    any = true;
    accumulateFields(a, /** @type {Record<string, number>} */ (t));
    if (typeof t.overcrowdDiscount === "number") {
      oc = oc == null ? t.overcrowdDiscount : (oc + t.overcrowdDiscount) / 2;
    }
  }
  if (!any) return null;
  if (oc != null) a.overcrowdDiscount = oc;
  return a;
}

/**
 * Fold one memento's multiplicative fields + sourceBias into the running accumulator (in place).
 * @param {Record<string, number>} a The accumulator. @param {Record<string, number>} t The memento.
 */
function accumulateFields(a, t) {
  for (const f of MULT_FIELDS) {
    if (typeof t[f] === "number") a[f] = (a[f] == null ? 1 : a[f]) * t[f];
  }
  if (typeof t.sourceBias === "number") a.sourceBias = (a.sourceBias || 0) + t.sourceBias;
}

/**
 * Clamp a raw memento accumulator to its conservative bounds, keeping only the fields that were set.
 * @param {Record<string, number>} a The raw accumulator.
 * @returns {Partial<CivTuning>} The bounded profile.
 */
function clampMementoProfile(a) {
  /** @type {Record<string, number>} */
  const o = {};
  const b = /** @type {Record<string, number[]>} */ (MEMENTO_BOUNDS);
  for (const f of [...MULT_FIELDS, "sourceBias", "overcrowdDiscount"]) {
    if (a[f] != null) o[f] = clamp(a[f], b[f][0], b[f][1]);
  }
  return o;
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
  const civ = lookupEntry(BY_CIV, civName(pid));
  const lead = lookupEntry(BY_LEADER, leaderName(pid));
  const mem = mementoProfile(pid);
  if (!civ && !lead && !mem) return NEUTRAL;
  const merged = { ...NEUTRAL, ...civ, ...lead };
  if (mem) applyMemento(merged, mem);
  return flatten(merged);
}

/**
 * A table entry for a (possibly null/empty) key, or null.
 * @param {Record<string, *>} map The lookup table. @param {*} key The key (falsy → null).
 * @returns {*} The entry, or null.
 */
function lookupEntry(map, key) {
  return (key && map[key]) || null;
}

/**
 * Fold a clamped memento profile into a player's merged tuning IN PLACE: multiplicative fields
 * multiply, sourceBias adds, overcrowdDiscount averages (or seeds a null entry).
 * @param {CivTuning} merged The civ+leader merged tuning (mutated).
 * @param {Partial<CivTuning>} mem The clamped memento profile.
 */
function applyMemento(merged, mem) {
  const m = /** @type {Record<string, number>} */ (merged);
  const p = /** @type {Record<string, number>} */ (mem);
  for (const f of MULT_FIELDS) {
    if (typeof p[f] === "number") m[f] *= p[f];
  }
  if (typeof mem.sourceBias === "number") merged.sourceBias += mem.sourceBias;
  if (typeof mem.overcrowdDiscount === "number") {
    merged.overcrowdDiscount = merged.overcrowdDiscount == null
      ? mem.overcrowdDiscount : (merged.overcrowdDiscount + mem.overcrowdDiscount) / 2;
  }
}
