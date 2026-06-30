// Glob test runner (M2). Discovers and runs every tests/*.mjs through the ESM loader, so "run all the
// tests" needs no hand-maintained &&-chain. This is the convenience entry (`npm run test:all`); the
// authoritative gate that NOTHING is silently skipped lives in scripts/required-scripts-gate.mjs,
// which fails if any tests/*.mjs is not wired into the verify / test:js chains.
//
// The node-only suites (modinfo/i18n/no-empty-catch/validate-package) don't import /emigration/
// specifiers, so the loader is a harmless passthrough for them - running everything uniformly is safe.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const testDir = path.join(root, "tests");

// Helper modules that are imported BY tests, not run as tests themselves.
const HELPERS = new Set(["loader.mjs", "dom-stub.mjs", "core-stub.mjs"]);

const files = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith(".mjs") && !HELPERS.has(f))
  .sort();

// The --loader specifier must be a relative URL-ish path (a bare "tests/loader.mjs" is read as a
// package name), so keep the explicit "./" prefix.
const loader = "./tests/loader.mjs";
const failures = [];
let passed = 0;

for (const file of files) {
  const res = spawnSync(
    process.execPath,
    ["--loader", loader, `./tests/${file}`],
    { cwd: root, encoding: "utf8" }
  );
  // The loader prints an ExperimentalWarning to stderr on every run; only a non-zero exit is a failure.
  if (res.status === 0) {
    passed += 1;
  } else {
    failures.push(file);
    process.stdout.write(`FAIL ${file}\n`);
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
  }
}

if (failures.length) {
  process.stdout.write(`\n${failures.length}/${files.length} suites FAILED: ${failures.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(`run-tests: all ${passed} suites passed\n`);
