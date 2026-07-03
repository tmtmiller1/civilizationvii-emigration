// emigration-telemetry.js
//
// Balance telemetry + alert thresholds (combined design plan P2.7).
//
// Beyond the per-pass DURATION timing already logged from emigration-main, this
// emits BALANCE-health signals so runaway dynamics surface during playtests:
//   - net-flow outlier: one civ hoarding most of the world's net immigration
//     (the snowball the structural brakes are meant to prevent), and
//   - war-displacement concentration: one civ producing most of the refugees.
//
// All output goes through the debug-gated `dlog` channel (release.sh flips DBG
// off, so shipped builds stay silent). Computed on a throttled cadence so the
// log isn't spammed. Reads the cumulative tallies via the global EmigrationData
// surface; never throws.

import { dlog } from "/emigration/ui/emigration-log.js";
import { registerCacheReset } from "/emigration/ui/emigration-cache-reset.js";
import { DEATH_REASON } from "/emigration/ui/emigration-move-reasons.js";

// P0.4 balance counters (session-scoped; reset on a new game). A cheap, honest tally so the knob
// tuning + measure-before-build calls in the enhancement plan are made from real numbers. Read via
// telemetryCounters(); a summary is emitted to the debug log on the throttled report cadence below.
// The splits map to specific plan decisions:
//   • crisisInternal vs crisisCrossCiv  → P2.2 (do refugees internationalize too fast?)
//   • attritionTrapped vs attritionFleeing → P2.1 (how often is the "no refuge" cliff the killer?)
//   • transitRazed vs transitCapped → P1.1 (reroute only helps the capped case, not razings)
//   • arrivedIntoCrisis → P1.2 (do refugees land in cities that turned unsafe mid-journey?)
//   • passes / zeroMovePasses → is the system inert (bar too high)? the rate denominator
//   • crossCivMoves → is the world interconnected (the diaspora/composition stack depends on it)
//   • returnMoves → is homecoming inert (return thresholds too strict)?
//   • refugeesQueued / refugeesSettled → is the holding pool draining or backing up?
//   • reasonHits{tag} → which of the destination-scoring terms actually drive moves (tuning)
const FIELDS = [
  "passes", "zeroMovePasses",
  "voluntaryMoves", "crisisMoves", "crisisInternal", "crisisCrossCiv", "crossCivMoves", "returnMoves",
  "attritionTrapped", "attritionFleeing", "transitRazed", "transitCapped", "arrivedIntoCrisis",
  "refugeesQueued", "refugeesSettled"
];
/** @type {Record<string, number>} */
const _counters = {};
/** @type {Record<string, number>} Per-reason-tag move counts (P0.4 reason histogram). */
let _reasonHits = {};
function resetCounters() {
  for (const f of FIELDS) _counters[f] = 0;
  _reasonHits = {};
}
resetCounters();
registerCacheReset(resetCounters);

const VOLUNTARY_CAUSES = new Set(["prosperity", "unhappiness"]);
const CRISIS_CAUSES = new Set(["war", "disaster", "conquest"]);

/**
 * Tally one outlet-attrition (non-transit) death by whether the settlement was trapped (no refuge) or
 * lost people while others fled, from the death record's reason tags (P2.1).
 * @param {*} m An attrition death record (phase !== "arrive").
 */
function countAttrition(m) {
  const trapped = Array.isArray(m.reasons) && m.reasons.indexOf(DEATH_REASON.NO_REFUGE) !== -1;
  if (trapped) _counters.attritionTrapped++;
  else _counters.attritionFleeing++;
}

/**
 * Fold a move's reason tags into the reason histogram (which scoring terms drive moves).
 * @param {string[]|undefined} reasons The move's reason-tag keys.
 */
function addReasonHits(reasons) {
  if (!Array.isArray(reasons)) return;
  for (const t of reasons) _reasonHits[t] = (_reasonHits[t] || 0) + 1;
}

/**
 * Tally one non-arrival relocation record: voluntary or crisis (crisis split own-civ vs cross-civ,
 * P2.2), plus the overall cross-civ tally and the reason histogram. Ignores untracked causes.
 * @param {*} m A move/depart record.
 */
