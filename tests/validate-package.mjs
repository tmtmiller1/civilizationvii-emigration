// validate-package.mjs
//
// Install / load-time package-integrity gate: the structural checks that decide whether INSTALLING
// this mod can crash a game on load — for a fresh installer, for any of the 11 non-English locales, and
// for a player who ALSO has other Workshop mods installed. These are the failure classes the existing
// gate misses: the i18n test is regex-based and does NOT catch XML well-formedness, and the modinfo
// test covers JS import-closure but not data/text XML, duplicate database keys, or the namespacing
// invariant that keeps this mod from colliding with other mods' database rows.
//
// Checks:
//   1. XML well-formedness — modinfo + every data/*.xml + every text/<locale>/ModText.xml (xmllint).
//   2. modinfo file references — every <Item>/<File> path exists on disk.
//   3. Civilopedia duplicate primary keys — per table, no duplicate PK rows (a dup PK crashes DB load).
//   4. Locale parity — every en_us key present in each declared locale, correct <Replace Language=…>,
//      and no duplicate Tags within a locale.
//   5. Data LOC references — every LOC_ key referenced by data/*.xml is defined in en_us text.
//   6. Namespace invariant — every mod-OWNED database identifier (Types/Traditions/Modifiers/Requirements)
//      + Civilopedia Section/PageGroup ids + every LOC tag carries the mod's namespace token, so it can
//      NEVER collide with the base game or another mod (the cross-mod install-crash guarantee).
//
// Run as a plain node script (no engine loader needed): `node ./tests/validate-package.mjs`.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const NS = "EMIG"; // every mod-owned identifier must carry this token (collision-proof vs base/other mods)
const failures = [];
const fail = (msg) => failures.push(msg);
const ok = (label, detail) => console.log(`  ok   ${label}${detail ? " — " + detail : ""}`);

// ── helpers ────────────────────────────────────────────────────────────────
const read = (p) => fs.readFileSync(p, "utf8");
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const dataXmlFiles = () => walk("data").filter((f) => f.endsWith(".xml"));
const allXmlFiles = () => [
  "emigration.modinfo",
  ...dataXmlFiles(),
  ...walk("text").filter((f) => f.endsWith(".xml"))
];

/** Attribute map parsed from a start-tag's inner attribute string. */
function attrsOf(tag) {
  const o = {};
  for (const m of tag.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) o[m[1]] = m[2];
  return o;
}
/** Attribute maps for every `<name ...>` start tag (self-closing or open). */
function rowsOf(xml, name) {
  return [...xml.matchAll(new RegExp(`<${name}(\\s[^>]*?)/?>`, "g"))].map((m) => attrsOf(m[1]));
}
/** Inner content of the first `<name ...>…</name>` block, or "". */
function blockOf(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : "";
}

// ── 1) XML well-formedness ───────────────────────────────────────────────────
let xmllintAvailable = true;
try {
  execFileSync("xmllint", ["--version"], { stdio: "ignore" });
} catch {
  xmllintAvailable = false;
}
if (!xmllintAvailable) {
  fail("xmllint not found — cannot validate XML well-formedness (install libxml2 / xmllint)");
} else {
  for (const f of allXmlFiles()) {
    try {
      execFileSync("xmllint", ["--noout", f], { stdio: "pipe" });
    } catch (e) {
      fail(`XML not well-formed: ${f}\n     ${(e.stderr ? e.stderr.toString() : e.message).trim()}`);
    }
  }
  ok("XML well-formedness", `${allXmlFiles().length} files (modinfo + data + all locales)`);
}

