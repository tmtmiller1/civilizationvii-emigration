# Cultural Enclaves — Prose Working Document

> **Generated from the live registry** (`ui/emigration-quarter-bonuses.js` +
> `ui/emigration-quarter-registry.js`) and the current `text/en_us/ModText.xml`. Edit the English
> here, then it is compiled back into the registry and the LOC keys (already wired across all 12
> locales — the 11 non-English locales currently hold translated *"Quarter"* terms and need a
> translator pass to "Enclave"). Keep `{1_Name}`-style placeholders intact and in order.

**Legend:** each active option shows its **label** (button), a **note** = *why* + `(+Benefit, −Penalty)`,
and a short attributed **quote**. Yields: C=Culture, G=Gold, P=Production, S=Science, F=Faith, Fd=Food, H=Happiness. ⚔ = military-themed.

## 1. Decision modal & chronicle templates (live from en_us)

| LOC key | English text |
| --- | --- |
| `LOC_EMIG_QTR_EYEBROW` | Cultural Enclave |
| `LOC_EMIG_QTR_TITLE` | The {1_Name} |
| `LOC_EMIG_QTR_BODY` | The {1_Adj} families of {2_Place} have become more than new arrivals. {3_Where}, their shops, shrines, workshops, festivals, and habits now draw a life of their own — a district with a memory from elsewhere. Recognize the enclave, and decide what tradition the city will make room for. |
| `LOC_EMIG_QTR_CHRON_DECISION_TITLE` | A {1_Name} |
| `LOC_EMIG_QTR_STANCE_LETBE` | You let the {1_Name} keep to itself. |
| `LOC_EMIG_QTR_CHRON_HANDS_TITLE` | The Enclave Changes Hands |
| `LOC_EMIG_QTR_CHRON_HANDS_BODY` | The old {1_Name} has faded as its families moved on, married in, or were overtaken by new arrivals. {2_Where}, {3_Adj} households now give the ward its name, its customs, and its bargains. |
| `LOC_EMIG_QTR_CHRON_RESTLESS_TITLE` | War Tests the {1_Name} |
| `LOC_EMIG_QTR_CHRON_RESTLESS_BODY` | War with {1_Adj} falls hard on the {2_Name}: its families are cut off from kin in the fighting, and some neighbours meet them with cold looks, forgetting they did not choose this war. Until peace returns, that strain keeps the enclave from settling fully into the city's life. |

## 2. Default option labels (by benefit yield)

| Benefit yield | Default label |
| --- | --- |
| Culture | Embrace their culture |
| Gold | Tax their trade |
| Production | Employ their crafts |
| Science | Fund their learning |
| Faith | Honour their faith |
| Food | Take up their farming |
| Happiness | Join their festivals |
| *(passive)* | Let them be |

## 3. Per-civilization options + quotes (44 civs)

### Antiquity origins

**Abbasid Enclave**  `CIVILIZATION_ABBASID`

- **A · Fund their learning** · +Science / −Gold
  - *why:* House-of-Wisdom scholars translate, but their stipends drain the treasury
  - *quote:* "طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ. (Seeking knowledge is an obligation upon every Muslim.)" — the Prophet Muhammad, Sunan Ibn Mājah 224
- **B · Join their festivals** · +Happiness / −Production
  - *why:* famed gardens and salons soothe the city, but few hands work the yards
  - *quote:* "Baghdad became the intellectual capital of the medieval world." — Philip K. Hitti, History of the Arabs (1937)

**Aksumite Enclave**  `CIVILIZATION_AKSUM`

- **A · Tax their trade** · +Gold / −Culture
  - *why:* Red-Sea traders enrich the docks, but coin flows to the quays, not the old rites
  - *quote:* "ΤΟΥΤΟ ΑΡΕΣΗ ΤΗ ΧΩΡΑ (Toûto arésē tê chôra — may this please the country.)" — Aksumite coinage, coin legend, reign of Ezana (4th c.)
- **B · Honour their faith** · +Faith / −Happiness
  - *why:* their stelae-churches draw pilgrims, and the crowds throng the ward
  - *quote:* "ፍሥሓ ፡ ለይኲን ፡ ለአሕዛብ (Fǝśśǝḥā läyǝkʷǝn läʾaḥzāb — let the people be glad.)" — Emperor Armah, Aksumite coin legend (7th c.)

**Assyrian Enclave**  `CIVILIZATION_ASSYRIA`

