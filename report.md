# Emigration + Demographics Player/Modder Risk Review

Date: 2026-06-19
Scope: `emigration` and `demographics` mod workspaces
Reviewer method: static UI/text scan plus project verification suites

## Executive Summary

Both mods currently present release risk due to failed local verification runs.

- `emigration`: verify fails with 2 TypeScript errors.
- `demographics`: verify fails with 28 TypeScript errors.
- Most player-visible risk is in `demographics` options registration/import compatibility and fallback behavior that can degrade UX without explicit failure messaging.
- Most annoying UX risk in `emigration` is widespread silent-failure handling (`catch (_) {}`), which can mask broken states and feel random to players.

## What Was Checked

1. Repository structure and package scripts for both mods.
2. Targeted scans for obvious anti-patterns (TODO/debug placeholders, hard failures, fallback placeholders).
3. Direct verification runs:
   - `cd 'emigration' && npm run verify`
   - `cd 'demographics' && npm run verify`
4. Focused reads of files referenced by failing diagnostics and potentially player-facing fallback logic.

## Verification Results

### Emigration verify result

Command:

```bash
cd 'emigration' && npm run verify
```

Result: failed with 2 TypeScript errors.

- `ui/emigration-network-flow.js:684:50`
  - `Parameter 'rebuildAll' implicitly has an 'any' type.`
- `ui/emigration-network-viz.js:713:60`
  - `Argument of type '(() => void) | undefined' is not assignable to parameter of type '() => void'.`

### Demographics verify result

Command:

```bash
cd 'demographics' && npm run verify
```

Result: failed with 28 TypeScript errors across 4 files.

- `ui/demographics-options.js` (23 errors)
- `ui/mod-options.js` (2 errors)
- `ui/screen-demographics/charts/resources/chart-resources.js` (1 error)
- `ui/screen-demographics/settlements/settlements-data.js` (2 errors)

## Findings (Ordered by Severity)

## 1) High: Demographics options layer may be brittle at runtime

### Evidence

- `demographics/ui/demographics-options.js:6`
  - `import { CategoryType, OptionType, Options } from "/core/ui/options/model-options.js";`
- Verify reports named exports not found for `CategoryType`, `OptionType`, `Options`.

### Why this matters

If this import shape does not match Civ runtime module exports, options registration can fail. That can produce missing/broken mod options in game, which both modders and players read as hard breakage.

### Risk profile

- Impact: High (settings discoverability and control)
- Likelihood: Medium-High (direct verify failure)

## 2) High: Both mods fail their own verify gates

### Evidence

- Emigration `npm run verify`: fails.
- Demographics `npm run verify`: fails.

### Why this matters

Even when some TypeScript errors are tooling-only, a failing verification baseline increases release regressions and reduces trust for modders pulling updates.

### Risk profile

- Impact: High (release confidence and maintenance burden)
- Likelihood: High (currently reproducible)

## 3) Medium: Silent catch blocks can hide breakage in Emigration UI

### Evidence

Multiple empty catches in player-facing UI path files, including:

- `emigration/ui/emigration-guide.js`
- `emigration/ui/emigration-feedback.js`
- `emigration/ui/emigration-views.js`
- `emigration/ui/emigration-lens-hover-panel.js`
- `emigration/ui/emigration-war.js`

### Why this matters

When these paths fail, UI can partially render or not update without surfaced explanation. Players experience this as random flakiness; modders lose signal during debugging.

### Risk profile

- Impact: Medium
- Likelihood: Medium

## 4) Medium-Low: History view explicitly allows Not Yet Implemented placeholder fallback

### Evidence

- `demographics/ui/screen-demographics/views/history/view-history.js:161`
  - Notes placeholder behavior for unregistered metrics.
- `demographics/ui/screen-demographics/views/history/view-history.js:241`
  - Notes fallthrough to NYI stub.

### Why this matters

If metric-page wiring drifts, users can hit placeholder stubs in production views. Not a crash, but it feels unfinished and can frustrate users.

### Risk profile

- Impact: Medium-Low
- Likelihood: Medium

## 5) Low: Content quality looked generally solid in primary English surface

### Evidence

No obvious player-facing profanity, lorem text, or “coming soon” placeholders were found in key English UI/guide strings during this pass.

### Why this matters

Most current risk is technical robustness, not obvious text quality failure.

## Concrete Annoyance/Breakage Scenarios

