// emigration-violence-signals.js
//
// The POLLED, fog-independent combat signals that drive the violence model (in emigration-
// violence.js): city-center district damage and pillaged tiles, read from the gameplay model.
// Pure reads, no state, no mutation, so a war the player can watch and a distant AI-vs-AI war in
// the dark register identically (the base game only gates the on-screen HEALTH BAR by visibility,
// not the underlying values). The stateful intensity accumulation / decay / siege model consumes
// these; it lives in emigration-violence.js.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { noteDamage } from "/emigration/ui/emigration-damage-age.js";

/**
 * Whether a live District has been overrun, its controlling player differs from its owner (the
 * captured/contested test the base game's district-health UI uses).
 * @param {*} d A live District object.
 * @returns {boolean} True when contested.
 */
function districtIsContested(d) {
  return !!(d && d.owner != null && d.controllingPlayer != null && d.owner !== d.controllingPlayer);
}

/**
 * The owner's Districts accessor, or null.
 * @param {*} city A live city object.
 * @returns {*} The Districts component, or null.
 */
function cityDistricts(city) {
  try {
    return Players?.Districts?.get?.(city?.owner) || null;
  } catch (_) {
    return null;
  }
}

/**
 * Whether a live District belongs to the city identified by ComponentID `cid` (matched on owner+id,
 * since `getDistrictIds` spans ALL of a player's cities).
 * @param {*} d A live District object.
 * @param {*} cid The city's ComponentID.
 * @returns {boolean} True when the district is part of that city.
 */
function districtInCity(d, cid) {
  const dc = d?.cityId;
  return !!(d?.location && dc && cid && dc.owner === cid.owner && dc.id === cid.id);
}

/**
 * Every district id belonging to a city's owner (spans all that player's cities), or [] if the
 * Districts API is unavailable.
 * @param {*} city A live city object.
 * @returns {*[]} District ids.
 */
function ownerDistrictIds(city) {
  try {
    const pd = cityDistricts(city);
    if (pd && typeof pd.getDistrictIds === "function") return pd.getDistrictIds() || [];
  } catch (_) {
    /* ignore */
  }
  return [];
}

/**
 * Every district that belongs to THIS city, the city center PLUS every other urban/rural quarter,
 * as live District objects, read the way the base game's own district-health UI does it
 * (`getDistrictIds()` spans all the player's districts → `Districts.get` → filter by `cityId`).
 * Empty when enumeration is unavailable (callers fall back to the city-center plot).
 *
 * This is what lets damage to / sieges of a city's OUTER districts register as violence: an attacker
 * who "kills districts" on the urban edge can leave the city CENTER pristine and un-besieged, which a
 * center-only poll reads as zero conflict even though the city is plainly under assault.
 * @param {*} city A live city object.
 * @returns {*[]} The city's live District objects (empty only if reads fail / API absent).
 */
function cityDistrictObjs(city) {
  /** @type {*[]} */
  const out = [];
  const cid = city?.id;
  if (!cid) return out;
  for (const did of ownerDistrictIds(city)) {
    const d = Districts?.get?.(did);
    if (districtInCity(d, cid)) out.push(d);
  }
  return out;
}

/**
 * The district plot locations to poll for this city, every district when enumerable, else just the
 * city-center plot (so behaviour never regresses below the old center-only read).
 * @param {*} city A live city object.
 * @returns {Array<{x:number,y:number}>} District plot locations.
 */
function districtLocations(city) {
  const locs = cityDistrictObjs(city).map(d => d.location).filter(Boolean);
  if (locs.length) return locs;
  return city?.location ? [city.location] : [];
}

/**
 * The WORST damage among ALL of the city's districts as a fraction of max health (0 = every district
 * pristine, 1 = a district destroyed), read straight from the gameplay model, not just the city
 * center. 0 when unreadable.
 * @param {*} city A live city object.
 * @returns {number} Damage fraction in [0, 1].
 */
export function districtDamageFrac(city) {
  const pd = cityDistricts(city);
  if (!pd) return 0;
  let worst = 0;
  for (const loc of districtLocations(city)) {
    try {
      const max = pd.getDistrictMaxHealth(loc);
      const cur = pd.getDistrictHealth(loc);
      if (!(max > 0) || typeof cur !== "number") continue;
      const damage = max - cur;
      if (damage > 0) worst = Math.max(worst, damage / max);
    } catch (_) {
      /* skip this district, keep scanning the rest */
    }
  }
  return worst;
}

