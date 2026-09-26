// emigration-built.js
//
// The BUILT ENVIRONMENT of a settlement as a reason to stay: its wonders, and the kinds of civic
// infrastructure it actually holds (a granary, a market, a school, walls).
//
// The prosperity model counts every building through the city's per-capita NET YIELDS, which cannot
// see what a building does beyond its yield and shrinks as a settlement grows. So this term is NOT
// per-capita: it scores what the settlement HAS, once per KIND (each wonder on its own, capped, as
// prestige; each ROLE present once: safety, amenity, sustenance, shelter, learning, culture, trade,
// work, civic), so three markets are one reason to stay and the term stays bounded.
//
// Roles are DERIVED from the compiled database at runtime (GameInfo.Constructibles / Buildings /
// Constructible_YieldChanges), never from a hand-written list, so buildings from any age, DLC or mod
// count; an unexplained type still counts as the generic "civic" role. Pillaged constructibles are
// skipped. The per-plot scan is cached and refreshed only every `builtRefreshTurns` turns.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";

/**
 * Ordered role tests: the FIRST match names the building, so each one is credited for its most
 * characteristic job rather than for everything it happens to touch. Defense outranks yields
 * deliberately — walls are a reason to stay that has nothing to do with output.
 * @type {ReadonlyArray<[string, (d: {def:*, bld:*, ys:Set<string>}) => boolean]>}
 */
const ROLE_TESTS = Object.freeze([
  ["prestige", (d) => d.def.ConstructibleClass === "WONDER"],
  // `DistrictDefense` is the flag that matters in practice: checked against the compiled database,
  // Ancient Walls, the Motte, the Bailey and the Citadel all carry it with `Defense` at 0, so reading
  // only the numeric fields classed the walls themselves as generic civic buildings.
  ["safety", (d) => truthy(d.def.DistrictDefense) || pos(d.def.Defense) || pos(d.bld.DefenseModifier)
    || pos(d.bld.OuterDefenseStrength) || pos(d.bld.GrantFortification)],
  ["amenity", (d) => d.ys.has("YIELD_HAPPINESS")],
  ["sustenance", (d) => d.ys.has("YIELD_FOOD")],
  ["shelter", (d) => pos(d.bld.Housing)],
  ["learning", (d) => d.ys.has("YIELD_SCIENCE")],
  ["culture", (d) => d.ys.has("YIELD_CULTURE")],
  ["trade", (d) => d.ys.has("YIELD_GOLD")],
  ["work", (d) => d.ys.has("YIELD_PRODUCTION") || pos(d.bld.CitizenSlots)]
]);

/** Every role in priority order, ending in the catch-all. @type {readonly string[]} */
const ROLE_ORDER = Object.freeze([...ROLE_TESTS.map(([r]) => r), "civic"]);

/** @typedef {{role:string, name:string, wonder:boolean}} BuiltKind What one constructible type contributes. */

/** @type {Map<string, BuiltKind>|null} ConstructibleType → its kind, built once from GameInfo. */
let _index = null;
/** @type {Map<string, {turn:number, score:number, names:string[], roles:string[]}>} Per-city cache. */
const _cache = new Map();

registerCacheReset(() => {
  _index = null;
  _cache.clear();
});

/** @returns {number} The current game turn, or 0. */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Run `fn`, returning `fb` on any throw. Every database and engine read here is optional: a missing
 * table simply contributes nothing rather than taking the scoring pass down with it.
 * @param {() => *} fn The read. @param {*} fb The fallback. @returns {*} The value or the fallback.
 */
function safe(fn, fb) {
  try {
    return fn();
  } catch (_) {
    return fb;
  }
}

/**
 * Iterate a GameInfo table defensively (it is iterable in-engine and absent off-engine).
 * @param {string} table The table name. @returns {*[]} Its rows, or [].
 */
function rows(table) {
  return safe(() => {
    const t = typeof GameInfo !== "undefined" ? /** @type {*} */ (GameInfo)[table] : null;
    return t ? [...t] : [];
  }, []);
}