// ── 2) modinfo file references exist ─────────────────────────────────────────
const modinfo = read("emigration.modinfo");
const refs = [...modinfo.matchAll(/<(?:Item|File)(?:\s+locale="[^"]+")?>([^<]+)<\/(?:Item|File)>/g)]
  .map((m) => m[1].trim());
const missing = refs.filter((r) => !fs.existsSync(r));
if (missing.length) fail(`modinfo references missing file(s): ${missing.join(", ")}`);
else ok("modinfo file references", `${refs.length} refs all present`);

// ── 3) Civilopedia duplicate primary keys (per table) ────────────────────────
const pedia = fs.existsSync("data/emigration-civilopedia.xml") ? read("data/emigration-civilopedia.xml") : "";
const PEDIA_PK = {
  CivilopediaSections: ["SectionID"],
  CivilopediaPageGroups: ["SectionID", "PageGroupID"],
  CivilopediaPages: ["SectionID", "PageID"],
  CivilopediaPageChapterParagraphs: ["SectionID", "PageID", "ChapterID", "Paragraph"]
};
for (const [table, keyAttrs] of Object.entries(PEDIA_PK)) {
  const block = blockOf(pedia, table);
  if (!block) continue;
  const seen = new Map();
  for (const r of rowsOf(block, "Row")) {
    const k = keyAttrs.map((a) => r[a]).join("|");
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  const dups = [...seen].filter(([, c]) => c > 1).map(([k]) => k);
  if (dups.length) fail(`${table}: duplicate primary key(s): ${dups.join(", ")}`);
}
if (pedia) ok("Civilopedia primary keys", "no duplicates per table");

// ── 4) Locale parity + Language attr + no duplicate tags ─────────────────────
const enXml = read("text/en_us/ModText.xml");
const enKeys = new Set(rowsOf(enXml, "Row").map((r) => r.Tag).filter(Boolean));
const declared = [...modinfo.matchAll(/<Item\s+locale="([^"]+)">(text\/[^<]+ModText\.xml)<\/Item>/g)]
  .map((m) => ({ lang: m[1], file: m[2] }));
const seenLocaleFiles = new Set();
for (const { lang, file } of declared) {
  if (seenLocaleFiles.has(file)) continue;
  seenLocaleFiles.add(file);
  if (!fs.existsSync(file)) { fail(`declared locale file missing: ${file}`); continue; }
  const reps = rowsOf(read(file), "Replace");
  const tags = reps.map((r) => r.Tag).filter(Boolean);
  const tagSet = new Set(tags);
  const missingKeys = [...enKeys].filter((k) => !tagSet.has(k));
  const wrongLang = reps.filter((r) => r.Language && r.Language !== lang).length;
  const dupTags = tags.length - tagSet.size;
  if (missingKeys.length) {
    fail(`${file}: missing ${missingKeys.length} key(s) vs en_us (e.g. ${missingKeys.slice(0, 3).join(", ")})`);
  }
  if (wrongLang) fail(`${file}: ${wrongLang} <Replace> with Language != "${lang}"`);
  if (dupTags) fail(`${file}: ${dupTags} duplicate Tag(s)`);
}
ok("Locale parity", `${enKeys.size} keys × ${seenLocaleFiles.size} locales (coverage + Language + dups)`);

// ── 5) Data LOC references all defined in en_us ──────────────────────────────
const dataBlob = dataXmlFiles().map(read).join("\n");
const dataLoc = new Set([...dataBlob.matchAll(/LOC_[A-Z0-9_]+/g)].map((m) => m[0]));
const undefinedLoc = [...dataLoc].filter((k) => !enKeys.has(k));
if (undefinedLoc.length) fail(`data XML references undefined LOC key(s): ${undefinedLoc.join(", ")}`);
else ok("Data LOC references", `${dataLoc.size} keys all defined in en_us`);

// ── 6) Namespace invariant (cross-mod collision safety) ──────────────────────
// Only the DEFINITION tables (which create new primary keys) are checked, so references to shared
// base-game types (COLLECTION_OWNER, EFFECT_*, YIELD_*, …) never trip a false positive.
const DEF_TABLES = {
  Types: "Type",
  Traditions: "TraditionType",
  Modifiers: "ModifierId",
  RequirementSets: "RequirementSetId",
  Requirements: "RequirementId"
};
let ownedCount = 0;
for (const f of dataXmlFiles()) {
  const xml = read(f);
  for (const [table, attr] of Object.entries(DEF_TABLES)) {
    for (const block of xml.matchAll(new RegExp(`<${table}(?:\\s[^>]*)?>([\\s\\S]*?)</${table}>`, "g"))) {
      for (const r of rowsOf(block[1], "Row")) {
        if (!r[attr]) continue;
        ownedCount++;
        if (!r[attr].toUpperCase().includes(NS)) {
          fail(`${f}: ${table}.${attr}="${r[attr]}" is NOT namespaced with ${NS} (cross-mod collision risk)`);
        }
      }
    }
  }
}
for (const r of rowsOf(blockOf(pedia, "CivilopediaSections"), "Row")) {
  if (r.SectionID && !r.SectionID.toUpperCase().includes(NS)) fail(`CivilopediaSections SectionID="${r.SectionID}" not namespaced with ${NS}`);
}
for (const r of rowsOf(blockOf(pedia, "CivilopediaPageGroups"), "Row")) {
  if (r.PageGroupID && !r.PageGroupID.toUpperCase().includes(NS)) fail(`CivilopediaPageGroups PageGroupID="${r.PageGroupID}" not namespaced with ${NS}`);
}
// LOC tags must sit in this mod's namespace OR the coordinated companion (Demographics) namespace,
// into which Emigration deliberately contributes a few metric/series labels so they render inside the
// Demographics screen. Text-tag collisions are last-wins (never a DB crash), so this part is hygiene
// against shadowing an UNRELATED base/other key — not crash-safety. The DB-identifier check above is
// the actual cross-mod crash guarantee.
const LOC_OK = [NS, "DEMOGRAPHICS"];
const badLoc = [...enKeys].filter((k) => !LOC_OK.some((ns) => k.toUpperCase().includes(ns)));
if (badLoc.length) fail(`${badLoc.length} LOC tag(s) outside the ${LOC_OK.join("/")} namespaces (e.g. ${badLoc.slice(0, 5).join(", ")})`);
else ok("Namespace invariant", `${ownedCount} owned DB ids carry ${NS}; ${enKeys.size} LOC tags in ${LOC_OK.join("/")}`);

// ── report ───────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error("\n❌ validate-package FAILED — installing this mod could crash a game:");
  for (const f of failures) console.error("   - " + f);
  process.exit(1);
}
console.log("\nvalidate-package harness passed");