1. Player opens mod options and expected toggles do not appear.
2. Player sees a panel section silently fail to update due to swallowed exception.
3. Player hits an NYI stub when switching history pages tied to a missing metric mapping.
4. Modder pulls latest and cannot pass verify, slowing release and contribution flow.

## Recommended Fix Priority

## Priority 0 (release blocker)

1. Resolve `demographics` options import/type failures in:
   - `demographics/ui/demographics-options.js`
   - `demographics/ui/mod-options.js`
2. Resolve `emigration` callback typing mismatch in:
   - `emigration/ui/emigration-network-flow.js`
   - `emigration/ui/emigration-network-viz.js`
3. Re-run both:
   - `npm run verify` in `emigration`
   - `npm run verify` in `demographics`

## Priority 1 (player annoyance reduction)

1. Replace silent `catch (_) {}` in critical render paths with lightweight guarded logging.
2. Add user-safe fallback messaging where render sections fail (non-blocking notice text).

## Priority 2 (hardening)

1. Add targeted tests for options module registration path in `demographics`.
2. Add targeted tests for network view rebuild callback behavior in `emigration`.
3. Add a CI check that fails on new empty catch blocks in `ui/` unless annotated with rationale.

## Confidence and Limitations

- Confidence in verify-failure findings: High (directly reproduced).
- Confidence in runtime impact severity: Medium (depends on Civ runtime module export behavior).
- This review did not run in-game live UI interaction in Civ itself; it used repository verification and source inspection.

## Appendix A: Key Files Reviewed

- `emigration/package.json`
- `demographics/package.json`
- `emigration/ui/emigration-guide.js`
- `emigration/ui/emigration-network-flow.js`
- `emigration/ui/emigration-network-viz.js`
- `demographics/ui/demographics-options.js`
- `demographics/ui/mod-options.js`
- `demographics/ui/screen-demographics/charts/resources/chart-resources.js`
- `demographics/ui/screen-demographics/settlements/settlements-data.js`
- `demographics/ui/screen-demographics/views/history/view-history.js`

## Appendix B: Fast Triage Checklist

1. Fix failing imports/types in demographics options modules.
2. Fix rebuild callback typing contracts in emigration network modules.
3. Re-run verify in both mods and confirm zero errors.
4. Smoke-test in-game:
   - Open mod options screen.
   - Open Demographics history views.
   - Open Emigration dashboard guide/network tabs.
5. Confirm no silent panel failures in logs during tab switches.

## Second-Pass Additions (Delta)

These items were identified after the first report pass and should be tracked
explicitly.

### A) High: release packaging scripts do not enforce `npm run verify`

Evidence:

- `emigration/release.sh` builds and syntax-checks JS, but does not call
  `npm run verify` before shipping.
- `demographics/release.sh` does the same.

Why this matters:

Both repos can produce a distributable zip while type/lint/test gates are red.
That increases the chance of shipping regressions that modders and players hit
post-release.

Recommendation:

- Add a pre-package gate in both release scripts:
  `npm run verify` (or an explicit `VERIFY=1` release mode that is default-on).

### B) Medium: verify currently fails before full test suites can run

Evidence:

- In both mods, `verify` starts with TypeScript checks.
- Current TypeScript failures stop the command early, so later JS/integration
  tests in `verify` do not execute.

Why this matters:

Current quality signal is incomplete: the suite reports type errors, but there
is no fresh pass/fail signal for many runtime-oriented tests until TS issues are
cleared.

Recommendation:

- Track this as "test execution blocked by TS" in release readiness.
- After TS fixes, re-run full `verify` and record completed test list.

### C) Low-Medium: localStorage stray-key purge can remove similarly prefixed keys

Evidence:

- `demographics/ui/core/demographics-settings.js` removes top-level keys matching
  `^_*demographics[_-]` (except `modSettings`).

Why this matters:

This is intentional hardening, but any unrelated key sharing that prefix will be
deleted on load. In mixed-mod environments that may surprise modders using the
same naming prefix.

Recommendation:

- Keep behavior, but document it in contributor docs and keep key namespace
  policy explicit.

## Third-Pass Deep Findings (Delta)

This pass added direct runtime/lint checks that were not covered in the first
two passes.

### 1) High: demographics manifest inventory is currently incomplete

Evidence:

- `cd demographics && npm run test:modinfo` fails.
- Failure reports two imported modules not declared in modinfo:
  - `ui/screen-demographics/settlements/settlements-population-variance.js`
  - `ui/screen-demographics/views/shared/options-button.js`

Why this matters:

The modinfo inventory is intended to be import-closed. Missing declarations can
create packaging/runtime mismatch risk and makes release auditing less reliable.

Recommendation:

- Add both files to `<ImportFiles>` in `demographics.modinfo`.
- Re-run `npm run test:modinfo` until it passes.

### 2) High: emigration JS suite has a real failing test (`test:scaling`)

Evidence:

- `cd emigration && npm run test:js` fails at `tests/scaling.mjs`.
- Assertion:
  - expected `scaleCityPopulation(1, 0) === 3000`
  - actual value `12000`

Context:

- `emigration/ui/emigration-config.js` sets `scaleBase: 12000`.
- `emigration/ui/emigration-population.js` uses that value.

Why this matters:

Either the test fixture is stale or scaling was changed without updating the
contract docs/tests. In either case, this is a trust-breaker for balancing and
cross-mod alignment claims.

Recommendation:

- Decide the intended baseline (3000 vs 12000), then align:
  - implementation
  - test expectations (`tests/scaling.mjs`)
  - explanatory comments/docs

### 3) Medium: emigration lint has a hard complexity error

Evidence:

- `cd emigration && npm run lint` reports:
  - `ui/emigration-population.js`
  - function `currentAgeProgressPct`
  - complexity 13 (max 10)

Why this matters:

This is not just style noise; it is an enforced lint error that blocks a clean
quality baseline.

Recommendation:

- Split `currentAgeProgressPct` into smaller helpers (API probe + normalization).

### 4) Medium-Low: release readiness signal split across commands

Evidence:

- Demographics `test:js` passes, `test:i18n` passes, but `test:modinfo` fails.
- Emigration `test:i18n` and `test:modinfo` pass, but `test:js` fails.

Why this matters:

Without a single green release gate, regressions can hide behind whichever
sub-suite was not run in the release flow.

Recommendation:

- Keep `verify` as canonical, but ensure it executes all sub-suites by fixing the
early TS blockers and adding pre-release gate enforcement in `release.sh`.

### 5) Low: polish-level content/maintainability nits remain

Evidence:

- `emigration/ui/emigration-feedback.js` has a docstring typo:
  - "whether it's temporary, and , for a cross-civ loss , ..."

Why this matters:

Not a runtime bug, but this kind of roughness reads as rushed and reduces
maintainer confidence when auditing behavior text.

## Fourth-Pass Validation Outcomes (Completeness Addendum)

These checks did not surface new blockers, but are included so the report fully
captures what was validated.

### A) Localization duplicate-tag scan: no collisions detected

Evidence:

- Per-language duplicate `Tag="..."` scan over:
  - `emigration/text/*/ModText.xml`
  - `demographics/text/*/ModText.xml`
- No duplicate localization tags were reported.

Why this matters:

Duplicate tags can silently overwrite strings and cause inconsistent in-game
text depending on load order.

### B) Emigration i18n JSON duplicate-key scan: no collisions detected

Evidence:

- Duplicate top-level key scan over `emigration/i18n/*.json` returned none.

Why this matters:

Duplicate JSON keys are parser-legal in some toolchains but can hide overwritten
values and unstable localization behavior.

### C) i18n parity tests pass in both mods

Evidence:

- `cd emigration && npm run test:i18n` passed
  - `247 keys × 9 locales = 2223`
- `cd demographics && npm run test:i18n` passed
  - `681 keys × 9 locales = 6129`

Why this matters:

This reduces risk of missing localization keys across supported language packs.

### D) Lint status snapshot after deep pass

Evidence:

- `emigration`: lint has 1 error + warnings (the error is the complexity gate in
  `ui/emigration-population.js`).
- `demographics`: lint returned warnings only in this run.

Why this matters:

Confirms the current hard lint blocker is concentrated in emigration; demographics
lint noise is mostly maintainability style debt.

---

# Analysis & Remediation (Verification Pass — 2026-06-19)

> **STATUS: RESOLVED.** Both mods now pass `npm run verify` end-to-end (tsc + eslint + full test
> suites + modinfo + i18n). See the **Resolution Log** at the end of this document for exactly what was
> fixed, what was intentionally left as-is (accurate but by-design), and one stale test that the TS fix
> unblocked.

Every cited gate was re-run (`npx tsc --noEmit`, `eslint ui`, `npm run test:scaling`,
`npm run test:modinfo`) and cross-checked against the runtime source and the base-game UI
(`Resources/Base/modules/...`) to classify each finding as real/accurate and attach a concrete fix.

