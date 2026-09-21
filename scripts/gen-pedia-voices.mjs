// gen-pedia-voices.mjs
//
// Generates the "Voices of the Displaced" Civilopedia pages: one page per origin civilization that has a quote
// anywhere in the mod, plus one page for the general pools. Each page lists every line the mod can show for
// that people (the enclave decision's two quotes, the refugee and newcomer pop-ups' quotes, the call-home
// dialog's quotes), the situation each one appears in, and a short note on who the speaker was. The quotes come
// straight from the registries the game reads, so the pedia can never drift from the pop-ups:
//
//   ui/emigration-quarter-bonuses.js     QUARTER_QUOTES (enclave a/b) + QUARTER_BONUSES (the two stances)
//   ui/emigration-displaced-quotes.js    DISPLACED_QUOTES (refugee / migrant / return, per civ) + DISPLACED_POOLS
//   scripts/pedia-voices-people.json     one note per speaker, keyed by the registry's exact `who` string
//
// The script REFUSES to run when a registry speaker has no note, so adding a quote means adding its speaker.
//
// Emits (both generated, do not hand-edit):
//   data/emigration-civilopedia-voices.xml   the EMIG_VOICES page layout + one CivilopediaPages row per page
//   text/en_us/PediaVoicesText.xml           every paragraph, en_us only (quotes and their notes are English
//                                            in every locale, like the quote rows themselves)
//
// Paragraphs use the pedia's own key convention (LOC_PEDIA_<SECTION>_PAGE_<PAGE>_CHAPTER_<CHAPTER>_PARA_<n>,
// model-civilopedia.js findChapterTextKey) rather than CivilopediaPageChapterParagraphs rows: that table's
// primary key is (Section, Page, Chapter), so it can hold only ONE paragraph per chapter, and the convention
// lets a chapter run to as many paragraphs as it needs. The page group (EMIG_VOICES) and the section's own
// intro page live in the hand-written data/emigration-civilopedia.xml.
//
// Run:  node --loader ./tests/loader.mjs scripts/gen-pedia-voices.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const { QUARTER_QUOTES, QUARTER_BONUSES, renderableLine } = await import("/emigration/ui/emigration-quarter-bonuses.js");
const { DISPLACED_QUOTES, DISPLACED_POOLS } = await import("/emigration/ui/emigration-displaced-quotes.js");
const { quarterOptionsFor } = await import("/emigration/ui/emigration-quarter-registry.js");

/** @type {Record<string,string>} */
const PEOPLE = JSON.parse(readFileSync(join(ROOT, "scripts/pedia-voices-people.json"), "utf8"));

const SECTION = "EMIGRATION";
const GROUP = "EMIG_VOICES";
const LAYOUT = "EMIG_VOICES";

/** Display names, the game's own English where it ships one (LOC_CIVILIZATION_<X>_NAME), else the usual form. */
const NAMES = {
  ABBASID: "Abbasid", AKSUM: "Aksum", AMERICA: "America", ASSYRIA: "Assyria", BABYLON: "Babylon",
  BUGANDA: "Buganda", BULGARIA: "Bulgaria", CARTHAGE: "Carthage", CHOLA: "Chola", DAI_VIET: "Dai Viet",
  EGYPT: "Egypt", ENGLAND: "England", FRENCH_EMPIRE: "French Empire", GAUL: "Gauls", GORYEO: "Goryeo",
  GREAT_BRITAIN: "Great Britain", GREECE: "Greece", HAN: "Han", HAWAII: "Hawai'i", HEIAN: "Heian Japan",
  ICELAND: "Iceland", INCA: "Inca", JOSEON: "Joseon", KHMER: "Khmer", MAJAPAHIT: "Majapahit",
  MAURYA: "Maurya", MAYA: "Maya", MEIJI: "Meiji Japan", MEXICO: "Mexico", MING: "Ming",
  MISSISSIPPIAN: "Mississippian", MONGOLIA: "Mongolia", MUGHAL: "Mughal", NEPAL: "Nepal", NORMAN: "Norman",
  OTTOMANS: "Ottomans", PERSIA: "Achaemenid Persia", PIRATE_REPUBLIC: "Pirate Republic", PRUSSIA: "Prussia",
  QAJAR: "Qajar", QING: "Qing", ROME: "Rome", RUSSIA: "Russia", SENGOKU: "Sengoku Japan", SHAWNEE: "Shawnee",
  SIAM: "Siam", SILLA: "Silla", SONGHAI: "Songhai", SPAIN: "Spain", TONGA: "Tonga"
};

