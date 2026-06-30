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
  movesPerSiege: 2, // per-civ ceiling: + this per city in war/disaster crisis. Pairs with warSurgeMax
  //                   (a city's per-turn burst); the budget must be ≥ it to matter. Lowered 4 → 2 so a
  //                   single besieged city can't reach a large per-turn loss; presets scale it (Low 1 /
  //                   Medium 2 / High 4).
  // Hard PER-CITY ceiling on how many population points ONE settlement may lose to MIGRATION (crisis +
  // voluntary) in a single turn — the direct guard against "a city shed 5 pop in one turn". The per-civ
  // budgets above bound a whole empire; this bounds each city. Deaths (attrition) are a separate, rarer
  // channel and are not counted here. 0 = no per-city cap. Tunable (advanced) + scaled by the intensity
  // preset (Low 1 / Medium 2 / High 4).
  maxLossPerCityPerTurn: 2,
  // Hard PER-CITY ceiling on how many population points ONE settlement may GAIN from migration in a
  // single turn (departures landing now + due transit arrivals). This is the symmetric anti-spike
  // guard for destination "black holes": one city can no longer absorb dozens of points in one pass.
  // 0 = no per-city cap.
  maxGainPerCityPerTurn: 4,
  emigrationBar: 30, // accumulated pressure (per source) to move one citizen
  deltaExponent: 0.5, // diminishing scaling on the prosperity delta

  // ── Voluntary / Crisis SPLIT (rollout flags; see docs/MIGRATION_SPLIT_PLAN.md §4) ──
  // A source is evaluated as TWO independent systems each pass: crisis displacement (war/disaster,
  // flees every turn) and voluntary migration (prosperity/unhappiness, bar + cooldown), so one city
  // can shed war refugees AND economic migrants concurrently. Each draws from its own per-civ budget,
  // so the two never unbounded-double-drain. Flags exist so the whole split is reversible.
  splitTracksEnabled: true, // false → legacy single-cause-per-pass behavior
  splitBudgetsEnabled: true, // false → one shared per-civ ceiling for both tracks
  splitUiReadoutEnabled: true, // false → city readout shows one dominant cause instead of a breakdown

  // ── Game-speed scaling (Phase 7; see emigration-game-speed.js + docs/SHIP_PLAN.md) ──
  // The engine paces in TURNS; Civ's game speed (Online→Marathon) stretches the same progress over
  // a 6× range of turn counts. With tuning on, turn-count durations (cooldown/ramp/transit) and
  // pressure thresholds scale by the speed scalar S, and decay re-bases to d^(1/S), so migration
  // FEELS the same in game-time at any speed. Invariant magnitudes (loss caps, intensities) don't scale.
  gameSpeedTuningEnabled: true, // false → fixed Standard-speed tuning at every game speed (legacy)
  gameSpeedScalePopulation: false, // normalize scaleGrowth^(turn/S); CROSS-MOD, see config-types note

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
  refugeePoachBlock: 0, // ...but a war/disaster REFUGEE isn't being poached, they flee, so they pay
  //                       NO cross-civ friction. With ownCivRefugeeBonus also lowered, a collapsing
  //                       civ's refugees spill to neutral neighbours (populating the cross-civ
  //                       network + net-migration chart) instead of piling up internally.
  // Removing the cross-civ FRICTION wasn't enough on its own: a nearer internal city still out-pulls a
  // foreign one on distance alone, so crisis refugees relocated WITHIN their own (equally-stricken) civ
  // and died there. This is a positive pull ADDED toward a cross-civ destination for a source in acute
  // crisis (war/disaster), so its people actually flee the dying region to ANOTHER empire. 0 = off.
  crisisEscapeBonus: 14,
  cooldownTurns: 8, // turns a source rests after emigrating
  minRuralToEmigrate: 1, // a source keeps at least this much rural pop
  refugeesPercent: 50, // % of rural pop that flees a conquered/razed city

  // ── scope ────────────────────────────────────────────────────────
  crossCivEnabled: true, // confirmed reachable by the probe
  includeCityStates: false,
  // Count a city capture as cross-civ "conquest" migration (the conqueror absorbs the city's
  // population, the prior owner loses it), so the net-migration ledger reflects conquest gains/losses
  //, not just the war-refugee flight around them. false → captures don't touch the migration tally.
  conquestMigrationEnabled: true,
  // Simulation SCOPE (not a visibility control): false = global (every alive civ simulates from
  // turn 1), the DEFAULT, so migration topology isn't biased by exploration order and conquered
  // cities carry real origin history; true = met-only (lighter per-turn cost on large saves). UI
  // visibility is handled separately (emigration-governance.js): unmet civs stay HIDDEN in the
  // dashboard/lens by default and are revealed only by widening the analytics-visibility policy
  // (opt-in), so global scope never leaks unmet civs.
  requireMet: false,

  // ── prosperity: per-capita productiveness yield weights ───────────
  // Re-weighted ×2.5 in the 1.4.1 balance pass (scripts/calibration-sweep.mjs): the shaped happiness
  // model used to so dominate the score that real economic differences — including 1.4.1's now-harsher
  // −5%/point unhappiness yield penalty — were invisible (economy was ~10% of the migration signal,
  // mostly because the happiness MULTIPLIER sat pinned at its clamp). Raising the yield weights while
  // lowering happiness dominance (happyFloor/happyAmp/happyRepulsion below) rebalances economy to ~28%
  // of the signal and de-saturates the multiplier, WITHOUT changing the overall prosperity scale (so
  // the friction/pacing constants below stay valid). Ratios between yields are unchanged.
  foodFactor: 2.5, // sustenance / growth headroom
  productionFactor: 2.5, // the "work" proxy (jobs)
  goldFactor: 2.5,
  scienceFactor: 0.625, // weighted down (disproportionate magnitude)
  cultureFactor: 1.25,

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
  starvationModifier: -90, // net food < 0 (in line with siege −100). Was −200, but that never fired
  //   until the getNetYield fix made `starving` real, −200 drives prosperity negative on its own,
  //   which is too hot now that it's live; −90 strongly repels without making the city instantly dead.
  unrestModifier: -60, // active unrest

  // ── 1.4.1 polity model: happiness STAGES + government + celebration + war weariness ──
  // Civ VII 1.4.1 reworked happiness into 5 named stages, gave governments happiness-keyed passives
  // + persistent Government Traditions, made celebrations (Golden Ages) scarcer and tourism-feeding,
  // and surfaced empire-wide war weariness. These read those signals (emigration-polity.js) and feed
  // them in as BOUNDED, additive terms on top of the existing happiness/yield reads (which already
  // absorb the −5%/point yield change). All conservative; polityModelEnabled:false = exact pre-1.4.1
  // behavior. See docs/v1.4.1-deep-pass-plan.md.
  polityModelEnabled: true,
  happinessStageWeight: 4, // bounded pull per happiness-stage step (ANGRY −2 … ECSTATIC +2). An
  //                          ordinal, magnitude-insensitive complement to the raw-happiness terms.
  happinessStageMiseryScale: 0.25, // PULL-BIAS: the negative (unhappy/angry) side of the stage term is
  //   scaled by this, because misery is already covered by the happiness term + the now-harsher (−5%/
  //   point, 1.4.1) suppressed yields. The positive side keeps full weight (happy-city attraction isn't
  //   double-counted: positive happiness doesn't boost yields in 1.4.1). 1.0 = symmetric; 0 = pull-only.
  celebrationPull: 6, // attractiveness while a civ is in a Golden Age (now scarcer + feeds Tourism)
  governmentWeight: 2, // scales the per-government flavor lean. Small: most government effect already
  //                      reaches the model through the happiness + yields the city signal reads, so
  //                      this is a tie-breaker between similar destinations, not a primary driver.
  governmentLeanCap: 3, // clamp on the (scaled) government lean term
  warWearinessModifier: -12, // empire-wide situational push (%) for a war-weary civ. Composes with,
  //                            and is dominated by, the in-border violence terms (no double-punish).
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
  // siege pressure (was an implicit 1.0). Lowered so early-game city-state / Independent harassment,
  // which besieges without wrecking the district, doesn't instantly cross the flee threshold and
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

  // ── ethnic integration (composition drift) ──
  // Newcomers gradually take on the host civ's identity. Each turn a small fraction of every
  // non-owner origin in a settlement shifts into the owner's bucket of the composition ledger,
  // UNLESS tension keeps them apart: the host being at war with their homeland holds them fully
  // distinct, and a city in unrest integrates only slowly. So a peaceful, settled host absorbs a
  // diaspora over a long span, while a contested or resentful one keeps a distinct, unintegrated
  // minority that the ethnicity lens shows holding its colour. Set integrationRate to 0 to disable.
  integrationEnabled: true,
  integrationRate: 0.03, // base per-turn fraction of a minority that integrates toward the owner
  integrationWarRate: 0.0, // …while the host is at war with that origin's civ (held fully apart)
  integrationUnrestRate: 0.008, // …while the settlement is in unrest (integration nearly stalls)

  // ── return migration (homeland recovery) ──
  // A diaspora remembers where it came from. When an origin civ's homeland is at peace (not at war
  // with the host) and faring well, a small share of its people abroad set out for home each turn,
  // moving REAL population from the host settlement back to one of the homeland's cities. So a war
  // that scattered a people can, once it ends and the home recovers, draw some of them back. Gentle
  // and throttled, so it reads as an ebb over many turns, not a snap-back. Set returnRate 0 to disable.
  returnEnabled: true,
  returnRate: 0.06, // fraction of a recovered-homeland diaspora that may return per eligible turn
  returnMinShare: 0.08, // a diaspora must be at least this share of the host city to draw returnees
  returnMinPoints: 3, // and the host must hold at least this many of that origin's points to give one
  returnCooldownTurns: 6, // min turns between returns out of the same host settlement

  // ── refugee dilemmas (rare narrative decisions) ──
  // Once in a while a great wave of refugees reaches your lands and you pause for a short decision
  // (welcome / turn away / settle the frontier). Deliberately RARE: a hard per-age cap plus a long
  // cooldown, triggered only by genuine upheavals (a neighbor's conquest spree, a plague crisis).
  // Effects are light and flavour-first (a small gold cost, a settled population point). Toggle the
  // whole thing off in Options (getDilemmasEnabled); the simulation never depends on it.
  dilemmaSpreeCaptures: 3, // captures by one civ within the window that read as a "conquest spree"
  dilemmaWindowTurns: 10, // rolling window (turns) for counting a spree
  dilemmaMaxPerAge: 2, // hard cap: at most this many dilemmas per age
  dilemmaCooldownTurns: 18, // minimum turns between dilemmas
  dilemmaGoldWelcome: 30, // one-time gold to welcome the refugees in (light)
  dilemmaGoldFrontier: 15, // one-time gold to settle them on the frontier instead
  dilemmaInfluenceAway: 20, // one-time influence cost for turning the refugees away
  dilemmaHappinessWelcome: 10, // one-time happiness hit for absorbing the refugees into your city

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
  // happyRepulsion/happyAmp/happyFloor lowered in the 1.4.1 balance pass (scripts/calibration-sweep.mjs)
  // to stop the happiness term from saturating the score (which made economy ~10% of the signal and
  // hid 1.4.1's −5% yield penalty). With governments + the −5% penalty now suppressing unhappy cities'
  // YIELDS directly, the model no longer needs an oversized artificial happiness term to push refugees
  // out; real yields carry more of it. Paired with the ×2.5 yield weights above (overall scale held).
  happyRepulsion: 1.8, // misery side is this much steeper than the saturating pull
  happyAmp: 0.2, // happiness multiplies productiveness, clamped to [min,max]
  happyFloor: 4, // bounded standalone happiness term (pull above mean / push below)
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
  warSurgeMax: 3, // max rural points a besieged source sheds in one turn (1 = off). Lowered 5 → 3: a
  //                heavy assault still evacuates faster than a trickle, but a single city can't lose a
  //                large burst. The per-city cap (maxLossPerCityPerTurn) bounds it further; presets scale
  //                it (Low 2 / Medium 3 / High 5).

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
  // civTuningStrength FLATTENS the per-leader/civ table toward neutral: 1 = full identity (table as
  // written), 0 = fully flat. Default 0.7 keeps each civ's character and relative ordering but
  // compresses the absolute spread ~30%, so no single leader/civ can diverge far enough to feed a
  // snowball. Applies uniformly to base and expansion entries; only active when civTuningEnabled.
  civTuningStrength: 0.7,

  // ── Anti-snowball headwind: a self-correcting brake on a runaway leader ──
  // The congestion brake above fights fresh SURGES (it decays), so it doesn't stop the slow,
  // steady accretion by which one civ snowballs to dominate net migration. This brake scales with
  // a civ's STANDING dominance instead: the further its population runs ahead of the world-average
  // civ, the stronger the pull penalty against further CROSS-CIV immigration INTO it (negative
  // feedback that bounds the snowball). It never touches a civ at or below the field, never impedes
  // OUTflow from a leader, and never touches internal moves. penalty = weight *
  // max(0, popRatio - threshold) ^ exponent, where popRatio = civPop / world-average civ pop.
  antiSnowballWeight: 15, // 0 = off; 8 gentle / 15 standard / 28 strong (matches the Options knob)
  antiSnowballThreshold: 1.25, // fair-share multiple a civ may reach before the headwind bites
  antiSnowballExponent: 1.5, // escalation steepness past the threshold (super-linear)

  // ── Outlet: attrition when there's nowhere to flee (ON by default) ──
  // Keeps the model from being a closed system: a trapped, distressed population
  // (siege / starvation / heavy violence / disaster) with NO viable destination loses
  // population - it leaves the world via the game's own rural-population accounting
  // (addRuralPopulation(-1)), tracked as deaths, not migration. Only fires when there
  // is no destination AND distress is high; never touches a content city.
  attritionEnabled: true,
  attritionMinDistress: 40, // min situational distress (%) before crisis death engages. Lowered 80 → 40
  //                           so real wars actually trigger the (now severity-scaled) death channel
  //                           instead of the city falling to the base game first with the mod killing 0.
  attritionThreshold: 40, // distress "pressure" to remove one population point
  // Lethal CRISES kill even when people can flee, war, disaster, siege, and famine. Economic
  // (prosperity / unhappiness) emigration never kills, because it carries no situational distress.
  // The "no destination" trap almost never fires (there's nearly always somewhere to flee), so without
  // this a city under crisis only ever DISPLACES and never takes casualties. With this on, a city under
  // lethal distress (`distress ≥ attritionMinDistress`) loses SOME population to death (cause
  // `attrition`) concurrently with its refugee/economic emigration, at `crisisDeathShare` of the
  // trapped rate, so flight dominates and the crisis takes a minority. The fully-trapped case (no
  // refuge) still dies at the full rate. NOTE: this does NOT count against the war siege-loss cap, so a
  // very long siege can deplete a city beyond that cap (down to the rural floor), tune the share if so.
  crisisDeathEnabled: true,
  // The crisis-death rate is now DYNAMIC = crisisDeathShare × warSeverity (capped at the full trapped
  // rate). crisisDeathShare is the BASE coefficient at a minimal one-front siege; warSeverity scales it
  // up with violence (siege duration + pillaging + assault) and the number of attackers. So a mild war
  // kills a small minority (flight dominates) while a brutal/prolonged/ganged-up war kills most of those
  // who can't escape. Lowered 0.5 → 0.2 so mild wars flee MORE; severity makes bad wars deadlier.
  crisisDeathShare: 0.2,
  crisisSeverityCap: 6, // max distress/floor ratio counted toward severity, the DOMINANT factor (it's
  //                       driven by pillaging, district/assault damage, and siege duration).
  // Participants (number of attackers) are only a SMALL, BOUNDED amplifier on top, a pile-on is a bit
  // deadlier, but it must never overtake the actual damage. Weight is per extra attacker; the total
  // multiplier bonus is capped, so even a 10-civ dogpile adds at most crisisParticipantMax.
  crisisParticipantWeight: 0.1, // each attacker beyond the first adds this (was 0.5, too steep)
  crisisParticipantMax: 0.4, // hard cap on the participant bonus (reached at ~5 attackers, then flat)
  // Unit CASUALTIES are a MAJOR severity factor (added on top of the damage-driven intensity): a war
  // measured by how much army a civ is losing in the field. The figure is the DEMOGRAPHICS mod's per-civ
  // unit-kill STRENGTH (globalThis.DemographicsData.casualtyCumFor), turned into a recent decaying
  // intensity in emigration-combat. Weight is small because it scales a STRENGTH sum (tens–hundreds per
  // turn of fighting); capped so it stays a co-major factor with damage, never overtaking it. Tune up if
  // your era's unit strengths are higher. 0 when Demographics isn't installed → casualty factor off.
  crisisCombatWeight: 0.01, // × recent casualty-strength intensity → severity contribution
  crisisCombatMax: 4, // cap on the unit-casualty severity term (a sustained war reaches it)
  combatDecay: 0.7, // per-turn decay of the recent casualty intensity (recent fighting matters most)

  // ── Feature 1: aggressor-aware war migration (aggressorPenalty 0 = off) ──
  ownCivRefugeeBonus: 1, // war refugees lean slightly toward their own civ's cities first, but only
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
  disasterNotifyMinSeverity: 2, // min disaster magnitude to TOAST (1=gentle … 2=catastrophic … 4=Thera-tier;
  // impact-derived, see emigration-events.eventSeverity). Markers/distress still record below this.
  disasterNotifyMode: 1, // disaster POPUP scope: 0 off (log only), 1 migration-affecting only
  // (struck a city + >= min severity, the default — keeps popups centered on disasters that drive
  // displacement), 2 any disaster >= min severity (old behavior). The log records every severe
  // disaster regardless, so reducing popups never loses the record.
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
  // Impact-scaled disaster damage (the spike tracks what the disaster ACTUALLY did, not a flat
  // per-type tax). Each flag fail-safes to the legacy CLASS_WEIGHT × severity numbers.
  disasterImpactScalingEnabled: true, // spike = type-CEILING × shape(measured impact m); off ⇒ legacy
  disasterImpactGamma: 0.6, // concavity of shape(m)=m^gamma; 1.0 = linear, <1 lifts small real impacts
  disasterSpeedShockEnabled: true, // divide the spike by S so slow speeds pay the same TOTAL bite
  disasterAccumCap: 18, // hard ceiling on a city's accumulated disaster distress (guarantees recovery)
  disasterStackFalloff: true, // a new spike adds with diminishing returns the fuller the city already is

  // ── latent robustness: reset persisted caches on game boot ──
  // Backstop for the (normally isolate-teardown-driven) reset of the per-module lazy persistence
  // caches: when a NEW game is detected within a still-live UIScript isolate (the game's gameSeed
  // changed), every module that registered with emigration-cache-reset.js drops its cache so it
  // reloads from the new game's store instead of persisting the prior game's data into it. A no-op
  // unless the game id actually changes. false → rely solely on isolate teardown (legacy behavior).
  resetCachesOnGameBoot: true,

  // ── population scaling (DEPRECATED — no longer read) ──────────────────────────
  // Scaling moved to Civ VII's real per-era growth formula in emigration-population.js
  // (POP_K · W(size, eraGrowthParams)), pinned to Demographics by scaling-demographics-parity.mjs.
  // These legacy keys are retained only so saved configs / config-types stay valid; they are inert.
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
