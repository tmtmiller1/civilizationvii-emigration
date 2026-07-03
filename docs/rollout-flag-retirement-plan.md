# Rollout-Flag Retirement & Legacy-Path Removal Plan

**Status:** Proposed (not started)
**Date:** 2026-07-02
**Scope:** `emigration` mod only (`civilization_vii_mods/tower_mods/emigration`)
**Author context:** Follow-up to a complexity audit asking "is there code/game-logic we don't
genuinely need, or that overcomplicates the mod?"

---

## 1. Executive summary

The emigration mod is **not accidentally complex.** The 103 UI files / ~31 k LOC are a deliberate
consequence of a ≤500-line single-concern file gate, and nearly every system is documented,
config-gated, and mutation-tested. "Overly complicated" is therefore **not** a code-hygiene problem
and **not** a case for collapsing files or cutting features.

There is exactly one class of genuinely removable carrying cost: **internal "rollout" / reversibility
flags whose `false` branch is legacy code that ships in every build but never runs in real play.**
These were rollback hatches for behavior changes that have since shipped and been validated across
multiple releases. The codebase pays for them permanently — a second implementation to read,
maintain, test, and mutation-cover — for a rollback we will almost certainly never take.

The flagship is `splitTracksEnabled`, which gates a complete **~150-line duplicate engine pass**
(`processSourceLegacy`) plus its own dedicated test coverage.

This plan retires those internal flags in priority order, deletes the dead branches, and removes three
already-dead config keys — with **zero player-visible behavior change** and the test/mutation suite
green between every step.

---

## 2. Goals / non-goals

### Goals
- Remove legacy code paths that never execute under shipped defaults.
- Shrink the "can be off" surface (fewer branches → smaller test + mutation matrix, less to reason about).
- Delete three config keys documented as inert.
- Preserve every player-visible behavior exactly (this is a refactor, not a balance change).

### Non-goals (explicitly out of scope)
- **Not** touching player-facing feature toggles. `disastersEnabled`, `bordersEnabled`,
  `quartersEnabled`, `getDilemmasEnabled`, `returnEnabled`, `integrationEnabled`, `civTuningEnabled`,
  `attritionEnabled`, `happinessShaped`, `warSiege`, `refugeePoolEnabled` are real on/off switches
  wired to Options/tunables — their `false` paths are **features**, not dead code. Keep them.
- **Not** consolidating "overlapping-sounding" systems (violence / violence-signals / war / raid /
  combat / disasters; dilemmas + cultural quarters). These are distinct scope choices, and the
  narrative ones are player-toggleable. Removing them would be a *design/scope* decision, not a
  dead-code cleanup — out of scope here.
- **Not** merging files or relaxing the 500-line gate.
- **Not** a rebalance. Numeric tunables are untouched.

---

## 3. Classification methodology

Each `*Enabled` flag was classified by whether it is **reachable by a player**:

> A flag is scanned for references in `emigration-tunables.js`, `emigration-options.js`,
> `emigration-settings.js`, and `ui/options/`. **Zero references = internal-only** (player can never
> flip it → its off-path is unreachable in normal play → legacy carrying cost).

24 `*Enabled` flags total. Result:

| Class | Flags | Disposition |
|---|---|---|
| **Player-exposed** (off-path is a feature) | `disastersEnabled`, `bordersEnabled`, `quartersEnabled`, `getDilemmasEnabled`, `returnEnabled`, `integrationEnabled`, `civTuningEnabled`, `attritionEnabled`, `happinessShaped`, `warSiege`, `disasterImpactScalingEnabled`, `disasterSpeedShockEnabled` | **KEEP** — do not touch |
| **Internal rollout — heavy branch** | `splitTracksEnabled`, `splitBudgetsEnabled`, `splitUiReadoutEnabled` | **RETIRE** (WS1) |
| **Internal rollout — cheap fail-safe guard** | `gameSpeedTuningEnabled`, `polityModelEnabled`, `deathRampEnabled`, `conquestMigrationEnabled`, `crisisDeathEnabled`, `voluntaryCueEnabled` | **RETIRE, optional/low-priority** (WS2) |
| **Internal but a genuine safety backstop** | `resetCachesOnGameBoot` | **KEEP** (see §7) |
| **Sub-flags of an exposed system** | `refugeePoolBurdenEnabled`, `plagueCarryEnabled`, `split* (UI subset)` | KEEP with parent |

