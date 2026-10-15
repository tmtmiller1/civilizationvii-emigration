// treatment-policies-data.mjs
//
// Data gate for the community treatment cards and Consular Protection: each tradition is declared in its
// age's policy file (Types row, Traditions row in POLICY_CULTURE_SLOT with its age, a civic unlock), its
// native modifier exists in the always-loaded game-effects file, its icon is mapped, its name and
// description have en_us text, and the scripted readers in emigration-borders.js list it.
//
// Run as a plain node script: `node ./tests/treatment-policies-data.mjs`.

import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const effects = read("data/emigration-policies-gameeffects.xml");
const icons = read("data/emigration-policy-icons.xml");
const en = read("text/en_us/ModText.xml");
const borders = read("ui/emigration-borders.js");

/** Each card: its age file, age type, unlock node, native modifier (null: script-only), and LOC stem. */
const CARDS = [
  ["PROTECT", "ANTIQUITY", "NODE_CIVIC_AQ_MAIN_CITIZENSHIP", "MOD_EMIG_PROTECT_INFLUENCE_AQ", "PROTECT_AQ"],
  ["PROTECT", "EXPLORATION", "NODE_CIVIC_EX_MAIN_ECONOMICS", "MOD_EMIG_PROTECT_INFLUENCE_EX", "PROTECT_EX"],
  ["PROTECT", "MODERN", "NODE_CIVIC_MO_MAIN_SOCIAL_QUESTION", "MOD_EMIG_PROTECT_INFLUENCE_MO", "PROTECT_MO"],
  ["SUSPECT", "ANTIQUITY", "NODE_CIVIC_AQ_MAIN_CITIZENSHIP", "MOD_EMIG_SUSPECT_PRODUCTION_AQ", "SUSPECT_AQ"],
  ["SUSPECT", "EXPLORATION", "NODE_CIVIC_EX_MAIN_ECONOMICS", "MOD_EMIG_SUSPECT_PRODUCTION_EX", "SUSPECT_EX"],
  ["SUSPECT", "MODERN", "NODE_CIVIC_MO_MAIN_SOCIAL_QUESTION", "MOD_EMIG_SUSPECT_PRODUCTION_MO", "SUSPECT_MO"],
  ["CONSULAR", "EXPLORATION", "NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE", null, "CONSULAR"],
  ["CONSULAR", "MODERN", "NODE_CIVIC_MO_MAIN_POLITICAL_THEORY", null, "CONSULAR"]
];

/** @param {string} xml @param {string} table @returns {string} The table's body. */
function table(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  assert.ok(m, `no <${name}> table`);
  return m[1];
}

/** @param {string} body @param {string} type @returns {string|null} The <Row …> naming the type. */
function rowFor(body, attr, type) {
  const m = body.match(new RegExp(`<Row\\b[^>]*\\b${attr}="${type}"[^>]*/>`));
  return m ? m[0] : null;
}

for (const [family, age, node, modifier, loc] of CARDS) {
  const type = `TRADITION_EMIG_${family}_${age}`;
  const xml = read(`data/emigration-policies-${age.toLowerCase()}.xml`);
  assert.ok(rowFor(table(xml, "Types"), "Type", type)?.includes('Kind="KIND_TRADITION"'), `${type}: Types row`);
  const trad = rowFor(table(xml, "Traditions"), "TraditionType", type);
  assert.ok(trad, `${type}: Traditions row`);
  assert.ok(trad.includes('CultureSlotType="POLICY_CULTURE_SLOT"'), `${type}: a policy slot card`);
  assert.ok(trad.includes(`AgeType="AGE_${age}"`), `${type}: its age`);
  assert.ok(!/TraitType=/.test(trad), `${type}: open to every civilization`);
  assert.ok(trad.includes(`Name="LOC_EMIG_POLICY_${loc}_NAME"`) && trad.includes(`Description="LOC_EMIG_POLICY_${loc}_DESC"`),
    `${type}: its LOC keys`);
  const unlock = rowFor(table(xml, "ProgressionTreeNodeUnlocks"), "TargetType", type);
  assert.ok(unlock && unlock.includes(`ProgressionTreeNodeType="${node}"`), `${type}: unlocked at ${node}`);
  const mods = table(xml, "TraditionModifiers");
  if (modifier) {
    assert.ok(rowFor(mods, "TraditionType", type)?.includes(`ModifierId="${modifier}"`), `${type}: modifier link`);
    assert.ok(effects.includes(`<Modifier id="${modifier}"`), `${modifier}: defined in game effects`);
  } else {
    assert.equal(rowFor(mods, "TraditionType", type), null, `${type}: script-only, no modifier`);
  }
  assert.ok(new RegExp(`<ID>${type}</ID><Path>blp:[a-z0-9_]+</Path>`).test(icons), `${type}: icon mapped`);
  for (const k of [`LOC_EMIG_POLICY_${loc}_NAME`, `LOC_EMIG_POLICY_${loc}_DESC`]) {
    assert.ok(en.includes(`Tag="${k}"`), `${k}: en_us text`);
  }
  assert.ok(borders.includes(`"${type}"`), `${type}: listed in emigration-borders.js POLICY_TYPES`);
}

// The native amounts match the card text: +1/+2/+3 by age.
for (const [ab, n] of [["AQ", 1], ["EX", 2], ["MO", 3]]) {
  for (const id of [`MOD_EMIG_PROTECT_INFLUENCE_${ab}`, `MOD_EMIG_SUSPECT_PRODUCTION_${ab}`]) {
    const block = effects.match(new RegExp(`<Modifier id="${id}"[\\s\\S]*?</Modifier>`))[0];
    assert.ok(block.includes(`<Argument name="Amount">${n}</Argument>`), `${id}: +${n}`);
  }
  assert.ok(en.match(new RegExp(`Tag="LOC_EMIG_POLICY_PROTECT_${ab}_DESC"><Text>\\+${n} `)), `protect ${ab} text says +${n}`);
  assert.ok(en.match(new RegExp(`Tag="LOC_EMIG_POLICY_SUSPECT_${ab}_DESC"><Text>\\+${n} `)), `suspect ${ab} text says +${n}`);
}

console.log(`treatment-policies-data: ${CARDS.length} cards declared, linked, unlocked, iconed and named`);
