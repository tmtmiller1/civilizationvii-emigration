# Emigration — a population-migration mod for Civilization VII

## At a glance (for players)

Adds real migration and refugee systems to Civilization VII. **Unhappy, poor, besieged, or
disaster-struck cities lose population; prosperous and welcoming cities attract it** — within and
across civilizations. Immigration brings growth, costs, politics, and Demographics graphs.

- **People leave for a reason, and the reasons stack.** A city can shed **war refugees and economic
  migrants in the same turn** — war no longer "switches off" peacetime migration. Refugees flee
  *away* from the invader; unhappy, low-yield cities bleed people even at peace.
- **It crosses borders.** People flee from one civilization to another, not just between your own
  cities. This is the mod's defining behavior.
- **Policies shape the flow.** A **Pro-Immigration Stance** attracts migrants (and earns Influence);
  an **Anti-Immigration Stance** retains your people and mobilizes a war economy (+Production), at the
  cost of Influence.
- **Growth isn't free.** Receiving migrants creates a temporary, real assimilation cost.
- **It adapts to your game speed.** All turn-based pacing scales automatically from Online to
  Marathon, so migration *feels* the same whether a game is 150 or 600 turns long.
- **See it on the map.** An **Ethnic Composition** lens paints every settlement by the origin
  civilization of its people (with exact per-origin percentages in the plot tooltip), and a
  **Prosperity** lens shades the map **tile by tile** so you can read where the pull actually is.
- **It tells you why — briefly on screen, permanently in a log.** Population changes are explained in
  the moment by a short, **cause-themed toast** (color-coded for war / disaster / prosperity, showing
  counts in *both* Civ population points and scaled people), and on demand per city
  (`emigration.city(id)` — showing the live **cause mix**, e.g. *War 60% · Prosperity 40%*). So the
  toasts never flood the screen, every one is also kept in a permanent **Notifications log** you can
  scroll and click into for the full detail of each event. Plus a full **Migration dashboard**
  (`emigration.window()`): an animated migration network, a cross-civ flow map, a per-civ ledger, a
  cause breakdown, settlements, policy stances, and that notifications log.
- **Fully integrated with the Demographics mod:** a top-level **Emigration** tab whose **Data**
  section charts **Net Migration / Emigration / Immigration / Refugees (Left) / Refugees (Arrived)** —
  in either scaled "people" or raw Civ numbers — each with a one-line definition, cause-breakdown
  tooltips, and war/disaster markers; plus the whole dashboard (network, causes, settlements,
  policies, guide) as native sub-tabs. The standalone dock button is optional (Options).

The sections below explain migration behavior, tuning controls, and gameplay effects in detail. Every
advanced layer can be tuned or switched off in **Options → Mods → Emigration - Advanced** (§10), so
you can run anything from the plain baseline to the complete model.

**Performance on large saves.** If late-game turns feel heavy with both this and the **Demographics**
mod installed, two safe levers help, in this order. First, lower **Demographics' sampling frequency**
(a coarser cadence is the bigger win). Second, raise Emigration's **`turnInterval`** (Options → Mods →
Emigration - Advanced) so the migration pass runs less often. Both change only how *often* data
updates, never the migration behavior or the graph semantics.

---

Citizens leave unhappy or struggling settlements — including those hit by environmental disasters and
conflict — and move toward happier, more prosperous ones, both **within and between civilizations**.
The mod is driven by a Civ V-style *Prosperity* model.

Migration counts can be reported in **both** the game's own population points (1, 2, 3 …) **and** a
historically representative people count (thousands … hundreds of millions) scaled to match the
**Demographics** mod — shown together by default (e.g. *1 population point (12 thousand people)*), or
either alone, via an Options toggle (§10). Absorbing migrants carries a **time-limited in-game cost**
so growth has trade-offs.

Several layers sit on top of that baseline, **all on by default**, so you get the full system out of
the box. Each can be switched off individually in Options:

- an advanced Prosperity model (§5): reshapes the happiness draw, time-gates and caps war
  displacement, brakes runaway magnets, discounts tall play, and adds bounded per-leader/per-civ tuning;
- interactive systems (§6): refugees who avoid the aggressor that attacked them; Pro/Anti-Immigration
  stance policies (and base-game Open Borders agreements) that shape cross-civ migration;
  asylum/relationship permeability; environmental disasters (floods, volcanoes, plague); and an outlet
  so a trapped, dying population isn't bottled up forever;
- in-game feedback (§9): styled toasts, named refugee headlines, world-news for major crises
  (spam-throttled), and the Demographics graphs;
- localization across all 10 languages (§14).

It all runs in the UI VM (GameFace JS) each turn. This is not a UI-only mod: population moves and
yield/Influence changes are real gameplay writes (§12).

### Documentation
- Migration mechanics overview: [../emigration-docs/DESIGN.md](../emigration-docs/DESIGN.md)
- Engine behavior checks and verification notes: [../emigration-docs/FINDINGS.md](../emigration-docs/FINDINGS.md)
- In-game validation checklist: [../emigration-docs/testing-requirements.md](../emigration-docs/testing-requirements.md)
- Civ VII modding mechanics & limits: [../emigration-docs/civ7-mechanics-and-feasibility.md](../emigration-docs/civ7-mechanics-and-feasibility.md)
- Leader/civ ability & memento interactions: [../emigration-docs/leader-civ-memento-interactions.md](../emigration-docs/leader-civ-memento-interactions.md)
- Advanced migration formulas: [../emigration-docs/algorithmic-improvements.md](../emigration-docs/algorithmic-improvements.md)
- Interactive systems: [../emigration-docs/interactive-extensions-design.md](../emigration-docs/interactive-extensions-design.md),
  [../emigration-docs/interactive-extensions-implementation.md](../emigration-docs/interactive-extensions-implementation.md)
- The migration rebalance (two-track engine): [docs/MIGRATION_SPLIT_PLAN.md](docs/MIGRATION_SPLIT_PLAN.md), [docs/SHIP_PLAN.md](docs/SHIP_PLAN.md)

---

## System Guide and Feature Reference

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

Each of your turns, the mod looks at every city in the world it can see and moves population from the
least desirable settlements toward the most desirable ones:

- **Peacetime, unhappiness-driven.** Happiness is the single biggest factor, so an unhappy or low-yield
  city steadily loses population to happier, wealthier ones (no war required).
- **War refugees.** A city under actual attack (its districts taking damage, or pillaging in its
  borders) sheds population fast, and refugees **flee away from the nearest invader**: an army pressing
  from the east drives people west.
- **Concurrent causes.** War, disaster, and economic pressure are evaluated **independently and at the
  same time** (§2), so a besieged-but-still-attractive city can shed war refugees *and* economic
  migrants in one turn. Each move still has exactly one cause; the concurrency is *multiple moves*.
- **Cross-civilization.** People flee from one civ to another, not just between your own cities.
- **Regional.** Migration is distance-penalized, so people move to *nearby* better settlements rather
  than teleporting across the map.
- **Consequential.** Receiving migrants costs the destination civ happiness/gold for a while as it
  assimilates them, so a magnet city converges instead of accreting forever. Hoarding unsettled
  migrant units costs too.
- **Speed-aware.** All of the above is paced in turns, and that pacing scales with your **game speed**
  (§2) so the *rate* of migration in game-time is the same on Quick, Standard, or Marathon.

All of it is reported in-game (toasts + the Demographics graphs) and in the dev log, e.g.
`EMIGRATION 1 population point (12 thousand people) left Rome (Romans) for Carthage (Carthaginians)`.

### Quick reference: what counts

Common questions about what does and doesn't cause, attract, or participate in migration. These reflect
the **default** settings (most can be tuned or switched off, §10). The same matrix is available in-game
on the dashboard's **Guide** tab.

**What makes people leave a city**