/**
 * Which yields a constructible type produces, as a set of YieldType strings.
 * @returns {Map<string, Set<string>>} ConstructibleType → the yield types it grants.
 */
function yieldIndex() {
  /** @type {Map<string, Set<string>>} */
  const out = new Map();
  for (const r of rows("Constructible_YieldChanges")) {
    const t = r && r.ConstructibleType;
    const y = r && r.YieldType;
    if (!t || !y || !(Number(r.YieldChange) > 0)) continue;
    const s = out.get(t) || new Set();
    s.add(y);
    out.set(t, s);
  }
  return out;
}

/**
 * The building row per constructible type (housing, defense, citizen slots).
 * @returns {Map<string, *>} ConstructibleType → its Buildings row.
 */
function buildingIndex() {
  /** @type {Map<string, *>} */
  const out = new Map();
  for (const b of rows("Buildings")) {
    if (b && b.ConstructibleType) out.set(b.ConstructibleType, b);
  }
  return out;
}

/** @param {*} v A database value. @returns {boolean} Whether it is a positive number. */
function pos(v) {
  return Number(v) > 0;
}

/**
 * Whether a database BOOLEAN is set. The runtime hands these back as true/false, the compiled SQLite
 * as 1/0, so both are accepted.
 * @param {*} v A database value. @returns {boolean} Whether it is set.
 */
function truthy(v) {
  return v === true || Number(v) > 0;
}

/**
 * The ROLE a constructible fills: the first of {@link ROLE_ORDER} it satisfies, so each building is
 * named by its most characteristic job rather than by everything it happens to touch. Defense outranks
 * yields deliberately — walls are a reason to stay that has nothing to do with output.
 * @param {*} def The Constructibles row. @param {*} bld Its Buildings row, or undefined.
 * @param {Set<string>} ys The yield types it grants.
 * @returns {string} A role key.
 */
function roleFor(def, bld, ys) {
  const d = { def: def || {}, bld: bld || {}, ys: ys || new Set() };
  for (const [role, test] of ROLE_TESTS) {
    if (test(d)) return role;
  }
  return "civic";
}

/**
 * Build (once) the ConstructibleType → kind index from the compiled database. IMPROVEMENTs are left
 * out: a farm is a worked tile, already fully represented by the yields it produces.
 * @returns {Map<string, BuiltKind>} The index (empty off-engine, which makes the whole term 0).
 */
function index() {
  resetCachesOnNewGame();
  if (_index) return _index;
  const ys = yieldIndex();
  const blds = buildingIndex();
  /** @type {Map<string, BuiltKind>} */
  const idx = new Map();
  for (const def of rows("Constructibles")) {
    const type = def && def.ConstructibleType;
    if (!type) continue;
    const cls = def.ConstructibleClass;
    if (cls !== "BUILDING" && cls !== "WONDER") continue;
    idx.set(type, {
      role: roleFor(def, blds.get(type), ys.get(type) || new Set()),
      name: typeof def.Name === "string" ? def.Name : "",
      wonder: cls === "WONDER"
    });
  }
  _index = idx;
  return _index;
}

/**
 * The kind of one constructible instance on the map, or null when it is pillaged, unreadable, or not a
 * building/wonder.
 * @param {*} cid A constructible ComponentID. @returns {BuiltKind|null} Its kind.
 */
function kindOf(cid) {
  return safe(() => {
    const inst = Constructibles.getByComponentID(cid);
    if (!inst || inst.damaged) return null; // a burnt granary is not a reason to stay
    const def = GameInfo.Constructibles.lookup(inst.type);
    const type = def && def.ConstructibleType;
    return type ? index().get(type) || null : null;
  }, null);
}

/**
 * Every building/wonder kind standing on a settlement's own plots.
 * @param {*} city A live city object. @returns {BuiltKind[]} The kinds found (possibly empty).
 */
