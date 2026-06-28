// emigration-composition.js
//
// Per-settlement ETHNIC COMPOSITION ledger: for each settlement, the standing mix of population by
// the CIVILIZATION its people originate from. Unlike the cumulative flow matrix (who-moved-where),
// this is the current makeup of each city, netted over time , and it follows the SETTLEMENT, not
// the owner, so a conquered city keeps the origins of the people already living there. It feeds the
// ethnicity lens (tile colouring) and the per-city readout breakdown.
//
// Identity = the city-CENTRE plot (x,y), which is stable across conquest (a settlement stays on the
// same tile when it changes hands). Migrations are keyed by city NAME in the records, so a
// name→location map (built from the current city signals each pass) bridges the two.
//
// Update model (per pass, from data the mod already collects in emigration-main's doPass):
//   • First sighting / founding → 100% the current owner.
//   • Migration IN  → arrivals add to the migrant's ORIGIN civ bucket (source owner).
//   • Migration OUT / attrition → removed PROPORTIONALLY from the city's existing mix.
//   • Conquest (owner change at the same tile) → buckets unchanged; only the owner field flips.
//   • Natural growth (residual increase) → counts as the CURRENT OWNER's ethnicity.
//   • External loss (residual decrease) → removed proportionally.
// The total is always reconciled to the real city population, so counts never drift; only the rare
// case of an arrival from an out-of-vision source can't name its origin (it falls to the owner).
//
// State persists in GameConfiguration under its own key (additive; older saves simply start empty).

import { cityName } from "/emigration/ui/emigration-migration-records.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { atWarBetween } from "/emigration/ui/emigration-geography.js";
import { getIntegrationEnabled } from "/emigration/ui/emigration-settings.js";

const STATE_KEY = "EmigrationEthnos_v1";

/**
 * @typedef {Object} CityComposition
 * @property {number} owner Current owner player id.
 * @property {Record<string, number>} byCiv Population points keyed by ORIGIN civ id.
 * @property {number} total Last-reconciled total population (points).
 * @property {string} name Last-seen display name (for the readout).
 * @property {number} seenTurn Last turn this settlement was observed.
 */

/** @typedef {{ cities: Record<string, CityComposition> }} CompositionState */

/** @type {CompositionState | null} */
let _s = null;
// The turn `_s` was last (re)read from persistence. The recorder (gameplay context) and the readers
// (the ethnicity lens, its hover tooltip, the city readout) run in SEPARATE V8 contexts, each with
// its own module instance, sharing this state ONLY through the persisted GameConfiguration blob. So a
// reader that loaded `_s` once and cached it forever would freeze on whatever the city mix was at its
// first paint/hover — typically near-mono early game — and never see the diaspora the recorder banks
// turn after turn. Re-reading whenever the turn advances lets every reader pick up the recorder's
// latest save (at most one turn stale), so immigration actually shows on the lens. Harmless for the
// recorder itself: it always save()s before the turn ticks, so a reload just re-reads its own write.
let _loadedTurn = -1;

/**
 * The current age-local game turn, or 0.
 * @returns {number} Game.turn or 0.
 */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * The raw persisted state string, or null.
 * @returns {string|null} Stored JSON, or null.
 */
function readStored() {
  const g = Configuration?.getGame?.();
  const v = g && typeof g.getValue === "function" ? g.getValue(STATE_KEY) : null;
  return typeof v === "string" && v.length ? v : null;
}

const MAX_CITIES = 8192; // bound the persisted map even if a prior save's pruning never ran

/**
 * `v` when it is a finite number, else the fallback. Mirrors the per-field coercion the sibling state
 * files use so a corrupt/old-schema value can never reach the read paths as a string/NaN/undefined.
 * @param {*} v A raw value. @param {number} d The fallback. @returns {number} A finite number.
 */
function numOr(v, d) {
  return typeof v === "number" && isFinite(v) ? v : d;
}

