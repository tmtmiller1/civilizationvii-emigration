// emigration-internal-tally.js
//
// The INTERNAL (within-one-civ) migration tallies behind the Net Migration Table's Internal / External
// split: how many people LEFT a civ's settlements for another of its own, and how many ARRIVED from
// one. The gross in/out tallies count every move, so External = gross - internal.

/** Schema stamp: 1 = the internal tallies exist (folded live, or backfilled once from the flows). */
export const INTERNAL_SCHEMA = 1;

/**
 * Add to a flat tally entry (treating missing as 0).
 * @param {Record<string, number>} map Tally map.
 * @param {number} id Owner id.
 * @param {number} delta Amount.
 */
function bump(map, id, delta) {
  map[id] = (map[id] || 0) + delta;
}

/**
 * Whether a migration record crosses a civ border. Prefers the record's own `crossCiv` flag (the
 * only reliable signal for a lagged depart/arrive half, which carries just one owner); falls back to
 * comparing owners when both are present (e.g. an instantaneous move or a synthetic test record).
 * @param {*} m Migration record.
 * @returns {boolean} True when the move is between two different civs.
 */
export function isCrossCiv(m) {
  if (m.crossCiv === true) return true;
  if (m.crossCiv === false) return false;
  return typeof m.srcOwner === "number" && typeof m.destOwner === "number" && m.srcOwner !== m.destOwner;
}

/**
 * Bank one NON-attrition migration's INTERNAL share and report whether it crossed a border (the
 * caller needs the same verdict for the net tally). An internal move credits "arrived" on its
 * destination half and "left" on its source half, exactly like the gross tallies.
 * @param {*} s Stats state (carries intOut/intIn + the parallel *Pts maps).
 * @param {*} m Migration record.
 * @returns {boolean} Whether the move crossed a civ border.
 */
export function foldInternal(s, m) {
  const cross = isCrossCiv(m);
  if (cross) return true;
  const p = typeof m.people === "number" && isFinite(m.people) ? m.people : 0;
  const pts = typeof m.points === "number" && isFinite(m.points) ? m.points : 0;
  if (typeof m.destOwner === "number") {
    bump(s.intIn, m.destOwner, p);
    bump(s.intInPts, m.destOwner, pts);
  }
  if (typeof m.srcOwner === "number") {
    bump(s.intOut, m.srcOwner, p);
    bump(s.intOutPts, m.srcOwner, pts);
  }
  return false;
}

/**
 * The internal-tally fields of a parsed state blob, filled in (a pre-split save has none; its
 * `intSchema` reads 0 and backfillInternal seeds the maps once on load).
 * @param {*} o Parsed object.
 * @returns {*} {intOut, intIn, intOutPts, intInPts, intSchema}.
 */
export function normalizeInternal(o) {
  const mapOr = (/** @type {*} */ v) => (v && typeof v === "object" ? v : {});
  return {
    intOut: mapOr(o.intOut),
    intIn: mapOr(o.intIn),
    intOutPts: mapOr(o.intOutPts),
    intInPts: mapOr(o.intInPts),
    intSchema: typeof o.intSchema === "number" ? o.intSchema : 0
  };
}

/**
 * Sum a stored flow value (a per-cause map, or the older flat number).
 * @param {*} v Stored value.
 * @returns {number} Total.
 */
function flowTotal(v) {
  if (typeof v === "number") return v;
  let total = 0;
  if (v && typeof v === "object") for (const k of Object.keys(v)) total += v[k] || 0;
  return total;
}

/**
 * The intra-civ (src === dest) totals per owner from a flow matrix.
 * @param {Record<string, *>} flows Flow matrix keyed "srcCiv>destCiv>...".
 * @returns {Record<string, number>} Internal total per owner id.
 */
function intraTotals(flows) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const key of Object.keys(flows || {})) {
    const parts = key.split(">");
    if (parts.length < 2 || parts[0] !== parts[1]) continue;
    out[parts[0]] = (out[parts[0]] || 0) + flowTotal(flows[key]);
  }
  return out;
}

/**
 * Seed one internal tally from the intra-civ flow totals, never above the gross tally it is part of.
 * @param {Record<string, number>} intra Internal total per owner.
 * @param {Record<string, number>} gross The gross tally (in or out).
 * @returns {Record<string, number>} The seeded internal tally.
 */
function seed(intra, gross) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of Object.keys(intra)) {
    const v = Math.min(intra[k], gross[k] || 0);
    if (v > 0) out[k] = v;
  }
  return out;
}

/**
 * One-time backfill for a save without internal tallies, recovering the internal share from the flow
 * matrix's intra-civ edges. Approximate: in-transit migrants are seeded as arrived, and edges evicted
 * by the flow cap are lost. Idempotent; stamps the schema so it never runs twice.
 * @param {*} s Stats state (mutated).
 */
export function backfillInternal(s) {
  if (s.intSchema === INTERNAL_SCHEMA) return;
  const people = intraTotals(s.flows);
  const points = intraTotals(s.flowsPts);
  s.intOut = seed(people, s.out);
  s.intIn = seed(people, s.in);
  s.intOutPts = seed(points, s.outPts);
  s.intInPts = seed(points, s.inPts);
  s.intSchema = INTERNAL_SCHEMA;
}
