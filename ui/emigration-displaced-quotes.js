// emigration-displaced-quotes.js
//
// Epigraphs for the refugee decision, the newcomers pop-up and the call-our-people-home dialogs, chosen by
// the civilization the people come from (for a call home, that is the player's own). The homecoming lines
// themselves live in emigration-return-quotes.js and are merged in here as the "return" kind.
// Curation rule, in order: the words of an actual refugee, exile, deportee, or migrant of that people;
// else a contemporary witness who writes about them with dignity; else the civilization has no row and a
// general pool quote, also in the voice of the displaced, is used. Every line was located in a readable
// copy of its source before shipping; the citations are in docs/quote-sources.md. Nothing here may
// stereotype a people or frame the displaced as a threat or a burden.
//
// A civilization the player has not met gets a pool quote, so the epigraph never names who is coming.
// Display and localization reuse the enclave quote format: `"<original> (<English>)" — <who>, <source>`,
// one LOC row per quote, identical in every locale.

import { quoteDisplay, renderableLine } from "/emigration/ui/emigration-quarter-bonuses.js";
import { loc } from "/emigration/ui/emigration-loc.js";
import { civType } from "/emigration/ui/emigration-naming.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { RETURN_QUOTES, RETURN_POOL } from "/emigration/ui/emigration-return-quotes.js";

/** @typedef {import("/emigration/ui/emigration-quarter-bonuses.js").QQuote} QQuote */
/** @typedef {"refugee"|"migrant"|"return"} DisplacedKind */
/** @typedef {{refugee?: QQuote[], migrant?: QQuote[], return?: readonly QQuote[]}} DisplacedRow */
/** @typedef {Readonly<{refugee: QQuote[], migrant: QQuote[], return: readonly QQuote[]}>} DisplacedPools */

/**
 * One quote: the quoted line, the speaker, and the source work (with a (trans.) / (attr.) marker where it applies).
 * @param {string} text @param {string} who @param {string} source @returns {QQuote} The quote.
 */
function q(text, who, source) {
  return { text, who, source };
}

/**
 * Per-civilization quotes, keyed by CivilizationType, then kind. A civilization may carry either kind or
 * both; a missing kind falls back to the pool.
 * @type {Readonly<Record<string, DisplacedRow>>}
 */