- **A · ⚔ Arm your siege-works** · +Production / −Happiness
  - *why:* their siege-engineers arm your foundries — rams and towers roll out — though their martial bearing sours the ward
  - *quote:* "BÀD šalḫû ušēpišma uzaqqir ḫuršāniš (I had a wall built and raised it as high as mountains.)" — Sennacherib, Taylor Prism / RINAP 3 (trans.)
- **B · Fund their learning** · +Science / −Gold
  - *why:* captured codices fill the archives, but curating spoils costs coin
  - *quote:* "aḫuz nēmeqī Nabû, kullat ṭupšarrūti (I grasped the wisdom of Nabû, the whole art of the scribe.)" — Ashurbanipal, royal inscription (RINAP 5, trans.)

**Punic Enclave**  `CIVILIZATION_CARTHAGE`

- **A · Tax their trade** · +Gold / −Food
  - *why:* Punic merchants fill the wharves, drawing hands off the fields
  - *quote:* "Ἔδοξε Καρχηδονίοις Ἅννωνα πλεῖν ἔξω Στηλῶν Ἡρακλείων (It was resolved by the Carthaginians that Hanno should sail beyond the Pillars of Heracles.)" — Hanno the Navigator, Periplus of Hanno (5th c. BCE, trans.)
- **B · Employ their crafts** · +Production / −Culture
  - *why:* shipwrights raise busy yards, and the city prizes tonnage over temples
  - *quote:* "νεωρίων αἱ κρηπῖδες ἐς ναῦς διακοσίας καὶ εἴκοσι πεποιημένων (The dockyard quays were built for two hundred and twenty ships.)" — Appian, Roman History (Punica) (2nd c., trans.)

**Egyptian Enclave**  `CIVILIZATION_EGYPT`

- **A · Embrace their culture** · +Culture / −Gold
  - *why:* monument-masons adorn the district, but upkeep of their works is dear
  - *quote:* "πλεῖστα θωμάσια ἔχει ἢ ἡ ἄλλη πᾶσα χώρη καὶ ἔργα λόγου μέζω παρέχεται (It has more marvels than any other land, and works too great for words.)" — Herodotus, Histories, Bk. II (trans.)
- **B · Take up their farming** · +Food / −Production
  - *why:* Nile-style flood-farming feeds the ward, but pulls labour off the works
  - *quote:* "Αἴγυπτος… δῶρον τοῦ ποταμοῦ (Egypt… is the gift of the river.)" — Herodotus (after Hecataeus), Histories, Bk. II (trans.)

**Greek Enclave**  `CIVILIZATION_GREECE`

- **A · Fund their learning** · +Science / −Happiness
  - *why:* an agora of philosophers, and their factional politics
  - *quote:* "ὁ ἀνεξέταστος βίος οὐ βιωτὸς ἀνθρώπῳ. (The unexamined life is not worth living.)" — Socrates, in Plato, Apology (trans.)
- **B · Embrace their culture** · +Culture / −Production
  - *why:* theatres and porticoes flourish while the workshops idle
  - *quote:* "φιλοκαλοῦμέν τε μετ' εὐτελείας καὶ φιλοσοφοῦμεν ἄνευ μαλακίας (We love the beautiful with economy, and wisdom without softness.)" — Pericles, in Thucydides, History of the Peloponnesian War, Bk. II (trans.)

**Han Enclave**  `CIVILIZATION_HAN`

- **A · Take up their farming** · +Food / −Happiness
  - *why:* intensive farming feeds many, at the cost of crowding
  - *quote:* "農，天下之大本也 (Agriculture is the great foundation of all under heaven.)" — Emperor Wen of Han, edict, Book of Han (2nd c. BCE, trans.)
- **B · Employ their crafts** · +Production / −Gold
  - *why:* public-works crews build fast, but the corvée is subsidised
  - *quote:* "倉廩實而知禮節。 (When the granaries are full, the people know propriety.)" — Guanzi, quoted in Sima Qian, Records of the Grand Historian (trans.)

**Khmer Enclave**  `CIVILIZATION_KHMER`

- **A · Take up their farming** · +Food / −Gold
  - *why:* baray-style irrigation greens the fringe, but the waterworks cost coin
  - *quote:* "大抵一歲中，可三四番收種。 (In general, three or four harvests a year can be had.)" — Zhou Daguan, The Customs of Cambodia (1296, trans.)
- **B · Honour their faith** · +Faith / −Happiness
  - *why:* their temple-processions draw great crowds that throng the streets
  - *quote:* "當國之中有金塔一座 (At the centre of the kingdom stands a tower of gold.)" — Zhou Daguan, The Customs of Cambodia (1296, trans.)

**Mauryan Enclave**  `CIVILIZATION_MAURYA`

