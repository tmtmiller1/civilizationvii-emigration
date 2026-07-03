// emigration-city-readout-data.js
//
// The DATA core for the per-city "why is this settlement gaining/losing population?" readout
// (the in-game legibility plan, Phase 0). Two layers:
//
//   • buildCitySnapshot(opts), PURE: turns already-resolved inputs into the readout view-model
//     (cause + label + permanence + hint, distress/at-risk flags, pressure-to-bar, where people are
//     being pulled, the destination's assimilation cost, and owner-level net/in/out). Unit-tested.
//   • citySnapshot(cityId), IMPURE: gathers those inputs live (recompute-on-read, so no new
//     persisted state) and calls the pure builder. Degrades to null on any read failure.
//
// Owner-level tallies are read from globalThis.EmigrationData at call time (not a static import) so
// this module does not depend on emigration-migration-stats.js, that file imports THIS one to
// expose citySnapshot on EmigrationData, and a static back-edge would be a cycle.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { speedBar } from "/emigration/ui/emigration-game-speed.js";
import { causeLabel, causePermanence, causeHint } from "/emigration/ui/emigration-causes.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { rankByProsperity, distress } from "/emigration/ui/emigration-prosperity.js";
import { bestDestination, migrationCause, crisisTypeReasons } from "/emigration/ui/emigration-pull.js";
import { loadState, ownerPopulations } from "/emigration/ui/emigration-state.js";
import { assimilationCostFor } from "/emigration/ui/emigration-effects.js";
import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { civAdjective } from "/emigration/ui/emigration-naming.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { refugeePoolTotal } from "/emigration/ui/emigration-refugee-pool.js";
import { refugeeBurdenFor } from "/emigration/ui/emigration-refugee-burden.js";

/**
 * The readout view-model for one city.
 * @typedef {Object} CitySnapshot
 * @property {number} [owner] Owner player id.
 * @property {string} [cityKey] Stable source key (owner:localId).
 * @property {string} cityName Display name.
 * @property {number} population Total population.
 * @property {number} rural Rural (mobile) population.
 * @property {string} [cause] Current migration cause (a MigrationCause value).
 * @property {string} causeLabel Display label for the cause.
 * @property {{cause:string, label:string, share:number}[]|null} [causeMix] Concurrent-cause breakdown
 *   (top pressures by share) for the multi-cause readout, or null when off / single-cause.
 * @property {import("/emigration/ui/emigration-causes.js").Permanence} permanence Durability cue.
 * @property {string} hint One-line action hint.
 * @property {number} distress Situational distress magnitude (0 when content).
 * @property {boolean} atRisk Whether the city is under any situational distress.
 * @property {boolean} attritionRisk Distressed with no viable refuge (the outlet may fire).
 * @property {string[]} riskReasons The crisis-type tags behind any distress (siege/disaster/famine),
 *   for the readout warning's "why" (P0.2). Empty when the city is content.
 * @property {number} pressure Accumulated emigration pressure.
 * @property {number} pressureToBar Pressure as a fraction of the move bar (0–1).
 * @property {boolean} onCooldown Whether the source is resting after a recent move.
 * @property {number} cooldown Cooldown turns remaining.
 * @property {string} topDestinationName Where this city's people are currently pulled.
 * @property {number} [topDestinationOwner] That destination's owner id.
 * @property {boolean} crossCiv Whether the pull is to another civilization.
 * @property {string[]} destReasons The "why here" reason-tag keys for the current pull target (P0.1).
 * @property {number} assimLoad Destination-side assimilation load this owner carries.
 * @property {number} assimCostGold Per-turn gold the owner pays for that load.
 * @property {number} assimCostHappiness Per-turn happiness the owner pays for that load.
 * @property {number} ownerNet Owner cumulative net migration (people).
 * @property {number} ownerIn Owner cumulative immigration (people).
 * @property {number} ownerOut Owner cumulative emigration (people).
 * @property {{total:number, parts:{name:string, share:number}[]}|null} [composition] Ethnic
 *   composition: per-origin display name + share, largest first (null when untracked).
 * @property {number[]} netSeries Recent per-pass net migration for this city (oldest first), for the
 *   readout sparkline (Feature E). Empty when the option is off or there is no history.
 * @property {number} refugeePool Held refugee points currently assigned to this city.
 * @property {number} refugeeBurdenGold Owner-level refugee holding burden (gold/turn).
 * @property {number} refugeeBurdenHappiness Owner-level refugee holding burden (happiness/turn).
 */

