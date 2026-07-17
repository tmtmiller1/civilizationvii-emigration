# Emigration — Won't-Fix Decisions (with justifications)

The canonical record of changes we deliberately **decided NOT to make** for the Emigration mod, each
with the reasoning that closed it. These look like obvious improvements but turned out to be unsafe,
behavior-changing, or net-negative — so they're documented here to prevent anyone (including future
sessions) from re-discovering and re-attempting them.

> **Standing convention — keep this list current.** Whenever a proposed change to the Emigration mod is
> rejected on its merits (it would change behavior, break a supported config, defend an impossible
> state, or cost more than it's worth), **add it here** as a new `###` entry with: what was proposed,
> why it's tempting, the concrete reason it's wrong, and a one-line **verdict**. Distinguish won't-fix
> (closed by decision) from *deferred / conditional* items, which live in
> [emigration-roadmap-and-backlog.md](emigration-roadmap-and-backlog.md) — those have a "revisit if X" trigger; entries
> here do not.

---

## CANTFIX-1 (CLOSED 2026-07-16) — Enclave *stance* yields in the GPT banner / global yields breakdown

> **Status (closed 2026-07-16):** both runtime routes are confirmed dead, so the **stance** yield can
> never reach the banner/breakdown — that is the can't-fix. Separately, the *feature goal* ("the player
> should see the enclave's yield attributed natively") **was achieved by another means**: the enclave
> also ships as a **player-built improvement** whose `Constructible_YieldChanges` the engine attributes
> natively. See "What shipped instead" below before re-opening this.

**Proposed:** make the "Tax them"-style enclave stance yields show as a real per-turn source in the top
banner (gold-per-turn) and the game's global yields breakdown, instead of the current invisible per-turn
`Players.grantYield` treasury injection ([emigration-effects.js `applyQuarterYields`](../ui/emigration-effects.js),
driven by [emigration-quarter.js `tickContestedQuarters`](../ui/emigration-quarter.js)).

**Why it's tempting:** the player sees no GPT change when they tax an enclave, and the border-policy
cards already surface a real per-turn yield via an `EFFECT_PLAYER_ADJUST_YIELD` modifier — so it *looks*
like the enclave should be able to as well.

**Why it can't be done (from a UI-script mod):** the banner and breakdown read ONLY the engine's
Modifier/building yield sources. A UI-script mod cannot create or attach such a source at runtime:
1. **No runtime modifier-attach API exists** — searched all 1,110 JS files across 231 community mods;
   the only runtime yield writes are `grantYield` and `changeGoldBalance`, both of which move the
   balance/stat without a breakdown source row.
2. **Auto-placing a real yield-bearing entity at runtime — CONFIRMED FAILED.** `Game.PlayerOperations`
   `CREATE_ELEMENT {Kind:"CONSTRUCTIBLE"}` for a tile IMPROVEMENT. The first probe was invalid (it never
   sent the op — gated behind a `CityOperations.canStart("BUILD")` check improvements don't use). The
   corrected Self-Test probe ([ui/emigration-enclave-probe.js](../ui/emigration-enclave-probe.js)) sends
   it directly; placement does not take. Route disproven.

The border policies only work because they ride the game's native Tradition/policy slot, which the
engine attaches; an emergent, per-city, player-chosen enclave stance has no equivalent slot.

**What shipped instead (why this closed rather than just failing).** The engine won't let a mod *place*
an improvement, but it will let the player *build* one. Per-civ `IMPROVEMENT_EMIG_ENCLAVE_<CIV>`
constructibles are generated from the registry into
[emigration-enclave-improvements.xml](../data/emigration-enclave-improvements.xml) with real
`Constructible_YieldChanges` rows — natively attributed, breakdown-visible — and the production chooser
is filtered to the one enclave the city earned ([emigration-enclave-gate.js](../ui/emigration-enclave-gate.js)).
So the *player-visible goal* is met by the built improvement; only the **stance** half remains invisible.

**Verdict:** **Closed can't-fix** for the stance yield specifically — both runtime routes are disproven,
and the stance stays a treasury/stat effect permanently. Do not re-attempt either route. The two
*actionable* leftovers are real features and live in
[emigration-roadmap-and-backlog.md](emigration-roadmap-and-backlog.md) §22, not here: (a) surface the
stance's per-turn yield in the mod's **own** city readout / enclave panel, and (b) reconcile the stance
grant with the built improvement's yield, which currently both pay out.

## P3 — Caching `situationalPercent` / `distress` is UNSAFE under the default `warSiege` model

The tempting optimization — "`distress` is recomputed in the death pass after `prosperity` already
computed `situationalPercent` during ranking, so cache it on the signal" — is **not** behavior-neutral.

`situationalPercent` → `violencePercent` ([prosperity.js:155-161](../ui/emigration-prosperity.js#L155-L161))
→ `siegeEscalation` ([violence.js:254](../ui/emigration-violence.js#L254)) reads **module state**
(`s.warLoss[key]`), not just signal fields. During the departures pass `applyDepartureConsequences`
calls `recordWarLoss` ([consequences.js:36](../ui/emigration-consequences.js#L36)) for every
war-violence shed, incrementing `warLoss`. `processOutletDeath` runs *after* the shed, so its
`distress(src)` read **deliberately** sees the post-shed siege escalation (which can have dropped to 0
once the loss cap is hit). Caching the ranking-time value and reusing it in the death pass would make
attrition deaths fire against stale, pre-shed distress for besieged cities — a behavior change, not a
perf no-op. Splitting `situationalPercent` into a cached stable part + a live siege part is possible but
adds complexity and risk for only an O(N) saving.

**Verdict:** left as-is intentionally; the second read is a deliberate live re-read, not a redundant recompute.

## C3 — `prepareState` monoTurn forward jump: no safe automatic guard exists

A monoTurn forward jump > 1 in a single `prepareState` is **normal**, not pathological: with
`turnInterval > 1` (a supported, README-documented perf tunable) the pass runs every K turns, so
`monoTurn = Math.max(monoTurn + 1, gameTurn())` advances by ~K each pass and `processArrivals` correctly
treats the now-due entries as due (K real turns elapsed). The same jump also happens legitimately when
the mod is added mid-game and monoTurn catches up to `gameTurn`. A clamp or transit re-base cannot
distinguish these supported cases from a corrupt/stale save, so it would break `turnInterval > 1` play.

The residual harm in the genuine corrupt-save case is minor — migrants land *early*, not lost — and is
now further throttled by the shipped **C1 fix** (arrivals are bounded by the per-turn inbound cap and,
with the `defers` counter restored, by the MAX_DEFERS perish guard). `monoTurn` is also load-bearing for
population scaling (pinned by `tests/scaling-demographics-parity.mjs`), so perturbing it is high-risk for
near-zero benefit.

**Verdict:** left as-is intentionally; no automatic guard can tell the supported case from the corrupt one.

## causes — split `LABELS` into `CAUSE_LABELS` + `PSEUDO_CAUSE_LABELS`

The tempting tidy — `LABELS` in [emigration-causes.js](../ui/emigration-causes.js#L41) mixes real
`MigrationCause` values (`war`, `disaster`, …) with display/pseudo causes (`crisis`, `chronicle`,
`other`), so "separate them into two maps for clarity." But the `MigrationCause` vs `HeadlineCause`
typedefs already encode that distinction at the type layer, and every consumer reaches `LABELS` through
the single `causeLabel()` getter (with an `other` fallback), so the flat map has no behavioral or
lookup cost. Splitting it adds a second map + a merge/branch at the getter for zero functional gain.

**Verdict:** cosmetic only; the typedefs already encode the real-vs-pseudo split. Left as one map.

## causes — reword the `return` label "Return" → "Return Migration"

Proposed to disambiguate the `return` cause's short label. But the only place the bare word could read
ambiguously is the Net Migration Table, and there `netDrivers()`
([emigration-causes.js](../ui/emigration-causes.js#L193)) already renders it SIGNED (`Return +5
thousand`), which carries the "people coming back" meaning. The longer label also risks crowding the
fixed-width Net table pills. The cause string is additive-only and unaffected either way; this is pure
display copy with the ambiguity already handled.

**Verdict:** ambiguity already resolved by the signed net display; not worth the copy churn.

## causes — mechanical comment punctuation / spelling sweep

Proposed to "normalize" the ` , ` spacing and non-US spellings throughout
[emigration-causes.js](../ui/emigration-causes.js) (and siblings). But the spaced comma is a deliberate
rhetorical em-dash-comma used consistently codebase-wide, and some spellings (`colour`, `flavours`,
`centre`) are an intentional British-English convention, not typos. A mechanical sweep would churn many
files to overwrite deliberate style with no reader benefit.

**Verdict:** the style is deliberate and codebase-wide; a normalizing sweep is churn, not a fix.

## chronicle-view — rebuild the `CSS` string as an array + `.join("")`

Proposed to express the chronicle stylesheet in [emigration-chronicle-view.js](../ui/emigration-chronicle-view.js#L24)
as a `[...].join("")` array instead of `+`-concatenated string literals, "for readability." But the
string is injected once at module init, the `+` form is the same pattern the sibling dashboard
stylesheets use, and an array adds bracket/comma noise without changing the output one byte. The
original backlog only ever flagged it as "bundle into an unrelated CSS edit if ever" — i.e. never worth
a standalone change.

**Verdict:** zero functional difference, matches the sibling stylesheet idiom; not worth the churn.

## arrivals — soften capped-arrival death into a holding-pool overflow

Proposed (2026-07-02 arrivals review, Tier 4) that a refugee who reaches a valid destination but still
can't be accepted after `MAX_DEFERS` turns should overflow into the refugee holding pool (or redirect /
return) instead of perishing, because "city is full, therefore migrants die" can feel harsh. But the
strict inbound cap → perish-on-no-refuge outcome is a **deliberate design pillar**, not an oversight:
it's the same "no refuge → attrition" philosophy that governs the outlet/death system, and it's what
keeps the cap honest (a boomtown cannot absorb dozens, and blocked refugees are a real cost of the
crisis, not a free redirect). Routing capped arrivals into the pool would make the cap soft — the pool
becomes an unbounded overflow that always accepts — quietly erasing the scarcity the whole system
models. The [emigration-arrivals.js](../ui/emigration-arrivals.js) comments already state the intent
("the cap stays strict, never force-landed past it").

**Verdict:** by design — the strict cap and its perish outcome are intentional; softening it into a
pool overflow is a balance/design change that removes modeled scarcity, not a hardening.

## population — make "Civ Pop" drift over time like "Scaled Pop"

A player reported "scaled population changes over time, but civ population doesn't" and asked whether
that's a bug. Tempting fix: make the two figures track each other so neither looks "frozen."

It is **not** a bug and must not be changed. **Civ Pop** is the game's exact city size in discrete
population points (`c.pop`), which only changes when a city actually gains/loses a pop point — a rare
event, so it looks steady. **Scaled Pop** is the intentional age-scaled "historical people" headcount
(`scaleCityPopulation`, pinned to the Demographics mod by `tests/scaling-demographics-parity.mjs`),
which drifts upward with age progress even at a fixed city size. Making raw points "drift" would either
corrupt the exact game-state figure or desync the scaler from Demographics. The confusion was a
labeling gap, closed by adding hover tips to the Scaled/Civ Pop toggle (v.Unreleased) that explain the
difference, and by pinning all displayed **percentages** to the raw-points base so a share no longer
moves when the toggle flips.

**Verdict:** by design — the two measures are legitimately different (exact discrete size vs scaled
historical headcount); fix the *labeling*, never make raw points drift.

## cultural-enclaves — a distinct 3D model for the per-civ enclave constructibles

**Proposed:** give each of the 45 per-civ Cultural Enclave constructibles
([data/emigration-enclave-improvements.xml](../data/emigration-enclave-improvements.xml), generated by
[scripts/gen-enclave-improvements.mjs](../scripts/gen-enclave-improvements.mjs)) its own on-map 3D model
by reusing an existing building/improvement's art via `VisualRemap`.

**Why it's tempting:** the enclave is a real constructible on a tile, so it *should* have a model like
every shipped building; an invisible tile reads as unfinished.

**Why it can't be done — CONFIRMED engine limitation (2026-07-15):** Civ VII exposes **no moddable way to
bind a 3D model to a custom constructible.** `VisualRemap` — the only art hook — works **only for UNITS**;
for buildings/improvements it does nothing (and the community "Buildings visual remap fix" addon is
*deprecated* because it makes the AI's copies of a remapped building invisible — a non-resolvable engine
bug). There is no modder asset SDK to author a new model. Verified every way: improvement donors
(SOUQ, FARM) and building donors (MONUMENT, GRANARY) all rendered invisible even when built + completed on
a proper tile; `ArtDef.log` never even references the remap. The only community workaround — hijack an
existing shipped building's identity (override its DB values so the game draws its real model) — cannot
scale to 45 distinct types and can't be a unique/quarter building, so it's unusable here. Sources:
CivFanatics threads *empty-visuals-for-custom-civ-uniques* (697154), *visualremaps-visuals-for-custom-units*
(697233), and the deprecated *addon-buildings-visual-remap-fix* (32160).

**What we did instead:** the enclave stays a plain tile IMPROVEMENT — already identified in-game by the
tile **tooltip** and its native **yield in the breakdown** — and its on-map presence is painted by the
mod itself: [ui/emigration-enclave-markers.js](../ui/emigration-enclave-markers.js) draws the civ symbol
icon + a "<Civ> Enclave" label over each enclave tile from the mod's own `WorldUI` overlay group,
bypassing the art pipeline entirely.

**Verdict:** a real 3D model is impossible via data mods (hard engine limit, not our bug); the WorldUI
overlay marker is the shipped substitute. Do not re-attempt `VisualRemap` for constructibles.

## vacated-tile — an on-map marker for the tile left unworked when rural population emigrates

**The ask (workshop feedback, JNR):** when rural population emigrates the mod calls
`city.addRuralPopulation(-1)`; the engine then unassigns a worker from some tile, leaving the
improvement intact but **unworked**. Mark that vacated tile on the map (icon/label, or "mark it as
pillaged and block repair") the way the destination enclave is marked, so the loss reads visually.

**Why it's tempting:** we already paint on-map markers for enclaves
([ui/emigration-enclave-markers.js](../ui/emigration-enclave-markers.js)), so "do the same for the
origin tile" looks like a small reuse.

**Why it can't be done — CONFIRMED (2026-07-15), the tile can't even be IDENTIFIED:** unlike an enclave
(a real Constructible that persists in game state and is re-scannable any time via
`MapConstructibles.getConstructibles`), a vacated tile leaves **no readable trace**. The mod doesn't
choose the tile — the engine does — so the only way to identify it is to diff the city's worked-plot
set around the removal. Three probe variants, all ✗ (shipped in the Self-Test screen as the evidence
trail — `runVacatedSurfaceProbe` / `runVacatedDiffProbe` / `runVacatedTurnArm` + `runVacatedTurnRead`
in [ui/emigration-enclave-probe.js](../ui/emigration-enclave-probe.js)):

1. **Worked-set surface** — `city.Workers.GetTilePlacementInfo` / `GetAllPlacementInfo` is the
   **specialist** subsystem (`NumWorkers`/`MaxWorkers`/`CurrentYields`), NOT rural tile-working: only
   1 plot read `NumWorkers>0` on a rural-5 city, and `workerPopulation` was `undefined`. No
   `IsWorked`/`Assigned` field exists.
2. **Inline −1 diff** — removing a rural pop (rural 5→4) changed **nothing** in any per-plot signal.
3. **Across-end-turn diff** — armed, removed 1 rural, ended a full turn, re-read all **41** owned plots
   on three signals (`getYieldsWithCity`, constructible signature, specialist `NumWorkers`): **not one
   plot changed.** So it wasn't a timing artifact. The engine reassigns rural tiles internally with no
   per-tile "now unworked" flag exposed to UI script, the rural improvement stays intact, and
   `getYieldsWithCity` is a *hypothetical if-worked* value that never drops.

JNR's "mark as pillaged + block repair" is separately rejected regardless: it's a real game-state
mutation with a real yield penalty (double-punishes the player), breaks the read-only-overlay design
that keeps this mod co-load-safe, and no-ops on unimproved worked tiles.

**What we did instead:** nothing on the tile — the event is communicated at the **city** level (toasts /
notifications / city readout), and the workshop page explains that the destination enclave is marked
but the origin tile isn't, because the game gives modders no per-tile unworked signal.

**Verdict:** marking (or pillaging) the vacated tile is impossible — the tile is **unidentifiable** from
a UI-script mod, not merely unpaintable. Do NOT re-open this: do not re-probe `city.Workers`,
`getYieldsWithCity`, or constructible scans for a "which tile went unworked" read. Revisit only if a
future game patch adds a rural-tile-worked accessor. Full trail:
[vacated-tile-marker-plan.md](vacated-tile-marker-plan.md).
