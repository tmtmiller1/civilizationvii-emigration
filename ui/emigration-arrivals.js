// emigration-arrivals.js
//
// Arrival processing for lagged migrations (Feature 1b), split out of emigration-engine.js. Each
// turn, land every in-flight migration whose transit completed: re-resolve it against the live
// ranking by destination key, credit the destination if it still exists (immigration tally +
// arrival consequences), or charge a death to the source if it was razed/captured en route.
//
// The per-city INBOUND cap (emigration-inbound.js) can defer an arrival when its destination already
// filled its quota this turn (shared with the departure side, so one boomtown can't absorb dozens).
// Deferrals are FAIR (longest-waiting lands first) and BOUNDED: a refugee that can't find room for
// MAX_DEFERS turns PERISHES (the cap stays strict, never force-landed past it). A transient inability
// to accept a point retries first (so a read glitch doesn't kill anyone instantly), but a genuinely
// gone destination (razed/captured en route) charges a death immediately.
//
// Turn-processing is a hostile-runtime queue: due entries are removed from state.transit BEFORE they
// are processed, so each arrival is handled under a defensive guard (safeApplyArrival) — one bad
// record defers (or, past its retry window, perishes) instead of dropping the rest of the due queue
// and corrupting population state into a save-file ghost.

import { addRural } from "/emigration/ui/emigration-population.js";
import { arriveRecord } from "/emigration/ui/emigration-migration-records.js";
import { applyArrivalConsequences } from "/emigration/ui/emigration-consequences.js";
import { canReceiveInbound, noteInbound } from "/emigration/ui/emigration-inbound.js";
import { dlog } from "/emigration/ui/emigration-log.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { isRefugeeCause } from "/emigration/ui/emigration-causes.js";
import { queueRefugees } from "/emigration/ui/emigration-refugee-pool.js";
import { bumpTransitDeath, bumpArrivedIntoCrisis } from "/emigration/ui/emigration-telemetry.js";

/**
 * @typedef {import("/emigration/ui/emigration-state.js").EmigState} EmigState
 * @typedef {import("/emigration/ui/emigration-state.js").Transit} Transit
 * @typedef {import("/emigration/ui/emigration-migration-records.js").Migration} Migration
 * @typedef {import("/emigration/ui/emigration-inbound.js").InboundCtx} InboundCtx
 */

// After this many turns unable to land (destination saturated / unreadable), an arrival PERISHES: the
// refugees couldn't find room and died waiting, rather than being stuck in transit forever. Keeps the
// inbound cap strict (never force-landed past it).
const MAX_DEFERS = 4;

/**
 * Deterministic [0,1) roll from a stable string seed.
 * @param {string} seed Deterministic seed.
 * @returns {number} Roll in [0,1).
 */
function roll01(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0) / 0xffffffff;
}

/**
 * Whether this refugee arrival should settle immediately versus enter the holding pool.
 * @param {Transit} e Completed transit entry.
 * @param {number} now Current monotonic turn.
 * @returns {boolean} True when the point settles immediately.
 */
function immediateSettle(e, now) {
  if (!CONFIG.refugeePoolEnabled || !isRefugeeCause(e.cause)) return true;
  if (!(CONFIG.refugeeImmediateSettlePct > 0)) return false;
  if (CONFIG.refugeeImmediateSettlePct >= 1) return true;
  const seed = [e.destKey, e.srcOwner, e.destOwner, e.srcName, e.destName, now, e.defers || 0].join("|");
  return roll01(seed) < CONFIG.refugeeImmediateSettlePct;
}

/**
 * Keep a due arrival in transit for one more turn, counting the deferral so it can jump the queue next
 * turn (fairness) and eventually EXPIRE (perish) instead of remaining in permanent limbo.
 * @param {Transit} e Due transit entry. @param {EmigState} state Loaded state. @param {number} now Mono turn.
 */
function deferArrival(e, state, now) {
  e.defers = (e.defers || 0) + 1;
  e.arriveTurn = now + 1;
  state.transit.push(e);
}

/**
 * Whether a landing destination has itself turned unsafe (siege / violence / disaster over the flee
 * thresholds), i.e. the refugee is arriving into a fresh crisis (P1.2 measurement).
 * @param {*} destSig The live destination signal.
 * @returns {boolean} True when the destination is in crisis.
 */
function destInCrisis(destSig) {
  return !!destSig.siege
    || (destSig.violence || 0) >= CONFIG.violenceFleeThreshold
    || (destSig.disaster || 0) >= CONFIG.disasterFleeThreshold;
}

