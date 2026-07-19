// emigration-naming.js
//
// Localized, in-world names for refugee events - the war-naming model from the Demographics
// mod (chart-wars-naming.js): civ adjectives, the game's own disaster names, and a
// cause-dispatched headline. Also the Phase-1 explanatory-toast strings (per-cause loss
// headline, action hint, permanence cue, cost note, and the composed local-player digest).
// Pure logic; reads GameInfo/Locale/Players defensively and degrades to a plain English
// fallback when a localized string can't be composed.

import { causeHint, causePermanence } from "/emigration/ui/emigration-causes.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";
import { warOpponents } from "/emigration/ui/emigration-war.js";
import { quarterBonus } from "/emigration/ui/emigration-quarter-bonuses.js";

// The spoiler mask for a belligerent the visibility policy hides (unmet). Matches the dashboard /
// feedback "Unmet" convention so a war name never leaks a civ the player hasn't met.
const UNMET_LABEL = "an unmet civilization";

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
 * A civilization's NAME as a proper noun ("Rome", "Egypt"), from LOC_CIVILIZATION_<STEM>_NAME — the
 * counterpart to {@link civAdjective}, for sentences that read "…by <civ>" where an adjective ("Roman")
 * would be ungrammatical. City-states / Independent Powers use their specific name; falls back to the
 * civ display name, then the adjective.
 * @param {number} pid Player id.
 * @returns {string} The civ name.
 */
export function civName(pid) {
  if (isMinorPlayer(pid)) {
    const indep = independentName(pid);
    if (indep) return indep;
  }
  const name = civTypeName(pid);
  if (name) {
    const nm = loc("LOC_CIVILIZATION_" + name.replace(/^CIVILIZATION_/, "") + "_NAME");
    if (nm) return nm;
  }
  const indep = independentName(pid);
  if (indep) return indep;
  return civDisplayAdjective(pid);
}

/**
 * A civ descriptor for NARRATIVE surfaces (the Chronicle, refugee events), where an unmet civ is
 * named but framed as hearsay rather than revealed outright. This deliberately relaxes the analytics
 * spoiler mask FOR NARRATIVE ONLY: the dashboard, lens, and notifications keep the strict "an unmet
 * civilization" mask; only the story surfaces get the real name, wrapped in "we have heard tell of".
 * @param {number} pid Player id.
 * @returns {{adj:string, framed:boolean}} The real adjective, and whether to frame it as rumour.
 */
export function narrativeCiv(pid) {
  return { adj: civAdjective(pid), framed: civHidden(pid) };
}

/**
 * The name of a Cultural Quarter held by a civ's diaspora ("the Roman Quarter"). Prefers the per-civ
 * registry demonym (so Carthage reads "Punic Quarter", Pirate Republic "Buccaneer Quarter"), then the
 * origin's game adjective, then a generic "foreign quarter" — always well-formed. Narrative surface,
 * so it does not apply the analytics spoiler mask.
 * @param {number} originCiv The origin civ id.
 * @returns {string} The quarter name, e.g. "Roman Quarter".
 */
