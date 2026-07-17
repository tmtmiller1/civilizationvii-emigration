// emigration-detail-views.js
//
// The flexbox "detail table" renderers for the migration dashboard: Border stances, the per-city
// pressure table, and the "most diverse cities" ranking (roadmap Features S + T). Split out of
// emigration-views.js to keep that render core under its size cap. GameFace lays out neither <table>
// nor CSS grid, so each is built from flexbox rows; styling lives in the dashboard's injected
// stylesheet (emigration-views.js) — nothing here adds CSS of its own.
//
// WORDING RULE (the diversity ranking): every string describes where a settlement's people came
// FROM — its ORIGINS, the same concept the city readout's "Origins:" line reports. Deliberately NOT
// "communities": that word reads as the Cultural Quarter / enclave system, which is a different
// thing entirely (a player-shaped district), and conflating them made the first cut unreadable. The
// cosmopolitanism tier is descriptive and grants no yields. Nothing here ranks peoples against each
// other — keep it that way.

import { formatPeople } from "/emigration/ui/emigration-population.js";
import { getNumberMode } from "/emigration/ui/emigration-settings.js";
import { formatCount } from "/emigration/ui/emigration-ledger-view.js";
import { CONFIG } from "/emigration/ui/emigration-config.js";
import { loc } from "/emigration/ui/emigration-loc.js";

/**
 * Make an element with an optional class + text.
 * @param {string} tag Tag.
 * @param {string} [cls] Class.
 * @param {string} [text] Text.
 * @returns {HTMLElement} Element.
 */
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
 * @returns {string} The detail text.
 */
