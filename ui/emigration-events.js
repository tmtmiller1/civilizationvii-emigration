// emigration-events.js
//
// Event-driven hooks: subscribe to the public, fog-independent disaster event and
// turn it into a distress spike + a named feedback toast. The simulation's per-turn poll
// (emigration-disasters / runPass) stays the source of truth; this just front-runs the
// player's feedback and seeds the event-driven distress. War declaration/peace are
// handled in emigration-main (they feed emigration-war).
//
// Defensive throughout: every engine read is guarded and a failure degrades to a no-op.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { recordDisaster, disasterSpike, disasterKey } from "/emigration/ui/emigration-disasters.js";
import { freshPillage } from "/emigration/ui/emigration-violence-signals.js";
import { disasterName, disasterNameMsg, civAdjectiveMsg, unmetMsg } from "/emigration/ui/emigration-naming.js";
import { causeHintMsg } from "/emigration/ui/emigration-causes.js";
import { announceImportant } from "/emigration/ui/emigration-feedback.js";
import { logNotification } from "/emigration/ui/emigration-notifications.js";
import { recordDisasterEvent } from "/emigration/ui/emigration-migration-stats.js";
import { cityName } from "/emigration/ui/emigration-migration-records.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { msg, msgJoin, msgText } from "/emigration/ui/emigration-loc.js";

// How far from an event's epicenter to look for affected cities: the epicenter (a volcano / floodplain
// tile) is often unowned, so scanning the ring attributes the distress to every city in the blast radius.
const EVENT_RADIUS = 1;

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
 * Whether an event class is a flood: CLASS_FLOOD, or a class a mod splits off from it (a whole-word FLOOD,
 * e.g. CLASS_DAMS_FLOOD_MAJOR).
 * @param {string|undefined} eventClass The event's CLASS_* string.
 * @returns {boolean} True for a flood.
 */
function isFloodClass(eventClass) {
  return String(eventClass || "").split("_").includes("FLOOD");
}

/**
 * Every plot of the river the epicenter lies on, or [] when it is on no river. A flood covers its river's
 * floodplain, which can reach settlements several tiles from the epicenter the event names.
 * @param {{x:number, y:number}} location The epicenter plot.
 * @returns {number[]} Plot indices.
 */
function riverPlotsAt(location) {
  const at = GameplayMap.getIndexFromXY?.(location.x, location.y);
  const n = typeof MapRivers !== "undefined" ? Number(MapRivers.numRivers) || 0 : 0;
  for (let i = 0; i < n; i++) {
    const raw = MapRivers.getRiverPlots?.(MapRivers.getRiverIDByIndex?.(i)) || [];
    const plots = raw.map((/** @type {*} */ p) => (typeof p === "number" ? p : GameplayMap.getIndexFromXY?.(p.x, p.y)));
    if (plots.includes(at)) return plots;
  }
  return [];
}

/**
 * The plots whose owning cities an event may have struck: the epicenter, the ring of EVENT_RADIUS around it
 * and, for a flood, the whole river it lies on.
 * @param {{x:number, y:number}} location The epicenter plot.
 * @param {string|undefined} eventClass The event's CLASS_* string.
 * @returns {number[]} Plot indices, epicenter first.
 */
function struckPlots(location, eventClass) {
  const plots = [GameplayMap.getIndexFromXY?.(location.x, location.y)];
  plots.push(...(GameplayMap.getPlotIndicesInRadius?.(location.x, location.y, EVENT_RADIUS) || []));
  if (isFloodClass(eventClass)) plots.push(...riverPlotsAt(location));
  return plots;
}

/**
 * The cities an event struck: every city owning one of its struckPlots (deduped by disaster key), so an
 * eruption on an unowned/border volcano tile still strikes the cities around it and a flood strikes the
 * settlements along its river. Empty when none/unreadable.
 * @param {{x:number, y:number}} location The epicenter plot.
 * @param {string|undefined} eventClass The event's CLASS_* string.
 * @returns {{key:string, city:*}[]} Struck cities with their disaster keys, epicenter first.
 */
