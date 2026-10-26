// emigration-settlement-card.js
//
// A settlement's dashboard card on the Settlements tab (the owner, 2026-10-26: "a control dashboard where we had
// the Immigrant half on the left and the Emigrant half on the right and we could learn/manipulate what we need from
// this screen"). Two halves under the name: Attract (the arrivals bar, who is drawn here first, what would draw
// more) and Keep and recover (the departures bar, the pressure as a gauge with its terms on hover, who pulls on
// these people, what would keep them), then the displaced row when anyone fled. The numbers come from
// emigration-settlement-model.js, read off the pass the simulation decided with; the bars and the pressure pieces
// come from emigration-city-flows.js through `deps`, so this file never imports it back.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { loc } from "/emigration/ui/emigration-loc.js";
import { chip, peopleSub } from "/emigration/ui/emigration-displaced-view.js";
import { pieCardSlices, legendChips } from "/emigration/ui/emigration-pies.js";
import { civColorByIndex, CAUSE_PALETTE } from "/emigration/ui/emigration-network-paint.js";
import { prosperityLedger } from "/emigration/ui/emigration-settlement-ledger.js";
import { forecastLine } from "/emigration/ui/emigration-forecast.js";

export { prosperityLedger, prosperityLedgerFor } from "/emigration/ui/emigration-settlement-ledger.js";

/**
 * @typedef {Object} CardDeps What emigration-city-flows.js lends the card.
 * @property {(c:*)=>string} cardTitle
 * @property {(dir:*, isArrivals:boolean)=>HTMLElement[]} pieBody The pie, its legend and the Why line, or the
 *   dashed placeholder.
 * @property {(dir:*)=>number} dirTotal
 * @property {(bar:number)=>{label:string, color:string, stage:number}} pressureBand
 * @property {(pct:number, color:string)=>HTMLElement} pressureBar
 * @property {(label:string, raise:()=>boolean, screen:*)=>HTMLElement} actionButton A button that steps the
 *   screen aside for one of the game's pop-ups.
 * @property {(city:*, after?:()=>void)=>{pending:boolean, open:()=>boolean}} decide The enclave decision a
 *   settlement is waiting on.
 * @property {()=>HTMLElement} displacedRowEmpty The Left pane of a settlement nobody fled.
 * @property {(name:string)=>({mix:string, mixTip:string, character:string|null, characterTip:string}|null)} [mixOf]
 *   The settlement's Mix and Character words (emigration-detail-views.js `mixWords`), or null when unread.
 * @property {()=>void} [after] What to do once a pop-up's choice is made.
 * @property {(cityKey:string, on:boolean)=>void} [toggleIntake] Close a settlement of the player's to newcomers,
 *   or open it again; absent when the option is off.
 * @property {{close:()=>void, reopen:(tab:string)=>void}|null} [screen] The host screen.
 */

/** @typedef {import("/emigration/ui/emigration-settlement-model.js").SettlementModel} SettlementModel */
/** @typedef {import("/emigration/ui/emigration-settlement-model.js").PullRow} PullRow */

/** @param {string} tag @param {string} [cls] @param {string} [text] @returns {HTMLElement} */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** @param {number} n @returns {string} A signed score with one decimal: "+1.8", "−0.4". */
function signed(n) {
  const v = Math.round(n * 10) / 10;
  return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
}

/**
 * The card.
 * @param {*} c Entry { name, town, in, out, pressure }.
 * @param {HTMLElement|null} displaced The settlement's displaced row, when anyone fled it.
 * @param {SettlementModel|null} m The settlement's model, or null before the first pass.
 * @param {CardDeps} deps
 * @returns {HTMLElement}
 */
export function settlementCard(c, displaced, m, deps) {
  const card = el("div", "emig-city-card emig-sc");
  card.appendChild(titleLine(c, m, deps));
  // Three columns (the owner, 2026-10-26): the arrivals' side on the left (Arriving over Arrived), the prosperity
  // ledger as a thin fifth card standing between, and the departures' side on the right (Leaving over Left).
  const cols = el("div", "emig-sc-cols");
  const left = el("div", "emig-sc-col");
  left.appendChild(attractHalf(c, m, deps));
  left.appendChild(arrivedPane(m, c.pressure && c.pressure.enclave, deps));
  cols.appendChild(left);
  cols.appendChild(prosperityLedger(m));
  const right = el("div", "emig-sc-col");
  right.appendChild(keepHalf(c, m, deps));
  right.appendChild(leftPane(displaced || deps.displacedRowEmpty(), deps.pieBody(c.out, false)));
  cols.appendChild(right);
  card.appendChild(cols);
  return card;
}

/**
 * The Left pane with the departures pie beside its text (the owner, 2026-10-26: "the 'where they went' pie should
 * be in Left"): everything under the pane's head moves into the text column, the chart takes the right.
 * @param {HTMLElement} pane The displaced row, filled or empty. @param {HTMLElement[]} chart @returns {HTMLElement}
 */
function leftPane(pane, chart) {
  const head = pane.children[0];
  /** @type {HTMLElement[]} */
  const rest = [];
  while (pane.children.length > 1) {
    const child = /** @type {HTMLElement} */ (pane.children[1]);
    pane.removeChild(child);
    rest.push(child);
  }
  if (!head) return pane;
  pane.appendChild(paneBody(rest, chart));
  return pane;
}

