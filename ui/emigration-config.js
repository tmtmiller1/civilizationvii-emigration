// emigration-config.js
//
// The DEFAULT VALUES of the mod's tunable settings, plus the population-scaling constants that keep
// this mod's "historical" people counts aligned with the Demographics mod. The shape these conform
// to is the EmigrationConfig typedef in emigration-config-types.js; the settings/options layer
// overrides these at boot via applyTunableOverrides.

/** @type {import("/emigration/ui/emigration-config-types.js").EmigrationConfig} */
export const CONFIG = {
  // ── pacing / general ─────────────────────────────────────────────
  turnInterval: 1, // run the emigration pass every N local-player turns
  // Per-CIV move ceiling base: a runaway/perf safety net, NOT the pacing knob (pressure bar + cooldown
  // and warSurge + siege-loss cap pace moves). The effective per-civ ceiling = this + movesPerCity per
  // city + movesPerSiege per city in crisis, so wars on different civs never compete for one budget.
  maxMovesPerTurn: 8,
  movesPerCity: 1, // per-civ ceiling: + this per settlement (the ceiling grows with empire size)
  movesPerSiege: 2, // per-civ ceiling: + this per city in war/disaster crisis. Pairs with warSurgeMax
  //                   (a city's per-turn burst); the budget must be ≥ it to matter. Presets scale it
  //                   (Low 1 / Medium 2 / High 4).
  // Hard PER-CITY ceiling on population points ONE settlement may lose to MIGRATION (crisis + voluntary)
  // in a single turn; the per-civ budgets above bound a whole empire, this bounds each city. Deaths
  // (attrition) are a separate channel. 0 = no per-city cap; presets scale it (Low 1 / Medium 2 / High 4).
  maxLossPerCityPerTurn: 2,
  // Hard PER-CITY ceiling on population points ONE settlement may GAIN from migration in a single turn
  // (departures landing now + due transit arrivals), the symmetric anti-spike guard for destination
  // "black holes". 0 = no per-city cap.
  maxGainPerCityPerTurn: 4,
  emigrationBar: 30, // accumulated pressure (per source) to move one citizen
  deltaExponent: 0.5, // diminishing scaling on the prosperity delta
  // Per-turn RETENTION of a source's accumulated pressure, applied once per pass before the turn's pull
  // is added, so the charge tracks CURRENT conditions and falls when they improve (a move still resets
  // it to 0); half-life = ln(0.5) / ln(retention) turns, ceiling = perTurnPull / (1 - retention), so a
  // settlement migrates only if its pull is both large and SUSTAINED. Gates the VOLUNTARY track only:
  // war and disaster displacement never consult pressure. 1 = off (a ratchet that can only rise).
  pressureRetention: 0.9,

  // ── BUILT ENVIRONMENT (emigration-built.js) ──
  // What a settlement HAS, as a reason to stay: scores the half of a building that is not a yield
  // (walls, housing, a school, the prestige of a wonder) and, unlike the economy term, is NOT divided
  // by population, so building well lets a large settlement hold its people.
  builtEnabled: true,
  // Each ROLE counts ONCE per settlement: three markets are one reason to stay, not three, so a tall
  // build order cannot run away with the term. "prestige" is the exception and is charged per wonder,
  // up to builtWonderCap. Roles are derived from the compiled database at runtime, never a name list.
  builtRoleWeights: {
    prestige: 1.5, // per wonder (the only per-instance role)
    amenity: 1.0, // anything granting happiness
    safety: 0.8, // walls / fortification / defense
    sustenance: 0.8, // anything granting food (a granary)
    learning: 0.8, // anything granting science (a school)
    trade: 0.8, // anything granting gold (a market, a grocer)
    shelter: 0.6, // housing
    culture: 0.6, // anything granting culture
    work: 0.6, // production or citizen slots
    civic: 0.3 // a building the database cannot otherwise explain still counts for something
  },
  builtWonderCap: 3, // most wonders one settlement may be credited for
  builtCap: 6, // ceiling on the whole term, so it stays a counterweight and never the whole score
  builtRefreshTurns: 5, // turns between re-scans (buildings change slowly; the scan is per-plot)

  // ── Voluntary / Crisis SPLIT (rollout flags) ──
  // A source is evaluated as TWO independent systems each pass, crisis displacement (war/disaster) and
  // voluntary migration (prosperity/unhappiness, bar + cooldown), each drawing from its own per-civ
  // budget. Flags exist so the whole split is reversible.
  splitTracksEnabled: true, // false → single-cause-per-pass behavior
  splitBudgetsEnabled: true, // false → one shared per-civ ceiling for both tracks
  splitUiReadoutEnabled: true, // false → city readout shows one dominant cause instead of a breakdown
  // Voluntary-pressure cue: a low-key notification when a city is building toward a move.
  voluntaryCueEnabled: true, // false → no "rising emigration pressure" cues
  voluntaryCueFraction: 0.66, // fraction of the emigration bar a source must cross to cue
  voluntaryCueCooldownTurns: 12, // min turns between cues from the same settlement

  // ── Game-speed scaling (see emigration-game-speed.js) ──
  // The engine paces in TURNS while game speed stretches the same progress over a 6× range of turn
  // counts. With tuning on, turn-count durations and pressure thresholds scale by the speed scalar S
  // and decay re-bases to d^(1/S); invariant magnitudes (loss caps, intensities) don't scale.
  gameSpeedTuningEnabled: true, // false → fixed Standard-speed tuning at every game speed
  gameSpeedScalePopulation: false, // normalize scaleGrowth^(turn/S); CROSS-MOD, see config-types note

  // ── pull composition channels ──
  // Pull = (gradient + TILT) - friction, then x PERMEABILITY. Both policy channels are
  // clamped so any number of cards/agreements/ops compose without runaway.
  tiltCap: 14, // max |targeted attraction| a single pull can gain (Tilt clamp)
  permeFloor: 0.2, // permeability product floor
  permeCeil: 4.0, // permeability product ceiling
  asylumPushWeight: 3, // Tilt per distress point easing refugee pull toward an asylum holder
  permOpenBorders: 1.4, // Permeability factor when two civs share an Open Borders deal
  permAlly: 1.3, // Permeability factor when two civs are allied
  permWar: 0.6, // Permeability factor when two civs are at war (< 1 dampens)
  raidTilt: 10, // pull tilt from an active raid's target toward the raider (pre-clamp by tiltCap)

  poachBlock: 30, // extra delta needed for a CROSS-CIV destination (friction); crossCivMovement 50
  refugeePoachBlock: 0, // ...but a war/disaster REFUGEE isn't being poached, they flee, so they pay
  //                       NO cross-civ friction; a collapsing civ's refugees spill to neutral neighbors.
  // A positive pull ADDED toward a cross-civ destination for a source in acute crisis (war/disaster), so
  // its people flee the dying region to ANOTHER empire instead of a nearer, equally-stricken city of
  // their own civ. 0 = off.
  crisisEscapeBonus: 0, // crossCivMovement 50; raising the slider restores it (14 at 100)
  // Displacement stays internal first: a source in acute crisis adds this to destinations in its OWN
  // civilization, so people who can shelter at home do (most displacement in history is internal).
  // 0 = a crisis sends people wherever the pull is highest.
  crisisInternalBonus: 24,
  cooldownTurns: 8, // turns a source rests after emigrating
  minRuralToEmigrate: 1, // a source keeps at least this much rural pop
  refugeesPercent: 50, // % of rural pop that flees a conquered/razed city

  // ── scope ────────────────────────────────────────────────────────
  crossCivEnabled: true,
  includeCityStates: false,
  // Count a city capture as cross-civ "conquest" migration (the conqueror absorbs the city's
  // population, the prior owner loses it), so the net-migration ledger reflects conquest gains/losses
  //, not just the war-refugee flight around them. false → captures don't touch the migration tally.
  conquestMigrationEnabled: true,
  // Simulation SCOPE (not a visibility control): false = global (every alive civ simulates from
  // turn 1, so migration topology isn't biased by exploration order); true = met-only (lighter
  // per-turn cost). UI visibility of unmet civs is handled separately by emigration-governance.js.
  requireMet: false,

  // ── prosperity: per-capita productiveness yield weights ───────────
  // Weighted so economy carries ~28% of the migration signal alongside the happiness terms
  // (happyFloor/happyAmp/happyRepulsion below); scripts/calibration-sweep.mjs re-measures the balance.
  foodFactor: 2.5, // sustenance / growth headroom
  productionFactor: 2.5, // the "work" proxy (jobs)
  goldFactor: 2.5,
  scienceFactor: 0.625, // weighted down (disproportionate magnitude)
  cultureFactor: 1.25,

  // ── prosperity: happiness + population terms ──────────────────────
  localHappinessFactor: 6.0, // city net happiness weight
  populationFactor: 1.0, // subtracted (small thriving towns still attract)
  // Productiveness is per-citizen: weighted yields / population^popExponent. Below 1 the divisor grows
  // more slowly than the population, so a big settlement keeps more of what it has built and can hold
  // its people against a small neighbor. 1 = a straight per-head average.
  popExponent: 0.85,
  // Cause classification: a peacetime departure from a city whose net happiness is below this is
  // attributed to `unhappiness` (push); at/above it the move is `prosperity` (a neighbor's pull).
  // Purely a reporting/attribution split, it never changes whether or where people move.
  unhappyCauseThreshold: 0,

  // ── situational modifiers (percent applied to the whole score) ────
  // War alone does NOT push people out - only actual violence inside a city's
  // borders does (see the violence section). siege = the city being razed.
  siegeModifier: -100,
  starvationModifier: -90, // net food < 0 (in line with siege −100): strongly repels without making
  //   the city instantly dead.
  unrestModifier: -60, // active unrest

  // ── polity model: happiness STAGES + government + celebration + war weariness ──
  // Reads the game's named happiness stages, government passives, celebrations and empire-wide war
  // weariness (emigration-polity.js) and feeds them in as BOUNDED, additive terms on top of the
  // happiness/yield reads. polityModelEnabled:false = happiness/yield terms only.
  polityModelEnabled: true,
  happinessStageWeight: 4, // bounded pull per happiness-stage step (ANGRY −2 … ECSTATIC +2). An
  //                          ordinal, magnitude-insensitive complement to the raw-happiness terms.
  happinessStageMiseryScale: 0.25, // PULL-BIAS: the negative (unhappy/angry) side of the stage term is
  //   scaled by this, because misery is already covered by the happiness term and suppressed yields;
  //   the positive side keeps full weight. 1.0 = symmetric; 0 = pull-only.
  celebrationPull: 6, // attractiveness while a civ is in a Golden Age
  governmentWeight: 2, // scales the per-government flavor lean. Small: most government effect already
  //                      reaches the model through the happiness + yields the city signal reads, so
  //                      this is a tie-breaker between similar destinations, not a primary driver.
  governmentLeanCap: 3, // clamp on the (scaled) government lean term
  warWearinessModifier: -12, // empire-wide situational push (%) for a war-weary civ. Composes with,
  //                            and is dominated by, the in-border violence terms (no double-punish).
  // No "settlement over cap" term: the game ALREADY penalizes over-cap civs with
  // happiness, which this model reads via the happiness term, so another would double-count.

  // ── violence (combat inside a city's borders → war refugees) ──────
  // Intensity accumulates and decays each turn, so it tracks recent, ongoing fighting; the score
  // penalty slides with intensity up to a cap. All terms are POLLED and fog-independent, so player
  // wars and AI-only wars are treated identically.
  vwAssault: 10, // per full-health-worth of fresh city damage taken in a turn
  vwSiege: 4, // per turn while the city center stays fully wrecked (scales w/ damage)
  // A city that is merely BESIEGED (surrounded) but not yet damaged registers this FRACTION of full
  // siege pressure, so harassment that besieges without wrecking the district takes a few sustained
  // turns or real district damage to cross the flee threshold. 1.0 = any siege is full war pressure.
  siegeBesiegedFloor: 0.3,
  // A city-state or Independent Power raid is harassment, not an invasion: facing only minor powers, the
  // besieged floor drops to this and the whole violence observation is scaled by minorViolenceScale.
  // Actual damage still counts at full weight.
  minorSiegeBesiegedFloor: 0.08,
  minorViolenceScale: 0.4,
  // Multiplier on violence when a MAJOR civilization is among the attackers (or the attackers are unknown). 1 = the
  // measured war balance; moved by the majorWarRefugees Options slider.
  majorViolenceScale: 1,
  vwPillage: 0.6, // per turn per pillaged tile in the borders (0 disables the scan)
  combatEventsEnabled: true, // read the engine's combat event stream (off = polled signals only)
  vwBattle: 1.2, // per fight in a city's territory - violence polling cannot see at all
  vwCasualty: 2.5, // per unit killed in a city's territory (a battle lost is worse than one merely fought)
  violenceDecay: 0.55, // per-turn decay (a one-off skirmish fades in 2–3 turns)
  violencePerPoint: 12, // percent score penalty per intensity point
  violenceCapPct: 220, // max percent penalty from violence
  violenceFleeThreshold: 2, // min intensity before refugees flee directionally

  // ── emigration barriers (added to a source's reluctance) ──────────
  baseReluctance: 4,
  perExtraPop: 0.5, // destination already bigger than the source
  // The mirror of perExtraPop: charges the same friction for abandoning an established settlement for a
  // smaller one, so `populationFactor` alone cannot push a capital toward its lesser neighbors.
  // 0 = off (one-way push only).
  perFewerPop: 0.5,
  cityStateBarrier: 5,

  // ── geography ─────────────────────────────────────────────────────
  distanceFactor: 0.6, // pull penalty per hex of distance (keeps migration regional)
  fleeFactor: 6, // max bonus for a destination directly away from an invader
  openBordersBonus: 8, // cross-civ pull bonus when two civs share a base-game Open Borders deal

  // ── Transit lag: migrants depart the source the turn they leave (the loss lands now) and ──
  // ── ARRIVE at the destination transitLagTurns later (the gain lands then). Refugees take at ──
  // ── least a turn; the lag otherwise scales with distance. If the destination is gone when ──
  // ── they arrive, they perish in transit (a death charged to the source). ──
  transitLagTurns: 4, // cap on transit turns (0 = instant); the lag itself scales with distance
  transitHexPerTurn: 5, // hexes covered per transit turn (distance → lag: ~5 hexes = 1 turn)

  // ── Refugee holding pools (staged settlement) ──
  // Refugees can be assigned to a host city immediately but only a bounded share settles into
  // working population per turn. This models temporary surge pressure (camps/shelter load) without
  // turning every war wave into instant labor growth.
  refugeePoolEnabled: true,
  refugeeImmediateSettlePct: 0.2, // fraction of arrivals that settle immediately (deterministic roll)
  refugeePoolMinHoldTurns: 2, // minimum turns refugees stay in holding before eligible to settle
  refugeePoolSettlePerCityPerTurn: 1, // base points a host city can settle from pool each turn
  refugeePoolHappyScale: 1.25, // settlement-rate multiplier when host happiness is non-negative
  refugeePoolUnhappyScale: 0.6, // settlement-rate multiplier when host happiness is negative
  refugeePoolOvercrowdPenalty: 0.25, // per-urban-over-threshold penalty on settlement rate
  refugeePoolBurdenEnabled: true, // apply temporary support burden while refugees remain in holding
  refugeePoolBurdenGoldPerPoint: 0.35, // gold/turn per held refugee point
  refugeePoolBurdenHappinessPerPoint: 0.12, // happiness/turn per held refugee point

  // ── ethnic integration (composition drift) ──
  // Newcomers gradually take on the host civ's identity: each turn a small fraction of every non-owner
  // origin shifts into the owner's bucket of the composition ledger, UNLESS tension keeps them apart
  // (war with their homeland holds them fully distinct; unrest slows it). integrationRate 0 disables.
  integrationEnabled: true,
  integrationRate: 0.03, // base per-turn fraction of a minority that integrates toward the owner
  integrationWarRate: 0.0, // …while the host is at war with that origin's civ (held fully apart)
  integrationUnrestRate: 0.008, // …while the settlement is in unrest (integration nearly stalls)

  // ── return migration (homeland recovery) ──
  // A diaspora remembers where it came from: when an origin civ's homeland is at peace with the host
  // and faring well, a small share of its people abroad move REAL population back to one of the
  // homeland's cities each turn, throttled so it reads as an ebb. returnRate 0 disables.
  returnEnabled: true,
  returnRate: 0.06, // fraction of a recovered-homeland diaspora that may return per eligible turn
  returnMinShare: 0.08, // a diaspora must be at least this share of the host city to draw returnees
  returnMinPoints: 3, // and the host must hold at least this many of that origin's points to give one
  returnCooldownTurns: 6, // min turns between returns out of the same host settlement
  // Put down roots: a community whose enclave stands in its host settlement returns home at this share of
  // returnRate (1 = no effect, 0 = none return), so return migration does not drain the communities
  // enclaves are made of.
  quarterRootsReturnScale: 0.25,

  // ── Call our people home: a paid, player-initiated push on return migration ──
  // You pay only for the people who actually come, and a call with anyone callable always brings at
  // least one home; the odds decide HOW MANY. Each point is rolled from a seeded roll, so reloading
  // cannot re-roll it. Internal odds sit far above external ones.
  callHomeEnabled: true,
  callHomeChanceExternal: 0.18, // per point, for your people living under another civilization
  callHomeGoldPerPoint: 60, // Gold for a call of ONE; bigger calls climb as n^1.5 (see emigration-call-home.js)
  callHomeInfluencePerPoint: 12, // Influence for a call of ONE (same curve as Gold)
  callHomeExternalCostScale: 1.5, // asking another ruler's cities to empty costs more
  callHomeAgeCostStep: 3, // each age past Antiquity multiplies the fee by this (Exploration ×3, Modern ×9)
  callHomeMaxPointsPerAttempt: 3, // points attempted per call
  callHomeCooldownTurns: 8, // turns before the same civilization may call again
  callHomeOfferWhenCalm: true, // offer the call once no settlement is under distress and people are still away

  // ── refugee dilemmas (rare narrative decisions) ──
  // Once in a while a great wave of refugees reaches your lands and you pause for a short decision
  // (welcome / turn away / settle the frontier). Deliberately RARE (a hard per-age cap plus a long
  // cooldown, genuine upheavals only) and flavor-first; the simulation never depends on it.
  dilemmaSpreeCaptures: 3, // captures by one civ within the window that read as a "conquest spree"
  dilemmaWindowTurns: 10, // rolling window (turns) for counting a spree
  dilemmaMaxPerAge: 2, // hard cap: at most this many dilemmas per age
  dilemmaCooldownTurns: 18, // minimum turns between dilemmas
  dilemmaGoldWelcome: 30, // one-time gold to welcome the refugees in (light)
  dilemmaGoldFrontier: 15, // one-time gold to settle them on the frontier instead
  dilemmaInfluenceAway: 20, // one-time influence cost for turning the refugees away
  dilemmaHappinessWelcome: 10, // one-time happiness hit for absorbing the refugees into your city

  // ── cultural quarters (established diasporas that become player-shaped districts) ──
  // When a foreign diaspora grows into a lasting "quarter" of one of YOUR cities, you're offered a
  // short stance (embrace / tax / let be) with a small bounded PER-TURN yield, recorded per host tile
  // (one quarter per tile). Ranked BELOW the refugee dilemma and throttled by a per-age cap + cooldown;
  // while the host is at war with a quarter's homeland it turns "contested" and strains the host's happiness.
  quartersEnabled: true,
  // Formation bar: the lead FOREIGN origin must hold at least this share of the city AND at least
  // quarterMinStock standing pop points before the city hosts an "established" enclave; the stock
  // floor keeps a tiny diaspora from qualifying on share alone.
  quarterEstablishedShare: 0.3, // share of a city a lead foreign origin must hold to be "established"
  quarterMinStock: 3, // minimum current standing pop points of that lead origin
  // Enclave stickiness: once a foreign origin reaches the foothold share, integration drift on it is
  // multiplied by this factor (≤1) so the diaspora can climb to "established" before its dwell clock
  // completes. 1 = no stickiness; lower = stickier enclaves. See emigration-composition.js.
  quarterEnclaveStickiness: 0.25,
  // Testing/force flag: when true, the local player's single best qualifying diaspora is OFFERED its
  // enclave decision this pass regardless of the soft gates (dwell, per-age cap/cooldown, refugee-dilemma
  // ranking), with the established-share bar relaxed to the foothold share. The min-stock floor still applies.
  quarterForce: false,
  // How an established diaspora becomes an enclave: 0 = ASK (the decision pop-up, your cities only);
  // 1 = AUTOMATIC in your cities (forms with the origin's first stance once the dwell period has held);
  // 2 = AUTOMATIC EVERYWHERE, AI cities included. The per-civilization cap and the dwell period pace every mode.
  quarterRecognition: 2,
  // An enclave FADES when its community does: once the origin's share of the host settlement has stayed
  // below quarterFadeShare for quarterFadeTurns consecutive turns, the enclave dissolves (its tile is
  // removed, its record retired, the chronicle records it). The fade bar sits at half the foothold. 0 = never fade.
  quarterFadeShare: 0.125,
  quarterFadeTurns: 12,
  // ABSOLUTE qualifier: a lead foreign origin with at least this many standing population points is
  // "established" whatever its share, so a big cosmopolitan city can host an enclave. Also the stock
  // below which the fade rule may apply (fade needs BOTH the fade share and this stock). 0 = share only.
  quarterEstablishedStock: 6,
  // The stock bar SCALES with how big cities actually are in this game: the bar above is the value when
  // the mean tracked settlement holds quarterStockRefPop people, and it moves in proportion (clamped to
  // 0.5x to 2x), so six points is half an Antiquity town but a modest quarter of a Modern capital.
  quarterStockRefPop: 18,
  // On-screen self-test: when true, installs a floating "Self-Test" launcher on the HUD (see
  // emigration-selftest.js) that runs live diagnostics and can force the enclave pop-up / a toast, so a
  // player can verify the reported issues in-game without a dev console. Off by default.
  selftestEnabled: false,
  // Persistence gate: an enclave must stay established for this many turns before its one-time decision
  // is OFFERED, so a transient refugee spike never triggers a permanent enclave. The dwell clock
  // tolerates brief dips below the bar (see quarterDwellGrace). 0 = offer as soon as the bar is crossed.
  quarterDwellTurns: 8, // turns an ESTABLISHED enclave must persist before it is RECOGNIZED (stance decision)
  quarterDwellGrace: 3, // turns the diaspora may dip below the bar without resetting the dwell clock (grace/sticky)
  quarterCapPerAge: 3, // hard cap on enclaves per host per age (decisions and automatic recognition)
  // ── per-age pacing (emigration-enclave-pacing.js): at least one an age likely, never more than the cap ──
  quarterPacingEnabled: true, // false = the plain bars all age long
  quarterTargetPerAge: 1, // enclaves per host per age the catch-up aims for (0 = no catch-up)
  quarterPacingMax: 0.4, // the most the formation bars are lowered (0.4 = bars read 60% of configured)
  quarterPacingBy: 0.6, // the age fraction at which the full relaxation is reached (linear from 0)
  quarterCooldownTurns: 12, // minimum turns between quarter decisions
  // ── enclave stance payout (emigration-stance-payout.js): paid ONCE when a stance is chosen ──
  quarterStanceTurns: 3, // a Culture / Science / Influence stance pays this many turns of the host's own income of it
  quarterGoldStanceTurns: 1.5, // a Gold stance pays this many turns of the host's Gold income, and costs nothing
  quarterStanceCostTurns: 2, // the Gold price of a non-Gold stance, in turns of the host's Gold income
  quarterStanceFloor: [60, 150, 300], // the least a payout is, by age (Antiquity, Exploration, Modern), × game speed
  quarterStanceCostFloorScale: 1.5, // the least a price is, as a multiple of that age's payout floor
  contestedQuarterPenalty: 4, // per-pass happiness strain per contested quarter (host at war with its homeland)
  diasporaWarStrainCap: 12, // hard cap on total per-pass contested-quarter happiness strain per host
  contestedQuarterYieldFactor: 0.5, // share of its stance BENEFIT a contested enclave still pays while at
  //                                   war with its homeland (drawback stays full: a strained enclave gives
  //                                   less good, not less bad). 1 = no yield effect; 0 = benefit fully withheld.

  // ── assimilation cost (duration-based consequence via grantYield) ──
  // Each migrant adds "assimilation load" to the DESTINATION civ; the load DECAYS each turn and the
  // civ pays a per-turn cost proportional to its current load, so a magnet civ keeps paying while it
  // integrates newcomers. Migrated population only (natural growth never adds load). 0 disables.
  assimilationLoadPerMigrant: 1.0, // load added to the dest civ per migrant
  assimilationCostPerPop: 0.05, // overcrowding: +5% load per destination population point
  assimilationDecay: 0.7, // per-turn load decay (≈ 6–8 turn assimilation duration)
  assimilationHappiness: 0.5, // happiness/turn drained per unit of load
  assimilationGold: 1.5, // gold/turn drained per unit of load
  // ── departures made real ──
  // A departure abandons one of the source's rural improvements via the engine's DESTROY_ELEMENT
  // (removes the tile AND the population point together, so the city's yields really drop; works on
  // AI cities too). Off = a counter-only decrement that leaves every tile working.
  departureRemovesTile: true,
  // ── arrivals made real for the human player ──
  // 0 off (the raw write; the game's own Grow City prompt asks you to place it) · 1 automatic (the city
  // places it at once with the game's EXPAND command) · 2 ask (native pop-up: choose the tile / let the
  // city decide / later) · 3 migrant unit (newcomers arrive as a Migrant unit you resettle). AI cities
  // always resolve their own pending points.
  arrivalPlacement: 2,
  arrivalPreferSpecialists: false, // automatic placement seats newcomers as specialists when a slot exists
  // In Ask me mode, which newcomers raise the pop-up; the rest are placed automatically. Refugees only by
  // default, so a long game does not raise a pop-up for every arrival.
  arrivalAskRefugees: true,
  arrivalAskMigrants: false,
  arrivalAskReturnees: false,
  // ── the recognized enclave becomes a real tile ──
  // The enclave's own tooltip on the ordinary map: hovering an enclave's tile shows the mod's panel (name,
  // stage, what stood there before, every yield source and its reasoning) in place of the game's tooltip,
  // which can only describe the borrowed improvement the enclave is drawn with.
  enclaveTooltipEnabled: true,
  quarterPlaceImprovement: true, // place the never-buildable enclave tile on recognition (emigration-enclave-place.js)
  // What the placed enclave tile IS (emigration-enclave-skins.js): 1 = THEMED, the origin's own unique
  // improvement where it has one, else another civilization's improvement of the stance's yield family,
  // else the Village; 2 = the Village for every enclave; 0 = the per-civilization enclave improvement.
  // While any skin tile stands it IS the benefit: the stance's benefit grant steps aside and only its drawback is paid.
  enclaveTileSkin: 1,
  // ── wealth-aware assimilation cost ──
  // A bounded treasury-aware multiplier on the GOLD cost only: a civ whose gold balance is at
  // `assimilationWealthRef` pays the baseline (×1); richer magnets pay more and poorer civs less,
  // clamped to [min, max]. The happiness cost and the congestion brake are unaffected. 0 weight disables it.
  assimilationWealthWeight: 0.35, // how hard treasury context bends the gold cost (0 = off)
  assimilationWealthRef: 400, // gold-balance reference at which the multiplier is ×1
  assimilationWealthMin: 0.5, // floor multiplier for poor civs (never free)
  assimilationWealthMax: 2.0, // ceiling multiplier for rich magnets

  // ── carried dividend (the assimilation MIRROR; the "raise yours" of attraction) ──
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
  // When happinessShaped is true, the linear `happiness × localHappinessFactor` term is replaced by a
  // field-relative, saturating model where happiness AMPLIFIES the economy (bounded), so a
  // happy-but-poor city can't vacuum the map and misery still strongly repels.
  happinessShaped: true,
  happyScale: 8, // tanh scale on (happiness − regional mean)
  // happyRepulsion/happyAmp/happyFloor are sized so the happiness term does not saturate the score;
  // suppressed yields carry most of an unhappy city's push. Paired with the yield weights above.
  happyRepulsion: 1.8, // misery side is this much steeper than the saturating pull
  happyAmp: 0.2, // happiness multiplies productiveness, clamped to [min,max]
  happyFloor: 4, // bounded standalone happiness term (pull above mean / push below)
  happyMultMin: 0.2,
  happyMultMax: 1.8,

  // ── Algorithm D: time-gated, capped war displacement (ON by default) ──
  // When warSiege is true, the violence penalty ESCALATES with siege duration (siegeFloor → 1 over
  // siegeRampTurns) and the cumulative population a city can lose to war is CAPPED at siegeLossCapPct
  // of its population when the siege began (the remnant "digs in").
  warSiege: true,
  siegeFloor: 0.3, // escalation multiplier at tenure 1 (a fresh raid is gentle)
  siegeRampTurns: 8, // turns of sustained siege to reach full (×1) escalation
  siegeLossCapPct: 0.6, // max share of onset population lost to war-driven emigration

  // ── War surge: a heavily besieged city sheds population in BURSTS. The per-turn outflow ──
  // ── scales with siege intensity up to warSurgeMax points in a turn, still bounded by the ──
  // ── siegeLossCapPct TOTAL cap above. 1 = off (a linear trickle). ──
  warSurgeMax: 3, // max rural points a besieged source sheds in one turn (1 = off). The per-city cap
  //                (maxLossPerCityPerTurn) bounds it further; presets scale it (Low 2 / Medium 3 / High 5).

  // ── Algorithm B: overcrowding discount (ON by default; 0 → no change) ──
  // Civ VII pop costs ZERO happiness per head; a tall city's unhappiness comes from overcrowding past
  // a density threshold, which also suppresses its yields. To stop double-punishing tall play, credit
  // back some happiness for overcrowded urban density when scoring prosperity.
  overcrowdDiscount: 0.3, // happiness credited back per urban-pop point over the threshold
  overcrowdThreshold: 2, // urban population before overcrowding bites (mirrors the GP)

  // ── Algorithm C: congestion headwind + per-civ tuning (ON by default) ──
  // congestWeight makes a civ that's digesting lots of migrants less attractive as a FURTHER destination
  // (a structural anti-runaway brake that can't be out-golded). civTuningEnabled turns on the
  // per-leader/civ variance table (ui/emigration-civ-tuning.js). Both neutral when off.
  congestWeight: 4, // pull penalty per unit of destination per-capita assimilation load
  civTuningEnabled: true,
  // civTuningStrength FLATTENS the per-leader/civ table toward neutral: 1 = full identity, 0 = fully
  // flat. 0.7 keeps each civ's character and relative ordering but compresses the absolute spread ~30%,
  // so no single leader/civ can diverge far enough to feed a snowball. Only active when civTuningEnabled.
  civTuningStrength: 0.7,

  // ── Anti-snowball headwind: a self-correcting brake on a runaway leader ──
  // Scales with a civ's STANDING dominance: the further its population runs ahead of the world-average
  // civ, the stronger the pull penalty against further CROSS-CIV immigration INTO it (the congestion
  // brake above only fights fresh surges). Never touches a civ at or below the field, OUTflow, or
  // internal moves. penalty = weight * max(0, popRatio - threshold) ^ exponent, popRatio = civPop / world average.
  antiSnowballWeight: 15, // 0 = off; 8 gentle / 15 standard / 28 strong (matches the Options knob)
  antiSnowballThreshold: 1.25, // fair-share multiple a civ may reach before the headwind bites
  antiSnowballExponent: 1.5, // escalation steepness past the threshold (super-linear)
  // Small-civilization brake, the mirror of the anti-snowball headwind: a cross-civ move OUT of a civ
  // below antiDrainThreshold × the world-average civ population pays weight × (threshold − ratio) ^
  // exponent, so a shrinking civ is not drained further. 0 = off.
  antiDrainWeight: 24,
  antiDrainThreshold: 0.8,
  antiDrainExponent: 1,
  // "Movement between civilizations" (Options slider, 0-100): a grouped setting. Moving it writes poachBlock,
  // crisisEscapeBonus, and antiDrainWeight along GROUPED_SETTINGS.crossCivMovement (emigration-tunables.js).
  crossCivMovement: 50,
  // Grouped Options slider (0 to 100) for refugees from minor-power raids: moves minorViolenceScale and
  // minorSiegeBesiegedFloor along GROUPED_SETTINGS.minorRaidRefugees (emigration-tunables.js). 50 = those defaults.
  minorRaidRefugees: 50,
  // Grouped Options slider for refugees from wars with major civilizations: moves majorViolenceScale and
  // siegeBesiegedFloor along GROUPED_SETTINGS.majorWarRefugees. 50 = those defaults.
  majorWarRefugees: 50,

  // ── Outlet: attrition when there's nowhere to flee (ON by default) ──
  // Keeps the model from being a closed system: a trapped, distressed population (siege / starvation /
  // heavy violence / disaster) with NO viable destination loses population via addRuralPopulation(-1),
  // tracked as deaths, not migration. Never touches a content city.
  attritionEnabled: true,
  attritionMinDistress: 40, // min situational distress (%) before crisis death engages; low enough that
  //                           real wars trigger the severity-scaled death channel before the city falls.
  attritionThreshold: 40, // distress "pressure" to remove one population point
  // Unrest is lethal ONLY after this many turns of SUSTAINED unrest (st.unrestTenure); the immediate
  // crises (war/siege/disaster/famine) skip this delay. Below the gate unrest still pushes economic
  // emigration, it just can't kill yet. Game-speed scaled; sits on TOP of the deathRampTurns onset.
  unrestLethalDelayTurns: 10,
  // Lethal CRISES (war, disaster, siege, famine) kill even when people can flee; economic emigration
  // never kills. A city under lethal distress (`distress ≥ attritionMinDistress`) loses SOME population
  // to death (cause `attrition`) concurrently with its emigration, at `crisisDeathShare` of the trapped
  // rate; the fully-trapped case dies at the full rate. NOTE: does NOT count against the war siege-loss cap.
  crisisDeathEnabled: true,
  // The crisis-death rate = crisisDeathShare × warSeverity (capped at the full trapped rate).
  // crisisDeathShare is the BASE coefficient at a minimal one-front siege; warSeverity scales it up with
  // violence and the number of attackers, so a mild war kills a small minority and a brutal one most.
  crisisDeathShare: 0.2,
  crisisSeverityCap: 6, // max distress/floor ratio counted toward severity, the DOMINANT factor (it's
  //                       driven by pillaging, district/assault damage, and siege duration).
  // Participants (number of attackers) are only a SMALL, BOUNDED amplifier on top, a pile-on is a bit
  // deadlier, but it must never overtake the actual damage. Weight is per extra attacker; the total
  // multiplier bonus is capped, so even a 10-civ dogpile adds at most crisisParticipantMax.
  crisisParticipantWeight: 0.1, // each attacker beyond the first adds this
  crisisParticipantMax: 0.4, // hard cap on the participant bonus (reached at ~5 attackers, then flat)
  // Unit CASUALTIES are a MAJOR severity factor: the DEMOGRAPHICS mod's per-civ unit-kill STRENGTH
  // (globalThis.DemographicsData.casualtyCumFor), turned into a recent decaying intensity in
  // emigration-combat. Small weight (it scales a STRENGTH sum), capped below damage. 0 without Demographics.
  crisisCombatWeight: 0.01, // × recent casualty-strength intensity → severity contribution
  crisisCombatMax: 4, // cap on the unit-casualty severity term (a sustained war reaches it)
  combatDecay: 0.7, // per-turn decay of the recent casualty intensity (recent fighting matters most)

  // Death-ONSET smoothing (NOT a cap): a multiplier on death-pressure accrual in [deathRampFloor, 1]
  // that sits at the floor on the first lethal turn and reaches 1 after deathRampTurns of SUSTAINED
  // lethal distress, so a sudden catastrophe is never instantly devastating. A turn of relief relaxes
  // the crisis-tenure counter by one, so a crisis that lets up starts gentle again.
  deathRampEnabled: true,
  deathRampFloor: 0.25, // death-pressure accrual on turn 1 of a lethal crisis (gentle onset, not devastating)
  deathRampTurns: 6, // turns of sustained lethal distress to reach the full (uncapped) death rate

  // ── aggressor-aware war migration (aggressorPenalty 0 = off) ──
  ownCivRefugeeBonus: 1, // war refugees lean slightly toward their own civ's cities first, but only
  //                        slightly, so when a civ is collapsing its people genuinely spill across
  //                        the border to safer neutral neighbors instead of all piling up internally
  aggressorPenalty: 12, // …and avoid the aggressor that attacked them (0 = inert)

  // ── border policies (ON by default) ──
  bordersEnabled: true, // Open/Closed Borders policy effects
  closedBordersOpenness: 0.4, // Closed Borders → 60% of immigration turned away
  closedBordersRetention: 0.6, // Closed Borders → your cross-civ emigration cut to 60% (retention)
  openBordersOpenness: 1.5, // Open Borders → +50% immigration pull
  opennessFloor: 0.15, // closed throttles, never hard-zeros inflow

  // ── in-game feedback & notifications ──
  notifyMode: 1, // 0 off, 1 important-only (default), 2 verbose (per-pass toasts)
  notifyToasts: true,
  notifyFloating: true,
  notifyWorldNews: true,
  inboundNotifyPoints: 2, // min population points arriving in one settlement (per cause+origin) this pass
  // to surface an INBOUND immigration notification, so a steady 1-point trickle stays quiet but a wave
  // reads as "important" news. 0 → surface any inbound (>=1).
  worldRefugeeThreshold: 40000, // cumulative scaled people per civ → a refugee-crisis alert
  disasterNotifyMinSeverity: 2, // min disaster magnitude to TOAST (1=gentle … 2=catastrophic … 4=Thera-tier;
  // impact-derived, see emigration-events.eventSeverity). Markers/distress still record below this.
  disasterNotifyMode: 1, // disaster POPUP scope: 0 off (log only), 1 migration-affecting only (struck a
  // city + >= min severity, the default), 2 any disaster >= min severity. The log records every severe
  // disaster regardless.
  notifyCooldownTurns: 6, // min turns between "important" toasts (anti-spam backstop)

  // ── per-city readout panel: an on-demand "why is this city changing?" box ──
  cityReadoutEnabled: true, // show the per-city migration readout (off = never render it)
  cityReadoutCorner: "top-right", // HUD corner: top-right | top-left | bottom-right | bottom-left
  cityReadoutSparkline: true, // show a recent net-migration trend strip in the readout
  cityReadoutPoolToasts: true, // toast when the selected settlement enters/exits refugee holding
  refugeePoolLensMarkers: true, // prosperity lens: center-tile markers for active refugee holding

  // ── network-timeline event pins ──
  // Pin the wars/disasters that drove the migration onto the network view's playback scrubber, so a
  // spike can be traced to its cause (click a pin to scrub to it). Read-only over the war log and
  // disaster onsets; no simulation effect.
  timelineEventPins: true,

  // ── environmental disasters as a migration driver (ON by default) ──
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
  // Floor on `m` for a CONFIRMED city strike the mod couldn't MEASURE: a disaster the engine says hit
  // a city always lands SOME distress, so it never scores as harmless. Scales by CLASS_WEIGHT via
  // shape(), so at 0.15 a volcano floor ≈3.3 while a thunderstorm stays ambient. 0 ⇒ no floor.
  disasterStrikeFloor: 0.15,
  disasterSpeedShockEnabled: true, // divide the spike by S so slow speeds pay the same TOTAL bite
  disasterAccumCap: 18, // hard ceiling on a city's accumulated disaster distress (guarantees recovery)
  // Mirror of siegeLossCapPct for the disaster channel: across one disaster crisis (until its distress
  // decays away) a settlement loses at most this share of the population it had when the crisis first
  // cost a point; the remnant digs in. 1 = uncapped.
  disasterLossCapPct: 0.5,
  disasterStackFalloff: true, // a new spike adds with diminishing returns the fuller the city already is

  // ── readout: composition-diversity ranking ───────────────────────────────────
  // A read-only dashboard tab ranking settlements by the diversity of their origin mix, plus a derived
  // "cosmopolitanism" character label. Both are DESCRIPTIVE (no yields, no sim state), computed from
  // the composition ledger. diversityRows caps the table; cosmopolitanismScore is separate.
  diversityRanking: true,
  cosmopolitanismScore: true,
  diversityRows: 8, // rows in the ranking table

  // ── readout: the push/pull explainer ─────────────────────────────────────────
  // The "why are they leaving / why there?" cause stack, shown in the city readout and the network /
  // lens hover panels. Read-only: it decomposes the scores the sim already computed (via
  // emigration-explain.js) and renders them as RELATIVE weights - it changes nothing about who moves.
  migrationExplainer: true,

  // ── reset persisted caches on game boot ─────────────────────────────────────
  // When a NEW game is detected within a still-live UIScript isolate (the game's gameSeed changed),
  // every module that registered with emigration-cache-reset.js drops its cache so it reloads from
  // the new game's store. false → rely solely on isolate teardown.
  resetCachesOnGameBoot: true,

  // ── population scaling (inert) ───────────────────────────────────────────────
  // Scaling lives in emigration-population.js (POP_K · W(size, eraGrowthParams)); these keys are
  // retained only so saved configs / config-types stay valid.
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
