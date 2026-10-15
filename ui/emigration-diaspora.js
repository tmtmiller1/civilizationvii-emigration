// emigration-diaspora.js
//
// Reads the world each pass and decides which population movements are worth writing into the
// Migration Chronicle (emigration-chronicle.js): an exodus (a settlement sheds a large wave in one
// pass under war/disaster/conquest, throttled per settlement+cause) or a founding (a people from one
// civ crosses a share threshold as a settled minority in another civ's city). Spoiler-safe: a civ the
// visibility policy hides is never narrated. Pure detection + chronicle writes; never throws into the pass.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { compositionForCity, allCityCompositions } from "/emigration/ui/emigration-composition.js";
import { registerCacheReset } from "/emigration/ui/emigration-cache-reset.js";
import { cityName } from "/emigration/ui/emigration-migration-records.js";
import { civAdjectiveMsg, eventDisplayNameMsg, narrativeCiv, civType } from "/emigration/ui/emigration-naming.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { scaleCityPopulation } from "/emigration/ui/emigration-population.js";
import { chronicle, chronicled } from "/emigration/ui/emigration-chronicle.js";
import { exodusLineMsg, foundingLineMsg, chronicleTitleMsg } from "/emigration/ui/emigration-narrative.js";
import { cityFeatureKeys } from "/emigration/ui/emigration-city-features.js";
import { resolveQuarterMsg } from "/emigration/ui/emigration-quarter-phrases.js";
import { msg, msgJoin, msgNum, msgText } from "/emigration/ui/emigration-loc.js";
import { QUARTER_FOOTHOLD_SHARE } from "/emigration/ui/emigration-tunables.js";
import { relaxFor, relaxedBar } from "/emigration/ui/emigration-enclave-pacing.js";
import { quarterAt } from "/emigration/ui/emigration-quarter-state.js";
import { communityStage } from "/emigration/ui/emigration-enclave-stage.js";

// A wave this large (scaled people, one settlement, one cause, one pass) reads as a historical
// exodus rather than ordinary churn.
const EXODUS_PEOPLE = 70000;
// Turns between chronicling the same settlement+cause exodus, so an ongoing war doesn't spam the log.
const EXODUS_COOLDOWN = 8;
// A foreign-origin minority is "notable" at this share, and a fresh entry is written each time it
// crosses another step (so a growing diaspora earns a short series, not a single line).
const DIASPORA_MIN = 0.15;
const DIASPORA_STEP = 0.15;

// Quarter progression is gated on the diaspora's current standing presence (its pop points right now,
// netted by the composition ledger, not lifetime inflow) and deepens with share growth: the stage fires
// the moment a lead foreign origin is both large enough in stock and share, and falls back if it
// integrates or leaves. The established bar is player-tunable via CONFIG; QUARTER_FOOTHOLD_SHARE lives
// in emigration-tunables.js (a leaf, avoiding an import cycle) and is re-exported below for callers.

/**
 * The established-enclave share bar (falls back to 0.35), reduced by the host's per-age pacing relaxation.
 * @param {number} [relax] Pacing relaxation in [0, 1). @returns {number}
 */
function establishedShare(relax) {
  const v = Number(CONFIG.quarterEstablishedShare);
  return relaxedBar(isFinite(v) ? v : 0.35, relax || 0);
}

/**
 * The absolute-stock bar for this game right now: `quarterEstablishedStock` scaled by how large tracked
 * settlements are on average relative to `quarterStockRefPop`, clamped to half and double. Pure over its
 * inputs; the live version reads the composition ledger's mean population.
 * @param {number} base The configured bar. @param {number} meanPop Mean tracked settlement population.
 * @param {number} refPop The population at which the base applies as is.
 * @returns {number} The scaled bar (0 when the base is off).
 */
export function stockBarFor(base, meanPop, refPop) {
  if (!(base > 0)) return 0;
  if (!(meanPop > 0) || !(refPop > 0)) return base;
  const scale = Math.min(2, Math.max(0.5, meanPop / refPop));
  return Math.round(base * scale * 10) / 10;
}