/**
 * A pane's body: the text blocks on the left, the pie on the right.
 * @param {HTMLElement[]} blocks @param {HTMLElement[]} chart @returns {HTMLElement}
 */
function paneBody(blocks, chart) {
  const body = el("div", "emig-sc-body");
  const text = el("div", "emig-sc-text");
  for (const b of blocks) text.appendChild(b);
  body.appendChild(text);
  const pie = el("div", "emig-sc-pie");
  for (const e of chart) pie.appendChild(e);
  body.appendChild(pie);
  return body;
}

/**
 * The name, then the one reading a player steers by: the pressure stage as a pill in the gauge's colour (the
 * owner, 2026-10-26: the in/out/away counts and the raw score were "functionally meaningless", and the prosperity
 * rank went the same way). A dash before the first pass.
 * @param {*} c @param {SettlementModel|null} _m @param {CardDeps} deps @returns {HTMLElement}
 */
function titleLine(c, _m, deps) {
  const line = el("div", "emig-sc-title");
  line.appendChild(el("span", "emig-city-name emig-sc-name", deps.cardTitle(c)));
  const p = c.pressure;
  const band = p ? deps.pressureBand(p.bar || 0) : null;
  const pill = el("span", "emig-sc-pill", loc("LOC_EMIG_SC_TITLE_PRESSURE", "Pressure to leave · {1_Stage}",
    band ? band.label : "\u2014"));
  if (band) {
    pill.style.borderColor = band.color;
    pill.style.color = band.color;
  }
  line.appendChild(pill);
  return line;
}

/**
 * A half's heading: the verb, what it covers, the count.
 * @param {string} title @param {string} sub @param {number} count @returns {HTMLElement}
 */
function halfHead(title, sub, count) {
  const h = el("div", "emig-sc-hh");
  const left = el("span", "emig-sc-hl");
  left.appendChild(el("span", "emig-sc-ht", title));
  left.appendChild(peopleSub(sub));
  h.appendChild(left);
  h.appendChild(el("span", "emig-sc-count", String(Math.round(count))));
  return h;
}

/** @param {string} label @returns {HTMLElement} A block with its small heading. */
function block(label) {
  const b = el("div", "emig-sc-blk");
  b.appendChild(el("div", "emig-sc-bl", label));
  return b;
}

/**
 * The left half: arrivals, who is drawn here, what would draw more.
 * @param {*} c @param {SettlementModel|null} m @param {CardDeps} deps @returns {HTMLElement}
 */
function attractHalf(c, m, deps) {
  const half = el("div", "emig-sc-half attract");
  const head = halfHead(loc("LOC_EMIG_SC_ATTRACT", "Arriving"), loc("LOC_EMIG_SC_ATTRACT_SUB", "that came here this age"),
    deps.dirTotal(c.in));
  if (c.pressure && c.pressure.closed) {
    head.children[0].appendChild(el("span", "emig-sc-closed", loc("LOC_EMIG_SC_CLOSED", "Closed to newcomers")));
  }
  half.appendChild(head);
  const drawn = block(loc("LOC_EMIG_SC_DRAWN_FROM", "Attracting from"));
  if (!m) drawn.appendChild(el("div", "emig-sc-dim", loc("LOC_EMIG_SC_NO_MODEL", "Scores appear after this turn's migration pass.")));
  else if (!m.drawnFrom.length) drawn.appendChild(el("div", "emig-sc-none", loc("LOC_EMIG_SC_DRAWN_NONE", "None")));
  else {
    for (const r of m.drawnFrom) drawn.appendChild(pullLine(r, true));
    const more = m.drawnFromCount - m.drawnFrom.length;
    if (more > 0) drawn.appendChild(el("div", "emig-sc-dim", loc("LOC_EMIG_SC_DRAWN_MORE", "and {1_Count} more", more)));
  }
  const lever = block(loc("LOC_EMIG_SC_TO_DRAW", "To attract more"));
  if (m) {
    lever.appendChild(liftLine(m));
    lever.appendChild(el("div", "emig-sc-dim", openStanceText(m.stance)));
  }
  const intake = intakeButton(c.pressure, deps);
  if (intake) lever.appendChild(intake);
  half.appendChild(paneBody([drawn, lever], deps.pieBody(c.in, true)));
  return half;
}

/**
 * The per-settlement intake switch (risks 2.4): "Close to newcomers" on an open settlement of the player's,
 * "Open to newcomers" on a closed one, in the Scaled | Civ button style. Null when the option is off or the
 * entry carries no city key (a civilization's card, a displaced-only card).
 * @param {*} p The pressure entry ({cityKey, closed}) or null. @param {CardDeps} deps @returns {HTMLElement|null}
 */