const DISPLACED_BASE = Object.freeze({
  CIVILIZATION_ABBASID: {
    refugee: [
      q("أيا جارتا ما أنصف الدهر بيننا / تعالي أقاسمك الهموم تعالي (O neighbour, fate has not dealt fairly between us: come, let me share my sorrows with you, come!)", "Abu Firas al-Hamdani", "poems from captivity (10th c., trans.)")
    ],
    migrant: [
      q("كم منزل في الأرض يألفه الفتى / وحنينه أبداً لأول منزل (How many a dwelling on earth a young man comes to love, yet his longing is ever for his first home.)", "Abu Tammam (attr.)", "(9th c., trans.)")
    ]
  },
  CIVILIZATION_AKSUM: {
    refugee: [
      q("What shall we do? For we have left our country and our birth-place, and our kinsfolk and the people of our city.", "the children of the nobles of Israel, departing with Menyelek", "Kebra Nagast, ch. 45 (14th c., trans. Budge 1922)")
    ]
  },
  CIVILIZATION_AMERICA: {
    refugee: [
      q("…when my feet first touched the Canada shore. I threw myself on the ground, rolled in the sand, seized handfuls of it and kissed them…", "Josiah Henson", "The Story of His Own Life, on escaping slavery (1858)")
    ],
    migrant: [
      q("To her this song meant not so much the acquisition of a new home as the loss of all her friends and relatives.", "Hamlin Garland, of his mother", "A Son of the Middle Border (1917)")
    ]
  },
  CIVILIZATION_ASSYRIA: {
    migrant: [
      q("In July, 1889, I left Oroomiah with not more than what amounts to five dollars in the United States, and not knowing where I should finally land.", "Isaac Adams, of Urmia", "Persia by a Persian (1900)")
    ]
  },
  CIVILIZATION_BABYLON: {
    refugee: [
      q("Woe is me, I have been exiled from the city, I can find no rest… I am sitting as if a stranger with head high in a strange city.", "Ningal, queen of Ur, mourning her people", "Lament for Ur, lines 306-308 (early 2nd millennium BCE, trans.)")
    ]
  },
  CIVILIZATION_BUGANDA: {
    refugee: [
      q("Nikodemo conducted his fugitive fellow-Christians to Entare, who hospitably received them owing to his former friendship with Nikodemo.", "Robert P. Ashe", "Chronicles of Uganda (1894)")
    ],
    migrant: [
      q("I remembered the proverb of our forefathers, which they used to sing, \"You who stagger about under your burdens, those who come after you will be filled with amazement.\"", "Ham Mukasa", "Uganda's Katikiro in England (1904, trans. Millar)")
    ]
  },
  CIVILIZATION_BULGARIA: {
    refugee: [
      q("…дето нас млади пропъди / по тази тежка чужбина – / да ходим да се скитаме / немили, клети, недраги! (…that drove us out, still young, into this hard foreign land, to wander about unloved, wretched, unwanted!)", "Hristo Botev", "On Parting in 1868 (trans.)")
    ],
    migrant: [
      q("Баща и сестра и братя мили / аз да прегърна искам без злоба (Father and sister and dear brothers: I long to embrace them, without bitterness.)", "Hristo Botev", "To My Mother (1867, trans.)")
    ]
  },
  CIVILIZATION_CARTHAGE: {
    refugee: [
      q("Non ignara mali, miseris succurrere disco. (O, I am wise in sorrow, and I help all suffering souls!)", "Dido, in Virgil", "Aeneid I (trans. Williams)")
    ],
    migrant: [
      q("And he set forth with sixty ships of fifty oars, and a multitude of men and women, to the number of thirty thousand, and with wheat and other provisions.", "Periplus of Hanno", "(5th c. BC, trans. Schoff)")
    ]
  },
  CIVILIZATION_CHOLA: {
    migrant: [
      q("வள்ளியோர்ப் படர்ந்து, புள்ளின் போகி, / ‘நெடிய’ என்னாது சுரம்பல கடந்து, / … / பிறர்க்குத் தீதறிந் தன்றோ? இன்றே; (Seeking the generous, going like birds, never saying 'too far', crossing many wastelands … does this life of wandering for gifts know how to harm others? It does not.)", "Kovur Kizhar", "Purananuru 47 (trans.)")
    ]
  },
  CIVILIZATION_DAI_VIET: {
    refugee: [
      q("彼中人物，昔甚繁華，時遷事變，畧無遺迹，惟我一人，知而道之。非夢而何？ (The people of that land were once in full flower; times shifted and things changed, and scarcely a trace remains. I alone know them and tell of them. What is this, if not a dream?)", "Hồ Nguyên Trừng", "Nam Ông mộng lục, preface (1438, trans.)"),
      q("一別家山恰十年 … 干戈未息幸身全 (Ten years exactly since I parted from my home hills … the fighting has not ceased; by good fortune I am still whole.)", "Nguyễn Trãi", "On Reaching Côn Sơn After the Turmoil (trans.)")
    ]
  },
  CIVILIZATION_EGYPT: {
    refugee: [
      q("O God, whosoever thou art that didst ordain this flight, show mercy and bring me to the Residence! Peradventure thou wilt grant me to see the place where my heart dwelleth.", "Sinuhe", "The Story of Sinuhe (trans. Gardiner)")
    ],
    migrant: [
      q("I thank the lord Serapis that, when I was in peril in the sea, he saved me immediately. … And it is well with me.", "Apion, an Egyptian in the Roman fleet", "letter home, BGU II 423 (2nd c., trans. Strachan)")
    ]
  },
  CIVILIZATION_ENGLAND: {
    refugee: [
      q("…hrēran mid hondum hrīmcealde sǣ, wadan wræclāstas. Wyrd bið ful ārǣd. (…to stir with his hands the rime-cold sea, to tread the paths of exile. Fate is wholly fixed.)", "the wanderer", "The Wanderer, Exeter Book (10th c., trans.)")
    ],
    migrant: [
      q("monað modes lust mæla gehwylce ferð to feran, þæt ic feor heonan elþeodigra eard gesece. (The mind's desire urges my spirit every hour to journey, that far from here I should seek the land of foreign peoples.)", "the seafarer", "The Seafarer, Exeter Book (10th c., trans.)")
    ]
  },
  CIVILIZATION_FRENCH_EMPIRE: {
    refugee: [
      q("L’exil n’est pas une chose matérielle, c’est une chose morale. (Exile is not a material thing; it is a moral one.)", "Victor Hugo", "Ce que c'est que l'exil (1875, trans.)"),
      q("Guernesey est faite pour ne laisser au proscrit que de bons souvenirs ; mais l’exil existe en dehors du lieu d’exil. (Guernsey is made to leave the exile nothing but good memories; but exile exists outside the place of exile.)", "Victor Hugo", "Ce que c'est que l'exil (1875, trans.)")
    ],
    migrant: [
      q("Quand reverray-je, helas, de mon petit village / Fumer la cheminee (When shall I see again, alas, the chimney smoke rising from my little village…)", "Joachim du Bellay", "Les Regrets XXXI (1558, trans.)")
    ]
  },
  CIVILIZATION_GAUL: {
    refugee: [
      q("…omnibus Gallis idem esse faciendum quod Helvetii fecerint, ut domo emigrent, aliud domicilium, alias sedes, remotas a Germanis, petant. (…the Gauls must all do the same thing that the Helvetii had done, emigrate from their country, and seek another dwelling place, other settlements remote from the Germans.)", "Diviciacus the Aeduan", "Caesar, De Bello Gallico 1.31 (c. 50 BCE, trans.)")
    ],
    migrant: [
      q("Bellovesum ac Segovesum sororis filios impigros iuvenes missurum se esse in quas di dedissent auguriis sedes. (He signified his intention of sending his sister's sons Bellovesus and Segovesus, both enterprising young men, to settle in whatever locality the gods should by augury assign to them.)", "Livy, on King Ambigatus sending out the Gauls", "Ab Urbe Condita 5.34 (late 1st c. BCE, trans.)")
    ]
  },
  CIVILIZATION_GORYEO: {
    refugee: [
      q("故國荒凉忍可思。不如忘却故憨癡。 (The old country lies desolate; how can I bear to think of it? Better to forget it, and play the fool on purpose.)", "Yi Kyu-bo", "Eok gu-gyeong sam-yeong, in Dongguk Yi Sangguk hujip (c. 1233-41, trans.)")
    ],
    migrant: [
      q("扁舟漂泊若爲情。四海誰云盡弟兄。 (Adrift in a little boat; how am I to bear it? Who was it said that within the four seas all men are brothers?)", "Yi Je-hyeon", "Sagwi, in Ikchae nango (1316, trans.)")
    ]
  },
  CIVILIZATION_GREAT_BRITAIN: {
    refugee: [
      q("…they knew they were pilgrimes, & looked not much on those things, but lift up their eyes to ye heavens, their dearest cuntrie, and quieted their spirits.", "William Bradford", "Of Plimoth Plantation (1620s)")
    ],
    migrant: [
      q("I never wish to have a better home than I got at present. Thank God, I am well and hearty, and hope that I shall remain so.", "John Stedman, labourer, from Upper Canada", "letter home (1832)"),
      q("Fair these broad meads – these hoary woods are grand; / But we are exiles from our fathers’ land.", "Canadian Boat-Song", "(anon., 1829)")
    ]
  },
  CIVILIZATION_GREECE: {
    refugee: [
      q("ὑπερημίσεας τῶν ἀστῶν ἔλαβε πόθος τε καὶ οἶκτος τῆς πόλιος καὶ τῶν ἠθέων τῆς χώρης (…more than half of the citizens were overcome with longing and pitiful sorrow for the city and the life of their land…)", "Herodotus, on the Phocaeans", "Histories I.165 (trans. Godley)"),
      q("καὶ ξυνέβη μοι φεύγειν τὴν ἐμαυτοῦ ἔτη εἴκοσι μετὰ τὴν ἐς Ἀμφίπολιν στρατηγίαν (It was also my fate to be an exile from my country for twenty years after my command at Amphipolis…)", "Thucydides", "History of the Peloponnesian War V.26 (trans. Crawley)")
    ],
    migrant: [
      q("Κύμην Αἰολίδα προλιπών, ἐν νηὶ μελαίνῃ· οὐκ ἄφενος φεύγων οὐδὲ πλοῦτόν τε καὶ ὄλβον, ἀλλὰ κακὴν πενίην, τὴν Ζεὺς ἄνδρεσσι δίδωσιν· νάσσατο δʼ ἄγχʼ Ἑλικῶνος (…he left Aeolian Cyme and fled, not from riches and substance, but from wretched poverty which Zeus lays upon men, and he settled near Helicon…)", "Hesiod, of his father", "Works and Days (trans. Evelyn-White)"),
      q("My dear limbs yearn not to stay in the sacred streets of Cyme, but rather my great heart urges me to go unto another country, small though I am.", "Homeric Epigram IV", "(attr. Homer, trans. Evelyn-White)")
    ]
  },
  CIVILIZATION_HAN: {
    refugee: [
      q("人情同於懷土兮，豈窮達而異心？ (All human hearts alike long for their native soil; would hardship or success make any heart differ?)", "Wang Can", "Rhapsody on Climbing the Tower (c. 208, trans.)"),
      q("雖信美而非吾土兮，曾何足以少留？ (Though truly beautiful, this is not my own land; how could I bear to linger here even a little while?)", "Wang Can", "Rhapsody on Climbing the Tower (c. 208, trans.)")
    ],
    migrant: [
      q("使先至者安樂而不思故鄉，則貧民相募而勸往矣。 (Let those who arrive first live in peace and contentment, not pining for their old homes, and the poor will call one another to follow and gladly go.)", "Chao Cuo", "memorial on settling new lands (2nd c. BC, trans.)")
    ]
  },
  CIVILIZATION_HAWAII: {
    refugee: [
      q("The poor Hawaiians, strangers on their native soil, excluded from their own halls of legislation, have had their experience; alas, a bitter one.", "Liliʻuokalani", "Hawaii's Story by Hawaii's Queen (1898)"),
      q("…they return to their parents, but I was returned into tears; for I have no home, neither father nor mother.", "Henry ʻŌpūkahaʻia", "Memoirs of Henry Obookiah (1818)")
    ],
    migrant: [
      q("Oh! how I want to see Owhyhee! But I think I never shall…", "Henry ʻŌpūkahaʻia", "Memoirs of Henry Obookiah (1818)")
    ]
  },
  CIVILIZATION_HEIAN: {
    refugee: [
      q("こちふかはにほひおこせよ梅の花あるしなしとて春をわするな (When the east wind blows, send me your fragrance, plum blossoms; though your master is gone, do not forget the spring.)", "Sugawara no Michizane", "on leaving for exile, Shūi Wakashū (901, trans.)"),
      q("わたのはらやそしまかけてこきいてぬと人にはつけよあまのつり舟 (O'er the wide, wide sea, / Towards its many distant isles, / Rowing I set forth. / This, to all the world proclaim, / O ye boats of fisher-folk!)", "Ono no Takamura", "on his banishment, Kokin Wakashū (838, trans. MacCauley)")
    ],
    migrant: [
      q("昔男ありけり。京にありわびて。あづまへゆきけるに。…いとゝしく過行かたの戀しきにうらやましくもかへる浪哉 (Once there was a man who, finding life in the capital hard to bear, went east … 'Ever more I long for the places I have passed; how I envy the waves that go back.')", "The Tales of Ise", "section 7 (10th c., trans.)"),
      q("京にはをらじ。あづまのかたにすむべき所もとめにとてゆきけり。 (Resolved not to stay in the capital, he set off toward the East to find a place where he might live.)", "The Tales of Ise", "section 9 (10th c., trans.)")
    ]
  },
  CIVILIZATION_ICELAND: {
    migrant: [
      q("Þótt þú langförull legðir / sérhvert land undir fót, / bera hugur og hjarta / samt þíns heimalands mót (Though, far-traveller, you set foot on every land, your mind and heart still bear the stamp of your homeland.)", "Stephan G. Stephansson", "Andvökur (trans.)"),
      q("Svo var haldið djúpt, að um morguninn sá ég Tjörnes, það seinasta af ættjörðu minni. (We held out to sea, so that in the morning I saw Tjörnes, the last of my native land.)", "Guðmundur Stefánsson", "letter on emigrating (1873, trans.)"),
      q("Hér fengum við svo góðar móttökur að þær gátu ekki verið betri, þó við hefðum komið til vina okkar á Íslandi eftir margra ára útlegð. (Here we received so good a welcome that it could not have been better, even had we come to our friends in Iceland after many years of exile.)", "Guðmundur Stefánsson", "letter on emigrating (1873, trans.)")
    ]
  },
  CIVILIZATION_INCA: {
    refugee: [
      q("Trocósenos el reinar en vasallaje (We are turned from rulers into vassals.)", "the Inca nobles of Cuzco", "in Garcilaso de la Vega, Comentarios Reales (1609, trans. Markham)")
    ],
    migrant: [
      q("forzado del amor natural de patria, me ofrecí al trabajo de escribir estos Comentarios (…influenced by a natural love of my country, I undertook the task of writing these Commentaries.)", "Inca Garcilaso de la Vega", "Comentarios Reales, proem (1609, trans. Markham)")
    ]
  },
  CIVILIZATION_KHMER: {
    refugee: [
      q("因屢與暹人交兵，遂至皆成曠地。 (As a result of repeated wars with the Siamese the land has been completely laid to waste.)", "Zhou Daguan", "Zhenla fengtuji (c. 1300, trans.)")
    ]
  },
  CIVILIZATION_JOSEON: {
    refugee: [
      q("有人在田間。望之痛哭曰。國家棄我去。我輩何恃而生也。 (A man out in the fields watched them go, and wept bitterly: the state has abandoned us and gone; on what shall we rely to live?)", "Yu Seong-ryong, on the flight from Seoul", "Jingbirok (c. 1604, trans.)"),
      q("北風吹我如飛雪。南抵康津賣飯家。 (The north wind blows me along like driven snow, south as far as Gangjin, to a house that sells meals.)", "Jeong Yak-yong, on reaching his place of exile", "Gaekjung seohoe, in Yeoyudang jeonseo (1801, trans.)")
    ]
  },
  CIVILIZATION_MAURYA: {
    migrant: [
      q("bhūtapūrvam abhūtapūrvaṃ vā janapadaṃ paradeśāpavāhanena svadeśābhiṣyandavamanena vā niveśayet (He should settle the countryside, whether previously settled or not, either by drawing population away from foreign lands or by draining off the surplus of his own.)", "Kauṭilya", "Arthaśāstra 2.1.1 (Mauryan tradition, received text c. 2nd c., trans.)")
    ]
  },
  CIVILIZATION_MAYA: {
    refugee: [
      q("Have pity on us, our brother, since we are all stretched on the shore of the ocean without seeing our hills and plains.", "the Kaqchikel ancestors", "Annals of the Cakchiquels (16th c., trans. Brinton)")
    ],
    migrant: [
      q("There are your hills and plains; there, beyond the ocean, are your hills and plains, oh you my sons, there it is that you shall lift up your faces.", "the Obsidian Stone, to the Kaqchikel ancestors", "Annals of the Cakchiquels (16th c., trans. Brinton)")
    ]
  },
  CIVILIZATION_MEIJI: {
    refugee: [
      q("石をもて追はるるごとく / ふるさとを出でしかなしみ / 消ゆる時なし (As though driven out with stones, I left my home village, and that sorrow never fades.)", "Ishikawa Takuboku", "A Handful of Sand (1910, trans.)")
    ],
    migrant: [
      q("ふるさとの訛なつかし / 停車場の人ごみの中に / そを聴きにゆく (Longing for the accent of my home province, I go to the crowded railway station to hear it spoken.)", "Ishikawa Takuboku", "A Handful of Sand (1910, trans.)"),
      q("Yokohama deru tok'ya / Namida de deta ga / Ima ja ko mo aru / Mago mo aru (When I left Yokohama, I left in tears; but now I have children, and grandchildren too.)", "holehole bushi, a Hawaii plantation song", "(Meiji-era emigrants, trans.)")
    ]
  },
  CIVILIZATION_MEXICO: {
    refugee: [
      q("Adiós mi madre querida, … Yo me voy al extranjero, / Donde no hay revolución. (Goodbye, my dear mother, … I am going abroad, where there is no revolution.)", "El Deportado", "(corrido, 1920s, trans.)")
    ],
    migrant: [
      q("Voy a contarles señores, / Todo lo que yo sufrí. / Desde que dejé mi patria, / Por venir a este país. (Let me tell you, gentlemen, all that I have suffered since I left my homeland to come to this country.)", "El Deportado", "(corrido, 1920s, trans.)")
    ]
  },
  CIVILIZATION_MING: {
    refugee: [
      q("有弟皆分散，無家問死生。寄書長不達，況乃未休兵。 (My brothers are all scattered; there is no home where I might ask if they live or die. Letters sent never arrive, and still the fighting has not ceased.)", "Du Fu", "Thinking of My Brothers on a Moonlit Night (8th c., trans.)")
    ],
    migrant: [
      q("江水三千里，家書十五行。行行無別語，只道早歸鄉。 (The river runs three thousand li; the letter from home is fifteen lines. Line after line says nothing else, only: come home soon.)", "Yuan Kai", "Receiving a Letter from Home in the Capital (14th c., trans.)")
    ]
  },
  CIVILIZATION_MISSISSIPPIAN: {
    refugee: [
      q("Amid the gloom and horrors of the present separation, we are cheered with a hope that ere long we shall reach our destined land…", "George W. Harkins, Choctaw chief", "Farewell Letter to the American People (1832)"),
      q("I ask you in the name of justice, for repose for myself and for my injured people.", "George W. Harkins, Choctaw chief", "Farewell Letter to the American People (1832)")
    ],
    migrant: [
      q("Some settled on one side of the River, some on the other. Those on one side are called Cussetaws, those on the other, Cowetas; yet they are one people…", "Chekilli, Creek head chief", "Kasihta migration legend (1735)")
    ]
  },
  CIVILIZATION_MONGOLIA: {
    refugee: [
      q("My Daidu, where my fathers dwelt in joy and gladness, my faithful lords and princes, and my dear people.", "Toghon Temür (attr.)", "lament on leaving Daidu, 1368 (trans.)")
    ]
  },
  CIVILIZATION_MUGHAL: {
    refugee: [
      q("It passed through my mind that to wander from mountain to mountain, homeless and houseless, without country or abiding-place, had nothing to recommend it.", "Babur", "Baburnama (trans. Beveridge)")
    ]
  },
  CIVILIZATION_NEPAL: {
    migrant: [
      q("हातका मैला सुनका थैला, के गर्नु धनले ? साग र सिस्नु खाएको बेस आनन्दी मनले ! (Bags of gold are but dirt on the hands; what is wealth for? Better to eat greens and nettles, with a contented heart!)", "Muna, to her husband bound for Lhasa", "Laxmi Prasad Devkota, Muna Madan (1936, trans.)")
    ]
  },
  CIVILIZATION_NORMAN: {
    refugee: [
      q("…inter extraneos, in magna egestate, nec sine multa formidine, educatus est (…brought up amongst foreigners in great indigence, and not without much apprehension.)", "Orderic Vitalis, on the exiled William Clito", "Historia ecclesiastica XII (trans. Forester)")
    ]
  },
  CIVILIZATION_OTTOMANS: {
    refugee: [
      q("Bu gurbet câna gâyet kâr kıldı / Ki âlemden beni bîzâr kıldı (This exile has wrought so deeply on my soul that it has made me weary of the world.)", "Cem Sultan", "Divan, written in exile (15th c., trans.)")
    ]
  },
  CIVILIZATION_PERSIA: {
    refugee: [
      q("O Raja of Rajas, give us a place in this city: we are strangers seeking protection who have arrived in thy town and place of residence.", "the Zoroastrian refugees, to the Rana of Sanjan", "Qissa-i Sanjan (c. 1600, trans. Hodivala)"),
      q("بگذر ای باد دل‌افروز خراسانی / بر یکی مانده به یمگان دره زندانی (Pass by, O heart-kindling breeze of Khorasan, over one left behind, a prisoner in the valley of Yumgan.)", "Nasir Khusraw", "Divan, qasida 236 (11th c., trans.)")
    ],
    migrant: [
      q("در اقصای عالم بگشتم بسی / به سر بردم ایام با هر کسی / تمتع به هر گوشه‌ای یافتم / ز هر خرمنی خوشه‌ای یافتم (I wandered far through the farthest corners of the world and spent my days with every kind of people; in every corner I found some joy, from every harvest I gleaned an ear of grain.)", "Saadi", "Bustan, prologue (1257, trans.)")
    ]
  },
  CIVILIZATION_PIRATE_REPUBLIC: {
    refugee: [
      q("Being now at liberty, though like Adam when he was first created, that is, naked and destitute… I determined to enter into the order of the pirates…", "Alexandre Exquemelin", "The Buccaneers of America (1684)")
    ]
  },
  CIVILIZATION_PRUSSIA: {
    refugee: [
      q("Ich hatte einst ein schönes Vaterland. / Der Eichenbaum / Wuchs dort so hoch, die Veilchen nickten sanft. / Es war ein Traum. (Once I had a beautiful fatherland. The oak tree grew so tall there, the violets nodded gently. It was a dream.)", "Heinrich Heine", "In der Fremde (1844, trans.)")
    ],
    migrant: [
      q("Der Bootsmann winkt! – Zieht hin in Frieden: / Gott schütz’ euch, Mann und Weib und Greis! (The boatman beckons! Go forth in peace: God keep you, man and wife and greybeard!)", "Ferdinand Freiligrath", "Die Auswanderer (1838, trans.)"),
      q("Das sind dieselben Töpf’ und Krüge, / Oft an der Heimat Born gefüllt! (These are the same pots and jugs so often filled at the spring back home!)", "Ferdinand Freiligrath", "Die Auswanderer (1838, trans.)")
    ]
  },
  CIVILIZATION_QAJAR: {
    refugee: [
      q("ای مرغ سحر چو این شب تار / بگذاشت ز سر سیاه‌کاری … یاد آر ز شمع مرده یاد آر (O bird of the morning, when this gloomy night puts aside its dark deeds… Remember, O remember, that extinguished Lamp!)", "Ali-Akbar Dehkhoda", "written in exile (1909, trans. Browne)")
    ]
  },
  CIVILIZATION_QING: {
    migrant: [
      q("憶別家鄉月幾圓 / 家人倚望音書勿 (Since I left my home village, how many times has the moon been full? My family leans at the door, watching for letters.)", "a Chinese migrant from Taishan", "Angel Island wall poem (trans.)")
    ]
  },
  CIVILIZATION_ROME: {
    refugee: [
      q("litora cum patriae lacrimans portusque relinquo / et campos, ubi Troia fuit: feror exsul in altum (Through tears I saw recede my native shore, the haven and the plains where once was Troy. An exile on the seas … I took my way.)", "Aeneas, in Virgil", "Aeneid III (trans. Williams)"),
      q("Cum subit illius tristissima noctis imago, / qua mihi supremum tempus in urbe fuit … / labitur ex oculis nunc quoque gutta meis. (When the most sad remembrance recurs to me of that night, which was my last in the City … even now does the tear start from my eyes.)", "Ovid", "Tristia I.3, from exile (trans. Riley)")
    ],
    migrant: [
      q("uidebis maiorem partem esse quae relictis sedibus suis uenerit in maximam quidem ac pulcherrimam urbem, non tamen suam. (…you will find that the greater part of them have left their own abodes, and journeyed to a city which, though great and beauteous beyond all others, is nevertheless not their own.)", "Seneca", "Consolation to Helvia, from exile (trans. Stewart)")
    ]
  },
  CIVILIZATION_RUSSIA: {
    refugee: [
      q("У зверя есть нора, у птицы есть гнездо. / Как бьётся сердце, горестно и громко, / Когда вхожу, крестясь, в чужой, наёмный дом / С своей уж ветхою котомкой! (The beast has its lair, the bird its nest. How my heart beats, grieving and loud, as I enter, crossing myself, a stranger's rented house with my worn-out knapsack!)", "Ivan Bunin", "in exile (1922, trans.)"),
      q("Тучки небесные, вечные странники! / … / Мчитесь вы, будто, как я же, изгнанники, / С милого севера в сторону южную. (Clouds of heaven, eternal wanderers! … You race on as if, like me, you were exiles, from the dear north toward the south.)", "Mikhail Lermontov", "Clouds, on leaving for exile (1840, trans.)")
    ]
  },
  CIVILIZATION_SENGOKU: {
    refugee: [
      q("汝や知る都は野辺の夕雲雀あがるを見ても落つる涙は (Do you know, evening skylark? The capital is now an open moor, and even as I watch you rise, my tears fall.)", "Iio Tsunefusa", "on Kyoto after the Ōnin War (15th c., trans.)")
    ]
  },
  CIVILIZATION_SHAWNEE: {
    refugee: [
      q("We have good homes here, and had abundance of labor and pains to make them. We wanted good men to value our improvements, for we are not ashamed of our homes.", "Wayweleapy, Shawnee speaker", "council at Wapakoneta (1832)"),
      q("We pity them, as they are our brethren; we fear that their situation will be ours, when we get ready to start on our journey.", "Wayweleapy, Shawnee speaker", "council at Wapakoneta (1832)")
    ]
  },
  CIVILIZATION_SIAM: {
    migrant: [
      q("ได้เดือนเศษทุเรศร้างมาห่างบ้าน (For a month and more I have been forlorn, far away from home.)", "Mom Rajothai", "Nirat London (1857, trans.)"),
      q("นี่จนจิตต์กิจราชการหลวง   จึงไกลดวงเนตรนางห่างสยาม (It is only because I am bound to the king's service that I am far from my beloved, far from Siam.)", "Mom Rajothai", "Nirat London (1857, trans.)")
    ]
  },
  CIVILIZATION_SILLA: {
    migrant: [
      q("秋風唯苦吟 / 世路少知音 / 窓外三更雨 / 燈前萬里心 (In the autumn wind I chant my bitter verses; in this world few know my tune. Outside the window, midnight rain; by the lamp, my heart ten thousand li away.)", "Choe Chiwon", "Autumn Night in the Rain (9th c., trans.)")
    ]
  },
  CIVILIZATION_SONGHAI: {
    refugee: [
      q("O thou who goest to Gao, turn aside from thy path to breathe my name in Timbuctoo. Bear thither the greeting of an exile who sighs for the soil on which his friends and family reside.", "Ahmad Baba al-Timbukti", "verses from exile in Marrakesh (trans.)")
    ]
  },
  CIVILIZATION_SPAIN: {
    refugee: [
      q("Doquiera que estamos lloramos por España, que, en fin, nacimos en ella y es nuestra patria natural (Wherever we are we weep for Spain; for after all we were born there and it is our natural fatherland.)", "Ricote the Morisco, in Cervantes", "Don Quixote II.54 (1615, trans. Ormsby)")
    ],
    migrant: [
      q("eu vou polo mundo / pra ver de ganalo. / Galicia está probe, / i á Habana me vou... (I am going out into the world to try to earn my bread. Galicia is poor, and I am off to Havana…)", "Rosalía de Castro", "Pra Habana, Follas novas (1880, trans.)"),
      q("Adios rios, adios fontes, / Adios regatos pequenos, / Adios vista dos meus ollos / Non sei cando nos veremos. (Farewell, rivers; farewell, springs; farewell, little streams; farewell, sight of my eyes: I do not know when we shall meet again.)", "Rosalía de Castro", "Cantares gallegos (1863, trans.)")
    ]
  },
  CIVILIZATION_TONGA: {
    migrant: [
      q("Anxious am I to stay; who can wish to go? / Departing from Vavaoo and her neighbouring isles…", "Tongan paddling song", "sung on leaving Vavaʻu (1817, trans. Mariner)")
    ]
  }
});

