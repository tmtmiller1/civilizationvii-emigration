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
  "richer": "greater prosperity",
  "nearby": "proximity",
  "safer-dir": "away from the fighting",
  "own-civ": "greater safety",
  "crisis-escape": "escaping the crisis",
  "aggressor-avoided": "avoiding the aggressor",
  "open-borders": "open borders",
  "allied": "alliance",
  "asylum": "offer of asylum",
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

// Reason tags that describe the DESTINATION's own pull — they read as attributes of where the people
// went ("more prosperous", "nearby", "open borders"). The remaining tags — crisis-escape /
// aggressor-avoided / safer-dir / raid — describe the FLIGHT (why/how they left), which the situation
// sentence already conveys and which reads oddly under a "Drawn there:" / "Why there:" heading (mixing a
// gerund fragment like "escaping the crisis" with an adjective like "more prosperous"). So the
// destination-why clause shows only these.
const PULL_TAGS = new Set(["richer", "nearby", "own-civ", "open-borders", "allied", "asylum"]);

/**
 * Like {@link reasonsPhrase} but only the destination-PULL tags — for the "Drawn there:" / "Why there:"
 * clause, so it names why the destination was chosen without splicing in a flight fragment. Empty when
 * the move had no pull reason (its situation sentence already tells the whole story).
 * @param {string[]|undefined} reasons The reason-tag keys.
 * @param {number} [max] Max tags to show (default 3).
 * @returns {string} The joined pull phrase, or "".
 */
export function pullReasonsPhrase(reasons, max = 3) {
  if (!Array.isArray(reasons)) return "";
  const seen = new Set();
  const parts = [];
  for (const t of reasons) {
    if (!PULL_TAGS.has(t) || seen.has(t)) continue;
    seen.add(t);
    parts.push(reasonLabel(t));
    if (parts.length >= max) break;
  }
  if (parts.length <= 1) return parts[0] || "";
  // Read as prose ("A and B", "A, B and C"): the final connector is localized (English " and ", other
  // languages their own word, or a comma where a conjunction isn't wanted), the rest comma-joined.
  const and = loc("LOC_EMIG_LIST_AND", " and ");
  return parts.slice(0, -1).join(", ") + and + parts[parts.length - 1];
}
