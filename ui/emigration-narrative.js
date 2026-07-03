// emigration-narrative.js
//
// The PROSE engine behind the Migration Chronicle (emigration-chronicle.js): it turns a bare event
// record (a civ, a cause, a settlement, a count) into a short written line of history.
//
// Voice: grounded and concrete, with a little of the weight that displacement carries. Two influences,
// held in balance: the immersive, human-scale history of Paul Cooper's Fall of Civilizations (the road
// out of a city, what people carried, what they left) and the terse, factual precision of Mark Felton
// (plain sentences, real numbers, no flourish). Lines are assembled from authored fragments chosen
// DETERMINISTICALLY from the event's own details, so a given event always reads the same and no two
// neighbouring events read alike, without any text being generated at runtime.
//
// House style (enforced by tests/no-em-dash + review): no em dashes that aren't grammatically needed,
// and none of the usual machine-written tells (no "tapestry", "testament", "vibrant", "rich history",
// "not only ... but also", padded tricolons, or hollow intensifiers). Plain words, concrete nouns.
//
// Pure: no engine reads. Callers pass already-resolved names/counts.

import { loc as tr } from "/emigration/ui/emigration-loc.js";

/**
 * A stable 32-bit FNV-1a hash of a seed string, for deterministic fragment choice.
 * @param {string} s The seed.
 * @returns {number} An unsigned 32-bit hash.
 */
