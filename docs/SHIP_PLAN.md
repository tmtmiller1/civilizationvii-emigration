# Emigration Mod — Ship-It Master Plan (umbrella)

## Implementation status
- ✅ **Phase 0** — verify gate green (`npm run verify` exits 0).
- ✅ **Phase 1** — Refugees renamed (Left/Arrived) + definitions on all five graphs.
- ✅ **Phase 2** — Net table follows the Scaled/Civ pills + diverging Net bar column.
- ✅ **Phase 3** — immigrant dots animate from origin civ (on load + scrub).
- ✅ **Phase 4** — engine two-track split (crisis + voluntary, separate budgets) behind rollout flags;
  scenario E (concurrent war+prosperity) added; A–E pass. **+ §6.2** multi-cause city-readout line.
- ✅ **Phase 6** — spike SUCCEEDED (base UI exposes `GameplayMap.getYields(plotIndex, playerID)` →
  `[yieldType, amount]` tuples, and `getAppeal(x,y)`); tile-by-tile prosperity lens implemented
  (per-plot yield sum, normalized to the world plot field, bucketed; per-city fallback). Needs in-game
  visual verification.
- ⏸️ **Phase 5** (city-local brakes) — DEFERRED **by design** per §5 ("ship only after Phase 1 stability
  gates pass"); Phase 1 isn't yet verified in-game. Pick up after the in-game pass.
- ✅ **Phase 7** — game-speed scaling (`emigration-game-speed.js`): turn-count durations + pressure
  thresholds scale ×S, decay re-bases to `d^(1/S)`, where S = `GameSpeeds.CostMultiplier`/100
  (Online 0.5 … Marathon 3.0); invariant magnitudes (loss caps, intensities, ceilings) unscaled.
  Auto-read + fail-safe to S=1; behind `gameSpeedTuningEnabled` (on) + `gameSpeedScalePopulation`
  (off, cross-mod). New `tests/game-speed.mjs` (fail-safe / 5 speeds / kill switch / game-time
  invariance) added to the verify chain (now **30** harnesses). README rewritten ground-up to
  integrate Phases 1–7 natively.

All engine/test changes keep `npm run verify` at exit 0. UI + lens changes (and the game-speed *feel*)
need an in-game pass.

---


Single source of truth for shipping the Emigration mod. **Reconciled with** `MIGRATION_SPLIT_PLAN.md`,
which remains the authority for the **engine rebalance** (its §2–§11: design rules, two-track split, flags,
budgets, replay, release gates). This umbrella adds (a) the **measured** ship-readiness audit, (b) the **UI/graph
ship-polish** the engine plan doesn't cover, and (c) one **correction** to the engine plan (§1.2).

## Reconciliation with MIGRATION_SPLIT_PLAN.md

- **Adopt wholesale** (engine plan, not duplicated here): §2 design rules (one cause per record; concurrency via
  multiple records), §4 two-track split + §4.5 rollout flags (`splitTracksEnabled` / `splitBudgetsEnabled` /
  `splitUiReadoutEnabled`), §5 city-local brakes, §6.2 multi-cause readout updates, §7 KPIs + perf budgets, §8
  test matrix + real-save replay, §9 release gates, §10 out-of-scope.
- **Correction to engine plan §1.2:** "war scenario in `engine-pass.mjs` green" is listed as a precondition to
  achieve. **It is already green** (measured). The earlier red was this session's reverted cause-mixing
  experiment, **not** a component-id/contract-parity defect (that code is defensively handled; its test passes).
  §1.2 is re-scoped to a general contract-parity hardening item; the *actual* current gate failures are the Audit
  below.
- **New here, not in the engine plan:** the verify-gate audit (Phase 0) and the player-requested UI items
  (Phases 1–3). These are **distinct** from engine-plan §6.2 — §6.2 is the *split-driven* multi-cause readout work;
  Phases 1–3 are standalone graph/table/animation polish.

---

## Audit — measured current state (the real gate failures)

`npm run verify` (= `tsc --noEmit` + `eslint ui` + 30 harnesses) **fails**; every failure is this session's:

- **Tests 29/30:** `migration-stats` FAILS — stale assertion vs the intentional pill rename
  (`Net Migration (Graph)` / `(Table)`).
- **`tsc` 5 errors:** `siegeBesiegedFloor` missing from `EmigrationConfig` (config.js:97, violence.js:176);
  `edgeDestOwner` missing from `Migration` (migration-records.js:88); two implicit-`any` params
  (migration-stats.js:472, window.js:266).
- **`eslint` 1 error:** `splitFlows` complexity 13 > 10 (window.js:133); +124 pre-existing warnings (defer).
- **Functional (sweep):** `DIGEST_KEY` missing `conquest` (naming.js) → conquest losses never localize. MAJOR.
- **2 missing LOC keys** added this session: `LOC_EMIG_NETC_UNITS_TIP`, `LOC_EMIG_NETC_TIMELINE_PENDING`.
- **Repo state:** `HEAD == origin/main`; uncommitted soup = this session's viz/data fixes + new
  `emigration-ledger-view.js` + ~140 lines of **prior** uncommitted causes/disasters/events/guide work
  (reviewed: complete/coherent, keepers).

---

## Phase 0 — Green the gate + clean baseline (engine plan §1 + §9, made concrete)

Nothing lands on red. Fix every measured failure (all self-inflicted), then commit so the engine split branches
from green.

1. **Typedefs:** add `siegeBesiegedFloor: number` to `EmigrationConfig` (`emigration-config-types.js`); add
   `edgeDestOwner?: number` to the `Migration` typedef; annotate the two `any` params.
2. **Lint:** refactor `splitFlows` (window.js:133) ≤10 complexity (extract the cross-vs-intra classify).
3. **Functional:** add `conquest: "LOC_EMIG_DIGEST_CONQUEST"` to `DIGEST_KEY`.
4. **LOC:** add `LOC_EMIG_DIGEST_CONQUEST`, `LOC_EMIG_NETC_UNITS_TIP`, `LOC_EMIG_NETC_TIMELINE_PENDING` to en_us +
   the 9 locale files.
5. **Stale test:** update `tests/migration-stats.mjs` expected labels to the **final** labels (after Phase 1
   renames) so it's touched once.
6. **Baseline commit:** with `verify` green, commit the soup as coherent commits. User is sole author (no
   co-author trailer). Then branch for Phases 2–5.

**Gate:** `npm run verify` exits 0.

---

## Phase 1 — Graph titles, tabs & definitions — `emigration-demographics.js`

- **Refugees Out → "Refugees (Left)":** `REF_SPEC.title` + `REF_PTS_SPEC.title`; `GRAPHS_GROUP.members[4].label`.
- **Refugees In → "Refugees (Arrived)":** `REF_IN_SPEC.title` + `REF_IN_PTS_SPEC.title`;
  `GRAPHS_GROUP.members[5].label`.
- **Definitions:** Net Migration / Emigration / Immigration already carry `subtitle` — confirm render; add
  `subtitle` to the four Refugees specs. Renders via host `appendChartSubtitle`.

---

## Phase 2 — Net Migration (Table) — `emigration-ledger-view.js`, `emigration-views.js`, demographics host

- **2a. Scaled/Civ pills drive the table:** pass the resolved group view into the panel render (`ctx.groupView`
  set in host `view-history.js` `resolve2DGroup`); emigration `renderInto` maps it to
  `setNumberMode(HISTORICAL|CIV)`; drop the ledger's redundant `numbersToggle`. Per-row `pop`/`pts` +
  `formatCount(people,points,mode)` already exist — only control wiring changes.
- **2b. Diverging Net bar in its own column:** keep the signed prose value in "Net"; add a bar column on a shared
  zero-centered axis — **red grows left** of center for `netP<0`, **green grows right** for `netP≥0`,
  width `abs(netP)/maxNet·half` (reuse `maxNet`). Update flex ratios + header/total rows so it aligns across rows.

---

## Phase 3 — Immigrant dots must fly between civs — `emigration-network-viz.js`

Immigrant dots ARE placed in the destination cluster and origin-colored, but `startAnim` (flies from the origin
civ's center) only fires on a **+1 frame advance**; on load/scrub/static, `d.anim=null` and the dot sits in the
dest cluster, reading as home-grown. **Fix:** animate on **reveal** — in `activate`, fire `startAnim` for dots
with `appearFrame === i` when jumping to frame `i` (incl. the initial activation), keeping the continuous-playback
path. *(Optional, flagged: a subtle persistent in-transit shimmer along active cross-civ corridors.)*

---

## Phase 4 — Engine rebalance (two-track split) — per `MIGRATION_SPLIT_PLAN.md` §4 (authority)

Implement §4 verbatim (per-source dual pressure/cooldown §4.1 w/ old-save normalize; two sub-passes §4.2; split
per-civ budgets §4.3; counterfactual parity §4.4; behind §4.5 rollout flags). **Test-first:** add the §8 5-case
scenario matrix to `tests/engine-pass.mjs` (peacetime / single-front / multi-front / disaster / **war+prosperity
concurrent**, with the war-next-to-haven regression guard) before the engine change. Then the §6.2 split-driven
readout updates. Freeze §1.3 non-split knobs during balancing; validate against §7 KPIs.

## Phase 5 — City-local brakes — per `MIGRATION_SPLIT_PLAN.md` §5 (after Phase 4 gates).
## Phase 6 — Tile-by-tile prosperity lens — gated, per §6.4 (no per-tile yield API; spike first).

---

## Unified verification & release gates

1. `npm run verify` exits 0 (incl. the 5 new engine scenarios).
2. Engine-plan §9 gates 2–8: war-path green, baseline/regression documented, persisted-schema migration resolved,
   contract-parity + host-contract checks, real-save replay, KPI + perf budgets (§7) within limits.
3. Engine-plan player-stability gate: map/graph/table totals agree; city-state harassment ≠ refugee flood; major
   city loss explainable from readouts.
4. UI in-game checklist: Refugees pills/titles = "Refugees (Left)"/"(Arrived)"; every graph shows a definition;
   Net table — pills change values + diverging red-left/green-right bar aligned across rows; Dots — a cross-civ
   immigrant flies from its origin circle (on load and scrub), in origin color.