| | Counts? | |
|---|:---:|---|
| Unhappiness / low yields | ✓ | The dominant driver: happiness is weighted more than any other factor, and yields are scored per-capita, so an unhappy, low-yield city bleeds people even at peace |
| War damage to the districts | ✓ | Damage to **any** district — center **or** an outer urban/rural quarter — is read from game state (fog-independent) and scales the war penalty; more damage pushes more people out |
| Being besieged or attacked | ✓ | Per-city: only the besieged city itself sheds people. Fires when **any** of its districts is besieged or overrun, even before its health drops. A civ at war elsewhere keeps its unaffected cities |
| Attacked by a city-state / Independent Power | ✓ | Same per-city conflict pressure as a major-civ war: an Independent/minor raid still drives THAT city's people out, attacker-agnostic |
| Pillaged tiles in the city's borders | ✓ | Pillaged improvements on the city's own plots count as violence in its borders (polled, fog-independent) |
| Starvation | ✓ | A city with negative net food is flagged starving and sheds population until its food recovers |
| Plague / disease | ✓ | An infected city loses people, and migrants leaving it can carry the plague to their destination |
| Natural disasters (floods, volcanoes) | ✓ | Environmental-disaster distress adds a per-city penalty on a capped sliding scale. An eruption/flood strikes **every city around its epicenter**, so a volcano on unowned terrain still displaces neighboring cities |
| Overcrowding in a tall city | ✓ | Urban population above a threshold adds pressure; the per-leader tuning can soften it via the overcrowding discount |

**What attracts people to a city**

| | Attracts? | |
|---|:---:|---|
| Higher prosperity (food, production, gold, science, culture) | ✓ | Each city scores its per-capita weighted yields; a higher score than nearby cities pulls migrants in |
| Higher happiness | ✓ | Weighted most heavily. In the shaped model it's measured against the world average and saturates, so a happy city is a strong magnet but can't run away without limit |
| A Pro-Immigration stance policy | ✓ | Raises the pull into your cities and earns Influence (trading some retention) |
| An Open Borders agreement | ✓ | Adds a cross-civ pull bonus, so more people cross between the two civs |
| Being nearby | ✓ | Migration is distance-penalized, so people move to nearby better settlements |

**Who participates (sends / receives population)**

| | Participates? | |
|---|:---:|---|
| Your civilization | ✓ | Sends and receives population like any major civ |
| Towns, not just cities | ✓ | Towns send and receive migrants the same as cities |
| Your own cities trade people (internal migration) | ✓ | People also move between a civ's OWN settlements; the dashboard colours internal moves separately |
| Other major civilizations | ✓ | Every major civ is simulated from turn one, met or not, so the migration map isn't biased by exploration |
| City-states / minor civs / Independent Powers | ✗ | They neither send nor receive migrating population, though attacking a major civ's city still drives THAT city's people out |
| Unmet civilizations | ✓ | Fully simulated, but masked in the UI by default for spoiler protection until you widen the visibility policy |

**Behavior**

| | | |
|---|:---:|---|
| Migration between different civilizations | ✓ | Throttled by borders, distance, and each side's immigration stance |
| Migration driven by distant AI-vs-AI wars | ✓ | Fog-independent — but only when the fighting actually damages, besieges, or pillages a city's **own** territory; a distant war that never touches a city does nothing to it |
| Fighting *outside* a city's borders (field battles, wars elsewhere, pillaged tiles it doesn't own) | ✗ | Never drives that city's emigration. War pressure is strictly territory-scoped (the city's own districts + own plots); the civ-wide "at war" flag is not an emigration cause (§3) |
| An Anti-Immigration stance retains your people | ✓ | Raises retention (fewer people leave) and boosts Production, at the cost of Influence |
| Closed Borders reduces cross-civ flow | ✓ | Without an Open Borders agreement far fewer people cross between civs |
| Population & yields actually change (not just a display) | ✓ | Real per-turn gameplay writes |
| Pacing adapts to game speed | ✓ | Cooldowns, ramps, transit, and pressure thresholds scale with the speed setting (§2) so the game-time rate is constant |
| Any layer can be tuned or switched off | ✓ | Presets plus ~57 individual knobs under Options ▸ Mods ▸ Emigration |
| Migrants arrive instantly | ✗ | No — they travel; arrival lags with distance, up to a few turns |
| Absorbing migrants is free | ✗ | No — a temporary, decaying assimilation cost in happiness and gold |
| War alone can empty a city to zero | ✗ | No — siege/war loss is capped; only an actual capture takes a city |

**Scope & limits**

| | | |
|---|:---:|---|
| Changes AI strategy or replaces base-game files | ✗ | Additive only; the base game's AI decisions and files are untouched |
| Moves population instantly across the map | ✗ | Distance-penalized; people move to nearby better settlements |
| Lets you directly place or pick individual migrants | ✗ | Flows are simulated from prosperity, war, and policy; you shape them with yields and stances |
| Lets one magnet city drain the whole map | ✗ | A congestion brake (plus the overcrowding discount) damps a runaway magnet |

**FAQ**

- **Where do people go when they leave?** To the nearest higher-prosperity settlement they can reach. Migration is distance-penalized, so people move regionally, not to the single best city on the map.
- **Where do war refugees flee?** Away from the nearest enemy, preferring their own civilization first, then neutral civs, and the attacker last.
- **How many people move, and how often?** War- and disaster-driven refugees flee every turn; voluntary (prosperity/unhappiness) migration is more gradual, resting briefly between moves. The two run **concurrently** — a city can do both at once. Each civilization migrates on its own per-turn budget that scales with its size and active crises, so simultaneous wars never throttle one another. The whole pace also scales with game speed.
- **What happens when I capture or lose a city?** It keeps its residents' origin mix (what the Ethnicity lens paints), so a conquered city carries real origin history. War can shrink it, but only an actual capture transfers it.
- **Why did a city suddenly lose a lot of people?** A toast names the cause; the per-city readout breaks down its current pressures — including the **mix** when more than one is active.

**Post-war recovery FAQ**

- **My city shrank from size 12 to 5 in a war — will it grow back?** Yes. War displacement only moves *population points*; it never razes districts or deletes buildings (only base-game conquest does that). You keep the infrastructure with fewer workers, and it regrows two ways, both additive: the base game's normal **food growth**, and **immigration** — once the fighting stops and prosperity recovers, the surviving high-yield buildings make it an attractive destination again.
- **Do the same refugees who fled come back?** No. There is no repatriation mechanism; war's "temporary" tag is only a durability cue. The city regrows from *new* residents, not the original refugees.
- **Does repairing pillaged tiles restore the lost population?** No. Pillaged tiles only apply *pressure*. Repairing them **removes that pressure** — the city stops bleeding people and recovers faster — but a repair never adds a population point back.
- **How far can a war shrink a city?** War-driven loss is capped at **`siegeLossCapPct` (60% by default) of the city's population when the siege began**. The remnant "digs in"; only an actual capture takes the city. (This cap is a *fraction* and does **not** change with game speed.)
- **Fastest way to recover a war-torn city?** Relieve the cause so the city flips from net exporter back to magnet: **make peace** (violence decays in ~2–3 turns of game-time at any speed), **repair pillaged tiles**, and **raise happiness** (the single biggest prosperity factor).

**Migration in transit (the economics of in-flight migrants)**

Migration is **not instantaneous** — a move has *transit lag* (`transitLagTurns`, distance-scaled, and
itself scaled by game speed). This creates a window where a migrant has left their old city but not yet
reached their new one.

- **The lifecycle of a move.** At **departure**, the migrant's rural point is removed from the source *immediately* — the source loses that worker and their tile yields the turn they leave. They spend the **transit** period belonging to **no city** (working no tiles, producing no yields, but incurring no upkeep), and the one-time assimilation cost is paid by the destination only **on arrival**.
- **How long is the gap.** Transit is **1–4 turns at Standard speed** (`transitLagTurns` caps it; the lag scales with distance at `transitHexPerTurn` ≈ 5 hexes/turn), longer on slower speeds. Most moves are 1–2 turns; **war/disaster refugees take at least 1 turn** (they camp).
- **How significant is it?** **Small and self-correcting** in peacetime (a handful in transit), meaningfully larger but still bounded in wartime (every migrant clears within the cap, and the pool drains within a few turns of peace).
- **What you'll see.** Transit lag is why **Emigration (gross-out) can tick up before Immigration (gross-in) catches up**. It does **not** distort **Net Migration**, which counts only *settled, cross-civ* moves.

---

## 2. How it works: the per-turn loop

On every `PlayerTurnActivated`:

1. **Per-civ costs** (`chargePerTurnCosts`) run for *whichever* civ's turn it is: the decaying
   assimilation cost and the migrant-holding penalty (§7).
