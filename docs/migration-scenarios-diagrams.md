# Emigration — Migration Scenario & System Diagrams

A standalone visual reference for how the mod actually works, drawn from the implementation
(`ui/emigration-*.js`). Two kinds of diagram:

- **System / process diagrams** (Part A) trace the real code paths: the per-turn pipeline, how
  pressure builds and a move fires, how a destination is chosen, how the transit queue and refugee
  holding pool work, where population dies, and the downstream systems (return, composition,
  integration, dividend, dilemma).
- **Migration flow diagrams** (Part B) show people moving between settlements/civs in named
  scenarios, with the mechanics that shape each flow.

Every threshold shown is a `CONFIG` default from [../ui/emigration-config.js](../ui/emigration-config.js)
(all are player-tunable in Options ▸ Mods ▸ Emigration). Companion docs:
[feature-improvements-plan.md](feature-improvements-plan.md),
[cultural-quarters-plan.md](cultural-quarters-plan.md). Note there are two distinct "quarter" systems:
the narrative quarter *phrasing* for Chronicle lines (§A10), and the cultural-quarter *district* feature
(§A13, a per-city-tile decision with yields and contested war-strain).

Legend:
- Rounded/box nodes are state or decision steps. `-->` is a taken transition; `-.->` is a
  blocked/suppressed/counterfactual branch.
- Numbers in parentheses are the controlling `CONFIG` default (e.g. `emigrationBar(30)`).

---

## Part A — System / process diagrams

### A1. Master per-turn pipeline

The whole pass runs on the local player's turn. Order is exact (from
[../ui/emigration-main.js](../ui/emigration-main.js) `onTurnActivated` → `doPass` and
[../ui/emigration-engine.js](../ui/emigration-engine.js) `runPass`).

```mermaid
flowchart TD
   HOOK["PlayerTurnActivated (engine hook)"] --> LOCAL{"local player AND<br/>turnInterval(1) elapsed?"}
   LOCAL -->|no| SKIP["skip this turn"]
   LOCAL -->|yes| REFRESH["applyTunableOverrides()<br/>re-read Options settings"]
   REFRESH --> RUN["runPass()"]

   subgraph RUNPASS["runPass() — one migration pass"]
      direction TB
      D1["tickViolence() — decay siege/assault"] --> D2["tickDisasters() — decay disaster intensity"]
      D2 --> D3["pollCrisis() — lock the active age-crisis for attribution"]
      D3 --> SIG["collectCitySignals() — pop, yields, distress, war/disaster per settlement"]
      SIG --> RANK["rankByProsperity() — sort candidates by pull score"]
      RANK --> LOAD["loadState() + prepareState() — pressure / cooldown / transit queue / monoTurn"]
      LOAD --> STANCE["bankStanceImpact() — counterfactual border delta (no mutation)"]
      STANCE --> INB["makeInboundCtx() — per-destination arrival+departure quota"]
      INB --> ARR["processArrivals() — land due transit; defer or die (A6)"]
      ARR --> POOLS["settleRefugeePools() — gradual holding-pool settlement (A6)"]
      POOLS --> DEP["processDepartures() — per source: split tracks + attrition (A2)"]
      DEP --> SAVE["saveState() + saveRefugeePools()"]
   end

   RUN --> POST["post-pass accounting (doPass)"]
   subgraph POSTPASS["accounting + reporting"]
      direction TB
      P1["foldReturns() — homeland pull-back (A8)"] --> P2["accountLosses() — external pop loss (A7)"]
      P2 --> P3["recordCompositionPass() — ethnic mix + capture detect (A9)"]
      P3 --> P4["recordChroniclePass() — diaspora milestones (A10)"]
      P4 --> P5["maybeDilemma() — conquest/plague choice (A11)"]
      P5 --> P6["appendConquests() — conquest absorption records"]
      P6 --> P7["recordMigrations() — timeline snapshot (runs every turn)"]
      P7 --> P8["reportNewsworthy() — toasts + Notifications log"]
   end

   POST --> COSTS["chargePerTurnCosts() — on EVERY civ's turn"]
   subgraph PERCIV["per-civ upkeep"]
      direction TB
      C1["tickAssimilation() — load decay + gold/happiness drain (A12)"] --> C2["applyMigrantHoldingPenalty()"]
      C2 --> C3["tickAttractionDividend() — grant + decay dividend pool (A11)"]
   end
```

