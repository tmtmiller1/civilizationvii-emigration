# Emigration - Critical Code Quality Evaluation

Date: 2026-07-16 (report file retained from 2026-07-13)
Mod: emigration
Status: RESOLVED — `npm run verify` passes end-to-end (exit 0).

## Verification Evidence

- Command: `npm run verify`
- Final result: PASS (exit 0), full chain including `validate-package`.
- Starting point: FAIL at `tsc --noEmit` with 18 TypeScript errors across 4 enclave modules.

The TypeScript failure was masking the rest of the chain: fixing it unblocked verify and revealed
two further pre-existing failures further down the pipeline. All three were remediated. None were
confirmed player-facing runtime breakage — each was a typing gap, a stale test, or a stale validator.

## What was fixed

### 1) 18 TypeScript errors (release gate red) — type-only fixes

All 18 errors were JSDoc/typing strictness gaps, fixed without touching runtime control flow:

- `types/engine-core-stub.d.ts`: declared `ProductionChooserScreen` (see finding below).
- `ui/emigration-enclave-gate.js`: annotated `logEmit`'s param and the `updateCategories(items)` param.
- `ui/emigration-enclave-markers.js`: typed the module globals `_group`/`_grid` and `logEmit`'s param;
  the downstream implicit-any usages cleared once the globals were typed.
- `ui/emigration-enclave-probe.js`: annotated `sendBuild`'s params and widened the nullable `plot`
  (and `locFromIndex`'s `idx`, `sendPurchase`'s `plot`) to `number|null`. The send helpers already
  resolve the plot via `locFromIndex` and early-return on failure, so this is a pure type widening.
- `ui/emigration-composition.js`: added the required `name: cityName(city)` to the TEST-ONLY
  `seedEstablishedForeign` ledger seed, matching how the real recorder populates `name`.

### 2) Corrected finding: enclave gate import is runtime-correct

The `import { ProductionChooserScreen }` in `ui/emigration-enclave-gate.js` was reported by TS as
"no exported member" with a default-import suggestion. This looked like a possible runtime module-shape
mismatch but is NOT: the shipped game module
(`base-standard/ui/production-chooser/panel-production-chooser.js`) exports the class as a NAMED export
(`export { ProductionChooserScreen }`). The error came only from the mod's catch-all engine type stub
not listing that member. Fix: declared it in the stub. The import was intentionally NOT changed to a
default import — doing so would have broken the in-game decorator path.

### 3) `tests/migration-stats.mjs` stale expectation (`Population Share`)

After the TS fix, verify advanced and failed here: the graphs group's actual members include
`Population Share`, the test's expected list did not. `Population Share` is a deliberately shipped
member of the Graphs group (`ui/emigration-demographics.js`, added right after `Population` with a full
explanatory comment). The test was simply stale. Fix: added `Population Share` to the expected label
list in the test. No runtime change — the mod's behavior was already correct.

### 4) `tests/validate-package.mjs` false-positive on enclave LOC keys

Verify then failed at `validate-package` claiming ~180 undefined LOC keys
(`LOC_IMPROVEMENT_EMIG_ENCLAVE_*_NAME/DESCRIPTION/TOOLTIP`). This was a validator gap, not missing
content: those 135 en_us keys ARE defined, in `text/en_us/EnclaveText.xml`, which IS registered in the
modinfo. The validator's "defined keys" set was built only from `text/en_us/ModText.xml`, so it never
saw the dedicated enclave file. Fix: the data-LOC-reference check (§5) now treats every `text/en_us/*.xml`
file as a key-definition source; the per-locale parity check (§4) is unchanged and still governs only the
ModText.xml translation surface. The enclave text is en_us-only by design (other locales fall back to
en_us until translated), so the game does not crash — the warning was a false alarm.

## Remaining (non-blocking) observations

- Enclave improvement text is en_us-only; no locale carries translations yet. This is acceptable at
  runtime (en_us fallback) and is intentionally exempt from the strict per-locale parity gate, but the
  translations remain a follow-up if full localization is desired before a wider release.
- The unblocking fixes lean on broad `*` JSDoc annotations to clear implicit-any; narrower local typedefs
  for the enclave marker overlay handles and probe callback signatures would harden the new surface.

## Confidence and Limits

- Confidence in the verify result: high (full chain executed to exit 0 before and after each fix).
- The one item that looked runtime-relevant (the gate import) was verified against the shipped game
  module and confirmed a type-stub gap only.
- This pass is code-quality / release-gate focused, not gameplay-balance validation.