2. **The emigration pass** (`runPass`) runs once on the **local player's** turn (gated by
   `turnInterval`):
   1. **Decay** accumulated **violence** and **disaster** distress for the turn (decay rates are
      game-speed-adjusted, below).
   2. **Collect signals:** one `CitySignal` per met city (§3).
   3. **Rank by Prosperity:** score every city; sort descending (§3, §5).
   4. **Advance state:** a monotonic turn counter (for scaling) + prune/tick cooldowns; compute
      per-owner populations (for congestion).
   5. **Process each source** as **two concurrent tracks** (below), each civ bounded by its **own
      per-turn move ceilings** (`civMoveCeilings`): a runaway/perf safety net (*not* the pacing knob),
      sized `maxMovesPerTurn` + `movesPerCity`·(its settlements) for the **voluntary** ceiling and
      `movesPerSiege`·(its cities in crisis) for the **crisis** ceiling. The ceilings are **per-civ**,
      so simultaneous wars on different civilizations never compete for one global budget.
   6. **Persist** state to `GameConfiguration`; surface **feedback** (§9).
3. **Events.** Subscribed at boot: `DiplomacyDeclareWar`/`MakePeace` feed the aggressor map (§6a);
   `RandomEventOccurred` feeds disaster distress + a named alert (§6c).

### Two concurrent tracks: voluntary vs crisis (`splitTracksEnabled`)

Each source is evaluated as **two independent systems every pass**, not one mixed loop, so the two can
fire **at the same time** toward the same best destination:

- **Crisis** (war / disaster): flees **every turn** — no bar, no cooldown — a war-surge burst bounded by
  `warSurgeMax` and the cumulative `siegeLossCapPct`. Cause is *disaster* when disaster distress
  dominates, else *war*.
- **Voluntary** (prosperity / unhappiness): accumulates **pressure** toward `emigrationBar`, moves one
  point on crossing it, then **rests** for `cooldownTurns`. Cause is *unhappiness* when happiness is
  low, else *prosperity*.

So a besieged-but-still-attractive city can shed **war refugees AND economic migrants in the same
turn** — war tuning no longer starves peacetime migration and vice-versa. Each track draws from its
**own per-civ budget** (`splitBudgetsEnabled`), so they never double-drain a shared pool. **Every
migration record still carries exactly one cause** — concurrency is *multiple records*, not multi-cause
records, so all the by-cause telemetry (graphs, pies, tooltips) is unchanged. The city readout shows
the live mix ("War 60% · Prosperity 40%", `splitUiReadoutEnabled`). The counterfactual/planner path
mirrors the same split so stance telemetry doesn't drift. All three flags default on; turning them off
restores the legacy single-cause-per-pass behavior. (Full spec: [docs/MIGRATION_SPLIT_PLAN.md](docs/MIGRATION_SPLIT_PLAN.md).)

When a source has **no viable destination** (the outlet, §6d), a sufficiently *distressed* source builds
attrition pressure and eventually **loses a rural point with no destination** — population leaves the
world (a death), not the city.

### Game speed (all turn-based pacing scales, `gameSpeedTuningEnabled`)

The engine paces in **turns**, but Civ's game speed stretches the same game-*progress* over a ~6× range
of turn counts (`GameSpeeds.CostMultiplier`). Left uncorrected the mod would be calibrated for exactly
one speed (Standard) and drift everywhere else — on Marathon the fixed cooldowns/ramps become a tiny
fraction of a long game and per-turn rates fire 3× as often; on Quick/Online the reverse. So pacing is
scaled by the speed scalar **S** so migration *feels* the same in game-time at any speed:

| Speed | CostMultiplier | S | cooldown 8 → | bar 30 → |
|---|---:|---:|---:|---:|
| Online | 50 | 0.5 | 4 | 15 |
| Quick | 67 | 0.67 | 5 | 20 |
| **Standard** | **100** | **1.0** | **8** | **30** |
| Epic | 150 | 1.5 | 12 | 45 |
| Marathon | 300 | 3.0 | 24 | 90 |

- **Turn-count durations ×S** — `cooldownTurns`, `siegeRampTurns`, `transitLagTurns` (longer on slow speeds).
- **Pressure thresholds ×S** — `emigrationBar`, `attritionThreshold` (so accumulation crosses the bar in the same game-time).
- **Decay re-based to `d^(1/S)`** — `violenceDecay`, `disasterDecay` (a transient fades over the same game-time, not 3× faster on Marathon).
- **Invariant (never scaled):** `siegeLossCapPct` and intensity thresholds (a siege costs the same *fraction* of a city at any speed), yield weights, friction, and the per-turn move ceilings (safety nets).

It is **automatic** — it reads the active speed once via `Configuration.getGame().gameSpeedType` →
`GameInfo.GameSpeeds.lookup(...).CostMultiplier`, caches it, and is **fail-safe to S = 1** if the value
is ever unreadable. Gated on `gameSpeedTuningEnabled` for rollback. See
[`emigration-game-speed.js`](ui/emigration-game-speed.js). *(A separate, default-off
`gameSpeedScalePopulation` flag also normalizes the §4 people-scaling exponent; it's cosmetic and
cross-mod — see §4.)*

---

## 3. The signals & the Prosperity score

`emigration-cities.js` builds a `CitySignal` per city (owner, population, rural pool, **urban**
population, per-capita yields, net happiness, unrest, starvation, siege, war, accumulated **violence**,
accumulated **disaster** distress, **infected** flag). `emigration-prosperity.js` turns it into a
score. The **default (legacy linear)** model:

$$
\begin{aligned}
P &= \left(Q + h\,\lambda_h - n\,\lambda_n\right)\left(1 + \frac{s}{100}\right), \\
Q &= \frac{f\,w_F + p\,w_P + g\,w_G + sc\,w_S + c\,w_C}{n}, \\
s &= v + d + \sigma + \tau + u.
\end{aligned}
$$

Where $P$ is prosperity, $Q$ is per-capita productiveness, $h$ is net happiness, $n$ is population, and
$s$ is the summed situational percentage from violence, disaster, siege, starvation, and unrest
channels.

Higher = more attractive. **Happiness dominates** (weight `localHappinessFactor`, default 6), which is
why unhappiness drives migration even at peace; the situational multiplier is where war/violence,
disasters, sieges, starvation, and unrest bite. (§5 replaces the happiness term and the violence
penalty with more nuanced versions when their flags are on.) The magnitude of the negative situational
percent is also exposed as **`distress(s)`**, which drives the outlet (§6d) and weights the readout's
cause mix.

### Violence (`emigration-violence.js`): polled, fog-independent
War-driven emigration keys on **actual violence inside a city's borders**, not on the empire merely
being at war, and it's **symmetric** for player-watched and distant AI-vs-AI wars, because it reads game
*state*, not visibility-gated events:

- **City under attack:** polls the city-center district's health (`getDistrictHealth/…MaxHealth`),
  readable for *all* players regardless of line of sight. Fresh damage spikes (`vwAssault`); standing
  damage sustains a siege (`vwSiege`).
- **Pillage:** damaged improvements on `getPurchasedPlots()` add standing pressure (`vwPillage`).
- The score **accumulates and decays** (`violenceDecay`, game-speed-adjusted to `d^(1/S)`): a sustained
  siege builds, a lone raid fades in ~2-3 turns of game-time. With **Algorithm D** on, the curve also
  escalates with siege *duration* (over `siegeRampTurns`, ×S) and is capped in total (§5-D).

**Strictly territory-scoped — combat *outside* a settlement's borders never drives its emigration.**
All three signals read only the city's **own** footprint: `districtDamageFrac` / `districtBesieged`
match a district to the city by `owner:id`, and `pillagedCount` scans only the city's **own**
`getPurchasedPlots()`. So none of the following move a single migrant out of a bystander city: a field
battle in neutral/unowned land, a war your civ is fighting elsewhere on the map, a pillaged tile your
city doesn't own, or a distant AI-vs-AI war that never touches your territory. The civ-wide "owner is at
war" flag (`sig.atWar`) is **not** an emigration cause — it's used only for a dev log label, and even the
flee *direction* (`fleeVector`) is gated on the city's **own** accumulated violence, not on the empire
being at war. The one boundary case that *does* count is a city whose own district is flagged
**besieged** by enemy units standing just outside its borders — because that is the city itself under
siege (its own district carries the flag), not unrelated outside combat; `siegeBesiegedFloor` keeps that
a gradual build rather than an instant refugee flood.

