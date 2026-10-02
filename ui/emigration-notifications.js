// emigration-notifications.js
//
// The PERSISTENT notification log behind the "Notifications" sub-tab. Every toast that fires
// (emigration-feedback.js) is also appended here as a structured entry carrying the event's detail.
// Persisted in GameConfiguration, capped, newest-first; without GameConfiguration reads return [].

import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";
import { isMsgNode, msgClean, msgCompose, msgPack, msgText } from "/emigration/ui/emigration-loc.js";

const STATE_KEY = "EmigrationNotif_v1";
const MAX_ENTRIES = 120; // ring cap: plenty of history, bounded save size

/**
 * @typedef {Object} NotifEntry
 * @property {number} turn The game turn it fired.
 * @property {string} cause The migration cause (war/disaster/prosperity/…) or "crisis".
 * @property {string} kind The notification kind ("digest" | "crisis" | "cause").
 * @property {string} summary A one-line summary for the list row (the toast headline).
 * @property {string} [title] A narrative title or episode heading.
 * @property {string} [body] A longer narrative body or story note.
 * @property {string} [event] The specific in-world event (named war / disaster), when applicable.
 * @property {number} people Scaled people involved.
 * @property {number} points Raw Civ population points involved.
 * @property {string} [fromCity] Origin settlement name.
 * @property {string} [fromCiv] Origin civilization name.
 * @property {string} [toCity] Destination settlement name.
 * @property {string} [toCiv] Destination civilization name.
 * @property {string} [reasons] The "why here" explanation phrase for the lead move, already
 *   localized (e.g. "nearby, open borders").
 * @property {boolean} [crossCiv] Whether the lead move crossed civilizations.
 * @property {boolean} [ownLoss] Whether this is the local player's own population loss (drives the
 *   red accent; world-news / other-civ entries render in a neutral tone).
 * @property {*} [s] The summary as a packed message (emigration-loc.js), composed again in the language
 *   active when it is shown. `ts`, `bs`, `ev`, `fc` and `tc` do the same for title, body, event, fromCiv
 *   and toCiv. Entries written before these existed carry only the stored text, which still renders.
 * @property {*} [ts] The title as a packed message.
 * @property {*} [bs] The body as a packed message.
 * @property {*} [ev] The event as a packed message.
 * @property {*} [fc] The origin civilization as a packed message.
 * @property {*} [tc] The destination civilization as a packed message.
 */

/** @typedef {import("/emigration/ui/emigration-loc.js").MsgNode} MsgNode */

/**
 * What a caller hands {@link logNotification}: a NotifEntry whose text fields may be message nodes.
 * @typedef {Omit<Partial<NotifEntry>, "summary"|"title"|"body"|"event"|"fromCiv"|"toCiv"> & {summary?:MsgNode,
 *   title?:MsgNode, body?:MsgNode, event?:MsgNode, fromCiv?:MsgNode, toCiv?:MsgNode}} NotifInput
 */

/** @type {NotifEntry[] | null} Newest-first cache (shared across the VM's modules). */
let _log = null;
registerCacheReset(() => { _log = null; });

/**
 * The current game turn, or 0.
 * @returns {number} Game.turn or 0.
 */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Read + parse the persisted log (newest-first), or [] when absent/unusable. Each element is
 * re-normalized on load so a corrupt or old-schema entry can't reach the list/view as a wrong-typed
 * value; non-object elements are dropped and the list is capped.
 * @returns {NotifEntry[]} The stored entries.
 */
function loadPersisted() {
  try {
    const g = Configuration?.getGame?.();
    const raw = g && typeof g.getValue === "function" ? g.getValue(STATE_KEY) : null;
    const o = typeof raw === "string" && raw.length ? JSON.parse(raw) : null;
    return Array.isArray(o) ? normalizeLoaded(o) : [];
  } catch (_) {
    return [];
  }
}

/** @param {*} v @param {string} d @returns {string} v when a string, else the fallback. */
function strOr(v, d) {
  return typeof v === "string" ? v : d;
}

/** @param {*} v @param {number} d @returns {number} v when a finite number, else the fallback. */
function finiteOr(v, d) {
  return typeof v === "number" && isFinite(v) ? v : d;
}

// Optional string fields copied through only when present, so absent ones are OMITTED (not written as
// `undefined`, which JSON.stringify would drop), keeping the in-memory cache identical to the persisted
// blob across a reload.
const OPT_STR_FIELDS = ["title", "body", "event", "fromCity", "fromCiv", "toCity", "toCiv", "reasons"];

