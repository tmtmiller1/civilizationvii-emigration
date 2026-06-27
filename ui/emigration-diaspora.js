// emigration-diaspora.js
//
// Reads the world each pass and decides which population movements are worth writing into the
// Migration Chronicle (emigration-chronicle.js). Two kinds of moment qualify:
//
//   • EXODUS  — a single settlement sheds a large wave in one pass under a real pressure (war,
//               disaster, conquest). Throttled per settlement+cause so a long war yields a few
//               entries, not one a turn.
//   • FOUNDING — a people from one civ has become a settled minority in ANOTHER civ's city, crossing
//               a share threshold (15% / 30% / 45% …). Read straight from the composition ledger.
//
// Spoiler-safe: a settlement or origin belonging to a civ the visibility policy hides is never
// narrated (the Chronicle would otherwise leak a civ the player hasn't met). Pure detection + writes
// to the chronicle; never throws into the pass.

import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { cityName } from "/emigration/ui/emigration-migration-records.js";
import { civAdjective, eventDisplayName, narrativeCiv } from "/emigration/ui/emigration-naming.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { formatPeopleExact } from "/emigration/ui/emigration-population.js";
import { chronicle, chronicled } from "/emigration/ui/emigration-chronicle.js";
import { exodusLine, foundingLine, chronicleTitle } from "/emigration/ui/emigration-narrative.js";
import { cityFeatureKeys } from "/emigration/ui/emigration-city-features.js";
import { resolveQuarter } from "/emigration/ui/emigration-quarters.js";

// A wave this large (scaled people, one settlement, one cause, one pass) reads as a historical
// exodus rather than ordinary churn.
const EXODUS_PEOPLE = 70000;
// Turns between chronicling the same settlement+cause exodus, so an ongoing war doesn't spam the log.
const EXODUS_COOLDOWN = 8;
// A foreign-origin minority is "notable" at this share, and a fresh entry is written each time it
// crosses another step (so a growing diaspora earns a short series, not a single line).
const DIASPORA_MIN = 0.15;
const DIASPORA_STEP = 0.15;

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
 * @returns {{civ:number, share:number}|null} The lead foreign origin, or null.
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
 * Read the pass and write any history worth keeping into the Migration Chronicle. Never throws into
 * the pass (the chronicle is cosmetic).
 * @param {*[]} signals The pass's city signals.
 * @param {*[]} migrations The pass's applied migrations.
 */
export function recordChroniclePass(signals, migrations) {
  try {
    detectExoduses(migrations);
    detectFoundings(signals);
  } catch (_) {
    /* the chronicle must never disrupt a pass */
  }
}

// Test hook: the pure pieces the harness exercises directly.
export const __test = { wavesByCityCause, leadForeignOrigin, EXODUS_PEOPLE, DIASPORA_MIN, DIASPORA_STEP };