### Geography (`emigration-geography.js`)
- **Distance decay:** `−distanceFactor × hexDistance`, keeping migration regional.
- **Flee-from-invader:** when violence crosses `violenceFleeThreshold`, refugees prefer destinations *away* from the nearest enemy (`fleeFactor`).
- **Aggressor preference:** own civ > neutral > the attacker, when Feature 1 is on (§6a).
- **Open Borders flow bonus:** a modest cross-civ pull bump between civs holding a base-game Open Borders agreement (`openBordersBonus`, §6b).

### The destination decision (`emigration-pull.js`)
The destination scorer is two bounded channels over the prosperity gradient and friction terms:

$$
\begin{aligned}
\mathrm{Pull}(s,d) &= \Big(\Delta\mathrm{Pros}(s,d) + \mathrm{Tilt}(s,d) - \mathrm{Friction}(s,d)\Big) \cdot \Pi(s,d), \\
\Delta\mathrm{Pros}(s,d) &= \mathrm{Pros}(d)-\mathrm{Pros}(s), \\
\mathrm{Tilt}(s,d) &= \mathrm{clamp}\big(\mathrm{asylumTilt}(s,d),-\mathrm{tiltCap},\mathrm{tiltCap}\big), \\
\Pi(s,d) &= \mathrm{clamp}\big(\mathrm{openness}(d)\cdot\mathrm{retention}(s)\cdot\mathrm{permOpenBorders}^{ob}\cdot\mathrm{permAlly}^{al}\cdot\mathrm{permWar}^{wa},\ \mathrm{permeFloor},\mathrm{permeCeil}\big).
\end{aligned}
$$

In the permeability $\Pi$, $\mathrm{openness}(d)$ is the **destination's** inbound border throttle and
$\mathrm{retention}(s)$ the **source's** cross-civ outbound throttle, the two halves of the
Anti-Immigration stance (§6b). Both are 1 unless border policies are on, and retention applies only
cross-civ (internal moves don't cost a civ population).

With friction:

$$
\begin{aligned}
\mathrm{Friction}(s,d) =&\ \mathrm{baseReluctance}
+ \mathrm{perExtraPop}\cdot\max\left(0,\mathrm{pop}(d)-\mathrm{pop}(s)\right)
+ \mathrm{cityStateBarrier}
+ \mathrm{poachBlock} \\
&-\ \mathrm{geoAdjust}(s,d)
+ \mathrm{congestionFor}(d).
\end{aligned}
$$

War is **not** a hard gate: a besieged city simply has low prosperity and a flee vector, then passes
through the same pull equation. People can emigrate to any civilization.

### The Prosperity map lens (`emigration-prosperity-lens.js`, `emigration-prosperity-tooltip.js`)
A self-registering map lens shades the world by prosperity **tile by tile**: each plot is scored from
its own per-plot yield output (`GameplayMap.getYields(plotIndex, playerID)`), normalized against the
world plot field and painted in graduated buckets, with a per-city fallback when per-plot yields aren't
available. Hovering a plot adds the reading to the tooltip. This is the visual companion to the pull
math above — it shows *where* the gradient actually points, rather than colouring a whole city one flat
tone.

---

## 4. Population scaling (Demographics alignment)

`emigration-population.js` converts Civ's abstract population points into representative people using
the **identical formula** to the Demographics mod:

```
base(raw, turn) = raw^scaleExp × scaleBase × scaleGrowth^turn   // 1.11, 12000, 1.009
megaTarget      = (raw > 20) ? (raw / 20)^1.5 : 1
ramp            = smoothstep(clamp((modernProgress - 0.1) / 0.8, 0, 1))
scaleCityPopulation = base × (1 + (megaTarget - 1) × ramp)
```

A moved point is reported as the **marginal** people it represents (`scale(pop) − scale(pop−1)`), using
a **monotonic** turn so the figure never resets at age boundaries, and applying the same Modern-only
smooth ramp as Demographics. `formatPeople` renders "12 thousand / 1.3 million / 240 million".
`moveRural` performs a relocation; **`removeRural`** removes a point with no destination (the outlet's
death, §6d), using the same rural-population accounting the game's own starvation shrinkage uses.

> **Game speed & the people-scaling exponent.** Because `scaleGrowth^turn` is keyed to the raw turn
> count, the same civilization reaches a given size at a *later* turn on slow speeds, so its "people"
> figure inflates on Marathon and deflates on Online relative to Standard. This is **cosmetic and
> consistent** — both this mod and Demographics share the identical formula, so they always agree with
> each other. An optional `gameSpeedScalePopulation` flag normalizes the exponent to
> `scaleGrowth^(turn/S)` (tracking game-*progress* instead of turns), but it **defaults OFF** because it
> only stays aligned with Demographics if that mod applies the identical normalization — enable it in
> both or neither. The turn-based *pacing* knobs (§2) are scaled independently and are on by default.

---

## 5. The advanced model (algorithms & per-civ tuning)

Four algorithms plus a per-civ tuning table refine the baseline, **all on by default** (each can be
switched off in Options). Full math + before/after numbers:
[../emigration-docs/algorithmic-improvements.md](../emigration-docs/algorithmic-improvements.md).

### A. Shaped happiness (`happinessShaped`)
The linear `happiness × 6` term let pure-happiness sources run away (Benjamin Franklin's Glass Armonica,
+15 happiness/ally, made a ~50× magnet). The shaped model is **field-relative** (measured vs the world
mean), **saturating** on the pull side and **steep** on the misery side (`tanh`), and makes happiness
**amplify the economy** (bounded multiplier + `happyFloor`) rather than dwarf it. Net: Franklin drops to
~2× while unhappy cities still shed strongly.

### B. Overcrowding discount (`overcrowdDiscount`)
The probe (§12) confirmed population costs **zero** happiness per head; a tall city's unhappiness is
**overcrowding** past a density threshold, and `getYield` is the **net, post-penalty** value, so
unhappiness double-hits. The discount credits back density-driven unhappiness via `urbanPopulation` vs
`overcrowdThreshold`.

### C. Congestion headwind + leader variance (`congestWeight`)
A structural **anti-runaway brake that can't be out-golded**: a civ absorbing lots of migrants becomes a
less attractive *further* destination, scaling with its per-capita assimilation load. Two leader-variance
knobs ride the assimilation cost via the civ table: `integrationSpeed` (load decay) and
`assimilationEase` (gold cost).

### D. Capped, time-gated war displacement (`warSiege`)
Fog-independent violence made war a bloodless depopulation tool. The siege model tracks **siege
tenure**, **escalates** the penalty from `siegeFloor` to full over `siegeRampTurns` (×S for game speed),
and **caps** total war loss at `siegeLossCapPct` of onset population (the remnant "digs in"), so a city
can lose substantial population but cannot be emptied without a capture.

### The civ tuning table (`emigration-civ-tuning.js`, `civTuningEnabled`)
A small, auditable registry of **bounded** per-leader/per-civ nudges, keyed on the GameInfo leader
string (`_ALT` personas normalized; leader overrides civ). Fields: `happinessPull`, `integrationSpeed`,
`assimilationEase`, `overcrowdDiscount`, `warRetention`, `sourceBias`. Shipped entries target outliers:
Franklin `happinessPull 0.75`, Isabella `0.85`+`ease 1.2`, Xerxes `ease 1.25`, Khmer `sourceBias 1.5`,
Pachacuti `overcrowdDiscount 0.5`, Norman/England `warRetention 1.4`, and so on. None can cause a
runaway; the structural guarantees live in the algorithms.

---

## 6. Interactive systems (on by default)

### 6a. Aggressor-aware war refugees (`aggressorPenalty`, 0 = off)
When civ A attacks civ B, B's refugees prefer **B's own cities** first, then **any civ other than A**,
and treat **A** as a last resort. The aggressor is read from the public `DiplomacyDeclareWar` event
(`actingPlayer` declared on `reactingPlayer`), persisted as a victim→aggressors map in
`emigration-war.js` and cleared on peace. The preference (`ownCivRefugeeBonus` toward own civ,
`−aggressorPenalty` for the attacker) is folded into `geoAdjust` only for cities actually under violence.

### 6b. Immigration-stance policies + Open Borders agreements
Two distinct levers control cross-civ immigration.

**Your stance (a policy card, `bordersEnabled`).** Slot **Pro-Immigration Stance** or **Anti-Immigration
Stance** — renamed from "Open/Closed Borders" so they don't collide with the base game's Open Borders
*diplomatic agreement*. A small **database component**
(`data/emigration-policies-{antiquity,exploration,modern}.xml`, one file per age) adds the slot-able
traditions, one per age, available to every civ. They unlock from a **mid-age** civic node (Antiquity
**Citizenship**, Exploration **Economics**, Modern **Social Question**) so the cards arrive when
migration is actually in play. (Internal trait IDs keep `TRADITION_EMIG_OPEN/CLOSED_BORDERS_*`.) The two
stances are deliberately **asymmetric** — Pro is a growth/magnet play, Anti is a *fortress* play:

- **Pro-Immigration Stance:** +50% immigration **into** your cities (`immigrationOpenness(destOwner)`)
  plus a native **+1/+2/+3 Influence** `TraditionModifier`.
- **Anti-Immigration Stance:** a fortress with **four** effects — throttles inbound immigration to 40%
  (floored at 0.15) **and retains your own people** (cross-civ outbound pull cut to 60%,
  `emigrationRetention(srcOwner)`), plus a native **+2/+3/+4 Production in every city** modifier and a
  **−2/−3/−4 Influence** penalty.

The migration % and retention are custom UI-VM mechanics; the Influence and Production are native
`TraditionModifier`s (`data/emigration-policies-gameeffects.xml`), so they show on the card *and* in the
yields breakdown like any base-game policy.

**Diplomatic Open Borders (a flow bonus, `openBordersBonus`).** When two civs hold an active base-game
**Open Borders** agreement, migration between them is eased both ways (joint diplomatic events checked in
`emigration-geography.js`). Console check: `emigration.openBorders(aPid, bPid)`.

Governments no longer separately affect emigration.

#### Policy cards by age (what is actually shipped)
The card set is age-scoped in `data/emigration-policies-{antiquity,exploration,modern}.xml`, with native
per-turn yield effects in `data/emigration-policies-gameeffects.xml`. Card names below are the **in-game
display names**.

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

Internal ID reference (token → in-game name: OPEN_BORDERS = Pro-Immigration Stance, CLOSED_BORDERS =
Anti-Immigration Stance, TALENT = Talent Attraction, CULTPULL = Cultural Magnetism, TRADEPULL =
Commercial Draw, ASYLUM = Selective Asylum / Refugee Compact). Prefix `TRADITION_EMIG_`; suffix
`_ANTIQUITY` / `_EXPLORATION` / `_MODERN`.

#### How attraction policy card yields actually function
Attraction cards have two yield layers, and they stack:

1. **Native fixed yield from the DB card itself** (`data/emigration-policies-gameeffects.xml`): a constant per-turn yield shown in the normal game breakdown (values scale by age).
2. **Carried dividend from actual immigrant intake** (`emigration-dividend.js`): each incoming migrant under an active attraction adds pool:

$$
\mathrm{pool}_{y} \leftarrow \mathrm{pool}_{y} + \mathrm{dividendPerMigrant}
$$

Each turn, that pool decays and grants capped yield:

$$
\begin{aligned}
\mathrm{pool}_{y} &\leftarrow \mathrm{pool}_{y}\cdot\mathrm{dividendDecay}^{\Delta t}, \\
\mathrm{grant}_{y} &= \min(\mathrm{dividendCap},\ \mathrm{pool}_{y})
\end{aligned}
$$

So the card converts migration throughput into ongoing yield (why attraction cards feel stronger in
high-intake destinations). Defaults: `dividendPerMigrant = 1.5`, `dividendDecay = 0.7`,
`dividendCap = 12`/turn per channel. `+2 Influence/turn` is **not** per immigrant — it's the flat card
modifier; the per-immigrant part is only the carried-dividend pool for attraction cards.

### 6c. Environmental disasters & plague (`disastersEnabled`)
Civ VII's `RandomEvents` (flood / volcano / **plague** / hurricane / blizzard / tornado / duststorm /
thunderstorm) become a migration driver, parallel to war. `emigration-disasters.js` accumulates per-city
**disaster distress** that decays each turn (game-speed-adjusted) and feeds a situational prosperity
penalty, so struck cities shed **climate/disaster refugees**. It's **fog-independent**: the canonical
signal is `city.isInfected` plus a severity-scaled spike from `RandomEventOccurred`.
**Plague-as-contagion** (`plagueCarryEnabled`, off): migrants fleeing an infected city seed a smaller
outbreak-distress at their destination.