Plus three **inert config keys** (not flags): `scaleBase`, `scaleExp`, `scaleGrowth` → **REMOVE** (WS3).

---

## 4. Inventory & touchpoints

Line numbers are indicative (verify against HEAD before editing).

### WS1 — heavy legacy branches (high value)

| Flag | False-path = dead code | Primary touchpoints | Test touchpoints |
|---|---|---|---|
| `splitTracksEnabled` | `processSourceLegacy` + `legacyEmigrate` / `belowEmigrationBar` / `restingOnCooldown` — a full alternate ~150-line source pass | `emigration-engine.js` (gate ~L573; legacy fn ~L416+), `emigration-config{,-types}.js` | `engine-legacy-snapshots.mjs` (item 1 only — see §7), `engine-rigor.mjs`, `engine-pass.mjs`, `city-readout-panel.mjs` |
| `splitBudgetsEnabled` | shared single-budget branch | `emigration-engine.js` (~L890–L900), `emigration-config{,-types}.js` | `engine-rigor.mjs`, `engine-pass.mjs` |
| `splitUiReadoutEnabled` | second "one dominant cause" readout renderer | `emigration-city-readout.js`, `emigration-city-readout-data.js`, `emigration-config{,-types}.js` | (none direct) |

### WS2 — cheap fail-safe guards (low value, optional)

Each off-path is a one-liner neutral fallback (`return 0/1/identity` or an early guard). Removing them
buys little code but shrinks the branch/test matrix. Weigh case-by-case; some are arguably *defensible
defensive coding* (graceful degradation). See §6 for the judgment call.

| Flag | Off-path | Touchpoint | Tests |
|---|---|---|---|
| `gameSpeedTuningEnabled` | `speedScale()` returns identity 1 | `emigration-game-speed.js:74` | `game-speed*.mjs`, `disasters.mjs`, `engine-rigor*.mjs` |
| `polityModelEnabled` | polity bonus returns 0; war-weary term skipped | `emigration-prosperity.js:96,189` | `prosperity.mjs` |
| `deathRampEnabled` | ramp multiplier returns 1 | `emigration-engine.js:623` | `engine-rigor*.mjs` |
| `conquestMigrationEnabled` | early `return` in capture handler | `emigration-main.js:176` | (none direct) |
| `crisisDeathEnabled` | crisis-while-fleeing death suppressed | `emigration-engine.js:636,648` | `engine-rigor*.mjs`, `engine-pass.mjs` |
| `voluntaryCueEnabled` | rising-pressure cue suppressed | `emigration-engine.js:88` | (none direct) |

### WS3 — inert config keys

| Key | Evidence of inertness | Touchpoints |
|---|---|---|
| `scaleBase`, `scaleExp`, `scaleGrowth` | `emigration-config.js:497` header: *"DEPRECATED, no longer read … retained only so saved configs / config-types stay valid; they are inert."* The `game-speed.js:136` and `tunables.js:13` hits are **comments only** (tunables.js:13 literally says they are "intentionally absent" as knobs). | `emigration-config.js` (CONFIG + CONFIG_DEFAULTS), `emigration-config-types.js` (typedef) |

> Note: `gameSpeedScalePopulation` (config.js:58, live at `game-speed.js:144`) *mentions* the
> `scaleGrowth` concept in its comment but does **not** read the key. It is a separate, live flag —
> leave it alone.

---

## 5. Workstreams & sequencing

Do these **one flag at a time**, suite green between each. Order = value-first, and heavy items before
the cheap ones so early PRs carry the payoff.

### WS1.1 — `splitTracksEnabled` (biggest single win)
1. In `emigration-engine.js`: inline `processSourceSplit` into `processSource` (drop the `if
   (CONFIG.splitTracksEnabled)` fork), delete `processSourceLegacy`, `legacyEmigrate`,
   `belowEmigrationBar`, `restingOnCooldown` and any helper now unreferenced.