/** The live absolute-stock bar (see stockBarFor). @returns {number} Points (0 = off). */
export function establishedStockBar() {
  const base = Number(CONFIG.quarterEstablishedStock) || 0;
  return stockBarFor(base, meanTrackedPopulation(), Number(CONFIG.quarterStockRefPop) || 0);
}

/**
 * The mean population of the settlements in the composition ledger this turn (0 when empty), cached per
 * turn since the stage read runs for every city every pass.
 * @returns {number}
 */
function meanTrackedPopulation() {
  const turn = safeTurn();
  if (_meanCache.turn === turn) return _meanCache.value;
  let sum = 0, n = 0;
  try {
    for (const c of allCityCompositions()) if (c.comp && c.comp.total > 0) { sum += c.comp.total; n++; }
  } catch (_) {
    /* unreadable ledger: unscaled */
  }
  _meanCache = { turn, value: n ? sum / n : 0 };
  return _meanCache.value;
}
let _meanCache = { turn: -1, value: 0 };
registerCacheReset(() => { _meanCache = { turn: -1, value: 0 }; });

/** @returns {number} */
function safeTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/** @returns {number} */
function minStock() {
  const v = Number(CONFIG.quarterMinStock);
  return isFinite(v) ? v : 5;
}

/** @returns {number} */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Whether a migration counts toward an exodus: a real displacement (not economic "prosperity" drift)
 * with a known source settlement and owner.
 * @param {*} m
 * @returns {boolean}
 */
function isExodusMigration(m) {
  return !!m && !!m.cause && m.cause !== "prosperity" && m.cause !== "return"
    && typeof m.srcOwner === "number" && !!m.srcName;
}

/**
 * Sum a pass's migrations into per-settlement, per-cause waves (people + the event behind them).
 * Economic "prosperity" drift is excluded; an exodus is something people flee, not a wage decision.
 * @param {*[]} migrations The pass's applied migrations.
 * @returns {Map<string, {city:string, cause:string, owner:number, people:number, eventKey?:string}>}
 *   Waves keyed by settlement+cause.
 */
function wavesByCityCause(migrations) {
  /** @type {Map<string, {city:string, cause:string, owner:number, people:number, eventKey?:string}>} */
  const map = new Map();
  for (const m of migrations || []) {
    if (!isExodusMigration(m)) continue;
    const key = m.srcName + "|" + m.cause;
    const g = map.get(key) || { city: m.srcName, cause: m.cause, owner: m.srcOwner, people: 0, eventKey: m.eventKey };
    g.people += m.people || 0;
    if (!g.eventKey && m.eventKey) g.eventKey = m.eventKey;
    map.set(key, g);
  }
  return map;
}

/**
 * Chronicle the pass's exodus-scale waves (one settlement+cause each, over the people threshold),
 * throttled per settlement+cause and spoiler-masked.
 * @param {*[]} migrations The pass's applied migrations.
 */
function detectExoduses(migrations) {
  const turn = gameTurn();
  const bucket = Math.floor(turn / EXODUS_COOLDOWN);
  for (const g of wavesByCityCause(migrations).values()) {
    if (g.people < EXODUS_PEOPLE) continue;
    const dedupeKey = "exodus:" + g.city + "|" + g.cause + "|" + bucket;
    if (chronicled(dedupeKey)) continue;
    // Name the civ for the narrative, framed as hearsay when it's one the player hasn't met.
    const nc = narrativeCiv(g.owner);
    const event = (g.eventKey ? eventDisplayNameMsg(g.eventKey) : null) || undefined;
    const seed = g.city + "|" + g.cause + "|" + turn;
    const body = exodusLineMsg({
      cause: g.cause, civ: nc.adjMsg, framed: nc.framed, city: g.city,
      people: msgNum(g.people), event, seed
    });
    chronicle({
      kind: "exodus", title: chronicleTitleMsg({ kind: "exodus", civ: nc.adjMsg, city: g.city, event, seed }),
      body, civ: nc.adj, people: g.people, cause: g.cause, dedupeKey
    });
  }
}