### 6d. The outlet: attrition when there's no refuge (`attritionEnabled`, off)
Keeps the model from being a **closed system**. When a source has **no viable destination** *and* is
genuinely distressed (`distress(s) >= attritionMinDistress`), it builds attrition pressure and, on
crossing `attritionThreshold` (×S), **loses a rural point with no destination**: population leaves the
*world* (a death/dispersal), via the same `addRuralPopulation(-1)` accounting the game's starvation uses.
Attrition is tracked as **deaths**, fully isolated from the migration/refugee metrics, so it never
inflates any flow figure.

### 6e. Asylum and relationship permeability (targeted attraction)
Pull is composed from a prosperity gradient plus a targeted-attraction channel (`tilt`) and relationship
permeability multipliers: **asylum push** (`asylumPushWeight`) for distressed refugees toward hospitable
destinations, **relationship permeability** (`permOpenBorders`, `permAlly`, `permWar`) scaling cross-civ
movement, and **global bounds** (`tiltCap`, `permeFloor`, `permeCeil`) preventing runaway attraction or
hard lockout. Computed in `emigration-pull.js`, so targeted attraction composes with prosperity/
geography/congestion rather than bypassing them.

---

## 7. Consequences: the gameplay-write cost layer (`emigration-effects.js`)

Civ VII makes raw population *free*, so the mod adds the missing feedback via
`Players.grantYield(pid, YIELD_X, −amount)` (probe-confirmed to deduct, cross-civ; happiness leg
inferred):

- **Assimilation cost (duration-based).** Each migrant adds **load** to the receiving civ
  (`assimilationLoadPerMigrant × (1 + assimilationCostPerPop × destPop)`). Load **decays each turn**
  (`assimilationDecay`, optionally scaled by `integrationSpeed`) and the civ pays per-turn
  `assimilationHappiness`/`assimilationGold` per unit (gold leg optionally scaled by `assimilationEase`).
  Scoped to *migrated* population only.
- **Migrant-holding penalty.** Per-turn cost per unsettled `UNIT_MIGRANT` a civ holds.
- **Congestion headwind (Algorithm C).** `congestionPenalty` + `assimLoadFor`; the engine subtracts the headwind from a destination's pull.
- **Carried dividend (the assimilation mirror).** Under attraction contexts, incoming migrants build a decaying per-turn positive pool in the matched yield domain (`emigration-dividend.js`).

All apply to **every civ on its own turn**. Set any knob to 0 to disable.

---

## 8. Reporting & Demographics integration

When the **Demographics** mod is installed, Emigration contributes, via its companion hook
(`globalThis.DemographicsMetricsAPI`, an order-independent handshake):

- **A top-level Emigration tab** on the Demographics screen (`registerPanel`/`registerMetricGroup`). Its
  first section, **Data**, is a metric group with two pill-row toggles: the **metric** and the **units**
  — **Scaled** (historical "people", the same scale as the Population charts) or **Civ numbers** (raw
  population points that reconcile with the in-game window). The metrics, each carrying a **one-line
  definition** under its title:
  - **Net Migration (Graph)** — cumulative arrivals minus departures per civ, over time.
  - **Net Migration (Table)** — the same net as a per-civ table; the **units pills drive the table's
    values**, and the magnitude is drawn as a **diverging bar in its own column** (red grows *left* of a
    shared centre for net loss, green grows *right* for net gain) so rows align and the sign reads at a
    glance.
  - **Emigration** — gross people who left each civ (with a `Sources: War …, Disaster …` breakdown).
  - **Immigration** — gross people who arrived in each civ (same source breakdown).
  - **Refugees (Left)** — people this civ displaced (war/disaster/conquest), with onset markers.
  - **Refugees (Arrived)** — displaced people it took in, with onset markers.
- **The full dashboard as native sub-tabs** on that same tab — **Network** (animated dot-swarm + arrow
  flow map, each with a Civ Pop / Scaled Pop units toggle), **Civilizations**, **Causes**,
  **Settlements**, **Immigration Policies**, **Notifications**, and **Guide** — the **same content as the
  standalone window**. Registered order-independently and a silent no-op on an older Demographics.
