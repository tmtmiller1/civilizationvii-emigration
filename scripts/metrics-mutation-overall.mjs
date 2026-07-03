import fs from "node:fs";

const asJson = process.argv.includes("--json");
const baselinePath = "../../../mods_quality_analyses/emigration-quality-analysis/quality-ratchet-baseline.json";

const raw = fs.readFileSync(new URL(baselinePath, import.meta.url), "utf8");
const j = JSON.parse(raw);
const mut = j.metrics && j.metrics.mutation_score ? j.metrics.mutation_score : null;
const per = mut && mut.per_module ? mut.per_module : {};

const vals = Object.values(per).filter((n) => typeof n === "number" && Number.isFinite(n));
const value = vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;

const out = {
  metric: "mutation_score",
  value,
  method: "unweighted-per-module-mean",
  modules: per,
  measuredAt: new Date().toISOString(),
  note: "Composite from current per-module mutation scores; modules may have mixed as-of dates."
};

if (asJson) console.log(JSON.stringify(out, null, 2));
else console.log(`value=${value}`);
