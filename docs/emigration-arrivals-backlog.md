# Emigration — `emigration-arrivals.js` backlog (deferred hardening)

Deferred-but-valid ideas from the 2026-07-02 arrivals review. **Tier 1** (defensive per-arrival guard,
`forced`→`expired` rename + comment fixes, empty-`ranked` logging, pooled-refugee cap documentation)
shipped. The items below were assessed as real but **not worth doing right now** — each is either
purely cosmetic, or behavior-changing in a way that would churn the deterministic golden baselines now
gated in CI (`test:determinism`, `engine-legacy-snapshots`, `snapshot-reminder`). Revisit any of these
the next time we're re-baselining those snapshots anyway.

> These are *deferred / conditional* (they have a "revisit when…" trigger), which is why they live here
> and not in [wont-fix-with-justifications.md](wont-fix-with-justifications.md). A hard rejection (with
> no revisit trigger) belongs there instead — e.g. the "softer death→pool for capped arrivals" item,
> which was rejected outright.

---

## Tier 2 — correct, but changes deterministic outcomes (needs a snapshot re-baseline)

### `roll01` should divide by `0x100000000`, not `0xffffffff`

`roll01` returns `(h >>> 0) / 0xffffffff`, so the maximum hash yields exactly `1.0` — the docstring
claims `[0,1)` but the range is `[0,1]`.

- **Why it's low priority:** the exact-`1.0` case is 1-in-4-billion per seed, and even then it produces
  a *valid* outcome (`roll01(seed) < pct` is `false` → the refugee enters the holding pool), so no bug
  ever manifests. It's a purity fix, not a behavior bug.
- **Cost:** dividing by `0x100000000` shifts *every* roll value slightly, flipping a handful of
  `immediateSettle` decisions across a game → changes settle/pool outcomes → breaks the golden
  determinism snapshots until regenerated.
- **Revisit when:** we're regenerating `engine-legacy-snapshots` for another reason; fold it in then and
  re-baseline in the same pass.

### Explicit tie-breakers in the due-arrival sort

The sort is `defers`-desc only: `(b.defers || 0) - (a.defers || 0)`. Ties currently resolve by
transit-queue order.

- **Why it's low priority:** V8's `Array.sort` is stable (Node 11+), and the transit array is itself
  deterministic, so equal-`defers` ties are *already* deterministic. A proposed comparator
  (`defers`, then earlier `arriveTurn`, then `destKey`, then `srcName`) is "more literally fair" but not
  more *deterministic*.
- **Cost:** it changes the tie order → changes which arrivals land first under a tight inbound cap →
  snapshot churn, for a fairness refinement no player would observe.
- **Revisit when:** we ever move off a stable-sort engine, or we're re-baselining snapshots anyway.

---

## Tier 3 — design decisions, not fixes

### Seed `immediateSettle` from event identity instead of processing turn

The seed includes `now` and `defers`, so a deferred refugee re-rolls its settle-vs-pool decision each
attempt. The review suggests seeding from a stable event identity (e.g. `departTurn`) so cap timing
can't change destiny.

- **Blocker:** `Transit` has **no `departTurn`** (see the typedef in `emigration-state.js`). Adding one
  is a persisted-schema change touching `normalizeTransitEntry`/`normalizeTransitList` and the save
  format.
- **Assessment:** the current behavior is *already deterministic* (the review concedes this); "re-roll
  per attempt" is a defensible "each turn is a fresh attempt" model, not a bug.
- **If we ever do want wave-stable identity:** seed from existing stable fields
  (`eventKey` + `destKey` + `srcOwner` + the creation-time `arriveTurn`) rather than adding a field —
  and expect a snapshot re-baseline.

### `MAX_DEFERS` → `CONFIG`

Make the retry-window length a tunable (`CONFIG.maxArrivalDefers`, defaulting to 4) instead of a module
constant.

- **Assessment:** consistent with the mod's tunables system, but it's an internal balance constant few
  players would touch. Cheap if added as a plain non-UI `CONFIG` override; scope-creep if exposed in the
  Advanced editor (needs config-types + i18n + the tunables UI).
- **Revisit when:** playtesting shows the perish window actually needs tuning.

### Split / rename `resolveArrival`

The name reads as pure but it mutates (`addRural`, `destSig.rural/population`, `queueRefugees`,
`bumpArrivedIntoCrisis`, `applyArrivalConsequences`). Suggested: rename to `applyResolvedArrival`, or
split into `classifyArrival` (pure) + `landArrival` (imperative).

- **Assessment:** the docstring already enumerates the side effects, which blunts the "name hides
  mutation" concern. A split improves testability but adds indirection; only worth it if the function
  approaches the eslint `complexity`/`max-statements` caps (it currently doesn't).
- **Revisit when:** `resolveArrival` grows a new branch that pushes it near the lint caps.
