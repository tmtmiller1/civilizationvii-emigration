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

> **Net-new features live elsewhere.** Two items that were here — the staged Migration Chronicle view
> (`renderChronicle` wiring) and the city-local migration brakes (Phase 5) — are genuine features, not
> cleanups, and were moved to [feature-improvements-plan.md](feature-improvements-plan.md) §17 (Features
> AA and AB). This file keeps only correctness/perf/maintainability work.

---

## 2. Redundant `export` keywords — ✓ Completed 2026-06-30

Worked through case-by-case (not a blind sweep). Each of the 14 symbols was grep-verified to be
referenced **only within its own file** — no cross-file imports, no test imports, no dynamic-import
usage — so every `export` was de-exposed to a plain local declaration. The one flagged "may be
intentionally public" pair (`showCityReadout` / `hideCityReadout`) was de-exported too: their public
debug surface is the `globalThis.emigration.city` / `.hideCity` console hook, which references the
**local** functions and does not depend on the ES export. Verified clean by `verify`'s gate
(`eslint ui`, `tsc --noEmit`, full `test:js` — no `no-unused-vars` regression, all harnesses pass).

---

## 3. Deferred module cleanups — `emigration-causes.js` (from a 2026-06-29 review)

All parked with reasoning; the one item that shipped (`netDrivers()` ±Infinity guard + deterministic
`CAUSE_ORDER` tie-break) is already in the module. The cause string set is **additive-only / never
renamed**, originates as raw returns in `migrationCause()`
([pull.js:47-50](../ui/emigration-pull.js#L47-L50)), and every getter falls back to `other` / `""` — which
is why most of these are YAGNI today.

> **Worked through 2026-06-30.** The two-colour-map drift item was resolved by deciding intent (the
> `ACCENTS` toast/log accents and `CAUSE_PALETTE` network-dot fills are *deliberately* distinct — the
> latter is tuned to harmonize with `CIV_PALETTE`) and adding cross-referencing comments in both files
> rather than consolidating. Three cosmetic-only items with no "revisit if" trigger (split `LABELS`,
> "Return" → "Return Migration" copy, comment punctuation/spelling sweep) were closed by decision and
> moved to [wont-fix-with-justifications.md](wont-fix-with-justifications.md). The items below are the
> ones that remain genuinely conditional — each still gated on an unfired trigger.

1. **Frozen `MigrationCauses` / `HeadlineCauses` constants** — define cause keys once as frozen objects,
   reference everywhere instead of hand-typed literals (~14 consumer files). *Revisit if:* several new
   causes are added, or contributors would benefit from compile-time keys. (High churn, marginal protection.)
2. **`normalizeCause()` + `CAUSE_ALIASES` table** — map legacy/persisted keys to canonical on every
   lookup. *Revisit if:* a persisted cause value is ever renamed (then it's *required*, alongside item 3).
   YAGNI today — zero aliases, additive-only set.
3. **`netDrivers()` Map-aggregation by normalized cause** — sum into a `Map` keyed by canonical cause.
   *Revisit if:* item 2 lands. **Implementation caveat:** apply the `>= 0.5` threshold *after* the sum,
   not before (the review's draft dropped two sub-threshold contributions that should sum past it).
4. **Localization keys (`LABEL_KEYS` / `causeLabelKey()`)** — store `LOC_*` keys instead of raw English.
   Module header assigns this to "Phase 1"; labels are intentionally English-raw today (Demographics
   renders metric labels raw). *Revisit if:* Phase 1 localization starts.

---

## 4. Latent robustness — mod-wide "reset persisted caches on game boot" — ✓ Completed 2026-06-30

Implemented as the **shared convention** the item called for (not a one-off). New module
[emigration-cache-reset.js](../ui/emigration-cache-reset.js) holds a per-isolate registry + a game-id
(`Configuration.getGame().gameSeed`) guard; all 13 persisted-cache modules (`notifications`, `dividend`,
`dilemma`, `migration-stats`, `chronicle`, `composition`, `effects`, `violence`, `feedback`, `disasters`,
`return`, `war`) register a resetter and call `resetCachesOnNewGame()` at the top of their lazy loader.
The first such call after a `gameSeed` change nulls every registered cache in that isolate, so each
reloads from the new game's store instead of persisting the prior game's data into it.

- Gated behind `CONFIG.resetCachesOnGameBoot` (default on; no-op unless the id actually changes; the
  first id seen is adopted, never reset). `event-attribution` was excluded — it re-polls fresh each pass
  and never persists, so it can't carry stale state.
- `chronicle` carries the guard in **both** `log()` and `keys()`: its dedupe gate consults `keys()`
  *before* `log()`, so without the second guard a milestone game A recorded would be silently dropped in
  a new game.
- Verified by `tests/cache-reset.mjs` (registry mechanics + an end-to-end chronicle case proving the
  new game's store isn't corrupted and the dedupe gate resets), wired into `verify` + `test:js`; full
  gate green (lint, tsc, modinfo import-closure, perf-budget, required-scripts).
- Still a different failure mode from the recorder-vs-reader isolate gotcha (two isolates in the *same*
  game), which remains handled by readers reloading from persistence.

---

## 5. Pending in-game verification (manual QA — not runnable off-engine)

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

## 6. More deferred module cleanups (low priority — chronicle-view / cities / city-features)

All parked with reasoning in the now-deleted per-module backlogs; only the genuinely-actionable or
conditional ones are kept here (the rest defended states the producer makes unreachable — don't
re-litigate).

> **Worked through 2026-06-30.** The one genuinely-actionable item shipped: the chronicle-view
> narrow-panel UX fix (`.emig-chr-head{flex-wrap:wrap}`) is in
> [emigration-chronicle-view.js](../ui/emigration-chronicle-view.js#L27) — a long title now lets the
> kind label wrap to its own line instead of crowding it. One cosmetic (rebuild the `CSS` string as a
> `.join("")` array) was closed by decision and moved to
> [wont-fix-with-justifications.md](wont-fix-with-justifications.md). Everything else below is genuinely
> blocked on an external trigger I can't fire off-engine (an unverified Civ VII API, an unstarted
> localization phase, or gameplay that hasn't been observed yet) — each kept with its trigger, none
> safe to "complete" by guessing.

- **chronicle-view** ([emigration-chronicle-view.js](../ui/emigration-chronicle-view.js)): only one
  cosmetic remains — chronicle-specific empty class vs the shared `.emig-empty` (today it deliberately
  carries its own copy so it can render standalone; [view.js:34-35](../ui/emigration-chronicle-view.js#L34-L35)
  already documents why). *Revisit only if a real class collision is observed*; do not rename pre-emptively.
- **cities** ([emigration-cities.js](../ui/emigration-cities.js)): split `siege` from `razing` — today
  `siege: !!city.isBeingRazed` ([cities.js:191](../ui/emigration-cities.js#L191)) conflates the two.
  **Revisit only with a confirmed Civ VII city-siege / under-attack API** (current API is unverified
  speculation — no such read exists in the codebase to wire up, so this cannot be done now).
- **city-features** ([emigration-city-features.js](../ui/emigration-city-features.js)) — the whole file
  reviewed clean (nothing shipped); the only items worth carrying:
  - Verify `getPurchasedPlots()` ([city-features.js:95](../ui/emigration-city-features.js#L95)) covers
    the **city center**. If it excludes it, the Chronicle could miss defining geography — broaden the
    plot source or correct the comment. (Unverified API; **needs an in-game pass to confirm** — can't be
    settled off-engine, don't guess. Shares item 5's "needs an in-game visual pass" gate.)
  - Narrative-design tweaks (substring→token matching, `isWater`/`coast` semantics, river-adjacency,
    etc.) are **parked unless the generated prose actually reads wrong in play** — they redefine "has a
    feature," a design decision, not a bug.

**Cross-cutting (collapse when picked up):**
- **Phase 1 localization sweep** — the raw English user strings in `emigration-causes.js` (§3 item 4)
  *and* `emigration-chronicle-view.js` (`"Turn "`, fallback title, empty-state prose, `KIND_LABEL`)
  belong to the same move to `LOC_*` keys. Do them together as the Phase 1 sweep, not piecemeal.
- **Frozen-constants family** — the cause-keys (§3 item 1) and `CITY_FEATURE` keys are the same small,
  stable, additive set hand-typed across a few modules. Same call: centralizing adds computed-key churn
  for marginal safety. *Revisit if* a third consumer appears or a drift bug actually bites.

## 7. Latent guard note — `compositionForCity` — ✓ Completed 2026-06-30

`compositionForCity` ([emigration-composition.js](../ui/emigration-composition.js#L513)) was the one
cross-module callee reached inside broad `catch` blocks that wasn't itself fully try-guarded. The note
parked it as "no action now" **unless** a caller wrapped it in a broad `try{…}catch{return null}` —
**that trigger had already fired:** `citiesByOwner` in the network window wraps the call in exactly that
pattern ([emigration-window.js:295-301](../ui/emigration-window.js#L295-L301)), as a deliberate per-city
isolation inside an outer whole-loop catch (so one bad city can't blank the whole network). Per the
note's own prescription, the fix was to **make `compositionForCity` self-guarding at the source**:

- Wrapped its body in a `try/catch → null` ([composition.js:513](../ui/emigration-composition.js#L513)).
  This is *not* defending an impossible state: `locKey` reads `city.location` off a **live** engine
  object, so a throwing accessor is a real residual throw vector that `load()`-normalization (the
  existing hardening) can't reach — and `compositionForCity` is called with live cities on several
  paths that are **not** broadly guarded (`detectFoundingForCity`, `planOneReturn`).
- The window's per-city catch was **left intact** — it's deliberate per-city isolation, not the careless
  broad catch the note worried about; the source guard now makes it belt-and-suspenders.
- Pinned by a new assertion in [tests/composition-malformed.mjs](../tests/composition-malformed.mjs): a
  city whose `location` accessor throws must drop to `null`, not throw. (The pre-existing
  never-throws-on-corrupt-data contract still holds; this closes the live-accessor gap it didn't cover.)

> The folder-wide defensive sweep (now deleted) otherwise came back **clean** across its bug classes
> (colliding/sentinel keys, `replaceChildren`, non-idempotent render, persist/mirror ordering,
> over-broad try/return-null) — its one fix (`markCityRemoved` key guard) already shipped.

---

## Notes / context

- `migration-probe.js` is a separate diagnostic tool (own `migration-probe.modinfo`); its exports serve
  that probe and are not mod dead code.
- No orphaned *files* exist — every `ui/*.js` is listed in `emigration.modinfo` and runs.
- The mod's larger gameplay roadmap (Features A–K + deepened refugee stance + L–Z, plus the carried-over
  AA/AB in §17) lives in [feature-improvements-plan.md](feature-improvements-plan.md); those are net-new
  features, out of scope for the correctness/perf/maintainability review this file descends from.
