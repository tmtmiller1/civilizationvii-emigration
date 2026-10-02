// emigration-naming.js
//
// Localized, in-world names for refugee events (civ adjectives, the game's own disaster names, a
// cause-dispatched headline) and the explanatory-toast strings (loss headline, action hint, cost
// note, composed digests). Pure logic; degrades to a plain English fallback when Locale can't compose.

import { causeHint, causeHintMsg, causePermanence, stanceTipMsg } from "/emigration/ui/emigration-causes.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { warOpponents } from "/emigration/ui/emigration-war.js";
import { quarterBonus } from "/emigration/ui/emigration-quarter-bonuses.js";
import { msg, msgKey, msgCap, msgJoin, msgJoinWith, msgText } from "/emigration/ui/emigration-loc.js";

/** @typedef {import("/emigration/ui/emigration-loc.js").MsgNode} MsgNode */

/** @returns {MsgNode} The spoiler mask for a civ the visibility policy hides (unmet), as a message node. */
export function unmetMsg() {
  return msg("LOC_EMIG_FALLBACK_UNMET_CIV", "an unmet civilization");
}

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
 * A player's civilization type string, or null. Exported so the Cultural Quarter system can key its
 * per-civ bonus registry (emigration-quarter-bonuses.js) on the same identity used for naming.
 * @param {number} pid Player id.
 * @returns {string|null} e.g. "CIVILIZATION_ROME".
 */
export function civType(pid) {
  try {
    const ct = Players?.get?.(pid)?.civilizationType;
    const name = GameInfo?.Civilizations?.lookup?.(ct)?.CivilizationType;
    return typeof name === "string" ? name : null;
  } catch (_) {
    return null;
  }
}

/** Back-compat internal alias. @param {number} pid @returns {string|null} */
function civTypeName(pid) {
  return civType(pid);
}

/**
 * A composed fallback adjective from the civ display name, or a generic label.
 * @param {number} pid Player id.
 * @returns {MsgNode} The fallback.
 */