function countMove(m) {
  if (VOLUNTARY_CAUSES.has(m.cause)) _counters.voluntaryMoves++;
  else if (CRISIS_CAUSES.has(m.cause)) {
    _counters.crisisMoves++;
    if (m.crossCiv) _counters.crisisCrossCiv++;
    else _counters.crisisInternal++;
  } else return;
  if (m.crossCiv) _counters.crossCivMoves++;
  addReasonHits(m.reasons);
}

/**
 * Fold one record into the counters. Arrival halves are skipped (their transit deaths are tallied in
 * arrivals.js); outlet attrition and returns are their own buckets; everything else is a move.
 * @param {*} m A migration record.
 */
function foldRecord(m) {
  if (!m || m.phase === "arrive") return; // malformed / arrival half → not counted here
  if (m.cause === "attrition") return countAttrition(m); // outlet death (trapped/fleeing)
  if (m.cause === "return") {
    _counters.returnMoves++;
    return;
  }
  countMove(m);
}

/**
 * Fold one pass's migrations into the balance counters (P0.4). Counts the record-derivable metrics;
 * TRANSIT deaths + arrived-into-crisis + pool flow are bumped at their source (arrivals / pool). Also
 * ticks the pass denominator and flags a pass that relocated nobody. Never throws.
 * @param {*[]} migs This pass's migrations.
 */
export function recordPassCounters(migs) {
  try {
    const before = _counters.voluntaryMoves + _counters.crisisMoves + _counters.returnMoves;
    for (const m of migs || []) foldRecord(m);
    _counters.passes++;
    if (_counters.voluntaryMoves + _counters.crisisMoves + _counters.returnMoves === before) {
      _counters.zeroMovePasses++; // a pass that relocated nobody (bar too high / nothing pending)
    }
  } catch (_) {
    /* telemetry must never disrupt a pass */
  }
}

/**
 * Tally a transit death (a lagged refugee that never landed) by cause: "razed" (destination gone en
 * route) or "capped" (destination stayed full past MAX_DEFERS). Only "capped" is what P1.1's reroute
 * could save. Called from emigration-arrivals.js. Never throws.
 * @param {"razed"|"capped"} kind The death cause.
 */
export function bumpTransitDeath(kind) {
  if (kind === "razed") _counters.transitRazed++;
  else if (kind === "capped") _counters.transitCapped++;
}

/** Tally a refugee that landed in a city which had turned unsafe mid-journey (P1.2 measurement). */
export function bumpArrivedIntoCrisis() {
  _counters.arrivedIntoCrisis++;
}

/**
 * Tally refugee points ENTERING the holding pool (from emigration-refugee-pool.js).
 * @param {number} n Points queued.
 */
export function bumpRefugeesQueued(n) {
  if (n > 0) _counters.refugeesQueued += n;
}

/**
 * Tally refugee points LEAVING the holding pool into working population (from emigration-refugee-staging.js).
 * @param {number} n Points settled.
 */
export function bumpRefugeesSettled(n) {
  if (n > 0) _counters.refugeesSettled += n;
}

/**
 * A snapshot of the balance counters (P0.4).
 * @returns {Record<string, number>} The counts (see FIELDS).
 */
export function telemetryCounters() {
  return { ..._counters };
}

/**
 * A snapshot of the reason histogram (which destination-scoring terms drove moves).
 * @returns {Record<string, number>} Per-reason-tag counts.
 */
export function telemetryReasonHits() {
  return { ..._reasonHits };
}

/**
 * Dump the full metric set for the `emigration.metrics()` console command: raw counters, the reason
 * histogram, and the derived shares that are the actual signals. Also logged for grepping. Never throws.
 * @returns {{counters:*, reasons:*, derived:*}} The metric snapshot.
 */