/**
 * Clean a raw byCiv map to finite, positive buckets, summing them.
 * @param {*} raw A raw byCiv object. @returns {{byCiv:Record<string,number>, sum:number}} Clean map + sum.
 */
function cleanByCiv(raw) {
  /** @type {Record<string, number>} */
  const byCiv = {};
  let sum = 0;
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    if (typeof v === "number" && isFinite(v) && v > 0) {
      byCiv[k] = v;
      sum += v;
    }
  }
  return { byCiv, sum };
}

/**
 * Coerce one persisted composition entry into the canonical shape, or null to drop it. Guards every
 * read path (compositionForCity/Owner, sumByCiv, pruneStale) against a corrupt or old-schema blob:
 * `byCiv` must be a plain object of finite positive buckets, and total/owner/seenTurn finite numbers.
 * @param {*} e A raw entry. @returns {CityComposition|null} The clean entry, or null.
 */
function normalizeEntry(e) {
  if (!e || typeof e !== "object" || !e.byCiv || typeof e.byCiv !== "object") return null;
  const { byCiv, sum } = cleanByCiv(e.byCiv);
  if (sum <= 0) return null;
  const total = numOr(e.total, 0);
  return {
    owner: numOr(e.owner, -1),
    byCiv,
    total: total > 0 ? total : sum,
    name: typeof e.name === "string" ? e.name : "",
    seenTurn: Math.max(0, numOr(e.seenTurn, 0))
  };
}

/**
 * Normalize the persisted cities map: keep only well-formed entries, bounded to MAX_CITIES.
 * @param {*} rawCities The raw cities object. @returns {Record<string, CityComposition>} The clean map.
 */
function normalizeCities(rawCities) {
  /** @type {Record<string, CityComposition>} */
  const out = {};
  let n = 0;
  for (const key of Object.keys(rawCities)) {
    if (n >= MAX_CITIES) break;
    const clean = normalizeEntry(rawCities[key]);
    if (clean) {
      out[key] = clean;
      n++;
    }
  }
  return out;
}

/**
 * Load (once) the persisted composition. Every entry is normalized on load so no malformed/old-schema
 * entry can reach the (uncaught) lens/tooltip/readout render paths.
 * @returns {CompositionState} State.
 */
function load() {
  const turn = gameTurn();
  if (_s && _loadedTurn === turn) return _s; // same turn → reuse (no churn within a pass)
  _loadedTurn = turn;
  try {
    const raw = readStored();
    if (raw) {
      const o = JSON.parse(raw);
      if (o && o.cities && typeof o.cities === "object") {
        _s = { cities: normalizeCities(o.cities) };
        return _s;
      }
    }
  } catch (_) {
    /* ignore */
  }
  // Nothing persisted yet: keep any existing in-memory state (the recorder mid-game before its first
  // save, or a test's seeded state) rather than wiping it; only initialise when truly empty.
  if (!_s) _s = { cities: {} };
  return _s;
}

/** Persist the composition to GameConfiguration. */
function save() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(_s));
  } catch (_) {
    /* ignore */
  }
}

/**
 * The city-centre plot key "x,y", or null when the location is unreadable.
 * @param {*} city City object.
 * @returns {string|null} The stable settlement key.
 */
function locKey(city) {
  const loc = city && city.location;
  if (!loc || typeof loc.x !== "number" || typeof loc.y !== "number") return null;
  return loc.x + "," + loc.y;
}

/**
 * Sum a composition entry's per-civ buckets.
 * @param {CityComposition} e Entry.
 * @returns {number} Total points across origins.
 */
function sumByCiv(e) {
  let total = 0;
  for (const k of Object.keys(e.byCiv)) total += e.byCiv[k] || 0;
  return total;
}

/**
 * Add `pts` of origin-`civ` population to a composition entry.
 * @param {CityComposition} e Entry.
 * @param {number} civ Origin civ id.
 * @param {number} pts Points to add (no-op when <= 0).
 */
function addCiv(e, civ, pts) {
  if (!(pts > 0) || typeof civ !== "number") return;
  e.byCiv[civ] = (e.byCiv[civ] || 0) + pts;
}

