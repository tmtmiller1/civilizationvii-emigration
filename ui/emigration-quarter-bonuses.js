// emigration-quarter-bonuses.js
//
// The PER-CIVILIZATION Cultural Quarter registry: each origin civilization offers TWO identity-grounded
// stances for its enclave, plus a demonym for naming. A stance is a ONE-TIME payout the host receives
// when it recognizes the enclave (`pays` is Gold, Influence, Science or Culture, the only yields a script
// can grant; a non-Gold stance costs Gold), with a one-line historical justification (`why`). Each option
// also keeps the enclave TILE's yield family (`benefit`, `penalty`, `tileWhy`) for the tile skins and the
// generated per-stance improvements. PURE DATA + a lookup keyed by CivilizationType; the AMOUNTS come from
// emigration-stance-payout.js, and a civ WITHOUT a row gets the NEUTRAL fallback, so it never throws.

/** @typedef {{id:string, benefit:string, penalty:string, tileWhy:string, pays:string, why:string, label?:string}}
 *   QBonusOption */
/** @typedef {{demonym:string, options:QBonusOption[]}} QBonus */

/**
 * One option: the tile's yield family and its line (benefit ▸ penalty ▸ tileWhy), then the stance: the
 * yield it pays, its line, and an optional button-label override for a stance whose action the
 * yield-derived default verb would misname.
 * @param {string} id @param {string} benefit @param {string} penalty @param {string} tileWhy
 * @param {{pays:string, why:string, label?:string}} stance The stance.
 * @returns {QBonusOption}
 */
function opt(id, benefit, penalty, tileWhy, stance) {
  return { id, benefit, penalty, tileWhy, ...stance };
}

const C = "YIELD_CULTURE";
const G = "YIELD_GOLD";
const P = "YIELD_PRODUCTION";
const S = "YIELD_SCIENCE";
const F = "YIELD_FAITH";
const FO = "YIELD_FOOD";
const H = "YIELD_HAPPINESS";
const D = "YIELD_DIPLOMACY";

/**
 * The per-civilization quarter registry. Each entry: a demonym (for "<Demonym> Quarter" naming, which
 * OVERRIDES the game adjective where they differ — e.g. Carthage → "Punic") and two options a/b.
 * @type {Readonly<Record<string, QBonus>>}
 */
