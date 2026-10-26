// emigration-city-readout-data.js
//
// The data core for the per-city "why is this settlement gaining/losing population?" readout.
// Two layers:
//
//   • buildCitySnapshot(opts), pure: turns already-resolved inputs into the readout view-model
//     (cause + label + permanence + hint, distress/at-risk flags, pressure-to-bar, where people are
//     being pulled, the destination's assimilation cost, and owner-level net/in/out). Unit-tested.
//   • citySnapshot(cityId), impure: gathers those inputs live (recompute-on-read, so no new
//     persisted state) and calls the pure builder. Degrades to null on any read failure.
//
// Owner-level tallies are read from globalThis.EmigrationData at call time (not a static import) so
// this module does not depend on emigration-migration-stats.js, that file imports this one to
// expose citySnapshot on EmigrationData, and a static back-edge would be a cycle.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { loc } from "/emigration/ui/emigration-loc.js";
import { speedBar } from "/emigration/ui/emigration-game-speed.js";
import { causeLabel, causePermanence, causeHint } from "/emigration/ui/emigration-causes.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { rankByProsperity, distress } from "/emigration/ui/emigration-prosperity.js";
import { bestDestination, migrationCause, crisisTypeReasons } from "/emigration/ui/emigration-pull.js";
import { prescribe } from "/emigration/ui/emigration-prescribe.js";
import { loadState, ownerPopulations, isCityClosed } from "/emigration/ui/emigration-state.js";
import { assimilationCostFor } from "/emigration/ui/emigration-effects.js";
import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { civAdjective } from "/emigration/ui/emigration-naming.js";
import { enclaveStageAt, stageLine, nextLine, blockerLines } from "/emigration/ui/emigration-enclave-stage-read.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { refugeePoolTotal } from "/emigration/ui/emigration-refugee-pool.js";
import { refugeeBurdenFor } from "/emigration/ui/emigration-refugee-burden.js";
import { siegeStalled } from "/emigration/ui/emigration-violence.js";
import { forecastFor } from "/emigration/ui/emigration-forecast.js";

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
 * @property {string[]} stayReasons LOC name tags of wonders/buildings arguing for staying (top 5).
 * @property {number} builtScore The settlement's built-environment score.
 * @property {{cause:string, label:string, share:number}[]|null} [causeMix] Concurrent-cause breakdown
 *   (top pressures by share) for the multi-cause readout, or null when off / single-cause.
 * @property {import("/emigration/ui/emigration-causes.js").Permanence} permanence Durability cue.
 * @property {string} hint One-line action hint.
 * @property {number} distress Situational distress magnitude (0 when content).
 * @property {boolean} atRisk Whether the city is under any situational distress.
 * @property {boolean} attritionRisk Distressed with no viable refuge (the outlet may fire).
 * @property {string[]} riskReasons The crisis-type tags behind any distress (siege/disaster/famine),
 *   for the readout warning's "why". Empty when the city is content.
 * @property {boolean} siegeStalled Besieged, but nobody has attacked for a while: the siege adds no
 *   pressure and kills nobody until it does.
 * @property {boolean} closedToNewcomers The owner closed this settlement to newcomers.
 * @property {number[]} pressureSeries Recent emigration-pressure samples (oldest first), the forecast's input.
 * @property {import("/emigration/ui/emigration-forecast.js").Forecast|null} forecast When the pressure is
 *   likely to reach the bar and how many go, or null when the option is off.
 * @property {number} pressure Accumulated emigration pressure.
 * @property {number} pressureToBar Pressure as a fraction of the move bar (0–1).
 * @property {boolean} onCooldown Whether the source is resting after a recent move.
 * @property {number} cooldown Cooldown turns remaining.
 * @property {string} topDestinationName Where this city's people are currently pulled.
 * @property {number} [topDestinationOwner] That destination's owner id.
 * @property {boolean} crossCiv Whether the pull is to another civilization.
 * @property {string[]} destReasons The "why here" reason-tag keys for the current pull target.
 * @property {number} assimLoad Destination-side assimilation load this owner carries.
 * @property {number} assimCostGold Per-turn gold the owner pays for that load.
 * @property {number} assimCostHappiness Per-turn happiness the owner pays for that load.
 * @property {import("/emigration/ui/emigration-prescribe.js").Fix|null} fix What would stop people leaving.
 * @property {number} ownerNet Owner cumulative net migration (people).
 * @property {number} ownerIn Owner cumulative immigration (people).
 * @property {number} ownerOut Owner cumulative emigration (people).
 * @property {{total:number, parts:{name:string, share:number}[]}|null} [composition] Ethnic
 *   composition: per-origin display name + share, largest first (null when untracked).
 * @property {EnclaveReadout|null} enclave The leading foreign community's progress toward an enclave, or null.
 * @property {number[]} netSeries Recent per-pass net migration for this city (oldest first), for the
 *   readout sparkline. Empty when the option is off or there is no history.
 * @property {number} refugeePool Held refugee points currently assigned to this city.
 * @property {number} refugeeBurdenGold Owner-level refugee holding burden (gold/turn).
 * @property {number} refugeeBurdenHappiness Owner-level refugee holding burden (happiness/turn).
 */

