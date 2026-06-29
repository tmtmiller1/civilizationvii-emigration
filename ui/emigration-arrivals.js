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
// MAX_DEFERS turns PERISHES (the cap stays strict — never force-landed past it). A transient inability
// to accept a point retries first (so a read glitch doesn't kill anyone instantly), but a genuinely
// gone destination — razed/captured en route — charges a death immediately.

import { addRural } from "/emigration/ui/emigration-population.js";
import { arriveRecord } from "/emigration/ui/emigration-migration-records.js";
import { applyArrivalConsequences } from "/emigration/ui/emigration-consequences.js";
import { canReceiveInbound, noteInbound } from "/emigration/ui/emigration-inbound.js";
import { dlog } from "/emigration/ui/emigration-log.js";

/**
 * @typedef {import("/emigration/ui/emigration-state.js").EmigState} EmigState
 * @typedef {import("/emigration/ui/emigration-state.js").Transit} Transit
 * @typedef {import("/emigration/ui/emigration-migration-records.js").Migration} Migration
 * @typedef {import("/emigration/ui/emigration-inbound.js").InboundCtx} InboundCtx
 */

// After this many turns unable to land (destination saturated / unreadable), an arrival PERISHES — the
// refugees couldn't find room and died waiting, rather than being stuck in transit forever. Keeps the
// inbound cap strict (no force-landing past it).
const MAX_DEFERS = 4;

/**
 * Keep a due arrival in transit for one more turn, counting the deferral so it can jump the queue next
 * turn (fairness) and eventually be force-landed (no permanent limbo).
 * @param {Transit} e Due transit entry. @param {EmigState} state Loaded state. @param {number} now Mono turn.
 */
function deferArrival(e, state, now) {
  e.defers = (e.defers || 0) + 1;
  e.arriveTurn = now + 1;
  state.transit.push(e);
}

/**
 * Resolve one completed transit into an outcome: "land" (with its arrival record), "defer" (the
 * destination is at its inbound cap, or exists but can't accept a point right now), or "die" (the
 * destination is gone — razed/captured en route — or it's force-land time and it still can't accept).
 * @param {Transit} e The completed transit entry. @param {Map<string, *>} byKey Live ranking by key.
 * @param {InboundCtx|undefined} ctx The per-turn inbound cap context. @param {boolean} forced Past MAX_DEFERS.
 * @returns {{action:"land"|"defer"|"die", rec?:Migration}} The outcome.
 */
function resolveArrival(e, byKey, ctx, forced) {
  const destSig = byKey.get(e.destKey);
  if (!destSig) return { action: "die" }; // razed/captured en route → perished in transit
  // At the destination's inbound cap, or it momentarily can't accept a point: retry a few turns, then
  // PERISH (forced) rather than ever force past the cap — a refugee who can't find room dies waiting.
  if (!canReceiveInbound(e.destKey, ctx)) return { action: forced ? "die" : "defer" };
  if (!addRural(destSig.city)) return { action: forced ? "die" : "defer" };
  destSig.rural += 1;
  destSig.population += 1;
  const cost = applyArrivalConsequences(
    destSig.city, e.destOwner, destSig.population, e.infected, e.srcOwner
  );
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
  const forced = (e.defers || 0) >= MAX_DEFERS; // force-land after waiting too long
  const r = resolveArrival(e, byKey, ctx, forced);
  if (r.action === "defer") {
    deferArrival(e, state, state.monoTurn);
    return null;
  }
  if (r.action === "die") return arriveRecord(e, false);
  if (r.rec && r.rec.destOwner != null) noteInbound(e.destKey, ctx);
  return r.rec || null;
}

/**
 * Land every in-flight migration whose transit completed this turn (Feature 1b). Due arrivals are
 * processed LONGEST-WAITING FIRST (so a saturated destination never starves old arrivals behind fresh
 * ones), each is re-resolved against the live ranking by its destination key, and an arrival whose
 * destination is at its inbound cap is deferred a turn (bounded by MAX_DEFERS). Deferred wholesale when
 * the ranking is momentarily empty, so a transient read failure never wrongly kills arrivals.
 * @param {EmigState} state Loaded state (transit queue + monoTurn).
 * @param {*[]} ranked Ranked signals (the live cities this turn).
 * @param {InboundCtx} [inboundCtx] The per-turn inbound cap context (shared with the departure side).
 * @returns {Migration[]} The arrival records.
 */
export function processArrivals(state, ranked, inboundCtx) {
  if (!state.transit.length || !ranked.length) return [];
  const now = state.monoTurn;
  const due = state.transit
    .filter((e) => e.arriveTurn <= now)
    .sort((a, b) => (b.defers || 0) - (a.defers || 0)); // most-deferred (longest-waiting) first
  if (!due.length) return [];
  state.transit = state.transit.filter((e) => e.arriveTurn > now);
  const byKey = new Map();
  for (const s of ranked) byKey.set(s.key, s);
  /** @type {Migration[]} */
  const out = [];
  let deferred = 0;
  for (const e of due) {
    const rec = applyArrival(e, byKey, inboundCtx, state);
    if (rec) out.push(rec);
    else deferred++;
  }
  if (deferred) dlog("arrivals: deferred " + deferred + " (destination at inbound cap)");
  return out;
}