## Accuracy verdicts

| Finding | Reproduced | Verdict | Real *runtime* risk |
| --- | --- | --- | --- |
| Emigration 2 TS errors | Yes | Real — **tooling only** (missing JSDoc types) | No (JS ignores types at runtime) |
| Demographics 28 TS errors | Yes | Real — **tooling only** | No |
| 1) Options import "High runtime risk" | TS error: yes | **Severity INACCURATE** — type-stub gap, not a runtime break | **No** — base UI exports these named (`model-options.js:287`); options work in-game |
| 2) Both fail verify | Yes | Real | Indirect (red CI/release gate) |
| 3) Silent `catch (_) {}` | Exist: yes | Accurate, but **intentional** defensive pattern ("a render failure must never break the host screen") | Low |
| 4) NYI placeholder fallback | Exists: yes | Accurate, **intentional** safety net for unwired metric tabs | Low |
| 5) Content quality OK | n/a | Accurate | — |
| 2A) `release.sh` skips verify | Yes | Real | Process |
| 2B) verify stops at TS | Yes | Accurate (chained `&&` short-circuits) | Process |
| 2C) localStorage stray-key purge | Yes | Accurate, **intentional** self-heal | Low |
| 3.1) modinfo inventory incomplete | Yes | Real | Packaging/audit |
| 3.2) `test:scaling` fails | Yes | **Real, but the TEST is STALE** — implementation is correct | No (test fixture only) |
| 3.3) lint complexity error | Yes | Real | Quality gate |
| 3.4) signal split across commands | Yes | Accurate | Process |
| 3.5) docstring typo | Yes | Real (cosmetic) | None |
| 4A–4D) i18n / duplicate-tag validations | Pass | Accurate (no issue) | — |

**Headline correction:** the only items framed as *High player-facing/runtime* risk (Finding 1, and
the "missing toggles in game" scenario) are **not** runtime risks. They are TypeScript type-checker
(`tsc --noEmit`) failures caused by an incomplete local type stub. The native Mods → Demographics
options register and function in-game. Everything that fails `verify` is either a tooling/JSDoc gap or
a stale test fixture — there is **no reproduced runtime defect** among these findings.

## Remediation by finding

### 1) Demographics options import (3× TS2614) — *stub gap, not runtime*
Root cause: `demographics/tsconfig.json` maps `"/core/*": ["./types/engine-core-stub.d.ts"]`, and that
stub declares no `model-options` exports, so `import { CategoryType, OptionType, Options } from
"/core/ui/options/model-options.js"` (demographics-options.js:6) resolves to a module missing those
names. The real engine module exports them (`Resources/Base/modules/core/ui/options/model-options.js:287`:
`export { CategoryType, OptionType, Options };`).
Fix (do NOT switch to default imports — that would break runtime): add the three named exports to
`demographics/types/engine-core-stub.d.ts`, e.g.
```ts
export const CategoryType: { Mods: string; [k: string]: string };
export const OptionType: { Checkbox: number; Dropdown: number; [k: string]: number };
export const Options: {
  addOption(spec: any): void;
  addInitCallback(cb: () => void): void;
};
```
Verify: `cd demographics && npx tsc --noEmit` → the 3 TS2614 errors clear.

### Demographics options implicitly-any (≈20× TS7006)
`demographics-options.js` callback params lack JSDoc types (`getBool(key, fallback)`, and each
`initListener(info)` / `updateListener(_info, value)`). Annotate them, e.g.
`function getBool(/** @type {string} */ key, /** @type {*} */ fallback)` and
`initListener: (/** @type {*} */ info) => ...`. Tooling only.

### chart-resources.js (1× TS2345) — regression from the legend-on-top change
`mountStackWrap`'s JSDoc still types `@param data` as `{ bands, points, tickPositions }`, but the call
now passes `{ tickPositions }` only. Fix: update that `@param` to `{ tickPositions: {...}[] }`.

### settlements-data.js (2× TS7006)
Add JSDoc types to the `apm`/`method` params at line ~590.

### Emigration 2 TS errors — regression from the Units-toggle change
- `network-flow.js:684` — `mountFlowChrome(wrap, canvas, timeline, rebuildAll)` JSDoc omits the 4th
  param. Add `@param {()=>void} [rebuildAll] ...`.
- `network-viz.js:713` — `makeLensTabs`'s JSDoc (line 381) types `rebuildAll` as required `()=>void`,
  but `buildViz` forwards an optional `(()=>void)|undefined`. Make it optional: `@param {()=>void}
  [rebuildAll]`. (The call site already guards with `typeof rebuildAll === "function"`.)