- **A · Honour their faith** · +Faith / −Gold
  - *why:* ascetic orders bless the ward, sustained by alms
  - *quote:* "sabe munise paja mama (All men are my children.)" — Ashoka, Kalinga Edict (Prakrit, 3rd c. BCE)
- **B · Take up their farming** · +Food / −Production
  - *why:* stepwell gardens yield well, but tie up hands
  - *quote:* "magesu pi me nigohani lopapitani… amba-vadikya lopapita (On the roads banyan trees were planted by me… and mango-groves.)" — Ashoka, Pillar Edict VII (Prakrit, Hultzsch)

**Maya Enclave**  `CIVILIZATION_MAYA`

- **A · Fund their learning** · +Science / −Production
  - *why:* sky-watchers keep observatories, not workshops
  - *quote:* "Xa q'ana jal, saqi jal u tio'jil (Merely yellow maize and white maize made their flesh.)" — Popol Vuh, K'iche' original (Christenson ed.)
- **B · Take up their farming** · +Food / −Happiness
  - *why:* dense milpa plots feed many, but crowd the fringe
  - *quote:* "The Maya were the most brilliant civilization of the New World." — Michael D. Coe, The Maya (1966)

**Mississippian Enclave**  `CIVILIZATION_MISSISSIPPIAN`

- **A · Embrace their culture** · +Culture / −Gold
  - *why:* mound-rites enrich the ward's life, funded by tribute
  - *quote:* "Cahokia was the first city in what would become the United States." — Timothy Pauketat, Cahokia (2009)
- **B · Take up their farming** · +Food / −Production
  - *why:* woodland gathering feeds the district, off the yards
  - *quote:* "Maize agriculture underpinned the rise of the Mississippian towns." — George Milner, The Moundbuilders (2004)

**Persian Enclave**  `CIVILIZATION_PERSIA`

- **A · Tax their trade** · +Gold / −Happiness
  - *why:* satrapal tribute flows in, and resentment with it
  - *quote:* "ἀρχὰς κατεστήσατο εἴκοσι, τὰς αὐτοὶ καλέουσι σατραπηίας (He set up twenty provinces, which they themselves call satrapies.)" — Herodotus, Histories, Bk. III (trans.)
- **B · Embrace their culture** · +Culture / −Food
  - *why:* walled pleasure-gardens delight, but eat good farmland
  - *quote:* "ἔστι δ' αὐτῶν ἃ καὶ ἐφύτευσα αὐτός (There are some of these that I planted myself.)" — Cyrus the Younger, in Xenophon, Oeconomicus, Bk. IV (trans.)

**Roman Enclave**  `CIVILIZATION_ROME`

- **A · ⚔ Drill your legions** · +Production / −Happiness
  - *why:* Roman engineers and veterans raise your works and drill your legions — but the eagle's shadow chafes
  - *quote:* "Tot aquarum tam multis necessariis molibus pyramidas videlicet otiosas compares… (Would you set the idle Pyramids beside these many indispensable works of water?)" — Frontinus, On the Aqueducts of Rome (1st c., trans.)
- **B · Tax their trade** · +Gold / −Culture
  - *why:* their roads pull trade to the city, and coin sets the fashion
  - *quote:* "ἄγεται ἐκ πάσης γῆς καὶ θαλάττης ὅσα ὧραι φύουσι καὶ χῶραι ἕκασται φέρουσι (From every land and sea is brought whatever the seasons grow and each country bears.)" — Aelius Aristides, Roman Oration (2nd c., trans.)

### Exploration origins

**Bulgar Enclave**  `CIVILIZATION_BULGARIA`

- **A · ⚔ Harden their riders** · +Production / −Happiness
  - *why:* their horse-and-forge veterans harden your cavalry — and brawl as hard as they fight
  - *quote:* "The Bulgar state was built for war, its horsemen disciplined and its frontier strong." — Steven Runciman, A History of the First Bulgarian Empire (1930)
- **B · Tax their trade** · +Gold / −Culture
  - *why:* frontier markets thrive, and the city keeps fuller ledgers than calendars
  - *quote:* "The Bulgarians commanded the great roads of trade between the empires." — Steven Runciman, A History of the First Bulgarian Empire (1930)

**Chola Enclave**  `CIVILIZATION_CHOLA`

- **A · Tax their trade** · +Gold / −Food
  - *why:* Tamil maritime traders fill the harbours, drawing hands off the soil
  - *quote:* "The Chola navy was the most powerful in the Indian Ocean of its day." — K. A. Nilakanta Sastri, The Cōḷas (1955)
