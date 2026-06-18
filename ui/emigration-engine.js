// emigration-engine.js
//
// The emigration algorithm's EXECUTION + orchestration layer: each pass, rank the world's cities
// by Prosperity, accumulate per-source "emigration pressure" toward the best destination (scored by
// emigration-pull.js), and when a source crosses the bar, move rural citizens - instantaneously or
// through the transit queue (lagged arrivals). The scoring/decision lives in emigration-pull.js and
// the persistence in emigration-state.js; this module turns those decisions into applied moves.
//
// Three concerns were split out to keep this orchestrator focused: the Migration record shapes
// (emigration-migration-records.js), the source/destination side effects
// (emigration-consequences.js), and the lagged-arrival landing (emigration-arrivals.js). What stays
// here is move-planning (how many points a source sheds and how they travel) and the per-turn pass.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { rankByProsperity, distress } from "/emigration/ui/emigration-prosperity.js";
import { moveRural, removeRural, marginalPeople } from "/emigration/ui/emigration-population.js";
import { hexDistance } from "/emigration/ui/emigration-geography.js";
import { tickViolence, siegeEscalation } from "/emigration/ui/emigration-violence.js";
import { tickDisasters } from "/emigration/ui/emigration-disasters.js";
import { migrationCause, bestDestination, setNeutralBorders } from "/emigration/ui/emigration-pull.js";
import { borderStance } from "/emigration/ui/emigration-borders.js";
import { recordStanceImpact } from "/emigration/ui/emigration-migration-stats.js";
import { isRefugeeCause } from "/emigration/ui/emigration-causes.js";
import { loadState, saveState, prepareState, ownerPopulations } from "/emigration/ui/emigration-state.js";
import { cityName, moveRecord, departRecord } from "/emigration/ui/emigration-migration-records.js";
import {
  applyDepartureConsequences,
  applyArrivalConsequences
} from "/emigration/ui/emigration-consequences.js";
import { processArrivals } from "/emigration/ui/emigration-arrivals.js";

/** @typedef {import("/emigration/ui/emigration-causes.js").MigrationCause} MigrationCause */
/**
 * @typedef {import("/emigration/ui/emigration-state.js").EmigState} EmigState
 * @typedef {import("/emigration/ui/emigration-migration-records.js").Migration} Migration
 */

/**
 * Reflect an applied move in the in-memory ranking so later picks in the same pass see the updated
 * populations.
 * @param {*} src Losing signal.
 * @param {*} dest Gaining signal.
 */
function applyMoveToRanking(src, dest) {
  src.rural -= 1;
  src.population -= 1;
  dest.rural += 1;
  dest.population += 1;
}

/**
 * The transit lag (in monotonic turns) before a migration "lands". 0 when the feature is off or the
 * move is short-range and ordinary. War/disaster refugees always take at least a turn (camps);
 * otherwise the lag scales with hex distance, capped at `transitLagTurns`.
 * @param {*} src Source signal.
 * @param {*} dest Destination signal.
 * @param {MigrationCause} cause Why they moved.
 * @returns {number} Lag in turns (>= 0).
 */
function transitLag(src, dest, cause) {
  if (!(CONFIG.transitLagTurns > 0)) return 0;
  const per = CONFIG.transitHexPerTurn > 0 ? CONFIG.transitHexPerTurn : 1;
  // The lag IS the journey: the hex distance from source to destination at ~`per` hexes per turn,
  // rounded to whole turns - so a far resettlement takes meaningfully longer to land than a
  // neighbouring one. War/disaster refugees take at least a turn (camps); capped per config.
  let lag = Math.round(hexDistance(src, dest) / per);
  if (isRefugeeCause(cause)) lag = Math.max(lag, 1); // refugees camp at least a turn
  return Math.max(0, Math.min(CONFIG.transitLagTurns, lag));
}

/**
 * The number of rural points a source may shed THIS turn (Feature 1a, war surge). 1 for ordinary
 * emigration. For a war source it scales with siege intensity - `siegeEscalation` times how far
 * violence exceeds the flee threshold - up to `warSurgeMax`, so a fresh heavy assault sheds a burst
 * while a mild or already-capped siege sheds ~1.
 * @param {*} src Source signal.
 * @param {MigrationCause} cause Why they're leaving.
 * @returns {number} Points to shed this turn (>= 1).
 */
function warSurgeBudget(src, cause) {
  if (CONFIG.warSurgeMax <= 1 || cause !== "war") return 1;
  const esc = siegeEscalation(src.city); // [0,1]; 0 once loss-capped, 1 if warSiege off
  if (esc <= 0) return 1;
  const thr = CONFIG.violenceFleeThreshold;
  const over = thr > 0 ? (src.violence - thr) / thr : 0;
  const scale = Math.max(0, Math.min(1, over)) * esc;
  return 1 + Math.round(scale * (CONFIG.warSurgeMax - 1));
}

