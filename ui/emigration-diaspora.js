// emigration-diaspora.js
//
// Reads the world each pass and decides which population movements are worth writing into the
// Migration Chronicle (emigration-chronicle.js). Two kinds of moment qualify:
//
//   • EXODUS, a single settlement sheds a large wave in one pass under a real pressure (war,
//               disaster, conquest). Throttled per settlement+cause so a long war yields a few
//               entries, not one a turn.
//   • FOUNDING, a people from one civ has become a settled minority in ANOTHER civ's city, crossing
//               a share threshold (15% / 30% / 45% …). Read straight from the composition ledger.
//
// Spoiler-safe: a settlement or origin belonging to a civ the visibility policy hides is never
// narrated (the Chronicle would otherwise leak a civ the player hasn't met). Pure detection + writes
// to the chronicle; never throws into the pass.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { compositionForCity, allCityCompositions } from "/emigration/ui/emigration-composition.js";
import { registerCacheReset } from "/emigration/ui/emigration-cache-reset.js";
import { cityName } from "/emigration/ui/emigration-migration-records.js";
import { civAdjective, eventDisplayName, narrativeCiv, civType } from "/emigration/ui/emigration-naming.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { formatPeopleExact, scaleCityPopulation } from "/emigration/ui/emigration-population.js";
import { chronicle, chronicled } from "/emigration/ui/emigration-chronicle.js";
import { exodusLine, foundingLine, chronicleTitle } from "/emigration/ui/emigration-narrative.js";
import { cityFeatureKeys } from "/emigration/ui/emigration-city-features.js";
import { resolveQuarter } from "/emigration/ui/emigration-quarter-phrases.js";
import { loc as tr } from "/emigration/ui/emigration-loc.js";
import { QUARTER_FOOTHOLD_SHARE } from "/emigration/ui/emigration-tunables.js";
import { relaxFor, relaxedBar } from "/emigration/ui/emigration-enclave-pacing.js";
import { quarterAt } from "/emigration/ui/emigration-quarter-state.js";

// A wave this large (scaled people, one settlement, one cause, one pass) reads as a historical
// exodus rather than ordinary churn.
const EXODUS_PEOPLE = 70000;
// Turns between chronicling the same settlement+cause exodus, so an ongoing war doesn't spam the log.
const EXODUS_COOLDOWN = 8;
// A foreign-origin minority is "notable" at this share, and a fresh entry is written each time it
// crosses another step (so a growing diaspora earns a short series, not a single line).
const DIASPORA_MIN = 0.15;
const DIASPORA_STEP = 0.15;

// Quarter progression is gated on the diaspora's CURRENT STANDING presence (its pop points right now,
// netted for integration / return-home / attrition by the composition ledger — NOT lifetime inflow),
// and then deepens with share growth. It is a first-over-the-line: the moment a lead foreign origin is
// both large enough in absolute stock and a big enough share of the city, the stage fires; if that
// diaspora later integrates or leaves, the stock falls back below the line. The established bar (share +
// min stock) is player-tunable via CONFIG; the foothold share is a fixed chronicle-only milestone.
// QUARTER_FOOTHOLD_SHARE (the 0.25 foothold milestone) now lives in emigration-tunables.js (a leaf) and
// is imported above — this breaks the composition↔diaspora import cycle. Re-exported below for callers.

/**
 * The established-enclave share bar (falls back to 0.35), reduced by the host's per-age pacing relaxation.
 * @param {number} [relax] Pacing relaxation in [0, 1). @returns {number} The share bar.
 */
function establishedShare(relax) {
  const v = Number(CONFIG.quarterEstablishedShare);
  return relaxedBar(isFinite(v) ? v : 0.35, relax || 0);
}

/**
 * Whether a standing stock establishes an enclave on its own (the absolute qualifier, scaled to city size
 * and reduced by the pacing relaxation).
 * @param {number} stock Standing points of the lead origin. @param {number} [relax] Pacing relaxation.
 * @returns {boolean} True when it qualifies.
 */
function stockQualifies(stock, relax) {
  const bar = relaxedBar(establishedStockBar(), relax || 0);
  return bar > 0 && stock >= bar;
}

/**
 * The absolute-stock bar for THIS game right now: `quarterEstablishedStock` scaled by how large tracked
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
 * @returns {number} Mean population.
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

/** The current turn (0 when unreadable). @returns {number} Game.turn or 0. */
function safeTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/** @returns {number} The tunable minimum standing stock for an enclave to count (falls back to 5). */
function minStock() {
  const v = Number(CONFIG.quarterMinStock);
  return isFinite(v) ? v : 5;
}

