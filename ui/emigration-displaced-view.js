// emigration-displaced-view.js
//
// The Displaced tab: one card per settlement of yours that people fled, saying where they are, what a returnee is
// worth, when they come home on their own, and what it costs to hasten them or to call people back from abroad.
// The two buttons open the call-home dialog for that one settlement's people; the tab redraws when it closes.
// The model is emigration-displaced.js; this file only lays it out.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { CALL_HOME_SCOPE } from "/emigration/ui/emigration-call-home.js";
import { offerCallHome } from "/emigration/ui/emigration-call-home-action.js";
import { migrationFlows } from "/emigration/ui/emigration-migration-stats.js";
import { TILE_YIELDS } from "/emigration/ui/emigration-displaced.js";
import { loc } from "/emigration/ui/emigration-loc.js";

/** @param {string} tag @param {string} [cls] @param {string} [text] */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** The game's own yield names, so the worth line reads as the city screen does. */
/** @type {Record<string, [string, string]>} */
const YIELD_NAMES = {
  YIELD_FOOD: ["LOC_YIELD_FOOD_NAME", "Food"], YIELD_PRODUCTION: ["LOC_YIELD_PRODUCTION_NAME", "Production"],
  YIELD_GOLD: ["LOC_YIELD_GOLD_NAME", "Gold"], YIELD_SCIENCE: ["LOC_YIELD_SCIENCE_NAME", "Science"],
  YIELD_CULTURE: ["LOC_YIELD_CULTURE_NAME", "Culture"], YIELD_HAPPINESS: ["LOC_YIELD_HAPPINESS_NAME", "Happiness"]
};

/**
 * "+2 Food, +1 Production": a tile's non-zero yields, largest first.
 * @param {Record<string, number>} perTile @returns {string}
 */
