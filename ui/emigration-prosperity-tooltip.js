// emigration-prosperity-tooltip.js
//
// The Prosperity lens's cursor panel: the hovered TILE's prosperity band, score and every term behind it (the
// points scale of emigration-tile-score.js, the number the lens coloured the hex from), then the settlement's
// PROSPERITY standing (the score that drives migration, normalized against the world) plus any active migration
// pressures, shown while the Prosperity lens is active. Matches the Ethnicity lens panel exactly -
// same styling, cursor offset, and spoiler rules - via the shared emigration-lens-hover-panel.js.
//
// Spoiler-safe: a policy-hidden owner is never indexed (so no panel shows). Reads only; the score is
// recomputed from the same field context the lens uses, so the panel, the lens colours, and the
// dashboard always agree. Loaded as its own <UIScripts> entry so it runs in the HUD context.

import { registerLensHoverPanel, cityTitle } from "/emigration/ui/emigration-lens-hover-panel.js";
import { clamp, tierHex, tileTierAt } from "/emigration/ui/emigration-tile-score.js";
import { fieldContext, prosperity } from "/emigration/ui/emigration-prosperity.js";
import { mountExplain } from "/emigration/ui/emigration-explain-view.js";
import { loc } from "/emigration/ui/emigration-loc.js";

const LENS = "emig-prosperity-lens"; // must match emigration-prosperity-lens.js
const PRESSURE_HEX = "#d4483c"; // red dot for active migration pressures (matches the lens "below" red)
const TERM_HEX = "#6b6b6b"; // muted swatch for the tile's term rows: they explain the headline, they aren't verdicts

/** The panel's headline word for a tile band. @type {Record<string, [string, string]>} LOC key + English. */
const BAND_LABELS = Object.freeze({
  flourishing: ["LOC_EMIG_PROS_BAND_FLOURISHING", "Flourishing"],
  thriving: ["LOC_EMIG_PROS_BAND_THRIVING", "Thriving"],
  ordinary: ["LOC_EMIG_PROS_BAND_ORDINARY", "Ordinary"],
  meagre: ["LOC_EMIG_PROS_BAND_MEAGRE", "Meagre"],
  blighted: ["LOC_EMIG_PROS_BAND_BLIGHTED", "Blighted"]
});

/**
 * A signed integer for a term or a score: "+6", "-3", "0".
 * @param {number} n Points.
 * @returns {string} Signed text.
 */