- **A Notifications log** (the **Notifications** sub-tab) — a **permanent, scrollable record of every
  migration notification that has fired**, so the on-screen toasts can stay brief without losing the
  history. Each row is cause-themed (the same accent as its toast) and **names the specific in-world
  event** — the named war (e.g. *the Roman–Carthaginian War*, via the aggressor map + the engine's war
  name) or the named disaster/plague (the game's own `RandomEvents` name, e.g. *Thera*) — not a generic
  "crisis". **Clicking a row expands it** to the full detail: cause, event, which settlement it left,
  where the people went, and how many (in **both** measuring systems). Persisted across save/reload
  (`emigration-notifications.js` → `emigration-notifications-view.js`).
- **An Ethnic Composition map lens + plot tooltip** (`emigration-ethnicity-lens.js`,
  `emigration-ethnicity-tooltip.js`, fed by `emigration-composition.js`). A self-registering lens
  (Shift+E) paints each settlement by the **dominant origin civilization** of its people, fill intensity
  scaling with that civ's share; hovering any settled tile adds the exact **per-origin percentages** to
  the plot tooltip. Both honor the spoiler-protection visibility policy (§10).
- **A Refugees row in the Demographics war-effects cost tooltip** (a small Demographics-side edit reading
  `globalThis.EmigrationData.refugeesCumFor`), rendering "- no data" when Emigration isn't installed.
- **A Network-only timeline-detail note** when the snapshot interval is coarser than every turn
  (exposed via `globalThis.EmigrationTimelineNote`).

`EmigrationData` (exposed globally) carries per-civ cumulative tallies: gross in/out, net, **refugees**
(war/disaster/conquest), **deaths** (attrition), and the **per-cause** emigration/immigration breakdowns
(`emigrationByCauseFor`, `immigrationByCauseFor`). If Demographics isn't installed it's all a silent
no-op. The dot-swarm itself (`emigration-network-viz.js`) splits each cross-civ edge into per-cohort dots
that **fly from their origin civilization's circle** to the destination — on load and on scrub, not only
during live playback — so an immigrant never reads as home-grown.

---

## 9. In-game feedback & notifications

Migration is surfaced as **styled HUD toasts** and, for big events anywhere in the world,
**world-news**. The toast is built to read as a **native Civ VII message**, not a web element: the
game's `TitleFont` eyebrow over a `BodyFont` body, its dark panel gradient with the bronze/gold trim
palette (`#8c7e62` frame, `#f0bc78` highlight), a slide-in animation and a fade-out, an ~11-second
dwell, and vertical **stacking** so several never overlap. Each toast is **themed by cause** — a
coloured left accent bar + eyebrow label (War / Disaster / Attraction / Conquest / …) so its type reads
at a glance (war red, disaster amber, prosperity green, …) — and every count is shown in **both
measuring systems at once**: raw Civ population points *and* scaled people, e.g. *"3 population points
(36 thousand people)"*. It is **important-only by design**, with several anti-spam layers — and because
the on-screen toasts stay deliberately brief, **every notification is also recorded permanently in the
Notifications log** (the Demographics sub-tab, §8), where it can be revisited and expanded for full
detail. The anti-spam layers:

- **Rich, named events** (`emigration-naming.js`): disasters use the **game's own names**
  (`GameInfo.RandomEvents.lookup(type).Name`), wars reuse the war name, conquest names the sacked city.
  Headlines like *"The Thera eruption displaces 80,000."*
- **Explanatory & actionable** (`emigration-feedback.js`, `emigration-causes.js`). When *your* cities
  lose people in a pass, a single throttled **local digest** toast answers why / what-to-do /
  temporary-or-permanent / who-pays. The cause-keyed **action hint** and **permanence cue** ride the
  verbose per-cause toasts and disaster alert, on the same cooldown.
- **Per-city readout** (`emigration-city-readout.js`). An on-demand HUD panel answering "why is *this*
  settlement changing?" — the **cause mix** when more than one pressure is active (*"War 60% · Prosperity
  40%"*, else the single dominant cause) + status (building pressure / resting), where its people are
  pulled, the assimilation cost, the civ's net migration, the hint, and an at-risk / trapped-with-no-
  refuge warning. Built from the recompute-on-read `citySnapshot` (no new state); opens via
  `emigration.city(id)` / `.hideCity()` and best-effort on city selection. Toggle in Options
  (`cityReadoutEnabled`); works without Demographics.
- **Dashboard window** (`emigration-window.js` + the shared render core `emigration-views.js`,
  `emigration-ledger-view.js`, `emigration-network-viz.js`). A standalone HUD window
  (`emigration.window()` / `.closeWindow()`) with the whole picture across tabbed sections: an animated
  migration network and cross-civ flow map (both with a timeline scrubber), a per-civ ledger
  (in/out/net/refugees/deaths), the cause breakdown, who holds Pro-/Anti-Immigration stances, and cities
  ranked by migration pressure. The same render core backs the Demographics tab (as native sub-tabs, §8).
  The timeline records a per-civ **population snapshot every pass** — including peaceful turns with no
  migration — so the scrubber is available from the opening turns and **plays population growth** until
  there's actual emigration to show (it appears after the first couple of recorded frames; a single
  frame shows a short "timeline appears once there's history" note in place of the scrubber).
- **Anti-spam.** Disasters only notify at/above `disasterNotifyMinSeverity`. World refugee notifications
  are **once-per-milestone** on a civ's **cumulative** refugees (`worldRefugeeThreshold`) — but the
  cumulative total only *gates* the alert; the headline **names the specific war/disaster** driving it
  and reports **that pass's** outflow, so the figure stays event-scale (it never shows a lifetime
  cumulative that could exceed the civ's current size). A global `notifyCooldownTurns` backstops
  everything. `notifyMode`: **0** off / **1** important-only (default) /
  **2** verbose. All player-tunable.

---

## 10. Options & tuning

Everything is under **Options → Mods**, in **both** the main-menu (pregame) and in-game Options screens.
`emigration.modinfo` loads the options layer in both shell and game scopes, and it registers via
`Options.addOption({ category: CategoryType.Mods, … })`. Settings persist in the shared, cascade-safe
`modSettings` localStorage slice and apply to the live config immediately and at game boot.

- **Emigration** group: **Migration counts** (Both / Civ only / Historical only), **Emigration
  intensity** (Custom / Low / Medium / High), **Dashboard data** (Live / Sample preview), **Migration
  timeline detail** (how often the network snapshots, every 1–5 turns), and a **Migration dock button**
  toggle (on by default).
- **Emigration - Advanced:** every tunable as a dropdown/checkbox, generated from a declarative spec
  (`emigration-tunables.js`), grouped: pacing, scope, prosperity weights, the **advanced-model** switches
  (§5), **war/violence** (incl. the siege model + aggressor avoidance), **border policies**,
  **geography**, assimilation/migrant **cost**, **disasters** (+ plague carry), **notifications**, and
  the **outlet** (attrition).

**Game-speed scaling is automatic, not a knob.** The §2 pacing scaling reads the active game speed and
applies itself; it's gated by internal flags (`gameSpeedTuningEnabled`, default on;
`gameSpeedScalePopulation`, default off) for rollback/QA rather than exposed in the Options UI, so the
mod "just works" at any speed without the player managing it.

**Simulation scope & visibility (independent of each other).** By default the simulation runs over the
**whole world** (every alive civilization, from the first turn), so migration topology isn't biased by
exploration. (Set *Scope* to met-only to lighten per-turn cost on large saves.) Independently, the
dashboard and lenses **mask** civilizations for **spoiler protection**, per a shared
**analytics-visibility policy** (All / Met-only / Own-civ / Disabled), host-authoritative in
multiplayer; default met-only. So scope and on-screen visibility are decoupled: *simulate everything,
reveal selectively.*

The full default set lives in `emigration-config.js`; scaling constants are intentionally **not**
exposed (they must match Demographics).

---

## 11. Architecture / module map

Modules are small and single-concern (the repo enforces a ≤500-line file gate), so several systems span
a parent plus split-out helpers. The `ImportFiles` manifest is a complete inventory of the deployed UI
tree, gated by a test (`tests/modinfo.mjs`). Key modules:

