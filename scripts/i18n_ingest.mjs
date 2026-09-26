// i18n_ingest.mjs, read the per-locale text/<locale>/ModText.xml files BACK into the translation maps
// (i18n/<locale>.json), which is what makes i18n_apply.mjs safe to run.
//
// Why this exists. The maps are the apply script's only source of translations: it regenerates every
// locale file from i18n-source.json plus the map, and any key the map does not carry falls back to
// English. So a translation typed straight into a locale's ModText.xml is invisible to the pipeline, and
// the next apply silently replaces it with the English string. That is not hypothetical: on 2026-09-17
// the XML files had drifted to the point where a single documented `i18n_extract && i18n_apply` wiped
// 6,018 real translations across the eleven locales, about a third of every file, and it was only caught
// because a spot check happened to look at a German row afterward.
//
// Ingest closes that hole by treating the SHIPPED XML as the thing of record and copying anything the map
// is missing or disagrees with back into the map. It only ever adds or updates; it never drops a key.
//
//   node scripts/i18n_ingest.mjs            report and write
//   node scripts/i18n_ingest.mjs --check    report only, exit 1 if any map is out of date (a gate)
//
// Run it after editing a locale's ModText.xml by hand, and before i18n_apply.mjs.

import fs from "node:fs";
import { LOCALES, I18N_ROOT, readLocaleRows, readSource } from "./i18n_shared.mjs";

const checkOnly = process.argv.includes("--check");
const SRC = readSource();

let staleTotal = 0;
const report = [];

for (const [folder] of Object.entries(LOCALES)) {
  const mapPath = `${I18N_ROOT}/${folder}.json`;
  const map = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, "utf8")) : {};
  const rows = readLocaleRows(folder);
  let added = 0;
  let updated = 0;
  for (const [key, text] of Object.entries(rows)) {
    // A row identical to the English source is a fallback, not a translation: leaving it out of the map
    // is what lets a later English edit flow through to that locale.
    if (text === SRC[key]) {
      if (typeof map[key] === "string" && map[key] === text) delete map[key];
      continue;
    }
    if (typeof map[key] !== "string" || !map[key].length) {
      map[key] = text;
      added++;
    } else if (map[key] !== text) {
      map[key] = text;
      updated++;
    }
  }
  const stale = added + updated;
  staleTotal += stale;
  report.push(`${folder}: ${added} added, ${updated} updated` + (stale ? "" : " (already in step)"));
  if (!checkOnly && stale) fs.writeFileSync(mapPath, JSON.stringify(map, null, 1) + "\n");
}

for (const line of report) console.log("  " + line);

if (checkOnly && staleTotal) {
  console.error(`\ni18n_ingest --check: ${staleTotal} translation(s) live only in the XML.`);
  console.error("Run `node scripts/i18n_ingest.mjs` before `node scripts/i18n_apply.mjs`, or apply will replace them with English.");
  process.exit(1);
}
console.log(checkOnly ? "i18n_ingest --check: maps match the shipped text" : `i18n_ingest: ${staleTotal} translation(s) folded back into the maps`);
