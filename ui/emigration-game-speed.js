// emigration-game-speed.js
//
// Phase 7, game-speed scaling. The whole engine paces in TURNS, but Civ's game
// speed stretches the same game-progress over a very different number of turns
// (GameSpeeds.CostMultiplier: Online 50 · Quick 67 · Standard 100 · Epic 150 ·
// Marathon 300 → a scalar S of 0.5–3.0). Without correction the mod is calibrated
// for exactly one speed (Standard, S=1) and drifts everywhere else: on slow speeds
// fixed turn-counts (cooldown/ramp/transit) become a tiny fraction of a long game
// and per-turn rates fire 3× more often; on fast speeds the reverse.
//
// This module reads S once (cached, fail-safe to 1.0) and exposes three transforms
// applied at the few CONFIG read sites so the *game-time* feel is constant:
//   • speedTurns(n) , turn-COUNT durations scale ×S   (longer on slow speeds)
//   • speedBar(x)   , per-turn pressure THRESHOLDS ×S  (constant game-time rate)
//   • speedDecay(d) , per-turn decay → d^(1/S)         (same game-time fade)
// Speed-INVARIANT magnitudes (siegeLossCapPct, intensity thresholds, yield weights,
// per-turn safety ceilings) are deliberately NOT scaled.
//
// Everything is gated on CONFIG.gameSpeedTuningEnabled and degrades to identity
// (S=1) whenever the engine globals are absent, so the headless test harnesses,
// which never construct Configuration/GameInfo, are unaffected.

import { CONFIG } from "/emigration/ui/emigration-config.js";

/** @type {number|null} Cached session scalar (one game = one speed). */
let _cached = null;

/**
 * The active GameSpeed type hash, mirroring the base UI's
 * `const { gameSpeedType } = Configuration.getGame()`. Null when unavailable.
 * @returns {*} The speed type, or null.
 */
function readSpeedType() {
  const g = Configuration.getGame ? Configuration.getGame() : null;
  const type = g ? g.gameSpeedType : undefined;
  return type == null ? null : type;
}

/**
 * The CostMultiplier for a speed type (Standard = 100), via GameInfo.GameSpeeds.lookup.
 * Defaults to 100 (Standard) when the row or column is missing.
 * @param {*} type The GameSpeed type.
 * @returns {number} The CostMultiplier.
 */
function lookupMultiplier(type) {
  const row = GameInfo.GameSpeeds && GameInfo.GameSpeeds.lookup
    ? GameInfo.GameSpeeds.lookup(type) : null;
  return row && typeof row.CostMultiplier === "number" ? row.CostMultiplier : 100;
}

/**
 * Read the raw speed scalar from the engine: CostMultiplier/100 of the active
 * GameSpeed (Standard = 1.0). Fail-safe to 1 on any missing global or error.
 * @returns {number} The scalar (>0), or 1 when unreadable.
 */
function rawSpeedScalar() {
  try {
    if (typeof Configuration === "undefined" || typeof GameInfo === "undefined") return 1;
    const type = readSpeedType();
    if (type === null) return 1;
    const mult = lookupMultiplier(type);
    return mult > 0 ? mult / 100 : 1;
  } catch (_) {
    return 1;
  }
}

/**
 * The active game-speed scalar S (Standard = 1.0; Marathon ≈ 3.0; Online ≈ 0.5).
 * Returns 1 when tuning is disabled. Cached for the session.
 * @returns {number} S.
 */
export function gameSpeedScalar() {
  if (!CONFIG.gameSpeedTuningEnabled) return 1;
  if (_cached === null) _cached = rawSpeedScalar();
  return _cached;
}

/** Drop the cached scalar (test/options hook; next read re-probes). */
export function resetGameSpeedCache() {
  _cached = null;
}

/**
 * Scale a turn-COUNT duration so it spans the same game-time at any speed
 * (×S, rounded, floored at 1 so a positive duration never collapses to 0).
 * @param {number} turns The Standard-speed turn count.
 * @returns {number} The speed-adjusted turn count.
 */
export function speedTurns(turns) {
  const s = gameSpeedScalar();
  if (s === 1 || !(turns > 0)) return turns;
  return Math.max(1, Math.round(turns * s));
}

/**
 * Scale a per-turn pressure THRESHOLD by S so accumulation crosses the bar in the
 * same game-time (more turns on slow speeds, fewer on fast).
 * @param {number} x The Standard-speed threshold.
 * @returns {number} The speed-adjusted threshold.
 */
export function speedBar(x) {
  const s = gameSpeedScalar();
  return s === 1 ? x : x * s;
}

/**
 * Re-base a per-turn decay factor to d^(1/S) so a transient fades over the same
 * game-time (gentler per turn on slow speeds, sharper on fast). Clamped to (0,1).
 * @param {number} d The Standard-speed per-turn retention in [0,1).
 * @returns {number} The speed-adjusted decay.
 */
export function speedDecay(d) {
  const s = gameSpeedScalar();
  if (s === 1 || !(d > 0) || d >= 1) return d;
  return Math.min(0.999, Math.max(0.001, Math.pow(d, 1 / s)));
}

/**
 * Scale a one-shot SHOCK magnitude by 1/S. An instantaneous shock (a disaster distress spike) fades
 * over the same game-time at any speed (see {@link speedDecay}), so on slow speeds it is alive for ~S×
 * as many turns. Dividing the spike by S keeps the area-under-the-decay-curve (the TOTAL
 * prosperity-turns of bite) speed-invariant: a stretched fade costs the same overall, just spread
 * thinner per turn. This completes the speed model — turn-counts ×S, thresholds ×S, decay ^(1/S),
 * shocks ÷S. Fail-safe to identity at Standard (S=1) or non-positive input.
 * @param {number} x The Standard-speed shock magnitude.
 * @returns {number} The speed-adjusted shock.
 */
export function speedShock(x) {
  const s = gameSpeedScalar();
  return s === 1 || !(x > 0) ? x : x / s;
}

/**
 * Normalize a monotonic turn for the historical population scaling exponent
 * (scaleGrowth^(turn/S)) so the "representative people" curve tracks game-PROGRESS
 * rather than raw turn count. Cosmetic and CROSS-MOD: it only stays aligned with
 * the Demographics mod if Demographics applies the identical normalization, so it
 * is gated separately and defaults OFF.
 * @param {number} turn The monotonic turn.
 * @returns {number} The normalized turn exponent.
 */
export function speedScaleTurn(turn) {
  if (!CONFIG.gameSpeedScalePopulation) return turn;
  const s = gameSpeedScalar();
  return s === 1 ? turn : turn / s;
}
