// emigration-naming.js
//
// Localized, in-world names for refugee events - the war-naming model from the Demographics
// mod (chart-wars-naming.js): civ adjectives, the game's own disaster names, and a
// cause-dispatched headline. Also the Phase-1 explanatory-toast strings (per-cause loss
// headline, action hint, permanence cue, cost note, and the composed local-player digest).
// Pure logic; reads GameInfo/Locale/Players defensively and degrades to a plain English
// fallback when a localized string can't be composed.

import { causeHint, causePermanence } from "/emigration/ui/emigration-causes.js";

/**
 * Compose a localized string from a LOC key + args, or null if Locale is unavailable
 * (or the result is just the key echoed back).
 * @param {string} key A LOC key.
 * @param {...*} args Substitution args.
 * @returns {string|null} The composed string, or null.
 */
function loc(key, ...args) {
  try {
    if (typeof Locale !== "undefined" && typeof Locale.compose === "function") {
      const v = Locale.compose(key, ...args);
      if (typeof v === "string" && v.length && !v.startsWith("LOC_")) return v;
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * A player's civilization type string, or null.
 * @param {number} pid Player id.
 * @returns {string|null} e.g. "CIVILIZATION_ROME".
 */
function civTypeName(pid) {
  try {
    const ct = Players?.get?.(pid)?.civilizationType;
    const name = GameInfo?.Civilizations?.lookup?.(ct)?.CivilizationType;
    return typeof name === "string" ? name : null;
  } catch (_) {
    return null;
  }
}

/**
 * A composed fallback adjective from the civ display name, or a generic label.
 * @param {number} pid Player id.
 * @returns {string} The fallback.
 */
function civDisplayAdjective(pid) {
  try {
    const dn = Players?.get?.(pid)?.civilizationName;
    const composed = dn ? loc(dn) : null;
    if (composed) return composed;
  } catch (_) {
    /* ignore */
  }
  return "a people";
}

/**
 * Whether a player is a minor (city-state / Independent Power) rather than a major civ.
 * @param {number} pid Player id.
 * @returns {boolean} True for a minor player.
 */
function isMinorPlayer(pid) {
  try {
    const p = Players?.get?.(pid);
    return p ? (p.isMajor === false || p.isMinor === true) : false;
  } catch (_) {
    return false;
  }
}

/**
 * The specific name of a city-state / Independent Power ("Carthage", "Mississippian"), via
 * Game.IndependentPowers.independentName, or null when unavailable. Minor players don't carry a
 * useful civilization adjective, so this is how they get named.
 * @param {number} pid Player id.
 * @returns {string|null} The independent's name, or null.
 */
function independentName(pid) {
  try {
    const ip = typeof Game !== "undefined" ? Game.IndependentPowers : null;
    const nm = ip && typeof ip.independentName === "function" ? ip.independentName(pid) : null;
    if (typeof nm === "string" && nm.length) return loc(nm) || nm;
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * A civilization's adjective ("Roman"), from LOC_CIVILIZATION_<STEM>_ADJECTIVE, falling
 * back to the civ display name, then a generic label. For city-states / Independent Powers it uses
 * the power's specific name instead, since they have no meaningful civ adjective.
 * @param {number} pid Player id.
 * @returns {string} The adjective.
 */
export function civAdjective(pid) {
  // City-states / Independent Powers: name them specifically (their civ type is generic otherwise).
  if (isMinorPlayer(pid)) {
    const indep = independentName(pid);
    if (indep) return indep;
  }
  const name = civTypeName(pid);
  if (name) {
    const adj = loc("LOC_CIVILIZATION_" + name.replace(/^CIVILIZATION_/, "") + "_ADJECTIVE");
    if (adj) return adj;
  }
  const indep = independentName(pid);
  if (indep) return indep;
  return civDisplayAdjective(pid);
}

/**
 * The game's display name for a RandomEvent type ("Thera", "Catastrophic Eruption", …),
 * or a generic "disaster" when unreadable.
 * @param {*} eventType A RandomEventType (hash or string).
 * @returns {string} The disaster name.
 */
export function disasterName(eventType) {
  try {
    const nameKey = GameInfo?.RandomEvents?.lookup?.(eventType)?.Name;
    const composed = nameKey ? loc(nameKey) : null;
    if (composed) return composed;
  } catch (_) {
    /* ignore */
  }
  return "a disaster";
}

/**
 * Title-case a raw TYPE token ("ANTIQUITY_CRISIS_PLAGUE" → "Antiquity Plague") as a last-resort
 * display name when no LOC string resolves.
 * @param {string} type A raw type string.
 * @returns {string} A readable fallback.
 */
function prettifyType(type) {
  return String(type || "")
    .split("_")
    .filter((w) => w && w !== "CRISIS" && w !== "RANDOM" && w !== "EVENT")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * The game's display name for an age-crisis type (from the AgeCrisisEventTypes table), e.g.
 * "The Great Plague". Falls back to a title-cased "<Age> <Kind> Crisis".
 * @param {string} type An AgeCrisisEventType.
 * @returns {string} The crisis name.
 */
export function crisisName(type) {
  try {
    const row = GameInfo?.AgeCrisisEventTypes?.lookup?.(type);
    const composed = row && row.Name ? loc(row.Name) : null;
    if (composed) return composed;
  } catch (_) {
    /* ignore */
  }
  const pretty = prettifyType(type);
  return pretty ? pretty + " Crisis" : "Crisis";
}

/**
 * The display name for an event KEY (see emigration-event-attribution): a specific war / disaster /
 * crisis / famine. Null for the empty key (no specific event).
 * @param {string} eventKey The event key.
 * @returns {string|null} The display name, or null.
 */
export function eventDisplayName(eventKey) {
  if (!eventKey) return null;
  if (eventKey === "famine") return loc("LOC_EMIG_EVENT_FAMINE") || "Famine";
  if (eventKey.indexOf("crisis:") === 0) return crisisName(eventKey.slice(7));
  if (eventKey.indexOf("disaster:") === 0) return disasterName(eventKey.slice(9));
  if (eventKey.indexOf("war:") === 0) {
    const parts = eventKey.split(":");
    const a = Number(parts[1]);
    const b = Number(parts[2]);
    return warRefugeeName(a, [b]);
  }
  return prettifyType(eventKey) || null;
}

/**
 * The local (viewing) player id, or 0.
 * @returns {number} The local player id.
 */
function localPid() {
  try {
    return typeof GameContext !== "undefined" && typeof GameContext.localPlayerID === "number"
      ? GameContext.localPlayerID : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * The engine uniqueID of the active declare-war event between two players, or null. Mirrors the base
 * diplo-ribbon (model-diplo-ribbon.js): scan getJointEvents for the DIPLOMACY_ACTION_DECLARE_WAR event.
 * @param {number} a One player id. @param {number} b The other player id.
 * @returns {*} The war's uniqueID, or null.
 */
function warIdBetween(a, b) {
  try {
    const events = (Game && Game.Diplomacy && Game.Diplomacy.getJointEvents)
      ? Game.Diplomacy.getJointEvents(a, b, false) : null;
    for (const e of events || []) {
      if (e && e.actionTypeName === "DIPLOMACY_ACTION_DECLARE_WAR" && e.uniqueID != null) return e.uniqueID;
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * The engine's NAME for the war between a victim and its aggressor, the base game's
 * `getWarData(uniqueID, localPlayerID).warName`, localized. Null when there's no such war or the API
 * is absent. (The old code called `getWarData()` with NO arguments, which always returned null: the
 * engine requires the war's uniqueID + a viewing player. That's why the war name never resolved.)
 * @param {number} victim Victim player id.
 * @param {number} aggressor Aggressor player id.
 * @returns {string|null} The localized war name, or null.
 */
function engineWarName(victim, aggressor) {
  try {
    const id = warIdBetween(victim, aggressor);
    if (id == null) return null;
    const wd = Game && Game.Diplomacy && Game.Diplomacy.getWarData
      ? Game.Diplomacy.getWarData(id, localPid()) : null;
    const wn = wd && typeof wd.warName === "string" ? wd.warName : null;
    return wn ? loc(wn) || wn : null;
  } catch (_) {
    return null;
  }
}

/**
 * A name for the war a victim is fleeing: the engine's actual war name when resolvable, else an
 * adjective-based "{Victim}–{Aggressor} War".
 * @param {number} victimPid Victim player id.
 * @param {Iterable<number>} aggressorPids Aggressor ids.
 * @returns {string} A war name.
 */
export function warRefugeeName(victimPid, aggressorPids) {
  const arr = aggressorPids ? [...aggressorPids] : [];
  const aggressor = typeof arr[0] === "number" ? arr[0] : null;
  // Prefer the engine's own war name for major-vs-major wars. For a war involving a city-state /
  // Independent Power the engine name is generic ("the Enemy"), so build an explicit
  // "{Victim}–{Aggressor} War" that names the city-state directly via civAdjective.
  const minorInvolved = isMinorPlayer(victimPid) || (aggressor != null && isMinorPlayer(aggressor));
  if (!minorInvolved && aggressor != null) {
    const wn = engineWarName(victimPid, aggressor);
    if (wn) return wn;
  }
  const a = aggressor != null ? civAdjective(aggressor) : "the enemy";
  return civAdjective(victimPid) + "–" + a + " War";
}

/**
 * A localized headline from a LOC key + two args, or a plain English `fallback`.
 * @param {string} key LOC key.
 * @param {string} a First arg.
 * @param {string} b Second arg.
 * @param {string} fallback Plain English fallback.
 * @returns {string} The headline.
 */
function pick(key, a, b, fallback) {
  return loc(key, a, b) || fallback;
}

/**
 * The flavored headline for a refugee event, dispatched by cause. Localized via
 * LOC_EMIG_NEWS_* when available; otherwise a plain English fallback.
 * @param {{cause:string, people:string, cityName?:string, eventName?:string,
 *          warName?:string, civ?:string}} ev Event.
 * @returns {string} The headline.
 */
export function refugeeHeadline(ev) {
  const people = ev.people || "people";
  const city = ev.cityName || "a settlement";
  if (ev.cause === "crisis") {
    const civ = ev.civ || "A nation";
    return pick("LOC_EMIG_NEWS_CRISIS", civ, people, "Refugee crisis: " + civ + " ; " + people + " displaced.");
  }
  const body = refugeeBody(ev, people, city);
  // The event-named templates above name the war/disaster/city but NOT the affected
  // civ. When the caller supplies a civ (already spoiler-guarded — an unmet civ is
  // passed as "an unmet civilization"), lead with it so world news says WHO was hit.
  return ev.civ ? whoLed(ev.civ, body) : body;
}

/**
 * The event-named refugee headline body (no civ): names the disaster / war / sacked
 * city / settlement. Split out so {@link refugeeHeadline} can optionally prefix WHO.
 * @param {*} ev The world-news event descriptor.
 * @param {string} people The formatted people count.
 * @param {string} city The settlement name (fallback "a settlement").
 * @returns {string} The headline body.
 */
function refugeeBody(ev, people, city) {
  if (ev.cause === "disaster") {
    const n = ev.eventName || "A disaster";
    return pick("LOC_EMIG_NEWS_DISASTER", n, people, n + " displaces " + people + ".");
  }
  if (ev.cause === "war") {
    const w = ev.warName || "war";
    return pick("LOC_EMIG_NEWS_WAR", w, people, people + " flee the " + w + ".");
  }
  if (ev.cause === "conquest") {
    return pick("LOC_EMIG_NEWS_CONQUEST", city, people, "The sack of " + city + " scatters " + people + ".");
  }
  return pick("LOC_EMIG_NEWS_GENERIC", city, people, people + " leave " + city + ".");
}

/**
 * Prefix a headline body with the (already spoiler-guarded) affected civ, capitalized
 * for the leading position. e.g. "Carthaginians: 1,200 flee the war."
 * @param {string} civ The affected-civ label (real adjective, or the unmet mask).
 * @param {string} body The event headline body.
 * @returns {string} The civ-led headline.
 */
function whoLed(civ, body) {
  const lead = civ ? civ.charAt(0).toUpperCase() + civ.slice(1) : civ;
  return loc("LOC_EMIG_NEWS_WHO", lead, body) || (lead + ": " + body);
}

/** Cause → its localized loss-headline LOC key (per-cause, so each sentence reads naturally). */
/** @type {Record<string,string>} */
const DIGEST_KEY = {
  unhappiness: "LOC_EMIG_DIGEST_UNHAPPINESS",
  prosperity: "LOC_EMIG_DIGEST_PROSPERITY",
  war: "LOC_EMIG_DIGEST_WAR",
  disaster: "LOC_EMIG_DIGEST_DISASTER",
  conquest: "LOC_EMIG_DIGEST_CONQUEST",
  attrition: "LOC_EMIG_DIGEST_ATTRITION"
};

/** Permanence class → English fallback cue (used when the LOC string can't be composed). */
const PERMANENCE_FALLBACK = {
  temporary: "The pressure is temporary.",
  persistent: "It continues until you address the cause.",
  permanent: "Those people are gone for good."
};

/**
 * The localized "what can I do" action hint for a cause, falling back to the shared English hint.
 * @param {string} [cause] The migration cause.
 * @returns {string} The hint.
 */
export function actionHint(cause) {
  const part = typeof cause === "string" ? cause.toUpperCase() : "";
  return (part && loc("LOC_EMIG_HINT_" + part)) || causeHint(cause);
}

/**
 * The localized "temporary / persistent / permanent" cue for a cause.
 * @param {string} [cause] The migration cause.
 * @returns {string} The permanence cue.
 */
export function permanenceCue(cause) {
  const p = causePermanence(cause);
  return loc("LOC_EMIG_PERMANENCE_" + p.toUpperCase()) || PERMANENCE_FALLBACK[p] || "";
}

/**
 * The English fallback loss-headline for a cause.
 * @param {string|undefined} cause The migration cause.
 * @param {string} people People-count phrase.
 * @param {string} city Source city name.
 * @returns {string} The headline.
 */
function digestFallback(cause, people, city) {
  switch (cause) {
    case "unhappiness": return `${people} left ${city}, unhappy at home.`;
    case "prosperity": return `${people} left ${city} for more prosperous neighbors.`;
    case "war": return `${people} fled the fighting around ${city}.`;
    case "disaster": return `${people} fled ${city} after disaster struck.`;
    case "attrition": return `${city} suffered ${people} casualties.`;
    default: return `${people} left ${city}.`;
  }
}

/**
 * A localized loss headline naming the cause, the people, and the city.
 * @param {string|undefined} cause The migration cause.
 * @param {string} people People-count phrase (e.g. "12 thousand people").
 * @param {string} city Source city name.
 * @returns {string} The headline.
 */
export function lossHeadline(cause, people, city) {
  const key = cause ? DIGEST_KEY[cause] : null;
  if (key) {
    const v = loc(key, people, city);
    if (v) return v;
  }
  return digestFallback(cause, people, city);
}

/**
 * The "the destination pays to assimilate them" cost note.
 * @param {string} destName Destination settlement name.
 * @param {number} gold Approximate per-turn gold cost.
 * @returns {string} The note.
 */
export function costNote(destName, gold) {
  return (
    loc("LOC_EMIG_COST_NOTE", destName, String(gold)) ||
    `${destName} pays about ${gold} gold/turn to assimilate them.`
  );
}

/**
 * Compose the local player's per-pass migration digest: a cause-named loss headline, the action
 * hint, the permanence cue, and , for a cross-civ loss with a material cost , the destination's
 * assimilation cost note. Pure; the caller resolves the inputs.
 * @param {{cause?:string, people:string, city:string, crossCiv?:boolean,
 *          destName?:string, destGold?:number}} o The resolved digest inputs.
 * @returns {string} The composed message.
 */
export function localDigestMessage(o) {
  let msg = lossHeadline(o.cause, o.people, o.city);
  const hint = actionHint(o.cause);
  if (hint) msg += " " + hint;
  const perm = permanenceCue(o.cause);
  if (perm) msg += " " + perm;
  if (o.crossCiv && o.destName && (o.destGold || 0) >= 1) {
    msg += " " + costNote(o.destName, Math.round(o.destGold || 0));
  }
  return msg;
}
