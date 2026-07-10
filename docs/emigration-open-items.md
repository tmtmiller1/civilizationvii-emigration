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

> **Released in v1.7.0 (2026-06-30).** Everything marked **✓ Completed** below shipped in
> [v1.7.0](../CHANGELOG.md): §2 (redundant exports), §4 (reset-caches-on-game-boot convention), and §7
> (`compositionForCity` self-guard) are fully closed; §3 and §6 had their actionable items resolved and
> now carry only trigger-gated leftovers. What remains genuinely open: §3 items 1–4, §5 (in-game manual
> QA), and the conditional cleanups in §6.

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

## 2. Redundant `export` keywords — ✓ Completed 2026-06-30 (shipped v1.7.0)

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

> **Worked through 2026-06-30 (shipped v1.7.0).** The two-colour-map drift item was resolved by deciding intent (the
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
4. **Localization keys (`LABEL_KEYS` / `causeLabelKey()`)** — ✓ **Shipped v1.9.0.** `causeLabel()` and
   `causeHint()` now compose `LOC_EMIG_CAUSE_LABEL_*` / `LOC_EMIG_HINT_*` through `loc()`, with the
   English `LABELS` / `HINTS` maps kept as the off-engine fallback. (The old "Demographics renders metric
   labels raw" justification lapsed when Demographics 2.3.0 added `localizedMetricName()`.)

---

## 4. Latent robustness — mod-wide "reset persisted caches on game boot" — ✓ Completed 2026-06-30 (shipped v1.7.0)

Implemented as the **shared convention** the item called for (not a one-off). New module
[emigration-cache-reset.js](../ui/emigration-cache-reset.js) holds a per-isolate registry + a game-id
(`Configuration.getGame().gameSeed`) guard; all 12 persisted-cache modules (`notifications`, `dividend`,
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
- **Player-report round (Unreleased): network display + enclave reachability.** Off-engine tests cover
  the layout floor (`network-anim`), pinned pie shares, enclave stickiness + force relaxation
  (`composition`), and the pending/forming panel readout (`city-panel`). Still needs an in-game pass:
  confirm all settlements render on both network sub-views, that the Scaled/Civ Pop toggle no longer
  moves the flow-pie percentages, that the City Details panel shows the enclave-progress line, and that
  the new **Force enclave** option actually surfaces the decision modal for a qualifying local city
  (and that enclaves now occur in normal play with stickiness on).

## 5a. Deferred — notification DELIVERY (out of scope for the Unreleased player-report round)

The player also reported "notifications not working yet." Confirmed **not** part of the enclave fix: the
persistent Notifications *log* works (it's what surfaces the all-civ chronicle milestone entries the
player mistook for "the AI getting enclaves"), and the enclave decision uses the `showDilemma` modal,
not the notification feed. What remains deferred:

- **On-screen HUD toasts** are DOM-injected onto the HUD root (`emigration-feedback.js`) because the
  engine exposes no toast API; this is inherently fragile across GameFace updates. Revisit if toasts
  are reported missing after the z-order/first-turn fixes in v2.0.5.
- **Clickable end-turn engine notifications** need a DB `NotificationType` (see the note in
  `emigration-feedback.js` and README §"Engine notifications need a DB type"). Larger effort; deferred
  until there's appetite for the DB-side work.

## 6. More deferred module cleanups (low priority — chronicle-view / cities / city-features)

All parked with reasoning in the now-deleted per-module backlogs; only the genuinely-actionable or
conditional ones are kept here (the rest defended states the producer makes unreachable — don't
re-litigate).

> **Worked through 2026-06-30 (shipped v1.7.0).** The one genuinely-actionable item shipped: the chronicle-view
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
- **Phase 1 localization sweep** — ✓ **Shipped v1.9.0.** Done together as intended: the raw English user
  strings in `emigration-causes.js` (labels + hints) *and* `emigration-chronicle-view.js` (`"Turn "`,
  fallback title, empty-state prose, `KIND_LABEL`) now resolve through `LOC_*` keys via `loc()`. The pass
  also localized the display-time number formatting (`Locale.toNumber`, replacing `Intl.NumberFormat`)
  and restored three drifted translations (`SCOPE_INTERNAL/EXTERNAL`, `DEST_CLAUSE`) that were live in the
  per-language XML but missing from the i18n source.
- **Frozen-constants family** — the cause-keys (§3 item 1) and `CITY_FEATURE` keys are the same small,
  stable, additive set hand-typed across a few modules. Same call: centralizing adds computed-key churn
  for marginal safety. *Revisit if* a third consumer appears or a drift bug actually bites.

## 7. Latent guard note — `compositionForCity` — ✓ Completed 2026-06-30 (shipped v1.7.0)

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

- `devtools/migration-probe.js` is a separate diagnostic tool (own `migration-probe.modinfo`); its exports serve
  that probe and are not mod dead code.
- No orphaned *files* exist — every `ui/*.js` is listed in `emigration.modinfo` and runs.
- The mod's larger gameplay roadmap (Features A–K + deepened refugee stance + L–Z, plus the carried-over
  AA/AB in §17) lives in [feature-improvements-plan.md](feature-improvements-plan.md); those are net-new
  features, out of scope for the correctness/perf/maintainability review this file descends from.

---

## 9. Corpus bug-hunt findings (2026-07-10)

Open correctness items surfaced by the tower_mods-wide bug-hunt audit. Each carries
[severity · confidence] and a file:line. Not yet fixed. F1 is the load-bearing one.

- **F1 — [High · Confirmed] Age-boundary turn reset stalls the core pass and freezes decay clocks.**
  Sites: [emigration-main.js:296](../ui/emigration-main.js) (`lastLocalTurnRun`),
  [emigration-violence.js:299](../ui/emigration-violence.js) (`tickViolence`),
  [emigration-disasters.js:391](../ui/emigration-disasters.js) (`tickDisasters`),
  [emigration-effects.js:135](../ui/emigration-effects.js) (`tickAssimilation`),
  [emigration-combat.js:60](../ui/emigration-combat.js); notification variants
  [emigration-feedback.js:314](../ui/emigration-feedback.js) and `:837`. Each compares the current
  `Game.turn` against a retained/persisted turn marker, but `Game.turn` is **age-local and resets** at
  each age boundary — which is exactly why `emigration-state.js:266` maintains `monoTurn` ("never resets
  at age boundaries") and why `composition.js:485` / `dilemma.js:411` already switched to it. Failure:
  Antiquity ends at `Game.turn=133` so the markers freeze at 133; Exploration restarts at `Game.turn=1`,
  so `1-133 < turnInterval` early-returns the pass every turn (core sim dormant for most of the age) and
  `s.decayTurn=turn` sits *inside* the `if(elapsed>0)` guard so war/disaster distress never decays and
  never re-advances until the turn climbs past 133. Confirmed at both age transitions of every game (the
  persisted decay clocks are unconditionally affected; core-pass dormancy additionally depends on isolate
  lifecycle at the transition). **Fix:** gate these on the monotonic turn, or detect `turn < retainedTurn`
  and rebase the markers on age transition.
- **F2 — [Med · Plausible] Prosperity sign-flip ranks a devastated city as attractive.**
  [emigration-prosperity.js:213-214](../ui/emigration-prosperity.js): `factor = 1 + situationalPercent/100`
  applied unclamped; `situationalPercent` can fall below −100 and `baseScore` can be negative for a
  war-torn city, so `negative × negative = positive` and `bestDestination` can route refugees *into* the
  war zone. **Fix:** `const factor = Math.max(0, 1 + situationalPercent(s)/100);`.
- **R1 — [Med · Confirmed] Pool-sourced returnee can be silently lost (population leak).**
  [emigration-return.js:222-230](../ui/emigration-return.js): on the `fromPool` path
  `consumeForReturn` already popped a held refugee, but if `addRural(homeCity)` fails the undo is gated
  `if(!fromPool) addRural(hostCity)`, so nothing is restored and nothing delivered — 1 point vanishes,
  contradicting the file's "undone rather than leaking" promise. **Fix:** re-queue the pool on `addRural`
  failure for the `fromPool` branch.
- **R2 — [Med · Plausible] Host signal decremented even for a virtual-pool returnee.**
  [emigration-return.js:298-300](../ui/emigration-return.js): `syncSignalsForMove` unconditionally does
  `host.population -= 1; host.rural -= 1`, but on `fromPool` the person was never a settled rural
  resident, so the per-pass host signal is under-counted by 1. **Fix:** only mirror the host decrement when
  `!fromPool`.
- **F3 — [Low · Confirmed] `carryPlague`/`addDistress` bypasses the disaster accumulation cap.**
  [emigration-disasters.js:375-380](../ui/emigration-disasters.js) (called from
  [emigration-consequences.js:27](../ui/emigration-consequences.js)) does uncapped `byCity[key] += amount`
  unlike `stampDisaster`. **Fix:** route through `stampDisaster` / apply the `Math.min(cap, …)` clamp.
- **F4 — [Low · Confirmed] Empty-state column label uses an English substring test.**
  [emigration-city-flows.js:92](../ui/emigration-city-flows.js): `title.indexOf("Immigrants") === 0` on a
  localized string → wrong placeholder in non-English locales. **Fix:** pass an explicit direction flag.
- **F5 — [Low · Plausible] Stance-impact percent can render `(+-NN%)`.**
  [emigration-ledger-view.js:122-126](../ui/emigration-ledger-view.js) (+`:138`) and
  [emigration-detail-views.js:33-38](../ui/emigration-detail-views.js) divide by the *signed* baseline
  after a hard-coded `"+"`. **Fix:** divide by `Math.abs(neutral)` and take the sign from the impact.
- **F6 — [Low · Plausible] `breakdownTip` mislabels a non-node origin civ via `|| 0`.**
  [emigration-network-interact.js:196-198](../ui/emigration-network-interact.js):
  `scene.centers[scene.byId.get(oid) || 0]` collapses an unknown `oid` to node 0 (shows the first civ).
  `network-viz.js:300` uses `??` for the same trap. **Fix:** use `??`/`has()` and fall back to the dot's
  own `originName`.
- **F7 — [Low · Plausible] `collectPlayerCities` iterates outside its guard.**
  [emigration-cities.js:236](../ui/emigration-cities.js): the `try` wraps only `getCities()`; the
  following `for` loop and the caller `collectCitySignals` have no guard, so a truthy-non-iterable return
  would throw and abort the signal pass. **Fix:** `Array.isArray(cities)` guard or move the loop inside
  `try`.
- **F8 — [Low · Plausible] `normalizeViolence` doesn't sanitize numeric maps on load.**
  [emigration-violence.js:98-108](../ui/emigration-violence.js) copies `byCity`/`lastFrac` straight
  through; a corrupted save can seed `NaN` for one cycle (self-heals; reads are `isFinite`-guarded).
  **Fix:** sanitize numeric maps on load as disasters/war do.
- **L1 — [Low · Confirmed] Lens tooltips emit hardcoded English + raw percentages.**
  [emigration-prosperity-tooltip.js:44-50](../ui/emigration-prosperity-tooltip.js) (+`:61-67`) and
  [emigration-ethnicity-tooltip.js:36](../ui/emigration-ethnicity-tooltip.js) (+`:55,88,107`) emit raw
  English with no `loc()` and format percentages as `Math.round(t*100)+"%"` instead of `Locale.toPercent`.
  **Fix:** route through `loc()` with LOC keys and the locale percent formatter.
- **L2 — [Low · Plausible] `dilemma.js` `CHOICES` localized once at module-eval.**
  [emigration-dilemma.js:37-44](../ui/emigration-dilemma.js) calls `loc(...)` at top-level to build the
  frozen array, unlike `emigration-quarter-registry.js:52-60` which re-localizes per call. Small impact
  (UIScripts load after Locale is up). **Fix:** build the choices at call time.
- **Watch (isolate-cache class, audited separately) — migration-stats reader staleness.**
  [emigration-migration-stats.js](../ui/emigration-migration-stats.js) `load()` caches `_s` for the module
  lifetime and, unlike `composition.js`, does not re-read on turn change, so the City Details
  Departing/Arriving lists can show a frozen snapshot while the co-located Population-origins block stays
  fresh. Falls in the isolate-cache-reload class (audited clean overall); fix if confirmed = invalidate
  `_s` when `chartTurn`/`gameTurn()` advances.

### §9 — solution designs

Full designs for the findings above (keyed by ID). Grounded against the code 2026-07-10.

**F1 design — switch gating/decay to the monotonic turn.** Reuse the existing exported
accessor `monoTurn()` (`emigration-migration-stats.js:569` — returns the monotonic cross-age
`chartTurn`; already used by `dilemma.js:411`). For each site, `import { monoTurn } from
"/emigration/ui/emigration-migration-stats.js"` and replace the age-local turn read used
**for gating/decay** with `monoTurn()`:
- Persisted-marker sites — move BOTH the read and the marker write to `monoTurn()` together
  (else a save straddling the change mixes scales): `violence.js:299` (`s.decayTurn`),
  `disasters.js:391` (`s.decayTurn`), `effects.js:135` (`s.tickedTurn[pid]`),
  `feedback.js:314` (`s.lastToastTurn`).
- Module-level markers — in-session read/write only, no persistence concern: `main.js:295`
  (`lastLocalTurnRun`), `combat.js:60` (`_track[pid].turn`), `feedback.js:837` (`_cueTurn`).
- **No migration step.** After the switch an old save's persisted marker holds an age-local
  value smaller than `monoTurn()`, so the first `elapsed` is large-positive → a one-time
  near-full decay. That is *correct*: a whole age elapsed, so stale siege/disaster distress
  *should* decay. The existing `Math.max(0, …)` guards already prevent negative-elapsed
  corruption; add a code comment noting the one-time catch-up is intended.
- Do NOT touch `state.monoTurn` (a different pool-engine field) or `composition.js` (already
  mitigated via `Math.abs` in `pruneStale`).
- **Verify:** raise violence distress via a siege, transition Antiquity→Exploration, confirm
  (a) the pass runs on the first Exploration turn (not dormant) and (b) distress decays; add a
  unit test asserting `tickViolence` decays when `monoTurn` advances across a simulated reset.
- **IMPLEMENTED (revised approach).** The `monoTurn()` route was abandoned: importing
  migration-stats into these low-level modules pulls in its module-load side effect
  (`globalThis.EmigrationData = …`) which clobbers test mocks, and every decay unit test drives
  the clock via `Game.turn` (not `monoTurn`). Shipped the backlog's **fallback** instead —
  keep `gameTurn()` and rebase the retained marker down when `turn < marker` (age reset):
  `violence.js`/`disasters.js` (`if (turn < s.decayTurn) s.decayTurn = turn`), `effects.js`
  (extracted `elapsedSince(map,key,turn)` helper), `combat.js` (`if (t && turn < t.turn) t.turn = turn`),
  `feedback.js` cooldownOk (`if (s.lastToastTurn > turn) …`) + emitPressureCue (`turn >= last` guard),
  `main.js` (`if (turn < lastLocalTurnRun) lastLocalTurnRun = turn`). No migration-stats coupling;
  all 121 tests pass.

**F2 design — clamp the prosperity factor.** ~~`const factor = Math.max(0, 1 + situationalPercent(s) / 100);`~~
**REVISED — the `Math.max(0, factor)` clamp was wrong.** It also flattened the *intended*
behavior for a POSITIVE base: a routed city (base=38, violence saturated → factor=−1.2) must
slide to −45.6 (very unattractive), which the existing `testViolenceSlidesScoreDown` asserts;
clamping factor to 0 made it 0. The real bug is only the double-negative sign flip. **Shipped:**
```js
let p = base * factor;                       // factor = 1 + situationalPercent(s)/100
if (base < 0 && factor < 0) p = -Math.abs(p); // poor AND besieged: force negative, never a magnet
```
This keeps base>0 sliding into negative (−45.6 preserved) and fixes only base<0 × factor<0 →
spurious positive. **Verify:** `prosperity` harness green; base<0 & factor<0 now yields a
negative score, `bestDestination` never routes into it.

**R1/R2 design — one return.js correctness pass.**
- R1 (leak): in `moveReturnees` (`:222-230`), preserve the consumed refugee's `since` so it can
  be re-queued on `addRural` failure. Add a metadata-returning consume that mirrors the
  existing rollback helper `consumeOneForReshed` (`refugee-pool.js:261`, returns
  `{originCiv, since}`); on the `fromPool` branch, if `addRural(homeCity)` fails, restore via
  `queueRefugees(hostKey, originCiv, since, 1)` (`refugee-pool.js:223`) instead of dropping.
- R2 (miscount): return/propagate `fromPool` from `moveReturnees` to `planOneReturn` (`:298`)
  and have `syncSignalsForMove` (`:272`) decrement host `population`/`rural` only when
  `!fromPool` (pool refugees were never counted host rural residents), mirroring the same
  asymmetry `moveReturnees` already applies to `removeRural`.
- **Verify:** a pool-sourced return that then fails `addRural` leaves pool count unchanged
  (no net population change); host signals are unchanged for a pool-sourced return.

**Low-tail designs:**
- **F3** `disasters.js:375` `addDistress`: clamp on write —
  `s.byCity[k] = Math.min(disasterAccumCap, (s.byCity[k] || 0) + amount)` (reuse the
  `disasterAccumCap` that `stampDisaster` already applies).
- **F4** `city-flows.js:92`: pass an explicit `isArrivals`/`dir` boolean into the empty-state
  builder and branch on it, instead of `title.indexOf("Immigrants") === 0`.
- **F5** `ledger-view.js:122` (`stancePct`) + `detail-views.js:33`: divide by
  `Math.abs(neutral)` and derive the sign from the impact, so a negative baseline can't
  render `(+-NN%)`.
- **F6** `network-interact.js:196`: `const idx = scene.byId.has(oid) ? scene.byId.get(oid) : -1;`
  then `const node = idx >= 0 ? scene.centers[idx] : null;` (mirror `network-viz.js:300`'s
  `??`); fall back to the dot's own `originName`, and localize the `"#"+oid` label via `loc()`.
- **F7** `cities.js:236`: widen the `try` to enclose the `for` loop (or add
  `if (!Array.isArray(cities)) return;` before iterating) so a `buildSignal` throw can't abort
  the whole signal pass.
- **F8** `violence.js:98` `normalizeViolence`: coerce numeric maps to finite on load (reuse the
  same per-entry sanitizer disasters/war apply) so a corrupted save can't seed `NaN`.
- **L1** lens tooltips (`prosperity-tooltip.js:44-67`, `ethnicity-tooltip.js:36/55/88/107`):
  add `LOC_EMIG_*` keys to `text/en_us/ModText.xml` (convention `LOC_EMIG_<AREA>_<NAME>`) and
  route each string through `loc(key, english)` (`emigration-loc.js`). There is **no**
  `Locale.toPercent` in the mod — format percentages via `loc()` with a `{n_Pct}` placeholder,
  the pattern already at `detail-views.js:38`.
- **L2** `dilemma.js:37`: replace the module-eval `const CHOICES = [...]` with a
  `function choices() { return [...] }` so `loc()` resolves lazily after `Locale` is live
  (mirror `quarter-registry.js:52`); call `choices()` where `CHOICES` was read.
- **Watch** `migration-stats.js`: if confirmed, invalidate the module `_s` cache when
  `chartTurn`/`gameTurn()` advances so City Details re-reads fresh (isolate-cache class).

**Cross-cutting verify:** run `npm run verify` (lint + syntax + tests) and add/extend unit
tests for F1 (decay across simulated age reset), F2 (clamp), and R1/R2 (pool restore /
signal parity) — the mod already gates new tests through `verify` + `test:js`.