function hash(s) {
  let h = 2166136261 >>> 0;
  const str = typeof s === "string" ? s : String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Pick one entry from a list deterministically by seed (stable per seed, spread across the list).
 * @template T @param {T[]} list The options. @param {string} seed The seed. @param {number} [salt] A
 *   per-slot salt so several picks from one seed don't all land on the same index.
 * @returns {T} The chosen entry.
 */
function pick(list, seed, salt) {
  if (!list.length) return /** @type {*} */ ("");
  return list[hash(seed + ":" + (salt || 0)) % list.length];
}

// Always-true fallbacks for where a community keeps to inside a city, naming NO specific feature so a
// line is never wrong. When the host city actually has a nameable feature, the caller
// (emigration-diaspora.js, via emigration-quarter-phrases.js) supplies a truthful feature-based phrase as
// `where`; this list is only the fallback. Chosen by seed, never at random.
const GENERIC_QUARTERS = [
  "on the edge of the city", "in the outer streets", "past the last houses",
  "on the far side of town", "where the streets give out"
];

// Parallel LOC keys for GENERIC_QUARTERS (same order); the seed picks the index, then the phrase is
// localized via its key with the English fragment as the fallback.
const GENERIC_QUARTERS_KEYS = [
  "LOC_EMIG_NARR_QUARTER_GENERIC_1", "LOC_EMIG_NARR_QUARTER_GENERIC_2", "LOC_EMIG_NARR_QUARTER_GENERIC_3",
  "LOC_EMIG_NARR_QUARTER_GENERIC_4", "LOC_EMIG_NARR_QUARTER_GENERIC_5"
];

// What people carried, or failed to. Human-scale detail in the Cooper register.
const CARRIED = [
  "what they could carry", "their tools and little else", "what would fit on a cart",
  "their children and their seed grain", "the few things that mattered"
];

// Parallel LOC keys for CARRIED (same order).
const CARRIED_KEYS = [
  "LOC_EMIG_NARR_CARRIED_1", "LOC_EMIG_NARR_CARRIED_2", "LOC_EMIG_NARR_CARRIED_3",
  "LOC_EMIG_NARR_CARRIED_4", "LOC_EMIG_NARR_CARRIED_5"
];

/**
 * Deterministically pick a fragment from a parallel (English, LOC-key) pair and localize it, so a
 * seeded fragment reads the same off-engine (fallback) as it does localized. The seed selection is
 * identical to {@link pick}, keeping output deterministic.
 * @param {string[]} list The English fragments. @param {string[]} keys The parallel LOC keys.
 * @param {string} seed The seed. @param {number} [salt] A per-slot salt.
 * @returns {string} The localized fragment.
 */
function pickLoc(list, keys, seed, salt) {
  if (!list.length) return "";
  const i = hash(seed + ":" + (salt || 0)) % list.length;
  return tr(keys[i], list[i]);
}

/**
 * A civ adjective for prose, falling back to a neutral "a people" when none was resolved. Civ
 * adjectives ("Roman", "Carthaginian") are proper and stay capitalised mid-sentence.
 * @param {string} adjective The resolved adjective.
 * @returns {string} The adjective, or "a people".
 */
function adj(adjective) {
  return typeof adjective === "string" && adjective.length ? adjective : "a people";
}

/**
 * Strip a leading "the " from a name, so the templates can supply the article themselves and never
 * produce "the the Roman-Gallic War". e.g. "the Eruption of Thera" → "Eruption of Thera".
 * @param {string} [name] The name. @returns {string} The name without a leading article.
 */
function bare(name) {
  return String(name || "").replace(/^the\s+/i, "");
}

/**
 * Capitalize the first letter (the rest left as-is, so "Major Flood" stays "Major Flood").
 * @param {string} s The string. @returns {string} The capitalized string.
 */
function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * The chronicle line for a mass flight (an exodus) driven by war.
 * @param {{civ:string, war:string, city:string, people:string, seed:string}} e The event.
 * @returns {string} The line.
 */
function warExodus(e) {
  const c = adj(e.civ);
  const carried = pickLoc(CARRIED, CARRIED_KEYS, e.seed, 1);
  const keys = [
    "LOC_EMIG_NARR_WAR_EXODUS_1", "LOC_EMIG_NARR_WAR_EXODUS_2",
    "LOC_EMIG_NARR_WAR_EXODUS_3", "LOC_EMIG_NARR_WAR_EXODUS_4"
  ];
  const en = [
    "When the {1_War} reached {2_City}, {3_People} of its people took {4_Carried} and left.",
    "{3_People} {5_Civ} refugees abandoned {2_City} that year, driven out by the {1_War}.",
    "The roads out of {2_City} filled with refugees as the {1_War} closed in. {3_People} did not return.",
    "{2_City} emptied as the {1_War} came. {3_People} {5_Civ} families went wherever the fighting was not."
  ];
  const i = hash(e.seed + ":" + 0) % en.length;
  return tr(keys[i], en[i], e.war, e.city, e.people, carried, c);
}

/**
 * The chronicle line for an exodus driven by disaster.
 * @param {{civ:string, disaster:string, city:string, people:string, seed:string}} e The event.
 * @returns {string} The line.
 */
function disasterExodus(e) {
  const c = adj(e.civ);
  const d = bare(e.disaster);
  const dCap = cap(d);
  const carried = pickLoc(CARRIED, CARRIED_KEYS, e.seed, 1);
  const keys = [
    "LOC_EMIG_NARR_DISASTER_EXODUS_1", "LOC_EMIG_NARR_DISASTER_EXODUS_2", "LOC_EMIG_NARR_DISASTER_EXODUS_3"
  ];
  const en = [
    "The {1_DisasterCap} struck {3_City}. {4_People} {5_Civ} families gathered {6_Carried} and went looking for safer country.",
    "After the {2_Disaster}, {4_People} {5_Civ} refugees left the wreck of {3_City} behind them.",
    "{4_People} {5_Civ} families fled {3_City} in the months after the {2_Disaster}, and the fields around it went quiet."
  ];
  const i = hash(e.seed + ":" + 0) % en.length;
  return tr(keys[i], en[i], dCap, d, e.city, e.people, c, carried);
}

/**
 * The chronicle line for a general (unhappiness/prosperity) departure.
 * @param {{civ:string, city:string, people:string, seed:string}} e The event.
 * @returns {string} The line.
 */
function plainExodus(e) {
  const c = adj(e.civ);
  const keys = [
    "LOC_EMIG_NARR_PLAIN_EXODUS_1", "LOC_EMIG_NARR_PLAIN_EXODUS_2", "LOC_EMIG_NARR_PLAIN_EXODUS_3"
  ];
  const en = [
    "{1_People} {2_Civ} families left {3_City} that year, looking for a better living elsewhere.",
    "Word of work and quiet borders drew {1_People} {2_Civ} households away from {3_City}.",
    "{3_City} lost {1_People} of its people to the long roads, a few families at a time."
  ];
  const i = hash(e.seed + ":" + 0) % en.length;
  return tr(keys[i], en[i], e.people, c, e.city);
}

/**
 * An exodus line for a civ the player has NOT met: named, but framed as something heard of at a
 * distance rather than seen, so the Chronicle can record a far war without pretending to first-hand
 * knowledge of it.
 * @param {{civ:string, city:string, people:string, seed:string}} e The event.
 * @returns {string} The line.
 */
function framedExodus(e) {
  const o = adj(e.civ);
  const keys = [
    "LOC_EMIG_NARR_FRAMED_EXODUS_1", "LOC_EMIG_NARR_FRAMED_EXODUS_2", "LOC_EMIG_NARR_FRAMED_EXODUS_3"
  ];
  const en = [
    "Far beyond the lands we knew, {1_City} emptied. {2_People} of a people we have heard called the {3_Civ} took to the roads.",
    "{2_People} refugees fled {1_City}, a city of a distant people, the {3_Civ}, of whom we had only rumour.",
    "Word came of {1_City}, somewhere past the edge of the map: {2_People} of the {3_Civ}, a people we have only heard tell of, driven from their homes."
  ];
  const i = hash(e.seed + ":" + 0) % en.length;
  return tr(keys[i], en[i], e.city, e.people, o);
}

/**
 * A chronicle line for any exodus, dispatched by cause. When `framed` is set the civ is named but
 * framed as hearsay (an unmet civilization in a narrative surface).
 * @param {{cause:string, civ:string, city:string, people:string, event?:string, seed:string,
 *          framed?:boolean}} e The event.
 * @returns {string} The line.
 */
export function exodusLine(e) {
  if (e.framed) return framedExodus({ civ: e.civ, city: e.city, people: e.people, seed: e.seed });
  if (e.cause === "war" || e.cause === "conquest") {
    return warExodus({ civ: e.civ, war: bare(e.event) || "war", city: e.city, people: e.people, seed: e.seed });
  }
  if (e.cause === "disaster" || e.cause === "attrition") {
    return disasterExodus({ civ: e.civ, disaster: bare(e.event) || "disaster", city: e.city, people: e.people, seed: e.seed });
  }
  return plainExodus({ civ: e.civ, city: e.city, people: e.people, seed: e.seed });
}

/**
 * The chronicle line for a diaspora taking root: an origin people becoming a settled minority in
 * another civ's city.
 * @param {{origin:string, host:string, city:string, pct:number, seed:string, where?:string,
 *          framed?:boolean}} e The event. `where` is a truthful, feature-based quarter phrase from the
 *   host city (emigration-quarter-phrases.js); when absent, a generic always-true phrase is used.
 * @returns {string} The line.
 */
export function foundingLine(e) {
  const o = adj(e.origin);
  const pct = Math.round(e.pct) + " percent";
  const where = typeof e.where === "string" && e.where
    ? e.where
    : pickLoc(GENERIC_QUARTERS, GENERIC_QUARTERS_KEYS, e.seed, 2);
  if (e.framed) {
    const flKeys = ["LOC_EMIG_NARR_FOUNDING_FRAMED_1", "LOC_EMIG_NARR_FOUNDING_FRAMED_2"];
    const flEn = [
      "A community had taken root in {1_City} from a distant land, a people we have heard called the {2_Civ}, now {3_Pct} of its households, settled {4_Where}.",
      "{1_City} had become home to newcomers from far off, a people known to us only as the {2_Civ}, {3_Pct} of the city."
    ];
    const fi = hash(e.seed + ":" + 0) % flEn.length;
    return tr(flKeys[fi], flEn[fi], e.city, o, pct, where);
  }
  const keys = [
    "LOC_EMIG_NARR_FOUNDING_1", "LOC_EMIG_NARR_FOUNDING_2", "LOC_EMIG_NARR_FOUNDING_3"
  ];
  const en = [
    "By now the {2_Civ} households of {1_City} made up {3_Pct} of the city. They kept a district of their own {4_Where}.",
    "A {2_Civ} community had taken root in {1_City}, {3_Pct} of its people and still arriving, settled {4_Where}.",
    "{1_City} had become home to a {2_Civ} minority, {3_Pct} of its households, clustered {4_Where}."
  ];
  const i = hash(e.seed + ":" + 0) % en.length;
  return tr(keys[i], en[i], e.city, o, pct, where);
}

/**
 * The chronicle line for return migration: a diaspora going home as the homeland recovers.
 * @param {{origin:string, city:string, people:string, reason:string, seed:string, framed?:boolean}} e
 *   The event.
 * @returns {string} The line.
 */
export function returnLine(e) {
  const o = adj(e.origin);
  if (e.framed) {
    const flKeys = ["LOC_EMIG_NARR_RETURN_FRAMED_1", "LOC_EMIG_NARR_RETURN_FRAMED_2"];
    const flEn = [
      "{1_People} families of {2_City} set out for a far homeland, a people known to us only as the {3_Civ}, now that it was {4_Reason}.",
      "Word reached {2_City} of a distant country at peace again, one we have heard called the {3_Civ}. {1_People} who traced their blood to it started for home."
    ];
    const fi = hash(e.seed + ":" + 0) % flEn.length;
    return tr(flKeys[fi], flEn[fi], e.people, e.city, o, e.reason);
  }
  const keys = [
    "LOC_EMIG_NARR_RETURN_1", "LOC_EMIG_NARR_RETURN_2", "LOC_EMIG_NARR_RETURN_3"
  ];
  const en = [
    "As word spread that the homeland was {4_Reason}, {1_People} {3_Civ} families of {2_City} started the long road home.",
    "The {3_Civ} quarter of {2_City} thinned that year. {1_People} went back, now that home was {4_Reason}.",
    "{1_People} {3_Civ} households left {2_City} for the country they had fled, drawn back as it grew {4_Reason}."
  ];
  const i = hash(e.seed + ":" + 0) % en.length;
  return tr(keys[i], en[i], e.people, e.city, o, e.reason);
}

/**
 * A short title for a chronicle entry, in the register of a named historical episode (no flourish).
 * @param {{kind:string, civ?:string, event?:string, city?:string, seed:string}} e The event.
 * @returns {string} The title.
 */
export function chronicleTitle(e) {
  const civ = e.civ ? adj(e.civ) : "";
  if (e.kind === "founding") {
    return tr("LOC_EMIG_NARR_TITLE_FOUNDING", "The {1_Civ} Quarter of {2_City}", civ, e.city);
  }
  if (e.kind === "return") return tr("LOC_EMIG_NARR_TITLE_RETURN", "The {1_Civ} Return", civ);
  if (e.kind === "exodus") {
    const keys = [
      "LOC_EMIG_NARR_TITLE_EXODUS_1", "LOC_EMIG_NARR_TITLE_EXODUS_2", "LOC_EMIG_NARR_TITLE_EXODUS_3"
    ];
    const en = ["The {1_Civ} Exodus", "The Flight from {2_City}", "The Emptying of {2_City}"];
    const i = hash(e.seed + ":" + 5) % en.length;
    return tr(keys[i], en[i], civ, e.city);
  }
  return e.event || tr("LOC_EMIG_NARR_TITLE_MIGRATION", "The {1_Civ} Migration", civ);
}

/**
 * A civ name for a dilemma prompt, framed as hearsay when unmet ("a people we have heard called the
 * X"), else the plain adjective.
 * @param {{adj:string, framed:boolean}} nc The narrative-civ descriptor.
 * @returns {string} The name phrase.
 */
function dilemmaName(nc) {
  const a = adj(nc.adj);
  return nc.framed
    ? tr("LOC_EMIG_NARR_DILEMMA_NAME_FRAMED", "a people we have heard called the {1_Civ}", a)
    : tr("LOC_EMIG_NARR_DILEMMA_NAME", "the {1_Civ}", a);
}

/**
 * The prompt (title + body) for a refugee DILEMMA: a short, human-scale framing of a decision the
 * player is being asked to make, in the same restrained register as the Chronicle.
 * @param {{kind:string, instigator:{adj:string, framed:boolean},
 *          origin:{adj:string, framed:boolean}, people:string, seed:string}} e The dilemma.
 * @returns {{title:string, body:string}} The prompt.
 */
export function dilemmaPrompt(e) {
  const origin = dilemmaName(e.origin);
  if (e.kind === "plague") {
    return {
      title: tr("LOC_EMIG_NARR_DILEMMA_PLAGUE_TITLE", "The Sick at the Gates"),
      body: tr(
        "LOC_EMIG_NARR_DILEMMA_PLAGUE_BODY",
        "Plague has emptied the cities of {1_Origin}. The survivors have walked a long way and now "
          + "wait outside your walls, {2_People} of them, frightened and ill. To take them in is to "
          + "share their danger. To turn them away is to leave them to it.",
        origin, e.people
      )
    };
  }
  const by = dilemmaName(e.instigator);
  return {
    title: tr("LOC_EMIG_NARR_DILEMMA_CONQUEST_TITLE", "Refugees at the Border"),
    body: tr(
      "LOC_EMIG_NARR_DILEMMA_CONQUEST_BODY",
      "The armies of {1_By} have overrun {2_Origin}, and its people are streaming toward your "
        + "lands. {3_People} have gathered at the border, carrying what they could save, and they "
        + "ask for shelter.",
      by, origin, cap(e.people)
    )
  };
}

// Test hook.
export const __test = { hash, pick, GENERIC_QUARTERS, warExodus, disasterExodus, dilemmaName };
