import { spawnSync } from "node:child_process";

const json = process.argv.includes("--json");
const maxThreshold = 10;

const res = spawnSync("npx", ["eslint", "ui", "-f", "json"], {
  encoding: "utf8",
  shell: process.platform === "win32"
});

let count = null;
let parseError = null;

try {
  const rows = JSON.parse(res.stdout || "[]");
  let c = 0;
  for (const file of rows) {
    const msgs = Array.isArray(file.messages) ? file.messages : [];
    for (const m of msgs) {
      if (m && m.ruleId === "complexity") c += 1;
    }
  }
  count = c;
} catch (e) {
  parseError = String(e && e.message ? e.message : e);
}

const result = {
  metric: "high_complexity_function_count_gt10",
  threshold: maxThreshold,
  value: count,
  eslintExitCode: res.status,
  parseError,
  measuredAt: new Date().toISOString()
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`high_complexity_function_count_gt10=${count}`);
  console.log(`eslint_exit=${res.status}`);
  if (parseError) console.log(`parse_error=${parseError}`);
}

process.exit(parseError ? 2 : 0);
