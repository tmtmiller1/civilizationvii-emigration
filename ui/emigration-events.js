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
import { pillagedCount } from "/emigration/ui/emigration-violence-signals.js";
import { disasterName, actionHint, civAdjective } from "/emigration/ui/emigration-naming.js";
import { announceImportant } from "/emigration/ui/emigration-feedback.js";
import { logNotification } from "/emigration/ui/emigration-notifications.js";
import { recordDisasterEvent } from "/emigration/ui/emigration-migration-stats.js";
import { cityName } from "/emigration/ui/emigration-migration-records.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { dlog } from "/emigration/ui/emigration-log.js";

// How far from an event's epicenter to look for affected cities. A disaster (a volcanic eruption,
// a flood) damages a RING of tiles around its epicenter, and the epicenter itself, a volcano /
// floodplain tile, is frequently impassable terrain on a border that NO city owns. Mapping only the
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
 * EVENT_RADIUS of the epicenter (deduped), not just the epicenter's own owner, so an eruption on an
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
 * The owning city object for a plot, or null.
 * @param {number} x Plot x.
 * @param {number} y Plot y.
 * @returns {*} The owning city object, or null.
 */
function cityAt(x, y) {
  try {
    const cid = GameplayMap.getOwningCityFromXY?.(x, y);
    return cid && typeof Cities !== "undefined" ? Cities.get?.(cid) : null;
  } catch (_) {
    return null;
  }
}

/**
 * The first owned city a disaster struck: the epicenter's owning city, or the first owned city in
 * the blast radius when the epicenter tile itself is unowned (a volcano / floodplain on a border).
 * Null when nothing owned was hit.
 * @param {{x:number, y:number}} location The epicenter plot.
 * @returns {*} The struck city object, or null.
 */
function firstStruckCity(location) {
  let city = cityAt(location.x, location.y); // epicenter first
  if (city) return city;
  const idxs = GameplayMap.getPlotIndicesInRadius?.(location.x, location.y, EVENT_RADIUS) || [];
  for (const idx of idxs) {
    const loc = GameplayMap.getLocationFromIndex?.(idx);
    const c = loc ? cityAt(loc.x, loc.y) : null;
    if (c) return c;
  }
  return null;
}

/**
 * A spoiler-masked descriptor of the primary struck settlement: see {@link firstStruckCity}. Null
 * when no owned city was struck or the map is unreadable.
 * @param {{x:number, y:number}} location The epicenter plot.
 * @returns {{owner:number, civ:string, city:string|null, hidden:boolean}|null} The struck-city label.
 */
function primaryStruckCity(location) {
  try {
    if (!location || typeof GameplayMap === "undefined") return null;
    const city = firstStruckCity(location);
    if (!city || typeof city.owner !== "number") return null;
    const hidden = civHidden(city.owner);
    return {
      owner: city.owner,
      civ: hidden ? "an unmet civilization" : civAdjective(city.owner),
      city: hidden ? null : cityName(city),
      hidden
    };
  } catch (_) {
    return null;
  }
}

/**
/**
 * The largest `Percentage` across the rows of an effect table that match a RandomEvent type (and an
 * optional DamageType filter). 0 when the table is missing/empty.
 * @param {*} rows A GameInfo effect table (RandomEventYields / RandomEventDamages).
 * @param {string} type The RandomEventType to match.
 * @param {string|null} damageType Optional DamageType filter (null = any).
 * @returns {number} The worst matching percent.
 */
function worstEventPct(rows, type, damageType) {
  let pct = 0;
  for (const r of rows || []) {
    if (r.RandomEventType !== type) continue;
    if (damageType && r.DamageType !== damageType) continue;
    pct = Math.max(pct, Number(r.Percentage) || 0);
  }
  return pct;
}

