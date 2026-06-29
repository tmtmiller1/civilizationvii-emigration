import fs from "node:fs";
import path from "node:path";

const EMIGRATION_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CIV7_ROOT = path.resolve(EMIGRATION_ROOT, "..", "..", "civilization_vii_1.4.1_gamefiles");
const RESOURCES_ROOT = path.join(CIV7_ROOT, "Resources");

const OUTPUT_ROSTER = path.join(EMIGRATION_ROOT, "ui", "emigration-civ-roster.js");
const OUTPUT_JSON = path.join(EMIGRATION_ROOT, "analysis", "leader-civ-ability-matrix.json");
const OUTPUT_MD = path.join(
  EMIGRATION_ROOT,
  "..",
  "mods_research_and_analysis",
  "emigration-docs",
  "leader-civ-ability-matrix.md"
);
const TUNING_FILE = path.join(EMIGRATION_ROOT, "ui", "emigration-civ-tuning.js");

/** @param {string} dir */
function walkXmlFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkXmlFiles(full));
      continue;
    }
    if (entry.isFile() && full.endsWith(".xml")) out.push(full);
  }
  return out;
}

/** @param {string} attrs */
function parseAttrs(attrs) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const m of attrs.matchAll(/([A-Za-z0-9_:-]+)="([^"]*)"/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

/** @param {string} xml */
function parseRowTags(xml) {
  /** @type {Record<string, string>[]} */
  const rows = [];
  for (const m of xml.matchAll(/<Row\s+([^>]*?)\/>/g)) {
    rows.push(parseAttrs(m[1]));
  }
  return rows;
}

/**
 * @param {string} xml
 * @returns {Map<string, { effect: string, args: Record<string, string> }>}
 */
function parseModifiers(xml) {
  const out = new Map();
  for (const m of xml.matchAll(/<Modifier\s+([^>]*?)>([\s\S]*?)<\/Modifier>/g)) {
    const attrs = parseAttrs(m[1]);
    const id = attrs.id;
    const effect = attrs.effect || "";
    if (!id) continue;
    /** @type {Record<string, string>} */
    const args = {};
    for (const a of m[2].matchAll(/<Argument\s+name="([^"]+)"(?:[^>]*)>([^<]*)<\/Argument>/g)) {
      args[a[1]] = (a[2] || "").trim();
    }
    out.set(id, { effect, args });
  }
  return out;
}

/** @param {string} src */
function parseTuningKeys(src, exportName) {
  const re = new RegExp(`export\\s+const\\s+${exportName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`, "m");
  const m = src.match(re);
  if (!m) return new Set();
  const keys = new Set();
  for (const km of m[1].matchAll(/^[ \t]*([A-Z0-9_]+)\s*:/gm)) keys.add(km[1]);
  return keys;
}

/** @param {string} leader */
function normalizeLeader(leader) {
  return leader.replace(/_ALT$/, "");
}

/** @param {string[]} effects */
function classifyChannels(effects) {
  const blob = effects.join(" ");
  const up = blob.toUpperCase();
  /** @type {string[]} */
  const channels = [];
  if (/HAPPINESS|GOLDEN_AGE|CELEBRATION/.test(up)) channels.push("happiness");
  if (/YIELD_FOOD|GROWTH|POPULATION|SURPLUS_HAPPINESS/.test(up)) channels.push("growth");
  if (/SCIENCE/.test(up)) channels.push("science");
  if (/CULTURE/.test(up)) channels.push("culture");
  if (/GOLD|PURCHASE|TRADE|RESOURCE_CAP/.test(up)) channels.push("economy");
  if (/WAR|COMBAT|CONQUER|CAPTURE|RAZE|SIEGE|FORTIFICATION|DEFENSIVE/.test(up)) channels.push("war");
  if (/SPECIALIST|URBAN/.test(up)) channels.push("specialist");
  if (/SETTLEMENT|TOWN|CITY_HALL|OVER_SETTLEMENT_CAP/.test(up)) channels.push("settlement");
  return Array.from(new Set(channels));
}

