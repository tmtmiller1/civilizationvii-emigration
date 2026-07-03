# Emigration — Migration System Enhancement Plan

A prioritized plan for enhancing the migration simulation, derived from a design critique of the
system diagrams ([migration-scenarios-diagrams.md](migration-scenarios-diagrams.md)). It is a
proposal for review, not a committed work order. Each item states the problem, the proposed change,
the files/config it touches, the risk, and how it would be tested.

## Guiding principles (from the critique)

- **Do not simplify the core model.** The voluntary/crisis split, transit queue, holding pool,
  attrition ramp, return, composition/integration, and narrative layers are the strength. Enhance
  around them.
- **Legibility before more mechanics.** The biggest risk is *invisible sophistication* — outcomes
  that are correct but feel arbitrary. The highest-value work is explaining *why* a movement or death
  happened, not adding new systems.
- **Never expose gamey internals in player text.** "anti-snowball penalty" → "crowded destination".
- **Fairness at the edges.** Deaths and reroutes should read as earned, not as hidden punishment.

## Already handled (so we don't re-propose it)

- Depopulation guardrails: `maxLossPerCityPerTurn(2)`, `minRuralToEmigrate(1)`, `warSurgeMax(3)`,
  `siegeLossCapPct(0.6)` (diagram A2).
- Smoothed death onset: `deathRamp` (A7) — deaths ramp `deathRampFloor(0.25) → 1.0` over
  `deathRampTurns(6)`; no instant mass-loss.
- Return conservatism: share/points thresholds + `returnCooldownTurns(6)` prevent ping-pong (A8).
- Composition stability across conquest; war/unrest slow integration (A9).
- Base city readout already names the dominant cause, the pull target, assimilation cost, origins,
  net trend (sparkline), and a "trapped with nowhere to flee" warning
  ([../ui/emigration-city-readout.js](../ui/emigration-city-readout.js)).

The gap is **per-move / per-death reason tags** and a few **edge-case fairness + exploit** fixes.

---

## Priority 0 — Legibility layer (highest value, lowest risk)

