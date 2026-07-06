// emigration-quarter-bonuses.js
//
// The PER-CIVILISATION Cultural Quarter registry (plan §7): each origin civilization offers TWO
// identity-grounded trade-off options for its quarter, plus a demonym for naming. Every option is a
// small benefit yield paired with a matching drawback yield, with a one-line historical justification
// ("why") — a scaled-down, city-scoped echo of that civ's real Civ VII identity, never generic filler.
//
// This module is PURE DATA + a lookup: it names YIELD IDENTITIES and flavour only; the concrete
// AMOUNTS live in CONFIG (so balance stays in one place, exactly as the civ-agnostic registry did).
// Keyed by the GameInfo CivilizationType string (e.g. "CIVILIZATION_ROME"), resolved from a player's
// civilizationType via emigration-naming.js `civType()`. Any civ WITHOUT a row still forms a quarter
// (NEUTRAL fallback: a neutral ±Culture/Happiness pair), so the feature never throws on an unknown or
// DLC civ.
//
// The draft yields transcribe plan §7 (grounded in each civ's uniques); they are a balance STARTING
// POINT and may be re-verified against the shipped civ data (emigration-civ-tuning.js cites the source).

/** @typedef {{id:string, benefit:string, penalty:string, why:string, label?:string}} QBonusOption */
/** @typedef {{demonym:string, options:QBonusOption[]}} QBonus */

/**
 * One option: benefit yield ▸ penalty yield ▸ why, with an optional button-label override (used to give
 * martial civs a military-flavoured action verb instead of the yield-derived default).
 * @param {string} id @param {string} benefit @param {string} penalty @param {string} why
 * @param {string} [label] Optional label override.
 * @returns {QBonusOption}
 */
function opt(id, benefit, penalty, why, label) {
  return label ? { id, benefit, penalty, why, label } : { id, benefit, penalty, why };
}

const C = "YIELD_CULTURE";
const G = "YIELD_GOLD";
const P = "YIELD_PRODUCTION";
const S = "YIELD_SCIENCE";
const F = "YIELD_FAITH";
const FO = "YIELD_FOOD";
const H = "YIELD_HAPPINESS";

/**
 * The per-civilisation quarter registry. Each entry: a demonym (for "<Demonym> Quarter" naming, which
 * OVERRIDES the game adjective where they differ — e.g. Carthage → "Punic") and two options a/b.
 * @type {Readonly<Record<string, QBonus>>}
 */
