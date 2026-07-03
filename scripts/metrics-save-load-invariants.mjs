import { spawnSync } from "node:child_process";

const asJson = process.argv.includes("--json");
const asCheck = process.argv.includes("--check"); // gate mode: exit non-zero on any mismatch
const checks = [
  "./tests/state-branches.mjs",
  "./tests/persistence-normalization.mjs",
  "./tests/transit-defers-persistence.mjs"
];

let mismatches = 0;
const results = [];
for (const t of checks) {
  const r = spawnSync("node", ["--loader", "./tests/loader.mjs", t], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  const ok = r.status === 0;
  if (!ok) mismatches += 1;
  results.push({ test: t, pass: ok });
}

const out = {
  metric: "save_load_invariant_mismatch_count",
  value: mismatches,
  checks: results,
  measuredAt: new Date().toISOString(),
  note: "Mismatch count derived from dedicated persistence invariant harnesses."
};

if (asJson) console.log(JSON.stringify(out, null, 2));
else console.log(`value=${mismatches}`);

if (asCheck && mismatches > 0) {
  console.error(`save_load_invariant_mismatch_count=${mismatches} (expected 0) — failing persistence harnesses:`);
  for (const r of results) if (!r.pass) console.error(`  ${r.test}`);
  process.exit(1);
}
