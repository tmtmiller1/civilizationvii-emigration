// emigration-migrant-units.js
//
// The migrant-holding penalty: discourage hoarding unsettled UNIT_MIGRANT units by charging a civ
// per migrant it holds, scaling with the count (via grantYield, like the assimilation cost in
// effects.js). Counting another civ's units may be fog-limited; reliable for the local
// player. Probe-confirmed: foreign unit enumeration works, so it applies to AI civs on their turn.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { deduct } from "/emigration/ui/emigration-effects.js";

/**
 * The UNIT_MIGRANT type hash, or undefined.
 * @returns {*} Hash or undefined.
 */
function migrantHash() {
  try {
    return typeof Database !== "undefined" ? Database?.makeHash?.("UNIT_MIGRANT") : undefined;
  } catch (_) {
    return undefined;
  }
}

/**
 * Whether a unit type resolves (via GameInfo) to UNIT_MIGRANT.
 * @param {*} type A unit type value.
 * @returns {boolean} True if it's the migrant type.
 */
function migrantByInfo(type) {
  try {
    const info = typeof GameInfo !== "undefined" ? GameInfo?.Units?.lookup?.(type) : null;
    return info?.UnitType === "UNIT_MIGRANT";
  } catch (_) {
    return false;
  }
}

/**
 * Whether a unit is a migrant (robust across `unit.type` shapes).
 * @param {*} unit A unit object.
 * @returns {boolean} True if it's a UNIT_MIGRANT.
 */
function isMigrant(unit) {
  if (!unit) return false;
  const h = migrantHash();
  if (h != null && unit.type === h) return true;
  if (migrantByInfo(unit.type)) return true;
  return typeof unit.name === "string" && /migrant/i.test(unit.name);
}

/**
 * Count the migrant units a player holds.
 * @param {number} pid Player id.
 * @returns {number} Migrant count.
 */
export function countMigrants(pid) {
  let n = 0;
  try {
    const units = Players.get(pid)?.Units?.getUnits?.();
    if (units) {
      for (const u of units) {
        if (isMigrant(u)) n++;
      }
    }
  } catch (_) {
    /* ignore */
  }
  return n;
}

/**
 * Charge a player the per-turn cost of every migrant unit it holds (via grantYield). Returns the
 * count and amounts charged.
 * @param {number} pid Player id.
 * @returns {{count:number, happiness:number, gold:number}} Outcome.
 */
export function applyMigrantHoldingPenalty(pid) {
  if (typeof pid !== "number") return { count: 0, happiness: 0, gold: 0 };
  const count = countMigrants(pid);
  if (count <= 0) return { count: 0, happiness: 0, gold: 0 };
  const happiness = CONFIG.migrantHoldHappiness * count;
  const gold = CONFIG.migrantHoldGold * count;
  deduct(pid, "YIELD_HAPPINESS", -happiness);
  deduct(pid, "YIELD_GOLD", -gold);
  return { count, happiness, gold };
}
