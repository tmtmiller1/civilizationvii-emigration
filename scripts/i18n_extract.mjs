// i18n_extract.mjs, extract the canonical en_us key→text map to i18n/i18n-source.json,
// the intermediate the apply script reads. (Generated, gitignored; the parity test reads
// en_us directly so it doesn't depend on this file.)
//
//   node scripts/i18n_extract.mjs
//
// This is the middle step of three. The full order is ingest, extract, apply:
//   node scripts/i18n_ingest.mjs    fold hand-edited locale XML back into i18n/<locale>.json
//   node scripts/i18n_extract.mjs   refresh the English key set from en_us (this script)
//   node scripts/i18n_apply.mjs     regenerate every locale's ModText.xml
// Skipping extract makes apply ship a stale English fallback to all eleven locales; skipping ingest
// makes it replace hand-written translations with English, which apply now refuses to do.

import fs from "node:fs";

const I18N_ROOT = "i18n";

const xml = fs.readFileSync("text/en_us/ModText.xml", "utf8");
const re = /Tag="(LOC_[A-Z0-9_]+)"\s*>\s*<Text>([\s\S]*?)<\/Text>/g;
/** @type {Record<string,string>} */
const out = {};
let m;
while ((m = re.exec(xml))) {
  out[m[1]] = m[2]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // Keep edge spaces: fragments like " and " or " ({1_Flag})" are concatenated onto other text.
    .replace(/^\s*\n\s*|\s*\n\s*$/g, "");
}
fs.writeFileSync(`${I18N_ROOT}/i18n-source.json`, JSON.stringify(out, null, 1) + "\n");
console.log("keys extracted:", Object.keys(out).length);
