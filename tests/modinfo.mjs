import assert from "node:assert/strict";
import fs from "node:fs";

// modinfo manifest-completeness gate. NOTE: Civ VII resolves a mod's own `/emigration/…` imports
// from its deployed file tree, so an import whose target isn't in <ImportFiles> still loads , this
// is NOT a load-failure guard. It's hygiene: it keeps each scope's manifest a complete, accurate
// inventory of the JS it pulls in, so the modinfo doesn't silently rot when a module is split into
// helpers (e.g. engine→pull/state, effects→dividend/migrant-units, main→log/report). The invariant
// is per-scope import-CLOSURE: within a scope, every same-mod module imported by any declared module
// must itself be declared in that scope (UIScripts ∪ ImportFiles both populate the VFS). We close
// over the whole declared set, not just the UIScript entry points, so helpers pulled in by any
// declared module are covered. JSDoc `import("…")` type refs are erased at runtime , comments are
// stripped before scanning so they're correctly ignored. Every declared .js Item must also exist.

const MOD = "emigration";
const PREFIX = `/${MOD}/`;
const VFS = (p) => `/${MOD}/` + p.replace(/^\.?\//, "");
const DISK = (id) => id.replace(PREFIX, "");

// ── Import graph over ui/**.js (comments stripped → no JSDoc type imports) ─
function listJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = `${dir}/${d.name}`;
    return d.isDirectory() ? listJs(p) : d.name.endsWith(".js") ? [p] : [];
  });
}
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const graph = new Map();
for (const f of listJs("ui")) {
  const code = stripComments(fs.readFileSync(f, "utf8"));
  const deps = new Set();
  // static `from "…"`, bare `import "…"`, dynamic `import("…")` , same-mod .js only
  for (const m of code.matchAll(/(?:from|import)\s*\(?\s*"(\/[^"]+\.js)"/g)) {
    if (m[1].startsWith(PREFIX)) deps.add(m[1]);
  }
  graph.set(VFS(f), [...deps]);
}

// ── Per-scope declarations ────────────────────────────────────────────────
const modinfo = fs.readFileSync("emigration.modinfo", "utf8");
const groupBlock = (id) =>
  (modinfo.match(new RegExp(`<ActionGroup id="${id}"[\\s\\S]*?</ActionGroup>`)) || [""])[0];
const itemsIn = (block, tag) => {
  const sec = block.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`));
  if (!sec) return [];
  return [...sec[0].matchAll(/<Item(?:\s+locale="[^"]+")?>([^<]+)<\/Item>/g)]
    .map((m) => m[1])
    .filter((x) => x.endsWith(".js"))
    .map((x) => VFS(x));
};

// scope → the ActionGroup ids whose UI scripts run in it
const SCOPES = {
  shell: ["emigration-shell"],
  game: ["emigration-game"]
};

let totalDeclared = 0;
for (const [scope, groups] of Object.entries(SCOPES)) {
  const declared = new Set();
  for (const g of groups) {
    const b = groupBlock(g);
    assert.ok(b, `modinfo has no ActionGroup id="${g}"`);
    [...itemsIn(b, "UIScripts"), ...itemsIn(b, "ImportFiles")].forEach((x) => declared.add(x));
  }
  // import-closure within the scope
  const missing = new Set();
  const frontier = [...declared];
  while (frontier.length) {
    const id = frontier.pop();
    for (const t of graph.get(id) || []) {
      if (!declared.has(t) && !missing.has(t)) {
        missing.add(t);
        frontier.push(t);
      }
    }
  }
  const missingList = [...missing].map(DISK).sort();
  assert.equal(
    missingList.length,
    0,
    `${scope} scope: ${missingList.length} imported module(s) not declared , add to <ImportFiles> ` +
      `of the ${scope} ActionGroup so the manifest stays complete: ${missingList.join(", ")}`
  );
  totalDeclared += declared.size;
}

// ── Every declared/referenced .js Item must exist on disk ─────────────────
const allItems = [...modinfo.matchAll(/<Item(?:\s+locale="[^"]+")?>([^<]+\.js)<\/Item>/g)].map(
  (m) => m[1]
);
const ghosts = allItems.filter((p) => !fs.existsSync(p));
assert.equal(ghosts.length, 0, `modinfo references missing file(s): ${ghosts.join(", ")}`);

console.log(
  `modinfo harness passed (${Object.keys(SCOPES).length} scopes, ${totalDeclared} declared ` +
    `module-slots import-closed, ${allItems.length} script Items all present)`
);