/**
 * `v` if it's a finite number, else 0.
 * @param {*} v Value.
 * @returns {number} A finite number.
 */
function num(v) {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

/**
 * Clamp `x` into [0, 1].
 * @param {number} x Value.
 * @returns {number} Clamped value.
 */
function clampUnit(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Whether the outlet (attrition) may fire: the feature is on, distress is past its floor, and there
 * is no viable destination to absorb the people.
 * @param {number} dist Situational distress.
 * @param {boolean} hasRefuge Whether a destination was found.
 * @returns {boolean} True if at risk of attrition.
 */
function attritionRisk(dist, hasRefuge) {
  return !!CONFIG.attritionEnabled && dist >= CONFIG.attritionMinDistress && !hasRefuge;
}

/**
 * The crisis-type "why at risk" tags for the readout warning (P0.2): empty for a content city.
 * @param {number} dist Situational distress. @param {*} sig The city signal.
 * @returns {string[]} Crisis-type tags.
 */
function riskReasonsFor(dist, sig) {
  return dist > 0 ? crisisTypeReasons(sig) : [];
}

/**
 * Source-state-derived fields (pressure / cooldown).
 * @param {{pressure?:number, cooldown?:number}|null} source Per-source state.
 * @returns {{pressure:number, pressureToBar:number, onCooldown:boolean, cooldown:number}} Fields.
 */
function pickSource(source) {
  const s = source || {};
  const pressure = num(s.pressure);
  const cooldown = num(s.cooldown);
  const bar = speedBar(CONFIG.emigrationBar) > 0 ? speedBar(CONFIG.emigrationBar) : 1;
  return { pressure, pressureToBar: clampUnit(pressure / bar), onCooldown: cooldown > 0, cooldown };
}

/**
 * Best-destination-derived fields (where people are pulled).
 * @param {{name?:string, owner?:number, crossCiv?:boolean, reasons?:string[]}|null} bestDest The pull target.
 * @returns {{topDestinationName:string, topDestinationOwner?:number, crossCiv:boolean, destReasons:string[]}} Fields.
 */
function pickDest(bestDest) {
  if (!bestDest) {
    return { topDestinationName: "", topDestinationOwner: undefined, crossCiv: false, destReasons: [] };
  }
  return {
    topDestinationName: bestDest.name || "",
    topDestinationOwner: bestDest.owner,
    crossCiv: !!bestDest.crossCiv,
    destReasons: Array.isArray(bestDest.reasons) ? bestDest.reasons : []
  };
}

/**
 * Assimilation-cost fields.
 * @param {{load?:number, gold?:number, happiness?:number}|null} assim The owner's current cost.
 * @returns {{assimLoad:number, assimCostGold:number, assimCostHappiness:number}} Fields.
 */
function pickAssim(assim) {
  const a = assim || {};
  return {
    assimLoad: num(a.load),
    assimCostGold: num(a.gold),
    assimCostHappiness: num(a.happiness)
  };
}

/**
 * Owner-level cumulative-tally fields.
 * @param {{net?:number, in?:number, out?:number}|null} owner Owner cumulative tallies.
 * @returns {{ownerNet:number, ownerIn:number, ownerOut:number}} Fields.
 */
function pickOwner(owner) {
  const o = owner || {};
  return { ownerNet: num(o.net), ownerIn: num(o.in), ownerOut: num(o.out) };
}

/**
 * Refugee holding + burden fields.
 * @param {{refugeePool?:number, refugeeBurden?:{gold?:number,happiness?:number}|null}} o Inputs.
 * @returns {{refugeePool:number, refugeeBurdenGold:number, refugeeBurdenHappiness:number}} Fields.
 */
function pickRefugee(o) {
  return {
    refugeePool: num(o.refugeePool),
    refugeeBurdenGold: num(o.refugeeBurden?.gold),
    refugeeBurdenHappiness: num(o.refugeeBurden?.happiness)
  };
}

/**
 * Build the readout view-model from already-resolved inputs (pure; no engine reads).
 * @param {{signal:*, cityName?:string, cause?:string, distress?:number,
 *          bestDest?:{name?:string,owner?:number,crossCiv?:boolean,reasons?:string[]}|null,
 *          source?:{pressure?:number,cooldown?:number}|null,
 *          assim?:{load?:number,gold?:number,happiness?:number}|null,
 *          owner?:{net?:number,in?:number,out?:number}|null,
 *          composition?:{total:number, parts:{name:string, share:number}[]}|null,
 *          netSeries?:number[], refugeePool?:number,
 *          refugeeBurden?:{gold?:number,happiness?:number}|null}} o Inputs.
 * @returns {CitySnapshot} The snapshot.
 */
export function buildCitySnapshot(o) {
  const sig = o.signal || {};
  const cause = o.cause;
  const dist = num(o.distress);
  return {
    owner: sig.owner,
    cityKey: typeof sig.key === "string" ? sig.key : "",
    cityName: o.cityName || "a settlement",
    population: num(sig.population),
    rural: num(sig.rural),
    cause,
    causeLabel: causeLabel(cause),
    causeMix: readoutCauseMix(sig),
    permanence: causePermanence(cause),
    hint: causeHint(cause),
    distress: dist,
    atRisk: dist > 0,
    attritionRisk: attritionRisk(dist, !!o.bestDest),
    riskReasons: riskReasonsFor(dist, sig),
    ...pickSource(o.source || null),
    ...pickDest(o.bestDest || null),
    ...pickAssim(o.assim || null),
    ...pickOwner(o.owner || null),
    ...pickRefugee(o),
    composition: o.composition || null,
    netSeries: Array.isArray(o.netSeries) ? o.netSeries : []
  };
}

/**
 * The city's recent net-migration series (Feature E sparkline), read from the stats API at call time
 * (no static import; that would be a cycle). Empty when the sparkline is off or nothing is recorded yet.
 * @param {*} sig City signal.
 * @returns {number[]} Recent per-pass net pop-point values.
 */
function netSeriesFor(sig) {
  if (!CONFIG.cityReadoutSparkline || !sig) return [];
  const D = /** @type {*} */ (globalThis).EmigrationData;
  if (!D || typeof D.cityNetSeries !== "function") return [];
  const v = D.cityNetSeries(sig.owner + "|" + resolveCityName(sig.city));
  return Array.isArray(v) ? v : [];
}

/**
 * The CONCURRENT pressures pushing people from a city, as display shares (top 3), so the readout can
 * show "War 60% · Prosperity 40%" instead of one dominant cause, mirroring the engine's voluntary/crisis
 * split. Each acute pressure weighs by its intensity above threshold; prosperity is the economic
 * baseline. Returns null when the multi-cause readout is off (CONFIG.splitUiReadoutEnabled) or a city
 * has no signal, so the single-cause `causeLabel` is used instead.
 * @param {*} sig City signal (carries violence / disaster / happiness).
 * @returns {{cause:string, label:string, share:number}[]|null} Top causes by share, or null.
 */
function readoutCauseMix(sig) {
  if (!CONFIG.splitUiReadoutEnabled || !sig) return null;
  /** @type {Record<string, number>} */
  const w = { prosperity: 1 }; // ever-present economic baseline
  const vio = sig.violence || 0;
  const dis = sig.disaster || 0;
  const happy = sig.happiness || 0;
  if (vio >= CONFIG.violenceFleeThreshold) w.war = vio;
  if (dis >= CONFIG.disasterFleeThreshold) w.disaster = dis;
  if (happy < CONFIG.unhappyCauseThreshold) w.unhappiness = CONFIG.unhappyCauseThreshold - happy;
  const total = Object.keys(w).reduce((a, k) => a + w[k], 0) || 1;
  return Object.keys(w)
    .sort((a, b) => w[b] - w[a])
    .slice(0, 3)
    .map((k) => ({ cause: k, label: causeLabel(k), share: Math.round((w[k] / total) * 100) }));
}

/**
 * Resolve a settlement's ethnic composition into display-ready parts (origin civ adjective + share,
 * largest first), or null when untracked. Lives in the engine-reading layer so buildCitySnapshot
 * stays pure.
 * @param {*} city City object.
 * @returns {{total:number, parts:{name:string, share:number}[]}|null} The display composition.
 */
function resolveComposition(city) {
  const comp = compositionForCity(city);
  if (!comp || !comp.civs.length) return null;
  // Mask origins from policy-hidden civs (e.g. unmet) by merging them into one "Unknown" bucket,
  // so a visible settlement's breakdown never names a civ the player isn't allowed to see.
  /** @type {{name:string, share:number}[]} */
  const parts = [];
  let unknown = 0;
  for (const c of comp.civs) {
    if (civHidden(c.civ)) unknown += c.share;
    else parts.push({ name: civAdjective(c.civ), share: c.share });
  }
  if (unknown > 0) parts.push({ name: "Unknown", share: unknown });
  parts.sort((a, b) => b.share - a.share);
  return { total: comp.total, parts };
}

/**
 * Compose a city's display name defensively (mirrors the engine's resolver).
 * @param {*} city City object.
 * @returns {string} Name.
 */
function resolveCityName(city) {
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
 * Find the ranked signal matching `cityId` (a stable key, a city object, or a localId/id).
 * @param {*[]} ranked Ranked signals.
 * @param {*} cityId The key, city object, or numeric id.
 * @returns {*} The signal, or null.
 */
function findSignal(ranked, cityId) {
  for (const s of ranked) {
    if (s.key === cityId || s.city === cityId) return s;
    const lid = s.city && (s.city.localId ?? s.city.id);
    if (lid != null && lid === cityId) return s;
  }
  return null;
}

/**
 * Owner-level cumulative tallies, read from globalThis.EmigrationData (0s when absent).
 * @param {number} pid Owner player id.
 * @returns {{net:number, in:number, out:number}} The tallies.
 */
function ownerStats(pid) {
  const D = /** @type {*} */ (globalThis).EmigrationData;
  if (!D) return { net: 0, in: 0, out: 0 };
  return {
    net: D.netCumFor ? D.netCumFor(pid) : 0,
    in: D.grossInCumFor ? D.grossInCumFor(pid) : 0,
    out: D.grossOutCumFor ? D.grossOutCumFor(pid) : 0
  };
}

/**
 * The best-destination descriptor for a source's current pull, or null.
 * @param {*} src Source signal.
 * @param {*} dest The chosen destination signal.
 * @param {string[]} [reasons] The "why here" reason tags for this pull (P0.1).
 * @returns {{name:string, owner:number, crossCiv:boolean, reasons:string[]}} The descriptor.
 */
function destInfo(src, dest, reasons) {
  return {
    name: resolveCityName(dest.city),
    owner: dest.owner,
    crossCiv: src.owner !== dest.owner,
    reasons: reasons || []
  };
}

/**
 * Build a snapshot for one already-ranked signal (the shared core of the single-city and
 * per-owner readers, so the world is ranked once per call site).
 * @param {*} sig The ranked city signal.
 * @param {*[]} ranked All ranked signals.
 * @param {Record<number, number>} ownerPop Per-owner population (congestion).
 * @param {Record<string, *>} sources Per-source engine state.
 * @returns {CitySnapshot} The snapshot.
 */
function snapshotFromRanked(sig, ranked, ownerPop, sources) {
  const best = bestDestination(sig, ranked, ownerPop);
  return buildCitySnapshot({
    signal: sig,
    cityName: resolveCityName(sig.city),
    cause: migrationCause(sig),
    distress: distress(sig),
    bestDest: best ? destInfo(sig, best.dest, best.reasons) : null,
    source: sources[sig.key] || null,
    assim: assimilationCostFor(sig.owner),
    owner: ownerStats(sig.owner),
    composition: resolveComposition(sig.city),
    netSeries: netSeriesFor(sig),
    refugeePool: refugeePoolTotal(sig.key),
    refugeeBurden: refugeeBurdenFor(sig.owner)
  });
}

/**
 * Build a live snapshot for one city (recompute-on-read). Ranks the world, finds the city, and
 * resolves its current cause / pull target / pressure / distress / owner cost. Returns null if the
 * city can't be found or any read fails.
 * @param {*} cityId A stable city key, a city object, or a numeric localId/id.
 * @returns {CitySnapshot|null} The snapshot, or null.
 */
export function citySnapshot(cityId) {
  try {
    const signals = collectCitySignals();
    if (!signals.length) return null;
    const ranked = rankByProsperity(signals);
    const sig = findSignal(ranked, cityId);
    if (!sig) return null;
    return snapshotFromRanked(sig, ranked, ownerPopulations(ranked), loadState().sources || {});
  } catch (_) {
    return null;
  }
}

/**
 * Live snapshots for every city a player owns (recompute-on-read; the world is ranked once).
 * Drives the dashboards' per-city pressure table. Empty on any read failure.
 * @param {number} pid Owner player id.
 * @returns {CitySnapshot[]} The snapshots.
 */
export function ownerCitySnapshots(pid) {
  try {
    const signals = collectCitySignals();
    if (!signals.length) return [];
    const ranked = rankByProsperity(signals);
    const ownerPop = ownerPopulations(ranked);
    const sources = loadState().sources || {};
    /** @type {CitySnapshot[]} */
    const out = [];
    for (const sig of ranked) {
      if (sig.owner === pid) out.push(snapshotFromRanked(sig, ranked, ownerPop, sources));
    }
    return out;
  } catch (_) {
    return [];
  }
}
