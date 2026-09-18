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
import { clamp, tierHex, tileTierAt, landmarkAt, plotScoreAt, LANDMARK_HEX } from "/emigration/ui/emigration-tile-score.js";
import { fieldContext, prosperity } from "/emigration/ui/emigration-prosperity.js";
import { mountExplain } from "/emigration/ui/emigration-explain-view.js";
import { loc } from "/emigration/ui/emigration-loc.js";

const LENS = "emig-prosperity-lens"; // must match emigration-prosperity-lens.js
const PRESSURE_HEX = "#d4483c"; // red dot for active migration pressures (matches the lens "below" red)
const YIELD_HEX = "#6b6b6b"; // muted swatch for the plain "what this tile yields" row

/**
 * A human standing label for a TILE's deviation inside its own settlement (the number the lens colours it from).
 * @param {number} t Normalized deviation in [-1, 1].
 * @returns {string} Label.
 */
function tileLabel(t) {
  if (t >= 0.6) return loc("LOC_EMIG_PROS_TILE_BEST", "Best land here");
  if (t >= 0.2) return loc("LOC_EMIG_PROS_TILE_GOOD", "Good land here");
  if (t > -0.2) return loc("LOC_EMIG_PROS_TILE_AVG", "Ordinary land here");
  if (t > -0.6) return loc("LOC_EMIG_PROS_TILE_POOR", "Poor land here");
  return loc("LOC_EMIG_PROS_TILE_WORST", "Worst land here");
}

/**
 * A deviation as a signed percentage, the same figure the fill colour is mixed from.
 * @param {number} t Normalized deviation in [-1, 1].
 * @returns {string} e.g. "+62%".
 */
function signedPct(t) {
  const pct = Math.round(t * 100);
  return loc("LOC_EMIG_PCT_SIGNED", "{1_Pct}%", (pct >= 0 ? "+" : "") + pct);
}

