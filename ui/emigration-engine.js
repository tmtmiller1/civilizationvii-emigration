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
import { speedTurns, speedBar, speedDecay, speedShock } from "/emigration/ui/emigration-game-speed.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { rankByProsperity, distress } from "/emigration/ui/emigration-prosperity.js";
import {
  moveRural, removeRural, marginalPeople, settlementSignal
} from "/emigration/ui/emigration-population.js";
import { hexDistance } from "/emigration/ui/emigration-geography.js";
import { tickViolence, siegeEscalation } from "/emigration/ui/emigration-violence.js";
import { tickDisasters } from "/emigration/ui/emigration-disasters.js";
import { migrationCause, bestDestination, setNeutralBorders } from "/emigration/ui/emigration-pull.js";
import { borderStance } from "/emigration/ui/emigration-borders.js";
import { recordStanceImpact } from "/emigration/ui/emigration-migration-stats.js";
import { isRefugeeCause } from "/emigration/ui/emigration-causes.js";
import { loadState, saveState, prepareState, ownerPopulations } from "/emigration/ui/emigration-state.js";
import { cityName, moveRecord, departRecord } from "/emigration/ui/emigration-migration-records.js";
import { pollCrisis, eventKeyForMove, eventKeyForDeath } from "/emigration/ui/emigration-event-attribution.js";
import { warAggressors } from "/emigration/ui/emigration-war.js";
import { combatLossFor } from "/emigration/ui/emigration-combat.js";
import {
  applyDepartureConsequences,
  applyArrivalConsequences
} from "/emigration/ui/emigration-consequences.js";
import { processArrivals } from "/emigration/ui/emigration-arrivals.js";
import {
  makeInboundCtx, canReceiveInbound, noteInbound
} from "/emigration/ui/emigration-inbound.js";

/** @typedef {import("/emigration/ui/emigration-causes.js").MigrationCause} MigrationCause */
/** @typedef {import("/emigration/ui/emigration-inbound.js").InboundCtx} InboundCtx */
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
  return Math.max(0, Math.min(speedTurns(CONFIG.transitLagTurns), lag));
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

// FORCED displacement causes: refugees flee every turn, so these bypass the post-move cooldown that
// paces voluntary (prosperity / unhappiness) migration. `conquest` is reserved for capture-driven
// displacement (a later phase emits it).
const FORCED_CAUSES = new Set(["war", "disaster", "conquest"]);

/** Whether a source is in an acute crisis (war / disaster), for sizing the per-civ move ceiling.
 * @param {*} src Source signal. @returns {boolean} In crisis. */
function inCrisis(src) {
  return !!src.siege
    || (src.violence || 0) >= CONFIG.violenceFleeThreshold
    || (src.disaster || 0) >= CONFIG.disasterFleeThreshold;
}

/** A source rests (skips a move) only when on cooldown AND its cause is voluntary (not war/disaster).
 * @param {{cooldown:number}} st Per-source state. @param {boolean} forced Forced-cause flag. */
function restingOnCooldown(st, forced) {
  return !forced && st.cooldown > 0;
}

/**
 * Per-civ move ceilings for the turn: a runaway/perf safety net (NOT the pacing mechanism), sized so
 * simultaneous wars on different civs never compete for one global budget. Each civ's ceiling grows
 * with its settlement count and how many of its cities are in crisis, so a besieged empire can shed
 * refugees from all fronts at once.
 * @param {*[]} ranked Ranked source signals.
 * @returns {Map<number, {voluntary:number, crisis:number}>} owner id → per-track move ceilings.
 */
function civMoveCeilings(ranked) {
  /** @type {Map<number, {cities:number, crises:number}>} */
  const by = new Map();
  for (const s of ranked) {
    let e = by.get(s.owner);
    if (!e) {
      e = { cities: 0, crises: 0 };
      by.set(s.owner, e);
    }
    e.cities += 1;
    if (inCrisis(s)) e.crises += 1;
  }
  /** @type {Map<number, {voluntary:number, crisis:number}>} */
  const out = new Map();
  for (const [owner, e] of by) {
    out.set(owner, {
      voluntary: CONFIG.maxMovesPerTurn + e.cities * CONFIG.movesPerCity,
      crisis: e.crises * CONFIG.movesPerSiege
    });
  }
  return out;
}