/**
 * Resolve one completed transit into an outcome: "land" (with its arrival record), "defer" (the
 * destination is at its inbound cap, or exists but can't accept a point right now), or "die" (the
 * destination is gone (razed/captured en route), or its retry window has expired and it still can't
 * accept). The die outcome carries `dieKind` ("razed" vs "capped") for the balance counters
 * (P0.4/P1.1), and a successful land into a now-unsafe city bumps the arrived-into-crisis counter (P1.2).
 * @param {Transit} e The completed transit entry. @param {Map<string, *>} byKey Live ranking by key.
 * @param {InboundCtx|undefined} ctx The per-turn inbound cap context.
 * @param {boolean} expired Whether the bounded retry window is exhausted (past MAX_DEFERS).
 * @param {number} now Current monotonic turn.
 * @returns {{action:"land"|"defer"|"die", rec?:Migration, dieKind?:"razed"|"capped"}} The outcome.
 */
function resolveArrival(e, byKey, ctx, expired, now) {
  const destSig = byKey.get(e.destKey);
  if (!destSig) return { action: "die", dieKind: "razed" }; // razed/captured en route → perished in transit
  // At the destination's inbound cap, or it momentarily can't accept a point: retry a few turns, then
  // PERISH (expired) rather than ever force past the cap — a refugee who can't find room dies waiting.
  if (!canReceiveInbound(e.destKey, ctx)) return { action: expired ? "die" : "defer", dieKind: "capped" };
  const settleNow = immediateSettle(e, now);
  if (settleNow) {
    if (!addRural(destSig.city)) return { action: expired ? "die" : "defer", dieKind: "capped" };
    destSig.rural += 1;
    destSig.population += 1;
  } else {
    // Entering the holding pool still counts against this turn's inbound cap: the boomtown-absorption
    // limit is about arrivals reaching the settlement, not only rural settlement, so this still
    // returns a landed record and applyArrival's noteInbound consumes a slot. (Cap = physical arrivals.)
    queueRefugees(e.destKey, e.srcOwner, now, 1);
  }
  if (destInCrisis(destSig)) bumpArrivedIntoCrisis(); // landed into a city that turned unsafe (P1.2)
  const cost = applyArrivalConsequences(destSig.city, e.destOwner, destSig.population, e.infected, e.srcOwner);
  return { action: "land", rec: arriveRecord(e, true, cost) };
}

/**
 * Apply one due arrival's resolved outcome: land it (returning its record + noting inbound capacity),
 * charge a death (record), or defer it (returns null). Perishes once it's waited past MAX_DEFERS.
 * @param {Transit} e The arrival. @param {Map<string, *>} byKey Live ranking by key.
 * @param {InboundCtx|undefined} ctx The inbound context. @param {EmigState} state Loaded state.
 * @returns {Migration|null} The arrival record, or null when deferred.
 */
function applyArrival(e, byKey, ctx, state) {
  const expired = (e.defers || 0) >= MAX_DEFERS; // retry window exhausted → perish, never force-land
  const r = resolveArrival(e, byKey, ctx, expired, state.monoTurn);
  if (r.action === "defer") {
    deferArrival(e, state, state.monoTurn);
    return null;
  }
  if (r.action === "die") {
    bumpTransitDeath(r.dieKind === "razed" ? "razed" : "capped"); // P0.4/P1.1 split
    return arriveRecord(e, false);
  }
  if (r.rec && r.rec.destOwner != null) noteInbound(e.destKey, ctx);
  return r.rec || null;
}

/**
 * Salvage a due arrival whose processing THREW, so a single bad record can never drop the rest of the
 * due queue (the entry is already removed from state.transit by the time we loop). An entry that has
 * exhausted its retry window records a death rather than deferring forever (no permanent limbo from a
 * deterministically-throwing record); a younger one gets one more bounded retry.
 * @param {Transit} e The arrival that threw. @param {EmigState} state Loaded state.
 * @returns {Migration|null} A death record for an expired entry, else null (deferred/dropped).
 */
function recoverFailedArrival(e, state) {
  if ((e.defers || 0) >= MAX_DEFERS) {
    try {
      bumpTransitDeath("capped");
      return arriveRecord(e, false);
    } catch (_) {
      return null; // even the record failed — drop it; population state is untouched, no ghost
    }
  }
  try {
    deferArrival(e, state, state.monoTurn);
  } catch (_) {
    /* ignore — worst case the entry is dropped, never force-landed */
  }
  return null;
}

/**
 * Process one due arrival under a defensive guard. Returns its record (or null when deferred) plus
 * whether it fell back to the failure path, so the caller can tally both.
 * @param {Transit} e The arrival. @param {Map<string, *>} byKey Live ranking by key.
 * @param {InboundCtx|undefined} ctx The inbound context. @param {EmigState} state Loaded state.
 * @returns {{rec:Migration|null, failed:boolean}} The outcome.
 */
