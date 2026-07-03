import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const runsIdx = args.indexOf("--runs");
const runs = runsIdx >= 0 ? Math.max(1, Number(args[runsIdx + 1]) || 5) : 5;
const asJson = args.includes("--json");
const asCheck = args.includes("--check"); // gate mode: exit non-zero below 100% match

let pass = 0;
for (let i = 0; i < runs; i++) {
  const r = spawnSync("node", ["--loader", "./tests/loader.mjs", "./tests/engine-pass.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  if (r.status === 0) pass += 1;
}

const rate = Number(((pass / runs) * 100).toFixed(2));
const out = {
  metric: "determinism_replay_match_rate_percent",
  runs,
  passes: pass,
  value: rate,
  measuredAt: new Date().toISOString(),
  note: "Replay characterization via repeated deterministic engine-pass scenario execution."
};

if (asJson) console.log(JSON.stringify(out, null, 2));
else console.log(`value=${rate}`);

if (asCheck && rate < 100) {
  console.error(`determinism_replay_match_rate_percent=${rate} (expected 100) — ${runs - pass}/${runs} replay runs diverged.`);
  process.exit(1);
}
