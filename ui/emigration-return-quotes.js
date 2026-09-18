// emigration-return-quotes.js
//
// Epigraphs for the "call our people home" dialogs, in the voice of someone coming home, longing for home, or
// being called back after exile or years abroad. Keyed by the PLAYER's civilization (it is their people coming
// home), with a general pool for civilizations without a row. Same curation rules as the refugee and migrant
// quotes (emigration-displaced-quotes.js): every line was read in a readable copy of its source, every English
// rendering is either public domain worldwide (translator dead over seventy years) or ours, and nothing here
// generalizes a people, trivializes scripture, or takes a side in a live dispute. Citations and the URLs where
// each line was read are in docs/quote-sources.md. Display and localization reuse the displaced-quote format:
// one LOC row per quote (LOC_EMIG_DQ_<CIV>_RETURN_<n>), identical in every locale.
//
// Pieces are split between the certain internal call and the uncertain external one only by what the dialog
// renderer draws around them; the pool is shared, so every line here reads as homecoming or longing for home,
// never as the outcome of one call.

/** @typedef {import("/emigration/ui/emigration-quarter-bonuses.js").QQuote} QQuote */

/**
 * One quote: the quoted line (original, then the English in parentheses where the original is not English),
 * the speaker, and the source work with its translator or a "(trans.)" marker for our own rendering.
 * @param {string} text @param {string} who @param {string} source @returns {QQuote} The quote.
 */
function q(text, who, source) {
  return { text, who, source };
}

/**
 * Per-civilization homecoming quotes, keyed by CivilizationType. A civilization with no row uses RETURN_POOL.
 * @type {Readonly<Record<string, QQuote[]>>}
 */
