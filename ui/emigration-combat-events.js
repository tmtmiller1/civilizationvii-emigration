// emigration-combat-events.js
//
// PER-CITY combat evidence, taken from the engine's combat event stream rather than reconstructed by
// polling. This is the "what actually happened, to whom, and who did it" layer under the violence model.
//
// Why events at all, when emigration-violence-signals.js already polls district health: polling samples
// standing state once a turn, so it sees only the residue. It cannot say who caused the damage, it cannot
// see a battle that left the walls untouched, and damage inflicted and repaired between two samples is
// invisible to it. The engine emits the acts themselves -- watched over 10 turns on one save: 107 `Combat`,
// 208 `UnitDamageChanged`, 28 `UnitKilledInCombat`, 25 `DistrictDamageChanged` (mod test 111).
//
// This does NOT replace the polled signals. Polling is the backstop that still works if an event is missed,
// a handler throws, or the mod loads mid-war with a history it never saw; events sharpen it. The two are
// combined in emigration-violence.js by taking the strongest reading rather than the sum, so evidence that
// both sources can see is never counted twice.
//
// Fog does not apply. Watched: every `Combat` event received during mod test 111 was between two OTHER AI
// players while the local player was 0, so a distant war registers exactly as a visible one does. That
// matters because the migration model scores every met civilization's cities, not just the player's.
//
// Division of labour with the Demographics mod, which owns the raw per-PLAYER war tally (it accumulates
// `UnitKilledInCombat` strength and exposes `DemographicsData.casualtyCumFor`, consumed by
// emigration-combat.js for the civ-wide war-severity term): that tracker answers "how badly is this
// civilization bleeding". It has no per-city or per-location dimension, which is exactly what the violence
// model needs, so this module adds that rather than duplicating it. The one hard-won lesson is borrowed
// deliberately: when `UnitKilledInCombat` fires the unit is ALREADY GONE from `Units.get`, so anything
// needed about a unit must be cached while it is still alive.
import { CONFIG } from "/emigration/ui/emigration-config.js";

/** @typedef {{dmg:number, battles:number, kills:number}} Totals */
/** @typedef {{dmg:number, battles:number, kills:number, attackers:number[]}} Evidence */

// HOW READS WORK. Every city keeps RUNNING totals that only ever grow, and each reader keeps a cursor: the
// totals it had already taken, plus the event sequence number it had reached. A read returns what arrived
// since that reader's last read and moves its cursor forward, so every event reaches every reader exactly
// once, however reads and fighting interleave.
//
// This replaced a "current turn, else previous turn" window, which was wrong in both directions: once any
// fighting landed before the violence model's once-a-turn read, the previous turn's fights were never read,
// and the early part of the current turn was read again the following turn. Mod test 116 surfaced the
// symptom as fights counted twice by a probe sampling every turn.

/** @type {Map<string, Totals>} Per-city running totals since load, keyed "owner:id". */
const _totals = new Map();
/** @type {Map<string, Map<number, number>>} Per-city attackers -> sequence number of their latest involvement. */
const _attackers = new Map();
/** @type {Map<string, Map<string, Totals & {seq:number}>>} Reader -> city key -> what that reader has taken. */
const _cursors = new Map();
/** @type {number} Monotonic event sequence; also the lifetime count of accepted events. */
let _seq = 0;
/** @type {number} The turn the unit-position cache belongs to. */
let _turn = -1;
/** @type {Map<string, {x:number, y:number}>} Last known unit positions: the dead cannot be located. */
const _unitLoc = new Map();
/** @type {*[]} Live subscriptions, so stop() can detach exactly what start() attached. */
let _subs = [];

/** @returns {number} The current game turn, or 0. */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * A stable key for a city ComponentID. Mirrors keyFromCID in emigration-violence.js deliberately: the two
 * ledgers must agree on what names a city, and `ComponentID.toBitfield` is unreliable for city ids.
 * @param {*} cid A city ComponentID. @returns {string|null} The key, or null.
 */
function cityKey(cid) {
  if (!cid || typeof cid.owner !== "number" || cid.id == null) return null;
  return cid.owner + ":" + cid.id;
}

/**
 * Forget cached unit positions once the turn moves on. A position only has to survive from a unit's last
 * `Combat` to its `UnitKilledInCombat`, which happen in the same turn, so the cache never needs to grow.
 */
function rollUnitCache() {
  const t = gameTurn();
  if (t === _turn) return;
  _unitLoc.clear();
  _turn = t;
}

/**
 * Accept one event at a city: bump the sequence and return the city's running totals.
 * @param {string} key The city key. @returns {Totals} The totals to add to.
 */
