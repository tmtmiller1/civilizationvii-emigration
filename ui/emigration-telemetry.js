// emigration-telemetry.js
//
// Balance telemetry + alert thresholds: net-flow outlier (one civ hoarding most net immigration) and
// war-displacement concentration (one civ producing most refugees). All output goes through the
// debug-gated `dlog` channel on a throttled cadence; reads EmigrationData; never throws.

import { dlog } from "/emigration/ui/emigration-log.js";
import { registerCacheReset } from "/emigration/ui/emigration-cache-reset.js";
import { DEATH_REASON } from "/emigration/ui/emigration-move-reasons.js";

// Balance counters, read via telemetryCounters() and summarized to the debug log on the throttled report cadence
// below. Two sets: the all-game totals, persisted in the save under STATE_KEY with each pass (session 1 of the
// 2026-10-26 reads found a read after a reload covered only the turns driven since), and this session's, zero on every
// load. Every bump lands in both. crisisInternal/crisisCrossCiv split refugees by destination,
// attritionTrapped/attritionFleeing by whether a refuge existed, transitRazed/transitCapped by why a lagged refugee
// never landed, crisisDestAvoided counts moves the destination-safety penalty turned elsewhere; reasonHits{tag}
// counts scoring terms per move.
const STATE_KEY = "EmigrationTelemetry_v1";
const FIELDS = [
  "passes", "zeroMovePasses",
  "voluntaryMoves", "crisisMoves", "crisisInternal", "crisisCrossCiv", "crossCivMoves", "returnMoves",
  "attritionTrapped", "attritionFleeing", "transitRazed", "transitCapped", "arrivedIntoCrisis", "crisisDestAvoided",
  "refugeesQueued", "refugeesSettled"
];
/** @returns {Record<string, number>} Every field at zero. */
function zeroCounters() {
  /** @type {Record<string, number>} */
  const out = {};
  for (const f of FIELDS) out[f] = 0;
  return out;
}
/** @type {Record<string, number>|null} All-game totals; null until read from the save. */
let _all = null;
/** @type {Record<string, number>} All-game per-reason-tag move counts (P0.4 reason histogram). */
let _allReasons = {};
/** @type {Record<string, number>} This session's counters, zero on every load. */
let _session = zeroCounters();
/** @type {Record<string, number>} This session's reason histogram. */
let _sessionReasons = {};
function resetCounters() {
  _all = null;
  _allReasons = {};
  _session = zeroCounters();
  _sessionReasons = {};
}
registerCacheReset(resetCounters);

/**
 * @param {*} m A parsed map. @returns {Record<string, number>} Its finite non-negative numbers.
 */
function finiteMap(m) {
  /** @type {Record<string, number>} */
  const out = {};
  if (m && typeof m === "object") {
    for (const k of Object.keys(m)) {
      const v = Number(m[k]);
      if (Number.isFinite(v) && v >= 0) out[k] = v;
    }
  }
  return out;
}

/** Read the all-game totals from the save (zeros when absent or unreadable). */
function loadAll() {
  _all = zeroCounters();
  _allReasons = {};
  const v = readStored();
  if (!v) return;
  const c = finiteMap(v.counters);
  for (const f of FIELDS) if (f in c) _all[f] = c[f];
  _allReasons = finiteMap(v.reasons);
}

/** @returns {*|null} The parsed save value, or null when absent or unreadable. */
function readStored() {
  try {
    const raw = Configuration?.getGame?.()?.getValue?.(STATE_KEY);
    const v = typeof raw === "string" && raw.length ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? v : null;
  } catch (_) {
    return null;
  }
}

/** @returns {Record<string, number>} The all-game totals, read from the save on first use. */
function all() {
  if (!_all) loadAll();
  return /** @type {Record<string, number>} */ (_all);
}

/** Write the all-game totals to the save. Called once per pass, with the pass's counts folded in. */
function persistAll() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify({ counters: all(), reasons: _allReasons }));
  } catch (_) {
    /* the totals since the last successful write are lost on reload; the session's stay */
  }
}

/**
 * Add to one counter, in the all-game totals and this session's.
 * @param {string} field A FIELDS name. @param {number} [n] The amount (1).
 */
function bump(field, n = 1) {
  all()[field] += n;
  _session[field] += n;
}

const VOLUNTARY_CAUSES = new Set(["prosperity", "unhappiness"]);
const CRISIS_CAUSES = new Set(["war", "disaster", "conquest"]);

/**
 * Tally one outlet-attrition (non-transit) death by whether the settlement was trapped (no refuge) or
 * lost people while others fled, from the death record's reason tags.
 * @param {*} m An attrition death record (phase !== "arrive").
 */
function countAttrition(m) {
  const trapped = Array.isArray(m.reasons) && m.reasons.indexOf(DEATH_REASON.NO_REFUGE) !== -1;
  bump(trapped ? "attritionTrapped" : "attritionFleeing");
}

