import { spawnSync } from "node:child_process";

const json = process.argv.includes("--json");

const res = spawnSync("npm", ["audit", "--json"], {
  encoding: "utf8",
  shell: process.platform === "win32"
});

let high = null;
let critical = null;
let parseError = null;

try {
  const payload = JSON.parse(res.stdout || "{}");
  const v = payload.metadata && payload.metadata.vulnerabilities
    ? payload.metadata.vulnerabilities : {};
  high = Number(v.high || 0);
  critical = Number(v.critical || 0);
} catch (e) {
  parseError = String(e && e.message ? e.message : e);
}

const value = high != null && critical != null ? high + critical : null;
const result = {
  metric: "dependency_high_critical_vulnerability_count",
  value,
  high,
  critical,
  npmAuditExitCode: res.status,
  parseError,
  measuredAt: new Date().toISOString()
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`dependency_high_critical_vulnerability_count=${value}`);
  console.log(`high=${high} critical=${critical} npm_audit_exit=${res.status}`);
  if (parseError) console.log(`parse_error=${parseError}`);
}

process.exit(parseError ? 2 : 0);
