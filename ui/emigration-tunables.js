// emigration-tunables.js
//
// The single declarative source for which CONFIG values are exposed in the Options screen and how;
// emigration-options.js and emigration-settings.js are both generated from this list. Each entry maps
// to a CONFIG key: `bool` renders as a checkbox, `choice` as a dropdown over `values` (every CONFIG
// default must appear in it), and `group` drives the Options section header.

/**
 * One exposed tunable.
 * @typedef {Object} Tunable
 * @property {string} key The CONFIG key it controls.
 * @property {string} group Section group id.
 * @property {"bool"|"choice"} type Control type.
 * @property {number[]} [values] Discrete choices (for `choice`).
 * @property {string[]} [choiceLabels] Optional human labels for each `values` entry (enum-style knobs;
 *   the Advanced editor shows these instead of the raw number). Index-aligned with `values`.
 * @property {"pct"|"frac"|"mult"|"turns"|"every"|"count"} [format] How a `choice` value reads in a dropdown:
 *   pct = already a percentage (12 -> "12%"), frac = a fraction shown as one (0.55 -> "55%"), mult = a multiplier
 *   ("×1.5"), turns = a number of turns ("3 turns"), every = a period ("Every 2 turns"), count = a large number.
 *   Omitted = the number as written. The unit lives in the value, not the label.
 * @property {Record<string, string>} [special] LOC keys for particular values that mean something in words
 *   (0 = "Off", 0 turns = "Instant"), keyed by the value as a string.
 * @property {string} label LOC key for the label.
 * @property {string} desc LOC key for the description.
 */

/**
 * The diaspora "foothold" share milestone — a FIXED chronicle-only threshold (not a player option).
 * It lives in this leaf module (which imports nothing) so that BOTH emigration-diaspora.js and
 * emigration-composition.js can read it without importing each other (an import cycle can be fatal at load).
 */
export const QUARTER_FOOTHOLD_SHARE = 0.25;

/**
 * The advanced-settings sections in display order, each with its title. Shared by the Options-tab accordion and
 * the search-and-reset window, so both list the same sections in the same order.
 * @type {Array<{key:string, title:string}>}
 */
export const ADVANCED_GROUPS = [
  { key: "pacing", title: "LOC_EMIG_ADVGRP_PACING" },
  { key: "scope", title: "LOC_EMIG_ADVGRP_SCOPE" },
  { key: "borders", title: "LOC_EMIG_ADVGRP_BORDERS" },
  { key: "prosperity", title: "LOC_EMIG_ADVGRP_PROSPERITY" },
  { key: "violence", title: "LOC_EMIG_ADVGRP_VIOLENCE" },
  { key: "disaster", title: "LOC_EMIG_ADVGRP_DISASTER" },
  { key: "geography", title: "LOC_EMIG_ADVGRP_GEOGRAPHY" },
  { key: "cost", title: "LOC_EMIG_ADVGRP_COST" },
  { key: "brakes", title: "LOC_EMIG_ADVGRP_BRAKES" },
  { key: "arrivals", title: "LOC_EMIG_ADVGRP_ARRIVALS" },
  { key: "enclaves", title: "LOC_EMIG_ADVGRP_ENCLAVES" },
  { key: "callhome", title: "LOC_EMIG_ADVGRP_CALLHOME" },
  { key: "outlet", title: "LOC_EMIG_ADVGRP_OUTLET" },
  { key: "notify", title: "LOC_EMIG_ADVGRP_NOTIFY" },
  { key: "readout", title: "LOC_EMIG_ADVGRP_READOUT" },
  { key: "visuals", title: "LOC_EMIG_ADVGRP_VISUALS" }
];

// The Advanced window's collapsible sections, in render order. Each gathers several ADVANCED_GROUPS, which
// show as plain sub-headings inside it; every group belongs to exactly one section (tests/tunables.mjs).
export const ADVANCED_SECTIONS = [
  { key: "movement", title: "LOC_EMIG_ADVSEC_MOVEMENT", groups: ["pacing", "scope", "borders", "geography"] },
  { key: "causes", title: "LOC_EMIG_ADVSEC_CAUSES", groups: ["prosperity", "violence", "disaster"] },
  { key: "balance", title: "LOC_EMIG_ADVSEC_BALANCE", groups: ["cost", "brakes", "outlet", "arrivals"] },
  { key: "communities", title: "LOC_EMIG_ADVSEC_COMMUNITIES", groups: ["enclaves", "callhome"] },
  { key: "display", title: "LOC_EMIG_ADVSEC_DISPLAY", groups: ["notify", "readout", "visuals"] }
];