export const QUARTER_BONUSES = Object.freeze({
  // ── Antiquity origins ──
  CIVILIZATION_ABBASID: { demonym: "Abbasid", options: [
    opt("a", S, G, "House-of-Wisdom scholars translate, but their stipends drain the treasury", { pays: S, why: "House-of-Wisdom scholars translate, but their stipends drain the treasury" }),
    opt("b", H, P, "famed gardens and salons soothe the city, but few hands work the yards", { pays: D, why: "their salons and famed gardens receive envoys from across the known world, at the city's expense" })] },
  CIVILIZATION_AKSUM: { demonym: "Aksumite", options: [
    opt("a", G, C, "Red-Sea traders enrich the docks, but coin flows to the quays, not the old rites", { pays: G, why: "Red-Sea traders enrich the docks and pay their harbor dues in coin" }),
    opt("b", F, H, "their stelae-churches draw pilgrims, and the crowds throng the ward", { pays: C, why: "their stelae-churches draw pilgrims and scribes, and the city pays their upkeep" })] },
  CIVILIZATION_ASSYRIA: { demonym: "Assyrian", options: [
    opt("a", P, H, "their siege-engineers arm your foundries and rams and towers roll out, though their martial bearing sours the ward", { pays: S, why: "their siege-engineers teach your foundries to build rams and towers, and their workshops are dear to keep", label: "Learn their siege-craft" }),
    opt("b", S, G, "captured codices fill the archives, but curating spoils costs coin", { pays: C, why: "captured codices fill the archives, but curating spoils costs coin" })] },
  CIVILIZATION_BABYLON: { demonym: "Babylonian", options: [
    opt("a", S, G, "tablet-house scribes keep the star-tables, and their stipends tell on the treasury", { pays: S, why: "tablet-house scribes keep the star-tables, and their stipends tell on the treasury" }),
    opt("b", FO, P, "terraced canal-gardens green the ward, but the waterworks tie up hands", { pays: G, why: "their terraced canal-gardens send dates and barley to market" })] },
  CIVILIZATION_CARTHAGE: { demonym: "Punic", options: [
    opt("a", G, FO, "Punic merchants fill the wharves, drawing hands off the fields", { pays: G, why: "Punic merchants fill the wharves and pay their harbor dues" }),
    opt("b", P, C, "shipwrights raise busy yards, and the city prizes tonnage over temples", { pays: D, why: "their shipwrights and navigators carry your name to far harbors, and the fleet is paid from your treasury" })] },
  CIVILIZATION_EGYPT: { demonym: "Egyptian", options: [
    opt("a", C, G, "monument-masons adorn the district, but upkeep of their works is dear", { pays: C, why: "monument-masons adorn the district, but upkeep of their works is dear" }),
    opt("b", FO, P, "Nile-style flood-farming feeds the ward, but pulls labor off the works", { pays: S, why: "their Nile-surveyors bring geometry and the star-calendar, and the city pays their keep" })] },
  CIVILIZATION_GAUL: { demonym: "Gallic", options: [
    opt("a", P, C, "their hill-fort smiths forge iron and harness, and care little for temple fashion", { pays: S, why: "their hill-fort smiths teach iron and harness-making, and the forges cost coin", label: "Learn their smithing" }),
    opt("b", H, G, "grove-rites at the nemeton settle the ward, sustained by offerings", { pays: C, why: "grove-rites at the nemeton settle the ward, sustained by offerings" })] },
  CIVILIZATION_GREECE: { demonym: "Greek", options: [
    opt("a", S, H, "an agora of philosophers, and their factional politics", { pays: S, why: "an agora of philosophers debates in the ward, and the city pays their stipends" }),
    opt("b", C, P, "theaters and porticoes flourish while the workshops idle", { pays: C, why: "theaters and porticoes rise in the ward, and the city pays for the stage" })] },
  CIVILIZATION_HAN: { demonym: "Han", options: [
    opt("a", FO, H, "intensive farming feeds many, at the cost of crowding", { pays: D, why: "their tributary envoys bring your city into the Middle Kingdom's circle, at a price in gifts" }),
    opt("b", P, G, "public-works crews build fast, but the corvée is subsidized", { pays: S, why: "their public-works engineers survey canals and walls, and the corvée is paid from your treasury" })] },
  CIVILIZATION_KHMER: { demonym: "Khmer", options: [
    opt("a", FO, G, "baray-style irrigation greens the fringe, but the waterworks cost coin", { pays: S, why: "baray engineers bring their hydraulics to the fringe, and the waterworks cost coin" }),
    opt("b", F, H, "their temple-processions draw great crowds that throng the streets", { pays: C, why: "their temple-processions fill the streets with dance and ritual, and the city pays for the festival" })] },
  CIVILIZATION_MAURYA: { demonym: "Mauryan", options: [
    opt("a", F, G, "ascetic orders bless the ward, sustained by alms", { pays: C, why: "ascetic orders bless the ward, sustained by alms" }),
    opt("b", FO, P, "stepwell gardens yield well, but tie up hands", { pays: D, why: "their dhamma-envoys carry your name to distant courts, at the treasury's cost" })] },
  CIVILIZATION_MAYA: { demonym: "Maya", options: [
    opt("a", S, P, "sky-watchers keep observatories, not workshops", { pays: S, why: "sky-watchers keep observatories in the ward, and the city pays for them" }),
    opt("b", FO, H, "dense milpa plots feed many, but crowd the fringe", { pays: G, why: "milpa harvests and cacao fill the ward's market" })] },
  CIVILIZATION_MISSISSIPPIAN: { demonym: "Mississippian", options: [
    opt("a", C, G, "mound-rites enrich the ward's life, funded by tribute", { pays: C, why: "mound-rites enrich the ward's life, funded by tribute" }),
    opt("b", FO, P, "woodland gathering feeds the district, off the yards", { pays: G, why: "trade-paths from the great mounds bring copper and shell to market" })] },
  CIVILIZATION_PERSIA: { demonym: "Persian", options: [
    opt("a", G, H, "satrapal tribute flows in, and resentment with it", { pays: G, why: "satrapal tribute flows into the treasury" }),
    opt("b", C, FO, "walled pleasure-gardens delight, but eat good farmland", { pays: C, why: "walled pleasure-gardens delight the city, and the gardeners are paid from the treasury" })] },
  CIVILIZATION_ROME: { demonym: "Roman", options: [
    opt("a", P, H, "Roman engineers and veterans raise your works and drill your legions, but the eagle's shadow chafes", { pays: S, why: "Roman engineers bring their surveying and concrete, and the city pays their wages", label: "Learn their engineering" }),
    opt("b", G, C, "their roads pull trade to the city, and coin sets the fashion", { pays: G, why: "their roads pull trade to the city" })] },

  // ── Exploration origins ──
  CIVILIZATION_BULGARIA: { demonym: "Bulgar", options: [
    opt("a", P, H, "their horse-and-forge veterans harden your cavalry, and brawl as hard as they fight", { pays: S, why: "their horse-and-forge veterans teach your smiths and riders, at a price in coin", label: "Learn their horsemanship" }),
    opt("b", G, C, "frontier markets thrive, and the city keeps fuller ledgers than calendars", { pays: G, why: "frontier markets thrive and pay their dues" })] },
  CIVILIZATION_CHOLA: { demonym: "Chola", options: [
    opt("a", G, FO, "Tamil maritime traders fill the harbors, drawing hands off the soil", { pays: G, why: "Tamil maritime traders fill the harbors" }),
    opt("b", F, H, "great temple-tanks draw pilgrims, and the festival crowds throng the ward", { pays: C, why: "great temple-tanks draw pilgrims and poets, and the festivals are paid from the treasury" })] },
  CIVILIZATION_DAI_VIET: { demonym: "Dai Viet", options: [
    opt("a", C, G, "wall-scholars keep learning alive, at public cost", { pays: C, why: "wall-scholars keep learning alive, at public cost" }),
    opt("b", P, FO, "fort-works employ many hands off the fields", { pays: D, why: "their envoys know how to keep a powerful neighbor at bay, and the embassies cost coin" })] },
  CIVILIZATION_ENGLAND: { demonym: "English", options: [
    opt("a", C, G, "chapter-house scriptoria and stage-players enrich the ward, at the abbey's cost", { pays: C, why: "chapter-house scriptoria and stage-players enrich the ward, at the abbey's cost" }),
    opt("b", G, F, "their chartered merchants work any harbor, and the old rites go unendowed", { pays: G, why: "their chartered merchants work any harbor" })] },
  CIVILIZATION_GORYEO: { demonym: "Goryeo", options: [
    opt("a", C, P, "celadon kilns and woodblock carvers raise the ward's craft above its yards", { pays: C, why: "celadon kilns raise the ward's craft, at a price in coin" }),
    opt("b", F, G, "their temple orders keep the canon, sustained by endowments", { pays: S, why: "their temple orders print and keep the canon in woodblocks, sustained by endowments" })] },
  CIVILIZATION_HAWAII: { demonym: "Hawaiian", options: [
    opt("a", FO, P, "fish-ponds and reefs feed the ward, drawing hands off the yards", { pays: G, why: "fish-ponds and reefs send their catch to market" }),
    opt("b", C, G, "heiau rites enrich island custom, funded by the city", { pays: C, why: "heiau rites enrich island custom, funded by the city" })] },
  CIVILIZATION_INCA: { demonym: "Inca", options: [
    opt("a", P, G, "terrace-masons and road-crews build superbly, at expense", { pays: S, why: "terrace-masons and road-crews teach their building, at expense" }),
    opt("b", FO, H, "mountain terraces feed many in a crowded ward", { pays: D, why: "their chasqui runners carry word along the roads, and the relay posts are paid from the treasury" })] },
  CIVILIZATION_MAJAPAHIT: { demonym: "Majapahit", options: [
    opt("a", G, C, "spice-route factors enrich the docks, and the wharves talk profit over pageantry", { pays: G, why: "spice-route factors enrich the docks" }),
    opt("b", FO, P, "coastal fisheries feed the fringe off the yards", { pays: D, why: "their seafaring envoys bind far-off islands to your city, at a price in gifts" })] },
  CIVILIZATION_MING: { demonym: "Ming", options: [
    opt("a", G, P, "porcelain and silk factors fill the ledgers while the kilns run cool", { pays: G, why: "porcelain and silk factors fill the ledgers" }),
    opt("b", C, H, "imperial arts refine the ward, and its finery outshines humbler streets", { pays: C, why: "imperial arts refine the ward, and the city pays for their finery" })] },
  CIVILIZATION_MONGOLIA: { demonym: "Mongol", options: [
    opt("a", P, H, "their horse-lines and smiths keep your cavalry shod, remounted and armed, but the swagger grates", { pays: D, why: "their yam couriers and envoys carry your seal across the steppe, and the post-stations cost coin", label: "Ride with their couriers" }),
    opt("b", G, C, "steppe tribute-routes pay well, and the city counts coin where it once kept ceremony", { pays: G, why: "steppe tribute-routes pay well" })] },
  CIVILIZATION_NORMAN: { demonym: "Norman", options: [
    opt("a", P, H, "their castle-masons and knights raise strong works and temper your men-at-arms", { pays: S, why: "their castle-masons teach your builders, and their wages are dear", label: "Learn their castle-craft" }),
    opt("b", G, FO, "feudal rents fill the coffers, off the farms", { pays: G, why: "feudal rents fill the coffers" })] },
  CIVILIZATION_SONGHAI: { demonym: "Songhai", options: [
    opt("a", G, FO, "river-and-salt caravans fill the market, drawing hands off the soil", { pays: G, why: "river-and-salt caravans fill the market" }),
    opt("b", S, H, "their scholars keep famed libraries, and famed feuds", { pays: S, why: "their scholars keep famed libraries, and the copyists are paid from the treasury" })] },
  CIVILIZATION_SPAIN: { demonym: "Spanish", options: [
    opt("a", G, H, "treasure-fleet factors enrich the port amid conversion strife", { pays: G, why: "treasure-fleet factors enrich the port" }),
    opt("b", F, C, "their missions win souls and overwrite old custom", { pays: C, why: "their missions build churches and schools, at the treasury's cost" })] },

  // ── Modern origins ──
  CIVILIZATION_AMERICA: { demonym: "American", options: [
    opt("a", P, H, "factory-hands drive output, but the shifts breed unrest", { pays: S, why: "their inventors and factory engineers bring new methods, and the patents cost coin" }),
    opt("b", C, G, "their cinema and jazz enliven the ward, at a subsidy", { pays: C, why: "their cinema and jazz enliven the ward, at a subsidy" })] },
  CIVILIZATION_BUGANDA: { demonym: "Bugandan", options: [
    opt("a", FO, G, "lakeshore gardens feed the ward, tended at cost", { pays: G, why: "lakeshore gardens send plantains and bark-cloth to market" }),
    opt("b", C, P, "bark-cloth artisans enrich custom, off the yards", { pays: C, why: "bark-cloth artisans enrich custom, and the city pays for their work" })] },
  CIVILIZATION_FRENCH_EMPIRE: { demonym: "French", options: [
    opt("a", C, P, "salons and Great Works flourish while workshops idle", { pays: C, why: "salons and Great Works flourish, and the city pays their patrons" }),
    opt("b", G, H, "luxury trade enriches the ward, and its airs vex the poor", { pays: G, why: "luxury trade enriches the ward" })] },
  CIVILIZATION_GREAT_BRITAIN: { demonym: "British", options: [
    opt("a", G, H, "counting-houses and clerks profit; the mills breed grievance", { pays: G, why: "counting-houses and clerks turn a profit" }),
    opt("b", P, FO, "industrial works run hot, drawing hands off the farms", { pays: S, why: "their engineers bring the steam engine and the mill, and the patents cost coin" })] },
  CIVILIZATION_HEIAN: { demonym: "Heian", options: [
    opt("a", C, P, "courtly refinement flowers while the workshops idle", { pays: C, why: "courtly refinement flowers, and the court's patronage is paid from your treasury" }),
    opt("b", H, G, "their festivals lift the whole city, at the treasury's cost", { pays: D, why: "their festivals draw envoys and poets from every province, at the treasury's cost" })] },
  CIVILIZATION_ICELAND: { demonym: "Icelandic", options: [
    opt("a", P, FO, "their shipwrights and crews build fast longships, drawing hands off the farms", { pays: G, why: "their longships carry trade to far shores", label: "Launch their longships" }),
    opt("b", C, G, "saga-singers keep the ward's memory, funded by the city", { pays: C, why: "saga-singers keep the ward's memory, funded by the city" })] },
  CIVILIZATION_JOSEON: { demonym: "Joseon", options: [
    opt("a", S, G, "movable-type printers and academicians publish freely, and the stipends tell on the treasury", { pays: S, why: "movable-type printers and academicians publish freely, and the stipends tell on the treasury" }),
    opt("b", C, P, "seowon scholars keep rites and letters while the workshops idle", { pays: C, why: "seowon scholars keep rites and letters, and the academies are endowed from the treasury" })] },
  CIVILIZATION_MEIJI: { demonym: "Meiji", options: [
    opt("a", P, H, "their arsenals and conscript drill build a modern army at a hard human pace", { pays: S, why: "their arsenals and military academies bring modern methods, at a hard price in coin", label: "Study their arsenals" }),
    opt("b", S, C, "headlong modernisation, and old custom set aside", { pays: D, why: "their envoys study every nation and bring back treaties, and the missions cost coin" })] },
  CIVILIZATION_MEXICO: { demonym: "Mexican", options: [
    opt("a", C, G, "murals and fiestas color the ward, funded by the city", { pays: C, why: "murals and fiestas color the ward, funded by the city" }),
    opt("b", H, P, "tight-knit community lifts spirits over output", { pays: G, why: "their markets and remittances fill the ward's purses" })] },
  CIVILIZATION_MUGHAL: { demonym: "Mughal", options: [
    opt("a", C, G, "miniaturists and architects adorn the ward, at expense", { pays: C, why: "miniaturists and architects adorn the ward, at expense" }),
    opt("b", G, FO, "fine-textile trade fills the docks, drawing hands off the fields", { pays: G, why: "fine-textile trade fills the docks" })] },
  CIVILIZATION_PRUSSIA: { demonym: "Prussian", options: [
    opt("a", P, H, "their drill-masters and arsenals forge a disciplined army, stiffly", { pays: D, why: "their general staff and diplomats make your city's word carry weight, and the staff college costs coin", label: "Consult their general staff" }),
    opt("b", S, C, "their war-academies teach hard, and set old ways aside", { pays: S, why: "their war-academies teach hard, and the professors are paid from the treasury" })] },
  CIVILIZATION_QING: { demonym: "Qing", options: [
    opt("a", FO, H, "dense growth feeds many in a crowded ward", { pays: C, why: "their scholars compile great encyclopaedias, and the copyists are paid from the treasury" }),
    opt("b", G, P, "treaty-port factors fill the ledgers, and the workshops slow", { pays: G, why: "treaty-port factors fill the ledgers" })] },
  CIVILIZATION_RUSSIA: { demonym: "Russian", options: [
    opt("a", P, FO, "heavy-industry crews work hard in a hungry ward", { pays: S, why: "their engineers bring railways and ironworks, at a heavy price in coin" }),
    opt("b", C, G, "their letters and theater enrich the city, at a subsidy", { pays: C, why: "their letters and theater enrich the city, at a subsidy" })] },
  CIVILIZATION_SIAM: { demonym: "Siamese", options: [
    opt("a", C, G, "temple-arts and dance enrich the ward, funded by the city", { pays: C, why: "temple-arts and dance enrich the ward, funded by the city" }),
    opt("b", G, H, "their bustling trade pays well and crowds the streets", { pays: G, why: "their bustling trade pays well" })] },
  CIVILIZATION_SILLA: { demonym: "Silla", options: [
    opt("a", H, G, "pagoda-rites lift the ward, sustained by alms", { pays: C, why: "pagoda-rites lift the ward, sustained by alms" }),
    opt("b", C, P, "their crafts refine custom while the workshops idle", { pays: G, why: "their goldsmiths' crafts sell in every market" })] },

  // ── Age-flex origins ──
  CIVILIZATION_NEPAL: { demonym: "Nepali", options: [
    opt("a", FO, G, "mountain terraces feed the ward, tended at cost", { pays: G, why: "mountain terraces feed the ward and its market" }),
    opt("b", P, H, "their hill-fort masons and drillmasters raise strong works and hardy soldiers", { pays: D, why: "their hillmen serve abroad and win your city renown, and their pay comes from the treasury", label: "Enlist their hillmen" })] },
  CIVILIZATION_OTTOMANS: { demonym: "Ottoman", options: [
    opt("a", S, G, "külliye specialists teach and heal, at public cost", { pays: S, why: "külliye specialists teach and heal, at public cost" }),
    opt("b", C, P, "grand celebrations enrich custom while the workshops idle", { pays: C, why: "grand celebrations enrich custom, and the city pays for the feasts" })] },
  CIVILIZATION_PIRATE_REPUBLIC: { demonym: "Buccaneer", options: [
    opt("a", G, H, "their privateers and prize-crews fill your coffers and man your decks, lawlessly", { pays: G, why: "their privateers bring home prizes, lawlessly", label: "Hire their privateers" }),
    opt("b", P, C, "busy careening-yards work fast, and the port prizes speed over ceremony", { pays: S, why: "their navigators sell charts of every reef and current, at a price in coin" })] },
  CIVILIZATION_QAJAR: { demonym: "Qajar", options: [
    opt("a", FO, G, "walled garden-farms feed the ward, tended at cost", { pays: G, why: "walled garden-farms send fruit to market" }),
    opt("b", C, P, "Bāgh celebrations enrich custom while the workshops idle", { pays: C, why: "Bāgh celebrations enrich custom, and the city pays for them" })] },
  CIVILIZATION_SENGOKU: { demonym: "Sengoku", options: [
    opt("a", P, H, "their castle-town armourers forge blades and temper your warriors, sternly", { pays: S, why: "their castle-town armourers teach steelcraft, sternly and dearly", label: "Learn their steelcraft" }),
    opt("b", G, FO, "daimyō markets pay well, off the fields", { pays: G, why: "daimyō markets pay well" })] },
  CIVILIZATION_SHAWNEE: { demonym: "Shawnee", options: [
    opt("a", FO, G, "river-bottom gathering feeds the ward, at some cost", { pays: D, why: "their council speakers build alliances among the nations, and the gifts come from your treasury" }),
    opt("b", C, P, "council-rites enrich custom while the workshops idle", { pays: C, why: "council-rites enrich custom, and the city pays for the gatherings" })] },
  CIVILIZATION_TONGA: { demonym: "Tongan", options: [
    opt("a", FO, P, "ocean fisheries feed the fringe, drawing hands off the yards", { pays: D, why: "their navigators carry your name across the ocean, at a price in gifts" }),
    opt("b", G, C, "island trade-routes pay well, and the city keeps its accounts before its rites", { pays: G, why: "island trade-routes pay well" })] }
});

