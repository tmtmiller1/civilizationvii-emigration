// emigration-governance.js
//
// Analytics-visibility masking for the migration dashboard + lens, reusing the Demographics mod's
// governance policy (combined design plan / global-simulation plan). The migration simulation can
// run globally (all alive civs), but the player-facing UI must still hide civs the policy withholds,
// so this resolves the same effective policy Demographics uses and exposes one `civHidden(pid)`
// predicate every emigration view masks by.
//
// Cross-mod sharing without a hard dependency (the two mods are separate and either may be absent):
//   • Host ceiling: read the same `GameConfiguration` key Demographics' host writes, so a host's
//     choice governs both mods at once.
//   • Local preference: read Demographics' own setting from the shared `localStorage.modSettings`
//     slice when present; otherwise default to met-civs-only (today's behavior).
// Emigration only reads the policy; Demographics owns the control UI. Reads fail safe to hiding
// (never leak) on error.
//
// Policy levels, least → most permissive: disabled, own-civ-only, met-civs-only, full.

import { getVisibilityOverride } from "/emigration/ui/emigration-settings.js";

const POLICY_DISABLED = "disabled";
const POLICY_OWN = "own-civ-only";
const POLICY_MET = "met-civs-only";
const POLICY_FULL = "full";

/** @type {Record<string, number>} */
const RANK = { [POLICY_DISABLED]: 0, [POLICY_OWN]: 1, [POLICY_MET]: 2, [POLICY_FULL]: 3 };

// Shared with the Demographics mod so one host policy governs both.
const HOST_POLICY_KEY = "DemographicsAnalyticsPolicy_v1";
// The effective policy Demographics publishes to GameConfiguration (host ceiling ∧ local preference).
// This is the primary source: Coherent UI wipes the shared localStorage between reads, so reading
// Demographics' settings slice from localStorage returns stale/empty and we'd never see the player's
// choice. GameConfiguration is durable and shared across mods, so the published value is reliable.
const EFFECTIVE_POLICY_KEY = "DemographicsAnalyticsPolicyEffective_v1";

/** @param {*} v */
function asPolicy(v) {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(RANK, v) ? v : null;
}

/**
 * Read a policy id from a GameConfiguration key, or null when unset/unreadable.
 * @param {string} key The GameConfiguration key.
 * @returns {string|null}
 */
function gameConfigPolicy(key) {
  try {
    const g = typeof Configuration !== "undefined" ? Configuration.getGame?.() : null;
    const raw = g && typeof g.getValue === "function" ? g.getValue(key) : null;
    return asPolicy(raw);
  } catch (_) {
    return null;
  }
}

/** The host-set ceiling from GameConfiguration (shared with Demographics), or null when unset. */
function hostPolicy() {
  return gameConfigPolicy(HOST_POLICY_KEY);
}

/**
 * The effective policy Demographics published to GameConfiguration, or null when it hasn't. The
 * per-seat key (Demographics 2.7.3 and later) is read first: GameConfiguration is one shared
 * document in a networked game, so the single key holds whichever seat wrote it last.
 * @returns {string|null}
 */
function publishedPolicy() {
  try {
    const pid = typeof GameContext !== "undefined" ? GameContext.localPlayerID : -1;
    if (typeof pid === "number" && pid >= 0) {
      const mine = gameConfigPolicy(EFFECTIVE_POLICY_KEY + "_P" + pid);
      if (mine) return mine;
    }
  } catch (_) {
    /* GameContext absent off-engine; fall through to the shared key */
  }
  return gameConfigPolicy(EFFECTIVE_POLICY_KEY);
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
 * The effective policy. Emigration's own visibility override (Options ▸ Mods ▸ Emigration) comes first:
 * 1 = always hide unmet, 2 = always show all, a self-contained control that always works for the
 * Emigration tabs (the cross-mod reads below are unreliable in the Coherent UI). When that's "auto"
 * (0, the default), follow Demographics: the value it publishes to GameConfiguration (already
 * host ceiling ∧ local preference), or failing that the host ceiling ∧ our own localStorage read.
 * @returns {string} A policy id.
 */
export function effectivePolicy() {
  const override = getVisibilityOverride();
  if (override === 1) return POLICY_MET;
  if (override === 2) return POLICY_FULL;
  const published = publishedPolicy();
  if (published) return published;
  const local = localPolicy();
  const host = hostPolicy();
  if (!host) return local;
  return RANK[host] <= RANK[local] ? host : local;
}

/**
 * Whether the effective policy restricts views to the local civ only (own-civ-only / disabled).
 * @returns {boolean}
 */
function policyOwnCivOnly() {
  return RANK[effectivePolicy()] <= RANK[POLICY_OWN];
}

function policyHidesUnmet() {
  return effectivePolicy() !== POLICY_FULL;
}

/**
 * The local player id, or undefined.
 * @returns {number|undefined}
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

/** @param {number} pid */
function isLocalCiv(pid) {
  const me = localPlayerId();
  return me !== undefined && Number(pid) === me;
}

/**
 * Whether the local player has met `pid` (self always met). Fails safe to unmet (hide) on error.
 * @param {number} pid
 * @returns {boolean}
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
 * Whether a civ must be hidden from the player-facing migration dashboard/lens under the effective
 * policy: own-civ-only / disabled hides every non-local civ; met-civs-only hides unmet civs; full
 * hides nothing. The local player's own civ is never hidden. Fails safe to hidden (never leak) on
 * error. The migration simulation never consults this; masking is presentation-only.
 * @param {number} pid
 * @returns {boolean}
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