function signed(n) {
  const v = Math.round(n);
  return (v > 0 ? "+" : "") + v;
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
 * A deviation as a signed percentage, the same figure the settlement's fill colour is mixed from.
 * @param {number} t Normalized deviation in [-1, 1].
 * @returns {string} e.g. "+62%".
 */
function signedPct(t) {
  return loc("LOC_EMIG_PCT_SIGNED", "{1_Pct}%", signed(t * 100));
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
 * A constructible's or feature's localized display name, or a generic word for its kind when the name can't be
 * composed (an unnamed database row, or no Locale off-engine).
 * @param {string|undefined} key The display-name LOC key (may be "" or undefined).
 * @param {string} fallbackKey The LOC key of the generic word. @param {string} fallbackEn Its English.
 * @returns {string} A human name.
 */
function named(key, fallbackKey, fallbackEn) {
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
  return loc(fallbackKey, fallbackEn);
}

/**
 * The generic word for a thing on the map whose name can't be composed, per term kind.
 * @type {Record<string, [string, string]>}
 */
const GENERIC = Object.freeze({
  wonder: ["LOC_EMIG_PROS_T_WONDER_UNNAMED", "Wonder"],
  building: ["LOC_EMIG_PROS_T_BUILDING_UNNAMED", "Building"],
  pillaged: ["LOC_EMIG_PROS_T_BUILDING_UNNAMED", "Building"],
  improvement: ["LOC_EMIG_PROS_T_IMPROVEMENT_UNNAMED", "Improvement"],
  naturalWonder: ["LOC_EMIG_PROS_T_NATURAL_UNNAMED", "Natural wonder"]
});

/**
 * The panel text per term kind: the LOC key, its English, and how the term fills the placeholder (a thing's name,
 * a neighbour count, or the raw yield). A kind with no entry falls back to the thing's name alone.
 * @type {Record<string, [string, string, "name"|"count"|"amount"|null]>}
 */
const TERM_TEXT = Object.freeze({
  wonder: ["LOC_EMIG_PROS_T_WONDER", "{1_Name}, a wonder", "name"],
  cityCenter: ["LOC_EMIG_PROS_T_CENTER", "City centre", null],
  quarter: ["LOC_EMIG_PROS_T_QUARTER", "A completed quarter", null],
  yield: ["LOC_EMIG_PROS_T_YIELD", "Yield on this tile ({1_Yield})", "amount"],
  river: ["LOC_EMIG_PROS_T_RIVER", "River", null],
  naturalWonder: ["LOC_EMIG_PROS_T_NATURAL", "{1_Name}, a natural wonder", "name"],
  adjacentWonder: ["LOC_EMIG_PROS_T_ADJ_WONDER", "Wonder next door × {1_Count}", "count"],
  adjacentNaturalWonder: ["LOC_EMIG_PROS_T_ADJ_NATURAL", "Natural wonder next door × {1_Count}", "count"],
  pillaged: ["LOC_EMIG_PROS_T_PILLAGED", "{1_Name}, pillaged", "name"],
  adjacentPillaged: ["LOC_EMIG_PROS_T_ADJ_PILLAGED", "Pillaged neighbour × {1_Count}", "count"]
});

/**
 * The placeholder value for a term's text: the named thing, the neighbour count, or the raw yield.
 * @param {import("/emigration/ui/emigration-tile-score.js").TileTerm} t The term.
 * @param {"name"|"count"|"amount"|null} mode Which value the text takes. @param {string} thing The named thing.
 * @returns {string} The argument ("" when the text has no placeholder).
 */
function termArg(t, mode, thing) {
  if (mode === "name") return thing;
  if (mode === "count") return String(t.count || 0);
  if (mode === "amount") return String(Math.round(t.amount || 0));
  return "";
}

/**
 * The panel text for one scored term: what fired, named where a thing on the map is what fired.
 * @param {import("/emigration/ui/emigration-tile-score.js").TileTerm} t The term.
 * @returns {string} Row label.
 */
export function termLabel(t) {
  const g = GENERIC[t.kind];
  const generic = g ? loc(g[0], g[1]) : "";
  const thing = g ? named(t.name, g[0], g[1]) : "";
  const text = TERM_TEXT[t.kind];
  if (!text) return thing || t.kind; // a bare building/improvement is just its name
  // "{Name}, a wonder" with the generic word for the name would read "Wonder, a wonder": the word alone says it.
  // (A pillaged thing keeps its suffix: "Building, pillaged" is the information.)
  if (text[2] === "name" && thing === generic && t.kind !== "pillaged") return thing;
  return loc(text[0], text[1], termArg(t, text[2], thing));
}

/**
 * The rows for the hovered TILE: its band and score in the colour the lens painted it, then one row per term that
 * fired, so the number explains itself. Empty for a tile the lens doesn't paint (empty sea).
 * @param {{x:number, y:number}} plot The hovered plot.
 * @returns {{color:string, name:string, value:string}[]} The rows.
 */
export function tileRows(plot) {
  const tile = tileTierAt(plot.x, plot.y);
  if (!tile) return [];
  const band = BAND_LABELS[tile.band] || BAND_LABELS.ordinary;
  /** @type {{color:string, name:string, value:string}[]} */
  const rows = [{ color: tierHex(tile.t), name: loc(band[0], band[1]), value: signed(tile.score) }];
  for (const t of tile.terms) rows.push({ color: TERM_HEX, name: termLabel(t), value: signed(t.points) });
  return rows;
}

/**
 * Turn the hovered TILE into the panel: the tile's band, score and every term behind it (the very number the lens
 * coloured it from, so the panel and the colour can never disagree), then the settlement's standing in the world
 * and any pressure rows.
 * @param {*} sig The hovered settlement's CitySignal.
 * @param {{ctx:*, mean:number, spread:number}|null} snap The per-pass field snapshot.
 * @param {{x:number, y:number}} [plot] The hovered plot.
 * @returns {{title:string, rows:{color:string, name:string, value:string}[]}|null} Display, or null.
 */
function resolve(sig, snap, plot) {
  if (!snap) return null;
  const rows = plot ? tileRows(plot) : [];
  const hasTile = rows.length > 0;
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
  const suffix = hasTile ? loc("LOC_EMIG_PROS_TILE_SUFFIX", " · this tile").trim() : "";
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
