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
// (emigration-diaspora.js, via emigration-quarters.js) supplies a truthful feature-based phrase as
// `where`; this list is only the fallback. Chosen by seed, never at random.
const GENERIC_QUARTERS = [
  "on the edge of the city", "in the outer streets", "past the last houses",
  "on the far side of town", "where the streets give out"
];

// What people carried, or failed to. Human-scale detail in the Cooper register.
const CARRIED = [
  "what they could carry", "their tools and little else", "what would fit on a cart",
  "their children and their seed grain", "the few things that mattered"
];

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
  const lines = [
    `When the ${e.war} reached ${e.city}, ${e.people} of its people took ${pick(CARRIED, e.seed, 1)} and left.`,
    `${e.people} ${c} refugees abandoned ${e.city} that year, driven out by the ${e.war}.`,
    `The roads out of ${e.city} filled with refugees as the ${e.war} closed in. ${e.people} did not return.`,
    `${e.city} emptied as the ${e.war} came. ${e.people} ${c} families went wherever the fighting was not.`
  ];
  return pick(lines, e.seed, 0);
}

/**
 * The chronicle line for an exodus driven by disaster.
 * @param {{civ:string, disaster:string, city:string, people:string, seed:string}} e The event.
 * @returns {string} The line.
 */
function disasterExodus(e) {
  const c = adj(e.civ);
  const d = bare(e.disaster);
  const lines = [
    `The ${cap(d)} struck ${e.city}. ${e.people} ${c} families gathered ${pick(CARRIED, e.seed, 1)} and went looking for safer country.`,
    `After the ${d}, ${e.people} ${c} refugees left the wreck of ${e.city} behind them.`,
    `${e.people} ${c} families fled ${e.city} in the months after the ${d}, and the fields around it went quiet.`
  ];
  return pick(lines, e.seed, 0);
}

/**
 * The chronicle line for a general (unhappiness/prosperity) departure.
 * @param {{civ:string, city:string, people:string, seed:string}} e The event.
 * @returns {string} The line.
 */
function plainExodus(e) {
  const c = adj(e.civ);
  const lines = [
    `${e.people} ${c} families left ${e.city} that year, looking for a better living elsewhere.`,
    `Word of work and quiet borders drew ${e.people} ${c} households away from ${e.city}.`,
    `${e.city} lost ${e.people} of its people to the long roads, a few families at a time.`
  ];
  return pick(lines, e.seed, 0);
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
  const lines = [
    `Far beyond the lands we knew, ${e.city} emptied. ${e.people} of a people we have heard called the ${o} took to the roads.`,
    `${e.people} refugees fled ${e.city}, a city of a distant people, the ${o}, of whom we had only rumour.`,
    `Word came of ${e.city}, somewhere past the edge of the map: ${e.people} of the ${o}, a people we have only heard tell of, driven from their homes.`
  ];
  return pick(lines, e.seed, 0);
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
 *   host city (emigration-quarters.js); when absent, a generic always-true phrase is used.
 * @returns {string} The line.
 */
export function foundingLine(e) {
  const o = adj(e.origin);
  const pct = Math.round(e.pct) + " percent";
  const where = typeof e.where === "string" && e.where ? e.where : pick(GENERIC_QUARTERS, e.seed, 2);
  if (e.framed) {
    const fl = [
      `A community had taken root in ${e.city} from a distant land, a people we have heard called the ${o}, now ${pct} of its households, settled ${where}.`,
      `${e.city} had become home to newcomers from far off, a people known to us only as the ${o}, ${pct} of the city.`
    ];
    return pick(fl, e.seed, 0);
  }
  const lines = [
    `By now the ${o} households of ${e.city} made up ${pct} of the city. They kept a district of their own ${where}.`,
    `A ${o} community had taken root in ${e.city}, ${pct} of its people and still arriving, settled ${where}.`,
    `${e.city} had become home to a ${o} minority, ${pct} of its households, clustered ${where}.`
  ];
  return pick(lines, e.seed, 0);
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
    const fl = [
      `${e.people} families of ${e.city} set out for a far homeland, a people known to us only as the ${o}, now that it was ${e.reason}.`,
      `Word reached ${e.city} of a distant country at peace again, one we have heard called the ${o}. ${e.people} who traced their blood to it started for home.`
    ];
    return pick(fl, e.seed, 0);
  }
  const lines = [
    `As word spread that the homeland was ${e.reason}, ${e.people} ${o} families of ${e.city} started the long road home.`,
    `The ${o} quarter of ${e.city} thinned that year. ${e.people} went back, now that home was ${e.reason}.`,
    `${e.people} ${o} households left ${e.city} for the country they had fled, drawn back as it grew ${e.reason}.`
  ];
  return pick(lines, e.seed, 0);
}

/**
 * A short title for a chronicle entry, in the register of a named historical episode (no flourish).
 * @param {{kind:string, civ?:string, event?:string, city?:string, seed:string}} e The event.
 * @returns {string} The title.
 */
export function chronicleTitle(e) {
  const civ = e.civ ? adj(e.civ) : "";
  if (e.kind === "founding") return `The ${civ} Quarter of ${e.city}`;
  if (e.kind === "return") return `The ${civ} Return`;
  if (e.kind === "exodus") {
    const named = [`The ${civ} Exodus`, `The Flight from ${e.city}`, `The Emptying of ${e.city}`];
    return pick(named, e.seed, 5);
  }
  return e.event || `The ${civ} Migration`;
}

/**
 * A civ name for a dilemma prompt, framed as hearsay when unmet ("a people we have heard called the
 * X"), else the plain adjective.
 * @param {{adj:string, framed:boolean}} nc The narrative-civ descriptor.
 * @returns {string} The name phrase.
 */
function dilemmaName(nc) {
  const a = adj(nc.adj);
  return nc.framed ? "a people we have heard called the " + a : "the " + a;
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
      title: "The Sick at the Gates",
      body: `Plague has emptied the cities of ${origin}. The survivors have walked a long way and now `
        + `wait outside your walls, ${e.people} of them, frightened and ill. To take them in is to `
        + `share their danger. To turn them away is to leave them to it.`
    };
  }
  const by = dilemmaName(e.instigator);
  return {
    title: "Refugees at the Border",
    body: `The armies of ${by} have overrun ${origin}, and its people are streaming toward your `
      + `lands. ${cap(e.people)} have gathered at the border, carrying what they could save, and they `
      + `ask for shelter.`
  };
}

// Test hook.
export const __test = { hash, pick, GENERIC_QUARTERS, warExodus, disasterExodus, dilemmaName };
