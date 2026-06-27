// emigration-tunables.js
//
// The single declarative source for which CONFIG values are exposed in the
// Options screen and how. Both the option UI (emigration-options.js) and the
// CONFIG-override wiring (emigration-settings.js) are generated from this list,
// so adding a knob is a one-line change here.
//
// Each entry maps to a CONFIG key. `bool` renders as a checkbox; `choice` renders
// as a dropdown over `values` (discrete values keep the control robust and exact,
// avoiding slider/float display quirks). Every CONFIG default must appear in its
// `values` list. `group` drives the Options section header ("Advanced -" groups).
//
// Scaling constants (scaleBase/scaleExp/scaleGrowth) are intentionally absent:
// they must match the Demographics mod and are not gameplay tunables.

/**
 * One exposed tunable.
 * @typedef {Object} Tunable
 * @property {string} key The CONFIG key it controls.
 * @property {string} group Section group id.
 * @property {"bool"|"choice"} type Control type.
 * @property {number[]} [values] Discrete choices (for `choice`).
 * @property {string} label LOC key for the label.
 * @property {string} desc LOC key for the description.
 */

/** @type {Tunable[]} */
export const TUNABLES = [
  // pacing
  { key: "emigrationBar", group: "pacing", type: "choice", values: [12, 18, 24, 30, 40, 55, 75], label: "LOC_EMIG_T_BAR", desc: "LOC_EMIG_T_BAR_D" },
  { key: "cooldownTurns", group: "pacing", type: "choice", values: [2, 4, 6, 8, 12, 18], label: "LOC_EMIG_T_COOLDOWN", desc: "LOC_EMIG_T_COOLDOWN_D" },
  { key: "maxMovesPerTurn", group: "pacing", type: "choice", values: [2, 4, 6, 8, 12, 20], label: "LOC_EMIG_T_MAXMOVES", desc: "LOC_EMIG_T_MAXMOVES_D" },
  { key: "turnInterval", group: "pacing", type: "choice", values: [1, 2, 3, 5], label: "LOC_EMIG_T_INTERVAL", desc: "LOC_EMIG_T_INTERVAL_D" },
  // scope
  { key: "crossCivEnabled", group: "scope", type: "bool", label: "LOC_EMIG_T_CROSSCIV", desc: "LOC_EMIG_T_CROSSCIV_D" },
  { key: "includeCityStates", group: "scope", type: "bool", label: "LOC_EMIG_T_CITYSTATES", desc: "LOC_EMIG_T_CITYSTATES_D" },
  { key: "requireMet", group: "scope", type: "bool", label: "LOC_EMIG_T_REQUIREMET", desc: "LOC_EMIG_T_REQUIREMET_D" },
  { key: "civTuningEnabled", group: "scope", type: "bool", label: "LOC_EMIG_T_CIVTUNE", desc: "LOC_EMIG_T_CIVTUNE_D" },
  { key: "civTuningStrength", group: "scope", type: "choice", values: [0, 0.4, 0.7, 1], label: "LOC_EMIG_T_CTSTRENGTH", desc: "LOC_EMIG_T_CTSTRENGTH_D" },
  { key: "bordersEnabled", group: "scope", type: "bool", label: "LOC_EMIG_T_BORDERS", desc: "LOC_EMIG_T_BORDERS_D" },
  { key: "closedBordersOpenness", group: "scope", type: "choice", values: [0.2, 0.4, 0.6, 0.8], label: "LOC_EMIG_T_CLOSEDOPEN", desc: "LOC_EMIG_T_CLOSEDOPEN_D" },
  { key: "closedBordersRetention", group: "scope", type: "choice", values: [0.4, 0.6, 0.8, 1], label: "LOC_EMIG_T_CLOSEDRETAIN", desc: "LOC_EMIG_T_CLOSEDRETAIN_D" },
  { key: "openBordersOpenness", group: "scope", type: "choice", values: [1.2, 1.5, 2, 3], label: "LOC_EMIG_T_OPENOPEN", desc: "LOC_EMIG_T_OPENOPEN_D" },
  // prosperity
  { key: "foodFactor", group: "prosperity", type: "choice", values: [0.5, 1, 1.5, 2], label: "LOC_EMIG_T_FOOD", desc: "LOC_EMIG_T_FOOD_D" },
  { key: "productionFactor", group: "prosperity", type: "choice", values: [0.5, 1, 1.5, 2], label: "LOC_EMIG_T_PROD", desc: "LOC_EMIG_T_PROD_D" },
  { key: "localHappinessFactor", group: "prosperity", type: "choice", values: [2, 4, 6, 9, 13], label: "LOC_EMIG_T_HAPPY", desc: "LOC_EMIG_T_HAPPY_D" },
  { key: "populationFactor", group: "prosperity", type: "choice", values: [0, 0.5, 1, 2], label: "LOC_EMIG_T_POP", desc: "LOC_EMIG_T_POP_D" },
  // prosperity - shaped happiness model (Algorithm A; off = legacy linear weight)
  { key: "happinessShaped", group: "prosperity", type: "bool", label: "LOC_EMIG_T_HSHAPED", desc: "LOC_EMIG_T_HSHAPED_D" },
  { key: "happyScale", group: "prosperity", type: "choice", values: [4, 6, 8, 12, 16], label: "LOC_EMIG_T_HSCALE", desc: "LOC_EMIG_T_HSCALE_D" },
  { key: "happyAmp", group: "prosperity", type: "choice", values: [0.4, 0.6, 0.8, 1.1, 1.5], label: "LOC_EMIG_T_HAMP", desc: "LOC_EMIG_T_HAMP_D" },
  // prosperity - overcrowding discount (Algorithm B; 0 = off)
  { key: "overcrowdDiscount", group: "prosperity", type: "choice", values: [0, 0.3, 0.6, 0.9], label: "LOC_EMIG_T_OCDISC", desc: "LOC_EMIG_T_OCDISC_D" },
  { key: "overcrowdThreshold", group: "prosperity", type: "choice", values: [1, 2, 3, 4], label: "LOC_EMIG_T_OCTHRESH", desc: "LOC_EMIG_T_OCTHRESH_D" },
  // war & violence
  { key: "violencePerPoint", group: "violence", type: "choice", values: [6, 9, 12, 16, 22], label: "LOC_EMIG_T_VPP", desc: "LOC_EMIG_T_VPP_D" },
  { key: "violenceCapPct", group: "violence", type: "choice", values: [120, 180, 220, 300], label: "LOC_EMIG_T_VCAP", desc: "LOC_EMIG_T_VCAP_D" },
  { key: "violenceDecay", group: "violence", type: "choice", values: [0.4, 0.55, 0.7, 0.85], label: "LOC_EMIG_T_VDECAY", desc: "LOC_EMIG_T_VDECAY_D" },
  { key: "violenceFleeThreshold", group: "violence", type: "choice", values: [1, 2, 3, 5], label: "LOC_EMIG_T_VFLEE", desc: "LOC_EMIG_T_VFLEE_D" },
  { key: "vwAssault", group: "violence", type: "choice", values: [5, 8, 10, 14, 20], label: "LOC_EMIG_T_VASSAULT", desc: "LOC_EMIG_T_VASSAULT_D" },
  { key: "vwSiege", group: "violence", type: "choice", values: [2, 3, 4, 6, 9], label: "LOC_EMIG_T_VSIEGE", desc: "LOC_EMIG_T_VSIEGE_D" },
  { key: "vwPillage", group: "violence", type: "choice", values: [0, 0.3, 0.6, 1, 1.5], label: "LOC_EMIG_T_VPILLAGE", desc: "LOC_EMIG_T_VPILLAGE_D" },
  // war - time-gated, capped siege displacement (Algorithm D; off = legacy flat penalty)
  { key: "warSiege", group: "violence", type: "bool", label: "LOC_EMIG_T_WARSIEGE", desc: "LOC_EMIG_T_WARSIEGE_D" },
  { key: "siegeRampTurns", group: "violence", type: "choice", values: [4, 6, 8, 12, 16], label: "LOC_EMIG_T_SRAMP", desc: "LOC_EMIG_T_SRAMP_D" },
  { key: "siegeLossCapPct", group: "violence", type: "choice", values: [0.4, 0.5, 0.6, 0.75, 0.9], label: "LOC_EMIG_T_SCAP", desc: "LOC_EMIG_T_SCAP_D" },
  { key: "warSurgeMax", group: "violence", type: "choice", values: [1, 2, 3, 5, 8], label: "LOC_EMIG_T_WARSURGE", desc: "LOC_EMIG_T_WARSURGE_D" },
  // war - aggressor-aware refugee flight (Feature 1; aggressorPenalty 0 = off)
  { key: "aggressorPenalty", group: "violence", type: "choice", values: [0, 6, 12, 18, 25], label: "LOC_EMIG_T_AGGRESSOR", desc: "LOC_EMIG_T_AGGRESSOR_D" },
  { key: "ownCivRefugeeBonus", group: "violence", type: "choice", values: [0, 2, 4, 8], label: "LOC_EMIG_T_OWNCIV", desc: "LOC_EMIG_T_OWNCIV_D" },
  // geography
  { key: "distanceFactor", group: "geography", type: "choice", values: [0.2, 0.4, 0.6, 0.9, 1.3], label: "LOC_EMIG_T_DIST", desc: "LOC_EMIG_T_DIST_D" },
  { key: "fleeFactor", group: "geography", type: "choice", values: [0, 3, 6, 10, 15], label: "LOC_EMIG_T_FLEE", desc: "LOC_EMIG_T_FLEE_D" },
  { key: "poachBlock", group: "geography", type: "choice", values: [4, 8, 12, 18, 25], label: "LOC_EMIG_T_POACH", desc: "LOC_EMIG_T_POACH_D" },
  { key: "crisisEscapeBonus", group: "geography", type: "choice", values: [0, 8, 14, 22, 32], label: "LOC_EMIG_T_ESCAPE", desc: "LOC_EMIG_T_ESCAPE_D" },
  { key: "openBordersBonus", group: "geography", type: "choice", values: [0, 4, 8, 14, 20], label: "LOC_EMIG_T_OPENDEAL", desc: "LOC_EMIG_T_OPENDEAL_D" },
  { key: "transitLagTurns", group: "geography", type: "choice", values: [0, 1, 2, 4, 6], label: "LOC_EMIG_T_TRANSITLAG", desc: "LOC_EMIG_T_TRANSITLAG_D" },
  // migration cost (real grantYield consequence on the destination civ)
  { key: "assimilationLoadPerMigrant", group: "cost", type: "choice", values: [0, 0.5, 1, 2], label: "LOC_EMIG_T_ASLOAD", desc: "LOC_EMIG_T_ASLOAD_D" },
  { key: "assimilationCostPerPop", group: "cost", type: "choice", values: [0, 0.02, 0.05, 0.1, 0.2], label: "LOC_EMIG_T_ASPOP", desc: "LOC_EMIG_T_ASPOP_D" },
  { key: "assimilationDecay", group: "cost", type: "choice", values: [0.4, 0.55, 0.7, 0.85], label: "LOC_EMIG_T_ASDECAY", desc: "LOC_EMIG_T_ASDECAY_D" },
  { key: "assimilationHappiness", group: "cost", type: "choice", values: [0, 0.25, 0.5, 1, 2], label: "LOC_EMIG_T_ASHAP", desc: "LOC_EMIG_T_ASHAP_D" },
  { key: "assimilationGold", group: "cost", type: "choice", values: [0, 0.5, 1, 1.5, 3], label: "LOC_EMIG_T_ASGOLD", desc: "LOC_EMIG_T_ASGOLD_D" },
  { key: "migrantHoldHappiness", group: "cost", type: "choice", values: [0, 0.5, 1, 2], label: "LOC_EMIG_T_MHHAP", desc: "LOC_EMIG_T_MHHAP_D" },
  { key: "migrantHoldGold", group: "cost", type: "choice", values: [0, 1, 2, 5], label: "LOC_EMIG_T_MHGOLD", desc: "LOC_EMIG_T_MHGOLD_D" },
  // congestion headwind (Algorithm C; 0 = off)
  { key: "congestWeight", group: "cost", type: "choice", values: [0, 2, 4, 8], label: "LOC_EMIG_T_CONGEST", desc: "LOC_EMIG_T_CONGEST_D" },
  // anti-snowball headwind: 0 off / 8 gentle / 15 standard / 28 strong
  { key: "antiSnowballWeight", group: "cost", type: "choice", values: [0, 8, 15, 28], label: "LOC_EMIG_T_ANTISNOWBALL", desc: "LOC_EMIG_T_ANTISNOWBALL_D" },
  // anti-snowball trigger: fair-share population multiple a civ may reach before the brake bites
  { key: "antiSnowballThreshold", group: "cost", type: "choice", values: [1, 1.25, 1.5, 2], label: "LOC_EMIG_T_ANTISNOWTHRESH", desc: "LOC_EMIG_T_ANTISNOWTHRESH_D" },
  // environmental disasters as a migration driver (§11; off by default)
  { key: "disastersEnabled", group: "disaster", type: "bool", label: "LOC_EMIG_T_DISASTERS", desc: "LOC_EMIG_T_DISASTERS_D" },
  { key: "disasterPerPoint", group: "disaster", type: "choice", values: [6, 8, 10, 14, 20], label: "LOC_EMIG_T_DPP", desc: "LOC_EMIG_T_DPP_D" },
  { key: "disasterDecay", group: "disaster", type: "choice", values: [0.4, 0.55, 0.7, 0.85], label: "LOC_EMIG_T_DDECAY", desc: "LOC_EMIG_T_DDECAY_D" },
  { key: "disasterImpactScalingEnabled", group: "disaster", type: "bool", label: "LOC_EMIG_T_DIMPACT", desc: "LOC_EMIG_T_DIMPACT_D" },
  { key: "disasterImpactGamma", group: "disaster", type: "choice", values: [0.5, 0.6, 0.75, 1], label: "LOC_EMIG_T_DGAMMA", desc: "LOC_EMIG_T_DGAMMA_D" },
  { key: "disasterSpeedShockEnabled", group: "disaster", type: "bool", label: "LOC_EMIG_T_DSHOCK", desc: "LOC_EMIG_T_DSHOCK_D" },
  { key: "plagueCarryEnabled", group: "disaster", type: "bool", label: "LOC_EMIG_T_PLAGUECARRY", desc: "LOC_EMIG_T_PLAGUECARRY_D" },
  // notifications (anti-spam controls)
  { key: "notifyMode", group: "notify", type: "choice", values: [0, 1, 2], label: "LOC_EMIG_T_NOTIFYMODE", desc: "LOC_EMIG_T_NOTIFYMODE_D" },
  { key: "disasterNotifyMinSeverity", group: "notify", type: "choice", values: [0, 1, 2, 3], label: "LOC_EMIG_T_NOTIFYDISASTER", desc: "LOC_EMIG_T_NOTIFYDISASTER_D" },
  { key: "disasterNotifyMode", group: "notify", type: "choice", values: [0, 1, 2], label: "LOC_EMIG_T_DNOTIFYMODE", desc: "LOC_EMIG_T_DNOTIFYMODE_D" },
  { key: "notifyCooldownTurns", group: "notify", type: "choice", values: [0, 3, 6, 10, 20], label: "LOC_EMIG_T_NOTIFYCD", desc: "LOC_EMIG_T_NOTIFYCD_D" },
  { key: "worldRefugeeThreshold", group: "notify", type: "choice", values: [20000, 40000, 80000, 150000], label: "LOC_EMIG_T_NOTIFYWORLD", desc: "LOC_EMIG_T_NOTIFYWORLD_D" },
  { key: "cityReadoutEnabled", group: "notify", type: "bool", label: "LOC_EMIG_T_CITYREADOUT", desc: "LOC_EMIG_T_CITYREADOUT_D" },
  // outlet - attrition when there's nowhere to flee (the pressure-release valve)
  { key: "attritionEnabled", group: "outlet", type: "bool", label: "LOC_EMIG_T_ATTRITION", desc: "LOC_EMIG_T_ATTRITION_D" },
  { key: "attritionMinDistress", group: "outlet", type: "choice", values: [40, 80, 120, 200], label: "LOC_EMIG_T_ATTRDISTRESS", desc: "LOC_EMIG_T_ATTRDISTRESS_D" },
  { key: "attritionThreshold", group: "outlet", type: "choice", values: [20, 40, 70, 120], label: "LOC_EMIG_T_ATTRTHRESH", desc: "LOC_EMIG_T_ATTRTHRESH_D" }
];

/**
 * Preset profiles for the overall intensity knobs (a subset of TUNABLES keys).
 * Applying one writes these values; the rest stay at their current/advanced
 * values. "medium" equals the shipped CONFIG defaults. Every value here must
 * appear in the matching tunable's `values` list.
 * @type {Record<string, Record<string, number>>}
 */
export const PRESETS = {
  low: {
    emigrationBar: 55, cooldownTurns: 12, maxMovesPerTurn: 4,
    violencePerPoint: 9, distanceFactor: 0.9, fleeFactor: 3
  },
  medium: {
    emigrationBar: 30, cooldownTurns: 8, maxMovesPerTurn: 8,
    violencePerPoint: 12, distanceFactor: 0.6, fleeFactor: 6
  },
  high: {
    emigrationBar: 18, cooldownTurns: 4, maxMovesPerTurn: 12,
    violencePerPoint: 16, distanceFactor: 0.4, fleeFactor: 10
  }
};

/** Preset dropdown order. "custom" = leave individual/advanced values as-is. */
export const PRESET_NAMES = ["custom", "low", "medium", "high"];