function kindsIn(city) {
  /** @type {BuiltKind[]} */
  const out = [];
  const plots = safe(() => city.getPurchasedPlots() || [], []);
  for (const plot of plots) {
    const loc = safe(() => GameplayMap.getLocationFromIndex(plot), null);
    if (!loc) continue;
    for (const cid of safe(() => MapConstructibles.getConstructibles(loc.x, loc.y) || [], [])) {
      const k = kindOf(cid);
      if (k) out.push(k);
    }
  }
  return out;
}

/** @param {string} role A role key. @returns {number} Its configured weight (0 when unset). */
function roleWeight(role) {
  const w = CONFIG.builtRoleWeights && CONFIG.builtRoleWeights[role];
  return Number.isFinite(Number(w)) ? Number(w) : 0;
}

/**
 * Split the kinds found in a settlement into its wonders and the FIRST building seen for each role, so
 * three markets collapse to one "trade" reason to stay rather than three.
 * @param {BuiltKind[]} kinds The kinds found in the settlement.
 * @returns {{firstByRole:Map<string,string>, wonders:string[]}} The partition.
 */
function partition(kinds) {
  /** @type {Map<string, string>} */
  const firstByRole = new Map();
  /** @type {string[]} */
  const wonders = [];
  for (const k of kinds || []) {
    if (!k) continue;
    if (k.wonder) {
      if (k.name) wonders.push(k.name);
    } else if (!firstByRole.has(k.role)) {
      firstByRole.set(k.role, k.name || "");
    }
  }
  return { firstByRole, wonders };
}

/**
 * Score a settlement's built environment from the kinds standing in it (see {@link scoreKinds}).
 * @param {BuiltKind[]} kinds The kinds found in the settlement.
 * @returns {{score:number, names:string[], roles:string[]}} The reading.
 */
export function scoreKinds(kinds) {
  const { firstByRole, wonders } = partition(kinds);
  const wonderCount = Math.min(wonders.length, Math.max(0, Number(CONFIG.builtWonderCap) || 0));
  let score = wonderCount * roleWeight("prestige");
  const roles = ROLE_ORDER.filter((r) => r !== "prestige" && firstByRole.has(r));
  for (const r of roles) score += roleWeight(r);
  const cap = Number(CONFIG.builtCap);
  if (Number.isFinite(cap) && cap > 0) score = Math.min(score, cap);
  const names = wonders.slice(0, wonderCount).concat(roles.map((r) => firstByRole.get(r) || ""));
  return { score, names: names.filter(Boolean), roles: wonders.length ? ["prestige", ...roles] : roles };
}

/**
 * A settlement's built-environment reading: the score its wonders and civic infrastructure add to its
 * attractiveness, plus the LOC name tags of what earned it (so the readout can say "Granary, Market,
 * Academy" rather than only a number). Cached and refreshed every `builtRefreshTurns` turns, because
 * the answer changes over dozens of turns and the scan is per-plot.
 * @param {*} city A live city object.
 * @returns {{score:number, names:string[], roles:string[]}} The reading (all-zero when disabled).
 */
export function builtFor(city) {
  const empty = { score: 0, names: [], roles: [] };
  if (!CONFIG.builtEnabled) return empty;
  resetCachesOnNewGame();
  const key = safe(() => (typeof city.owner === "number" && city.id != null)
    ? city.owner + ":" + city.id.id : null, null);
  if (!key) return empty;
  const turn = gameTurn();
  const hit = _cache.get(key);
  const every = Math.max(1, Number(CONFIG.builtRefreshTurns) || 1);
  if (hit && turn - hit.turn < every) return { score: hit.score, names: hit.names, roles: hit.roles };
  const scored = scoreKinds(kindsIn(city));
  _cache.set(key, { turn, score: scored.score, names: scored.names, roles: scored.roles });
  return scored;
}

export const __test = {
  roleFor, scoreKinds, ROLE_ORDER,
  /** Test seam: drop the per-settlement cache and the database index. */
  reset() {
    _index = null;
    _cache.clear();
  }
};
