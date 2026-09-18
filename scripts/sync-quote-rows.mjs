// sync-quote-rows.mjs, write the en_us text rows for every historical quote from the two registries:
// the enclave quotes (QUARTER_QUOTES, LOC_EMIG_QTR_Q_*) and the refugee, migrant and return quotes
// (DISPLACED_QUOTES + DISPLACED_POOLS, LOC_EMIG_DQ_*). Quotes are epigraphs, identical in every locale, so
// the script also drops those keys from every per-locale translation map; the locale files then fall back
// to the English row. Idempotent.
//
//   node --loader ./tests/loader.mjs scripts/sync-quote-rows.mjs
//   node scripts/i18n_ingest.mjs && node scripts/i18n_extract.mjs && node scripts/i18n_apply.mjs
//
// Ingest comes FIRST and is not optional: apply rebuilds each locale from i18n/<locale>.json, so any
// translation that was typed into a ModText.xml by hand is invisible to it and would be replaced with
// English. Apply refuses to run when that is the case and names this same order.

import fs from "node:fs";

const { QUARTER_QUOTES, quarterQuoteKey, quoteRowText } = await import("/emigration/ui/emigration-quarter-bonuses.js");
const { DISPLACED_QUOTES, DISPLACED_POOLS, displacedQuoteKey } = await import("/emigration/ui/emigration-displaced-quotes.js");

const EN = "text/en_us/ModText.xml";
const QTR_ANCHOR = /(<Row Tag="LOC_EMIG_QTR_Q_[A-Z0-9_]+">\s*<Text>[^<]*<\/Text>\s*<\/Row>\n)(?![\s\S]*<Row Tag="LOC_EMIG_QTR_Q_)/;

/** @param {string} t @returns {string} XML-escaped text. */
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** @param {string} key @param {string} text @returns {string} One en_us row. */
const row = (key, text) => `        <Row Tag="${key}">\n            <Text>${esc(text)}</Text>\n        </Row>\n`;

// A draft marker must never reach a player: refuse to write while any quote still carries one.
// TODO is matched in capitals only: Spanish and Portuguese quotes say "todo".
const DRAFT = { test: (/** @type {string} */ t) => /re-verify|paraphrase/i.test(t) || /\bTODO\b/.test(t) };
const drafts = [];
for (const [civ, pair] of Object.entries(QUARTER_QUOTES)) {
  for (const id of ["a", "b"]) if (DRAFT.test(quoteRowText(pair[id]))) drafts.push(quarterQuoteKey(civ, id));
}
for (const [civ, r] of Object.entries(DISPLACED_QUOTES)) {
  for (const kind of Object.keys(r)) {
    r[kind].forEach((q, i) => { if (DRAFT.test(quoteRowText(q))) drafts.push(displacedQuoteKey(civ, kind, i)); });
  }
}
for (const kind of ["refugee", "migrant", "return"]) {
  DISPLACED_POOLS[kind].forEach((q, i) => { if (DRAFT.test(quoteRowText(q))) drafts.push(displacedQuoteKey(null, kind, i)); });
}
if (drafts.length) throw new Error("quotes still carry a draft marker, resolve them first: " + drafts.join(", "));

let xml = fs.readFileSync(EN, "utf8");

// Enclave quotes: rewrite each existing row's text in place, and write a row for any civilization
// the registry has gained since the last run (a new DLC civ), so adding one is a registry-only edit.
let enclave = 0;
let addedRows = "";
for (const [civ, pair] of Object.entries(QUARTER_QUOTES)) {
  for (const id of ["a", "b"]) {
    const key = quarterQuoteKey(civ, id);
    const re = new RegExp(`(<Row Tag="${key}">\\s*<Text>)[^<]*(</Text>)`);
    if (re.test(xml)) xml = xml.replace(re, (_m, open, close) => open + esc(quoteRowText(pair[id])) + close);
    else addedRows += row(key, quoteRowText(pair[id]));
    enclave++;
  }
}
if (addedRows) {
  if (!QTR_ANCHOR.test(xml)) throw new Error("enclave quote block not found in en_us");
  xml = xml.replace(QTR_ANCHOR, (m) => m + addedRows);
}

// Refugee, migrant and return quotes: drop every existing row, then write the registry's rows after the enclave block.
xml = xml.replace(/ {8}<Row Tag="LOC_EMIG_DQ_[A-Z0-9_]+">\s*<Text>[^<]*<\/Text>\s*<\/Row>\n/g, "");
/** @type {[string|null, string, *[]][]} */
const lists = [];
for (const [civ, r] of Object.entries(DISPLACED_QUOTES)) for (const kind of Object.keys(r)) lists.push([civ, kind, r[kind]]);
lists.push([null, "refugee", DISPLACED_POOLS.refugee], [null, "migrant", DISPLACED_POOLS.migrant],
  [null, "return", DISPLACED_POOLS.return]);
let rows = "";
let displaced = 0;
for (const [civ, kind, list] of lists) {
  list.forEach((q, i) => {
    rows += row(displacedQuoteKey(civ, kind, i), quoteRowText(q));
    displaced++;
  });
}
if (!QTR_ANCHOR.test(xml)) throw new Error("enclave quote block not found in en_us");
xml = xml.replace(QTR_ANCHOR, (m) => m + rows);
fs.writeFileSync(EN, xml);

// Per-locale translation maps: quotes are not translated, so remove any stale copy.
let dropped = 0;
for (const f of fs.readdirSync("i18n").filter((n) => /^[a-z]{2}_[a-z_]+\.json$/.test(n))) {
  const path = "i18n/" + f;
  const map = JSON.parse(fs.readFileSync(path, "utf8"));
  const stale = Object.keys(map).filter((k) => /^LOC_EMIG_(QTR_Q|DQ)_/.test(k));
  if (!stale.length) continue;
  for (const k of stale) delete map[k];
  dropped += stale.length;
  fs.writeFileSync(path, JSON.stringify(map, null, 1) + "\n");
}

console.log(`sync-quote-rows: ${enclave} enclave rows, ${displaced} refugee/migrant rows, ${dropped} locale copies dropped`);
