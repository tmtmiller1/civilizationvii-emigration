// displaced-render.mjs
//
// The Settlements tab's displaced rows drawn against a fake DOM (emigration-city-flows.js placing
// emigration-displaced-view.js): the one-line intro above the cards, a column inside a settlement's own card beside
// its pies, a card of its own for a settlement with people away but no movement, the yield chips named for the
// settlements (yield names standing in for icons off-engine, a price unsigned), and the buttons at the foot. Added
// after the first in-game draw of the displaced table stopped at its heading (2026-10-26): a price chip named a
// yield the name table didn't know.

import assert from "node:assert/strict";

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.style = {};
    this.title = "";
    this.attributes = {};
    this.handlers = {};
    this.parentNode = null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parentNode = null;
    return child;
  }

  insertBefore(child, ref) {
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) return this.appendChild(child);
    child.parentNode = this;
    this.children.splice(i, 0, child);
    return child;
  }

  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }

  getAttribute(k) {
    return k in this.attributes ? this.attributes[k] : null;
  }

  hasAttribute(k) {
    return k in this.attributes;
  }

  addEventListener(name, fn) {
    this.handlers[name] = fn;
  }

  getContext() {
    return null; // no canvas off-engine; the pie draws nothing and the legend still lists the slices
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  get classList() {
    const self = this;
    return {
      toggle(name, force) {
        const has = self.className.split(" ").includes(name);
        const want = typeof force === "boolean" ? force : !has;
        if (want && !has) self.className = (self.className + " " + name).trim();
        if (!want && has) self.className = self.className.split(" ").filter((c) => c !== name).join(" ");
      }
    };
  }

  querySelector(sel) {
    const cls = sel.replace(/^\./, "");
    const all = [];
    const walk = (n) => { for (const c of n.children) { all.push(c); walk(c); } };
    walk(this);
    return all.find((n) => n.className.split(" ").includes(cls)) || null;
  }
}

const head = new FakeElement("head");
globalThis.document = { head, createElement: (tag) => new FakeElement(tag), getElementById: () => null };
globalThis.window = { document: globalThis.document };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.Locale = { compose: (s) => s };
const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { renderCityFlows } = await import("/emigration/ui/emigration-city-flows.js");
const { prosperityLedger } = await import("/emigration/ui/emigration-settlement-card.js");
CONFIG.callHomeEnabled = true;
CONFIG.homecomingEnabled = true;
CONFIG.callHomeOfferWhenCalm = true;

function collect(node, out = []) {
  out.push(node);
  for (const c of node.children) collect(c, out);
  return out;
}
const text = (node) => collect(node).map((n) => n.textContent).join("");
const byClass = (node, cls) => collect(node).filter((n) => n.className.split(" ").includes(cls));

const rome = {
  home: "Rome", held: true, total: 14, since: 71,
  internal: [{ from: "Ostia", points: 9, tile: { YIELD_FOOD: 1, YIELD_GOLD: 2 } }, { from: "Ravenna", points: 3, tile: null }],
  abroad: [{ from: "Athens", host: 4, civ: "Greece", points: 2 }],
  lost: [{ type: "IMPROVEMENT_FARM", count: 2 }],
  wait: { calm: 5, needed: 3, every: 4, nextIn: 2, allIn: 34, batch: 2 },
  tile: { perTile: { YIELD_FOOD: 2.4, YIELD_PRODUCTION: 1, YIELD_CULTURE: 0.5 }, total: 3.9 },
  hasten: { n: 3, gold: 312, influence: 62, cooldown: 0 },
  abroadCall: { n: 2, gold: 255, influence: 51, chance: 0.18, expected: 0.4, perGold: 708, perInfluence: 142, cooldown: 3 }
};
const capua = { home: "Capua", held: false, total: 2, since: 80, internal: [{ from: "Ostia", points: 2, tile: null }],
  abroad: [], lost: [], wait: null, tile: null, hasten: null, abroadCall: null };
const dir = { civs: [], causes: {} };
const cities = [{ name: "Rome", town: false, in: dir, out: dir, pressure: null }, { name: "Ostia", town: true, in: dir, out: dir, pressure: null }];

const body = new FakeElement("div");
renderCityFlows(body, { kind: "cityflows", cities, displaced: [rome, capua], pid: 0, costs: { gold: 10, happiness: 3.7 }, screen: null,
  models: new Map() });

const intro = byClass(body, "emig-dp-intro");
assert.equal(intro.length, 1, "the intro sits above the cards");
assert.equal(text(intro[0]), "Newcomers cost 10 Gold and 3.7 Happiness a turn while they settle in."
  + "Stop displaced-people reminders", "one line: the cost and the reminder switch");
const cards = byClass(body, "emig-city-card");
assert.deepEqual(cards.map((c) => byClass(c, "emig-city-name")[0].textContent), ["Rome (City)", "Ostia (Town)", "Capua"],
  "a card per settlement, cities and towns, then a card for a lost settlement with people away");
