import assert from "node:assert/strict";
import fs from "node:fs";

// Locale parity gate: every key in en_us must exist in all eleven non-English ModText.xml files
// (so no string silently falls back to English). Guards against drift as new keys are added,
// run `node scripts/i18n_extract.mjs && node scripts/i18n_apply.mjs` to refresh after editing
// en_us. Reads the key set straight from en_us so the gate needs no generated/ignored file.

const enXml = fs.readFileSync("text/en_us/ModText.xml", "utf8");
const SRC = [...enXml.matchAll(/Tag="(LOC_[A-Z0-9_]+)"/g)].map((m) => m[1]);
const EN_TEXT = [...enXml.matchAll(/Tag="(LOC_[A-Z0-9_]+)"\s*>\s*<Text>([^<]*)<\/Text>/g)].map((m) => [m[1], m[2]]);
const WIDE = /[　-ヿ一-鿿＀-￯]/;
const FOLDERS = ["de_de", "es_es", "fr_fr", "it_it", "ja_jp", "ko_kr", "pl_pl", "pt_br", "ru_ru", "zh_hans_cn", "zh_hant_hk"];

let checked = 0;
for (const f of FOLDERS) {
  const xml = fs.readFileSync(`text/${f}/ModText.xml`, "utf8");
  const have = new Set([...xml.matchAll(/Tag="(LOC_[A-Z0-9_]+)"/g)].map((m) => m[1]));
  const missing = SRC.filter((k) => !have.has(k));
  assert.equal(missing.length, 0, `${f} is missing ${missing.length} key(s): ${missing.slice(0, 4).join(", ")}`);
  // Edge spaces: fragments such as " and " or " ({1_Flag})" are concatenated onto other text, so a locale
  // must keep the English leading/trailing space (Japanese and Chinese may drop it next to a CJK character).
  const text = new Map([...xml.matchAll(/Tag="(LOC_[A-Z0-9_]+)"[^>]*><Text>([^<]*)<\/Text>/g)].map((m) => [m[1], m[2]]));
  const cjk = f === "ja_jp" || f.startsWith("zh_");
  for (const [k, en] of EN_TEXT) {
    const v = text.get(k);
    if (typeof v !== "string" || !/^\s|\s$/.test(en)) continue;
    const core = v.trim();
    if (!(cjk && WIDE.test(core[0] || ""))) assert.equal(/^\s/.test(v), /^\s/.test(en), `${f} ${k}: leading space differs from English`);
    if (!(cjk && WIDE.test(core[core.length - 1] || ""))) assert.equal(/\s$/.test(v), /\s$/.test(en), `${f} ${k}: trailing space differs from English`);
  }
  checked += SRC.length;
}

console.log(`i18n parity harness passed (${SRC.length} keys × ${FOLDERS.length} locales = ${checked})`);