function intakeButton(p, deps) {
  const toggle = deps.toggleIntake;
  if (!toggle || !p || !p.cityKey) return null;
  const wrap = el("div", "emig-sc-intake");
  const closed = !!p.closed;
  const btn = el("div", "emig-filter-btn" + (closed ? " active" : ""),
    closed ? loc("LOC_EMIG_SC_OPEN_INTAKE", "Open to newcomers") : loc("LOC_EMIG_SC_CLOSE_INTAKE", "Close to newcomers"));
  btn.title = closed
    ? loc("LOC_EMIG_SC_OPEN_INTAKE_TIP", "Newcomers settle here again. Arrivals already on the road land next turn.")
    : loc("LOC_EMIG_SC_CLOSE_INTAKE_TIP", "Nobody settles here while it is closed: arrivals go to your next best "
      + "settlement, and this one pays no integration cost for them. Refugees with nowhere else to go are not forced in.");
  btn.addEventListener("click", () => {
    toggle(p.cityKey, !closed);
    if (deps.after) deps.after();
  });
  wrap.appendChild(btn);
  return wrap;
}

/**
 * The Arrived pane: who lives here from elsewhere, by origin, their community's standing (the enclave's stage, its
 * next step, what holds it back), and the decision on its stance when one is waiting (raised like Hasten).
 * @param {SettlementModel|null} m @param {{stage:string, next:string, blockers:string[]}|null|undefined} enclave
 * @param {CardDeps} deps @returns {HTMLElement}
 */
function arrivedPane(m, enclave, deps) {
  const pane = el("div", "emig-sc-half arrived");
  pane.appendChild(halfHead(loc("LOC_EMIG_SC_ARRIVED", "Arrived"),
    loc("LOC_EMIG_SC_ARRIVED_SUB", "from elsewhere, living here"), m ? m.newcomers.count : 0));
  pane.appendChild(paneBody(arrivedText(m, enclave, deps), compositionChart(m)));
  return pane;
}

/**
 * The Arrived pane's text: the newcomers by origin, the community's standing, the decision.
 * @param {SettlementModel|null} m @param {{stage:string, next:string, blockers:string[]}|null|undefined} enclave
 * @param {CardDeps} deps @returns {HTMLElement[]}
 */
function arrivedText(m, enclave, deps) {
  // The four blocks are always there, filled or not (the owner, 2026-10-26: keep the scaffolding "so that we can
  // actually get used to what it looks like on a consistent basis").
  const who = block(loc("LOC_EMIG_SC_NEWCOMERS", "Newcomers"));
  const mix = mixBlock(m, deps);
  const community = block(loc("LOC_EMIG_SC_COMMUNITY", "Community"));
  const decision = block(loc("LOC_EMIG_SC_DECISION", "Stance decision"));
  if (!m) {
    who.appendChild(el("div", "emig-sc-dim", loc("LOC_EMIG_SC_NO_MODEL", "Scores appear after this turn's migration pass.")));
    community.appendChild(el("div", "emig-sc-dim", "\u2014"));
    decision.appendChild(el("div", "emig-sc-dim", "\u2014"));
    return [who, mix, community, decision];
  }
  if (!m.newcomers.origins.length) who.appendChild(el("div", "emig-sc-none", loc("LOC_EMIG_SC_ARRIVED_NONE", "None")));
  else {
    who.appendChild(el("div", "emig-sc-line", m.newcomers.origins.slice(0, 5)
      .map((o) => loc("LOC_EMIG_SC_ORIGIN", "{1_Count} {2_Civ}", o.people, o.name)).join(" \u00b7 ")));
  }
  const lines = enclave ? [enclave.stage, enclave.next, ...(enclave.blockers || [])].filter((l) => !!l) : [];
  if (!lines.length) community.appendChild(el("div", "emig-sc-dim", loc("LOC_EMIG_SC_ENCLAVE_NONE", "No community large enough for an enclave yet.")));
  for (const [i, l] of lines.entries()) community.appendChild(el("div", i === 0 ? "emig-sc-line" : "emig-sc-dim", l));
  const act = m.newcomers.origins.length ? decisionBlock(m, deps) : null;
  decision.appendChild(act || el("div", "emig-sc-dim", loc("LOC_EMIG_SC_DECISION_NONE", "None waiting")));
  return [who, mix, community, decision];
}

/**
 * The Mix block: "American majority · Homogeneous", each word with its rule on hover (the Communities tab's two
 * columns, folded in here, the owner, 2026-10-26); a dash when the mix hasn't been read.
 * @param {SettlementModel|null} m @param {CardDeps} deps @returns {HTMLElement}
 */
function mixBlock(m, deps) {
  const b = block(loc("LOC_EMIG_SC_MIX", "Mix"));
  const w = m && deps.mixOf ? deps.mixOf(m.name) : null;
  if (!w) {
    b.appendChild(el("div", "emig-sc-dim", "\u2014"));
    return b;
  }
  const line = el("div", "emig-sc-line emig-sc-mixline");
  const mix = el("span", "", w.mix);
  mix.title = w.mixTip;
  line.appendChild(mix);
  if (w.character) {
    line.appendChild(el("span", "emig-sc-dim", "\u00b7"));
    const ch = el("span", "", w.character);
    ch.title = w.characterTip;
    line.appendChild(ch);
  }
  b.appendChild(line);
  return b;
}

/**
 * The Arrived pane's chart: who lives here, a slice per origin with the owner's own people among them (the owner,
 * 2026-10-26: "the Arrived section needs a current settlement composition pie chart"). Titled like the flow pies.
 * @param {SettlementModel|null} m @returns {HTMLElement[]}
 */
