import { spawnSync } from "node:child_process";

function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[i].toFixed(2));
}

const args = process.argv.slice(2);
const runsIdx = args.indexOf("--runs");
const runs = runsIdx >= 0 ? Math.max(1, Number(args[runsIdx + 1]) || 5) : 5;
const asJson = args.includes("--json");

const samples = [];
let failures = 0;
for (let i = 0; i < runs; i++) {
  const t0 = Date.now();
  const r = spawnSync("node", ["--loader", "./tests/loader.mjs", "./tests/perf-budget.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  const dt = Date.now() - t0;
  samples.push(dt);
  if (r.status !== 0) failures += 1;
}

const sorted = samples.slice().sort((a, b) => a - b);
const out = {
  metric: "runtime_turn_latency_ms",
  runs,
  failures,
  p95_ms: pct(sorted, 95),
  p99_ms: pct(sorted, 99),
  avg_ms: Number((samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(2)),
  measuredAt: new Date().toISOString(),
  note: "Measured as wall-clock runtime of perf-budget harness; integration signal for turn-path latency."
};

if (asJson) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`p95_ms=${out.p95_ms}`);
  console.log(`p99_ms=${out.p99_ms}`);
  console.log(`avg_ms=${out.avg_ms}`);
  console.log(`failures=${failures}`);
}

process.exit(0);
