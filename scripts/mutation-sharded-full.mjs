import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const SHARDS = [
  { name: "engine", file: "ui/emigration-engine.js" },
  { name: "effects", file: "ui/emigration-effects.js" },
  { name: "borders", file: "ui/emigration-borders.js" },
  { name: "geography", file: "ui/emigration-geography.js" },
  { name: "prosperity", file: "ui/emigration-prosperity.js" }
];

function nowRunId() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function upsertModule(runMeta, moduleEntry) {
  const i = runMeta.modules.findIndex((m) => m?.name === moduleEntry?.name);
  if (i >= 0) runMeta.modules[i] = moduleEntry;
  else runMeta.modules.push(moduleEntry);
}

function parseArgs(argv) {
  const args = {
    force: false,
    runId: nowRunId(),
    only: null
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") args.force = true;
    else if (a === "--run-id") args.runId = argv[++i];
    else if (a === "--module") args.only = argv[++i];
  }
  return args;
}

function gitCommit() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}

function resolveShardFilter(only) {
  if (!only) return SHARDS;
  const needle = only.toLowerCase();
  const picked = SHARDS.filter((s) => s.name === needle || s.file.toLowerCase() === needle);
  if (!picked.length) {
    throw new Error(`Unknown module '${only}'. Valid names: ${SHARDS.map((s) => s.name).join(", ")}`);
  }
  return picked;
}

function runStryker(configPath) {
  const exe = process.platform === "win32" ? "npx.cmd" : "npx";
  return spawnSync(exe, ["--no-install", "stryker", "run", configPath], {
    cwd: repoRoot,
    stdio: "inherit",
    encoding: "utf8"
  });
}

function main() {
  const args = parseArgs(process.argv);
  const selected = resolveShardFilter(args.only);

  const reportsDir = path.join(repoRoot, "reports", "mutation", "shards");
  const runsDir = path.join(reportsDir, "runs");
  const tmpDir = path.join(reportsDir, "tmp");
  fs.mkdirSync(runsDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const baseConfigPath = path.join(repoRoot, "stryker.config.json");
  const baseConfig = readJson(baseConfigPath);

  const runMetaPath = path.join(runsDir, `${args.runId}.json`);
  const runMeta = fs.existsSync(runMetaPath)
    ? readJson(runMetaPath)
    : {
        run_id: args.runId,
        commit: gitCommit(),
        created_at: new Date().toISOString(),
        full_suite_command: baseConfig?.commandRunner?.command || "npm run test:js",
        modules: []
      };

  if (!Array.isArray(runMeta.modules)) runMeta.modules = [];
  if (!runMeta.commit) runMeta.commit = gitCommit();
  if (!runMeta.full_suite_command) runMeta.full_suite_command = baseConfig?.commandRunner?.command || "npm run test:js";

  for (const shard of selected) {
    const reportRel = `reports/mutation/shards/${shard.name}.json`;
    const reportAbs = path.join(repoRoot, reportRel);
    if (!args.force && fs.existsSync(reportAbs)) {
      console.log(`skip ${shard.name}: existing report ${reportRel}`);
      upsertModule(runMeta, {
        name: shard.name,
        file: shard.file,
        report: reportRel,
        skipped_existing: true,
        completed_at: new Date().toISOString()
      });
      writeJson(runMetaPath, runMeta);
      continue;
    }

    const shardCfg = {
      ...baseConfig,
      mutate: [shard.file],
      reporters: ["clear-text", "json"],
      jsonReporter: { fileName: reportRel }
    };
    const cfgPath = path.join(tmpDir, `stryker-${args.runId}-${shard.name}.json`);
    writeJson(cfgPath, shardCfg);

    console.log(`run ${shard.name}: ${shard.file}`);
    const res = runStryker(cfgPath);
    if (res.status !== 0) {
      upsertModule(runMeta, {
        name: shard.name,
        file: shard.file,
        report: reportRel,
        exit_code: res.status,
        failed_at: new Date().toISOString()
      });
      writeJson(runMetaPath, runMeta);
      throw new Error(`Shard '${shard.name}' failed with exit code ${res.status}`);
    }
    upsertModule(runMeta, {
      name: shard.name,
      file: shard.file,
      report: reportRel,
      exit_code: 0,
      completed_at: new Date().toISOString()
    });
    writeJson(runMetaPath, runMeta);
  }

  runMeta.finished_at = new Date().toISOString();
  writeJson(runMetaPath, runMeta);
  console.log(`sharded mutation run complete: reports/mutation/shards/runs/${args.runId}.json`);
}

main();