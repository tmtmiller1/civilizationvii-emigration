// emigration-event-attribution.js
//
// SPECIFIC-EVENT attribution for migration/death causes. The engine records a generic CAUSE
// ("war"/"disaster"/"unhappiness"/...); this layer resolves, at the moment of the move/death, an
// `eventKey` naming the SPECIFIC event behind it, a particular war, a particular disaster, or the
// active age CRISIS, so the Causes tab can break each cause down by the real event that drove it.
//
// Keys are compact and STABLE (no display text, names are resolved at view time from the key, see
// emigration-naming.eventDisplayName):
//   • "war:<lo>:<hi>"          a war between the two civ ids (sorted)
//   • "disaster:<RANDOM_EVENT_TYPE>"  the disaster type that struck the city
//   • "crisis:<AGE_CRISIS_TYPE>"      the active age crisis (takes precedence when it matches)
//   • "famine"                 a starvation death (no engine event to name)
//   • ""                       no specific event (ordinary unhappiness/prosperity)
//
// CRISIS precedence: when the age crisis is active and its CATEGORY matches the move's mechanism
// (an Invasion crisis ⇒ war, a Plague crisis ⇒ disaster, a Loyalty/Revolt crisis ⇒ unhappiness), the
// crisis is the named event, so its toll is attributed to the crisis rather than the bare mechanism.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { warAggressors } from "/emigration/ui/emigration-war.js";
import { disasterKey, disasterTypeFor } from "/emigration/ui/emigration-disasters.js";

/** @type {{type:string, category:string|null}|null} The age crisis active this pass, or null. */
let _crisis = null;

/**
 * The active age-crisis event type, probed from GameConfiguration (the key the base game stamps),
 * or null. Matches `*_CRISIS_*` so a stray config value can't masquerade as a crisis.
 * @returns {string|null} The crisis type (e.g. "ANTIQUITY_CRISIS_PLAGUE"), or null.
 */