/** @type {Tunable[]} */
export const TUNABLES = [
  // Pacing
  { key: "emigrationBar", group: "pacing", type: "choice", values: [12, 18, 24, 30, 40, 55, 75], label: "LOC_EMIG_T_BAR", desc: "LOC_EMIG_T_BAR_D" },
  { key: "pressureRetention", group: "pacing", type: "choice", values: [0.7, 0.8, 0.85, 0.9, 0.95, 0.98, 1], format: "frac", special: {"1": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_PRETAIN", desc: "LOC_EMIG_T_PRETAIN_D" },
  { key: "cooldownTurns", group: "pacing", type: "choice", values: [2, 4, 6, 8, 12, 18], format: "turns", label: "LOC_EMIG_T_COOLDOWN", desc: "LOC_EMIG_T_COOLDOWN_D" },
  { key: "maxMovesPerTurn", group: "pacing", type: "choice", values: [2, 4, 6, 8, 12, 20], label: "LOC_EMIG_T_MAXMOVES", desc: "LOC_EMIG_T_MAXMOVES_D" },
  { key: "maxLossPerCityPerTurn", group: "pacing", type: "choice", values: [1, 2, 3, 4, 8], label: "LOC_EMIG_T_MAXLOSS", desc: "LOC_EMIG_T_MAXLOSS_D" },
  { key: "maxGainPerCityPerTurn", group: "pacing", type: "choice", values: [2, 4, 8, 16], label: "LOC_EMIG_T_MAXGAIN", desc: "LOC_EMIG_T_MAXGAIN_D" },
  { key: "turnInterval", group: "pacing", type: "choice", values: [1, 2, 3, 5], format: "every", special: {"1": "LOC_EMIG_CHOICE_EVERY_TURN"}, label: "LOC_EMIG_T_INTERVAL", desc: "LOC_EMIG_T_INTERVAL_D" },
  // Scope
  { key: "crossCivEnabled", group: "scope", type: "bool", label: "LOC_EMIG_T_CROSSCIV", desc: "LOC_EMIG_T_CROSSCIV_D" },
  { key: "includeCityStates", group: "scope", type: "bool", label: "LOC_EMIG_T_CITYSTATES", desc: "LOC_EMIG_T_CITYSTATES_D" },
  { key: "requireMet", group: "scope", type: "bool", label: "LOC_EMIG_T_REQUIREMET", desc: "LOC_EMIG_T_REQUIREMET_D" },
  { key: "civTuningEnabled", group: "scope", type: "bool", label: "LOC_EMIG_T_CIVTUNE", desc: "LOC_EMIG_T_CIVTUNE_D" },
  { key: "civTuningStrength", group: "scope", type: "choice", values: [0, 0.4, 0.7, 1], format: "frac", special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_CTSTRENGTH", desc: "LOC_EMIG_T_CTSTRENGTH_D" },
  // Border policies
  { key: "bordersEnabled", group: "borders", type: "bool", label: "LOC_EMIG_T_BORDERS", desc: "LOC_EMIG_T_BORDERS_D" },
  { key: "closedBordersOpenness", group: "borders", type: "choice", values: [0.2, 0.4, 0.6, 0.8], format: "frac", label: "LOC_EMIG_T_CLOSEDOPEN", desc: "LOC_EMIG_T_CLOSEDOPEN_D" },
  { key: "closedBordersRetention", group: "borders", type: "choice", values: [0.4, 0.6, 0.8, 1], format: "frac", special: {"1": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_CLOSEDRETAIN", desc: "LOC_EMIG_T_CLOSEDRETAIN_D" },
  { key: "openBordersOpenness", group: "borders", type: "choice", values: [1.2, 1.5, 2, 3], format: "mult", label: "LOC_EMIG_T_OPENOPEN", desc: "LOC_EMIG_T_OPENOPEN_D" },
  // Prosperity model
  { key: "foodFactor", group: "prosperity", type: "choice", values: [0.5, 1, 1.5, 2], format: "mult", label: "LOC_EMIG_T_FOOD", desc: "LOC_EMIG_T_FOOD_D" },
  { key: "productionFactor", group: "prosperity", type: "choice", values: [0.5, 1, 1.5, 2], format: "mult", label: "LOC_EMIG_T_PROD", desc: "LOC_EMIG_T_PROD_D" },
  { key: "localHappinessFactor", group: "prosperity", type: "choice", values: [2, 4, 6, 9, 13], label: "LOC_EMIG_T_HAPPY", desc: "LOC_EMIG_T_HAPPY_D" },
  { key: "popExponent", group: "prosperity", type: "choice", values: [0.7, 0.8, 0.85, 0.9, 1], format: "frac", special: {"1": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_POPEXP", desc: "LOC_EMIG_T_POPEXP_D" },
  { key: "builtEnabled", group: "prosperity", type: "bool", label: "LOC_EMIG_T_BUILT", desc: "LOC_EMIG_T_BUILT_D" },
  { key: "builtCap", group: "prosperity", type: "choice", values: [0, 3, 6, 10, 16], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_BUILTCAP", desc: "LOC_EMIG_T_BUILTCAP_D" },
  { key: "perFewerPop", group: "brakes", type: "choice", values: [0, 0.25, 0.5, 0.75, 1], format: "frac", special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_PERFEWER", desc: "LOC_EMIG_T_PERFEWER_D" },
  { key: "populationFactor", group: "prosperity", type: "choice", values: [0, 0.5, 1, 2], format: "mult", special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_POP", desc: "LOC_EMIG_T_POP_D" },
  // prosperity - shaped happiness model (Algorithm A; off = legacy linear weight)
  { key: "happinessShaped", group: "prosperity", type: "bool", label: "LOC_EMIG_T_HSHAPED", desc: "LOC_EMIG_T_HSHAPED_D" },
  { key: "happyScale", group: "prosperity", type: "choice", values: [4, 6, 8, 12, 16], label: "LOC_EMIG_T_HSCALE", desc: "LOC_EMIG_T_HSCALE_D" },
  { key: "happyAmp", group: "prosperity", type: "choice", values: [0.4, 0.6, 0.8, 1.1, 1.5], format: "mult", label: "LOC_EMIG_T_HAMP", desc: "LOC_EMIG_T_HAMP_D" },
  // prosperity - overcrowding discount (Algorithm B; 0 = off)
  { key: "overcrowdDiscount", group: "prosperity", type: "choice", values: [0, 0.3, 0.6, 0.9], format: "frac", special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_OCDISC", desc: "LOC_EMIG_T_OCDISC_D" },
  { key: "overcrowdThreshold", group: "prosperity", type: "choice", values: [1, 2, 3, 4], label: "LOC_EMIG_T_OCTHRESH", desc: "LOC_EMIG_T_OCTHRESH_D" },
  // War & violence
  { key: "violencePerPoint", group: "violence", type: "choice", values: [6, 9, 12, 16, 22], format: "pct", label: "LOC_EMIG_T_VPP", desc: "LOC_EMIG_T_VPP_D" },
  { key: "violenceCapPct", group: "violence", type: "choice", values: [120, 180, 220, 300], format: "pct", label: "LOC_EMIG_T_VCAP", desc: "LOC_EMIG_T_VCAP_D" },
  { key: "violenceDecay", group: "violence", type: "choice", values: [0.4, 0.55, 0.7, 0.85], format: "frac", label: "LOC_EMIG_T_VDECAY", desc: "LOC_EMIG_T_VDECAY_D" },
  { key: "violenceFleeThreshold", group: "violence", type: "choice", values: [1, 2, 3, 5], label: "LOC_EMIG_T_VFLEE", desc: "LOC_EMIG_T_VFLEE_D" },
  { key: "vwAssault", group: "violence", type: "choice", values: [5, 8, 10, 14, 20], label: "LOC_EMIG_T_VASSAULT", desc: "LOC_EMIG_T_VASSAULT_D" },
  { key: "vwSiege", group: "violence", type: "choice", values: [2, 3, 4, 6, 9], label: "LOC_EMIG_T_VSIEGE", desc: "LOC_EMIG_T_VSIEGE_D" },
  { key: "majorViolenceScale", group: "violence", type: "choice", values: [0, 0.5, 1, 1.5, 2], format: "mult", special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_MAJORVIOL", desc: "LOC_EMIG_T_MAJORVIOL_D" },
  { key: "siegeBesiegedFloor", group: "violence", type: "choice", values: [0, 0.15, 0.3, 0.45, 0.6], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_SIEGEFLOOR", desc: "LOC_EMIG_T_SIEGEFLOOR_D" },
  { key: "minorViolenceScale", group: "violence", type: "choice", values: [0.15, 0.4, 0.7, 1], format: "mult", label: "LOC_EMIG_T_MINORVIOL", desc: "LOC_EMIG_T_MINORVIOL_D" },
  { key: "minorSiegeBesiegedFloor", group: "violence", type: "choice", values: [0, 0.08, 0.18, 0.3], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_MINORFLOOR", desc: "LOC_EMIG_T_MINORFLOOR_D" },
  { key: "vwPillage", group: "violence", type: "choice", values: [0, 0.3, 0.6, 1, 1.5], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_VPILLAGE", desc: "LOC_EMIG_T_VPILLAGE_D" },
  // war - time-gated, capped siege displacement (Algorithm D; off = legacy flat penalty)
  { key: "warSiege", group: "violence", type: "bool", label: "LOC_EMIG_T_WARSIEGE", desc: "LOC_EMIG_T_WARSIEGE_D" },
  { key: "siegeRampTurns", group: "violence", type: "choice", values: [4, 6, 8, 12, 16], format: "turns", label: "LOC_EMIG_T_SRAMP", desc: "LOC_EMIG_T_SRAMP_D" },
  { key: "siegeLossCapPct", group: "violence", type: "choice", values: [0.4, 0.5, 0.6, 0.75, 0.9], format: "frac", label: "LOC_EMIG_T_SCAP", desc: "LOC_EMIG_T_SCAP_D" },
  { key: "warSurgeMax", group: "violence", type: "choice", values: [1, 2, 3, 5, 8], special: {"1": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_WARSURGE", desc: "LOC_EMIG_T_WARSURGE_D" },
  // war - aggressor-aware refugee flight (aggressorPenalty 0 = off)
  { key: "aggressorPenalty", group: "violence", type: "choice", values: [0, 6, 12, 18, 25], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_AGGRESSOR", desc: "LOC_EMIG_T_AGGRESSOR_D" },
  { key: "ownCivRefugeeBonus", group: "violence", type: "choice", values: [0, 2, 4, 8], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_OWNCIV", desc: "LOC_EMIG_T_OWNCIV_D" },
  // Disasters
  // environmental disasters as a migration driver (off by default)
  { key: "disastersEnabled", group: "disaster", type: "bool", label: "LOC_EMIG_T_DISASTERS", desc: "LOC_EMIG_T_DISASTERS_D" },
  { key: "disasterPerPoint", group: "disaster", type: "choice", values: [6, 8, 10, 14, 20], format: "pct", label: "LOC_EMIG_T_DPP", desc: "LOC_EMIG_T_DPP_D" },
  { key: "disasterDecay", group: "disaster", type: "choice", values: [0.4, 0.55, 0.7, 0.85], format: "frac", label: "LOC_EMIG_T_DDECAY", desc: "LOC_EMIG_T_DDECAY_D" },
  { key: "disasterLossCapPct", group: "disaster", type: "choice", values: [0.25, 0.4, 0.5, 0.75, 1], choiceLabels: ["25%", "40%", "50%", "75%", "LOC_EMIG_CHOICE_UNCAPPED"], label: "LOC_EMIG_T_DCAP", desc: "LOC_EMIG_T_DCAP_D" },
  { key: "disasterImpactScalingEnabled", group: "disaster", type: "bool", label: "LOC_EMIG_T_DIMPACT", desc: "LOC_EMIG_T_DIMPACT_D" },
  { key: "disasterImpactGamma", group: "disaster", type: "choice", values: [0.5, 0.6, 0.75, 1], label: "LOC_EMIG_T_DGAMMA", desc: "LOC_EMIG_T_DGAMMA_D" },
  { key: "disasterSpeedShockEnabled", group: "disaster", type: "bool", label: "LOC_EMIG_T_DSHOCK", desc: "LOC_EMIG_T_DSHOCK_D" },
  { key: "plagueCarryEnabled", group: "disaster", type: "bool", label: "LOC_EMIG_T_PLAGUECARRY", desc: "LOC_EMIG_T_PLAGUECARRY_D" },
  // Geography & movement
  { key: "distanceFactor", group: "geography", type: "choice", values: [0.2, 0.4, 0.6, 0.9, 1.3], label: "LOC_EMIG_T_DIST", desc: "LOC_EMIG_T_DIST_D" },
  { key: "fleeFactor", group: "geography", type: "choice", values: [0, 3, 6, 10, 15], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_FLEE", desc: "LOC_EMIG_T_FLEE_D" },
  { key: "poachBlock", group: "geography", type: "choice", values: [4, 8, 12, 18, 25, 30], label: "LOC_EMIG_T_POACH", desc: "LOC_EMIG_T_POACH_D" },
  { key: "crisisEscapeBonus", group: "geography", type: "choice", values: [0, 4, 7, 14, 22, 32], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_ESCAPE", desc: "LOC_EMIG_T_ESCAPE_D" },
  { key: "crisisInternalBonus", group: "geography", type: "choice", values: [0, 6, 12, 18, 24], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_INTERNAL", desc: "LOC_EMIG_T_INTERNAL_D" },
  { key: "openBordersBonus", group: "geography", type: "choice", values: [0, 4, 8, 14, 20], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_OPENDEAL", desc: "LOC_EMIG_T_OPENDEAL_D" },
  { key: "transitLagTurns", group: "geography", type: "choice", values: [0, 1, 2, 4, 6], format: "turns", special: {"0": "LOC_EMIG_CHOICE_INSTANT"}, label: "LOC_EMIG_T_TRANSITLAG", desc: "LOC_EMIG_T_TRANSITLAG_D" },
  // Integration costs
  // migration cost (real grantYield consequence on the destination civ)
  { key: "assimilationLoadPerMigrant", group: "cost", type: "choice", values: [0, 0.5, 1, 2], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_ASLOAD", desc: "LOC_EMIG_T_ASLOAD_D" },
  { key: "assimilationCostPerPop", group: "cost", type: "choice", values: [0, 0.02, 0.05, 0.1, 0.2], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_ASPOP", desc: "LOC_EMIG_T_ASPOP_D" },
  { key: "assimilationDecay", group: "cost", type: "choice", values: [0.4, 0.55, 0.7, 0.85], format: "frac", label: "LOC_EMIG_T_ASDECAY", desc: "LOC_EMIG_T_ASDECAY_D" },
  { key: "assimilationHappiness", group: "cost", type: "choice", values: [0, 0.25, 0.5, 1, 2], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_ASHAP", desc: "LOC_EMIG_T_ASHAP_D" },
  { key: "assimilationGold", group: "cost", type: "choice", values: [0, 0.5, 1, 1.5, 3], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_ASGOLD", desc: "LOC_EMIG_T_ASGOLD_D" },
  { key: "migrantHoldHappiness", group: "cost", type: "choice", values: [0, 0.5, 1, 2], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_MHHAP", desc: "LOC_EMIG_T_MHHAP_D" },
  { key: "migrantHoldGold", group: "cost", type: "choice", values: [0, 1, 2, 5], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_MHGOLD", desc: "LOC_EMIG_T_MHGOLD_D" },
  // Balance brakes
  // congestion headwind (Algorithm C; 0 = off)
  { key: "congestWeight", group: "brakes", type: "choice", values: [0, 2, 4, 8], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_CONGEST", desc: "LOC_EMIG_T_CONGEST_D" },
  // anti-snowball headwind: 0 off / 8 gentle / 15 standard / 28 strong
  { key: "antiSnowballWeight", group: "brakes", type: "choice", values: [0, 8, 15, 28], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_ANTISNOWBALL", desc: "LOC_EMIG_T_ANTISNOWBALL_D" },
  // anti-snowball trigger: fair-share population multiple a civ may reach before the brake bites
  { key: "antiSnowballThreshold", group: "brakes", type: "choice", values: [1, 1.25, 1.5, 2], format: "mult", label: "LOC_EMIG_T_ANTISNOWTHRESH", desc: "LOC_EMIG_T_ANTISNOWTHRESH_D" },
  { key: "antiDrainWeight", group: "brakes", type: "choice", values: [0, 6, 12, 18, 24], special: {"0": "LOC_EMIG_CHOICE_OFF"}, label: "LOC_EMIG_T_ANTIDRAIN", desc: "LOC_EMIG_T_ANTIDRAIN_D" },
  { key: "antiDrainThreshold", group: "brakes", type: "choice", values: [0.6, 0.8, 1], format: "frac", label: "LOC_EMIG_T_ANTIDRAINTHRESH", desc: "LOC_EMIG_T_ANTIDRAINTHRESH_D" },
  // Arrivals & departures
  { key: "departureRemovesTile", group: "arrivals", type: "bool", label: "LOC_EMIG_T_DEPTILE", desc: "LOC_EMIG_T_DEPTILE_D" },
  { key: "arrivalPlacement", group: "arrivals", type: "choice", values: [0, 1, 2, 3], choiceLabels: ["LOC_EMIG_CHOICE_OFF", "LOC_EMIG_CHOICE_ARR_AUTO", "LOC_EMIG_CHOICE_ARR_ASK", "LOC_EMIG_CHOICE_ARR_UNIT"], label: "LOC_EMIG_T_ARRPLACE", desc: "LOC_EMIG_T_ARRPLACE_D" },
  { key: "arrivalPreferSpecialists", group: "arrivals", type: "bool", label: "LOC_EMIG_T_ARRSPEC", desc: "LOC_EMIG_T_ARRSPEC_D" },
  { key: "arrivalAskRefugees", group: "arrivals", type: "bool", label: "LOC_EMIG_T_ASKREF", desc: "LOC_EMIG_T_ASKREF_D" },
  { key: "arrivalAskMigrants", group: "arrivals", type: "bool", label: "LOC_EMIG_T_ASKMIG", desc: "LOC_EMIG_T_ASKMIG_D" },
  { key: "arrivalAskReturnees", group: "arrivals", type: "bool", label: "LOC_EMIG_T_ASKRET", desc: "LOC_EMIG_T_ASKRET_D" },
  // Cultural enclaves
  { key: "quartersEnabled", group: "enclaves", type: "bool", label: "LOC_EMIG_T_QUARTERS", desc: "LOC_EMIG_T_QUARTERS_D" },
  { key: "quarterRecognition", group: "enclaves", type: "choice", values: [2, 1, 0], choiceLabels: ["LOC_EMIG_CHOICE_QAUTO_ALL", "LOC_EMIG_CHOICE_QAUTO_ME", "LOC_EMIG_CHOICE_QAUTO_ASK"], label: "LOC_EMIG_T_QAUTO", desc: "LOC_EMIG_T_QAUTO_D" },
  { key: "quarterPlaceImprovement", group: "enclaves", type: "bool", label: "LOC_EMIG_T_QPLACE", desc: "LOC_EMIG_T_QPLACE_D" },
  { key: "enclaveTileSkin", group: "enclaves", type: "choice", values: [1, 2, 0], choiceLabels: ["LOC_EMIG_CHOICE_SKIN_THEMED", "LOC_EMIG_CHOICE_SKIN_VILLAGE", "LOC_EMIG_CHOICE_SKIN_NATIVE"], label: "LOC_EMIG_T_QSKIN", desc: "LOC_EMIG_T_QSKIN_D" },
  // cultural enclaves - how often the decision fires (share bar + stock floor + stickiness + dwell + throttle)
  { key: "quarterEstablishedShare", group: "enclaves", type: "choice", values: [0.3, 0.35, 0.4, 0.45, 0.5], choiceLabels: ["30%", "35%", "40%", "45%", "50%"], label: "LOC_EMIG_T_QSHARE", desc: "LOC_EMIG_T_QSHARE_D" },
  { key: "quarterMinStock", group: "enclaves", type: "choice", values: [2, 3, 5, 8], label: "LOC_EMIG_T_QMINSTOCK", desc: "LOC_EMIG_T_QMINSTOCK_D" },
  { key: "quarterEstablishedStock", group: "enclaves", type: "choice", values: [0, 4, 6, 8, 10], choiceLabels: ["LOC_EMIG_CHOICE_OFF", "4", "6", "8", "10"], label: "LOC_EMIG_T_QSTOCK", desc: "LOC_EMIG_T_QSTOCK_D" },
  { key: "quarterEnclaveStickiness", group: "enclaves", type: "choice", values: [1, 0.5, 0.25, 0.1], choiceLabels: ["LOC_EMIG_CHOICE_OFF", "LOC_EMIG_CHOICE_WEAK", "LOC_EMIG_CHOICE_STANDARD", "LOC_EMIG_CHOICE_STRONG"], label: "LOC_EMIG_T_QSTICKY", desc: "LOC_EMIG_T_QSTICKY_D" },
  { key: "quarterRootsReturnScale", group: "enclaves", type: "choice", values: [1, 0.5, 0.25, 0], choiceLabels: ["LOC_EMIG_CHOICE_OFF", "LOC_EMIG_CHOICE_WEAK", "LOC_EMIG_CHOICE_STANDARD", "LOC_EMIG_CHOICE_STRONG"], label: "LOC_EMIG_T_QROOTS", desc: "LOC_EMIG_T_QROOTS_D" },
  { key: "quarterDwellTurns", group: "enclaves", type: "choice", values: [0, 4, 8, 12, 18], format: "turns", label: "LOC_EMIG_T_QDWELL", desc: "LOC_EMIG_T_QDWELL_D" },
  { key: "quarterCooldownTurns", group: "enclaves", type: "choice", values: [8, 12, 18, 24, 36], format: "turns", label: "LOC_EMIG_T_QCOOLDOWN", desc: "LOC_EMIG_T_QCOOLDOWN_D" },
  { key: "quarterCapPerAge", group: "enclaves", type: "choice", values: [1, 2, 3, 5], label: "LOC_EMIG_T_QCAP", desc: "LOC_EMIG_T_QCAP_D" },
  { key: "quarterPacingEnabled", group: "enclaves", type: "bool", label: "LOC_EMIG_T_QPACE", desc: "LOC_EMIG_T_QPACE_D" },
  { key: "quarterTargetPerAge", group: "enclaves", type: "choice", values: [0, 1, 2], label: "LOC_EMIG_T_QTARGET", desc: "LOC_EMIG_T_QTARGET_D" },
  { key: "quarterPacingMax", group: "enclaves", type: "choice", values: [0.2, 0.4, 0.6], choiceLabels: ["20%", "40%", "60%"], label: "LOC_EMIG_T_QPACEMAX", desc: "LOC_EMIG_T_QPACEMAX_D" },
  { key: "quarterForce", group: "enclaves", type: "bool", label: "LOC_EMIG_T_QFORCE", desc: "LOC_EMIG_T_QFORCE_D" },
  { key: "quarterFadeShare", group: "enclaves", type: "choice", values: [0, 0.075, 0.125, 0.2], choiceLabels: ["LOC_EMIG_CHOICE_NEVER", "7.5%", "12.5%", "20%"], label: "LOC_EMIG_T_QFADE", desc: "LOC_EMIG_T_QFADE_D" },
  { key: "quarterFadeTurns", group: "enclaves", type: "choice", values: [6, 12, 20, 30], format: "turns", label: "LOC_EMIG_T_QFADETURNS", desc: "LOC_EMIG_T_QFADETURNS_D" },
  // Calling people home
  { key: "callHomeEnabled", group: "callhome", type: "bool", label: "LOC_EMIG_T_CALLHOME", desc: "LOC_EMIG_T_CALLHOME_D" },
  { key: "callHomeOfferWhenCalm", group: "callhome", type: "bool", label: "LOC_EMIG_T_CALLHOME_PEACE", desc: "LOC_EMIG_T_CALLHOME_PEACE_D" },
  { key: "callHomeChanceExternal", group: "callhome", type: "choice", values: [0.05, 0.12, 0.18, 0.3, 0.45], format: "frac", label: "LOC_EMIG_T_CALLHOME_EX", desc: "LOC_EMIG_T_CALLHOME_EX_D" },
  { key: "callHomeGoldPerPoint", group: "callhome", type: "choice", values: [0, 30, 60, 100, 160], label: "LOC_EMIG_T_CALLHOME_GOLD", desc: "LOC_EMIG_T_CALLHOME_GOLD_D" },
  { key: "callHomeInfluencePerPoint", group: "callhome", type: "choice", values: [0, 6, 12, 20, 32], label: "LOC_EMIG_T_CALLHOME_INFL", desc: "LOC_EMIG_T_CALLHOME_INFL_D" },
  { key: "callHomeAgeCostStep", group: "callhome", type: "choice", values: [1, 2, 3, 4, 6], format: "mult", label: "LOC_EMIG_T_CALLHOME_AGE", desc: "LOC_EMIG_T_CALLHOME_AGE_D" },
  { key: "callHomeMaxPointsPerAttempt", group: "callhome", type: "choice", values: [1, 2, 3, 5, 8], label: "LOC_EMIG_T_CALLHOME_MAX", desc: "LOC_EMIG_T_CALLHOME_MAX_D" },
  // Attrition
  // outlet - attrition when there's nowhere to flee (the pressure-release valve)
  { key: "attritionEnabled", group: "outlet", type: "bool", label: "LOC_EMIG_T_ATTRITION", desc: "LOC_EMIG_T_ATTRITION_D" },
  { key: "attritionMinDistress", group: "outlet", type: "choice", values: [40, 80, 120, 200], format: "pct", label: "LOC_EMIG_T_ATTRDISTRESS", desc: "LOC_EMIG_T_ATTRDISTRESS_D" },
  { key: "attritionThreshold", group: "outlet", type: "choice", values: [20, 40, 70, 120], label: "LOC_EMIG_T_ATTRTHRESH", desc: "LOC_EMIG_T_ATTRTHRESH_D" },
  // Notifications
  // notifications (anti-spam controls)
  { key: "notifyMode", group: "notify", type: "choice", values: [0, 1, 2], choiceLabels: ["LOC_EMIG_CHOICE_OFF", "LOC_EMIG_CHOICE_IMPORTANT", "LOC_EMIG_CHOICE_VERBOSE"], label: "LOC_EMIG_T_NOTIFYMODE", desc: "LOC_EMIG_T_NOTIFYMODE_D" },
  { key: "disasterNotifyMode", group: "notify", type: "choice", values: [0, 1, 2], choiceLabels: ["LOC_EMIG_CHOICE_OFF", "LOC_EMIG_CHOICE_IMPORTANT", "LOC_EMIG_CHOICE_VERBOSE"], label: "LOC_EMIG_T_DNOTIFYMODE", desc: "LOC_EMIG_T_DNOTIFYMODE_D" },
  { key: "disasterNotifyMinSeverity", group: "notify", type: "choice", values: [0, 1, 2, 3], choiceLabels: ["LOC_EMIG_CHOICE_ANY", "LOC_EMIG_CHOICE_MINOR", "LOC_EMIG_CHOICE_MODERATE", "LOC_EMIG_CHOICE_MAJOR"], label: "LOC_EMIG_T_NOTIFYDISASTER", desc: "LOC_EMIG_T_NOTIFYDISASTER_D" },
  { key: "notifyCooldownTurns", group: "notify", type: "choice", values: [0, 3, 6, 10, 20], format: "turns", special: {"0": "LOC_EMIG_CHOICE_NO_LIMIT"}, label: "LOC_EMIG_T_NOTIFYCD", desc: "LOC_EMIG_T_NOTIFYCD_D" },
  { key: "notifyWorldNews", group: "notify", type: "bool", label: "LOC_EMIG_T_NOTIFYWORLDNEWS", desc: "LOC_EMIG_T_NOTIFYWORLDNEWS_D" },
  { key: "worldRefugeeThreshold", group: "notify", type: "choice", values: [20000, 40000, 80000, 150000], format: "count", label: "LOC_EMIG_T_NOTIFYWORLD", desc: "LOC_EMIG_T_NOTIFYWORLD_D" },
  // Readouts & rankings
  // readout — the migration-intelligence panels. Every readout feature JOINS this group rather than
  // making its own.
  { key: "diversityRanking", group: "readout", type: "bool", label: "LOC_EMIG_T_DIVERSITY", desc: "LOC_EMIG_T_DIVERSITY_D" },
  { key: "cosmopolitanismScore", group: "readout", type: "bool", label: "LOC_EMIG_T_COSMO", desc: "LOC_EMIG_T_COSMO_D" },
  { key: "diversityRows", group: "readout", type: "choice", values: [3, 5, 8, 12], label: "LOC_EMIG_T_DIVERSITYROWS", desc: "LOC_EMIG_T_DIVERSITYROWS_D" },
  { key: "migrationExplainer", group: "readout", type: "bool", label: "LOC_EMIG_T_EXPLAINER", desc: "LOC_EMIG_T_EXPLAINER_D" },
  // the per-city readout panel + its sparkline are readout features, so they JOIN this group rather
  // than the notify group.
  { key: "cityReadoutEnabled", group: "readout", type: "bool", label: "LOC_EMIG_T_CITYREADOUT", desc: "LOC_EMIG_T_CITYREADOUT_D" },
  { key: "cityReadoutSparkline", group: "readout", type: "bool", label: "LOC_EMIG_T_SPARKLINE", desc: "LOC_EMIG_T_SPARKLINE_D" },
  // Visuals
  // visuals — presentation only; nothing here touches the simulation.
  { key: "timelineEventPins", group: "visuals", type: "bool", label: "LOC_EMIG_T_TLPINS", desc: "LOC_EMIG_T_TLPINS_D" },
  // the self-test panel is a UI-only diagnostics tool (touches nothing in the sim), so it belongs here,
  // not under notify.
  { key: "selftestEnabled", group: "visuals", type: "bool", label: "LOC_EMIG_T_SELFTEST", desc: "LOC_EMIG_T_SELFTEST_D" }
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
    emigrationBar: 55, cooldownTurns: 12, maxMovesPerTurn: 4, maxLossPerCityPerTurn: 1,
    maxGainPerCityPerTurn: 2, violencePerPoint: 9, distanceFactor: 0.9, fleeFactor: 3,
    warSurgeMax: 2, movesPerSiege: 1
  },
  medium: {
    emigrationBar: 30, cooldownTurns: 8, maxMovesPerTurn: 8, maxLossPerCityPerTurn: 2,
    maxGainPerCityPerTurn: 4, violencePerPoint: 12, distanceFactor: 0.6, fleeFactor: 6,
    warSurgeMax: 3, movesPerSiege: 2
  },
  high: {
    emigrationBar: 18, cooldownTurns: 4, maxMovesPerTurn: 12, maxLossPerCityPerTurn: 4,
    maxGainPerCityPerTurn: 8, violencePerPoint: 16, distanceFactor: 0.4, fleeFactor: 10,
    warSurgeMax: 5, movesPerSiege: 4
  }
};

/** Preset dropdown order. "custom" = leave individual/advanced values as-is. */
export const PRESET_NAMES = ["custom", "low", "medium", "high"];

/**
 * Grouped settings: one Options slider (0 to 100) that moves several tunables together along a curve. Each group
 * lists anchor positions with the member values at that position; a position between two anchors interpolates
 * linearly. Position 50 equals the shipped CONFIG defaults. `decimals` sets how finely interpolated values are
 * rounded (default 1); a group whose members are small fractions needs more, or the 50 anchor would not survive.
 * @type {Record<string, {decimals?: number, anchors: {at:number, values: Record<string, number>}[]}>}
 */
export const GROUPED_SETTINGS = {
  // Movement between civilizations: the voluntary cross-civ friction, the refugee escape pull abroad, the
  // small-civilization brake, and the homeland preference in a crisis. The MIDDLE is the settled default,
  // 100 is free movement, and below 50 the preference to stay home keeps hardening.
  crossCivMovement: {
    anchors: [
      { at: 0, values: { poachBlock: 36, crisisEscapeBonus: 0, antiDrainWeight: 30, crisisInternalBonus: 32 } },
      { at: 50, values: { poachBlock: 30, crisisEscapeBonus: 0, antiDrainWeight: 24, crisisInternalBonus: 24 } },
      { at: 100, values: { poachBlock: 12, crisisEscapeBonus: 14, antiDrainWeight: 0, crisisInternalBonus: 0 } }
    ]
  },
  // Refugees from wars with major civilizations: the whole-observation scale and the ordinary besieged floor, used
  // whenever a major civilization is among a city's attackers (or they cannot be named). The middle is the
  // shipped war balance; 100 doubles it; 0 means wars add no violence pressure.
  majorWarRefugees: {
    decimals: 2,
    anchors: [
      { at: 0, values: { majorViolenceScale: 0, siegeBesiegedFloor: 0 } },
      { at: 50, values: { majorViolenceScale: 1, siegeBesiegedFloor: 0.3 } },
      { at: 100, values: { majorViolenceScale: 2, siegeBesiegedFloor: 0.6 } }
    ]
  },
  // Refugees from raids by minor powers (city-states and Independent Powers). Moves the whole-observation scale and
  // the besieged floor used when every attacker of a city is minor. 100 scores a raid like a war at the default
  // war setting (floor 0.3, no scaling); 0 means raids add no violence pressure; the middle is the shipped default.
  minorRaidRefugees: {
    decimals: 2,
    anchors: [
      { at: 0, values: { minorViolenceScale: 0, minorSiegeBesiegedFloor: 0 } },
      { at: 50, values: { minorViolenceScale: 0.4, minorSiegeBesiegedFloor: 0.08 } },
      { at: 100, values: { minorViolenceScale: 1, minorSiegeBesiegedFloor: 0.3 } }
    ]
  }
};

/**
 * Composite settings: an overall slider made of other grouped sliders. It shows the average of its children and,
 * when moved, shifts every child by the same amount (each clamped to 0-100), so a player who set the children
 * apart keeps that difference. Children are GROUPED_SETTINGS names; the composite stores nothing of its own.
 * @type {Record<string, string[]>}
 */
export const COMPOSITE_SETTINGS = {
  // Refugees from conflict: wars with major civilizations and raids by minor powers together.
  conflictRefugees: ["majorWarRefugees", "minorRaidRefugees"]
};

/**
 * A composite slider's displayed position: the rounded average of its children.
 * @param {number[]} children Child positions. @returns {number} The overall position, 0-100.
 */
export function compositePosition(children) {
  const ok = children.map(Number).filter((n) => Number.isFinite(n));
  if (!ok.length) return 50;
  return Math.max(0, Math.min(100, Math.round(ok.reduce((a, b) => a + b, 0) / ok.length)));
}

/**
 * Child positions after moving a composite slider to `target`: every child moves by the same amount, clamped.
 * @param {number[]} children Current child positions. @param {number} target The new overall position.
 * @returns {number[]} New child positions, index-aligned.
 */
export function compositeShift(children, target) {
  const t = Math.max(0, Math.min(100, Math.round(Number(target) || 0)));
  const delta = t - compositePosition(children);
  return children.map((c) => Math.max(0, Math.min(100, Math.round((Number(c) || 0) + delta))));
}

/**
 * The member values of a grouped setting at a slider position: clamped to 0-100, interpolated linearly between
 * the surrounding anchors, rounded to the group's `decimals` (one by default).
 * @param {string} name The group name. @param {number} position The slider position.
 * @returns {Record<string, number>} Member key to value; empty for an unknown group.
 */
export function groupedValues(name, position) {
  const g = GROUPED_SETTINGS[name];
  if (!g) return {};
  const p = Math.max(0, Math.min(100, Number(position) || 0));
  const a = g.anchors;
  let i = 0;
  while (i < a.length - 2 && p > a[i + 1].at) i++;
  const lo = a[i];
  const hi = a[i + 1];
  const t = hi.at === lo.at ? 0 : (p - lo.at) / (hi.at - lo.at);
  const unit = Math.pow(10, Number.isInteger(g.decimals) ? Number(g.decimals) : 1);
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of Object.keys(lo.values)) {
    out[k] = Math.round((lo.values[k] + (hi.values[k] - lo.values[k]) * t) * unit) / unit;
  }
  return out;
}

/**
 * Compose a LOC key, or return it unchanged off-engine.
 * @param {string} key @param {...*} args Arguments. @returns {string} The text.
 */
function composeText(key, ...args) {
  try {
    return typeof Locale !== "undefined" && Locale.compose ? Locale.compose(key, ...args) : key;
  } catch (_) {
    return key;
  }
}

/**
 * How one value of a tunable reads in a dropdown: a named choice, a word for a special value ("Off"), or the
 * number with its unit. Shared by the Options-tab sections and the search-and-reset window so both read the same.
 * @param {Tunable} t The tunable. @param {number} v The value. @returns {string} The display text.
 */
export function tunableValueText(t, v) {
  const i = (t.values || []).findIndex((x) => Math.abs(x - v) < 1e-9);
  if (t.choiceLabels && i >= 0) {
    const raw = t.choiceLabels[i];
    return raw.startsWith("LOC_") ? composeText(raw) : raw;
  }
  const word = t.special && t.special[String(v)];
  return word ? composeText(word) : formatNumber(t.format, Number(v));
}

/** How each number format reads. */
const NUMBER_FORMATS = {
  pct: (/** @type {number} */ n) => n + "%",
  frac: (/** @type {number} */ n) => Math.round(n * 1000) / 10 + "%",
  mult: (/** @type {number} */ n) => "×" + n,
  turns: (/** @type {number} */ n) => composeText("LOC_EMIG_VAL_TURNS", n),
  every: (/** @type {number} */ n) => composeText("LOC_EMIG_VAL_EVERY", n),
  count: (/** @type {number} */ n) => composeText("LOC_EMIG_VAL_COUNT", n)
};

/**
 * A number in a tunable's format, rounded to three decimals (the plain number when there is no format).
 * @param {string|undefined} format A Tunable format. @param {number} v The value. @returns {string} The text.
 */
function formatNumber(format, v) {
  const n = Math.round(v * 1000) / 1000;
  const f = format ? /** @type {*} */ (NUMBER_FORMATS)[format] : null;
  return f ? f(format === "frac" ? v : n) : String(n);
}

/**
 * The dropdown entries for a choice tunable at a given value. A value that is not one of the choices (a grouped
 * slider can set 0.64 between 0.4 and 0.7) is inserted in order as an extra entry, so the dropdown shows exactly
 * what is in effect instead of silently showing the nearest choice.
 * @param {Tunable} t The tunable. @param {number} current Its current value.
 * @returns {{items:{label:string}[], values:number[], index:number}} Entries, their values, and the selection.
 */
export function tunableDropdown(t, current) {
  const values = [...(t.values || [])];
  const labels = values.map((v) => tunableValueText(t, v));
  const cur = Number(current);
  let index = values.findIndex((v) => Math.abs(v - cur) < 1e-9);
  if (index < 0 && Number.isFinite(cur)) {
    index = values.findIndex((v) => v > cur);
    if (index < 0) index = values.length;
    values.splice(index, 0, cur);
    labels.splice(index, 0, tunableValueText(t, cur));
  }
  return { items: labels.map((label) => ({ label })), values, index: Math.max(0, index) };
}