/** @param {string[]} channels */
function riskTag(channels) {
  const set = new Set(channels);
  if ((set.has("happiness") && set.has("growth")) || (set.has("war") && set.has("economy"))) {
    return "high";
  }
  if (set.has("science") || set.has("specialist") || set.has("settlement")) return "medium";
  if (!channels.length) return "unknown";
  return "low";
}

const xmlFiles = walkXmlFiles(RESOURCES_ROOT);
const legacyFiles = xmlFiles.filter((f) => f.endsWith("civilizations-legacy.xml"));
const leaderFiles = xmlFiles.filter((f) => f.endsWith("leaders.xml"));
const civFiles = xmlFiles.filter((f) => /civilizations(-[a-z-]+)?\.xml$/.test(f));
const gameEffectsFiles = xmlFiles.filter((f) => /gameeffects/.test(path.basename(f)));
const mementoFiles = xmlFiles.filter((f) => f.endsWith("mementos.xml"));
const unlockFiles = xmlFiles.filter((f) => f.endsWith("unlocks.xml"));
const configFiles = xmlFiles.filter((f) => f.endsWith("/config/config.xml"));

/** @type {Map<string, { age: string, trait?: string }>} */
const civMap = new Map();
/** @type {Map<string, Set<string>>} */
const leaderPriorities = new Map();

for (const file of legacyFiles) {
  const xml = fs.readFileSync(file, "utf8");
  const rows = parseRowTags(xml);
  for (const row of rows) {
    if (row.CivilizationType && row.Age && !row.Leader) {
      const prev = civMap.get(row.CivilizationType);
      civMap.set(row.CivilizationType, { age: row.Age, trait: prev?.trait });
    }
    if (row.CivilizationType && row.TraitType && !row.Leader) {
      const prev = civMap.get(row.CivilizationType) || { age: "UNKNOWN" };
      civMap.set(row.CivilizationType, { ...prev, trait: row.TraitType });
    }
    if (row.Leader && row.CivilizationType) {
      const leader = normalizeLeader(row.Leader);
      const set = leaderPriorities.get(leader) || new Set();
      set.add(row.CivilizationType);
      leaderPriorities.set(leader, set);
    }
  }
}

/** @type {Map<string, Set<string>>} */
const leaderTraits = new Map();
/** @type {Map<string, Set<string>>} */
const traitModifiers = new Map();

for (const file of leaderFiles) {
  const rows = parseRowTags(fs.readFileSync(file, "utf8"));
  for (const row of rows) {
    if (row.LeaderType && row.TraitType && row.LeaderType.startsWith("LEADER_")) {
      const leader = normalizeLeader(row.LeaderType);
      const lt = leaderTraits.get(leader) || new Set();
      if (/TRAIT_LEADER_.*_ABILITY/.test(row.TraitType)) lt.add(row.TraitType);
      leaderTraits.set(leader, lt);
    }
    if (row.TraitType && row.ModifierId) {
      const tm = traitModifiers.get(row.TraitType) || new Set();
      tm.add(row.ModifierId);
      traitModifiers.set(row.TraitType, tm);
    }
  }
}

for (const file of civFiles) {
  const rows = parseRowTags(fs.readFileSync(file, "utf8"));
  for (const row of rows) {
    if (row.TraitType && row.ModifierId) {
      const tm = traitModifiers.get(row.TraitType) || new Set();
      tm.add(row.ModifierId);
      traitModifiers.set(row.TraitType, tm);
    }
  }
}

/** @type {Map<string, { effect: string, args: Record<string, string> }>} */
const modifierDetails = new Map();
for (const file of gameEffectsFiles) {
  const mods = parseModifiers(fs.readFileSync(file, "utf8"));
  for (const [id, value] of mods.entries()) {
    if (!modifierDetails.has(id)) modifierDetails.set(id, value);
  }
}

const tuningSrc = fs.readFileSync(TUNING_FILE, "utf8");
const tunedLeaders = parseTuningKeys(tuningSrc, "BY_LEADER");
const tunedCivs = parseTuningKeys(tuningSrc, "BY_CIV");