/**
 * The refugee and migrant rows with each civilization's homecoming quotes merged in as its "return" list, so
 * one registry answers every kind.
 * @type {Readonly<Record<string, DisplacedRow>>}
 */
export const DISPLACED_QUOTES = Object.freeze(Object.fromEntries(
  [...new Set([...Object.keys(DISPLACED_BASE), ...Object.keys(RETURN_QUOTES)])].sort().map((civ) => [civ,
    Object.freeze({
      ...(DISPLACED_BASE[civ] || {}),
      ...(RETURN_QUOTES[civ] ? { return: RETURN_QUOTES[civ] } : {})
    })])
));

/**
 * General quotes from refugees, migrants and returners of many times and places, for origins without their own.
 * @type {DisplacedPools}
 */
export const DISPLACED_POOLS = Object.freeze({
  refugee: [
    q("Tu proverai sì come sa di sale / lo pane altrui, e come è duro calle / lo scendere e 'l salir per l'altrui scale. (Thou shalt have proof how savoureth of salt / The bread of others, and how hard a road / The going down and up another's stairs.)", "Dante Alighieri", "Paradiso XVII (trans. Longfellow)"),
    q("Litwo! Ojczyzno moja! ty jesteś jak zdrowie; / Ile cię trzeba cenić, ten tylko się dowie / Kto cię stracił. (Lithuania, my country, thou art like health; how much thou shouldst be prized only he can learn who has lost thee.)", "Adam Mickiewicz", "Pan Tadeusz (1834, trans. Noyes)"),
    q("Thou art like me; for thou resemblest me in wandering and peregrination, and the long separation from relatives and friends.", "ʿAbd al-Raḥmān I (attr.)", "to a palm tree at Córdoba (trans. Gayangos)"),
    q("Dos patrias tengo yo: Cuba y la noche. / ¿O son una las dos? (I have two homelands: Cuba and the night. Or are the two one?)", "José Martí", "Dos patrias, poems of exile (trans.)"),
    q("The earth is the mother of all people, and all people should have equal rights upon it.", "Chief Joseph of the Nez Perce", "An Indian's View of Indian Affairs (1879)"),
    q("Alacres itaque et erecti quocumque res tulerit intrepido gradu properemus (Let us therefore briskly and cheerfully hasten with undaunted steps whithersoever circumstances call us…)", "Seneca", "Consolation to Helvia, from exile (trans. Stewart)"),
    q("A free state around me, and a free earth under my feet! What a moment was this to me! A whole year was pressed into a single day.", "Frederick Douglass", "My Bondage and My Freedom (1855)")
  ],
  migrant: [
    q("exul in Normanniam veni, cunctis ignotus neminem cognovi … inter exteros omnem mansuetudinem et familiaritatem reperi (…arrived in Normandy, an exile, unknown to all and knowing no one. … I found the utmost kindness and attention amongst these foreigners.)", "Orderic Vitalis", "Historia ecclesiastica XIII (trans. Forester)"),
    q("So at last I was going to America! Really, really going, at last! The boundaries burst. The arch of heaven soared.", "Mary Antin", "The Promised Land (1912)"),
    q("…my hopes rose high that somewhere in this teeming hive there would be a place for me.", "Jacob A. Riis", "The Making of an American (1901)"),
    q("…my father consented, and gave me his blessing, and my mother took leave of me with tears, while my grandfather laid his hand upon my head…", "Lee Chew", "Life Stories of Undistinguished Americans (1906)"),
    q("I should have been here 20 years ago. I just begin to feel like a man.", "a migrant writing from Chicago", "letter home (1917)"),
    q("Here I am, a youth, a young tree whose roots were plucked from the hills of Lebanon, yet I am deeply rooted here, and I would be fruitful.", "Kahlil Gibran", "To Young Americans of Syrian Origin (1926)"),
    q("少小離家老大回，鄉音無改鬢毛衰。兒童相見不相識，笑問客從何處來。 (I left home young and came back old; my accent unchanged, my temples grown thin. The children see me and do not know me; laughing, they ask where the stranger is from.)", "He Zhizhang", "Written on Returning Home (8th c., trans.)")
  ],
  return: RETURN_POOL
});