### P0.1 Per-movement reason tags — ✅ IMPLEMENTED
Shipped: stable reason-tag vocabulary in `emigration-move-reasons.js`; truthful derivation in
`emigration-pull.js` `deriveMoveReasons` (mirrors the scorer's terms), carried on the migration
record (move/depart/arrive) and surfaced in the per-city readout ("Why there: …"), the loss digest
toast/summary ("Drawn there: …"), and the Notifications log detail ("Why there"). Localized across all
12 locales. Tests: `tests/move-reasons.mjs` (+ readout assertion). The aggregated network/flow
diagrams were intentionally left out (an edge aggregates many moves with differing reasons).
- **Problem.** A player sees people leave and can't tell if it was happiness, war, gradient, borders,
  congestion, or capacity. The routing formula (A4) has ~12 interacting terms.
- **Change.** In `bestDestination` / `adjustedPull` ([../ui/emigration-pull.js](../ui/emigration-pull.js)),
  capture the 2–4 dominant signed terms for the *winning* candidate and return them as a small
  `reasons` array of stable tag keys, e.g. `safer-interior`, `open-borders`, `nearby-refuge`,
  `blocked-closed-borders`, `crowded-destination`, `aggressor-avoided`, `no-viable-refuge`. Thread
  the tags onto the migration record (already flows through the pipeline) and surface them in the
  notification/feedback line and the city readout.
- **Files.** `emigration-pull.js` (emit tags), `emigration-feedback.js` /
  `emigration-notifications.js` (render), `emigration-city-readout*.js` (per-city "why here" line),
  LOC keys in `text/en_us/ModText.xml` + 11 translations.
- **Config.** none (or `moveReasonTags: true` kill switch).
- **Risk.** Low — additive, no simulation change. Keep tag text non-gamey.
- **Test.** Pure test: given a crafted candidate set, assert the expected tag set (e.g. closed-border
  destination yields `blocked-closed-borders`; a crowded rich civ yields `crowded-destination`).

### P0.2 Attrition "why" line — ✅ IMPLEMENTED
Shipped: death records carry `deriveDeathReasons` (crisis type — siege/under-attack/disaster/famine —
plus trapped vs lost-while-fleeing); shown on the death digest ("The cause: …") and appended to the
city-readout warning ("At risk: trapped with nowhere to flee (siege, famine)"). Tests in
`tests/move-reasons.mjs`.
- **Problem.** Deaths currently show "trapped with nowhere to flee" but not the contributing factors.
- **Change.** Extend the attrition path (A7, `processOutletDeath`) to record the top contributors
  (siege / closed routes / destination capacity exhausted / distance) and show them on the death
  feedback and readout warning.
- **Files.** `emigration-engine.js` (attach reasons to the death record),
  `emigration-city-readout.js`, feedback + LOC.
- **Risk.** Low. **Test.** Assert the reason set for a besieged, refuge-less source.

### P0.3 Voluntary-pressure cue — ✅ IMPLEMENTED
Shipped: the engine collects sources crossing `voluntaryCueFraction(0.66)` of the bar without firing
(`takePressureCues`); `reportPressureCues` logs a low-key Notifications entry ("Rising emigration
pressure: citizens in X are increasingly drawn to Y") for the local player only, throttled per source
by `voluntaryCueCooldownTurns(12)`, no HUD toast. Tests in `tests/pressure-cue.mjs`.
- **Problem.** Voluntary migration (bar 30, cooldown 8) is far slower than crisis movement and can
  feel invisible between fires.
- **Change.** When a source crosses a fraction of the bar (proposed `voluntaryCueFraction(0.66)`)
  without firing, emit a low-key trend cue ("rising emigration pressure: citizens in X are drawn to
  Y") — throttled, one per source per long window. The sparkline (Feature E) already covers the
  per-city trend; this adds the *pre-move* signal.
- **Files.** `emigration-engine.js` (detect crossing), `emigration-narrative.js` /
  `emigration-feedback.js`, LOC.
- **Config.** `voluntaryCueFraction`, plus a cooldown to prevent spam.
- **Risk.** Low–medium (notification spam if under-throttled). **Test.** Cue fires once per window,
  suppressed after a real move.

### P0.4 Telemetry counters (supports all tiers) — ✅ IMPLEMENTED
Shipped: session-scoped counters in `emigration-telemetry.js` (`recordPassCounters` / `telemetryCounters`),
split so the measure-before-build calls below are decidable, not lumped:
- voluntary vs crisis moves, with crisis split **own-civ vs cross-civ** (P2.2 internationalization);
- outlet attrition deaths split **trapped (no-refuge) vs lost-while-fleeing** (P2.1 cliff frequency);
- transit deaths split **razed-en-route vs perished-at-cap** (only "capped" is what P1.1 could save),
  tallied at resolution in `emigration-arrivals.js` (`bumpTransitDeath`);
- **arrived-into-crisis** (P1.2: refugees landing in a city that turned unsafe mid-journey).

Deepened with evaluation metrics beyond the plan-decision splits:
- **pass denominator + zero-move passes** → rates, and "is the system inert" (bar too high);
- **overall cross-civ move share** → is the world interconnected (the diaspora/composition stack needs it);
- **return moves** → is homecoming inert (return thresholds too strict);
- **refugee-pool inflow/outflow** (queued vs settled, net backlog) → is the holding pool draining or backing up;
- **reason histogram** → which of the destination-scoring terms actually drive moves (the best single
  tuning signal for the ~12-term pull formula).

A `COUNTERS …` line is emitted to the debug log on the throttled cadence, and the full set (counters +
reason histogram + derived shares: voluntary/cross-civ share, deaths-per-100-moves, pool backlog,
zero-move-pass %) is dumpable on demand via the `emigration.metrics()` console command. Tests in
`tests/telemetry-counters.mjs`. The reroute-success and closed-border-retained counters are reserved
for their P1 features. **Measure-first:** read these over a few playthroughs before building any P1/P2
item; several may be retired if their counter stays near zero.
- **Change.** Add counters to [../ui/emigration-telemetry.js](../ui/emigration-telemetry.js):
  voluntary vs crisis move share, transit deaths by cause, attrition deaths, reroute
  successes/failures (P1), closed-border retained count (P1). These make the balance-knob tuning
  below measurable rather than guessed.
- **Risk.** Low. **Test.** Counters increment on the corresponding events.

---

## Priority 1 — Fairness & exploit fixes

### P1.1 Reroute-before-death on transit deferral
- **Problem.** "Perished waiting" after `MAX_DEFERS(4)` at a merely *temporarily* full destination
  feels arbitrary (A6, transit queue).
- **Change.** Before charging the death, attempt **one reroute** to the next-best viable host
  (reuse `bestDestination` with the failed destination excluded). Only if none exists does the point
  die. New flow: `arrival due → dest full → defer up to MAX_DEFERS → reroute once → else death`.
- **Files.** [../ui/emigration-arrivals.js](../ui/emigration-arrivals.js), `emigration-pull.js`
  (excluded-candidate variant), `emigration-inbound.js` (capacity check).
- **Config.** `rerouteOnDeferFail: true`.
- **Risk.** Medium — must not create infinite reroute churn (cap at one attempt; the rerouted point
  re-enters transit with a fresh, bounded lag).
- **Test.** A capped destination + one open alternative → point reroutes and survives; no alternative
  → death (unchanged).

### P1.2 Arrival safety revalidation (edge case E1)
- **Problem.** A destination safe at departure can become besieged/violent before arrival; today only
  razed/captured is caught.
- **Change.** On arrival, revalidate destination safety (violence/siege below the flee thresholds). If
  unsafe: reroute (P1.1) or hold in the pool with elevated risk instead of settling into a new crisis.
- **Files.** `emigration-arrivals.js`, `emigration-refugee-staging.js`.
- **Risk.** Medium. Pairs naturally with P1.1. **Test.** Destination that turns violent mid-transit
  → arrival reroutes/holds rather than settling.

### P1.3 Closed-borders backlash (edge case E3 / exploit #7)
- **Problem.** Closed Borders both cut immigration (`closedBordersOpenness 0.4`) and retain would-be
  emigrants (`closedBordersRetention 0.6`) with only modest cost — a potentially dominant
  "stop population loss" strategy, and retained people simply vanish from the flow with no moral cost.
- **Change.** Retained emigrants don't disappear: a fraction of the *suppressed* cross-civ outflow is
  folded back into the source's voluntary pressure (and, in lethal distress, into attrition risk), so
  trapping people in bad conditions has consequences. Closed Borders stays useful but becomes
  morally/mechanically dangerous.
- **Files.** [../ui/emigration-borders.js](../ui/emigration-borders.js) (expose the retained amount),
  `emigration-engine.js` (fold into pressure/distress), `emigration-effects.js` (attrition coupling).
- **Config.** `closedBorderBacklash(weight)`, `closedBorderBacklashAttrition(weight)`.
- **Risk.** Medium–high — a feedback loop; must be capped and telemetered (P0.4). Ship behind a flag,
  default conservative.
- **Test.** With borders closed under high distress, source pressure/attrition rises vs. the open
  baseline; capped so it can't spiral.

---

## Priority 2 — Plausibility & depth

### P2.1 Weak-refuge fallback band (softens the "no viable refuge" cliff)
- **Problem.** Attrition is binary: a destination just below the pull threshold → deaths; just above →
  clean relocation. Real desperate flight goes *somewhere bad* because staying is worse.
- **Change.** Add a middle tier to destination selection: `strong` (normal), `weak` (emergency,
  low-efficiency: forced extra transit lag, higher assimilation load, possibly partial settlement),
  `none` (attrition). Attrition fires only when even a weak refuge is absent.
- **Files.** `emigration-pull.js` (return a tier, not just best/none), `emigration-engine.js`
  (attrition gate consults the tier), `emigration-consequences.js` (weak-arrival penalties).
- **Config.** `weakRefugePullFloor`, `weakRefugeeLagBonus`, `weakRefugeeLoadMult`.
- **Risk.** High — changes attrition frequency; must be tuned with P0.4 telemetry.
- **Test.** A below-threshold-but-existent destination yields a weak relocation instead of a death.

### P2.2 Crisis-escape phasing by tenure (refugee wave realism)
- **Problem.** `crisisEscapeBonus(+14)` and `ownCivRefugeeBonus(1)` are flat, so war refugees may
  internationalize immediately instead of first filling safer own-civ interior.
- **Change.** Scale with `crisisTenure` (already tracked in A7): turns 1–2 strongly prefer own-civ
  interior; cross-border escape pressure rises as the crisis persists. Produces the believable arc
  interior → allied/open neighbors → broad displacement.
- **Files.** `emigration-pull.js` (`crossCivBlock`/`geoAdjust` read tenure), `emigration-engine.js`
  (pass tenure into pull).
- **Config.** `ownCivRefugeeBonusEarly`, `crisisEscapeRampTurns`.
- **Risk.** Medium. **Test.** Same crisis at tenure 1 routes own-civ; at tenure 6 allows cross-border.

### P2.3 Dividend gated on integration (avoid win-more)
- **Problem.** The attraction dividend (A11) rewards raw arrival; combined with prosperity pull it can
  compound (arrive → yields → prosperity → more arrivals). Assimilation cost partly counters it.
- **Change.** Make arrival a *strain* first (assimilation load, already immediate) and release the
  dividend only as migrants *integrate* — a satisfying "strain then benefit" arc, and self-limiting.
- **Files.** [../ui/emigration-dividend.js](../ui/emigration-dividend.js), coupled to integration
  progress in `emigration-composition.js`.
- **Config.** `dividendOnIntegration: true`.
- **Risk.** Medium. **Test.** No dividend on the arrival turn; dividend accrues as the origin bucket
  integrates.

### P2.4 Cumulative diaspora chronicle
- **Problem.** Milestones fire on share crossings (15/30/45%) and exodus needs a single ≥70k wave; a
  steady 40-turn trickle that reshapes a city goes unremarked (A10).
- **Change.** Add cumulative detection: "over generations, migrants from X formed a lasting community
  in Y" triggered by cumulative inflow across an age, not a single pass.
- **Files.** [../ui/emigration-diaspora.js](../ui/emigration-diaspora.js).
- **Config.** `cumulativeFoundingPeople` threshold, per-age dedupe.
- **Risk.** Low. **Test.** Trickle summing past the threshold across turns fires once per age.

### P2.5 City-states as viable refuges (edge case E5)
- **Problem.** A flat `cityStateBarrier(5)` may make city-states underused as refuges, though they're
  historically plausible sanctuaries.
- **Change.** Reduce the barrier for peaceful/open/high-prosperity city-states so they can be
  attractive refuges (still gated by `includeCityStates`).
- **Files.** `emigration-pull.js`.
- **Config.** `cityStateRefugeRelief`.
- **Risk.** Low–medium. **Test.** A safe, open city-state becomes a valid refuge target under crisis.

### P2.6 Circular-migration damping (edge case E2)
- **Problem.** A→B for prosperity, then return/gradient sends people back — churn, only partly damped
  by cooldowns.
- **Change.** Short per-(origin,destination) migration memory that mildly damps immediate reverse
  flows within a window.
- **Files.** `emigration-state.js` (bounded memory), `emigration-pull.js` (apply damping).
- **Config.** `reverseFlowDampTurns`, `reverseFlowDampWeight`.
- **Risk.** Medium (state growth — must be bounded). **Test.** Immediate reverse flow is reduced vs.
  no memory; expires after the window.

### P2.7 Majority-immigrant petition / secession pressure
- **Problem.** The composition model allows a city to become effectively foreign-majority over time, but
  there is no intermediate political stage between "large diaspora" and either quiet integration or generic
  unhappiness. The base game already has native revolt framing, including city defection by revolt, but the
  trigger path is engine-owned and not known to be callable from UI code.
- **Change.** Add a petition layer: when one foreign origin exceeds a majority share and a real immigrant
  mass floor, in an unhappy / tense city, it can begin petitioning to join another civilization. This is a
  warning/escalation stage, not an instant transfer. First preference is to drive the city into the same
  native revolt danger zone the engine already understands (unhappiness, unrest, religious mismatch where
  relevant); if the engine produces a real revolt, observe `CityTransfered` / transfer type and treat that
  as canonical. Otherwise, escalate through a mod-owned consequence stack: unrest, quarter contestation,
  riot pressure, sabotage, and possible local uprising events.
- **State machine.** Persist a bounded petition record keyed by `cityKey|originCiv`:
  `{ cityKey, owner, originCiv, recipientCiv, share, migrantMass, stage, majoritySince, tensionTurns,
  warnedTurn, lastEscalationTurn, nativeResolved, resolvedTurn }` where `stage` is:
  `none -> petitioning -> defiant -> uprising-risk -> resolved`.
- **Exact default gates.**
  1. `petitionMajorityShare(0.55)`: use 55%, not 50%, to avoid one-turn oscillation around parity.
  2. `petitionReleaseShare(0.48)`: hysteresis floor; once a petition starts it only clears below 48%.
  3. `petitionMinImmigrants(250000)`: scaled-people floor so tiny settlements cannot trigger it.
  4. `petitionMinTurns(3)`: majority + tension must hold for 3 consecutive turns before warning fires.
  5. `petitionDefiantTurns(6)`: unresolved petition escalates to `defiant` after 6 tense turns.
  6. `petitionUprisingTurns(9)`: unresolved defiant petition enters `uprising-risk` after 9 tense turns.
  7. `petitionPressureWeight(1.5)`: per-turn unrest / pressure multiplier while petition is active.
  8. `petitionNeedsQuarter: true`: require an established or contested quarter by default so this is a
     durable-community mechanic, not a fresh-camp mechanic.
- **Recipient resolution (exact order).**
  1. **Primary:** the majority origin's homeland civ, if that civ is alive and still holds at least one
     settlement.
  2. **Exploration religious override:** if `petitionCanUseReligionRecipient` is on and the city is in a
     religious-revolt frame (foreign religion + unhappiness), the recipient may instead be the founder of
     the city's majority religion.
  3. **No viable recipient:** if neither exists, do **not** open a secession petition; keep only the
     contested-city unrest path. A city should not petition to join a dead or nonexistent polity.
- **Escalation rules.**
  1. `petitioning`: emit warning/readout/chronicle only once; apply light happiness / unrest pressure.
  2. `defiant`: increase quarter tension, pause blended progression, and add stronger unrest pressure.
  3. `uprising-risk`: try to induce native-compatible revolt conditions aggressively (unhappiness,
     prolonged unrest, religious mismatch where relevant). If native revolt still does not fire, unlock the
     mod-owned riot / sabotage / militia consequence path.
  4. `resolved`: clear on native `BY_REVOLT` transfer, on share falling below `petitionReleaseShare`, on
     recipient disappearance, or after a recovery window of positive happiness and no unrest.
- **Native integration point.** Wire `engine.on("CityTransfered", ...)` in `emigration-main.js`; if the
  transfer type is `BY_REVOLT` and the city had an active petition, mark it `nativeResolved`, chronicle it
  as the canonical outcome, and clear contested-quarter state for the old owner.
- **Files.** `emigration-composition.js` / `emigration-diaspora.js` (majority-origin detection + sustained
  share tracking), `emigration-engine.js` or `emigration-effects.js` (pressure/unrest escalation),
  `emigration-city-readout*.js` / notifications (petition visibility), `emigration-main.js` (event wiring
  for `CityTransfered` reaction), and the quarter plan's contested-state logic.
- **Config.** `petitionMajorityShare`, `petitionMinImmigrants`, `petitionMinTurns`,
  `petitionPressureWeight`, `petitionCanUseReligionRecipient`, `petitionReleaseShare`,
  `petitionDefiantTurns`, `petitionUprisingTurns`, `petitionNeedsQuarter`.
- **Risk.** Medium–high — if thresholds are too low, cities may feel politically unstable too often; if
  too high, the feature never appears. Also depends on whether native revolt can be induced reliably enough
  to matter.
- **Test.** A crafted city with one foreign origin >50% and sufficient immigrant mass enters petition state;
  below-threshold cities do not. Petition escalates unrest under bad happiness. Native `CityTransfered`
  with revolt transfer type resolves the petition when it occurs; otherwise the mod-owned unrest path fires.
  Add cases for hysteresis (55% starts / 48% clears), recipient selection (origin homeland vs religion
  founder), no-recipient suppression, and quarter-gated activation.

---

## Priority 3 — Optional deeper simulation (defer)

### P3.1 Bidirectional integration / large-diaspora imprint
- **Problem.** Integration is one-directional; large diasporas should sometimes imprint the host.
- **Change.** Tiered: `<15%` normal integration; `15–35%` slower + narrative quarter possible; `35%+`
  host gains a minor persistent cultural imprint / integration floor; war with origin stalls/reverses.
- **Files.** `emigration-composition.js`.
- **Config.** `diasporaImprintShare(0.35)`, `integrationFloorForLargeDiaspora`.
- **Risk.** High (touches the composition core). Defer until P0–P2 land and are tuned.

---

## Balance knobs to watch in testing (with P0.4 telemetry)

| Knob(s) | Governs | Failure mode to watch |
|---|---|---|
| `emigrationBar(30)`, `cooldownTurns(8)` | voluntary visibility | voluntary migration feels invisible |
| `warSurgeMax(3)`, `siegeLossCapPct(0.6)` | war displacement pace | too gentle (no drama) or too fast (depopulation) |
| `crisisEscapeBonus(14)` vs `aggressorPenalty(12)` | refugee internationalization | flee abroad too easily / not enough |
| `closedBordersOpenness(0.4)`, `closedBordersRetention(0.6)` | border policy | exploitable "seal the borders" strategy |
| `assimilationDecay(0.7)`, `assimilationGold(1.5)`, `assimilationHappiness(0.5)` | receiving-side cost | immigration is free money |
| `deathRampFloor(0.25)`, `deathRampTurns(6)`, `attritionThreshold(40)` | death feel | sudden/arbitrary vs. tragic/earned |

## Non-goals
- No simplification of the voluntary/crisis/transit/pool/attrition/return/composition spine.
- No player-facing exposure of internal term names (keep "crowded destination", not "anti-snowball").
- No unbounded state (all new memories/pools bounded, mirroring existing caps).

## Suggested sequencing
1. **P0** (reason tags, attrition why, voluntary cue, telemetry) — ship first; makes everything else
   measurable and makes the *current* system feel intentional.
2. **P1** (reroute-before-death, arrival revalidation, closed-border backlash) — fairness + the one
   real exploit.
3. **P2** (weak-refuge band, crisis-escape phasing, dividend-on-integration, cumulative chronicle,
   city-state refuges, circular damping) — plausibility/depth, tuned against P0.4 telemetry.
4. **P3** (bidirectional integration) — optional, only after the rest is stable.

Each item is independently shippable behind its own config flag, so tiers can land incrementally and
be A/B compared against the recorded telemetry.