function affectedCities(location, eventClass) {
  /** @type {{key:string, city:*}[]} */
  const out = [];
  try {
    if (!location || typeof GameplayMap === "undefined") return out;
    const seen = new Set();
    for (const idx of struckPlots(location, eventClass)) {
      const loc = GameplayMap.getLocationFromIndex?.(idx);
      const city = loc ? cityAt(loc.x, loc.y) : null;
      const k = city ? disasterKey(city) : null;
      if (k && !seen.has(k)) {
        seen.add(k);
        out.push({ key: k, city });
      }
    }
  } catch (_) {
    /* ignore */
  }
  return out;
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
 * @returns {{owner:number, civ:*, city:string|null, hidden:boolean}|null} The struck-city label (civ a
 *   message node).
 */
function primaryStruckCity(location) {
  try {
    if (!location || typeof GameplayMap === "undefined") return null;
    const city = firstStruckCity(location);
    if (!city || typeof city.owner !== "number") return null;
    const hidden = civHidden(city.owner);
    return {
      owner: city.owner,
      civ: hidden ? unmetMsg() : civAdjectiveMsg(city.owner),
      city: hidden ? null : cityName(city),
      hidden
    };
  } catch (_) {
    return null;
  }
}

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
 * and its constructible-damage cut, from the base RandomEventYields / RandomEventDamages tables. Used
 * instead of the `Severity` column, which barely separates a gentle volcano (0) from a catastrophic one (1).
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
 * The event's magnitude on a 1..4 scale (the distress multiplier + notify gate): the engine's named
 * tier (`Severity`: gentle 0 < catastrophic 1 < … < thera 3) bumped a step for catastrophic-class
 * impact (eventImpactPct), floored at 1 so a city-striking disaster always carries real weight.
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
 * The impact factor `m ∈ [0,1]` a disaster lands on ONE struck city, from the damage it did there: the
 * larger of the event type's worst effect-table percentage and the share of the city's plots it newly
 * pillaged, floored for a confirmed strike. 0 when the event pillaged nothing in the city (with
 * `disasterRequireDamage` on): a settlement the engine shields from this class of event (a Dam or Levee
 * against floods, the Khmer Baray) or one the event simply spared sends out no refugees.
 * @param {number} typePct The event type's worst impact percent (eventImpactPct).
 * @param {{fresh:number, footprint:number}} damage The city's freshPillage reading.
 * @returns {number} Impact factor in [0,1].
 */
function cityImpactFactor(typePct, damage) {
  if (CONFIG.disasterRequireDamage && !(damage.fresh > 0)) return 0;
  const share = damage.footprint > 0 ? damage.fresh / damage.footprint : 0;
  return strikeFloored(clamp01(Math.max(typePct / 100, share)), true);
}

/**
 * Floor the impact factor for a CONFIRMED city strike the mod couldn't MEASURE, so a disaster the engine
 * says hit a city always lands SOME distress. The floor scales by disaster type downstream (shape() ×
 * CLASS_WEIGHT); un-struck events and bigger measured impacts pass through untouched.
 * @param {number} measured The measured impact factor in [0,1].
 * @param {boolean} struck Whether the engine confirmed the blast hit at least one city.
 * @returns {number} The impact factor to drive the spike with.
 */
function strikeFloored(measured, struck) {
  return struck ? Math.max(measured, CONFIG.disasterStrikeFloor) : measured;
}

/**
 * Land each struck city's distress spike, sized by the damage the event did there (cityImpactFactor).
 * @param {{key:string, city:*}[]} cities The struck cities.
 * @param {*} info The GameInfo RandomEvents row.
 * @param {string} eventClass The event's CLASS_* string.
 * @param {string} eventType The RandomEventType, stamped per city for cause attribution.
 * @param {number} sev The event severity (the legacy fail-safe path only).
 * @returns {number} How many cities took a spike.
 */
function spikeStruckCities(cities, info, eventClass, eventType, sev) {
  const typePct = eventImpactPct(info);
  let damaged = 0;
  for (const { key, city } of cities) {
    const damage = freshPillage(city);
    const m = cityImpactFactor(typePct, damage);
    const w = m > 0 ? disasterSpike(eventClass, m, sev) : 0;
    dlog("event city=" + key + " pillaged=" + damage.fresh + "/" + damage.footprint + " m=" + m.toFixed(2)
      + " spike=" + w.toFixed(1)); // DIAGNOSTIC: grep `EMIG_event city=` in UI.log
    if (!(m > 0)) continue;
    damaged++;
    // m drives the impact-scaled spike; sev is passed only for the legacy fail-safe path.
    recordDisaster(eventClass, m, [key], eventType, sev); // type → per-city cause attribution
  }
  return damaged;
}

/**
 * Handle a RandomEventOccurred payload: add a distress spike to each struck city sized by the damage
 * the event did there (see cityImpactFactor), and toast the disaster by its own name. The resulting refugee outflow is
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
    const eventClass = info?.EventClass;
    const sev = eventSeverity(data, info); // 1..4, kept for the notify gate + chart marker
    const cities = affectedCities(data.location, eventClass);
    const damaged = spikeStruckCities(cities, info, eventClass, data.eventType, sev);
    logEvent(data, info, sev, cities.length, damaged); // DIAGNOSTIC: grep `EMIG_event` in UI.log
    // Record a refugees-chart MARKER whenever the disaster damaged a city, independent of the toast
    // threshold, so sub-`disasterNotifyMinSeverity` disasters still annotate the chart.
    if (damaged > 0) recordDisasterOnset(data.eventType, info, sev);
    // The toast still reports a disaster that struck a shielded or spared city: it happened, it just did no harm.
    const struck = cities.length > 0;
    maybeNotifyDisaster(data, sev, struck, struck ? primaryStruckCity(data.location) : null);
  } catch (e) {
    dlog("event threw " + e);
  }
}

/**
 * Record a refugees-chart / timeline marker for a disaster that damaged a city: its display name now,
 * and its game LOC key so the timeline pin can name it in whatever language is active later.
 * @param {*} eventType The RandomEventType. @param {*} info The GameInfo RandomEvents row (may be null).
 * @param {number} sev The event severity.
 */
function recordDisasterOnset(eventType, info, sev) {
  recordDisasterEvent(disasterName(eventType), sev, info ? info.Name : undefined);
}

/**
 * Log and (maybe) pop a disaster notification. The notifications LOG keeps every severe disaster; the
 * on-screen POPUP is gated by the disasterNotifyMode knob (0 = log only, 1 = only when the disaster
 * struck a city, 2 = any), with disasterNotifyMinSeverity as the severity floor in each mode.
 * @param {*} data The event payload.
 * @param {number} sev The event severity.
 * @param {boolean} struck Whether the disaster struck any cities (drives migration).
 * @param {{owner:number, civ:string, city:string|null, hidden:boolean}|null} [where] The primary
 *   struck settlement (spoiler-masked), so the notification names WHO was hit. Null when unknown.
 */
function maybeNotifyDisaster(data, sev, struck, where) {
  if (sev < CONFIG.disasterNotifyMinSeverity) return; // below the severity floor
  const name = disasterNameMsg(data.eventType);
  const alert = disasterAlert(name, where);
  logNotification({
    kind: "disaster", cause: "disaster", event: name, summary: alert, people: 0, points: 0,
    fromCity: where && where.city ? where.city : undefined,
    fromCiv: where ? where.civ : undefined
  });
  if (shouldPopDisaster(CONFIG.disasterNotifyMode, struck)) announceImportant(msgText(alert), "disaster");
}

/**
 * The disaster alert line. Leads with WHO was hit ("<Disaster> strikes Athens (Greek)!", or the
 * unmet mask) when a struck settlement was resolved; otherwise the bare "<Disaster> strikes!" for an
 * event that hit no owned city. Always carries the disaster action hint.
 * @param {*} name The disaster's display name (a message node).
 * @param {{civ:*, city:string|null}|null} [where] The struck-settlement label, or null.
 * @returns {*} The alert line (a message node).
 */
function disasterAlert(name, where) {
  const place = where ? (where.city ? msgJoin(where.city, " (", where.civ, ")") : where.civ) : null;
  const head = place
    ? msg("LOC_EMIG_DISASTER_STRIKES_AT", "{1_Name} strikes {2_Place}!", name, place)
    : msg("LOC_EMIG_DISASTER_STRIKES", "{1_Name} strikes!", name);
  // The separator lives in the CODE: the game's text loader strips a localized string's edge spaces,
  // so a trailing space in the row never survives to separate this from the hint.
  return msgJoin(head, " ", causeHintMsg("disaster"));
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
 * Debug-only: log a random event the mod received, class, severity, epicenter, how many cities the
 * blast-radius scan matched and how many of those it damaged.
 * @param {*} data The event payload.
 * @param {*} info The GameInfo RandomEvents row.
 * @param {number} sev The event severity.
 * @param {number} nStruck The number of affected cities matched.
 * @param {number} nDamaged The number of those cities that took a distress spike.
 */
function logEvent(data, info, sev, nStruck, nDamaged) {
  const loc = data.location ? (data.location.x + "," + data.location.y) : "none";
  dlog("event type=" + data.eventType + " class=" + (info && info.EventClass) + " sev=" + sev
    + " loc=" + loc + " affectedCities=" + nStruck + " damagedCities=" + nDamaged);
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
