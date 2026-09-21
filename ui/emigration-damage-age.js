// emigration-damage-age.js
//
// When each plot was first seen holding a pillaged (damaged) improvement. The engine exposes only the
// `damaged` flag, not when the damage happened, so the age is measured from the first turn this session saw
// it: the per-turn pillage scan (emigration-violence-signals.js) and the departure candidate list both
// report what they read. A plot seen undamaged is forgotten, so a later raid starts a fresh age.
//
// In memory only: a tile already damaged when a game loads counts from the load turn. Used for the
// departure log line (how many abandoned tiles were still repairable, and for how long), nothing else.
// A leaf module with no imports, so any module can report into it without an import cycle.

/** @type {Map<number, number>} Plot index → turn it was first seen damaged. */
const firstSeen = new Map();

/**
 * Record what a read of one plot found.
 * @param {number} plot Plot index. @param {boolean} damaged Whether it holds a damaged improvement.
 * @param {number} turn The current game turn.
 */
export function noteDamage(plot, damaged, turn) {
  if (typeof plot !== "number") return;
  if (!damaged) {
    firstSeen.delete(plot);
    return;
  }
  if (!firstSeen.has(plot)) firstSeen.set(plot, turn);
}

/**
 * The turn a plot was first seen damaged, or null when it is not known to be damaged.
 * @param {number} plot Plot index. @returns {number|null} Turn.
 */
export function firstSeenDamaged(plot) {
  const t = firstSeen.get(plot);
  return t === undefined ? null : t;
}

/** Test hook: forget everything. */
export function resetDamageAges() {
  firstSeen.clear();
}