/**
 * The LOC key of one quote: the DQ prefix, then the civilization without CIVILIZATION_ (POOL for the pool),
 * the kind in capitals, and the one-based position.
 * @param {string|null} civ A CivilizationType, or null for the pool. @param {DisplacedKind} kind The kind.
 * @param {number} index Zero-based position in its list. @returns {string} The key.
 */
export function displacedQuoteKey(civ, kind, index) {
  const who = civ ? String(civ).replace(/^CIVILIZATION_/, "") : "POOL";
  return "LOC_EMIG_DQ_" + who + "_" + String(kind).toUpperCase() + "_" + (index + 1);
}

/**
 * A stable index into a list of `n` from a seed string (FNV-1a), so one event always shows one quote.
 * @param {string} seed The seed. @param {number} n List length (> 0). @returns {number} The index.
 */
function seedIndex(seed, n) {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % n;
}

/**
 * A civilization's own quotes of one kind, or [] when it has none.
 * @param {Readonly<Record<string, DisplacedRow>>} registry The per-civ quotes. @param {string|null} civ The type.
 * @param {DisplacedKind} kind The kind. @returns {QQuote[]} The list.
 */
function ownList(registry, civ, kind) {
  const row = civ ? registry[civ] : undefined;
  const list = row ? row[kind] : undefined;
  return Array.isArray(list) ? list : [];
}

