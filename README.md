# Emigration

When a settlement is starving, unhappy, or under siege, people leave. When a settlement is thriving,
they move there instead. *Emigration* adds detailed migration and refugee systems to Civilization VII:
population moves between settlements, changing yields, growth, and Influence as it goes. This happens
within and between civilizations. Every move is recorded in the notification log with its cause.

## A note on the human reality behind this mod

Migration and displacement are abstracted here into game systems. In reality, many people leave home
because of war, persecution, disaster, or hardship. This mod aims to acknowledge those realities rather
than trivialize them.

As part of creating *Emigration*, I donated to the International Refugee Assistance Project. While I'm
not able to sustain a per-subscriber pledge indefinitely, I intend to mark major milestones with
donations of time or money within my means. If you are able, please consider supporting organizations
such as UNHCR, the IRC, MSF, IRAP, or local refugee and mutual-aid groups.

### Subscriber milestones

- **100 subscribers:** Donated $100 to the International Refugee Assistance Project.
- **50 subscribers:** Donated $50 to Médecins Sans Frontières.
- **25 subscribers:** Donated $25 to the International Rescue Committee.
- **10 subscribers:** Pledged one hour of volunteer time for a refugee-support, humanitarian, or
  mutual-aid organization.
- **Release donation:** On upload, made an initial donation to the International Refugee Assistance
  Project.

*Anonymized receipts for these donations will be added to the repository.*

## Mechanics

- **Compatible with 1.4.1.**
- **Prosperity model.** Each settlement gets a score from its yields, happiness, war weariness, and
  government passives. Population moves from low-scoring settlements to higher-scoring ones each turn.
- **Displacement.** Damage, pillaging, sieges, starvation, unrest, and disasters generate refugees.
  Destination priority: own civilization, then neutrals, then the attacker.
- **Attrition.** Sustained sieges, famine, war, or disaster kill population that cannot relocate. The
  death chance accumulates over several turns instead of resolving in one.
- **Delay.** Arriving refugees sit idle before joining the host's working population. They produce no
  yields but carry a support cost, and appear on the map lens and city readout.
- **Distance penalty.** Move probability falls off with distance, so migration favors nearby
  settlements over cross-map jumps.
- **Borders and policy.** Open Borders agreements and Pro-/Anti-Immigration policies raise or lower
  migration rates, settlement chance, retention, and integration cost.
- **Integration cost.** Each incoming migrant applies a temporary happiness and gold cost to the host.
  A congestion penalty caps how much any single settlement can absorb.
- **Origin tracking.** Settlements record the origin civilization of their population. Migrants
  integrate over time, diasporas can return home, and a persistent foreign population can form a
  cultural enclave.
- **Attribution.** Every move stores the factor that decided it (prosperity, distance, safety, open
  borders, allies, asylum, crisis, or war), surfaced in notifications, city readouts, pressure
  warnings, crisis reports, and a persistent log.
- **Game speed.** All turn-based pacing scales automatically from Online to Marathon.

## Migration dashboard

Available through an optional dock button or the Demographics mod's interface. Tabs cover the Migration
Network, Net Migration, Why People Move, Settlements, Diversity, Immigration Policies, Notifications,
and a Guide.

This is not a UI-only mod: population moves and the yield/Influence changes they cause are real, saved
gameplay effects, not a cosmetic display (see §12 for the runtime detail).

### Documentation
- Migration mechanics overview: [../emigration-docs/DESIGN.md](../emigration-docs/DESIGN.md)
- Engine behavior checks and verification notes: [../emigration-docs/FINDINGS.md](../emigration-docs/FINDINGS.md)
- In-game validation checklist: [../emigration-docs/testing-requirements.md](../emigration-docs/testing-requirements.md)
- Civ VII modding mechanics & limits: [../emigration-docs/civ7-mechanics-and-feasibility.md](../emigration-docs/civ7-mechanics-and-feasibility.md)
- Leader/civ ability & memento interactions: [../emigration-docs/leader-civ-memento-interactions.md](../emigration-docs/leader-civ-memento-interactions.md)
- Advanced migration formulas: [../emigration-docs/algorithmic-improvements.md](../emigration-docs/algorithmic-improvements.md)
- Interactive systems: [../emigration-docs/interactive-extensions-design.md](../emigration-docs/interactive-extensions-design.md),
  [../emigration-docs/interactive-extensions-implementation.md](../emigration-docs/interactive-extensions-implementation.md)

---

## System Guide and Feature Reference

*Everything above is the overview. Everything below is the full technical manual — the systems,
formulas, module map, and tuning reference. Skip to a section from the Contents list.*

## Contents

