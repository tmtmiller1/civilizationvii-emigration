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
  } catch (_) {
    /* telemetry must never disrupt a pass */
  }
}
