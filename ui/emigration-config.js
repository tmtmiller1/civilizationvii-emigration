// emigration-config.js
//
// The DEFAULT VALUES of the mod's tunable settings, mirroring the Civ V Emigration (v6)
// `EmigrationSettings` data model, plus the population-scaling constants that keep this mod's
// "historical" people counts ALIGNED with the Demographics mod (its scaleCityPopulationAt:
// raw^1.11 * 12000 * 1.009^turn, plus a Modern-only smooth megacity ramp). The SHAPE these
// conform to , what every knob means , is the
// EmigrationConfig typedef in emigration-config-types.js; the settings/options layer overrides
// these at boot via applyTunableOverrides.

/** @type {import("/emigration/ui/emigration-config-types.js").EmigrationConfig} */
export const CONFIG = {
  // ── pacing / general ─────────────────────────────────────────────
  turnInterval: 1, // run the emigration pass every N local-player turns
  // Per-CIV move ceiling base. This is a runaway/perf safety net, NOT the pacing knob: real pacing is
  // each source's pressure bar + post-move cooldown (economic) and the warSurge + siege-loss cap
  // (forced). The effective per-civ ceiling = this + movesPerCity·(its cities) + movesPerSiege·(its
  // cities in crisis), so simultaneous wars on different civs never compete for one global budget.
  maxMovesPerTurn: 8,
  movesPerCity: 1, // per-civ ceiling: + this per settlement (the ceiling grows with empire size)
  movesPerSiege: 2, // per-civ ceiling: + this per city in war/disaster crisis (refugees aren't bottlenecked)
  emigrationBar: 30, // accumulated pressure (per source) to move one citizen
  deltaExponent: 0.5, // diminishing scaling on the prosperity delta

  // ── pull composition channels (docs/immigration-interaction-plan.md §1) ──
  // Pull = (gradient + TILT) - friction, then x PERMEABILITY. Both policy channels are
  // clamped so any number of cards/agreements/ops compose without runaway. Tilt is empty
  // and the permeability product is a single factor until later phases add to them.
  tiltCap: 14, // max |targeted attraction| a single pull can gain (Tilt clamp)
  permeFloor: 0.2, // permeability product floor (bites once relationship factors join)
  permeCeil: 4.0, // permeability product ceiling
  asylumPushWeight: 3, // Tilt per distress point easing refugee pull toward an asylum holder (§4a)
  permOpenBorders: 1.4, // Permeability factor when two civs share an Open Borders deal (Phase 4)
  permAlly: 1.3, // Permeability factor when two civs are allied
  permWar: 0.6, // Permeability factor when two civs are at war (< 1 dampens)
  raidTilt: 10, // pull tilt from an active raid's target toward the raider (pre-clamp by tiltCap)

  poachBlock: 12, // extra delta needed for a CROSS-CIV destination (friction)
  refugeePoachBlock: 0, // ...but a war/disaster REFUGEE isn't being poached — they flee, so they pay
  //                       NO cross-civ friction. With ownCivRefugeeBonus also lowered, a collapsing
  //                       civ's refugees spill to neutral neighbours (populating the cross-civ
  //                       network + net-migration chart) instead of piling up internally.
  cooldownTurns: 8, // turns a source rests after emigrating
  minRuralToEmigrate: 1, // a source keeps at least this much rural pop
  refugeesPercent: 50, // % of rural pop that flees a conquered/razed city

  // ── scope ────────────────────────────────────────────────────────
  crossCivEnabled: true, // confirmed reachable by the probe
  includeCityStates: false,
  // Simulation SCOPE (not a visibility control): false = global (every alive civ simulates from
  // turn 1) — the DEFAULT, so migration topology isn't biased by exploration order and conquered
  // cities carry real origin history; true = met-only (lighter per-turn cost on large saves). UI
  // visibility is handled separately (emigration-governance.js): unmet civs stay HIDDEN in the
  // dashboard/lens by default and are revealed only by widening the analytics-visibility policy
  // (opt-in), so global scope never leaks unmet civs.
  requireMet: false,

  // ── prosperity: per-capita productiveness yield weights ───────────
  foodFactor: 1.0, // sustenance / growth headroom
  productionFactor: 1.0, // the "work" proxy (jobs)
  goldFactor: 1.0,
  scienceFactor: 0.25, // weighted down (disproportionate magnitude)
  cultureFactor: 0.5,

  // ── prosperity: happiness + population terms ──────────────────────
  localHappinessFactor: 6.0, // city net happiness weight
  populationFactor: 1.0, // subtracted (small thriving towns still attract)
  // Cause classification: a peacetime departure from a city whose net happiness is below this is
  // attributed to `unhappiness` (push); at/above it the move is `prosperity` (a neighbour's pull).
  // Purely a reporting/attribution split , it never changes whether or where people move.
  unhappyCauseThreshold: 0,

  // ── situational modifiers (percent applied to the whole score) ────
  // War alone does NOT push people out - only actual violence inside a city's
  // borders does (see the violence section). siege = the city being razed.
  siegeModifier: -100,
  starvationModifier: -200, // net food < 0
  unrestModifier: -60, // active unrest
  // No "settlement over cap" term: the game ALREADY penalizes over-cap civs with
  // happiness, which this model reads via the happiness term - adding another
  // would double-count. (And the old "unemployed workers over cap" term was
  // removed - Civ VII has no such mechanic; the specialist cap is a hard
  // placement limit, so it never fired. See docs/civ7-mechanics-and-feasibility.md.)

  // ── violence (combat inside a city's borders → war refugees) ──────
  // Intensity accumulates and decays each turn, so it tracks recent, ongoing
  // fighting. The score penalty slides with intensity up to a cap. All terms are
  // POLLED and fog-independent (district health + pillaged tiles for any met
  // city), so player wars and AI-only wars are treated identically.
  vwAssault: 10, // per full-health-worth of fresh city damage taken in a turn
  vwSiege: 4, // per turn while the city center stays fully wrecked (scales w/ damage)
  // A city that is merely BESIEGED (surrounded) but not yet damaged registers this FRACTION of full
  // siege pressure (was an implicit 1.0). Lowered so early-game city-state / Independent harassment —
  // which besieges without wrecking the district — doesn't instantly cross the flee threshold and
  // flood "war" refugees; it now takes a few sustained turns or real district damage. Tune lower for
  // gentler raids, up to 1.0 to restore the old "any siege = full war pressure" behavior.
  siegeBesiegedFloor: 0.3,
  vwPillage: 0.6, // per turn per pillaged tile in the borders (0 disables the scan)
  violenceDecay: 0.55, // per-turn decay (a one-off skirmish fades in 2–3 turns)
  violencePerPoint: 12, // percent score penalty per intensity point
  violenceCapPct: 220, // max percent penalty from violence
  violenceFleeThreshold: 2, // min intensity before refugees flee directionally

  // ── emigration barriers (added to a source's reluctance) ──────────
  baseReluctance: 4,
  perExtraPop: 0.5, // destination already bigger than the source
  cityStateBarrier: 5,

  // ── geography ─────────────────────────────────────────────────────
  distanceFactor: 0.6, // pull penalty per hex of distance (keeps migration regional)
  fleeFactor: 6, // max bonus for a destination directly away from an invader
  openBordersBonus: 8, // cross-civ pull bonus when two civs share a base-game Open Borders deal

  // ── Transit lag (Feature 1b): migrants don't teleport. They depart the ──
  // ── source the turn they leave (the loss + emigration tally land now) and ──
  // ── ARRIVE at the destination transitLagTurns later (the gain + immigration ──
  // ── tally land then), so a war shows a departure spike at the source and a ──
  // ── delayed arrival bump at the destination. War/disaster refugees take at ──
  // ── least a turn (camps); the lag otherwise scales with distance. If the ──
  // ── destination is gone when they arrive, they perish in transit (a death ──
  // ── charged to the source). 0 = instantaneous (the old behaviour). ──
  transitLagTurns: 4, // cap on transit turns (0 = instant); the lag itself scales with distance
  transitHexPerTurn: 5, // hexes covered per transit turn (distance → lag: ~5 hexes = 1 turn)

  // ── assimilation cost (duration-based consequence via grantYield) ──
  // Each migrant adds "assimilation load" to the DESTINATION civ; that load DECAYS
  // each turn (the duration) and the civ pays a per-turn cost proportional to its
  // current load. So receiving migrants costs you for a while as they integrate,
  // and a magnet civ that keeps pulling people in keeps paying. Scoped to migrated
  // population only (natural growth never adds load). gold is probe-confirmed;
  // happiness is inferred. Any cost to 0 (or load to 0) disables it.
  assimilationLoadPerMigrant: 1.0, // load added to the dest civ per migrant
  assimilationCostPerPop: 0.05, // overcrowding: +5% load per destination population point
  assimilationDecay: 0.7, // per-turn load decay (≈ 6–8 turn assimilation duration)
  assimilationHappiness: 0.5, // happiness/turn drained per unit of load
  assimilationGold: 1.5, // gold/turn drained per unit of load (confirmed lever)
  // ── wealth-aware assimilation cost (P1.4) ──
  // The gold cost above scales with intake (load) but not with the civ's ABILITY
  // to pay. These knobs add a bounded treasury-aware multiplier on the GOLD cost
  // only: a civ whose gold balance is at `assimilationWealthRef` pays the
  // baseline (×1); richer magnets pay more and poorer civs less, clamped to
  // [min, max]. The happiness cost and the structural congestion brake are
  // unaffected (the brake stays global and can't be out-golded). 0 weight
  // disables the wealth scaling entirely (pure intake-proportional cost).
  assimilationWealthWeight: 0.35, // how hard treasury context bends the gold cost (0 = off)
  assimilationWealthRef: 400, // gold-balance reference at which the multiplier is ×1
  assimilationWealthMin: 0.5, // floor multiplier for poor civs (never free)
  assimilationWealthMax: 2.0, // ceiling multiplier for rich magnets

  // ── carried dividend (§1b: the assimilation MIRROR ; the "raise yours" of attraction) ──
  // When a civ holds a Talent/Cultural/Commercial Attraction card, each immigrant it receives
  // accrues a decaying per-turn BENEFIT in the matching yield (+Science/Culture/Gold), granted
  // via Players.grantYield. The positive twin of assimilation load. 0 disables.
  dividendPerMigrant: 1.5, // pool added per immigrant under an attraction (≈ first-turn bonus)
  dividendDecay: 0.7, // per-turn decay of the dividend pool (≈ assimilationDecay)
  dividendCap: 12, // max per-turn dividend granted in a single yield

  // ── migrant-holding penalty (don't hoard unsettled migrant units) ──
  // Each turn, a civ pays per UNIT_MIGRANT it holds (via grantYield), scaling with
  // the count - so overflow migrants must be settled, not stockpiled. 0 = off.
  migrantHoldHappiness: 0.5, // happiness/turn per held migrant unit
  migrantHoldGold: 1.0, // gold/turn per held migrant unit

  // ── Algorithm A: nuanced happiness (ON by default; false → legacy linear term) ──
  // When happinessShaped is true, the linear `happiness × localHappinessFactor`
  // term is replaced by a field-relative, saturating model where happiness
  // AMPLIFIES the economy (bounded), so a happy-but-poor city can't vacuum the
  // map and misery still strongly repels. See docs/algorithmic-improvements.md.
  happinessShaped: true,
  happyScale: 8, // tanh scale on (happiness − regional mean)
  happyRepulsion: 2, // misery side is this much steeper than the saturating pull
  happyAmp: 0.8, // happiness multiplies productiveness, clamped to [min,max]
  happyFloor: 8, // bounded standalone happiness term (pull above mean / push below)
  happyMultMin: 0.2,
  happyMultMax: 1.8,

  // ── Algorithm D: time-gated, capped war displacement (ON by default) ──
  // When warSiege is true, the violence penalty ESCALATES with siege duration
  // (siegeFloor → 1 over siegeRampTurns) and the cumulative population a city can
  // lose to war is CAPPED at siegeLossCapPct of its population when the siege
  // began (the remnant "digs in"). See docs/algorithmic-improvements.md.
  warSiege: true,
  siegeFloor: 0.3, // escalation multiplier at tenure 1 (a fresh raid is gentle)
  siegeRampTurns: 8, // turns of sustained siege to reach full (×1) escalation
  siegeLossCapPct: 0.6, // max share of onset population lost to war-driven emigration

  // ── War surge (Feature 1a): a heavily besieged city sheds population in ──
  // ── BURSTS, not a 1-point-per-turn trickle. The per-turn outflow from a war ──
  // ── source scales with siege intensity (siegeEscalation × how far violence ──
  // ── exceeds the flee threshold), up to warSurgeMax points in a turn - still ──
  // ── bounded by the siegeLossCapPct TOTAL cap above, so a city can't be fully ──
  // ── depopulated. 1 = off (the old linear trickle). ──
  warSurgeMax: 3, // max rural points a besieged source sheds in one turn (1 = off)

  // ── Algorithm B: overcrowding discount (ON by default; 0 → no change) ──
  // Civ VII pop costs ZERO happiness per head (probe API3-2); a tall city's
  // unhappiness comes from overcrowding past a density threshold, which also
  // suppresses its yields. To stop double-punishing deliberate tall play, credit
  // back some happiness for overcrowded urban density when scoring prosperity.
  overcrowdDiscount: 0.3, // happiness credited back per urban-pop point over the threshold
  overcrowdThreshold: 2, // urban population before overcrowding bites (mirrors the GP)

  // ── Algorithm C: congestion headwind + per-civ tuning (ON by default) ──
  // congestWeight makes a civ that's digesting lots of migrants less attractive
  // as a FURTHER destination (a structural anti-runaway brake that can't be
  // out-golded). civTuningEnabled turns on the per-leader/civ variance table
  // (ui/emigration-civ-tuning.js). Both neutral when off.
  congestWeight: 4, // pull penalty per unit of destination per-capita assimilation load
  civTuningEnabled: true,

  // ── Outlet: attrition when there's nowhere to flee (ON by default) ──
  // Keeps the model from being a closed system: a trapped, distressed population
  // (siege / starvation / heavy violence / disaster) with NO viable destination loses
  // population - it leaves the world via the game's own rural-population accounting
  // (addRuralPopulation(-1)), tracked as deaths, not migration. Only fires when there
  // is no destination AND distress is high; never touches a content city.
  attritionEnabled: true,
  attritionMinDistress: 80, // min situational distress (%) before a trapped city loses people
  attritionThreshold: 40, // distress "pressure" to remove one population point

  // ── Feature 1: aggressor-aware war migration (aggressorPenalty 0 = off) ──
  ownCivRefugeeBonus: 1, // war refugees lean slightly toward their own civ's cities first — but only
  //                        slightly, so when a civ is collapsing its people genuinely spill across
  //                        the border to safer neutral neighbours instead of all piling up internally
  aggressorPenalty: 12, // …and avoid the aggressor that attacked them (0 = inert)

  // ── Feature 2: border policies (ON by default) ──
  bordersEnabled: true, // Open/Closed Borders policy effects
  closedBordersOpenness: 0.4, // Closed Borders → 60% of immigration turned away
  closedBordersRetention: 0.6, // Closed Borders → your cross-civ emigration cut to 60% (retention)
  openBordersOpenness: 1.5, // Open Borders → +50% immigration pull
  opennessFloor: 0.15, // closed throttles, never hard-zeros inflow

  // ── §10: in-game feedback & notifications ──
  notifyMode: 1, // 0 off, 1 important-only (default), 2 verbose (per-pass toasts)
  notifyToasts: true,
  notifyFloating: true,
  notifyWorldNews: true,
  worldRefugeeThreshold: 40000, // cumulative scaled people per civ → a refugee-crisis alert
  disasterNotifyMinSeverity: 2, // only notify for disasters at/above this severity (0–3)
  notifyCooldownTurns: 6, // min turns between "important" toasts (anti-spam backstop)

  // ── per-city readout panel (Phase 2): an on-demand "why is this city changing?" box ──
  cityReadoutEnabled: true, // show the per-city migration readout (off = never render it)
  cityReadoutCorner: "top-right", // HUD corner: top-right | top-left | bottom-right | bottom-left

  // ── §11: environmental disasters as a migration driver (ON by default) ──
  disastersEnabled: true,
  disasterPerPoint: 10, // percent prosperity penalty per distress point
  disasterCapPct: 200, // max percent penalty from disaster distress
  disasterPlagueWeight: 8, // standing distress/turn while a city is infected (fog-independent)
  disasterDecay: 0.55, // per-turn decay (a one-off event fades in 2–3 turns)
  disasterFleeThreshold: 2, // min distress to flee the epicenter / tag as disaster-caused
  disasterFlee: 6, // max directional bonus away from the epicenter
  disasterRefugeeBurstThreshold: 0.5, // distress fraction that triggers a one-time burst
  plagueCarryEnabled: true, // migrants from an infected city seed distress at the dest
  plagueCarryDistress: 0.3, // seeded distress per plague-carrier (kept ≪ the source)

  // ── population scaling (MATCHES Demographics scaleCityPopulationAt base curve) ─
  // Not exposed as tunables: changing these breaks alignment with Demographics.
  // Modern megacity ramp/boost is applied in emigration-population.js to mirror
  // Demographics' AGE_MODERN behavior.
  scaleBase: 12000,
  scaleExp: 1.11,
  scaleGrowth: 1.009
};

/**
 * A pristine snapshot of the defaults, taken before any options overrides mutate
 * CONFIG. The settings layer resolves a tunable to its saved value or - failing
 * that - the value here, never a previously-overridden CONFIG value.
 * @type {import("/emigration/ui/emigration-config-types.js").EmigrationConfig}
 */
export const CONFIG_DEFAULTS = { ...CONFIG };
