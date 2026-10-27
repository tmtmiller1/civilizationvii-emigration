// emigration-ai-difficulty.js
//
// The discount an AI civilization gets on the mod's prices (calling people home, taking in refugees) for the
// game's difficulty. The game gives the AI more Gold on harder settings through its handicap tables, but the
// mod's prices are the human's, so at Deity the mod is harder on the AI than the base game is. The scale is
// 1 minus `aiDifficultyDiscountPerLevel` per level of the game's Gold handicap for the difficulty in play
// (its step among the StandardHandicaps Gold rows: Settler 0 ... Deity 5), read once per game. Unreadable means no
// discount.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { registerCacheReset } from "/emigration/ui/emigration-cache-reset.js";

/** The handicap system whose level sets the discount: the one that scales the AI's Gold. */
const SYSTEM = "HANDICAP_GOLD";
/** The scale never drops below this, whatever the setting. */
const FLOOR = 0.5;

/** @type {number|null} The game's Gold handicap level, memoized; null until read. */
let _level = null;
registerCacheReset(() => {
  _level = null;
});

/**
 * The difficulty in play, as a DifficultyType, or "" when it can't be read. The game keeps it as a hash on the
 * game configuration (`difficultyType`; `getValue("Difficulty")` is null), resolved through the Difficulties
 * table (watched 2026-10-25: a Play Now lab game read LOC_DIFFICULTY_PRINCE_NAME).
 * @param {()=>string} [read] Test seam.
 * @returns {string}
 */
export function difficultyType(read) {
  try {
    if (read) return String(read() || "");
    const hash = Configuration.getGame().difficultyType;
    const row = typeof hash === "number" ? GameInfo.Difficulties.lookup(hash) : null;
    return row && typeof row.DifficultyType === "string" ? row.DifficultyType : "";
  } catch (_) {
    return "";
  }
}

/**
 * The step of a difficulty on the game's Gold handicap ladder, 0 for the easiest; 0 when unknown. The game stores
 * the Gold handicap as a percentage (base-standard difficulties.xml: Settler -20, Prince 0 ... Deity 80), not a step
 * count, so the difficulty's place among the Gold rows is read instead of its number: Settler 0 ... Deity 5, and a
 * mod that adds or reorders difficulties moves the ladder with it.
 * @param {string} difficulty A DifficultyType. @param {*[]} [rows] Test seam: the StandardHandicaps rows.
 * @returns {number}
 */
export function goldHandicapLevel(difficulty, rows) {
  try {
    const list = rows || (typeof GameInfo !== "undefined" ? GameInfo.StandardHandicaps : []);
    /** @type {number[]} */
    const levels = [];
    let mine = null;
    for (const r of list) {
      if (r.HandicapSystemType !== SYSTEM) continue;
      const v = Number(r.HandicapLevel);
      if (!Number.isFinite(v)) continue;
      if (!levels.includes(v)) levels.push(v);
      if (r.DifficultyType === difficulty) mine = v;
    }
    if (mine === null) return 0;
    levels.sort((a, b) => a - b);
    return levels.indexOf(mine);
  } catch (_) {
    return 0;
  }
}

/**
 * The factor the mod's prices are multiplied by for an AI civilization in this game.
 * @param {number} [level] Test seam: the handicap level.
 * @returns {number} 1 at Settler or when unreadable, lower on harder settings, never under FLOOR.
 */
export function aiPriceScale(level) {
  const per = Math.max(0, Number(CONFIG.aiDifficultyDiscountPerLevel) || 0);
  const lv = typeof level === "number" ? level : cachedLevel();
  return Math.max(FLOOR, 1 - per * lv);
}

/** @returns {number} The game's Gold handicap level, read once. */
function cachedLevel() {
  if (_level == null) _level = goldHandicapLevel(difficultyType());
  return _level;
}

/** Test seam: forget the memoized level. */
export function _forgetDifficulty() {
  _level = null;
}