/** @param {*} v */
function num(v) {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

/**
 * @param {number} x
 * @returns {number}
 */
function clampUnit(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Whether the outlet (attrition) may fire: the feature is on, distress is past its floor, and there
 * is no viable destination to absorb the people.
 * @param {number} dist Situational distress.
 * @param {boolean} hasRefuge Whether a destination was found.
 * @returns {boolean}
 */
function attritionRisk(dist, hasRefuge) {
  return !!CONFIG.attritionEnabled && dist >= CONFIG.attritionMinDistress && !hasRefuge;
}

/**
 * @param {number} dist Situational distress. @param {*} sig The city signal.
 * @returns {string[]}
 */
function riskReasonsFor(dist, sig) {
  return dist > 0 ? crisisTypeReasons(sig) : [];
}

/**
 * @param {{pressure?:number, cooldown?:number}|null} source Per-source state.
 * @returns {{pressure:number, pressureToBar:number, onCooldown:boolean, cooldown:number}}
 */
function pickSource(source) {
  const s = source || {};
  const pressure = num(s.pressure);
  const cooldown = num(s.cooldown);
  const bar = speedBar(CONFIG.emigrationBar) > 0 ? speedBar(CONFIG.emigrationBar) : 1;
  return { pressure, pressureToBar: clampUnit(pressure / bar), onCooldown: cooldown > 0, cooldown };
}

/**
 * @param {{name?:string, owner?:number, crossCiv?:boolean, reasons?:string[]}|null} bestDest The pull target.
 * @returns {{topDestinationName:string, topDestinationOwner?:number, crossCiv:boolean, destReasons:string[]}}
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

/** @param {{load?:number, gold?:number, happiness?:number}|null} assim */
function pickAssim(assim) {
  const a = assim || {};
  return {
    assimLoad: num(a.load),
    assimCostGold: num(a.gold),
    assimCostHappiness: num(a.happiness)
  };
}

/** @param {{net?:number, in?:number, out?:number}|null} owner */
function pickOwner(owner) {
  const o = owner || {};
  return { ownerNet: num(o.net), ownerIn: num(o.in), ownerOut: num(o.out) };
}

/** @param {{refugeePool?:number, refugeeBurden?:{gold?:number,happiness?:number}|null}} o */
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
 *          fix?:import("/emigration/ui/emigration-prescribe.js").Fix|null,
 *          source?:{pressure?:number,cooldown?:number}|null,
 *          assim?:{load?:number,gold?:number,happiness?:number}|null,
 *          owner?:{net?:number,in?:number,out?:number}|null,
 *          composition?:{total:number, parts:{name:string, share:number}[]}|null,
 *          enclave?:EnclaveReadout|null,
 *          netSeries?:number[], refugeePool?:number,
 *          refugeeBurden?:{gold?:number,happiness?:number}|null, siegeStalled?:boolean,
 *          closedToNewcomers?:boolean, pressureSeries?:number[]}} o
 * @returns {CitySnapshot}
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
    fix: o.fix || null,
    atRisk: dist > 0,
    attritionRisk: attritionRisk(dist, !!o.bestDest),
    riskReasons: riskReasonsFor(dist, sig),
    siegeStalled: !!o.siegeStalled,
    closedToNewcomers: !!o.closedToNewcomers,
    // What the settlement holds that argues for staying, named. LOC tags straight from the database
    // (emigration-built.js), resolved by the renderer, so the readout can say "Granary, Market,
    // Academy" instead of only showing a number that went up.
    stayReasons: Array.isArray(sig.builtNames) ? sig.builtNames.slice(0, 5) : [],
    builtScore: num(sig.built),
    ...pickSource(o.source || null),
    ...pickForecast(o, sig),
    ...pickDest(o.bestDest || null),
    ...pickAssim(o.assim || null),
    ...pickOwner(o.owner || null),
    ...pickRefugee(o),
    ...pickCommunity(o)
  };
}