/**
 * The neutral fallback for any origin civ without a registry row (unknown / new DLC civ): a Culture
 * stance and a Gold stance, so a quarter still forms and offers a real choice without throwing.
 * @type {Readonly<QBonus>}
 */
export const NEUTRAL_QUARTER = Object.freeze({
  demonym: "",
  options: [
    opt("a", C, H, "their customs enrich the city, as two ways of life settle side by side", { pays: C, why: "their customs enrich the city, at a price in coin" }),
    opt("b", G, H, "their enclave pays into your treasury, and chafes at the levy", { pays: G, why: "their enclave pays into your treasury" })
  ]
});

/**
 * The quarter bonus entry for an origin CivilizationType, or the neutral fallback when unknown.
 * @param {string|null} civType e.g. "CIVILIZATION_ROME".
 * @returns {QBonus} The entry (never null).
 */
export function quarterBonus(civType) {
  const hit = civType ? QUARTER_BONUSES[civType] : null;
  return hit || NEUTRAL_QUARTER;
}

// ─────────────────────────────────────────────────────────────────────────────
// Flavor quotes: each option carries a short, REAL, ATTRIBUTED historical quote, shown in the choice
// modal beneath its benefit/cost note. Curation rules (enforced by tests/quarter-bonuses.mjs): every
// entry names a speaker (`who`) and a source work (`source`), the culture's OWN voice is preferred, and
// translations / contested attributions are marked (trans.) / (attr.). See docs/quote-sources.md.
// ─────────────────────────────────────────────────────────────────────────────

