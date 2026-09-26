// emigration-causes.js
//
// The SINGLE SOURCE OF TRUTH for migration CAUSES, the taxonomy shared by the engine (which emits
// them), the per-civ tallies + Demographics attribution (which key on them), the naming/feedback
// layer (which flavors them), and the city readout (which explains them).
//
// The string VALUES are PERSISTED routing keys (the per-cause maps in EmigrationMigStats_v1), so
// the set is ADDITIVE-ONLY: never rename a value without a load-time alias, or existing saves lose
// their per-cause history.

import { formatPeople } from "/emigration/ui/emigration-population.js";
import { loc } from "/emigration/ui/emigration-loc.js";

/**
 * Why population left a settlement. `attrition` is the outlet (a death, population lost with no
 * destination), tracked apart from the migration/refugee tallies. `conquest` is capture-driven
 * displacement.
 * @typedef {"unhappiness"|"prosperity"|"war"|"disaster"|"conquest"|"attrition"|"return"} MigrationCause
 */

/**
 * A cause usable in a refugee HEADLINE. Adds `crisis`, a world-news milestone pseudo-cause that is
 * deliberately NOT a MigrationCause (no single move carries it; it summarizes a civ's cumulative
 * refugees).
 * @typedef {MigrationCause | "crisis"} HeadlineCause
 */

/**
 * How durable a population loss is, for the "temporary or permanent?" cue.
 * @typedef {"temporary"|"persistent"|"permanent"} Permanence
 */

/** Forced-displacement causes (vs. economic unhappiness/prosperity migration). */
const REFUGEE_CAUSES = new Set(["war", "disaster", "conquest"]);

/**
 * Short display labels per cause. The English strings here are the fail-safe fallback used off-engine
 * (tests, headless) and when a key is unresolved; in-game the matching `LOC_EMIG_CAUSE_LABEL_*` key is
 * composed instead so the label follows the player's language (see {@link causeLabel}).
 * @type {Record<string,string>}
 */
const LABELS = {
  unhappiness: "Unhappiness",
  prosperity: "Attraction",
  war: "War",
  disaster: "Disaster",
  conquest: "Conquest",
  attrition: "Attrition",
  return: "Return",
  crisis: "Crisis",
  chronicle: "Chronicle",
  other: "Other"
};

/** @type {Record<string,string>} The LOC key per cause, paired with the English fallback in `LABELS`. */
const LABEL_KEYS = {
  unhappiness: "LOC_EMIG_CAUSE_LABEL_UNHAPPINESS",
  prosperity: "LOC_EMIG_CAUSE_LABEL_PROSPERITY",
  war: "LOC_EMIG_CAUSE_LABEL_WAR",
  disaster: "LOC_EMIG_CAUSE_LABEL_DISASTER",
  conquest: "LOC_EMIG_CAUSE_LABEL_CONQUEST",
  attrition: "LOC_EMIG_CAUSE_LABEL_ATTRITION",
  return: "LOC_EMIG_CAUSE_LABEL_RETURN",
  crisis: "LOC_EMIG_CAUSE_LABEL_CRISIS",
  chronicle: "LOC_EMIG_CAUSE_LABEL_CHRONICLE",
  other: "LOC_EMIG_CAUSE_LABEL_OTHER"
};

// Theme accent color per cause, for TEXT-ADJACENT chrome (the toast accent bar and notifications-log
// rows). Deliberately DISTINCT from `CAUSE_PALETTE` in emigration-network-paint.js, which fills the
// network-canvas dots in brighter tones; do NOT consolidate the two. A NEW cause needs a color in BOTH maps.
/** @type {Record<string,string>} */
const ACCENTS = {
  war: "#d24b3e",
  conquest: "#a83232",
  disaster: "#e08a3c",
  prosperity: "#5fae6b",
  unhappiness: "#c9a24b",
  attrition: "#9aa0a6",
  return: "#4f9d9a",
  crisis: "#d24b3e",
  chronicle: "#a98fd0",
  other: "#cba35c"
};

/** @type {Record<string,Permanence>} */
const PERMANENCE = {
  unhappiness: "persistent",
  prosperity: "persistent",
  war: "temporary",
  disaster: "temporary",
  conquest: "temporary",
  attrition: "permanent",
  return: "temporary"
};

/**
 * One-line player action hint per cause. As with {@link LABELS} the English text is the off-engine
 * fallback; in-game the matching `LOC_EMIG_HINT_*` key is composed (see {@link causeHint}).
 * @type {Record<string,string>}
 */
const HINTS = {
  unhappiness: "Raise {1_City}'s Happiness to stop its people leaving.",
  prosperity: "Improve {1_City}'s yields and Happiness to keep more of its people.",
  war: "They will keep fleeing until the fighting inside the city's borders ends and its pillaged tiles are repaired.",
  disaster: "People stop fleeing after the disaster ends.",
  conquest: "The conqueror took these people along with the city. Retake it to win them back.",
  attrition: "These people died and are lost for good.",
  return: "They are going home now that their homeland is peaceful and prosperous again."
};