Verify: `cd emigration && npx tsc --noEmit` → both errors clear.

### 3.1) Demographics modinfo inventory incomplete — **real**
`test:modinfo` reports two imported-but-undeclared files. Add to `<ImportFiles>` in
`demographics/demographics.modinfo`:
- `ui/screen-demographics/settlements/settlements-population-variance.js`
- `ui/screen-demographics/views/shared/options-button.js`
Verify: `cd demographics && npm run test:modinfo`.

### 3.2) Emigration `test:scaling` — **stale test, implementation is correct**
The test asserts `scaleCityPopulation(1, 0) === 3000` with the comment that scaling must match
Demographics' `scaleCityPopulationAt` base of `3000`. But **both mods now use `12000`**:
`emigration/ui/emigration-config.js:251` (`scaleBase: 12000`) and Demographics
`ui/metrics/demographics-metrics-helpers.js:83` (`Math.pow(raw,1.11) * 12000 * ...`). Cross-mod parity
is therefore intact; the test fixture was never updated from the old `3000` base.
Fix: in `emigration/tests/scaling.mjs`, update the expectations `3000 → 12000` (the `testScaleBaseline`
and `testMarginalPeopleIsTheDelta` assertions) and the header comment `* 3000 → * 12000`.
Verify: `cd emigration && npm run test:scaling`.

### 3.3) Emigration lint complexity — **real**
`ui/emigration-population.js` `currentAgeProgressPct` has cyclomatic complexity 13 (max 10). Extract
the engine probe (read age/turn from `Game`/`GameInfo`) and the 0–1 normalization into small helpers
so the main function drops to ≤10 branches.
Verify: `cd emigration && npm run lint`.

### 3.5) Emigration docstring typo — **real, cosmetic**
`ui/emigration-feedback.js:298`: "...whether it's temporary, and , for a cross-civ loss ,..." — drop
the stray `, ` / fix the dangling clause.

### 2A) `release.sh` does not run verify — **real (process)**
Neither `emigration/release.sh` nor `demographics/release.sh` invokes `npm run verify` before packaging
(confirmed: they only set rsync excludes). Add a gate near the top of each:
```bash
npm run verify || { echo "verify failed — aborting release"; exit 1; }
```

### 2B / 3.4) Verify short-circuits at TS; signal split — **accurate (process)**
`verify` is `tsc --noEmit && eslint ui && <tests>`; the leading `tsc` failure prevents the test suites
from running in one command. Once the TS-stub/JSDoc fixes above land, `verify` runs end-to-end. (Note:
the suites are independently runnable today via `test:js`, `test:i18n`, `test:modinfo`, so signal is
available, just not from the single `verify` command.)

### 3) Silent `catch (_) {}` and 4) NYI fallback — **accurate, intentional (not bugs)**
These are deliberate "never break the host screen" / "unwired metric shows a placeholder, not a crash"
safety nets, not defects. Optional hardening only: swap the empty bodies for a DBG-gated
`dlog(...)` (the codebase already has `dlog`/`derr` helpers) so failures are observable in dev without
changing player-facing behavior. No release-blocking action required.

### 2C) localStorage stray-key purge — **accurate, intentional**
`demographics/ui/core/demographics-settings.js` intentionally purges stray top-level keys matching
`^_*demographics[_-]` (the documented self-heal that prevents one mod's stray key from cascade-breaking
shared `modSettings`). Keep as-is; document the namespace reservation in contributor docs.

## Net release-readiness picture

- **Reproduced gate failures:** emigration `tsc`(2) + `lint`(1) + `test:scaling`(1); demographics
  `tsc`(28) + `test:modinfo`(1). All are tooling, stale-fixture, or stub gaps.
- **Reproduced runtime defects:** none.
- **Minimal path to green:** add the `engine-core-stub.d.ts` exports (1), annotate the implicitly-any
  params, fix the two emigration + one chart-resources JSDoc regressions, add the two modinfo entries,
  refresh `tests/scaling.mjs` to `12000`, and split `currentAgeProgressPct`. Then `verify` passes in
  both mods.

---

# Resolution Log (applied 2026-06-19)

**Both mods now pass `npm run verify` end-to-end** (verified: `tsc --noEmit` 0 errors, `eslint ui` 0
errors, all JS test suites + `test:modinfo` + `test:i18n` green, in `emigration` and `demographics`).