const rows = byClass(body, "emig-dp-row");
assert.equal(rows.length, 3, "a Left pane on every card: Rome's and Capua's filled, Ostia's the empty one");
assert.equal(byClass(body, "emig-dp-row-empty").length, 1);
assert.deepEqual(cards[0].children.map((c) => c.className), ["emig-sc-title", "emig-sc-cols"], "Rome's card: the title band, then the columns");
const cols = cards[0].children[1];
assert.deepEqual(cols.children.map((c) => c.className), ["emig-sc-col", "emig-sc-half ledger", "emig-sc-col"],
  "the arrivals' column, the prosperity ledger standing between, the departures' column");
assert.equal(text(cols.children[1]), "Prosperity scoreScores appear after this turn's migration pass.Total\u2014",
  "the ledger before the first pass: its heading, the waiting words, a dashed total");
assert.deepEqual(cols.children[0].children.map((c) => c.className), ["emig-sc-half attract", "emig-sc-half arrived"], "Arriving over Arrived");
assert.deepEqual(cols.children[2].children.map((c) => c.className), ["emig-sc-half keep", "emig-sc-half left emig-dp-row"], "Leaving over Left");
assert.deepEqual(cards[1].children[1].children[2].children.map((c) => c.className), ["emig-sc-half keep", "emig-sc-half left emig-dp-row emig-dp-row-empty"]);
assert.equal(text(cards[0].children[0]), "Rome (City)Pressure to leave · \u2014",
  "the title band: the name and the pressure stage, a dash before the first pass");
assert.equal(text(cards[1].children[0]), "Ostia (Town)Pressure to leave · \u2014");
const attract = cols.children[0].children[0];
assert.deepEqual(attract.children.map((c) => c.className), ["emig-sc-hh", "emig-sc-body"], "a head, then the body");
assert.deepEqual(attract.children[1].children.map((c) => c.className), ["emig-sc-text", "emig-sc-pie"], "text left, the pie right");
assert.match(text(attract), /^Arriving\(that came here this age\)0Attracting fromScores appear after this turn's migration pass\.To attract moreWhere they came fromNo arrivals yet$/,
  "the Arriving pane without a model: the waiting words, then the titled pie's placeholder");
const keep = cols.children[2].children[0];
assert.match(text(keep), /^Leaving\(that left this age\)0Pressure to leavenone recordedPulled towardScores appear after this turn's migration pass\.What would helpScores appear/,
  "Leaving: the gauge, Pulled toward, What would help; the score's tally lives in the strip above");
