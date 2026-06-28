// emigration-ethnicity-tooltip.js
//
// The Ethnicity lens's cursor panel: the ETHNIC COMPOSITION OF THE HOVERED TILE — its per-origin-civ
// percentages, with the same banner-colour swatches the lens blends into that tile's colour, so the
// panel and the map agree exactly. Each tile carries its own local mix (a diaspora's neighbourhood
// reads high, an all-dominant tile reads 100% the owner), computed by the shared tiles module so the
// numbers here are the very same data the lens paints. Falls back to the settlement-wide composition
// when the hovered plot isn't one of the city's tracked tiles.
//
// All the panel mechanics (styling, cursor positioning, plot->settlement index, spoiler gating) live
// in emigration-lens-hover-panel.js; this file only turns a hovered tile into display rows. Spoiler-
// safe: a policy-hidden owner is never indexed (so no panel shows), and hidden origin civs merge into
// one neutral "Unknown" bucket. Reads only; never touches the pass.

import { registerLensHoverPanel, cityTitle } from "/emigration/ui/emigration-lens-hover-panel.js";
import { compositionForCity } from "/emigration/ui/emigration-composition.js";
import { tilesForCity } from "/emigration/ui/emigration-ethnicity-tiles.js";
import { civDisplayColor } from "/emigration/ui/emigration-civ-colors.js";
import { civAdjective } from "/emigration/ui/emigration-naming.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";

const LENS = "emig-ethnicity-lens"; // must match emigration-ethnicity-lens.js
const FALLBACK_HEX = "#888888"; // neutral grey (matches the lens fallback / masked origins)
const MAX_ROWS = 6; // cap the breakdown so the panel stays compact

/**
 * Cap the breakdown at MAX_ROWS, collapsing the remainder into a "+N more" row (summed share).
 * @param {{name:string, color:string, share:number}[]} parts Sorted rows.
 * @returns {{name:string, color:string, share:number}[]} At most MAX_ROWS rows.
 */
function capRows(parts) {
  if (parts.length <= MAX_ROWS) return parts;
  const head = parts.slice(0, MAX_ROWS - 1);
  const tail = parts.slice(MAX_ROWS - 1);
  const tailShare = tail.reduce((sum, p) => sum + (p.share || 0), 0);
  head.push({ name: "+" + tail.length + " more", color: FALLBACK_HEX, share: tailShare });
  return head;
}

/**
 * Turn a list of {civ, share} into display rows: origin civ adjective + banner colour + share, largest
 * first, with policy-hidden origins merged into a neutral "Unknown" bucket. Empty → null.
 * @param {{civ:number, share:number}[]} shares Origin shares (a tile's local mix, or a city's totals).
 * @returns {{name:string, color:string, share:number}[]|null} Rows (capped), or null.
 */
function partsFromShares(shares) {
  if (!Array.isArray(shares) || !shares.length) return null;
  /** @type {{name:string, color:string, share:number}[]} */
  const parts = [];
  let unknown = 0;
  for (const c of shares) {
    if (civHidden(c.civ)) unknown += c.share;
    else parts.push({ name: civAdjective(c.civ), color: civDisplayColor(c.civ, FALLBACK_HEX), share: c.share });
  }
  if (unknown > 0) parts.push({ name: "Unknown", color: FALLBACK_HEX, share: unknown });
  parts.sort((a, b) => b.share - a.share);
  return capRows(parts);
}

/**
 * The hovered TILE's local origin shares (the same mix the lens blended into its colour), or null when
 * the plot isn't one of the settlement's tracked tiles.
 * @param {*} city City object. @param {{x:number,y:number}|undefined} plot The hovered plot.
 * @returns {{civ:number, share:number}[]|null} The tile's shares, or null.
 */
function tileShares(city, plot) {
  if (!plot) return null;
  try {
    const data = tilesForCity(city);
    const t = data && data.byKey.get(plot.x + "," + plot.y);
    return t && Array.isArray(t.shares) && t.shares.length ? t.shares : null;
  } catch (_) {
    return null;
  }
}

/**
 * Settlement-wide breakdown (the fallback when the hovered plot has no per-tile mix): the city's
 * composition, or 100% its current owner when untracked.
 * @param {*} city City object.
 * @returns {{name:string, color:string, share:number}[]|null} Rows, or null.
 */
function cityParts(city) {
  const comp = compositionForCity(city);
  if (comp && comp.civs && comp.civs.length) return partsFromShares(comp.civs);
  const owner = city && typeof city.owner === "number" ? city.owner : null;
  if (owner == null) return null;
  if (civHidden(owner)) return [{ name: "Unknown", color: FALLBACK_HEX, share: 1 }];
  return [{ name: civAdjective(owner), color: civDisplayColor(owner, FALLBACK_HEX), share: 1 }];
}

/**
 * Turn the hovered tile into the panel's title + composition rows: the hovered tile's local mix when
 * available (titled "… · this tile"), else the settlement-wide breakdown.
 * @param {*} sig The hovered settlement's CitySignal.
 * @param {*} _snap Unused per-pass snapshot.
 * @param {{x:number,y:number}} [plot] The hovered plot.
 * @returns {{title:string, rows:{color:string, name:string, value:string}[]}|null} Display, or null.
 */
function resolve(sig, _snap, plot) {
  const city = sig.city;
  const local = tileShares(city, plot);
  const parts = local ? partsFromShares(local) : cityParts(city);
  if (!parts || !parts.length) return null;
  const base = cityTitle(city, "Ethnic Composition");
  return {
    title: local ? base + " · this tile" : base,
    rows: parts.map((p) => ({ color: p.color, name: p.name, value: Math.round(p.share * 100) + "%" }))
  };
}

// ── Self-registration (runs on UIScript load, in the HUD context) ───────────────────────
try {
  registerLensHoverPanel({ lens: LENS, panelId: "emig-ethpanel", styleId: "emig-ethpanel-style", resolve });
} catch (e) {
  console.error("[Emigration.ethpanel] registration failed", e);
}