/**
 * Whether the city is currently BESIEGED at ANY of its districts, the engine besieged flag on any
 * district, OR a district that's been overrun (its `controllingPlayer` differs from its `owner`, the
 * same captured/contested test the base game's district-health UI uses). Victim-side and attacker-
 * agnostic, so it fires for an Independent Power / city-state raid just as for a major-civ siege,
 * even before a district's HEALTH drops, the case the health/pillage polls miss for lighter raids.
 * Scans all of the city's districts (not just the center). False when unreadable.
 * @param {*} city A live city object.
 * @returns {boolean} True when the city is under siege at any district.
 */
export function districtBesieged(city) {
  const pd = cityDistricts(city);
  if (!pd) return false;
  // A district whose controllingPlayer differs from its owner has been overrun (captured/contested).
  for (const d of cityDistrictObjs(city)) {
    if (districtIsContested(d)) return true;
  }
  // Engine besieged flag at any of the city's district plots (the locations fall back to the center).
  if (typeof pd.getDistrictIsBesieged !== "function") return false;
  for (const loc of districtLocations(city)) {
    try {
      if (pd.getDistrictIsBesieged(loc)) return true;
    } catch (_) {
      /* skip this district, keep scanning */
    }
  }
  return false;
}

/**
 * Whether a plot has a pillaged (damaged) constructible on it.
 * @param {{x:number, y:number}} loc Plot location.
 * @returns {boolean} True if any constructible there is damaged.
 */
function plotHasPillage(loc) {
  try {
    const cids = MapConstructibles?.getConstructibles?.(loc.x, loc.y);
    if (!cids) return false;
    for (const cid of cids) {
      if (Constructibles?.getByComponentID?.(cid)?.damaged) return true;
    }
  } catch (_) {
    /* ignore */
  }
  return false;
}

/**
 * Whether the plot at index `idx` holds a pillaged improvement.
 * @param {number} idx A plot index.
 * @returns {boolean} True if pillaged.
 */
function plotIndexPillaged(idx) {
  const loc = GameplayMap?.getLocationFromIndex?.(idx);
  return !!loc && plotHasPillage(loc);
}

/**
 * Count this city's purchased plots that hold a pillaged improvement. Polled (fog-independent) and
 * gated behind a positive `vwPillage` so it can be turned off to skip the per-plot scan entirely.
 * @param {*} city A live city object.
 * @returns {number} Number of pillaged plots in the city's borders.
 */
export function pillagedCount(city) {
  if (!(CONFIG.vwPillage > 0)) return 0;
  let n = 0;
  try {
    const plots = city?.getPurchasedPlots?.();
    const turn = typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
    for (const idx of plots || []) {
      const hit = plotIndexPillaged(idx);
      noteDamage(idx, hit, turn); // damage age for the departure log (emigration-damage-age.js)
      if (hit) n++;
    }
  } catch (_) {
    /* ignore */
  }
  return n;
}

/**
 * The players currently holding any of a city's overrun districts, i.e. who is actually attacking it. This is
 * the only place the ENGINE names the attacker: the besieged flag says a city is under attack but not by whom,
 * and an Independent Power harassing a city may never appear as a formal war opponent at all.
 * @param {*} city A live city object.
 * @returns {Set<number>} Attacking player ids (empty when none can be read).
 */
export function besiegingPlayers(city) {
  /** @type {Set<number>} */
  const out = new Set();
  try {
    for (const d of cityDistrictObjs(city)) {
      if (districtIsContested(d) && typeof d.controllingPlayer === "number") out.add(d.controllingPlayer);
    }
  } catch (_) {
    /* unreadable mid age-transition: an empty set means "we do not know" */
  }
  return out;
}