export const QUARTER_BONUSES = Object.freeze({
  // ── Antiquity origins ──
  CIVILIZATION_ABBASID: { demonym: "Abbasid", options: [
    opt("a", S, G, "House-of-Wisdom scholars translate, but their stipends drain the treasury"),
    opt("b", H, P, "famed gardens and salons soothe the city, but few hands work the yards")] },
  CIVILIZATION_AKSUM: { demonym: "Aksumite", options: [
    opt("a", G, C, "Red-Sea traders enrich the docks, but coin flows to the quays, not the old rites"),
    opt("b", F, H, "their stelae-churches draw pilgrims, and the crowds throng the ward")] },
  CIVILIZATION_ASSYRIA: { demonym: "Assyrian", options: [
    opt("a", P, H, "their siege-engineers arm your foundries — rams and towers roll out — though their martial bearing sours the ward", "Arm your siege-works"),
    opt("b", S, G, "captured codices fill the archives, but curating spoils costs coin")] },
  CIVILIZATION_CARTHAGE: { demonym: "Punic", options: [
    opt("a", G, FO, "Punic merchants fill the wharves, drawing hands off the fields"),
    opt("b", P, C, "shipwrights raise busy yards, and the city prizes tonnage over temples")] },
  CIVILIZATION_EGYPT: { demonym: "Egyptian", options: [
    opt("a", C, G, "monument-masons adorn the district, but upkeep of their works is dear"),
    opt("b", FO, P, "Nile-style flood-farming feeds the ward, but pulls labour off the works")] },
  CIVILIZATION_GREECE: { demonym: "Greek", options: [
    opt("a", S, H, "an agora of philosophers, and their factional politics"),
    opt("b", C, P, "theatres and porticoes flourish while the workshops idle")] },
  CIVILIZATION_HAN: { demonym: "Han", options: [
    opt("a", FO, H, "intensive farming feeds many, at the cost of crowding"),
    opt("b", P, G, "public-works crews build fast, but the corvée is subsidised")] },
  CIVILIZATION_KHMER: { demonym: "Khmer", options: [
    opt("a", FO, G, "baray-style irrigation greens the fringe, but the waterworks cost coin"),
    opt("b", F, H, "their temple-processions draw great crowds that throng the streets")] },
  CIVILIZATION_MAURYA: { demonym: "Mauryan", options: [
    opt("a", F, G, "ascetic orders bless the ward, sustained by alms"),
    opt("b", FO, P, "stepwell gardens yield well, but tie up hands")] },
  CIVILIZATION_MAYA: { demonym: "Maya", options: [
    opt("a", S, P, "sky-watchers keep observatories, not workshops"),
    opt("b", FO, H, "dense milpa plots feed many, but crowd the fringe")] },
  CIVILIZATION_MISSISSIPPIAN: { demonym: "Mississippian", options: [
    opt("a", C, G, "mound-rites enrich the ward's life, funded by tribute"),
    opt("b", FO, P, "woodland gathering feeds the district, off the yards")] },
  CIVILIZATION_PERSIA: { demonym: "Persian", options: [
    opt("a", G, H, "satrapal tribute flows in, and resentment with it"),
    opt("b", C, FO, "walled pleasure-gardens delight, but eat good farmland")] },
  CIVILIZATION_ROME: { demonym: "Roman", options: [
    opt("a", P, H, "Roman engineers and veterans raise your works and drill your legions — but the eagle's shadow chafes", "Drill your legions"),
    opt("b", G, C, "their roads pull trade to the city, and coin sets the fashion")] },

  // ── Exploration origins ──
  CIVILIZATION_BULGARIA: { demonym: "Bulgar", options: [
    opt("a", P, H, "their horse-and-forge veterans harden your cavalry — and brawl as hard as they fight", "Harden their riders"),
    opt("b", G, C, "frontier markets thrive, and the city keeps fuller ledgers than calendars")] },
  CIVILIZATION_CHOLA: { demonym: "Chola", options: [
    opt("a", G, FO, "Tamil maritime traders fill the harbours, drawing hands off the soil"),
    opt("b", F, H, "great temple-tanks draw pilgrims, and the festival crowds throng the ward")] },
  CIVILIZATION_DAI_VIET: { demonym: "Dai Viet", options: [
    opt("a", C, G, "wall-scholars keep learning alive, at public cost"),
    opt("b", P, FO, "fort-works employ many hands off the fields")] },
  CIVILIZATION_HAWAII: { demonym: "Hawaiian", options: [
    opt("a", FO, P, "fish-ponds and reefs feed the ward, drawing hands off the yards"),
    opt("b", C, G, "heiau rites enrich island custom, funded by the city")] },
  CIVILIZATION_INCA: { demonym: "Inca", options: [
    opt("a", P, G, "terrace-masons and road-crews build superbly, at expense"),
    opt("b", FO, H, "mountain terraces feed many in a crowded ward")] },
  CIVILIZATION_MAJAPAHIT: { demonym: "Majapahit", options: [
    opt("a", G, C, "spice-route factors enrich the docks, and the wharves talk profit over pageantry"),
    opt("b", FO, P, "coastal fisheries feed the fringe off the yards")] },
  CIVILIZATION_MING: { demonym: "Ming", options: [
    opt("a", G, P, "porcelain and silk factors fill the ledgers while the kilns run cool"),
    opt("b", C, H, "imperial arts refine the ward, and its finery outshines humbler streets")] },
  CIVILIZATION_MONGOLIA: { demonym: "Mongol", options: [
    opt("a", P, H, "their horse-lines and smiths keep your cavalry shod, remounted and armed — but the swagger grates", "Muster their horsemen"),
    opt("b", G, C, "steppe tribute-routes pay well, and the city counts coin where it once kept ceremony")] },
  CIVILIZATION_NORMAN: { demonym: "Norman", options: [
    opt("a", P, H, "their castle-masons and knights raise strong works and temper your men-at-arms", "Raise their knights"),
    opt("b", G, FO, "feudal rents fill the coffers, off the farms")] },
  CIVILIZATION_SONGHAI: { demonym: "Songhai", options: [
    opt("a", G, FO, "river-and-salt caravans fill the market, drawing hands off the soil"),
    opt("b", S, H, "their scholars keep famed libraries, and famed feuds")] },
  CIVILIZATION_SPAIN: { demonym: "Spanish", options: [
    opt("a", G, H, "treasure-fleet factors enrich the port amid conversion strife"),
    opt("b", F, C, "their missions win souls and overwrite old custom")] },

  // ── Modern origins ──
  CIVILIZATION_AMERICA: { demonym: "American", options: [
    opt("a", P, H, "factory-hands drive output, but the shifts breed unrest"),
    opt("b", C, G, "their cinema and jazz enliven the ward, at a subsidy")] },
  CIVILIZATION_BUGANDA: { demonym: "Bugandan", options: [
    opt("a", FO, G, "lakeshore gardens feed the ward, tended at cost"),
    opt("b", C, P, "bark-cloth artisans enrich custom, off the yards")] },
  CIVILIZATION_FRENCH_EMPIRE: { demonym: "French", options: [
    opt("a", C, P, "salons and Great Works flourish while workshops idle"),
    opt("b", G, H, "luxury trade enriches the ward, and its airs vex the poor")] },
  CIVILIZATION_GREAT_BRITAIN: { demonym: "British", options: [
    opt("a", G, H, "counting-houses and clerks profit; the mills breed grievance"),
    opt("b", P, FO, "industrial works run hot, drawing hands off the farms")] },
  CIVILIZATION_HEIAN: { demonym: "Heian", options: [
    opt("a", C, P, "courtly refinement flowers while the workshops idle"),
    opt("b", H, G, "their festivals lift the whole city, at the treasury's cost")] },
  CIVILIZATION_ICELAND: { demonym: "Icelandic", options: [
    opt("a", P, FO, "their shipwrights and crews build fast longships, drawing hands off the farms", "Launch their longships"),
    opt("b", C, G, "saga-singers keep the ward's memory, funded by the city")] },
  CIVILIZATION_MEIJI: { demonym: "Meiji", options: [
    opt("a", P, H, "their arsenals and conscript drill build a modern army at a hard human pace", "Modernise your army"),
    opt("b", S, C, "headlong modernisation, and old custom set aside")] },
  CIVILIZATION_MEXICO: { demonym: "Mexican", options: [
    opt("a", C, G, "murals and fiestas colour the ward, funded by the city"),
    opt("b", H, P, "tight-knit community lifts spirits over output")] },
  CIVILIZATION_MUGHAL: { demonym: "Mughal", options: [
    opt("a", C, G, "miniaturists and architects adorn the ward, at expense"),
    opt("b", G, FO, "fine-textile trade fills the docks, drawing hands off the fields")] },
  CIVILIZATION_PRUSSIA: { demonym: "Prussian", options: [
    opt("a", P, H, "their drill-masters and arsenals forge a disciplined army, stiffly", "Drill your regiments"),
    opt("b", S, C, "their war-academies teach hard, and set old ways aside")] },
  CIVILIZATION_QING: { demonym: "Qing", options: [
    opt("a", FO, H, "dense growth feeds many in a crowded ward"),
    opt("b", G, P, "treaty-port factors fill the ledgers, and the workshops slow")] },
  CIVILIZATION_RUSSIA: { demonym: "Russian", options: [
    opt("a", P, FO, "heavy-industry crews work hard in a hungry ward"),
    opt("b", C, G, "their letters and theatre enrich the city, at a subsidy")] },
  CIVILIZATION_SIAM: { demonym: "Siamese", options: [
    opt("a", C, G, "temple-arts and dance enrich the ward, funded by the city"),
    opt("b", G, H, "their bustling trade pays well and crowds the streets")] },
  CIVILIZATION_SILLA: { demonym: "Silla", options: [
    opt("a", H, G, "pagoda-rites lift the ward, sustained by alms"),
    opt("b", C, P, "their crafts refine custom while the workshops idle")] },

  // ── Age-flex origins ──
  CIVILIZATION_NEPAL: { demonym: "Nepali", options: [
    opt("a", FO, G, "mountain terraces feed the ward, tended at cost"),
    opt("b", P, H, "their hill-fort masons and drillmasters raise strong works and hardy soldiers", "Train their hillmen")] },
  CIVILIZATION_OTTOMAN: { demonym: "Ottoman", options: [
    opt("a", S, G, "külliye specialists teach and heal, at public cost"),
    opt("b", C, P, "grand celebrations enrich custom while the workshops idle")] },
  CIVILIZATION_PIRATE_REPUBLIC: { demonym: "Buccaneer", options: [
    opt("a", G, H, "their privateers and prize-crews fill your coffers and man your decks, lawlessly", "Hire their privateers"),
    opt("b", P, C, "busy careening-yards work fast, and the port prizes speed over ceremony")] },
  CIVILIZATION_QAJAR: { demonym: "Qajar", options: [
    opt("a", FO, G, "walled garden-farms feed the ward, tended at cost"),
    opt("b", C, P, "Bāgh celebrations enrich custom while the workshops idle")] },
  CIVILIZATION_SENGOKU: { demonym: "Sengoku", options: [
    opt("a", P, H, "their castle-town armourers forge blades and temper your warriors, sternly", "Forge their blades"),
    opt("b", G, FO, "daimyō markets pay well, off the fields")] },
  CIVILIZATION_SHAWNEE: { demonym: "Shawnee", options: [
    opt("a", FO, G, "river-bottom gathering feeds the ward, at some cost"),
    opt("b", C, P, "council-rites enrich custom while the workshops idle")] },
  CIVILIZATION_TONGA: { demonym: "Tongan", options: [
    opt("a", FO, P, "ocean fisheries feed the fringe, drawing hands off the yards"),
    opt("b", G, C, "island trade-routes pay well, and the city keeps its accounts before its rites")] }
});

