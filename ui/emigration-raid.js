// emigration-raid.js
//
// The MIGRATION layer of the "Talent Raid" diplomacy actions (Phase 4 §4b). The actions themselves
// , their Influence/token cost, 10-turn duration, the Grievance they land on the target, the lump
// yield they steal, the per-pair cooldown, and the diplomacy-screen UI , are NATIVE diplomacy
// actions owned by the Diplomacy Extended mod (data/talent-raid-actions.xml):
//   DIPLOMACY_ACTION_TALENT_RAID / CULTURAL_OFFENSIVE / TRADE_OFFENSIVE.
//
// This module only READS whether a civ has one of those active against a rival (the live
// Game.Diplomacy player events) and applies the emigration-specific effect on top:
//   1. TILT , pull the target's migration toward the raider while the op runs (pull.js raidTilt).
//   2. DIVIDEND , bank the raider the domain's carried dividend per migrant pulled FROM the target.
//
// Optional integration, exactly like the Demographics graphs: if Diplomacy Extended isn't installed
// the actions don't exist, getPlayerEvents returns none, and this whole layer is a silent no-op ,
// the rest of Emigration is unaffected.

import { CONFIG } from "/emigration/ui/emigration-config.js";

/** Native Diplomacy Extended raid action name → the domain it poaches + the dividend yield. */
/** @type {Record<string, {domain:string, yieldKey:string}>} */
const RAID_ACTION = {
  DIPLOMACY_ACTION_TALENT_RAID: { domain: "science", yieldKey: "YIELD_SCIENCE" },
  DIPLOMACY_ACTION_CULTURAL_OFFENSIVE: { domain: "culture", yieldKey: "YIELD_CULTURE" },
  DIPLOMACY_ACTION_TRADE_OFFENSIVE: { domain: "gold", yieldKey: "YIELD_GOLD" }
};

/**
 * A player's live diplomacy events, or [] when unreadable (Diplomacy API absent, etc.).
 * @param {number} pid Player id.
 * @returns {any[]} The events.
 */
function playerEvents(pid) {
  try {
    return Game?.Diplomacy?.getPlayerEvents?.(pid) || [];
  } catch (_) {
    return [];
  }
}

/**
 * The raider's active raid, read from the live diplomacy events, or null. A raid is any of the
 * native raid actions INITIATED by `raider` (initialPlayer === raider) and currently running.
 * @param {number} raider Player id.
 * @returns {{target:number, domain:string, yieldKey:string}|null} The raid, or null.
 */
export function raidOf(raider) {
  if (typeof raider !== "number") return null;
  for (const e of playerEvents(raider)) {
    const spec = RAID_ACTION[e?.actionTypeName];
    if (spec && e.initialPlayer === raider) {
      return { target: e.targetPlayer, domain: spec.domain, yieldKey: spec.yieldKey };
    }
  }
  return null;
}

/**
 * The TILT a raid adds when `destOwner` is raiding `srcOwner` (pull the target's people to the
 * raider). 0 otherwise. The engine clamps the total tilt to tiltCap.
 * @param {number} srcOwner Source civ.
 * @param {number} destOwner Destination civ.
 * @returns {number} The raid tilt (>= 0).
 */
export function raidTilt(srcOwner, destOwner) {
  const r = raidOf(destOwner);
  return r && r.target === srcOwner ? CONFIG.raidTilt : 0;
}

/**
 * On a migrant ARRIVING at a raider FROM its raid target, return the domain yield to bank as a
 * carried dividend (the §1b "raise yours" mirror). Null when the arrival isn't from the raider's
 * target (or there's no raid), so the dividend is gated to the rival the op actually aims at. The
 * Influence cost + Grievance are native (Diplomacy Extended); this is the reward side only.
 * @param {number} raiderOwner The receiving (raiding) civ.
 * @param {number} srcOwner The arriving migrant's source civ.
 * @returns {string|null} The yield to accrue a dividend in, or null.
 */
export function onRaidIntake(raiderOwner, srcOwner) {
  const r = raidOf(raiderOwner);
  return r && r.target === srcOwner ? r.yieldKey : null;
}
