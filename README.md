# Emigration - a population-migration mod for Civilization VII

## At a glance (for players)

Adds real migration and refugee systems to Civilization VII. **Unhappy, poor, besieged, or
disaster-struck cities lose population; prosperous and welcoming cities attract it**, within
and across civilizations. Immigration brings growth, costs, politics, and Demographics graphs.

- Refugees flee wars and disasters, fleeing *away* from the invader.
- Unhappy, low-yield cities steadily lose population over time, even at peace.
- A **Pro-Immigration Stance** policy attracts migrants (and earns Influence).
- An **Anti-Immigration Stance** policy retains your people and boosts Production, at the cost of Influence.
- Receiving migrants creates a temporary, real assimilation cost: growth isn't free.
- **See it on the map.** An **Ethnic Composition** lens paints every settlement by the origin
  civilization of its people; hovering a settled tile adds the exact **per-origin percentages** to
  the plot tooltip, so you can watch a city's makeup shift as it's founded, migrated to, conquered,
  and regrown.
- **It tells you why.** Population changes are explained in the moment (a toast: cause, what to
  do, whether it's temporary, who pays) and on demand per city (`emigration.city(id)`), with a
  full **Migration dashboard** (`emigration.window()`): an animated migration network, a cross-civ
  flow map, a per-civ ledger, a cause breakdown, settlements, and policy stances.
- Fully integrated with the **Demographics** mod: a top-level **Emigration** tab whose **Graphs**
  section toggles between **net migration / emigration / immigration / refugees out / refugees in** in
  either scaled "people" or raw Civ numbers, with cause-breakdown tooltips and war/disaster markers on
  the Refugees charts (**Refugees Out** = people this civ displaced; **Refugees In** = displaced people
  it took in) — plus the whole dashboard (network, causes, settlements, policies, guide) as native
  sub-tabs. The standalone dock button is optional (Options) if you'd rather open it on its own.

The sections below explain migration behavior, tuning controls, and gameplay effects in detail. Every advanced layer can be tuned or switched off in **Options → Mods → Emigration - Advanced** (§10), so you can run anything from the plain baseline to the complete model. Start with the summary bullets, then use the remaining sections for detailed mechanics and trade-offs.

**Performance on large saves.** If late-game turns feel heavy with both this and the **Demographics**
mod installed, two safe levers help, in this order. First, lower **Demographics' sampling
frequency** (it samples every civ's metrics on a cadence; a coarser cadence is the bigger win).
Second, raise Emigration's **`turnInterval`** (Options → Mods → Emigration - Advanced) so the
migration pass runs less often. Both change only how *often* data updates, never the migration
behavior or the graph semantics, so they're safe to tune freely.

---

Citizens leave unhappy or struggling settlements including those impacted by environmental disasters and conflict. They move toward happier, more prosperous ones, both **within and between civilizations**. 

This mod is driven by a Civ V-style *Prosperity* model. 

Migration counts can be reported in **both** the game's own population points (1, 2, 3 …) **and** a historically representative people count (thousands … hundreds of millions) scaled to match the **Demographics** mod, shown together by default (e.g. *1 population point (12 thousand people)*), or either alone, via an Options toggle (§10). Absorbing migrants carries a **time-limited in-game cost** so growth has trade-offs.

Several layers sit on top of that baseline, **all on by default**, so you get the full system out of the box. Each can be switched off individually in Options if you'd rather run closer to the bare baseline:

- an advanced Prosperity model (§5): reshapes the happiness draw, time-gates and caps, war displacement, brakes runaway magnets, discounts tall play, and adds bounded per-leader/per-civ tuning;
- interactive systems (§6): refugees who avoid the aggressor that attacked them; Pro/Anti-Immigration stance policies (and base-game Open Borders agreements) that shape cross-civ migration; asylum/relationship permeability; environmental disasters (floods, volcanoes, plague, the last carried by migrants); and an outlet so a trapped, dying population isn't bottled up forever;
- in-game feedback (§9): styled toasts, named refugee headlines, world-news for major crises (spam-throttled), and a Refugees metric with graphs in the Demographics mod;
- localization across all 10 languages (§14).

It all runs in the UI VM (GameFace JS) each turn. This is not a UI-only mod: population moves and yield/Influence changes are real gameplay writes (§12).

### Documentation
- Migration mechanics overview: [../emigration-docs/DESIGN.md](../emigration-docs/DESIGN.md)
- Engine behavior checks and verification notes: [../emigration-docs/FINDINGS.md](../emigration-docs/FINDINGS.md)
- In-game validation checklist for migration behavior and balance: [../emigration-docs/testing-requirements.md](../emigration-docs/testing-requirements.md)
- Civ VII modding mechanics & limits: [../emigration-docs/civ7-mechanics-and-feasibility.md](../emigration-docs/civ7-mechanics-and-feasibility.md)
- How leader/civ abilities & mementos interact (snowballs, exploits):
  [../emigration-docs/leader-civ-memento-interactions.md](../emigration-docs/leader-civ-memento-interactions.md)
- Advanced migration formulas and civ-specific modifiers:
  [../emigration-docs/algorithmic-improvements.md](../emigration-docs/algorithmic-improvements.md)
- Interactive migration systems and extension details:
  [../emigration-docs/interactive-extensions-design.md](../emigration-docs/interactive-extensions-design.md),
  [../emigration-docs/interactive-extensions-implementation.md](../emigration-docs/interactive-extensions-implementation.md)

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
8. [Reporting & Demographics integration](#8-reporting--demographics-integration-emigration-migration-statsjs)
9. [In-game feedback & notifications](#9-in-game-feedback--notifications-emigration-feedbackjs-emigration-eventsjs-emigration-namingjs)
10. [Options & tuning](#10-options--tuning)
11. [Architecture / module map](#11-architecture--module-map)
12. [The execution model & what the probe confirmed](#12-the-execution-model--what-the-probe-confirmed)
13. [Persistence](#13-persistence)
14. [Localization](#14-localization)
15. [Install & run](#15-install--run)
16. [Development](#16-development)
17. [Caveats & limits](#17-caveats--limits)
18. [Compatibility & mod coexistence](#18-compatibility--mod-coexistence)

---

## 1. What it does (player-facing)

Each of your turns, the mod looks at every city in the world it can see and moves
population from the least desirable settlements toward the most desirable ones:

- **Peacetime, unhappiness-driven.** Happiness is the single biggest factor, so an
  unhappy or low-yield city steadily loses population to happier, wealthier ones (no
  war required).
- **War refugees.** A city under actual attack (its districts taking damage, or
  pillaging in its borders) sheds population fast, and refugees **flee away from the
  nearest invader**: an army pressing from the east drives people west.
- **Cross-civilization.** People flee from one civ to another, not just between your
  own cities. This is the mod's defining behavior.
- **Regional.** Migration is distance-penalized, so people move to *nearby* better
  settlements rather than teleporting across the map.
- **Consequential.** Receiving migrants costs the destination civ happiness/gold for a
  while as it assimilates them, so a magnet city converges instead of accreting
  population forever. Hoarding unsettled migrant units costs too.

These layers, all on by default, add: refugees that **shun the aggressor** (own civ
first, neutral third parties next, the attacker last); **border policies**, open up as a
magnet, or seal off as a fortress that keeps your own people home and mobilizes a war economy
(**+Production**) at the cost of **Influence**; **disasters** that push out
climate/disaster refugees and a plague that migrants can carry; an **outlet** where a
trapped, desperate population dies off rather than the system staying closed; and a
nuanced happiness model that keeps high-happiness civs from becoming dominant migration
magnets. All of it is reported in-game (toasts + the Demographics graphs) and in the
dev log, e.g.
`EMIGRATION 1 population point (12 thousand people) left Rome (Romans) for Carthage (Carthaginians)`.

### Quick reference: what counts

Common questions about what does and doesn't cause, attract, or participate in migration. These
reflect the **default** settings (most can be tuned or switched off in Options, §10). The same
matrix is available in-game on the dashboard's **Guide** tab.

**What makes people leave a city**

| | Counts? | |
|---|:---:|---|
| Unhappiness / low yields | ✓ | The dominant driver of emigration: happiness is weighted more than any other factor, and yields are scored per-capita, so an unhappy, low-yield city bleeds people even at peace |
| War damage to the districts | ✓ | Damage to **any** of the city's districts — its center **or** an outer urban/rural quarter — is read from game state (fog-independent) and scales the war penalty; more damage pushes more people out. An assault that wrecks only the city's edge still registers, even while the center reads pristine |
| Being besieged or attacked | ✓ | Per-city: only the besieged city itself sheds people. Fires when **any** of its districts is besieged or has been overrun (captured/contested), even before its health drops. Not a civ-wide score; a civ at war elsewhere keeps its unaffected cities |
| Attacked by a city-state / Independent Power | ✓ | Same per-city conflict pressure as a major-civ war: an Independent/minor raid on a city still drives THAT city's people out, attacker-agnostic |
| Pillaged tiles in the city's borders | ✓ | Pillaged improvements on the city's own plots count as violence in its borders (polled, fog-independent); more pillaged tiles means more pressure |
| Starvation | ✓ | A city with negative net food is flagged starving and takes a situational penalty, shedding population until its food recovers |
| Plague / disease | ✓ | An infected city loses people, and migrants leaving it can carry the plague to their destination |
| Natural disasters (floods, volcanoes) | ✓ | Environmental-disaster distress adds a per-city penalty on a capped sliding scale: strong, but it can't empty the city on its own. An eruption/flood strikes **every city around its epicenter** (the blast radius), so a volcano on unowned border terrain still displaces the neighboring cities' people |
| Overcrowding in a tall city | ✓ | Urban population above a threshold adds pressure (the overcrowding term); the per-leader tuning can soften it via the overcrowding discount |

**What attracts people to a city**

| | Attracts? | |
|---|:---:|---|
| Higher prosperity (food, production, gold, science, culture) | ✓ | Each city scores its per-capita weighted food, production, gold, science and culture; a higher score than nearby cities pulls migrants in |
| Higher happiness | ✓ | Weighted more heavily than any other factor. In the shaped model it's measured against the world average and saturates, so a happy city is a strong magnet but can't run away without limit |
| A Pro-Immigration stance policy | ✓ | A civic-tree Pro-Immigration stance raises the pull into your cities and earns Influence (trading some retention) |
| An Open Borders agreement | ✓ | An Open Borders agreement adds a cross-civ pull bonus, so more people cross between the two civs |
| Being nearby | ✓ | Migration is distance-penalized, so people move to nearby better settlements rather than across the map |

**Who participates (sends / receives population)**

| | Participates? | |
|---|:---:|---|
| Your civilization | ✓ | Sends and receives population like any major civ; its cities both lose and gain migrants |
| Towns, not just cities | ✓ | Towns participate too; they send and receive migrants the same as cities |
| Your own cities trade people (internal migration) | ✓ | People also move between a civ's OWN settlements, not only across civs; the dashboard colours these internal moves separately |
| Other major civilizations | ✓ | Every major civ is simulated from turn one, met or not, so the migration map isn't biased by what you've explored |
| City-states / minor civs / Independent Powers | ✗ | Not currently: they neither send nor receive migrating population, though attacking a major civ's city still drives THAT city's people out |
| Unmet civilizations | ✓ | Fully simulated, but masked in the UI by default for spoiler protection until you widen the visibility policy |

**Behavior**

| | | |
|---|:---:|---|
| Migration between different civilizations | ✓ | People do cross borders, but the flow is throttled by borders, distance, and each side's immigration stance |
| Migration driven by distant AI-vs-AI wars | ✓ | Fog-independent: war pressure reads actual game state, so a far-off AI-vs-AI war displaces people the same as one you can see |
| An Anti-Immigration stance retains your people | ✓ | Raises retention (fewer people leave) and boosts Production, at the cost of Influence |
| Closed Borders reduces cross-civ flow | ✓ | Without an Open Borders agreement far fewer people cross between civs; closing borders tightens it further |
| Population & yields actually change (not just a display) | ✓ | Real per-turn gameplay writes: city populations and the yields they produce actually move; it isn't a cosmetic overlay |
| Any layer can be tuned or switched off | ✓ | Presets plus ~57 individual knobs under Options ▸ Mods ▸ Emigration; every layer is on by default and can be turned off |
| Migrants arrive instantly | ✗ | No. They travel, so arrival lags with distance, up to a few turns after they leave |
| Absorbing migrants is free | ✗ | No. Receiving migrants adds a temporary, decaying assimilation cost in happiness and gold |
| War alone can empty a city to zero | ✗ | No. Siege/war population loss is capped; a city can only be fully emptied by an actual capture |

**Scope & limits**

| | | |
|---|:---:|---|
| Changes AI strategy or replaces base-game files | ✗ | No. Additive only; population movement is layered on, and the base game's AI decisions and files are untouched |
| Moves population instantly across the map | ✗ | No. Distance-penalized; people move to nearby better settlements, not across the world in one step |
| Lets you directly place or pick individual migrants | ✗ | No. Flows are simulated from prosperity, war, and policy; you shape them with yields and stances, not by hand |
| Lets one magnet city drain the whole map | ✗ | No. A congestion brake (plus the overcrowding discount) damps a runaway magnet, so no single city accretes the world |

**FAQ**

- **Where do people go when they leave?** To the nearest higher-prosperity settlement they can reach. Migration is distance-penalized, so people move regionally, not to the single best city on the map.
- **Where do war refugees flee?** Away from the nearest enemy, preferring their own civilization first, then neutral civs, and the attacker last.
- **How many people move, and how often?** War- and disaster-driven refugees flee every turn; voluntary (prosperity/unhappiness) migration is more gradual, resting briefly between moves. Each civilization migrates on its own per-turn budget that scales with its size and active crises, so simultaneous wars never throttle one another. Counts show as scaled people or raw population points (your choice, aligned with Demographics), and the whole sim runs on a turn interval you can lengthen in Options for large saves.
- **What happens when I capture or lose a city?** It keeps its residents' origin mix (what the Ethnicity lens paints), so a conquered city carries real origin history. War can shrink it, but only an actual capture transfers it.
- **Why did a city suddenly lose a lot of people?** An on-screen toast names the cause (war, disaster, unhappiness, etc.), and the per-city readout breaks down its current pressures.

**Post-war recovery FAQ**

- **My city shrank from size 12 to 5 in a war — will it grow back?** Yes. War displacement only moves *population points*; it never razes districts or deletes buildings (only the base game's own conquest does that). So you keep the larger city's infrastructure with fewer people working it, and it regrows two ways, both additive: the base game's normal **food growth** (untouched by the mod), and **immigration** — once the fighting stops and its prosperity recovers, the surviving high-yield buildings/districts make it an attractive destination, so migrants move in and population is added back.
- **Do the same refugees who fled come back?** No. There is no repatriation mechanism; war's "temporary" tag is only a durability cue. The people who fled resettled permanently elsewhere. The city regrows from *new* residents (births + new immigrants), not the original refugees.
- **Does repairing pillaged tiles restore the lost population?** No. Pillaged tiles only apply *pressure* (a standing prosperity penalty that pushes people out). Repairing them **removes that pressure** — so the city stops bleeding people and its prosperity recovers faster — but a repair never adds a population point back. Repair is a recovery accelerator, not a restore button.
- **How far can a war shrink a city?** War-driven loss is capped at **`siegeLossCapPct` (60% by default) of the city's population when the siege began**. The remnant "digs in" and the siege can't depopulate it further; only an actual capture takes the city.
- **Fastest way to recover a war-torn city?** Relieve the cause so the city flips from a net exporter back to a magnet: **make peace** (violence decays in ~2–3 turns, lifting the war penalty), **repair pillaged tiles** (removes the lingering pressure), and **raise happiness** (the single biggest prosperity factor — it both stops unhappiness emigration and pulls migrants in).

**Migration in transit (the economics of in-flight migrants)**

Migration is **not instantaneous** — a move has *transit lag* (`transitLagTurns`, distance-scaled). This creates a window where a migrant has left their old city but not yet reached their new one, and that window has a small but real economic footprint.

- **The lifecycle of a move.** At **departure**, the migrant's rural population point is removed from the source city *immediately* — so the source loses that worker (and the tile yields they were producing) the turn they leave. They then spend the **transit** period belonging to **no city**: working no tiles, producing no yields anywhere — but also incurring **no upkeep, gold, or happiness cost** (the one-time assimilation cost is paid by the destination only **on arrival**, not during transit). At **arrival**, the point is added to the destination, which finally gains the yields.
- **How long is the gap.** Transit is **1–4 turns**: `transitLagTurns` (4) caps it, and the lag scales with distance at `transitHexPerTurn` (~5 hexes per turn). Because migration is distance-penalized (people move regionally), most moves are 1–2 turns; **war/disaster refugees take at least 1 turn** (they camp).
- **How significant is it?** **Small and self-correcting.** Per migrant it is one rural point's yields suspended for ~1–2 turns, and the source was losing that worker regardless — so the only output truly *lost* is the delay before the destination picks them up. In aggregate the drag is roughly *(migrants currently in transit) × (their per-pop yields)*, where the in-transit count ≈ *departures-per-turn × average transit turns*:
  - **Peacetime:** voluntary migration is paced slowly, so only a handful are ever in transit — effectively a rounding error on the global economy.
  - **Wartime:** refugees flee every turn, so a meaningfully larger pool of population sits "in limbo" at once. Still bounded — every migrant clears in ≤ 4 turns — and it drains back toward zero within a few turns of the fighting stopping.
- **What you'll see.** Transit lag is why **Emigration (gross-out) can tick up before Immigration (gross-in) catches up** — the departure is counted at the source now, the arrival lands a few turns later. This does **not** distort **Net Migration**, which counts only *settled, cross-civ* moves (internal moves and unsettled in-flight migrants don't drag it down).

---

## 2. How it works: the per-turn loop

On every `PlayerTurnActivated`:

1. **Per-civ costs** (`chargePerTurnCosts`) run for *whichever* civ's turn it is: the
   decaying assimilation cost and the migrant-holding penalty (§7).
2. **The emigration pass** (`runPass`) runs once on the **local player's** turn (gated
   by `turnInterval`):
   1. **Decay** accumulated **violence** and **disaster** distress for the turn.
   2. **Collect signals:** one `CitySignal` per met city (§3).
   3. **Rank by Prosperity:** score every city; sort descending (§3, §5).
   4. **Advance state:** a monotonic turn counter (for scaling) + prune/tick
      cooldowns; compute per-owner populations (for congestion).
   5. **Process each source**, each civ bounded by its **own per-turn move ceiling**
      (`civMoveCeilings`): a runaway/perf safety net (*not* the pacing knob), sized
      `maxMovesPerTurn` + `movesPerCity`·(its settlements) + `movesPerSiege`·(its cities
      in war/disaster crisis). It's **per-civ**, so simultaneous wars on different
      civilizations never compete for one global budget; a maxed-out civ is skipped while
      others keep processing. Real pacing comes from the per-source pressure bar +
      cooldown (below):
      - Skip if its rural pool is at the floor, or, for **voluntary** (prosperity /
        unhappiness) migration only, it's on **cooldown**. **Forced** displacement
        (war / disaster) **bypasses the cooldown and flees every turn**, bounded only by
        the war-surge burst and the siege-loss cap.
      - Find its **best destination** (greatest *adjusted pull*, §3).
      - **If there's a destination:** accumulate **pressure**; on crossing
        `emigrationBar`, move one or more rural points depending on context
        (`addRuralPopulation(-1)` on the source, `+1` on the destination, works
        cross-civ). War-surge can raise same-turn war displacement up to
        `warSurgeMax` (still bounded by `siegeLossCapPct`); voluntary migration then
        **rests on a `cooldownTurns` cooldown**, while war/disaster does not. Transit lag
        can delay arrival (`transitLagTurns`/`transitHexPerTurn`), and each successful
        intake records war-loss (when besieged), can seed plague carry (§6c), and adds
        **assimilation load** to the destination civ.
      - **If there's no destination** (the outlet, §6d): a sufficiently *distressed*
        source builds attrition pressure and eventually **loses a rural point with no
        destination**: population leaves the world (a death), not the city.
   6. **Persist** state to `GameConfiguration`; surface **feedback** (§9).
3. **Events.** Subscribed at boot: `DiplomacyDeclareWar`/`MakePeace` feed the
   aggressor map (§6a); `RandomEventOccurred` feeds disaster distress + a named alert
   (§6c).

---

## 3. The signals & the Prosperity score

`emigration-cities.js` builds a `CitySignal` per city (owner, population, rural pool,
**urban** population, per-capita yields, net happiness, unrest, starvation, siege, war,
accumulated **violence**, accumulated **disaster** distress, **infected** flag).
`emigration-prosperity.js` turns it into a score. The **default (legacy linear)**
model:

$$
\begin{aligned}
P &= \left(Q + h\,\lambda_h - n\,\lambda_n\right)\left(1 + \frac{s}{100}\right), \\
Q &= \frac{f\,w_F + p\,w_P + g\,w_G + sc\,w_S + c\,w_C}{n}, \\
s &= v + d + \sigma + \tau + u.
\end{aligned}
$$

Where $P$ is prosperity, $Q$ is per-capita productiveness, $h$ is net happiness,
$n$ is population, and $s$ is the summed situational percentage from violence,
disaster, siege, starvation, and unrest channels.

Higher = more attractive. **Happiness dominates** (weight `localHappinessFactor`,
default 6), which is why unhappiness drives migration even at peace; the situational
multiplier is where war/violence, disasters, sieges, starvation, and unrest bite. (§5
replaces the happiness term and the violence penalty with more nuanced versions when
their flags are on.) The magnitude of the negative situational percent is also exposed
as **`distress(s)`**, which drives the outlet (§6d).

### Violence (`emigration-violence.js`): polled, fog-independent
War-driven emigration keys on **actual violence inside a city's borders**, not on the
empire merely being at war, and it's **symmetric** for player-watched and distant
AI-vs-AI wars, because it reads game *state*, not visibility-gated events:

- **City under attack:** polls the city-center district's health
  (`Players.Districts.get(owner).getDistrictHealth/…MaxHealth`), readable for *all*
  players regardless of line of sight. Fresh damage spikes (`vwAssault`); standing
  damage sustains a siege (`vwSiege`).
- **Pillage:** damaged improvements on `getPurchasedPlots()` add standing pressure
  (`vwPillage`).
- The score **accumulates and decays** (`violenceDecay`): a sustained siege builds, a
  lone raid fades in 2-3 turns. With **Algorithm D** on, the curve also escalates with
  siege *duration* and is capped in total (§5-D).

### Geography (`emigration-geography.js`)
- **Distance decay:** `−distanceFactor × hexDistance`, keeping migration regional.
- **Flee-from-invader:** when violence crosses `violenceFleeThreshold`, refugees
  prefer destinations *away* from the nearest enemy (`fleeFactor`).
- **Aggressor preference:** own civ > neutral > the attacker, when Feature 1 is on
  (§6a).
- **Open Borders flow bonus:** a modest cross-civ pull bump between civs holding a base-game
  Open Borders agreement (`openBordersBonus`, §6b).

### The destination decision (`emigration-pull.js`)
The destination scorer is implemented as two bounded channels over the prosperity
gradient and friction terms:

$$
\begin{aligned}
\mathrm{Pull}(s,d) &= \Big(\Delta\mathrm{Pros}(s,d) + \mathrm{Tilt}(s,d) - \mathrm{Friction}(s,d)\Big) \cdot \Pi(s,d), \\
\Delta\mathrm{Pros}(s,d) &= \mathrm{Pros}(d)-\mathrm{Pros}(s), \\
\mathrm{Tilt}(s,d) &= \mathrm{clamp}\big(\mathrm{asylumTilt}(s,d),-\mathrm{tiltCap},\mathrm{tiltCap}\big), \\
\Pi(s,d) &= \mathrm{clamp}\big(\mathrm{openness}(d)\cdot\mathrm{retention}(s)\cdot\mathrm{permOpenBorders}^{ob}\cdot\mathrm{permAlly}^{al}\cdot\mathrm{permWar}^{wa},\ \mathrm{permeFloor},\mathrm{permeCeil}\big).
\end{aligned}
$$

In the permeability $\Pi$, $\mathrm{openness}(d)$ is the **destination's** inbound border throttle
and $\mathrm{retention}(s)$ the **source's** cross-civ outbound throttle, the two halves of the
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

War is not a hard gate: a besieged source gets lower prosperity and directional
flee pressure, then passes through the same pull equation.
War is **not** a hard gate: a besieged city simply has low prosperity and a flee
vector. People can emigrate to any civilization.

---

## 4. Population scaling (Demographics alignment)

`emigration-population.js` converts Civ's abstract population points into representative
people using the **identical formula** to the Demographics mod:

```
base(raw, turn) = raw^scaleExp × scaleBase × scaleGrowth^turn   // 1.11, 12000, 1.009
megaTarget      = (raw > 20) ? (raw / 20)^1.5 : 1
ramp            = smoothstep(clamp((modernProgress - 0.1) / 0.8, 0, 1))
scaleCityPopulation = base × (1 + (megaTarget - 1) × ramp)
```

A moved point is reported as the **marginal** people it represents
(`scale(pop) − scale(pop−1)`), using a **monotonic** turn so the figure never resets at
age boundaries, and applying the same Modern-only smooth ramp as Demographics.
`formatPeople` renders "12 thousand / 1.3 million / 240 million".
`moveRural` performs a relocation; **`removeRural`** removes a point with no
destination (the outlet's death, §6d), using the same rural-population accounting the
game's own starvation shrinkage uses.

---

## 5. The advanced model (algorithms & per-civ tuning)

Four algorithms plus a per-civ tuning table refine the baseline, **all on by default** (each
can be switched off in Options).
Full math + before/after numbers: [../emigration-docs/algorithmic-improvements.md](../emigration-docs/algorithmic-improvements.md).

### A. Shaped happiness (`happinessShaped`)
The linear `happiness × 6` term let pure-happiness sources run away (Benjamin Franklin's
Glass Armonica, +15 happiness/ally, made a ~50× magnet). The shaped model is
**field-relative** (measured vs the world mean), **saturating** on the pull side and
**steep** on the misery side (`tanh`), and makes happiness **amplify the economy**
(bounded multiplier `[happyMultMin, happyMultMax]` + `happyFloor`) rather than dwarf it.
Net: Franklin drops to ~2× while unhappy cities still shed strongly.

### B. Overcrowding discount (`overcrowdDiscount`)
The probe (§12) confirmed population costs **zero** happiness per head; a tall city's
unhappiness is **overcrowding** past a density threshold, and `getYield` is the **net,
post-penalty** value, so unhappiness double-hits (suppressed yields *and* the ×6 term).
The discount credits back density-driven unhappiness via `urbanPopulation` vs
`overcrowdThreshold`.

### C. Congestion headwind + leader variance (`congestWeight`)
A structural **anti-runaway brake that can't be out-golded**: a civ absorbing lots of
migrants becomes a less attractive *further* destination, scaling with its per-capita
assimilation load. Two leader-variance knobs ride the assimilation cost via the civ
table: `integrationSpeed` (load decay) and `assimilationEase` (gold cost).

### D. Capped, time-gated war displacement (`warSiege`)
Fog-independent violence made war a bloodless depopulation tool. The siege model tracks
**siege tenure**, **escalates** the penalty from `siegeFloor` to full over
`siegeRampTurns`, and **caps** total war loss at `siegeLossCapPct` of onset population
(the remnant "digs in"), so a city can lose substantial population but cannot be emptied without a capture.

### The civ tuning table (`emigration-civ-tuning.js`, `civTuningEnabled`)
A small, auditable registry of **bounded** per-leader/per-civ nudges, keyed on the
GameInfo leader string (`_ALT` personas normalized; leader overrides civ). Fields:
`happinessPull`, `integrationSpeed`, `assimilationEase`, `overcrowdDiscount`,
`warRetention`, `sourceBias`. Shipped entries target outliers: Franklin
`happinessPull 0.75`, Isabella `0.85`+`ease 1.2`, Xerxes `ease 1.25`, Khmer
`sourceBias 1.5`, Pachacuti `overcrowdDiscount 0.5`, Norman/England `warRetention 1.4`,
and so on. None can cause a runaway; the structural guarantees live in the algorithms.

---

## 6. Interactive systems (on by default)

### 6a. Aggressor-aware war refugees (`aggressorPenalty`, 0 = off)
When civ A attacks civ B, B's refugees prefer **B's own cities** first, then **any civ
other than A**, and treat **A** as a last resort. The aggressor is read from the public
`DiplomacyDeclareWar` event (`actingPlayer` declared on `reactingPlayer`, probe-confirmed
field names), persisted as a victim→aggressors map in `emigration-war.js` and cleared on
peace. The preference (`ownCivRefugeeBonus` toward own civ, `−aggressorPenalty` for the
attacker) is folded into `geoAdjust` only for cities actually under violence.

### 6b. Immigration-stance policies + Open Borders agreements
Two distinct levers control cross-civ immigration.

**Your stance (a policy card, `bordersEnabled`).** Slot **Pro-Immigration Stance** or
**Anti-Immigration Stance** - renamed from "Open/Closed Borders" so they don't collide with the
base game's Open Borders *diplomatic agreement*. A small **database component**
(`data/emigration-policies-{antiquity,exploration,modern}.xml`, one file per age) adds the
slot-able traditions, one per age, available to every civ. They unlock from a **mid-age**
civic node (Antiquity **Citizenship**, Exploration **Economics**, Modern **Social Question** -
roughly halfway through each age, all thematically on-point) so the cards arrive when
migration is actually in play, rather than sitting useless in a policy slot from turn one. (Internal trait IDs keep
`TRADITION_EMIG_OPEN/CLOSED_BORDERS_*`.) The two stances are deliberately **asymmetric**,
Pro is a growth/magnet play, Anti is a *fortress* play, not just its negation:

- **Pro-Immigration Stance:** +50% immigration **into** your cities
  (`immigrationOpenness(destOwner)`, a custom UI-VM multiplier on inbound pull) plus a native
  **+1/+2/+3 Influence** `TraditionModifier` for your cosmopolitan reputation.
- **Anti-Immigration Stance:** a fortress with **four** effects. It throttles inbound
  immigration to 40% (`immigrationOpenness`, floored at 0.15) **and retains your own people**,
  your citizens' *cross-civ* outbound pull is cut to 60% (`emigrationRetention(srcOwner)`, the
  mirror of the inbound throttle; cross-civ only, since internal moves don't cost your civ
  population). To offset the diplomatic cost of isolation it also rides a native
  **+2/+3/+4 Production in every city** modifier (a mobilized, autarkic war economy) alongside
  the native **−2/−3/−4 Influence** penalty (closing your borders is not internationally popular).

The migration % and retention are custom UI-VM mechanics; the Influence and Production are native
`TraditionModifier`s (`data/emigration-policies-gameeffects.xml`), so they show on the card *and* in
the yields breakdown like any base-game policy.

**Diplomatic Open Borders (a flow bonus, `openBordersBonus`).** When two civs hold an active
base-game **Open Borders** agreement, migration between them is eased both ways:
`emigration-geography.js` checks the joint diplomatic events
(`Game.Diplomacy.getJointEvents(...).actionTypeName === "DIPLOMACY_ACTION_OPEN_BORDERS"`) and
adds a modest cross-civ pull bonus. Console check: `emigration.openBorders(aPid, bPid)`.

Governments no longer separately affect emigration.

#### Policy cards by age (what is actually shipped)
The policy layer is broader than the two immigration stances. The card set is age-scoped in
`data/emigration-policies-{antiquity,exploration,modern}.xml`, with native per-turn
yield effects in `data/emigration-policies-gameeffects.xml`. Card names below are the
**in-game display names**; the internal trait tokens (which keep the OPEN/CLOSED_BORDERS
wording) are listed in the ID reference that follows.

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
| Refugee Compact<br>(Political Theory) | +2 Influence/turn, <br>+1 Culture/turn <br><br>Migration: refugee pull tilt |

Internal ID reference (token → in-game name: OPEN_BORDERS = Pro-Immigration Stance,
CLOSED_BORDERS = Anti-Immigration Stance, TALENT = Talent Attraction, CULTPULL = Cultural
Magnetism, TRADEPULL = Commercial Draw, ASYLUM = Selective Asylum / Refugee Compact)

- Prefix: TRADITION_EMIG_
- Antiquity: tokens OPEN_BORDERS, CLOSED_BORDERS; suffix _ANTIQUITY
- Exploration: tokens OPEN_BORDERS, CLOSED_BORDERS, TALENT, CULTPULL,<br>
  TRADEPULL, ASYLUM; suffix _EXPLORATION
- Modern: tokens OPEN_BORDERS, CLOSED_BORDERS, TALENT, CULTPULL,<br>
  TRADEPULL, ASYLUM; suffix _MODERN

Native card yields are visible in the game breakdown. Migration-specific percentage and
targeted-attraction behavior remains in UI-VM logic (`emigration-borders.js`,
`emigration-pull.js`).

#### How attraction policy card yields actually function
Attraction cards have two yield layers, and they stack:

1. **Native fixed yield from the DB card itself** (`data/emigration-policies-gameeffects.xml`):
  a constant per-turn yield shown in the normal game breakdown (for example, Talent gives
  Science, CultPull gives Culture, TradePull gives Gold; values scale by age).
2. **Carried dividend from actual immigrant intake** (`emigration-dividend.js`): each
  incoming migrant under an active attraction adds pool:

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

So the card is not only a flat bonus; it also converts migration throughput into ongoing
yield. This is why attraction cards feel stronger in high-intake destinations.

Default constants are: `dividendPerMigrant = 1.5`, `dividendDecay = 0.7`, and
`dividendCap = 12` per turn in a yield channel.

Important: `+2 Influence/turn` is **not** per immigrant. It is a flat per-turn civ yield
modifier from the slotted card. The per-immigrant part is only the carried-dividend pool
for attraction cards, applied on each successful arrival.

### 6c. Environmental disasters & plague (`disastersEnabled`)
Civ VII's `RandomEvents` (flood / volcano / **plague** / hurricane / blizzard / tornado /
duststorm / thunderstorm) become a migration driver, parallel to war.
`emigration-disasters.js` accumulates per-city **disaster distress** that decays each turn
and feeds a situational prosperity penalty, so struck cities shed **climate/disaster
refugees**. It's **fog-independent**: the canonical signal is `city.isInfected` (the base
game's outbreak flag, which already makes a city emit migrants) plus a severity-scaled
spike from the `RandomEventOccurred` event. **Plague-as-contagion** (`plagueCarryEnabled`,
off): migrants fleeing an infected city seed a smaller outbreak-distress at their
destination, a contagion vector beyond the game's own trade-network spread.

### 6d. The outlet: attrition when there's no refuge (`attritionEnabled`, off)
Keeps the model from being a **closed system**. When a source has **no viable
destination** *and* is genuinely distressed (`distress(s) >= attritionMinDistress`,
siege/starvation/heavy-violence/disaster level), it builds attrition pressure and, on
crossing `attritionThreshold`, **loses a rural point with no destination**: population
leaves the *world* (a death/dispersal), via the same `addRuralPopulation(-1)` accounting
the game's starvation uses. A content city with nowhere better to go is untouched.
Attrition is tracked as **deaths**, fully isolated from the migration/refugee metrics:
a death isn't a migration, so it never inflates any flow figure.

### 6e. Asylum and relationship permeability (targeted attraction)
Pull is composed from a prosperity gradient plus a targeted-attraction channel (`tilt`) and
relationship permeability multipliers. In practice:

- **Asylum push** (`asylumPushWeight`) adds targeted pull for distressed refugees toward
  destinations that are actively hospitable.
- **Relationship permeability** (`permOpenBorders`, `permAlly`, `permWar`) scales cross-civ
  movement without hard-forcing it.
- **Global bounds** (`tiltCap`, `permeFloor`, `permeCeil`) prevent runaway attraction or
  hard lockout.

This logic is computed in `emigration-pull.js`, so targeted attraction composes with the rest
of the destination decision rather than bypassing prosperity/geography/congestion.

---

## 7. Consequences: the gameplay-write cost layer (`emigration-effects.js`)

Civ VII makes raw population *free*, so the mod adds the missing feedback via
`Players.grantYield(pid, YIELD_X, −amount)` (probe-confirmed to deduct, cross-civ;
happiness leg inferred):

- **Assimilation cost (duration-based).** Each migrant adds **load** to the receiving
  civ (`assimilationLoadPerMigrant × (1 + assimilationCostPerPop × destPop)`). Load
  **decays each turn** (`assimilationDecay`, the duration, optionally scaled by
  `integrationSpeed`) and the civ pays per-turn `assimilationHappiness`/`assimilationGold`
  per unit (gold leg optionally scaled by `assimilationEase`). Scoped to *migrated*
  population only.
- **Migrant-holding penalty.** Per-turn cost per unsettled `UNIT_MIGRANT` a civ holds, so
  overflow migrants must be settled, not hoarded.
- **Congestion headwind (Algorithm C).** `congestionPenalty` + `assimLoadFor` live here;
  the engine subtracts the headwind from a destination's pull.
- **Carried dividend (the assimilation mirror).** Under attraction contexts, incoming
  migrants can build a decaying per-turn positive pool (`dividendPerMigrant`, `dividendDecay`,
  `dividendCap`) in the matched yield domain (science/culture/gold). Implemented in
  `emigration-dividend.js` and granted through the same verified `grantYield` surface.

All apply to **every civ on its own turn**. Set any knob to 0 to disable.

---

## 8. Reporting & Demographics integration (`emigration-migration-stats.js`)

When the **Demographics** mod is installed, Emigration contributes, via its companion
hook (`globalThis.DemographicsMetricsAPI`, an order-independent handshake):

- **A top-level Emigration tab** on the Demographics screen (via `registerPanel`/`registerMetricGroup`).
  Its first section, **Graphs**, is a metric group with two pill-row toggles: the **metric**
  (**Net Migration / Emigration / Immigration / Refugees**, cumulative per civ) and the **units** —
  **Scaled** (historical "people", the same scale as the Population charts) or **Civ numbers** (raw
  population points that reconcile with the in-game window). Each line carries a cause-attribution
  tooltip (gross in/out + the emigration cause breakdown on Net, the war/disaster/conquest split on
  Refugees, and a `Sources: War: …, Disaster: …` breakdown on Emigration/Immigration), and the
  Refugees chart draws **war- and disaster-onset markers** on the timeline.
- **The full dashboard as native sub-tabs** on that same tab — **Network** (animated dot-swarm + arrow
  flow map, each with a Civ Pop / Scaled Pop units toggle), **Civilizations**, **Causes**,
  **Settlements**, **Immigration Policies**, and **Guide** — the **same content as the standalone
  window**. The panel declares its sub-tabs through `registerPanel({ …, tabs })`; the screen renders
  each via `render(container, ctx, subId)`. Registered order-independently and a silent no-op on an
  older Demographics (the standalone window still covers it).
- **An Ethnic Composition map lens + plot tooltip** (`emigration-ethnicity-lens.js`,
  `emigration-ethnicity-tooltip.js`, fed by `emigration-composition.js`). A self-registering lens
  (Shift+E, or the lens panel) paints each settlement by the **dominant origin civilization** of
  its people, fill intensity scaling with that civ's share; hovering any settled tile adds the
  exact **per-origin percentages** to the game's plot tooltip. The percentages come from the same
  ledger the dashboard uses, so they stay consistent. Both honor the spoiler-protection visibility
  policy (§10): a policy-hidden owner shows nothing and hidden origins merge into one neutral
  "Unknown" bucket.
- **A Refugees row in the Demographics war-effects cost tooltip** (a small Demographics-side edit:
  `COST_METRICS` + the war sampler reading `globalThis.EmigrationData.refugeesCumFor`). Refugees
  attribute to the besieged side and render "- no data" when Emigration isn't installed. (The
  Refugees *graph* itself lives in the Emigration tab's Graphs section, above.)
- **A Network-only timeline-detail note**: when the migration snapshot interval is coarser than every
  turn, Demographics shows a note next to its analytics-policy banner on the Network sub-tab
  (exposed via `globalThis.EmigrationTimelineNote`) explaining that a newly-met civ or recent move
  can take a few turns to appear in the flow timeline.

`EmigrationData` (exposed globally) carries per-civ cumulative tallies: gross in/out, net,
**refugees** (war/disaster/conquest displacement), **deaths** (attrition), and the
**per-cause** emigration/immigration breakdowns (`emigrationByCauseFor`,
`immigrationByCauseFor`). If Demographics isn't installed it's all a silent no-op.

---

## 9. In-game feedback & notifications (`emigration-feedback.js`, `emigration-events.js`, `emigration-naming.js`)

Migration is surfaced as **styled HUD toasts** (matching the game's look: `BodyFont`, the
dark panel tones, parchment text) and, for big events anywhere in the world, **world-news**.
It is **important-only by design**, with several anti-spam layers (the engine has no toast
API and `WorldUI` has no floating-text method, so toasts are the channel):

- **Rich, named events** (`emigration-naming.js`, modeled on the Demographics war-naming):
  disasters use the **game's own names** (`GameInfo.RandomEvents.lookup(type).Name`, e.g.
  "Thera" or "Catastrophic Eruption"), wars reuse the war name, conquest names the sacked
  city. Headlines like *"The Thera eruption displaces 80,000."*
- **Explanatory & actionable** (the in-game-legibility layer). When *your* cities lose
  people in a pass, a single throttled **local digest** toast answers why / what-to-do /
  temporary-or-permanent / who-pays, e.g. *"12 thousand people left Rome, unhappy at home.
  Raise this city's happiness, or slot an Anti-Immigration Stance to retain them. It
  continues until you address the cause."* The cause-keyed **action hint**
  (`emigration-causes.js#causeHint`) and **permanence cue** also ride the verbose per-cause
  toasts and the disaster alert. It uses the same important-toast cooldown, so richer content
  does **not** mean more toasts.
- **Per-city readout** (`emigration-city-readout.js`). An on-demand HUD panel answering "why
  is *this* settlement changing?", dominant cause + status (building pressure / resting),
  where its people are pulled, the assimilation cost, the civ's net migration, the hint, and
  an at-risk / trapped-with-no-refuge warning. Built from the recompute-on-read `citySnapshot`
  (no new state); opens via `emigration.city(id)` / `emigration.hideCity()` and best-effort on
  city selection. Toggle in Options (`cityReadoutEnabled`); works without Demographics.
- **Dashboard window** (`emigration-window.js` + the shared render core `emigration-views.js`).
  A standalone HUD window (`emigration.window()` / `emigration.closeWindow()`) with the whole
  picture across tabbed sections: an **animated migration network** and a **cross-civ flow map**
  (both with a timeline scrubber to replay how flows built up), a per-civ ledger
  (in/out/net/refugees/deaths), the "why people move" cause breakdown, who holds Pro-/Anti-
  Immigration stances, and your cities ranked by migration pressure. When the timeline-detail
  setting samples less often than every turn, a reminder banner on every tab notes that a just-met
  civ or a recent move can take a few turns to appear. The same render core backs the Demographics
  Migration page (as native sub-tabs, §8), so it works either way.
- **Anti-spam.** Disasters only notify at/above `disasterNotifyMinSeverity` (minor events
  drive the sim silently). War notifications are **once-per-milestone** on a civ's
  **cumulative** refugees (`worldRefugeeThreshold`), not per turn. A global
  `notifyCooldownTurns` backstops everything. `notifyMode`: **0** off / **1** important-only
  (default) / **2** verbose (adds a per-pass per-cause toast). All player-tunable.
- **Events.** `RandomEventOccurred` → disaster distress + a named alert; war/peace events
  feed the aggressor map.

---

## 10. Options & tuning

Everything is under **Options → Mods**, in **both** the main-menu (pregame) and in-game
Options screens. `emigration.modinfo` loads the options layer in both shell and game
scopes, and it registers via `Options.addOption({ category: CategoryType.Mods, … })`.
Settings persist in the shared, cascade-safe `modSettings` localStorage slice and apply to
the live config immediately and at game boot.

- **Emigration** group: **Migration counts** (Both / Civ only / Historical only), **Emigration
  intensity** (Custom / Low / Medium / High), **Dashboard data** (Live / Sample preview),
  **Migration timeline detail** (how often the network snapshots, every 1–5 turns), and a
  **Migration dock button** toggle (on by default; turn it off to reach the dashboard only from
  the Demographics Migration page or the console `emigration.window()`).
- **Emigration - Advanced:** every tunable as a dropdown/checkbox, generated from a
  declarative spec (`emigration-tunables.js`), grouped: pacing, scope, prosperity weights,
  the **advanced-model** switches (§5: shaped happiness, overcrowding, congestion, civ
  tuning), **war/violence** (incl. the siege model + aggressor avoidance), **border
  policies**, **geography**, assimilation/migrant **cost**, **disasters** (+ plague
  carry), **notifications** (verbosity, min severity, cooldown, crisis threshold), and the
  **outlet** (attrition).

**Simulation scope & visibility (independent of each other).** By default the migration simulation
runs over the **whole world** (every alive civilization, from the first turn), so migration
topology isn't biased by which civs you've explored, and a city you later conquer carries real
origin history in the ethnicity lens. (Set *Scope* to met-only to lighten per-turn cost on large
saves.) Independently, the dashboard and lens **mask** civilizations for **spoiler protection**, per
a shared **analytics-visibility policy**, the same four levels the **Demographics** mod exposes
(All / Met-only / Own-civ / Disabled), host-authoritative in multiplayer. The default is met-only,
so civilizations you haven't met are **calculated but never shown**; revealing them is opt-in (widen
the policy to All). So scope and on-screen visibility are decoupled: *simulate everything, reveal
selectively.*

The full default set lives in `emigration-config.js`; scaling constants are intentionally
**not** exposed (they must match Demographics).

---

## 11. Architecture / module map

Modules are small and single-concern (the repo enforces a <=500-line file gate), so several
systems span a parent plus split-out helpers.

- `ui/emigration-main.js`: Entry UIScript with per-turn hook/costs, event subscriptions,
  reporting/feedback orchestration, dev dock, and boot.
- `ui/emigration-config.js`: Tunable default values, `CONFIG_DEFAULTS` snapshot, and scaling
  constants.
- `ui/emigration-config-types.js`: `EmigrationConfig` typedef schema for `CONFIG`.
- `ui/emigration-causes.js`: the single source-of-truth migration-cause taxonomy (one
  `MigrationCause` typedef + `causeLabel` / `causePermanence` / `causeHint` / `isRefugeeCause`).
- `ui/emigration-tunables.js`: Declarative exposed knobs plus Low/Med/High presets.
- `ui/emigration-cities.js`: Enumerates met cities into `CitySignal` records.
- `ui/emigration-prosperity.js`: Prosperity scoring (legacy + shaped happiness +
  overcrowding) and `distress`.
- `ui/emigration-violence.js`: Violence state machine (accumulate/decay) plus siege
  tenure/escalation/cap.
- `ui/emigration-violence-signals.js`: Fog-independent polled combat signals
  (`district damage`, `pillage`).
- `ui/emigration-disasters.js`: Per-city disaster distress, decay, and plague-carry seeding.
- `ui/emigration-geography.js`: Distance decay, flee-from-invader, aggressor preference, and
  Open Borders flow bonus.
- `ui/emigration-civ-tuning.js`: Per-leader/civ tuning table and resolver.
- `ui/emigration-war.js`: Aggressor map from `DiplomacyDeclareWar`/`MakePeace`.
- `ui/emigration-borders.js`: Border-policy reads → `immigrationOpenness` (inbound) + `emigrationRetention` (outbound) multipliers, attraction yields, asylum flag.
- `ui/emigration-effects.js`: Assimilation cost load (+ leader variance) and congestion
  headwind.
- `ui/emigration-dividend.js`: Carried dividend attraction benefit per immigrant.
- `ui/emigration-migrant-units.js`: Per-turn penalty for unsettled `UNIT_MIGRANT` units.
- `ui/emigration-engine.js`: Main pass (ranking, pressure, move, and outlet).
- `ui/emigration-pull.js`: Destination decision (`adjustedPull`, `bestDestination`,
  `migrationCause`).
- `ui/emigration-state.js`: Engine-state persistence (pressure, cooldowns, scaling turn,
  per-owner populations).
- `ui/emigration-population.js`: Population reads/writes and Demographics scaling.
- `ui/emigration-migration-stats.js`: Per-civ tallies, the session-local recent-moves feed, and
  the `EmigrationData` global.
- `ui/emigration-city-readout-data.js`: the per-city "why is this settlement changing?" snapshot:
  a pure `buildCitySnapshot` view-model builder plus a recompute-on-read `citySnapshot(cityId)`.
- `ui/emigration-city-readout.js`: the on-demand per-city readout panel: a pure `readoutModel`
  plus a HUD-anchored DOM host (`showCityReadout` / `hideCityReadout`) and selection wiring.
- `ui/emigration-views.js`: the shared dashboard render core: pure view-model builders (civ
  ledger, per-cause breakdown, border stances, per-city pressure table) + `renderDashboard`.
- `ui/emigration-window.js`: the standalone dashboard window host: gathers world migration state
  (`gatherDashboard`) and mounts the render core (`emigration.window()` / `emigration.closeWindow()`).
- `ui/emigration-migration-page.js`: registers a dedicated Migration page on the Demographics
  screen via its `registerPanel` hook (order-independent; no-op if unsupported), mounting the
  shared render core.
- `ui/emigration-demographics.js`: Demographics graph registration (Net/Out/In/Refugees),
  incl. the per-cause source-attribution tooltips on the Emigration/Immigration graphs.
- `ui/emigration-demographics-per-cause-metrics.js`: optional, **not shipped/loaded**:
  an example that registers one line chart per cause (war/disaster/prosperity/unhappiness)
  for mods that want granular per-cause graphs instead of the tooltip breakdown.
- `ui/emigration-naming.js`: Rich event naming.
- `ui/emigration-feedback.js`: Styled toasts, world-news, and anti-spam throttling.
- `ui/emigration-report.js`: Renders `Migration` records into log lines.
- `ui/emigration-log.js`: Dev debug logging via `UI.log` CSS-parse channel.
- `ui/emigration-events.js`: `RandomEventOccurred` -> disaster distress + named alert.
- `ui/emigration-settings.js`: Number-display preference and tunable/preset getters/setters.
- `ui/emigration-options.js`: Registers presets and Advanced tunables under Mods options.
- `ui/options/emigration-advanced-editor.js`: Advanced tunables sub-window screen.
- `ui/options/mod-options.js`: Shared Mods category and cascade-safe `modSettings` store.
- `data/emigration-policies-{antiquity,exploration,modern}.xml`: Database components for
  stance policy cards/unlocks (one file per age).
- `data/emigration-policies-gameeffects.xml`: Database component for native
  `TraditionModifier` Influence/yield effects.
- `data/emigration-policy-icons.xml`: Icon database component for stance/attraction cards.
- `data/emigration-civilopedia.xml`: Database component for Emigration Civilopedia pages.
- `ui/migration-probe.js`: Dev-only API probe module (separate modinfo, not shipped).
- `text/<locale>/ModText.xml`: Localized strings for all 10 locales (generated; see §14).
- `scripts/i18n_extract.mjs` and `scripts/i18n_apply.mjs`: Dev-only localization pipeline.

`emigration.modinfo`'s ActionGroups: the options layer in **both** shell + game scopes, the
engine and its submodules (`ImportFiles`) in game scope, an always-on `<UpdateDatabase>` for
the Civilopedia pages + the policy `TraditionModifier`s, an `<UpdateIcons>` for the card art,
and **three age-scoped** `<UpdateDatabase>` groups for the border policies (one per age via
`AgeInUse` criteria). The per-age split is required: Civ VII rebuilds the gameplay database
each age, so a policy's civic-tree unlock can only reference nodes that exist in that age's
database (loading the Exploration/Modern unlocks into the Antiquity database is a foreign-key
failure). UI modules are ES imports resolved by path from the deployed file tree; the
`ImportFiles` list is kept a complete inventory of that tree and is gated by a manifest test
(`tests/modinfo.mjs`) so a future module split can't silently leave a file unlisted.

The Civilopedia component adds an **Emigration** section to the in-game encyclopedia with
an overview plus one page per system (Prosperity, War & Refugees, Assimilation, Borders &
Influence, Disasters & Plague, the Outlet, and Leaders & Civilizations, the per-civ tuning),
reusing the base `Concept` page layout. The stance policy cards get their own pedia pages
automatically from their
tradition Name/Description, so they aren't duplicated. All page text flows through the
same localization pipeline (§14): `LOC_PEDIA_EMIG_*` keys, all 10 locales.

---

## 12. Runtime behavior in game

The mod runs in the **UI VM** (GameFace JS) and applies migration, costs, and reporting during normal play, with behavior checks documented in companion validation notes:

- **`city.addRuralPopulation(±1)`**: the population move/removal. Not owner-gated → works
  cross-civ. (The only population write, which is why the outlet "kills" via the same
  channel as starvation.)
- **`Players.grantYield(pid, YIELD_X, ±n)`**: yield costs; not owner-gated, **negative
  deducts** (gold confirmed, cross-civ).
- **`DiplomacyTreasury.changeDiplomacyBalance(±n)`**: Influence write, confirmed cross-civ.
  (Superseded - border-policy Influence is now a native `TraditionModifier`, so the mod no
  longer writes Influence directly.)
- **War aggressor:** `DiplomacyDeclareWar` carries `actingPlayer` (declarer) +
  `reactingPlayer` (target).
- **Reads (fog-independent):** district health, `city.isInfected`,
  `Culture.getActiveTraditions` / `isTraditionActive`, `GameInfo.RandomEvents` (class/severity/name),
  `player.leaderType`/`civilizationType`, and a cheap per-civ population aggregate, all read
  for *all* players.
- **The happiness economy:** pop upkeep happiness `= 0`, `OVERCROWDING_THRESHOLD = 2`,
  `getYield === getNetYield` (net/post-penalty), the grounding for Algorithm B.

What the VM **cannot** do (and the mod doesn't): create units for *other* civs
(`CREATE_ELEMENT` is local-only), or raise a custom **notification type** without a DB entry
(so engine notifications are deferred; toasts + world-news cover feedback). The policy *cards*
are the one piece that needs the database; everything else is the direct-mutator surface.

---

## 13. Persistence

Per-game state lives in the `GameConfiguration` KV store (survives save/reload):

- `EmigrationState_v1`: per-source pressure, cooldowns, the monotonic scaling turn.
- `EmigrationViolence_v2`: per-city violence intensity + decay, and siege tenure / onset
  population / cumulative war-loss.
- `EmigrationDisaster_v1`: per-city disaster distress + decay.
- `EmigrationAssim_v1`: per-civ assimilation load + per-civ tick turn.
- `EmigrationWar_v1`: victim → aggressors map (Feature 1).
- `EmigrationMigStats_v1`: per-civ tallies: net, gross in/out, refugees, deaths, plus the
  per-cause emigration/immigration breakdowns and their graph-sample watermarks.
- `EmigrationNews_v1`: world-news announced-milestone tiers + the last-toast turn (anti-spam).

Options/settings persist separately in the shared `modSettings` localStorage key (never a
stray top-level key). Single-player scope (UI-VM gameplay writes are client-side).

---

## 14. Localization

All user-facing strings are LOC keys, **fully translated into all 10 locales** (en, de, es,
fr, it, ja, ko, pt, ru, zh), including the advanced tunable labels. The non-English files
are **generated, not hand-edited**:

```sh
node scripts/i18n_extract.mjs   # text/en_us/ModText.xml → i18n/i18n-source.json (key list)
node scripts/i18n_apply.mjs     # i18n/<locale>.json → text/<locale>/ModText.xml
```

Author English in `text/en_us/ModText.xml`; translations live in `i18n/<locale>.json`
(a missing key falls back to English). `npm run verify` includes a **parity gate**
(`tests/i18n.mjs`) that fails if any en_us key is absent from a locale, so nothing silently
drifts. `{1_…}` placeholders and code tokens (`UNIT_MIGRANT`, `Demographics`) are preserved
verbatim. (Machine-quality translations; a native-speaker review pass is welcome and is a
one-line re-apply.)

---

## 15. Install & run

1. Copy this folder to `~/Library/Application Support/Civilization VII/Mods/emigration/`,
   relaunch, and enable **Emigration** in *Additional Content*.
2. Play turns. With `const DBG = true` (dev default) the mod logs to `UI.log` via the
   CSS-parse channel (mod `console.log` doesn't reach the log files):
   ```
   grep -E "EMIG_" "~/Library/Application Support/Civilization VII/Logs/UI.log"
   ```
   `release.sh` flips `DBG` to `false`, so shipped builds run silently.
3. **Dev dock buttons** (subsystem dock): run a pass now / dump the prosperity ranking.
   Console: `emigration.runNow()`, `emigration.rank()`.
4. **Tune or disable the layers:** Options → Mods → Emigration - Advanced exposes every
   advanced-model switch (§5) and interactive system (§6: aggressor avoidance, border
   policies, disasters, the outlet), plus the notification mode. All default
   **on**; switch any off to walk back toward the bare baseline.

Look for `EMIGRATION … left … for …`, `assimilation: …` cost lines, and `ATTRITION … (no
refuge)` when the outlet fires.

---

## 16. Development

Typed JavaScript with JSDoc, no build step: what ships is what you write (see
[CONTRIBUTING.md](CONTRIBUTING.md)). Before committing:

```sh
npm install
npm run verify     # tsc --noEmit + eslint (0 warnings) + the node test harnesses
```

`verify` runs the modularization gate (file/function length / complexity / statements) and
**22** test harnesses: `causes` (cause taxonomy: labels, permanence, refugee routing),
`city-readout-data` (per-city snapshot view-model), `city-readout` (readout panel model),
`views` (dashboard render-core builders), `migration-page` (Demographics page handshake), `scaling`,
`prosperity` (shaped happiness + overcrowding + distress),
`geography`, `violence` (siege escalation + cap), `tunables`, `migration-stats` (gross /
refugees / deaths / per-cause / recent feed), `effects` (congestion + leader variance),
`engine-pull` (destination decision), `dividend` (carried-dividend grants), `civ-tuning`,
`war` (aggressor map + ordering), `disasters` (distress + decay + severity),
`borders` (openness + influence), `naming` (headline fallbacks),
`feedback` (anti-spam throttling),
`modinfo` (the `ImportFiles` manifest stays a complete, import-closed inventory), and `i18n`
(locale parity). `./release.sh` produces the debug-muted, allow-listed Workshop zip
(readable JS, no minification; `data/` and the 10 locales included, dev cruft excluded).

The **`migration-probe`** mod (its own modinfo, never shipped) is the in-engine verifier
behind the write-surface/data claims: dock buttons + a `globalThis.mig` console API, with
the **`API3`** (identity, specialist/overcrowding semantics, yield pre/post-penalty, per-civ
aggregate) and **`API4`** (influence write, government/policy reads, `isInfected`, RandomEvents,
notification surface) confirmation passes + passive `DiplomacyDeclareWar` / `RandomEventOccurred`
recorders.

---

## 17. Caveats & limits

- **Single-player.** UI-VM gameplay writes are client-side.
- **The advanced layers are on by default but un-playtested-at-scale.** Everything beyond the
  baseline is implemented and unit-tested, but the knob values are starting points to tune
  against real games, not balanced settings. Turn pieces off in Options (§5-§6) if a save hits
  balance trouble or you want the bare baseline.
- **Happiness cost is inferred.** Negative *gold* grants are probe-confirmed; negative
  *happiness* is inferred; set the happiness knobs to 0 if a build no-ops them (the
  congestion headwind, §5-C, is the gold-immune structural brake).
- **A few in-engine confirmations remain best-effort:** the policy cards' in-game
  slotting/unlock, whether disaster *plot-effects* are pollable per plot (we use `isInfected`,
  which is confirmed), and a longitudinal getYield pre/post-penalty check. The code degrades
  to a safe no-op where unconfirmed.
- **On-map floating indicators are deferred:** `WorldUI` exposes no floating-text method
  (only overlay/marker builders), so feedback uses toasts; a built overlay is a future add.
- **Engine notifications need a DB type:** the clickable end-turn notifications would need a
  `NotificationType` (a future addition alongside the policy data); toasts + world-news cover
  it for now.
- **No new game rules.** The mod composes existing engine writes; it can't invent effects or
  spawn units for the AI.

---

## 18. Compatibility & mod coexistence

The mod is built to share the game with others. Its only dependency is `base-standard`, and
it touches every shared surface *additively*:

- **Database: inserts only.** `data/emigration-policies-*.xml` and `data/emigration-civilopedia.xml`
  are pure `<Row>` inserts: no `<Replace>`, `<Update>`, or `<Delete>` against base or shared
  tables, so the mod can't overwrite another mod's content. New IDs are namespaced
  (`TRADITION_EMIG_*`, Civilopedia `SectionID="EMIGRATION"` / `PageGroupID="EMIG_TOPICS"`). The
  border-policy traditions attach to existing civic-tree nodes via additive
  `ProgressionTreeNodeUnlocks` rows without modifying the nodes, and the Civilopedia pages reuse
  the base `Concept` layout read-only.
- **Shared settings store, self-healing.** Options persist under the single community-convention
  `modSettings` localStorage key (§13), never a stray top-level key. Because GameFace's
  `localStorage` is shared across *every* mod, a stray top-level key silently clobbers that store
  and breaks settings for all installed mods, so on each save the store self-heals, preserving
  `modSettings` and dropping stray keys ([ui/options/mod-options.js](ui/options/mod-options.js)).
  With any mod that follows the convention (Demographics does) this is a no-op and they coexist in
  one object; the only time it touches another mod's storage is to clear a key that is already
  breaking the shared store for everyone.
- **Cooperative globals + events.** JS globals are namespaced (`globalThis.emigration`,
  `EmigrationData`). The Demographics integration uses an order-independent handshake
  (`globalThis.DemographicsMetricsAPI ??= {}`) that *joins* the metrics API rather than replacing
  it, with registration queued so load order doesn't matter. Engine events (`engine.on(…)`) are
  multicast, so subscribing to `PlayerTurnActivated` / `DiplomacyDeclareWar` /
  `RandomEventOccurred` never blocks another mod's handlers.
- **Defers to the Demographics namespace.** The war-popup refugees label and glossary are owned by
  the Demographics mod; Emigration adds only the one graph-title string it introduces
  (`LOC_DEMOGRAPHICS_WAR_GRAPHS_T_REFUGEES`), so there are no duplicate `LocalizedText` definitions.
- **Additive plot tooltip.** The Ethnic Composition per-tile breakdown is *appended* into the live
  plot tooltip's `.tooltip__content` via a `MutationObserver`, never replacing the tooltip. The
  base game's plot-tooltip registration (`registerPlotType` / `PlotTooltipPriority`) is winner-
  take-all (one registrant supplies the whole tooltip), so full-tooltip mods (bz-map-trix, TCS
  Improved Plot Tooltip) coordinate to avoid colliding. Injecting a node instead of registering a
  competing tooltip means Emigration stacks with whichever tooltip is active rather than fighting it.
- **Adaptive to other mods.** It reads *live* happiness / yields / Influence each turn, so a mod
  that rebalances those values is simply reflected in the Prosperity score, so effects compose rather
  than conflict. At the gameplay level it shares the world: if another mod also moves population or
  changes yields, the two stack without crashing or corrupting state. (The advanced layers default
  on; turn any off in Options, §5-§6, to coexist more conservatively.)

## Credits & license

Adapts the *Prosperity* data model from Machiavelli's "Emigration" mod for Civilization V.
MIT.

See [LICENSE](LICENSE).
