// emigration-chronicle.js
//
// The Migration CHRONICLE: a curated, written history of the world's significant population movements,
// distinct from the per-event Notifications log. Where Notifications records every wave as it happens,
// the Chronicle keeps only the moments that read as history (a great exodus, a diaspora taking root,
// a people returning home) and renders each as a line of prose (emigration-narrative.js).
import { logNotification } from "/emigration/ui/emigration-notifications.js";

//
// Persisted in GameConfiguration (survives save/reload), capped, newest-first. Defensive throughout:
// with no GameConfiguration (headless / pre-boot) reads return [] and writes no-op.

const STATE_KEY = "EmigrationChronicle_v1";
const MAX_ENTRIES = 80; // a readable history, not an exhaustive ledger (Notifications keeps the rest)

/**
 * @typedef {Object} ChronicleEntry
 * @property {number} turn The game turn it was recorded.
 * @property {string} kind "exodus" | "founding" | "return".
 * @property {string} title A short episode title.
 * @property {string} body The written line.
 * @property {string} [civ] The civ at the centre of it (adjective).
 * @property {number} [people] Scaled people involved.
 * @property {string} [cause] The migration cause, when one applies.
 * @property {string} [dedupeKey] A stable key so the same milestone isn't chronicled twice.
 */

/** @type {ChronicleEntry[] | null} Newest-first cache. */
let _log = null;

/** @type {Set<string> | null} The set of dedupe keys currently in the log, for O(1) `chronicled`. */
let _keys = null;

/**
 * The dedupe-key set, lazily built from the log. Kept in sync by {@link chronicle} on insert/trim and
 * reset by {@link clearChronicle}, so {@link chronicled} is O(1) instead of scanning the whole log
 * once per candidate per pass.
 * @returns {Set<string>} The dedupe keys present in the log.
 */
function keys() {
  if (!_keys) {
    _keys = new Set();
    for (const e of log()) {
      if (e.dedupeKey) _keys.add(e.dedupeKey);
    }
  }
  return _keys;
}

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
 * Read + parse the persisted chronicle (newest-first), or [] when absent/unusable. Each element is
 * re-normalized on load so a corrupt or old-schema entry can't reach the trim / dedupe / view paths as
 * a wrong-typed value; entries without a usable body are dropped and the list is capped.
 * @returns {ChronicleEntry[]} The stored entries.
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

/**
 * Normalize a loaded array into clean, capped ChronicleEntries, dropping any element without a usable
 * body. Each entry keeps its OWN stored turn (not the current one).
 * @param {*[]} arr The raw loaded array.
 * @returns {ChronicleEntry[]} The clean entries.
 */
function normalizeLoaded(arr) {
  /** @type {ChronicleEntry[]} */
  const out = [];
  for (const el of arr) {
    if (out.length >= MAX_ENTRIES) break;
    if (!el || typeof el !== "object" || typeof el.body !== "string" || !el.body) continue;
    const turn = typeof el.turn === "number" && isFinite(el.turn) ? el.turn : 0;
    out.push(cleanEntry(el, turn));
  }
  return out;
}

/**
 * The chronicle cache, loaded once from GameConfiguration.
 * @returns {ChronicleEntry[]} Entries (newest-first).
 */
function log() {
  if (!_log) _log = loadPersisted();
  return _log;
}

/** Persist the chronicle to GameConfiguration. */
function persist() {
  try {
    Configuration?.editGame?.()?.setValue?.(STATE_KEY, JSON.stringify(_log || []));
  } catch (_) {
    /* ignore */
  }
}

/**
 * Whether a dedupe key has already been chronicled (so a recurring milestone records once).
 * @param {string} key The dedupe key.
 * @returns {boolean} True when already present.
 */
export function chronicled(key) {
  return key ? keys().has(key) : false;
}