- **B · Honour their faith** · +Faith / −Happiness
  - *why:* great temple-tanks draw pilgrims, and the festival crowds throng the ward
  - *quote:* "Rajaraja raised the great temple at Tanjore, a wonder of the age." — K. A. Nilakanta Sastri, The Cōḷas (1955)

**Dai Viet Enclave**  `CIVILIZATION_DAI_VIET`

- **A · Embrace their culture** · +Culture / −Gold
  - *why:* wall-scholars keep learning alive, at public cost
  - *quote:* "賢才國家之元氣 (Hiền tài là nguyên khí của quốc gia — the virtuous and talented are the vital force of the state.)" — Thân Nhân Trung, Temple of Literature stele (1442, trans.)
- **B · Employ their crafts** · +Production / −Food
  - *why:* fort-works employ many hands off the fields
  - *quote:* "訓練士卒，習爾弓矢 (Drill the soldiers, and practise the bow and arrow.)" — Trần Hưng Đạo, Proclamation to the Officers (1284, trans.)

**Hawaiian Enclave**  `CIVILIZATION_HAWAII`

- **A · Take up their farming** · +Food / −Production
  - *why:* fish-ponds and reefs feed the ward, drawing hands off the yards
  - *quote:* "He aliʻi ka ʻāina; he kauwā ke kanaka. (The land is chief; man is its servant.)" — ʻŌlelo Noʻeau, coll. Mary Kawena Pukui (1983)
- **B · Embrace their culture** · +Culture / −Gold
  - *why:* heiau rites enrich island custom, funded by the city
  - *quote:* "I ka ʻōlelo nō ke ola, i ka ʻōlelo nō ka make. (In the word there is life; in the word there is death.)" — ʻŌlelo Noʻeau, coll. Mary Kawena Pukui (1983)

**Inca Enclave**  `CIVILIZATION_INCA`

- **A · Employ their crafts** · +Production / −Gold
  - *why:* terrace-masons and road-crews build superbly, at expense
  - *quote:* "desde que hay memoria de gentes no se ha leído de tanta grandeza como tuvo este camino hecho por valles hondos y por sierras altas (Since men have memory, none has read of so great a road as this, made through deep valleys and high sierras.)" — Pedro Cieza de León, El Señorío de los Incas (1554, trans.)
- **B · Take up their farming** · +Food / −Happiness
  - *why:* mountain terraces feed many in a crowded ward
  - *quote:* "En los cerros y laderas hazían andenes para allanarlas, como hoy se veen en el Cozco y en todo el Perú (On the hills and slopes they made terraces to level them, as are seen today in Cuzco and all Peru.)" — Garcilaso de la Vega, Comentarios Reales de los Incas (1609, Bk. V, trans.)

**Majapahit Enclave**  `CIVILIZATION_MAJAPAHIT`

- **A · Tax their trade** · +Gold / −Culture
  - *why:* spice-route factors enrich the docks, and the wharves talk profit over pageantry
  - *quote:* "milwang balyadi nusantara sahana saha prabhrti (All the vassals of Nusantara come, every one, bringing tribute.)" — Mpu Prapanca, Nagarakretagama (Old Javanese, 1365)
- **B · Take up their farming** · +Food / −Production
  - *why:* coastal fisheries feed the fringe off the yards
  - *quote:* "民甚殷富，其各處番船多到此地買賣 (The people are very rich, and foreign ships from every place come here to trade.)" — Ma Huan, Yingya Shenglan (1433, trans.)

**Ming Enclave**  `CIVILIZATION_MING`

- **A · Tax their trade** · +Gold / −Production
  - *why:* porcelain and silk factors fill the ledgers while the kilns run cool
  - *quote:* "涉滄溟十萬餘里。 (We have traversed more than one hundred thousand li of vast water-spaces.)" — Zheng He, Changle stele (1431, trans.)
- **B · Embrace their culture** · +Culture / −Happiness
  - *why:* imperial arts refine the ward, and its finery outshines humbler streets
  - *quote:* "In the late Ming, the appreciation of fine things became the mark of the cultivated gentleman." — Craig Clunas, Superfluous Things (1991) (re-verify before ship)

**Mongol Enclave**  `CIVILIZATION_MONGOLIA`

- **A · ⚔ Muster their horsemen** · +Production / −Happiness
  - *why:* their horse-lines and smiths keep your cavalry shod, remounted and armed — but the swagger grates
  - *quote:* "One can conquer the world on horseback, but one cannot govern it from there." — attributed to Genghis Khan / Yelü Chucai (attr. debated)
