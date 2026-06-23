// emigration-config-types.js
//
// The SHAPE of the mod's tunable settings , the documented contract for the CONFIG object whose
// concrete default VALUES live in emigration-config.js. Kept apart so the ~100-property schema (the
// canonical reference for what every knob means) doesn't bury the values registry, and so the
// settings/options layer can type against the contract without importing the defaults.

/**
 * The mod's tunable settings. Numeric weights/thresholds drive the Prosperity
 * math; the booleans scope which settlements participate / which features run.
 * @typedef {Object} EmigrationConfig
 * @property {number} turnInterval Run the pass every N local-player turns.
 * @property {number} maxMovesPerTurn Per-civ move-ceiling base (safety net, not the pacing knob).
 * @property {number} movesPerCity Per-civ move-ceiling bonus per settlement.
 * @property {number} movesPerSiege Per-civ move-ceiling bonus per city in war/disaster crisis.
 * @property {number} emigrationBar Accumulated pressure to move one citizen.
 * @property {number} deltaExponent Diminishing scaling on the prosperity delta.
 * @property {boolean} splitTracksEnabled Evaluate crisis + voluntary as two concurrent per-source tracks.
 * @property {boolean} splitBudgetsEnabled Give crisis and voluntary their own per-civ move ceilings.
 * @property {boolean} splitUiReadoutEnabled Show a multi-cause pressure breakdown in the city readout.
 * @property {boolean} gameSpeedTuningEnabled Scale turn-based pacing by the game-speed scalar S
 *   (Online≈0.5 … Standard 1.0 … Marathon≈3.0) so migration feels constant in game-time; false = legacy.
 * @property {boolean} gameSpeedScalePopulation Normalize the historical population exponent to
 *   scaleGrowth^(turn/S). Cosmetic and CROSS-MOD: only stays aligned with Demographics if that mod
 *   applies the identical normalization, so it defaults OFF and is gated separately.
 * @property {number} tiltCap Max |targeted attraction| added to a single pull (Tilt-channel clamp).
 * @property {number} permeFloor Permeability-product floor.
 * @property {number} permeCeil Permeability-product ceiling.
 * @property {number} asylumPushWeight Tilt per distress point easing refugee pull to an asylum civ.
 * @property {number} permOpenBorders Permeability factor for an Open Borders deal.
 * @property {number} permAlly Permeability factor for an alliance.
 * @property {number} permWar Permeability factor for being at war (< 1).
 * @property {number} raidTilt Pull tilt from an active raid's target toward the raider.
 * @property {number} poachBlock Extra delta needed for a cross-civ destination.
 * @property {number} refugeePoachBlock Reduced cross-civ delta for a war/disaster refugee source.
 * @property {number} crisisEscapeBonus Pull ADDED toward a CROSS-CIV destination for a source in
 *   acute crisis (war/disaster), so its refugees flee abroad instead of relocating internally (0 = off).
 * @property {number} cooldownTurns Turns a source rests after emigrating.
 * @property {number} minRuralToEmigrate Rural floor a source keeps.
 * @property {number} refugeesPercent Reserved: % of rural that flees a razed city.
 * @property {boolean} crossCivEnabled Allow migration between civilizations.
 * @property {boolean} includeCityStates Include minor/city-state settlements.
 * @property {boolean} conquestMigrationEnabled Count a city capture as cross-civ conquest migration
 *   (conqueror gains the absorbed population, prior owner loses it) in the net-migration tally.
 * @property {boolean} requireMet Simulation scope: false = global (all alive civs), the default;
 *   true = met-only (lighter). Visibility masking is handled separately (governance), not here.
 * @property {number} foodFactor Per-capita food weight.
 * @property {number} productionFactor Per-capita production weight.
 * @property {number} goldFactor Per-capita gold weight.
 * @property {number} scienceFactor Per-capita science weight.
 * @property {number} cultureFactor Per-capita culture weight.
 * @property {number} localHappinessFactor City net-happiness weight.
 * @property {number} populationFactor Population penalty weight.
 * @property {number} unhappyCauseThreshold Net-happiness below which a peacetime departure is
 *   attributed to `unhappiness` vs `prosperity` (reporting only ; no effect on movement).
 * @property {number} siegeModifier Percent score modifier while besieged/razed.
 * @property {number} starvationModifier Percent score modifier while starving.
 * @property {number} unrestModifier Percent score modifier during unrest.
 * @property {boolean} polityModelEnabled 1.4.1 polity model (happiness stages + government +
 *   celebration + war weariness). false → exact pre-1.4.1 scoring.
 * @property {number} happinessStageWeight Bounded pull per happiness-stage step (ANGRY −2 … ECSTATIC +2).
 * @property {number} happinessStageMiseryScale Scale on the negative (unhappy/angry) side of the stage
 *   term (pull-bias; misery is already covered by happiness + suppressed yields). 1 = symmetric.
 * @property {number} celebrationPull Attractiveness bonus while a civ is in a Golden Age (celebration).
 * @property {number} governmentWeight Scales the per-government flavor lean.
 * @property {number} governmentLeanCap Clamp on the (scaled) government lean term.
 * @property {number} warWearinessModifier Percent score modifier for a war-weary civ (empire-wide push).
 * @property {number} migrantHoldHappiness Happiness/turn drained per held migrant unit.
 * @property {number} migrantHoldGold Gold/turn drained per held migrant unit.
 * @property {number} vwAssault Intensity per unit of fresh city damage taken (polled).
 * @property {number} vwSiege Intensity per turn while the city stays damaged (polled).
 * @property {number} vwPillage Intensity per turn per pillaged tile in the borders (polled).
 * @property {number} violenceDecay Per-turn multiplicative decay of intensity.
 * @property {number} violencePerPoint Percent score penalty per intensity point.
 * @property {number} violenceCapPct Max percent penalty from violence.
 * @property {number} violenceFleeThreshold Min intensity before directional flight.
 * @property {number} baseReluctance Flat emigration reluctance.
 * @property {number} perExtraPop Reluctance per extra destination population.
 * @property {number} cityStateBarrier Reluctance involving a city-state.
 * @property {number} distanceFactor Pull penalty per hex between source and dest.
 * @property {number} fleeFactor Max directional bonus for fleeing an invader.
 * @property {number} openBordersBonus Cross-civ pull bonus for an Open Borders deal partner.
 * @property {number} transitLagTurns Max turns migrants spend in transit before arriving (0 = off).
 * @property {number} transitHexPerTurn Hexes covered per transit turn (distance → lag scale).
 * @property {number} assimilationLoadPerMigrant Assimilation load added to a dest civ per migrant.
 * @property {number} assimilationCostPerPop Extra load multiplier per dest population point.
 * @property {number} assimilationDecay Per-turn decay of the load (= the assimilation duration).
 * @property {number} assimilationHappiness Happiness/turn drained per unit of load.
 * @property {number} assimilationGold Gold/turn drained per unit of load.
 * @property {number} assimilationWealthWeight Treasury-aware bend on the gold cost (0 = off).
 * @property {number} assimilationWealthRef Gold balance at which the wealth multiplier is ×1.
 * @property {number} assimilationWealthMin Floor multiplier for poor civs.
 * @property {number} assimilationWealthMax Ceiling multiplier for rich magnets.
 * @property {number} dividendPerMigrant Carried-dividend pool added per immigrant attracted.
 * @property {number} dividendDecay Per-turn decay of the carried dividend pool.
 * @property {number} dividendCap Max per-turn carried dividend granted in a yield.
 * @property {boolean} happinessShaped Use the shaped (field-relative, saturating) happiness model.
 * @property {number} happyScale Tanh scale for field-relative happiness (shaped model).
 * @property {number} happyRepulsion Steepness multiplier on the misery side (shaped model).
 * @property {number} happyAmp Happiness→economy amplification (shaped model).
 * @property {number} happyFloor Bounded standalone happiness pull/repulsion weight (shaped model).
 * @property {number} happyMultMin Min economy multiplier from happiness (shaped model).
 * @property {number} happyMultMax Max economy multiplier from happiness (shaped model).
 * @property {boolean} warSiege Use the time-gated, capped war-displacement model.
 * @property {number} siegeBesiegedFloor Fraction of full siege pressure a besieged-but-undamaged city registers.
 * @property {number} siegeFloor Escalation at siege tenure 1 (fraction of full).
 * @property {number} siegeRampTurns Turns of sustained siege to reach full escalation.
 * @property {number} siegeLossCapPct Max fraction of onset population lost to war.
 * @property {number} warSurgeMax Max rural points a besieged source sheds in one turn (1 = off).
 * @property {number} overcrowdDiscount Happiness credited per over-threshold urban point (Alg B).
 * @property {number} overcrowdThreshold Urban pop before overcrowding bites (Alg B).
 * @property {number} congestWeight Pull penalty per per-capita assimilation load (Alg C).
 * @property {number} antiSnowballWeight Headwind vs CROSS-CIV immigration into a civ whose
 *   population runs ahead of the world-average civ (self-correcting anti-runaway brake; 0 = off).
 * @property {number} antiSnowballThreshold Fair-share population multiple before the headwind bites.
 * @property {number} antiSnowballExponent Escalation steepness past the threshold.
 * @property {boolean} civTuningEnabled Apply the per-leader/civ tuning table (Alg C).
 * @property {boolean} attritionEnabled Trapped distressed cities lose population with no refuge.
 * @property {number} attritionMinDistress Min situational distress (%) before attrition fires.
 * @property {number} attritionThreshold Distress pressure to remove one population point.
 * @property {boolean} crisisDeathEnabled A city under LETHAL distress (war/disaster/siege/famine) loses
 *   some population to death even when a refuge exists, concurrent with emigration. Economic
 *   (prosperity/unhappiness) emigration never kills (no situational distress).
 * @property {number} crisisDeathShare Base crisis-death coefficient (× warSeverity) when a refuge
 *   exists; the dynamic rate is clamped to the full trapped rate.
 * @property {number} crisisSeverityCap Max violence/flee-threshold ratio counted toward war severity.
 * @property {number} crisisParticipantWeight Severity bonus per attacking civ beyond the first (small).
 * @property {number} crisisParticipantMax Hard cap on the total participant severity bonus.
 * @property {number} crisisCombatWeight Severity added per recent unit lost (a MAJOR war-death factor).
 * @property {number} crisisCombatMax Cap on the unit-casualty severity term.
 * @property {number} combatDecay Per-turn decay of the per-civ unit-loss intensity (0..1).
 * @property {number} ownCivRefugeeBonus War-refugee pull toward own civ (Feature 1).
 * @property {number} aggressorPenalty War-refugee penalty for the aggressor (F1; 0 = off).
 * @property {boolean} bordersEnabled Apply Open/Closed Borders policy effects (F2).
 * @property {number} closedBordersOpenness Immigration × while Closed Borders slotted.
 * @property {number} closedBordersRetention Cross-civ emigration × from your cities while Closed.
 * @property {number} openBordersOpenness Immigration × while Open Borders slotted.
 * @property {number} opennessFloor Min immigration-openness multiplier.
 * @property {number} notifyMode Notification verbosity (0 off / 1 important / 2 verbose).
 * @property {boolean} notifyToasts Show transient toast lines.
 * @property {boolean} notifyFloating Show on-map floating migration indicators.
 * @property {boolean} notifyWorldNews Announce major world refugee events.
 * @property {number} worldRefugeeThreshold Per-civ cumulative people for a crisis alert.
 * @property {number} disasterNotifyMinSeverity Min disaster severity to notify (0–3).
 * @property {number} notifyCooldownTurns Min turns between "important" toasts (anti-spam).
 * @property {boolean} cityReadoutEnabled Show the per-city migration readout panel (Phase 2).
 * @property {string} cityReadoutCorner HUD corner for the readout (top/bottom × left/right).
 * @property {boolean} disastersEnabled Treat disasters as a migration driver (§11).
 * @property {number} disasterPlagueWeight Standing disaster distress/turn while a city is infected.
 * @property {number} disasterPerPoint Percent prosperity penalty per disaster-distress point.
 * @property {number} disasterCapPct Max percent penalty from disaster distress.
 * @property {number} disasterDecay Per-turn decay of disaster distress.
 * @property {number} disasterFleeThreshold Min distress to flee / count as disaster-caused.
 * @property {number} disasterFlee Max directional bonus for fleeing a disaster epicenter.
 * @property {number} disasterRefugeeBurstThreshold Distress fraction triggering a burst.
 * @property {boolean} plagueCarryEnabled Migrants from an infected city seed distress.
 * @property {number} plagueCarryDistress Distress seeded at the destination per carrier.
 * @property {number} scaleBase Population-scaling base (Demographics-aligned).
 * @property {number} scaleExp Population-scaling exponent.
 * @property {number} scaleGrowth Population-scaling per-turn growth.
 */

export {};
