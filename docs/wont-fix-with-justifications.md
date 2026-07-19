# Emigration — Won't-Fix Decisions (with justifications)

The canonical record of changes we deliberately **decided NOT to make** for the Emigration mod, each
with the reasoning that closed it. These look like obvious improvements but turned out to be unsafe,
behavior-changing, or net-negative — so they're documented here to prevent anyone (including future
sessions) from re-discovering and re-attempting them.

This file is for judgments **not to change working behaviour**. Features abandoned because they **cannot
be built** (a hard engine limit, a native crash, or an unproven-and-untestable hook) live in a sibling
doc, [wont-implement-with-justifications.md](wont-implement-with-justifications.md) — the enclave
lifecycle work (buildable improvement, stance-yield attribution, 3D model, the three unbuilt stages) and
the vacated-tile marker moved there.

> **Standing convention — keep this list current.** Whenever a proposed change to the Emigration mod is
> rejected on its merits (it would change behavior, break a supported config, defend an impossible
> state, or cost more than it's worth), **add it here** as a new `###` entry with: what was proposed,
> why it's tempting, the concrete reason it's wrong, and a one-line **verdict**. If instead a feature is
> abandoned because it *can't be built*, it goes in
> [wont-implement-with-justifications.md](wont-implement-with-justifications.md), not here. Distinguish
> both from *deferred / conditional* items, which live in
> [emigration-roadmap-and-backlog.md](emigration-roadmap-and-backlog.md) — those have a "revisit if X" trigger; entries
> here do not.

---

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

## Enclave & vacated-tile features — moved to won't-implement

The "distinct 3D model for enclave constructibles" and "vacated-tile on-map marker" entries that used to
live here were **abandoned because they can't be built** (hard engine limits), so they now live in
[wont-implement-with-justifications.md](wont-implement-with-justifications.md) alongside the rest of the
enclave lifecycle work, per this file's standing convention.

## README — relocate the LaTeX `$$…$$` formula blocks out of the marketing README

Tier 4 item 27 of [text-polish-plan.md](text-polish-plan.md) proposed moving the three `$$…$$` math
blocks in `README.md` (the §3 Prosperity-score model, the §5/§6b pull + friction equations, and the
§6b dividend pool) into the linked `../emigration-docs/` files, on the premise that GitHub renders them
as raw text on the repo page.

**Why it's a won't-fix:** the premise is stale. GitHub has rendered `$$…$$` math natively (MathJax)
since May 2022, so the blocks display correctly on the repo page today — there is no raw-text problem to
solve. Relocating the formulas would also *fragment* the manual: each block sits inline with the prose
that defines its symbols, and pulling the math into a separate file would split an explanation from its
equation for no rendering benefit. The one genuinely-actionable half of item 27 — a signpost at the
marketing→manual boundary — **was done** ("## System Guide and Feature Reference" now carries a one-line
overview/manual note).

**Verdict:** premise no longer holds; the formulas render fine on GitHub and read better inline next to
their explanations. Signpost shipped; relocation is churn, not a fix. Revisit only if GitHub drops math
rendering.

## Localization — leave `emigration-demo-data.js` sample-preview text hardcoded in English

The v2.1.0 full-localization pass converted every live player-facing string to `LOC_` keys with real
translations in all 11 languages. The one deliberately-skipped surface is the **Sample data preview**:
[emigration-demo-data.js](../ui/emigration-demo-data.js) hardcodes fixture event names — `"Nile flood"`,
`"Roman–Greek War"`, `"Yellow River flood"`, `"Aegean quake"` ([L175-204](../ui/emigration-demo-data.js#L175))
— plus fabricated civ/city names and ` BC` / ` AD` era suffixes on its synthetic timeline.

Tempting to localize for consistency with the rest of the dashboard. It's wrong because this text is
**developer/preview-only fixture data**, not live gameplay: it renders solely when a user opts into
"Sample" via the Options data-source dropdown to preview the dashboard's shape with no real game running.
The strings are invented scenarios (not engine events), so there is no in-game context in which a
non-English player encounters them during normal play. Authoring + translating ~30 throwaway fixture
labels across 11 locales — and keeping them parity-green forever — is pure overhead for a diagnostic
preview. The opt-in nature makes the English perfectly acceptable (it reads as sample/placeholder data,
which is exactly what it is).

**Verdict:** left hardcoded in English intentionally; preview-only fixture data is out of scope for
interface localization. The UI-key CI guard (`tests/i18n-ui-keys.mjs`) does not flag these because they
are plain string literals, not `LOC_` references. Revisit only if the Sample preview ever becomes a
shipped, discoverable feature rather than a dev/diagnostic mode.
