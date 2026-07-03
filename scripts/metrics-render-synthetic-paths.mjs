import { spawnSync } from "node:child_process";

const asJson = process.argv.includes("--json");
const asCheck = process.argv.includes("--check"); // gate mode: exit non-zero below 100% pass
const tests = [
  "./tests/network-subview.mjs",
  "./tests/screen-contract.mjs",
  "./tests/screen-branches.mjs",
  "./tests/screen-lifecycle-branches.mjs",
  "./tests/window-state.mjs",
  "./tests/views-render-branches.mjs",
  "./tests/migration-page.mjs",
  "./tests/city-panel.mjs",
  "./tests/city-readout-panel.mjs"
];

let pass = 0;
for (const t of tests) {
  const r = spawnSync("node", ["--loader", "./tests/loader.mjs", t], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  if (r.status === 0) pass += 1;
}

const value = Number(((pass / tests.length) * 100).toFixed(2));
const out = {
  metric: "render_layer_synthetic_path_pass_rate_percent",
  tests: tests.length,
  passes: pass,
  value,
  measuredAt: new Date().toISOString(),
  note: "Synthetic render-path confidence from UI harness subset excluded from c8 instrumentation."
};

if (asJson) console.log(JSON.stringify(out, null, 2));
else console.log(`value=${value}`);

if (asCheck && value < 100) {
  console.error(`render_layer_synthetic_path_pass_rate_percent=${value} (expected 100) — ${tests.length - pass}/${tests.length} render paths failed.`);
  process.exit(1);
}
