# Emigration — Open Items

Consolidated from two now-deleted docs (`emigration-improvement-review.md` and
`emigration-dead-code-audit.md`, both worked through on 2026-06-30). This file keeps **only what was
NOT completed** — the optional / deferred / conditional cleanups (each with a "revisit if" trigger).
Everything else from those reviews shipped (the C1/C2/C4 correctness fixes, the P1/P2/P4 perf caches,
the M1/M2 test-wiring fixes, and the Section-A dead-code deletions) and is verified by the test suite +
gate.

> **Deliberate non-changes live elsewhere.** Items we decided *not* to do (closed by decision, no
> trigger) are in [wont-fix-with-justifications.md](wont-fix-with-justifications.md) — keep that list
> current too. This file is for work that's still open or conditionally on the table.

> Project invariants for any work below: never touch the population-scaling constants (pinned to
> Demographics by `tests/scaling-demographics-parity.mjs`), never change the network/flow sim
> coordinates (`WX=1120`, `WY=560`), keep ESLint complexity ≤ 10, gate new behavior behind a `CONFIG`
> flag, and wire any new test into `verify` + `test:js` (the required-scripts gate now enforces this).

---

## 1. Won't-fix decisions

Moved to their own canonical list — see
[wont-fix-with-justifications.md](wont-fix-with-justifications.md) (currently **P3** — caching
`situationalPercent`/`distress` is unsafe under `warSiege`; and **C3** — no safe `prepareState`
monoTurn-jump guard). Add new deliberate non-changes there, not here.

---

## 2. Deferred feature — NOT a cleanup, a real frontend addition

### `renderChronicle` — staged Migration Chronicle view, not yet wired

