# Migration Rebalance Plan — Split Voluntary vs Crisis

Status: proposed. No merge until all release gates pass.

## 0. Goal

Make migration predictable and tunable by splitting one mixed loop into two concurrent tracks:
- Voluntary: prosperity/unhappiness
- Crisis: war/disaster

Keep shared telemetry and existing per-record single-cause semantics.

Target behavior:
- One city can emit both crisis and voluntary moves in overlapping passes.
- War tuning no longer dominates peacetime behavior.
- Player-facing map/graph/table tell the same story.

## 1. Preconditions (must pass first)

### 1.1 Clean baseline lock
- Start from clean `origin/main` (no behavioral local diffs).
- Reproduce current in-game failures on clean build.
- If clean fails: fix baseline first.
- If clean passes: isolate local regressions first.

### 1.2 Runtime contract parity (demo vs in-game)
Add/verify tests for:
- city component-id shape and fallbacks
- district health + siege reads
- random event payloads
- diplomacy/open-borders/alliance reads

NOTE (corrected): the `engine-pass.mjs` war scenario is **already green** — the earlier red was a reverted
cause-mixing experiment, NOT a component-id/contract-parity defect (`keyFromCID` in `emigration-violence.js` is
defensively handled and `tests/violence.mjs` passes). So this section is a general hardening item, not a blocker.
The actual current gate failures are tracked in `SHIP_PLAN.md` (Phase 0 audit): 5 `tsc` errors, 1 `eslint`
complexity error, and the stale `migration-stats` label assertion.

### 1.3 Freeze unrelated balancing
Until split is stable, freeze changes to:
- permeability/border multipliers
- refugee own-civ bias/friction knobs
- network visual scaling changes
- net-accounting semantic changes

Use flags for experiments.

## 2. Non-negotiable design rules

1. Each migration record has one cause.
2. Concurrency is produced by emitting multiple records over time, not multi-cause records.
3. Keep existing by-cause telemetry model (`byCause`, `inByCause`, refugee tallies).
4. Keep old-save compatibility for all persisted state changes.

## 3. What already exists (do not rewrite)

Already distinct by cause today:
- Cross-civ friction (`poachBlock` vs `refugeePoachBlock`)
- Refugee bias (aggressor avoidance, own-civ bonus, asylum tilt)
- Pacing (voluntary bar/cooldown vs forced bypass)
- War burst/cap (`warSurgeMax`, `siegeLossCapPct`)
- Transit behavior
- Cause-based telemetry

Implication: primary code change is pressure/budget split, not a full engine rewrite.

## 4. Phase 1 — Core split implementation

### 4.1 State shape (`emigration-state.js`)
Per-source state:
- `pressure`, `cooldown` (voluntary)
- `crisisPressure`, `crisisCooldown` (crisis; cooldown can stay 0)

Requirements:
- normalize missing fields on load
- tick both cooldown fields in prepare step

### 4.2 Source evaluation (`emigration-engine.js`)
Refactor source processing into two sub-passes per source per turn:

Crisis sub-pass:
- active when source in crisis
- cause: disaster if threshold met, else war
- accumulate to `crisisPressure`
- bypass emigration bar
- use `warSurgeBudget`
- destination via existing refugee-aware destination logic

Voluntary sub-pass:
- active when economic pull exists and voluntary cooldown allows
- cause: unhappiness or prosperity
- accumulate to `pressure`
- gated by `emigrationBar`
- apply `cooldownTurns` after move

Keep shared move/arrival logic and one-cause records.

### 4.3 Split per-civ budgets
Replace one civ ceiling with two:
- voluntary ceiling: `maxMovesPerTurn + cities * movesPerCity`
- crisis ceiling: `crisisCities * movesPerSiege`

Track usage separately per owner in the pass.

### 4.4 Counterfactual parity
Mirror split logic in planner/counterfactual path to avoid stance telemetry drift.

### 4.5 Rollout flags
Add reversible controls:
- `splitTracksEnabled`
- `splitBudgetsEnabled`
- `splitUiReadoutEnabled`

Default: enabled in dev, canary in RC.

## 5. Phase 2 — Optional city-local brakes

Scope (`emigration-effects.js`):
- move assimilation/congestion from civ scope to city scope
- key load by destination city id
- keep compatibility migration for persisted load

Ship only after Phase 1 stability gates pass.

## 6. Visualization scope

### 6.1 No-change surfaces
Existing by-cause consumers should work without redesign:
- causes pies/lists
- network cause dots/legend
- refugee/emigration/immigration tooltips
- per-cause demographics metrics
- cumulative graphs

### 6.2 Required updates
Current single-cause city displays must become multi-cause:
- city readout pressure line
- settlement pressure bar
- pressure table row
- optional digest secondary-cause text

### 6.3 Optional enhancements
- voluntary vs crisis toggle in network viz
- promote per-cause demographics metrics by default

### 6.4 Hard blocker
Tile-by-tile prosperity lens is blocked pending per-plot API capability spike.
Not part of Phase 1.

### 6.5 Host contract checks
Validate Demographics integration:
- subtab routing/merge behavior
- group/view/member id stability
- absent/delayed host fallback
- no duplicate registrations

## 7. KPIs and budgets

Balance KPIs:
- peacetime voluntary outflow rate
- war displacement ceiling per city
- war displacement ceiling per civ
- in-transit stock and drain time
- magnet concentration

Performance budgets (hard gates):
- local-turn pass time (mid game)
- local-turn pass time (late game/large save)
- render budget (dot cap + frame target)
- history/state size growth budget

Capture baseline before tuning.

## 8. Test matrix

Synthetic (`tests/engine-pass.mjs`):
1. peacetime
2. single-front war
3. multi-front war
4. disaster-only
5. concurrent war + prosperity

Keep existing harnesses green (`causes`, `violence`, `engine-pull`, `effects`, `prosperity`, `borders`, `disasters`, `flow-history`, etc.).

Real-save replay (required):
- pre-war
- active war
- post-war
- save/load boundary in each phase

Record KPI deltas.

## 9. Verification and release gates

Merge blockers:
1. `npm run verify` passes clean.
2. war-path harness passes.
3. clean-baseline vs local-regression status documented.
4. persisted schema/semantic migration ambiguity resolved.
5. contract parity checks pass.
6. host contract checks pass.
7. real-save replay suite passes.
8. KPI + performance budgets within limits.

Player-stability gate (before new feature work):
- map/graph/table totals agree on captured snapshots
- city-state harassment does not create disproportionate refugee floods
- major city-loss events are explainable from in-game readouts without logs

## 10. Out of scope

- repatriation/post-war return system
- AI decision-model changes
- permeability-readability redesign beyond current scope
- tile-by-tile prosperity lens before API spike

## 11. Primary touch points

Core:
- `emigration-engine.js`
- `emigration-state.js`

Optional Phase 2:
- `emigration-effects.js`

UI/readout updates:
- `emigration-city-readout-data.js`
- `emigration-city-readout.js`
- `emigration-city-flows.js`
- `emigration-views.js`
- `emigration-feedback.js`

Integration/lens:
- `emigration-demographics*.js`
- `emigration-network-*.js`
- `emigration-prosperity-lens.js` (gated)
- `emigration-prosperity-tooltip.js` (gated)

Tests:
- `tests/engine-pass.mjs`
- existing harness suite under `tests/`