export function quarterName(originCiv) {
  const demonym = quarterBonus(civType(originCiv)).demonym;
  if (demonym) return demonym + " Enclave";
  const adj = civAdjective(originCiv);
  return adj ? adj + " Enclave" : "foreign enclave";
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
 * A belligerent's display name for a war label, SPOILER-MASKED: a civ the visibility policy hides
 * (unmet) is never named, it reads as "an unmet civilization" instead of a real adjective.
 * @param {number} pid Player id.
 * @returns {string|null} The masked name, or null when the id is unusable.
 */
function belligerentName(pid) {
  if (typeof pid !== "number") return null;
  return civHidden(pid) ? UNMET_LABEL : civAdjective(pid);
}

/**
 * The other belligerent to name for a war the `victim` is fleeing. Prefers an explicitly supplied
 * aggressor list (the event-tracked declarers); falls back to the engine's live at-war set
 * ({@link warOpponents}) so an untracked / pre-existing war still resolves an opponent. Among the
 * candidates a MET opponent wins, so the war reads with both sides named rather than masking a side
 * we could have shown.
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
 * The spoiler-masked war name when EITHER side is hidden (unmet): "{Known} vs. an unmet
 * civilization", naming the side we're allowed to show. Null when neither side is masked (a normal
 * name applies) or both are masked (nothing safe to name).
 * @param {string|null} victimName Victim's (already-masked) name.
 * @param {string|null} aggressorName Aggressor's (already-masked) name, or null.
 * @returns {string|null} The masked name, or null.
 */
function maskedWarName(victimName, aggressorName) {
  if (aggressorName !== UNMET_LABEL && victimName !== UNMET_LABEL) return null;
  const known = victimName !== UNMET_LABEL ? victimName
    : aggressorName !== UNMET_LABEL ? aggressorName : null;
  if (!known) return null;
  return loc("LOC_EMIG_WAR_VS_UNMET", known) || known + " vs. an unmet civilization";
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
 * A name for the war a victim is fleeing, naming BOTH sides whenever they're known and met:
 *   • both met majors → the engine's own war name when it resolves, else "{Victim}–{Aggressor} War".
 *   • opponent unmet  → "{Known} vs. an unmet civilization" (honours the spoiler mask, so the war is
 *                       still named without leaking a civ the player hasn't met).
 *   • no opponent at all (peace already, unreadable) → "{Victim} War" as a last resort.
 * Replaces the old "{Victim}–the enemy War", which fired whenever the aggressor wasn't event-tracked.
 * @param {number} victimPid Victim player id.
 * @param {Iterable<number>} aggressorPids Aggressor ids (may be empty → engine fallback).
 * @returns {string} A war name.
 */
export function warRefugeeName(victimPid, aggressorPids) {
  const arr = aggressorPids ? [...aggressorPids].filter((x) => typeof x === "number") : [];
  const aggressor = pickAggressor(victimPid, arr);
  const victimName = belligerentName(victimPid);
  const aggressorName = aggressor != null ? belligerentName(aggressor) : null;
  const masked = maskedWarName(victimName, aggressorName);
  if (masked) return masked;
  if (aggressor != null && bothMetMajors(victimPid, aggressor)) {
    const wn = engineWarName(victimPid, aggressor);
    if (wn) return wn;
  }
  if (aggressorName && victimName) return victimName + "–" + aggressorName + " War";
  return (victimName || "the") + " War"; // opponent unresolved (peace already declared, etc.)
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
  // civ. When the caller supplies a civ (already spoiler-guarded, an unmet civ is
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
  const part = typeof cause === "string" ? cause.toUpperCase() : "";
  return (part && loc("LOC_EMIG_HINT_" + part, city)) || causeHint(cause, city);
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
 * The trailing movement-scope tag that flags whether a move stayed WITHIN the player's empire (an
 * internal relocation to another of their own settlements) or LEFT it for another empire. The two
 * read very differently to a player — losing people to a rival is not the same as citizens shuffling
 * between your own cities — so the digest ends with a short "(Internal Move)" / "(External Move)"
 * label rather than letting every move read as a loss. A death (attrition) went nowhere, so it gets
 * no tag.
 * @param {string|undefined} cause The migration cause.
 * @param {boolean|undefined} crossCiv True when the destination is a different empire.
 * @returns {string} The parenthetical tag (leading space), or "".
 */
export function scopeClause(cause, crossCiv) {
  if (cause === "attrition") return ""; // a death went nowhere to label
  const key = crossCiv ? "LOC_EMIG_SCOPE_EXTERNAL" : "LOC_EMIG_SCOPE_INTERNAL";
  const fb = crossCiv ? "(External Move)" : "(Internal Move)";
  return " " + (loc(key) || fb);
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
  return " " + (loc("LOC_EMIG_DEST_CLAUSE", destName) || `Bound for ${destName}.`);
}

// The blank line separating a digest's SITUATION (what happened + where the people went) from its
// GUIDANCE (what you can do, why they moved). Surfaces that honour it — the HUD toast and the expanded
// log row (white-space:pre-line) — render a paragraph break; the compact one-line log row and any other
// consumer collapse it to a space, so it degrades cleanly.
const DIGEST_GAP = "\n\n";

// Causes whose flowing "…for <dest>" headline already conveys WHY the people moved, so the digest omits
// the redundant "Drawn there: …" clause for them. Only the VOLUNTARY pull (prosperity) is fully stated
// by its headline; the forced causes (war/disaster/conquest) keep their clause, which names the specific
// refuge the people fled toward — information the "for the safety of <dest>" headline doesn't carry.
const HEADLINE_STATES_WHY = new Set(["prosperity"]);

/**
// Per-cause "flowing headline WITH a resolved destination": one sentence that folds where the people
// went into the loss headline, instead of a headline + a separate "Bound for <dest>." clause. Each
// entry is the LOC key plus an English fallback builder (people, city, dest). Causes absent here keep
// the two-part "headline. Bound for <dest>." form (see {@link headlineWithDest}).
/** @type {Record<string, {key:string, fb:(p:string,c:string,d:string)=>string}>} */
const DIGEST_TO = {
  disaster: { key: "LOC_EMIG_DIGEST_DISASTER_TO",
    fb: (p, c, d) => `${p} fled ${c} after disaster struck, and are bound for ${d}.` },
  prosperity: { key: "LOC_EMIG_DIGEST_PROSPERITY_TO",
    fb: (p, c, d) => `${p} left ${c} for its more prosperous neighbor, ${d}.` },
  war: { key: "LOC_EMIG_DIGEST_WAR_TO",
    fb: (p, c, d) => `${p} fled the fighting around ${c} for the safety of ${d}.` },
  unhappiness: { key: "LOC_EMIG_DIGEST_UNHAPPINESS_TO",
    fb: (p, c, d) => `${p} left ${c} for ${d}, unhappy at home.` }
  // Conquest is NOT here: its "destination" is the captured city itself (src === dest), so it names the
  // conquering civ instead — see the dedicated branch in headlineWithDest.
};

/**
 * The digest's opening "situation" sentence: the cause-named loss headline plus where the people went.
 * Conquest is its own shape — the population was seized when the city fell, so it names the CONQUERING
 * civ ("… were captured when <city> was conquered by <civ>.") rather than a destination. A cause with a
 * {@link DIGEST_TO} entry AND a resolved destination reads as one flowing sentence naming that
 * destination ("… for its more prosperous neighbor, <dest>." / "… for the safety of <dest>."); any other
 * case keeps the headline and a separate "Bound for <dest>." clause. For an external move the destination
 * is whatever destView resolved — a met civ's city, or the masked "an unmet civilization".
 * @param {{cause?:string, people:string, city:string, destName?:string, byCiv?:string}} o Inputs. `byCiv`
 *   is the (already unmet-masked) conquering civ, present only for conquest.
 * @returns {string} The situation sentence.
 */
function headlineWithDest(o) {
  if (o.cause === "conquest") {
    // Conquest's destName is the captured city itself, so never a "… to <dest>" clause; name the conqueror.
    if (o.byCiv) {
      return loc("LOC_EMIG_DIGEST_CONQUEST_BY", o.people, o.city, o.byCiv)
        || `${o.people} were captured when ${o.city} was conquered by ${o.byCiv}.`;
    }
    return lossHeadline(o.cause, o.people, o.city); // no conqueror resolved → the plain capture headline
  }
  const dest = o.destName;
  const spec = o.cause && dest ? DIGEST_TO[o.cause] : null;
  if (spec && dest) return loc(spec.key, o.people, o.city, dest) || spec.fb(o.people, o.city, dest);
  return lossHeadline(o.cause, o.people, o.city) + destClause(o.cause, o.destName);
}

/**
 * Compose the local player's per-pass migration digest as two blocks separated by {@link DIGEST_GAP}:
 * the SITUATION (cause-named loss headline + "where they went") and the GUIDANCE (action hint, a
 * cross-civ assimilation cost note when material, the "why here" clause, and a trailing
 * internal-vs-external movement-scope tag). The action hint already conveys how durable the loss is and
 * whether acting helps, so a separate permanence cue is not repeated here. Pure; the caller resolves
 * the inputs.
 * @param {{cause?:string, people:string, city:string, crossCiv?:boolean, destName?:string,
 *          destGold?:number, why?:string, byCiv?:string}} o The resolved digest inputs. `why` is the
 *   pre-localized "why here" phrase (P0.1), appended as a short clause when present; `byCiv` is the
 *   (already unmet-masked) conquering civ, used only by the conquest headline.
 * @returns {string} The composed message.
 */
export function localDigestMessage(o) {
  const situation = headlineWithDest(o);
  let guidance = "";
  const hint = actionHint(o.cause, o.city);
  if (hint) guidance += " " + hint;
  if (o.crossCiv && o.destName && (o.destGold || 0) >= 1) {
    guidance += " " + costNote(o.destName, Math.round(o.destGold || 0));
  }
  // Causes whose flowing headline already states the pull ("…for its more prosperous neighbor, X" /
  // "…for the safety of X") don't repeat it as a "Drawn there: …" clause — that would just be noise.
  // Every other cause keeps the clause (a death names its fatal cause, etc.).
  if (!(o.cause && HEADLINE_STATES_WHY.has(o.cause))) guidance += whyClause(o.cause, o.why);
  guidance += scopeClause(o.cause, o.crossCiv); // trailing (Internal Move) / (External Move) tag
  guidance = guidance.trim();
  return guidance ? situation + DIGEST_GAP + guidance : situation;
}

/**
 * Compose the local player's per-pass INBOUND immigration digest: a "people settled in <city>"
 * headline plus, for a known (met) origin, a "drawn from <civ>" clause. The mirror of
 * {@link localDigestMessage} for people ARRIVING in the player's empire rather than leaving it, so a
 * prosperous, receiving empire also gets news. Pure; the caller resolves + unmet-masks the inputs.
 * @param {{cause?:string, people:string, city:string, fromCiv?:string}} o The resolved inputs. `people`
 *   is the pre-formatted dual-count string; `fromCiv` is the (already unmet-masked) origin civ, omitted
 *   when unknown.
 * @returns {string} The composed message.
 */
export function inboundDigestMessage(o) {
  let msg = loc("LOC_EMIG_INBOUND_HEADLINE", o.people, o.city) || `${o.people} settled in ${o.city}.`;
  if (o.fromCiv) {
    msg += " " + (loc("LOC_EMIG_INBOUND_FROM", o.fromCiv) || `Newcomers drawn from ${o.fromCiv}.`);
  }
  return msg;
}

/**
 * The trailing "why" clause for a digest: a death reads as a cause ("The cause: siege, no safe
 * refuge."); a move reads as a pull ("Drawn there: nearby, open borders."). Empty when no why.
 * @param {string|undefined} cause The migration cause.
 * @param {string|undefined} why The pre-localized reason phrase.
 * @returns {string} The clause (leading space), or "".
 */
function whyClause(cause, why) {
  if (!why) return "";
  const isDeath = cause === "attrition";
  const key = isDeath ? "LOC_EMIG_DEATH_WHY_CLAUSE" : "LOC_EMIG_WHY_CLAUSE";
  const fb = isDeath ? `The cause: ${why}.` : `Drawn there: ${why}.`;
  return " " + (loc(key, why) || fb);
}

/**
 * The low-key "rising emigration pressure" trend cue line (P0.3): a settlement is building toward a
 * voluntary move without anyone having left yet.
 * @param {string} srcName Source settlement name.
 * @param {string} destName Where its people are drawn.
 * @returns {string} The cue line.
 */
export function pressureCueMessage(srcName, destName) {
  return (
    loc("LOC_EMIG_PRESSURE_CUE", srcName, destName) ||
    `Rising emigration pressure: citizens in ${srcName} are increasingly drawn to ${destName}.`
  );
}