/**
 * Apply one rural point's worth of migration from `src` to `dest`. When transit lag is 0 it's
 * instantaneous (move + both consequences this turn); otherwise the source loses the point now and
 * the arrival is queued on `state.transit` for `lag` turns later. Mutates the in-memory ranking's
 * source side (the destination side is bumped on arrival).
 * @param {*} src Source signal.
 * @param {*} dest Destination signal.
 * @param {number} popBefore Source population before this point left (for people-scaling).
 * @param {*} state Loaded state (transit queue + monoTurn).
 * @param {MigrationCause} cause Why they're leaving.
 * @returns {Migration|null} The move/departure record, or null if the write failed.
 */
function applyOneMove(src, dest, popBefore, state, cause) {
  const people = marginalPeople(popBefore, state.monoTurn);
  const lag = transitLag(src, dest, cause);
  if (lag <= 0) {
    if (!moveRural(src.city, dest.city)) return null;
    applyMoveToRanking(src, dest);
    applyDepartureConsequences(src);
    const cost = applyArrivalConsequences(
      dest.city, dest.owner, dest.population, src.infected, src.owner
    );
    return moveRecord(src, dest, people, cause, cost);
  }
  // Lagged: the source loses the point now; the destination gains it on arrival.
  if (!removeRural(src.city)) return null;
  src.rural -= 1;
  src.population -= 1;
  applyDepartureConsequences(src);
  state.transit.push({
    destKey: dest.key,
    arriveTurn: state.monoTurn + lag,
    people,
    srcOwner: src.owner,
    destOwner: dest.owner,
    crossCiv: src.owner !== dest.owner,
    cause,
    infected: !!src.infected,
    srcName: cityName(src.city),
    destName: cityName(dest.city)
  });
  return departRecord(src, dest, people, cause);
}

/**
 * Shed up to `budget` rural points from `src` toward `dest` this turn (one for ordinary emigration;
 * a war burst for a besieged source). Stops early at the rural floor or a failed write. Each point
 * re-reads `src.population` so the people-scaling tracks the shrinking city.
 * @param {*} src Source signal.
 * @param {*} dest Destination signal.
 * @param {*} state Loaded state (transit + monoTurn).
 * @param {MigrationCause} cause Why they're leaving.
 * @param {number} budget Max points to shed this turn.
 * @returns {Migration[]} The applied records.
 */
function shedBurst(src, dest, state, cause, budget) {
  /** @type {Migration[]} */
  const out = [];
  for (let i = 0; i < budget; i++) {
    if (src.rural <= CONFIG.minRuralToEmigrate) break;
    const rec = applyOneMove(src, dest, src.population, state, cause);
    if (!rec) break;
    out.push(rec);
  }
  return out;
}

/**
 * Process one potential source: accumulate pressure toward its best destination and, if it crosses
 * the bar, shed population. An ordinary source sheds one point; a besieged source sheds up to its
 * war-surge budget in a burst (Feature 1a), bounded by `maxThisSource` (the remaining per-turn cap)
 * and the siege loss cap. Mutates `state` and the in-memory ranking.
 * @param {*} src Source signal.
 * @param {*[]} ranked Ranked signals.
 * @param {*} state Loaded state (sources + monoTurn + transit).
 * @param {Record<number, number>} ownerPop Per-owner total population (congestion).
 * @param {number} maxThisSource Remaining moves allowed this turn (global cap budget).
 * @returns {Migration[]} The applied records.
 */
function processSource(src, ranked, state, ownerPop, maxThisSource) {
  if (src.rural <= CONFIG.minRuralToEmigrate || maxThisSource <= 0) return [];
  const sources = state.sources;
  const st = sources[src.key] || (sources[src.key] = { pressure: 0, cooldown: 0 });
  if (st.cooldown > 0) return [];

  const best = bestDestination(src, ranked, ownerPop);
  if (!best) {
    const a = processAttrition(src, st, state); // no refuge → the outlet
    return a ? [a] : [];
  }
  st.pressure += Math.pow(Math.max(0, best.adjusted), CONFIG.deltaExponent);
  if (st.pressure < CONFIG.emigrationBar) return [];

  const cause = migrationCause(src);
  const budget = Math.min(maxThisSource, warSurgeBudget(src, cause));
  const out = shedBurst(src, best.dest, state, cause, budget);
  if (!out.length) return [];
  st.pressure = 0;
  st.cooldown = CONFIG.cooldownTurns;
  return out;
}

