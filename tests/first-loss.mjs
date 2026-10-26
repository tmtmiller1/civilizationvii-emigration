// first-loss.mjs
//
// The first-loss page (roadmap §33): a tile-loss event with the page on and no flag shows it once and sets the flag;
// a counter-only pass doesn't; the flag set, the page off, or sample data never shows it; the pass's notice is
// skipped on the showing pass; the body fills every placeholder for an internal and a cross-border loss, with and
// without a lost tile and a fix line; "Open the Emigration screen" opens the Settlements tab, "Got it" doesn't.

import assert from "node:assert/strict";

const KV = {};
globalThis.Configuration = {
  getGame: () => ({ getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Game = { turn: 12 };
globalThis.Locale = { compose: (k) => k };

const { CONFIG } = await import("/emigration/ui/emigration-config.js");
const { firstLossDue, firstLossView, maybeShowFirstLoss, firstLossFlag, markFirstLoss } =
  await import("/emigration/ui/emigration-first-loss.js");

const tileLoss = (over = {}) => ({ cause: "unhappiness", srcOwner: 1, srcName: "Cilakofa", destName: "Washington",
  destOwner: 1, crossCiv: false, people: 3, points: 1, reasons: [], tile: true, ...over });
const counterLoss = () => tileLoss({ tile: false });
const quiet = { sample: () => false, flag: () => null };

// Due only for a tile loss, with the page on, outside sample data, and never shown before.
{
  CONFIG.firstLossPage = true;
  assert.equal(firstLossDue([counterLoss()], quiet), null, "a counter decrement is too quiet to teach from");
  assert.equal(firstLossDue([counterLoss(), tileLoss({ srcName: "Shomron" })], quiet).srcName, "Shomron",
    "the largest tile loss, not the largest loss");
  assert.equal(firstLossDue([tileLoss()], { ...quiet, sample: () => true }), null, "never on sample data");
  assert.equal(firstLossDue([tileLoss()], { ...quiet, flag: () => ({ turn: 3, city: "x" }) }), null, "never twice");
  CONFIG.firstLossPage = false;
  assert.equal(firstLossDue([tileLoss()], quiet), null, "off by default");
  CONFIG.firstLossPage = true;
}

// The body: every placeholder filled, internal and cross-border, with and without the tile and the fix.
{
  const full = firstLossView(tileLoss({ crossCiv: true, destOwner: 2 }),
    { tile: "Farm", civ: "Roman", why: "Why there: richer, nearby", fix: "What would stop it: +2 Happiness here" });
  assert.equal(full.title, "People Have Left Cilakofa");
  assert.equal(full.eyebrow, "Emigration");
  const paras = full.body.split("\n\n");
  assert.equal(paras.length, 4);
  assert.equal(paras[0], "3 people left Cilakofa this turn. They tore down the Farm they worked on the way out; the plot is yours to settle again.");
  assert.equal(paras[1], "They have gone to Washington, a settlement of the Roman, because of Unhappiness. Why there: richer, nearby");
  assert.match(paras[2], /^People who stay inside your civilization come home on their own once Cilakofa has been calm/);
  assert.match(paras[3], /^The Emigration screen/);
  assert.deepEqual(full.details, ["What would stop it: +2 Happiness here"]);
  assert.deepEqual(full.choices.map((c) => [c.id, c.label]), [["open", "Open the Emigration screen"], ["ok", "Got it"]]);
  assert.equal(full.dismissId, "ok");
  assert.equal(full.quote, undefined, "no quote: instruction, not narrative");
  const bare = firstLossView(tileLoss(), {});
  const bp = bare.body.split("\n\n");
  assert.equal(bp[0], "3 people left Cilakofa this turn.");
  assert.equal(bp[1], "They have gone to Washington, because of Unhappiness.");
  assert.deepEqual(bare.details, []);
  assert.ok(!bare.body.includes("{"), "no placeholder left unfilled");
}

// Showing: once, the flag set, the Chronicle entry, the choices, and the notice skipped.
{
  const shown = [];
  const chron = [];
  let opened = 0;
  const deps = { sample: () => false, facts: () => ({ tile: "Farm" }), show: (v, on) => { shown.push(v); on("open"); },
    open: () => { opened += 1; }, chronicle: (c) => { chron.push(c); return true; } };
  assert.equal(firstLossFlag(), null);
  assert.equal(maybeShowFirstLoss([tileLoss()], 1, deps), true, "shown, so the caller skips its notice");
  assert.equal(shown.length, 1);
  assert.equal(opened, 1, "Open the Emigration screen opens it");
  assert.deepEqual(firstLossFlag(), { turn: 12, city: "Cilakofa" }, "the flag carries the turn and settlement");
  assert.equal(JSON.parse(KV.EmigrationFirstLoss_v1).city, "Cilakofa", "and lives in the save");
  assert.equal(chron.length, 1);
  assert.equal(chron[0].title, "The First to Leave");
  assert.equal(chron[0].body, "3 people left Cilakofa this turn. They tore down the Farm they worked on the way out; the plot is yours to settle again.");
  assert.equal(maybeShowFirstLoss([tileLoss()], 1, deps), false, "never again in this game");
  assert.equal(shown.length, 1);
  // "Got it" opens nothing.
  markFirstLoss(0, "");
  const quietDeps = { ...deps, flag: () => null, show: (/** @type {*} */ _v, /** @type {*} */ on) => on("ok") };
  assert.equal(maybeShowFirstLoss([tileLoss()], 1, quietDeps), true);
  assert.equal(opened, 1, "Got it opens nothing");
}

// Switching it off never clears the flag; switching on later shows at the next tile loss unless already shown.
{
  CONFIG.firstLossPage = false;
  assert.equal(firstLossDue([tileLoss()], { sample: () => false, flag: () => null }), null);
  CONFIG.firstLossPage = true;
  assert.ok(firstLossDue([tileLoss()], { sample: () => false, flag: () => null }));
  CONFIG.firstLossPage = false;
}

console.log("first-loss harness passed");
