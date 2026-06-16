// emigration-violence-signals.js
//
// The POLLED, fog-independent combat signals that drive the violence model (in emigration-
// violence.js): city-center district damage and pillaged tiles, read from the gameplay model.
// Pure reads — no state, no mutation — so a war the player can watch and a distant AI-vs-AI war in
// the dark register identically (the base game only gates the on-screen HEALTH BAR by visibility,
// not the underlying values). The stateful intensity accumulation / decay / siege model consumes
// these; it lives in emigration-violence.js.

import { CONFIG } from "/emigration/ui/emigration-config.js";

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
 * The city center district's damage as a fraction of its max health (0 = pristine, 1 = destroyed),
 * read straight from the gameplay model. 0 when unreadable.
 * @param {*} city A live city object.
 * @returns {number} Damage fraction in [0, 1].
 */
export function districtDamageFrac(city) {
  const loc = city?.location;
  const pd = loc ? cityDistricts(city) : null;
  if (!pd) return 0;
  try {
    const max = pd.getDistrictMaxHealth(loc);
    const cur = pd.getDistrictHealth(loc);
    if (!(max > 0) || typeof cur !== "number") return 0;
    const damage = max - cur;
    return damage > 0 ? damage / max : 0;
  } catch (_) {
    return 0;
  }
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
    for (const idx of plots || []) {
      if (plotIndexPillaged(idx)) n++;
    }
  } catch (_) {
    /* ignore */
  }
  return n;
}