/**
 * City-less variants of the hints that name a settlement, for callers that aggregate across cities and
 * so have no single name to give (the verbose per-cause toast). Without these an unfilled `{1_City}`
 * placeholder would reach the screen.
 * @type {Record<string,string>}
 */
const HINTS_ANY = {
  unhappiness: "Raise Happiness in your unhappy cities to stop their people leaving.",
  prosperity: "Improve the yields and Happiness of the cities people leave to keep more of them."
};

/** The English fallback for {@link stanceTip}. */
const STANCE_TIP = "An Anti-Immigration Stance policy would also keep more of them in your empire.";

/** @type {Record<string,string>} The LOC key per hint, paired with the English fallback in `HINTS`. */
const HINT_KEYS = {
  unhappiness: "LOC_EMIG_HINT_UNHAPPINESS",
  prosperity: "LOC_EMIG_HINT_PROSPERITY",
  war: "LOC_EMIG_HINT_WAR",
  disaster: "LOC_EMIG_HINT_DISASTER",
  conquest: "LOC_EMIG_HINT_CONQUEST",
  attrition: "LOC_EMIG_HINT_ATTRITION",
  return: "LOC_EMIG_HINT_RETURN"
};

/**
 * Whether a cause is forced displacement (counts toward the refugees tally + refugee headline, and
 * takes the minimum "camp" transit lag).
 * @param {string} [cause]
 * @returns {boolean} True for war/disaster/conquest.
 */
export function isRefugeeCause(cause) {
  return !!cause && REFUGEE_CAUSES.has(cause);
}

/**
 * The short, localized display label for a cause ("War", "Attraction", …), composed from its
 * `LOC_EMIG_CAUSE_LABEL_*` key with the English `LABELS` entry as the fallback. Unknown causes fall
 * back to the "Other" label.
 * @param {string} [cause]
 * @returns {string} The label.
 */
export function causeLabel(cause) {
  const key = (cause && LABEL_KEYS[cause]) || LABEL_KEYS.other;
  const fallback = (cause && LABELS[cause]) || LABELS.other;
  return loc(key, fallback);
}

/**
 * The theme accent color for a cause (war red, disaster amber, prosperity green, …), for the toast
 * accent bar and the notifications-log rows. Falls back to the gold mod accent for unknown causes.
 * @param {string} [cause] The migration cause (or "crisis").
 * @returns {string} A CSS color.
 */
export function causeAccent(cause) {
  return (cause && ACCENTS[cause]) || ACCENTS.other;
}

/**
 * The DIRECTION-based accent for a per-move migration digest, shared by the HUD toast AND the log row:
 * green when people stay within the empire or arrive from abroad, red when the player's OWN people
 * leave for another civ, independent of the cause. Deaths and world-news use {@link notificationAccent} instead.
 * @param {boolean} [ownLoss] Whether it's the player's own settlement shedding population.
 * @param {boolean} [crossCiv] Whether the move crossed a civilization border.
 * @returns {string} A CSS color.
 */
export function digestAccent(ownLoss, crossCiv) {
  if (ownLoss) return crossCiv ? causeAccent("war") : NEUTRAL_NEWS_ACCENT;
  return crossCiv ? GAIN_ACCENT : NEUTRAL_NEWS_ACCENT;
}

/** The red-toned causes; the alarming red is reserved for the local player's OWN population losses. */
const RED_CAUSES = new Set(["war", "conquest", "crisis"]);
/** The good-news causes; their green is reserved for the local player's OWN gains (see GAIN_ACCENT). */
const GAIN_CAUSES = new Set(["prosperity", "return"]);
/** A muted slate for world-news / other-civ notifications (informational, not the player's crisis). */
const NEUTRAL_NEWS_ACCENT = "#7d8aa0";
/** The one green: a gain to the player's own empire. Nothing that costs the player is ever painted with it. */
const GAIN_ACCENT = ACCENTS.prosperity;
/** The player's own people leaving for a "good" reason (prosperity, a return home) is still a loss: amber. */
const OWN_SOFT_LOSS_ACCENT = ACCENTS.unhappiness;

/**
 * The accent color for a NOTIFICATION (toast or log row). Two rules: red is reserved for the local
 * player's OWN population losses and green for the local player's OWN gains; another civ's news is a
 * neutral tone, and the player's own people leaving for prosperity or returning home is amber.
 * @param {string} [cause] The migration cause (or "crisis").
 * @param {boolean} [ownLoss] Whether this notification is the local player's own population loss.
 * @returns {string} A CSS color.
 */