/**
 * The worst single impact percentage a RandomEvent TYPE inflicts, the larger of its biggest yield cut
 * (food/production drive displacement) and its constructible-damage cut, from the base RandomEventYields
 * / RandomEventDamages tables. 0 when unavailable.
 *
 * WHY this, not the `Severity` column: Civ7's RandomEventOccurred payload carries `phase`, not a usable
 * severity, and the `Severity` column is a compressed/weak proxy, a "GENTLE" volcano is Severity 0 and a
 * "CATASTROPHIC" one is only Severity 1, so the engine's own scale barely separates them. The real
 * magnitude lives in the effect tables (gentle volcano = 25% food / 20% constructibles; catastrophic 35% / 40%).
 * @param {*} info The GameInfo.RandomEvents row (carries RandomEventType).
 * @returns {number} The worst impact percent (0..100).
 */
function eventImpactPct(info) {
  const type = info && (info.RandomEventType || info.Type);
  if (!type || typeof GameInfo === "undefined") return 0;
  try {
    return Math.max(
      worstEventPct(GameInfo.RandomEventYields, type, null),
      worstEventPct(GameInfo.RandomEventDamages, type, "CONSTRUCTIBLE_DAMAGED")
    );
  } catch (_) {
    return 0; // effect tables absent on some builds, fall back to the named tier
  }
}

/**
 * The event's magnitude on a 1..4 scale (the distress multiplier + notify gate). Derived from the
 * engine's named tier (`Severity`: gentle 0 < catastrophic 1 < … < thera 3) BUMPED a step for
 * catastrophic-class impact (eventImpactPct), and floored at 1 so a city-striking disaster always
 * carries real weight AND gentle < catastrophic (the old code read raw `Severity`, where the distress
 * formula collapsed 0 and 1 to the same multiplier, every volcano displaced identically).
 * @param {*} data The event payload.
 * @param {*} info The GameInfo RandomEvents row.
 * @returns {number} Magnitude (1..4).
 */
function eventSeverity(data, info) {
  const tier = typeof data.severity === "number" ? data.severity
    : (typeof info?.Severity === "number" ? info.Severity : 0);
  return Math.max(1, tier + (eventImpactPct(info) >= 35 ? 1 : 0));
}

/** Clamp to [0,1]. @param {number} x Value. @returns {number} Clamped. */
function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * The directly-observable pillage fraction at the struck settlement: pillaged plots ÷ its footprint.
 * 0 when no city, no pillage, or the build/scan doesn't expose it (graceful degradation — never
 * invented; `impactPct` alone then drives the impact factor).
 * @param {*} location The event location.
 * @returns {number} Pillage fraction in [0,1].
 */
function pillageFraction(location) {
  try {
    const city = firstStruckCity(location);
    if (!city) return 0;
    const plots = city.getPurchasedPlots?.();
    const footprint = Array.isArray(plots) ? plots.length : 0;
    if (!(footprint > 0)) return 0;
    return clamp01(pillagedCount(city) / footprint);
  } catch (_) {
    return 0;
  }
}

/**
 * The CONTINUOUS impact factor `m ∈ [0,1]` for a disaster — the larger of (a) the worst measured
 * yield-cut / constructible-damage fraction the effect tables report and (b) the observable tile
 * pillage. This is the magnitude the distress spike scales by (see `disasterSpike`), so a 0-impact
 * thunderstorm lands at ~0 while a catastrophic volcano lands high.
 * @param {*} info The GameInfo RandomEvents row.
 * @param {*} location The event location.
 * @returns {number} Impact factor in [0,1].
 */