function compositionChart(m) {
  const title = el("div", "emig-sc-bl emig-sc-pie-t", loc("LOC_EMIG_SC_PIE_HERE", "Who lives here"));
  const rows = m ? m.newcomers.all : [];
  if (!rows.length) {
    const ph = el("div", "emig-pie-empty");
    ph.appendChild(el("span", "emig-pie-empty-t", loc("LOC_EMIG_SC_PIE_HERE_NONE", "Not counted yet")));
    return [title, ph];
  }
  const total = rows.reduce((n, r) => n + r.people, 0);
  const slices = rows.map((r) => ({
    value: r.people, people: r.people, points: r.people, countText: String(r.people), label: r.name,
    color: r.civ < 0 ? "#8c8064" : civColorByIndex(r.civ)
  }));
  const legend = legendChips(slices.map((s) => ({
    label: s.label, color: s.color, countText: s.countText, pct: total > 0 ? Math.round((s.value / total) * 100) : 0
  })));
  return [title, pieCardSlices("", slices, false), legend];
}

/**
 * The button for an enclave decision the settlement is waiting on, or null.
 * @param {SettlementModel} m @param {CardDeps} deps @returns {HTMLElement|null}
 */
function decisionBlock(m, deps) {
  const decision = deps.decide(m.city, deps.after);
  if (!decision.pending) return null;
  const act = el("div", "emig-dp-act emig-sc-decide");
  act.appendChild(deps.actionButton(loc("LOC_EMIG_SC_DECIDE", "Decide their stance"), decision.open, deps.screen));
  act.appendChild(el("div", "emig-sc-dim", loc("LOC_EMIG_SC_DECIDE_NOTE", "The community has stayed long enough; its stance is yours to set.")));
  return act;
}

/**
 * The right half: departures, the pressure gauge, who pulls, what would keep them, and the people who already
 * left with the way to bring them back (the owner, 2026-10-26: "shouldn't the hasten part be in the keep and
 * recover card?").
 * @param {*} c @param {SettlementModel|null} m @param {CardDeps} deps @returns {HTMLElement}
 */
function keepHalf(c, m, deps) {
  const half = el("div", "emig-sc-half keep");
  half.appendChild(halfHead(loc("LOC_EMIG_SC_KEEP", "Leaving"),
    loc("LOC_EMIG_SC_KEEP_SUB", "that left this age"), deps.dirTotal(c.out)));
  const pulled = block(loc("LOC_EMIG_SC_PULLED", "Pulled toward"));
  if (!m) pulled.appendChild(el("div", "emig-sc-dim", loc("LOC_EMIG_SC_NO_MODEL", "Scores appear after this turn's migration pass.")));
  else if (!m.pulledToward.length) pulled.appendChild(el("div", "emig-sc-none", loc("LOC_EMIG_SC_PULLED_NONE", "None")));
  else for (const r of m.pulledToward) pulled.appendChild(pullLine(r, false));
  const lever = block(loc("LOC_EMIG_SC_WHAT_HELPS", "What would help"));
  if (!m) lever.appendChild(el("div", "emig-sc-dim", loc("LOC_EMIG_SC_NO_MODEL", "Scores appear after this turn's migration pass.")));
  else {
    lever.appendChild(closeLine(m, c.pressure));
    lever.appendChild(el("div", "emig-sc-dim", closedStanceText(m.stance)));
  }
  half.appendChild(paneBody([pressureBlock(c.pressure, m, deps), pulled, lever], driversChart(c.pressure)));
  return half;
}

/**
 * The Leaving pane's chart: what pushes people out now, a slice per driver of the pressure (the owner, 2026-10-26:
 * a "reasons why they're leaving" pie in place of the swatches under the gauge).
 * @param {*} p Pressure {mix} or null. @returns {HTMLElement[]}
 */
function driversChart(p) {
  const title = el("div", "emig-sc-bl emig-sc-pie-t", loc("LOC_EMIG_SC_PIE_WHY", "Why they're leaving"));
  /** @type {{cause:string, label:string, share:number}[]} */
  const mix = p && Array.isArray(p.mix) ? p.mix.filter((/** @type {*} */ d) => (d.share || 0) > 0) : [];
  if (!mix.length) {
    const ph = el("div", "emig-pie-empty");
    ph.appendChild(el("span", "emig-pie-empty-t", loc("LOC_EMIG_SC_PIE_WHY_NONE", "No pressure yet")));
    return [title, ph];
  }
  const slices = mix.map((d) => ({
    value: d.share, people: d.share, points: d.share, countText: d.share + "%", label: d.label,
    color: CAUSE_PALETTE[d.cause] || CAUSE_PALETTE.other
  }));
  const legend = legendChips(slices.map((s) => ({ label: s.label + " " + s.countText, color: s.color })));
  return [title, pieCardSlices("", slices, false), legend];
}

/**
 * The pressure as a gauge with its level, its drivers, the reasons to stay, and the score's terms on hover.
 * @param {*} p Pressure {bar, flag, mix, stay, cause, dest} or null. @param {SettlementModel|null} m
 * @param {CardDeps} deps @returns {HTMLElement}
 */