- **B · Tax their trade** · +Gold / −Culture
  - *why:* steppe tribute-routes pay well, and the city counts coin where it once kept ceremony
  - *quote:* "di capo de le 25 miglie egli truovano una posta, ove albergano li messaggi del Grande Sire (Every twenty-five miles the messengers find a post-house, where the Great Khan's couriers lodge.)" — Marco Polo, The Travels (Il Milione, trans.)

**Norman Enclave**  `CIVILIZATION_NORMAN`

- **A · ⚔ Raise their knights** · +Production / −Happiness
  - *why:* their castle-masons and knights raise strong works and temper your men-at-arms
  - *quote:* "and fylden þe land ful of castles (And they filled the land full of castles.)" — Anglo-Saxon Chronicle, 1137 (Peterborough Chronicle, trans.)
- **B · Tax their trade** · +Gold / −Food
  - *why:* feudal rents fill the coffers, off the farms
  - *quote:* "þæt næs an ælpig hide… þæt næs gesæt on his gewrite (Not one single hide… was left unset in his record.)" — Anglo-Saxon Chronicle, on Domesday, 1085 (trans.)

**Songhai Enclave**  `CIVILIZATION_SONGHAI`

- **A · Tax their trade** · +Gold / −Food
  - *why:* river-and-salt caravans fill the market, drawing hands off the soil
  - *quote:* "sono molte botteghe di artigiani e mercatanti, e massimamente di tessitori di tele di bambagio (There are many shops of craftsmen and merchants, above all weavers of cotton cloth.)" — Leo Africanus, Description of Africa (1550, trans.)
- **B · Fund their learning** · +Science / −Happiness
  - *why:* their scholars keep famed libraries, and famed feuds
  - *quote:* "Vendonsi molti libri scritti a mano, che vengono di Barberia; e di questi si fa più guadagno che del rimanente delle mercatanzie (Many handwritten books are sold, brought from Barbary; and more profit is made on these than on all other goods.)" — Leo Africanus, Description of Africa (1550, trans.)

**Spanish Enclave**  `CIVILIZATION_SPAIN`

- **A · Tax their trade** · +Gold / −Happiness
  - *why:* treasure-fleet factors enrich the port amid conversion strife
  - *quote:* "Soy el rico Potosí, del mundo soy el tesoro, el rey de los montes y la envidia de los reyes (I am rich Potosí, treasure of the world, king of the mountains and envy of kings.)" — Villa Imperial de Potosí, royal coat-of-arms motto (1547, trans.)
- **B · Honour their faith** · +Faith / −Culture
  - *why:* their missions win souls and overwrite old custom
  - *quote:* "Han muerto y destruido tan infinito número de ánimas los cristianos… por la insaciable codicia de oro. (The Christians have destroyed such infinite numbers of souls… out of insatiable greed for gold.)" — Bartolomé de las Casas, A Short Account of the Destruction of the Indies (1552, trans.)

### Modern origins

**American Enclave**  `CIVILIZATION_AMERICA`

- **A · Employ their crafts** · +Production / −Happiness
  - *why:* factory-hands drive output, but the shifts breed unrest
  - *quote:* "The chief business of the American people is business." — Calvin Coolidge, address to newspaper editors (1925)
- **B · Embrace their culture** · +Culture / −Gold
  - *why:* their cinema and jazz enliven the ward, at a subsidy
  - *quote:* "America will be remembered for the Constitution, jazz music, and baseball." — Gerald Early, in Ken Burns, Jazz (2001)

**Bugandan Enclave**  `CIVILIZATION_BUGANDA`

- **A · Take up their farming** · +Food / −Gold
  - *why:* lakeshore gardens feed the ward, tended at cost
  - *quote:* "The banana was the staple food of the country; plantations surrounded every house." — John Roscoe, The Baganda (1911)
- **B · Embrace their culture** · +Culture / −Production
  - *why:* bark-cloth artisans enrich custom, off the yards
  - *quote:* "Agali awamu ge galuma ennyama. (Teeth set together are the ones that chew the meat — unity gives strength.)" — Ganda proverb, coll. F. Walser, Luganda Proverbs

**French Enclave**  `CIVILIZATION_FRENCH_EMPIRE`

- **A · Embrace their culture** · +Culture / −Production
  - *why:* salons and Great Works flourish while workshops idle
  - *quote:* "If you are lucky enough to have lived in Paris as a young man, it stays with you." — Ernest Hemingway, A Moveable Feast (1964)