/**
 * The outlet (attrition): when a distressed source has NO viable destination, let its trapped
 * population die off rather than the system staying closed. Only fires when the feature is on and
 * distress is high; otherwise the pressure simply decays. Removes one rural point (no destination)
 * and returns an `attrition` record (tracked as deaths).
 * @param {*} src Source signal.
 * @param {{pressure:number, cooldown:number}} st Per-source state.
 * @param {*} state Loaded state (sources + monoTurn).
 * @returns {Migration|null} The attrition record, or null.
 */
function processAttrition(src, st, state) {
  const d = CONFIG.attritionEnabled ? distress(src) : 0;
  if (d < CONFIG.attritionMinDistress) {
    st.pressure = Math.max(0, st.pressure * 0.5); // not trapped/distressed → decay
    return null;
  }
  st.pressure += Math.pow(d, CONFIG.deltaExponent);
  if (st.pressure < CONFIG.attritionThreshold) return null;
  const popBefore = src.population;
  if (!removeRural(src.city)) return null;
  st.pressure = 0;
  st.cooldown = CONFIG.cooldownTurns;
  src.rural -= 1;
  src.population -= 1;
  return {
    srcName: cityName(src.city),
    destName: "",
    srcOwner: src.owner,
    crossCiv: false,
    points: 1,
    people: marginalPeople(popBefore, state.monoTurn),
    cause: "attrition"
  };
}

// ── Stance-impact counterfactual ──────────────────────────────────────────────
// Each turn we PLAN the cross-civ departures twice on the SAME pre-pass world , once with the real
// border stances, once with all borders forced neutral , and bank the per-civ difference. Planning
// is side-effect-free (shallow-copied signals + a copied pressure map; it never moves real
// population), so it runs alongside the real pass without disturbing it. The diff is the marginal
// counterfactual: how much border policy raised (Pro) or cut (Anti / Closed-retention) each civ's
// cross-civ immigration in/out vs a neutral-borders world.

const ZERO_PLAN = { inPts: 0, outPts: 0, inP: 0, outP: 0 };

/**
 * Add a planned cross-civ flow to the per-owner accumulator (1 point + its people).
 * @param {Map<number, *>} acc Accumulator.
 * @param {number} owner Civ id.
 * @param {"in"|"out"} dir Direction.
 * @param {number} people Scaled people.
 */
function planBump(acc, owner, dir, people) {
  let e = acc.get(owner);
  if (!e) {
    e = { inPts: 0, outPts: 0, inP: 0, outP: 0 };
    acc.set(owner, e);
  }
  e[dir + "Pts"] += 1;
  e[dir + "P"] += people;
}

/**
 * Shed up to `budget` points from `src` toward `best.dest`, banking each cross-civ point (no game
 * mutation; decrements local copies only).
 * @param {*} src Source signal (shallow copy).
 * @param {*} ctx Plan context.
 * @param {*} best Best destination ({dest}).
 * @param {number} budget Points to shed.
 * @returns {number} Points shed.
 */
function planApply(src, ctx, best, budget) {
  let moved = 0;
  for (let i = 0; i < budget && src.rural > CONFIG.minRuralToEmigrate; i++) {
    if (best.dest.owner !== src.owner) { // cross-civ only (matches the flow tally)
      const ppl = marginalPeople(src.population, ctx.monoTurn);
      planBump(ctx.acc, src.owner, "out", ppl);
      planBump(ctx.acc, best.dest.owner, "in", ppl);
    }
    src.rural -= 1;
    src.population -= 1;
    moved++;
  }
  return moved;
}

/**
 * Plan ONE source's cross-civ departures for the turn into `ctx.acc` (no game mutation): the same
 * pressure/bar/cooldown/best-destination decision as the real pass, on copied state.
 * @param {*} src Source signal (a shallow copy; its rural/population decrement locally).
 * @param {*} ctx Plan context {sig, st, ownerPop, acc, monoTurn}.
 * @param {number} maxThisSource Remaining per-turn move budget.
 * @returns {number} Points shed (for the global move budget).
 */
function planSource(src, ctx, maxThisSource) {
  if (src.rural <= CONFIG.minRuralToEmigrate || maxThisSource <= 0) return 0;
  const st = ctx.st[src.key] || (ctx.st[src.key] = { pressure: 0, cooldown: 0 });
  if (st.cooldown > 0) return 0;
  const best = bestDestination(src, ctx.sig, ctx.ownerPop);
  if (!best) return 0;
  st.pressure += Math.pow(Math.max(0, best.adjusted), CONFIG.deltaExponent);
  if (st.pressure < CONFIG.emigrationBar) return 0;
  const budget = Math.min(maxThisSource, warSurgeBudget(src, migrationCause(src)));
  const moved = planApply(src, ctx, best, budget);
  if (moved) {
    st.pressure = 0;
    st.cooldown = CONFIG.cooldownTurns;
  }
  return moved;
}

