// emigration-detail-views.js
//
// The flexbox "detail table" renderers for the migration dashboard: Border stances, and the settlement mix table the
// Settlements tab shows under each civilization (once the Communities tab). GameFace lays out neither <table> nor CSS
// grid, so each is built from flexbox rows; styling lives in the dashboard's injected stylesheet.
//
// Wording rule for the diversity ranking: every string describes where a settlement's people came
// from (its origins), never "communities", which reads as the Cultural Quarter / enclave system. The
// cosmopolitanism tier is descriptive and grants no yields; nothing here ranks peoples against each other.

import { formatPeople } from "/emigration/ui/emigration-population.js";
import { getNumberMode } from "/emigration/ui/emigration-settings.js";
import { formatCount } from "/emigration/ui/emigration-ledger-view.js";
import { characterTier } from "/emigration/ui/emigration-diversity.js";
import { loc } from "/emigration/ui/emigration-loc.js";

/** @param {string} tag @param {string} [cls] @param {string} [text] */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * The stance-impact detail sentence for a civ's Borders row: how its border policy changed its
 * migration vs a neutral-borders baseline.
 * @param {*} r Stance row ({key, in, inImpact, outImpact}).
 * @returns {string}
 */
function stanceDetailText(r) {
  if (r.key === "none") return loc("LOC_EMIG_DV_STANCE_NONE", "No border policy, migration unaffected.");
  const neutralIn = r.in - r.inImpact;
  // Divide by the magnitude of the baseline; pct is a magnitude and the +/− is
  // supplied by the branch below (a signed divisor could render "(+-NN%)").
  const pct = Math.abs(neutralIn) > 0 ? Math.round((Math.abs(r.inImpact) / Math.abs(neutralIn)) * 100) : 0;
  /** @type {string[]} */
  const parts = [];
  if (r.inImpact > 0) {
    parts.push(loc("LOC_EMIG_DV_STANCE_ALLOWED", "+{1_People} immigrants allowed beyond neutral{2_Pct}",
      formatPeople(r.inImpact), pct ? " (+" + pct + "%)" : ""));
  } else if (r.inImpact < 0) {
    parts.push(loc("LOC_EMIG_DV_STANCE_TURNED_AWAY", "{1_People} would-be immigrants turned away{2_Pct}",
      formatPeople(-r.inImpact), pct ? " (−" + pct + "%)" : ""));
  }
  if (r.outImpact < 0) parts.push(loc("LOC_EMIG_DV_STANCE_KEPT_HOME", "{1_People} of its own citizens kept home",
    formatPeople(-r.outImpact)));
  return parts.length ? parts.join("; ") + "." : loc("LOC_EMIG_DV_STANCE_NO_EFFECT", "Policy slotted, but no migration affected yet.");
}

/**
 * Render border stances: per civ a name + colored Pro/Anti/Neutral tag, then a sentence
 * quantifying how the stance changed that civ's migration (the stance-impact counterfactual).
 * @param {HTMLElement} body
 * @param {*[]} rows Stance rows.
 */
export function renderStances(body, rows) {
  for (const r of rows) {
    const block = el("div", "emig-stance-block");
    const head = el("div", "emig-stance-row");
    head.appendChild(el("span", "emig-civ", r.name));
    head.appendChild(el("span", "emig-tag " + (r.key || "none"), r.stance));
    block.appendChild(head);
    block.appendChild(el("div", "emig-stance-detail", stanceDetailText(r)));
    body.appendChild(block);
  }
}

// "Most diverse cities" ranking

/** Cosmopolitanism tier key → display label. Keys match emigration-diversity's COSMO_TIERS. */
/** @type {Record<string,string>} */
const COSMO_LABEL = {
  homogeneous: loc("LOC_EMIG_COSMO_HOMOGENEOUS", "Homogeneous"),
  local: loc("LOC_EMIG_COSMO_LOCAL", "Local Majority"),
  mixed: loc("LOC_EMIG_COSMO_MIXED", "Mixed City"),
  center: loc("LOC_EMIG_COSMO_CENTER", "Cosmopolitan Center"),
  world: loc("LOC_EMIG_COSMO_WORLD", "World City")
};
/** What each character means, for the hover on its cell. @type {Record<string, string>} */
const COSMO_TIP = {
  homogeneous: loc("LOC_EMIG_COSMO_HOMOGENEOUS_TIP", "One origin makes up 95% or more of the settlement."),
  local: loc("LOC_EMIG_COSMO_LOCAL_TIP", "People from elsewhere live here, but no community from another civilization reaches 15%."),
  mixed: loc("LOC_EMIG_COSMO_MIXED_TIP", "A community from another civilization is 15% or more, while the largest origin still holds 60% or more."),
  center: loc("LOC_EMIG_COSMO_CENTER_TIP", "No origin reaches 60%, and at least three origins hold 10% or more each."),
  world: loc("LOC_EMIG_COSMO_WORLD_TIP", "No origin reaches half, and at least four origins hold 10% or more each.")
};
/** The column headings' hovers. */
const COLUMN_TIP = [
  loc("LOC_EMIG_DIVERSE_COL_CITY_TIP", "A settlement, grouped under the civilization that holds it."),
  loc("LOC_EMIG_DIVERSE_COL_ORIGINS_TIP", "Each colour is a civilization its people came from, sized by share; the bar's width is the settlement's population against the largest in the list."),
  loc("LOC_EMIG_DIVERSE_COL_POP_TIP", "Population, and how many origins hold 5% or more of it."),
  loc("LOC_EMIG_DIVERSE_COL_MIX_TIP", "Majority: one origin holds more than half. Plurality: the largest origin leads the next by a clear margin without a majority. No majority: no origin leads clearly."),
  loc("LOC_EMIG_DIVERSE_COL_CHARACTER_TIP", "A word for how mixed the settlement's people are, from its own population alone. Hover a character for its rule."),
  loc("LOC_EMIG_DIVERSE_COL_ENCLAVE_TIP", "The Cultural Enclave in the settlement, if a community from another civilization has one, and its stage."),
  loc("LOC_EMIG_DIVERSE_COL_PRESSURE_TIP", "How close the settlement is to a group leaving: Negligible, Low, Moderate, High or Critical.")
];

