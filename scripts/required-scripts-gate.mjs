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
  "release:gate"
];

const requiredVerifyRuns = [
  "test:chronicle",
  "test:return",
  "test:dilemma",
  "test:ethnicity-distribution",
  "test:perf-budget",
  "test:screen-lifecycle-branches"
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

console.log("required-scripts-gate passed");
