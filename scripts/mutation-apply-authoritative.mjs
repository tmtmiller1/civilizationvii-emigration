import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAuthoritativeMutation } from "./metrics-mutation-authoritative.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baselinePath = path.resolve(
  __dirname,
  "../../../mods_quality_analyses/emigration-quality-analysis/quality-ratchet-baseline.json"
);

function parseArgs(argv) {
  const args = { runId: null, allowPartial: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--run-id") args.runId = argv[++i];
    else if (argv[i] === "--allow-partial") args.allowPartial = true;
  }
  return args;
}

function statusFor(metric) {
  if (metric?.operator === ">=") return metric.value >= metric.threshold ? "active_on_target" : "active_below_target";
  if (metric?.operator === "<=") return metric.value <= metric.threshold ? "active_on_target" : "active_above_target";
  if (metric?.operator === "==") return metric.value === metric.threshold ? "active_on_target" : "active_off_target";
  return metric.status || "active_off_target";
}

function updateTrend(metric, asOf, value) {
  if (!metric.trend) metric.trend = { points: [] };
  if (!Array.isArray(metric.trend.points)) metric.trend.points = [];
  const exists = metric.trend.points.some((p) => p && p.as_of === asOf);
  if (!exists) metric.trend.points.push({ as_of: asOf, value });
}

function main() {
  const args = parseArgs(process.argv);
  const auth = loadAuthoritativeMutation({ runId: args.runId });

  const requiredFiles = [
    "ui/emigration-engine.js",
    "ui/emigration-prosperity.js",
    "ui/emigration-geography.js",
    "ui/emigration-effects.js",
    "ui/emigration-borders.js"
  ];
  const missing = requiredFiles.filter((f) => auth.modules[f] == null);
  if (missing.length && !args.allowPartial) {
    throw new Error(
      `Refusing to apply partial authoritative run '${auth.run_id}'. Missing modules: ${missing.join(", ")}. ` +
        "If intentional, re-run with --allow-partial."
    );
  }

  const raw = fs.readFileSync(baselinePath, "utf8");
  const j = JSON.parse(raw);
  const metrics = j.metrics || {};

  const asOf = new Date(auth.collected_at).toISOString();

  if (!metrics.mutation_score) {
    throw new Error("mutation_score metric missing from baseline");
  }

  metrics.mutation_score.value = auth.value;
  metrics.mutation_score.maturity = "measured";
  metrics.mutation_score.status = statusFor(metrics.mutation_score);
  metrics.mutation_score.collection_command = "npm run mutation:shards && npm run metrics:mutation:authoritative";
  metrics.mutation_score.collection_scope = "full-suite sharded run across engine/effects/borders/geography/prosperity, weighted by mutants";
  metrics.mutation_score.source = `reports/mutation/shards/runs/${auth.run_id}.json @ ${auth.commit}`;
  metrics.mutation_score.note = "Authoritative weighted score from same-run full-suite shard artifacts.";
  const prevPerModule = metrics.mutation_score.per_module || {};
  const prevPerModuleAsof = metrics.mutation_score.per_module_asof || {};
  metrics.mutation_score.per_module = {
    "emigration-engine.js": auth.modules["ui/emigration-engine.js"]?.score ?? prevPerModule["emigration-engine.js"] ?? null,
    "emigration-prosperity.js": auth.modules["ui/emigration-prosperity.js"]?.score ?? prevPerModule["emigration-prosperity.js"] ?? null,
    "emigration-geography.js": auth.modules["ui/emigration-geography.js"]?.score ?? prevPerModule["emigration-geography.js"] ?? null,
    "emigration-effects.js": auth.modules["ui/emigration-effects.js"]?.score ?? prevPerModule["emigration-effects.js"] ?? null,
    "emigration-borders.js": auth.modules["ui/emigration-borders.js"]?.score ?? prevPerModule["emigration-borders.js"] ?? null
  };
  metrics.mutation_score.per_module_asof = {
    "emigration-engine.js": auth.modules["ui/emigration-engine.js"] ? asOf : prevPerModuleAsof["emigration-engine.js"] ?? asOf,
    "emigration-prosperity.js": auth.modules["ui/emigration-prosperity.js"] ? asOf : prevPerModuleAsof["emigration-prosperity.js"] ?? asOf,
    "emigration-geography.js": auth.modules["ui/emigration-geography.js"] ? asOf : prevPerModuleAsof["emigration-geography.js"] ?? asOf,
    "emigration-effects.js": auth.modules["ui/emigration-effects.js"] ? asOf : prevPerModuleAsof["emigration-effects.js"] ?? asOf,
    "emigration-borders.js": auth.modules["ui/emigration-borders.js"] ? asOf : prevPerModuleAsof["emigration-borders.js"] ?? asOf
  };
  updateTrend(metrics.mutation_score, asOf, auth.value);

  if (metrics.engine_mutation_score && auth.modules["ui/emigration-engine.js"]?.score != null) {
    metrics.engine_mutation_score.value = auth.modules["ui/emigration-engine.js"].score;
    metrics.engine_mutation_score.maturity = "measured";
    metrics.engine_mutation_score.status = statusFor(metrics.engine_mutation_score);
    metrics.engine_mutation_score.source = `reports/mutation/shards/engine.json via run ${auth.run_id}`;
    updateTrend(metrics.engine_mutation_score, asOf, metrics.engine_mutation_score.value);
  }

  j.metric_governance = j.metric_governance || {};
  j.metric_governance.refreshed_at = new Date().toISOString();

  fs.writeFileSync(baselinePath, JSON.stringify(j, null, 2) + "\n");
  console.log(`updated baseline from authoritative run ${auth.run_id}: mutation_score=${auth.value}`);
}

main();