// emigration-ethnicity-tooltip.js
//
// The Ethnicity lens's cursor panel: a settlement's ETHNIC COMPOSITION (per-origin-civ percentages,
// with the same banner-colour swatches the lens paints), shown while the Ethnicity lens is active.
// All the panel mechanics (styling, cursor positioning, plot->settlement index, spoiler gating) live
// in emigration-lens-hover-panel.js; this file only turns a hovered settlement into display rows.
//
// Spoiler-safe (same rule as the lens + city readout): a policy-hidden owner is never indexed (so no
// panel shows), and hidden origin civs merge into one neutral "Unknown" bucket. Reads only; never
// touches the pass. Loaded as its own <UIScripts> entry so it runs in the HUD context.

import { registerLensHoverPanel, cityTitle } from "/emigration/ui/emigration-lens-hover-panel.js";
import { compositionForCity } from "/emigration/ui/emigration-composition.js";
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
 * Fallback when a settlement has no tracked composition yet: 100% its current owner's origin.
 * @param {*} city City object.
 * @returns {{name:string, color:string, share:number}[]|null} A single 100% row, or null.
 */
function defaultParts(city) {
  const owner = city && typeof city.owner === "number" ? city.owner : null;
  if (owner == null) return null;
  if (civHidden(owner)) return [{ name: "Unknown", color: FALLBACK_HEX, share: 1 }];
  return [{ name: civAdjective(owner), color: civDisplayColor(owner, FALLBACK_HEX), share: 1 }];
}

/**
 * The display breakdown for a settlement: origin civ adjective + banner colour + share, largest
 * first, with policy-hidden origins merged into a neutral "Unknown" bucket. Null when untracked.
 * @param {*} city City object.
 * @returns {{name:string, color:string, share:number}[]|null} Rows (capped), or null.
 */
function resolveParts(city) {
  const comp = compositionForCity(city);
  if (!comp || !comp.civs || !comp.civs.length) return defaultParts(city);
  /** @type {{name:string, color:string, share:number}[]} */
  const parts = [];
  let unknown = 0;
  for (const c of comp.civs) {
    if (civHidden(c.civ)) unknown += c.share;
    else parts.push({ name: civAdjective(c.civ), color: civDisplayColor(c.civ, FALLBACK_HEX), share: c.share });
  }
  if (unknown > 0) parts.push({ name: "Unknown", color: FALLBACK_HEX, share: unknown });
  parts.sort((a, b) => b.share - a.share);
  return capRows(parts);
}

/**
 * Turn the hovered settlement into the panel's title + composition rows.
 * @param {*} sig The hovered settlement's CitySignal.
 * @returns {{title:string, rows:{color:string, name:string, value:string}[]}|null} Display, or null.
 */
function resolve(sig) {
  const city = sig.city;
  const parts = resolveParts(city);
  if (!parts || !parts.length) return null;
  return {
    title: cityTitle(city, "Ethnic Composition"),
    rows: parts.map((p) => ({ color: p.color, name: p.name, value: Math.round(p.share * 100) + "%" }))
  };
}

// ── Self-registration (runs on UIScript load, in the HUD context) ───────────────────────
try {
  registerLensHoverPanel({ lens: LENS, panelId: "emig-ethpanel", styleId: "emig-ethpanel-style", resolve });
} catch (e) {
  console.error("[Emigration.ethpanel] registration failed", e);
}
