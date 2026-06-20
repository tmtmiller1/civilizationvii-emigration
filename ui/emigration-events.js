// emigration-events.js
//
// Event-driven hooks (§10): subscribe to the public, fog-independent disaster event and
// turn it into a distress spike + a named feedback toast. The simulation's per-turn poll
// (emigration-disasters / runPass) stays the source of truth; this just front-runs the
// player's feedback and seeds the event-driven distress. War declaration/peace are
// handled in emigration-main (they feed emigration-war).
//
// Defensive throughout: every engine read is guarded and a failure degrades to a no-op.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { recordDisaster, disasterKey } from "/emigration/ui/emigration-disasters.js";
import { disasterName, actionHint } from "/emigration/ui/emigration-naming.js";
import { announceImportant } from "/emigration/ui/emigration-feedback.js";
import { recordDisasterEvent } from "/emigration/ui/emigration-migration-stats.js";

/**
 * The disaster-distress city keys for an event epicenter: the owning city of the
 * epicenter plot (best-effort; empty when none/unreadable).
 * @param {{x:number, y:number}} location The epicenter plot.
 * @returns {string[]} Affected city keys.
 */
function affectedCityKeys(location) {
  /** @type {string[]} */
  const keys = [];
  try {
    if (!location || typeof GameplayMap === "undefined") return keys;
    const cid = GameplayMap.getOwningCityFromXY?.(location.x, location.y);
    const city = cid && typeof Cities !== "undefined" ? Cities.get?.(cid) : null;
    const k = city ? disasterKey(city) : null;
    if (k) keys.push(k);
  } catch (_) {
    /* ignore */
  }
  return keys;
}

/**
/**
 * The event's severity (from the payload, else the GameInfo row, else 0).
 * @param {*} data The event payload.
 * @param {*} info The GameInfo RandomEvents row.
 * @returns {number} Severity.
 */
function eventSeverity(data, info) {
  return typeof data.severity === "number" ? data.severity : info?.Severity || 0;
}

/**
 * Handle a RandomEventOccurred payload: add a severity-scaled distress spike to the
 * struck city and toast the disaster by its own name. The resulting refugee outflow is
 * applied by the normal per-turn pass (the distress lowers the city's prosperity).
 * @param {*} data The event payload (eventType, severity, location).
 */
function onRandomEvent(data) {
  if (!CONFIG.disastersEnabled || !data) return;
  try {
    const info = GameInfo?.RandomEvents?.lookup?.(data.eventType);
    const sev = eventSeverity(data, info);
    recordDisaster(info?.EventClass, sev, affectedCityKeys(data.location));
    // Only notify for particularly bad disasters; minor events still drive the sim
    // silently. announceImportant adds the cooldown + notify-mode gate. The same
    // "notable" bar gates the refugees-chart marker log, keeping it meaningful + bounded.
    if (sev >= CONFIG.disasterNotifyMinSeverity) {
      announceImportant(disasterName(data.eventType) + " strikes! " + actionHint("disaster"));
      recordDisasterEvent(disasterName(data.eventType), sev);
    }
  } catch (_) {
    /* ignore */
  }
}

/** Subscribe the disaster event hook. Safe to call once at boot. */
export function installEmigrationEvents() {
  try {
    if (typeof engine === "undefined" || typeof engine.on !== "function") return;
    engine.on("RandomEventOccurred", (/** @type {*} */ d) => onRandomEvent(d));
  } catch (_) {
    /* ignore */
  }
}