export function dumpCounters() {
  const c = { ..._counters };
  const reasons = { ..._reasonHits };
  const moves = c.voluntaryMoves + c.crisisMoves;
  const deaths = c.attritionTrapped + c.attritionFleeing + c.transitRazed + c.transitCapped;
  const pct = (/** @type {number} */ a, /** @type {number} */ b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const derived = {
    totalMoves: moves,
    volSharePct: pct(c.voluntaryMoves, moves),
    crossCivSharePct: pct(c.crossCivMoves, moves),
    deathsPer100Moves: moves > 0 ? Math.round((deaths / moves) * 100) : 0,
    poolBacklog: c.refugeesQueued - c.refugeesSettled, // approx: net points still held
    zeroMovePassPct: pct(c.zeroMovePasses, c.passes)
  };
  const out = { counters: c, reasons, derived };
  try {
    dlog("DUMP " + JSON.stringify(out));
  } catch (_) {
    /* logging must never throw */
  }
  return out;
}

// Throttle: emit at most once per this many turns.
const REPORT_INTERVAL = 10;
// A civ holding at least this share of all positive net immigration is flagged,
// but only once its absolute net clears the floor (ignore noisy early game).
const NET_DOMINANCE_SHARE = 0.5;
const NET_ABS_FLOOR = 30;
// One civ producing at least this share of all refugees (war/disaster
// displacement), above an absolute floor, is flagged as a concentration.
const REFUGEE_CONCENTRATION_SHARE = 0.6;
const REFUGEE_ABS_FLOOR = 20;

let _lastReportTurn = -999;

/**
 * The current age type (e.g. "AGE_ANTIQUITY"), or "?" off-engine.
 * @returns {string} Age label.
 */
function ageLabel() {
  try {
    if (typeof Game === "undefined" || Game.age === undefined) return "?";
    if (typeof GameInfo === "undefined" || typeof GameInfo?.Ages?.lookup !== "function") return "?";
    const row = GameInfo.Ages.lookup(Game.age);
    return (row && row.AgeType) || "?";
  } catch (_) {
    return "?";
  }
}

/**
 * Read a per-civ cumulative number from the global EmigrationData surface.
 * @param {string} fn Accessor name (e.g. "netCumFor").
 * @param {number} pid Player id.
 * @returns {number} The value, or 0.
 */
function readCum(fn, pid) {
  const D = /** @type {*} */ (globalThis).EmigrationData || {};
  return typeof D[fn] === "function" ? D[fn](pid) || 0 : 0;
}

/**
 * The leader (id, value) and the total across owners for a per-civ metric.
 * @param {number[]} owners Civ ids.
 * @param {(pid:number)=>number} valueOf Per-civ value (only positive values count).
 * @returns {{topId:number, top:number, total:number}} Leader + positive total.
 */
function leaderAndTotal(owners, valueOf) {
  let topId = -1;
  let top = 0;
  let total = 0;
  for (const pid of owners) {
    const v = Math.max(0, valueOf(pid));
    total += v;
    if (v > top) {
      top = v;
      topId = pid;
    }
  }
  return { topId, top, total };
}

/**
 * Emit a net-immigration dominance alert when one civ holds a runaway share.
 * @param {number[]} owners Civ ids.
 * @param {string} age Age label.
 */
function reportNetOutlier(owners, age) {
  const { topId, top, total } = leaderAndTotal(owners, (pid) => readCum("netCumFor", pid));
  if (top < NET_ABS_FLOOR || total <= 0) return;
  const share = top / total;
  if (share < NET_DOMINANCE_SHARE) return;
  dlog(
    "BALANCE net-flow outlier age=" + age + " civ=" + topId + " net=" + Math.round(top) +
      " share=" + Math.round(share * 100) + "pct (>= " + Math.round(NET_DOMINANCE_SHARE * 100) + ")"
  );
}

/**
 * Emit a war-displacement concentration alert when one civ produces most refugees.
 * @param {number[]} owners Civ ids.
 * @param {string} age Age label.
 */
function reportRefugeeConcentration(owners, age) {
  const { topId, top, total } = leaderAndTotal(owners, (pid) => readCum("refugeesCumFor", pid));
  if (top < REFUGEE_ABS_FLOOR || total <= 0) return;
  const share = top / total;
  if (share < REFUGEE_CONCENTRATION_SHARE) return;
  dlog(
    "BALANCE refugee concentration age=" + age + " civ=" + topId + " refugees=" + Math.round(top) +
      " share=" + Math.round(share * 100) + "pct (>= " + Math.round(REFUGEE_CONCENTRATION_SHARE * 100) +
      ")"
  );
}

/**
 * Debug-log this pass's net-distribution: each civ's cumulative net (points + people) plus this
 * pass's per-record phases, so we can see whether any civ is net-POSITIVE or arrivals are failing
 * (departures debit a source, but a destroyed-destination arrival credits no one). Grep
 * `EMIG_netdist` in UI.log. Never throws.
 * @param {*} s MigStats state (reads cum / cumPts).
 * @param {*[]} migs This pass's migrations.
 */
export function logNetDistribution(s, migs) {
  try {
    const ids = new Set([...Object.keys(s.cumPts || {}), ...Object.keys(s.cum || {})]);
    const parts = [];
    for (const pid of ids) {
      const pts = Math.round(s.cumPts[pid] || 0);
      const ppl = Math.round(s.cum[pid] || 0);
      if (pts !== 0 || ppl !== 0) parts.push("c" + pid + ":pts=" + pts + ",ppl=" + ppl);
    }
    const phases = migs.map((/** @type {*} */ m) => (m.phase || "?") + (m.crossCiv ? "X" : "") + ">"
      + (typeof m.srcOwner === "number" ? m.srcOwner : "-") + "/"
      + (typeof m.destOwner === "number" ? m.destOwner : "-")).join(" ");
    dlog("netdist [" + (parts.join(" ") || "all-zero") + "] thisPass: " + phases);
  } catch (_) {
    /* diagnostics must never break a pass */
  }
}

/**
 * Debug-log the running balance counters (P0.4): voluntary vs crisis move share and the two death
 * channels, so a playtest can see whether voluntary migration is visible and whether deaths are rare.
 * @param {string} age Age label.
 */
function reportCounters(age) {
  const c = _counters;
  const moves = c.voluntaryMoves + c.crisisMoves;
  const share = moves > 0 ? Math.round((c.voluntaryMoves / moves) * 100) : 0;
  const xShare = moves > 0 ? Math.round((c.crossCivMoves / moves) * 100) : 0;
  dlog(
    "COUNTERS age=" + age + " passes=" + c.passes + " zeroMove=" + c.zeroMovePasses +
      " vol=" + c.voluntaryMoves + " volShare=" + share + "pct" +
      " crisis=" + c.crisisMoves + "[own=" + c.crisisInternal + " abroad=" + c.crisisCrossCiv + "]" +
      " crossCiv=" + xShare + "pct return=" + c.returnMoves +
      " attrition[trapped=" + c.attritionTrapped + " fleeing=" + c.attritionFleeing + "]" +
      " transit[razed=" + c.transitRazed + " capped=" + c.transitCapped + "]" +
      " arrivedIntoCrisis=" + c.arrivedIntoCrisis +
      " pool[queued=" + c.refugeesQueued + " settled=" + c.refugeesSettled + "]"
  );
}

/**
 * Emit balance-health signals for the given civs, throttled to once per
 * REPORT_INTERVAL turns. Debug-gated via dlog; never throws.
 * @param {number[]} owners In-play civ ids (e.g. from city signals).
 * @param {number} turn The current (age-local) game turn, for throttling.
 */
export function reportBalanceSignals(owners, turn) {
  try {
    if (!Array.isArray(owners) || owners.length === 0) return;
    if (typeof turn === "number" && turn - _lastReportTurn < REPORT_INTERVAL) return;
    _lastReportTurn = typeof turn === "number" ? turn : _lastReportTurn;
    const age = ageLabel();
    reportNetOutlier(owners, age);
    reportRefugeeConcentration(owners, age);
    reportCounters(age);
  } catch (_) {
    /* telemetry must never disrupt a pass */
  }
}
