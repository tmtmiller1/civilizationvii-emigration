// emigration-notifications.js
//
// The PERSISTENT notification log behind the Demographics "Notifications" sub-tab. Every toast that
// fires (emigration-feedback.js) is also appended here as a structured entry, so the on-screen toasts
// can stay brief and non-spammy while the full history lives in a permanent, scrollable log the
// player can revisit. Each entry keeps the detail of the event it announced — what caused it, which
// settlement it left, and where the people went — so the list can drill down per notification.
//
// Persisted in GameConfiguration (survives save/reload), capped, newest-first. Everything is
// defensive: with no GameConfiguration (headless / pre-boot) reads return [] and writes no-op.

const STATE_KEY = "EmigrationNotif_v1";
const MAX_ENTRIES = 120; // ring cap: plenty of history, bounded save size

/**
 * @typedef {Object} NotifEntry
 * @property {number} turn The game turn it fired.
 * @property {string} cause The migration cause (war/disaster/prosperity/…) or "crisis".
 * @property {string} kind The notification kind ("digest" | "crisis" | "cause").
 * @property {string} summary A one-line summary for the list row (the toast headline).
 * @property {number} people Scaled people involved.
 * @property {number} points Raw Civ population points involved.
 * @property {string} [fromCity] Origin settlement name.
 * @property {string} [fromCiv] Origin civilization name.
 * @property {string} [toCity] Destination settlement name.
 * @property {string} [toCiv] Destination civilization name.
 * @property {boolean} [crossCiv] Whether the lead move crossed civilizations.
 */

/** @type {NotifEntry[] | null} Newest-first cache (shared across the VM's modules). */
let _log = null;

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
 * Read + parse the persisted log (newest-first), or [] when absent/unusable.
 * @returns {NotifEntry[]} The stored entries.
 */
function loadPersisted() {
  try {
    const g = Configuration?.getGame?.();
    const raw = g && typeof g.getValue === "function" ? g.getValue(STATE_KEY) : null;
    const o = typeof raw === "string" && raw.length ? JSON.parse(raw) : null;
    return Array.isArray(o) ? o : [];
  } catch (_) {
    return [];
  }
}

/**
 * The log cache, loaded once from GameConfiguration.
 * @returns {NotifEntry[]} Entries (newest-first).
 */
function log() {
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
  /** @type {NotifEntry} */
  const e = {
    turn: gameTurn(),
    cause: typeof entry.cause === "string" ? entry.cause : "other",
    kind: typeof entry.kind === "string" ? entry.kind : "cause",
    summary: typeof entry.summary === "string" ? entry.summary : "",
    people: typeof entry.people === "number" ? entry.people : 0,
    points: typeof entry.points === "number" ? entry.points : 0,
    fromCity: entry.fromCity,
    fromCiv: entry.fromCiv,
    toCity: entry.toCity,
    toCiv: entry.toCiv,
    crossCiv: !!entry.crossCiv
  };
  list.unshift(e);
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