/** @param {string} text @param {string} tip @returns {HTMLElement} A cell's text with a hover. */
function withTip(text, tip) {
  const span = el("span", "", text);
  span.title = tip;
  return span;
}

// How far the dominant origin must lead the runner-up before it's named as "the" plurality. Inside
// this gap the top two are effectively tied, so the honest label is "no majority", not a named lead.
const PLURALITY_GAP = 0.05;

/**
 * The "mix" phrase for a settlement: a named majority (≥50%), a named plurality (a clear but
 * sub-50% lead), or "no majority" when the top origins are effectively tied. An origin the spoiler
 * mask hides carries no name, so it falls back to the unnamed "no majority" phrasing rather than
 * leaking that an unmet civ's people live there.
 * @param {*} r A ranking row ({dominantName, dominantShare, runnerUpShare}).
 * @returns {string}
 */
function mixPhrase(r) {
  const noMajority = loc("LOC_EMIG_DIVERSE_NO_MAJORITY", "no majority");
  if (!r.dominantName) return noMajority;
  if (r.dominantShare >= 0.5) return loc("LOC_EMIG_DIVERSE_MAJORITY", "{1_Civ} majority", r.dominantName);
  if (r.dominantShare - (r.runnerUpShare || 0) < PLURALITY_GAP) return noMajority;
  return loc("LOC_EMIG_DIVERSE_PLURALITY", "{1_Civ} plurality", r.dominantName);
}

/** A share at or above this counts as a named origin in the "N origins" summary (matches the metric). */
const ORIGIN_MIN_SHARE = 0.05;

/**
 * "Most diverse cities" rows: per settlement its resolved origin slices, population, mix shape and
 * cosmopolitanism tier. Pure formatting over an already-ranked, already-masked list; `origins` is
 * counted from the displayed slices so the text never disagrees with the bar beside it.
 * @param {*[]} ranking Ranked rows from diverseCityRanking (each carrying resolved `parts`).
 * @param {{cosmo?:boolean}} [opts] `cosmo` includes the Cosmopolitanism (Character) column, the
 *   separately-flagged one. Off → `character` is null and the renderer drops the column.
 * @returns {*[]} Display rows ({city, parts, pts, people, origins, mix, character}).
 */
export function diverseCityRows(ranking, opts) {
  const cosmo = !!(opts && opts.cosmo);
  return (ranking || []).map((r) => {
    const parts = Array.isArray(r.parts) ? r.parts : [];
    const shown = parts.filter((/** @type {*} */ p) => p.share >= ORIGIN_MIN_SHARE).length;
    return {
      city: r.name,
      parts,
      pts: r.pts || 0,
      people: r.people || 0,
      ownerName: r.ownerName || "",
      own: !!r.own,
      pressure: Number(r.pressure) || 0, // the settlement's pressure to leave, for the Pressure column and the sort
      origins: shown === 1
        ? loc("LOC_EMIG_DIVERSE_ORIGIN_ONE", "1 origin")
        : loc("LOC_EMIG_DIVERSE_ORIGINS", "{1_N} origins", shown),
      mix: mixPhrase(r),
      enclave: typeof r.enclave === "string" ? r.enclave : "",
      characterKey: cosmo ? characterTier(parts, r.ownerName) : null,
      character: cosmo ? COSMO_LABEL[characterTier(parts, r.ownerName)] : null
    };
  });
}

/**
 * The mix words for a settlement's card (the Settlements tab's Arrived pane): its Mix with the column's rule as a
 * hover, and its Character with that character's rule.
 * @param {*} r A display row from diverseCityRows.
 * @returns {{mix:string, mixTip:string, character:string|null, characterTip:string}}
 */
export function mixWords(r) {
  return {
    mix: r.mix, mixTip: COLUMN_TIP[3],
    character: r.character == null ? null : r.character, characterTip: r.characterKey ? COSMO_TIP[r.characterKey] || "" : ""
  };
}

