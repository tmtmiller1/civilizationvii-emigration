// i18n-pipeline.mjs
//
// The regeneration pipeline must never be able to replace a shipped translation with English.
//
// It could, and it did: i18n_apply.mjs rebuilds every locale's ModText.xml from i18n/<locale>.json, so a
// translation typed straight into the XML is invisible to it and gets overwritten by the English source.
// On 2026-09-17 the XML had drifted so far that one run of the documented `i18n_extract && i18n_apply`
// would have wiped 6,018 translations across the eleven locales, roughly a third of every file.
//
// Two things keep that shut, and this pins both: the maps stay in step with the shipped text (so there is
// nothing for apply to lose), and apply REFUSES to run when they are not.

import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { LOCALES, readLocaleRows, readSource } from "../scripts/i18n_shared.mjs";

const SRC = readSource();

// ── every shipped row is reproducible from the maps ──────────────────────────
// A row that is neither the map's translation nor the English fallback exists only in the XML, which is
// exactly what apply would destroy. Run `node scripts/i18n_ingest.mjs` when this fails.
{
  const orphans = [];
  for (const folder of Object.keys(LOCALES)) {
    const map = JSON.parse(fs.readFileSync(`i18n/${folder}.json`, "utf8"));
    for (const [key, text] of Object.entries(readLocaleRows(folder))) {
      const expected = typeof map[key] === "string" && map[key].length ? map[key] : SRC[key];
      if (text !== expected && text !== SRC[key]) orphans.push(`${folder} ${key}`);
    }
  }
  assert.deepEqual(orphans.slice(0, 8), [],
    `${orphans.length} shipped translation(s) live only in the XML; run node scripts/i18n_ingest.mjs`);
}

// ── the English source is in step with en_us ────────────────────────────────
// apply writes SRC for any key without a translation, so a stale source silently ships outdated English
// to all eleven locales. Run `node scripts/i18n_extract.mjs` when this fails.
{
  const en = readLocaleRows("en_us");
  const stale = Object.keys(en).filter((k) => SRC[k] !== undefined && SRC[k] !== en[k]);
  assert.deepEqual(stale.slice(0, 8), [],
    `${stale.length} key(s) differ between en_us and i18n-source.json; run node scripts/i18n_extract.mjs`);
}

// ── apply REFUSES when a translation would be lost ──────────────────────────
// The guard is the thing that makes the pipeline safe to run by hand, so it gets a live test: point the
// scripts at a copy of the tree whose German file carries an XML-only translation, and apply must exit
// non-zero without writing.
{
  const tmp = fs.mkdtempSync("/tmp/emig-i18n-");
  fs.mkdirSync(`${tmp}/i18n`);
  fs.mkdirSync(`${tmp}/text/de_de`, { recursive: true });
  fs.mkdirSync(`${tmp}/scripts`);
  for (const f of ["i18n_shared.mjs", "i18n_apply.mjs"]) fs.copyFileSync(`scripts/${f}`, `${tmp}/scripts/${f}`);
  fs.writeFileSync(`${tmp}/i18n/i18n-source.json`, JSON.stringify({ LOC_X: "English text" }));
  fs.writeFileSync(`${tmp}/i18n/de_de.json`, JSON.stringify({}));
  for (const folder of Object.keys(LOCALES)) {
    fs.mkdirSync(`${tmp}/text/${folder}`, { recursive: true });
    fs.writeFileSync(`${tmp}/text/${folder}/ModText.xml`,
      `<Database><LocalizedText><Replace Tag="LOC_X" Language="x"><Text>English text</Text></Replace></LocalizedText></Database>`);
  }
  // German alone carries a real translation that the map does not know about.
  const german = `<Database><LocalizedText><Replace Tag="LOC_X" Language="de_DE"><Text>Deutscher Text</Text></Replace></LocalizedText></Database>`;
  fs.writeFileSync(`${tmp}/text/de_de/ModText.xml`, german);

  let exitCode = 0;
  let stderr = "";
  try {
    execFileSync(process.execPath, ["scripts/i18n_apply.mjs"], { cwd: tmp, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    exitCode = e.status;
    stderr = String(e.stderr || "");
  }
  assert.equal(exitCode, 1, "apply exits non-zero rather than overwriting a translation it cannot see");
  assert.ok(/REFUSING/.test(stderr), "and says so plainly");
  assert.ok(/i18n_ingest/.test(stderr), "naming the command that folds the translation in first");
  assert.equal(fs.readFileSync(`${tmp}/text/de_de/ModText.xml`, "utf8"), german, "the file is left untouched");

  // With --force it writes, because losing them is then the stated intent.
  execFileSync(process.execPath, ["scripts/i18n_apply.mjs", "--force"], { cwd: tmp, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.ok(!/Deutscher Text/.test(fs.readFileSync(`${tmp}/text/de_de/ModText.xml`, "utf8")), "--force replaces it with English");
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("i18n-pipeline tests passed");