// Origin buckets below this many population points are pruned as dust before renormalizing, a
// fully-departed minority leaves float crumbs that would otherwise linger as phantom origins.
const DUST = 0.05;

/**
 * Remove `pts` population proportionally across an entry's origins (a departing/dying crowd
 * reflects who lived there). Keeps full precision (dust pruning + exact renormalization happen once
 * per pass in reconcileCity); only truly-zero buckets are dropped.
 * @param {CityComposition} e Entry.
 * @param {number} pts Points to remove (no-op when <= 0).
 */
function removeProportional(e, pts) {
  const sum = sumByCiv(e);
  if (!(pts > 0) || sum <= 0) return;
  const factor = Math.max(0, (sum - pts) / sum);
  for (const k of Object.keys(e.byCiv)) {
    const v = (e.byCiv[k] || 0) * factor;
    if (v <= 1e-9) delete e.byCiv[k];
    else e.byCiv[k] = v;
  }
}

/**
 * Prune dust origins, then rescale the survivors so the buckets sum EXACTLY to `total`, the city's
 * real population. This is the consistency guarantee: a settlement's composition total (and so its
 * shares) always matches the population the rest of the mod reports. Falls back to 100% owner if
 * everything pruned, and clears the mix when the population is gone.
 * @param {CityComposition} e Entry.
 * @param {number} total The city's real population (points).
 * @param {number} owner Current owner (the fallback origin).
 */
function normalizeToTotal(e, total, owner) {
  for (const k of Object.keys(e.byCiv)) {
    if ((e.byCiv[k] || 0) < DUST) delete e.byCiv[k];
  }
  if (total <= 0) {
    e.byCiv = {};
    return;
  }
  const sum = sumByCiv(e);
  if (sum <= 0) {
    e.byCiv = { [owner]: total };
    return;
  }
  const f = total / sum;
  for (const k of Object.keys(e.byCiv)) e.byCiv[k] = e.byCiv[k] * f;
}

/**
 * Seed first-sighting cities (100% owner) and flip the owner on a conquered settlement, so a later
 * arrival/growth attributes correctly. Also collects each ownership FLIP as a conquest event (prev →
 * new owner + the captured population), so the caller can credit the conqueror's net migration.
 * @param {CompositionState} s State.
 * @param {*[]} signals Current city signals.
 * @returns {{work:{key:string, owner:number, total:number, name:string}[],
 *   conquests:{prevOwner:number, newOwner:number, name:string, points:number}[]}} Work list + flips.
 */
function seedCities(s, signals) {
  /** @type {{key:string, owner:number, total:number, name:string}[]} */
  const work = [];
  /** @type {{prevOwner:number, newOwner:number, name:string, points:number}[]} */
  const conquests = [];
  for (const sig of signals || []) {
    const key = locKey(sig.city);
    if (key == null || typeof sig.owner !== "number") continue;
    const total = sig.population || 0;
    const name = cityName(sig.city);
    const e = s.cities[key];
    if (!e) {
      s.cities[key] = { owner: sig.owner, byCiv: { [sig.owner]: total }, total, name, seenTurn: 0 };
    } else {
      const cap = captureOf(e, sig.owner, name, total); // flips e.owner; returns the capture or null
      if (cap) conquests.push(cap);
    }
    work.push({ key, owner: sig.owner, total, name });
  }
  return { work, conquests };
}

/**
 * Flip a known city's owner to `newOwner`, returning the capture event when it actually changed hands
 * (both owners valid + some population remained), else null. Keeps the origin buckets unchanged.
 * @param {*} e The stored composition entry (its `owner` is updated in place).
 * @param {number} newOwner The current owner from the signal.
 * @param {string} name The city name.
 * @param {number} total The city's current population (points).
 * @returns {{prevOwner:number, newOwner:number, name:string, points:number}|null} The capture, or null.
 */