- `ui/emigration-main.js`: Entry UIScript — per-turn hook/costs, event subscriptions, reporting/feedback orchestration, dev dock, boot.
- `ui/emigration-config.js` / `ui/emigration-config-types.js`: Tunable defaults + scaling constants, and the `EmigrationConfig` typedef schema.
- `ui/emigration-game-speed.js`: **the game-speed scalar (§2)** — reads `GameSpeeds.CostMultiplier`, caches S, and exposes `speedTurns` / `speedBar` / `speedDecay` / `speedScaleTurn` (fail-safe to 1).
- `ui/emigration-causes.js`: the migration-cause taxonomy (`MigrationCause` + `causeLabel` / `causePermanence` / `causeHint` / `isRefugeeCause`).
- `ui/emigration-tunables.js`: Declarative exposed knobs plus Low/Med/High presets.
- `ui/emigration-cities.js`: Enumerates met cities into `CitySignal` records.
- `ui/emigration-prosperity.js`: Prosperity scoring (legacy + shaped happiness + overcrowding) and `distress`.
- `ui/emigration-violence.js` / `ui/emigration-violence-signals.js`: Violence state machine (accumulate/decay, siege tenure/escalation/cap) + the fog-independent polled combat signals.
- `ui/emigration-disasters.js`: Per-city disaster distress, decay, plague-carry seeding.
- `ui/emigration-geography.js`: Distance decay, flee-from-invader, aggressor preference, Open Borders flow bonus.
- `ui/emigration-civ-tuning.js` / `ui/emigration-war.js`: Per-leader/civ tuning table; aggressor map from `DiplomacyDeclareWar`/`MakePeace`.
- `ui/emigration-borders.js`: Border-policy reads → `immigrationOpenness` (inbound) + `emigrationRetention` (outbound), attraction yields, asylum flag.
- `ui/emigration-effects.js` / `ui/emigration-dividend.js` / `ui/emigration-migrant-units.js`: Assimilation load + congestion headwind; carried-dividend benefit; unsettled-migrant penalty.
- `ui/emigration-engine.js`: **Main pass** — ranking, the **two concurrent tracks** (crisis + voluntary), per-civ budgets, transit, and the outlet.
- `ui/emigration-arrivals.js`: Lagged-arrival processing (the depart/arrive halves of a transit move).
- `ui/emigration-pull.js`: Destination decision (`adjustedPull`, `bestDestination`, `migrationCause`).
- `ui/emigration-state.js`: Engine-state persistence (per-source voluntary + crisis pressure/cooldown, scaling turn, per-owner populations).
- `ui/emigration-population.js`: Population reads/writes and Demographics scaling (with the optional speed-normalized exponent).
- `ui/emigration-migration-stats.js` / `ui/emigration-migration-records.js`: Per-civ tallies, the recent-moves feed, the `EmigrationData` global, and the `Migration` record typedef.
- `ui/emigration-city-readout-data.js` / `ui/emigration-city-readout.js`: the per-city snapshot (`buildCitySnapshot` + `citySnapshot`, incl. the **cause mix**) and the on-demand readout panel.
- `ui/emigration-views.js` / `ui/emigration-ledger-view.js` / `ui/emigration-window.js`: the shared dashboard render core (civ ledger + diverging Net bar, per-cause breakdown, stances, pressure table) and the standalone window host.
- `ui/emigration-network-viz.js`: the animated dot-swarm — per-cohort dots that fly from origin to destination on load/scrub.
- `ui/emigration-migration-page.js` / `ui/emigration-demographics.js`: the Demographics-page panel registration and the graph specs (Net (Graph)/(Table), Emigration, Immigration, Refugees (Left)/(Arrived)) with subtitles + per-cause tooltips.
- `ui/emigration-prosperity-lens.js` / `ui/emigration-prosperity-tooltip.js`: the tile-by-tile Prosperity map lens (§3) and its plot tooltip.
- `ui/emigration-ethnicity-lens.js` / `ui/emigration-ethnicity-tooltip.js` / `ui/emigration-composition.js`: the Ethnic Composition lens, plot tooltip, and origin-mix ledger.
- `ui/emigration-naming.js` / `ui/emigration-feedback.js` / `ui/emigration-events.js` / `ui/emigration-report.js` / `ui/emigration-log.js`: rich event naming; cause-themed, dual-number, stacking toasts + world-news + anti-spam; `RandomEventOccurred` handling; record→log lines; dev logging.
- `ui/emigration-notifications.js` / `ui/emigration-notifications-view.js`: the **persistent notification log** (every fired toast, with its cause/turn/count/origin/destination detail) and its click-to-expand Notifications sub-tab.
- `ui/emigration-settings.js` / `ui/emigration-options.js` / `ui/options/*`: number-display preference + tunable/preset getters; Options registration; the Advanced editor and the cascade-safe `modSettings` store.
- `data/emigration-policies-*.xml`, `data/emigration-policies-gameeffects.xml`, `data/emigration-policy-icons.xml`, `data/emigration-civilopedia.xml`: DB components for the stance/attraction cards, their native modifiers, icons, and the Civilopedia pages.
- `ui/migration-probe.js`: Dev-only API probe (separate modinfo, not shipped).
- `text/<locale>/ModText.xml` + `scripts/i18n_*.mjs`: localized strings (all 10 locales) and the dev-only localization pipeline (§14).

