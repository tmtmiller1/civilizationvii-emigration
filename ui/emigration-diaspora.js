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
import { compositionForCity } from "/emigration/ui/emigration-composition.js";
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

/** @returns {number} The tunable established-enclave share bar (falls back to 0.35). */
function establishedShare() {
  const v = Number(CONFIG.quarterEstablishedShare);
  return isFinite(v) ? v : 0.35;
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
 * @returns {"none"|"foothold"|"established"} Stage.
 */
function quarterStage(share, stock) {
  const stockFloor = minStock();
  if (share >= establishedShare() && stock >= stockFloor) {
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
 * Chronicle a diaspora's ESTABLISHED stage (a full quarter of its own, named from the city's features).
 * @param {*} city Live city object. @param {{civ:number, share:number}} lead The lead foreign origin.
 * @param {string} name Host city name. @param {number} owner Host player id.
 * @param {{adj:string, framed:boolean}} nc Origin descriptor.
 */
function chronicleEstablished(city, lead, name, owner, nc) {
  const dedupeKey = "quarter:established:" + name + "|" + lead.civ;
  if (chronicled(dedupeKey)) return;
  const seed = name + "|" + lead.civ + "|established";
  const where = resolveQuarter(cityFeatureKeys(city), seed);
  chronicle({
    kind: "founding",
    title: chronicleTitle({ kind: "founding", civ: nc.adj, city: name, seed }),
    body: foundingLine({
      origin: nc.adj, framed: nc.framed, host: civAdjective(owner),
      city: name, pct: lead.share * 100, seed, where
    }),
    civ: nc.adj,
    dedupeKey
  });
}

/**
 * Chronicle quarter progression moments derived from the diaspora's CURRENT standing stock + share.
 * @param {*} city Live city object.
 */
function detectQuarterForCity(city) {
  const comp = compositionForCity(city);
  if (!comp || typeof comp.owner !== "number" || civHidden(comp.owner)) return;
  const lead = leadForeignCivOrigin(comp);
  if (!lead) return;
  const stock = typeof lead.pts === "number" ? lead.pts : 0;
  const stage = quarterStage(lead.share, stock);
  if (stage === "none") return;
  const name = cityName(city);
  const nc = narrativeCiv(lead.civ);
  if (stage === "foothold") chronicleFoothold(lead, name, standingPeople(comp, lead), nc);
  else chronicleEstablished(city, lead, name, comp.owner, nc);
}

/**
 * Chronicle a city's notable foreign-origin minority when it crosses a fresh share step. Skips when
 * either the host or the origin is a policy-hidden (unmet) civ.
 * @param {*} city A live city object.
 */
function detectFoundingForCity(city) {
  const comp = compositionForCity(city);
  // Skip an unmet HOST (we don't narrate an unmet civ's own city in detail); the diaspora ORIGIN may
  // still be unmet, in which case it's named as hearsay below.
  if (!comp || typeof comp.owner !== "number" || civHidden(comp.owner)) return;
  const lead = leadForeignOrigin(comp);
  if (!lead || lead.share < DIASPORA_MIN) return;
  const tier = Math.floor(lead.share / DIASPORA_STEP); // 1 = 15%, 2 = 30%, …
  const name = cityName(city);
  const dedupeKey = "founding:" + name + "|" + lead.civ + "|" + tier;
  if (chronicled(dedupeKey)) return;
  const nc = narrativeCiv(lead.civ);
  const seed = name + "|" + lead.civ + "|" + tier;
  // Name a quarter from the host city's REAL features (coast/river/mountain/granary/temple/market/
  // walls) so the line never claims a building the city never built; the edge framing also matches
  // where the ethnicity lens paints the diaspora (the sparse rural fringe).
  const where = resolveQuarter(cityFeatureKeys(city), seed);
  const body = foundingLine({
    origin: nc.adj, framed: nc.framed, host: civAdjective(comp.owner), city: name, pct: lead.share * 100, seed, where
  });
  chronicle({
    kind: "founding", title: chronicleTitle({ kind: "founding", civ: nc.adj, city: name, seed }),
    body, civ: nc.adj, dedupeKey
  });
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
  const stage = quarterStage(lead.share, stock);
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
 * @returns {{civ:number, share:number, stock:number, stage:("none"|"foothold"|"established"),
 *   establishedShare:number, minStock:number}|null} The progress, or null.
 */
export function enclaveProgressForCity(city) {
  const comp = compositionForCity(city);
  if (!comp || typeof comp.owner !== "number") return null;
  const lead = leadForeignCivOrigin(comp);
  if (!lead) return null;
  const stock = typeof lead.pts === "number" ? lead.pts : 0;
  return {
    civ: lead.civ,
    share: lead.share || 0,
    stock,
    stage: quarterStage(lead.share, stock),
    establishedShare: establishedShare(),
    minStock: minStock()
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
  quarterStage,
  standingPeople,
  EXODUS_PEOPLE,
  DIASPORA_MIN,
  DIASPORA_STEP,
  QUARTER_FOOTHOLD_SHARE,
  get QUARTER_MIN_STOCK() { return minStock(); },
  get QUARTER_ESTABLISHED_SHARE() { return establishedShare(); }
};