// Text field → the short field holding its packed message. A caller may pass a message node in the text
// field itself (rendered once for the stored text, packed into the short field) or a packed value in the
// short field directly (the Chronicle mirror).
/** @type {Record<string, string>} */
const MSG_FIELDS = { summary: "s", title: "ts", body: "bs", event: "ev", fromCiv: "fc", toCiv: "tc" };

/**
 * Split each message-node text field of an incoming entry into its rendered text and packed message.
 * @param {*} entry The caller's entry. @returns {*} A shallow copy with plain-text fields and packed messages.
 */
function splitMessages(entry) {
  const out = { ...entry };
  for (const [field, short] of Object.entries(MSG_FIELDS)) {
    if (!isMsgNode(entry[field])) continue;
    out[field] = msgText(entry[field]);
    out[short] = msgPack(entry[field]);
  }
  return out;
}

/**
 * Copy the well-formed packed messages of `entry` onto the clean entry `e`.
 * @param {*} entry The source entry. @param {*} e The clean entry (mutated).
 */
function copyMessages(entry, e) {
  for (const short of Object.values(MSG_FIELDS)) {
    const p = entry[short] == null ? undefined : msgClean(entry[short]);
    if (p !== undefined && p !== "") e[short] = p;
  }
}

/**
 * Build the canonical NotifEntry with coerced required fields and only the present optional strings.
 * @param {Partial<NotifEntry>} entry The source entry. @param {number} turn The turn to stamp.
 * @returns {NotifEntry} The clean entry.
 */
function cleanEntry(entry, turn) {
  /** @type {*} */
  const e = {
    turn,
    cause: strOr(entry.cause, "other"),
    kind: strOr(entry.kind, "cause"),
    summary: strOr(entry.summary, ""),
    people: finiteOr(entry.people, 0),
    points: finiteOr(entry.points, 0),
    crossCiv: !!entry.crossCiv,
    ownLoss: !!entry.ownLoss
  };
  for (const f of OPT_STR_FIELDS) {
    if (typeof (/** @type {*} */ (entry)[f]) === "string") e[f] = (/** @type {*} */ (entry)[f]);
  }
  copyMessages(entry, e);
  return e;
}

/**
 * Normalize a loaded array into clean, capped NotifEntries, dropping non-object elements. Each entry
 * keeps its OWN stored turn.
 * @param {*[]} arr The raw loaded array. @returns {NotifEntry[]} The clean entries.
 */
function normalizeLoaded(arr) {
  /** @type {NotifEntry[]} */
  const out = [];
  for (const el of arr) {
    if (out.length >= MAX_ENTRIES) break;
    if (!el || typeof el !== "object") continue;
    out.push(cleanEntry(el, finiteOr(el.turn, 0)));
  }
  return out;
}

/**
 * The log cache, loaded once from GameConfiguration.
 * @returns {NotifEntry[]} Entries (newest-first).
 */
function log() {
  resetCachesOnNewGame();
  if (!_log) _log = loadPersisted();
  return _log;
}

/** Persist the log to GameConfiguration. */
function persist() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(_log || []));
  } catch (_) {
    /* ignore */
  }
}

/**
 * Append a notification to the permanent log (newest-first), stamped with the current turn, and
 * persist. Trims to MAX_ENTRIES. No-op on a malformed entry.
 * @param {NotifInput} entry The notification detail (cause/kind/summary + people/points + where).
 */
export function logNotification(entry) {
  if (!entry || typeof entry !== "object") return;
  const list = log();
  list.unshift(cleanEntry(splitMessages(entry), gameTurn()));
  if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
  persist();
}

/**
 * The notification log, newest-first (a copy, so callers can't mutate the cache).
 * @param {number} [limit] Max entries to return (default all).
 * @returns {NotifEntry[]} The entries.
 */
export function notificationLog(limit) {
  const list = log();
  const n = typeof limit === "number" && limit > 0 ? Math.min(limit, list.length) : list.length;
  return list.slice(0, n);
}

/**
 * One text field of an entry in the CURRENT language: its packed message composed now, or the stored
 * text when the entry has no message (older saves) or it cannot be composed.
 * @param {NotifEntry} e The entry.
 * @param {"summary"|"title"|"body"|"event"|"fromCiv"|"toCiv"} field The text field.
 * @returns {string} The text ("" when absent).
 */
export function entryText(e, field) {
  const p = /** @type {*} */ (e)[MSG_FIELDS[field]];
  const composed = p != null ? msgCompose(p) : null;
  if (composed != null) return composed;
  const v = /** @type {*} */ (e)[field];
  return typeof v === "string" ? v : "";
}

/** Clear the notification log (console/debug helper). */
export function clearNotifications() {
  _log = [];
  persist();
}