/**
 * The neutral fallback for any origin civ without a registry row (unknown / new DLC civ): a single
 * gentle Culture/Happiness pair, so a quarter still forms and offers a real choice without throwing.
 * @type {Readonly<QBonus>}
 */
export const NEUTRAL_QUARTER = Object.freeze({
  demonym: "",
  options: [
    opt("a", C, H, "their customs enrich the city, as two ways of life settle side by side"),
    opt("b", G, H, "their enclave pays into your treasury, and chafes at the levy")
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
// Flavour quotes (plan §8): each option carries a short, REAL, ATTRIBUTED historical quote, shown in
// the choice modal beneath its benefit/cost note so the moment reads as a page of history rather than
// a menu. Curation rules (enforced by tests/quarter-bonuses.mjs): every entry names a speaker (`who`)
// and a source work (`source`); the culture's OWN voice is preferred (primary source of that people
// first, a named historian of that people only as fallback); conquest/colonial civs deliberately quote
// a critical or plain primary voice (Spain → Las Casas, Qing → Lin Zexu, Mongolia → a governance line),
// and no genocidaires/hate figures. Where wording is a translation or an attribution is contested it is
// marked (trans.) / (attr. debated) in `source` and must be re-verified against the cited work before
// shipping (the citation is the source of truth, the wording a draft).
// ─────────────────────────────────────────────────────────────────────────────

/** @typedef {{text:string, who:string, source:string}} QQuote */

/**
 * One flavour quote: the quoted line, the speaker, and the source work (may carry a (trans.) /
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
  CIVILIZATION_ABBASID: { a: q("طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ. (Seeking knowledge is an obligation upon every Muslim.)", "the Prophet Muhammad", "Sunan Ibn Mājah 224"), b: q("Baghdad became the intellectual capital of the medieval world.", "Philip K. Hitti", "History of the Arabs (1937)") },
  CIVILIZATION_AKSUM: { a: q("ΤΟΥΤΟ ΑΡΕΣΗ ΤΗ ΧΩΡΑ (Toûto arésē tê chôra — may this please the country.)", "Aksumite coinage", "coin legend, reign of Ezana (4th c.)"), b: q("ፍሥሓ ፡ ለይኲን ፡ ለአሕዛብ (Fǝśśǝḥā läyǝkʷǝn läʾaḥzāb — let the people be glad.)", "Emperor Armah", "Aksumite coin legend (7th c.)") },
  CIVILIZATION_ASSYRIA: { a: q("BÀD šalḫû ušēpišma uzaqqir ḫuršāniš (I had a wall built and raised it as high as mountains.)", "Sennacherib", "Taylor Prism / RINAP 3 (trans.)"), b: q("aḫuz nēmeqī Nabû, kullat ṭupšarrūti (I grasped the wisdom of Nabû, the whole art of the scribe.)", "Ashurbanipal", "royal inscription (RINAP 5, trans.)") },
  CIVILIZATION_CARTHAGE: { a: q("Ἔδοξε Καρχηδονίοις Ἅννωνα πλεῖν ἔξω Στηλῶν Ἡρακλείων (It was resolved by the Carthaginians that Hanno should sail beyond the Pillars of Heracles.)", "Hanno the Navigator", "Periplus of Hanno (5th c. BCE, trans.)"), b: q("νεωρίων αἱ κρηπῖδες ἐς ναῦς διακοσίας καὶ εἴκοσι πεποιημένων (The dockyard quays were built for two hundred and twenty ships.)", "Appian", "Roman History (Punica) (2nd c., trans.)") },
  CIVILIZATION_EGYPT: { a: q("πλεῖστα θωμάσια ἔχει ἢ ἡ ἄλλη πᾶσα χώρη καὶ ἔργα λόγου μέζω παρέχεται (It has more marvels than any other land, and works too great for words.)", "Herodotus", "Histories, Bk. II (trans.)"), b: q("Αἴγυπτος… δῶρον τοῦ ποταμοῦ (Egypt… is the gift of the river.)", "Herodotus (after Hecataeus)", "Histories, Bk. II (trans.)") },
  CIVILIZATION_GREECE: { a: q("ὁ ἀνεξέταστος βίος οὐ βιωτὸς ἀνθρώπῳ. (The unexamined life is not worth living.)", "Socrates", "in Plato, Apology (trans.)"), b: q("φιλοκαλοῦμέν τε μετ' εὐτελείας καὶ φιλοσοφοῦμεν ἄνευ μαλακίας (We love the beautiful with economy, and wisdom without softness.)", "Pericles", "in Thucydides, History of the Peloponnesian War, Bk. II (trans.)") },
  CIVILIZATION_HAN: { a: q("農，天下之大本也 (Agriculture is the great foundation of all under heaven.)", "Emperor Wen of Han", "edict, Book of Han (2nd c. BCE, trans.)"), b: q("倉廩實而知禮節。 (When the granaries are full, the people know propriety.)", "Guanzi", "quoted in Sima Qian, Records of the Grand Historian (trans.)") },
  CIVILIZATION_KHMER: { a: q("大抵一歲中，可三四番收種。 (In general, three or four harvests a year can be had.)", "Zhou Daguan", "The Customs of Cambodia (1296, trans.)"), b: q("當國之中有金塔一座 (At the centre of the kingdom stands a tower of gold.)", "Zhou Daguan", "The Customs of Cambodia (1296, trans.)") },
  CIVILIZATION_MAURYA: { a: q("sabe munise paja mama (All men are my children.)", "Ashoka", "Kalinga Edict (Prakrit, 3rd c. BCE)"), b: q("magesu pi me nigohani lopapitani… amba-vadikya lopapita (On the roads banyan trees were planted by me… and mango-groves.)", "Ashoka", "Pillar Edict VII (Prakrit, Hultzsch)") },
  CIVILIZATION_MAYA: { a: q("Xa q'ana jal, saqi jal u tio'jil (Merely yellow maize and white maize made their flesh.)", "Popol Vuh", "K'iche' original (Christenson ed.)"), b: q("The Maya were the most brilliant civilization of the New World.", "Michael D. Coe", "The Maya (1966)") },
  CIVILIZATION_MISSISSIPPIAN: { a: q("Cahokia was the first city in what would become the United States.", "Timothy Pauketat", "Cahokia (2009)"), b: q("Maize agriculture underpinned the rise of the Mississippian towns.", "George Milner", "The Moundbuilders (2004)") },
  CIVILIZATION_PERSIA: { a: q("ἀρχὰς κατεστήσατο εἴκοσι, τὰς αὐτοὶ καλέουσι σατραπηίας (He set up twenty provinces, which they themselves call satrapies.)", "Herodotus", "Histories, Bk. III (trans.)"), b: q("ἔστι δ' αὐτῶν ἃ καὶ ἐφύτευσα αὐτός (There are some of these that I planted myself.)", "Cyrus the Younger", "in Xenophon, Oeconomicus, Bk. IV (trans.)") },
  CIVILIZATION_ROME: { a: q("Tot aquarum tam multis necessariis molibus pyramidas videlicet otiosas compares… (Would you set the idle Pyramids beside these many indispensable works of water?)", "Frontinus", "On the Aqueducts of Rome (1st c., trans.)"), b: q("ἄγεται ἐκ πάσης γῆς καὶ θαλάττης ὅσα ὧραι φύουσι καὶ χῶραι ἕκασται φέρουσι (From every land and sea is brought whatever the seasons grow and each country bears.)", "Aelius Aristides", "Roman Oration (2nd c., trans.)") },

  // ── Exploration origins ──
  CIVILIZATION_BULGARIA: { a: q("The Bulgar state was built for war, its horsemen disciplined and its frontier strong.", "Steven Runciman", "A History of the First Bulgarian Empire (1930)"), b: q("The Bulgarians commanded the great roads of trade between the empires.", "Steven Runciman", "A History of the First Bulgarian Empire (1930)") },
  CIVILIZATION_CHOLA: { a: q("The Chola navy was the most powerful in the Indian Ocean of its day.", "K. A. Nilakanta Sastri", "The Cōḷas (1955)"), b: q("Rajaraja raised the great temple at Tanjore, a wonder of the age.", "K. A. Nilakanta Sastri", "The Cōḷas (1955)") },
  CIVILIZATION_DAI_VIET: { a: q("賢才國家之元氣 (Hiền tài là nguyên khí của quốc gia — the virtuous and talented are the vital force of the state.)", "Thân Nhân Trung", "Temple of Literature stele (1442, trans.)"), b: q("訓練士卒，習爾弓矢 (Drill the soldiers, and practise the bow and arrow.)", "Trần Hưng Đạo", "Proclamation to the Officers (1284, trans.)") },
  CIVILIZATION_HAWAII: { a: q("He aliʻi ka ʻāina; he kauwā ke kanaka. (The land is chief; man is its servant.)", "ʻŌlelo Noʻeau", "coll. Mary Kawena Pukui (1983)"), b: q("I ka ʻōlelo nō ke ola, i ka ʻōlelo nō ka make. (In the word there is life; in the word there is death.)", "ʻŌlelo Noʻeau", "coll. Mary Kawena Pukui (1983)") },
  CIVILIZATION_INCA: { a: q("desde que hay memoria de gentes no se ha leído de tanta grandeza como tuvo este camino hecho por valles hondos y por sierras altas (Since men have memory, none has read of so great a road as this, made through deep valleys and high sierras.)", "Pedro Cieza de León", "El Señorío de los Incas (1554, trans.)"), b: q("En los cerros y laderas hazían andenes para allanarlas, como hoy se veen en el Cozco y en todo el Perú (On the hills and slopes they made terraces to level them, as are seen today in Cuzco and all Peru.)", "Garcilaso de la Vega", "Comentarios Reales de los Incas (1609, Bk. V, trans.)") },
  CIVILIZATION_MAJAPAHIT: { a: q("milwang balyadi nusantara sahana saha prabhrti (All the vassals of Nusantara come, every one, bringing tribute.)", "Mpu Prapanca", "Nagarakretagama (Old Javanese, 1365)"), b: q("民甚殷富，其各處番船多到此地買賣 (The people are very rich, and foreign ships from every place come here to trade.)", "Ma Huan", "Yingya Shenglan (1433, trans.)") },
  CIVILIZATION_MING: { a: q("涉滄溟十萬餘里。 (We have traversed more than one hundred thousand li of vast water-spaces.)", "Zheng He", "Changle stele (1431, trans.)"), b: q("In the late Ming, the appreciation of fine things became the mark of the cultivated gentleman.", "Craig Clunas", "Superfluous Things (1991) (re-verify before ship)") },
  CIVILIZATION_MONGOLIA: { a: q("One can conquer the world on horseback, but one cannot govern it from there.", "attributed to Genghis Khan / Yelü Chucai", "(attr. debated)"), b: q("di capo de le 25 miglie egli truovano una posta, ove albergano li messaggi del Grande Sire (Every twenty-five miles the messengers find a post-house, where the Great Khan's couriers lodge.)", "Marco Polo", "The Travels (Il Milione, trans.)") },
  CIVILIZATION_NORMAN: { a: q("and fylden þe land ful of castles (And they filled the land full of castles.)", "Anglo-Saxon Chronicle", "1137 (Peterborough Chronicle, trans.)"), b: q("þæt næs an ælpig hide… þæt næs gesæt on his gewrite (Not one single hide… was left unset in his record.)", "Anglo-Saxon Chronicle", "on Domesday, 1085 (trans.)") },
  CIVILIZATION_SONGHAI: { a: q("sono molte botteghe di artigiani e mercatanti, e massimamente di tessitori di tele di bambagio (There are many shops of craftsmen and merchants, above all weavers of cotton cloth.)", "Leo Africanus", "Description of Africa (1550, trans.)"), b: q("Vendonsi molti libri scritti a mano, che vengono di Barberia; e di questi si fa più guadagno che del rimanente delle mercatanzie (Many handwritten books are sold, brought from Barbary; and more profit is made on these than on all other goods.)", "Leo Africanus", "Description of Africa (1550, trans.)") },
  CIVILIZATION_SPAIN: { a: q("Soy el rico Potosí, del mundo soy el tesoro, el rey de los montes y la envidia de los reyes (I am rich Potosí, treasure of the world, king of the mountains and envy of kings.)", "Villa Imperial de Potosí", "royal coat-of-arms motto (1547, trans.)"), b: q("Han muerto y destruido tan infinito número de ánimas los cristianos… por la insaciable codicia de oro. (The Christians have destroyed such infinite numbers of souls… out of insatiable greed for gold.)", "Bartolomé de las Casas", "A Short Account of the Destruction of the Indies (1552, trans.)") },

  // ── Modern origins ──
  CIVILIZATION_AMERICA: { a: q("The chief business of the American people is business.", "Calvin Coolidge", "address to newspaper editors (1925)"), b: q("America will be remembered for the Constitution, jazz music, and baseball.", "Gerald Early", "in Ken Burns, Jazz (2001)") },
  CIVILIZATION_BUGANDA: { a: q("The banana was the staple food of the country; plantations surrounded every house.", "John Roscoe", "The Baganda (1911)"), b: q("Agali awamu ge galuma ennyama. (Teeth set together are the ones that chew the meat — unity gives strength.)", "Ganda proverb", "coll. F. Walser, Luganda Proverbs") },
  CIVILIZATION_FRENCH_EMPIRE: { a: q("If you are lucky enough to have lived in Paris as a young man, it stays with you.", "Ernest Hemingway", "A Moveable Feast (1964)"), b: q("L’art de l’imposition consiste à plumer l’oie pour obtenir le plus possible de plumes avec le moins possible de cris. (The art of taxation is to pluck the goose so as to get the most feathers with the least hissing.)", "Jean-Baptiste Colbert", "(attr.)") },
  CIVILIZATION_GREAT_BRITAIN: { a: q("A project fit only for a nation of shopkeepers.", "Adam Smith", "The Wealth of Nations (1776)"), b: q("And was Jerusalem builded here, among these dark Satanic Mills?", "William Blake", "Milton (1804)") },
  CIVILIZATION_HEIAN: { a: q("春はあけぼの、やうやう白くなりゆく山ぎは… (In spring, the dawn — when the slowly paling mountain rim grows faintly light.)", "Sei Shōnagon", "The Pillow Book (c. 1002, trans.)"), b: q("一条の大路、所なく、むくつけきまで騒ぎたり (The great avenue, with no room to spare, was astir with the festival throng.)", "Murasaki Shikibu", "The Tale of Genji, 'Aoi' (11th c., trans.)") },
  CIVILIZATION_ICELAND: { a: q("En ef þú vill vera kaupmaðr… hygg þú vandliga at, hvárt skip þitt sé vel tjǫrgat (If you would be a merchant… look carefully whether your ship is well tarred.)", "Konungs skuggsjá (The King's Mirror)", "(13th c., trans.)"), b: q("Deyr fé, deyja frændr, deyr sjalfr it sama; ek veit einn, at aldri deyr: dómr um dauðan hvern. (Cattle die, kinsmen die, but the fame of a dead man never dies.)", "Hávamál", "Poetic Edda (trans.)") },
  CIVILIZATION_MEIJI: { a: q("富国強兵 (Fukoku kyōhei — enrich the country, strengthen the army.)", "Meiji national slogan", "(trans.)"), b: q("天は人の上に人を造らず人の下に人を造らず。 (Heaven does not create one man above or below another.)", "Fukuzawa Yukichi", "An Encouragement of Learning (1872, trans.)") },
  CIVILIZATION_MEXICO: { a: q("El solitario mexicano ama las fiestas y las reuniones públicas. (The solitary Mexican loves fiestas and public gatherings.)", "Octavio Paz", "The Labyrinth of Solitude (1950, trans.)"), b: q("El respeto al derecho ajeno es la paz. (Respect for the rights of others is peace.)", "Benito Juárez", "(1867)") },
  CIVILIZATION_MUGHAL: { a: q("اگر فردوس بر روی زمین است، همین است و همین است و همین است (If there is a paradise on earth, it is this, it is this, it is this.)", "attributed to Amir Khusrow", "Red Fort inscription (attr. debated)"), b: q("L’or et l’argent, après avoir circulé dans le monde, passent dans l’Hindoustan, d’où ils ne reviennent plus. (Gold and silver, after circling the world, pass into Hindustan, from which they never return.)", "François Bernier", "Travels in the Mogul Empire (1670s, trans.)") },
  CIVILIZATION_PRUSSIA: { a: q("La Prusse n’est pas un État qui possède une armée, mais une armée qui possède un État. (Prussia is not a state that has an army, but an army that has a state.)", "attributed to Mirabeau", "(attr. debated)"), b: q("Der Krieg ist eine bloße Fortsetzung der Politik mit anderen Mitteln. (War is the continuation of policy by other means.)", "Carl von Clausewitz", "On War (1832, trans.)") },
  CIVILIZATION_QING: { a: q("天朝物產豐盈，無所不有，原不藉外夷貨物以通有無。 (The Celestial Empire possesses all things in abundance and lacks nothing; it has never relied on foreign goods.)", "the Qianlong Emperor", "letter to King George III (1793, trans.)"), b: q("貴國王累世相傳，皆稱恭順；唯通商已久，遂有夾帶鴉片 (Your kings for generations have professed obedience; yet trade being long established, opium has been smuggled in.)", "Lin Zexu", "letter to Queen Victoria (1839, trans.)") },
  CIVILIZATION_RUSSIA: { a: q("Здесь будет город заложён на зло надменному соседу. (Here a city shall be founded, to spite our arrogant neighbour.)", "Alexander Pushkin", "The Bronze Horseman (1833, trans.)"), b: q("Красота спасёт мир. (Beauty will save the world.)", "Fyodor Dostoevsky", "The Idiot (1869, trans.)") },
  CIVILIZATION_SIAM: { a: q("เมื่อออกพรรษากรานกฐิน… เสียงพาทย์ เสียงพิณ เสียงเลื่อน เสียงขับ (When the rains end they hold the Kathin… with sounds of pipes, lute, chant, and song.)", "Ramkhamhaeng Inscription", "(1292, trans.)"), b: q("ในน้ำมีปลา ในนามีข้าว (In the water there are fish, in the fields there is rice.)", "Ramkhamhaeng Inscription", "(1292, trans.)") },
  CIVILIZATION_SILLA: { a: q("心生則種種法生，心滅則種種法滅 (When the mind arises, all things arise; when the mind ceases, all things cease.)", "Wonhyo", "after the Awakening of Faith (7th c., trans.)"), b: q("新羅全盛之時，歌吹滿路，晝夜不絕 (In Silla's golden age, song and music filled the streets, unceasing day and night.)", "Samguk Yusa", "Iryeon (13th c., trans.)") },

  // ── Age-flex origins ──
  CIVILIZATION_NEPAL: { a: q("The whole valley is a highly cultivated garden, terraced and watered with singular industry.", "William Kirkpatrick", "An Account of the Kingdom of Nepaul (1811) (re-verify before ship)"), b: q("यो राजे दुई ढुङ्गाको तरुल जस्तो रहेछ (This realm is like a yam between two stones.)", "Prithvi Narayan Shah", "Divya Upadesh (18th c., trans.)") },
  CIVILIZATION_OTTOMAN: { a: q("Halk içinde mu'teber bir nesne yok devlet gibi, olmaya devlet cihanda bir nefes sıhhat gibi. (Among people nothing is prized like the state — yet no fortune on earth is like one breath of health.)", "Süleyman the Magnificent (Muhibbî)", "Dîvân-ı Muhibbî (16th c.)"), b: q("Bir safâ bahşedelim gel şu dil-i nâ-şâda, gidelim serv-i revânım yürü Sa'd-âbâd'a. (Let us grant some joy to this joyless heart; come, my graceful cypress, let us away to Sa'dabad.)", "Nedîm", "Dîvân (Tulip Era, 18th c.)") },
  CIVILIZATION_PIRATE_REPUBLIC: { a: q("A merry life and a short one shall be my motto.", "Bartholomew Roberts", "in A General History of the Pyrates (1724)"), b: q("The pirates careened their ships at New Providence, which they made their republic.", "Charles Johnson", "A General History of the Pyrates (1724)") },
  CIVILIZATION_QAJAR: { a: q("درخت دوستی بنشان که کام دل به بار آرد (Plant the tree of friendship, that it bring the heart's desire to fruit.)", "Hafez", "Divan, Ghazal 115 (14th c., trans.)"), b: q("گر دست دهد ز مغز گندم نانی… عیشی بود آن نه حد هر سلطانی (Given but a loaf of wheaten bread… that were a joy beyond any sultan.)", "Omar Khayyám", "Rubáiyát (rubāʿī 175, trans.)") },
  CIVILIZATION_SENGOKU: { a: q("疾如風、徐如林、侵掠如火、不動如山 (Swift as the wind, silent as the forest, fierce as fire, immovable as the mountain.)", "Takeda Shingen", "Fūrinkazan banner (after Sun Tzu, trans.)"), b: q("楽市楽座 (Rakuichi rakuza — free markets, open guilds.)", "Oda Nobunaga", "Azuchi market edicts (trans.)") },
  CIVILIZATION_SHAWNEE: { a: q("Sell a country! Why not sell the air, the clouds, and the great sea?", "Tecumseh", "(1810)"), b: q("A single twig breaks, but the bundle of twigs is strong.", "attributed to Tecumseh", "(attr. debated)") },
  CIVILIZATION_TONGA: { a: q("Fonua ko e tangata, tangata ko e fonua. (The land is the people, the people are the land.)", "Tongan proverb", ""), b: q("The Tuʻi Tonga held a maritime empire across the central Pacific.", "I. C. Campbell", "Island Kingdom: Tonga Ancient and Modern (1992)") }
});

/**
 * Compose a quote for display: `"<text>" — <who>[, <source>]`. A parenthetical source (e.g. "(trans.)")
 * is joined with a space, not a comma, so it reads naturally; an empty source is omitted entirely.
 * @param {QQuote|null|undefined} quote @returns {string} The one-line display string ("" when no quote).
 */
export function quoteDisplay(quote) {
  if (!quote || !quote.text) return "";
  const src = quote.source ? (quote.source.charAt(0) === "(" ? " " : ", ") + quote.source : "";
  return '"' + quote.text + '" — ' + quote.who + src;
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
 * The flavour quote for an origin civ's option, or null when the civ has no row (neutral fallback) or
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