/**
 * The largest foreign-origin minority in a city (an origin civ other than the owner), or null when
 * the city is single-origin for practical purposes. Reads the composition ledger.
 * @param {*} comp A city composition (from compositionForCity).
 * @returns {{civ:number, pts:number, share:number}|null} The lead foreign origin (with its current
 *   standing pop points), or null.
 */
function leadForeignOrigin(comp) {
  let best = null;
  for (const c of comp.civs) {
    if (c.civ === comp.owner) continue;
    if (!best || c.share > best.share) best = c;
  }
  return best;
}

/**
 * The lead foreign origin for quarter purposes: a civilization never forms a Cultural Quarter for its
 * own people, so this compares the resolved CivilizationType of host and origin and rejects a same-civ
 * lead from a different player. Falls back to the plain lead when either civ type is unresolved.
 * @param {*} comp A city composition (from compositionForCity).
 * @returns {{civ:number, pts:number, share:number}|null} The foreign-civ lead, or null.
 */
function leadForeignCivOrigin(comp) {
  const lead = leadForeignOrigin(comp);
  if (!lead) return null;
  const hostCiv = civType(comp.owner);
  const leadCiv = civType(lead.civ);
  if (hostCiv && leadCiv && hostCiv === leadCiv) return null; // rule 2: same civilization is not "foreign"
  return lead;
}

/**
 * The live bars a community is measured against for a host, with its per-age pacing relaxation applied.
 * @param {number} [relax] The host's pacing relaxation (emigration-enclave-pacing.js), 0 by default.
 * @returns {import("/emigration/ui/emigration-enclave-stage.js").StageBars}
 */
export function stageBars(relax) {
  return {
    foothold: QUARTER_FOOTHOLD_SHARE,
    established: establishedShare(relax),
    stockBar: relaxedBar(establishedStockBar(), relax || 0),
    minStock: minStock()
  };
}

/**
 * Quarter progression stage from current standing share + stock (emigration-enclave-stage.js describes the
 * stages and holds the classification).
 * @param {number} share Lead-origin share in the city.
 * @param {number} stock Lead-origin current standing pop points (netted, not lifetime inflow).
 * @param {number} [relax] The host's per-age pacing relaxation (emigration-enclave-pacing.js), 0 by default.
 * @returns {"none"|"foothold"|"established"}
 */
function quarterStage(share, stock, relax) {
  return communityStage(share, stock, stageBars(relax));
}

/**
 * The lead diaspora's current standing size in scaled people: its share of the city's scaled
 * population, using the same age-based scaler as the Demographics board so the figure reads
 * consistently with the rest of the mod. A standing figure (netted now), not lifetime inflow.
 * @param {{total:number}} comp The city composition. @param {{share:number}} lead The lead foreign origin.
 * @returns {number} The diaspora's standing people count.
 */
function standingPeople(comp, lead) {
  const cityPeople = scaleCityPopulation(comp.total, gameTurn());
  return (lead.share || 0) * (cityPeople || 0);
}

/**
 * Chronicle a diaspora's foothold stage (a lasting community, not yet a full quarter).
 * @param {{civ:number, share:number}} lead The lead foreign origin. @param {string} name Host city name.
 * @param {number} standingPeople The diaspora's current standing size (scaled people).
 * @param {{adj:string, adjMsg:import("/emigration/ui/emigration-loc.js").MsgNode}} nc Origin descriptor.
 */
function chronicleFoothold(lead, name, standingPeople, nc) {
  const dedupeKey = "quarter:foothold:" + name + "|" + lead.civ;
  if (chronicled(dedupeKey)) return;
  chronicle({
    kind: "founding",
    title: msg("LOC_EMIG_CHR_FOOTHOLD_TITLE", "A {1_Civ} Foothold in {2_City}", nc.adjMsg, name),
    body: msg(
      "LOC_EMIG_CHR_FOOTHOLD_BODY",
      "A lasting {1_Civ} community has taken root in {2_City}, now {3_Pct} percent of the city, a "
        + "standing community of {4_People}.",
      nc.adjMsg, name, Math.round(lead.share * 100), msgNum(standingPeople)
    ),
    civ: nc.adj,
    dedupeKey
  });
}