/** Per-source persistent state (created with both tracks' fields; legacy uses pressure/cooldown only).
 * @param {*} state Loaded state. @param {string} key Source key. @returns {*} The source state. */
function sourceState(state, key) {
  const s = state.sources[key]
    || (state.sources[key] = { pressure: 0, cooldown: 0, crisisPressure: 0, crisisCooldown: 0 });
  if (typeof s.deathPressure !== "number") s.deathPressure = 0; // normalize older saves
  return s;
}

/** Causes that draw from the CRISIS budget/track (vs voluntary prosperity/unhappiness). */
const CRISIS_TRACK = new Set(["war", "disaster", "conquest", "attrition"]);
/** @param {string} cause Cause. @returns {boolean} Whether it's a crisis-track cause. */
function isCrisisTrack(cause) {
  return CRISIS_TRACK.has(cause);
}

/** The crisis cause for a besieged/struck source (disaster takes precedence over war).
 * @param {*} src Source. @returns {MigrationCause} "disaster" | "war". */
function crisisCause(src) {
  return (src.disaster || 0) >= CONFIG.disasterFleeThreshold ? "disaster" : "war";
}

/** The voluntary cause for a source (an unhappiness push vs a prosperity pull).
 * @param {*} src Source. @returns {MigrationCause} "unhappiness" | "prosperity". */
function voluntaryCause(src) {
  return (src.happiness || 0) < CONFIG.unhappyCauseThreshold ? "unhappiness" : "prosperity";
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
 * @param {InboundCtx} inboundCtx Per-turn destination-inbound cap context.
 * @returns {Migration|null} The move/departure record, or null if the write failed.
 */
// eslint-disable-next-line max-params
function applyOneMove(src, dest, popBefore, state, cause, inboundCtx) {
  const people = marginalPeople(popBefore, state.monoTurn, cityName(src.city), settlementSignal(src));
  const lag = transitLag(src, dest, cause);
  const eventKey = eventKeyForMove(src, cause); // specific war/disaster/crisis behind this move
  if (lag <= 0) {
    if (!canReceiveInbound(dest.key, inboundCtx)) return null;
    if (!moveRural(src.city, dest.city)) return null;
    applyMoveToRanking(src, dest);
    applyDepartureConsequences(src);
    noteInbound(dest.key, inboundCtx);
    const cost = applyArrivalConsequences(
      dest.city, dest.owner, dest.population, src.infected, src.owner
    );
    return moveRecord(src, dest, people, cause, { destPaidCost: cost, eventKey });
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
    eventKey,
    infected: !!src.infected,
    srcName: cityName(src.city),
    destName: cityName(dest.city)
  });
  return departRecord(src, dest, people, cause, eventKey);
}

/**
 * Shed up to `budget` rural points from `src` toward `dest` this turn (one for ordinary emigration;
 * a war burst for a besieged source). Stops early at the rural floor or a failed write. Each point
 * re-reads `src.population` so the people-scaling tracks the shrinking city.
 *
 * @param {*} src Source signal.
 * @param {*} dest Destination signal.
 * @param {*} state Loaded state (transit + monoTurn).
 * @param {MigrationCause} cause Why they're leaving.
 * @param {number} budget Max points to shed this turn.
 * @param {InboundCtx} inboundCtx Per-turn destination-inbound cap context.
 * @returns {Migration[]} The applied records.
 */
// eslint-disable-next-line max-params
function shedBurst(src, dest, state, cause, budget, inboundCtx) {
  /** @type {Migration[]} */
  const out = [];
  for (let i = 0; i < budget; i++) {
    if (src.rural <= CONFIG.minRuralToEmigrate) break;
    const rec = applyOneMove(src, dest, src.population, state, cause, inboundCtx);
    if (!rec) break;
    out.push(rec);
  }
  return out;
}