/** @param {{composition?:*, enclave?:*, netSeries?:number[]}} o */
function pickCommunity(o) {
  return {
    composition: o.composition || null,
    enclave: o.enclave || null,
    netSeries: Array.isArray(o.netSeries) ? o.netSeries : []
  };
}

/**
 * @typedef {Object} EnclaveReadout The settlement's enclave stage, worded (emigration-enclave-stage-read.js).
 * @property {string} stage The stage line ("Greek community: foothold"). @property {string} next The next step,
 *   or "". @property {string[]} blockers What holds it back, one plain line each.
 * @property {import("/emigration/ui/emigration-enclave-stage.js").StageInfo} info The figures behind them.
 */

/**
 * The settlement's enclave stage and its next step, against the same live bars and caps the mechanic uses,
 * or null when it has no foreign community and no enclave. Turns are the monotonic turn the stats module
 * keeps, read through the shared facade (no static import: that module imports this one).
 * @param {*} city A live city object. @returns {EnclaveReadout|null}
 */
function resolveEnclave(city) {
  try {
    const D = /** @type {*} */ (globalThis).EmigrationData;
    const turn = D && typeof D.monoTurn === "function" ? D.monoTurn() : 0;
    const loc = city && city.location;
    const key = loc && typeof loc.x === "number" ? loc.x + "," + loc.y : "";
    const v = enclaveStageAt(city, key, city.owner, turn);
    if (!v) return null;
    const name = resolveCityName(city);
    return { stage: stageLine(v), next: nextLine(v, name), blockers: blockerLines(v, name), info: v.info };
  } catch (_) {
    return null;
  }
}

/**
 * The source's recent pressure samples from the stats store (the engine key), for the forecast.
 * @param {*} sig City signal. @returns {number[]} Oldest first; empty when none.
 */
function pressureSeriesFor(sig) {
  if (!CONFIG.cityReadoutForecast || !sig) return [];
  const D = /** @type {*} */ (globalThis).EmigrationData;
  if (!D || typeof D.cityPressureSeries !== "function") return [];
  const v = D.cityPressureSeries(sig.key);
  return Array.isArray(v) ? v : [];
}

/**
 * The forecast and the samples behind it (Feature M).
 * @param {{source?:*, pressureSeries?:number[]}} o The inputs. @param {*} sig The signal (its rural pool).
 * @returns {{pressureSeries:number[], forecast:import("/emigration/ui/emigration-forecast.js").Forecast|null}}
 */
function pickForecast(o, sig) {
  const pressureSeries = Array.isArray(o.pressureSeries) ? o.pressureSeries : [];
  const source = pickSource(o.source || null);
  return { pressureSeries, forecast: forecastFor({ ...source, pressureSeries, rural: num(sig.rural) }) };
}

/** @param {*} sig City signal. @returns {number[]} The recent net series for the sparkline. */
function netSeriesFor(sig) {
  if (!CONFIG.cityReadoutSparkline || !sig) return [];
  const D = /** @type {*} */ (globalThis).EmigrationData;
  if (!D || typeof D.cityNetSeries !== "function") return [];
  const v = D.cityNetSeries(sig.owner + "|" + resolveCityName(sig.city));
  return Array.isArray(v) ? v : [];
}

/**
 * The concurrent pressures pushing people from a city, as display shares (top 3, "War 60% · Prosperity
 * 40%"). Each acute pressure weighs by its intensity above threshold; prosperity is the economic baseline.
 * Null when the multi-cause readout is off (CONFIG.splitUiReadoutEnabled) or a city has no signal.
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
 * @param {*} city
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
  if (unknown > 0) parts.push({ name: loc("LOC_EMIG_ETH_UNKNOWN", "Unknown"), share: unknown });
  parts.sort((a, b) => b.share - a.share);
  return { total: comp.total, parts };
}

/**
 * Compose a city's display name defensively (mirrors the engine's resolver).
 * @param {*} city
 * @returns {string}
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
 * @param {*[]} ranked
 * @param {*} cityId The key, city object, or numeric id.
 * @returns {*} The signal, or null.
 */
