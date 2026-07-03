import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const out = { runs: 3, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--runs" && i + 1 < argv.length) {
      out.runs = Math.max(1, Number(argv[++i]) || 3);
    } else if (a === "--json") {
      out.json = true;
    }
  }
  return out;
}

const { runs, json } = parseArgs(process.argv.slice(2));

let passes = 0;
let fails = 0;
for (let i = 1; i <= runs; i++) {
  const res = spawnSync("npm", ["run", "verify"], {
    stdio: "pipe",
    encoding: "utf8",
    shell: process.platform === "win32"
  });
  if (res.status === 0) {
    passes += 1;
  } else {
    fails += 1;
  }
  process.stdout.write(`run ${i}/${runs}: ${res.status === 0 ? "pass" : "fail"}\n`);
}

const failureRatePct = Number(((fails / runs) * 100).toFixed(2));
const flakinessPct = passes > 0 && fails > 0 ? failureRatePct : 0;
const result = {
  metric: "test_flakiness_percent",
  runs,
  passes,
  fails,
  failureRatePct,
  value: flakinessPct,
  definition: "Percent of runs that fail in a mixed pass/fail run-set; 0 when all pass or all fail.",
  measuredAt: new Date().toISOString()
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`runs=${runs} passes=${passes} fails=${fails}`);
  console.log(`failure_rate_pct=${failureRatePct}`);
  console.log(`test_flakiness_percent=${result.value}`);
}

process.exit(fails > 0 && passes === 0 ? 1 : 0);