function eventImpactFactor(info, location) {
  return clamp01(Math.max(eventImpactPct(info) / 100, pillageFraction(location)));
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
    const sev = eventSeverity(data, info); // 1..4, kept for the notify gate + chart marker
    const m = eventImpactFactor(info, data.location); // continuous 0..1, drives the distress spike
    const keys = affectedCityKeys(data.location);
    logEvent(data, info, sev, keys.length); // DIAGNOSTIC: grep `EMIG_event` in UI.log
    // m drives the impact-scaled spike; sev is passed only for the legacy fail-safe path.
    recordDisaster(info?.EventClass, m, keys, data.eventType, sev); // type → per-city cause attribution
    // Record a refugees-chart MARKER whenever the disaster actually struck cities (so it drove
    // displacement), independent of the toast threshold, otherwise sub-`disasterNotifyMinSeverity`
    // disasters drive the sim but never annotate the chart, which is why none were appearing.
    const struck = keys.length > 0;
    if (struck) recordDisasterEvent(disasterName(data.eventType), sev);
    maybeNotifyDisaster(data, sev, struck, struck ? primaryStruckCity(data.location) : null);
  } catch (e) {
    dlog("event threw " + e);
  }
}

/**
 * Log and (maybe) pop a disaster notification. The notifications LOG keeps every
 * severe disaster so the player can review them without a popup; the on-screen
 * POPUP is the invasive part, gated by the disasterNotifyMode user knob:
 *   0 = off       — log only, never pop a disaster toast
 *   1 = migration — pop ONLY when the disaster struck a city (so it will drive
 *                   displacement) AND is ≥ min severity  [default]
 *   2 = any       — pop for any disaster ≥ min severity (the old behavior)
 * disasterNotifyMinSeverity still tunes "how bad is bad enough" within each mode.
 * @param {*} data The event payload.
 * @param {number} sev The event severity.
 * @param {boolean} struck Whether the disaster struck any cities (drives migration).
 * @param {{owner:number, civ:string, city:string|null, hidden:boolean}|null} [where] The primary
 *   struck settlement (spoiler-masked), so the notification names WHO was hit. Null when unknown.
 */
function maybeNotifyDisaster(data, sev, struck, where) {
  if (sev < CONFIG.disasterNotifyMinSeverity) return; // below the severity floor
  const name = disasterName(data.eventType);
  const alert = disasterAlert(name, where);
  logNotification({
    kind: "disaster", cause: "disaster", event: name, summary: alert, people: 0, points: 0,
    fromCity: where && where.city ? where.city : undefined,
    fromCiv: where ? where.civ : undefined
  });
  if (shouldPopDisaster(CONFIG.disasterNotifyMode, struck)) announceImportant(alert, "disaster");
}

/**
 * The disaster alert line. Leads with WHO was hit ("<Disaster> strikes Athens (Greek)!", or the
 * unmet mask) when a struck settlement was resolved; otherwise the bare "<Disaster> strikes!" for an
 * event that hit no owned city. Always carries the disaster action hint.
 * @param {string} name The disaster's display name.
 * @param {{civ:string, city:string|null}|null} [where] The struck-settlement label, or null.
 * @returns {string} The alert line.
 */
function disasterAlert(name, where) {
  const place = where ? (where.city ? where.city + " (" + where.civ + ")" : where.civ) : null;
  const head = place ? name + " strikes " + place + "! " : name + " strikes! ";
  return head + actionHint("disaster");
}

/**
 * Whether to POP the on-screen disaster toast under the disasterNotifyMode knob (the LOG always
 * records it): 0 never, 1 only when it struck a city (drives migration), 2 always.
 * @param {number} mode The disasterNotifyMode knob.
 * @param {boolean} struck Whether the disaster struck any city.
 * @returns {boolean} True to pop the toast.
 */
function shouldPopDisaster(mode, struck) {
  if (mode === 2) return true;
  if (mode === 1) return struck;
  return false;
}

/**
 * Debug-only: log a random event the mod received, class, severity, epicenter, and how many cities
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
      dlog("events: engine.on unavailable, disaster hook NOT installed");
      return;
    }
    engine.on("RandomEventOccurred", (/** @type {*} */ d) => onRandomEvent(d));
    dlog("events: RandomEventOccurred hooked");
  } catch (e) {
    dlog("events install threw " + e);
  }
}