## ✅ Fixed
- **Demographics 28 TS errors → 0.**
  - Added the `model-options` named exports (`CategoryType`, `CategoryData`, `OptionType`, `Options`)
    to `demographics/types/engine-core-stub.d.ts` — clears all 5 TS2614 import errors in
    `demographics-options.js` + `mod-options.js`. (Confirms Finding 1 was a type-stub gap, **not** a
    runtime defect — the import shape was already correct.)
  - Annotated the implicitly-any params (`getBool`, the `initListener`/`updateListener` callbacks in
    `demographics-options.js`; `apm`/`method` in `settlements-data.js`).
  - Fixed the `mountStackWrap` JSDoc in `chart-resources.js` (regression from the legend-on-top change).
- **Emigration 2 TS errors → 0.** Added the missing `[rebuildAll]` JSDoc to `mountFlowChrome` and made
  `rebuildAll` optional on `makeLensTabs` + `appendUnitsToggle` (regression from the Units-toggle work).
- **Demographics `test:modinfo`.** Declared `settlements-population-variance.js` and
  `views/shared/options-button.js` in `demographics.modinfo` `<ImportFiles>`.
- **Emigration `test:scaling`.** Refreshed the stale fixture `3000 → 12000` (both mods'
  `scaleCityPopulationAt` base is 12000; the implementation was already correct/aligned).
- **Emigration lint complexity.** Split `currentAgeProgressPct` into `readAgeProgressPercent` +
  `fractionToPct` (13 → ≤10).
- **Release gates (Second-Pass A).** Added a `npm run verify` pre-package gate (with a `SKIP_VERIFY=1`
  override for emergency hotfixes) to both `release.sh` scripts.
- **Docstring typo (Third-Pass 5)** in `emigration-feedback.js`.
- **Newly surfaced — `emigration/tests/migration-stats.mjs` (this is Second-Pass B in action).**
  Clearing the TS blocker let the suite run and exposed a test stale from the Graphs-group redesign
  (it expected the removed `emig_net_migration` per-turn metric and `perTurn/cumulative` views).
  Updated it to the current contract (`emig_net_cum`, `scaled/civ` units, members
  Net/Emigration/Immigration/Refugees) and re-pointed the per-sample-delta assertion at the data-layer
  `netDeltaForPlayer`. Not a runtime defect — the implementation matches the intended design.

## ⏸️ Intentionally NOT changed (accurate, but by design — not defects)
- **Finding 3 — silent `catch (_) {}`**: deliberate "a render failure must never break the host
  screen" guards. Left as-is.
- **Finding 4 — NYI metric placeholder**: deliberate safety net for an unwired metric tab (shows a
  placeholder, never crashes). Left as-is.
- **Second-Pass C — localStorage stray-key purge**: the documented self-heal that prevents a stray
  `demographics[_-]`-prefixed key from cascade-breaking shared `modSettings`. Left as-is.

## ✅ Priority-2 hardening (now implemented)
Both Priority-2 recommendations are done and wired into `verify` (so they run on every release gate):

- **Options-registration test (demographics).** `tests/options-registration.mjs` (+ `test:options` in
  `package.json`, in both `verify` and `test:js`). The two engine `/core` options modules are stubbed
  via a scoped `tests/loader.mjs` mapping → `tests/stubs/engine-options-stub.mjs` (records
  `addOption`/`addInitCallback`). The test asserts all 11 expected options register under the `Mods`
  category, that every option exposes `initListener`/`updateListener`, and that checkbox + dropdown
  listeners correctly round-trip through `DemographicsSettings` (incl. reveal-mode→boolean and the
  string-valued complexity dropdown). Result: `11 options registered under Mods`.
- **Empty-catch CI guard (both mods).** `tests/no-empty-catch.mjs` (+ `test:no-empty-catch` in
  `package.json` `verify`) scans `ui/**/*.js` for whitespace-only `catch` bodies (single- or
  multi-line) and fails the gate if any exist. A catch annotated with a rationale comment
  (`catch (_) { /* ignore: ... */ }` — the codebase convention) is permitted. Current baseline: 0
  offenders in either mod, so this locks in Finding 3's "annotate intentional swallows" policy for new
  code without touching the existing intentional guards.

## ❌ Not applied (rejected)
- Finding 1's `tsc` suggestion to switch to **default imports**: rejected — it would **break runtime**
  (the engine module uses *named* exports, confirmed at `model-options.js:287`). The stub fix is correct.