/**
 * Hostile units standing on or beside a city's districts, and who owns them. This is the DIRECT reading of
 * who is attacking a city: an army on the walls is the attack, where the diplomacy layer only ever offers a
 * proxy for it. That proxy turned out to be unusable on its own -- `Diplomacy.isAtWarWith` reports true for
 * EVERY Independent Power permanently, whether or not one has ever moved a unit at you (watched, mod test 109,
 * 18-19 simultaneous "wars" with nothing besieged), so an at-war scan cannot tell a raid from the weather.
 *
 * This is fog-INDEPENDENT, like district health and unlike anything in the diplomacy layer: watched returning
 * hostile units at 8-12 foreign cities per scan whose plots were never revealed (`getRevealedState` 0), in a
 * war between two AI players (mod test 111). So it reads the whole map, and a distant AI-vs-AI siege registers
 * exactly as a visible one does -- which is what the migration model requires, since it scores every met
 * civilization's cities, not just ours.
 * @param {*} city A live city object.
 * @returns {Set<number>} Owner ids of hostile units in contact (empty when none are visible or readable).
 */
export function attackersNear(city) {
  /** @type {Set<number>} */
  const out = new Set();
  const owner = typeof city?.owner === "number" ? city.owner : -1;
  if (owner < 0 || typeof MapUnits === "undefined" || typeof Units === "undefined") return out;
  try {
    for (const loc of contactPlots(city)) addHostileOwnersAt(loc, owner, out);
  } catch (_) {
    /* unreadable mid age-transition: an empty set means "we do not know" */
  }
  return out;
}

/**
 * Add the owners of any hostile ARMED units standing on one plot. Civilians are skipped deliberately: a
 * settler or trader passing a city is not a siege, and mistaking one for an army is how a quiet border
 * turns into a refugee wave.
 * @param {{x:number,y:number}} loc The plot. @param {number} owner The city's owner.
 * @param {Set<number>} out Collected owner ids.
 */
function addHostileOwnersAt(loc, owner, out) {
  for (const cid of MapUnits.getUnits(loc.x, loc.y) || []) {
    const u = Units.get?.(cid);
    const uo = typeof u?.owner === "number" ? u.owner : -1;
    if (uo >= 0 && uo !== owner && u.Combat && hostileTo(owner, uo)) out.add(uo);
  }
}

/**
 * The plots where an attacker would have to be standing to be attacking this city: its districts, plus every
 * tile adjacent to one. Scanning the whole city radius would be both slower and wrong -- a unit three tiles
 * out in your territory is passing through, not besieging you.
 * @param {*} city A live city object.
 * @returns {Array<{x:number,y:number}>} Plots to search, deduped.
 */
function contactPlots(city) {
  /** @type {Map<string, {x:number,y:number}>} */
  const seen = new Map();
  const put = (/** @type {*} */ l) => {
    if (l && typeof l.x === "number" && typeof l.y === "number") seen.set(l.x + ":" + l.y, l);
  };
  for (const loc of districtLocations(city)) {
    put(loc);
    if (typeof GameplayMap === "undefined" || typeof DirectionTypes === "undefined") continue;
    for (const dir of ADJACENT_DIRECTIONS) {
      try {
        put(GameplayMap.getAdjacentPlotLocation(loc, DirectionTypes[dir]));
      } catch (_) {
        /* off-map edge */
      }
    }
  }
  return [...seen.values()];
}

/** The six hex neighbours, named rather than counted so an enum reorder cannot silently skip a direction. */
const ADJACENT_DIRECTIONS = Object.freeze([
  "DIRECTION_EAST", "DIRECTION_WEST", "DIRECTION_NORTHEAST",
  "DIRECTION_NORTHWEST", "DIRECTION_SOUTHEAST", "DIRECTION_SOUTHWEST"
]);

/**
 * Whether a unit's owner is hostile to the city's owner. Independent Powers read as permanently at war, so
 * this is only ever used to EXCLUDE friendly units standing in allied territory -- the unit's presence in
 * contact is what carries the weight, not the diplomatic state.
 * @param {number} owner The city's owner. @param {number} other The unit's owner. @returns {boolean} Hostile.
 */
function hostileTo(owner, other) {
  try {
    const d = Players?.get?.(owner)?.Diplomacy;
    if (!d || typeof d.isAtWarWith !== "function") return true;
    return !!d.isAtWarWith(other);
  } catch (_) {
    return true;
  }
}