/**
 * The settlements of one civilization as a table (the Settlements tab's All civilizations view, under the
 * civilization's card): name, the composition bar, population and origins, Mix, Character, Enclave. Bars are
 * scaled against the largest settlement in `allRows`, so a bar means the same population under every card.
 * @param {*[]} rows This civilization's display rows. @param {*[]} allRows Every row shown on the tab.
 * @returns {HTMLElement}
 */
export function mixTable(rows, allRows) {
  const ctx = diversityCtx(allRows && allRows.length ? allRows : rows);
  const wrap = el("div", "emig-pr emig-mix");
  wrap.appendChild(diversityHead(ctx));
  for (const r of rows) wrap.appendChild(diversityDataRow(r, ctx));
  return wrap;
}

/**
 * One row of the ranking table (reuses the per-city pressure table's column styling).
 * @param {*[]} cells Cell contents (text or element): settlement, bar, population, mix, [character].
 * @param {string} [cls] Extra row class (e.g. the header).
 * @returns {HTMLElement}
 */
function diversityRow(cells, cls) {
  const row = el("div", "emig-pr-row" + (cls ? " " + cls : ""));
  cells.forEach((c, i) => {
    // Column 1 is the settlement name (wider, highlighted); column 2 is the composition bar, which
    // needs the room; the rest are short text.
    const cell = el("div", "emig-pr-c" + (i === 0 ? " name" : i === 1 ? " pres" : ""));
    if (c && typeof c === "object") cell.appendChild(/** @type {HTMLElement} */(c));
    else cell.textContent = c == null ? "" : String(c);
    row.appendChild(cell);
  });
  return row;
}

/**
 * A settlement's origin composition bar: one colored slice per origin, sized to its share, in the
 * origin civ's banner color. The bar's width is scaled to the settlement's population against the
 * largest in the table, so the column reads as a population comparison; styling is inline (data-driven geometry).
 * @param {*} r A display row ({parts, people}).
 * @param {number} maxPeople The largest population in the table (the width normalizer).
 * @returns {HTMLElement}
 */
function compositionBar(r, maxPeople) {
  const track = el("div");
  const widthPct = Math.max(4, Math.min(100, ((r.people || 0) / (maxPeople || 1)) * 100));
  track.style.cssText = "display:flex;height:0.85rem;width:" + widthPct
    + "%;border-radius:0.15rem;overflow:hidden;background:rgba(210,194,165,0.15);";
  for (const p of r.parts) {
    const seg = el("div");
    // flex-grow by share: the slices fill the track proportionally without per-slice width math.
    seg.style.cssText = "flex:" + Math.max(0.0001, p.share) + " 0 0;background:" + p.color + ";";
    track.appendChild(seg);
  }
  return track;
}

/**
 * The rendering context shared by both tables, so the "All settlements" list is formatted
 * identically to the ranking above it (same columns, same bars, one population scale).
 * @param {*[]} rows All display rows.
 * @returns {{cells:(c:*[])=>*[], mode:number, maxPeople:number}}
 */
function diversityCtx(rows) {
  // The Cosmopolitanism column is flagged separately: the builder nulls `character` when it's off,
  // and the column (header included) drops out rather than showing an empty strip.
  const showChar = rows.some((r) => r.character != null);
  // Cells arrive as [city, origins, pop, mix, character, enclave, pressure]; Enclave and Pressure always show.
  return {
    cells: (/** @type {*[]} */ c) => (showChar ? c : c.slice(0, 4).concat(c.slice(5))),
    mode: getNumberMode(),
    // Normalized across every row, not per table, so a bar means the same population in both lists.
    maxPeople: rows.reduce((m, r) => Math.max(m, r.people || 0), 0) || 1
  };
}

/** @param {*} ctx */
function diversityHead(ctx) {
  const heads = [
    loc("LOC_EMIG_DIVERSE_COL_CITY", "Settlement"),
    loc("LOC_EMIG_DIVERSE_COL_ORIGINS", "Where its people came from"),
    loc("LOC_EMIG_DIVERSE_COL_POP", "Population"),
    loc("LOC_EMIG_DIVERSE_COL_MIX", "Mix"),
    loc("LOC_EMIG_DIVERSE_COL_CHARACTER", "Character"),
    loc("LOC_EMIG_DIVERSE_COL_ENCLAVE", "Enclave"),
    loc("LOC_EMIG_DIVERSE_COL_PRESSURE", "Pressure to leave")
  ];
  return diversityRow(ctx.cells(heads.map((h, i) => withTip(h, COLUMN_TIP[i]))), "emig-pr-head");
}

/** @param {*} r @param {*} ctx */
function diversityDataRow(r, ctx) {
  const character = r.character == null ? null : withTip(r.character, COSMO_TIP[r.characterKey] || "");
  return diversityRow(ctx.cells([
    r.city, compositionBar(r, ctx.maxPeople),
    formatCount(r.people, r.pts, ctx.mode) + " · " + r.origins, withTip(r.mix, COLUMN_TIP[3]), character, r.enclave || "",
    r.pressureLabel || ""
  ]));
}