- **B · Tax their trade** · +Gold / −Happiness
  - *why:* luxury trade enriches the ward, and its airs vex the poor
  - *quote:* "L’art de l’imposition consiste à plumer l’oie pour obtenir le plus possible de plumes avec le moins possible de cris. (The art of taxation is to pluck the goose so as to get the most feathers with the least hissing.)" — Jean-Baptiste Colbert (attr.)

**British Enclave**  `CIVILIZATION_GREAT_BRITAIN`

- **A · Tax their trade** · +Gold / −Happiness
  - *why:* counting-houses and clerks profit; the mills breed grievance
  - *quote:* "A project fit only for a nation of shopkeepers." — Adam Smith, The Wealth of Nations (1776)
- **B · Employ their crafts** · +Production / −Food
  - *why:* industrial works run hot, drawing hands off the farms
  - *quote:* "And was Jerusalem builded here, among these dark Satanic Mills?" — William Blake, Milton (1804)

**Heian Enclave**  `CIVILIZATION_HEIAN`

- **A · Embrace their culture** · +Culture / −Production
  - *why:* courtly refinement flowers while the workshops idle
  - *quote:* "春はあけぼの、やうやう白くなりゆく山ぎは… (In spring, the dawn — when the slowly paling mountain rim grows faintly light.)" — Sei Shōnagon, The Pillow Book (c. 1002, trans.)
- **B · Join their festivals** · +Happiness / −Gold
  - *why:* their festivals lift the whole city, at the treasury's cost
  - *quote:* "一条の大路、所なく、むくつけきまで騒ぎたり (The great avenue, with no room to spare, was astir with the festival throng.)" — Murasaki Shikibu, The Tale of Genji, 'Aoi' (11th c., trans.)

**Icelandic Enclave**  `CIVILIZATION_ICELAND`