function accept(key) {
  _seq++;
  let t = _totals.get(key);
  if (!t) {
    t = { dmg: 0, battles: 0, kills: 0 };
    _totals.set(key, t);
  }
  return t;
}

/**
 * The city whose territory contains a plot, as a key.
 * @param {*} loc A {x,y} location. @returns {string|null} The city key, or null.
 */
function cityAt(loc) {
  if (!loc || typeof loc.x !== "number") return null;
  try {
    return cityKey(GameplayMap.getOwningCityFromXY(loc.x, loc.y));
  } catch (_) {
    return null;
  }
}

/**
 * A unit's location, preferring the live object and falling back to the last position we cached for it.
 * A unit killed in combat is already unreachable through `Units.get`, which is why the cache exists.
 * @param {*} cid A unit ComponentID. @returns {{x:number,y:number}|null} The location, or null.
 */
function unitLoc(cid) {
  const key = cid && typeof cid.owner === "number" ? cid.owner + ":" + cid.id : null;
  if (!key) return null;
  rollUnitCache();
  try {
    const l = Units.get?.(cid)?.location;
    if (l && typeof l.x === "number") {
      _unitLoc.set(key, { x: l.x, y: l.y });
      return l;
    }
  } catch (_) {
    /* the unit is gone; fall through to the cache */
  }
  return _unitLoc.get(key) || null;
}

/**
 * A fight happened. Both combatants are still alive here, so this is the moment to learn where they are --
 * and it is the only event that names an attacker and a defender together.
 * @param {*} data The `Combat` payload.
 */
function onCombat(data) {
  const atk = data && data.attacker;
  const def = data && data.defender;
  if (!atk || !def || typeof atk.owner !== "number") return;
  // Cache both positions while they still resolve, so a kill event moments later can still be placed.
  const dl = unitLoc(def);
  unitLoc(atk);
  // Attribute the battle to whoever's land it happened on. A fight in a city's territory is that city's
  // war whether or not a single point of district damage was scored.
  const key = cityAt(dl);
  if (!key) return;
  accept(key).battles++;
  nameOutsiders(key, [atk, def]);
}

/**
 * Record whichever combatants are NOT the city's own owner. Naming only the striking side misses the enemy
 * every time the defender wins: watched at Lille (mod test 115), where the owner killed an invader in its own
 * territory and the invader went unnamed because it appeared as the victim rather than the aggressor. Who
 * brought violence into this city's land is the question, and losing the fight does not answer it differently.
 * @param {string} key The city key. @param {*[]} parties Combatant ComponentIDs.
 */
function nameOutsiders(key, parties) {
  const owner = Number(key.split(":")[0]);
  let seen = _attackers.get(key);
  for (const p of parties) {
    if (!p || typeof p.owner !== "number" || p.owner < 0 || p.owner === owner) continue;
    if (!seen) {
      seen = new Map();
      _attackers.set(key, seen);
    }
    seen.set(p.owner, _seq);
  }
}

/**
 * Someone died. Casualties are the sharpest evidence that violence was real rather than posturing, and
 * polling cannot see them at all: a unit built and destroyed between two samples leaves no trace.
 * @param {*} data The `UnitKilledInCombat` payload.
 */
function onKill(data) {
  const killed = data && data.unitKilled;
  const killer = data && data.unitKiller;
  if (!killed) return;
  const key = cityAt(unitLoc(killed)) || cityAt(unitLoc(killer));
  if (!key) return;
  accept(key).kills++;
  nameOutsiders(key, [killer, killed]);
}

/**
 * District damage, with the exact delta and the city it belongs to. This is the same harm the polled
 * `districtDamageFrac` measures, but reported as it happens: damage inflicted and repaired inside one turn
 * is invisible to polling and lands here in full.
 * @param {*} data The `DistrictDamageChanged` payload.
 */
function onDistrictDamage(data) {
  const key = cityKey(data && data.cityID);
  if (!key) return;
  const now = Number(data.newDamage) || 0;
  const was = Number(data.prevDamage) || 0;
  // Negative deltas are repair, which is not violence. Only fresh harm counts.
  const delta = now - was;
  if (delta <= 0) return;
  const max = Number(data.maxDamage) > 0 ? Number(data.maxDamage) : 100;
  accept(key).dmg += delta / max;
}

/** @returns {Evidence} Nothing seen. */
const EMPTY = () => ({ dmg: 0, battles: 0, kills: 0, attackers: [] });