### A2. Departure state machine (pressure → bar → move)

Each ranked source is processed in prosperity order. With `splitTracksEnabled(true)` a settlement
runs a **voluntary** track and a **crisis** track concurrently, each with its own budget
(`splitBudgetsEnabled(true)`) — plus the attrition outlet (A7).

```mermaid
flowchart TD
   START["source city (ranked order)"] --> CEIL["per-civ ceilings this turn:<br/>voluntary = maxMovesPerTurn(8) + cities × movesPerCity(1)<br/>crisis = crisis-cities × movesPerSiege(2)"]
   CEIL --> SPLIT{"splitTracksEnabled?"}
   SPLIT -->|no| LEG["legacy single-cause track<br/>(one pressure/cooldown, cause = migrationCause)"]
   SPLIT -->|yes| TWO["two concurrent tracks"]

   TWO --> CR["CRISIS track — if inCrisis(src):<br/>siege OR violence ≥ 2 OR disaster ≥ 2<br/>sheds up to crisis budget this turn<br/>(warSurgeMax 3 rural/turn, siegeLossCapPct 0.6 of onset pop)<br/>cause = disaster else war — fires immediately (no bar)"]
   TWO --> VO["VOLUNTARY track — accumulate pressure toward emigrationBar(30);<br/>fire one point when crossed, then rest cooldownTurns(8)<br/>cause = unhappiness (happiness < 0) else prosperity"]

   CR --> CAP["per-city guardrails:<br/>maxLossPerCityPerTurn(2), keep minRuralToEmigrate(1)"]
   VO --> CAP
   LEG --> CAP
   CAP --> DEST["pick destination (A4)"]
   DEST --> MOVE["applyOneMove() per point (A5)"]
```

### A3. Cause determination (why people leave)

One cause per move, chosen by priority (`migrationCause` in
[../ui/emigration-pull.js](../ui/emigration-pull.js); with split tracks the crisis/voluntary split
mirrors this). Crisis causes (`war`, `disaster`, `conquest`) are *refugee* movement; `unhappiness`
and `prosperity` are *voluntary*; `attrition` (A7) and `return` (A8) are separate outlets.

```mermaid
flowchart TD
   S["source signal"] --> A{"disaster ≥ disasterFleeThreshold(2)?"}
   A -->|yes| DIS["cause = disaster (refugee / crisis)"]
   A -->|no| B{"violence ≥ violenceFleeThreshold(2)?"}
   B -->|yes| WAR["cause = war (refugee / crisis)"]
   B -->|no| C{"happiness < unhappyCauseThreshold(0)?"}
   C -->|yes| UNH["cause = unhappiness (voluntary / push)"]
   C -->|no| PRO["cause = prosperity (voluntary / pull)"]
```

### A4. Destination selection (where they go)

`bestDestination` scores every candidate as `(gradient + tilt − friction) × permeability` and picks
the max. A candidate is dropped the moment any hard gate fails.

```mermaid
flowchart TD
   SRC["source + prosperity-ranked candidates"] --> LOOP["for each candidate"]
   LOOP --> G1{"candidate is the source?"}
   G1 -->|yes| SKIP["reject candidate"]
   G1 -->|no| GRAD["pull = (dest.prosperity − src.prosperity)<br/>+ tilt (clamped ±tiltCap 14):<br/>asylum push (asylumPushWeight 3), active raid (raidTilt 10)"]
   GRAD --> G2{"pull ≤ 0?"}
   G2 -->|yes| SKIP
   G2 -->|no| G3{"cross-civ move?"}
   G3 -->|"yes, but crossCivEnabled = false"| SKIP
   G3 -->|otherwise| FRIC["subtract friction:<br/>baseReluctance(4) + perExtraPop(0.5) × excess pop<br/>+ cityStateBarrier(5) if a city-state is involved<br/>+ cross-civ block: poachBlock(12), OR refugee escape bonus(+14) in a crisis<br/>+ anti-snowball dominance (dest civ > 1.25× field average)<br/>+ distanceFactor(0.6)/hex; war refugees: aggressorPenalty(12), own-civ bonus(1), directional flee(6)<br/>+ congestion (congestWeight 4 × dest per-capita assimilation load)"]
   FRIC --> PERM["× permeability, clamped [permeFloor 0.2 .. permeCeil 4.0]:<br/>dest openness × source retention<br/>× openBorders(1.4) × ally(1.3) × atWar(0.6)"]
   PERM --> G4{"final pull ≤ 0?"}
   G4 -->|yes| SKIP
   G4 -->|no| KEEP["track as current best"]
   KEEP --> PICK["choose the highest-pull destination (or none)"]
```

