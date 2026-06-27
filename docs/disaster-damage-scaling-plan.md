# Emigration — disaster damage scaling by type *and* measured impact

This is the authoritative spec for fixing the player report that **disasters are too punishing**,
especially on **Marathon**, and that **a thunderstorm with no tile pillage can still bleed a city for
6+ turns**. Implement it as written. Every change is behind a flag, defaults conservative, and is
grounded in a signal the game already gives us — no invented magnitudes.

> **Player report (verbatim).** *"I play on marathon and disasters are too punishing on that
> gamespeed. Something as simple as a thunderstorm that doesn't pillage any tiles can cause a city to
> hemorrhage population for 6+ turns. … A big disaster can make a city feel like it can't get more
> rural pops for the remainder of the game, especially if it happens again."*

---

## 0. Where the damage comes from today (the current pipeline)

A single struck city accrues **distress points**, which convert to a prosperity penalty, which drives
the refugee outflow / attrition. Four files, in order:

1. **Severity — [emigration-events.js](../ui/emigration-events.js#L186) `eventSeverity()`**
   `sev = engineTier + (eventImpactPct(info) >= 35 ? 1 : 0)`, floored at `1`, range `1..4`.
   `eventImpactPct` is the *real* magnitude: the larger of the worst yield cut and the worst
   `CONSTRUCTIBLE_DAMAGED` percentage from `GameInfo.RandomEventYields` / `GameInfo.RandomEventDamages`.
   This was a deliberate fix — the engine's `Severity` column is a weak proxy (a *gentle* volcano is
   `Severity 0`, a *catastrophic* one only `Severity 1`).

