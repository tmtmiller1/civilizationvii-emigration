import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const RUNS_DIR = path.join(repoRoot, "reports", "mutation", "shards", "runs");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function latestRunId() {
  if (!fs.existsSync(RUNS_DIR)) return null;
  const files = fs.readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json"));
  if (!files.length) return null;
  files.sort((a, b) => {
    const ma = fs.statSync(path.join(RUNS_DIR, a)).mtimeMs;
    const mb = fs.statSync(path.join(RUNS_DIR, b)).mtimeMs;
    return mb - ma;
  });
  return files[0].replace(/\.json$/, "");
}

function classify(status) {
  if (status === "Killed") return "killed";
  if (status === "TimedOut") return "timeout";
  if (status === "Survived") return "survived";
  if (status === "NoCoverage") return "no_coverage";
  return "errors";
}

function summarizeReport(reportPath) {
  const json = readJson(reportPath);
  const files = json.files || {};
  const out = {
    killed: 0,
    timeout: 0,
    survived: 0,
    no_coverage: 0,
    errors: 0,
    total: 0
  };

  for (const f of Object.values(files)) {
    const muts = Array.isArray(f?.mutants) ? f.mutants : [];
    for (const m of muts) {
      const bucket = classify(m?.status);
      out[bucket] += 1;
      out.total += 1;
    }
  }

  out.score = out.total ? Number((((out.killed + out.timeout) / out.total) * 100).toFixed(2)) : null;
  return out;
}

function parseArgs(argv) {
  const args = {
    runId: null,
    asJson: false
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--run-id") args.runId = argv[++i];
    else if (a === "--json") args.asJson = true;
  }
  return args;
}

export function loadAuthoritativeMutation(args = {}) {
  const runId = args.runId || latestRunId();
  if (!runId) throw new Error("No shard runs found. Run mutation shards first.");

  const runPath = path.join(RUNS_DIR, `${runId}.json`);
  if (!fs.existsSync(runPath)) throw new Error(`Run metadata not found: ${runPath}`);
  const run = readJson(runPath);
  const modules = Array.isArray(run.modules) ? run.modules : [];
  if (!modules.length) throw new Error("Run metadata has no modules.");

  const byModule = {};
  let aggKilled = 0;
  let aggTimeout = 0;
  let aggSurvived = 0;
  let aggNoCov = 0;
  let aggErrors = 0;
  let aggTotal = 0;

  for (const m of modules) {
    const reportAbs = path.join(repoRoot, m.report);
    if (!fs.existsSync(reportAbs)) throw new Error(`Missing shard report: ${m.report}`);
    const s = summarizeReport(reportAbs);
    byModule[m.file] = {
      name: m.name,
      file: m.file,
      report: m.report,
      score: s.score,
      killed: s.killed,
      timeout: s.timeout,
      survived: s.survived,
      no_coverage: s.no_coverage,
      errors: s.errors,
      total: s.total
    };
    aggKilled += s.killed;
    aggTimeout += s.timeout;
    aggSurvived += s.survived;
    aggNoCov += s.no_coverage;
    aggErrors += s.errors;
    aggTotal += s.total;
  }

  return {
    metric: "mutation_score",
    method: "full-suite-sharded-weighted-same-run",
    run_id: runId,
    commit: run.commit || "unknown",
    collected_at: run.finished_at || run.created_at || new Date().toISOString(),
    modules: byModule,
    totals: {
      killed: aggKilled,
      timeout: aggTimeout,
      survived: aggSurvived,
      no_coverage: aggNoCov,
      errors: aggErrors,
      total: aggTotal
    },
    value: aggTotal ? Number((((aggKilled + aggTimeout) / aggTotal) * 100).toFixed(2)) : null
  };
}

function main() {
  const args = parseArgs(process.argv);
  const out = loadAuthoritativeMutation({ runId: args.runId });
  if (args.asJson) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`run_id=${out.run_id}`);
  console.log(`commit=${out.commit}`);
  console.log(`value=${out.value}`);
  for (const m of Object.values(out.modules)) {
    console.log(`${m.name}: ${m.score} (${m.killed + m.timeout}/${m.total})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}