function pressureBlock(p, m, deps) {
  const b = block(loc("LOC_EMIG_SC_PRESSURE", "Pressure to leave"));
  if (!p) {
    b.appendChild(el("div", "emig-sc-dim", loc("LOC_EMIG_CF_NONE_RECORDED", "none recorded")));
    return b;
  }
  const band = deps.pressureBand(p.bar || 0);
  b.appendChild(stageGauge(band, p.flag));
  // The forecast (Feature M): a projection from the gauge's own rate of rise, worded as one, never a promise.
  const fc = forecastLine(p.forecast, loc);
  if (fc) b.appendChild(el("div", "emig-sc-line emig-sc-forecast", fc));
  if (p.stalled) {
    b.appendChild(el("div", "emig-sc-dim", loc("LOC_EMIG_SC_SIEGE_STALLED",
      "Siege stalled: the besiegers aren't attacking, so the siege adds no pressure until they do.")));
  }
  b.title = loc("LOC_EMIG_SC_PRESSURE_TIP", "Pressure to leave builds each turn from the strongest pull on this settlement's "
    + "people and drains when the gap closes. When it fills, a group leaves. It is {1_Pct}% full now.",
  Math.round((p.bar || 0) * 100)) + (m ? "\n" + pressureTip(m) : "");
  return b;
}

/**
 * Five steps, lit up to the stage, and the stage's word: a reading, not a chance.
 * @param {{label:string, color:string, stage:number}} band @param {string} [flag] "at risk" / "resting".
 * @returns {HTMLElement}
 */
function stageGauge(band, flag) {
  const gauge = el("div", "emig-sc-gauge");
  const steps = el("div", "emig-sc-steps");
  for (let i = 1; i <= 5; i++) {
    const step = el("div", "emig-sc-step" + (i <= band.stage ? " on" : ""));
    if (i <= band.stage) step.style.backgroundColor = band.color;
    steps.appendChild(step);
  }
  gauge.appendChild(steps);
  const suffix = flag ? " " + loc("LOC_EMIG_CF_FLAG_PAREN", "({1_Flag})", flag).trim() : "";
  const val = el("span", "emig-sc-val", band.label + suffix);
  val.style.color = band.color;
  gauge.appendChild(val);
  return gauge;
}

/**
 * The hover: the score's own terms and the strongest pull's terms, as shares, the way the explainer shows them.
 * @param {SettlementModel|null} m @returns {string}
 */
export function pressureTip(m) {
  if (!m) return "";
  const lines = [loc("LOC_EMIG_SC_PRESSURE_TIP_SCORE", "What makes this settlement's score:")];
  lines.push("  " + shares(m.score));
  const top = m.pulledToward[0];
  if (top) {
    lines.push(loc("LOC_EMIG_SC_PRESSURE_TIP_PULL", "What pulls people toward {1_Dest}:", top.name));
    lines.push("  " + shares(top.why));
  }
  return lines.join("\n");
}

/**
 * One settlement on the other end of a pull: its name, whose it is, the pull, and the two biggest reasons.
 * @param {PullRow} r @param {boolean} inbound Whether these people are drawn here (else pulled away).
 * @returns {HTMLElement}
 */
function pullLine(r, inbound) {
  const line = el("div", "emig-sc-prow");
  line.appendChild(el("span", "emig-sc-pname", r.name));
  line.appendChild(el("span", "emig-sc-ptag " + (r.crossCiv ? "rival" : "ours"),
    r.crossCiv ? r.civ : loc("LOC_EMIG_SC_OURS", "ours")));
  line.appendChild(el("span", "emig-sc-pval " + (inbound ? "in" : "out"), signed(r.pull)));
  const why = r.why.filter((w) => w.kind === "pull").slice(0, 2).map((w) => w.label).join(", ");
  if (why) line.appendChild(el("span", "emig-sc-pwhy", why));
  line.title = shares(r.why);
  return line;
}

/**
 * A lever that says how (the owner, 2026-10-26: "Add +2 Happiness by building: Arena"): "Add", the yield chip,
 * "by building: Arena (+4)" or "here", then what it achieves in small type. A Food lever adds the game's own
 * route: a growing town sends its surplus Food to the cities it is connected to.
 * @param {{yield:string, amount:number, building:string|null, buildingGives:number}} o The prescription's option.
 * @param {string} does What it achieves. @returns {HTMLElement}
 */
function leverLine(o, does) {
  const wrap = el("div", "emig-sc-leverwrap");
  const line = el("div", "emig-sc-lever");
  line.appendChild(el("span", "emig-sc-line", loc("LOC_EMIG_SC_ADD", "Add")));
  line.appendChild(chip(o.yield, o.amount));
  line.appendChild(el("span", "emig-sc-line", o.building
    ? loc("LOC_EMIG_SC_BY_BUILDING", "by building: {1_Building} (+{2_Amount})", loc(o.building, o.building), o.buildingGives)
    : loc("LOC_EMIG_SC_HERE", "here")));
  wrap.appendChild(line);
  wrap.appendChild(el("div", "emig-sc-dim", does));
  if (o.yield === "YIELD_FOOD") {
    wrap.appendChild(el("div", "emig-sc-dim", loc("LOC_EMIG_SC_FOOD_LINK",
      "Or connect a growing town: towns send their surplus Food to the cities they are connected to.")));
  }
  return wrap;
}