function captureOf(e, newOwner, name, total) {
  if (e.owner === newOwner) return null;
  const cap = e.owner >= 0 && newOwner >= 0 && total > 0
    ? { prevOwner: e.owner, newOwner, name, points: total } : null;
  e.owner = newOwner; // conquest: keep buckets, flip owner
  return cap;
}

/**
 * Apply a migration's SOURCE side: the source city loses `pts` people proportionally across its
 * mix (a departure or attrition death).
 * @param {CompositionState} s State.
 * @param {*} m Migration record.
 * @param {Map<string,string>} nameToLoc city name → loc key.
 * @param {number} pts Points moved.
 */
function applyMigrationSource(s, m, nameToLoc, pts) {
  if (typeof m.srcOwner !== "number" || !m.srcName) return;
  const srcKey = nameToLoc.get(m.srcName);
  const srcE = srcKey ? s.cities[srcKey] : null;
  if (!srcE) return;
  // A return move takes a SPECIFIC origin's people (the returnees), so remove them from that origin's
  // bucket; everything else (ordinary departure / death) removes proportionally across the mix.
  if (typeof m.originCiv === "number") removeFromOrigin(srcE, m.originCiv, pts);
  else removeProportional(srcE, pts);
}

/**
 * Remove `pts` people specifically from one origin bucket (a return takes that origin's own people),
 * falling back to a proportional removal for any remainder the bucket couldn't cover.
 * @param {CityComposition} e Entry. @param {number} civ The origin to remove. @param {number} pts People.
 */
function removeFromOrigin(e, civ, pts) {
  if (!(pts > 0)) return;
  const have = e.byCiv[civ] || 0;
  const take = Math.min(have, pts);
  if (take > 0) {
    e.byCiv[civ] = have - take;
    if (e.byCiv[civ] <= 1e-9) delete e.byCiv[civ];
  }
  const rest = pts - take;
  if (rest > 0) removeProportional(e, rest);
}

/**
 * Apply a migration's DESTINATION side: the destination city gains `pts` people under the migrant's
 * ORIGIN civ (the source owner, or, for a destination-only lag record, the source city's owner).
 * @param {CompositionState} s State.
 * @param {*} m Migration record.
 * @param {Map<string,string>} nameToLoc city name → loc key.
 * @param {Map<string,number>} nameToOwner city name → owner id.
 * @param {number} pts Points moved.
 */
function applyMigrationDest(s, m, nameToLoc, nameToOwner, pts) {
  if (typeof m.destOwner !== "number" || !m.destName || m.cause === "attrition") return;
  const destKey = nameToLoc.get(m.destName);
  const destE = destKey ? s.cities[destKey] : null;
  if (!destE) return;
  // Returnees carry their TRUE origin (m.originCiv) home; an ordinary arrival is attributed to the
  // source owner (the migrant's origin civ).
  const origin = typeof m.originCiv === "number" ? m.originCiv
    : typeof m.srcOwner === "number" ? m.srcOwner : nameToOwner.get(m.srcName);
  if (typeof origin === "number") addCiv(destE, origin, pts);
}

/**
 * Apply one migration record to the composition. Split-owner lag records are handled, a record
 * contributes its source side when it carries `srcOwner` and its destination side when it carries
 * `destOwner`.
 * @param {CompositionState} s State.
 * @param {*} m Migration record.
 * @param {Map<string,string>} nameToLoc city name → loc key.
 * @param {Map<string,number>} nameToOwner city name → owner id.
 */
function applyMigration(s, m, nameToLoc, nameToOwner) {
  const pts = typeof m.points === "number" ? m.points : 0;
  if (!(pts > 0)) return;
  applyMigrationSource(s, m, nameToLoc, pts);
  applyMigrationDest(s, m, nameToLoc, nameToOwner, pts);
}

/**
 * Reconcile one settlement's buckets to its real population: positive residual (births) counts as
 * the owner's ethnicity; negative residual (loss) is removed proportionally. Then round + restamp.
 * @param {CompositionState} s State.
 * @param {{key:string, owner:number, total:number, name:string}} w Work item.
 * @param {number} turn Current turn.
 */