function crisisType() {
  try {
    const g = Configuration?.getGame?.();
    if (!g || typeof g.getValue !== "function") return null;
    for (const k of ["AgeCrisisEventType", "CrisisEventType", "AgeCrisisEvent", "CrisisType", "Crisis"]) {
      const v = g.getValue(k);
      if (typeof v === "string" && /_CRISIS_/.test(v)) return v;
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * The migration mechanism an age crisis manifests through, from its type string: Invasion ⇒ war,
 * Plague ⇒ disaster, Loyalty/Revolt/Revolution/Religion ⇒ unhappiness. Null when it maps to none.
 * @param {string} type Crisis type.
 * @returns {string|null} "war" | "disaster" | "unhappiness" | null.
 */
export function crisisCategory(type) {
  const t = type || "";
  if (t.indexOf("INVASION") >= 0 || t.indexOf("WAR") >= 0) return "war";
  if (t.indexOf("PLAGUE") >= 0) return "disaster";
  if (t.indexOf("LOYALTY") >= 0 || t.indexOf("REVOLT") >= 0
    || t.indexOf("REVOLUTION") >= 0 || t.indexOf("RELIGION") >= 0) return "unhappiness";
  return null;
}

/**
 * Refresh the active-crisis cache for this pass: reads CrisisManager's stage (≥ 0 = active) and the
 * crisis type. Call once per pass before resolving event keys. Never throws.
 */
export function pollCrisis() {
  _crisis = null;
  try {
    const cm = typeof Game !== "undefined" ? Game.CrisisManager : null;
    if (!cm || typeof cm.getCurrentCrisisStage !== "function") return;
    if (typeof cm.isCrisisEnabled === "function" && !cm.isCrisisEnabled(0)) return;
    const stage = cm.getCurrentCrisisStage(0);
    if (typeof stage !== "number" || stage < 0) return; // -1 = pre-crisis
    const type = crisisType();
    if (type) _crisis = { type, category: crisisCategory(type) };
  } catch (_) {
    _crisis = null;
  }
}

/** @returns {{type:string, category:string|null}|null} The cached active crisis (read-only). */
export function activeCrisis() {
  return _crisis;
}

/**
 * The crisis event key when the active crisis matches `cause`, else null.
 * @param {string} cause The mechanism cause.
 * @returns {string|null} "crisis:<type>" or null.
 */
function crisisKeyFor(cause) {
  return _crisis && _crisis.category === cause ? "crisis:" + _crisis.type : null;
}

/**
 * The war event key for a besieged civ: the war between it and its lowest-id aggressor, ids sorted
 * so both sides resolve the same key. "" when no aggressor is recorded.
 * @param {number} victim Besieged civ id.
 * @returns {string} "war:<lo>:<hi>" or "".
 */
function warKeyFor(victim) {
  let primary = null;
  for (const a of warAggressors(victim)) {
    if (primary == null || a < primary) primary = a;
  }
  if (primary == null || typeof victim !== "number") return "";
  return "war:" + Math.min(victim, primary) + ":" + Math.max(victim, primary);
}

/**
 * The disaster event key for a struck city: the type of the most recent disaster to hit it.
 * @param {*} src Source signal (carries `.city`).
 * @returns {string} "disaster:<type>" or "".
 */
function disasterKeyFor(src) {
  const key = disasterKey(src && src.city);
  const type = key ? disasterTypeFor(key) : null;
  return type ? "disaster:" + type : "";
}

/**
 * The specific-event key for a MIGRATION of the given cause: the active crisis (if it matches), else
 * the specific war / disaster, else "" (ordinary unhappiness/prosperity have no named event).
 * @param {*} src Source signal.
 * @param {string} cause The migration cause.
 * @returns {string} The event key, or "".
 */
export function eventKeyForMove(src, cause) {
  const ck = crisisKeyFor(cause);
  if (ck) return ck;
  if (cause === "war") return warKeyFor(src.owner);
  if (cause === "disaster") return disasterKeyFor(src);
  return "";
}

/**
 * The lethal-distress category for a death (which crisis is killing these people).
 * @param {*} src Source signal.
 * @returns {string} "disaster" | "war" | "famine" | "unhappiness".
 */
function deathDistressCause(src) {
  if ((src.disaster || 0) >= CONFIG.disasterFleeThreshold) return "disaster";
  if ((src.violence || 0) >= CONFIG.violenceFleeThreshold) return "war";
  if (src.starving) return "famine";
  return "unhappiness";
}

/**
 * The specific-event key for a crisis DEATH: the active crisis (if it matches the lethal distress),
 * else the specific war / disaster, else "famine" for starvation, else "".
 * @param {*} src Source signal.
 * @returns {string} The event key, or "".
 */
export function eventKeyForDeath(src) {
  const dc = deathDistressCause(src);
  if (dc !== "famine") {
    const ck = crisisKeyFor(dc);
    if (ck) return ck;
  }
  if (dc === "war") return warKeyFor(src.owner);
  if (dc === "disaster") return disasterKeyFor(src);
  if (dc === "famine") return "famine";
  return "";
}

/**
 * The generic CAUSE an event key groups under, for the Causes-tab drill-down. Crisis keys group
 * under the mechanism the crisis manifests through; famine groups under disaster (subsistence).
 * @param {string} eventKey The event key.
 * @returns {string} The parent cause, or "".
 */
export function eventGroupCause(eventKey) {
  if (!eventKey) return "";
  if (eventKey.indexOf("war:") === 0) return "war";
  if (eventKey.indexOf("disaster:") === 0 || eventKey === "famine") return "disaster";
  if (eventKey.indexOf("crisis:") === 0) return crisisCategory(eventKey.slice(7)) || "war";
  return "";
}

// Test hook: force the active-crisis cache (the engine paths above never call this).
export const __test = {
  setCrisis: (/** @type {{type:string, category:string|null}|null} */ c) => {
    _crisis = c;
  }
};