/** @param {SettlementModel} m @returns {HTMLElement} The Attract half's lever, or the word for the top settlement. */
function liftLine(m) {
  const o = m.fix && m.fix.options[0];
  const dest = m.pulledToward[0];
  if (!o || !dest) return el("div", "emig-sc-line", loc("LOC_EMIG_SC_LIFT_TOP", "Already the strongest attraction in reach."));
  return leverLine(o, loc("LOC_EMIG_SC_LIFT_SHORT", "puts it ahead of {1_Dest}", dest.name));
}

/**
 * The Leaving pane's lever: the yield that closes the gap; or, when the gap is too wide for one building, what
 * drives people out (the owner, 2026-10-26: "High" pressure beside "Nobody is being pulled away" read as a
 * contradiction; the pull was there, the prescription had given up on it).
 * @param {SettlementModel} m @param {*} p The pressure entry ({mix}) or null. @returns {HTMLElement}
 */
function closeLine(m, p) {
  const dest = m.pulledToward[0];
  if (!dest) return el("div", "emig-sc-line", loc("LOC_EMIG_SC_CLOSE_NONE", "Nobody is being pulled away."));
  if (m.fix && m.fix.options.length) {
    return leverLine(m.fix.options[0], loc("LOC_EMIG_SC_CLOSE_SHORT", "closes the gap to {1_Dest}", dest.name));
  }
  const top = p && Array.isArray(p.mix) && p.mix.length ? p.mix[0] : null;
  const driver = top ? loc("LOC_EMIG_SC_DRIVER", "{1_Label} is {2_Share}% of what pushes people out.", top.label, top.share) : "";
  return el("div", "emig-sc-line", loc("LOC_EMIG_SC_CLOSE_WIDE",
    "The gap to {1_Dest} ({2_Gap}) is too wide for one building to close. {3_Driver}", dest.name, signed(dest.pull), driver).trim());
}

/**
 * The explainer's rows as signed shares, the ones that round to nothing dropped ("Fighting −0%" is noise).
 * @param {{label:string, delta:number, weight:number}[]} rows @param {number} [max] @returns {string}
 */
function shares(rows, max = 6) {
  return rows
    .filter((r) => Math.round(r.weight * 100) > 0)
    .slice(0, max)
    .map((r) => r.label + " " + (r.delta < 0 ? "−" : "+") + Math.round(r.weight * 100) + "%")
    .join("  ·  ");
}

/**
 * The stance card as a lever: slotted, or waiting for a slot, or behind its civic (the owner, 2026-10-26: "to
 * increase: research X civic, or place X policy card").
 * @param {SettlementModel["stance"]} stance @returns {string}
 */
function openStanceText(stance) {
  const pct = Math.round((Number(CONFIG.openBordersOpenness) - 1) * 100);
  const st = stance.open;
  if (st.slotted) return loc("LOC_EMIG_SC_OPEN_ON", "Pro-Immigration Stance slotted: +{1_Pct}% pull.", pct);
  if (!st.unlocked && st.civic) {
    return loc("LOC_EMIG_SC_OPEN_LOCKED", "Complete {1_Civic} to unlock the Pro-Immigration Stance: +{2_Pct}% pull.", st.civic, pct);
  }
  return loc("LOC_EMIG_SC_OPEN_READY", "Slot the Pro-Immigration Stance: +{1_Pct}% pull for all your settlements.", pct);
}

/** @param {SettlementModel["stance"]} stance @returns {string} */
function closedStanceText(stance) {
  const pct = Math.round((1 - Number(CONFIG.closedBordersRetention)) * 100);
  const st = stance.closed;
  if (st.slotted) {
    return loc("LOC_EMIG_SC_CLOSED_ON", "Anti-Immigration Stance slotted: {1_Pct}% fewer leave for other civilizations.", pct);
  }
  if (!st.unlocked && st.civic) {
    return loc("LOC_EMIG_SC_CLOSED_LOCKED",
      "Complete {1_Civic} to unlock the Anti-Immigration Stance: {2_Pct}% fewer leave for other civilizations.", st.civic, pct);
  }
  return loc("LOC_EMIG_SC_CLOSED_READY", "Slot the Anti-Immigration Stance: {1_Pct}% fewer leave for other civilizations.", pct);
}

