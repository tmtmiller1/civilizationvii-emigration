// emigration-move-reasons.js
//
// The "why did people move HERE" reason tags (P0.1): a small, stable vocabulary shared by the
// decision layer (emigration-pull.js emits the keys for a chosen move) and every surface that shows
// a move (notifications + the per-city readout). Keys are stable strings stored on the migration
// record; the short phrases are localized only at display time, so a saved notification is never
// baked to one language and the tags stay comparable across surfaces.

/** Stable reason-tag keys. Emitted by emigration-pull.js `deriveMoveReasons`. */
export const REASON = Object.freeze({
  RICHER: "richer", // the destination out-prospers the source (the prosperity pull)
  NEARBY: "nearby", // a short hop, not a cross-map teleport
  SAFER_DIR: "safer-dir", // lies away from the fighting (directional flight)
  OWN_CIV: "own-civ", // a safer settlement inside the refugees' own lands
  CRISIS_ESCAPE: "crisis-escape", // fleeing a crisis across a border (reduced friction)
  AGGRESSOR_AVOIDED: "aggressor-avoided", // a neutral host, not the civ that attacked them
  OPEN_BORDERS: "open-borders", // the destination is open to immigrants
  ALLIED: "allied", // an allied civilization
  ASYLUM: "asylum", // the destination offers asylum
  RAID: "raid" // pulled toward an active raider
});

/** Stable death-reason keys (P0.2): why an attrition death happened. */
export const DEATH_REASON = Object.freeze({
  SIEGE: "siege", // the settlement is being besieged / razed
  UNDER_ATTACK: "under-attack", // in-border violence over the flee threshold (no active siege flag)
  DISASTER: "disaster", // disaster distress over the flee threshold
  FAMINE: "famine", // net food is negative (starving)
  UNREST: "unrest", // sustained civic unrest, lethal only after prolonged neglect (unrestLethalDelayTurns)
  NO_REFUGE: "no-refuge", // trapped: no viable destination to flee to
  CRISIS_LOSSES: "crisis-losses" // some died while the rest fled (a refuge existed)
});

// English fallbacks (used off-engine and when a locale key is missing), lowercase so they read inline
// after a name, e.g. "Pulled toward Thebes (nearby, open borders)".
/** @type {Record<string, string>} */
const FALLBACK = {
  "richer": "more prosperous",
  "nearby": "nearby",
  "safer-dir": "away from the fighting",
  "own-civ": "safer interior",
  "crisis-escape": "escaping the crisis",
  "aggressor-avoided": "avoiding the aggressor",
  "open-borders": "open borders",
  "allied": "an ally",
  "asylum": "offered asylum",
  "raid": "drawn by a raid",
  "siege": "under siege",
  "under-attack": "under attack",
  "disaster": "disaster",
  "famine": "famine",
  "unrest": "sustained unrest",
  "no-refuge": "no safe refuge",
  "crisis-losses": "lost while fleeing"
};

// LOC keys, one per tag (defined in text/en_us/ModText.xml + translated).
/** @type {Record<string, string>} */
const LOC = {
  "richer": "LOC_EMIG_REASON_RICHER",
  "nearby": "LOC_EMIG_REASON_NEARBY",
  "safer-dir": "LOC_EMIG_REASON_SAFER_DIR",
  "own-civ": "LOC_EMIG_REASON_OWN_CIV",
  "crisis-escape": "LOC_EMIG_REASON_CRISIS_ESCAPE",
  "aggressor-avoided": "LOC_EMIG_REASON_AGGRESSOR_AVOIDED",
  "open-borders": "LOC_EMIG_REASON_OPEN_BORDERS",
  "allied": "LOC_EMIG_REASON_ALLIED",
  "asylum": "LOC_EMIG_REASON_ASYLUM",
  "raid": "LOC_EMIG_REASON_RAID",
  "siege": "LOC_EMIG_REASON_SIEGE",
  "under-attack": "LOC_EMIG_REASON_UNDER_ATTACK",
  "disaster": "LOC_EMIG_REASON_DISASTER",
  "famine": "LOC_EMIG_REASON_FAMINE",
  "unrest": "LOC_EMIG_REASON_UNREST",
  "no-refuge": "LOC_EMIG_REASON_NO_REFUGE",
  "crisis-losses": "LOC_EMIG_REASON_CRISIS_LOSSES"
};

/**
 * Localize a LOC key, falling back to `fallback` off-engine / when unresolved.
 * @param {string} key LOC key.
 * @param {string} fallback English fallback.
 * @returns {string} The localized (or fallback) string.
 */
function loc(key, fallback) {
  try {
    if (typeof Locale !== "undefined" && Locale.compose) {
      const v = Locale.compose(key);
      if (typeof v === "string" && v && !v.startsWith("LOC_")) return v;
    }
  } catch (_) {
    /* ignore */
  }
  return fallback;
}

/**
 * The short display phrase for one reason tag (localized). Unknown tags pass through as-is so a
 * future tag never renders blank.
 * @param {string} tag A reason-tag key.
 * @returns {string} The phrase.
 */
export function reasonLabel(tag) {
  const fb = FALLBACK[tag];
  const key = LOC[tag];
  return key ? loc(key, fb || tag) : (fb || tag);
}

/**
 * Join a list of reason tags into a compact localized phrase ("nearby, open borders"), deduped and
 * capped. Empty for no reasons.
 * @param {string[]|undefined} reasons The reason-tag keys.
 * @param {number} [max] Max tags to show (default 3).
 * @returns {string} The joined phrase, or "".
 */
export function reasonsPhrase(reasons, max = 3) {
  if (!Array.isArray(reasons) || !reasons.length) return "";
  const seen = new Set();
  const parts = [];
  for (const t of reasons) {
    if (typeof t !== "string" || seen.has(t)) continue;
    seen.add(t);
    parts.push(reasonLabel(t));
    if (parts.length >= max) break;
  }
  return parts.join(", ");
}