const leaders = Array.from(new Set([...leaderPriorities.keys(), ...leaderTraits.keys()])).sort();
const civs = Array.from(civMap.keys()).sort();

/** @type {Map<string, { tag: string, tier: string, region: string }>} */
const mementoMeta = new Map();
/** @type {Map<string, Set<string>>} */
const mementoModifiers = new Map();
for (const file of mementoFiles) {
  const rows = parseRowTags(fs.readFileSync(file, "utf8"));
  for (const row of rows) {
    if (row.MementoType && row.Tag) {
      mementoMeta.set(row.MementoType, {
        tag: row.Tag,
        tier: row.Tier || "",
        region: row.Region || ""
      });
    }
    if (row.MementoType && row.ModifierId) {
      const mods = mementoModifiers.get(row.MementoType) || new Set();
      mods.add(row.ModifierId);
      mementoModifiers.set(row.MementoType, mods);
    }
  }
}

/** @type {Map<string, string>} */
const legendPathLeader = new Map();

function legendPathToLeader(pathType) {
  const raw = pathType.replace(/^LEGEND_PATH_/, "");
  const aliases = {
    ASHOKA_RENOUNCER: "ASHOKA",
    BATTUTA: "IBN_BATTUTA",
    FRIEDRICH_OBLIQUE: "FRIEDRICH",
    HIMIKO_QUEEN: "HIMIKO",
    RIZAL: "JOSE_RIZAL",
    TRUNG: "TRUNG_TRAC",
    XERXES_KING: "XERXES"
  };
  const canon = aliases[raw] || raw;
  return normalizeLeader(`LEADER_${canon}`);
}

for (const file of unlockFiles) {
  const rows = parseRowTags(fs.readFileSync(file, "utf8"));
  for (const row of rows) {
    if (row.Name === "SpecificPath" && row.Value && row.Value.startsWith("LEGEND_PATH_")) {
      legendPathLeader.set(row.Value, legendPathToLeader(row.Value));
    }
  }
}

/** @type {Map<string, string>} */
const mementoLeaderOverride = new Map();
for (const file of configFiles) {
  const rows = parseRowTags(fs.readFileSync(file, "utf8"));
  for (const row of rows) {
    if (!row.Type || !row.Type.startsWith("MEMENTO_")) continue;
    if (!row.LeaderSpecific) continue;
    const mapped = legendPathLeader.get(row.LeaderSpecific) || legendPathToLeader(row.LeaderSpecific);
    if (mapped) mementoLeaderOverride.set(row.Type, mapped);
  }
}

const leaderAliasTokens = {
  LEADER_ASHOKA: ["ASHOKA_RENOUNCER"],
  LEADER_HARRIET_TUBMAN: ["TUBMAN"],
  LEADER_HIMIKO: ["HIMIKO_QUEEN"],
  LEADER_IBN_BATTUTA: ["BATTUTA"],
  LEADER_JOSE_RIZAL: ["RIZAL"],
  LEADER_TRUNG_TRAC: ["TRUNG"],
  LEADER_XERXES: ["XERXES_KING", "XERXES_ACHAEMENID"],
  LEADER_FRIEDRICH: ["FRIEDRICH_OBLIQUE", "FRIEDRICH_BAROQUE"]
};

/** @type {Map<string, string>} */
const mementoTokenLeader = new Map();
for (const leader of leaders) {
  const token = leader.replace(/^LEADER_/, "");
  mementoTokenLeader.set(token, leader);
  for (const alias of leaderAliasTokens[leader] || []) mementoTokenLeader.set(alias, leader);
}

function inferLeaderFromMemento(mementoType) {
  if (mementoLeaderOverride.has(mementoType)) return mementoLeaderOverride.get(mementoType) || null;
  if (mementoType.startsWith("MEMENTO_FOUNDATION_")) return null;
  const key = mementoType.replace(/^MEMENTO_/, "");
  const tokens = Array.from(mementoTokenLeader.keys()).sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    if (key.startsWith(`${token}_`)) return mementoTokenLeader.get(token) || null;
  }
  return null;
}