Border openness (`bordersEnabled(true)`): Closed Borders cut a civ's immigration to
`closedBordersOpenness(0.4)` and keep `closedBordersRetention(0.6)` of its own would-be emigrants
home; Open Borders lift immigration pull to `openBordersOpenness(1.5)`. Unmet civs are still
simulated (`requireMet false`); hiding them is a UI-only concern (governance), not a routing gate.

### A5. Applying one move (per rural point)

```mermaid
flowchart TD
   M["applyOneMove()"] --> SC["marginalPeople() — points → people (era-scaled)"]
   SC --> EK["eventKeyForMove() — attribute the driving crisis"]
   EK --> CSRC["consumeSourcePoint() — draw from refugee pool if crisis + pool, else removeRural()"]
   CSRC --> OK{"source could give up a point?<br/>(respects minRuralToEmigrate)"}
   OK -->|no| ABORT["abort move (not a death)"]
   OK -->|yes| LAG["transitLag(): 0 if transitLagTurns ≤ 0,<br/>else round(hexDistance / transitHexPerTurn); refugees forced ≥ 1 (camps)"]
   LAG --> BR{"lag ≤ 0?"}
   BR -->|"yes — immediate"| IMM["commitImmediateArrival():<br/>settle now (refugeeImmediateSettlePct 0.2) or route to holding pool<br/>applyArrivalConsequences() (assimilation, yields)"]
   BR -->|"no — lagged"| ENQ["enqueueLaggedDeparture():<br/>push to transit queue, arriveTurn = monoTurn + lag<br/>applyDepartureConsequences() (morale, disorder)"]
   IMM --> UPD["applyMoveToRanking() — src −1, dest +1 (so later picks this pass see it)"]
   ENQ --> UPD
```

### A6. Migration queues

**Transit queue** — lagged moves in flight. Landed each pass by `processArrivals()` (longest-waiting
first, for fairness). This is a source of deaths (see A7).

```mermaid
flowchart TD
   T0["departure enqueued<br/>arriveTurn = monoTurn + lag"] --> T1["each pass: land entries with arriveTurn ≤ monoTurn"]
   T1 --> T2{"destination still exists?"}
   T2 -->|"no — razed / captured"| TD["DEATH in transit"]
   T2 -->|yes| T3{"destination at inbound cap this turn?"}
   T3 -->|no| T6["settle now, or route to holding pool"]
   T3 -->|yes| T4{"defers < MAX_DEFERS(4)?"}
   T4 -->|yes| T5["defer one turn (stays queued)"]
   T4 -->|no| TD2["DEATH — perished waiting"]
   T5 --> T1
```

**Refugee holding pool** — per host city, when `refugeePoolEnabled(true)`. Arrivals that don't settle
immediately wait here, then trickle into the city as capacity allows.

```mermaid
flowchart TD
   Q0["arrival routed to the pool<br/>(refugeeImmediateSettlePct 0.2 settle on the spot)"] --> Q1["held at least refugeePoolMinHoldTurns(2)"]
   Q1 --> Q2["settleRefugeePools() each pass builds a budget:<br/>base settlePerCityPerTurn(1)<br/>× happyScale(1.25) or unhappyScale(0.6)<br/>× border openness − overcrowdPenalty(0.25) per urban-over-threshold"]
   Q2 --> Q3["move budgeted points from pool → host rural population"]
   Q3 --> Q4{"pool still holds refugees?"}
   Q4 -->|yes| Q1
```

