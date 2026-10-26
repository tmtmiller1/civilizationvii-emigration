// emigration-displaced-view.js
//
// The displaced row on the Settlements tab: under the bars of a settlement people fled, where they are, what a returnee
// works and leaves (the game's yield icons), when they come home on their own, and in the last cell the buttons
// that hasten them or call people back from abroad, with their prices. The sentences the cells used to show are
// their hovers. The buttons open the call dialog for that one settlement's people; the tab redraws when it
// closes. The model is emigration-displaced.js; this file only lays it out; emigration-city-flows.js places it.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { CALL_HOME_SCOPE, CALL_HOME_CURRENCY } from "/emigration/ui/emigration-call-home.js";
import { callHomeNow, callHomeBalance, callHomeResolvable } from "/emigration/ui/emigration-call-home-action.js";
import { migrationFlows } from "/emigration/ui/emigration-migration-stats.js";
import { loc } from "/emigration/ui/emigration-loc.js";
import { setTunable } from "/emigration/ui/emigration-settings.js";
import { yieldsText, worthText, hastenLedger, abroadLedger, hostLoss, netPerPerson, turnsForN,
  insteadText, yieldName } from "/emigration/ui/emigration-hasten-ledger.js";
import { TILE_YIELDS } from "/emigration/ui/emigration-displaced.js";

export { yieldsText };

/** @param {string} tag @param {string} [cls] @param {string} [text] */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * "2 Farms, 1 Woodcutter": the improvements departures tore down, named as the game names them.
 * @param {{type:string, count:number}[]} lost @param {(type:string)=>string} [nameOf] Test seam.
 * @returns {string}
 */
export function lostText(lost, nameOf) {
  // "Mine ×2, Farm": the count after the name, so no language has to pluralize the game's improvement names.
  const name = nameOf || improvementName;
  return (lost || []).map((e) => name(e.type) + (e.count > 1 ? " ×" + e.count : "")).join(", ");
}

/** @param {string} type An improvement type. @returns {string} Its name in the current language, or a fallback. */
function improvementName(type) {
  try {
    const def = typeof GameInfo !== "undefined" ? GameInfo.Constructibles.lookup(type) : null;
    if (def && def.Name) return loc(def.Name, def.Name);
  } catch (_) {
    /* unreadable */
  }
  const bare = String(type).replace(/^IMPROVEMENT_/, "").replace(/_RESOURCE$/, "").toLowerCase().replace(/_/g, " ");
  return bare.charAt(0).toUpperCase() + bare.slice(1);
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
      "Free, once {1_Home} has been calm for {2_Turns} more turns; then {4_Batch} come home every {3_Every} turns, all of them in about {5_All} turns.",
      r.home, w.nextIn, w.every, w.batch, w.allIn);
  }
  if (w.nextIn <= 0) {
    return loc("LOC_EMIG_DP_WAIT_NOW", "Free: {2_Batch} come home next turn, and the last in about {1_Turns} turns.", w.allIn, w.batch);
  }
  return loc("LOC_EMIG_DP_WAIT_NEXT",
    "Free: the next {3_Batch} come home in {1_Turns} turns, and the last in about {2_All} turns.", w.nextIn, w.allIn, w.batch);
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
 * A button that raises one of the game's pop-ups from the Settlements tab. The display queue holds a pop-up while
 * a screen is up (watched 2026-10-25: the click did nothing visible, and raising it while the screen was still
 * closing lost it too), so the screen steps aside, the pop-up is raised once it is gone, and the tab comes back
 * after. `raise` returns whether anything opened; when nothing did, the screen comes straight back.
 * @param {string} label @param {()=>boolean} raise
 * @param {{close:()=>void, reopen:(tab:string)=>void}|null|undefined} screen @returns {HTMLElement}
 */
export function actionButton(label, raise, screen) {
  const b = el("div", "emig-dp-btn", label);
  b.addEventListener("click", () => {
    const go = () => {
      if (!raise() && screen) screen.reopen("cityflows");
    };
    if (!screen) {
      go();
      return;
    }
    screen.close();
    whenScreenGone(go, 12);
  });
  return b;
}