assert.match(text(keep), /Why they're leavingNo pressure yet$/, "the Leaving pane ends with the drivers pie's placeholder");
assert.equal(byClass(cards[0], "emig-pie-empty").length, 4, "a placeholder pie in every pane");
assert.equal(text(cols.children[0].children[1]), "Arrived(from elsewhere, living here)0"
  + "NewcomersScores appear after this turn's migration pass.Mix\u2014Community\u2014Stance decision\u2014Who lives hereNot counted yet",
  "Arrived: its four blocks, filled or dashed, then the composition pie's title and placeholder");
assert.deepEqual(byClass(cards[0], "emig-sc-pie-t").map((t) => t.textContent),
  ["Where they came from", "Who lives here", "Why they're leaving", "Where they went"], "four titled pies a card, one a pane, column by column");
assert.equal(text(cards[1].children[1].children[2].children[1]), "Left(that went elsewhere)0NonePer returnee, a turn\u2014"
  + "Free homecoming\u2014Bring back now forGold \u2014Influence \u2014Where they wentNo departures yet",
  "an empty Left pane keeps the whole frame, dashed, with the departures pie beside it");
assert.equal(byClass(cards[1], "emig-dp-paybtn").filter((b) => b.className.includes("off")).length, 2, "its two buttons greyed");
const row = rows[0];
assert.equal(row.attributes["data-away"], "14");
assert.deepEqual(row.children.map((c) => c.className), ["emig-sc-hh", "emig-sc-body"], "the heading, then text beside the pie");
const rowText = row.children[1].children[0];
assert.deepEqual(rowText.children.map((c) => c.className), ["emig-sc-line", "emig-sc-dim", "emig-dp-col c-worth", "emig-dp-bottom"],
  "where they are, the notes, the yields, then the homecoming and the buttons");
assert.equal(text(row.children[0]), "Left(that went elsewhere)14", "the same heading style as the half's own");
assert.equal(rowText.children[0].textContent, "9 in Ostia, 3 in Ravenna, 2 in Athens (Greece)");
assert.equal(rowText.children[1].textContent, "since turn 71 \u00b7 Lost: Farm ×2 (rebuilt first)");
assert.equal(rowText.children[2].children[0].textContent, "Per returnee, a turn");
assert.deepEqual(rowText.children[3].children.map((c) => c.className.replace("emig-dp-col ", "")), ["c-free", "c-act"]);
// Yield chips, each row named for a settlement: off-engine the yield's name stands in for the icon; Ravenna's tile
// is unread, so it has no "loses" row and the net is against Ostia's tile alone.
const yrows = byClass(row, "emig-dp-yrow");
assert.deepEqual(yrows.map((r) => r.children[0].textContent), ["Rome gains", "Ostia loses", "net per person"]);
assert.equal(text(yrows[0]), "Rome gainsFood +2Production +1Culture +1");
assert.equal(text(yrows[1]), "Ostia losesGold +2Food +1");
assert.equal(text(yrows[2]), "net per personGold −2Food +1Production +1");
assert.ok(byClass(row, "neg").length === 1, "a loss is marked");
assert.ok(byClass(row, "c-worth")[0].title.startsWith("each returnee works a Rome tile"), "the prose is the hover");
assert.equal(text(byClass(row, "c-free")[0]), "Free homecomingnext 2 in 2 turnsall in about 34 turns");
const act = byClass(row, "c-act")[0];
assert.equal(byClass(act, "emig-dp-paybtn").length, 2, "two prices as buttons, Gold and Influence; the call abroad is cooling down");
assert.deepEqual(byClass(act, "emig-dp-paybtn").map(text), ["Gold 312", "Influence 62"], "each button is the icon and the cost, unsigned");
assert.equal(byClass(act, "emig-dp-note").length, 1, "and the call abroad says when it is available again");
assert.match(text(act), /Bring 3 back now for/);
assert.match(text(act), /instead of over the next 6 turns/);
assert.match(text(act), /Available again in 3 turns\.$/, "the call abroad, cooling down, shows no prices");
// A settlement no longer held: the count, where they are, and that they stay; nothing to buy.
assert.match(text(rows[2]), /Capua is no longer yours/);
assert.equal(byClass(rows[2], "c-act").length, 0);
assert.equal(byClass(rows[2], "emig-dp-yrow").length, 0);
assert.equal(rows[2].children[1].children[0].children.length, 2, "where they are and the notes; nothing to buy");

// Nobody displaced: the settlement cards keep their frame, the intro its switch, the Left panes their dashes.
const quiet = new FakeElement("div");
renderCityFlows(quiet, { kind: "cityflows", cities, displaced: [], pid: 0, costs: null, screen: null, models: new Map() });
assert.equal(byClass(quiet, "emig-dp-intro").length, 1, "the intro stays");
assert.match(text(byClass(quiet, "emig-dp-intro")[0]), /^No newcomers are settling in right now\./);
assert.equal(byClass(quiet, "emig-dp-row-empty").length, 2);
assert.equal(byClass(quiet, "emig-city-card").length, 2);
assert.equal(byClass(quiet, "emig-sc-half").length, 10, "every card keeps its four panes and the ledger between them");
// Every civilization's cards (the Show switch) never carry displaced columns.
const all = new FakeElement("div");
renderCityFlows(all, { kind: "pies", cities: [], displaced: [rome] });
assert.equal(byClass(all, "emig-dp-row").length, 0);

console.log("displaced-render: ok");

// The ledger's accordion: a row with lines under it opens on click, the title opens and closes them all.
const fakeModel = { ledger: [
  { key: "economy", label: "Economy", delta: 4.2, kind: "pull", sub: [{ label: "Food", delta: 3 }, { label: "Gold", delta: 1.2 }] },
  { key: "population", label: "Population size", delta: -6, kind: "push", sub: [{ label: "Population size", note: "6 people" }] },
  { key: "celebration", label: "Celebrations", delta: 0, kind: "push", sub: [{ label: "Celebrations", note: "no celebration running" }] }
] };
const ledger = prosperityLedger(fakeModel);
const lrows = byClass(ledger, "emig-sc-trow").filter((r) => !r.className.includes("total"));
assert.equal(lrows.length, 3);
assert.ok(lrows.every((r) => r.className.includes("has")), "every row has lines under it");
assert.ok(lrows.every((r) => r.children[0].children[0] && r.children[0].children[0].tagName === "fxs-minus-plus"),
  "each opens with the game's own plus/minus");
const subs = byClass(ledger, "emig-sc-tsub");
assert.deepEqual(subs.map((s) => s.style.display), ["none", "none", "none"], "closed to begin with");
lrows[0].handlers.click();
assert.equal(subs[0].style.display, "flex", "a click opens the row");
assert.equal(text(subs[0]), "Food+3.0Gold+1.2");
assert.equal(text(subs[1]), "Population size(6 people)", "a note sits in parentheses after the label (the gap is a margin)");
assert.equal(lrows[0].children[0].children[0].attributes["data-type"], "minus", "the plus becomes a minus");
lrows[0].children[0].children[0].handlers["action-activate"]();
assert.equal(subs[0].style.display, "none", "and the game's plus/minus closes it again");
assert.equal(lrows[0].children[0].children[0].attributes["data-type"], "plus");
byClass(ledger, "emig-sc-ledger-t")[0].handlers.click();
assert.deepEqual(subs.map((s) => s.style.display), ["flex", "flex", "flex"], "the title opens them all");
byClass(ledger, "emig-sc-ledger-t")[0].handlers.click();
assert.deepEqual(subs.map((s) => s.style.display), ["none", "none", "none"], "and closes them all");
assert.equal(text(byClass(ledger, "emig-sc-trow").filter((r) => r.className.includes("total"))[0]), "Total\u22121.8");