### A7. Deaths (population that leaves the world)

Not every departure relocates — some people die. Death paths:

```mermaid
flowchart TD
   subgraph WHERE["death paths"]
      direction TB
      A["ATTRITION OUTLET — processOutletDeath()<br/>distress ≥ attritionMinDistress(40) AND no viable refuge"]
      B["TRANSIT — destination razed/captured before arrival (A6)"]
      C["TRANSIT — deferred past MAX_DEFERS(4) at a full destination (A6)"]
      D["EXTERNAL LOSS — starvation / plague / razing, tallied by accountLosses()<br/>(attributed to the civ, not relocated)"]
   end
```

**Attrition outlet + death-ramp onset.** When a settlement is in lethal distress and has nowhere to
flee, deaths accrue as *pressure* and fire one point at a time — but the onset is smoothed so a fresh
crisis is never instantly devastating.

```mermaid
flowchart TD
   R0["lethal crisis this pass (trapped: distress ≥ 40, no refuge)"] --> R1["crisisTenure++ (sustained turns)"]
   R1 --> R2["deathRamp(tenure): ramps deathRampFloor(0.25) → 1.0 over deathRampTurns(6)"]
   R2 --> R3["severity = distress/floor (cap crisisSeverityCap 6)<br/>+ aggressor count + combat losses (cap crisisCombatMax 4)"]
   R3 --> R4["death pressure += pow(distress, deltaExponent 0.5)<br/>× crisisDeathShare(0.2) × severity × deathRamp"]
   R4 --> R5{"pressure ≥ attritionThreshold(40)?"}
   R5 -->|yes| R6["remove one rural point (cause = attrition); reset pressure"]
   R5 -->|no| R7["carry pressure to next pass"]
   R6 --> R8{"distress still ≥ floor next pass?"}
   R7 --> R8
   R8 -->|yes| R1
   R8 -->|no| R9["death pressure decays; crisisTenure resets (onset re-smooths next time)"]
```

### A8. Return migration (homeland pull-back)

`planReturns()` in [../ui/emigration-return.js](../ui/emigration-return.js). A recovered, peaceful
homeland draws its diaspora back — real population moves from the host city to a homeland city. It is
naturally suppressed during crises because the homeland must be prospering and at peace.

```mermaid
flowchart TD
   RS["each pass: planReturns(signals) (returnEnabled true)"] --> RH["homelands 'faring well' (prospering set), at peace with the host"]
   RH --> RD["for each host city: its largest foreign diaspora"]
   RD --> RG{"share ≥ returnMinShare(0.08)<br/>AND host holds ≥ returnMinPoints(3) of that origin?"}
   RG -->|no| RSKIP["no return"]
   RG -->|yes| RW{"deterministic returnRoll < returnRate(0.06)?"}
   RW -->|no| RSKIP
   RW -->|yes| RC{"≥ returnCooldownTurns(6) since last return here<br/>AND homeland not at war?"}
   RC -->|no| RSKIP
   RC -->|yes| RM["move one point host → homeland city<br/>(undo if the homeland can't take it)<br/>cause = return; credits the returning origin bucket"]
```

### A9. Composition + integration (who lives where)

`recordCompositionPass()` in [../ui/emigration-composition.js](../ui/emigration-composition.js)
keeps per-city origin buckets (keyed by center plot, stable across conquest).

```mermaid
flowchart TD
   CP["recordCompositionPass()"] --> CS["seedCities(): first sight = 100% owner;<br/>a conquered city flips owner but KEEPS its origin buckets → capture detected"]
   CS --> CM["apply this pass's migrations:<br/>source loses proportionally (or a named origin on a return)<br/>destination gains the source-owner's origin (or originCiv on a return)"]
   CM --> CR["reconcileCity(): births → owner's origin; losses removed proportionally;<br/>normalize to real population, prune dust (< 0.05)"]
   CR --> CI["integratePass(): each foreign origin drifts toward the owner's identity"]
   CI --> RATE["per-turn rate: integrationRate(0.03) base<br/>→ integrationWarRate(0.0) while at war with that origin's civ<br/>→ integrationUnrestRate(0.008) while the host is in unrest"]
   CI --> PRUNE["prune settlements unseen for 50 turns (razed/gone)"]
```