/**
 * The current game turn, or 0.
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
 * Whether a migration counts toward an exodus: a real displacement (not economic "prosperity" drift)
 * with a known source settlement and owner.
 * @param {*} m A migration.
 * @returns {boolean} True when it counts.
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
    const event = (g.eventKey ? eventDisplayName(g.eventKey) : null) || undefined;
    const seed = g.city + "|" + g.cause + "|" + turn;
    const body = exodusLine({
      cause: g.cause, civ: nc.adj, framed: nc.framed, city: g.city,
      people: formatPeopleExact(g.people), event, seed
    });
    chronicle({
      kind: "exodus", title: chronicleTitle({ kind: "exodus", civ: nc.adj, city: g.city, event, seed }),
      body, civ: nc.adj, people: g.people, cause: g.cause, dedupeKey
    });
  }
}

/**
 * The largest FOREIGN-origin minority in a city (an origin civ other than the owner), or null when
 * the city is effectively single-origin. Reads the composition ledger.
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
 * The lead foreign origin for QUARTER purposes, with rule 2 enforced: a civilization never forms a
 * Cultural Quarter for its OWN people. leadForeignOrigin already excludes the owner PLAYER, but a
 * captured/allied city can host a diaspora of the SAME civilization from a different player (e.g. Rome
 * conquers a city that then draws Roman migrants from another Roman player). This compares the resolved
 * CivilizationType of host and origin and rejects a same-civ lead, so "Rome" never gets a "Roman
 * Quarter". Falls back to the plain lead when either civ type is unresolved (keeps the player-id guard).
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
 * Quarter progression stage from current standing share + stock.
 * @param {number} share Lead-origin share in the city.
 * @param {number} stock Lead-origin CURRENT standing pop points (netted, not lifetime inflow).
 * @param {number} [relax] The host's per-age pacing relaxation (emigration-enclave-pacing.js), 0 by default.
 * @returns {"none"|"foothold"|"established"} Stage.
 */
function quarterStage(share, stock, relax) {
  const stockFloor = minStock();
  // Established by SHARE (the origin holds a large part of a settlement) or by absolute STOCK (a large
  // community in a big cosmopolitan city, whatever its share; CONFIG.quarterEstablishedStock, 0 = off).
  // Both bars read lower while the host's per-age pacing is catching up (a host that has formed no
  // enclave by late in the age), so at least one an age is likely without changing the plain bars.
  if ((share >= establishedShare(relax) || stockQualifies(stock, relax)) && stock >= stockFloor) {
    return "established";
  }
  if (share >= QUARTER_FOOTHOLD_SHARE && stock >= stockFloor) {
    return "foothold";
  }
  return "none";
}

/**
 * The lead diaspora's CURRENT standing size in scaled people: its share of the city's scaled
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
 * Chronicle a diaspora's FOOTHOLD stage (a lasting community, not yet a full quarter).
 * @param {{civ:number, share:number}} lead The lead foreign origin. @param {string} name Host city name.
 * @param {number} standingPeople The diaspora's CURRENT standing size (scaled people).
 * @param {{adj:string}} nc Origin descriptor.
 */
function chronicleFoothold(lead, name, standingPeople, nc) {
  const dedupeKey = "quarter:foothold:" + name + "|" + lead.civ;
  if (chronicled(dedupeKey)) return;
  chronicle({
    kind: "founding",
    title: tr("LOC_EMIG_CHR_FOOTHOLD_TITLE", "A {1_Civ} Foothold in {2_City}", nc.adj, name),
    body: tr(
      "LOC_EMIG_CHR_FOOTHOLD_BODY",
      "A lasting {1_Civ} community has taken root in {2_City}, now {3_Pct} percent of the city, a "
        + "standing community of {4_People}.",
      nc.adj, name, Math.round(lead.share * 100), formatPeopleExact(standingPeople)
    ),
    civ: nc.adj,
    dedupeKey
  });
}

/**
 * Chronicle quarter progression moments derived from the diaspora's CURRENT standing stock + share. Only
 * the FOOTHOLD is a story of its own: the established stage CREATES the enclave (emigration-quarter.js),
 * and that creation announces itself through {@link chronicleEnclaveFounding}, so the "Enclave of X"
 * entry can never run ahead of a real enclave.
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
 * The dedupe key of one enclave's share-step entry. Keyed by the enclave's FORMATION turn, so an enclave
 * that fades and later forms again is announced again (each formation is its own series).
 * @param {string} name Host city name. @param {{civ:number, turn:number}} rec The enclave record.
 * @param {number} tier The share step. @returns {string} The key.
 */
function shareStepKey(name, rec, tier) {
  return "founding:" + name + "|" + rec.civ + "|f" + rec.turn + "|" + tier;
}

/**
 * Whether this enclave has ALREADY been chronicled at `tier` or any HIGHER one. The series is a growth
 * story, so it only fires on a share the enclave has never reached before. Without this, a SHRINKING
 * community re-crosses tiers downward (99% → 66% → 47% on a 4-pop settlement, watched in the turn-85
 * save: three "Enclave of Mérida" entries as the diaspora got smaller) and each descent looks like a
 * fresh founding. Reads the chronicle's own dedupe keys, so it needs no extra persisted state.
 * @param {string} name Host city name. @param {{civ:number, turn:number}} rec The enclave record.
 * @param {number} tier The tier. @returns {boolean} True when this tier or a larger one is already recorded.
 */
