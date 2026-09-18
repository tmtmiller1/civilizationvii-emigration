// i18n_shared.mjs, the pieces the three i18n scripts all need: the locale table, and one reader for the
// English source and for a locale's shipped rows. Kept in one place so extract, apply and ingest can
// never disagree about what a row's text IS, which is exactly the kind of mismatch that makes a
// regeneration quietly drop translations.

import fs from "node:fs";

export const I18N_ROOT = "i18n";

/** folder name → the engine Language attribute. */
export const LOCALES = {
  de_de: "de_DE",
  es_es: "es_ES",
  fr_fr: "fr_FR",
  it_it: "it_IT",
  ja_jp: "ja_JP",
  ko_kr: "ko_KR",
  pl_pl: "pl_PL",
  pt_br: "pt_BR",
  ru_ru: "ru_RU",
  zh_hans_cn: "zh_Hans_CN",
  zh_hant_hk: "zh_Hant_HK"
};

/** @param {string} s Raw text. @returns {string} XML-escaped. */
export const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** @param {string} s Escaped text. @returns {string} The raw text. */
export const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * Strip the indentation a hard-wrapped `<Text>` block picks up, exactly as i18n_extract does, so a row
 * written across several lines compares equal to the same row written inline.
 * @param {string} s The raw text. @returns {string} The comparable text.
 */
export const trimEdges = (s) => s.replace(/^\s*\n\s*|\s*\n\s*$/g, "");

/** @returns {Record<string,string>} The canonical English key set. */
export function readSource() {
  return JSON.parse(fs.readFileSync(`${I18N_ROOT}/i18n-source.json`, "utf8"));
}

/**
 * Every `<Replace>`/`<Row>` in a locale's shipped ModText.xml, keyed by tag. Tolerates both the inline
 * rows the apply script writes and the multi-line rows a person writes by hand.
 * @param {string} folder The locale folder name. @returns {Record<string,string>} tag → text.
 */
export function readLocaleRows(folder) {
  const path = `text/${folder}/ModText.xml`;
  if (!fs.existsSync(path)) return {};
  const xml = fs.readFileSync(path, "utf8");
  /** @type {Record<string,string>} */
  const out = {};
  const re = /<(Replace|Row)\s+Tag="([A-Z0-9_]+)"(?:\s+Language="[^"]*")?\s*>\s*<Text>([\s\S]*?)<\/Text>\s*<\/\1>/g;
  for (const m of xml.matchAll(re)) out[m[2]] = trimEdges(unesc(m[3]));
  return out;
}