function reconcileCity(s, w, turn) {
  const e = s.cities[w.key];
  if (!e) return;
  const residual = w.total - sumByCiv(e);
  if (residual > 0) addCiv(e, w.owner, residual); // natural growth → current owner
  else if (residual < 0) removeProportional(e, -residual);
  normalizeToTotal(e, w.total, w.owner); // buckets now sum EXACTLY to the real population
  e.total = w.total;
  e.name = w.name;
  e.seenTurn = turn;
}

/**
 * Drift a settlement's non-owner origins toward the owner's bucket (ethnic integration): each origin
 * moves by the fraction `rateFor` returns for it. People shift BETWEEN buckets, so the total (and the
 * reconciled population) is unchanged; a bucket emptied below DUST is dropped. Newcomers thus take on
 * the host identity over time, except where `rateFor` returns ~0 (war with the homeland / unrest).
 * @param {CityComposition} e The entry. @param {number} owner Current owner id.
 * @param {(originCiv:number)=>number} rateFor Per-origin integration fraction in [0,1].
 */
function integrateCity(e, owner, rateFor) {
  if (!e || typeof owner !== "number") return;
  for (const k of Object.keys(e.byCiv)) {
    const o = Number(k);
    if (o === owner) continue;
    const p = e.byCiv[k] || 0;
    const r = rateFor(o);
    if (!(r > 0) || !(p > 0)) continue;
    const move = p * Math.min(1, r);
    e.byCiv[k] = p - move;
    e.byCiv[owner] = (e.byCiv[owner] || 0) + move;
    if (e.byCiv[k] < DUST) delete e.byCiv[k];
  }
}

/**
 * Apply ethnic integration across every settlement this pass: each non-owner origin drifts toward the
 * owner at integrationRate, held fully apart while the owner is at war with that origin's civ
 * (integrationWarRate) and slowed while the settlement is in unrest (integrationUnrestRate). No-op
 * when disabled. Drift is intentionally gentle, so a diaspora persists long enough to read as one.
 * @param {CompositionState} s State. @param {{key:string, owner:number}[]} work The reconciled cities.
 * @param {*[]} signals This pass's city signals (for the per-settlement unrest read).
 */
function integratePass(s, work, signals) {
  if (!getIntegrationEnabled() || !(CONFIG.integrationRate > 0)) return;
  /** @type {Map<string, *>} */
  const sigByLoc = new Map();
  for (const sig of signals || []) {
    const k = locKey(sig.city);
    if (k) sigByLoc.set(k, sig);
  }
  for (const w of work) {
    const e = s.cities[w.key];
    if (!e) continue;
    const sig = sigByLoc.get(w.key);
    const base = sig && sig.unrest ? CONFIG.integrationUnrestRate : CONFIG.integrationRate;
    integrateCity(e, w.owner, (o) => (atWarBetween(w.owner, o) ? CONFIG.integrationWarRate : base));
  }
}

// A settlement not observed for this many turns is treated as gone (razed) and dropped, so the
// composition map stays bounded over a long game. The mod reads ALL cities each pass (fog-independent),
// so absence means the settlement no longer exists. Math.abs handles the age-local turn reset.
const STALE_TURNS = 50;

/**
 * Drop composition entries for settlements not seen in a long time (razed / gone), keeping the map
 * bounded. Conservative: only entries untouched for STALE_TURNS turns are removed, so a settlement
 * transiently out of the tracked set has ample time to reappear before it's forgotten.
 * @param {CompositionState} s State. @param {number} turn The current turn.
 */
function pruneStale(s, turn) {
  for (const k of Object.keys(s.cities)) {
    const seen = s.cities[k].seenTurn || 0;
    if (Math.abs(turn - seen) > STALE_TURNS) delete s.cities[k];
  }
}