function safeApplyArrival(e, byKey, ctx, state) {
  try {
    return { rec: applyArrival(e, byKey, ctx, state), failed: false };
  } catch (_) {
    return { rec: recoverFailedArrival(e, state), failed: true };
  }
}

/**
 * Most-deferred (longest-waiting) first. Deterministic given a deterministic transit array; V8's
 * Array.sort is stable, so equal-defers ties keep their transit-queue order.
 * @param {Transit} a First entry. @param {Transit} b Second entry.
 * @returns {number} Sort comparator result.
 */
function compareDefers(a, b) {
  return (b.defers || 0) - (a.defers || 0);
}

/**
 * Split the transit queue into arrivals due this turn and those still in flight.
 * @param {Transit[]} transit The full transit queue. @param {number} now Current monotonic turn.
 * @returns {{due:Transit[], pending:Transit[]}} The partition.
 */
function partitionDue(transit, now) {
  /** @type {Transit[]} */
  const due = [];
  /** @type {Transit[]} */
  const pending = [];
  for (const e of transit) (e.arriveTurn <= now ? due : pending).push(e);
  return { due, pending };
}

/**
 * Index the live ranking by destination key, skipping malformed rows.
 * @param {*[]} ranked Ranked signals. @returns {Map<string, *>} By-key index.
 */
function buildRanking(ranked) {
  const byKey = new Map();
  for (const s of ranked) if (s && s.key != null) byKey.set(s.key, s);
  return byKey;
}

/**
 * Hold due arrivals (without a deferral penalty) when the ranking is momentarily empty — a transient
 * read failure must never wrongly kill arrivals — and log it, since a persistently empty ranking is a
 * read-path failure worth seeing rather than a silent freeze.
 * @param {EmigState} state Loaded state. @param {number} now Current monotonic turn.
 * @returns {Migration[]} Always empty (nothing landed this turn).
 */
function holdWhenRankingEmpty(state, now) {
  if (state.transit.some((e) => e.arriveTurn <= now)) {
    dlog("arrivals: ranking empty; holding due arrivals without deferral penalty");
  }
  return [];
}

/**
 * Land each due arrival under the defensive guard, accumulating records and tallies.
 * @param {Transit[]} due Due arrivals, longest-waiting first. @param {Map<string, *>} byKey Ranking.
 * @param {InboundCtx|undefined} ctx Inbound context. @param {EmigState} state Loaded state.
 * @param {Migration[]} out Records sink (mutated). @returns {{deferred:number, failed:number}} Tallies.
 */
function landDueArrivals(due, byKey, ctx, state, out) {
  let deferred = 0;
  let failed = 0;
  for (const e of due) {
    const r = safeApplyArrival(e, byKey, ctx, state);
    if (r.rec) out.push(r.rec);
    else deferred++;
    if (r.failed) failed++;
  }
  return { deferred, failed };
}

/**
 * Land every in-flight migration whose transit completed this turn (Feature 1b). Due arrivals are
 * processed LONGEST-WAITING FIRST (so a saturated destination never starves old arrivals behind fresh
 * ones), each is re-resolved against the live ranking by its destination key, and an arrival whose
 * destination is at its inbound cap is deferred a turn (bounded by MAX_DEFERS). Deferred wholesale when
 * the ranking is momentarily empty, so a transient read failure never wrongly kills arrivals. Each
 * arrival runs under a defensive guard so one bad record can't drop the rest of the due queue.
 * @param {EmigState} state Loaded state (transit queue + monoTurn).
 * @param {*[]} ranked Ranked signals (the live cities this turn).
 * @param {InboundCtx} [inboundCtx] The per-turn inbound cap context (shared with the departure side).
 * @returns {Migration[]} The arrival records.
 */
export function processArrivals(state, ranked, inboundCtx) {
  if (!state.transit.length) return [];
  const now = state.monoTurn;
  if (!ranked.length) return holdWhenRankingEmpty(state, now);
  const { due, pending } = partitionDue(state.transit, now);
  if (!due.length) return [];
  due.sort(compareDefers);
  state.transit = pending; // due entries are now owned by this pass; the guard re-queues any that defer
  const byKey = buildRanking(ranked);
  /** @type {Migration[]} */
  const out = [];
  const { deferred, failed } = landDueArrivals(due, byKey, inboundCtx, state, out);
  if (deferred) dlog("arrivals: deferred " + deferred + " (destination at inbound cap or unavailable)");
  if (failed) dlog("arrivals: defensively deferred " + failed + " after a processing error");
  return out;
}