2. In `engine-legacy-snapshots.mjs`: **delete only item (1)** (the legacy-pass coverage). **Keep items
   (2) the stance counterfactual and (3) the citySnapshot readers** — they share the fake world and are
   unrelated to the flag. Rename the file if "legacy" no longer describes it.
3. Remove `splitTracksEnabled` from `CONFIG`, `CONFIG_DEFAULTS`, and the `EmigrationConfig` typedef.
4. Update `README.md` §2 ("Two concurrent tracks") to drop the "flags exist so the split is reversible"
   note; the split is now unconditional.

### WS1.2 — `splitBudgetsEnabled`
1. In `emigration-engine.js` (~L890–L900): keep the split-budgets branch, delete the shared-pool
   branch and the `budgets.shared` plumbing it feeds.
2. Remove flag from config + typedef; prune `engine-rigor.mjs` / `engine-pass.mjs` cases that set it false.

### WS1.3 — `splitUiReadoutEnabled`
1. In `emigration-city-readout{,-data}.js`: keep the per-cause breakdown, delete the single-dominant-cause
   renderer branch.
2. Remove flag from config + typedef.

### WS2 (optional) — cheap guards
For each of the six: keep the active path, delete the `false` early-return/identity branch, remove the
flag from config + typedef, and prune any test case that sets it false. Land each as its own small commit.
**See §6 before doing these** — they may be worth keeping as fail-safes.

### WS3 — dead scale keys
1. Delete `scaleBase`, `scaleExp`, `scaleGrowth` from `CONFIG` and `CONFIG_DEFAULTS`
   (`emigration-config.js:501-503`).
2. Delete their `@property` lines from the `EmigrationConfig` typedef in `emigration-config-types.js`.
3. **Confirm saved-config compatibility first** (see §7): the settings loader must tolerate an old saved
   config that *contains* these keys. If it rejects unknown keys, either (a) keep the keys, or (b) add a
   drop-unknown-keys shim before removing.

---

## 6. The judgment call on WS2 (be honest about this)

WS1 and WS3 are unambiguous wins: real duplicate implementations and documented-dead keys.

WS2 is a genuine tradeoff, not a slam-dunk. Each of those six off-paths is a **one-line neutral
fallback** — `return 1`, `return 0`, or an early guard. Two readings:

- **Remove:** they're unreachable in real play (not player-exposed), so they're branches that exist only
  to be tested. Deleting them shrinks the mutation matrix and the "this could be off" cognitive surface.
- **Keep:** a fallback like `if (!gameSpeedTuningEnabled) return 1` is cheap, self-documenting
  graceful degradation. It costs ~1 line and one test case, and it makes the module's behavior legible
  ("with tuning off, this is identity"). That's arguably *good* defensive coding, not cruft.

**Recommendation:** do WS1 + WS3 first and ship them. Treat WS2 as opt-in cleanup, decided per flag —
retire the ones whose false-branch touches multiple call sites or complicates a hot path
(`crisisDeathEnabled` threads through the death channel), and leave the pure one-line identities
(`gameSpeedTuningEnabled`, `deathRampEnabled`) if they read as clean fail-safes. Do **not** treat "10
flags retired" as a target — that would be metric-chasing over judgment.

---

## 7. Explicitly retained (with justification)