export function notificationAccent(cause, ownLoss) {
  const c = cause || "";
  if (ownLoss) return GAIN_CAUSES.has(c) ? OWN_SOFT_LOSS_ACCENT : causeAccent(c);
  if (RED_CAUSES.has(c) || GAIN_CAUSES.has(c)) return NEUTRAL_NEWS_ACCENT;
  return causeAccent(c);
}

/**
 * How durable a loss from this cause is (the "temporary / persistent / permanent" cue).
 * @param {string} [cause]
 * @returns {Permanence} The permanence class.
 */
export function causePermanence(cause) {
  return (cause && PERMANENCE[cause]) || "persistent";
}

/**
 * A one-line, player-facing "what can I do" hint for a cause (localized from `LOC_EMIG_HINT_*` with
 * the English `HINTS` entry as fallback), or "" when the cause has no hint. `city` fills the `{1_City}`
 * placeholder some hints carry (the prosperity hint names the settlement being out-prospered); it is
 * ignored by hints without a placeholder, so passing it is always safe.
 * @param {string} [cause]
 * @param {string} [city] The settlement name, for hints that name it.
 * @returns {string} The hint.
 */
export function causeHint(cause, city) {
  if (!cause || !HINTS[cause]) return "";
  if (!city && HINTS_ANY[cause]) return loc(HINT_KEYS[cause] + "_ANY", HINTS_ANY[cause]);
  return loc(HINT_KEYS[cause], HINTS[cause], city);
}

/**
 * The extra tip shown when people leave for ANOTHER civilization by choice: the Anti-Immigration Stance
 * is the one lever that retains them, and it only acts on cross-civ moves, so it is never offered for an
 * internal move (where it does nothing) or a forced flight.
 * @returns {string} The tip.
 */
export function stanceTip() {
  return loc("LOC_EMIG_HINT_STANCE", STANCE_TIP);
}

/**
 * Tie-break order for equal-magnitude net drivers: forced/alarming causes first, voluntary last,
 * so rows that sort to the same magnitude still render in a stable, meaningful order (steadier
 * screenshots + tests). Unknown causes sort last.
 */
const CAUSE_ORDER = ["war", "conquest", "disaster", "attrition", "unhappiness", "prosperity", "return"];

/**
 * A cause's tie-break rank (unknown causes sort after all known ones).
 * @param {string} cause
 * @returns {number} The rank.
 */
function causeOrder(cause) {
  const i = CAUSE_ORDER.indexOf(cause);
  return i === -1 ? CAUSE_ORDER.length : i;
}

/**
 * A finite number, or 0. `(x || 0)` already maps NaN→0 (NaN is falsy); this additionally maps
 * ±Infinity→0, so a corrupted save-loaded tally can't render "Infinity thousand".
 * @param {number} [n] The value.
 * @returns {number} `n` if finite, else 0.
 */
function finite(n) {
  return Number.isFinite(n) ? Number(n) : 0;
}

/**
 * The cause that moved the most people in a per-cause map — the one to name where there is room for
 * only one (the City Details flow rows). Ties break on CAUSE_ORDER, the same rank `netDrivers` uses.
 * "" when the map is absent, empty, or all-zero (a flat-number flow value reads as "unknown", not "Other").
 * @param {Record<string,number>} [byCause] People per cause.
 * @returns {string} The dominant cause key, or "".
 */
export function topCause(byCause) {
  const m = byCause || {};
  let best = "";
  let bestN = 0;
  for (const c of Object.keys(m)) {
    const n = finite(m[c]);
    if (n <= 0) continue;
    if (best === "" || n > bestN || (n === bestN && causeOrder(c) < causeOrder(best))) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

/**
 * The SIGNED net-by-cause drivers behind a civ's net migration: each cause's arrivals (+) minus
 * departures (−), so the entries sum to the net. Sorted biggest-first (ties broken by CAUSE_ORDER),
 * capped to the top few. "" when there's no migration. Used by the Net Migration Table to explain
 * each civ's net.
 * @param {Record<string,number>} [outByCause] Emigration people per cause.
 * @param {Record<string,number>} [inByCause] Immigration people per cause.
 * @returns {string} e.g. "Unhappiness -30 thousand, War -15 thousand", or "".
 */
export function netDrivers(outByCause, inByCause) {
  const out = outByCause || {};
  const inn = inByCause || {};
  /** @type {{c:string, net:number}[]} */
  const rows = [];
  for (const c of new Set([...Object.keys(out), ...Object.keys(inn)])) {
    const net = finite(inn[c]) - finite(out[c]);
    if (Math.abs(net) >= 0.5) rows.push({ c, net });
  }
  rows.sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || causeOrder(a.c) - causeOrder(b.c));
  const shown = rows.slice(0, 4)
    .map((r) => `${causeLabel(r.c)} ${r.net > 0 ? "+" : "-"}${formatPeople(Math.abs(r.net))}`);
  if (rows.length > 4) shown.push(loc("LOC_EMIG_CAUSES_MORE", "+{1_N} more", rows.length - 4));
  return shown.join(", ");
}