/**
 * Take what the events saw at a city since this reader last took it, and move the reader's cursor past it.
 * Damage is a fraction of district health; battles and kills are counts; attackers are everyone other than
 * the city's owner involved in a fight there during that span. A reader that has never read a city gets
 * everything since load. Different readers never consume each other's evidence.
 * @param {string|null} key The city key. @param {string} [reader] Who is reading (default "violence").
 * @returns {Evidence} What arrived since this reader's last take.
 */
export function takeCombatEvidence(key, reader = "violence") {
  if (!key || !CONFIG.combatEventsEnabled) return EMPTY();
  const out = peekCombatEvidence(key, reader);
  let byCity = _cursors.get(reader);
  if (!byCity) {
    byCity = new Map();
    _cursors.set(reader, byCity);
  }
  const t = _totals.get(key) || { dmg: 0, battles: 0, kills: 0 };
  byCity.set(key, { dmg: t.dmg, battles: t.battles, kills: t.kills, seq: _seq });
  return out;
}

/**
 * The same answer as takeCombatEvidence, without moving the cursor.
 * @param {string|null} key The city key. @param {string} [reader] Who is reading (default "violence").
 * @returns {Evidence} What has arrived since this reader's last take.
 */
export function peekCombatEvidence(key, reader = "violence") {
  if (!key || !CONFIG.combatEventsEnabled) return EMPTY();
  const t = _totals.get(key);
  if (!t) return EMPTY();
  const c = _cursors.get(reader)?.get(key) || { dmg: 0, battles: 0, kills: 0, seq: 0 };
  /** @type {number[]} */
  const attackers = [];
  for (const [pid, seq] of _attackers.get(key) || []) if (seq > c.seq) attackers.push(pid);
  return {
    // Floating-point subtraction of two running sums can dip a hair below zero; that is not negative harm.
    dmg: Math.max(0, t.dmg - c.dmg),
    battles: Math.max(0, t.battles - c.battles),
    kills: Math.max(0, t.kills - c.kills),
    attackers
  };
}

/** Test seam: drop every accumulated reading and every cursor. */
export function _resetCombatEvents() {
  _totals.clear();
  _attackers.clear();
  _cursors.clear();
  _unitLoc.clear();
  _seq = 0;
  _turn = -1;
}

/**
 * Subscribe to the combat stream. Safe to call twice (the second call is a no-op) and safe to call where
 * `engine` does not exist, so the module is inert off-engine and in tests.
 * @returns {boolean} Whether anything was attached.
 */
export function startCombatEvents() {
  if (_subs.length || !CONFIG.combatEventsEnabled) return false;
  /** @type {Array<[string, (data:*)=>void]>} */
  const wire = [
    ["Combat", onCombat],
    ["UnitKilledInCombat", onKill],
    ["DistrictDamageChanged", onDistrictDamage]
  ];
  for (const [name, fn] of wire) {
    try {
      // A handler that throws must never take the engine's event dispatch down with it.
      const guarded = (/** @type {*} */ d) => {
        try {
          fn(d);
        } catch (_) {
          /* one malformed payload must not stop the tracker */
        }
      };
      engine.on(name, guarded);
      _subs.push({ name, fn: guarded });
    } catch (_) {
      /* an event name this build does not know: skip it and keep the rest */
    }
  }
  exposeLedger();
  return _subs.length > 0;
}

/**
 * Publish the ledger on `globalThis`, the way the Demographics mod publishes its war tally. A UI script in
 * another mod that imports this file does NOT share this module instance -- it gets a fresh one whose tracker
 * was never started and whose maps are therefore always empty -- so an import is not a way to read these
 * numbers from outside. This global is. It is also how any other mod, or a probe, can see per-city combat
 * without duplicating the subscription.
 */
function exposeLedger() {
  try {
    const g = /** @type {*} */ (globalThis);
    g.EmigrationCombat = Object.assign(g.EmigrationCombat || {}, {
      // Readers outside this mod must pass their own reader name: taking as "violence" would steal the
      // evidence the migration model is about to read.
      take: (/** @type {string} */ key, /** @type {string} */ reader) => takeCombatEvidence(key, reader || "external"),
      peek: (/** @type {string} */ key, /** @type {string} */ reader) => peekCombatEvidence(key, reader || "external"),
      // A live count of what has been recorded, so "the tracker is not running" and "nothing has happened
      // yet" can be told apart from outside -- the distinction this module was unobservable without.
      stats: () => ({ tracking: _subs.length > 0, turn: gameTurn(), cities: _totals.size, seen: _seq })
    });
  } catch (_) {
    /* exposing data must never break the tracker */
  }
}

/** Detach every subscription this module made. */
export function stopCombatEvents() {
  for (const s of _subs) {
    try {
      engine.off(s.name, s.fn);
    } catch (_) {
      /* ignore */
    }
  }
  _subs = [];
}