export const RETURN_QUOTES = Object.freeze({
  CIVILIZATION_EGYPT: [
    q("How great a thing is it that my body should be embalmed in the land where I was born! To return there is happiness.", "Sinuhe", "The Story of Sinuhe (trans. Griffith)")
  ],
  CIVILIZATION_FRENCH_EMPIRE: [
    q("Heureux qui, comme Ulysse, a fait un beau voyage … Et puis est retourné, plein d'usage et raison, / Vivre entre ses parents le reste de son aage ! (Happy the man who, like Ulysses, has made a fine voyage … and then has come home, full of experience and good sense, to live among his kin the rest of his days!)", "Joachim du Bellay", "Les Regrets XXXI (1558, trans.)")
  ],
  CIVILIZATION_GREAT_BRITAIN: [
    q("My heart's in the Highlands, my heart is not here, / My heart's in the Highlands, a-chasing the deer; / Chasing the wild-deer, and following the roe, / My heart's in the Highlands, wherever I go.", "Robert Burns", "My Heart's in the Highlands (1789)"),
    q("Oh, to be in England / Now that April's there, / And who wakes in England / Sees, some morning, unaware, / That the lowest boughs and the brush-wood sheaf / Round the elm-tree bole are in tiny leaf", "Robert Browning", "Home-Thoughts, from Abroad (1845)")
  ],
  CIVILIZATION_GREECE: [
    q("θάλαττα θάλαττα (Presently they could hear the soldiers shouting and passing on the joyful word, \"The sea! the sea!\")", "Xenophon, of the Ten Thousand sighting the road home", "Anabasis IV.7 (trans. Dakyns)"),
    q("ἰὼ πατρῷον οὖδας Ἀργείας χθονός, / δεκάτου σε φέγγει τῷδ᾽ ἀφικόμην ἔτους (All hail, soil of Argos, land of my fathers! On this happy day in the tenth year I have come to you. Many hopes have shattered, one only have I seen fulfilled.)", "the Herald, in Aeschylus", "Agamemnon 503-505 (trans. Smyth)")
  ],
  CIVILIZATION_HAN: [
    q("歸去來兮，田園將蕪胡不歸？ (Home! Let me go home! My fields and garden are going to weeds; why not return?)", "Tao Yuanming", "Return Home (405, trans.)")
  ],
  CIVILIZATION_HEIAN: [
    q("ひさかたの月におひたるかつら川そこなる影もかはらざりけり (Katsura River, sprung from the laurel in the moon: even the reflection in your depths is just as it was.)", "Ki no Tsurayuki, on the last night of the voyage home", "Tosa Diary (935, trans.)"),
    q("天の原 ふりさけ見れば 春日なる みかさの山に 出でし月かも (When I look abroad o'er the wide-stretched Plain of Heaven, is the moon the same that on Mount Mikasa rose, in the land of Kasuga?)", "Abe no Nakamaro, in China, before the voyage home", "Kokin Wakashū 406 (trans. MacCauley)"),
    q("名にしおはゝいさこととはん都鳥我思ふ人は有やなしやと (If you are true to your name, then let me ask you, capital-bird: the one I love, is she living still, or not?)", "The Tales of Ise", "section 9 (10th c., trans.)")
  ],
  CIVILIZATION_MAURYA: [
    q("कश्चित्कान्ताविरहगुरुणा स्वाधिकारात्प्रमत्तः शापेनास्तङ्गमितमहिमा वर्षभोग्येण भर्तुः (An erring Yaksha made his hapless home, / Doomed by his master humbly to abide, / And spend a long, long year of absence from his bride.)", "Kalidasa", "The Cloud-Messenger I.1 (trans. Ryder)")
  ],
  CIVILIZATION_MING: [
    q("君自故鄉來，應知故鄉事。來日綺窗前，寒梅着花未。 (You have come from my home town, so you must know how things stand at home. The day you left, before the patterned window, had the winter plum yet come into flower?)", "Wang Wei", "Miscellaneous Poems II (8th c., trans.)"),
    q("露從今夜白，月是故鄉明。 (From tonight the dew turns white; the moon is brighter over my home.)", "Du Fu", "Thinking of My Brothers on a Moonlit Night (759, trans.)"),
    q("舉頭望明月，低頭思故鄉。 (I lift my head and gaze at the bright moon; I lower my head and think of home.)", "Li Bai", "Quiet Night Thought (8th c., trans.)")
  ],
  CIVILIZATION_PERSIA: [
    q("غم غریبی و غربت چو بر نمی‌تابم / به شهر خود روم و شهریار خود باشم (Since I cannot bear the grief of being a stranger in a strange land, I will go to my own city and be my own sovereign.)", "Hafez", "Divan, ghazal 337 (14th c., trans.)")
  ],
  CIVILIZATION_ROME: [
    q("o quid solutis est beatius curis, / cum mens onus reponit, ac peregrino / labore fessi venimus larem ad nostrum, / desideratoque acquiescimus lecto? (O what is more blessed than cares laid down, when the mind sets aside its burden, and, worn out by toil abroad, we come to our own hearth and rest at last in the bed we longed for?)", "Catullus", "Carmina XXXI, on reaching Sirmio (trans.)")
  ]
});

/**
 * General homecoming quotes for civilizations without their own row.
 * @type {readonly QQuote[]}
 */
export const RETURN_POOL = Object.freeze([
  q("ὣς οὐδὲν γλύκιον ἧς πατρίδος οὐδὲ τοκήων γίγνεται (There is nothing dearer to a man than his own country and his parents, and however splendid a home he may have in a foreign country, if it be far from father or mother, he does not care about it.)", "Odysseus, in Homer", "Odyssey IX (trans. Butler)"),
  q("Nescio qua natale solum dulcedine cunctos / ducit et inmemores non sinit esse sui. (By some sweetness I cannot name, one's native soil draws everyone, and will not let them forget it.)", "Ovid", "Epistulae ex Ponto I.3, from exile (trans.)"),
  q("少小離家老大回，鄉音無改鬢毛衰。兒童相見不相識，笑問客從何處來。 (I left home young and came back old; my accent unchanged, my temples grown thin. The children see me and do not know me; laughing, they ask where the stranger is from.)", "He Zhizhang", "Written on Returning Home (8th c., trans.)"),
  q("هر کسی کو دور ماند از اصل خویش / باز جوید روزگار وصل خویش (Every one who is left far from his source wishes back the time when he was united with it.)", "Rumi", "Masnavi I, proem (13th c., trans. Nicholson)"),
  q("con altra voce omai, con altro vello / ritornerò poeta, e in sul fonte / del mio battesmo prenderò 'l cappello (With other voice forthwith, with other fleece / Poet will I return, and at my font / Baptismal will I take the laurel crown.)", "Dante Alighieri, in exile", "Paradiso XXV (trans. Longfellow)")
]);
