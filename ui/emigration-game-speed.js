// emigration-game-speed.js
//
// Game-speed scaling. The engine paces in turns, but Civ's game speed stretches the same progress over
// a different number of turns (GameSpeeds.CostMultiplier / 100 = a scalar S of 0.5-3.0). This module
// reads S once (cached, fail-safe to 1.0) and exposes the transforms applied at CONFIG read sites so
// the game-time feel is constant: turn-counts ×S, thresholds ×S, decay ^(1/S), shocks ÷S.
// Speed-invariant magnitudes (caps, intensity thresholds, yield weights) are left unscaled.
// Gated on CONFIG.gameSpeedTuningEnabled; identity (S=1) whenever the engine globals are absent.

import { CONFIG } from "/emigration/ui/emigration-config.js";

/** @type {number|null} Cached session scalar (one game = one speed). */
let _cached = null;

/**
 * The active GameSpeed type hash, mirroring the base UI's
 * `const { gameSpeedType } = Configuration.getGame()`. Null when unavailable.
 * @returns {*}
 */
function readSpeedType() {
  const g = Configuration.getGame ? Configuration.getGame() : null;
  const type = g ? g.gameSpeedType : undefined;
  return type == null ? null : type;
}

/**
 * The CostMultiplier for a speed type (Standard = 100), via GameInfo.GameSpeeds.lookup.
 * @param {*} type The GameSpeed type.
 * @returns {number}
 */
function lookupMultiplier(type) {
  const row = GameInfo.GameSpeeds && GameInfo.GameSpeeds.lookup
    ? GameInfo.GameSpeeds.lookup(type) : null;
  return row && typeof row.CostMultiplier === "number" ? row.CostMultiplier : 100;
}

/**
 * Read the raw speed scalar from the engine: CostMultiplier/100 of the active
 * GameSpeed (Standard = 1.0).
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
 * @returns {number}
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
 * Scale a turn-count duration so it spans the same game-time at any speed
 * (×S, rounded, floored at 1 so a positive duration never collapses to 0).
 * @param {number} turns The Standard-speed turn count.
 * @returns {number}
 */
export function speedTurns(turns) {
  const s = gameSpeedScalar();
  if (s === 1 || !(turns > 0)) return turns;
  return Math.max(1, Math.round(turns * s));
}

/**
 * Scale a per-turn pressure threshold by S so accumulation crosses the bar in the
 * same game-time (more turns on slow speeds, fewer on fast).
 * @param {number} x The Standard-speed threshold.
 * @returns {number}
 */
export function speedBar(x) {
  const s = gameSpeedScalar();
  return s === 1 ? x : x * s;
}

/**
 * Re-base a per-turn decay factor to d^(1/S) so a transient fades over the same
 * game-time (gentler per turn on slow speeds, sharper on fast). Clamped to (0,1).
 * @param {number} d The Standard-speed per-turn retention in [0,1).
 * @returns {number}
 */
export function speedDecay(d) {
  const s = gameSpeedScalar();
  if (s === 1 || !(d > 0) || d >= 1) return d;
  return Math.min(0.999, Math.max(0.001, Math.pow(d, 1 / s)));
}

/**
 * Scale a one-shot shock magnitude by 1/S. A shock fades over the same game-time at any speed (see
 * {@link speedDecay}), so dividing it by S keeps the area under the decay curve (the total bite)
 * speed-invariant. Fail-safe to identity at Standard (S=1) or non-positive input.
 * @param {number} x The Standard-speed shock magnitude.
 * @returns {number}
 */
export function speedShock(x) {
  const s = gameSpeedScalar();
  return s === 1 || !(x > 0) ? x : x / s;
}

/**
 * Normalize a monotonic turn for the historical population scaling exponent (scaleGrowth^(turn/S))
 * so the "representative people" curve tracks game progress. Cosmetic and cross-mod (only aligned
 * with Demographics if that mod applies the same normalization), so it is gated separately.
 * @param {number} turn The monotonic turn.
 * @returns {number} The normalized turn exponent.
 */
export function speedScaleTurn(turn) {
  if (!CONFIG.gameSpeedScalePopulation) return turn;
  const s = gameSpeedScalar();
  return s === 1 ? turn : turn / s;
}