`emigration.modinfo`'s ActionGroups: the options layer in **both** shell + game scopes; the engine and
its submodules (`ImportFiles`) in game scope; an always-on `<UpdateDatabase>` for the Civilopedia pages +
policy `TraditionModifier`s; an `<UpdateIcons>` for card art; and **three age-scoped** `<UpdateDatabase>`
groups for the border policies (one per age via `AgeInUse` criteria — required because Civ VII rebuilds
the gameplay database each age, so a policy's civic-tree unlock can only reference nodes that exist in
that age's database).

The Civilopedia component adds an **Emigration** section to the in-game encyclopedia with an overview
plus one page per system (Prosperity, War & Refugees, Assimilation, Borders & Influence, Disasters &
Plague, the Outlet, Leaders & Civilizations), reusing the base `Concept` layout. All page text flows
through the §14 localization pipeline (`LOC_PEDIA_EMIG_*`, all 10 locales).

---

## 12. Runtime behavior in game

The mod runs in the **UI VM** (GameFace JS) and applies migration, costs, and reporting during normal
play, with behavior checks documented in companion validation notes:

- **`city.addRuralPopulation(±1)`**: the population move/removal. Not owner-gated → works cross-civ. (The only population write, which is why the outlet "kills" via the same channel as starvation.)
- **`Players.grantYield(pid, YIELD_X, ±n)`**: yield costs; not owner-gated, **negative deducts** (gold confirmed, cross-civ).
- **`DiplomacyTreasury.changeDiplomacyBalance(±n)`**: Influence write (superseded — border-policy Influence is now a native `TraditionModifier`).
- **War aggressor:** `DiplomacyDeclareWar` carries `actingPlayer` (declarer) + `reactingPlayer` (target).
- **Game speed:** `Configuration.getGame().gameSpeedType` → `GameInfo.GameSpeeds.lookup(type).CostMultiplier`, read for the active game (§2).
- **Reads (fog-independent):** district health, `city.isInfected`, `Culture.getActiveTraditions` / `isTraditionActive`, `GameInfo.RandomEvents`, `player.leaderType`/`civilizationType`, per-plot yields (`GameplayMap.getYields`), and a cheap per-civ population aggregate — all read for *all* players.
- **The happiness economy:** pop upkeep happiness `= 0`, `OVERCROWDING_THRESHOLD = 2`, `getYield === getNetYield` (net/post-penalty), the grounding for Algorithm B.

What the VM **cannot** do (and the mod doesn't): create units for *other* civs (`CREATE_ELEMENT` is
local-only), or raise a custom **notification type** without a DB entry (so engine notifications are
deferred; toasts + world-news cover feedback). The policy *cards* are the one piece that needs the
database; everything else is the direct-mutator surface.

---

## 13. Persistence

Per-game state lives in the `GameConfiguration` KV store (survives save/reload):

- `EmigrationState_v1`: per-source **voluntary** pressure/cooldown and **crisis** pressure/cooldown (§2), plus the monotonic scaling turn.
- `EmigrationViolence_v2`: per-city violence intensity + decay, and siege tenure / onset population / cumulative war-loss.
- `EmigrationDisaster_v1`: per-city disaster distress + decay.
- `EmigrationAssim_v1`: per-civ assimilation load + per-civ tick turn.
- `EmigrationDividend_v1`: per-civ carried-dividend pools (attraction yields).
- `EmigrationWar_v1`: victim → aggressors map (Feature 1).
- `EmigrationEthnos_v1`: per-settlement origin-composition ledger (the ethnicity lens/tooltip).
- `EmigrationMigStats_v1`: per-civ tallies — net, gross in/out, refugees, deaths, the per-cause breakdowns, and their graph-sample watermarks.
- `EmigrationNews_v1`: world-news announced-milestone tiers + the last-toast turn (anti-spam).
- `EmigrationNotif_v1`: the permanent notification log (newest-first, capped) behind the Notifications sub-tab — each fired notification's cause, turn, summary, count, and origin/destination detail.

Missing fields (e.g. an old save with no crisis-track pressure) are normalized on load, so the two-track
split is **save-compatible** with pre-split games. Options/settings persist separately in the shared
`modSettings` localStorage key (never a stray top-level key). Single-player scope (UI-VM gameplay writes
are client-side).

---

## 14. Localization

All user-facing strings are LOC keys, **fully translated into all 10 locales** (en, de, es, fr, it, ja,
ko, pt, ru, zh), including the advanced tunable labels. The non-English files are **generated, not
hand-edited**:

```sh
node scripts/i18n_extract.mjs   # text/en_us/ModText.xml → i18n/i18n-source.json (key list)
node scripts/i18n_apply.mjs     # i18n/<locale>.json → text/<locale>/ModText.xml
```

Author English in `text/en_us/ModText.xml`; translations live in `i18n/<locale>.json` (a missing key
falls back to English). `npm run verify` includes a **parity gate** (`tests/i18n.mjs`) that fails if any
en_us key is absent from a locale. `{1_…}` placeholders and code tokens are preserved verbatim.

---

## 15. Install & run

1. Copy this folder to `~/Library/Application Support/Civilization VII/Mods/emigration/`, relaunch, and enable **Emigration** in *Additional Content*.
2. Play turns. With `const DBG = true` (dev default) the mod logs to `UI.log` via the CSS-parse channel:
   ```
   grep -E "EMIG_" "~/Library/Application Support/Civilization VII/Logs/UI.log"
   ```
   `release.sh` flips `DBG` to `false`, so shipped builds run silently.
3. **Dev dock buttons** (subsystem dock): run a pass now / dump the prosperity ranking. Console: `emigration.runNow()`, `emigration.rank()`, `emigration.window()`, `emigration.city(id)`.
4. **Tune or disable the layers:** Options → Mods → Emigration - Advanced exposes every advanced-model switch (§5) and interactive system (§6), plus the notification mode. All default **on**.

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

`verify` runs the modularization gate (file/function length / complexity / statements) and **31 test
harnesses**, including: `game-speed` (the speed scalar — fail-safe, the 5 shipped speeds, the kill
switch, and game-time invariance), `notifications` (the persistent log — newest-first order, turn-stamp,
structured detail, persistence, and the ring cap), `engine-pass` (a 5-scenario end-to-end pass:
peacetime / single-front war / multi-front war / disaster-only / **concurrent war + prosperity**),
`engine-pull` (destination decision), `causes`, `city-readout-data`, `city-readout`, `views`,
`migration-page`, `scaling` (incl. the dual-system `formatBoth`), `prosperity`, `geography`, `violence`
(siege escalation + cap), `tunables`, `migration-stats`, `flow-history`, `composition`,
`governance-mask`, `city-scope-global`, `effects`, `civ-tuning`, `war`, `disasters`, `borders`, `naming`,
`feedback`, `dividend`, `raid`, `modinfo` (the `ImportFiles` manifest stays a complete, import-closed
inventory), `i18n` (locale parity), and `no-empty-catch`. `./release.sh` produces the debug-muted,
allow-listed Workshop zip (readable JS, no minification).

The **`migration-probe`** mod (its own modinfo, never shipped) is the in-engine verifier behind the
write-surface/data claims: dock buttons + a `globalThis.mig` console API, with the **`API3`** and
**`API4`** confirmation passes + passive `DiplomacyDeclareWar` / `RandomEventOccurred` recorders.

---

## 17. Caveats & limits

- **Single-player.** UI-VM gameplay writes are client-side.
- **The advanced layers are on by default but un-playtested-at-scale.** Everything beyond the baseline is implemented and unit-tested, but the knob values are starting points to tune against real games. Turn pieces off in Options (§5-§6) if a save hits balance trouble.
- **Game-speed scaling is verified by tests, not yet in-game at every speed.** The scalar + transforms + game-time invariance are unit-tested and fail-safe to S = 1, but the *feel* at Marathon/Online benefits from a play pass; `gameSpeedTuningEnabled` is the kill switch if a speed feels off.
- **Happiness cost is inferred.** Negative *gold* grants are probe-confirmed; negative *happiness* is inferred; set the happiness knobs to 0 if a build no-ops them (the congestion headwind, §5-C, is the gold-immune structural brake).
- **A few in-engine confirmations remain best-effort:** the policy cards' in-game slotting/unlock, whether disaster *plot-effects* are pollable per plot (we use `isInfected`, which is confirmed), the per-plot yield shape for the Prosperity lens (`getYields`, used defensively with a per-city fallback), and a longitudinal getYield pre/post-penalty check. The code degrades to a safe no-op where unconfirmed.
- **On-map floating indicators are deferred:** `WorldUI` exposes no floating-text method, so feedback uses toasts.
- **Engine notifications need a DB type:** clickable end-turn notifications would need a `NotificationType`; toasts + world-news cover it for now.
- **No new game rules.** The mod composes existing engine writes; it can't invent effects or spawn units for the AI.

---

## 18. Compatibility & mod coexistence

The mod is built to share the game with others. Its only dependency is `base-standard`, and it touches
every shared surface *additively*:

- **Database: inserts only.** `data/emigration-policies-*.xml` and `data/emigration-civilopedia.xml` are pure `<Row>` inserts: no `<Replace>`, `<Update>`, or `<Delete>` against base or shared tables. New IDs are namespaced (`TRADITION_EMIG_*`, `SectionID="EMIGRATION"`). The border-policy traditions attach to existing civic-tree nodes via additive `ProgressionTreeNodeUnlocks` rows.
- **Shared settings store, self-healing.** Options persist under the single community-convention `modSettings` localStorage key (§13), never a stray top-level key. Because GameFace's `localStorage` is shared across *every* mod, a stray top-level key silently clobbers that store; on each save the store self-heals, preserving `modSettings` and dropping stray keys ([ui/options/mod-options.js](ui/options/mod-options.js)). With any mod that follows the convention (Demographics does) this is a no-op.
- **Cooperative globals + events.** JS globals are namespaced (`globalThis.emigration`, `EmigrationData`). The Demographics integration uses an order-independent handshake (`globalThis.DemographicsMetricsAPI ??= {}`) that *joins* the metrics API rather than replacing it. Engine events (`engine.on(…)`) are multicast, so subscribing never blocks another mod's handlers.
- **Defers to the Demographics namespace.** The war-popup refugees label and glossary are owned by Demographics; Emigration adds only the one graph-title string it introduces, so there are no duplicate `LocalizedText` definitions.
- **Additive plot tooltip.** Both the Ethnic Composition and Prosperity per-tile breakdowns are *appended* into the live plot tooltip's `.tooltip__content` via a `MutationObserver`, never replacing the tooltip — so Emigration stacks with whichever full-tooltip mod is active (bz-map-trix, TCS Improved Plot Tooltip) rather than fighting it.
- **Adaptive to other mods.** It reads *live* happiness / yields / Influence each turn, so a mod that rebalances those values is simply reflected in the Prosperity score; effects compose rather than conflict. If another mod also moves population or changes yields, the two stack without corrupting state. **Speed-agnostic too:** the §2 scaling reads whatever game speed is active, including custom speeds a mod adds (any `GameSpeed` row with a `CostMultiplier`), so it adapts rather than hard-coding the five base speeds.

## Credits & license

Adapts the *Prosperity* data model from Machiavelli's "Emigration" mod for Civilization V. MIT.

See [LICENSE](LICENSE).