/**
 * Chronicle quarter progression moments derived from the diaspora's current standing stock + share. Only
 * the foothold is a story of its own: the established stage creates the enclave (emigration-quarter.js),
 * which announces itself through {@link chronicleEnclaveFounding}.
 * @param {*} city Live city object.
 */
function detectQuarterForCity(city) {
  const comp = compositionForCity(city);
  if (!comp || typeof comp.owner !== "number" || civHidden(comp.owner)) return;
  const lead = leadForeignCivOrigin(comp);
  if (!lead) return;
  const stock = typeof lead.pts === "number" ? lead.pts : 0;
  if (quarterStage(lead.share, stock, relaxFor(comp.owner)) !== "foothold") return;
  chronicleFoothold(lead, cityName(city), standingPeople(comp, lead), narrativeCiv(lead.civ));
}

/** The highest tier a share can reach (share is a fraction, so 1 / DIASPORA_STEP steps fit under 100%). */
const MAX_DIASPORA_TIER = Math.ceil(1 / DIASPORA_STEP);

/**
 * The dedupe key of one enclave's share-step entry. Keyed by the enclave's formation turn, so an enclave
 * that fades and later forms again is announced again (each formation is its own series).
 * @param {string} name Host city name. @param {{civ:number, turn:number}} rec The enclave record.
 * @param {number} tier The share step. @returns {string}
 */
function shareStepKey(name, rec, tier) {
  return "founding:" + name + "|" + rec.civ + "|f" + rec.turn + "|" + tier;
}

/**
 * Whether this enclave has already been chronicled at `tier` or any higher one. The series is a growth
 * story, so it only fires on a share the enclave has never reached before (a shrinking community
 * re-crosses tiers downward). Reads the chronicle's own dedupe keys, so it needs no extra persisted state.
 * @param {string} name Host city name. @param {{civ:number, turn:number}} rec The enclave record.
 * @param {number} tier @returns {boolean} True when this tier or a larger one is already recorded.
 */
function tierAlreadyReached(name, rec, tier) {
  for (let t = tier; t <= MAX_DIASPORA_TIER; t++) {
    if (chronicled(shareStepKey(name, rec, t))) return true;
  }
  return false;
}

/**
 * The city's enclave record when it belongs to this origin (a record on its city-center tile, keyed
 * "x,y" like every quarter record), else null.
 * @param {*} city A live city object. @param {number} civ Origin player id.
 * @returns {*} The record, or null when that origin has no enclave there.
 */
function enclaveOf(city, civ) {
  const loc = city && city.location;
  if (!loc || typeof loc.x !== "number" || typeof loc.y !== "number") return null;
  const rec = quarterAt(loc.x + "," + loc.y);
  return rec && rec.civ === civ ? rec : null;
}

/**
 * Write one "The X Enclave of Y" entry for an enclave at its current share step, unless that step (or a
 * higher one) is already recorded for this formation. The prose speaks of "a district of their own",
 * so every caller passes the real enclave record, never share alone.
 * @param {*} city Live city object. @param {{owner:number}} comp The city composition.
 * @param {{civ:number, share:number}} origin The enclave origin's composition row.
 * @param {{civ:number, turn:number}} rec The enclave record. @param {string} [yields] What the enclave
 *   gives per turn, appended in parentheses (the founding entry states it; growth entries do not).
 * @returns {string|null} The line written, or null when nothing was.
 */
