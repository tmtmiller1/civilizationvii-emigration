// treatment-policies-data.mjs
//
// Data gate for the policy cards (3.6.0: ten cards). Each live card is declared in its age's policy file
// (Types row, Traditions row in POLICY_CULTURE_SLOT with its age, a civic unlock), its native modifiers exist in
// the always-loaded game-effects file, its icon is mapped, its name and description have en_us text, and the
// scripted readers in emigration-borders.js list it. The stance cards each carry a slot grant that's withheld while
// the opposite stance is slotted. The retired cards of 3.5.0 keep their rows (for saves that hold them) but have no
// unlock, so a new game never offers them.
//
// Run as a plain node script: `node ./tests/treatment-policies-data.mjs`.

import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const effects = read("data/emigration-policies-gameeffects.xml");
const icons = read("data/emigration-policy-icons.xml");
const en = read("text/en_us/ModText.xml");
const borders = read("ui/emigration-borders.js");

/** Each live card: family, age, unlock node, native modifiers, LOC stem for the name and description. */
const CARDS = [
  ["OPEN_BORDERS", "ANTIQUITY", "NODE_CIVIC_AQ_MAIN_CITIZENSHIP", ["MOD_EMIG_OPEN_BORDERS_INFLUENCE_AQ", "MOD_EMIG_STANCE_SLOT_OPEN_AQ"], "OPEN_BORDERS", "DESC"],
  ["OPEN_BORDERS", "EXPLORATION", "NODE_CIVIC_EX_MAIN_ECONOMICS", ["MOD_EMIG_OPEN_BORDERS_INFLUENCE_EX", "MOD_EMIG_STANCE_SLOT_OPEN_EX"], "OPEN_BORDERS", "DESC_EX"],
  ["OPEN_BORDERS", "MODERN", "NODE_CIVIC_MO_MAIN_SOCIAL_QUESTION", ["MOD_EMIG_OPEN_BORDERS_INFLUENCE_MO", "MOD_EMIG_STANCE_SLOT_OPEN_MO"], "OPEN_BORDERS", "DESC_MO"],
  ["CLOSED_BORDERS", "ANTIQUITY", "NODE_CIVIC_AQ_MAIN_CITIZENSHIP", ["MOD_EMIG_CLOSED_BORDERS_INFLUENCE_AQ", "MOD_EMIG_CLOSED_BORDERS_PRODUCTION_AQ", "MOD_EMIG_STANCE_SLOT_CLOSED_AQ"], "CLOSED_BORDERS", "DESC"],
  ["CLOSED_BORDERS", "EXPLORATION", "NODE_CIVIC_EX_MAIN_ECONOMICS", ["MOD_EMIG_CLOSED_BORDERS_INFLUENCE_EX", "MOD_EMIG_CLOSED_BORDERS_PRODUCTION_EX", "MOD_EMIG_STANCE_SLOT_CLOSED_EX"], "CLOSED_BORDERS", "DESC_EX"],
  ["CLOSED_BORDERS", "MODERN", "NODE_CIVIC_MO_MAIN_SOCIAL_QUESTION", ["MOD_EMIG_CLOSED_BORDERS_INFLUENCE_MO", "MOD_EMIG_CLOSED_BORDERS_PRODUCTION_MO", "MOD_EMIG_STANCE_SLOT_CLOSED_MO"], "CLOSED_BORDERS", "DESC_MO"],
  ["TALENT", "EXPLORATION", "NODE_CIVIC_EX_MAIN_INSPIRATION", ["MOD_EMIG_TALENT_YIELD_EX"], "TALENT", "DESC"],
  ["TALENT", "MODERN", "NODE_CIVIC_MO_MAIN_MODERNIZATION", ["MOD_EMIG_TALENT_YIELD_MO"], "TALENT", "DESC_MO"],
  ["CONSULAR", "EXPLORATION", "NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE", [], "CONSULAR", "DESC"],
  ["CONSULAR", "MODERN", "NODE_CIVIC_MO_MAIN_POLITICAL_THEORY", [], "CONSULAR", "DESC"]
];