/**
 * Pick the quote for an origin and kind: the civilization's own list when it has one, else the pool. Pure.
 * @param {string|null} civ The origin CivilizationType, or null (unknown or not met).
 * @param {string} kind "refugee", "migrant" or "return". @param {string} seed Stable per-event seed.
 * @param {Readonly<Record<string, DisplacedRow>>} [registry] The per-civ quotes.
 * @param {DisplacedPools} [pools] The pools.
 * @returns {{key:string, quote:QQuote}|null} The pick, or null when there is nothing to show.
 */
export function pickDisplacedQuote(civ, kind, seed, registry = DISPLACED_QUOTES, pools = DISPLACED_POOLS) {
  if (kind !== "refugee" && kind !== "migrant" && kind !== "return") return null;
  const own = ownList(registry, civ, kind);
  const list = own.length ? own : pools[kind] || [];
  if (!list.length) return null;
  const index = seedIndex(seed, list.length);
  return { key: displacedQuoteKey(own.length ? civ : null, kind, index), quote: list[index] };
}

/**
 * The origin civilization type to quote for a player id, or null when unknown or not yet met (so the quote
 * cannot reveal an unmet civilization).
 * @param {number|null|undefined} pid The origin player id. @returns {string|null} The CivilizationType.
 */
function quotableCiv(pid) {
  if (typeof pid !== "number" || pid < 0) return null;
  try {
    return civHidden(pid) ? null : civType(pid);
  } catch (_) {
    return null;
  }
}

/**
 * The display line for a refugee or migrant epigraph from an origin player: localized through its LOC row,
 * with the English display as the fallback, and unrenderable scripts reduced to their translation.
 * @param {number|null|undefined} pid The origin player id (null: pool only).
 * @param {string} kind "refugee", "migrant" or "return". @param {string} seed Stable per-event seed.
 * @returns {string} The line, or "" when there is nothing to show.
 */
export function displacedQuoteFor(pid, kind, seed) {
  const pick = pickDisplacedQuote(quotableCiv(pid), kind, seed);
  return pick ? renderableLine(loc(pick.key, quoteDisplay(pick.quote))) : "";
}