function findSignal(ranked, cityId) {
  for (const s of ranked) if (signalMatches(s, cityId)) return s;
  return null;
}

/**
 * Whether a signal is the city `cityId` names: its stable key, its city object, its numeric localId/id, or the
 * game's ComponentID ({owner, id, type}) that CitySelectionChanged carries.
 * @param {*} s A city signal. @param {*} cityId
 * @returns {boolean}
 */
function signalMatches(s, cityId) {
  if (s.key === cityId || s.city === cityId) return true;
  if (!s.city) return false;
  return isComponentId(cityId) ? componentIdMatches(s.city.id, cityId) : localIdMatches(s.city, cityId);
}

/** @param {*} v @returns {boolean} */
function isComponentId(v) {
  return !!v && typeof v === "object" && typeof v.owner === "number" && typeof v.id === "number";
}

/** @param {*} own The city's own id. @param {*} cid A ComponentID. @returns {boolean} */
function componentIdMatches(own, cid) {
  return !!own && typeof own === "object" && own.owner === cid.owner && own.id === cid.id;
}

/** @param {*} city @param {*} cityId A numeric id. @returns {boolean} */
function localIdMatches(city, cityId) {
  const lid = city.localId ?? city.id;
  return lid != null && lid === cityId;
}

/**
 * @param {number} pid Owner player id.
 * @returns {{net:number, in:number, out:number}}
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
 * @param {*} src Source signal.
 * @param {*} dest The chosen destination signal.
 * @param {string[]} [reasons] The "why here" reason tags for this pull.
 * @returns {{name:string, owner:number, crossCiv:boolean, reasons:string[]}}
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
 * @returns {CitySnapshot}
 */
function snapshotFromRanked(sig, ranked, ownerPop, sources) {
  const best = bestDestination(sig, ranked, ownerPop, (d) => !isCityClosed(d));
  return buildCitySnapshot({
    signal: sig,
    cityName: resolveCityName(sig.city),
    cause: migrationCause(sig),
    distress: distress(sig),
    bestDest: best ? destInfo(sig, best.dest, best.reasons) : null,
    fix: prescribe(sig, ranked, ownerPop),
    source: sources[sig.key] || null,
    assim: assimilationCostFor(sig.owner),
    owner: ownerStats(sig.owner),
    composition: resolveComposition(sig.city),
    enclave: resolveEnclave(sig.city),
    netSeries: netSeriesFor(sig),
    pressureSeries: pressureSeriesFor(sig),
    refugeePool: refugeePoolTotal(sig.key),
    refugeeBurden: refugeeBurdenFor(sig.owner),
    siegeStalled: siegeStalled(sig.city),
    closedToNewcomers: isCityClosed(sig)
  });
}

/**
 * Build a live snapshot for one city (recompute-on-read). Ranks the world, finds the city, and
 * resolves its current cause / pull target / pressure / distress / owner cost. Returns null if the
 * city can't be found or any read fails.
 * @param {*} cityId A stable city key, a city object, or a numeric localId/id.
 * @returns {CitySnapshot|null}
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
 * Live snapshots for every city in the world (recompute-on-read; the world is ranked once), for the Settlements
 * tab's All civilizations view, which shows each settlement's pressure. Empty on any read failure.
 * @returns {CitySnapshot[]}
 */
export function allCitySnapshots() {
  try {
    const signals = collectCitySignals();
    if (!signals.length) return [];
    const ranked = rankByProsperity(signals);
    const ownerPop = ownerPopulations(ranked);
    const sources = loadState().sources || {};
    return ranked.map((sig) => snapshotFromRanked(sig, ranked, ownerPop, sources));
  } catch (_) {
    return [];
  }
}

/**
 * Live snapshots for every city a player owns (recompute-on-read; the world is ranked once).
 * Drives the dashboards' per-city pressure table. Empty on any read failure.
 * @param {number} pid Owner player id.
 * @returns {CitySnapshot[]}
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