function stanceDetailText(r) {
  if (r.key === "none") return loc("LOC_EMIG_DV_STANCE_NONE", "No border policy, migration unaffected.");
  const neutralIn = r.in - r.inImpact;
  // F5: divide by the magnitude of the baseline; pct is a magnitude and the +/− is
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
 * Render border stances: per civ a name + coloured Pro/Anti/Neutral tag, then a sentence
 * quantifying how the stance changed that civ's migration (the stance-impact counterfactual).
 * @param {HTMLElement} body Card body.
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

// ── "Most diverse cities" ranking (Features S + T) ──────────────────────────

/** Cosmopolitanism tier key → display label (Feature T). Keys match emigration-diversity's COSMO_TIERS. */
/** @type {Record<string,string>} */
const COSMO_LABEL = {
  homogeneous: loc("LOC_EMIG_COSMO_HOMOGENEOUS", "Homogeneous"),
  local: loc("LOC_EMIG_COSMO_LOCAL", "Local Majority"),
  mixed: loc("LOC_EMIG_COSMO_MIXED", "Mixed City"),
  center: loc("LOC_EMIG_COSMO_CENTER", "Cosmopolitan Center"),
  world: loc("LOC_EMIG_COSMO_WORLD", "World City")
};

// How far the dominant origin must lead the runner-up before it's named as "the" plurality. Inside
// this gap the top two are effectively tied, so the honest label is "no majority", not a named lead.
const PLURALITY_GAP = 0.05;

/**
 * The "mix" phrase for a settlement: a named majority (≥50%), a named plurality (a clear but
 * sub-50% lead), or "no majority" when the top origins are effectively tied. An origin the spoiler
 * mask hides carries no name, so it falls back to the unnamed "no majority" phrasing rather than
 * leaking that an unmet civ's people live there.
 * @param {*} r A ranking row ({dominantName, dominantShare, runnerUpShare}).
 * @returns {string} The phrase.
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
 * "Most diverse cities" rows: per settlement its resolved origin slices (for the composition bar),
 * its population, the shape of its mix, and its cosmopolitanism tier. Pure formatting over an
 * already-ranked, already-masked list (the ranking and the spoiler mask happen in window's gather).
 *
 * `origins` is counted from the DISPLAYED slices, not the raw metric, so the text can never disagree
 * with the bar beside it (masking merges hidden origins into one "Unknown" slice).
 * @param {*[]} ranking Ranked rows from diverseCityRanking (each carrying resolved `parts`).
 * @param {{cosmo?:boolean}} [opts] `cosmo` includes the Cosmopolitanism (Character) column — the
 *   separately-flagged Feature T. Off → `character` is null and the renderer drops the column.
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
      origins: shown === 1
        ? loc("LOC_EMIG_DIVERSE_ORIGIN_ONE", "1 origin")
        : loc("LOC_EMIG_DIVERSE_ORIGINS", "{1_N} origins", shown),
      mix: mixPhrase(r),
      character: cosmo ? (COSMO_LABEL[r.cosmo && r.cosmo.tierKey] || COSMO_LABEL.homogeneous) : null
    };
  });
}

/**
 * The dashboard's Diversity section, or none. Flag-gated (Feature S): off → no tab at all, rather
 * than a permanently empty one. The Character column is Feature T's separate flag, passed through to
 * the row builder. Returned as a spliceable list so dashboardModel stays a flat section literal.
 * @param {*} d The gathered dashboard data (reads `d.diversity`).
 * @returns {*[]} Zero or one section.
 */
export function diversitySections(d) {
  if (!CONFIG.diversityRanking) return [];
  return [{
    title: loc("LOC_EMIG_VIEW_SEC_DIVERSITY", "Most diverse cities"),
    kind: "diversity",
    rows: diverseCityRows((d && d.diversity) || [], { cosmo: !!CONFIG.cosmopolitanismScore })
  }];
}

/**
 * One row of the ranking table (reuses the per-city pressure table's column styling).
 * @param {*[]} cells Cell contents (text or element): settlement, bar, population, mix, [character].
 * @param {string} [cls] Extra row class (e.g. the header).
 * @returns {HTMLElement} The row.
 */
function diversityRow(cells, cls) {
  const row = el("div", "emig-pr-row" + (cls ? " " + cls : ""));
  cells.forEach((c, i) => {
    // Column 1 is the settlement name (wider, highlighted); column 2 is the composition bar, which
    // needs the room — the rest are short text.
    const cell = el("div", "emig-pr-c" + (i === 0 ? " name" : i === 1 ? " pres" : ""));
    if (c && typeof c === "object") cell.appendChild(/** @type {HTMLElement} */(c));
    else cell.textContent = c == null ? "" : String(c);
    row.appendChild(cell);
  });
  return row;
}

/**
 * A settlement's ORIGIN COMPOSITION BAR: one coloured slice per origin, each sized to its share of
 * that settlement's people, in the origin civ's own banner colour.
 *
 * The bar's WIDTH is scaled to the settlement's population against the largest in the table, so the
 * column reads as a population comparison at a glance (a big mixed capital vs a small mixed town)
 * while the slices inside read as the mix. Styling is inline because these are data-driven geometry
 * and per-civ colours — the same idiom the ledger's diverging net bar uses.
 * @param {*} r A display row ({parts, people}).
 * @param {number} maxPeople The largest population in the table (the width normalizer).
 * @returns {HTMLElement} The bar.
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
 * The colour key for the bars: every origin appearing in the table, once, with its swatch. Without
 * it the bars are pretty but undecodable — this is what says "blue = Roman".
 * @param {*[]} rows Display rows.
 * @returns {HTMLElement} The legend.
 */
function originLegend(rows) {
  const seen = new Map();
  for (const r of rows) for (const p of r.parts) if (!seen.has(p.name)) seen.set(p.name, p.color);
  const wrap = el("div", "emig-dv-legend");
  wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:0.5rem;padding:0.5rem 0.6rem 0.2rem 0.6rem;";
  for (const [name, color] of seen) {
    const item = el("div");
    item.style.cssText = "display:flex;align-items:center;gap:0.25rem;font-size:var(--dg-fs-85);opacity:0.85;";
    const dot = el("div");
    dot.style.cssText = "width:0.5rem;height:0.5rem;border-radius:0.1rem;background:" + color + ";";
    item.appendChild(dot);
    item.appendChild(el("span", "", name));
    wrap.appendChild(item);
  }
  return wrap;
}

/**
 * The rendering context shared by both tables, so the "All settlements" list is formatted
 * IDENTICALLY to the ranking above it (same columns, same bars, one population scale).
 * @param {*[]} rows All display rows.
 * @returns {{cells:(c:*[])=>*[], mode:number, maxPeople:number}} The context.
 */
function diversityCtx(rows) {
  // The Cosmopolitanism column is Feature T, flagged separately: the builder nulls `character` when
  // it's off, and the column (header included) drops out rather than showing an empty strip.
  const showChar = rows.some((r) => r.character != null);
  return {
    cells: (/** @type {*[]} */ c) => (showChar ? c : c.slice(0, 4)),
    mode: getNumberMode(),
    // Normalized across EVERY row, not per table, so a bar means the same population in both lists.
    maxPeople: rows.reduce((m, r) => Math.max(m, r.people || 0), 0) || 1
  };
}

/**
 * The shared column header row.
 * @param {*} ctx The render context.
 * @returns {HTMLElement} The header.
 */
function diversityHead(ctx) {
  return diversityRow(ctx.cells([
    loc("LOC_EMIG_DIVERSE_COL_CITY", "Settlement"),
    loc("LOC_EMIG_DIVERSE_COL_ORIGINS", "Where its people came from"),
    loc("LOC_EMIG_DIVERSE_COL_POP", "Population"),
    loc("LOC_EMIG_DIVERSE_COL_MIX", "Mix"),
    loc("LOC_EMIG_DIVERSE_COL_CHARACTER", "Character")
  ]), "emig-pr-head");
}

/**
 * One settlement's row: name, origin bar, population + origin count, the mix's shape, its tier.
 * @param {*} r A display row.
 * @param {*} ctx The render context.
 * @returns {HTMLElement} The row.
 */
function diversityDataRow(r, ctx) {
  return diversityRow(ctx.cells([
    r.city, compositionBar(r, ctx.maxPeople),
    formatCount(r.people, r.pts, ctx.mode) + " · " + r.origins, r.mix, r.character
  ]));
}

/**
 * A civ sub-heading inside the full list.
 * @param {string} name The civ's name.
 * @param {boolean} own Whether it's the local player's.
 * @returns {HTMLElement} The heading.
 */
function civHeading(name, own) {
  const h = el("div", "emig-dv-civ", own ? loc("LOC_EMIG_DIVERSE_YOUR_CIV", "{1_Civ} (you)", name) : name);
  h.style.cssText = "font-family:\"TitleFont\";color:#f0dca8;opacity:" + (own ? "1" : "0.8")
    + ";font-size:var(--dg-fs-95);padding:0.5rem 0.6rem 0.15rem 0.6rem;";
  return h;
}

/**
 * Group the rows by owning civ for the full list: the local player's settlements first (that's the
 * list's main job — placing YOUR cities, which the top-N ranking may omit entirely), then the rest
 * alphabetically. Within a civ the diversity order is preserved.
 * @param {*[]} rows All display rows (already diversity-sorted).
 * @returns {{name:string, own:boolean, rows:*[]}[]} The groups.
 */
function groupByCiv(rows) {
  /** @type {Map<string, {name:string, own:boolean, rows:*[]}>} */
  const groups = new Map();
  for (const r of rows) {
    const key = r.ownerName || "";
    const g = groups.get(key)
      || /** @type {{name:string, own:boolean, rows:*[]}} */ ({ name: key, own: !!r.own, rows: [] });
    g.rows.push(r);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (Number(b.own) - Number(a.own)) || a.name.localeCompare(b.name));
}

/**
 * The "All settlements" list: EVERY visible settlement, grouped by civ, in the same row format as
 * the ranking above. The ranking is a top-N podium, so without this a settlement that is small or
 * homogeneous — most of your empire, early on — never appears anywhere on the tab.
 *
 * Skipped when the ranking already shows everything (nothing to add but a duplicate of it).
 * @param {HTMLElement} body Card body.
 * @param {*[]} rows All display rows.
 * @param {*} ctx The render context.
 */
function renderAllSettlements(body, rows, ctx) {
  body.appendChild(el("div", "emig-section-title", loc("LOC_EMIG_DIVERSE_ALL_TITLE", "All settlements")));
  const sub = el("div", "emig-dv-sub", loc("LOC_EMIG_DIVERSE_ALL_SUB",
    "Every settlement you can see, by civilization."));
  sub.style.cssText = "opacity:0.7;font-size:var(--dg-fs-85);padding:0 0.6rem 0.35rem 0.6rem;";
  body.appendChild(sub);
  const wrap = el("div", "emig-pr");
  wrap.appendChild(diversityHead(ctx));
  for (const g of groupByCiv(rows)) {
    wrap.appendChild(civHeading(g.name, g.own));
    for (const r of g.rows) wrap.appendChild(diversityDataRow(r, ctx));
  }
  body.appendChild(wrap);
}

/**
 * Render the diversity tab: the "most diverse cities" podium (each settlement a population-scaled
 * bar broken into its people's ORIGINS, then the mix's shape and its cosmopolitanism tier), a colour
 * key naming every origin, and below it the full by-civ list of every settlement.
 * @param {HTMLElement} body Card body.
 * @param {*[]} rows Diversity rows (from diverseCityRows), diversity-sorted, uncapped.
 */
export function renderDiversity(body, rows) {
  const ctx = diversityCtx(rows);
  const top = rows.slice(0, CONFIG.diversityRows > 0 ? CONFIG.diversityRows : rows.length);
  body.appendChild(el("div", "emig-section-title", loc("LOC_EMIG_DIVERSE_TITLE", "Most diverse cities")));
  body.appendChild(subtitle());
  const wrap = el("div", "emig-pr");
  wrap.appendChild(diversityHead(ctx));
  for (const r of top) wrap.appendChild(diversityDataRow(r, ctx));
  body.appendChild(wrap);
  // The key covers ALL rows, not just the podium's, so it decodes the full list below too.
  body.appendChild(originLegend(rows));
  const note = el("div", "emig-diverse-note",
    loc("LOC_EMIG_COSMO_DESC", "Describes the mix of origins living in each settlement. No yields attached."));
  note.style.cssText = "opacity:0.6;font-style:italic;font-size:var(--dg-fs-85);padding:0.2rem 0.6rem;";
  body.appendChild(note);
  if (rows.length > top.length) renderAllSettlements(body, rows, ctx);
}

/**
 * The one-line explainer under the title. The tab is otherwise easy to misread as being about
 * Cultural Quarters / enclaves, so it says plainly what a bar IS.
 * @returns {HTMLElement} The subtitle.
 */
function subtitle() {
  const s = el("div", "emig-dv-sub", loc("LOC_EMIG_DIVERSE_SUBTITLE",
    "Each settlement's people, coloured by the civilization they originally came from. Bar width shows population."));
  s.style.cssText = "opacity:0.7;font-size:var(--dg-fs-85);padding:0 0.6rem 0.5rem 0.6rem;";
  return s;
}