/** The kinds a civilization page can carry, in page order, with the chapter each renders in. */
const KINDS = [
  { kind: "refugee", chapter: "REFUGEE" },
  { kind: "migrant", chapter: "MIGRANT" },
  { kind: "return", chapter: "RETURN" }
];

/** Shared chapter titles (LOC_PEDIA_<SECTION>_PAGE_CHAPTER_<CHAPTER>_TITLE resolves for every page in the section). */
const CHAPTER_TITLES = {
  ENCLAVE: "The Cultural Enclave",
  REFUGEE: "Refugees",
  MIGRANT: "Newcomers",
  RETURN: "Coming Home"
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const shortOf = (civ) => civ.replace(/^CIVILIZATION_/, "");
const nameOf = (civ) => NAMES[shortOf(civ)] || shortOf(civ).toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const demonymOf = (civ) => (QUARTER_BONUSES[civ] && QUARTER_BONUSES[civ].demonym) || nameOf(civ);

/** The source part of a quote line, as quoteDisplay composes it: parenthetical sources join with a space. */
const sourceSuffix = (source) => (source ? (source.charAt(0) === "(" ? " " : ", ") + source : "");

/**
 * A quote as the pedia prints it: the same line the pop-up shows (original script reduced to its English where
 * the game's fonts cannot draw it), with an em dash before the attribution.
 * @param {{text:string, who:string, source:string}} q The quote. @returns {string} The line.
 */
const quoteLine = (q) => renderableLine('"' + q.text + '" — ' + q.who + sourceSuffix(q.source));

/** Every speaker across the registries, so a missing note fails before anything is written. */
function allSpeakers() {
  const who = new Set();
  for (const pair of Object.values(QUARTER_QUOTES)) for (const id of ["a", "b"]) if (pair[id]) who.add(pair[id].who);
  for (const row of Object.values(DISPLACED_QUOTES)) for (const list of Object.values(row)) for (const q of list) who.add(q.who);
  for (const list of Object.values(DISPLACED_POOLS)) for (const q of list) who.add(q.who);
  return who;
}
const missing = [...allSpeakers()].filter((w) => !PEOPLE[w]);
if (missing.length) {
  throw new Error("scripts/pedia-voices-people.json has no note for " + missing.length + " speaker(s):\n  " + missing.join("\n  "));
}

/**
 * One page under construction: chapters in order, each a list of paragraph texts. A speaker's note is printed
 * once per page, at their first quote, so a poet quoted twice is introduced once.
 */
class Page {
  /** @param {string} id The PageID. @param {string} title The page title. */
  constructor(id, title) {
    this.id = id;
    this.title = title;
    /** @type {Map<string, string[]>} */
    this.chapters = new Map();
    /** @type {Set<string>} */
    this.introduced = new Set();
  }
  /** @param {string} chapter @param {string} text */
  add(chapter, text) {
    if (!this.chapters.has(chapter)) this.chapters.set(chapter, []);
    this.chapters.get(chapter).push(text);
  }
  /**
   * A quote paragraph, then its speaker note the first time that speaker appears on this page.
   * @param {string} chapter @param {{text:string, who:string, source:string}} q @param {string} [lead] A bold lead-in.
   */
  quote(chapter, q, lead) {
    this.add(chapter, (lead ? "[B]" + lead + "[/B] " : "") + quoteLine(q));
    if (!this.introduced.has(q.who)) {
      this.introduced.add(q.who);
      this.add(chapter, PEOPLE[q.who]);
    }
  }
}

/** The stance options of an origin, as the decision offers them, for the enclave chapter's list. */
function stanceList(civ) {
  const opts = quarterOptionsFor(civ).filter((o) => o.id !== "ignore");
  if (!opts.length) return "";
  return "The decision offers two stances drawn from their character, each paid once when you choose it and sized to your own income, or you can simply let them be:[BLIST]"
    + opts.map((o) => "[LI][B]" + o.label + "[/B]: " + o.note).join("")
    + "[/LIST]";
}

/** The sentence that says what a people has a voice for and where the pools speak instead. */
function coverageLine(civ, name) {
  const row = DISPLACED_QUOTES[civ] || {};
  const own = [];
  const pool = [];
  if (QUARTER_QUOTES[civ]) own.push("the Cultural Enclave decision");
  (row.refugee && row.refugee.length ? own : pool).push("the refugee decision and the Refugees pop-up");
  (row.migrant && row.migrant.length ? own : pool).push("the Newcomers pop-up");
  (row.return && row.return.length ? own : pool).push("the call-home dialog");
  const list = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
  let s = "When people of " + name + " appear in a pop-up, the words are theirs: " + name + " has a voice of its own for " + list(own) + ".";
  if (pool.length) s += " For " + list(pool) + " the game speaks with the Voices of Many Lands instead.";
  s += " The event fixes the quote, so the same event always shows the same line. Arrivals from a civilization you have not met use the Voices of Many Lands.";
  return s;
}

/** @param {string} civ @returns {Page} That origin's page. */
function civPage(civ) {
  const name = nameOf(civ);
  const dem = demonymOf(civ);
  const page = new Page("VOICES_" + shortOf(civ), name);
  page.add("CONTENT", coverageLine(civ, name));

  const pair = QUARTER_QUOTES[civ];
  if (pair) {
    page.add("ENCLAVE",
      "When a lasting " + dem + " community in one of your cities is recognized as a Cultural Enclave, the recognition pop-up carries one of these lines: the first "
      + dem + " enclave in your empire shows the first quote, the second shows the second. The pop-up appears when enclave recognition is set to Ask me (Options, Add-ons, Emigration, Advanced settings, Cultural enclaves); under the default automatic recognition the city takes the first stance you can afford and the Chronicle records it.");
    const stances = stanceList(civ);
    if (stances) page.add("ENCLAVE", stances);
    if (pair.a) page.quote("ENCLAVE", pair.a, "First enclave.");
    if (pair.b) page.quote("ENCLAVE", pair.b, "Second enclave.");
  }

  const row = DISPLACED_QUOTES[civ] || {};
  for (const { kind, chapter } of KINDS) {
    const list = row[kind];
    if (!list || !list.length) continue;
    const many = list.length > 1;
    if (kind === "refugee") page.add(chapter, "Shown when refugees from " + name + " reach your gates, on the refugee decision and on the Refugees pop-up that asks where the arrivals should live." + (many ? " One of these lines is chosen for each event." : ""));
    if (kind === "migrant") page.add(chapter, "Shown on the Newcomers pop-up when migrants from " + name + " arrive to settle in one of your cities." + (many ? " One of these lines is chosen for each event." : ""));
    if (kind === "return") page.add(chapter, "Shown on the call-home dialog when you, as " + name + ", call your displaced people back to the settlement they fled." + (many ? " One of these lines is chosen for each call." : ""));
    for (const q of list) page.quote(chapter, q);
  }
  return page;
}

/** @returns {Page} The pools page. */
function poolPage() {
  const page = new Page("VOICES_POOL", "Voices of Many Lands");
  page.add("CONTENT",
    "The pop-up draws on these general pools when a people has no verified refugee, migrant or homecoming voice of its own, and for every arrival from a civilization you have not met. The lines come from the displaced of many times and places, and none names who is coming.");
  const leads = {
    refugee: "Shown on the refugee decision and the Refugees pop-up for a people without a refugee voice of its own, and for every refugee from a civilization you have not yet met.",
    migrant: "Shown on the Newcomers pop-up for a people without a migrant voice of its own, and for every newcomer from a civilization you have not yet met.",
    return: "Shown on the call-home dialog when your own civilization has no homecoming voice of its own."
  };
  for (const { kind, chapter } of KINDS) {
    const list = DISPLACED_POOLS[kind];
    if (!list || !list.length) continue;
    page.add(chapter, leads[kind]);
    for (const q of list) page.quote(chapter, q);
  }
  return page;
}

// ── build ─────────────────────────────────────────────────────────────────────
const civs = [...new Set([...Object.keys(QUARTER_QUOTES), ...Object.keys(DISPLACED_QUOTES)])]
  .sort((a, b) => nameOf(a).localeCompare(nameOf(b), "en"));
const pages = [poolPage(), ...civs.map(civPage)];

const CHAPTER_ORDER = ["CONTENT", "ENCLAVE", ...KINDS.map((k) => k.chapter)];
const pageRows = [];
const textRows = [];
const keyFor = (page, chapter, n) => `LOC_PEDIA_${SECTION}_PAGE_${page}_CHAPTER_${chapter}_PARA_${n}`;

for (const [ch, title] of Object.entries(CHAPTER_TITLES)) {
  textRows.push(`        <Row Tag="LOC_PEDIA_${SECTION}_PAGE_CHAPTER_${ch}_TITLE"><Text>${esc(title)}</Text></Row>`);
}
// The pools page sits right after the section's hand-written intro (SortIndex 1); civilizations follow alphabetically.
pages.forEach((page, i) => {
  const sort = i === 0 ? 2 : 10 + i * 10;
  pageRows.push(`        <Row SectionID="${SECTION}" PageID="${page.id}" PageGroupID="${GROUP}" PageLayoutID="${LAYOUT}" Name="LOC_PEDIA_${SECTION}_PAGE_${page.id}_TITLE" SortIndex="${sort}"/>`);
  textRows.push(`        <Row Tag="LOC_PEDIA_${SECTION}_PAGE_${page.id}_TITLE"><Text>${esc(page.title)}</Text></Row>`);
  for (const ch of CHAPTER_ORDER) {
    const paras = page.chapters.get(ch) || [];
    paras.forEach((p, n) => textRows.push(`        <Row Tag="${keyFor(page.id, ch, n + 1)}"><Text>${esc(p)}</Text></Row>`));
  }
});

const HEADER = "<!-- GENERATED by scripts/gen-pedia-voices.mjs from ui/emigration-quarter-bonuses.js, ui/emigration-displaced-quotes.js and scripts/pedia-voices-people.json. Do not hand-edit; regenerate. -->";

const dataXml = `<?xml version="1.0" encoding="utf-8"?>
${HEADER}
<!--
  "Voices of the Displaced": one Civilopedia page per origin civilization with a quote anywhere in the mod, plus
  the general pools. The page group (${GROUP}) and the section's intro page are in emigration-civilopedia.xml.
  Chapters are resolved by the pedia's text-key convention (page and chapter ids spliced into keys shaped like
  LOC_PEDIA_${SECTION}_PAGE_VOICES_ROME_CHAPTER_REFUGEE_PARA_1), so a page carries only the chapters it has text
  for; the shared chapter titles are shaped like LOC_PEDIA_${SECTION}_PAGE_CHAPTER_REFUGEE_TITLE.
-->
<Database>
    <CivilopediaPageLayouts>
        <Row PageLayoutID="${LAYOUT}" UseSidebar="false"/>
    </CivilopediaPageLayouts>

    <CivilopediaPageLayoutChapters>
${CHAPTER_ORDER.map((ch, i) => `        <Row PageLayoutID="${LAYOUT}" ChapterID="${ch}" SortIndex="${(i + 1) * 10}"/>`).join("\n")}
    </CivilopediaPageLayoutChapters>

    <CivilopediaPages>
${pageRows.join("\n")}
    </CivilopediaPages>
</Database>
`;

const textXml = `<?xml version="1.0" encoding="utf-8"?>
${HEADER}
<Database>
    <EnglishText>
${textRows.join("\n")}
    </EnglishText>
</Database>
`;

writeFileSync(join(ROOT, "data/emigration-civilopedia-voices.xml"), dataXml);
writeFileSync(join(ROOT, "text/en_us/PediaVoicesText.xml"), textXml);

const quoteCount = textRows.filter((r) => r.includes(" — ")).length;
console.log(`gen-pedia-voices: ${pages.length} pages (${civs.length} civilizations + pools), ${textRows.length} text rows, ${quoteCount} quotes, ${Object.keys(PEOPLE).filter((k) => k !== "_comment").length} speaker notes`);
