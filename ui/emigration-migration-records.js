// emigration-migration-records.js
//
// DOM-free builders for the Migration records the engine emits: the shared city-name
// helper plus the move / depart / arrive record shapes. Split out of emigration-engine.js
// so the record vocabulary lives in one focused, testable place. No side effects - these
// only construct the plain objects that notifications and metrics fold over.

/** @typedef {import("/emigration/ui/emigration-causes.js").MigrationCause} MigrationCause */
/** @typedef {import("/emigration/ui/emigration-state.js").Transit} Transit */

/**
 * One applied migration (for notification / logging).
 * @typedef {Object} Migration
 * @property {string} srcName Source city name.
 * @property {string} destName Destination city name.
 * @property {number} [srcOwner] Source owner id (absent on a pure arrival record).
 * @property {number} [destOwner] Destination owner id (absent for attrition / a pure departure).
 * @property {number} [edgeDestOwner] Destination owner for the flow-network EDGE only (carried on a lagged
 *   departure record so the cross-civ edge can be built at depart; NOT the tally-driving destOwner).
 * @property {boolean} crossCiv Whether it crossed civilizations.
 * @property {number} points Raw Civ population points moved (1 per migration).
 * @property {number} people Historically-scaled people who moved.
 * @property {MigrationCause} cause Why this move happened.
 * @property {string} [eventKey] The SPECIFIC event behind the cause — a particular war / disaster /
 *   age crisis (see emigration-event-attribution), or "" for no named event. Carried on the records
 *   that drive the out tally (move/depart) and on crisis-death records.
 * @property {number} [destPaidCost] Assimilation load the destination civ took on for this arrival
 *   (the "did the destination pay a cost?" signal). Present on move/arrive records, not departures.
 * @property {"move"|"depart"|"arrive"} [phase] Transit phase: an instantaneous move, the
 *   departure half of a lagged move (out-tally now), or the arrival half (in-tally later).
 *   Only `arrive` records are suppressed from notifications; metrics fold all three.
 */

/**
 * Compose a city's display name defensively.
 * @param {*} city City object.
 * @returns {string} Name.
 */
export function cityName(city) {
  try {
    const n = city?.name;
    if (typeof n === "string" && n.length) {
      return typeof Locale !== "undefined" && Locale.compose ? Locale.compose(n) : n;
    }
  } catch (_) {
    /* ignore */
  }
  return "a settlement";
}

/**
 * Build the record for an instantaneous move (transit lag off / 0): both the source loss and the
 * destination gain land this turn, so it carries both owners.
 * @param {*} src Source signal.
 * @param {*} dest Destination signal.
 * @param {number} people Historically-scaled people who moved.
 * @param {MigrationCause} cause Why this move happened.
 * @param {{destPaidCost:number, eventKey?:string}} meta Assimilation load the destination took on,
 *   plus the specific event behind the cause (war/disaster/crisis), or "".
 * @returns {Migration} The record.
 */
export function moveRecord(src, dest, people, cause, meta) {
  return {
    srcName: cityName(src.city),
    destName: cityName(dest.city),
    srcOwner: src.owner,
    destOwner: dest.owner,
    crossCiv: src.owner !== dest.owner,
    points: 1,
    people,
    cause,
    eventKey: (meta && meta.eventKey) || "",
    destPaidCost: meta && meta.destPaidCost,
    phase: "move"
  };
}

/**
 * Build the DEPARTURE half of a lagged move: the source loss + emigration tally land now, so it
 * carries `srcOwner` but NOT `destOwner` (the arrival credits the destination later). Keeps
 * `destName` for the notification ("left X for Y"), and `edgeDestOwner` (the destination civ) purely
 * so the migration-network flow edge can be recorded at depart — it must NOT be the tally-driving
 * `destOwner` field, or the immigration tally would double-count (credited again on arrival).
 * @param {*} src Source signal.
 * @param {*} dest Destination signal.
 * @param {number} people Historically-scaled people who left.
 * @param {MigrationCause} cause Why they left.
 * @param {string} [eventKey] The specific event behind the cause (war/disaster/crisis), or "".
 * @returns {Migration} The record.
 */
export function departRecord(src, dest, people, cause, eventKey) {
  return {
    srcName: cityName(src.city),
    destName: cityName(dest.city),
    srcOwner: src.owner,
    edgeDestOwner: dest.owner,
    crossCiv: src.owner !== dest.owner,
    points: 1,
    people,
    cause,
    eventKey: eventKey || "",
    phase: "depart"
  };
}

/**
 * Build the ARRIVAL half of a lagged move. On success it carries `destOwner` only (the immigration
 * tally lands now); if the destination vanished en route it becomes a death charged to the source
 * (`srcOwner` + `attrition`).
 * @param {Transit} e The completed transit entry.
 * @param {boolean} ok Whether the destination still existed to receive them.
 * @param {number} [destPaidCost] Assimilation load the destination took on (when `ok`).
 * @returns {Migration} The record.
 */
export function arriveRecord(e, ok, destPaidCost) {
  if (ok) {
    return {
      srcName: e.srcName,
      destName: e.destName,
      destOwner: e.destOwner,
      crossCiv: e.crossCiv,
      points: 1,
      people: e.people,
      cause: /** @type {MigrationCause} */ (e.cause),
      destPaidCost,
      phase: "arrive"
    };
  }
  return {
    srcName: e.srcName,
    destName: e.destName,
    srcOwner: e.srcOwner,
    crossCiv: false,
    points: 1,
    people: e.people,
    cause: "attrition",
    phase: "arrive"
  };
}