### A10. Diaspora milestones + narrative quarters

Chronicle "founding" lines fire as a foreign community grows. The **self-origin safeguard** means a
city's own founding stock never triggers a "diaspora" line. "Quarters" *here* are truthful location
*phrases* drawn from the city's real map features ([../ui/emigration-quarter-phrases.js](../ui/emigration-quarter-phrases.js)),
not a game mechanic. The actual district feature (a per-tile decision with yields and contested
war-strain) is separate; see §A13.

```mermaid
flowchart TD
   DF["detectFoundingForCity()"] --> LF["leadForeignOrigin() — largest NON-owner origin"]
   LF --> SELF{"lead origin == host owner?"}
   SELF -->|yes| NOQ["no founding event (self-origin safeguard; narrative only)"]
   SELF -->|no| MIN{"foreign share ≥ DIASPORA_MIN(0.15)<br/>AND host has been met?"}
   MIN -->|no| NOQ
   MIN -->|yes| TIER["tier = floor(share / DIASPORA_STEP 0.15) → 15% / 30% / 45% ..."]
   TIER --> DEDUP{"a new tier was crossed?<br/>(deduped per city + origin + tier)"}
   DEDUP -->|no| NOQ
   DEDUP -->|yes| CHRON["chronicle a founding line, placed by a real city feature<br/>(coast → river → mountain → granary → temple → market → walls,<br/>else a generic 'edge of the city' phrase)"]
```

A separate detector logs **exoduses**: a war/disaster/conquest/attrition wave of ≥ 70,000 scaled
people from one settlement in a pass (one entry per 8-turn bucket per settlement + cause).

### A11. Dividend and dilemma

**Attraction dividend** — a decaying per-immigrant yield bonus for civs running an Attraction card
([../ui/emigration-dividend.js](../ui/emigration-dividend.js)).

```mermaid
flowchart TD
   DV0["immigrant settles in a civ holding an Attraction card"] --> DV1["pool[owner:yield] += dividendPerMigrant(1.5)<br/>yields: science / culture / gold"]
   DV1 --> DV2["tickAttractionDividend() each turn:<br/>pool ×= dividendDecay(0.7)^turns-elapsed"]
   DV2 --> DV3["grant min(pool, dividendCap 12) in that yield"]
   DV3 --> DV4{"pool < 0.05?"}
   DV4 -->|yes| DV5["drop the entry"]
   DV4 -->|no| DV2
```

**Refugee dilemma** — a rare modal choice ([../ui/emigration-dilemma.js](../ui/emigration-dilemma.js)),
throttled hard so it stays special.

```mermaid
flowchart TD
   DL0["maybeDilemma() (if enabled)"] --> DL1{"throttle OK?<br/>≤ dilemmaMaxPerAge(2) this age AND ≥ dilemmaCooldownTurns(18) since last"}
   DL1 -->|no| DLN["no dilemma"]
   DL1 -->|yes| DL2{"trigger present?"}
   DL2 -->|"conquest spree: ≥ dilemmaSpreeCaptures(3) captures in dilemmaWindowTurns(10)"| DLP["offer the choice"]
   DL2 -->|"plague: active disaster + a wave ≥ 2 points"| DLP
   DL2 -->|none| DLN
   DLP --> W["Welcome: −gold(30), −happiness(10), settle 1 point in the largest city"]
   DLP --> F["Frontier: −gold(15), settle 1 point in the smallest city"]
   DLP --> AW["Turn away: −influence(20)"]
```

### A12. Assimilation cost (the receiving-side price)

Absorbing migrants is not free — the destination civ carries a decaying *load* that drains yields and
softens further pull ([../ui/emigration-effects.js](../ui/emigration-effects.js)).