/** @param {string[]|undefined} reasons */
function addReasonHits(reasons) {
  if (!Array.isArray(reasons)) return;
  all(); // the totals are loaded before the first hit lands in them
  for (const t of reasons) {
    _allReasons[t] = (_allReasons[t] || 0) + 1;
    _sessionReasons[t] = (_sessionReasons[t] || 0) + 1;
  }
}

/**
 * Tally one non-arrival relocation record: voluntary or crisis (crisis split own-civ vs cross-civ),
 * plus the overall cross-civ tally and the reason histogram. Ignores untracked causes.
 * @param {*} m A move/depart record.
 */
function countMove(m) {
  if (VOLUNTARY_CAUSES.has(m.cause)) bump("voluntaryMoves");
  else if (CRISIS_CAUSES.has(m.cause)) {
    bump("crisisMoves");
    bump(m.crossCiv ? "crisisCrossCiv" : "crisisInternal");
  } else return;
  if (m.crossCiv) bump("crossCivMoves");
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
    bump("returnMoves");
    return;
  }
  countMove(m);
}

/**
 * Fold one pass's migrations into the balance counters. Counts the record-derivable metrics;
 * transit deaths + arrived-into-crisis + pool flow are bumped at their source (arrivals / pool). Also
 * ticks the pass denominator and flags a pass that relocated nobody. Never throws.
 * @param {*[]} migs This pass's migrations.
 */
export function recordPassCounters(migs) {
  try {
    const c = all();
    const before = c.voluntaryMoves + c.crisisMoves + c.returnMoves;
    for (const m of migs || []) foldRecord(m);
    bump("passes");
    if (c.voluntaryMoves + c.crisisMoves + c.returnMoves === before) {
      bump("zeroMovePasses"); // a pass that relocated nobody (bar too high / nothing pending)
    }
    persistAll(); // the totals go into the save with the pass that made them
  } catch (_) {
    /* telemetry must never disrupt a pass */
  }
}

/**
 * Tally a transit death (a lagged refugee that never landed) by cause: "razed" (destination gone en
 * route) or "capped" (destination stayed full past MAX_DEFERS). Called from emigration-arrivals.js.
 * Never throws.
 * @param {"razed"|"capped"} kind The death cause.
 */
export function bumpTransitDeath(kind) {
  if (kind === "razed") bump("transitRazed");
  else if (kind === "capped") bump("transitCapped");
}

/** Tally a refugee that landed in a city which had turned unsafe mid-journey. */
export function bumpArrivedIntoCrisis() {
  bump("arrivedIntoCrisis");
}

/** Tally a move the destination-safety penalty turned away from a city in crisis (emigration-pull.js). */
export function bumpCrisisDestAvoided() {
  bump("crisisDestAvoided");
}

/**
 * Tally refugee points entering the holding pool (from emigration-refugee-pool.js).
 * @param {number} n Points queued.
 */
export function bumpRefugeesQueued(n) {
  if (n > 0) bump("refugeesQueued", n);
}

/**
 * Tally refugee points leaving the holding pool into working population (from emigration-refugee-staging.js).
 * @param {number} n Points settled.
 */
export function bumpRefugeesSettled(n) {
  if (n > 0) bump("refugeesSettled", n);
}

/**
 * A snapshot of the balance counters: the all-game totals (the save's, plus this session's passes).
 * @returns {Record<string, number>} The counts (see FIELDS).
 */
export function telemetryCounters() {
  return { ...all() };
}

/**
 * A snapshot of this session's counters alone: zero on every load.
 * @returns {Record<string, number>} The counts (see FIELDS).
 */
export function telemetrySessionCounters() {
  return { ..._session };
}

/**
 * A snapshot of the all-game reason histogram (which destination-scoring terms drove moves).
 * @returns {Record<string, number>} Per-reason-tag counts.
 */
export function telemetryReasonHits() {
  all();
  return { ..._allReasons };
}

/** Test-only: forget what is in memory, as a reload does; the next read comes from the save, the session from zero. */
export const __test = {
  dropMemory: () => { _all = null; _allReasons = {}; _session = zeroCounters(); _sessionReasons = {}; }
};

/**
 * Dump the full metric set for the `emigration.metrics()` console command: the all-game counters and this
 * session's side by side, the reason histograms, and the derived shares (from the all-game numbers) that are
 * the actual signals. Also logged for grepping. Never throws.
 * @returns {{counters:*, session:*, reasons:*, sessionReasons:*, derived:*}} The metric snapshot.
 */
export function dumpCounters() {
  const c = { ...all() };
  const reasons = { ..._allReasons };
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
  const out = { counters: c, session: { ..._session }, reasons, sessionReasons: { ..._sessionReasons }, derived };
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
 * pass's per-record phases, so we can see whether any civ is net-positive or arrivals are failing
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
 * Debug-log the running balance counters: voluntary vs crisis move share and the two death
 * channels, so a playtest can see whether voluntary migration is visible and whether deaths are rare.
 * @param {string} age Age label.
 */
function reportCounters(age) {
  const c = all();
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
