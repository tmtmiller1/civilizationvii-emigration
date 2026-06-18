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
 * A civilization's adjective ("Roman"), from LOC_CIVILIZATION_<STEM>_ADJECTIVE, falling
 * back to the civ display name, then a generic label.
 * @param {number} pid Player id.
 * @returns {string} The adjective.
 */
export function civAdjective(pid) {
  const name = civTypeName(pid);
  if (name) {
    const adj = loc("LOC_CIVILIZATION_" + name.replace(/^CIVILIZATION_/, "") + "_ADJECTIVE");
    if (adj) return adj;
  }
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
 * The engine's current war name (getWarData().warName), localized, or null.
 * @returns {string|null} The war name, or null.
 */
function engineWarName() {
  try {
    const wd = typeof Game !== "undefined" ? Game.Diplomacy?.getWarData?.() : null;
    const wn = wd && typeof wd.warName === "string" ? wd.warName : null;
    return wn ? loc(wn) || wn : null;
  } catch (_) {
    return null;
  }
}

/**
 * A name for the war a victim is fleeing: the engine's war name when present, else an
 * adjective-based "{Victim}–{Aggressor} War".
 * @param {number} victimPid Victim player id.
 * @param {Iterable<number>} aggressorPids Aggressor ids.
 * @returns {string} A war name.
 */
export function warRefugeeName(victimPid, aggressorPids) {
  const wn = engineWarName();
  if (wn) return wn;
  const arr = aggressorPids ? [...aggressorPids] : [];
  const a = typeof arr[0] === "number" ? civAdjective(arr[0]) : "the enemy";
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

/** Cause → its localized loss-headline LOC key (per-cause, so each sentence reads naturally). */
/** @type {Record<string,string>} */
const DIGEST_KEY = {
  unhappiness: "LOC_EMIG_DIGEST_UNHAPPINESS",
  prosperity: "LOC_EMIG_DIGEST_PROSPERITY",
  war: "LOC_EMIG_DIGEST_WAR",
  disaster: "LOC_EMIG_DIGEST_DISASTER",
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
    case "attrition": return `${people} were lost from ${city} with nowhere to flee.`;
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