function tierAlreadyReached(name, rec, tier) {
  for (let t = tier; t <= MAX_DIASPORA_TIER; t++) {
    if (chronicled(shareStepKey(name, rec, t))) return true;
  }
  return false;
}

/**
 * The city's enclave record when it belongs to this origin (a record on its city-centre tile, keyed
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
 * higher one) is already recorded for this formation. The entry is titled as an enclave and its prose
 * speaks of "a district of their own", so every caller passes the REAL enclave record: share alone once
 * fired it (a 1.8-point community in a 4-pop town read as an enclave three times while none existed).
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
  // Name a quarter from the host city's REAL features (coast/river/mountain/granary/temple/market/
  // walls) so the line never claims a building the city never built; the edge framing also matches
  // where the ethnicity lens paints the diaspora (the sparse rural fringe).
  const where = resolveQuarter(cityFeatureKeys(city), seed);
  const body = foundingLine({
    origin: nc.adj, framed: nc.framed, host: civAdjective(comp.owner), city: name, pct: origin.share * 100, seed, where
  });
  const line = yields ? body + " (" + yields + ")" : body;
  const written = chronicle({
    kind: "founding", title: chronicleTitle({ kind: "founding", civ: nc.adj, city: name, seed }),
    body: line, civ: nc.adj, dedupeKey: shareStepKey(name, rec, tier)
  });
  return written ? line : null;
}

/**
 * Announce an enclave the moment it is ESTABLISHED (called by emigration-quarter.js right after it
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
 * Continue an EXISTING enclave's story when its community crosses a fresh, higher share step. Skips an
 * unmet host, a city whose lead foreign origin holds no enclave there, and a shrinking community.
 * @param {*} city A live city object.
 */
function detectFoundingForCity(city) {
  const comp = compositionForCity(city);
  // Skip an unmet HOST (we don't narrate an unmet civ's own city in detail); the diaspora ORIGIN may
  // still be unmet, in which case it's named as hearsay.
  if (!comp || typeof comp.owner !== "number" || civHidden(comp.owner)) return;
  const lead = leadForeignOrigin(comp);
  if (!lead || lead.share < DIASPORA_MIN) return;
  const rec = enclaveOf(city, lead.civ);
  if (rec) chronicleShareStep(city, comp, lead, rec);
}

/**
 * Scan the pass's settlements for diasporas that have taken root.
 * @param {*[]} signals The pass's city signals ({city, owner, …}).
 */
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
 * Assess whether a city currently hosts an ESTABLISHED foreign quarter (the lead foreign minority has
 * crossed both the established share and the current standing-stock threshold). Returns the origin,
 * host, share, and standing stock for the decision system, or null. Reads the composition ledger; pure
 * of side effects.
 * @param {*} city A live city object.
 * @param {boolean} [force] When true, a FOOTHOLD-stage diaspora also qualifies (the established-share
 *   bar is relaxed to the foothold share). The min-stock floor still applies. Used by the player-facing
 *   "Force enclave" testing option so a diaspora the player can already see actually offers its decision.
 * @returns {{civ:number, owner:number, share:number, stock:number, name:string, where:string}|null}
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
  // A truthful, deterministic edge phrase for the enclave ("by the harbour", "in the outer streets"),
  // stable per (city, origin) so the decision modal and its chronicle name the same place each time.
  const where = resolveQuarter(cityFeatureKeys(city), name + ":" + lead.civ);
  return { civ: lead.civ, owner: comp.owner, share: lead.share, stock, name, where };
}

/**
 * The cultural-enclave PROGRESS for a city: the lead foreign origin's current share + standing stock,
 * the stage it has reached, and the live thresholds it is measured against — regardless of whether it
 * has crossed the bar yet. Uses the exact same lead-origin, share, stock, and thresholds the decision
 * mechanic uses, so a readout built from this always agrees with whether an enclave will actually form.
 * Returns null when the city has no foreign minority. Pure; reads the composition ledger.
 * @param {*} city A live city object.
 * @returns {EnclaveProgress|null} The progress, or null.
 */
export function enclaveProgressForCity(city) {
  return enclaveProgressForComposition(compositionForCity(city));
}

/**
 * @typedef {Object} EnclaveProgress
 * @property {number} civ The lead foreign origin (player id). @property {number} owner The host player id.
 * @property {number} share Its share of the settlement. @property {number} stock Its standing points.
 * @property {"none"|"foothold"|"established"} stage The stage reached against the LIVE bars.
 * @property {number} establishedShare The live share bar (pacing-relaxed).
 * @property {number} stockBar The live size bar (scaled to city size, pacing-relaxed; 0 = off).
 * @property {number} minStock The standing-points floor. @property {number} relax The pacing relaxation.
 */

/**
 * Enclave progress for one composition entry (see enclaveProgressForCity); the dashboard's per-settlement
 * rows carry the composition, not the city. Null when there is no foreign minority.
 * @param {*} comp A composition (owner + civs), or null. @returns {EnclaveProgress|null} The progress.
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