function civDisplayAdjective(pid) {
  try {
    const dn = Players?.get?.(pid)?.civilizationName;
    const composed = dn ? loc(dn) : null;
    if (composed) return msgKey(dn, composed);
  } catch (_) {
    /* ignore */
  }
  return msg("LOC_EMIG_FALLBACK_A_PEOPLE", "a people");
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
 * Whether the engine knows a player id. Never hand the engine an id it does not know:
 * Game.IndependentPowers.independentName on an unknown id segfaults the game.
 * @param {number} pid Player id. @returns {boolean} True when Players.get returns a player.
 */
function knownPlayer(pid) {
  try {
    return !!Players?.get?.(pid);
  } catch (_) {
    return false;
  }
}

/**
 * The specific name of a city-state / Independent Power ("Carthage", "Mississippian"), via
 * Game.IndependentPowers.independentName, or null when unavailable. Minor players don't carry a
 * useful civilization adjective, so this is how they get named.
 * @param {number} pid Player id.
 * @returns {MsgNode|null} The independent's name, or null.
 */
function independentName(pid) {
  if (!knownPlayer(pid)) return null;
  try {
    const ip = typeof Game !== "undefined" ? Game.IndependentPowers : null;
    const nm = ip && typeof ip.independentName === "function" ? ip.independentName(pid) : null;
    if (typeof nm === "string" && nm.length) return msgKey(nm, loc(nm) || nm);
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
  return msgText(civAdjectiveMsg(pid));
}

/**
 * {@link civAdjective} as a message node (the civ's own LOC key), for lines composed again at display.
 * @param {number} pid Player id. @returns {MsgNode} The adjective.
 */
export function civAdjectiveMsg(pid) {
  return civWordMsg(pid, "_ADJECTIVE");
}

/**
 * A civ's adjective or name node: the LOC_CIVILIZATION_<STEM><suffix> key, with city-states / Independent
 * Powers named specifically (their civ type is generic otherwise), then the display-name fallback.
 * @param {number} pid Player id. @param {string} suffix "_ADJECTIVE" or "_NAME".
 * @returns {MsgNode} The node.
 */
function civWordMsg(pid, suffix) {
  if (isMinorPlayer(pid)) {
    const indep = independentName(pid);
    if (indep) return indep;
  }
  const name = civTypeName(pid);
  if (name) {
    const key = "LOC_CIVILIZATION_" + name.replace(/^CIVILIZATION_/, "") + suffix;
    const word = loc(key);
    if (word) return msgKey(key, word);
  }
  return independentName(pid) || civDisplayAdjective(pid);
}

/**
 * A civilization's NAME as a proper noun ("Rome"), from LOC_CIVILIZATION_<STEM>_NAME, for sentences
 * that read "…by <civ>". City-states / Independent Powers use their specific name; falls back to the
 * civ display name, then the adjective.
 * @param {number} pid Player id.
 * @returns {string} The civ name.
 */
export function civName(pid) {
  return msgText(civNameMsg(pid));
}

/** {@link civName} as a message node. @param {number} pid Player id. @returns {MsgNode} The name. */
export function civNameMsg(pid) {
  return civWordMsg(pid, "_NAME");
}

/**
 * A civ descriptor for NARRATIVE surfaces (the Chronicle, refugee events), where an unmet civ is
 * named but framed as hearsay. Only story surfaces relax the analytics spoiler mask this way; the
 * dashboard, lens, and notifications keep the strict "an unmet civilization" mask.
 * @param {number} pid Player id.
 * @returns {{adj:string, adjMsg:MsgNode, framed:boolean}} The real adjective (also as a message node), and
 *   whether to frame it as rumor.
 */
export function narrativeCiv(pid) {
  const adjMsg = civAdjectiveMsg(pid);
  return { adj: msgText(adjMsg), adjMsg, framed: civHidden(pid) };
}

/**
 * The name of a Cultural Quarter held by a civ's diaspora ("the Roman Quarter"). Prefers the per-civ
 * registry demonym ("Punic Quarter"), then the origin's game adjective, then a generic "foreign
 * quarter". Narrative surface, so it does not apply the analytics spoiler mask.
 * @param {number} originCiv The origin civ id.
 * @returns {string} The quarter name, e.g. "Roman Quarter".
 */
export function quarterName(originCiv) {
  return msgText(quarterNameMsg(originCiv));
}

/** {@link quarterName} as a message node. @param {number} originCiv @returns {MsgNode} The name. */
export function quarterNameMsg(originCiv) {
  const demonym = quarterBonus(civType(originCiv)).demonym;
  const adj = demonym || civAdjectiveMsg(originCiv);
  if (adj) return msg("LOC_EMIG_QUARTER_ENCLAVE", "{1_Adj} Enclave", adj);
  return msg("LOC_EMIG_QUARTER_ENCLAVE_FOREIGN", "foreign enclave");
}

/**
 * The game's display name for a RandomEvent type ("Thera", "Catastrophic Eruption", …),
 * or a generic "disaster" when unreadable.
 * @param {*} eventType A RandomEventType (hash or string).
 * @returns {string} The disaster name.
 */
export function disasterName(eventType) {
  return msgText(disasterNameMsg(eventType));
}

/** {@link disasterName} as a message node. @param {*} eventType @returns {MsgNode} The name. */
export function disasterNameMsg(eventType) {
  try {
    const nameKey = GameInfo?.RandomEvents?.lookup?.(eventType)?.Name;
    const composed = nameKey ? loc(nameKey) : null;
    if (composed) return msgKey(nameKey, composed);
  } catch (_) {
    /* ignore */
  }
  return msg("LOC_EMIG_FALLBACK_A_DISASTER", "a disaster");
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
  return msgText(crisisNameMsg(type));
}

/** {@link crisisName} as a message node. @param {string} type @returns {MsgNode} The name. */
function crisisNameMsg(type) {
  try {
    const row = GameInfo?.AgeCrisisEventTypes?.lookup?.(type);
    const composed = row && row.Name ? loc(row.Name) : null;
    if (composed) return msgKey(row.Name, composed);
  } catch (_) {
    /* ignore */
  }
  const pretty = prettifyType(type);
  return pretty
    ? msg("LOC_EMIG_EVENT_CRISIS_SUFFIX", "{1_Name} Crisis", pretty)
    : msg("LOC_EMIG_EVENT_CRISIS", "Crisis");
}

/**
 * The display name for an event KEY (see emigration-event-attribution): a specific war / disaster /
 * crisis / famine. Null for the empty key (no specific event).
 * @param {string} eventKey
 * @returns {string|null} The display name, or null.
 */
export function eventDisplayName(eventKey) {
  const node = eventDisplayNameMsg(eventKey);
  return node == null ? null : msgText(node);
}

/**
 * {@link eventDisplayName} as a message node, or null for the empty key.
 * @param {string} eventKey @returns {MsgNode|null} The name.
 */
export function eventDisplayNameMsg(eventKey) {
  if (!eventKey) return null;
  if (eventKey === "famine") return msg("LOC_EMIG_EVENT_FAMINE", "Famine");
  if (eventKey.indexOf("crisis:") === 0) return crisisNameMsg(eventKey.slice(7));
  if (eventKey.indexOf("disaster:") === 0) return disasterNameMsg(eventKey.slice(9));
  if (eventKey.indexOf("war:") === 0) {
    const parts = eventKey.split(":");
    return warRefugeeNameMsg(Number(parts[1]), [Number(parts[2])]);
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
 * is absent. The engine requires the war's uniqueID + a viewing player.
 * @param {number} victim Victim player id.
 * @param {number} aggressor Aggressor player id.
 * @returns {MsgNode|null} The localized war name, or null.
 */
function engineWarName(victim, aggressor) {
  try {
    const id = warIdBetween(victim, aggressor);
    if (id == null) return null;
    const wd = Game && Game.Diplomacy && Game.Diplomacy.getWarData
      ? Game.Diplomacy.getWarData(id, localPid()) : null;
    const wn = wd && typeof wd.warName === "string" ? wd.warName : null;
    return wn ? msgKey(wn, loc(wn) || wn) : null;
  } catch (_) {
    return null;
  }
}

/**
 * A belligerent's display name for a war label, SPOILER-MASKED: a civ the visibility policy hides
 * (unmet) is never named, it reads as "an unmet civilization" instead of a real adjective.
 * @param {number} pid Player id.
 * @returns {MsgNode|null} The masked name, or null when the id is unusable.
 */
function belligerentName(pid) {
  if (typeof pid !== "number") return null;
  return civHidden(pid) ? unmetMsg() : civAdjectiveMsg(pid);
}

/**
 * The other belligerent to name for a war the `victim` is fleeing: the supplied aggressor list, else
 * the engine's live at-war set ({@link warOpponents}). Among the candidates a MET opponent wins, so
 * the war reads with both sides named.
 * @param {number} victimPid Victim player id.
 * @param {number[]} arr Explicitly supplied aggressor ids (may be empty).
 * @returns {number|null} The chosen aggressor id, or null when none resolves.
 */
function pickAggressor(victimPid, arr) {
  const candidates = arr.length ? arr : [...warOpponents(victimPid)];
  let met = null;
  let any = null;
  for (const o of candidates) {
    if (typeof o !== "number") continue;
    if (any == null) any = o;
    if (!civHidden(o)) {
      met = o;
      break;
    }
  }
  return met != null ? met : any;
}

/**
 * A belligerent's masked name and whether the mask applies.
 * @param {number|null} pid Player id, or null when there is none.
 * @returns {{name:MsgNode|null, hidden:boolean}} The name (null when the id is unusable) and mask flag.
 */
function belligerent(pid) {
  return { name: pid == null ? null : belligerentName(pid), hidden: typeof pid === "number" && civHidden(pid) };
}

/**
 * The spoiler-masked war name when EITHER side is hidden (unmet): "{Known} vs. an unmet
 * civilization", naming the side we're allowed to show. Null when neither side is masked (a normal
 * name applies) or both are masked (nothing safe to name).
 * @param {{name:MsgNode|null, hidden:boolean}} victim Victim's (already-masked) name, and whether masked.
 * @param {{name:MsgNode|null, hidden:boolean}} aggressor Aggressor's name (null when none) and mask flag.
 * @returns {MsgNode|null} The masked name, or null.
 */
function maskedWarName(victim, aggressor) {
  if (!aggressor.hidden && !victim.hidden) return null;
  const known = !victim.hidden ? victim.name : !aggressor.hidden ? aggressor.name : null;
  if (!known) return null;
  return msg("LOC_EMIG_WAR_VS_UNMET", "{1_Civ} vs. an unmet civilization", known);
}

/**
 * Whether both belligerents are MET majors, the only case the engine's own war name is trusted (it
 * reads "the Enemy" for a minor / unmet side, which would defeat the spoiler mask).
 * @param {number} victimPid Victim id. @param {number|null} aggressor Aggressor id.
 * @returns {boolean} True when both are met majors.
 */
function bothMetMajors(victimPid, aggressor) {
  if (aggressor == null) return false;
  if (isMinorPlayer(victimPid) || isMinorPlayer(aggressor)) return false;
  return !civHidden(victimPid) && !civHidden(aggressor);
}

/**
 * A name for the war a victim is fleeing: both met majors get the engine's own war name, else
 * "{Victim}–{Aggressor} War"; an unmet opponent reads "{Known} vs. an unmet civilization" (spoiler
 * mask); no opponent at all falls back to "{Victim} War".
 * @param {number} victimPid Victim player id.
 * @param {Iterable<number>} aggressorPids Aggressor ids (may be empty → engine fallback).
 * @returns {string} A war name.
 */
export function warRefugeeName(victimPid, aggressorPids) {
  return msgText(warRefugeeNameMsg(victimPid, aggressorPids));
}

/**
 * {@link warRefugeeName} as a message node.
 * @param {number} victimPid Victim player id. @param {Iterable<number>} aggressorPids Aggressor ids.
 * @returns {MsgNode} The war name.
 */
export function warRefugeeNameMsg(victimPid, aggressorPids) {
  const arr = aggressorPids ? [...aggressorPids].filter((x) => typeof x === "number") : [];
  const aggressor = pickAggressor(victimPid, arr);
  const victim = belligerent(victimPid);
  const other = belligerent(aggressor);
  const victimName = victim.name;
  const aggressorName = other.name;
  const masked = maskedWarName(victim, other);
  if (masked) return masked;
  if (aggressor != null && bothMetMajors(victimPid, aggressor)) {
    const wn = engineWarName(victimPid, aggressor);
    if (wn) return wn;
  }
  if (aggressorName && victimName) {
    return msg("LOC_EMIG_WARNAME_TWO", "{1_Victim}–{2_Aggressor} War", victimName, aggressorName);
  }
  // opponent unresolved (peace already declared, etc.)
  return msg("LOC_EMIG_WARNAME_ONE", "{1_Victim} War", victimName || "the");
}

/**
 * The flavored headline for a refugee event, dispatched by cause. Localized via
 * LOC_EMIG_NEWS_* when available; otherwise a plain English fallback.
 * @param {{cause:string, people:MsgNode, cityName?:MsgNode, eventName?:MsgNode,
 *          warName?:MsgNode, civ?:MsgNode}} ev Event (each text field a string or message node).
 * @returns {string} The headline.
 */
export function refugeeHeadline(ev) {
  return msgText(refugeeHeadlineMsg(ev));
}

/**
 * {@link refugeeHeadline} as a message node.
 * @param {{cause:string, people:MsgNode, cityName?:MsgNode, eventName?:MsgNode,
 *          warName?:MsgNode, civ?:MsgNode}} ev Event.
 * @returns {MsgNode} The headline.
 */
export function refugeeHeadlineMsg(ev) {
  const people = ev.people || msg("LOC_EMIG_FALLBACK_PEOPLE", "people");
  const city = ev.cityName || msg("LOC_EMIG_FALLBACK_A_SETTLEMENT", "a settlement");
  if (ev.cause === "crisis") {
    const civ = ev.civ || msg("LOC_EMIG_FALLBACK_A_NATION", "A nation");
    return msg("LOC_EMIG_NEWS_CRISIS", "Refugee crisis: {1_Civ} ; {2_People} displaced.", civ, people);
  }
  const body = refugeeBody(ev, people, city);
  // The event-named templates above name the war/disaster/city but NOT the affected
  // civ. When the caller supplies a civ (already spoiler-guarded, an unmet civ is
  // passed as "an unmet civilization"), lead with it so world news says WHO was hit,
  // capitalized for the leading position ("Carthaginians: 1,200 flee the war.").
  return ev.civ ? msg("LOC_EMIG_NEWS_WHO", "{1_Civ}: {2_Headline}", msgCap(ev.civ), body) : body;
}

/**
 * The event-named refugee headline body (no civ): names the disaster / war / sacked
 * city / settlement. Split out so {@link refugeeHeadlineMsg} can optionally prefix WHO.
 * @param {*} ev The world-news event descriptor.
 * @param {MsgNode} people The formatted people count.
 * @param {MsgNode} city The settlement name (fallback "a settlement").
 * @returns {MsgNode} The headline body.
 */
function refugeeBody(ev, people, city) {
  if (ev.cause === "disaster") {
    const n = ev.eventName || msg("LOC_EMIG_FALLBACK_A_DISASTER_START", "A disaster");
    return msg("LOC_EMIG_NEWS_DISASTER", "{1_EventName} displaces {2_People}.", n, people);
  }
  if (ev.cause === "war") {
    const w = ev.warName || msg("LOC_EMIG_FALLBACK_WAR", "war");
    return msg("LOC_EMIG_NEWS_WAR", "{2_People} flee the {1_WarName}.", w, people);
  }
  if (ev.cause === "conquest") {
    return msg("LOC_EMIG_NEWS_CONQUEST", "The sack of {1_City} scatters {2_People}.", city, people);
  }
  return msg("LOC_EMIG_NEWS_GENERIC", "{2_People} leave {1_City}.", city, people);
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

/** Cause → its English loss-headline fallback template ({1_People}, {2_City}). */
/** @type {Record<string,string>} */
const DIGEST_FALLBACK = {
  unhappiness: "{1_People} left {2_City}, unhappy at home.",
  prosperity: "{1_People} left {2_City} for more prosperous neighbors.",
  war: "{1_People} fled the fighting around {2_City}.",
  disaster: "{1_People} fled {2_City} after disaster struck.",
  attrition: "{2_City} suffered {1_People} casualties."
};

/** Permanence class → English fallback cue (used when the LOC string can't be composed). */
const PERMANENCE_FALLBACK = {
  temporary: "The pressure is temporary.",
  persistent: "Migrants will continue to leave until you address the cause.",
  permanent: "Those people are gone for good."
};

/**
 * The localized "what can I do" action hint for a cause, falling back to the shared English hint.
 * `city` fills the `{1_City}` placeholder the prosperity hint carries (it names the settlement being
 * out-prospered); hints without a placeholder ignore it, so passing it is always safe.
 * @param {string} [cause] The migration cause.
 * @param {string} [city] The settlement name, for hints that name it.
 * @returns {string} The hint.
 */
export function actionHint(cause, city) {
  // causeHint owns the key choice (the city-named hint, or its city-less variant when no name is given)
  // and the English fallback, so every surface resolves a hint the same way.
  return causeHint(cause, city);
}

/**
 * The localized "temporary / persistent / permanent" cue for a cause.
 * @param {string} [cause] The migration cause.
 * @returns {string} The permanence cue.
 */
export function permanenceCue(cause) {
  const p = causePermanence(cause);
  // A "temporary" cue only restates what the action hint already implies, so it is omitted; the
  // persistent / permanent cues carry real information.
  if (p === "temporary") return "";
  return loc("LOC_EMIG_PERMANENCE_" + p.toUpperCase()) || PERMANENCE_FALLBACK[p] || "";
}

/**
 * A localized loss headline naming the cause, the people, and the city.
 * @param {string|undefined} cause The migration cause.
 * @param {MsgNode} people People-count phrase (e.g. "12 thousand people").
 * @param {MsgNode} city Source city name.
 * @returns {string} The headline.
 */
export function lossHeadline(cause, people, city) {
  return msgText(lossHeadlineMsg(cause, people, city));
}

/**
 * {@link lossHeadline} as a message node. A cause without its own headline reads "<people> left <city>."
 * @param {string|undefined} cause @param {MsgNode} people @param {MsgNode} city
 * @returns {MsgNode} The headline.
 */
function lossHeadlineMsg(cause, people, city) {
  const key = cause ? DIGEST_KEY[cause] : null;
  const fb = (cause && DIGEST_FALLBACK[cause]) || "{1_People} left {2_City}.";
  return msg(key || "LOC_EMIG_DIGEST_GENERIC", fb, people, city);
}

/**
 * The "the destination pays to assimilate them" cost note.
 * @param {string} destName Destination settlement name.
 * @param {number} gold Approximate per-turn gold cost.
 * @returns {string} The note.
 */
export function costNote(destName, gold) {
  return msgText(costNoteMsg(destName, gold));
}

/** {@link costNote} as a message node. @param {MsgNode} destName @param {number} gold @returns {MsgNode} */
function costNoteMsg(destName, gold) {
  return msg("LOC_EMIG_COST_NOTE", "{1_Dest} pays about {2_Gold} gold/turn to integrate them.", destName, String(gold));
}

/**
 * The trailing "(Internal Move)" / "(External Move)" tag flagging whether a move stayed within the
 * player's empire or left it, since losing people to a rival reads very differently from citizens
 * shuffling between your own cities. A death (attrition) went nowhere, so it gets no tag.
 * @param {string|undefined} cause The migration cause.
 * @param {boolean|undefined} crossCiv True when the destination is a different empire.
 * @returns {string} The parenthetical tag (leading space), or "".
 */
export function scopeClause(cause, crossCiv) {
  const node = scopeTagMsg(cause, crossCiv);
  return node ? " " + msgText(node) : "";
}

/**
 * The movement-scope tag as a message node (no leading space), or null for a death.
 * @param {string|undefined} cause @param {boolean|undefined} crossCiv @returns {MsgNode|null} The tag.
 */
function scopeTagMsg(cause, crossCiv) {
  if (cause === "attrition") return null; // a death went nowhere to label
  return crossCiv
    ? msg("LOC_EMIG_SCOPE_EXTERNAL", "(External Move)")
    : msg("LOC_EMIG_SCOPE_INTERNAL", "(Internal Move)");
}

/**
 * The "where they went" clause naming a move's destination — the settlement for an internal move; the
 * settlement, or the unmet-civ label, for an external one — so the digest says where people left for.
 * A death (attrition) went nowhere, and a move with no resolved destination, get no clause.
 * @param {string|undefined} cause The migration cause.
 * @param {string|undefined} destName The destination label.
 * @returns {string} The clause (leading space), or "".
 */
export function destClause(cause, destName) {
  if (cause === "attrition" || !destName) return ""; // a death, or an unresolved destination
  return " " + msgText(destClauseMsg(destName));
}

/** The "Bound for <dest>." clause node. @param {MsgNode} destName @returns {MsgNode} The clause. */
function destClauseMsg(destName) {
  return msg("LOC_EMIG_DEST_CLAUSE", "Bound for {1_Dest}.", destName);
}

// The blank line separating a digest's SITUATION from its GUIDANCE. Surfaces with white-space:pre-line
// render a paragraph break; any other consumer collapses it to a space.
const DIGEST_GAP = "\n\n";

// Causes whose flowing "…for <dest>" headline already conveys WHY the people moved, so the digest omits
// the redundant "Drawn there: …" clause. The forced causes keep their clause, which names the refuge.
const HEADLINE_STATES_WHY = new Set(["prosperity"]);

// Per-cause "flowing headline WITH a resolved destination": LOC key plus its English fallback template
// ({1_People}, {2_City}, {3_Dest}). Causes absent here keep the two-part "headline. Bound for <dest>." form.
/** @type {Record<string, {key:string, fb:string}>} */
const DIGEST_TO = {
  disaster: { key: "LOC_EMIG_DIGEST_DISASTER_TO",
    fb: "{1_People} fled {2_City} after disaster struck, and are bound for {3_Dest}." },
  prosperity: { key: "LOC_EMIG_DIGEST_PROSPERITY_TO",
    fb: "{1_People} left {2_City} for its more prosperous neighbor, {3_Dest}." },
  war: { key: "LOC_EMIG_DIGEST_WAR_TO",
    fb: "{1_People} fled the fighting around {2_City} for the safety of {3_Dest}." },
  unhappiness: { key: "LOC_EMIG_DIGEST_UNHAPPINESS_TO",
    fb: "{1_People} left {2_City} for {3_Dest}, unhappy at home." }
  // Conquest is NOT here: its "destination" is the captured city itself (src === dest), so it names the
  // conquering civ instead — see the dedicated branch in headlineWithDest.
};

/**
 * The digest's opening "situation" sentence: the cause-named loss headline plus where the people went.
 * Conquest names the CONQUERING civ rather than a destination; a cause with a {@link DIGEST_TO} entry
 * and a resolved destination reads as one flowing sentence; any other case appends "Bound for <dest>."
 * @param {{cause?:string, people:MsgNode, city:MsgNode, destName?:MsgNode, byCiv?:MsgNode}} o Inputs.
 *   `byCiv` is the (already unmet-masked) conquering civ, present only for conquest.
 * @returns {MsgNode} The situation sentence.
 */
function headlineWithDest(o) {
  if (o.cause === "conquest") {
    // Conquest's destName is the captured city itself, so never a "… to <dest>" clause; name the conqueror.
    if (o.byCiv) {
      return msg("LOC_EMIG_DIGEST_CONQUEST_BY", "{1_People} were captured when {2_City} was conquered by {3_Civ}.",
        o.people, o.city, o.byCiv);
    }
    return lossHeadlineMsg(o.cause, o.people, o.city); // no conqueror resolved → the plain capture headline
  }
  const dest = o.destName;
  const spec = o.cause && dest ? DIGEST_TO[o.cause] : null;
  if (spec && dest) return msg(spec.key, spec.fb, o.people, o.city, dest);
  const head = lossHeadlineMsg(o.cause, o.people, o.city);
  return o.cause === "attrition" || !dest ? head : msgJoin(head, " ", destClauseMsg(dest));
}

/**
 * The cross-civ extras that follow the action hint: the Anti-Immigration Stance tip when the caller asks
 * for it (a voluntary loss to another civ with no retention policy slotted), then the destination's
 * integration cost when it is material (>= 1 gold/turn).
 * @param {{crossCiv?:boolean, destName?:MsgNode, destGold?:number, stanceTip?:boolean}} o Digest inputs.
 * @returns {MsgNode[]} The notes (possibly none).
 */
function crossCivNotes(o) {
  const notes = [];
  if (o.stanceTip) notes.push(stanceTipMsg());
  if (o.crossCiv && o.destName && (o.destGold || 0) >= 1) {
    notes.push(costNoteMsg(o.destName, Math.round(o.destGold || 0)));
  }
  return notes;
}

/**
 * Compose the local player's per-pass migration digest as two blocks separated by {@link DIGEST_GAP}:
 * the SITUATION (loss headline + where they went) and the GUIDANCE ("why here" clause, action hint,
 * cross-civ cost note when material, movement-scope tag). Pure; the caller resolves the inputs.
 * @param {{cause?:string, people:MsgNode, city:MsgNode, crossCiv?:boolean, destName?:MsgNode,
 *          destGold?:number, why?:MsgNode, byCiv?:MsgNode, stanceTip?:boolean}} o The resolved digest
 *   inputs (text fields as strings or message nodes). `stanceTip` adds the Anti-Immigration Stance tip
 *   (the caller decides when it applies). `why` is the "why here" phrase, appended as a short clause
 *   when present; `byCiv` is the (already unmet-masked) conquering civ, used only by the conquest headline.
 * @returns {string} The composed message.
 */
export function localDigestMessage(o) {
  return msgText(localDigestMsg(o));
}

/**
 * {@link localDigestMessage} as a message node.
 * @param {Parameters<typeof localDigestMessage>[0]} o The resolved digest inputs.
 * @returns {MsgNode} The digest.
 */
export function localDigestMsg(o) {
  const situation = headlineWithDest(o);
  const guidance = [
    // The "why here" clause leads the guidance; causes whose flowing headline already states the pull
    // don't repeat it.
    o.cause && HEADLINE_STATES_WHY.has(o.cause) ? null : whyClause(o.cause, o.why),
    causeHintMsg(o.cause, o.city), // what you can do / how durable it is
    ...crossCivNotes(o),
    scopeTagMsg(o.cause, o.crossCiv) // trailing (Internal Move) / (External Move) tag
  ].filter((p) => p != null && p !== "");
  return guidance.length ? msgJoin(situation, DIGEST_GAP, msgJoinWith(" ", guidance)) : situation;
}

/**
 * Compose the local player's per-pass INBOUND immigration digest: a "people settled in <city>"
 * headline plus, for a met origin, a "drawn from <civ>" clause. The mirror of
 * {@link localDigestMessage} for arrivals. Pure; the caller resolves + unmet-masks the inputs.
 * @param {{cause?:string, people:MsgNode, city:MsgNode, fromCiv?:MsgNode}} o The resolved inputs.
 *   `people` is the dual-count phrase; `fromCiv` is the (already unmet-masked) origin civ, omitted when
 *   unknown.
 * @returns {string} The composed message.
 */
export function inboundDigestMessage(o) {
  return msgText(inboundDigestMsg(o));
}

/**
 * {@link inboundDigestMessage} as a message node.
 * @param {Parameters<typeof inboundDigestMessage>[0]} o The resolved inputs. @returns {MsgNode} The digest.
 */
export function inboundDigestMsg(o) {
  const head = msg("LOC_EMIG_INBOUND_HEADLINE", "{1_People} settled in {2_City}.", o.people, o.city);
  if (!o.fromCiv) return head;
  return msgJoin(head, " ", msg("LOC_EMIG_INBOUND_FROM", "Newcomers drawn from {1_Civ}.", o.fromCiv));
}

/**
 * The trailing "why" clause for a digest: a death reads as a cause ("The cause: siege, no safe
 * refuge."); a move reads as a pull ("Drawn there: nearby, open borders."). Null when no why.
 * @param {string|undefined} cause The migration cause.
 * @param {MsgNode|undefined} why The reason phrase.
 * @returns {MsgNode|null} The clause, or null.
 */
function whyClause(cause, why) {
  if (!why) return null;
  return cause === "attrition"
    ? msg("LOC_EMIG_DEATH_WHY_CLAUSE", "The cause: {1_Why}.", why)
    : msg("LOC_EMIG_WHY_CLAUSE", "Drawn there by its {1_Why}.", why);
}

/**
 * The low-key "rising emigration pressure" trend cue line: a settlement is building toward a
 * voluntary move without anyone having left yet.
 * @param {string} srcName Source settlement name.
 * @param {string} destName Where its people are drawn.
 * @returns {string} The cue line.
 */
export function pressureCueMessage(srcName, destName) {
  return msgText(pressureCueMsg(srcName, destName));
}

/** {@link pressureCueMessage} as a message node. @param {string} srcName @param {string} destName */
export function pressureCueMsg(srcName, destName) {
  return msg("LOC_EMIG_PRESSURE_CUE",
    "Rising emigration pressure: citizens in {1_City} are increasingly drawn to {2_Dest}.", srcName, destName);
}