/** @typedef {{text:string, who:string, source:string}} QQuote */

/**
 * One flavor quote: the quoted line, the speaker, and the source work (may carry a (trans.) /
 * (attr. debated) marker). `source` may be "" only for a bare proverb whose "who" already names it.
 * @param {string} text @param {string} who @param {string} source @returns {QQuote}
 */
function q(text, who, source) {
  return { text, who, source };
}

/**
 * The per-civ, per-option quote registry, keyed by CivilizationType then option id ("a"/"b"), mirroring
 * QUARTER_BONUSES. Every registry civ has both options quoted; the neutral fallback and the passive
 * "let them be" stance carry none.
 * @type {Readonly<Record<string, {a:QQuote, b:QQuote}>>}
 */
export const QUARTER_QUOTES = Object.freeze({
  // ── Antiquity origins ──
  CIVILIZATION_ABBASID: { a: q("طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ. (Seeking knowledge is an obligation upon every Muslim.)", "the Prophet Muhammad", "Sunan Ibn Mājah 224"), b: q("وينبغى لنا ألا نستحي من استحسان الحق، واقتناء الحق من أين أتى… (We ought not to be ashamed to admire the truth and to acquire it, wherever it comes from…)", "al-Kindi", "On First Philosophy (9th c., trans.)") },
  CIVILIZATION_AKSUM: { a: q("ΤΟΥΤΟ ΑΡΕΣΗ ΤΗ ΧΩΡΑ (Toûto arésē tê chôra: may this please the country.)", "Aksumite coinage", "bronze coin legend (4th c.)"), b: q("ፍሥሓ ፡ ለይኲን ፡ ለአሕዛብ (Let the people be glad.)", "Emperor Armah", "Aksumite coin legend (7th c.)") },
  CIVILIZATION_ASSYRIA: { a: q("BÀD ù šal-ḫu-u šá NINA.KI eš-šiš ú-še-piš-ma ú-zaq-qir ḫur-šá-niš (I had the inner wall and outer wall of Nineveh built anew and raised them as high as mountains.)", "Sennacherib", "wall-slab inscription, Nineveh (RINAP 3/2, Sennacherib 82, trans.)"), b: q("aḫuz nēmeqi Nabû kullat ṭupšarrūti (I learned the wisdom of the god Nabû, all of the scribal arts.)", "Ashurbanipal", "Prism F (RINAP 5/1, Ashurbanipal 9, trans.)") },
  CIVILIZATION_BABYLON: { a: q("dannum enšam ana lā ḫabālim (That the strong might not oppress the weak.)", "Hammurabi", "Laws of Hammurabi, prologue i 37-39 (c. 1750 BCE, trans.)"), b: q("ἔστι δὲ χωρέων αὕτη πασέων μακρῷ ἀρίστη τῶν ἡμεῖς ἴδμεν Δήμητρος καρπὸν ἐκφέρειν (This land is by far the most fertile in grain which we know.)", "Herodotus", "Histories 1.193.2 (5th c. BCE, trans. Godley)") },
  CIVILIZATION_CARTHAGE: { a: q("Ἔδοξε Καρχηδονίοις Ἅννωνα πλεῖν ἔξω Στηλῶν Ἡρακλείων (It was resolved by the Carthaginians that Hanno should sail beyond the Pillars of Heracles.)", "Periplus of Hanno", "opening decree (5th c. BCE, trans.)"), b: q("νεωρίων τε ἔγεμον αἱ κρηπῖδες αἵδε ἐς ναῦς διακοσίας καὶ εἴκοσι πεποιημένων (These quays were lined with ship-sheds built for two hundred and twenty ships.)", "Appian", "Roman History, Punic Wars 96 (2nd c., trans.)") },
  CIVILIZATION_EGYPT: { a: q("πλεῖστα θωμάσια ἔχει ἢ ἡ ἄλλη πᾶσα χώρη καὶ ἔργα λόγου μέζω παρέχεται (It has more marvels than any other land, and works too great for words.)", "Herodotus", "Histories, Bk. II (trans.)"), b: q("Αἴγυπτος… δῶρον τοῦ ποταμοῦ (Egypt… is the gift of the river.)", "Herodotus (after Hecataeus)", "Histories, Bk. II (trans.)") },
  CIVILIZATION_GAUL: { a: q("Gallia est omnis divisa in partes tres. (Gaul as a whole is divided into three parts.)", "Julius Caesar", "Commentarii de Bello Gallico I.1 (c. 50 BCE)"), b: q("Disciplina in Britannia reperta atque inde in Galliam translata esse existimatur. (Their discipline is thought to have been discovered in Britain and carried thence into Gaul.)", "Julius Caesar", "Commentarii de Bello Gallico VI.13 (c. 50 BCE)") },
  CIVILIZATION_GREECE: { a: q("ὁ ἀνεξέταστος βίος οὐ βιωτὸς ἀνθρώπῳ. (The unexamined life is not worth living.)", "Socrates", "in Plato, Apology (trans.)"), b: q("φιλοκαλοῦμέν τε μετ' εὐτελείας καὶ φιλοσοφοῦμεν ἄνευ μαλακίας (We love the beautiful with economy, and wisdom without softness.)", "Pericles", "in Thucydides, History of the Peloponnesian War, Bk. II (trans.)") },
  CIVILIZATION_HAN: { a: q("農，天下之大本也 (Agriculture is the great foundation of all under heaven.)", "Emperor Wen of Han", "edict, Book of Han (2nd c. BCE, trans.)"), b: q("倉廩實而知禮節。 (When the granaries are full, the people know propriety.)", "Guanzi", "quoted in Sima Qian, Records of the Grand Historian (trans.)") },
  CIVILIZATION_KHMER: { a: q("大抵一歲中，可三四番收種。 (In general, three or four harvests a year can be had.)", "Zhou Daguan", "The Customs of Cambodia (1296, trans.)"), b: q("當國之中有金塔一座 (At the center of the kingdom stands a tower of gold.)", "Zhou Daguan", "The Customs of Cambodia (1296, trans.)") },
  CIVILIZATION_MAURYA: { a: q("save munise pajā mamā (All men are my children.)", "Ashoka", "Separate Rock Edict I, Dhauli (3rd c. BCE)"), b: q("magesu pi me nigohani lopapitani… amba-vadikya lopapita (On the roads banyan trees were planted by me… and mango-groves.)", "Ashoka", "Pillar Edict VII (Prakrit, Hultzsch)") },
  CIVILIZATION_MAYA: { a: q("Xa q'ana jal, saqi jal u tio'jil (Merely yellow ears of ripe maize, white ears of ripe maize their flesh.)", "Popol Vuh", "K'iche' text (trans. Christenson)"), b: q("Are u xe' ojer tzij, waral K'iche' u b'i'. Waral xchiqatz'ib'aj wi (This is the beginning of the ancient traditions of this place called Quiché. Here we shall write.)", "Popol Vuh", "preamble (16th c., trans. Christenson)") },
  CIVILIZATION_MISSISSIPPIAN: { a: q("What a stupendous pile of earth! To heap up such a mass must have required years, and the labors of thousands.", "Henry M. Brackenridge, at Cahokia", "Views of Louisiana (1814)"), b: q("I am glad to have this occasion of observing that those people respect the rights of hospitality, and that those rights always prevail…", "Le Page du Pratz, among the Natchez", "The History of Louisiana (1758, English 1774)") },
  CIVILIZATION_PERSIA: { a: q("ἀρχὰς κατεστήσατο εἴκοσι, τὰς αὐτοὶ καλέουσι σατραπηίας (He set up twenty provinces, which they themselves call satrapies.)", "Herodotus", "Histories, Bk. III (trans.)"), b: q("ἔστι δ' αὐτῶν ἃ καὶ ἐφύτευσα αὐτός (There are some of these that I planted myself.)", "Cyrus the Younger", "in Xenophon, Oeconomicus 4.24 (trans.)") },
  CIVILIZATION_ROME: { a: q("Tot aquarum tam multis necessariis molibus pyramidas videlicet otiosas compares… (Would you set the idle Pyramids beside these many indispensable works of water?)", "Frontinus", "On the Aqueducts of Rome (1st c., trans.)"), b: q("ἄγεται ἐκ πάσης γῆς καὶ θαλάττης ὅσα ὧραι φύουσι καὶ χῶραι ἕκασται φέρουσι (From every land and sea is brought whatever the seasons grow and each country bears.)", "Aelius Aristides", "Roman Oration (2nd c., trans.)") },

  // ── Exploration origins ──
  CIVILIZATION_BULGARIA: { a: q("Even if a man lives well, he dies, and another is born; let the one born last, seeing this, remember the one who made it.", "Khan Omurtag", "Tarnovo column inscription, in Greek (c. 822, trans.)"), b: q("Език свещен на моите деди (Sacred tongue of my forefathers.)", "Ivan Vazov", "The Bulgarian Language (1883, trans.)") },
  CIVILIZATION_CHOLA: { a: q("யாதானும் நாடாமால் ஊராமால் என்னொருவன் சாந்துணையுங் கல்லாத வாறு (The learned make each land their own, in every city find a home.)", "Tiruvalluvar", "Tirukkural 397 (trans. Pope)"), b: q("தொட்டனைத் தூறும் மணற்கேணி மாந்தர்க்குக் கற்றனைத் தூறும் அறிவு (In sandy soil, when deep you delve, you reach the springs below; the more you learn, the freer streams of wisdom flow.)", "Tiruvalluvar", "Tirukkural 396 (trans. Pope)") },
  CIVILIZATION_DAI_VIET: { a: q("賢才國家之元氣 (Hiền tài là nguyên khí của quốc gia: the virtuous and talented are the vital force of the state.)", "Thân Nhân Trung", "stele for the 1442 examination, Temple of Literature (1484, trans.)"), b: q("訓練士卒，習爾弓矢 (Drill the soldiers, and practice the bow and arrow.)", "Trần Hưng Đạo", "Proclamation to the Officers (1284, trans.)") },
  CIVILIZATION_ENGLAND: { a: q("Nullus liber homo capiatur vel imprisonetur… nisi per legale judicium parium suorum vel per legem terre. (No free man shall be seized or imprisoned… save by the lawful judgment of his peers or by the law of the land.)", "Magna Carta", "clause 39 (1215)"), b: q("This royal throne of kings, this sceptred isle… this precious stone set in the silver sea.", "William Shakespeare", "Richard II, II.i (c. 1595)") },
  CIVILIZATION_GORYEO: { a: q("陶器色之青者，麗人謂之翡色 (The green of their pottery the people of Goryeo call kingfisher-color.)", "Xu Jing", "Xuanhe fengshi Gaoli tujing, juan 32 (1124, trans.)"), b: q("我國家大業，必資諸佛護衛之力 (The great work of our state must rest upon the protecting power of the Buddhas.)", "Wang Geon (Taejo)", "Hunyo Sipjo, first injunction, in the Goryeosa (943, trans.)") },
  CIVILIZATION_HAWAII: { a: q("He aliʻi ka ʻāina; he kauwā ke kanaka. (The land is a chief; man is its servant.)", "ʻŌlelo Noʻeau", "coll. Mary Kawena Pukui (1983)"), b: q("I ka ʻōlelo nō ke ola, i ka ʻōlelo nō ka make. (Life is in speech; death is in speech.)", "ʻŌlelo Noʻeau", "coll. Mary Kawena Pukui (1983)") },
  CIVILIZATION_INCA: { a: q("desde que hay memoria de gente, no se ha leído de tanta grandeza como tuvo este camino, hecho por valles hondos y por sierras altas (Since men have memory, none has read of so great a road as this, made through deep valleys and high sierras.)", "Pedro Cieza de León", "El Señorío de los Incas, ch. 63 (c. 1550, trans.)"), b: q("En los cerros y laderas que eran de buena tierra hacían andenes para allanarlas, como hoy se ven en el Cozco y en todo el Perú (On the hills and slopes that were good land they made terraces to level them, as are seen today in Cuzco and all Peru.)", "Garcilaso de la Vega", "Comentarios Reales de los Incas, Bk. V (1609, trans.)") },
  CIVILIZATION_MAJAPAHIT: { a: q("hetunyanantara sarwwajana tka saken anyadeça prakirnna (That is why, without ceasing, people of every kind come from other lands.)", "Mpu Prapanca", "Nagarakretagama 83.4 (1365, trans.)"), b: q("其各處番船多到此地買賣……民甚殷富 (Foreign ships from every place come here to trade… the people are very rich.)", "Ma Huan", "Yingya Shenglan, on Gresik (1433, trans.)") },
  CIVILIZATION_MING: { a: q("涉滄溟十萬餘里。 (We have traversed more than one hundred thousand li of vast water-spaces.)", "Zheng He", "Changle stele (1431, trans.)"), b: q("知是行之始，行是知之成 (Knowledge is the beginning of practice; doing is the completion of knowing.)", "Wang Yangming", "Instructions for Practical Living (1518, trans. Henke)") },
  CIVILIZATION_MONGOLIA: { a: q("If, like the bound arrow-shafts, you remain together and of one mind, how can anyone deal with you so easily?", "Alan Qo'a, in the Secret History of the Mongols", "§22 (13th c., trans. de Rachewiltz)"), b: q("di capo de le 25 miglie egli truovano una posta, … ove albergano li messaggi del Grande Sire (Every twenty-five miles the messengers find a post-house, … where the Great Khan's couriers lodge.)", "Marco Polo", "Il Milione, ch. 97 (trans.)") },
  CIVILIZATION_NORMAN: { a: q("ISTE JUSSIT UT FODERETUR CASTELLUM AT HESTENGA (He ordered that a castle be dug at Hastings.)", "Bayeux Tapestry", "(c. 1070s, trans.)"), b: q("HIC WILLELM[US] DUX JUSSIT NAVES [A]EDIFICARE (Here Duke William ordered ships to be built.)", "Bayeux Tapestry", "(c. 1070s, trans.)") },
  CIVILIZATION_SONGHAI: { a: q("sono molte botteghe di artigiani e mercatanti, e massimamente di tessitori di tele di bambagio (There are many shops of craftsmen and merchants, above all weavers of cotton cloth.)", "Leo Africanus", "Description of Africa (1550, trans.)"), b: q("Vendonsi molti libri scritti a mano, che vengono di Barberia; e di questi si fa più guadagno che del rimanente delle mercatanzie (Many handwritten books are sold, brought from Barbary; and more profit is made on these than on all other goods.)", "Leo Africanus", "Description of Africa (1550, trans.)") },
  CIVILIZATION_SPAIN: { a: q("el que lee mucho y anda mucho, vee mucho y sabe mucho (He who reads much and travels much sees and knows a great deal.)", "Miguel de Cervantes", "Don Quixote II.25 (1615, trans. Ormsby)"), b: q("Nada te turbe; / nada te espante; / todo se pasa… (Let nothing disturb thee, / Nothing affright thee; / All things are passing…)", "Teresa of Ávila", "Nada te turbe (16th c., trans. Longfellow)") },

  // ── Modern origins ──
  CIVILIZATION_AMERICA: { a: q("After all, the chief business of the American people is business.", "Calvin Coolidge", "address to the American Society of Newspaper Editors (1925)"), b: q("I hear America singing, the varied carols I hear.", "Walt Whitman", "I Hear America Singing (1860)") },
  CIVILIZATION_BUGANDA: { a: q("The plantains cover large areas of land; sometimes a garden (so-called) extends for several miles…", "John Roscoe", "The Baganda (1911)"), b: q("Agali awamu ge galuma ennyama. (Teeth set together are the ones that chew the meat; unity gives strength.)", "Ganda proverb", "coll. F. Walser, Luganda Proverbs") },
  CIVILIZATION_FRENCH_EMPIRE: { a: q("…le but d’une Encyclopédie est de rassembler les connoissances éparses sur la surface de la terre (…the aim of an encyclopedia is to assemble the knowledge scattered over the face of the earth.)", "Denis Diderot", "Encyclopédie, vol. V (1755, trans.)"), b: q("Le commerce guérit des préjugés destructeurs : & c’est presque une regle générale que, par-tout où il y a des mœurs douces, il y a du commerce. (Commerce cures destructive prejudices; and it is almost a general rule that wherever manners are gentle, there is commerce.)", "Montesquieu", "The Spirit of the Laws XX.1 (1748, trans.)") },
  CIVILIZATION_GREAT_BRITAIN: { a: q("Every man thus lives by exchanging, or becomes, in some measure, a merchant, and the society itself grows to be what is properly a commercial society.", "Adam Smith", "The Wealth of Nations I.4 (1776)"), b: q("And was Jerusalem builded here, among these dark Satanic Mills?", "William Blake", "Milton (1804)") },
  CIVILIZATION_HEIAN: { a: q("春はあけぼの、やうやう白くなりゆく山ぎは… (In spring, the dawn, when the slowly paling mountain rim grows faintly light.)", "Sei Shōnagon", "The Pillow Book (c. 1002, trans.)"), b: q("一条の大路、所なく、むくつけきまで騒ぎたり (The great avenue, with no room to spare, was astir with the festival throng.)", "Murasaki Shikibu", "The Tale of Genji, 'Aoi' (11th c., trans.)") },
  CIVILIZATION_ICELAND: { a: q("með lögum skal land vort byggja en eigi með ólögum eyða (With law shall our land be built up and settled, and with lawlessness wasted and spoiled.)", "Njáll Þorgeirsson", "Njáls saga, ch. 70 (trans. Dasent)"), b: q("Deyr fé, deyja frændr, deyr sjalfr it sama; ek veit einn, at aldrei deyr: dómr um dauðan hvern. (Cattle die, and kinsmen die, and so one dies one's self; one thing I know that never dies, the fame of a dead man's deeds.)", "Hávamál", "Poetic Edda, st. 77 (trans. Bellows)") },
  CIVILIZATION_JOSEON: { a: q("國之語音，異乎中國 (The speech of our country differs from that of China.)", "King Sejong", "Hunminjeongeum, preface (1446)"), b: q("初學先須立志 (One who begins to learn must first set his will.)", "Yi I (Yulgok)", "Gyeokmong yogyeol (1577)") },
  CIVILIZATION_MEIJI: { a: q("智識ヲ世界ニ求メ… (Knowledge shall be sought throughout the world…)", "the Charter Oath", "article 5 (1868, trans.)"), b: q("「天は人の上に人を造らず人の下に人を造らず」と言えり。 (Heaven, it is said, does not create one man above or below another.)", "Fukuzawa Yukichi", "An Encouragement of Learning (1872, trans.)") },
  CIVILIZATION_MEXICO: { a: q("Yo no estudio para escribir, ni menos para enseñar […], sino sólo por ver si con estudiar ignoro menos. (I do not study in order to write, still less to teach, but only to see whether by studying I may be less ignorant.)", "Sor Juana Inés de la Cruz", "Reply to Sor Filotea (1691, trans.)"), b: q("Entre los individuos, como entre las naciones, el respeto al derecho ajeno es la paz. (Among individuals, as among nations, respect for the rights of others is peace.)", "Benito Juárez", "Manifesto to the Nation (15 July 1867)") },
  CIVILIZATION_MUGHAL: { a: q("اگر فردوس بر روی زمین است، همین است و همین است و همین است (If there is a paradise on earth, it is this, it is this, it is this.)", "Diwan-i-Khas inscription, Red Fort", "(c. 1648, trans.)"), b: q("It should not escape notice that gold and silver, after circulating in every other quarter of the globe, come at length to be swallowed up… in Hindoustan.", "François Bernier", "Travels in the Mogul Empire (1670, trans. Constable)") },
  CIVILIZATION_PRUSSIA: { a: q("Die Religionen Müsen alle Tolleriret werden … den hier mus ein jeder nach Seiner Fasson Selich werden. (All religions must be tolerated… for here everyone must find salvation in his own fashion.)", "Frederick II", "marginal note (1740, trans.)"), b: q("Der Krieg ist eine bloße Fortsetzung der Politik mit anderen Mitteln. (War is the continuation of policy by other means.)", "Carl von Clausewitz", "On War (1832, trans.)") },
  CIVILIZATION_QING: { a: q("見藐小微物，必細察其紋理，故時有物外之趣。 (Whenever I saw some tiny thing, I had to study its grain closely, and so I often found a delight beyond the thing itself.)", "Shen Fu", "Six Records of a Floating Life (1809, trans.)"), b: q("世事洞明皆學問，人情練達即文章。 (To see clearly into the world's affairs is true learning; to be versed in human feeling is true letters.)", "Cao Xueqin", "Dream of the Red Chamber, ch. 5 (18th c., trans.)") },
  CIVILIZATION_RUSSIA: { a: q("Здесь будет город заложён на зло надменному соседу. (Here a city shall be founded, to spite our arrogant neighbor.)", "Alexander Pushkin", "The Bronze Horseman (1833, trans.)"), b: q("Мир спасет красота. (The world will be saved by beauty.)", "Prince Myshkin, as Ippolit reports", "in Dostoevsky, The Idiot (1869, trans.)") },
  CIVILIZATION_SIAM: { a: q("ด้วยเสียงพาทย์เสียงพิณ เสียงเลื่อนเสียงขับ ใครจักมักเล่นเล่น ใครจักมักหัวหัว ใครจักมักเลื่อนเลื่อน (With drums and lutes, chanting and song: whoever wishes to play, plays; whoever wishes to laugh, laughs; whoever wishes to sing, sings.)", "Ramkhamhaeng Inscription", "side 2 (1292, trans.)"), b: q("ในน้ำมีปลา ในนามีข้าว (In the water there are fish, in the fields there is rice.)", "Ramkhamhaeng Inscription", "(1292, trans.)") },
  CIVILIZATION_SILLA: { a: q("國有玄妙之道，曰風流 (The country has a profound and mysterious Way, called Pungnyu.)", "Choe Chiwon", "preface to the Nallang stele, in Samguk sagi (9th c., trans.)"), b: q("城中無一草屋。接角連牆。歌吹滿路。晝夜不絕。 (Not one thatched house stood in the city; roofs touched and walls adjoined, and song and piping filled the streets day and night.)", "Samguk Yusa", "Iryeon, on King Heongang's reign (13th c., trans.)") },

  // ── Age-flex origins ──
  CIVILIZATION_NEPAL: { a: q("The terraces or steps… are constructed with no small labor (often extending to the tops of the highest hills).", "William Kirkpatrick", "An Account of the Kingdom of Nepaul (1811)"), b: q("यो राजे दुई ढुङ्गाको तरुल जस्तो रहेछ (This realm is like a yam between two stones.)", "Prithvi Narayan Shah", "Divya Upadesh (18th c., trans.)") },
  CIVILIZATION_OTTOMANS: { a: q("Halk içinde mu'teber bir nesne yok devlet gibi, olmaya devlet cihanda bir nefes sıhhat gibi. (Among people nothing is prized like the state, yet no fortune on earth is like one breath of health.)", "Süleyman the Magnificent (Muhibbî)", "Dîvân-ı Muhibbî (16th c.)"), b: q("Bir safâ bahşedelim gel şu dil-i nâ-şâda, gidelim serv-i revânım yürü Sa'd-âbâd'a. (Let us grant some joy to this joyless heart; come, my graceful cypress, let us away to Sa'dabad.)", "Nedîm", "Dîvân (Tulip Era, 18th c.)") },
  CIVILIZATION_PIRATE_REPUBLIC: { a: q("A merry life and a short one shall be my motto.", "Bartholomew Roberts", "in A General History of the Pyrates (1724)"), b: q("Every Man has a Vote in Affairs of Moment; has equal Title to the fresh Provisions…", "Articles of Bartholomew Roberts's crew", "in A General History of the Pyrates (1724)") },
  CIVILIZATION_QAJAR: { a: q("درخت دوستی بنشان که کام دل به بار آرد (Plant the tree of friendship, that it bring the heart's desire to fruit.)", "Hafez", "Divan, Ghazal 115 (14th c., trans.)"), b: q("گر دست دهد ز مغز گندم نانی… عیشی بود آن نه حد هر سلطانی (Given but a loaf of wheaten bread… that were a joy beyond any sultan.)", "Omar Khayyám", "Rubáiyát (rubāʿī 175, trans.)") },
  CIVILIZATION_SENGOKU: { a: q("疾如風、徐如林、侵掠如火、不動如山 (Swift as the wind, silent as the forest, fierce as fire, immovable as the mountain.)", "Takeda Shingen", "Fūrinkazan banner (after Sun Tzu, trans.)"), b: q("楽市楽座之上、諸商売すへき事 (Under free markets and open guilds, let all trade be carried on.)", "Oda Nobunaga", "edict to the Kanō market, Gifu (1568, trans.)") },
  CIVILIZATION_SHAWNEE: { a: q("Sell a country! Why not sell the air, the clouds and the great sea, as well as the earth?", "Tecumseh", "at Vincennes (1810), as given in Gurd (1912)"), b: q("Our lives are in the hands of the Great Spirit. We are determined to defend our lands, and if it be his will, we wish to leave our bones upon them.", "Tecumseh", "speech to Procter (1813), in Drake (1841)") },
  CIVILIZATION_TONGA: { a: q("Ko e ʻOtua mo Tonga ko hoku Tofiʻa (God and Tonga are my inheritance.)", "motto of the Kingdom of Tonga", "(1875)"), b: q("…therefore shall the people of Tonga and all who sojourn or may sojourn in this Kingdom be free for ever.", "King George Tupou I", "Constitution of Tonga, clause 1 (1875)") }
});

