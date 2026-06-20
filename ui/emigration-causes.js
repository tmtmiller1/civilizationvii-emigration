// emigration-causes.js
//
// The SINGLE SOURCE OF TRUTH for migration CAUSES , the taxonomy shared by the engine (which emits
// them), the per-civ tallies + Demographics attribution (which key on them), the naming/feedback
// layer (which flavours them), and the city readout (which explains them).
//
// Before this module the taxonomy was duplicated and inconsistent: the `MigrationCause` typedef
// lived in two files, `migrationCause()` could only ever emit three of the five declared values,
// and `prosperity`/`conquest` were CONSUMED (Demographics labels, naming headlines) but never
// PRODUCED. Centralizing here keeps the type, the producer, and every consumer in agreement.
//
// The string VALUES are PERSISTED routing keys (the per-cause maps in EmigrationMigStats_v1), so
// the set is ADDITIVE-ONLY: never rename a value without a load-time alias, or existing saves lose
// their per-cause history.

import { formatPeople } from "/emigration/ui/emigration-population.js";

/**
 * Why population left a settlement. `attrition` is the outlet (a death , population lost with no
 * destination), tracked apart from the migration/refugee tallies. `conquest` is reserved: a later
 * phase emits it on capture-driven displacement (it is consumed by the naming layer today but not
 * yet produced).
 * @typedef {"unhappiness"|"prosperity"|"war"|"disaster"|"conquest"|"attrition"} MigrationCause
 */

/**
 * A cause usable in a refugee HEADLINE. Adds `crisis` , a world-news milestone pseudo-cause that is
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

/** @type {Record<string,string>} Short English labels (Demographics renders metric labels raw). */
const LABELS = {
  unhappiness: "Unhappiness",
  prosperity: "Attraction",
  war: "War",
  disaster: "Disaster",
  conquest: "Conquest",
  attrition: "Attrition",
  crisis: "Crisis",
  other: "Other"
};

/** @type {Record<string,Permanence>} */
const PERMANENCE = {
  unhappiness: "persistent",
  prosperity: "persistent",
  war: "temporary",
  disaster: "temporary",
  conquest: "temporary",
  attrition: "permanent"
};

/** @type {Record<string,string>} One-line player action hint per cause (Phase 1 localizes them). */
const HINTS = {
  unhappiness: "Raise this city's happiness, or slot an Anti-Immigration Stance to retain them.",
  prosperity: "A neighbor is out-prospering this city; grow its yields to keep people home.",
  war: "Refugees flee the fighting; relieve the siege or make peace to stem the outflow.",
  disaster: "Disaster displacement , it subsides on its own as the distress decays.",
  conquest: "Displaced by the city's capture; the upheaval eases as the city settles.",
  attrition: "Trapped with nowhere to go , open a route out or relieve the distress."
};

/**
 * Whether a cause is forced displacement (counts toward the refugees tally + refugee headline, and
 * takes the minimum "camp" transit lag).
 * @param {string} [cause] The cause.
 * @returns {boolean} True for war/disaster/conquest.
 */
export function isRefugeeCause(cause) {
  return !!cause && REFUGEE_CAUSES.has(cause);
}

/**
 * The short display label for a cause (English; Demographics renders metric labels raw).
 * @param {string} [cause] The cause.
 * @returns {string} The label.
 */
export function causeLabel(cause) {
  return (cause && LABELS[cause]) || LABELS.other;
}

/**
 * How durable a loss from this cause is (the "temporary / persistent / permanent" cue).
 * @param {string} [cause] The cause.
 * @returns {Permanence} The permanence class.
 */
export function causePermanence(cause) {
  return (cause && PERMANENCE[cause]) || "persistent";
}

/**
 * A one-line, player-facing "what can I do" hint for a cause, or "" if none.
 * @param {string} [cause] The cause.
 * @returns {string} The hint.
 */
export function causeHint(cause) {
  return (cause && HINTS[cause]) || "";
}

/**
 * The SIGNED net-by-cause drivers behind a civ's net migration: each cause's arrivals (+) minus
 * departures (−), so the entries sum to the net. Sorted biggest-first, capped to the top few. "" when
 * there's no migration. Used by the Net Migration Table to explain each civ's net.
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
    const net = (inn[c] || 0) - (out[c] || 0);
    if (Math.abs(net) >= 0.5) rows.push({ c, net });
  }
  rows.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  const shown = rows.slice(0, 4)
    .map((r) => `${causeLabel(r.c)} ${r.net > 0 ? "+" : "-"}${formatPeople(Math.abs(r.net))}`);
  if (rows.length > 4) shown.push(`+${rows.length - 4} more`);
  return shown.join(", ");
}