2. **Distress spike — [emigration-disasters.js](../ui/emigration-disasters.js#L257) `recordDisaster()`**
   `w = (CLASS_WEIGHT[eventClass] || 4) * (severity > 0 ? severity : 1)`, added to every struck city.
   The per-type table:

   | Class | `CLASS_WEIGHT` |
   |---|---|
   | `CLASS_VOLCANO` | 12 |
   | `CLASS_FLOOD` | 8 |
   | `CLASS_PLAGUE` | 8 |
   | `CLASS_HURRICANE` | 7 |
   | `CLASS_TORNADO` | 5 |
   | `CLASS_BLIZZARD` | 4 |
   | `CLASS_DUSTSTORM` | 3 |
   | `CLASS_THUNDERSTORM` | 3 |

3. **Prosperity penalty — [emigration-prosperity.js](../ui/emigration-prosperity.js#L169) `disasterPercent()`**
   `-min(disasterCapPct = 200, distress * disasterPerPoint = 10)`. So `3` distress ⇒ **−30%**
   prosperity; `12` distress ⇒ **−120%**.

4. **Decay — [emigration-disasters.js](../ui/emigration-disasters.js#L340) `tickDisasters()`**
   `factor = speedDecay(disasterDecay = 0.55) ^ elapsed`, where
   [`speedDecay(d) = d^(1/S)`](../ui/emigration-game-speed.js#L109) re-bases the per-turn fade so a
   transient fades over the **same game-time** at any speed (`S` = Marathon `3.0`).

The penalty then flows through [`distress()`](../ui/emigration-prosperity.js#L200) into the attrition
outlet — a trapped, highly-distressed city sheds population.

---

## 1. Why it over-punishes — three independent root causes

### 1a. The per-city spike ignores the *measured* impact on **that** city

`recordDisaster` multiplies `CLASS_WEIGHT × severity`. But `severity` is a coarse `1..4` integer that
only ticks up `+1` once impact crosses `35%`. The rich, continuous magnitude that `eventImpactPct`
already computed (e.g. "this storm cut 0% of yields and damaged 0 constructibles" vs. "this volcano
razed 40% of constructibles") is **collapsed away** before it reaches the distress math.

Consequence: a **thunderstorm that pillages nothing** still lands at the floor `sev = 1`, so
`w = CLASS_THUNDERSTORM(3) × 1 = 3` ⇒ **−30% prosperity** — a heavy, multi-turn population driver for
an event the player correctly perceives as harmless. The class weight is acting as a *flat tax* that
fires regardless of whether the city actually lost anything.

### 1b. Marathon stretches the *duration* but not the *per-turn bite*

`speedDecay` is correct in intent: it keeps the *fade curve* the same length in game-time. But two
things compound on slow speeds:

- **Duration.** `0.55` on Standard fades to <0.05 (the drop threshold) in ~4 turns; on Marathon
  `0.55^(1/3) ≈ 0.82` per turn stretches the same fade to **~17 turns**. The distress is *present and
  near-full strength* for far more individual turns.
- **Per-turn cost is unchanged.** `disasterPerPoint` is a flat `10%`/point every turn the distress is
  alive. Marathon does **not** reduce the per-turn penalty, so the city pays the **same** prosperity
  hit on **~4× as many turns**. That is the "hemorrhage for 6+ turns" report, mechanically.

This is the structural mismatch with the rest of the speed model: turn-*counts* scale (`speedTurns`),
thresholds scale (`speedBar`), decay re-bases (`speedDecay`) — but the **per-turn magnitude of an
instantaneous shock** was never given a speed transform, so it is paid in full on every one of the
now-many turns.

### 1c. Repeated disasters stack without bound or recovery floor

`recordDisaster` does `s.byCity[key] += w` with **no ceiling**. Two volcanoes ⇒ `24` distress ⇒
`disasterCapPct` is hit and the city sits at **−200% prosperity** for a very long decay. Nothing
guarantees the city eventually recovers its rural-growth footing — exactly the "can't get rural pops
for the remainder of the game" report.

---

## 2. Design goals

1. **A disaster's damage should track what it actually did to the city** — tiles pillaged, yields cut,
   constructibles damaged — *and* its type, in that order of authority. A 0-impact thunderstorm ≈ free.
2. **Type sets a ceiling, not a floor.** A thunderstorm can never reach volcano-tier distress even at
   max severity; a volcano can, but only when it actually devastates.
3. **Slow speeds must not be disproportionately punished.** A disaster should cost roughly the same
   *total* prosperity-turns of bite at Marathon as at Standard, not ~4×.
4. **A city always recovers.** Repeated disasters escalate with diminishing returns and a hard
   accumulation cap; distress always decays back to zero.
5. **Honor the existing philosophy.** Continuous (no cliffs), grounded in live game signals, mirrors
   the violence model's shape, every behavior flag-gated and fail-safe to today's numbers.

---

## 3. The solution

Four cooperating changes. Each is independently flaggable; together they resolve all three root
causes.

### 3.1 Replace the coarse `severity` integer with a continuous **impact factor** `m ∈ [0,1]`

Carry the magnitude the mod *already measures* all the way into the distress spike instead of
discarding it. Define, at the event layer, an **impact fraction** from the same tables
`eventImpactPct` reads, plus the directly-observable pillage:

```
impactPct = max(worst yield cut %, worst CONSTRUCTIBLE_DAMAGED %)   // already computed
pillageFrac = pillagedTiles / max(1, workedTiles)                   // 0 when nothing pillaged
m = clamp01( max(impactPct / 100, pillageFrac) )                    // continuous 0..1
```

- `pillagedTiles` is read from the event payload / city plots where available; when the build doesn't
  expose it, the term is `0` and `impactPct` alone drives `m` (graceful degradation, never invented).
- `m` is **continuous**: a glancing storm that nicks 5% of one yield is `m ≈ 0.05`; a catastrophic
  volcano razing 40% of constructibles is `m ≈ 0.40`+. This directly answers *"scale by severity of
  impact."*

Keep `eventSeverity()` exactly as-is for the **notification gate and chart marker** (the player-facing
"how bad was it" tier is fine as a `1..4`); only the **distress math** switches to `m`.

### 3.2 Make the distress spike `= type-ceiling × impact factor` (type *and* impact)

Reinterpret `CLASS_WEIGHT` as a **per-type maximum** distress for a *full-impact* (`m = 1`) event,
and scale it by the continuous `m` with a small floor so a genuinely-striking disaster still registers
a faint touch:

```
// emigration-disasters.js, recordDisaster(eventClass, m, cityKeys, eventType)
const ceil = CLASS_WEIGHT[eventClass] || 4;          // now read as a CEILING
const shaped = ceil * shape(m);                       // shape() defined below
const w = shaped;                                     // 0 when m≈0 (no-pillage thunderstorm)
```

`shape(m)` is a gentle concave curve so small real impacts aren't trivialized but zero impact is
zero:

```
shape(m) = m^DISASTER_IMPACT_GAMMA        // DISASTER_IMPACT_GAMMA default 0.6 (concave, no cliff)
```

Result, by example (`disasterPerPoint = 10%`):

| Event | `ceil` | `m` | `w = ceil·m^0.6` | prosperity hit |
|---|---|---|---|---|
| Thunderstorm, **0 pillage** | 3 | 0.00 | **0.0** | **0%** |
| Thunderstorm, nicks 10% of one yield | 3 | 0.10 | 0.75 | −7.5% |
| Tornado, 25% constructible damage | 5 | 0.25 | 2.965 | ~−30% |
| Volcano, **catastrophic** 40% | 12 | 0.40 | 7.0 | −70% |
| Volcano, gentle 20% | 12 | 0.20 | 4.2 | −42% |

This is the heart of the fix: **type bounds the worst case, measured impact decides where in that
band you land, and "no pillage" lands at zero.** A thunderstorm can never out-punish a volcano, and a
harmless one is free.

> **Plague exception.** `CLASS_PLAGUE` is *standing* distress polled from `city.isInfected`
> ([`polledDistress`](../ui/emigration-disasters.js#L240)), not a one-shot spike, so it keeps its
> current `disasterPlagueWeight` standing-rate path. Only the **event-driven** classes route through
> `shape(m)`.

### 3.3 Give the instantaneous shock a **game-speed transform** so Marathon pays the same *total* bite

The decay already keeps the fade the same length in game-time; the missing piece is that the **per-turn
penalty** must shrink when that fade is stretched across more turns, so the *area under the curve*
(total prosperity-turns lost) is speed-invariant.

Because total bite ≈ `peakPenalty × (turns the distress is alive)`, and slow speeds multiply the alive
turns by ~`S`, divide the spike by `S`:

```
// in recordDisaster, after computing the shaped spike:
const w = shaped / speedSpike();      // speedSpike() = gameSpeedScalar()  (Standard 1, Marathon 3)
```

Equivalently, expose a new transform alongside the existing three so the intent is named and tested:

```
// emigration-game-speed.js
/** A one-shot SHOCK magnitude: divide by S so the area-under-decay (total prosperity-turns) is
 *  speed-invariant — a stretched fade costs the same overall, just spread thinner per turn. */
export function speedShock(x) {
  const s = gameSpeedScalar();
  return s === 1 || !(x > 0) ? x : x / s;
}
```

Now on Marathon the volcano above is `7.0 / 3 ≈ 2.33` distress ⇒ ~−23%/turn over ~17 turns instead of
−70%/turn over ~17 turns. The *total* hardship matches Standard's −70% over ~4 turns; the city is
discouraged for the same amount of game-progress, not 4× as much. This is the direct fix for the
Marathon report and is consistent with the mod's documented speed philosophy (turn-counts ×S,
thresholds ×S, decay `^(1/S)`, **shocks ÷S**).

#### Verified across all five speeds

Both transforms key off the same scalar `S = CostMultiplier/100` (Online `0.5`, Quick `0.67`,
Standard `1.0`, Epic `1.5`, Marathon `3.0`). The *total* bite is the geometric sum of distress over
the decay tail — the new `÷S` shock against the existing `^(1/S)` decay (`d = 0.55`):

$$\text{total} \;=\; \frac{w_0/S}{\,1 - d^{1/S}\,}$$

Evaluated at each speed (relative to the raw spike `w₀`):

| Speed | `S` | per-turn peak | turns alive | **total bite** |
|---|---|---|---|---|
| Online | 0.5 | `2.00·w₀` | ~2 | **2.87·w₀** |
| Quick | 0.67 | `1.50·w₀` | ~3 | **2.53·w₀** |
| Standard | 1.0 | `1.00·w₀` | ~4 | **2.22·w₀** |
| Epic | 1.5 | `0.67·w₀` | ~6 | **2.03·w₀** |
| Marathon | 3.0 | `0.33·w₀` | ~17 | **1.85·w₀** |

So the total hardship lands within **roughly ±25% of Standard at every speed**, versus today's
~**4× blow-up on Marathon**. The correction is *approximately* invariant, not perfectly flat, and the
residual leans the **safe** way: fast speeds (Online) get a touch *more* total bite, slow speeds
(Marathon) a touch *less* — so Marathon, the speed that was complained about, ends up slightly gentler
than Standard rather than harsher. The mechanism is exact in the limit
(`S·(1 − d^{1/S}) → −ln d` as `S` grows), so the slower the speed, the better the correction holds.
This is why the §6 invariance test asserts equality "within tolerance" rather than exact.

### 3.4 Bound accumulation and guarantee recovery (repeat disasters)

Two small guards in `recordDisaster` / `stampDisaster`:

- **Diminishing stacking.** When a city already carries distress, a new spike adds with falloff so the
  second and third disasters can't linearly pile to the cap:

  ```
  const cur = s.byCity[key] || 0;
  const headroom = Math.max(0, DISASTER_ACCUM_CAP - cur);   // DISASTER_ACCUM_CAP default 18
  s.byCity[key] = cur + w * (headroom / DISASTER_ACCUM_CAP); // adds less the fuller it already is
  ```

- **Hard accumulation cap.** `DISASTER_ACCUM_CAP` (default `18`, i.e. a single worst-case volcano sits
  comfortably below it after §3.2/§3.3) ensures the per-turn penalty can't exceed
  `min(disasterCapPct, 18 × disasterPerPoint)` and that decay always returns the city to zero in
  bounded game-time. Combined with the unchanged `< 0.05` drop, **every city provably recovers.**

This removes the "suppressed for the rest of the game" failure mode while still letting a true
back-to-back catastrophe hurt.

---

## 4. New tunables (all defaulted to preserve/relax current behavior)

Add to [emigration-config.js](../ui/emigration-config.js) under the §11 block:

| Tunable | Default | Meaning |
|---|---|---|
| `disasterImpactScalingEnabled` | `true` | Master flag for §3.1–§3.2 (impact-factor spike). Off ⇒ legacy `CLASS_WEIGHT × severity`. |
| `disasterImpactGamma` | `0.6` | Concavity of `shape(m)`; `1.0` = linear, `<1` lifts small impacts. |
| `disasterSpeedShockEnabled` | `true` | Master flag for §3.3 (÷S shock). Off ⇒ today's full per-turn bite. |
| `disasterAccumCap` | `18` | Hard ceiling on a city's accumulated distress (§3.4). |
| `disasterStackFalloff` | `true` | Diminishing-returns stacking (§3.4). Off ⇒ linear add. |

Surface the two master flags and `disasterImpactGamma` (choice `[0.5, 0.6, 0.75, 1.0]`) in
[emigration-tunables.js](../ui/emigration-tunables.js) next to the existing `disasterPerPoint` /
`disasterDecay` knobs so players who *want* the old brutality can restore it. Every flag fail-safes to
the current numbers, matching the mod's gating convention (cf. `gameSpeedTuningEnabled`).

---

## 5. Touch list (minimal, mirrors existing structure)

- **[emigration-events.js](../ui/emigration-events.js#L186)** — compute the continuous `m` (impact +
  pillage) and pass it to `recordDisaster`; keep `eventSeverity` for the notify/marker path only.
- **[emigration-disasters.js](../ui/emigration-disasters.js#L257)** — `recordDisaster` signature takes
  `m`; apply `shape(m)`, `speedShock`, diminishing stacking, and `disasterAccumCap`. `CLASS_WEIGHT`
  comment changes from "severity-1 weight" to "full-impact ceiling".
- **[emigration-game-speed.js](../ui/emigration-game-speed.js#L102)** — add `speedShock(x) = x / S`,
  documented beside `speedDecay`.
- **[emigration-config.js](../ui/emigration-config.js#L405)** — five new tunables above.
- **[emigration-tunables.js](../ui/emigration-tunables.js)** — expose the two master flags + gamma.
- **No change** to `disasterPercent`, `distress`, attrition, or persistence schema — the spike value is
  simply better-shaped before it lands, so downstream math and saves are untouched.

---

## 6. Tests (extend [tests/disasters.mjs](../tests/disasters.mjs))

1. **No-pillage thunderstorm ⇒ ~0 distress.** `m = 0` ⇒ `w = 0` ⇒ city's `disasterPercent ≈ 0`.
2. **Impact monotonicity.** For fixed type, larger `m` ⇒ strictly larger `w` (continuity, no cliff at
   the old `35%` step).
3. **Type ceiling.** Max-impact thunderstorm `w` < min-meaningful-impact volcano `w` (a storm can
   never out-punish a volcano).
4. **Speed invariance of total bite.** Sum of `disasterPercent` over the full decay tail at Marathon ≈
   the Standard sum (within tolerance) for the same event — the area-under-curve test for §3.3.
5. **Accumulation cap + recovery.** Five back-to-back volcanoes never exceed `disasterAccumCap`; the
   city's distress decays to `< 0.05` (drops) within bounded game-time.
6. **Flags off ⇒ legacy.** With both master flags `false`, `w` reproduces today's
   `CLASS_WEIGHT × severity` exactly (regression guard).

Wire any new harness into `package.json` `test:js` + `verify` and `scripts/required-scripts-gate.mjs`,
per repo convention.

---

## 7. Why this is the elegant fix

- **One continuous signal** (`m`, from data the mod already reads) replaces a coarse integer and a flat
  per-type tax, so damage finally *means* "what the disaster did here."
- **Type becomes a ceiling**, which is the intuitive contract: *kind* caps the worst case, *impact*
  picks the point inside it. Thunderstorms are bounded harmless; volcanoes can still be terrifying when
  they earn it.
- **`speedShock` completes the speed model** with the one transform it was missing, fixing Marathon by
  construction rather than by hand-tuned constants.
- **A provable recovery floor** ends the "dead city forever" outcome.
- Everything is **flag-gated, fail-safe, and downstream-compatible** — no schema bump, no change to the
  prosperity/attrition core, and a one-switch path back to the old behavior.