// Unicode blocks the game's UI fonts cannot draw, so they render as tofu (□): RTL, CJK, Greek, Cyrillic,
// Ethiopic, Hebrew, Armenian, Syriac, the Indic scripts, Thai, Lao, Tibetan, Myanmar, Georgian, Khmer and
// Mongolian. Latin-extended DIACRITICS (ā, ê, š, ḫ, …) render fine and are NOT here (the schwa ǝ does not).
// Every registry quote in one of these scripts is written "<original> (<Latin translation>)", so when the
// original won't render we fall back to the parenthetical translation.
const UNRENDERABLE_SCRIPT =
  /[Ͱ-ϿЀ-ӿ԰-֏֐-׿؀-ۿ܀-ݏऀ-෿฀-࿿က-ჿሀ-፿ក-៿᠀-᢯぀-ヿ一-鿿가-힯]/;

/**
 * A display-safe quote line. When the quoted text is in a script the game font cannot draw (Arabic, Greek,
 * CJK, …) return the trailing "(translation)" the registry pairs with every such quote instead. Latin
 * quotes pass through unchanged.
 * @param {string} text The raw quote text. @returns {string} A renderable version.
 */
function renderableQuote(text) {
  if (!UNRENDERABLE_SCRIPT.test(text)) return text;
  const paren = text.match(/\(([^()]*)\)\s*$/);
  const inner = paren ? paren[1].trim() : text.replace(new RegExp(UNRENDERABLE_SCRIPT.source + "+", "g"), "").trim();
  return inner.replace(/^[\s.,;:—–-]+|[\s]+$/g, "").trim() || text;
}