/**
 * Plan a whole turn's cross-civ departures on COPIES of the pre-pass world (no mutation).
 * @param {*[]} ranked Ranked signals (pre-pass).
 * @param {*} state Loaded state (sources + monoTurn).
 * @returns {Map<number, *>} owner → {inPts, outPts, inP, outP}.
 */
function planTurn(ranked, state) {
  const sig = ranked.map((s) => ({ ...s })); // own rural/population to decrement locally
  /** @type {Record<string, *>} */
  const st = {};
  for (const s of ranked) {
    const real = state.sources[s.key];
    st[s.key] = { pressure: real ? real.pressure : 0, cooldown: real ? real.cooldown : 0 };
  }
  const ctx = {
    sig, st, ownerPop: ownerPopulations(sig), acc: new Map(), monoTurn: state.monoTurn
  };
  let moves = 0;
  for (const src of sig) {
    if (moves >= CONFIG.maxMovesPerTurn) break;
    moves += planSource(src, ctx, CONFIG.maxMovesPerTurn - moves);
  }
  return ctx.acc;
}

/**
 * Whether any civ present holds a non-neutral border stance (else the counterfactual is a no-op).
 * @param {*[]} ranked Ranked signals.
 * @returns {boolean} True if some civ is Pro or Anti.
 */
function anyStance(ranked) {
  if (!CONFIG.bordersEnabled) return false;
  const seen = new Set();
  for (const s of ranked) {
    if (seen.has(s.owner)) continue;
    seen.add(s.owner);
    if (borderStance(s.owner) !== "none") return true;
  }
  return false;
}

/**
 * Compute + bank this turn's stance impact: plan the cross-civ flows with real stances vs neutral
 * borders, and record the per-civ difference. No-op when no civ holds a stance.
 * @param {*[]} ranked Ranked signals (pre-pass).
 * @param {*} state Loaded state.
 */
function bankStanceImpact(ranked, state) {
  if (ranked.length < 2 || !anyStance(ranked)) return;
  const withStance = planTurn(ranked, state);
  setNeutralBorders(true);
  let neutral;
  try {
    neutral = planTurn(ranked, state);
  } finally {
    setNeutralBorders(false);
  }
  /** @type {Record<number, *>} */
  const delta = {};
  for (const pid of new Set([...withStance.keys(), ...neutral.keys()])) {
    const a = withStance.get(pid) || ZERO_PLAN;
    const b = neutral.get(pid) || ZERO_PLAN;
    delta[pid] = { inP: a.inP - b.inP, outP: a.outP - b.outP,
      inPts: a.inPts - b.inPts, outPts: a.outPts - b.outPts };
  }
  recordStanceImpact(delta);
}

/**
 * Run one emigration pass over the whole world. Returns the migrations applied (for notification).
 * Updates + persists state, including the monotonic turn.
 * @returns {Migration[]} Applied migrations.
 */
export function runPass() {
  tickViolence(); // decay accumulated combat intensity before reading it
  tickDisasters(); // decay accumulated disaster distress before reading it
  const signals = collectCitySignals();
  const ranked = signals.length ? rankByProsperity(signals) : [];

  const state = loadState();
  prepareState(state, ranked);

  // Measure how border stance shaped this turn's flows (counterfactual vs neutral borders), on the
  // pre-pass world and before any mutation below.
  bankStanceImpact(ranked, state);

  // Arrivals first: land anyone whose transit completed this turn (Feature 1b). These don't count
  // against the per-turn move cap - they're completing earlier departures.
  const migrations = processArrivals(state, ranked);

  // Departures: need at least two cities for a move to be meaningful.
  if (ranked.length >= 2) {
    for (const m of processDepartures(state, ranked)) migrations.push(m);
  }

  saveState(state);
  return migrations;
}

/**
 * Run every source's departures for the turn, respecting the global per-turn move cap (a war burst
 * from one source draws down the same budget). Returns the move/departure records.
 * @param {*} state Loaded state (sources + monoTurn + transit).
 * @param {*[]} ranked Ranked signals.
 * @returns {Migration[]} The applied records.
 */
function processDepartures(state, ranked) {
  const ownerPop = ownerPopulations(ranked);
  /** @type {Migration[]} */
  const out = [];
  let moves = 0;
  for (const src of ranked) {
    if (moves >= CONFIG.maxMovesPerTurn) break;
    const recs = processSource(src, ranked, state, ownerPop, CONFIG.maxMovesPerTurn - moves);
    for (const m of recs) {
      out.push(m);
      moves += 1; // every processSource record is a departure (never an arrival)
    }
  }
  return out;
}