/**
 * The best destination for `src` that can still receive migrants this turn.
 * @param {*} src Source signal.
 * @param {*[]} ranked Ranked city signals.
 * @param {Record<number, number>} ownerPop Per-owner populations.
 * @param {InboundCtx} inboundCtx Per-turn destination-inbound cap context.
 * @returns {{dest:*, adjusted:number}|null} Best open destination.
 */
function bestOpenDestination(src, ranked, ownerPop, inboundCtx) {
  return bestDestination(src, ranked, ownerPop, (d) => canReceiveInbound(d.key, inboundCtx));
}

/**
 * Whether a source is still below the pressure bar and must keep accumulating. Forced displacement
 * (war / disaster / conquest) flees EVERY turn, it bypasses the bar that paces voluntary migration,
 * so a besieged city sheds refugees immediately once it has a refuge (still bounded by the war-surge
 * burst, the siege loss cap, the rural pool, and the per-civ move ceiling). Voluntary (prosperity /
 * unhappiness) migration must accumulate to `emigrationBar` before it moves anyone.
 * @param {boolean} forced Whether the cause is forced displacement.
 * @param {number} pressure The source's accumulated pressure.
 * @returns {boolean} True when the source should wait (no move this turn).
 */
function belowEmigrationBar(forced, pressure) {
  return !forced && pressure < speedBar(CONFIG.emigrationBar);
}

/**
 * The legacy single-cause EMIGRATION step: accumulate toward the best destination and shed if it
 * crosses the bar (forced causes bypass it). No destination / on cooldown / below the bar → [].
 * @param {*} src Source signal.
 * @param {*} st Per-source state.
 * @param {*} state Loaded state.
 * @param {*} best The chosen destination ({dest, adjusted}) or null.
 * @param {number} maxThisSource Remaining moves allowed this turn.
 * @param {InboundCtx} inboundCtx Per-turn destination-inbound cap context.
 * @returns {Migration[]} The applied records.
 */
// eslint-disable-next-line max-params
function legacyEmigrate(src, st, state, best, maxThisSource, inboundCtx) {
  const cause = migrationCause(src);
  const forced = FORCED_CAUSES.has(cause);
  if (!best || restingOnCooldown(st, forced)) return [];
  st.pressure += Math.pow(Math.max(0, best.adjusted), CONFIG.deltaExponent);
  if (belowEmigrationBar(forced, st.pressure)) return [];
  const budget = Math.min(maxThisSource, warSurgeBudget(src, cause));
  const out = shedBurst(src, best.dest, state, cause, budget, inboundCtx);
  if (!out.length) return [];
  st.pressure = 0;
  if (!forced) st.cooldown = speedTurns(CONFIG.cooldownTurns);
  return out;
}

/**
 * LEGACY single-cause source pass (used when CONFIG.splitTracksEnabled is off): one emigration step
 * plus the concurrent trapped/famine death channel.
 * @param {*} src Source signal.
 * @param {*[]} ranked Ranked signals.
 * @param {*} state Loaded state (sources + monoTurn + transit).
 * @param {Record<number, number>} ownerPop Per-owner total population (congestion).
 * @param {number} maxThisSource Remaining moves allowed this turn.
 * @param {InboundCtx} inboundCtx Per-turn destination-inbound cap context.
 * @returns {Migration[]} The applied records.
 */
// eslint-disable-next-line max-params
function processSourceLegacy(src, ranked, state, ownerPop, maxThisSource, inboundCtx) {
  if (src.rural <= CONFIG.minRuralToEmigrate || maxThisSource <= 0) return [];
  const st = sourceState(state, src.key);
  const best = bestOpenDestination(src, ranked, ownerPop, inboundCtx);
  /** @type {Migration[]} */
  const out = legacyEmigrate(src, st, state, best, maxThisSource, inboundCtx);
  const death = processOutletDeath(src, st, state, !!best); // concurrent trapped/famine death
  if (death) out.push(death);
  return out;
}

