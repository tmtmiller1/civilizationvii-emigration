# Plan — Extend Emigration to Urban Population & Specialists

> Draft plan for review. Not yet approved or implemented.
>
> Status 2026-09-14: the crisis urban leg later built from this plan (specialists, then buildings) was removed before release. No script operation removes a specialist (`engine-limits-from-probes.md` 1.4), and building loss was ruled out for players.

## Context

The **Emigration** mod (`civilization_vii_mods/tower_mods/emigration/`, v2.1.0) simulates population movement between Civ VII cities. Today it moves **only rural population**: every population write in the entire mod goes through `city.addRuralPopulation(±1)` ([emigration-population.js:487-533](ui/emigration-population.js#L487-L533)), and the sim floors at `minRuralToEmigrate: 1`, so a besieged city's **urban core and specialists are effectively immortal to migration**. The goal is to extend the model so urban population and specialists are also accounted for.

**The decisive engine reality (established by exploration):**

- A city exposes `population` / `urbanPopulation` / `ruralPopulation` as plain props. **Specialists are a residual**, not a stored field: `specialists = population − urban − rural` (`getCitySpecialistsCount`, `other_peoples_mods/3515801789-latest/scripts/game/city.js:98`), read live via `city.Workers.getNumWorkers(false)` / `getCityWorkerCap()` / `GetAllPlacementInfo()`.
- **The write surface is a wall.** `addRuralPopulation(±1)` is the *only* population write that exists (cross-civ capable). There is **no** `addUrbanPopulation`, no specialist setter — confirmed-absent in `mod_ideas_tested/civ7-modding-docs/13-probe-findings-runtime-writes.md`. Urban districts and specialists are **engine-derived** from total/rural pop + worker assignment (`DISTRICT_POPULATION_REQUIRED_PER=3`). A UI mod can *read* them but not directly *write* them.
- Roadmap **§17.3** ([docs/emigration-roadmap-and-backlog.md:1459-1492](emigration-roadmap-and-backlog.md#L1459)) already specs "Emigration of urban population" and flags it **probe-gated**: no urban write has been confirmed reachable, and the prior settled dump came from a fresh pop-1 boot.

Because of this, the request cannot be assumed buildable as literal physical relocation. Per the project's **disproof gate** (test a hypothesis cheaply before building on it), the plan is **probe-first**: a cheap in-game measurement decides what the feature can be, *before* any population-write code is written. Two parts are separable:

- **Urban emigration** (needs a write) → gated on the probe.
- **Specialist treatment** (needs only reads, all confirmed present) → shippable unconditionally.

**User decisions:** urban/specialist emigration is **crisis-only** (never voluntary; urban is the *last* to leave, after rural is exhausted). Specialists get the **full treatment**: most-anchored (resist leaving), a destination pull/retention signal, and surfaced in readouts. Follow the off-by-default + characterization-test discipline strictly.

**Answer to "what does tanking rural do to specialists today?"** — Grounded inference (unverified at the extreme, which is exactly what Phase 0 measures): since `addRuralPopulation(-1)` drops both `population` and `rural` by 1 (urban untouched), the residual `specialists = pop − urban − rural` is **unchanged** — the city just loses a worked rural tile. The `minRuralToEmigrate: 1` floor means today the mod never even drives rural to 0, so specialists/urban are fully insulated. What nobody has measured: whether over-draining rural past 0 makes the engine start eating urban/specialists.

---

## Phase 0 — The disproof-gate probe (MANDATORY FIRST; blocks all write code)

Extend the existing dev probe **`devtools/migration-probe.js`** (rides the disabled `migration-probe.modinfo.disabled`; rename to enable). Add one `probeUrbanWrite()` function + helpers, reusing `dumpCity()` (L261), `tryPopMethod()` (L282), `inspectCity()` (L227), `probeSpecialists()` (L906), `methodsOf()` (L112), `log()`/`emitCss()` (CSS-parse channel → tag `MIGPROBE_` in `UI.log`). Wire a `mig.urban` global (exposeGlobals, ~L1937) and a `migp-urban` dock button (~L1555). Run against a **developed, high-pop city** (select it first). Four questions:

- **Q1 — Any hidden urban/specialist WRITE method?** Run `methodsOf` over City + Growth/Population/Happiness/Workers/Yields, filter `/urban|specialist|worker|setpop|addpop|population|grow/i`, log every hit. *(Re-verifies the pop-1 settled finding on a developed city.)*
- **Q2 — THE CRUX. Drive rural to 0 and keep going.** Snapshot `{population, urban, rural, workerPopulation, getNumWorkers}`; loop `addRuralPopulation(-1)` for `rural+3` iterations, each re-read **deferred via chained `setTimeout`** (writes are fire-and-forget). Log per-iteration 4-tuple + a final `URBANQ2 VERDICT rural_floor / urban_delta / total_delta`.
- **Q3 — Residual identity live?** Log `residual = pop−urban−rural` vs `getNumWorkers(false)` vs `getCityWorkerCap()`; dump a sample `GetAllPlacementInfo()` entry. Picks the specialist read source-of-truth for Phase 3a.
- **Q4 — `ASSIGN_WORKER {Amount:-1}`?** Pick a plot with `NumWorkers>0 && !IsBlocked`, send the op, deferred re-read; classify as reassignment (conserves total) vs shed vs `canStart`-fail.

**Read the verdict:** `grep -E "URBANQ[1-4]" "~/Library/Application Support/Civilization VII/Logs/UI.log"`. The `URBANQ2 VERDICT` line selects the branch:

- rural clamps at 0/1, urban+total unchanged → **Branch B** (no urban write; expected).
- further `-1` decrements urban/total → **Branch A** (rural-underflow lever).
- rural goes negative → treat as Branch B (engine bug, unsafe).

**Report the observation to the user before writing any Branch A/B code.** Record it as a dated "probe run" line in roadmap §17.3, and — if Branch B — a new `docs/wont-implement-with-justifications.md` entry (per §17.3 Q1's own instruction).

---

## Branch A — a real urban shed exists (Q1 setter, or Q2 rural-underflow)

Real §17.3 mechanic: crisis-only, urban **last** to leave, specialists last of all, off by default.

- **`ui/emigration-config.js`** — add `urbanEmigrationEnabled: false` (master gate), `minUrbanToEmigrate: 0`. `minRuralToEmigrate` stays 1; effective floor drops to 0 only for a source in acute crisis with the flag on.
- **`ui/emigration-population.js`** — add `removeUrban(city)` (crisis-only urban shed: the discovered setter if Q1, else `addRuralPopulation(-1)` when rural is already 0 per Q2) and `urbanPop(city)` reader, guarded exactly like the rural trio. **No `moveUrban`** — urban loss is attrition, not relocation; arrivals stay rural.
- **`ui/emigration-engine.js`** — urban leaves **only** from `processOutletDeath` ([L663-699](ui/emigration-engine.js#L663)), which already gates on `lethalDistress`. After rural is exhausted (`src.rural <= minRuralToEmigrate`) and the flag is on, shed order becomes rural → urban → specialists (residual), each with its own floor. Update the bookkeeping at L686-687 to a branch (decrement `src.rural`/`src.urban` accordingly). `shedBurst` (L349) and `applyMoveToRanking` (L106) stay rural-only — **voluntary moves never touch urban**. Also mirror the floor logic in the dry-run `planApply` (L737) so the net-migration tally stays consistent. Extend the `__test` export (L859) with `removeUrban`/ordering helpers.
- Attrition records reuse `cause: "attrition"` + a new `subject: "rural"|"urban"|"specialist"` field (no new cause enum) so readouts/Chronicle can name the skilled loss.

## Branch B — no urban write (expected): honest fallback, no faking

- **No engine write.** `urbanEmigrationEnabled` still added but documented "narrative-only; no engine urban write (probe URBANQ2)". `removeUrban` is **not** added.
- **Ledger + narrative only.** When `processOutletDeath` would shed urban but can't, emit a record with `points: 0, cause: "attrition", subject: "urban", physical: false` — shows in Chronicle / notifications / readouts and ledger totals, performs **no** population write and grants **no** yields, framed as "the surviving population is trapped in the collapsing core" (never as relocation).
- **Record the impossibility** in `docs/wont-implement-with-justifications.md`; point §17.3 at it.

---

## Phase 3 — Specialist treatment (ships in BOTH branches; reads only)

- **3a. Read into the signal** — `ui/emigration-cities.js` `buildSignal` ([L156-200](ui/emigration-cities.js#L156)): add `specialists` + `specialistShare` fields next to the existing `urban` field (L178). Primary source per Q3 (`Workers.getNumWorkers(false)`), fallback residual `pop−urban−rural`; guard pop ≤ 1 (Workers accessor returns `undefined`) → 0, via the existing `safeSignal` wrapper. Extend the `CitySignal` typedef (L15-42).
- **3b. Retention anchor** — `ui/emigration-prosperity.js`: add a named `specialistAnchor` term to the itemized `baseBreakdown` ([L137-155](ui/emigration-prosperity.js#L137)) (`+specialistShare * specialistAnchorStrength`) in **both** the shaped and unshaped returns, and add it to `baseScore`'s sum (L164) — **required** or explain-parity breaks. Config `specialistAnchorStrength` default small positive; **0 = neutral** (so the off-state is pinnable).
- **3c. Destination pull** — `ui/emigration-pull.js`: add a `skilledDraw` term to `pullBreakdown` (L215) **and** the mirrored `adjustedPull` (L163) in identical position/scale — the header comment (L205-207) pins them as exact mirrors; edit together. Config `skilledDrawWeight` default **0**.
- **3d. Reporting** — city readout (`emigration-city-readout*.js`): a "Specialists (anchored)" line; Demographics/Diversity (`emigration-demographics.js`, `emigration-diversity.js`): a specialist composition slice + per-cause metric for lost specialists (Branch A); notifications/Chronicle: distinct copy when a record carries `subject:"specialist"`. **No new constructibles, no world-anchored notifications** (both confirmed unavailable / crash-prone).

---

## Phase 4 — Tests (Node harnesses; wire into `package.json`, `required-scripts-gate.mjs`, `run-tests.mjs`)

1. **`tests/engine-pass-urban-characterization.mjs`** — with all new flags off/0, assert `runPass` output and final populations are **byte-identical** to a captured baseline (the `engine-pass` snapshot convention). The standing tripwire that the feature is truly off-by-default.
2. **`tests/urban-shed-ordering.mjs`** — Branch A: besieged source (rural 2 / urban 3 / spec 1), flag on, assert shed order rural→rural→urban→urban→urban→specialist and that **voluntary passes never touch urban**. Branch B: assert the narrative record fires with `points:0` and no pop change.
3. **`tests/specialist-anchor.mjs`** — higher-`specialistShare` city ranks higher in `rankByProsperity`; `specialistAnchor` term present and signed; with strength 0, ranking unchanged.
4. **`tests/specialist-explain-parity.mjs`** (or extend `tests/explain.mjs`) — `skilledDraw` reconstructs `adjustedPull` and `specialistAnchor` reconstructs `prosperity` exactly. Also extend `tests/cities-signals.mjs` (new fields populate, degrade to 0 at pop ≤ 1) and `tests/engine-rigor.mjs` (mutation-cover the new helpers).

---

## Phase 5 — Verification / end-to-end

- **Probe:** enable `migration-probe.modinfo`, deploy (`rm -rf $DEST; cp -R … "~/Library/Application Support/Civilization VII/Mods/emigration"` — copies, not symlinks), relaunch, select a developed city, click `migp-urban`, drive it into siege/famine (or let `driveRuralToZero` over-drain), then `grep URBANQ2 UI.log` for the verdict. Cross-check pop via `sqlite3 -readonly "~/Library/Application Support/Civilization VII/Debug/gameplay-copy.sqlite"`. Disable the probe modinfo before shipping.
- **Shipped feature:** turn on `selftestEnabled`, add `checkSpecialistRead` (+ Branch A `checkUrbanShedGating`) rows to `ui/emigration-selftest-checks.js` (`runChecks()` L457). In-game acceptance: default (flag off) → besieged city still floors at rural=1, urban core survives (byte-identical). Flag on (Branch A) → rural drains, then urban, then specialists; Chronicle/notification/readout name the skilled loss. Branch B → narrative event fires with no pop change.

---

## Risks & invariants

- **"Cities don't die from (voluntary) migration."** First feature that shrinks the urban core. Contained by: off-by-default flag; urban shed routed **only** through `processOutletDeath` under `lethalDistress`, never `shedBurst`; urban after rural, specialists last; the byte-identical characterization test as tripwire.
- **Single-player only.** All population writes desync multiplayer and `sendRequest` is fire-and-forget — gate behind the existing SP guard, verify by deferred re-read.
- **Native-crash precedent** (autoexplore-civilian-crash): the archived universal-constructible feature hard-crashed the AI. This plan adds **zero** constructibles / AI-evaluated entities — reads, a population decrement, or a pure ledger record only.
- **Explain-parity coupling.** Adding a breakdown term without updating its sum (`baseScore`/`adjustedPull`) silently breaks the explainer; the parity test + the pull.js mirror comment are the guardrails — edit mirrored functions together.
- **Off-by-default shipping.** Both scoring terms default to weight 0 and `urbanEmigrationEnabled` defaults false — the release is behaviorally inert until a player opts in.

## Critical files

- `devtools/migration-probe.js` (Phase 0)
- `ui/emigration-engine.js`, `ui/emigration-population.js` (urban shed path — Branch A)
- `ui/emigration-cities.js` (specialist read), `ui/emigration-prosperity.js` + `ui/emigration-pull.js` + `ui/emigration-config.js` (specialist scoring — paired, both branches)
- `ui/emigration-city-readout*.js`, `-demographics.js`, `-diversity.js`, `-selftest-checks.js` (reporting)
- `docs/emigration-roadmap-and-backlog.md` §17.3, `docs/wont-implement-with-justifications.md` (record the verdict)