/**
 * Update the per-settlement composition for one pass, from the current city signals and this pass's
 * migrations. Seeds new cities, applies migrations, reconciles births/losses, drifts minorities toward
 * the host identity (integration), prunes long-gone settlements, and persists. Never throws,
 * composition is cosmetic and must not disrupt a pass.
 * @param {*[]} signals Current city signals ({city, owner, population}).
 * @param {*[]} migs This pass's migrations.
 */
export function recordCompositionPass(signals, migs) {
  try {
    const s = load();
    const turn = gameTurn();
    const { work, conquests } = seedCities(s, signals);
    /** @type {Map<string,string>} */
    const nameToLoc = new Map();
    /** @type {Map<string,number>} */
    const nameToOwner = new Map();
    for (const w of work) {
      nameToLoc.set(w.name, w.key);
      nameToOwner.set(w.name, w.owner);
    }
    for (const m of migs || []) applyMigration(s, m, nameToLoc, nameToOwner);
    for (const w of work) reconcileCity(s, w, turn);
    integratePass(s, work, signals);
    pruneStale(s, turn);
    save();
    return conquests;
  } catch (_) {
    /* composition is cosmetic; never disrupt the pass */
    return [];
  }
}

/**
 * The ethnic composition of a settlement, for the lens + readout: its origins sorted by share
 * (largest first), the dominant origin, the current owner, and the total. Null when the settlement
 * is untracked or its location is unreadable.
 * @param {*} city City object.
 * @returns {{total:number, owner:number,
 *   civs:{civ:number, pts:number, share:number}[], dominant:{civ:number, share:number}|null}|null}
 *   The composition, or null.
 */
export function compositionForCity(city) {
  const key = locKey(city);
  if (key == null) return null;
  const e = load().cities[key];
  if (!e) return null;
  return summarize(e.byCiv, e.total, e.owner);
}

/**
 * The aggregate ethnic composition across all of a player's settlements, the empire-wide origin
 * mix. Its total is the sum of that player's city populations, so it stays consistent with the
 * per-city figures (and with the population the rest of the mod reports). Null when the player has
 * no tracked settlements.
 * @param {number} owner Owner player id.
 * @returns {{total:number, owner:number,
 *   civs:{civ:number, pts:number, share:number}[], dominant:{civ:number, share:number}|null}|null}
 *   The aggregate composition, or null.
 */
export function compositionForOwner(owner) {
  const cities = load().cities;
  /** @type {Record<string, number>} */
  const byCiv = {};
  let total = 0;
  for (const k of Object.keys(cities)) {
    const e = cities[k];
    if (e.owner !== owner) continue;
    total += e.total;
    for (const c of Object.keys(e.byCiv)) byCiv[c] = (byCiv[c] || 0) + e.byCiv[c];
  }
  return total > 0 ? summarize(byCiv, total, owner) : null;
}

/**
 * Summarize a byCiv map into sorted shares of `total` (the real population), the dominant origin,
 * and the owner. Shares are exact fractions of `total`, so they match the reported population.
 * @param {Record<string, number>} byCiv Points by origin civ.
 * @param {number} total The real population (buckets sum to this).
 * @param {number} owner Current owner.
 * @returns {{total:number, owner:number,
 *   civs:{civ:number, pts:number, share:number}[], dominant:{civ:number, share:number}|null}|null}
 *   The summary, or null when empty.
 */
function summarize(byCiv, total, owner) {
  if (!(total > 0)) return null;
  const civs = Object.keys(byCiv)
    .map((c) => ({ civ: Number(c), pts: byCiv[c], share: byCiv[c] / total }))
    .sort((a, b) => b.pts - a.pts);
  return {
    total,
    owner,
    civs,
    dominant: civs.length ? { civ: civs[0].civ, share: civs[0].share } : null
  };
}

// Test-only access to the internal helpers/state (the unit test imports these; the engine paths
// above never use them).
export const __test = {
  recordCompositionPass,
  compositionForCity,
  compositionForOwner,
  integrateCity,
  reset: () => {
    _s = { cities: {} };
    _loadedTurn = -1;
  },
  state: () => load()
};
