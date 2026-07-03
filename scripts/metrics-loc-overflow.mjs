import fs from "node:fs";

const asJson = process.argv.includes("--json");
const asCheck = process.argv.includes("--check"); // gate mode: exit non-zero on any issue
const base = "text";
const locales = ["de_de", "es_es", "fr_fr", "it_it", "ja_jp", "ko_kr", "pl_pl", "pt_br", "ru_ru", "zh_hans_cn", "zh_hant_hk"];
const oneLinePrefixes = ["LOC_EMIGRATION_PANEL_", "LOC_OPTIONS_EMIGRATION_", "LOC_EMIG_NETC_"];

function parseRows(xml) {
  const rows = new Map();
  // en_us uses <Row Tag="K">; locale files are generated as <Replace Tag="K" Language="xx">. Match
  // BOTH — a <Row>-only regex parses zero rows from every locale, so every localized value reads as
  // empty and the metric silently reports 0 issues regardless of the real strings.
  const re = /<(?:Row|Replace)\s+Tag="(LOC_[A-Z0-9_]+)"[\s\S]*?<Text>([\s\S]*?)<\/Text>/g;
  let m;
  while ((m = re.exec(xml))) rows.set(m[1], m[2]);
  return rows;
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]*>/g, "").trim();
}

const en = parseRows(fs.readFileSync(`${base}/en_us/ModText.xml`, "utf8"));
if (en.size === 0) throw new Error("en_us/ModText.xml parsed to 0 rows — parser/format mismatch");
let issues = 0;
for (const loc of locales) {
  const rows = parseRows(fs.readFileSync(`${base}/${loc}/ModText.xml`, "utf8"));
  if (rows.size === 0) throw new Error(`${loc}/ModText.xml parsed to 0 rows — parser/format mismatch`);
  for (const [k, vEnRaw] of en.entries()) {
    if (!oneLinePrefixes.some((p) => k.startsWith(p))) continue;
    const vEn = stripTags(vEnRaw);
    const vLoc = stripTags(rows.get(k) || "");
    if (!vLoc.length || !vEn.length) continue;
    const ratio = vLoc.length / Math.max(1, vEn.length);
    // The pure-ratio rule is invalid for ultra-short strings: a 3-char English word ("now") vs a
    // natural 10-char translation ("à présent") trips ratio>2.2 but cannot overflow a one-line label.
    // Require the localized string to be absolutely long enough to plausibly clip before flagging.
    const looksRisky = (vEn.length <= 40 && vLoc.length > 80) || (ratio > 2.2 && vLoc.length > 24);
    if (looksRisky) issues += 1;
  }
}

const out = {
  metric: "loc_ui_overflow_issue_count",
  value: issues,
  method: "heuristic-length-risk",
  measuredAt: new Date().toISOString(),
  note: "Risk heuristic over one-line UI labels; not a screenshot/layout pixel check."
};
if (asJson) console.log(JSON.stringify(out, null, 2));
else console.log(`value=${issues}`);

if (asCheck && issues > 0) {
  console.error(`loc_ui_overflow_issue_count=${issues} (expected 0) — localized labels flagged as overflow-risk.`);
  process.exit(1);
}
