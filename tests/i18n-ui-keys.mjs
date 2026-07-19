// i18n-ui-keys.mjs
//
// Drift guard: every mod-owned LOC_ key that the runtime UI (ui/**/*.js) passes to loc()/tr()/pick()
// or a spec field MUST be defined in text/en_us/ModText.xml. The existing gates check that DATA-XML
// LOC references resolve (validate-package) and that every en_us key exists in all 11 locales (i18n),
// but nothing checked that a key REFERENCED FROM JS actually exists, so a typo'd or never-authored key
// silently fell back to English forever (and never got translated). This closes that gap.
//
// Ownership boundary: a "mod-owned" key is one whose token contains EMIG (the namespace invariant from
// validate-package: LOC_EMIG_*, LOC_OPTIONS_EMIG*, LOC_DEMOGRAPHICS_METRIC_EMIG*, …). Host-owned keys
// the mod merely references (e.g. LOC_DEMOGRAPHICS_NYI from the Demographics mod) are out of scope.
//
// Dynamic keys: a literal ending in "_" is a concatenation prefix ("LOC_EMIG_HINT_" + cause) and a
// template-interpolated key ("`LOC_..._${x}`") never matches as a whole token — both are skipped, since
// their concrete keys can't be enumerated statically. Add exact keys to ALLOW only for a deliberate
// externally-defined exception.
//
// Run as a plain node script (no engine loader): `node ./tests/i18n-ui-keys.mjs`.

import fs from "node:fs";
import path from "node:path";

const UI_DIR = "ui";
const EN_US = "text/en_us/ModText.xml";

// Exact keys referenced from JS but intentionally defined elsewhere (none today; kept for future use).
const ALLOW = new Set([]);

const read = (p) => fs.readFileSync(p, "utf8");

function walk(dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

// Defined en_us tags.
const defined = new Set([...read(EN_US).matchAll(/<Row\s+Tag="([^"]+)"/g)].map((m) => m[1]));

// Collect (key -> first file) for every quoted/backticked LOC_ literal in ui/.
const refs = new Map();
for (const file of walk(UI_DIR)) {
  const src = read(file);
  for (const m of src.matchAll(/['"`](LOC_[A-Z0-9_]+)['"`]/g)) {
    const key = m[1];
    if (!refs.has(key)) refs.set(key, file);
  }
}

// A key is checkable when it is mod-owned (carries EMIG), is not a dynamic concatenation prefix
// (trailing "_"), and is not explicitly allow-listed as externally defined.
const missing = [];
for (const [key, file] of refs) {
  if (!key.includes("EMIG")) continue;
  if (key.endsWith("_")) continue;
  if (ALLOW.has(key)) continue;
  if (!defined.has(key)) missing.push({ key, file });
}

const checked = [...refs.keys()].filter((k) => k.includes("EMIG") && !k.endsWith("_") && !ALLOW.has(k)).length;

if (missing.length) {
  console.error(`❌ i18n-ui-keys FAILED: ${missing.length} JS-referenced LOC key(s) missing from en_us:`);
  for (const { key, file } of missing.sort((a, b) => a.key.localeCompare(b.key))) {
    console.error(`   - ${key}  (first seen in ${file})`);
  }
  console.error("   Add each to text/en_us/ModText.xml (+ all 11 locales), or fix the reference.");
  process.exit(1);
}

console.log(`  ok   i18n-ui-keys, ${checked} mod-owned LOC keys referenced in ui/ all defined in en_us`);
