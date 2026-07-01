import fs from "node:fs";
import path from "node:path";

const pkgPath = path.resolve(process.cwd(), "package.json");
const raw = fs.readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(raw);
const scripts = pkg && pkg.scripts ? pkg.scripts : {};

const requiredScripts = [
  "test:chronicle",
  "test:return",
  "test:dilemma",
  "test:ethnicity-distribution",
  "test:perf-budget",
  "test:screen-lifecycle-branches",
  // Previously-orphaned suites (M1): existed as scripts but ran in neither verify nor test:js.
  "test:civ-tuning-coverage",
  "test:hypotheticals",
  "test:window-state",
  "test:transit-defers-persistence",
  "release:gate"
];

const requiredVerifyRuns = [
  "test:chronicle",
  "test:return",
  "test:dilemma",
  "test:ethnicity-distribution",
  "test:perf-budget",
  "test:screen-lifecycle-branches",
  // M1: gate now enforces these stay in the verify chain, not just exist as scripts.
  "test:civ-tuning-coverage",
  "test:hypotheticals",
  "test:window-state",
  "test:transit-defers-persistence"
];

const missing = requiredScripts.filter((name) => !Object.prototype.hasOwnProperty.call(scripts, name));
if (missing.length) {
  console.error(`[required-scripts-gate] Missing scripts: ${missing.join(", ")}`);
  process.exit(1);
}

const verify = typeof scripts.verify === "string" ? scripts.verify : "";
const missingVerifyRuns = requiredVerifyRuns.filter((name) => !verify.includes(`npm run ${name}`));
if (missingVerifyRuns.length) {
  console.error(
    `[required-scripts-gate] verify is missing required runs: ${missingVerifyRuns.join(", ")}`
  );
  process.exit(1);
}

const releaseGate = typeof scripts["release:gate"] === "string" ? scripts["release:gate"] : "";
if (!releaseGate.includes("npm run verify") || !releaseGate.includes("npm run coverage")) {
  console.error("[required-scripts-gate] release:gate must include both 'npm run verify' and 'npm run coverage'.");
  process.exit(1);
}

// ── Anti-drift coverage gate (M2) ───────────────────────────────────────────────────────────────
// EVERY test file under tests/*.mjs must be run by some `test:*` script that is itself wired into the
// verify chain OR the test:js chain (release:gate runs both, verify directly, test:js via coverage).
// This makes the M1 hazard structurally impossible: a test added to the folder but never wired in
// fails this gate instead of silently never running. Helpers (the loader + the stub modules) are
// excluded; the tests/stubs/ subdir isn't enumerated (non-recursive readdir).
const TEST_HELPERS = new Set(["loader.mjs", "dom-stub.mjs", "core-stub.mjs"]);
const testDir = path.resolve(path.dirname(pkgPath), "tests");
const testJs = typeof scripts["test:js"] === "string" ? scripts["test:js"] : "";
const testScriptNames = Object.keys(scripts).filter((n) => n.startsWith("test:"));

/**
 * Whether a test file is run by a `test:*` script that is invoked in the verify or test:js chain.
 * @param {string} file A `tests/*.mjs` basename.
 * @returns {boolean} True when the file is reachable from an aggregate chain.
 */
function fileIsWired(file) {
  const runners = testScriptNames.filter((n) => (scripts[n] || "").includes(`tests/${file}`));
  return runners.some((n) => verify.includes(`npm run ${n}`) || testJs.includes(`npm run ${n}`));
}

const testFiles = fs.readdirSync(testDir).filter((f) => f.endsWith(".mjs") && !TEST_HELPERS.has(f));
const orphanTests = testFiles.filter((f) => !fileIsWired(f));
if (orphanTests.length) {
  console.error(
    "[required-scripts-gate] test files not wired into verify or test:js (add a test:* script and " +
    `chain it in): ${orphanTests.join(", ")}`
  );
  process.exit(1);
}

console.log(`required-scripts-gate passed (${testFiles.length} test files all wired)`);
