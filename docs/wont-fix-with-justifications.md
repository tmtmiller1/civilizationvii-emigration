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
