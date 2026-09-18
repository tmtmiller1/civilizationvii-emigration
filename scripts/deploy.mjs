// deploy.mjs
//
// Copy every file the modinfo references into the game's Mods folder, and report anything that is missing
// or stale. Civ VII loads mods from copies, not symlinks, so an edit in the repo changes nothing in the game
// until it is synced -- and a file that never got copied is not a quiet no-op. A UI script whose import is
// missing fails to LOAD, which kills the whole entry point:
//
//     Failed to open file - .../Mods/emigration/ui/emigration-call-home.js
//     SOURCE ERROR - /emigration/ui/emigration-main.js
//
// That is not hypothetical. It happened on 2026-09-16: two new modules were written, imported from
// emigration-main.js and never deployed, so the entire gameplay bootstrap silently did not run in game while
// every test passed. Three probe runs were spent chasing the symptom before the log was read.
//
// Usage:  node scripts/deploy.mjs [--check]
//   (default)  sync anything missing or differing, and print what moved
//   --check    report only, exit 1 if anything is missing or stale (for use as a gate)
import { readFileSync, existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const MOD_ID = "emigration";
const REPO = resolve(dirname(new URL(import.meta.url).pathname), "..");
const DEST = process.env.CIV7_MODS
  ? join(process.env.CIV7_MODS, MOD_ID)
  : join(homedir(), "Library/Application Support/Civilization VII/Mods", MOD_ID);
const checkOnly = process.argv.includes("--check");

/** @returns {string[]} Every path the modinfo references, plus the modinfo itself. */
function referencedFiles() {
  const modinfo = join(REPO, `${MOD_ID}.modinfo`);
  const xml = readFileSync(modinfo, "utf8");
  // Match attributed items too: the translations are listed as <Item locale="de_DE">, and an earlier version of
  // this pattern (<Item> only) silently skipped all eleven of them, so every non-English locale stayed stale.
  const refs = [...xml.matchAll(/<(Item|File)(?:\s[^>]*)?>([^<]+)<\/\1>/g)].map((m) => m[2].trim());
  return [...new Set([...refs, `${MOD_ID}.modinfo`])];
}

/** @returns {boolean} Whether two files differ in size or content. */
function differs(a, b) {
  if (!existsSync(b)) return true;
  if (statSync(a).size !== statSync(b).size) return true;
  return !readFileSync(a).equals(readFileSync(b));
}

function main() {
  if (!existsSync(DEST)) {
    console.error(`deploy: no installed mod at ${DEST}`);
    console.error("deploy: set CIV7_MODS to the Mods folder if it lives elsewhere.");
    process.exit(1);
  }
  const missingFromRepo = [];
  const stale = [];
  for (const rel of referencedFiles()) {
    const src = join(REPO, rel);
    if (!existsSync(src)) {
      missingFromRepo.push(rel);
      continue;
    }
    if (differs(src, join(DEST, rel))) stale.push(rel);
  }

  for (const rel of missingFromRepo) console.error(`  MISSING FROM REPO  ${rel}`);
  for (const rel of stale) console.log(`  ${checkOnly ? "STALE" : "synced"}  ${rel}`);

  if (!checkOnly) {
    for (const rel of stale) {
      const dst = join(DEST, rel);
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(join(REPO, rel), dst);
    }
  }

  const bad = missingFromRepo.length > 0 || (checkOnly && stale.length > 0);
  console.log(`deploy: ${referencedFiles().length} referenced, ${stale.length} ${checkOnly ? "stale" : "synced"}`
    + `, ${missingFromRepo.length} missing from repo -> ${DEST}`);
  if (bad) process.exit(1);
}

main();
