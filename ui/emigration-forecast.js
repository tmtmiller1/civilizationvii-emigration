// emigration-forecast.js
//
// The departure forecast (roadmap §15, Feature M): a conservative projection, from the pressure gauge's own
// numbers, of when a settlement's pressure to leave reaches the bar and how many people go when it does. The
// pressure accumulates each pass toward the bar and empties into a departure when it fills; its recent samples
// (the stats store keeps the last few per source) give the rate of rise, so turns to the bar = (bar − pressure) /
// rate, plus any cooldown still running. People at the crossing = the per-city loss cap bounded by the rural pool
// above its floor, damped by a decay per turn of distance so a far projection reads smaller than a near one.
// Flat or falling pressure takes the stable branch. Pure: no engine reads.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import { speedBar } from "/emigration/ui/emigration-game-speed.js";

/** Per turn of distance, how much of the projected departure is kept: five turns out reads as about half. */
const FORECAST_DECAY = 0.85;
/** The horizon when the setting is unreadable. */
const DEFAULT_TURNS = 5;

/**
 * @typedef {Object} Forecast
 * @property {boolean} stable Flat or falling pressure, or the bar further off than the horizon: nobody is likely
 *   to leave soon.
 * @property {number} turns Turns until the pressure reaches the bar (0 when stable).
 * @property {number} people Population points likely to leave at the crossing (0 when stable).
 * @property {number} rate The recent rise per turn, as a fraction of the bar (0 or less when stable).
 */

/**
 * The recent rise per turn, as a fraction of the bar: the mean of the sample-to-sample differences, with the
 * current pressure as the latest sample. 0 when there is nothing to compare.
 * @param {number[]} series Recent pressures, oldest first. @param {number} now The current pressure.
 * @param {number} bar The bar. @returns {number} The rate (can be negative).
 */
function riseRate(series, now, bar) {
  const pts = series.filter((v) => Number.isFinite(v));
  // The samples are taken after each pass, so the last one is usually this turn's pressure already.
  if (!pts.length || Math.abs(pts[pts.length - 1] - now) > 1e-9) pts.push(now);
  if (pts.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < pts.length; i++) sum += pts[i] - pts[i - 1];
  return sum / (pts.length - 1) / bar;
}

/**
 * The forecast for one settlement, or null when the option is off.
 * @param {{pressure?:number, pressureToBar?:number, pressureSeries?:number[], onCooldown?:boolean,
 *   cooldown?:number, rural?:number}} s The readout snapshot (or its forecast-bearing fields).
 * @param {number} [turns] The horizon; `forecastTurns` when omitted.
 * @returns {Forecast|null} The forecast, or null when off.
 */
export function forecastFor(s, turns) {
  if (!CONFIG.cityReadoutForecast || !s) return null;
  const horizon = horizonOf(turns);
  const bar = speedBar(CONFIG.emigrationBar) > 0 ? speedBar(CONFIG.emigrationBar) : 1;
  const now = Number(s.pressure) || 0;
  const rate = riseRate(Array.isArray(s.pressureSeries) ? s.pressureSeries : [], now, bar);
  const stable = { stable: true, turns: 0, people: 0, rate };
  if (!(rate > 0)) return stable;
  const toBar = turnsToBar(s, fracOf(s, now, bar), rate);
  const people = peopleAt(s, toBar);
  return toBar > horizon || people <= 0 ? stable : { stable: false, turns: toBar, people, rate };
}

/** @param {number|undefined} turns The horizon asked for. @returns {number} The horizon in turns, at least 1. */
function horizonOf(turns) {
  return Math.max(1, Math.floor(Number(turns) || Number(CONFIG.forecastTurns) || DEFAULT_TURNS));
}

/**
 * @param {{pressureToBar?:number}} s The snapshot. @param {number} now The pressure. @param {number} bar The bar.
 * @returns {number} The pressure as a fraction of the bar, in [0, 1].
 */
function fracOf(s, now, bar) {
  const given = Number(s.pressureToBar);
  return Math.max(0, Math.min(1, Number.isFinite(given) ? given : now / bar));
}

/**
 * Turns to the bar at the recent rate; a cooldown still running holds any departure until it ends.
 * @param {{onCooldown?:boolean, cooldown?:number}} s The snapshot. @param {number} frac Pressure over the bar.
 * @param {number} rate The rise per turn. @returns {number} Whole turns, at least 1.
 */
function turnsToBar(s, frac, rate) {
  const cooldown = s.onCooldown ? Math.max(1, Math.floor(Number(s.cooldown) || 1)) : 0;
  return Math.max(1, Math.ceil((1 - frac) / rate)) + cooldown;
}

/**
 * People at the crossing: the per-city loss cap bounded by the rural pool above its floor, damped by the decay
 * per turn of distance. 0 when nobody may leave.
 * @param {{rural?:number}} s The snapshot. @param {number} toBar Turns to the crossing. @returns {number}
 */
function peopleAt(s, toBar) {
  const pool = Math.max(0, (Number(s.rural) || 0) - (Number(CONFIG.minRuralToEmigrate) || 0));
  if (pool <= 0) return 0;
  const atMost = Math.min(pool, Math.max(1, Number(CONFIG.maxLossPerCityPerTurn) || 1));
  return Math.max(1, Math.round(atMost * Math.pow(FORECAST_DECAY, toBar - 1)));
}

/**
 * The forecast as one line of English-keyed text: "About 3 people are likely to leave in the next 4 turns" or
 * "Nobody is likely to leave soon". Empty when the forecast is off.
 * @param {Forecast|null|undefined} f The forecast.
 * @param {(key:string, fallback:string, ...args:*[])=>string} loc The localizer.
 * @returns {string} The line, or "".
 */
export function forecastLine(f, loc) {
  if (!f) return "";
  if (f.stable) return loc("LOC_EMIG_FORECAST_STABLE", "Nobody is likely to leave soon");
  return loc("LOC_EMIG_FORECAST_LEAVE", "About {1_Count} people are likely to leave in the next {2_Turns} turns",
    f.people, f.turns);
}
