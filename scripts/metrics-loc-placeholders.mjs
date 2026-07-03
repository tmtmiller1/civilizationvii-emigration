import fs from "node:fs";

const asJson = process.argv.includes("--json");
const asCheck = process.argv.includes("--check"); // gate mode: exit non-zero on any mismatch
const base = "text";
const locales = ["de_de", "es_es", "fr_fr", "it_it", "ja_jp", "ko_kr", "pl_pl", "pt_br", "ru_ru", "zh_hans_cn", "zh_hant_hk"];

function parseRows(xml) {
  const rows = new Map();
  // en_us authors entries as <Row Tag="K">...<Text>V</Text></Row>; locale files are generated as
  // <Replace Tag="K" Language="xx_XX"><Text>V</Text></Replace>. Match BOTH — a <Row>-only regex
  // parses zero rows from every locale, making every placeholder-bearing en_us key look mismatched.
  const re = /<(?:Row|Replace)\s+Tag="(LOC_[A-Z0-9_]+)"[\s\S]*?<Text>([\s\S]*?)<\/Text>/g;
  let m;
  while ((m = re.exec(xml))) rows.set(m[1], m[2]);
  return rows;
}

function placeholders(s) {
  const out = [];
  const re = /\{[0-9]+_[A-Za-z0-9_]+\}/g;
  let m;
  while ((m = re.exec(s || ""))) out.push(m[0]);
  out.sort();
  return out.join("|");
}

const en = parseRows(fs.readFileSync(`${base}/en_us/ModText.xml`, "utf8"));
if (en.size === 0) throw new Error("en_us/ModText.xml parsed to 0 rows — parser/format mismatch");
let mismatch = 0;
const details = [];
for (const loc of locales) {
  const rows = parseRows(fs.readFileSync(`${base}/${loc}/ModText.xml`, "utf8"));
  // Guard against silent mis-measurement: a locale that parses to 0 rows means the parser no longer
  // matches the file format (the bug that once inflated this metric to 1232). Fail loud, don't
  // report a fabricated count against empty values.
  if (rows.size === 0) throw new Error(`${loc}/ModText.xml parsed to 0 rows — parser/format mismatch`);
  for (const [k, vEn] of en.entries()) {
    const vLoc = rows.get(k) || "";
    if (placeholders(vEn) !== placeholders(vLoc)) {
      mismatch += 1;
      details.push({ locale: loc, key: k, en: placeholders(vEn), loc: placeholders(vLoc) });
    }
  }
}

const out = {
  metric: "loc_placeholder_mismatch_count",
  locales: locales.length,
  keys: en.size,
  value: mismatch,
  measuredAt: new Date().toISOString()
};
if (asJson) console.log(JSON.stringify(out, null, 2));
else console.log(`value=${mismatch}`);

if (asCheck && mismatch > 0) {
  console.error(`\nloc_placeholder_mismatch_count=${mismatch} (expected 0) — placeholder token drift:`);
  for (const d of details) console.error(`  ${d.locale} ${d.key}: en[${d.en}] vs loc[${d.loc}]`);
  process.exit(1);
}