/**
 * Run `fn` once the Emigration screen has left the page, polling every 150 ms up to `tries` times, then anyway.
 * @param {()=>void} fn @param {number} tries
 */
function whenScreenGone(fn, tries) {
  const gone = () => !document.querySelector("screen-emigration");
  if (gone() || tries <= 0) {
    setTimeout(fn, 120); // one more tick, so the display queue sees the screen as closed
    return;
  }
  setTimeout(() => whenScreenGone(fn, tries - 1), 150);
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
 * @param {string} key A YieldType. @param {string} [context] The icon context, "YIELD" when left out.
 * @returns {string} The game's icon as a `url(...)`, or "" off-engine.
 */
function iconUrl(key, context) {
  try {
    const url = typeof UI !== "undefined" && UI.getIconURL ? UI.getIconURL(key, context || "YIELD") : "";
    return typeof url === "string" && url ? "url('" + url + "')" : "";
  } catch (_) {
    return "";
  }
}

/**
 * A pane's sub-heading: in parentheses, the game's population icon, then what these people are ("(👥 that came
 * here this age)", the owner, 2026-10-26). Off-engine, or when the icon can't be read, the words alone.
 * @param {string} words @returns {HTMLElement}
 */
export function peopleSub(words) {
  const s = el("span", "emig-sc-hs");
  s.appendChild(el("span", "emig-sc-hs-w", "("));
  // The green people glyph is the FONTICON entry, the one the game's own text draws for [icon:YIELD_POPULATION]
  // (the YIELD context falls back to a settlement mark; the owner, 2026-10-26: "you used a city icon"). The
  // texture is white; the engine's own fxs-background-image-tint (the property the game's city banner tints its
  // images with) turns it green. The glyph's own span carries no opacity: with any, the engine drops the tint and
  // draws the texture white (docs/engine-limits-from-probes.md, 2026-10-26).
  const bg = iconUrl("YIELD_POPULATION", "FONTICON");
  if (bg) {
    const i = el("span", "emig-sc-hs-i");
    i.style.cssText = "background-image:" + bg + ";fxs-background-image-tint:#7fd08a;";
    s.appendChild(i);
  }
  s.appendChild(el("span", "emig-sc-hs-w", words + ")"));
  return s;
}


/**
 * One yield as the game draws it: its icon and a whole number, signed ("+2") unless it is a price. Off-engine,
 * or when the icon can't be read, the yield's name stands in for the icon.
 * @param {string} key A YieldType. @param {number|null} n The amount; null draws a dash (an empty slot).
 * @param {boolean} [price] Unsigned. @returns {HTMLElement}
 */
export function chip(key, n, price) {
  const y = el("span", "emig-y");
  const bg = iconUrl(key);
  if (bg) {
    const i = el("span", "emig-y-i");
    i.style.backgroundImage = bg;
    y.appendChild(i);
  } else {
    y.appendChild(el("span", "emig-y-t", yieldName(key) + " "));
  }
  const text = n == null ? "\u2014" : price ? String(n) : (n > 0 ? "+" : "\u2212") + Math.abs(n);
  y.appendChild(el("span", "emig-y-n" + (n != null && n < 0 ? " neg" : ""), text));
  y.title = text + " " + yieldName(key);
  return y;
}

/**
 * A row of yield chips: whole numbers, the three largest by size, zeroes dropped (gains only unless `signed`).
 * @param {Record<string, number>} per @param {boolean} [signed] @returns {HTMLElement}
 */
function chips(per, signed) {
  const row = el("span", "emig-ys");
  const list = TILE_YIELDS
    .map((y) => ({ y, n: Math.round(Number(per[y]) || 0) }))
    .filter((e) => (signed ? e.n !== 0 : e.n > 0))
    .sort((a, b) => Math.abs(b.n) - Math.abs(a.n))
    .slice(0, 3);
  if (!list.length) row.appendChild(el("span", "emig-dp-dim", "\u2014"));
  for (const e of list) row.appendChild(chip(e.y, e.n));
  return row;
}

/**
 * The short lines of the free homecoming column; the prose (waitText) is the column's hover.
 * @param {import("/emigration/ui/emigration-displaced.js").DisplacedRow} r @returns {string[]}
 */
export function freeLines(r) {
  const w = r.wait;
  if (!w) return [loc("LOC_EMIG_DP_FREE_OFF", "only when called")];
  const out = [];
  if (w.calm < w.needed) out.push(loc("LOC_EMIG_DP_FREE_CALM", "calm in {1_Turns} more turns", w.nextIn));
  else if (w.nextIn <= 0) out.push(loc("LOC_EMIG_DP_FREE_NEXT_NOW", "next {1_Batch} next turn", w.batch));
  else out.push(loc("LOC_EMIG_DP_FREE_NEXT", "next {1_Batch} in {2_Turns} turns", w.batch, w.nextIn));
  if (w.calm < w.needed) out.push(loc("LOC_EMIG_DP_FREE_THEN", "then {1_Batch} every {2_Every} turns", w.batch, w.every));
  out.push(loc("LOC_EMIG_DP_FREE_ALL", "all in about {1_Turns} turns", w.allIn));
  return out;
}

/** @param {string} cls @param {string} [title] A hover. @returns {HTMLElement} One cell of a row. */
function col(cls, title) {
  const c = el("div", "emig-dp-col " + cls);
  if (title) c.title = title;
  return c;
}

/** @param {HTMLElement} c @param {string} text @param {string} [cls] */
function add(c, text, cls) {
  c.appendChild(el("div", cls || "emig-sc-line", text));
}

/**
 * The displaced block of a settlement's card, the last block of its Keep and recover half: the heading with the
 * count, where they are, what a returnee works and leaves (named for the settlements), then the free homecoming on
 * the left and the buttons on the right. Every heading and line uses the card's own classes, so the block reads
 * like the blocks above it (the owner, 2026-10-26: "make the headings clearly headings, the text underneath
 * clearly contextual").
 * @param {import("/emigration/ui/emigration-displaced.js").DisplacedRow} r @param {number} pid
 * @param {()=>void} [after] What to do once a call is made (the tab redraws). @returns {HTMLElement}
 */
export function displacedRow(r, pid, after) {
  // A pane of its own since the four-pane card (the owner, 2026-10-26: "Arrived and Left should be independent
  // cards"), headed the way the other panes are.
  const row = el("div", "emig-sc-half left emig-dp-row");
  row.setAttribute("data-away", String(r.total)); // the card's title line reads the count from here
  row.appendChild(leftHead(r.total));
  add(row, whereText(r), "emig-sc-line");
  const notes = displacedNotes(r);
  if (notes) add(row, notes, "emig-sc-dim");
  if (!r.held) return row;
  appendScaffold(row, worthCol(r), r.internal.length ? freeCol(r) : null, actionCol(r, pid, after));
  return row;
}

/**
 * The Left pane of a settlement nobody fled: the same frame as a filled one, with dashes where the numbers would be
 * (the owner, 2026-10-26: keep the scaffolding there "so that we can actually get used to what it looks like").
 * @returns {HTMLElement}
 */
export function displacedRowEmpty() {
  const row = el("div", "emig-sc-half left emig-dp-row emig-dp-row-empty");
  row.appendChild(leftHead(0));
  row.appendChild(el("div", "emig-sc-none", loc("LOC_EMIG_SC_LEFT_NONE", "None")));
  appendScaffold(row, col("c-worth"), null, CONFIG.callHomeEnabled ? payStub(col("c-act")) : col("c-act"));
  return row;
}

/**
 * The pane's lower frame: the yields a returnee works, then the free homecoming beside the buttons. A part with
 * nothing to say keeps its heading over a dash.
 * @param {HTMLElement} row @param {HTMLElement} worth @param {HTMLElement|null} free @param {HTMLElement} act
 */
function appendScaffold(row, worth, free, act) {
  if (!worth.children.length) add(worth, "\u2014", "emig-sc-dim");
  row.appendChild(headed(worth, loc("LOC_EMIG_DP_COL_WORTH", "Per returnee, a turn")));
  const bottom = el("div", "emig-dp-bottom");
  if (!free) {
    free = col("c-free");
    free.appendChild(el("div", "emig-sc-bl", loc("LOC_EMIG_DP_COL_FREE", "Free homecoming")));
    add(free, "\u2014", "emig-sc-dim");
  }
  bottom.appendChild(free);
  bottom.appendChild(act);
  row.appendChild(bottom);
}

/** @param {HTMLElement} a @returns {HTMLElement} The buttons' place with nobody to bring back: greyed, dashes. */
function payStub(a) {
  const box = el("div", "emig-dp-act");
  box.title = loc("LOC_EMIG_DP_NOBODY", "Nobody to bring back.");
  add(box, loc("LOC_EMIG_DP_PAY_LBL_NONE", "Bring back now for"), "emig-sc-dim");
  const pay = el("div", "emig-dp-pay");
  for (const key of ["YIELD_GOLD", "YIELD_DIPLOMACY"]) {
    const b = el("div", "emig-dp-btn emig-dp-paybtn off");
    b.appendChild(chip(key, null, true));
    pay.appendChild(b);
  }
  box.appendChild(pay);
  a.appendChild(box);
  return a;
}

/** @param {number} total @returns {HTMLElement} "Left · displaced people, and the way home", the count at the right. */
function leftHead(total) {
  const head = el("div", "emig-sc-hh");
  const left = el("span", "emig-sc-hl");
  left.appendChild(el("span", "emig-sc-ht", loc("LOC_EMIG_DP_SUB", "Left")));
  left.appendChild(peopleSub(loc("LOC_EMIG_DP_SUB_SUB", "that went elsewhere")));
  head.appendChild(left);
  head.appendChild(el("span", "emig-sc-count", String(total)));
  return head;
}

/**
 * The small line under where they are: since when, the tiles torn down, and that a lost settlement keeps them away.
 * @param {import("/emigration/ui/emigration-displaced.js").DisplacedRow} r @returns {string} "" when there is nothing.
 */
function displacedNotes(r) {
  const notes = [];
  if (r.since != null) notes.push(loc("LOC_EMIG_DP_SINCE", "since turn {1_Turn}", r.since));
  if (r.lost && r.lost.length) notes.push(loc("LOC_EMIG_DP_LOST_SHORT", "Lost: {1_Tiles} (rebuilt first)", lostText(r.lost)));
  if (!r.held) notes.push(loc("LOC_EMIG_DP_LOST", "{1_Home} is no longer yours. These people stay where they are.", r.home));
  return notes.join(" \u00b7 ");
}

/** @param {HTMLElement} cell @param {string} heading @returns {HTMLElement} The cell with a small heading first. */
function headed(cell, heading) {
  cell.insertBefore(el("div", "emig-sc-bl", heading), cell.children[0] || null);
  return cell;
}

/**
 * What a returnee works and leaves, a row of chips per settlement named: "Boston gains", "Pittsburgh loses" for each
 * settlement they live in now (the three largest), and the net per returnee against the hosts' weighted average.
 * @param {import("/emigration/ui/emigration-displaced.js").DisplacedRow} r @returns {HTMLElement}
 */
function worthCol(r) {
  const w = col("c-worth", r.held && r.tile ? worthText(r) : "");
  if (!r.held || !r.tile) return w;
  const rowOf = (/** @type {string} */ label, /** @type {HTMLElement} */ ch) => {
    const line = el("div", "emig-dp-yrow");
    line.appendChild(el("span", "emig-dp-ylbl", label));
    line.appendChild(ch);
    w.appendChild(line);
  };
  rowOf(loc("LOC_EMIG_DP_GAINS_NAMED", "{1_Home} gains", r.home), chips(r.tile.perTile));
  const hosts = r.internal.filter((p) => p.tile).sort((a, b) => b.points - a.points).slice(0, 3);
  for (const p of hosts) rowOf(loc("LOC_EMIG_DP_LOSES_NAMED", "{1_From} loses", p.from), chips(/** @type {*} */ (p.tile)));
  const loss = hostLoss(r.internal);
  if (loss) rowOf(loc("LOC_EMIG_DP_NET_PER", "net per person"), chips(netPerPerson(r.tile.perTile, loss), true));
  return w;
}

/** @param {import("/emigration/ui/emigration-displaced.js").DisplacedRow} r @returns {HTMLElement} */
function freeCol(r) {
  const f = col("c-free", waitText(r));
  f.appendChild(el("div", "emig-sc-bl", loc("LOC_EMIG_DP_COL_FREE", "Free homecoming")));
  for (const t of freeLines(r)) add(f, t, "emig-sc-line");
  return f;
}

/**
 * The buttons: Hasten with its prices and the turns it buys, and the call abroad with its odds.
 * @param {import("/emigration/ui/emigration-displaced.js").DisplacedRow} r @param {number} pid
 * @param {()=>void} [after] @returns {HTMLElement}
 */
function actionCol(r, pid, after) {
  const a = col("c-act");
  if (!CONFIG.callHomeEnabled) return a;
  if (r.hasten) a.appendChild(hastenBox(r, pid, after));
  else payStub(a);
  if (r.abroadCall) a.appendChild(abroadBox(r, pid, after));
  return a;
}

/**
 * The paid return of people from your own settlements, as two buttons on the card, one per currency (the owner,
 * 2026-10-26: the dialog is gone; "people use the main window as the interface for the mechanic"). A click pays
 * and moves them at once and the tab redraws; the ledger of what the fee buys is the block's hover.
 * @param {import("/emigration/ui/emigration-displaced.js").DisplacedRow} r @param {number} pid
 * @param {()=>void} [after] @returns {HTMLElement}
 */
function hastenBox(r, pid, after) {
  const h = /** @type {NonNullable<typeof r.hasten>} */ (r.hasten);
  const t = CONFIG.homecomingEnabled ? turnsForN(r.wait, h.n) : null;
  const box = el("div", "emig-dp-act");
  box.title = hastenLedger(r, h.n, lostText).join("\n");
  if (h.cooldown > 0) {
    box.appendChild(el("span", "emig-dp-note", loc("LOC_EMIG_DP_COOLDOWN", "Available again in {1_Turns} turns.", h.cooldown)));
    return box;
  }
  add(box, loc("LOC_EMIG_DP_PAY_LBL", "Bring {1_Count} back now for", h.n), "emig-sc-dim");
  box.appendChild(payButtons({ r, pid, scope: CALL_HOME_SCOPE.INTERNAL, n: h.n, after }, h.gold, h.influence));
  const instead = insteadText(t);
  if (instead) add(box, instead, "emig-sc-dim");
  return box;
}

/**
 * The gamble on people abroad, the same way: two buttons, the odds under them.
 * @param {import("/emigration/ui/emigration-displaced.js").DisplacedRow} r @param {number} pid
 * @param {()=>void} [after] @returns {HTMLElement}
 */
function abroadBox(r, pid, after) {
  const ab = /** @type {NonNullable<typeof r.abroadCall>} */ (r.abroadCall);
  const box = el("div", "emig-dp-act");
  box.title = abroadLedger(r, lostText).join("\n");
  if (ab.cooldown > 0) {
    box.appendChild(el("span", "emig-dp-note", loc("LOC_EMIG_DP_COOLDOWN", "Available again in {1_Turns} turns.", ab.cooldown)));
    return box;
  }
  add(box, loc("LOC_EMIG_DP_CALL_LBL", "Call {1_Count} from abroad for", ab.n), "emig-sc-dim");
  box.appendChild(payButtons({ r, pid, scope: CALL_HOME_SCOPE.EXTERNAL, n: ab.n, after }, ab.gold, ab.influence));
  add(box, loc("LOC_EMIG_DP_ODDS_SHORT", "{1_Pct}% each, about {2_Expected} come", Math.round(ab.chance * 100),
    String(ab.expected)), "emig-sc-dim");
  return box;
}

/**
 * @typedef {Object} PayCall One paid call from the card.
 * @property {import("/emigration/ui/emigration-displaced.js").DisplacedRow} r
 * @property {number} pid @property {string} scope A CALL_HOME_SCOPE. @property {number} n How many.
 * @property {()=>void} [after]
 */

/**
 * The two prices as buttons: the yield icon and the cost; one the treasury can't cover is greyed and says so.
 * @param {PayCall} call @param {number} gold @param {number} influence @returns {HTMLElement}
 */
function payButtons(call, gold, influence) {
  const row = el("div", "emig-dp-pay");
  row.appendChild(payButton(call, CALL_HOME_CURRENCY.GOLD, "YIELD_GOLD", gold));
  row.appendChild(payButton(call, CALL_HOME_CURRENCY.INFLUENCE, "YIELD_DIPLOMACY", influence));
  return row;
}

/**
 * @param {PayCall} call @param {number} currency A CALL_HOME_CURRENCY. @param {string} yieldKey @param {number} cost
 * @returns {HTMLElement}
 */
function payButton(call, currency, yieldKey, cost) {
  const b = el("div", "emig-dp-btn emig-dp-paybtn");
  b.appendChild(chip(yieldKey, cost, true));
  const have = callHomeBalance(call.pid, currency);
  if (have < cost) {
    b.classList.add("off");
    b.title = loc("LOC_EMIG_DP_SHORT", "Not enough: this needs {1_Cost} and we have {2_Have}.", cost, Math.floor(have));
    return b;
  }
  b.addEventListener("click", () => {
    callHomeNow(call.pid, call.scope, currency, {
      want: call.n, declined: {}, flows: homeFlows(call.pid, call.r.home), resolvable: callHomeResolvable(call.pid),
      home: call.scope === CALL_HOME_SCOPE.INTERNAL ? call.r.home : undefined
    });
    if (typeof call.after === "function") call.after();
  });
  return b;
}

/**
 * The reminder's own off switch, where the reminder sends the player (the owner, 2026-10-26: it has to be
 * "permanently dismissed if the player so chooses"). Flips the same setting as Options, Mods, Emigration.
 * @returns {HTMLElement}
 */
function reminderSwitch() {
  const span = el("span", "emig-dp-remind");
  const draw = () => {
    span.innerHTML = "";
    if (CONFIG.callHomeOfferWhenCalm) {
      const off = el("span", "emig-dp-link", loc("LOC_EMIG_DP_REMIND_STOP", "Stop displaced-people reminders"));
      off.addEventListener("click", () => {
        setTunable("callHomeOfferWhenCalm", false);
        draw();
      });
      span.appendChild(off);
    } else {
      span.appendChild(el("span", "emig-dp-note", loc("LOC_EMIG_DP_REMIND_OFF",
        "Reminders are off; Options, Mods, Emigration turns them back on.")));
    }
  };
  draw();
  return span;
}

/**
 * The lines above the settlement cards when people are displaced: what newcomers cost right now, what the strips
 * offer, and the reminder's switch.
 * @param {{costs?:{gold:number, happiness:number}|null}} section @returns {HTMLElement}
 */
export function displacedIntro(section) {
  const box = el("div", "emig-dp-intro");
  box.appendChild(el("span", "emig-dp-costs", section.costs
    ? loc("LOC_EMIG_DP_NEWCOMERS_SHORT", "Newcomers cost {1_Gold} Gold and {2_Happy} Happiness a turn while they settle in.",
      section.costs.gold, section.costs.happiness)
    : loc("LOC_EMIG_DP_NEWCOMERS_NONE", "No newcomers are settling in right now.")));
  box.appendChild(reminderSwitch());
  return box;
}

/**
 * What a call does once the player has chosen: the gathered model is stale for this turn, so drop it before the
 * tab redraws, through the host screen when there is one.
 * @param {{invalidate?:(()=>void)|null, screen?:{close:()=>void, reopen:(tab:string)=>void}|null,
 *   rebuild?:()=>void}} section
 * @returns {()=>void}
 */
export function displacedAfter(section) {
  return () => {
    if (section.invalidate) section.invalidate();
    // A redraw in place: the calls are buttons on the card now, so there is no pop-up to step aside for and no
    // screen to bring back; only the enclave decision still steps aside, and it reopens the screen itself.
    if (section.rebuild) section.rebuild();
    else if (section.screen) section.screen.reopen("cityflows");
  };
}

/**
 * What the Settlements section carries for its displaced strips, from the gathered inputs.
 * @param {*} d Gathered dashboard inputs ({displaced, localPid, newcomerCosts, invalidate}).
 * @returns {{displaced:*[], pid:number, costs:{gold:number, happiness:number}|null, invalidate:(()=>void)|null}}
 */
export function displacedExtras(d) {
  const rows = (d && d.displaced) || [];
  // The tab is "Settlements" whatever the count (the owner, 2026-10-26: no "(66 displaced)" in the heading).
  return {
    displaced: rows, pid: d && typeof d.localPid === "number" ? d.localPid : -1,
    costs: (d && d.newcomerCosts) || null,
    invalidate: d && typeof d.invalidate === "function" ? d.invalidate : null
  };
}

/** The tab's own styles, concatenated into the dashboard stylesheet. */
export const DISPLACED_CSS =
  // Five columns, the button in the last (the owner, 2026-10-26: "set the hasten button... to the right of all the
  // text for each civ, like in its own column"), yields as the game's icons rather than prose; the prose stays as
  // each column's hover.
  // Flex, not grid: the game's UI engine ignores display:grid, and the first build stacked every column in one
  // pile with the button floated right (watched 2026-10-26). width:100% because a flex row here otherwise
  // shrink-wraps to about four fifths of the tab, leaving a band of nothing right of the buttons (the owner).
  // The displaced row under a settlement's two bars: four cells across, the buttons at the right edge. Fixed
  // shares, because the engine grows proportional flex cells only to about three quarters of a row.
  // The displaced block, stacked under the Keep half's other blocks; the free homecoming and the buttons share
  // its last line.
  ".emig-dp-row{display:flex;flex-direction:column;align-items:stretch;gap:0.2rem;}" +
  ".emig-dp-intro{display:flex;justify-content:center;align-items:baseline;gap:1.2rem;flex-wrap:wrap;" +
  "margin:0 0 0.5rem;}" +
  ".emig-dp-intro .emig-dp-costs{margin:0;}" +
  ".emig-dp-intro .emig-dp-remind{display:inline;margin:0;}" +
  ".emig-dp-row .c-worth{margin-top:0.35rem;}" +
  ".emig-dp-bottom{display:flex;flex-direction:row;align-items:flex-start;justify-content:space-between;gap:1rem;" +
  "margin-top:0.35rem;}" +
  ".emig-dp-bottom .c-free{flex:1 1 auto;}" +
  ".emig-dp-bottom .c-act{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;}" +
  ".emig-dp-col{min-width:0;}" +
  ".emig-dp-sub{line-height:1.35;}" +
  ".emig-dp-dim{opacity:0.7;line-height:1.35;font-size:var(--dg-fs-85);color:#cbb994;}" +
  // No font-family here: the engine took the `inherit` keyword as a family name and drew the number at zero
  // height (watched 2026-10-26).
  ".emig-dp-count{line-height:1.2;}" +
  ".emig-dp-big{font-size:var(--dg-fs-140);color:#f0dca8;line-height:1.1;}" +
  ".emig-dp-yrow{display:flex;align-items:center;gap:0.4rem;margin:0.1rem 0;}" +
  // The label keeps its full width: at a fixed 7.5rem "Philadelphia gains" lost its last letter (watched 2026-10-26).
  ".emig-dp-ylbl{flex:0 0 auto;min-width:8.5rem;opacity:0.85;font-size:var(--dg-fs-85);color:#e5d2ac;white-space:nowrap;}" +
  ".emig-ys{display:flex;flex-direction:row;flex-wrap:wrap;gap:0.15rem 0.6rem;align-items:center;}" +
  ".emig-y{display:inline-flex;align-items:center;gap:0.15rem;white-space:nowrap;}" +
  ".emig-y-i{display:inline-block;width:1.1rem;height:1.1rem;background-size:contain;background-repeat:no-repeat;" +
  "background-position:center;}" +
  ".emig-y-n{font-weight:bold;color:#e5d2ac;}" +
  ".emig-y-n.neg{color:#e08a7a;}" +
  ".emig-dp-act{display:flex;flex-direction:column;align-items:flex-end;gap:0.2rem;}" +
  ".emig-dp-pay{display:flex;flex-direction:row;gap:0.5rem;}" +
  ".emig-dp-paybtn{padding:0.35rem 0.9rem;}" +
  ".emig-dp-paybtn .emig-y{font-size:var(--dg-fs-105);}" +
  ".emig-dp-paybtn.off{opacity:0.45;cursor:default;}" +
  ".emig-dp-act + .emig-dp-act{margin-top:0.5rem;}" +
  ".emig-dp-act .emig-dp-btn{margin-left:0;}" +
  ".emig-dp-price{display:flex;flex-direction:row;align-items:center;gap:0.25rem;font-size:var(--dg-fs-85);" +
  "white-space:nowrap;}" +
  ".emig-dp-note{opacity:0.65;white-space:nowrap;}" +
  // A real button, not a filter pill (the owner, 2026-10-25: "too small, not clear that it's a button"), in the
  // shape of the Demographics screen's own in-content button ("View on map", its detail size), so the two
  // surfaces agree.
  ".emig-dp-btn{display:inline-flex;align-items:center;margin-left:0.8rem;padding:0.55rem 1.2rem;cursor:pointer;" +
  "border:0.0555rem solid rgba(243,195,76,0.6);border-radius:0.35rem;" +
  "background:linear-gradient(to bottom,rgba(243,195,76,0.24) 0%,rgba(243,195,76,0.07) 100%);" +
  "color:#f3c34c;font-size:var(--dg-fs-105);font-weight:bold;letter-spacing:0.02rem;white-space:nowrap;" +
  "box-shadow:0 1px 2px rgba(0,0,0,0.45),inset 0 1px 0 rgba(255,255,255,0.08);}" +
  ".emig-dp-btn:hover{background:linear-gradient(to bottom,rgba(243,195,76,0.4) 0%,rgba(243,195,76,0.16) 100%);" +
  "border-color:rgba(243,195,76,0.95);color:#ffe9a8;}" +
  ".emig-dp-btn:active{background:linear-gradient(to bottom,rgba(243,195,76,0.16) 0%,rgba(243,195,76,0.05) 100%);" +
  "box-shadow:inset 0 1px 3px rgba(0,0,0,0.5);}" +
  ".emig-dp-how{text-align:center;opacity:0.85;margin:0 0 0.6rem;}" +
  ".emig-dp-remind{display:block;margin-top:0.2rem;font-size:var(--dg-fs-85);}" +
  ".emig-dp-link{cursor:pointer;color:#c9a24c;text-decoration:underline;}" +
  ".emig-dp-link:hover{color:#f3c34c;}" +
  ".emig-dp-costs{text-align:center;opacity:0.8;margin:0 0 0.6rem;}" +
  ".emig-dp-lost{opacity:0.75;margin:0.25rem 0 0 5.5rem;}" +
  "";