/**
 * Mirror a chronicled moment into the notifications log as a distinct "chronicle"-kind entry, so the
 * Notifications tab is the single home for every migration event (the story prose included).
 * Best-effort: a failure here must never throw into the engine pass or undo the chronicle insert that
 * already succeeded, so it's swallowed (the chronicle's own state is persisted before this runs).
 * @param {ChronicleEntry} e The normalized chronicle entry.
 */
function mirrorToNotifications(e) {
  try {
    logNotification({
      kind: "chronicle",
      cause: e.cause || "chronicle",
      summary: e.title || e.body,
      title: e.title,
      body: e.body,
      people: typeof e.people === "number" ? e.people : 0,
      points: 0
    });
  } catch (_) {
    /* ignore */
  }
}

/**
 * Append a chronicle entry (newest-first), stamped with the current turn, and persist. Trims to
 * MAX_ENTRIES. No-op on a malformed entry, or when its dedupeKey was already chronicled.
 * @param {Partial<ChronicleEntry>} entry The entry (kind/title/body + optional civ/people/cause/key).
 * @returns {boolean} True when an entry was added.
 */
export function chronicle(entry) {
  if (!entry || typeof entry !== "object" || typeof entry.body !== "string" || !entry.body) return false;
  if (entry.dedupeKey && chronicled(entry.dedupeKey)) return false;
  const list = log();
  const e = normalizeEntry(entry);
  list.unshift(e);
  if (e.dedupeKey) keys().add(e.dedupeKey);
  trimToCap(list);
  persist(); // persist our own state first, so a notifications-mirror failure can't lose it
  mirrorToNotifications(e); // best-effort; never throws (see mirrorToNotifications)
  return true;
}

/**
 * Trim the log to MAX_ENTRIES, dropping the oldest overflow and forgetting its dedupe key(s) so the
 * key set mirrors the capped log exactly (a milestone that aged out can be chronicled afresh).
 * @param {ChronicleEntry[]} list The log (mutated in place).
 */
function trimToCap(list) {
  if (list.length <= MAX_ENTRIES) return;
  for (const d of list.splice(MAX_ENTRIES)) {
    if (d.dedupeKey) keys().delete(d.dedupeKey);
  }
}

/**
 * Build the canonical ChronicleEntry, including ONLY the optional fields that are present and
 * well-typed. Omitting absent optionals (rather than writing `undefined`) keeps the in-memory cache
 * byte-identical to what JSON.stringify persists, so the two never diverge across a reload.
 * @param {Partial<ChronicleEntry>} entry The source entry (its `body` is already validated).
 * @param {number} turn The turn to stamp.
 * @returns {ChronicleEntry} The clean entry.
 */
function cleanEntry(entry, turn) {
  /** @type {ChronicleEntry} */
  const e = {
    turn,
    kind: typeof entry.kind === "string" ? entry.kind : "exodus",
    title: typeof entry.title === "string" ? entry.title : "",
    body: /** @type {string} */ (entry.body)
  };
  if (typeof entry.civ === "string") e.civ = entry.civ;
  if (typeof entry.people === "number" && isFinite(entry.people)) e.people = entry.people;
  if (typeof entry.cause === "string") e.cause = entry.cause;
  if (typeof entry.dedupeKey === "string") e.dedupeKey = entry.dedupeKey;
  return e;
}

/**
 * Normalize a partial entry into a stamped ChronicleEntry (current turn + cleaned fields).
 * @param {Partial<ChronicleEntry>} entry The entry (its `body` is already validated).
 * @returns {ChronicleEntry} The stamped entry.
 */
function normalizeEntry(entry) {
  return cleanEntry(entry, gameTurn());
}

/**
 * The chronicle, newest-first (a copy, so callers can't mutate the cache).
 * @param {number} [limit] Max entries to return (default all).
 * @returns {ChronicleEntry[]} The entries.
 */
export function chronicleLog(limit) {
  const list = log();
  const n = typeof limit === "number" && limit > 0 ? Math.min(limit, list.length) : list.length;
  return list.slice(0, n);
}

/** Clear the chronicle (console/debug helper). */
export function clearChronicle() {
  _log = [];
  _keys = null;
  persist();
}