`renderChronicle(body)` ([emigration-chronicle-view.js:74](../ui/emigration-chronicle-view.js#L74)).
The Migration Chronicle **data** layer is live (`chronicle()` is written by dilemma/return and mirrored
to notifications), but this **view** isn't mounted into a Demographics sub-tab yet. It's a
built-ahead-of-wiring feature (its idempotent-render bug was already fixed). **Do not delete it** — the
action is to *wire it up* when adding that tab is the goal. This is a feature/frontend change, so it was
deliberately excluded from the behavior-neutral dead-code pass.

---

## 3. Optional tidy — redundant `export` keywords (low value, case-by-case)

These 14 symbols are **used within their own file** (confirmed live), but nothing imports them across
files, so the `export` is over-exposure, not dead code. Low value to change; some may be intentional
public/console API.

- `showCityReadout`, `hideCityReadout` — [emigration-city-readout.js](../ui/emigration-city-readout.js) (also wired to an `api.city`/`api.hideCity` debug hook)
- `POLICY_DISABLED`, `POLICY_OWN`, `POLICY_MET`, `POLICY_FULL`, `policyOwnCivOnly`, `policyHidesUnmet`, `isLocalCiv` — [emigration-governance.js](../ui/emigration-governance.js)
- `cityInboundCap` — [emigration-inbound.js](../ui/emigration-inbound.js)
- `NET_MIGRATION_PAGE_ID` — [emigration-migration-page.js](../ui/emigration-migration-page.js)
- `dotXY`, `drawCivLabel` — [emigration-network-paint.js](../ui/emigration-network-paint.js)
- `engineWarOpponents` — [emigration-war.js](../ui/emigration-war.js)

**Caveat:** don't bulk-strip these `export`s blindly — `no-unused-vars` would then flag any that a test
imports dynamically, and the console-API ones (`showCityReadout`) may be intentionally public. Treat as
a case-by-case tidy, not a sweep.

---

## 4. Deferred module cleanups — `emigration-causes.js` (from a 2026-06-29 review)

All parked with reasoning; the one item that shipped (`netDrivers()` ±Infinity guard + deterministic
`CAUSE_ORDER` tie-break) is already in the module. The cause string set is **additive-only / never
renamed**, originates as raw returns in `migrationCause()`
([pull.js:47-50](../ui/emigration-pull.js#L47-L50)), and every getter falls back to `other` / `""` — which
is why most of these are YAGNI today.

1. **Frozen `MigrationCauses` / `HeadlineCauses` constants** — define cause keys once as frozen objects,
   reference everywhere instead of hand-typed literals (~14 consumer files). *Revisit if:* several new
   causes are added, or contributors would benefit from compile-time keys. (High churn, marginal protection.)
2. **`normalizeCause()` + `CAUSE_ALIASES` table** — map legacy/persisted keys to canonical on every
   lookup. *Revisit if:* a persisted cause value is ever renamed (then it's *required*, alongside item 3).
   YAGNI today — zero aliases, additive-only set.
3. **`netDrivers()` Map-aggregation by normalized cause** — sum into a `Map` keyed by canonical cause.
   *Revisit if:* item 2 lands. **Implementation caveat:** apply the `>= 0.5` threshold *after* the sum,
   not before (the review's draft dropped two sub-threshold contributions that should sum past it).
4. **Split `LABELS` → `CAUSE_LABELS` + `PSEUDO_CAUSE_LABELS`** — separate real causes from display/pseudo
   ones (`crisis`, `chronicle`, `other`). Cosmetic; the `MigrationCause` vs `HeadlineCause` typedefs
   already encode the distinction. No behavioral benefit.
5. **Localization keys (`LABEL_KEYS` / `causeLabelKey()`)** — store `LOC_*` keys instead of raw English.
   Module header assigns this to "Phase 1"; labels are intentionally English-raw today (Demographics
   renders metric labels raw). *Revisit if:* Phase 1 localization starts.
6. **`return` label wording** ("Return" → "Return Migration") — minor copy tweak; ambiguity worry already
   handled (`netDrivers()` is signed). Bundle into a future copy pass if ever.
7. **Comment punctuation / spelling sweep** — *likely reject*: the ` , ` spacing is a deliberate
   rhetorical em-dash-comma used codebase-wide, and some spelling is intentionally British. Not worth a
   churning mechanical sweep.
8. **Two per-cause colour maps may drift** — `ACCENTS` ([emigration-causes.js](../ui/emigration-causes.js))
   and `CAUSE_PALETTE` ([network-paint.js:26-29](../ui/emigration-network-paint.js#L26-L29)) both map
   cause→hex with **different** values (war `#d24b3e` vs `#e5616b`, disaster `#e08a3c` vs `#f4a259`).
   Plausibly intentional (toast/log accents vs network-node fills), but a new cause needs a colour in two
   places. **Action:** decide intent, then either consolidate behind one source or add cross-referencing
   comments in both files. (Decide before changing any colours.)

---

## 5. Latent robustness — mod-wide "reset persisted caches on game boot" (from the chronicle review)

The chronicle review's one real fix shipped (persist-before-mirror ordering in `chronicle()`). Its other
findings were rejected or no-change **except** one idea worth keeping, reframed mod-wide:

- ~12 sibling modules (`chronicle`, `notifications`, `composition`, `migration-stats`, `dilemma`,
  `return`, `disasters`, `effects`, `dividend`, …) use the same `let _x = null` lazy-load-from-persistence
  cache and rely on the UIScript **isolate being torn down on game boot** to reset. There is **no**
  game-id (`Configuration.getGame().gameSeed`) guard anywhere. If a new game ever starts within the same
  live isolate, a module could inherit and then persist the prior game's data.
- **Not observed in practice**, and patching one module (e.g. chronicle) alone would be inconsistent.
  *Revisit if:* cross-game cache staleness is ever actually seen — and then as a **shared convention**
  (one "reset persisted caches on game boot" hook all these modules subscribe to), not a one-off. This is
  a different failure mode from the known recorder-vs-reader isolate gotcha (two isolates in the *same*
  game).

---

## 6. Deferred feature — city-local migration brakes (Phase 5)

From the now-deleted `MIGRATION_SPLIT_PLAN.md` (§5) and `SHIP_PLAN.md` (Phase 5). The two-track
voluntary/crisis split **shipped** (engine `processSourceSplit`, `crisisPressure`/`crisisCooldown`
state, split per-civ budgets, counterfactual parity, the `splitTracksEnabled` / `splitBudgetsEnabled` /
`splitUiReadoutEnabled` flags, and the multi-cause `causeMix` city readout). The one piece still
**deferred by design** is the optional follow-on:

- Move **assimilation / congestion load from civ scope to city scope** in
  [emigration-effects.js](../ui/emigration-effects.js) — key the load by destination city id, with a
  compatibility migration for persisted load. Today these brakes are civ-scoped (verified: no city-keyed
  load in effects.js). Was explicitly gated "ship only after Phase 1 stability gates pass" / after the
  in-game pass. **Revisit when** the split has had its in-game shakedown and city-granular braking is
  actually wanted.
- Optional enhancements from the same plan (lower value, not started): a voluntary-vs-crisis toggle in
  the network viz, and promoting the per-cause Demographics metrics to on-by-default.

## 7. Pending in-game verification (manual QA — not runnable off-engine)

The test suite covers the pure logic, but several shipped systems carry an explicit "needs an in-game
visual pass" note (from `SHIP_PLAN.md` and the disaster plan). These are verification TODOs, not code:

- **Tile-by-tile prosperity lens** ([emigration-prosperity-lens.js](../ui/emigration-prosperity-lens.js))
  — confirm the `GameplayMap.getYields` shape/scale and the per-tile paint read correctly in-engine
  (with the per-city fallback path).
- **Game-speed "feel"** across Online…Marathon, and the **disaster Marathon rebalance** — confirm the
  re-tuned pacing actually feels right in play (the math is unit-tested; the *feel* isn't).
- **1.4.1 happiness/economy recalibration** — the polity model (happiness stages / governments /
  celebrations / war weariness) and the rebalanced yield weighting shipped and are unit-tested + bounded
  by the `scripts/` balance harnesses (`calibration-sweep`, `happiness-balance`, `snowball-stress`), but
  the **final balance sign-off still wants in-game observation**. Re-run those harnesses when re-tuning.
  (Full rationale: the implemented `v1.4.1-deep-pass-plan.md` in `mods_research_and_analysis/emigration-docs/`.)
- **UI polish from the ship plan** — Refugees pill/title wording, per-graph definitions, the Net table
  pills + diverging bar alignment, and cross-civ immigrant dots flying from their origin on load/scrub.

## 8. More deferred module cleanups (low priority — chronicle-view / cities / city-features)

All parked with reasoning in the now-deleted per-module backlogs; only the genuinely-actionable or
conditional ones are kept here (the rest defended states the producer makes unreachable — don't
re-litigate).

- **chronicle-view** ([emigration-chronicle-view.js](../ui/emigration-chronicle-view.js)): the one real
  (minor) UX item — long titles can crowd the kind label on a narrow Civ VII panel; if adopted, prefer
  wrapping (`.emig-chr-head{flex-wrap:wrap}`) over truncation. *Revisit if* a narrow-panel issue is
  observed. Plus two cosmetics: chronicle-specific empty class vs shared `.emig-empty` (leave unless a
  real collision), and CSS-as-array `.join("")` (bundle into an unrelated CSS edit if ever).
- **cities** ([emigration-cities.js](../ui/emigration-cities.js)): split `siege` from `razing` — today
  `siege: !!city.isBeingRazed` conflates the two. **Revisit only with a confirmed Civ VII city-siege /
  under-attack API** (current API is unverified speculation).
- **city-features** ([emigration-city-features.js](../ui/emigration-city-features.js)) — the whole file
  reviewed clean (nothing shipped); the only items worth carrying:
  - Verify `getPurchasedPlots()` covers the **city center**. If it excludes it, the Chronicle could miss
    defining geography — broaden the plot source or correct the comment. (Unverified API; confirm before
    changing, don't guess.)
  - Narrative-design tweaks (substring→token matching, `isWater`/`coast` semantics, river-adjacency,
    etc.) are **parked unless the generated prose actually reads wrong in play** — they redefine "has a
    feature," a design decision, not a bug.

**Cross-cutting (collapse when picked up):**
- **Phase 1 localization sweep** — the raw English user strings in `emigration-causes.js` (§4 item 5)
  *and* `emigration-chronicle-view.js` (`"Turn "`, fallback title, empty-state prose, `KIND_LABEL`)
  belong to the same move to `LOC_*` keys. Do them together as the Phase 1 sweep, not piecemeal.
- **Frozen-constants family** — the cause-keys (§4 item 1) and `CITY_FEATURE` keys are the same small,
  stable, additive set hand-typed across a few modules. Same call: centralizing adds computed-key churn
  for marginal safety. *Revisit if* a third consumer appears or a drift bug actually bites.

## 9. Latent guard note — `compositionForCity` (from the defensive sweep)

`compositionForCity` ([emigration-composition.js:510](../ui/emigration-composition.js#L510)) is the one
cross-module callee reached inside broad `catch` blocks that isn't itself fully try-guarded. It's
effectively **non-throwing today** (null-safe reads + internally-guarded `load()` + pure `summarize`),
and every current call site handles it safely — **no action now** (wrapping it would defend an
impossible-today state). It's recorded only because it's the function most likely to turn a future
loosely-wrapped caller into a `buildSignal`-class "whole city silently nulled" bug: **if a NEW caller
wraps it in a broad `try{…}catch{return null}`, guard it narrowly (per-field) or make `compositionForCity`
self-guarding at that point.**

> The folder-wide defensive sweep (now deleted) otherwise came back **clean** across its bug classes
> (colliding/sentinel keys, `replaceChildren`, non-idempotent render, persist/mirror ordering,
> over-broad try/return-null) — its one fix (`markCityRemoved` key guard) already shipped.

---

## Notes / context

- `migration-probe.js` is a separate diagnostic tool (own `migration-probe.modinfo`); its exports serve
  that probe and are not mod dead code.
- No orphaned *files* exist — every `ui/*.js` is listed in `emigration.modinfo` and runs.
- The mod's larger gameplay roadmap (Features A–K + deepened refugee stance) lives in
  [feature-improvements-plan.md](feature-improvements-plan.md); those are net-new features, out of scope
  for the correctness/perf/maintainability review this file descends from.
