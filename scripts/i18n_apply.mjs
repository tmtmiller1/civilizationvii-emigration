// i18n_apply.mjs, regenerate every non-English text/<locale>/ModText.xml from the canonical en_us key set
// (i18n/i18n-source.json) plus a per-locale translation map (i18n/<folder>.json). Idempotent: re-running
// reproduces the same files. Any key missing a translation falls back to the English source so locale
// parity is preserved.
//
//   node scripts/i18n_apply.mjs
//
// Re-extract the source after editing en_us with:
//   node scripts/i18n_extract.mjs
//
// SAFETY. The maps are this script's only source of translations, so a translation typed straight into a
// locale's ModText.xml is invisible here and would be overwritten with English. That happened: on
// 2026-09-17 the shipped XML had drifted far enough that one run of this script would have replaced 6,018
// real translations across the eleven locales with their English fallbacks. So before writing anything,
// this compares what it is about to produce against the rows already on disk and REFUSES to run if that
// would lose a translation, naming the command that folds them back in first.
//
//   node scripts/i18n_apply.mjs --force   write anyway (only when the loss is the intent)

import fs from "node:fs";
import { LOCALES, I18N_ROOT, esc, readLocaleRows, readSource } from "./i18n_shared.mjs";

const force = process.argv.includes("--force");
const SRC = readSource();
const KEYS = Object.keys(SRC);

/**
 * The rows this script would write for one locale.
 * @param {Record<string,string>} tr The translation map.
 * @returns {{text:Record<string,string>, missing:number}} The planned text per key.
 */
function planFor(tr) {
  /** @type {Record<string,string>} */
  const text = {};
  let missing = 0;
  for (const k of KEYS) {
    const has = typeof tr[k] === "string" && tr[k].length;
    if (!has) missing++;
    text[k] = has ? tr[k] : SRC[k];
  }
  return { text, missing };
}

const plans = [];
/** @type {{folder:string, key:string, had:string}[]} */
const losses = [];

for (const [folder, lang] of Object.entries(LOCALES)) {
  const tfile = `${I18N_ROOT}/${folder}.json`;
  const tr = fs.existsSync(tfile) ? JSON.parse(fs.readFileSync(tfile, "utf8")) : {};
  const plan = planFor(tr);
  const shipped = readLocaleRows(folder);
  for (const [key, had] of Object.entries(shipped)) {
    // A row that is neither what we are about to write nor the English fallback is a translation that
    // exists only in the XML. Writing over it would destroy it.
    if (had !== plan.text[key] && had !== SRC[key]) losses.push({ folder, key, had });
  }
  plans.push({ folder, lang, plan });
}

if (losses.length && !force) {
  const byFolder = losses.reduce((m, l) => Object.assign(m, { [l.folder]: (m[l.folder] || 0) + 1 }), {});
  console.error("i18n_apply: REFUSING to write. These translations live only in the shipped XML and would be lost:\n");
  for (const [folder, n] of Object.entries(byFolder)) console.error(`  ${folder}: ${n}`);
  console.error("\n  e.g. " + losses.slice(0, 3).map((l) => `${l.folder} ${l.key} = ${JSON.stringify(l.had.slice(0, 60))}`).join("\n       "));
  console.error(`\n${losses.length} in total. Fold them into the maps first:\n`);
  console.error("  node scripts/i18n_ingest.mjs\n");
  console.error("Then re-run this script. Pass --force only if replacing them with English is the intent.");
  process.exit(1);
}

for (const { folder, lang, plan } of plans) {
  const rows = KEYS.map((k) => `        <Replace Tag="${k}" Language="${lang}"><Text>${esc(plan.text[k])}</Text></Replace>`).join("\n");
  const xml =
    '<?xml version="1.0" encoding="utf-8"?>\n<Database>\n    <LocalizedText>\n' +
    rows +
    "\n    </LocalizedText>\n</Database>\n";
  fs.writeFileSync(`text/${folder}/ModText.xml`, xml);
  console.log(`${folder}: ${KEYS.length} rows` + (plan.missing ? ` (${plan.missing} fell back to English)` : ""));
}
if (force && losses.length) console.warn(`\ni18n_apply: --force replaced ${losses.length} XML-only translation(s) with English.`);
