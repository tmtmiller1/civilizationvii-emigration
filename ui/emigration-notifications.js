// emigration-notifications.js
//
// The PERSISTENT notification log behind the Demographics "Notifications" sub-tab. Every toast that
// fires (emigration-feedback.js) is also appended here as a structured entry, so the on-screen toasts
// can stay brief and non-spammy while the full history lives in a permanent, scrollable log the
// player can revisit. Each entry keeps the detail of the event it announced, what caused it, which
// settlement it left, and where the people went, so the list can drill down per notification.
//
// Persisted in GameConfiguration (survives save/reload), capped, newest-first. Everything is
// defensive: with no GameConfiguration (headless / pre-boot) reads return [] and writes no-op.

import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";

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
 * @property {boolean} [crossCiv] Whether the lead move crossed civilizations.
 * @property {boolean} [ownLoss] Whether this is the local player's own population loss (drives the
 *   red accent; world-news / other-civ entries render in a neutral tone).
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
const OPT_STR_FIELDS = ["title", "body", "event", "fromCity", "fromCiv", "toCity", "toCiv"];

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
 * @param {Partial<NotifEntry>} entry The notification detail (cause/kind/summary + people/points + where).
 */
export function logNotification(entry) {
  if (!entry || typeof entry !== "object") return;
  const list = log();
  list.unshift(cleanEntry(entry, gameTurn()));
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

/** Clear the notification log (console/debug helper). */
export function clearNotifications() {
  _log = [];
  persist();
}
