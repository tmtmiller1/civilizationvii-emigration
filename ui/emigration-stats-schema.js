// emigration-stats-schema.js
//
// The PERSISTED SHAPE of the migration tallies: coercing a parsed save blob into the canonical state
// (normalize), stamping a brand-new one (freshState), and the once-on-load migrations that bring an
// older blob up to the current schema (migrateState). Split out of emigration-migration-stats.js,
// which was at its line budget; that file owns the tallying and the reads, this one owns the shape.
//
// Backward compatibility is the whole point here: an older save simply lacks the newer maps, which
// default to {} (or, where a tally can be reconstructed, are backfilled once, see backfillInternal).

import { migrateCumulativeToDeltas } from "/emigration/ui/emigration-flow-history.js";
import { normalizeInternal, backfillInternal, INTERNAL_SCHEMA } from "/emigration/ui/emigration-internal-tally.js";

/**
 * `v` if it's an object, else a fresh empty map. Keeps `normalize` flat (no per-field `||`).
 * @param {*} v Value.
 * @returns {*} An object.
 */
function mapOr(v) {
  return v && typeof v === "object" ? v : {};
}

/**
 * Coerce a parsed object into the canonical state shape (filling missing maps). Existing saves keep
 * their tallies untouched: the v2 net-accounting change (settled cross-civ only) takes effect on new
 * moves going forward; a pre-v2 save's accumulated net carries a fixed offset rather than being wiped.
 * @param {*} o Parsed object.
 * @returns {*} The normalized state (a MigStatsState).
 */
export function normalize(o) {
  return {
    cum: mapOr(o.cum),
    cumPts: mapOr(o.cumPts),
    lastSampled: mapOr(o.lastSampled),
    out: mapOr(o.out),
    in: mapOr(o.in),
    // The INTERNAL (within-one-civ) share of the gross tallies above, so the ledger can split
    // Internal left/arrived from External out/in. Absent in a pre-split save; backfillInternal
    // seeds them once on load from the intra-civ flow edges.
    ...normalizeInternal(o),
    refugees: mapOr(o.refugees),
    refugeesIn: mapOr(o.refugeesIn),
    deaths: mapOr(o.deaths),
    losses: mapOr(o.losses),
    // Parallel raw-pop-point tallies (1 point per migration) so the UI can show exact Civ
    // population numbers, not just the historically-scaled "people" totals. (cumPts is set above.)
    outPts: mapOr(o.outPts),
    inPts: mapOr(o.inPts),
    refugeesPts: mapOr(o.refugeesPts),
    refugeesInPts: mapOr(o.refugeesInPts),
    deathsPts: mapOr(o.deathsPts),
    lossesPts: mapOr(o.lossesPts),
    flowsPts: mapOr(o.flowsPts),
    cityPts: mapOr(o.cityPts),
    cityNames: mapOr(o.cityNames),
    wmOut: mapOr(o.wmOut),
    wmIn: mapOr(o.wmIn),
    wmRefugees: mapOr(o.wmRefugees),
    wmRefugeesIn: mapOr(o.wmRefugeesIn),
    outByCause: mapOr(o.outByCause),
    inByCause: mapOr(o.inByCause),
    outByEvent: mapOr(o.outByEvent),
    inByEvent: mapOr(o.inByEvent),
    deathsByEvent: mapOr(o.deathsByEvent),
    wmOutByCause: mapOr(o.wmOutByCause),
    wmInByCause: mapOr(o.wmInByCause),
    flows: mapOr(o.flows),
    // Per-city rolling net pop-point series ("owner|cityName" -> recent net values), for the
    // city-readout sparkline (Feature E). Bounded per city and in city count.
    cityNet: mapOr(o.cityNet),
    // Stance-impact counterfactual (people + pop-points): how much each civ's border policy raised
    // (Pro) or cut (Anti / Closed-retention) its cross-civ immigration in/out vs a neutral-borders
    // world, accumulated per turn. Signed: +in = allowed beyond, -in = prevented, -out = retained.
    stanceIn: mapOr(o.stanceIn),
    stanceOut: mapOr(o.stanceOut),
    stanceInPts: mapOr(o.stanceInPts),
    stanceOutPts: mapOr(o.stanceOutPts),
    flowHistory: Array.isArray(o.flowHistory) ? o.flowHistory : [],
    disasterEvents: Array.isArray(o.disasterEvents) ? o.disasterEvents : [],
    chartTurn: typeof o.chartTurn === "number" ? o.chartTurn : 0,
    chartAge: typeof o.chartAge === "string" ? o.chartAge : "",
    chartLocal: typeof o.chartLocal === "number" ? o.chartLocal : 0,
    lossAge: typeof o.lossAge === "string" ? o.lossAge : "",
    flowSchema: typeof o.flowSchema === "number" ? o.flowSchema : 1
  };
}

/**
 * A brand-new state, stamped at the current schemas: nothing to migrate, since a fresh blob is
 * already delta-encoded and tallies the internal/external split live from its first pass.
 * @returns {*} The state.
 */
export function freshState() {
  const s = normalize({});
  s.flowSchema = 2;
  s.intSchema = INTERNAL_SCHEMA;
  return s;
}

/**
 * Bring a just-loaded state up to the current schemas: delta-encode a legacy cumulative-clone flow
 * history (P0.3), then seed the internal/external split on a save made before it existed. Both are
 * idempotent and stamp their own schema, so a current blob passes through untouched.
 * @param {*} s State (mutated).
 */
export function migrateState(s) {
  if (s.flowSchema !== 2) {
    s.flowHistory = migrateCumulativeToDeltas(s.flowHistory);
    s.flowSchema = 2;
  }
  backfillInternal(s);
}