```mermaid
flowchart TD
   AS0["a migrant settles in the destination civ"] --> AS1["load += assimilationLoadPerMigrant(1.0)<br/>+ overcrowding assimilationCostPerPop(0.05) per destination pop point"]
   AS1 --> AS2["tickAssimilation() each of that civ's turns:<br/>drain gold assimilationGold(1.5) × load (wealth-scaled)<br/>drain happiness assimilationHappiness(0.5) × load"]
   AS2 --> AS3["load ×= assimilationDecay(0.7) (≈ 6–8 turns to fade)"]
   AS3 --> AS4["load also lowers this civ's pull via congestion (A4)"]
```

### A13. Cultural quarters (the district feature)

Distinct from the narrative phrasing in §A10: when an established foreign diaspora reads as a "quarter"
in one of the local player's cities, the mod offers a one-time stance choice and tracks a durable
per-city-tile district ([../ui/emigration-quarter.js](../ui/emigration-quarter.js), state in
[../ui/emigration-quarter-state.js](../ui/emigration-quarter-state.js)). Gated by `quartersEnabled`,
throttled by `quarterCapPerAge(3)` + `quarterCooldownTurns(12)`, and ranked below the refugee dilemma
so two modals never race. It assumes no callable native-revolt trigger; war just makes a quarter
"contested".

```mermaid
flowchart TD
   Q0["each pass: maybeQuarter(signals, dilemmaFired)"] --> QG{"quartersEnabled AND no dilemma this pass AND throttle OK?"}
   QG -->|no| QSKIP["wait for a later pass"]
   QG -->|yes| QE{"a host city has an established foreign quarter?<br/>(diaspora mass over the founding threshold)"}
   QE -->|no| QSKIP
   QE -->|yes| QM["offer the 'Cultural Quarter' modal: embrace / tax / let be"]
   QM --> QY["apply one-time yields: +quarterRewardAmount(40) benefit, −quarterDrawbackAmount(20) drawback<br/>('let be' applies neither); record the quarter on the city-centre tile"]
   QY --> QH{"later: a DIFFERENT origin overtakes the tile?"}
   QH -->|yes| QR["reverse the prior stance's yields exactly, replace the record<br/>(Chronicle: 'The Quarter Changes Hands') — one quarter per tile, no stacking"]
   QH -->|no| QHOLD["quarter persists"]
```

```mermaid
flowchart TD
   C0["tickContestedQuarters() each pass"] --> C1{"host at war with a quarter's homeland?"}
   C1 -->|no| C2["quarter calm"]
   C1 -->|yes| C3["quarter 'contested': happiness strain contestedQuarterPenalty per quarter,<br/>capped per host by diasporaWarStrainCap; Chronicle: 'A Quarter Grows Restless'"]
   C3 --> C4{"war ends?"}
   C4 -->|yes| C2
   C4 -->|no| C3
```

---

## Part B — Migration flow diagrams (people movement)

Flow legend: `-->` active flow this turn; `-.->` blocked/suppressed/weak route; edge labels name the
dominant cause and the mechanic behind it.

### B1. Baseline topology

Internal (same-civ) moves are cheapest; cross-border moves are candidates that must clear the pull
gates in A4.

```mermaid
flowchart LR
   subgraph CIVA["Civ A"]
      ACity["A City"]
      ATown["A Town"]
   end
   subgraph CIVB["Civ B"]
      BCity["B City"]
      BTown["B Town"]
   end
   ATown -->|"internal move (no cross-civ friction)"| ACity
   BTown -->|"internal move"| BCity
   ACity -.->|"cross-border candidate (pays poachBlock 12, permeability)"| BCity
   BCity -.->|"cross-border candidate"| ACity
```

### B2. Prosperity / unhappiness (voluntary)

Voluntary movers accumulate pressure to `emigrationBar(30)`, then fire and rest `cooldownTurns(8)`.
Direction follows the prosperity gradient after friction; a small reverse trickle is normal.

```mermaid
flowchart LR
   subgraph CIVA["Civ A"]
      ACity["A City — low pressure"]
      ATown["A Town — unhappy / overcrowded"]
   end
   subgraph CIVB["Civ B"]
      BCity["B City — high prosperity pull"]
      BTown["B Town — moderate pull"]
   end
   ATown -->|"unhappiness (push)"| BCity
   ACity -->|"prosperity (pull)"| BTown
   BTown -.->|"weak reverse trickle (gradient nearly flat)"| ACity
```