// A run of unrenderable text followed by its parenthetical Latin translation, wherever it sits inside a
// larger line. `[^"()]*` on each side stops at the wrapping quotes / the source's own parens, so ONLY the
// "<original script> (translation)" span is captured — the surrounding "…" and — who, source are left be.
const UNRENDERABLE_RUN = new RegExp('[^"()]*' + UNRENDERABLE_SCRIPT.source + '[^"()]*\\(([^()]*)\\)', "g");

/**
 * A display-safe version of an ALREADY-COMPOSED quote line (`"<text>" <who>[, <source>]`), for the
 * in-game path where the line comes back whole from Locale.compose. Collapses each "<unrenderable
 * original> (Latin translation)" span to just the translation, then drops any residual unrenderable
 * characters. A no-op for an all-renderable line.
 * @param {string} line The composed quote line. @returns {string} The renderable line.
 */
export function renderableLine(line) {
  if (typeof line !== "string" || !UNRENDERABLE_SCRIPT.test(line)) return line;
  const collapsed = line
    .replace(UNRENDERABLE_RUN, (_m, inner) => String(inner).trim())
    .replace(new RegExp(UNRENDERABLE_SCRIPT.source + "+", "g"), "");
  return collapsed.replace(/\s+([.,;:])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

/**
 * Compose a quote for display: `"<text>" <who>[, <source>]`. The attribution follows the closing quote
 * with no dash (the dilemma view splits there); a parenthetical source joins with a space and an empty
 * source is omitted. Unrenderable original scripts fall back to their Latin translation ({@link renderableQuote}).
 * @param {QQuote|null|undefined} quote @returns {string} The one-line display string ("" when no quote).
 */
export function quoteDisplay(quote) {
  if (!quote || !quote.text) return "";
  return '"' + renderableQuote(quote.text) + '" ' + quote.who + sourceSuffix(quote.source);
}

/**
 * The source part of a quote line: a parenthetical source joins with a space, a worded one with a comma.
 * @param {string} source The source ("" for none). @returns {string} The suffix.
 */
function sourceSuffix(source) {
  return source ? (source.charAt(0) === "(" ? " " : ", ") + source : "";
}

/**
 * The LOC row text for a quote: the same line as {@link quoteDisplay} but with the original script kept, as
 * the text rows ship it ({@link renderableLine} reduces it at display time). Pure.
 * @param {QQuote|null|undefined} quote @returns {string} The row text ("" when no quote).
 */
export function quoteRowText(quote) {
  if (!quote || !quote.text) return "";
  return '"' + quote.text + '" ' + quote.who + sourceSuffix(quote.source);
}

/**
 * The LOC key for a civ/option quote, e.g. "LOC_EMIG_QTR_Q_ROME_A". Deterministic from the civ key
 * (its "CIVILIZATION_" prefix stripped) and the uppercased option id, so it stays in lockstep with the
 * en_us ModText.xml rows and the i18n source without a separate registration list.
 * @param {string} civType e.g. "CIVILIZATION_ROME". @param {string} id "a" or "b".
 * @returns {string} The LOC key.
 */
export function quarterQuoteKey(civType, id) {
  return "LOC_EMIG_QTR_Q_" + String(civType || "").replace(/^CIVILIZATION_/, "") + "_" + String(id).toUpperCase();
}

/**
 * The flavor quote for an origin civ's option, or null when the civ has no row (neutral fallback) or
 * the id is not a quoted option (e.g. the passive "ignore" stance).
 * @param {string|null} civType e.g. "CIVILIZATION_ROME". @param {string} id "a" or "b".
 * @returns {QQuote|null} The quote, or null.
 */
export function quarterQuote(civType, id) {
  const row = civType ? QUARTER_QUOTES[civType] : null;
  return (row && /** @type {Record<string, QQuote>} */ (row)[id]) || null;
}

// Test hook.
export const __test = { QUARTER_BONUSES, NEUTRAL_QUARTER, QUARTER_QUOTES, opt, q };