- **A · ⚔ Launch their longships** · +Production / −Food
  - *why:* their shipwrights and crews build fast longships, drawing hands off the farms
  - *quote:* "En ef þú vill vera kaupmaðr… hygg þú vandliga at, hvárt skip þitt sé vel tjǫrgat (If you would be a merchant… look carefully whether your ship is well tarred.)" — Konungs skuggsjá (The King's Mirror) (13th c., trans.)
- **B · Embrace their culture** · +Culture / −Gold
  - *why:* saga-singers keep the ward's memory, funded by the city
  - *quote:* "Deyr fé, deyja frændr, deyr sjalfr it sama; ek veit einn, at aldri deyr: dómr um dauðan hvern. (Cattle die, kinsmen die, but the fame of a dead man never dies.)" — Hávamál, Poetic Edda (trans.)

**Meiji Enclave**  `CIVILIZATION_MEIJI`

- **A · ⚔ Modernise your army** · +Production / −Happiness
  - *why:* their arsenals and conscript drill build a modern army at a hard human pace
  - *quote:* "富国強兵 (Fukoku kyōhei — enrich the country, strengthen the army.)" — Meiji national slogan (trans.)
- **B · Fund their learning** · +Science / −Culture
  - *why:* headlong modernisation, and old custom set aside
  - *quote:* "天は人の上に人を造らず人の下に人を造らず。 (Heaven does not create one man above or below another.)" — Fukuzawa Yukichi, An Encouragement of Learning (1872, trans.)

**Mexican Enclave**  `CIVILIZATION_MEXICO`

- **A · Embrace their culture** · +Culture / −Gold
  - *why:* murals and fiestas colour the ward, funded by the city
  - *quote:* "El solitario mexicano ama las fiestas y las reuniones públicas. (The solitary Mexican loves fiestas and public gatherings.)" — Octavio Paz, The Labyrinth of Solitude (1950, trans.)
- **B · Join their festivals** · +Happiness / −Production
  - *why:* tight-knit community lifts spirits over output
  - *quote:* "El respeto al derecho ajeno es la paz. (Respect for the rights of others is peace.)" — Benito Juárez (1867)

**Mughal Enclave**  `CIVILIZATION_MUGHAL`

- **A · Embrace their culture** · +Culture / −Gold
  - *why:* miniaturists and architects adorn the ward, at expense
  - *quote:* "اگر فردوس بر روی زمین است، همین است و همین است و همین است (If there is a paradise on earth, it is this, it is this, it is this.)" — attributed to Amir Khusrow, Red Fort inscription (attr. debated)
- **B · Tax their trade** · +Gold / −Food
  - *why:* fine-textile trade fills the docks, drawing hands off the fields
  - *quote:* "L’or et l’argent, après avoir circulé dans le monde, passent dans l’Hindoustan, d’où ils ne reviennent plus. (Gold and silver, after circling the world, pass into Hindustan, from which they never return.)" — François Bernier, Travels in the Mogul Empire (1670s, trans.)

**Prussian Enclave**  `CIVILIZATION_PRUSSIA`

- **A · ⚔ Drill your regiments** · +Production / −Happiness
  - *why:* their drill-masters and arsenals forge a disciplined army, stiffly
  - *quote:* "La Prusse n’est pas un État qui possède une armée, mais une armée qui possède un État. (Prussia is not a state that has an army, but an army that has a state.)" — attributed to Mirabeau (attr. debated)
- **B · Fund their learning** · +Science / −Culture
  - *why:* their war-academies teach hard, and set old ways aside
  - *quote:* "Der Krieg ist eine bloße Fortsetzung der Politik mit anderen Mitteln. (War is the continuation of policy by other means.)" — Carl von Clausewitz, On War (1832, trans.)

**Qing Enclave**  `CIVILIZATION_QING`

- **A · Take up their farming** · +Food / −Happiness
  - *why:* dense growth feeds many in a crowded ward
  - *quote:* "天朝物產豐盈，無所不有，原不藉外夷貨物以通有無。 (The Celestial Empire possesses all things in abundance and lacks nothing; it has never relied on foreign goods.)" — the Qianlong Emperor, letter to King George III (1793, trans.)
- **B · Tax their trade** · +Gold / −Production
  - *why:* treaty-port factors fill the ledgers, and the workshops slow
  - *quote:* "貴國王累世相傳，皆稱恭順；唯通商已久，遂有夾帶鴉片 (Your kings for generations have professed obedience; yet trade being long established, opium has been smuggled in.)" — Lin Zexu, letter to Queen Victoria (1839, trans.)

**Russian Enclave**  `CIVILIZATION_RUSSIA`

- **A · Employ their crafts** · +Production / −Food
  - *why:* heavy-industry crews work hard in a hungry ward
  - *quote:* "Здесь будет город заложён на зло надменному соседу. (Here a city shall be founded, to spite our arrogant neighbour.)" — Alexander Pushkin, The Bronze Horseman (1833, trans.)
- **B · Embrace their culture** · +Culture / −Gold
  - *why:* their letters and theatre enrich the city, at a subsidy
  - *quote:* "Красота спасёт мир. (Beauty will save the world.)" — Fyodor Dostoevsky, The Idiot (1869, trans.)

**Siamese Enclave**  `CIVILIZATION_SIAM`

- **A · Embrace their culture** · +Culture / −Gold
  - *why:* temple-arts and dance enrich the ward, funded by the city
  - *quote:* "เมื่อออกพรรษากรานกฐิน… เสียงพาทย์ เสียงพิณ เสียงเลื่อน เสียงขับ (When the rains end they hold the Kathin… with sounds of pipes, lute, chant, and song.)" — Ramkhamhaeng Inscription (1292, trans.)
- **B · Tax their trade** · +Gold / −Happiness
  - *why:* their bustling trade pays well and crowds the streets
  - *quote:* "ในน้ำมีปลา ในนามีข้าว (In the water there are fish, in the fields there is rice.)" — Ramkhamhaeng Inscription (1292, trans.)

**Silla Enclave**  `CIVILIZATION_SILLA`

- **A · Join their festivals** · +Happiness / −Gold
  - *why:* pagoda-rites lift the ward, sustained by alms
  - *quote:* "心生則種種法生，心滅則種種法滅 (When the mind arises, all things arise; when the mind ceases, all things cease.)" — Wonhyo, after the Awakening of Faith (7th c., trans.)
- **B · Embrace their culture** · +Culture / −Production
  - *why:* their crafts refine custom while the workshops idle
  - *quote:* "新羅全盛之時，歌吹滿路，晝夜不絕 (In Silla's golden age, song and music filled the streets, unceasing day and night.)" — Samguk Yusa, Iryeon (13th c., trans.)

### Age-flex origins

**Nepali Enclave**  `CIVILIZATION_NEPAL`

- **A · Take up their farming** · +Food / −Gold
  - *why:* mountain terraces feed the ward, tended at cost
  - *quote:* "The whole valley is a highly cultivated garden, terraced and watered with singular industry." — William Kirkpatrick, An Account of the Kingdom of Nepaul (1811) (re-verify before ship)
- **B · ⚔ Train their hillmen** · +Production / −Happiness
  - *why:* their hill-fort masons and drillmasters raise strong works and hardy soldiers
  - *quote:* "यो राजे दुई ढुङ्गाको तरुल जस्तो रहेछ (This realm is like a yam between two stones.)" — Prithvi Narayan Shah, Divya Upadesh (18th c., trans.)

**Ottoman Enclave**  `CIVILIZATION_OTTOMAN`

- **A · Fund their learning** · +Science / −Gold
  - *why:* külliye specialists teach and heal, at public cost
  - *quote:* "Halk içinde mu'teber bir nesne yok devlet gibi, olmaya devlet cihanda bir nefes sıhhat gibi. (Among people nothing is prized like the state — yet no fortune on earth is like one breath of health.)" — Süleyman the Magnificent (Muhibbî), Dîvân-ı Muhibbî (16th c.)
- **B · Embrace their culture** · +Culture / −Production
  - *why:* grand celebrations enrich custom while the workshops idle
  - *quote:* "Bir safâ bahşedelim gel şu dil-i nâ-şâda, gidelim serv-i revânım yürü Sa'd-âbâd'a. (Let us grant some joy to this joyless heart; come, my graceful cypress, let us away to Sa'dabad.)" — Nedîm, Dîvân (Tulip Era, 18th c.)

**Buccaneer Enclave**  `CIVILIZATION_PIRATE_REPUBLIC`

- **A · ⚔ Hire their privateers** · +Gold / −Happiness
  - *why:* their privateers and prize-crews fill your coffers and man your decks, lawlessly
  - *quote:* "A merry life and a short one shall be my motto." — Bartholomew Roberts, in A General History of the Pyrates (1724)
- **B · Employ their crafts** · +Production / −Culture
  - *why:* busy careening-yards work fast, and the port prizes speed over ceremony
  - *quote:* "The pirates careened their ships at New Providence, which they made their republic." — Charles Johnson, A General History of the Pyrates (1724)

**Qajar Enclave**  `CIVILIZATION_QAJAR`

- **A · Take up their farming** · +Food / −Gold
  - *why:* walled garden-farms feed the ward, tended at cost
  - *quote:* "درخت دوستی بنشان که کام دل به بار آرد (Plant the tree of friendship, that it bring the heart's desire to fruit.)" — Hafez, Divan, Ghazal 115 (14th c., trans.)
- **B · Embrace their culture** · +Culture / −Production
  - *why:* Bāgh celebrations enrich custom while the workshops idle
  - *quote:* "گر دست دهد ز مغز گندم نانی… عیشی بود آن نه حد هر سلطانی (Given but a loaf of wheaten bread… that were a joy beyond any sultan.)" — Omar Khayyám, Rubáiyát (rubāʿī 175, trans.)

**Sengoku Enclave**  `CIVILIZATION_SENGOKU`

- **A · ⚔ Forge their blades** · +Production / −Happiness
  - *why:* their castle-town armourers forge blades and temper your warriors, sternly
  - *quote:* "疾如風、徐如林、侵掠如火、不動如山 (Swift as the wind, silent as the forest, fierce as fire, immovable as the mountain.)" — Takeda Shingen, Fūrinkazan banner (after Sun Tzu, trans.)
- **B · Tax their trade** · +Gold / −Food
  - *why:* daimyō markets pay well, off the fields
  - *quote:* "楽市楽座 (Rakuichi rakuza — free markets, open guilds.)" — Oda Nobunaga, Azuchi market edicts (trans.)

**Shawnee Enclave**  `CIVILIZATION_SHAWNEE`

- **A · Take up their farming** · +Food / −Gold
  - *why:* river-bottom gathering feeds the ward, at some cost
  - *quote:* "Sell a country! Why not sell the air, the clouds, and the great sea?" — Tecumseh (1810)
- **B · Embrace their culture** · +Culture / −Production
  - *why:* council-rites enrich custom while the workshops idle
  - *quote:* "A single twig breaks, but the bundle of twigs is strong." — attributed to Tecumseh (attr. debated)

**Tongan Enclave**  `CIVILIZATION_TONGA`

- **A · Take up their farming** · +Food / −Production
  - *why:* ocean fisheries feed the fringe, drawing hands off the yards
  - *quote:* "Fonua ko e tangata, tangata ko e fonua. (The land is the people, the people are the land.)" — Tongan proverb
- **B · Tax their trade** · +Gold / −Culture
  - *why:* island trade-routes pay well, and the city keeps its accounts before its rites
  - *quote:* "The Tuʻi Tonga held a maritime empire across the central Pacific." — I. C. Campbell, Island Kingdom: Tonga Ancient and Modern (1992)

## 4. Neutral fallback (unknown / DLC civs)

- +Culture / −Happiness — their customs enrich the city, as two ways of life settle side by side
- +Gold / −Happiness — their enclave pays into your treasury, and chafes at the levy