- **`resetCachesOnGameBoot` — KEEP.** Although internal-only, this is **not** a rollout hatch for a
  behavior change. It is a *latent-robustness safety backstop* for the UIScript-isolate reuse bug
  (a new game starting inside a still-live isolate persisting the prior game's cached state — the same
  class of isolate hazard behind the earlier ethnicity-lens bug). Its `false` path ("rely on isolate
  teardown") is a legitimate fallback, and the whole `emigration-cache-reset.js` convention is a
  deliberate defensive layer. Removing the flag would delete a safety net, not dead weight. Leave it.
- **All player-exposed flags (§2 non-goals).** Off-paths are reachable features.
- **`disasterImpactScalingEnabled` / `disasterSpeedShockEnabled`.** Player-exposed (appear in the
  options/tunables scan) and each "fail-safes to the legacy numbers" — that legacy path is reachable, keep.

---

## 8. Verification protocol (per step)

Run between **every** flag removal, not just at the end:

1. **Type/lint:** `npm run lint` (eslint config enforces the file-size + max-params gates).
2. **Unit/integration:** `node scripts/run-tests.mjs` (full `tests/` suite must stay green).
3. **Mutation (targeted):** run the relevant Stryker config for the touched module
   (`stryker.leaf.config.json` / `stryker.engine.config.json`). **Per the no-metric-masking rule:** do
   not exclude the deleted branch from coverage to "keep the number up" — the score should move only
   because dead branches (and their now-removed tests) are gone. Record the honest before/after.
4. **Behavioral sanity:** because every retired flag was already at its shipped default, the engine
   output over a fixed fake world must be **byte-identical** before/after. The snapshot tests in
   `engine-rigor.mjs` / `engine-pass.mjs` are the guardrail — if any snapshot *changes*, the removal
   altered behavior and must be reverted and re-examined.
5. **Modinfo/import gate:** `tests/modinfo.mjs` must still pass (no orphaned/renamed imports).

Log any deliberate non-change or deferred item to `docs/wont-fix-with-justifications.md`
(verdict + reasoning) or `docs/emigration-open-items.md` (deferred/conditional), per repo convention.

---

## 9. Risks & rollback

- **Irony noted:** this plan *removes rollback hatches.* The replacement rollback mechanism is **git** —
  each flag is retired in its own commit, so reverting a single commit restores that flag and its
  branch. This is strictly better than carrying the branch in every build forever.
- **Saved-config compatibility (WS3, and any config-shape change):** removing keys from the typedef could
  break loading a saved config that still contains them, *if* the settings loader validates against the
  typedef / rejects unknown keys. **Action:** before WS3, confirm the loader in `emigration-settings.js`
  (the cascade-safe `modSettings` store) ignores unknown keys. If it doesn't, keep the keys or add a
  shim.
- **Hidden readers:** a flag may be read somewhere the scan missed (dynamic access, string key). **Action:**
  before deleting each flag, `grep -rn "<flag>"` across `ui/`, `tests/`, `scripts/`, and `*.modinfo` and
  confirm every hit is either the definition or a call site being removed.
- **Shared test fixtures:** `engine-legacy-snapshots.mjs` covers three unrelated things (§5 WS1.1) — do
  not delete the file, only its legacy-pass section.

---

## 10. Estimated payoff

| Item | Code removed (approx.) | Confidence |
|---|---|---|
| `splitTracksEnabled` | ~150 LOC duplicate engine pass + legacy tests | High |
| `splitBudgetsEnabled` | shared-budget branch + plumbing | High |
| `splitUiReadoutEnabled` | second readout renderer | Medium |
| `scaleBase/Exp/Growth` | 3 keys + 3 typedef props | High |
| WS2 (if taken, all six) | ~6 one-line branches + a few test cases | Low value |

Net: a whole second migration-engine path deleted, three dead keys gone, and a materially smaller
"this can be off" surface — **with no player-visible change.**

---

## 11. Checklist

- [ ] WS1.1 `splitTracksEnabled` — inline split path, delete `processSourceLegacy` et al., trim legacy test section, drop key+typedef, update README §2
- [ ] WS1.2 `splitBudgetsEnabled` — delete shared-pool branch + `budgets.shared`, drop key+typedef
- [ ] WS1.3 `splitUiReadoutEnabled` — delete dominant-cause renderer, drop key+typedef
- [ ] WS3 — confirm loader tolerates unknown keys → delete `scaleBase/Exp/Growth` from CONFIG/DEFAULTS/typedef
- [ ] WS2 (optional, per §6) — retire selected cheap guards individually
- [ ] Verification protocol (§8) green after **each** step; behavior snapshots unchanged
- [ ] `resetCachesOnGameBoot` left intact (§7)
- [ ] Non-changes logged to wont-fix / open-items per convention