1. [What it does (player-facing)](#1-what-it-does-player-facing)
2. [How it works: the per-turn loop](#2-how-it-works-the-per-turn-loop)
3. [The signals & the Prosperity score](#3-the-signals--the-prosperity-score)
4. [Population scaling (Demographics alignment)](#4-population-scaling-demographics-alignment)
5. [The advanced model (algorithms & per-civ tuning)](#5-the-advanced-model-algorithms--per-civ-tuning)
6. [Interactive systems (on by default)](#6-interactive-systems-on-by-default)
7. [Consequences: the gameplay-write cost layer](#7-consequences-the-gameplay-write-cost-layer-emigration-effectsjs)
8. [Reporting & Demographics integration](#8-reporting--demographics-integration)
9. [In-game feedback & notifications](#9-in-game-feedback--notifications)
10. [Options & tuning](#10-options--tuning)
11. [Architecture / module map](#11-architecture--module-map)
12. [Runtime behavior in game](#12-runtime-behavior-in-game)
13. [Persistence](#13-persistence)
14. [Localization](#14-localization)
15. [Install & run](#15-install--run)
16. [Development](#16-development)
17. [Caveats & limits](#17-caveats--limits)
18. [Compatibility & mod coexistence](#18-compatibility--mod-coexistence)

---

## 1. What it does (player-facing)

Each turn the mod scores every visible city and moves population from the lowest-scoring settlements to
the highest:

- **Peacetime.** Happiness is the largest factor; unhappy or low-yield cities lose people to happier,
  wealthier ones. No war required.
- **War refugees.** A city taking district damage or with pillaging in its borders sheds people fast,
  fleeing away from the nearest invader.
- **Concurrent causes.** War, disaster, and economic pressure are scored independently and at the same
  time (§2), so one city can shed war refugees and economic migrants in the same turn. Each move has one
  cause.
- **Cross-civilization.** People move between civs, not only within your own.
- **Regional.** Distance-penalized: people move to nearby better settlements, not across the map.
- **Consequential.** Receiving migrants costs the destination happiness and gold while it integrates
  them, so magnets converge instead of growing without limit. Holding unsettled migrant units also costs.
- **Speed-aware.** Pacing scales with game speed (§2); the game-time rate is the same on Quick, Standard,
  or Marathon.

Reported in-game (toasts + Demographics graphs) and in the dev log, e.g.
`EMIGRATION 1 population point (≈30,000 people) left Rome (Romans) for Carthage (Carthaginians)`.

### Quick reference: what counts

Default settings (most tunable, §10). Also on the dashboard's **Guide** tab.

**What makes people leave**

| | Counts? | |
|---|:---:|---|
| Unhappiness / low yields | ✓ | Main peacetime driver; happiness weighs most, low per-capita yields add to it (1.4.1 also suppresses unhappy cities' yields) |
| Empire-wide war weariness | ✓ | A modest empire-wide push, on top of per-city violence |
| War damage to districts | ✓ | Read from game state (fog-independent); more damage, more push |
| Being besieged or attacked | ✓ | Only the besieged city; fires when any of its districts is besieged or overrun |
| Attacked by a city-state / Independent Power | ✓ | Same conflict pressure as a major-civ war |
| Pillaged tiles in the city's borders | ✓ | Damaged improvements on the city's own plots (polled, fog-independent) |
| Starvation | ✓ | Negative net food: most flee, some die, until food recovers |
| Plague / disease | ✓ | An infected city loses people; migrants can carry plague onward |
| Natural disasters (floods, volcanoes) | ✓ | A capped per-city penalty; a strike hits every city around its epicenter |
| Overcrowding in a tall city | ✓ | Urban population over a threshold; softened by per-leader tuning |

**What attracts**

| | Attracts? | |
|---|:---:|---|
| Higher prosperity (food, production, gold, science, culture) | ✓ | Per-capita weighted yields above nearby cities |
| Higher happiness | ✓ | Weighted most; in the shaped model it saturates, so no runaway magnet |
| Pro-Immigration Stance | ✓ | Raises inbound pull, earns Influence |
| Open Borders agreement | ✓ | Cross-civ pull bonus |
| Being nearby | ✓ | Distance-penalized |

**Who participates**

| | Participates? | |
|---|:---:|---|
| Your civilization | ✓ | Sends and receives like any major civ |
| Towns | ✓ | Same as cities |
| Your own cities (internal migration) | ✓ | Coloured separately on the dashboard |
| Other major civilizations | ✓ | All simulated from turn one, met or not |
| City-states / minor civs / Independent Powers | ✗ | Don't send or receive (but attacking a city still drives its people out) |
| Unmet civilizations | ✓ | Simulated, masked in the UI by default |

**Behavior**

| | | |
|---|:---:|---|
| Migration between civilizations | ✓ | Throttled by borders, distance, and stance |
| Distant AI-vs-AI wars | ✓ | Only when they damage, besiege, or pillage a city's own territory |
| Fighting outside a city's borders | ✗ | Never drives its emigration; war pressure is territory-scoped (§3) |
| Anti-Immigration Stance retains people | ✓ | More retention + Production, less Influence |
| Closed Borders reduces cross-civ flow | ✓ | Far fewer cross without an Open Borders agreement |
| Population & yields actually change | ✓ | Real per-turn gameplay writes |
| Pacing adapts to game speed | ✓ | Cooldowns, ramps, transit, thresholds scale (§2) |
| Any layer tunable or off | ✓ | Presets + 85 knobs, Options ▸ Mods ▸ Emigration |
| Migrants arrive instantly | ✗ | They travel; arrival lags with distance |
| Absorbing migrants is free | ✗ | A temporary, decaying happiness + gold cost |
| War can empty a city to zero | ✗ | Displacement is capped (`siegeLossCapPct`) above the rural floor; only a capture empties/transfers. Crisis deaths (separate, unfloored) can wear rural pop down, but the urban core survives |

**Identity, integration & return**

| | | |
|---|:---:|---|
| Settlements remember origins | ✓ | Running composition by origin civ; a per-tile mosaic on the Ethnic Composition lens (Shift+E); kept through capture |
| Newcomers integrate over time | ✓ | Each non-owner origin drifts toward the owner per turn (Options ▸ ethnic integration) |
| War / unrest keeps a community distinct | ✓ | Integration stalls at war with the homeland, slows in unrest |
| Diasporas return home | ✓ | When the homeland is at peace and prospering, a fraction return, moving real population (Options ▸ return migration) |
| Refugee waves prompt a decision | ✓ | A rare modal (welcome / settle the frontier / turn away), capped per age, dismissible |
| Migrations written as history | ✓ | The Migration Chronicle, surfaced as prose entries in the Notifications tab; unmet civs framed as hearsay |

**Scope & limits**

| | | |
|---|:---:|---|
| Changes AI or replaces base-game files | ✗ | Additive only |
| Moves population instantly | ✗ | Distance-penalized |
| Lets you place individual migrants | ✗ | Simulated; you shape flows with yields and stances |
| Lets one civ snowball the map | ✗ | Three brakes: field-relative scoring, a congestion headwind, and an anti-snowball headwind on cross-civ inflow (all tunable) |

**FAQ**

- **Where do people go?** The nearest higher-prosperity settlement they can reach.
- **Where do war refugees flee?** Away from the nearest enemy: own civ, then neutrals, attacker last.
- **How many, how often?** War/disaster refugees flee every turn; voluntary migration is gradual. Each
  civ has its own per-turn budget, so simultaneous wars don't throttle one another.
- **Capturing or losing a city?** It keeps its origin mix; only a capture transfers it.
- **Why the sudden drop?** A toast names the cause; the per-city readout shows the pressure mix.

**Post-war recovery**

- **Will a war-shrunk city grow back?** Yes. Displacement moves population points, never razes districts
  or buildings (only conquest does). It regrows via food growth and immigration once fighting stops.
- **Do the same refugees return?** Some do. Once the homeland is at peace and prospering, Return
  Migration (§6g) moves a fraction back, attributed to their true origin; the rest regrows from new
  residents. Toggle: Options ▸ return migration (on by default).
- **Does repairing pillaged tiles restore population?** No. Repair removes the pressure (faster recovery)
  but adds no population back.
- **How far can war shrink a city?** Displacement is capped at `siegeLossCapPct` (60% by default) of
  onset population. Crisis deaths are separate and uncapped and can wear rural pop past that, but only a
  capture takes the city. (The cap is a fraction, speed-invariant.)
- **Fastest recovery?** Make peace (violence decays in ~2–3 turns), repair pillaged tiles, raise
  happiness.

**Migration in transit**

Moves aren't instant: transit lag (`transitLagTurns`, distance- and speed-scaled) leaves a migrant
between cities.

- **Lifecycle.** Departure removes the source's rural point immediately (losing that tile's yields). In
  transit the migrant belongs to no city (no yields, no upkeep). The integration cost is paid by the
  destination on arrival.
- **Per-city caps.** A city loses at most `maxLossPerCityPerTurn` and gains at most
  `maxGainPerCityPerTurn` per turn (the inbound cap bounds total intake). Both scale with the intensity
  preset. Deaths aren't counted against either.
- **Arrival isn't guaranteed.** An arrival into a full city waits and retries (longest-waiting first); if
  the destination is razed/captured or still full after several turns, the migrants perish in transit. The
  cap is never overrun.
- **How long.** 1–4 turns at Standard (`transitHexPerTurn` ≈ 5 hexes/turn), longer on slower speeds;
  war/disaster refugees take at least 1.
- **What you'll see.** Gross Emigration can tick up before Immigration catches up. Net Migration counts
  only settled, cross-civ moves.

---

## 2. How it works: the per-turn loop

On every `PlayerTurnActivated`:

1. **Per-civ costs** (`chargePerTurnCosts`) run for whichever civ's turn it is: the decaying integration
   cost and the migrant-holding penalty (§7).
2. **The emigration pass** (`runPass`) runs once on the local player's turn (gated by `turnInterval`):
   1. Decay accumulated violence and disaster distress (rates game-speed-adjusted, below).
   2. Collect signals: one `CitySignal` per met city (§3).
   3. Rank by Prosperity: score every city, sort descending (§3, §5).
   4. Advance state: a monotonic turn counter (for scaling), prune/tick cooldowns, compute per-owner
      populations (for congestion).
   5. Process each source as two concurrent tracks (below), each civ bounded by its own per-turn move
      ceilings (`civMoveCeilings`, a runaway/perf safety net, not the pacing knob): `maxMovesPerTurn` +
      `movesPerCity`·(settlements) for the voluntary ceiling, `movesPerSiege`·(cities in crisis) for the
      crisis ceiling. Ceilings are per-civ, so simultaneous wars don't compete for one global budget.
   6. Persist state to `GameConfiguration`; surface feedback (§9).
3. **Events.** Subscribed at boot: `DiplomacyDeclareWar`/`MakePeace` feed the aggressor map (§6a);
   `RandomEventOccurred` feeds disaster distress and a named alert (§6c).

### Two concurrent tracks: voluntary vs crisis (`splitTracksEnabled`)

Each source is evaluated as two independent systems every pass, so both can fire in the same turn toward
the same destination:

- **Crisis** (war / disaster): flees every turn (no bar, no cooldown), bounded by `warSurgeMax` and the
  cumulative `siegeLossCapPct`. Cause is *disaster* when disaster distress dominates, else *war*.
- **Voluntary** (prosperity / unhappiness): accumulates pressure toward `emigrationBar`, moves one point
  on crossing it, then rests for `cooldownTurns`. Cause is *unhappiness* when happiness is low, else
  *prosperity*.

Each track has its own per-civ budget (`splitBudgetsEnabled`). Every record still carries one cause
(concurrency = multiple records), so by-cause telemetry is unchanged. The city readout shows the live
mix ("War 60% · Prosperity 40%", `splitUiReadoutEnabled`). All three flags default on; off restores
single-cause-per-pass.

When a source has no viable destination (the outlet, §6d), a sufficiently distressed source builds
attrition pressure and eventually loses a rural point with no destination (a death, not a move).

### Game speed (all turn-based pacing scales, `gameSpeedTuningEnabled`)

The engine paces in turns, but game speed stretches the same game-progress over a ~6× range of turn
counts (`GameSpeeds.CostMultiplier`). Uncorrected, the mod would be calibrated for Standard and drift
elsewhere. Pacing is scaled by the speed scalar **S** so migration feels the same in game-time at any
speed:

| Speed | CostMultiplier | S | cooldown 8 → | bar 30 → |
|---|---:|---:|---:|---:|
| Online | 50 | 0.5 | 4 | 15 |
| Quick | 67 | 0.67 | 5 | 20 |
| **Standard** | **100** | **1.0** | **8** | **30** |
| Epic | 150 | 1.5 | 12 | 45 |
| Marathon | 300 | 3.0 | 24 | 90 |

- **Turn-count durations ×S:** `cooldownTurns`, `siegeRampTurns`, `transitLagTurns`.
- **Pressure thresholds ×S:** `emigrationBar`, `attritionThreshold`.
- **Decay re-based to `d^(1/S)`:** `violenceDecay`, `disasterDecay`.
- **Never scaled:** `siegeLossCapPct` and intensity thresholds (a siege costs the same fraction at any
  speed), yield weights, friction, and the per-turn move ceilings.

It is automatic: reads the active speed once via `Configuration.getGame().gameSpeedType` →
`GameInfo.GameSpeeds.lookup(...).CostMultiplier`, caches it, fail-safe to S = 1 if unreadable. Gated on
`gameSpeedTuningEnabled` for rollback. See [`emigration-game-speed.js`](ui/emigration-game-speed.js). A
separate, default-off `gameSpeedScalePopulation` flag normalizes the §4 people-scaling exponent
(cosmetic, cross-mod; see §4).

---

## 3. The signals & the Prosperity score

`emigration-cities.js` builds a `CitySignal` per city (owner, population, rural pool, urban population,
per-capita yields, net happiness, unrest, starvation, siege, war, accumulated violence, accumulated
disaster distress, infected flag). `emigration-prosperity.js` turns it into a score. The default (legacy
linear) model:

$$
\begin{aligned}
P &= \left(Q + h\,\lambda_h - n\,\lambda_n\right)\left(1 + \frac{s}{100}\right), \\
Q &= \frac{f\,w_F + p\,w_P + g\,w_G + sc\,w_S + c\,w_C}{n}, \\
s &= v + d + \sigma + \tau + u.
\end{aligned}
$$

$P$ is prosperity, $Q$ per-capita productiveness, $h$ net happiness, $n$ population, $s$ the summed
situational percentage from violence, disaster, siege, starvation, and unrest.

Higher = more attractive. Happiness dominates (weight `localHappinessFactor`, default 6). The situational
multiplier is where war/violence, disasters, sieges, starvation, and unrest bite. §5 replaces the
happiness term and the violence penalty with more nuanced versions when their flags are on. The
magnitude of the negative situational percent is exposed as `distress(s)`, which drives the outlet (§6d)
and weights the readout's cause mix.

### Polity signals (`emigration-polity.js`): happiness stages, governments, celebrations (1.4.1)
1.4.1 reworked happiness, governments, and celebrations, so the model reads three more signals (bounded,
additive, behind `polityModelEnabled`; set false for exact pre-1.4.1 scoring):

- **Happiness stage:** each settlement's 5-stage ordinal (Angry −2 … Ecstatic +2), bucketed against
  `GameInfo.HappinessStages` like the base-game banner. Adds a magnitude-insensitive pull/push
  (`happinessStageWeight`) so 1.4.1's sharper swings register without re-tuning the raw-happiness knobs.
- **Celebration:** a civ in a Golden Age is a stronger attractor (`celebrationPull`), from
  `player.Happiness.isInGoldenAge`.
- **Government:** a small clamped per-government lean (`governmentWeight`, `governmentLeanCap`) that
  breaks ties; most of a government's effect already reaches the model through happiness/yields.
- **War weariness:** a war-weary civ's settlements take a modest empire-wide push
  (`warWearinessModifier`), distinct from and dominated by the in-border violence terms.

Read once per civ per pass and denormalized onto each `CitySignal` (`stage`, `polity`).

### Violence (`emigration-violence.js`): polled, fog-independent
War-driven emigration keys on actual violence inside a city's borders, not on the empire being at war,
and is symmetric for player-watched and distant AI-vs-AI wars because it reads game state, not
visibility-gated events:

- **City under attack:** polls the center district's health (`getDistrictHealth`/`…MaxHealth`), readable
  for all players regardless of line of sight. Fresh damage spikes (`vwAssault`); standing damage
  sustains a siege (`vwSiege`).
- **Pillage:** damaged improvements on `getPurchasedPlots()` add standing pressure (`vwPillage`).
- The score accumulates and decays (`violenceDecay`, adjusted to `d^(1/S)`): a sustained siege builds, a
  lone raid fades in ~2–3 turns of game-time. With Algorithm D on, the curve also escalates with siege
  duration (over `siegeRampTurns`, ×S) and is capped in total (§5-D).

Territory-scoped: all three signals read only the city's own footprint (`districtDamageFrac` /
`districtBesieged` match by `owner:id`; `pillagedCount` scans the city's own `getPurchasedPlots()`). A
field battle in neutral land, a war elsewhere, a tile the city doesn't own, or a distant AI-vs-AI war
never moves its people. The civ-wide `sig.atWar` flag is not a cause (dev-log label only); `fleeVector`
is gated on the city's own violence. One boundary case counts: a district flagged besieged by units just
outside its borders, which `siegeBesiegedFloor` keeps gradual.

### Geography (`emigration-geography.js`)
- **Distance decay:** `−distanceFactor × hexDistance`.
- **Flee-from-invader:** when violence crosses `violenceFleeThreshold`, refugees prefer destinations away
  from the nearest enemy (`fleeFactor`).
- **Aggressor preference:** own civ > neutral > attacker, when Feature 1 is on (§6a).
- **Open Borders flow bonus:** a modest cross-civ pull bump between civs with a base-game agreement
  (`openBordersBonus`, §6b).

### The destination decision (`emigration-pull.js`)
Two bounded channels over the prosperity gradient and friction terms:

$$
\begin{aligned}
\mathrm{Pull}(s,d) &= \Big(\Delta\mathrm{Pros}(s,d) + \mathrm{Tilt}(s,d) - \mathrm{Friction}(s,d)\Big) \cdot \Pi(s,d), \\
\Delta\mathrm{Pros}(s,d) &= \mathrm{Pros}(d)-\mathrm{Pros}(s), \\
\mathrm{Tilt}(s,d) &= \mathrm{clamp}\big(\mathrm{asylumTilt}(s,d),-\mathrm{tiltCap},\mathrm{tiltCap}\big), \\
\Pi(s,d) &= \mathrm{clamp}\big(\mathrm{openness}(d)\cdot\mathrm{retention}(s)\cdot\mathrm{permOpenBorders}^{ob}\cdot\mathrm{permAlly}^{al}\cdot\mathrm{permWar}^{wa},\ \mathrm{permeFloor},\mathrm{permeCeil}\big).
\end{aligned}
$$

In permeability $\Pi$, $\mathrm{openness}(d)$ is the destination's inbound throttle and
$\mathrm{retention}(s)$ the source's cross-civ outbound throttle, the two halves of the Anti-Immigration
stance (§6b). Both are 1 unless border policies are on, and retention applies only cross-civ.

Friction:

$$
\begin{aligned}
\mathrm{Friction}(s,d) =&\ \mathrm{baseReluctance}
+ \mathrm{perExtraPop}\cdot\max\left(0,\mathrm{pop}(d)-\mathrm{pop}(s)\right)
+ \mathrm{cityStateBarrier}
+ \mathrm{poachBlock} \\
&-\ \mathrm{geoAdjust}(s,d)
+ \mathrm{congestionFor}(d)
+ \mathrm{dominanceFor}(d).
\end{aligned}
$$

$\mathrm{dominanceFor}(d)$ is the anti-snowball headwind: $0$ unless the destination civ runs ahead of
the world-average civ, then
$\mathrm{antiSnowballWeight}\cdot\max\!\left(0,\frac{\mathrm{pop}_\text{civ}(d)}{\overline{\mathrm{pop}}_\text{civ}}-\mathrm{antiSnowballThreshold}\right)^{\mathrm{antiSnowballExponent}}$.
It applies only to cross-civ inflow into a runaway leader, never to its own outflow or internal moves.
Tunable (Off / gentle / standard / strong + threshold).

War is not a hard gate: a besieged city has low prosperity and a flee vector, then passes through the
same pull equation. People can emigrate to any civilization.

### The Prosperity map lens (`emigration-prosperity-lens.js`, `emigration-prosperity-tooltip.js`)
A self-registering lens shades the world by prosperity tile by tile: each plot is scored from its own
per-plot yields (`GameplayMap.getYields(plotIndex, playerID)`), normalized against the world plot field,
and painted in buckets, with a per-city fallback when per-plot yields aren't available. Hovering a plot
adds the reading to the tooltip.

---

## 4. Population scaling (Demographics alignment)

`emigration-population.js` converts abstract population points into representative people using the
identical formula to the Demographics mod, grounded in Civ VII's own per-era growth formula (the food
cost to grow a settlement, which differs by age):

```
W(N, era)           = Σ cost(1..N) for era's {flat, scalar, exp}   // the game's real per-era growth cost
eraParams(age, pct) = blend(prev-era, this-era params)             // continuous across age boundaries
scaleCityPopulation = POP_K × W(size, eraParams) × megacity × overtime, then soft-capped to the era max
```

Each age uses the game's real growth parameters (Antiquity / Exploration / Modern), so a settlement reads
at a sane size for its age with a smooth hand-off at each boundary. A Modern-only megacity term lets the
largest cities reach the real 10–38M range; an endgame term keeps figures growing past the natural end;
a soft per-era ceiling caps the result. There is no turn-based multiplier, so the figure doesn't drift
with game speed. A moved point is reported as the marginal people it represents
(`scale(pop) − scale(pop−1)`), and its small per-event variation leans on the source's real happiness and
urban/rural mix (its name only as a tie-breaker). `formatPeople` renders "30,000 / 1,300,000 /
240,000,000". `moveRural` performs a relocation; `removeRural` removes a point with no destination (the
outlet's death, §6d), using the same rural-population accounting as the game's own starvation shrinkage.

> **Always aligned with Demographics.** Both mods carry the identical scaling, pinned bit-for-bit by a
> cross-mod parity test (`tests/scaling-demographics-parity.mjs`). Because scaling is keyed to the age,
> not the raw turn count, the figure is the same on Online, Standard, and Marathon. The turn-based pacing
> knobs (§2) are still scaled by game speed and on by default.

---

## 5. The advanced model (algorithms & per-civ tuning)

Four algorithms plus a per-civ tuning table refine the baseline, all on by default (each switchable in
Options). Full math + before/after numbers:
[../emigration-docs/algorithmic-improvements.md](../emigration-docs/algorithmic-improvements.md).

### A. Shaped happiness (`happinessShaped`)
The linear `happiness × 6` term let pure-happiness sources run away (Franklin's Glass Armonica,
+15 happiness/ally, made a ~50× magnet). The shaped model is field-relative (measured vs the world mean),
saturating on the pull side and steep on the misery side (`tanh`), and makes happiness amplify the
economy (bounded multiplier + `happyFloor`) rather than dwarf it. Franklin drops to ~2× while unhappy
cities still shed strongly.

### B. Overcrowding discount (`overcrowdDiscount`)
The probe (§12) confirmed population costs zero happiness per head; a tall city's unhappiness is
overcrowding past a density threshold, and `getYield` is the net, post-penalty value, so unhappiness
double-hits. The discount credits back density-driven unhappiness via `urbanPopulation` vs
`overcrowdThreshold`.

### C. Congestion headwind + leader variance (`congestWeight`)
A structural anti-runaway brake that can't be out-golded: a civ absorbing many migrants becomes a less
attractive further destination, scaling with its per-capita assimilation load. Two leader-variance knobs
ride the assimilation cost via the civ table: `integrationSpeed` (load decay) and `assimilationEase`
(gold cost).

### D. Capped, time-gated war displacement (`warSiege`)
Fog-independent violence made war a bloodless depopulation tool. The siege model tracks siege tenure,
escalates the penalty from `siegeFloor` to full over `siegeRampTurns` (×S), and caps total war loss at
`siegeLossCapPct` of onset population (the remnant digs in), so a city can lose substantial population but
can't be emptied without a capture.

### The civ tuning table (`emigration-civ-tuning.js`, `civTuningEnabled`)
A small, auditable registry of bounded per-leader/per-civ nudges, keyed on the GameInfo leader string
(`_ALT` personas normalized; leader overrides civ). Fields: `happinessPull`, `integrationSpeed`,
`assimilationEase`, `overcrowdDiscount`, `warRetention`, `sourceBias`. Shipped entries target outliers:
Franklin `happinessPull 0.75`, Isabella `0.85`+`ease 1.2`, Xerxes `ease 1.25`, Khmer `sourceBias 1.5`,
Pachacuti `overcrowdDiscount 0.5`, Norman/England `warRetention 1.4`, etc. None can cause a runaway; the
structural guarantees live in the algorithms.

**Brush & Blade coverage.** The table extends to the expansion's civs/leaders, abilities read from the
DLC game files and mapped to the same six fields. Conquest economies pay more to absorb spoils
(Assyria/Bulgaria/Ottomans/Pirate Republic; Alexander/Genghis Khan/Edward Teach, `assimilationEase`
1.2–1.25), while Bolívar drops to `0.85`. Fortification-defensive civs hold population under siege
(Dai Viet/Sengoku `warRetention 1.4`), and Toyotomi (double defensive damage) sheds it
(`warRetention 0.85`). Happiness/celebration magnets are damped (Heian/Silla, Himiko `happinessPull
0.85`); tall/few-settlement shapes are shielded from the density penalty (Carthage/Nepal/Qajar);
high-growth Shawnee and FOOD-penalized Napoleon get a small `sourceBias` cushion. Civs/leaders with no
migration-relevant outlier (Iceland, Tonga, Great Britain; Ada Lovelace, Gilgamesh, Lakshmibai,
Friedrich) stay neutral.

**Flatten knob (`civTuningStrength`, default 0.7).** A global control that compresses every profile
toward neutral: `1.0` = the full table, `0` = fully flat (same as off). It interpolates each field toward
its neutral, preserving relative ordering while shrinking the absolute spread. The default `0.7` keeps
each civ's character but trims divergence ~30% as extra anti-snowball margin; exposed as a Scope tunable.

---

## 6. Interactive systems (on by default)

### 6a. Aggressor-aware war refugees (`aggressorPenalty`, 0 = off)
When civ A attacks civ B, B's refugees prefer B's own cities first, then any civ other than A, and treat
A as a last resort. The aggressor is read from the public `DiplomacyDeclareWar` event (`actingPlayer`
declared on `reactingPlayer`), persisted as a victim→aggressors map in `emigration-war.js` and cleared on
peace. The preference (`ownCivRefugeeBonus` toward own civ, `−aggressorPenalty` for the attacker) is
folded into `geoAdjust` only for cities under violence.

### 6b. Immigration-stance policies + Open Borders agreements
Two distinct levers control cross-civ immigration.

**Your stance (a policy card, `bordersEnabled`).** Slot **Pro-Immigration Stance** or **Anti-Immigration
Stance** (renamed from "Open/Closed Borders" to avoid colliding with the base game's Open Borders
agreement). A database component (`data/emigration-policies-{antiquity,exploration,modern}.xml`, one file
per age) adds the traditions, one per age, available to every civ. They unlock from a mid-age civic node
(Antiquity **Citizenship**, Exploration **Economics**, Modern **Social Question**). (Internal trait IDs
keep `TRADITION_EMIG_OPEN/CLOSED_BORDERS_*`.) The two stances are asymmetric:

- **Pro-Immigration Stance:** +50% immigration into your cities (`immigrationOpenness(destOwner)`) plus a
  native +1/+2/+3 Influence `TraditionModifier`.
- **Anti-Immigration Stance:** throttles inbound immigration to 40% (floored at 0.15) and retains your
  own people (cross-civ outbound pull cut to 60%, `emigrationRetention(srcOwner)`), plus a native
  +2/+3/+4 Production in every city and a −2/−3/−4 Influence penalty.

The migration % and retention are custom UI-VM mechanics; Influence and Production are native
`TraditionModifier`s (`data/emigration-policies-gameeffects.xml`), so they show on the card and in the
yields breakdown.

**Diplomatic Open Borders (a flow bonus, `openBordersBonus`).** When two civs hold an active base-game
Open Borders agreement, migration between them is eased both ways (checked in
`emigration-geography.js`). Console check: `emigration.openBorders(aPid, bPid)`.

Governments no longer separately affect emigration.

#### Policy cards by age (shipped)
Age-scoped in `data/emigration-policies-{antiquity,exploration,modern}.xml`, native per-turn yields in
`data/emigration-policies-gameeffects.xml`. Names below are the in-game display names.

Antiquity cards

| Policy (Civic) | Effects (native + migration) |
|---|---|
| Pro-Immigration Stance<br>(Citizenship) | +1 Influence/turn <br><br>Migration: pull x 1.5<br>(openBordersOpenness) |
| Anti-Immigration Stance<br>(Citizenship) | -2 Influence/turn, +2 Production/city <br><br>Migration: inbound pull x 0.4 (floor 0.15);<br>own cross-civ outbound x 0.6 (retention) |

Exploration cards

| Policy (Civic) | Effects (native + migration) |
|---|---|
| Pro-Immigration Stance<br>(Economics) | +2 Influence/turn <br><br>Migration: pull x 1.5<br>(openBordersOpenness) |
| Anti-Immigration Stance<br>(Economics) | -3 Influence/turn, +3 Production/city <br><br>Migration: inbound pull x 0.4 (floor 0.15);<br>own cross-civ outbound x 0.6 (retention) |
| Talent Attraction<br>(Inspiration) | +1 Science/turn <br><br>Migration: +1.5 Science pool<br>per arrival |
| Cultural Magnetism<br>(Society) | +1 Culture/turn <br><br>Migration: +1.5 Culture pool<br>per arrival |
| Commercial Draw<br>(Mercantilism) | +1 Gold/turn <br><br>Migration: +1.5 Gold pool<br>per arrival |
| Selective Asylum<br>(Piety) | +1 Influence/turn <br><br>Migration: refugee pull tilt |

Modern cards

| Policy (Civic) | Effects (native + migration) |
|---|---|
| Pro-Immigration Stance<br>(Social Question) | +3 Influence/turn <br><br>Migration: pull x 1.5<br>(openBordersOpenness) |
| Anti-Immigration Stance<br>(Social Question) | -4 Influence/turn, +4 Production/city <br><br>Migration: inbound pull x 0.4 (floor 0.15);<br>own cross-civ outbound x 0.6 (retention) |
| Talent Attraction<br>(Modernization) | +2 Science/turn <br><br>Migration: +1.5 Science pool<br>per arrival |
| Cultural Magnetism<br>(Natural History) | +2 Culture/turn <br><br>Migration: +1.5 Culture pool<br>per arrival |
| Commercial Draw<br>(Capitalism) | +2 Gold/turn <br><br>Migration: +1.5 Gold pool<br>per arrival |
| Refugee Compact<br>(Political Theory) | +2 Influence/turn, +1 Culture/turn <br><br>Migration: refugee pull tilt |

Internal IDs: OPEN_BORDERS = Pro-Immigration Stance, CLOSED_BORDERS = Anti-Immigration Stance, TALENT =
Talent Attraction, CULTPULL = Cultural Magnetism, TRADEPULL = Commercial Draw, ASYLUM = Selective Asylum
/ Refugee Compact. Prefix `TRADITION_EMIG_`; suffix `_ANTIQUITY` / `_EXPLORATION` / `_MODERN`.

#### How attraction policy card yields function
Attraction cards have two yield layers, and they stack:

1. **Native fixed yield from the DB card** (`data/emigration-policies-gameeffects.xml`): a constant
   per-turn yield in the normal game breakdown (values scale by age).
2. **Carried dividend from immigrant intake** (`emigration-dividend.js`): each incoming migrant under an
   active attraction adds pool:

$$
\mathrm{pool}_{y} \leftarrow \mathrm{pool}_{y} + \mathrm{dividendPerMigrant}
$$

Each turn the pool decays and grants capped yield:

$$
\begin{aligned}
\mathrm{pool}_{y} &\leftarrow \mathrm{pool}_{y}\cdot\mathrm{dividendDecay}^{\Delta t}, \\
\mathrm{grant}_{y} &= \min(\mathrm{dividendCap},\ \mathrm{pool}_{y})
\end{aligned}
$$

So the card converts migration throughput into ongoing yield. Defaults: `dividendPerMigrant = 1.5`,
`dividendDecay = 0.7`, `dividendCap = 12`/turn per channel. The flat `+N Influence/turn` is the card
modifier, not per-immigrant; only the carried dividend is per-immigrant.

### 6c. Environmental disasters & plague (`disastersEnabled`)
Civ VII's `RandomEvents` (flood / volcano / plague / hurricane / blizzard / tornado / duststorm /
thunderstorm) become a migration driver parallel to war. `emigration-disasters.js` accumulates per-city
disaster distress that decays each turn (game-speed-adjusted) and feeds a situational penalty, so struck
cities shed climate/disaster refugees. Fog-independent: the signal is `city.isInfected` plus a
severity-scaled spike from `RandomEventOccurred`. Plague-as-contagion (`plagueCarryEnabled`, off):
migrants fleeing an infected city seed a smaller outbreak-distress at their destination.

### 6d. The outlet: crisis death (`attritionEnabled`)
A death channel (cause `attrition`, tracked as deaths, kept out of the migration/refugee metrics) runs on
its own `deathPressure` alongside emigration. It fires under lethal distress
(`distress >= attritionMinDistress`): war, disaster, siege, famine. Economic emigration carries no
situational distress, so it never kills. Two modes:

- **Trapped** (no viable destination): the whole trapped population dies off at full rate.
- **Crisis while fleeing** (a refuge exists, `crisisDeathEnabled`): because the trap almost never fires, a
  besieged/starving/disaster-struck city loses some people to death while the rest flee, at
  `crisisDeathShare` (default 0.2) of the trapped rate, so flight dominates. Death builds on
  `deathPressure`, crosses `attritionThreshold` (×S), and removes a rural point via the same
  `addRuralPopulation(-1)` the game's starvation uses.

**Onset smoothing.** Per-turn buildup is scaled by `deathRamp(crisisTenure)`, in [`deathRampFloor` (0.25),
1]. A fresh crisis kills gently and deepens over `deathRampTurns` (6) of sustained distress;
`crisisTenure` counts sustained lethal turns and relaxes by one on any turn of relief.

**Not capped.** Crisis death doesn't count against the war siege-loss cap and isn't held to the emigration
rural floor, so a long enough siege or famine can wear rural population all the way down. It removes only
rural population, so the urban core and settlement survive until a capture. Lower `crisisDeathShare` or
raise `deathRampTurns` if too lethal. State (`deathPressure`, `crisisTenure`) persists across save/reload.

Tuning note: `starvationModifier` is -90 (was -200; -200 flips prosperity negative on its own, so with
death on this channel the penalty's job is purely emigration).

### 6e. Asylum and relationship permeability
Pull is a prosperity gradient plus a targeted-attraction channel (`tilt`) and relationship-permeability
multipliers: asylum push (`asylumPushWeight`) for distressed refugees toward hospitable destinations,
relationship permeability (`permOpenBorders`, `permAlly`, `permWar`) scaling cross-civ movement, and
global bounds (`tiltCap`, `permeFloor`, `permeCeil`). Computed in `emigration-pull.js`, so it composes
with prosperity/geography/congestion rather than bypassing them.

### 6f. Ethnic composition, integration & the per-tile lens (`emigration-composition.js`, `emigration-ethnicity-lens.js`)
Every settlement keeps a running ethnic composition: population by the civilization each person descends
from (`emigration-composition.js`), netted each pass from arrivals (origin = source owner), births
(current owner), losses (proportional), and conquest (origin buckets kept, owner flips). It follows the
settlement, not the owner, so a captured city keeps its residents' origins. The Ethnic Composition lens
(Shift+E) paints it as a per-tile mosaic (`emigration-ethnicity-distribution.js`): tiles weighted by
build-up (city center > urban > rural > wilderness); each origin claims a share-proportional count of
tiles (floored to one) spread across the density gradient, opacity tracking density. Ethnic integration
drifts a small fraction of every non-owner origin toward the owner each turn (`integrationRate`), held
apart while the host is at war with that origin's homeland (`integrationWarRate`) and slowed in unrest
(`integrationUnrestRate`). Toggle: Options ▸ ethnic integration (on by default).

### 6g. Return migration (`emigration-return.js`, `returnEnabled`)
When an origin civ's homeland is at peace with the host and faring well (non-negative net happiness, fed),
a fraction of its people abroad set out for home, moving real population (a rural point from the host to
one of the homeland's cities), attributed to the returnees' true origin so composition and lens follow
them home. Throttled by a per-host cooldown (`returnCooldownTurns`) and a deterministic per-pass rate
(`returnRate`), and floored so it only draws from a host that has rural population to give (never invents
people, never targets a city-state as a homeland). Toggle: Options ▸ return migration (on by default).

### 6h. Refugee decisions & the Migration Chronicle (`emigration-dilemma.js`, `emigration-chronicle.js`)
The Migration Chronicle (`emigration-chronicle.js`) writes significant movements as short prose
(`emigration-narrative.js`): a great exodus, a diaspora taking root, a people returning home. Each entry is
mirrored into the Notifications tab as a chronicle-styled entry rather than living on its own tab. A refugee decision (`emigration-dilemma.js`) is a rare modal triggered by a real upheaval (a
neighbor's conquest spree, or a plague crisis) that sends a wave toward the local player: welcome them (a
small gold cost, settles a point into your largest city), settle the frontier (a smaller cost, into a
town), or turn them away. Hard-capped per age (`dilemmaMaxPerAge`) with a long cooldown
(`dilemmaCooldownTurns`), effects light, dismissible (Escape or click outside). For both surfaces, an
unmet civ is named as hearsay rather than revealed. Toggle: Options ▸ refugee decisions (on by default).

### 6i. Cultural Enclaves (`emigration-quarter.js`, `emigration-quarter-registry.js`, `emigration-quarter-bonuses.js`)
When a foreign diaspora grows into a lasting, established community in one of your cities (a standing
presence, not a lifetime-arrivals total), it forms a Cultural Enclave on a specific edge tile, named for
the origin people (e.g. *the Roman Enclave*). You're offered a one-time choice: two identity-grounded
options, each a small benefit paired with a matching drawback grounded in that civilization's character
(a Roman enclave offers Production/Gold, a Persian one Gold/Culture; 47 civs in
`emigration-quarter-bonuses.js`), plus a passive "let them be." The chosen stance applies its yields every
turn (bounded, ±1–2), so it reads in the city; an unknown/DLC origin falls back to a neutral pair.

Below the prose sits a single short, real, attributed historical quote, shown in the origin people's own
language with an English translation (e.g. *"ὁ ἀνεξέταστος βίος οὐ βιωτὸς ἀνθρώπῳ. (The unexamined life is
not worth living.)" — Socrates*). Each original was verified against a primary source, and RTL scripts
(Arabic, Persian) are bidi-isolated. An origin has two quotes: its first enclave shows quote A, its second
shows quote B.

Bounds:
- **One enclave per host tile.** A different origin overtaking the same tile is a change of hands (the
  Chronicle notes it, a fresh choice is offered), never a stacked second enclave.
- **At most two enclaves per origin civilization** across your empire (per civilization, not overall).
  Identity is fixed by CivilizationType when the enclave forms (persisted), so the cap stays correct even
  if the origin player changes civ across an age.
- **Contested in war.** While you're at war with an enclave's homeland it turns contested: its yield
  benefit is reduced (`contestedQuarterYieldFactor`, default half) **and** a bounded happiness strain
  applies (capped across all your enclaves), framed as wartime suspicion, not disloyalty. It contributes
  fully again once peace returns.
- Throttled with a per-age cap and cooldown, ranked below the refugee decision so two modals never race.
  Toggle: Options ▸ Mods ▸ Emigration ▸ cultural enclaves (on by default). (Internally the code, config
  keys, and save data still use "quarter"; only the player-facing name changed.)

---

## 7. Consequences: the gameplay-write cost layer (`emigration-effects.js`)

Civ VII makes raw population free, so the mod adds the missing feedback via
`Players.grantYield(pid, YIELD_X, −amount)` (probe-confirmed to deduct, cross-civ; happiness leg
inferred):

- **Assimilation cost (duration-based).** Each migrant adds load to the receiving civ
  (`assimilationLoadPerMigrant × (1 + assimilationCostPerPop × destPop)`). Load decays each turn
  (`assimilationDecay`, optionally scaled by `integrationSpeed`) and the civ pays per-turn
  `assimilationHappiness`/`assimilationGold` per unit (gold leg optionally scaled by `assimilationEase`).
  Scoped to migrated population only.
- **Migrant-holding penalty.** Per-turn cost per unsettled `UNIT_MIGRANT` a civ holds.
- **Congestion headwind (Algorithm C).** `congestionPenalty` + `assimLoadFor`; the engine subtracts the
  headwind from a destination's pull.
- **Carried dividend.** Under attraction contexts, incoming migrants build a decaying per-turn positive
  pool in the matched yield domain (`emigration-dividend.js`).

All apply to every civ on its own turn. Set any knob to 0 to disable.

---

## 8. Reporting & Demographics integration

When the Demographics mod is installed, Emigration contributes via its companion hook
(`globalThis.DemographicsMetricsAPI`, an order-independent handshake):

- **A top-level Emigration tab** (`registerPanel`/`registerMetricGroup`). Its first section, **Data**, is
  a metric group with two pill-row toggles: metric and units, **Scaled** (historical people) or **Civ
  numbers** (raw points). Each metric carries a one-line definition:
  - **Net Migration (Graph):** cumulative arrivals minus departures per civ, over time.
  - **Net Migration (Table):** the same net per civ; the units pills drive the values, magnitude drawn as
    a diverging bar in its own column (red left of centre for loss, green right for gain).
  - **Emigration:** gross people who left each civ (with a `Sources: War …, Disaster …` breakdown).
  - **Immigration:** gross people who arrived (same breakdown).
  - **Refugees (Left):** people this civ displaced, with war + disaster onset markers (named, by year).
    War onsets come from Demographics war history; disaster onsets from this mod's event log. Each family
    has its own toggle (Options ▸ Mods ▸ Demographics), both default on.
  - **Refugees (Arrived):** displaced people it took in, same toggleable markers.
- **The full dashboard as native sub-tabs:** Network (animated dot-swarm + arrow flow map, each with a Civ
  Pop / Scaled Pop toggle), Causes, Settlements, Diversity, Immigration Policies, Notifications, and Guide.
  Registered order-independently; a silent no-op on an older Demographics.
- **A Migration Chronicle** (`emigration-chronicle.js`): a persisted, written history of the movements that
  read as history — a great exodus, a diaspora taking root, a return home — distinct from the per-event
  log. Each moment is composed as prose (`emigration-narrative.js`), spoiler-guarded, and kept newest-first
  and capped. It is not a separate tab: every entry is mirrored into the **Notifications** sub-tab as a
  chronicle-styled entry, so the Notifications log is the single home for every migration event, the story
  prose included.
- **Causes drill down to the event.** Each broad cause on the Causes tab expands to the named events
  behind it (a particular war, eruption/flood, or the active age crisis), with each event's emigration
  and deaths. A crisis is attributed to its mechanism (Invasion under War, Plague under Disaster,
  Loyalty/Revolt under Unhappiness), resolved at the moment of each move. Per-civ event tallies are
  persisted (`outByEvent` / `deathsByEvent`, capped per civ).
- **A Notifications log** (the Notifications sub-tab): a permanent, scrollable record of every migration
  notification that has fired. Each row is cause-themed and names the specific event: the named war
  (via the aggressor map + engine war name) or the named disaster/plague (the game's own `RandomEvents`
  name). Clicking a row expands it: cause, event, source settlement, destination, and count (both
  systems). Persisted across save/reload (`emigration-notifications.js` → `-view.js`).
- **An Ethnic Composition lens + plot tooltip** (`emigration-ethnicity-lens.js`, `-tooltip.js`, fed by
  `emigration-composition.js`). A self-registering lens (Shift+E) paints each settlement as a per-tile
  mosaic; hovering a settled tile adds exact per-origin percentages to the tooltip. Both honor the
  spoiler-protection visibility policy (§10).
- **A Refugees row in the Demographics war-effects tooltip** (reads `globalThis.EmigrationData.refugeesCumFor`),
  rendering "- no data" when Emigration isn't installed.
- **A Network-only timeline-detail note** when the snapshot interval is coarser than every turn
  (`globalThis.EmigrationTimelineNote`).

`EmigrationData` (global) carries per-civ cumulative tallies: gross in/out, net, refugees, deaths, and the
per-cause breakdowns (`emigrationByCauseFor`, `immigrationByCauseFor`). If Demographics isn't installed
it's a silent no-op. The dot-swarm (`emigration-network-viz.js`) animates only people who moved: each
cross-civ immigrant flies out of its origin civ's circle (its origin sub-cluster when known) to the
destination, and each intra-civ mover flies from its source settlement (on load and scrub, not only live
playback). Home-grown population materializes in place rather than streaming out of the civ's centre.
(Origin lookup uses nullish-coalescing, not `||`, so an origin at node index 0 isn't mistaken for the
destination.)

---

## 9. In-game feedback & notifications

Migration is surfaced as styled HUD toasts and, for big world events, world-news. The toast reads as a
native Civ VII message: `TitleFont` eyebrow over a `BodyFont` body, the dark panel gradient with bronze/
gold trim (`#8c7e62` frame, `#f0bc78` highlight), slide-in/fade-out, ~11-second dwell, and vertical
stacking so several don't overlap. Each toast is themed by cause (a coloured left accent bar + eyebrow:
War red, Disaster amber, Attraction green, Conquest, …), and every count is shown in both systems (raw
points and scaled people, e.g. *"3 population points (36,000 people)"*). It is important-only by design,
with several anti-spam layers, and because toasts stay brief every notification is also recorded in the
Notifications log (§8). The layers:

- **Rich, named events** (`emigration-naming.js`): disasters use the game's own names
  (`GameInfo.RandomEvents.lookup(type).Name`), wars reuse the war name, conquest names the sacked city.
  E.g. *"The Thera eruption displaces 80,000."*
- **Explanatory, per event** (`emigration-feedback.js`, `emigration-causes.js`). When your cities lose
  people in a pass, the loss is broken into distinct events (one per source settlement + cause), each with
  its own accurate count. On screen only the largest event toasts (subject to the cooldown); every event
  is recorded individually in the log. The cause-keyed action hint and permanence cue ride the toasts and
  disaster alert.
- **Per-city readout** (`emigration-city-readout.js`). An on-demand panel answering "why is this
  settlement changing?": the cause mix when more than one pressure is active (*"War 60% · Prosperity
  40%"*, else the single dominant cause) + status (building pressure / resting), where its people are
  pulled, the integration cost, the civ's net migration, the hint, and an at-risk / trapped warning.
  Built from the recompute-on-read `citySnapshot` (no new state); opens via `emigration.city(id)` /
  `.hideCity()` and best-effort on city selection. Toggle `cityReadoutEnabled`; works without
  Demographics.
- **Dashboard window** (`emigration-window.js` + the shared render core). A standalone HUD window
  (`emigration.window()` / `.closeWindow()`) with the whole picture: an animated migration network and
  cross-civ flow map (both with a timeline scrubber), a per-civ ledger (in/out/net/refugees/deaths), the
  cause breakdown, who holds Pro-/Anti-Immigration stances, and cities ranked by pressure. The same core
  backs the Demographics tab (§8). The timeline records a per-civ population snapshot every pass,
  including peaceful turns, so the scrubber is available from the opening turns.
- **Anti-spam.** Disasters notify only at/above `disasterNotifyMinSeverity`. World refugee notifications
  are once-per-milestone on a civ's cumulative refugees (`worldRefugeeThreshold`), but the cumulative
  total only gates the alert; the headline names the specific war/disaster and reports that pass's
  outflow, so the figure stays event-scale. A global `notifyCooldownTurns` backstops everything.
  `notifyMode`: 0 off / 1 important-only (default) / 2 verbose.

---

## 10. Options & tuning

Everything is under **Options → Mods**, in both the main-menu (pregame) and in-game Options screens.
`emigration.modinfo` loads the options layer in both shell and game scopes, registering via
`Options.addOption({ category: CategoryType.Mods, … })`. Settings persist in the shared, cascade-safe
`modSettings` localStorage slice and apply immediately and at game boot.

- **Emigration** group: **Migration counts** (Both / Civ only / Historical only), **Emigration intensity**
  (Custom / Low / Medium / High), **Dashboard data** (Live / Sample preview), **Migration timeline
  detail** (snapshot every 1–5 turns), and a **Migration dock button** toggle (on by default).
- **Emigration - Advanced:** every tunable as a dropdown/checkbox, generated from a declarative spec
  (`emigration-tunables.js`), grouped: pacing, scope, prosperity weights, advanced-model switches (§5),
  war/violence (incl. siege model + aggressor avoidance), border policies, geography, integration/migrant
  cost, disasters (+ plague carry), notifications, and the outlet (attrition).

Game-speed scaling is automatic, not a knob: the §2 scaling reads the active speed and applies itself,
gated by internal flags (`gameSpeedTuningEnabled` on; `gameSpeedScalePopulation` off) for rollback/QA
rather than exposed in the UI.

Simulation scope and visibility are independent. By default the simulation runs over the whole world
(every alive civ, from turn one), so topology isn't biased by exploration. (Set *Scope* to met-only to
lighten per-turn cost.) Independently, the dashboard and lenses mask civs for spoiler protection per a
shared analytics-visibility policy (All / Met-only / Own-civ / Disabled), host-authoritative in
multiplayer, default met-only.

The full default set lives in `emigration-config.js`; scaling constants are not exposed (they must match
Demographics).

---

## 11. Architecture / module map

Modules are small and single-concern (a ≤500-line file gate), so several systems span a parent plus
helpers. The `ImportFiles` manifest is a complete inventory of the deployed UI tree, gated by a test
(`tests/modinfo.mjs`). Key modules:

- `ui/emigration-main.js`: entry UIScript, per-turn hook/costs, event subscriptions, reporting/feedback orchestration, dev dock, boot.
- `ui/emigration-config.js` / `-config-types.js`: tunable defaults + scaling constants, and the `EmigrationConfig` typedef.
- `ui/emigration-game-speed.js`: the game-speed scalar (§2); reads `GameSpeeds.CostMultiplier`, caches S, exposes `speedTurns` / `speedBar` / `speedDecay` / `speedScaleTurn` (fail-safe to 1).
- `ui/emigration-causes.js`: the migration-cause taxonomy (`MigrationCause` + `causeLabel` / `causePermanence` / `causeHint` / `isRefugeeCause`).
- `ui/emigration-tunables.js`: declarative exposed knobs plus Low/Med/High presets.
- `ui/emigration-cities.js`: enumerates met cities into `CitySignal` records.
- `ui/emigration-prosperity.js`: prosperity scoring (legacy + shaped happiness + overcrowding) and `distress`.
- `ui/emigration-violence.js` / `-violence-signals.js`: violence state machine (accumulate/decay, siege tenure/escalation/cap) + the fog-independent polled combat signals.
- `ui/emigration-disasters.js`: per-city disaster distress, decay, plague-carry seeding.
- `ui/emigration-geography.js`: distance decay, flee-from-invader, aggressor preference, Open Borders flow bonus.
- `ui/emigration-civ-tuning.js` / `-war.js`: per-leader/civ tuning table; aggressor map from `DiplomacyDeclareWar`/`MakePeace`.
- `ui/emigration-borders.js`: border-policy reads → `immigrationOpenness` (inbound) + `emigrationRetention` (outbound), attraction yields, asylum flag.
- `ui/emigration-effects.js` / `-dividend.js` / `-migrant-units.js`: assimilation load + congestion headwind; carried-dividend benefit; unsettled-migrant penalty.
- `ui/emigration-engine.js`: main pass, ranking, the two concurrent tracks, per-civ budgets, transit, and the outlet.
- `ui/emigration-arrivals.js`: lagged-arrival processing (the depart/arrive halves of a transit move).
- `ui/emigration-pull.js`: destination decision (`adjustedPull`, `bestDestination`, `migrationCause`).
- `ui/emigration-state.js`: engine-state persistence (per-source voluntary + crisis pressure/cooldown, scaling turn, per-owner populations).
- `ui/emigration-population.js`: population reads/writes and Demographics scaling (with the optional speed-normalized exponent).
- `ui/emigration-migration-stats.js` / `-migration-records.js`: per-civ tallies, the recent-moves feed, the `EmigrationData` global, and the `Migration` record typedef.
- `ui/emigration-city-readout-data.js` / `-city-readout.js`: the per-city snapshot (`buildCitySnapshot` + `citySnapshot`, incl. the cause mix) and the on-demand readout panel.
- `ui/emigration-views.js` / `-ledger-view.js` / `-window.js`: the shared dashboard render core and the standalone window host.
- `ui/emigration-network-viz.js`: the animated dot-swarm; movers fly from their origin civ/settlement on load/scrub; residents materialize in place.
- `ui/emigration-migration-page.js` / `-demographics.js`: the Demographics-page panel registration and the graph specs with subtitles + per-cause tooltips.
- `ui/emigration-prosperity-lens.js` / `-prosperity-tooltip.js`: the tile-by-tile Prosperity lens (§3) and its tooltip.
- `ui/emigration-ethnicity-lens.js` / `-ethnicity-tooltip.js` / `-composition.js`: the Ethnic Composition lens, tooltip, and origin-mix ledger.
- `ui/emigration-naming.js` / `-feedback.js` / `-events.js` / `-report.js` / `-log.js`: rich event naming; cause-themed, dual-number, stacking toasts + world-news + anti-spam; `RandomEventOccurred` handling; record→log lines; dev logging.
- `ui/emigration-notifications.js` / `-notifications-view.js`: the persistent notification log and its click-to-expand sub-tab.
- `ui/emigration-settings.js` / `-options.js` / `ui/options/*`: number-display preference + tunable/preset getters; Options registration; the Advanced editor and the cascade-safe `modSettings` store.
- `data/emigration-policies-*.xml`, `-policies-gameeffects.xml`, `-policy-icons.xml`, `-civilopedia.xml`: DB components for the stance/attraction cards, native modifiers, icons, and Civilopedia pages.
- `devtools/migration-probe.js`: dev-only API probe (separate modinfo, not shipped).
- `text/<locale>/ModText.xml` + `scripts/i18n_*.mjs`: localized strings (all 10 locales) and the dev-only localization pipeline (§14).

`emigration.modinfo` ActionGroups: the options layer in both shell + game scopes; the engine and its
submodules (`ImportFiles`) in game scope; an always-on `<UpdateDatabase>` for the Civilopedia pages +
policy `TraditionModifier`s; an `<UpdateIcons>` for card art; and three age-scoped `<UpdateDatabase>`
groups for the border policies (one per age via `AgeInUse`, required because Civ VII rebuilds the
gameplay database each age, so a civic-tree unlock can only reference nodes that exist in that age's
database).

The Civilopedia component adds an Emigration section with an overview plus one page per system
(Prosperity, War & Refugees, Integration, Borders & Influence, Disasters & Plague, the Outlet, Leaders &
Civilizations), reusing the base `Concept` layout. All page text flows through the §14 pipeline
(`LOC_PEDIA_EMIG_*`, all 10 locales).

---

## 12. Runtime behavior in game

The mod runs in the UI VM (GameFace JS) and applies migration, costs, and reporting during normal play.
Behavior checks are documented in the companion validation notes.

- **`city.addRuralPopulation(±1)`:** the population move/removal. Not owner-gated → works cross-civ. The
  only population write, which is why the outlet kills via the same channel as starvation.
- **`Players.grantYield(pid, YIELD_X, ±n)`:** yield costs; not owner-gated, negative deducts (gold
  confirmed, cross-civ).
- **`DiplomacyTreasury.changeDiplomacyBalance(±n)`:** Influence write (superseded; border-policy Influence
  is now a native `TraditionModifier`).
- **War aggressor:** `DiplomacyDeclareWar` carries `actingPlayer` (declarer) + `reactingPlayer` (target).
- **Game speed:** `Configuration.getGame().gameSpeedType` → `GameInfo.GameSpeeds.lookup(type).CostMultiplier`.
- **Reads (fog-independent):** district health, `city.isInfected`, `Culture.getActiveTraditions` /
  `isTraditionActive`, `GameInfo.RandomEvents`, `player.leaderType`/`civilizationType`, per-plot yields
  (`GameplayMap.getYields`), and a per-civ population aggregate, all read for all players.
- **Yields are NET, not gross.** Per-city economic yields are read via `city.Yields.getNetYield(YIELD_X)`
  (income − maintenance/upkeep), falling back to `getYield` only when net is unavailable. `getYield` alone
  is gross; an earlier audit found the mod was using it, which made `net food < 0` (starvation)
  impossible to observe and overstated gold/Prosperity.
- **Happiness economy:** pop upkeep happiness `= 0`, `OVERCROWDING_THRESHOLD = 2` (the grounding for
  Algorithm B).

What the VM cannot do (and the mod doesn't): create units for other civs (`CREATE_ELEMENT` is
local-only), or raise a custom notification type without a DB entry (so engine notifications are
deferred; toasts + world-news cover feedback). The policy cards are the one piece that needs the
database; everything else is the direct-mutator surface.

---

## 13. Persistence

Per-game state lives in the `GameConfiguration` KV store (survives save/reload):

- `EmigrationState_v1`: per-source voluntary and crisis pressure/cooldown (§2), plus the monotonic scaling turn.
- `EmigrationViolence_v2`: per-city violence intensity + decay, siege tenure / onset population / cumulative war-loss.
- `EmigrationDisaster_v1`: per-city disaster distress + decay.
- `EmigrationAssim_v1`: per-civ assimilation load + per-civ tick turn.
- `EmigrationDividend_v1`: per-civ carried-dividend pools.
- `EmigrationWar_v1`: victim → aggressors map (§6a).
- `EmigrationEthnos_v1`: per-settlement origin-composition ledger.
- `EmigrationMigStats_v1`: per-civ tallies (net, gross in/out, refugees, deaths, per-cause breakdowns, graph-sample watermarks, and the cumulative city-pair flow matrices, capped at ~4000 edges with lowest-volume evicted).
- `EmigrationNews_v1`: world-news announced-milestone tiers + the last-toast turn (anti-spam).
- `EmigrationNotif_v1`: the permanent notification log (newest-first, capped), each fired notification's cause, turn, summary, count, and origin/destination detail.

Missing fields (e.g. an old save with no crisis-track pressure) are normalized on load, so the two-track
split is save-compatible with pre-split games. Options/settings persist separately in the shared
`modSettings` localStorage key. Single-player scope (UI-VM gameplay writes are client-side).

---

## 14. Localization

All user-facing strings are LOC keys, fully translated into all 10 locales (en, de, es, fr, it, ja, ko,
pt, ru, zh), including the advanced tunable labels. The non-English files are generated, not hand-edited:

```sh
node scripts/i18n_extract.mjs   # text/en_us/ModText.xml → i18n/i18n-source.json (key list)
node scripts/i18n_apply.mjs     # i18n/<locale>.json → text/<locale>/ModText.xml
```

Author English in `text/en_us/ModText.xml`; translations live in `i18n/<locale>.json` (a missing key
falls back to English). `npm run verify` includes a parity gate (`tests/i18n.mjs`) that fails if any
en_us key is absent from a locale. `{1_…}` placeholders and code tokens are preserved verbatim.

---

## 15. Install & run

1. Copy this folder to `~/Library/Application Support/Civilization VII/Mods/emigration/`, relaunch, and
   enable **Emigration** in *Additional Content*.
2. Play turns. With `const DBG = true` (dev default) the mod logs to `UI.log` via the CSS-parse channel:
   ```
   grep -E "EMIG_" "~/Library/Application Support/Civilization VII/Logs/UI.log"
   ```
   `release.sh` flips `DBG` to `false`, so shipped builds run silently.
3. **Dev dock buttons** (subsystem dock): run a pass now / dump the prosperity ranking. Console:
   `emigration.runNow()`, `emigration.rank()`, `emigration.window()`, `emigration.city(id)`.
4. **Tune or disable layers:** Options → Mods → Emigration - Advanced exposes every advanced-model switch
   (§5) and interactive system (§6), plus the notification mode. All default on.

Look for `EMIGRATION … left … for …`, `assimilation: …` cost lines, and `ATTRITION … (no refuge)` when
the outlet fires.

---

## 16. Development

Typed JavaScript with JSDoc, no build step: what ships is what you write (see
[CONTRIBUTING.md](CONTRIBUTING.md)). Before committing:

```sh
npm install
npm run verify     # tsc --noEmit + eslint + the node test harnesses
```

`verify` runs the modularization gate (file/function length / complexity / statements) and 32 test
harnesses, including: `game-speed` (the scalar, fail-safe, the 5 speeds, the kill switch, game-time
invariance), `notifications` (the persistent log, order, turn-stamp, detail, persistence, ring cap),
`network-anim` (immigrants fly from origin), `engine-pass` (a 7-scenario end-to-end pass: peacetime /
single-front war / multi-front war / disaster-only / concurrent war + prosperity / famine death + flight
/ war death + flight), `engine-pull`, `causes`, `city-readout-data`, `city-readout`, `views`,
`migration-page`, `scaling` (incl. `formatBoth`), `prosperity`, `geography`, `violence` (siege escalation
+ cap), `tunables`, `migration-stats` (incl. the flow-matrix cap), `flow-history`, `composition`,
`governance-mask`, `city-scope-global`, `effects`, `civ-tuning`, `war`, `disasters`, `borders`, `naming`,
`feedback`, `dividend`, `raid`, `modinfo` (the `ImportFiles` manifest stays a complete, import-closed
inventory), `i18n` (locale parity), and `no-empty-catch`. `./release.sh` produces the debug-muted,
allow-listed Workshop zip (readable JS, no minification).

The `migration-probe` mod (its own modinfo, never shipped) is the in-engine verifier behind the
write-surface/data claims: dock buttons + a `globalThis.mig` console API, with the `API3` and `API4`
confirmation passes + passive `DiplomacyDeclareWar` / `RandomEventOccurred` recorders. Audit commands:
`mig.warName()` confirms the engine war name resolves
(`getJointEvents → uniqueID → getWarData(uniqueID, me).warName`) and dumps `getWarData`; `mig.happy()`
grants `YIELD_HAPPINESS` and re-reads to confirm whether happiness is a grantable stockpile; `mig.blob()`
logs every persisted value's size + flow-key counts to confirm saves stay bounded; the passive
`API4-B DeclareWar` dump logs the real war-event payload keys.

---

## 17. Caveats & limits

- **Single-player.** UI-VM gameplay writes are client-side.
- **The advanced layers are on by default but un-playtested-at-scale.** Everything beyond the baseline is
  implemented and unit-tested, but the knob values are starting points. Turn pieces off in Options
  (§5–§6) if a save hits balance trouble.
- **Game-speed scaling is verified by tests, not yet in-game at every speed.** The scalar + transforms +
  game-time invariance are unit-tested and fail-safe to S = 1; `gameSpeedTuningEnabled` is the kill
  switch if a speed feels off.
- **Happiness cost is inferred (and probe-checkable).** Negative gold grants are probe-confirmed; negative
  happiness is inferred: the base game exposes no player-happiness mutator, so
  `grantYield(YIELD_HAPPINESS, −n)` may be a no-op. Run `mig.happy()` to confirm; if nothing moves, set
  the happiness knobs to 0 (the congestion headwind, §5-C, is the gold-immune structural brake).
- **War names use the engine's when resolvable.** Resolves via
  `getJointEvents → DECLARE_WAR uniqueID → getWarData(uniqueID, localPlayerID).warName`, falling back to
  "{Victim}–{Aggressor} War". The aggressor map reads `actingPlayer`/`reactingPlayer` with
  `initialPlayer`/`targetPlayer` fallbacks.
- **A few in-engine confirmations remain best-effort:** the policy cards' in-game slotting/unlock, whether
  disaster plot-effects are pollable per plot (we use `isInfected`, confirmed), the per-plot yield shape
  for the Prosperity lens (`getYields`, used defensively with a per-city fallback), and a longitudinal
  getYield pre/post-penalty check. The code degrades to a safe no-op where unconfirmed.
- **On-map floating indicators are deferred:** `WorldUI` exposes no floating-text method, so feedback uses
  toasts.
- **Engine notifications need a DB type:** clickable end-turn notifications would need a
  `NotificationType`; toasts + world-news cover it for now.
- **No new game rules.** The mod composes existing engine writes; it can't invent effects or spawn units
  for the AI.

---

## 18. Compatibility & mod coexistence

Its only dependency is `base-standard`, and it touches every shared surface additively:

- **Database: inserts only.** `data/emigration-policies-*.xml` and `data/emigration-civilopedia.xml` are
  pure `<Row>` inserts: no `<Replace>`, `<Update>`, or `<Delete>` against base or shared tables. New IDs
  are namespaced (`TRADITION_EMIG_*`, `SectionID="EMIGRATION"`). Border-policy traditions attach to
  existing civic-tree nodes via additive `ProgressionTreeNodeUnlocks` rows.
- **Shared settings store, self-healing.** Options persist under the single community-convention
  `modSettings` localStorage key (§13), never a stray top-level key. GameFace's `localStorage` is shared
  across every mod, so a stray top-level key would clobber the store; on each save the store self-heals,
  preserving `modSettings` and dropping stray keys ([ui/options/mod-options.js](ui/options/mod-options.js)).
  With any mod that follows the convention (Demographics does) this is a no-op.
- **Cooperative globals + events.** JS globals are namespaced (`globalThis.emigration`, `EmigrationData`).
  The Demographics integration uses an order-independent handshake (`globalThis.DemographicsMetricsAPI ??= {}`)
  that joins the metrics API rather than replacing it. Engine events (`engine.on(…)`) are multicast, so
  subscribing never blocks another mod's handlers.
- **Defers to the Demographics namespace.** The war-popup refugees label and glossary are owned by
  Demographics; Emigration adds only the one graph-title string it introduces, so there are no duplicate
  `LocalizedText` definitions.
- **Additive plot tooltip.** Both the Ethnic Composition and Prosperity per-tile breakdowns are appended
  into the live plot tooltip's `.tooltip__content` via a `MutationObserver`, never replacing the tooltip,
  so Emigration stacks with whichever full-tooltip mod is active (bz-map-trix, TCS Improved Plot Tooltip).
- **Adaptive to other mods.** It reads live happiness / yields / Influence each turn, so a mod that
  rebalances those values is reflected in the Prosperity score; effects compose rather than conflict. If
  another mod also moves population or changes yields, the two stack without corrupting state. The §2
  scaling reads whatever game speed is active, including custom speeds a mod adds (any `GameSpeed` row with
  a `CostMultiplier`).

## Source

Open source on GitHub: https://github.com/tmtmiller1/civilizationvii-emigration

## Credits

- Tower, for design and Civilization VII implementation.
- Tomahawk, Mk Z, and Tim_The_Texan, creators of the Civilization V Emigration mod that inspired this
  project.

### Special Thanks

- **Potato McWhisky**, for teaching me to love again, Civilization-wise (Civ VI), after growing up as
  a Civilization II, IV, and V player. Making this mod is an act of faith that the community will
  eventually help make Civilization VII as good as the previous entries.

## License

MIT. See [LICENSE](LICENSE).
