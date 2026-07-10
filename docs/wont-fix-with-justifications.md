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
> [emigration-open-items.md](emigration-open-items.md) — those have a "revisit if X" trigger; entries
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
