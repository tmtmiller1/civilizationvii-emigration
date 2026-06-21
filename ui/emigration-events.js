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
import { logNotification } from "/emigration/ui/emigration-notifications.js";
import { recordDisasterEvent } from "/emigration/ui/emigration-migration-stats.js";
import { dlog } from "/emigration/ui/emigration-log.js";

// How far from an event's epicenter to look for affected cities. A disaster (a volcanic eruption,
// a flood) damages a RING of tiles around its epicenter, and the epicenter itself — a volcano /
// floodplain tile — is frequently impassable terrain on a border that NO city owns. Mapping only the
// epicenter's owning city therefore misses the eruption entirely; scanning the surrounding ring
// attributes the distress to every nearby city that owns a tile in the blast radius.
const EVENT_RADIUS = 1;

/**
 * Resolve the owning city's disaster key for a single plot, or null.
 * @param {number} x Plot x.
 * @param {number} y Plot y.
 * @returns {string|null} The owning city's disaster key, or null.
 */
function cityKeyAt(x, y) {
  try {
    const cid = GameplayMap.getOwningCityFromXY?.(x, y);
    const city = cid && typeof Cities !== "undefined" ? Cities.get?.(cid) : null;
    return city ? disasterKey(city) : null;
  } catch (_) {
    return null;
  }
}

/**
 * The disaster-distress city keys for an event epicenter: every city owning a tile within
 * EVENT_RADIUS of the epicenter (deduped), not just the epicenter's own owner — so an eruption on an
 * unowned/border volcano tile still strikes the cities around it. Empty when none/unreadable.
 * @param {{x:number, y:number}} location The epicenter plot.
 * @returns {string[]} Affected city keys (unique).
 */
function affectedCityKeys(location) {
  /** @type {string[]} */
  const keys = [];
  try {
    if (!location || typeof GameplayMap === "undefined") return keys;
    const seen = new Set();
    const push = (/** @type {string|null} */ k) => {
      if (k && !seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    };
    push(cityKeyAt(location.x, location.y)); // epicenter first
    const idxs = GameplayMap.getPlotIndicesInRadius?.(location.x, location.y, EVENT_RADIUS);
    for (const idx of idxs || []) {
      const loc = GameplayMap.getLocationFromIndex?.(idx);
      if (loc) push(cityKeyAt(loc.x, loc.y));
    }
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
  if (!CONFIG.disastersEnabled || !data) {
    dlog("event: ignored (disastersEnabled=" + CONFIG.disastersEnabled + ", data=" + !!data + ")");
    return;
  }
  try {
    const info = GameInfo?.RandomEvents?.lookup?.(data.eventType);
    const sev = eventSeverity(data, info);
    const keys = affectedCityKeys(data.location);
    logEvent(data, info, sev, keys.length); // DIAGNOSTIC: grep `EMIG_event` in UI.log
    recordDisaster(info?.EventClass, sev, keys);
    // Record a refugees-chart MARKER whenever the disaster actually struck cities (so it drove
    // displacement), independent of the toast threshold — otherwise sub-`disasterNotifyMinSeverity`
    // disasters drive the sim but never annotate the chart, which is why none were appearing.
    if (keys.length > 0) recordDisasterEvent(disasterName(data.eventType), sev);
    // The TOAST stays gated on the (higher) notify severity, so only PARTICULARLY bad disasters pop a
    // notification + journal entry; minor ones mark the chart and drive the sim silently.
    if (sev >= CONFIG.disasterNotifyMinSeverity) {
      const alert = disasterName(data.eventType) + " strikes! " + actionHint("disaster");
      logNotification({ kind: "disaster", cause: "disaster", summary: alert, people: 0, points: 0 });
      announceImportant(alert, "disaster");
    }
  } catch (e) {
    dlog("event threw " + e);
  }
}

/**
 * Debug-only: log a random event the mod received — class, severity, epicenter, and how many cities
 * the blast-radius scan matched.
 * @param {*} data The event payload.
 * @param {*} info The GameInfo RandomEvents row.
 * @param {number} sev The event severity.
 * @param {number} nKeys The number of affected cities matched.
 */
function logEvent(data, info, sev, nKeys) {
  const loc = data.location ? (data.location.x + "," + data.location.y) : "none";
  dlog("event type=" + data.eventType + " class=" + (info && info.EventClass) + " sev=" + sev
    + " loc=" + loc + " affectedCities=" + nKeys);
}

/** Subscribe the disaster event hook. Safe to call once at boot. */
export function installEmigrationEvents() {
  try {
    if (typeof engine === "undefined" || typeof engine.on !== "function") {
      dlog("events: engine.on unavailable — disaster hook NOT installed");
      return;
    }
    engine.on("RandomEventOccurred", (/** @type {*} */ d) => onRandomEvent(d));
    dlog("events: RandomEventOccurred hooked");
  } catch (e) {
    dlog("events install threw " + e);
  }
}