/** The retired families and the ages they existed in; their rows stay, their unlocks don't. */
const RETIRED = [
  ["PROTECT", ["ANTIQUITY", "EXPLORATION", "MODERN"]],
  ["SUSPECT", ["ANTIQUITY", "EXPLORATION", "MODERN"]],
  ["ASYLUM", ["EXPLORATION", "MODERN"]],
  ["CULTPULL", ["EXPLORATION", "MODERN"]],
  ["TRADEPULL", ["EXPLORATION", "MODERN"]]
];

/** @param {string} xml @param {string} name @returns {string} The table's body. */
function table(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  assert.ok(m, `no <${name}> table`);
  return m[1];
}

/** @param {string} body @param {string} attr @param {string} value @returns {string|null} The row holding attr="value". */
function rowFor(body, attr, value) {
  const m = body.match(new RegExp(`<Row[^>]*\\b${attr}="${value}"[^>]*/>`));
  return m ? m[0] : null;
}

const files = {};
for (const age of ["ANTIQUITY", "EXPLORATION", "MODERN"]) files[age] = read(`data/emigration-policies-${age.toLowerCase()}.xml`);

let liveUnlocks = 0;
for (const [family, age, node, modifiers, loc, descKey] of CARDS) {
  const type = `TRADITION_EMIG_${family}_${age}`;
  const xml = files[age];
  assert.ok(rowFor(table(xml, "Types"), "Type", type)?.includes('Kind="KIND_TRADITION"'), `${type}: Types row`);
  const trad = rowFor(table(xml, "Traditions"), "TraditionType", type);
  assert.ok(trad, `${type}: Traditions row`);
  assert.ok(trad.includes('CultureSlotType="POLICY_CULTURE_SLOT"'), `${type}: a policy slot card`);
  assert.ok(trad.includes(`AgeType="AGE_${age}"`), `${type}: its age`);
  assert.ok(!/TraitType=/.test(trad), `${type}: open to every civilization`);
  assert.ok(trad.includes(`Name="LOC_EMIG_POLICY_${loc}_NAME"`) && trad.includes(`Description="LOC_EMIG_POLICY_${loc}_${descKey}"`),
    `${type}: name and description keys`);
  const unlock = table(xml, "ProgressionTreeNodeUnlocks").match(new RegExp(`<Row[^>]*TargetType="${type}"[^>]*/>`));
  assert.ok(unlock && unlock[0].includes(`ProgressionTreeNodeType="${node}"`), `${type}: unlocked at ${node}`);
  liveUnlocks++;
  const mods = table(xml, "TraditionModifiers");
  const linked = [...mods.matchAll(new RegExp(`<Row TraditionType="${type}" ModifierId="([A-Z_]+)"/>`, "g"))].map((m) => m[1]);
  assert.deepEqual(linked.sort(), [...modifiers].sort(), `${type}: its modifier links`);
  for (const modifier of modifiers) assert.ok(effects.includes(`<Modifier id="${modifier}"`), `${modifier}: defined in game effects`);
  assert.ok(new RegExp(`<ID>${type}</ID><Path>blp:[a-z0-9_]+</Path>`).test(icons), `${type}: icon mapped`);
  for (const k of [`LOC_EMIG_POLICY_${loc}_NAME`, `LOC_EMIG_POLICY_${loc}_${descKey}`]) {
    assert.ok(en.includes(`Tag="${k}"`), `${k}: en_us text`);
  }
  assert.ok(borders.includes(`"${type}"`), `${type}: listed in emigration-borders.js POLICY_TYPES`);
}

// Ten cards unlock, no more: two in Antiquity, four in Exploration, four in Modern.
assert.equal(liveUnlocks, 10);
for (const [age, n] of [["ANTIQUITY", 2], ["EXPLORATION", 4], ["MODERN", 4]]) {
  const rows = table(files[age], "ProgressionTreeNodeUnlocks").match(/<Row /g) || [];
  assert.equal(rows.length, n, `${age}: ${n} cards unlock`);
}

// The retired cards keep their rows for old saves and have no unlock.
for (const [family, ages] of RETIRED) {
  for (const age of ages) {
    const type = `TRADITION_EMIG_${family}_${age}`;
    const xml = files[age];
    assert.ok(rowFor(table(xml, "Types"), "Type", type), `${type}: row kept for old saves`);
    assert.ok(rowFor(table(xml, "Traditions"), "TraditionType", type), `${type}: Traditions row kept`);
    assert.ok(!table(xml, "ProgressionTreeNodeUnlocks").includes(type), `${type}: no unlock any more`);
    assert.ok(borders.includes(`"${type}"`), `${type}: still read as legacy in emigration-borders.js`);
  }
}