/** A human standing label for a normalized deviation t ∈ [-1, 1]. @param {number} t Deviation. */
function tierLabel(t) {
  if (t >= 0.6) return loc("LOC_EMIG_PROS_TIER_MAGNET", "Strong magnet");
  if (t >= 0.2) return loc("LOC_EMIG_PROS_TIER_ABOVE", "Above average");
  if (t > -0.2) return loc("LOC_EMIG_PROS_TIER_AVG", "About average");
  if (t > -0.6) return loc("LOC_EMIG_PROS_TIER_BELOW", "Below average");
  return loc("LOC_EMIG_PROS_TIER_SHEDDING", "Shedding population");
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
  if (s.violence > 0) out.push(loc("LOC_EMIG_PRESSURE_ATTACK", "Under attack"));
  if (s.siege) out.push(loc("LOC_EMIG_PRESSURE_SIEGE", "Besieged"));
  if (s.disaster > 0) out.push(loc("LOC_EMIG_PRESSURE_DISASTER", "Disaster"));
  if (s.infected) out.push(loc("LOC_EMIG_PRESSURE_PLAGUE", "Plague"));
  if (s.starving) out.push(loc("LOC_EMIG_PRESSURE_STARVING", "Starving"));
  if (s.unrest) out.push(loc("LOC_EMIG_PRESSURE_UNREST", "Unrest"));
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
 * The wonder on a landmark plot, by its localized name; a generic "Wonder" when the name can't be composed.
 * @param {string} key The wonder's display-name LOC key (may be "").
 * @returns {string} A human name.
 */
function wonderName(key) {
  if (key) {
    try {
      if (typeof Locale !== "undefined" && typeof Locale.compose === "function") {
        const n = Locale.compose(key);
        if (typeof n === "string" && n && !n.startsWith("LOC_")) return n;
      }
    } catch (_) {
      /* fall through */
    }
  }
  return loc("LOC_EMIG_PROS_LANDMARK_UNNAMED", "Wonder");
}

/**
 * The two rows for a LANDMARK plot (a wonder), in place of the land standing: which wonder, in the amber the lens
 * painted it, then the honest yield figure with where the wonder IS counted. The yield scale never measured this
 * plot, so there is no percentage to print - printing one would be the "Worst land here -100%" this replaces.
 * @param {{name:string}} lm The landmark. @param {{x:number, y:number}} plot The hovered plot.
 * @returns {{color:string, name:string, value:string}[]} The rows.
 */
function landmarkRows(lm, plot) {
  const score = plotScoreAt(plot.x, plot.y);
  return [
    { color: LANDMARK_HEX, name: loc("LOC_EMIG_PROS_LANDMARK", "Landmark: {1_Name}", wonderName(lm.name)), value: "" },
    {
      color: YIELD_HEX,
      name: score === null
        ? loc("LOC_EMIG_PROS_LANDMARK_NOTE", "A wonder's worth counts toward the settlement, not the land")
        : loc("LOC_EMIG_PROS_LANDMARK_YIELD",
          "This tile yields {1_Score}; a wonder's worth counts toward the settlement, not the land",
          String(Math.round(score))),
      value: ""
    }
  ];
}

/**
 * Turn the hovered TILE into the panel: the tile's own standing inside its settlement first (the very number the
 * lens coloured it from, so the panel and the colour can never disagree), what it yields against the settlement's
 * average, then the settlement's standing in the world and any pressure rows. A landmark plot (a wonder) gets its
 * own two rows instead of a standing, see {@link landmarkRows}.
 * @param {*} sig The hovered settlement's CitySignal.
 * @param {{ctx:*, mean:number, spread:number}|null} snap The per-pass field snapshot.
 * @param {{x:number, y:number}} [plot] The hovered plot.
 * @returns {{title:string, rows:{color:string, name:string, value:string}[]}|null} Display, or null.
 */
function resolve(sig, snap, plot) {
  if (!snap) return null;
  /** @type {{color:string, name:string, value:string}[]} */
  const rows = [];
  const lm = plot ? landmarkAt(plot.x, plot.y) : null;
  const tile = plot && !lm ? tileTierAt(sig.city, plot.x, plot.y) : null;
  if (lm && plot) rows.push(...landmarkRows(lm, plot));
  if (tile) {
    rows.push({ color: tierHex(tile.t), name: tileLabel(tile.t), value: signedPct(tile.t) });
    rows.push({
      color: YIELD_HEX,
      name: loc("LOC_EMIG_PROS_TILE_YIELD", "This tile yields {1_Score}, the settlement averages {2_Mean}",
        String(Math.round(tile.score)), String(Math.round(tile.mean))),
      value: ""
    });
  }
  const p = prosperity(sig, snap.ctx);
  const t = snap.spread > 0 ? clamp((p - snap.mean) / snap.spread, -1, 1) : 0;
  rows.push({
    color: tierHex(t),
    name: loc("LOC_EMIG_PROS_SETTLEMENT", "Settlement: {1_Tier}", tierLabel(t)),
    value: signedPct(t)
  });
  for (const pr of pressures(sig)) rows.push({ color: PRESSURE_HEX, name: pr, value: "" });
  // Join with an explicit space and a trimmed suffix: the game's text loader strips a localized string's leading
  // whitespace, so " · this tile" arrived as "· this tile" and the title read "London· this tile" (mod test 85).
  const suffix = tile || lm ? loc("LOC_EMIG_PROS_TILE_SUFFIX", " · this tile").trim() : "";
  const title = cityTitle(sig.city, "Prosperity") + (suffix ? " " + suffix : "");
  return { title, rows };
}

// ── Self-registration (runs on UIScript load, in the HUD context) ───────────────────────
try {
  registerLensHoverPanel({
    lens: LENS, panelId: "emig-prospanel", styleId: "emig-prospanel-style", buildSnapshot, resolve,
    // Feature L: the prosperity lens is the "who is doing well / badly?" surface, so the push/pull
    // cause stack belongs under it - it answers the follow-up question the colour raises. No-op when
    // the explainer option is off.
    decorate: (panel, sig) => mountExplain(panel, sig.city)
  });
} catch (e) {
  console.error("[Emigration.prospanel] registration failed", e);
}