/**
 * CRISIS sub-pass: a besieged/struck source flees EVERY turn (no bar, no cooldown), its own war-surge
 * burst, bounded by the crisis budget and the siege-loss cap (inside warSurgeBudget). Cause is
 * disaster if distress dominates, else war.
 * @param {*} src Source signal.
 * @param {*} best The chosen destination ({dest, adjusted}).
 * @param {*} state Loaded state.
 * @param {number} maxCrisis Remaining crisis budget for the civ.
 * @param {InboundCtx} inboundCtx Per-turn destination-inbound cap context.
 * @returns {Migration[]} The applied records.
 */
function shedCrisis(src, best, state, maxCrisis, inboundCtx) {
  const cause = crisisCause(src);
  const budget = Math.min(maxCrisis, warSurgeBudget(src, cause));
  return shedBurst(src, best.dest, state, cause, budget, inboundCtx);
}

/**
 * The hard per-city ceiling on MIGRATION points one settlement may lose this turn (crisis + voluntary),
 * the direct guard against a single city shedding a large burst. 0 in config → no cap (Infinity).
 * @returns {number} The per-city migration cap (people points), or Infinity when disabled.
 */
function cityMigrationCap() {
  return CONFIG.maxLossPerCityPerTurn > 0 ? CONFIG.maxLossPerCityPerTurn : Infinity;
}

/**
 * VOLUNTARY sub-pass: ordinary economic migration, accumulate the pull toward `best`, and when it
 * crosses the bar (and not on cooldown) shed one point, then rest. Independent of any crisis flow.
 * @param {*} src Source signal.
 * @param {*} best The chosen destination ({dest, adjusted}).
 * @param {*} state Loaded state.
 * @param {*} st Source state (pressure/cooldown).
 * @param {number} maxVol Remaining voluntary budget for the civ.
 * @param {InboundCtx} inboundCtx Per-turn destination-inbound cap context.
 * @returns {Migration[]} The applied records.
 */
// eslint-disable-next-line max-params
function shedVoluntary(src, best, state, st, maxVol, inboundCtx) {
  if (st.cooldown > 0 || maxVol <= 0) return [];
  st.pressure += Math.pow(Math.max(0, best.adjusted), CONFIG.deltaExponent);
  if (st.pressure < speedBar(CONFIG.emigrationBar)) return [];
  const out = shedBurst(
    src,
    best.dest,
    state,
    voluntaryCause(src),
    Math.min(maxVol, 1),
    inboundCtx
  );
  if (out.length) {
    st.pressure = 0;
    st.cooldown = speedTurns(CONFIG.cooldownTurns);
  }
  return out;
}

/**
 * SPLIT source pass: evaluate the crisis and voluntary tracks INDEPENDENTLY for one source, so a
 * besieged-but-attractive city can shed war refugees AND economic migrants in the same pass. Each
 * draws from its own budget (or a shared pool when `budgets.shared`). No destination → the attrition
 * outlet (unchanged). Records keep a single cause; concurrency is the two records, not a multi-cause.
 * @param {*} src Source signal.
 * @param {*[]} ranked Ranked signals.
 * @param {*} state Loaded state.
 * @param {Record<number, number>} ownerPop Per-owner total population.
 * @param {{voluntary:number, crisis:number, shared?:boolean}} budgets Remaining per-track budget.
 * @param {InboundCtx} inboundCtx Per-turn destination-inbound cap context.
 * @returns {Migration[]} The applied records.
 */