const mementos = Array.from(mementoMeta.keys())
  .sort()
  .map((mementoType) => {
    const modifiers = Array.from(mementoModifiers.get(mementoType) || []).sort();
    const effects = modifiers
      .map((mod) => {
        const info = modifierDetails.get(mod);
        if (!info) return "";
        const argBlob = Object.entries(info.args)
          .map(([k, v]) => `${k}=${v}`)
          .join(";");
        return `${info.effect} ${argBlob}`;
      })
      .filter(Boolean);
    const channels = classifyChannels(effects);
    return {
      id: mementoType,
      leader: inferLeaderFromMemento(mementoType),
      tag: mementoMeta.get(mementoType)?.tag || "",
      tier: mementoMeta.get(mementoType)?.tier || "",
      region: mementoMeta.get(mementoType)?.region || "",
      modifiers,
      channels,
      risk: riskTag(channels)
    };
  });

/** @type {Map<string, Array<{id:string, tag:string, channels:string[], risk:string, modifiers:string[]}>>} */
const leaderMementos = new Map();
for (const memento of mementos) {
  if (!memento.leader) continue;
  const list = leaderMementos.get(memento.leader) || [];
  list.push({
    id: memento.id,
    tag: memento.tag,
    channels: memento.channels,
    risk: memento.risk,
    modifiers: memento.modifiers
  });
  leaderMementos.set(memento.leader, list);
}

const leaderEntries = leaders.map((leader) => {
  const traits = Array.from(leaderTraits.get(leader) || []);
  const modifiers = new Set();
  for (const trait of traits) {
    for (const mod of traitModifiers.get(trait) || []) modifiers.add(mod);
  }
  const effects = [];
  for (const mod of modifiers) {
    const info = modifierDetails.get(mod);
    if (!info) continue;
    const argBlob = Object.entries(info.args)
      .map(([k, v]) => `${k}=${v}`)
      .join(";");
    effects.push(`${info.effect} ${argBlob}`);
  }
  const channels = classifyChannels(effects);
  const mementoList = (leaderMementos.get(leader) || []).sort((a, b) => a.id.localeCompare(b.id));
  return {
    id: leader,
    tuned: tunedLeaders.has(leader),
    traits,
    modifiers: Array.from(modifiers).sort(),
    channels,
    risk: riskTag(channels),
    mementoCount: mementoList.length,
    mementos: mementoList,
    civPriorities: Array.from(leaderPriorities.get(leader) || []).sort()
  };
});

const civEntries = civs.map((civ) => {
  const trait = civMap.get(civ)?.trait || "";
  const modifiers = Array.from(traitModifiers.get(trait) || []).sort();
  const effects = modifiers
    .map((mod) => {
      const info = modifierDetails.get(mod);
      if (!info) return "";
      const argBlob = Object.entries(info.args)
        .map(([k, v]) => `${k}=${v}`)
        .join(";");
      return `${info.effect} ${argBlob}`;
    })
    .filter(Boolean);
  const channels = classifyChannels(effects);
  return {
    id: civ,
    age: civMap.get(civ)?.age || "UNKNOWN",
    trait,
    tuned: tunedCivs.has(civ),
    modifiers,
    channels,
    risk: riskTag(channels)
  };
});

const matrix = {
  generatedAt: new Date().toISOString(),
  sourceRoot: path.relative(EMIGRATION_ROOT, CIV7_ROOT),
  leaderCount: leaderEntries.length,
  civCount: civEntries.length,
  mementoCount: mementos.length,
  leaders: leaderEntries,
  civilizations: civEntries,
  mementos
};

const roster = `// AUTO-GENERATED by scripts/generate-leader-civ-matrix.mjs\n// Source: ${path.relative(EMIGRATION_ROOT, CIV7_ROOT)}\n\nexport const LEADER_ROSTER = Object.freeze(${JSON.stringify(
  leaders,
  null,
  2
)});\n\nexport const CIV_ROSTER = Object.freeze(${JSON.stringify(civs, null, 2)});\n\nexport const MEMENTO_ROSTER = Object.freeze(${JSON.stringify(
  mementos.map((entry) => entry.id),
  null,
  2
)});\n`;

