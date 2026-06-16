// i18n_apply.mjs — regenerate every non-English text/<locale>/ModText.xml from the
// canonical en_us key set (i18n/i18n-source.json) plus a per-locale translation map
// (i18n/<folder>.json). Idempotent: re-running reproduces the same files. Any key
// missing a translation falls back to the English source so locale parity is preserved.
//
//   node scripts/i18n_apply.mjs
//
// Re-extract the source after editing en_us with:
//   node scripts/i18n_extract.mjs

import fs from "node:fs";

const I18N_ROOT = "i18n";

const SRC = JSON.parse(fs.readFileSync(`${I18N_ROOT}/i18n-source.json`, "utf8"));
const KEYS = Object.keys(SRC);

/** folder name → the engine Language attribute. */
const LOCALES = {
  de_de: "de_DE",
  es_es: "es_ES",
  fr_fr: "fr_FR",
  it_it: "it_IT",
  ja_jp: "ja_JP",
  ko_kr: "ko_KR",
  pt_br: "pt_BR",
  ru_ru: "ru_RU",
  zh_cn: "zh_Hans_CN"
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

for (const [folder, lang] of Object.entries(LOCALES)) {
  const tfile = `${I18N_ROOT}/${folder}.json`;
  const tr = fs.existsSync(tfile) ? JSON.parse(fs.readFileSync(tfile, "utf8")) : {};
  let missing = 0;
  const rows = KEYS.map((k) => {
    const has = typeof tr[k] === "string" && tr[k].length;
    if (!has) missing++;
    const v = has ? tr[k] : SRC[k];
    return `        <Replace Tag="${k}" Language="${lang}"><Text>${esc(v)}</Text></Replace>`;
  }).join("\n");
  const xml =
    '<?xml version="1.0" encoding="utf-8"?>\n<Database>\n    <LocalizedText>\n' +
    rows +
    "\n    </LocalizedText>\n</Database>\n";
  fs.writeFileSync(`text/${folder}/ModText.xml`, xml);
  console.log(`${folder}: ${KEYS.length} rows` + (missing ? ` (${missing} fell back to English)` : ""));
}