### B3. War / disaster (crisis)

There is **no scripted wave router** — the "defender first, then neighbors" pattern *emerges* from
destination ranking (A4): war refugees get an own-civ bonus (`ownCivRefugeeBonus 1`), avoid the
aggressor (`aggressorPenalty 12`), take a directional flee bonus away from the front
(`fleeFactor 6`), and pay no cross-civ block (`crisisEscapeBonus +14`). Per-turn shedding is capped
(`warSurgeMax 3`, `siegeLossCapPct 0.6`), so a crisis spreads population over several turns.

```mermaid
flowchart LR
   subgraph CIVD["Civ D (aggressor)"]
      DArmy["D Army — frontline"]
   end
   subgraph CIVA["Civ A (defender)"]
      ACity["A City — under siege/conquest"]
      AHinter["A Hinterland — safer interior"]
   end
   subgraph CIVB["Civ B (nearest open host)"]
      BCity["B City"]
   end
   subgraph CIVC["Civ C (further safe host)"]
      CCity["C City"]
   end
   DArmy -->|"siege raises A City violence/distress"| ACity
   ACity -->|"1) own-civ bonus → interior first"| AHinter
   ACity -->|"2) crisis escape (+14), flee vector → nearest open host"| BCity
   AHinter -->|"3) overflow to the next-best host"| CCity
   ACity -.->|"aggressor avoided (−12)"| DArmy
   BCity -.->|"return suppressed while the homeland is in crisis (A8)"| ACity
```

Trapped population (no viable host, distress ≥ 40) does not relocate — it dies through the attrition
outlet with a smoothed onset (A7). A conquered city keeps its residents' origins; the conqueror
absorbs the surviving population (`conquestMigrationEnabled`), while a share of rural pop
(`refugeesPercent 50`) flees as refugees.

### B4. Return migration (homeland pull-back)

```mermaid
flowchart LR
   subgraph HOSTS["Host side"]
      BCity["B City — foreign diaspora present"]
      BTown["B Town — foreign diaspora present"]
   end
   subgraph HOME["Recovered homeland (Civ A) — prospering, at peace"]
      ACity["A City"]
      ATown["A Town"]
   end
   BCity -->|"return wave (share ≥ 0.08, ≥ 3 pts, rate 0.06)"| ACity
   BTown -->|"return wave"| ATown
   BCity -.->|"residual stayers remain (integrating toward host)"| BTown
```

### B5. Policy-gated reroute (borders)

Closed/anti-immigration borders throttle a route (permeability floor `0.2`, openness `0.4`); movers
reroute to an open/pro civ (`openBordersOpenness 1.5`, `permOpenBorders 1.4`).

```mermaid
flowchart LR
   subgraph CIVA["Civ A (source)"]
      ACity["A City"]
      ATown["A Town"]
   end
   subgraph CIVB["Civ B (Closed Borders)"]
      BCity["B City"]
   end
   subgraph CIVC["Civ C (Open Borders)"]
      CCity["C City"]
   end
   ACity -.->|"throttled by low permeability (openness 0.4)"| BCity
   ATown -.->|"emigration retained at home (retention 0.6)"| BCity
   ACity -->|"reroute: prosperity + open-border pull"| CCity
   ATown -->|"reroute"| CCity
```

### B6. Competitive hub (anti-snowball)

Several sources feed one attractive civ; as that civ grows past `1.25×` the field average, the
anti-snowball penalty and congestion (rising assimilation load) bend later movers toward its towns or
elsewhere, so no single magnet runs away with the world.

```mermaid
flowchart LR
   subgraph SRC["Sources"]
      ACity["A City"]
      CCity["C City"]
      DTown["D Town"]
   end
   subgraph HUB["Civ B hub"]
      BCity["B City — high pull"]
      BTown["B Town — spillover"]
   end
   ACity -->|"prosperity"| BCity
   CCity -->|"war (crisis escape)"| BCity
   DTown -->|"unhappiness"| BTown
   BCity -.->|"anti-snowball + congestion (assimilation load) redirect"| BTown
```