// Each stance's slot grant is withheld while the opposite stance is slotted.
for (const age of ["AQ", "EX", "MO"]) {
  const full = { AQ: "ANTIQUITY", EX: "EXPLORATION", MO: "MODERN" }[age];
  for (const [mine, other] of [["OPEN", "CLOSED"], ["CLOSED", "OPEN"]]) {
    const id = `MOD_EMIG_STANCE_SLOT_${mine}_${age}`;
    const block = effects.match(new RegExp(`<Modifier id="${id}"[\\s\\S]*?</Modifier>`));
    assert.ok(block, `${id}: defined`);
    assert.ok(block[0].includes('effect="EFFECT_PLAYER_GRANT_TRADITION_SLOTS"'), `${id}: grants a slot`);
    assert.ok(block[0].includes('<Argument name="SlotType">POLICY_CULTURE_SLOT</Argument>'), `${id}: a policy slot`);
    assert.ok(block[0].includes('<Argument name="Amount">1</Argument>'), `${id}: one slot`);
    assert.ok(block[0].includes('<Requirement type="REQUIREMENT_PLAYER_HAS_ACTIVE_TRADITION" inverse="true">'), `${id}: withheld by requirement`);
    assert.ok(block[0].includes(`<Argument name="TraditionType">TRADITION_EMIG_${other}_BORDERS_${full}</Argument>`), `${id}: withheld while the ${other} stance is slotted`);
    assert.ok(!/permanent="true"/.test(block[0]), `${id}: not permanent, so it goes when the card does`);
  }
}
assert.ok(en.includes('Tag="LOC_EMIG_POLICY_STANCE_SLOT_DESC"'), "the slot grant's description has en_us text");

// The native amounts match the card text.
const amount = (id) => Number(effects.match(new RegExp(`<Modifier id="${id}"[\\s\\S]*?<Argument name="Amount">(-?\\d+)</Argument>`))[1]);
const text = (k) => en.match(new RegExp(`Tag="${k}"><Text>([^<]*)</Text>`))[1];
for (const [age, suffix] of [["AQ", "DESC"], ["EX", "DESC_EX"], ["MO", "DESC_MO"]]) {
  const inf = amount(`MOD_EMIG_OPEN_BORDERS_INFLUENCE_${age}`);
  assert.ok(text(`LOC_EMIG_POLICY_OPEN_BORDERS_${suffix}`).startsWith(`+${inf} [icon:YIELD_DIPLOMACY]`), `open ${age} text says +${inf}`);
  const prod = amount(`MOD_EMIG_CLOSED_BORDERS_PRODUCTION_${age}`);
  const cost = amount(`MOD_EMIG_CLOSED_BORDERS_INFLUENCE_${age}`);
  const closed = text(`LOC_EMIG_POLICY_CLOSED_BORDERS_${suffix}`);
  assert.ok(closed.startsWith(`+${prod} [icon:YIELD_PRODUCTION]`), `closed ${age} text says +${prod}`);
  assert.ok(closed.includes(`${cost} [icon:YIELD_DIPLOMACY]`), `closed ${age} text says ${cost}`);
  assert.ok(/Brings its own policy slot\.$/.test(closed) && /Brings its own policy slot\.$/.test(text(`LOC_EMIG_POLICY_OPEN_BORDERS_${suffix}`)), `${age}: both stances say they bring a slot`);
}
for (const [age, suffix] of [["EX", "DESC"], ["MO", "DESC_MO"]]) {
  const n = amount(`MOD_EMIG_TALENT_YIELD_${age}`);
  assert.ok(text(`LOC_EMIG_POLICY_TALENT_${suffix}`).startsWith(`+${n} [icon:YIELD_SCIENCE]`), `talent ${age} text says +${n}`);
}

console.log(`treatment-policies-data: ${CARDS.length} cards declared, linked, unlocked, iconed and named; ${RETIRED.length} families retired`);