function chronicleShareStep(city, comp, origin, rec, yields) {
  const tier = Math.floor(origin.share / DIASPORA_STEP); // 1 = 15%, 2 = 30%, …
  const name = cityName(city);
  if (tierAlreadyReached(name, rec, tier)) return null;
  const nc = narrativeCiv(origin.civ);
  const seed = name + "|" + origin.civ + "|" + tier;
  // Name a quarter from the host city's real features (coast/river/mountain/granary/temple/market/
  // walls) so the line never claims a building the city never built; the edge framing also matches
  // where the ethnicity lens paints the diaspora (the sparse rural fringe).
  const where = resolveQuarterMsg(cityFeatureKeys(city), seed);
  const body = foundingLineMsg({
    origin: nc.adjMsg, framed: nc.framed, host: civAdjectiveMsg(comp.owner), city: name, pct: origin.share * 100,
    seed, where
  });
  const line = yields ? msgJoin(body, " (", yields, ")") : body;
  const written = chronicle({
    kind: "founding", title: chronicleTitleMsg({ kind: "founding", civ: nc.adjMsg, city: name, seed }),
    body: line, civ: nc.adj, dedupeKey: shareStepKey(name, rec, tier)
  });
  return written ? msgText(line) : null;
}

/**
 * Announce an enclave the moment it is established (called by emigration-quarter.js right after it
 * writes the record and places the tile), with what the tile gives per turn. Skips an unmet host, like
 * every chronicle entry. Never throws into the pass.
 * @param {*} city The host city object. @param {number} civ Origin player id.
 * @param {string} [yields] The enclave's per-turn yields as text (may be "").
 * @returns {string|null} The line written (so the caller can also raise it on screen), or null.
 */
export function chronicleEnclaveFounding(city, civ, yields) {
  try {
    const comp = compositionForCity(city);
    const rec = enclaveOf(city, civ);
    if (!comp || !rec || typeof comp.owner !== "number" || civHidden(comp.owner)) return null;
    const origin = (comp.civs || []).find((/** @type {*} */ c) => c.civ === civ);
    return origin ? chronicleShareStep(city, comp, origin, rec, yields) : null;
  } catch (_) {
    return null; // the chronicle must never disrupt a pass
  }
}

/**
 * Continue an existing enclave's story when its community crosses a fresh, higher share step. Skips an
 * unmet host, a city whose lead foreign origin holds no enclave there, and a shrinking community.
 * @param {*} city A live city object.
 */
function detectFoundingForCity(city) {
  const comp = compositionForCity(city);
  // Skip an unmet host (we don't narrate an unmet civ's own city in detail); the diaspora origin may
  // still be unmet, in which case it's named as hearsay.
  if (!comp || typeof comp.owner !== "number" || civHidden(comp.owner)) return;
  const lead = leadForeignOrigin(comp);
  if (!lead || lead.share < DIASPORA_MIN) return;
  const rec = enclaveOf(city, lead.civ);
  if (rec) chronicleShareStep(city, comp, lead, rec);
}

/** @param {*[]} signals */
function detectFoundings(signals) {
  for (const s of signals || []) {
    if (s && s.city) detectFoundingForCity(s.city);
  }
}

/**
 * Scan the pass's settlements for quarter progression milestones that are independent of native
 * revolt hooks (foothold + established stage).
 * @param {*[]} signals The pass's city signals ({city, owner, …}).
 */
function detectQuarterProgress(signals) {
  for (const s of signals || []) {
    if (s && s.city) detectQuarterForCity(s.city);
  }
}

/**
 * Assess whether a city currently hosts an established foreign quarter (the lead foreign minority has
 * crossed both the established share and the current standing-stock threshold). Returns the origin,
 * host, share, and standing stock for the decision system, or null. Pure; reads the composition ledger.
 * @param {*} city A live city object.
 * @param {boolean} [force] When true, a foothold-stage diaspora also qualifies (the established-share
 *   bar is relaxed to the foothold share). The min-stock floor still applies. Used by the player-facing
 *   "Force enclave" testing option so a diaspora the player can already see actually offers its decision.
 * @returns {{civ:number, owner:number, share:number, stock:number, name:string, where:string, whereMsg:*}|null}
 *   The quarter (with a truthful edge phrase), or null.
 */
