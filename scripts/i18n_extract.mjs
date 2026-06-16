// i18n_extract.mjs — extract the canonical en_us key→text map to i18n/i18n-source.json,
// the intermediate the apply script reads. (Generated, gitignored; the parity test reads
// en_us directly so it doesn't depend on this file.)
//
//   node scripts/i18n_extract.mjs

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
    .trim();
}
fs.writeFileSync(`${I18N_ROOT}/i18n-source.json`, JSON.stringify(out, null, 1) + "\n");
console.log("keys extracted:", Object.keys(out).length);