// eslint-disable-next-line max-params
function processSourceSplit(src, ranked, state, ownerPop, budgets, inboundCtx) {
  const st = sourceState(state, src.key);
  /** @type {Migration[]} */
  const out = [];
  const bestCrisis = bestOpenDestination(src, ranked, ownerPop, inboundCtx);
  if (bestCrisis) {
    // Per-CITY migration ceiling this turn: crisis + voluntary together can't exceed it (out.length is
    // the running count of points this source has shed so far), so one besieged city can't burst-evacuate.
    const cap = cityMigrationCap();
    if (budgets.crisis > 0 && inCrisis(src)) {
      for (const m of shedCrisis(
        src,
        bestCrisis,
        state,
        Math.min(budgets.crisis, cap),
        inboundCtx
      )) out.push(m);
    }
    // Shared pool: crisis already spent some of the common budget, so the voluntary track gets the rest.
    const volBudget = budgets.shared ? budgets.voluntary - out.length : budgets.voluntary;
    const volMax = Math.min(volBudget, cap - out.length); // cap minus crisis points already shed
    const bestVoluntary = bestOpenDestination(src, ranked, ownerPop, inboundCtx);
    if (bestVoluntary) {
      for (const m of shedVoluntary(
        src,
        bestVoluntary,
        state,
        st,
        volMax,
        inboundCtx
      )) out.push(m);
    }
  }
  // Death channel, CONCURRENT with the above: the trapped (no refuge), or a STARVING city even with a
  // refuge, loses some people to death while the rest flee. Famine ≠ trapped: people die even fleeing.
  const death = processOutletDeath(src, st, state, !!bestCrisis);
  if (death) out.push(death);
  return out;
}

/**
 * Process one source, the split two-track pass, or the legacy single-cause pass when the split is off.
 * @param {*} src Source signal.
 * @param {*[]} ranked Ranked signals.
 * @param {*} state Loaded state.
 * @param {Record<number, number>} ownerPop Per-owner total population.
 * @param {{voluntary:number, crisis:number, shared?:boolean}} budgets Remaining per-track budget.
 * @param {InboundCtx} inboundCtx Per-turn destination-inbound cap context.
 * @returns {Migration[]} The applied records.
 */
// eslint-disable-next-line max-params
function processSource(src, ranked, state, ownerPop, budgets, inboundCtx) {
  if (src.rural <= CONFIG.minRuralToEmigrate) return [];
  if (budgets.voluntary <= 0 && budgets.crisis <= 0) return [];
  if (CONFIG.splitTracksEnabled) {
    return processSourceSplit(src, ranked, state, ownerPop, budgets, inboundCtx);
  }
  // Legacy uses ONE merged budget: the shared pool's `voluntary` already IS the merged remaining; the
  // separate-ceiling case sums the two tracks. Bounded by the per-city migration cap.
  const merged = budgets.shared ? budgets.voluntary : budgets.voluntary + budgets.crisis;
  return processSourceLegacy(
    src,
    ranked,
    state,
    ownerPop,
    Math.min(merged, cityMigrationCap()),
    inboundCtx
  );
}

/**
 * The CRISIS-SEVERITY multiplier (≥ 0) on the crisis-death rate: the worse the crisis, the larger the
 * share of a stricken city's people that die rather than escaping. Built from signals the mod can read:
 *   • overall lethal DISTRESS `d`, already aggregates a war's siege DURATION (vwSiege/turn), PILLAGED
 *     tiles (vwPillage) and ASSAULT damage (vwAssault, a casualties proxy), AND disaster/famine, so
 *     this works for every crisis type, not just war, normalized by the firing floor and capped; and
 *   • for a WAR specifically, the number of attacking civs (PARTICIPANTS): a multi-civ pile-on is
 *     deadlier than a duel.
 * (No engine hook exposes exact units-lost; cities-razed could be layered in later.) ≈ 1 at the firing
 * floor; rises steeply for a long, heavily-pillaged, or ganged-up war.
 * @param {*} src Source signal.
 * @param {number} d The source's lethal distress (already computed by the caller).
 * @returns {number} The severity multiplier.
 */
function crisisSeverity(src, d) {
  const ref = Math.max(1, CONFIG.attritionMinDistress);
  const intensity = Math.min(CONFIG.crisisSeverityCap, d / ref); // pillaging / assault damage / duration
  const extra = Math.max(0, warAggressors(src.owner).size - 1);
  const gang = 1 + Math.min(CONFIG.crisisParticipantMax, CONFIG.crisisParticipantWeight * extra);
  // Unit CASUALTIES are a MAJOR co-factor: a civ bleeding its army (field battles, not just city
  // damage) dies harder. Bounded so it stays alongside, not over, the damage-driven intensity.
  const combat = Math.min(CONFIG.crisisCombatMax, CONFIG.crisisCombatWeight * combatLossFor(src.owner));
  return intensity * gang + combat;
}