export function establishedQuarterForCity(city, force) {
  const comp = compositionForCity(city);
  if (!comp || typeof comp.owner !== "number") return null;
  const lead = leadForeignCivOrigin(comp);
  if (!lead) return null;
  const stock = typeof lead.pts === "number" ? lead.pts : 0;
  const stage = quarterStage(lead.share, stock, relaxFor(comp.owner));
  const qualifies = force ? stage !== "none" : stage === "established";
  if (!qualifies) return null;
  const name = cityName(city);
  // A truthful, deterministic edge phrase for the enclave ("by the harbor", "in the outer streets"),
  // stable per (city, origin) so the decision modal and its chronicle name the same place each time.
  const whereMsg = resolveQuarterMsg(cityFeatureKeys(city), name + ":" + lead.civ);
  return { civ: lead.civ, owner: comp.owner, share: lead.share, stock, name, where: msgText(whereMsg), whereMsg };
}

/**
 * The cultural-enclave progress for a city: the lead foreign origin's current share + standing stock,
 * the stage it has reached, and the live thresholds it is measured against. Uses the same inputs the
 * decision mechanic uses, so a readout always agrees with whether an enclave will form. Null when the
 * city has no foreign minority. Pure; reads the composition ledger.
 * @param {*} city A live city object.
 * @returns {EnclaveProgress|null}
 */
export function enclaveProgressForCity(city) {
  return enclaveProgressForComposition(compositionForCity(city));
}

/**
 * @typedef {Object} EnclaveProgress
 * @property {number} civ The lead foreign origin (player id). @property {number} owner The host player id.
 * @property {number} share Its share of the settlement. @property {number} stock Its standing points.
 * @property {"none"|"foothold"|"established"} stage The stage reached against the live bars.
 * @property {number} establishedShare The live share bar (pacing-relaxed).
 * @property {number} stockBar The live size bar (scaled to city size, pacing-relaxed; 0 = off).
 * @property {number} minStock The standing-points floor. @property {number} relax The pacing relaxation.
 */

/**
 * Enclave progress for one composition entry (see enclaveProgressForCity); the dashboard's per-settlement
 * rows carry the composition, not the city. Null when there is no foreign minority.
 * @param {*} comp A composition (owner + civs), or null. @returns {EnclaveProgress|null}
 */
export function enclaveProgressForComposition(comp) {
  if (!comp || typeof comp.owner !== "number") return null;
  const lead = leadForeignCivOrigin(comp);
  if (!lead) return null;
  const stock = typeof lead.pts === "number" ? lead.pts : 0;
  const relax = relaxFor(comp.owner);
  return {
    civ: lead.civ,
    owner: comp.owner,
    share: lead.share || 0,
    stock,
    stage: quarterStage(lead.share, stock, relax),
    establishedShare: establishedShare(relax),
    stockBar: relaxedBar(establishedStockBar(), relax),
    minStock: minStock(),
    relax
  };
}

/**
 * Read the pass and write any history worth keeping into the Migration Chronicle. Never throws into
 * the pass (the chronicle is cosmetic).
 * @param {*[]} signals The pass's city signals.
 * @param {*[]} migrations The pass's applied migrations.
 */
export function recordChroniclePass(signals, migrations) {
  try {
    detectExoduses(migrations);
    detectFoundings(signals);
    detectQuarterProgress(signals);
  } catch (_) {
    /* the chronicle must never disrupt a pass */
  }
}

// Test hook: the pure pieces the harness exercises directly.
export const __test = {
  wavesByCityCause,
  leadForeignOrigin,
  tierAlreadyReached,
  enclaveOf,
  shareStepKey,
  quarterStage,
  stockBarFor,
  standingPeople,
  EXODUS_PEOPLE,
  DIASPORA_MIN,
  DIASPORA_STEP,
  QUARTER_FOOTHOLD_SHARE,
  get QUARTER_MIN_STOCK() { return minStock(); },
  get QUARTER_ESTABLISHED_SHARE() { return establishedShare(); }
};
