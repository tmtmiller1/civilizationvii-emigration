// emigration-cities.js
//
// Enumerate the world's cities and read the per-city signals the Prosperity
// model needs. Everything is defensive: any unreadable signal degrades to a
// neutral default rather than throwing.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { ruralPop, totalPop } from "/emigration/ui/emigration-population.js";
import { observeCity } from "/emigration/ui/emigration-violence.js";
import { observeDisaster } from "/emigration/ui/emigration-disasters.js";

/**
 * A snapshot of one city's emigration-relevant state.
 * @typedef {Object} CitySignal
 * @property {*} city The live city object (for writes).
 * @property {string} key Stable per-game key (owner:localId).
 * @property {number} owner Owner player id.
 * @property {boolean} isTown Whether it's a town (vs a city).
 * @property {boolean} isCityState Whether the owner is a minor/city-state.
 * @property {number} population Total population.
 * @property {number} rural Rural population (the mobile pool).
 * @property {number} urban Urban population (drives overcrowding - Algorithm B).
 * @property {number} food Net food yield.
 * @property {number} production Net production yield.
 * @property {number} gold Net gold yield.
 * @property {number} science Net science yield.
 * @property {number} culture Net culture yield.
 * @property {number} happiness City net happiness.
 * @property {boolean} unrest Whether the city is in unrest.
 * @property {boolean} starving Whether net food is negative.
 * @property {boolean} siege Whether the city is being razed / besieged.
 * @property {boolean} atWar Whether the owner is at war (used for flee direction).
 * @property {number} violence Accumulated combat intensity in the city's borders.
 * @property {number} disaster Accumulated environmental-disaster distress (§11).
 * @property {boolean} infected Whether the city is suffering a plague outbreak.
 */

/**
 * Resolve a YieldTypes enum value by key.
 * @param {string} key e.g. "YIELD_FOOD".
 * @returns {*} The enum value, or undefined.
 */
function yEnum(key) {
  try {
    return typeof YieldTypes !== "undefined" ? YieldTypes[key] : undefined;
  } catch (_) {
    return undefined;
  }
}

/**
 * Read one net yield off a city, defaulting to 0.
 * @param {*} city City object.
 * @param {string} key Yield enum key.
 * @returns {number} The yield value.
 */
function readYield(city, key) {
  try {
    const v = city?.Yields?.getYield?.(yEnum(key));
    return typeof v === "number" && isFinite(v) ? v : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Read a city's net happiness (prefer the Happiness subsystem, fall back to the
 * happiness yield).
 * @param {*} city City object.
 * @returns {number} Net happiness.
 */
function readHappiness(city) {
  try {
    const h = city?.Happiness?.netHappinessPerTurn;
    if (typeof h === "number" && isFinite(h)) return h;
  } catch (_) {
    /* fall through */
  }
  return readYield(city, "YIELD_HAPPINESS");
}

/**
 * Whether the city's owner is at war (best-effort across Diplomacy shapes).
 * @param {*} player Owner player.
 * @returns {boolean} True if at war.
 */
function ownerAtWar(player) {
  try {
    const d = player?.Diplomacy;
    if (!d) return false;
    if (typeof d.getWarCount === "function") return d.getWarCount() > 0;
    if (typeof d.isAtWar === "function") return !!d.isAtWar();
  } catch (_) {
    /* ignore */
  }
  return false;
}

/**
 * Whether the local player has met `owner` (for the requireMet scope).
 * @param {number} owner Player id to test.
 * @returns {boolean} True if met (or self).
 */
function localHasMet(owner) {
  try {
    const me = GameContext.localPlayerID;
    if (owner === me) return true;
    const lp = Players.get(me);
    return !!lp?.Diplomacy?.hasMet?.(owner);
  } catch (_) {
    return true;
  }
}

/**
 * Build a CitySignal for one city, or null when it should be skipped.
 * @param {*} city City object.
 * @param {*} player Owner player.
 * @param {boolean} isCityState Whether the owner is a minor.
 * @returns {CitySignal|null} The signal, or null.
 */
function buildSignal(city, player, isCityState) {
  try {
    if (!city) return null;
    const owner = city.owner;
    const food = readYield(city, "YIELD_FOOD");
    return {
      city,
      key: owner + ":" + (city.localId ?? city.id ?? "?"),
      owner,
      isTown: !!city.isTown,
      isCityState,
      population: totalPop(city),
      rural: ruralPop(city),
      urban: typeof city.urbanPopulation === "number" ? city.urbanPopulation : 0,
      food,
      production: readYield(city, "YIELD_PRODUCTION"),
      gold: readYield(city, "YIELD_GOLD"),
      science: readYield(city, "YIELD_SCIENCE"),
      culture: readYield(city, "YIELD_CULTURE"),
      happiness: readHappiness(city),
      unrest: !!city?.Happiness?.hasUnrest,
      starving: food < 0,
      siege: !!city.isBeingRazed,
      atWar: ownerAtWar(player),
      violence: observeCity(city),
      disaster: observeDisaster(city),
      infected: !!city.isInfected
    };
  } catch (_) {
    return null;
  }
}

/**
 * Resolve a player eligible for emigration scanning, or null to skip them
 * (dead, a filtered city-state, or unmet under the requireMet scope).
 * @param {number} pid Player id.
 * @returns {{player:*, isCityState:boolean}|null} The eligible player, or null.
 */
function eligiblePlayer(pid) {
  let player;
  try {
    player = Players.get(pid);
  } catch (_) {
    return null;
  }
  if (!player || !player.isAlive) return null;
  const isCityState = player.isMajor === false || player.isMinor === true;
  if (isCityState && !CONFIG.includeCityStates) return null;
  if (CONFIG.requireMet && !localHasMet(pid)) return null;
  return { player, isCityState };
}

/**
 * Append a player's city signals to `out`.
 * @param {*} player Owner player.
 * @param {boolean} isCityState Whether the owner is a minor.
 * @param {CitySignal[]} out Accumulator.
 */
function collectPlayerCities(player, isCityState, out) {
  let cities;
  try {
    cities = player.Cities?.getCities?.();
  } catch (_) {
    return;
  }
  if (!cities) return;
  for (const c of cities) {
    const sig = buildSignal(c, player, isCityState);
    if (sig) out.push(sig);
  }
}

/**
 * Enumerate every eligible city in the world as a CitySignal list.
 * @returns {CitySignal[]} The signals.
 */
export function collectCitySignals() {
  /** @type {CitySignal[]} */
  const out = [];
  for (let pid = 0; pid < 64; pid++) {
    const e = eligiblePlayer(pid);
    if (e) collectPlayerCities(e.player, e.isCityState, out);
  }
  return out;
}
