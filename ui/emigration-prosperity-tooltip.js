// emigration-prosperity-tooltip.js
//
// The Prosperity lens's cursor panel: a settlement's PROSPERITY standing (the same score that drives
// migration, normalized against the world like the lens fill colours it) plus any active migration
// pressures, shown while the Prosperity lens is active. Matches the Ethnicity lens panel exactly -
// same styling, cursor offset, and spoiler rules - via the shared emigration-lens-hover-panel.js.
//
// Spoiler-safe: a policy-hidden owner is never indexed (so no panel shows). Reads only; the score is
// recomputed from the same field context the lens uses, so the panel, the lens colours, and the
// dashboard always agree. Loaded as its own <UIScripts> entry so it runs in the HUD context.

import { registerLensHoverPanel, cityTitle } from "/emigration/ui/emigration-lens-hover-panel.js";
import { fieldContext, prosperity } from "/emigration/ui/emigration-prosperity.js";

const LENS = "emig-prosperity-lens"; // must match emigration-prosperity-lens.js
const PRESSURE_HEX = "#d4483c"; // red dot for active migration pressures (matches the lens "below" red)
// Gradient endpoints (0-255), identical to the lens: grey (neutral) → green (above) / red (below).
const GREY = [140, 140, 140];
const GREEN = [60, 200, 90];
const RED = [212, 72, 60];

/** Clamp v into [lo, hi]. @param {number} v @param {number} lo @param {number} hi */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * The lens fill colour as a `#RRGGBB` hex for a normalized deviation t ∈ [-1, 1]: grey→green for
 * t ≥ 0, grey→red for t < 0 (same blend as the lens overlay).
 * @param {number} t Normalized deviation.
 * @returns {string} Hex colour.
 */
function tierColor(t) {
  const to = t >= 0 ? GREEN : RED;
  const k = Math.abs(t);
  const hex = (/** @type {number} */ i) => {
    const v = Math.round(GREY[i] + (to[i] - GREY[i]) * k);
    return (v < 16 ? "0" : "") + v.toString(16);
  };
  return "#" + hex(0) + hex(1) + hex(2);
}

/** A human standing label for a normalized deviation t ∈ [-1, 1]. @param {number} t Deviation. */
function tierLabel(t) {
  if (t >= 0.6) return "Strong magnet";
  if (t >= 0.2) return "Above average";
  if (t > -0.2) return "About average";
  if (t > -0.6) return "Below average";
  return "Shedding population";
}

/**
 * The active migration pressures on a settlement (the negative situational factors the model reads),
 * as short labels for the panel.
 * @param {*} s CitySignal.
 * @returns {string[]} Pressure labels (possibly empty).
 */
function pressures(s) {
  /** @type {string[]} */
  const out = [];
  if (s.violence > 0) out.push("Under attack");
  if (s.siege) out.push("Besieged");
  if (s.disaster > 0) out.push("Disaster");
  if (s.infected) out.push("Plague");
  if (s.starving) out.push("Starving");
  if (s.unrest) out.push("Unrest");
  return out;
}

/**
 * Per-pass field context: the prosperity mean + max spread over EVERY observable settlement, so the
 * hovered city's standing is measured against the same field the lens colours against.
 * @param {*[]} signals All collected CitySignals.
 * @returns {{ctx:*, mean:number, spread:number}} The snapshot.
 */
function buildSnapshot(signals) {
  const ctx = fieldContext(signals);
  const scores = signals.map((s) => prosperity(s, ctx));
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  let spread = 0;
  for (const p of scores) spread = Math.max(spread, Math.abs(p - mean));
  return { ctx, mean, spread };
}

/**
 * Turn the hovered settlement into the panel's title + standing row + any pressure rows.
 * @param {*} sig The hovered settlement's CitySignal.
 * @param {{ctx:*, mean:number, spread:number}|null} snap The per-pass field snapshot.
 * @returns {{title:string, rows:{color:string, name:string, value:string}[]}|null} Display, or null.
 */
function resolve(sig, snap) {
  if (!snap) return null;
  const p = prosperity(sig, snap.ctx);
  const t = snap.spread > 0 ? clamp((p - snap.mean) / snap.spread, -1, 1) : 0;
  const color = tierColor(t);
  const pct = Math.round(t * 100);
  /** @type {{color:string, name:string, value:string}[]} */
  const rows = [{ color, name: tierLabel(t), value: (pct >= 0 ? "+" : "") + pct + "%" }];
  for (const pr of pressures(sig)) rows.push({ color: PRESSURE_HEX, name: pr, value: "" });
  return { title: cityTitle(sig.city, "Prosperity"), rows };
}

// ── Self-registration (runs on UIScript load, in the HUD context) ───────────────────────
try {
  registerLensHoverPanel({
    lens: LENS, panelId: "emig-prospanel", styleId: "emig-prospanel-style", buildSnapshot, resolve
  });
} catch (e) {
  console.error("[Emigration.prospanel] registration failed", e);
}