const tunedLeaderCount = leaderEntries.filter((e) => e.tuned).length;
const tunedCivCount = civEntries.filter((e) => e.tuned).length;
const untunedLeaders = leaderEntries.filter((e) => !e.tuned).map((e) => e.id);
const untunedCivs = civEntries.filter((e) => !e.tuned).map((e) => e.id);

const topLeaderRisks = leaderEntries
  .filter((e) => e.risk !== "low" && e.risk !== "unknown")
  .sort((a, b) => b.modifiers.length - a.modifiers.length)
  .slice(0, 20);
const topCivRisks = civEntries
  .filter((e) => e.risk !== "low" && e.risk !== "unknown")
  .sort((a, b) => b.modifiers.length - a.modifiers.length)
  .slice(0, 20);
const topMementoRisks = mementos
  .filter((e) => e.risk !== "low" && e.risk !== "unknown")
  .sort((a, b) => b.modifiers.length - a.modifiers.length)
  .slice(0, 20);

const md = [
  "# Leader/Civ Ability Matrix (Generated)",
  "",
  `Generated from game XML at: ${path.relative(path.dirname(OUTPUT_MD), CIV7_ROOT)}`,
  "",
  "## Coverage Summary",
  "",
  `- Leaders in roster: ${leaderEntries.length}`,
  `- Leaders with explicit outlier tuning: ${tunedLeaderCount}`,
  `- Leaders explicitly neutral by default: ${leaderEntries.length - tunedLeaderCount}`,
  `- Civilizations in roster: ${civEntries.length}`,
  `- Civilizations with explicit outlier tuning: ${tunedCivCount}`,
  `- Civilizations explicitly neutral by default: ${civEntries.length - tunedCivCount}`,
  `- Mementos in matrix: ${mementos.length}`,
  "",
  "## Highest-Risk Leaders",
  "",
  "| Leader | Risk | Channels | Modifiers | Tuned |",
  "| --- | --- | --- | ---: | --- |",
  ...topLeaderRisks.map(
    (e) => `| ${e.id} | ${e.risk} | ${e.channels.join(", ") || "-"} | ${e.modifiers.length} | ${e.tuned ? "yes" : "no"} |`
  ),
  "",
  "## Highest-Risk Civilizations",
  "",
  "| Civilization | Risk | Channels | Modifiers | Tuned |",
  "| --- | --- | --- | ---: | --- |",
  ...topCivRisks.map(
    (e) => `| ${e.id} | ${e.risk} | ${e.channels.join(", ") || "-"} | ${e.modifiers.length} | ${e.tuned ? "yes" : "no"} |`
  ),
  "",
  "## Highest-Risk Mementos",
  "",
  "| Memento | Leader | Risk | Channels | Modifiers |",
  "| --- | --- | --- | --- | ---: |",
  ...topMementoRisks.map(
    (e) => `| ${e.id} | ${e.leader || "(foundation/general)"} | ${e.risk} | ${e.channels.join(", ") || "-"} | ${e.modifiers.length} |`
  ),
  "",
  "## Untuned Leaders (Neutral Decisions)",
  "",
  ...untunedLeaders.map((x) => `- ${x}`),
  "",
  "## Untuned Civilizations (Neutral Decisions)",
  "",
  ...untunedCivs.map((x) => `- ${x}`),
  ""
].join("\n");

fs.mkdirSync(path.dirname(OUTPUT_ROSTER), { recursive: true });
fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
fs.mkdirSync(path.dirname(OUTPUT_MD), { recursive: true });

fs.writeFileSync(OUTPUT_ROSTER, roster);
fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(matrix, null, 2)}\n`);
fs.writeFileSync(OUTPUT_MD, `${md}\n`);

console.log(`Generated matrix: leaders=${leaderEntries.length} civs=${civEntries.length}`);
console.log(`Wrote ${path.relative(EMIGRATION_ROOT, OUTPUT_ROSTER)}`);
console.log(`Wrote ${path.relative(EMIGRATION_ROOT, OUTPUT_JSON)}`);
console.log(`Wrote ${path.relative(EMIGRATION_ROOT, OUTPUT_MD)}`);