/** The card's styles, concatenated into the dashboard stylesheet. */
export const SETTLEMENT_CSS =
  // One frame per settlement, its name on a band across the top, and air between settlements (the owner,
  // 2026-10-26: "it's hard to tell where each settlement begins and ends visually").
  ".emig-sc{padding:0 0 0.8rem;margin:0 0 1.6rem;border:0.0555rem solid rgba(201,162,76,0.45);border-top:0;" +
  "border-radius:0.5rem;background:rgba(201,162,76,0.04);}" +
  ".emig-sc + .emig-sc{margin-top:0;}" +
  ".emig-sc-title{display:flex;flex-direction:row;align-items:baseline;gap:1rem;margin:0 0 0.8rem;" +
  "padding:0.45rem 1rem;border-radius:0.5rem 0.5rem 0 0;border-top:0.0555rem solid rgba(201,162,76,0.45);" +
  "background:linear-gradient(90deg,rgba(201,162,76,0.28),rgba(201,162,76,0.06));}" +
  ".emig-sc-name{margin-bottom:0;font-size:var(--dg-fs-140);color:#f7e3b0;}" +
  ".emig-sc-cols{display:flex;flex-direction:row;align-items:stretch;gap:1.2rem;padding:0 0.8rem;}" +
  ".emig-sc-col{flex:0 0 41.5%;display:flex;flex-direction:column;gap:1rem;min-width:0;}" +
  ".emig-sc-col > .emig-sc-half{flex:1 1 auto;}" +
  ".emig-sc-half.ledger{flex:0 0 13%;border-left:0.2rem solid rgba(201,162,76,0.6);overflow:hidden;}" +
  ".emig-sc-ledger-t{margin-bottom:0.35rem;}" +
  ".emig-dp-row .emig-sc-text{display:flex;flex-direction:column;align-items:stretch;gap:0.2rem;}" +
  ".emig-sc-pill{margin-left:auto;font-size:var(--dg-fs-85);font-weight:bold;padding:0.05rem 0.7rem;border-radius:0.8rem;" +
  "border:0.0555rem solid rgba(229,210,172,0.4);color:#e5d2ac;white-space:nowrap;}" +
  ".emig-sc-body{display:flex;flex-direction:row;align-items:flex-start;gap:1rem;}" +
  ".emig-sc-text{flex:1 1 0;min-width:0;}" +
  ".emig-sc-pie{flex:0 0 auto;width:13rem;display:flex;flex-direction:column;align-items:center;}" +
  ".emig-sc-pie .emig-pie-c,.emig-sc-pie .emig-pie-empty{width:10.5rem;height:10.5rem;}" +
  ".emig-sc-pie .emig-pie-leg{justify-content:center;}" +
  ".emig-sc-pie .emig-city-why{text-align:center;}" +
  ".emig-sc-pie-t{align-self:center;margin-bottom:0.3rem;}" +
  // A light wash behind each side (the owner, 2026-10-26): green for the people arriving and arrived, red for the
  // people leaving and left, over the panes' own dark gradient.
  ".emig-sc-half.arrived{border-left:0.2rem solid rgba(127,208,138,0.4);" +
  "background:linear-gradient(180deg,rgba(127,208,138,0.10),rgba(127,208,138,0.04));}" +
  ".emig-sc-half.left{border-left:0.2rem solid rgba(224,138,127,0.4);" +
  "background:linear-gradient(180deg,rgba(224,138,127,0.10),rgba(224,138,127,0.04));}" +
  ".emig-sc-decide{margin-top:0.1rem;align-items:flex-start;}" +
  ".emig-sc-intake{margin-top:0.35rem;}" +
  ".emig-sc-closed{margin-left:0.5rem;padding:0.05rem 0.4rem;border:1px solid rgba(194,91,84,0.9);border-radius:0.2rem;" +
  "color:#e8b4ae;font-size:0.72rem;}" +
  ".emig-sc-half.arrived .emig-sc-blk:first-child{margin-top:0;}" +
  ".emig-sc-half{flex:0 0 auto;display:flex;flex-direction:column;align-items:stretch;min-width:0;" +
  "padding:0.5rem 0.7rem 0.4rem;border-radius:0.35rem;background:linear-gradient(180deg,rgba(20,24,34,0.45),rgba(8,10,16,0.35));" +
  "border:0.0555rem solid rgba(201,162,76,0.18);}" +
  ".emig-sc-half.attract{border-left:0.2rem solid rgba(127,208,138,0.7);" +
  "background:linear-gradient(180deg,rgba(127,208,138,0.10),rgba(127,208,138,0.04));}" +
  ".emig-sc-half.keep{border-left:0.2rem solid rgba(224,138,127,0.7);" +
  "background:linear-gradient(180deg,rgba(224,138,127,0.10),rgba(224,138,127,0.04));}" +
  ".emig-sc-hh{display:flex;flex-direction:row;justify-content:space-between;align-items:baseline;margin-bottom:0.3rem;}" +
  ".emig-sc-hl{display:inline-flex;align-items:baseline;gap:0.5rem;}" +
  ".emig-sc-ht{font-size:var(--dg-fs-95);text-transform:uppercase;letter-spacing:0.06rem;color:#f3c34c;}" +
  ".emig-sc-hs{font-size:var(--dg-fs-85);display:inline-flex;align-items:center;color:#e5d2ac;}" +
  ".emig-sc-hs-w{opacity:0.7;}" + // the words only: opacity on the glyph's span loses its tint
  ".emig-sc-hs-i{display:inline-block;width:1.3em;height:1.3em;margin:0 0.2em 0 0.05em;position:relative;top:-0.05em;" +
  "background-size:contain;background-repeat:no-repeat;background-position:center;}" +
  ".emig-sc-count{color:#f0dca8;font-weight:bold;font-size:var(--dg-fs-120);}" +
  // Three text roles throughout the card: a heading (.emig-sc-bl), a line a player acts on (.emig-sc-line), and
  // context under it (.emig-sc-dim).
  ".emig-sc-dim{font-size:var(--dg-fs-85);color:#cbb994;opacity:0.7;line-height:1.35;}" +
  ".emig-sc-none{font-size:var(--dg-fs-105);font-weight:bold;color:#8c8064;}" +
  ".emig-sc-half .emig-city-why{margin-top:0.1rem;font-size:var(--dg-fs-85);color:#cbb994;opacity:0.7;}" +
  ".emig-sc-half .emig-pie-leg-i{font-size:var(--dg-fs-85);color:#e5d2ac;}" +
  ".emig-sc-blk{margin-top:0.55rem;}" +
  ".emig-sc-bl{font-size:var(--dg-fs-72);text-transform:uppercase;letter-spacing:0.05rem;opacity:0.75;color:#cbb994;" +
  "margin-bottom:0.2rem;}" +
  ".emig-sc-line{font-size:var(--dg-fs-95);line-height:1.35;color:#e5d2ac;}" +
  ".emig-sc-mixline{display:flex;flex-direction:row;align-items:baseline;gap:0.45rem;flex-wrap:wrap;}" +
  ".emig-sc-leverwrap{display:flex;flex-direction:column;gap:0.1rem;}" +
  ".emig-sc-lever{display:flex;flex-direction:row;align-items:baseline;gap:0.5rem;flex-wrap:wrap;}" +
  ".emig-sc-lever .emig-y{font-size:var(--dg-fs-105);}" +
  ".emig-sc-gauge{display:flex;flex-direction:row;align-items:center;gap:0.6rem;margin:0.1rem 0 0.25rem;}" +
  ".emig-sc-steps{display:flex;flex-direction:row;gap:0.2rem;flex:1 1 auto;height:0.7rem;}" +
  ".emig-sc-step{flex:1 1 0;height:100%;border-radius:0.2rem;background:rgba(229,210,172,0.12);}" +
  ".emig-sc-val{flex:0 0 auto;font-size:var(--dg-fs-95);font-weight:bold;white-space:nowrap;}" +
  ".emig-sc-prow{display:flex;flex-direction:row;align-items:baseline;gap:0.5rem;font-size:var(--dg-fs-95);" +
  "line-height:1.4;}" +
  ".emig-sc-pname{color:#f0dca8;font-weight:bold;}" +
  ".emig-sc-trow{display:flex;flex-direction:row;justify-content:space-between;align-items:baseline;gap:0.6rem;" +
  "font-size:var(--dg-fs-95);line-height:1.45;border-bottom:0.0555rem solid rgba(229,210,172,0.1);}" +
  ".emig-sc-trow.total{border-bottom:0;border-top:0.0555rem solid rgba(201,162,76,0.5);margin-top:0.2rem;}" +
  ".emig-sc-trow.has{cursor:pointer;}" +
  ".emig-sc-trow .emig-sc-tlbl{flex:1 1 auto;}" +
  ".emig-sc-tslot{flex:0 0 1.5rem;width:1.5rem;height:1.3rem;display:inline-flex;align-items:center;}" +
  ".emig-sc-tpm{width:1.3rem;height:1.3rem;}" +
  ".emig-sc-ledger-t{cursor:pointer;}" +
  // The lines under a row: the row's own layout and size, a step in, the gold dimmed (the owner, 2026-10-26).
  ".emig-sc-tsub{display:flex;flex-direction:column;width:100%;padding:0 0 0.25rem 0;}" +
  ".emig-sc-tsub-row{display:flex;flex-direction:row;justify-content:space-between;align-items:baseline;gap:0.6rem;" +
  "font-size:var(--dg-fs-95);line-height:1.45;padding-left:1.5rem;min-width:0;" +
  "border-bottom:0.0555rem solid rgba(229,210,172,0.06);}" +
  ".emig-sc-tsub-row .emig-sc-tlbl{color:#a89a78;flex:1 1 auto;min-width:0;white-space:normal;display:block;}" +
  ".emig-sc-tsub-row .emig-sc-tval{opacity:0.7;}" +
  ".emig-sc-tnote{opacity:0.7;margin-left:0.3em;}" +
  ".emig-sc-trow.total .emig-sc-tlbl{color:#f0dca8;font-weight:bold;}" +
  ".emig-sc-trow.total .emig-sc-tval{font-size:var(--dg-fs-105);}" +
  ".emig-sc-tlbl{color:#e5d2ac;}" +
  ".emig-sc-tval{font-weight:bold;flex:0 0 auto;white-space:nowrap;}" +
  ".emig-sc-tlbl{min-width:0;}" +
  ".emig-sc-tval.in{color:#7fd08a;}" +
  ".emig-sc-tval.out{color:#e08a7f;}" +
  ".emig-sc-ptag{font-size:var(--dg-fs-72);text-transform:uppercase;letter-spacing:0.04rem;padding:0 0.35rem;" +
  "border-radius:0.2rem;border:0.0555rem solid rgba(201,162,76,0.35);opacity:0.85;}" +
  ".emig-sc-ptag.rival{color:#e0a07a;border-color:rgba(224,160,122,0.5);}" +
  ".emig-sc-pval{font-weight:bold;}" +
  ".emig-sc-pval.in{color:#7fd08a;}" +
  ".emig-sc-pval.out{color:#e08a7f;}" +
  ".emig-sc-pwhy{opacity:0.65;font-size:var(--dg-fs-85);overflow:hidden;white-space:nowrap;}" +
  // The displaced block ("Left") inside the Leaving half opens with the half's own heading style.
  ".emig-dp-row .emig-sc-hh{margin-top:0.2rem;margin-bottom:0.2rem;}" +
  "";
