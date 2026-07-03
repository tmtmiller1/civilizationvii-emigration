import fs from "node:fs";
import path from "node:path";

const asJson = process.argv.includes("--json");
const asCheck = process.argv.includes("--check"); // gate mode: exit non-zero below 100% pass
const modsDir = path.join(process.env.HOME || "", "Library/Application Support/Civilization VII/Mods");
const token = /LOC_EMIG|\bEMIG_[A-Z0-9_]+\b/g;

function walk(dir, out) {
  const ents = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(xml|modinfo|sql|js|md)$/i.test(e.name)) out.push(p);
  }
}

let checked = 0;
let failed = 0;
const collisions = [];
if (fs.existsSync(modsDir)) {
  const mods = fs.readdirSync(modsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.toLowerCase() !== "emigration")
    .map((d) => d.name);
  for (const mod of mods) {
    checked += 1;
    const files = [];
    const root = path.join(modsDir, mod);
    walk(root, files);
    let hit = false;
    for (const f of files) {
      const txt = fs.readFileSync(f, "utf8");
      token.lastIndex = 0;
      if (token.test(txt)) {
        hit = true;
        break;
      }
    }
    if (hit) {
      failed += 1;
      collisions.push(mod);
    }
  }
}

const passPct = checked > 0 ? Number((((checked - failed) / checked) * 100).toFixed(2)) : 100;
const out = {
  metric: "compat_matrix_smoke_pass_percent",
  checked,
  failed,
  value: passPct,
  collisions,
  measuredAt: new Date().toISOString(),
  note: "Static namespace-collision smoke across installed local mods (EMIG token scan)."
};
if (asJson) console.log(JSON.stringify(out, null, 2));
else console.log(`value=${passPct}`);

if (asCheck && passPct < 100) {
  console.error(`compat_matrix_smoke_pass_percent=${passPct} (expected 100) — namespace collisions: ${collisions.join(", ")}`);
  process.exit(1);
}