/**
 * The outlet's DEATH channel, population that leaves the world (cause `attrition`), tracked as deaths,
 * not migration. Fires under LETHAL distress (`distress ≥ attritionMinDistress`), i.e. the situational
 * crises: war, disaster, siege, famine. Economic prosperity/unhappiness emigration carries NO
 * situational distress, so it never kills. Runs CONCURRENTLY with emigration on its own `deathPressure`:
 *   • TRAPPED (no refuge): the whole trapped population dies off (the original closed-system valve), at
 *     full rate, gated only by `attritionEnabled`.
 *   • CRISIS WHILE FLEEING (a refuge exists, `crisisDeathEnabled`): some die while the rest flee, at
 *     `crisisDeathShare` of the trapped rate. Without this the "no refuge" trap almost never fires
 *     (there's nearly always somewhere to flee), so a crisis only ever displaced and never killed.
 * @param {*} src Source signal.
 * @param {*} st Per-source state (uses st.deathPressure).
 * @param {*} state Loaded state.
 * @param {boolean} hasRefuge Whether a viable destination exists this pass.
 * @returns {Migration|null} An attrition death record, or null.
 */
function processOutletDeath(src, st, state, hasRefuge) {
  const d = CONFIG.attritionEnabled ? distress(src) : 0;
  // Lethal distress is the situational crises (war/disaster/siege/famine); economic emigration has none.
  if (d < CONFIG.attritionMinDistress || (hasRefuge && !CONFIG.crisisDeathEnabled)) {
    st.deathPressure = Math.max(0, st.deathPressure * speedDecay(0.5)); // coping → decay (same game-time)
    return null;
  }
  // DYNAMIC: the worse the crisis, the larger the share that dies rather than fleeing. Trapped → full.
  const rate = hasRefuge ? Math.min(1, CONFIG.crisisDeathShare * crisisSeverity(src, d)) : 1;
  // speedShock (÷S): the kill threshold below is ×S (speedBar), and the fade is re-based (speedDecay),
  // so the per-turn accumulation must also shrink ÷S or a slow-speed city banks ~S× the crisis distress
  // before the kill fires. This makes the TOTAL crisis pressure to a death speed-invariant.
  st.deathPressure += speedShock(Math.pow(Math.max(d, 1), CONFIG.deltaExponent) * rate);
  if (st.deathPressure < speedBar(CONFIG.attritionThreshold)) return null;
  const popBefore = src.population;
  if (!removeRural(src.city)) return null;
  st.deathPressure = 0;
  src.rural -= 1;
  src.population -= 1;
  return {
    srcName: cityName(src.city),
    destName: "",
    srcOwner: src.owner,
    crossCiv: false,
    points: 1,
    people: marginalPeople(popBefore, state.monoTurn, cityName(src.city), settlementSignal(src)),
    cause: "attrition",
    eventKey: eventKeyForDeath(src) // specific war/disaster/crisis/famine that killed them
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
      const ppl = marginalPeople(src.population, ctx.monoTurn, cityName(src.city), settlementSignal(src));
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
  const cause = migrationCause(src);
  const forced = FORCED_CAUSES.has(cause);
  if (restingOnCooldown(st, forced)) return 0;
  const best = bestDestination(src, ctx.sig, ctx.ownerPop);
  if (!best) return 0;
  st.pressure += Math.pow(Math.max(0, best.adjusted), CONFIG.deltaExponent);
  if (!forced && st.pressure < speedBar(CONFIG.emigrationBar)) return 0; // forced causes flee every turn
  const budget = Math.min(maxThisSource, warSurgeBudget(src, cause));
  const moved = planApply(src, ctx, best, budget);
  if (moved) {
    st.pressure = 0;
    if (!forced) st.cooldown = speedTurns(CONFIG.cooldownTurns);
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
  const ceilings = civMoveCeilings(sig);
  /** @type {Record<number, number>} */
  const usedByOwner = {};
  for (const src of sig) {
    // The stance-impact counterfactual is a single-cause estimate (real vs neutral borders), so it
    // uses the MERGED per-civ ceiling; the voluntary/crisis split only governs the real pass.
    const c = ceilings.get(src.owner);
    const ceiling = c ? c.voluntary + c.crisis : CONFIG.maxMovesPerTurn;
    const remaining = ceiling - (usedByOwner[src.owner] || 0);
    if (remaining <= 0) continue;
    usedByOwner[src.owner] = (usedByOwner[src.owner] || 0) + planSource(src, ctx, remaining);
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
  pollCrisis(); // cache the active age crisis so moves/deaths can be attributed to it
  const signals = collectCitySignals();
  const ranked = signals.length ? rankByProsperity(signals) : [];

  const state = loadState();
  prepareState(state, ranked);

  // Measure how border stance shaped this turn's flows (counterfactual vs neutral borders), on the
  // pre-pass world and before any mutation below.
  bankStanceImpact(ranked, state);

  const inboundCtx = makeInboundCtx();

  // Arrivals first: land anyone whose transit completed this turn (Feature 1b). These don't count
  // against the per-turn move cap - they're completing earlier departures.
  const migrations = processArrivals(state, ranked, inboundCtx);

  // Departures: need at least two cities for a move to be meaningful.
  if (ranked.length >= 2) {
    for (const m of processDepartures(state, ranked, inboundCtx)) migrations.push(m);
  }

  saveState(state);
  return migrations;
}

/**
 * The remaining per-track budget for a civ this turn: separate voluntary/crisis ceilings
 * (splitBudgetsEnabled) so a war never starves peacetime migration and vice versa, or one shared pool
 * (the legacy combined ceiling) otherwise.
 * @param {number} owner Civ id.
 * @param {Map<number, {voluntary:number, crisis:number}>} ceilings Per-civ ceilings.
 * @param {Record<number, {voluntary:number, crisis:number}>} used Per-civ usage so far.
 * @returns {{voluntary:number, crisis:number, shared:boolean}} The remaining budget.
 */
function remainingBudgets(owner, ceilings, used) {
  const c = ceilings.get(owner) || { voluntary: CONFIG.maxMovesPerTurn, crisis: 0 };
  const u = used[owner] || (used[owner] = { voluntary: 0, crisis: 0 });
  if (CONFIG.splitBudgetsEnabled) {
    return { voluntary: c.voluntary - u.voluntary, crisis: c.crisis - u.crisis, shared: false };
  }
  const rem = c.voluntary + c.crisis - (u.voluntary + u.crisis);
  return { voluntary: rem, crisis: rem, shared: true };
}

/** Count one applied record against its track's used budget (war/disaster/conquest/attrition → crisis).
 * @param {Record<number, {voluntary:number, crisis:number}>} used Usage map.
 * @param {number} owner Civ id. @param {string} cause The record's cause. */
function tallyUse(used, owner, cause) {
  const u = used[owner] || (used[owner] = { voluntary: 0, crisis: 0 });
  if (isCrisisTrack(cause)) u.crisis += 1;
  else u.voluntary += 1;
}

/**
 * Run every source's departures for the turn within each civ's per-track budgets (voluntary + crisis),
 * counting each applied record against the track its cause belongs to.
 * @param {*} state Loaded state (sources + monoTurn + transit).
 * @param {*[]} ranked Ranked signals.
 * @param {InboundCtx} inboundCtx Per-turn destination-inbound cap context.
 * @returns {Migration[]} The applied records.
 */
function processDepartures(state, ranked, inboundCtx) {
  const ownerPop = ownerPopulations(ranked);
  const ceilings = civMoveCeilings(ranked);
  /** @type {Record<number, {voluntary:number, crisis:number}>} */
  const used = {};
  /** @type {Migration[]} */
  const out = [];
  for (const src of ranked) {
    const budgets = remainingBudgets(src.owner, ceilings, used);
    if (budgets.voluntary <= 0 && budgets.crisis <= 0) continue; // this civ's budget spent; others run
    for (const m of processSource(src, ranked, state, ownerPop, budgets, inboundCtx)) {
      out.push(m);
      tallyUse(used, src.owner, m.cause);
    }
  }
  return out;
}
