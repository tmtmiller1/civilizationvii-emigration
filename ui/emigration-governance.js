// emigration-governance.js
//
// Analytics-visibility masking for the migration dashboard + lens, REUSING the Demographics mod's
// governance policy (combined design plan / global-simulation plan). The migration simulation can
// run globally (all alive civs), but the player-facing UI must still hide civs the policy withholds
// — so this resolves the SAME effective policy Demographics uses and exposes one `civHidden(pid)`
// predicate every emigration view masks by.
//
// Cross-mod sharing without a hard dependency (the two mods are separate and either may be absent):
//   • Host ceiling: read the SAME `GameConfiguration` key Demographics' host writes, so a host's
//     choice governs both mods at once.
//   • Local preference: read Demographics' own setting from the shared `localStorage.modSettings`
//     slice when present; otherwise default to met-civs-only (today's behaviour).
// Emigration only READS the policy — Demographics owns the control UI. Reads fail safe to HIDING
// (never leak) on error.
//
// Policy levels, least → most permissive: disabled, own-civ-only, met-civs-only, full.

export const POLICY_DISABLED = "disabled";
export const POLICY_OWN = "own-civ-only";
export const POLICY_MET = "met-civs-only";
export const POLICY_FULL = "full";

/** @type {Record<string, number>} */
const RANK = { [POLICY_DISABLED]: 0, [POLICY_OWN]: 1, [POLICY_MET]: 2, [POLICY_FULL]: 3 };

// Shared with the Demographics mod so one host policy governs both.
const HOST_POLICY_KEY = "DemographicsAnalyticsPolicy_v1";

/**
 * A known policy id, or null.
 * @param {*} v Candidate.
 * @returns {string|null} The policy id, or null.
 */
function asPolicy(v) {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(RANK, v) ? v : null;
}

/**
 * The host-set ceiling from GameConfiguration (shared with Demographics), or null when unset.
 * @returns {string|null} A policy id, or null.
 */
function hostPolicy() {
  try {
    const g = typeof Configuration !== "undefined" ? Configuration.getGame?.() : null;
    const raw = g && typeof g.getValue === "function" ? g.getValue(HOST_POLICY_KEY) : null;
    return asPolicy(raw);
  } catch (_) {
    return null;
  }
}

/**
 * The local preference, read from Demographics' shared `localStorage.modSettings.demographics`
 * slice when present (so the two mods agree), else met-civs-only. Fails safe to met-civs-only.
 * @returns {string} A policy id.
 */
function localPolicy() {
  try {
    if (typeof localStorage === "undefined" || !localStorage) return POLICY_MET;
    const root = JSON.parse(localStorage.getItem("modSettings") || "{}");
    const slice = root && root.demographics;
    if (slice && typeof slice === "object") {
      const explicit = asPolicy(slice.analyticsPolicy);
      if (explicit) return explicit;
      if (slice.hideUnmetStats === false) return POLICY_FULL; // legacy spoiler-off
    }
  } catch (_) {
    /* ignore */
  }
  return POLICY_MET;
}

/**
 * The effective policy: the more restrictive of the shared host ceiling and the local preference.
 * @returns {string} A policy id.
 */
export function effectivePolicy() {
  const local = localPolicy();
  const host = hostPolicy();
  if (!host) return local;
  return RANK[host] <= RANK[local] ? host : local;
}

/**
 * Whether the effective policy restricts views to the local civ only (own-civ-only / disabled).
 * @returns {boolean} True when only the local civ may be shown.
 */
export function policyOwnCivOnly() {
  return RANK[effectivePolicy()] <= RANK[POLICY_OWN];
}

/**
 * Whether the effective policy hides unmet civs (anything other than full).
 * @returns {boolean} True to hide unmet civs.
 */
export function policyHidesUnmet() {
  return effectivePolicy() !== POLICY_FULL;
}

/**
 * The local player id, or undefined.
 * @returns {number|undefined} Local player id.
 */
export function localPlayerId() {
  try {
    if (typeof GameContext !== "undefined" && typeof GameContext.localPlayerID === "number") {
      return GameContext.localPlayerID;
    }
  } catch (_) {
    /* ignore */
  }
  return undefined;
}

/**
 * Whether `pid` is the local player's own civ.
 * @param {number} pid Player id.
 * @returns {boolean} True when local.
 */
export function isLocalCiv(pid) {
  const me = localPlayerId();
  return me !== undefined && Number(pid) === me;
}

/**
 * Whether the local player has met `pid` (self always met). Fails safe to UNMET (hide) on error.
 * @param {number} pid Player id.
 * @returns {boolean} True when met.
 */
function hasMet(pid) {
  try {
    const me = GameContext.localPlayerID;
    if (Number(pid) === me) return true;
    return !!Players.get(me)?.Diplomacy?.hasMet?.(Number(pid));
  } catch (_) {
    return false;
  }
}

/**
 * Whether a civ must be HIDDEN from the player-facing migration dashboard/lens under the effective
 * policy: own-civ-only / disabled hides every non-local civ; met-civs-only hides unmet civs; full
 * hides nothing. The local player's own civ is never hidden. Fails safe to HIDDEN (never leak) on
 * error. The migration SIMULATION never consults this — masking is presentation-only.
 * @param {number} pid Player id.
 * @returns {boolean} True to hide the civ from display.
 */
export function civHidden(pid) {
  try {
    if (isLocalCiv(pid)) return false;
    if (policyOwnCivOnly()) return true;
    return policyHidesUnmet() && !hasMet(pid);
  } catch (_) {
    return true;
  }
}