export function yieldsText(perTile) {
  return TILE_YIELDS
    .map((y) => ({ y, n: Number(perTile[y]) || 0 }))
    .filter((e) => e.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((e) => "+" + (Number.isInteger(e.n) ? e.n : e.n.toFixed(1)) + " " + loc(YIELD_NAMES[e.y][0], YIELD_NAMES[e.y][1]))
    .join(", ");
}

/**
 * Where a settlement's people are: "9 in Ostia, 3 in Ravenna, 2 in Athens (Greece)".
 * @param {import("/emigration/ui/emigration-displaced.js").DisplacedRow} r @returns {string}
 */
export function whereText(r) {
  const parts = r.internal.map((p) => loc("LOC_EMIG_DP_IN_OWN", "{1_Count} in {2_City}", p.points, p.from));
  for (const p of r.abroad) {
    parts.push(loc("LOC_EMIG_DP_IN_FOREIGN", "{1_Count} in {2_City} ({3_Civ})", p.points, p.from, p.civ));
  }
  return parts.join(", ");
}

/**
 * The free homecoming's line for a settlement still held.
 * @param {import("/emigration/ui/emigration-displaced.js").DisplacedRow} r @returns {string}
 */
export function waitText(r) {
  const w = r.wait;
  if (!w) return loc("LOC_EMIG_DP_HOMECOMING_OFF", "People at home only come back when called.");
  if (w.calm < w.needed) {
    return loc("LOC_EMIG_DP_WAIT_CALM",
      "Free, once {1_Home} has been calm for {2_Turns} more turns; then one comes home every {3_Every} turns.",
      r.home, w.nextIn, w.every);
  }
  if (w.nextIn <= 0) {
    return loc("LOC_EMIG_DP_WAIT_NOW", "Free: one comes home next turn, and the last in about {1_Turns} turns.", w.allIn);
  }
  return loc("LOC_EMIG_DP_WAIT_NEXT",
    "Free: the next one comes home in {1_Turns} turns, and the last in about {2_All} turns.", w.nextIn, w.allIn);
}

/**
 * The paid call abroad's line, with the gamble spelled out.
 * @param {NonNullable<import("/emigration/ui/emigration-displaced.js").DisplacedRow["abroadCall"]>} a
 * @returns {string}
 */
export function abroadText(a) {
  return loc("LOC_EMIG_DP_ABROAD",
    "Call {1_Count} from abroad: {2_Pct}% each, about {3_Expected} expected to come, for {4_Gold} Gold or {5_Infl} "
    + "Influence. That's about {6_PerGold} Gold or {7_PerInfl} Influence for each person who comes.",
    a.n, Math.round(a.chance * 100), String(a.expected), a.gold, a.influence, a.perGold, a.perInfluence);
}

/**
 * A button that opens the call-home dialog for one settlement's people, or a note when the call is cooling down.
 * @param {{pid:number, scope:string, home:string, label:string, cooldown:number, after?:()=>void}} o The call:
 *   whose, which kind, for which home, the button's text, turns before it's allowed, and what to do after.
 * @returns {HTMLElement}
 */
function callButton(o) {
  if (o.cooldown > 0) {
    return el("span", "emig-dp-note", loc("LOC_EMIG_DP_COOLDOWN", "Available again in {1_Turns} turns.", o.cooldown));
  }
  const b = el("div", "emig-filter-btn", o.label);
  b.addEventListener("click", () => offerCallHome(o.pid, o.scope, { flows: homeFlows(o.pid, o.home), after: o.after }));
  return b;
}

/**
 * The flow rows out of one home settlement, so a call lists only its people.
 * @param {number} pid @param {string} home @returns {*[]}
 */
function homeFlows(pid, home) {
  try {
    return migrationFlows().filter((/** @type {*} */ f) => f.src === pid && f.srcCity === home);
  } catch (_) {
    return [];
  }
}

/**
 * One settlement's card.
 * @param {import("/emigration/ui/emigration-displaced.js").DisplacedRow} r @param {number} pid
 * @param {()=>void} [after]
 * @returns {HTMLElement}
 */
function card(r, pid, after) {
  const c = el("div", "emig-city-card");
  const head = el("div", "emig-city-name", r.home);
  if (r.since != null) head.appendChild(el("span", "emig-flag", loc("LOC_EMIG_DP_SINCE", "since turn {1_Turn}", r.since)));
  c.appendChild(head);
  c.appendChild(line(loc("LOC_EMIG_DP_AWAY", "Away:"),
    loc("LOC_EMIG_DP_AWAY_N", "{1_Count} population points: {2_Where}", r.total, whereText(r))));
  if (!r.held) {
    c.appendChild(el("div", "emig-dp-lost",
      loc("LOC_EMIG_DP_LOST", "{1_Home} is no longer yours. These people stay where they are.", r.home)));
    return c;
  }
  if (r.tile) {
    c.appendChild(line(loc("LOC_EMIG_DP_WORTH", "Worth:"), loc("LOC_EMIG_DP_TILE",
      "each returnee settles a new tile at {1_Home}, about {2_Yields} a turn.", r.home, yieldsText(r.tile.perTile))));
  }
  if (r.hasten) appendHasten(c, r, pid, after);
  if (r.abroadCall) {
    c.appendChild(line(loc("LOC_EMIG_DP_ABROAD_LBL", "Abroad:"), abroadText(r.abroadCall),
      callButton({ pid, scope: CALL_HOME_SCOPE.EXTERNAL, home: r.home, after,
        label: loc("LOC_EMIG_DP_ABROAD_BTN", "Call from abroad"), cooldown: r.abroadCall.cooldown })));
  }
  return c;
}

/**
 * The lines for people in our own settlements: the free wait, and the paid hastening.
 * @param {HTMLElement} c @param {import("/emigration/ui/emigration-displaced.js").DisplacedRow} r
 * @param {number} pid @param {()=>void} [after]
 */
function appendHasten(c, r, pid, after) {
  const h = /** @type {NonNullable<typeof r.hasten>} */ (r.hasten);
  c.appendChild(line(loc("LOC_EMIG_DP_WAIT", "Wait:"), waitText(r)));
  if (!CONFIG.callHomeEnabled) return;
  c.appendChild(line(loc("LOC_EMIG_DP_HASTEN_LBL", "Hasten:"),
    loc("LOC_EMIG_DP_HASTEN", "bring {1_Count} back now for {2_Gold} Gold or {3_Infl} Influence.", h.n, h.gold, h.influence),
    callButton({ pid, scope: CALL_HOME_SCOPE.INTERNAL, home: r.home, after,
      label: loc("LOC_EMIG_DP_HASTEN_BTN", "Hasten"), cooldown: h.cooldown })));
}

/**
 * A labelled line, with an optional control at its end.
 * @param {string} label @param {string} text @param {HTMLElement} [control] @returns {HTMLElement}
 */
function line(label, text, control) {
  const row = el("div", "emig-dp-line");
  row.appendChild(el("span", "emig-dp-lbl", label));
  row.appendChild(el("span", "emig-dp-text", text));
  if (control) row.appendChild(control);
  return row;
}

/**
 * Render the Displaced tab.
 * @param {HTMLElement} body
 * @param {{rows?:*[], pid?:number, rebuild?:()=>void, invalidate?:(()=>void)|null}} section
 */
export function renderDisplaced(body, section) {
  body.appendChild(el("div", "emig-section-title",
    loc("LOC_EMIG_DP_SECTION", "Displaced: your people who fled, where they are, and the way home")));
  const rows = section.rows || [];
  if (!rows.length) {
    body.appendChild(el("div", "emig-empty",
      loc("LOC_EMIG_DP_EMPTY", "Nobody from your settlements is displaced right now.")));
    return;
  }
  const pid = typeof section.pid === "number" ? section.pid : -1;
  // After a call the gathered model is stale for this turn, so drop it before the tab redraws.
  const after = () => {
    if (section.invalidate) section.invalidate();
    if (section.rebuild) section.rebuild();
  };
  for (const r of rows) body.appendChild(card(r, pid, after));
}

/**
 * The dashboard section for this tab, from the gathered inputs.
 * @param {*} d Gathered dashboard inputs ({displaced, localPid}).
 * @returns {{title:string, kind:string, rows:*[], pid:number, invalidate:(()=>void)|null}}
 */
export function displacedSection(d) {
  return { title: loc("LOC_EMIG_VIEW_SEC_DISPLACED", "Displaced people"), kind: "displaced",
    rows: (d && d.displaced) || [], pid: d && typeof d.localPid === "number" ? d.localPid : -1,
    invalidate: d && typeof d.invalidate === "function" ? d.invalidate : null };
}

/** The tab's own styles, concatenated into the dashboard stylesheet. */
export const DISPLACED_CSS =
  ".emig-dp-line{display:flex;align-items:baseline;gap:0.5rem;margin:0.22rem 0;line-height:1.35;}" +
  ".emig-dp-lbl{flex:0 0 5rem;text-transform:uppercase;letter-spacing:0.03rem;opacity:0.65;font-size:var(--dg-fs-72);}" +
  // No italics anywhere: the game's UI font has no italic face and draws italic text as nothing at all
  // (watched 2026-10-25: four italic lines on this tab were simply missing).
  ".emig-dp-text{flex:0 1 auto;}" +
  ".emig-dp-note{opacity:0.65;white-space:nowrap;}" +
  ".emig-dp-lost{opacity:0.75;margin:0.25rem 0 0 5.5rem;}";
