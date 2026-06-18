// emigration-city-readout-data.js
//
// The DATA core for the per-city "why is this settlement gaining/losing population?" readout
// (the in-game legibility plan, Phase 0). Two layers:
//
//   • buildCitySnapshot(opts)  , PURE: turns already-resolved inputs into the readout view-model
//     (cause + label + permanence + hint, distress/at-risk flags, pressure-to-bar, where people are
//     being pulled, the destination's assimilation cost, and owner-level net/in/out). Unit-tested.
//   • citySnapshot(cityId)     , IMPURE: gathers those inputs live (recompute-on-read, so no new
//     persisted state) and calls the pure builder. Degrades to null on any read failure.
//
// Owner-level tallies are read from globalThis.EmigrationData at call time (not a static import) so
// this module does not depend on emigration-migration-stats.js , that file imports THIS one to
// expose citySnapshot on EmigrationData, and a static back-edge would be a cycle.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { causeLabel, causePermanence, causeHint } from "/emigration/ui/emigration-causes.js";
import { collectCitySignals } from "/emigration/ui/emigration-cities.js";
import { rankByProsperity, distress } from "/emigration/ui/emigration-prosperity.js";
import { bestDestination, migrationCause } from "/emigration/ui/emigration-pull.js";
import { loadState, ownerPopulations } from "/emigration/ui/emigration-state.js";
import { assimilationCostFor } from "/emigration/ui/emigration-effects.js";
import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { civAdjective } from "/emigration/ui/emigration-naming.js";

/**
 * The readout view-model for one city.
 * @typedef {Object} CitySnapshot
 * @property {number} [owner] Owner player id.
 * @property {string} cityName Display name.
 * @property {number} population Total population.
 * @property {number} rural Rural (mobile) population.
 * @property {string} [cause] Current migration cause (a MigrationCause value).
 * @property {string} causeLabel Display label for the cause.
 * @property {import("/emigration/ui/emigration-causes.js").Permanence} permanence Durability cue.
 * @property {string} hint One-line action hint.
 * @property {number} distress Situational distress magnitude (0 when content).
 * @property {boolean} atRisk Whether the city is under any situational distress.
 * @property {boolean} attritionRisk Distressed with no viable refuge (the outlet may fire).
 * @property {number} pressure Accumulated emigration pressure.
 * @property {number} pressureToBar Pressure as a fraction of the move bar (0–1).
 * @property {boolean} onCooldown Whether the source is resting after a recent move.
 * @property {number} cooldown Cooldown turns remaining.
 * @property {string} topDestinationName Where this city's people are currently pulled.
 * @property {number} [topDestinationOwner] That destination's owner id.
 * @property {boolean} crossCiv Whether the pull is to another civilization.
 * @property {number} assimLoad Destination-side assimilation load this owner carries.
 * @property {number} assimCostGold Per-turn gold the owner pays for that load.
 * @property {number} assimCostHappiness Per-turn happiness the owner pays for that load.
 * @property {number} ownerNet Owner cumulative net migration (people).
 * @property {number} ownerIn Owner cumulative immigration (people).
 * @property {number} ownerOut Owner cumulative emigration (people).
 * @property {{total:number, parts:{name:string, share:number}[]}|null} [composition] Ethnic
 *   composition: per-origin display name + share, largest first (null when untracked).
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
 * Source-state-derived fields (pressure / cooldown).
 * @param {{pressure?:number, cooldown?:number}|null} source Per-source state.
 * @returns {{pressure:number, pressureToBar:number, onCooldown:boolean, cooldown:number}} Fields.
 */
function pickSource(source) {
  const s = source || {};
  const pressure = num(s.pressure);
  const cooldown = num(s.cooldown);
  const bar = CONFIG.emigrationBar > 0 ? CONFIG.emigrationBar : 1;
  return { pressure, pressureToBar: clampUnit(pressure / bar), onCooldown: cooldown > 0, cooldown };
}

/**
 * Best-destination-derived fields (where people are pulled).
 * @param {{name?:string, owner?:number, crossCiv?:boolean}|null} bestDest The pull target.
 * @returns {{topDestinationName:string, topDestinationOwner?:number, crossCiv:boolean}} Fields.
 */
function pickDest(bestDest) {
  if (!bestDest) return { topDestinationName: "", topDestinationOwner: undefined, crossCiv: false };
  return {
    topDestinationName: bestDest.name || "",
    topDestinationOwner: bestDest.owner,
    crossCiv: !!bestDest.crossCiv
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
 * Build the readout view-model from already-resolved inputs (pure; no engine reads).
 * @param {{signal:*, cityName?:string, cause?:string, distress?:number,
 *          bestDest?:{name?:string,owner?:number,crossCiv?:boolean}|null,
 *          source?:{pressure?:number,cooldown?:number}|null,
 *          assim?:{load?:number,gold?:number,happiness?:number}|null,
 *          owner?:{net?:number,in?:number,out?:number}|null,
 *          composition?:{total:number, parts:{name:string, share:number}[]}|null}} o Inputs.
 * @returns {CitySnapshot} The snapshot.
 */
export function buildCitySnapshot(o) {
  const sig = o.signal || {};
  const cause = o.cause;
  const dist = num(o.distress);
  return {
    owner: sig.owner,
    cityName: o.cityName || "a settlement",
    population: num(sig.population),
    rural: num(sig.rural),
    cause,
    causeLabel: causeLabel(cause),
    permanence: causePermanence(cause),
    hint: causeHint(cause),
    distress: dist,
    atRisk: dist > 0,
    attritionRisk: attritionRisk(dist, !!o.bestDest),
    ...pickSource(o.source || null),
    ...pickDest(o.bestDest || null),
    ...pickAssim(o.assim || null),
    ...pickOwner(o.owner || null),
    composition: o.composition || null
  };
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
  return {
    total: comp.total,
    parts: comp.civs.map((c) => ({ name: civAdjective(c.civ), share: c.share }))
  };
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
 * @returns {{name:string, owner:number, crossCiv:boolean}} The descriptor.
 */
function destInfo(src, dest) {
  return {
    name: resolveCityName(dest.city),
    owner: dest.owner,
    crossCiv: src.owner !== dest.owner
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
    bestDest: best ? destInfo(sig, best.dest) : null,
    source: sources[sig.key] || null,
    assim: assimilationCostFor(sig.owner),
    owner: ownerStats(sig.owner),
    composition: resolveComposition(sig.city)
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
