# Emigration — Feature Improvements: Design & Implementation Plan

This is the authoritative spec for the next wave of **Emigration** features. It maps every
relevant existing pipeline (with `file:line` anchors), then gives a concrete, implementation-grade
plan for each new feature — which files change, which functions to touch, the data shapes, the new
config knobs, the localization keys, and the tests to add.

Conventions (match the rest of the mod):
- Every new behaviour is **flag-gated** in [emigration-config.js](../ui/emigration-config.js) and, where
  player-facing, exposed as a tunable in [emigration-tunables.js](../ui/emigration-tunables.js). Defaults
  conservative.
- Never touch the **population-scaling** constants (they are pinned bit-for-bit to the Demographics mod
  by `tests/scaling-demographics-parity.mjs`).
- Never change the network/flow **sim/layout/canvas-buffer** coordinates (`WX = 1120`, `WY = 560`).
- ESLint **complexity ≤ 10**; `max-len` and `no-unused-vars` are error-level. Extract helpers.
- New `ui/*.js` and `data/*.xml` files must be added to the matching scope's `ImportFiles` /
  `UpdateDatabase` in [emigration.modinfo](../emigration.modinfo).
- New player-visible strings go in **all locales** (`text/` ModText) — `tests/validate-package.mjs`
  enforces 100% parity across the 9–10 languages.
- Each feature ships with a node test harness wired into `package.json` (`test:js` + `verify`) and the
  `scripts/required-scripts-gate.mjs` required-array, so a dropped harness fails the gate.

> Line numbers below are accurate as of this writing but the codebase moves; treat the **function
> name** as the source of truth and the line as a hint. Re-grep before editing.

---

## 0. The systems these features build on (current pipeline map)

### 0.1 Ethnic composition + lens (per-tile origin mosaic)

- **Model — [emigration-composition.js](../ui/emigration-composition.js)**
  - `compositionForCity(city)` (**L510**) → `{ total, owner, civs: [{ civ, pts, share }], dominant: { civ, share } | null }`.
    `civs` is sorted by `share` descending. This is the single source of truth for "who lives here".
  - `compositionForOwner(pid)` (**L528**) → same shape, empire-wide.
  - `recordCompositionPass(signals, migs)` (**L476**) — per-pass update; calls `integratePass()`.
  - `integrateCity(e, owner, rateFor)` (**L437**) / `integratePass(s, work, signals)` (**L454**) — the
    **integration-over-time** drift of non-owner origins toward the host, rate from
    `CONFIG.integrationRate` / `integrationUnrestRate` / `integrationWarRate`.
  - `load()` (**L144**) with `_loadedTurn` (**L53**) — the per-turn cache that the v1.6.x "refresh each
    turn" fix relies on. `STATE_KEY = "EmigrationEthnos_v1"` (**L37**); `CityComposition` typedef
    `{ owner, byCiv: Record<string,number>, total, name, seenTurn }` (**L32**).
- **Lens paint — [emigration-ethnicity-lens.js](../ui/emigration-ethnicity-lens.js)**
  - `tilePaints()` (**L190**) → `[{ x, y, fill: {x,y,z,w} }]` (float4 RGBA); calls
    `compositionForCity()` per settlement (**L203**).
  - `cachedBatches()` (**L254**) — the refresh trigger; `lensTurn()` (**L256**) busts the cache when
    `Game.turn` advances.
- **Per-tile spread — [emigration-ethnicity-distribution.js](../ui/emigration-ethnicity-distribution.js)**
  - `distributeTiles(plots, comp, scaledPeople)` (**L93**) → `[{ x, y, civ, people, density }]`.
- **Hover panel — [emigration-ethnicity-tooltip.js](../ui/emigration-ethnicity-tooltip.js)** (renders a
  `parts[]` array of origins with `share`, **L86–97**) and
  [emigration-lens-hover-panel.js](../ui/emigration-lens-hover-panel.js) (`registerLensHoverPanel()` **L282**,
  `rebuildIndex()` **L99**).
- **Origin colors — [emigration-civ-colors.js](../ui/emigration-civ-colors.js)** `civDisplayColor(pid, fallback)`
  (≈ **L300**) → readable `#RRGGBB`.

### 0.2 City readout (on-demand HUD panel)

- **Data — [emigration-city-readout-data.js](../ui/emigration-city-readout-data.js)**
  - `buildCitySnapshot(opts)` (**L151**) / `citySnapshot(cityId)` (**L318**) →
    `{ owner, cityName, population, cause, causeLabel, causeMix, distress, pressure, pressureToBar,
    topDestinationName, composition: { total, parts: [{ name, share }] } | null, ownerNet, ownerIn,
    ownerOut, ... }`.
- **Render — [emigration-city-readout.js](../ui/emigration-city-readout.js)**
  - `readoutModel()` (**L168**), `originsLine(comp)` (**L127**), corner placement via
    `CONFIG.cityReadoutCorner`.

### 0.3 Network / flow visualization

- **Frames (history the views consume) — [emigration-flow-history.js](../ui/emigration-flow-history.js)**:
  `Frame { turn, age, year, network: { nodes, edges, cityEdges, maxEdge, maxNode }, pops, intra, delta }`.
- **Dots view — [emigration-network-viz.js](../ui/emigration-network-viz.js)**: `renderNetworkViz()`,
  `mountChrome(parts)` (**L554**), `runLoop()` (**L708**). Canvas `WX = 1120`, `WY = 560`.
- **Flow view — [emigration-network-flow.js](../ui/emigration-network-flow.js)**: `renderFlowMap()` (**L852**),
  `buildFlowViz()` (**L747**), `mountFlowChrome()` (**L716**), `runFlowLoop()` (**L618**),
  `paintFlow()` (**L529**), `frameSegments()` (**L258**) →
  `[{ x0, y0, x1, y1, people, points, label }]`, `drawArrow()` (**L330**), `setFlowStroke()` (**L313**).
  `OUTFLOW = "#e0786b"`, `INFLOW = "#7fd08a"`, `FLOW_MIN_W = 1.6`, `FLOW_MAX_W = 8`.
- **Paint primitives — [emigration-network-paint.js](../ui/emigration-network-paint.js)**: `paint()` (**L510**),
  `drawCivCircle()` (**L368**), `drawFlowLine()` (**L468**), `drawEventBadge()` (**L480**).
- **Timeline — [emigration-network-timeline.js](../ui/emigration-network-timeline.js)**: `makeTimeline()`
  (**L206**), `makeTimelineArea()` (**L172**), `makeMarks()` (age-boundary + turn-tick overlay, ≈ **L100**),
  `makeAgeBar()` / `ageSegments()` (≈ **L55–70**). Marks are positioned as `% of width` in
  `.emig-netc-marks`.
- **Sizing — [emigration-network-fit.js](../ui/emigration-network-fit.js)**: `installStageFit()` (shared by both
  views; do not regress the v1.6.x window-fit work).
- **Interaction — [emigration-network-interact.js](../ui/emigration-network-interact.js)**: hit-testing
  (`nearestCluster()`, `nearestCity()`), hover tooltip.

### 0.4 Chronicle / narrative / return / effects / causes

- **Chronicle — [emigration-chronicle.js](../ui/emigration-chronicle.js)**: `chronicle(entry)` (**L147**),
  `chronicled(key)` (**L120**), `chronicleLog(limit)` (**L209**). `ChronicleEntry { turn, kind:
  "exodus"|"founding"|"return", title, body, civ?, people?, cause?, dedupeKey? }` (**L17**);
  `STATE_KEY = "EmigrationChronicle_v1"`, `MAX_ENTRIES = 80` (**L13**). Mirrors to Notifications via
  `mirrorToNotifications()` (**L133**).
- **Narrative — [emigration-narrative.js](../ui/emigration-narrative.js)**: `exodusLine(e)` (**L158**),
  `foundingLine(e)` (**L177**), `returnLine(e)` (**L202**), `chronicleTitle(e)` (**L224**),
  `dilemmaPrompt(e)` (**L253**). All deterministic via `pick(list, seed, salt)` (FNV-1a, **L23–31**).
- **Diaspora chronicling — [emigration-diaspora.js](../ui/emigration-diaspora.js)**: `recordChroniclePass()`
  (**L169**), `detectFoundingForCity(city)` (**L143**), `leadForeignOrigin(comp)` (**L131**);
  `DIASPORA_MIN = 0.15` (**L32**), `DIASPORA_STEP = 0.15` (**L33**).
- **Return migration — [emigration-return.js](../ui/emigration-return.js)**: `planReturns(signals)` (**L322**),
  `planOneReturn(host, ctx)` (**L264**), `returnAllowed()` (**L207**), `prosperingOwners(signals)`
  (**L126**), `eligibleDiaspora(comp)` (**L161**), `chronicleReturn()` (**L220**). `STATE_KEY =
  "EmigrationReturn_v1"`.
- **Integration-cost economy — [emigration-effects.js](../ui/emigration-effects.js)**:
  `addAssimilationLoad(destOwner, destPopulation)` (**L105**), `tickAssimilation(pid)` (**L124**),
  `assimLoadFor(pid)` (**L216**), `congestionPenalty(pid, civPop)` (**L245**). `STATE_KEY =
  "EmigrationAssim_v1"`. (Note: the changelog renames "assimilation" → "integration" in player text;
  internal identifiers stay.)
- **Causes — [emigration-causes.js](../ui/emigration-causes.js)**: `MigrationCause =
  "unhappiness"|"prosperity"|"war"|"disaster"|"conquest"|"attrition"|"return"` (**L23**); refugee set
  `{war,disaster,conquest}` (**L35**); `causeLabel` (**L106**), `causeHint` (**L153**), `isRefugeeCause`
  (**L97**).
- **Records — [emigration-migration-records.js](../ui/emigration-migration-records.js)**: `moveRecord()`
  (**L45**), `departRecord()` (**L68**), `arriveRecord()` (**L89**). Record carries `originCiv`,
  `destOwner`, `cause`, `destPaidCost`, `people`, `phase`.

### 0.5 Per-turn loop (where new systems hook)

- **[emigration-main.js](../ui/emigration-main.js)**: `onTurnActivated(data)` (**L233**, engine
  `PlayerTurnActivated`); per-civ `chargePerTurnCosts(who, local)` (**L207** → `tickAssimilation` **L210**,
  `applyMigrantHoldingPenalty` **L216**, `tickAttractionDividend` **L222**); the local-player
  `doPass(why)` (**L158**): `runPass()` → `collectCitySignals()` (**L164**) → `foldReturns()` (**L165**) →
  `recordCompositionPass()` (**L169**) → `recordChroniclePass()` (**L172**) → `recordMigrations()`
  (**L178**). `gameTurn()` (**L54**) returns `Game.turn`. **New per-turn systems are added inside
  `doPass()` between L165–L178, or to `chargePerTurnCosts()` for per-civ logic.**

### 0.6 Border policy / immigration stance (relevant to §12 — read this for the user's question)

- **Stance VM — [emigration-borders.js](../ui/emigration-borders.js)**: reads slotted **native Traditions**
  via `Culture.isTraditionActive`. Exports `immigrationOpenness(pid)` (**L85**), `emigrationRetention(pid)`
  (**L103**), `activeAttractions(pid)` (**L115**), `hasAsylum(pid)` (**L129**), `borderStance(pid)`
  (**L139** → `"pro"|"anti"|"none"`). Tradition type arrays: `OPEN_TYPES`, `CLOSED_TYPES`, `TALENT_TYPES`,
  `CULTPULL_TYPES`, `TRADEPULL_TYPES`, `ASYLUM_TYPES` (**L13–35**).
- **Consumed in pull — [emigration-pull.js](../ui/emigration-pull.js)**: imports those three at **L16**;
  `permeability(src, dest)` (**L93**) multiplies `opennessFor(dest)` (**L~180**) × `retentionFor(src)`
  (**L~192**) × deal/alliance/war factors, clamped to `[permeFloor, permeCeil]` in `adjustedPull()`
  (**L172**). Refugee asylum easing at **L77**.
- **Government read — [emigration-polity.js](../ui/emigration-polity.js)**: `readPolity(owner)` (**L155**) →
  `{ government, celebrating, goldenAgeTurnsLeft, warWeary }`; `readGovernment(player)` (**L188**) via
  `Culture.getGovernmentType()` → `GameInfo.Governments.lookup().GovernmentType`; `governmentLean()`
  (**L214**) + the `GOVERNMENT_LEAN` table.
- **Data (native cards) — [data/emigration-policies-antiquity.xml](../data/emigration-policies-antiquity.xml)**,
  `-exploration.xml`, `-modern.xml`, `-gameeffects.xml`, `-policy-icons.xml`. Two slotable Traditions per
  age (Open / Closed Borders) in `POLICY_CULTURE_SLOT`, unlocked at `NODE_CIVIC_AQ_MAIN_CITIZENSHIP`
  (and the per-age equivalents). Native modifiers: Open `+1/+2/+3` Influence; Closed `-2/-3/-4`
  Influence **and** `+2/+3/+4` Production per city (autarky).
- **Config — [emigration-config.js](../ui/emigration-config.js)**: `bordersEnabled` (**L384**),
  `closedBordersOpenness: 0.4` (**L385**), `closedBordersRetention: 0.6` (**L386**),
  `openBordersOpenness: 1.5` (**L387**), `opennessFloor: 0.15` (**L388**), `permOpenBorders` (**L53**),
  `openBordersBonus` (**L172**). Tunables at [emigration-tunables.js](../ui/emigration-tunables.js#L40-L43).

---

## 1. Feature A — Diaspora legend on the lens *(low risk, high value)*

**Goal.** When the Ethnic Composition lens is on (or on hover), show a compact key listing the origins
present in the focused city with their **share %** and **color swatch**, so the mosaic is readable.

**Why it's cheap.** The data already exists: `compositionForCity(city).civs` is the sorted
`[{civ, pts, share}]` array, and `civDisplayColor(civ)` gives each origin's color. Two natural hosts
already render origins.

**Implementation.**
1. **Hover panel (preferred).** In
   [emigration-ethnicity-tooltip.js](../ui/emigration-ethnicity-tooltip.js) where it renders `parts[]`
   (**L86–97**), add a per-origin row: a `<span>` swatch (`background = civDisplayColor(p.civ)`) +
   localized civ name + `Math.round(p.share*100) + "%"`. The `parts[]` already carries `share`; add `civ`
   to it if not present (it is computed from `compositionForCity`, so thread `p.civ` through).
2. **Optional fixed legend.** Add a small always-on overlay when the lens is active. New helper
   `buildDiasporaLegend(comp)` in a new file [emigration-lens-legend.js](../ui/emigration-lens-legend.js)
   (keep the lens paint file under the complexity gate). Mount it from the lens activation path in
   [emigration-ethnicity-lens.js](../ui/emigration-ethnicity-lens.js) near `cachedBatches()` (**L254**);
   rebuild on the same `lensTurn()` cache-bust so it refreshes each turn.
3. **CSS.** Add `.emig-diaspora-leg` styles via the existing injected-stylesheet pattern (see
   `NETC_CSS` in [emigration-network-viz.js](../ui/emigration-network-viz.js#L108) for the idiom) or the
   lens's own style block.

**Config / tunables.** `lensLegendEnabled: true` (config + a `bool` tunable in the `scope` group).

**Localization.** `LOC_EMIG_LENS_LEGEND_TITLE` ("Communities here"), `LOC_EMIG_LENS_LEGEND_OTHER`
("Other"). Use the existing "community/diaspora" wording (not "minority").

**Tests.** Extend `tests/ethnicity-distribution-branches.mjs` or add `tests/lens-legend.mjs`: feed a
known composition, assert the legend rows match `civs` order, shares sum to ~100%, and a single-origin
city yields one row.

**Risk.** Minimal — read-only over existing data, GameFace-safe DOM (use `removeChild` loop, not
`replaceChildren`).

---

## 2. Feature B — Animated flow particles along the arrows *(medium)*

**Goal.** Make the Flow view visually distinct from Dots: send small dots traveling source→dest along
each arrow, speed/spacing ∝ volume, so "who is bleeding to whom" reads at a glance.

**Current state.** Arrows are static quadratic curves drawn each frame by `drawArrow()`
([emigration-network-flow.js](../ui/emigration-network-flow.js#L330)) from `frameSegments()`
(**L258**) → `{x0,y0,x1,y1,people,points,label}`. The render loop is `runFlowLoop()` (**L618**) calling
`paintFlow()` (**L529**) when dirty.

**Implementation.**
1. **Parametric position.** The curve already has a control point (`curveControl(segment)` /
   `setFlowStroke()` **L313**). Add a pure helper `bezierPoint(seg, ctrl, t)` returning the `(x,y)` at
   `t∈[0,1]` on the quadratic. (Standard `(1-t)²P0 + 2(1-t)t·C + t²P1`.)
2. **Particle phase.** Add a module-level monotonic `_flowPhase` advanced each frame in `runFlowLoop()`
   (e.g. `+= speedMul * dt`). For each segment, draw `N = clamp(round(seg.people / UNIT), 1, MAX_DOTS)`
   particles at `t = frac(_flowPhase * SPEED + k/N)` for `k in 0..N-1`. Color each particle by lerping
   `OUTFLOW → INFLOW` over `t` (reuse the gradient logic).
3. **Keep the loop alive.** `paintFlow()` currently repaints only when `dirty`. Gate particle animation
   behind `CONFIG.flowParticlesEnabled`; when on, treat the view as "always animating" the way the Dots
   view's `needsPaint()` keeps repainting during playback (see
   [emigration-network-viz.js](../ui/emigration-network-viz.js) `needsPaint()`), but **throttle** to a
   modest particle FPS to avoid pegging GameFace. Respect the existing rAF loop; do not add a second
   loop.
4. **Draw primitive.** Add `drawFlowParticle(ctx, x, y, r, color)` next to `drawArrow()`; small filled
   arc. Keep `drawArrow()` complexity ≤ 10 by putting the particle pass in its own function called from
   `paintFlow()` after the arrows are stroked (so particles sit on top).

**Config / tunables.** `flowParticlesEnabled: true`; `flowParticleSpeed` (choice, e.g. `[0,0.5,1,2]`,
`0` disables) in a new `visuals` tunable group; `MAX_DOTS`/`UNIT` as module constants.

**Tests.** `tests/network-flow-particles.mjs`: unit-test `bezierPoint()` endpoints (`t=0→P0`,
`t=1→P1`) and that particle count scales with `people` and clamps. (Canvas drawing itself is not
unit-tested; assert the geometry helpers.)

**Risk.** Performance on low-end GPUs — mitigate with the speed=0 off switch and a hard `MAX_DOTS`.
Do **not** alter `WX/WY` or segment geometry.

---

## 3. Feature C — "Brain drain" highlighting (net importer/exporter) *(medium)*

**Goal.** Tint or ring each civ circle by its **net migration** over the visible timeline — green for
net importers, red for net exporters — so the migration winners/losers are obvious on both views.

**Current state.** Per-civ net is **not pre-computed** in the viz files; `frame.network.edges[]` carries
`{from, to, people}` (or `cityEdges[]`). Civ circles are drawn by `drawCivCircle()`
([emigration-network-paint.js](../ui/emigration-network-paint.js#L368)). The ledger view already computes
per-civ in/out/net for the dashboard — reuse that rather than re-deriving.

**Implementation.**
1. **Source the totals.** Prefer the existing ledger math. Check
   [emigration-ledger-view.js](../ui/emigration-ledger-view.js) and
   [emigration-migration-stats.js](../ui/emigration-migration-stats.js) for a per-owner
   `{in, out, net}` builder; if present, export a pure `netByCiv(section)` helper and import it into the
   viz. If not, add `netByCiv(frames)` to [emigration-flow-history.js](../ui/emigration-flow-history.js):
   fold `edges[]` to `out[from] += people`, `in[to] += people`, `net = in - out`.
2. **Map net → color.** Add `brainDrainTint(net, maxAbs)` returning an rgba ramp
   (red↔neutral↔green). Pass a per-civ `net` into the scene nodes (extend `NetworkNode` with a
   transient `net` field set at build time in `buildCenters()` /
   [emigration-network-viz.js](../ui/emigration-network-viz.js#L189)).
3. **Apply.** In `drawCivCircle()` (**L368**) use the tint for the stroke or a faint fill when
   `CONFIG.brainDrainHighlight` is on; otherwise the current color. Keep the lens-driven coloring
   (origin/cause/movement) intact — this is an **additive ring**, gated by a new lens option, not a
   replacement.
4. **Legend.** Add a one-line key (red = losing people, green = gaining) to the existing legend builder
   (`flowLegend()` in [emigration-network-flow.js](../ui/emigration-network-flow.js#L644) and the dots
   legend) when the highlight is active.

**Config / tunables.** `brainDrainHighlight: false` (off by default — it's a strong visual);
`visuals` group bool tunable.

**Tests.** `tests/network-brain-drain.mjs`: `netByCiv()` on a tiny frame set returns correct
in/out/net; `brainDrainTint()` is monotonic and symmetric around 0.

**Risk.** Visual clash with the existing lens recolor — keep it a separate ring/option.

---

## 4. Feature D — Timeline event pins *(medium)*

**Goal.** Pin the wars/disasters that *caused* migration spikes onto the timeline scrubber, so a player
can scrub to "why did everyone leave here on turn 84?"

**Current state.** `makeMarks(frames)` ([emigration-network-timeline.js](../ui/emigration-network-timeline.js#L100))
builds the age-boundary lines + turn ticks into `.emig-netc-marks`, positioned as `% of width`. The
view already resolves `section.events[] = [{ kind, label, from, to, civs, cis }]` where `from/to` are
**frame indices**. Event badges are drawn near clusters (`drawEventBadge()`
[emigration-network-paint.js](../ui/emigration-network-paint.js#L480)) but **not** on the timeline.

**Implementation.**
1. **Thread events to the timeline.** `makeTimeline(frames, pb, onSet)` (**L206**) currently takes only
   `frames`. Add an optional `events` param (default `[]`) and pass it from both callers
   (`mountChrome` / `mountFlowChrome`). Keep the signature backward-compatible.
2. **Pin builder.** New `makeEventPins(frames, events)` returning a layer of absolutely-positioned
   pins: `left = (event.from / (frames.length - 1)) * 100 + "%"`, an icon/glyph by `event.kind`
   (war/disaster), and a hover tooltip with `event.label`. Append it into the same `.emig-netc-marks`
   container inside `makeTimelineArea()` (**L172**). Keep `makeMarks()` and `makeEventPins()` separate so
   each stays ≤ 10 complexity.
3. **Click-to-scrub.** On pin click, call the timeline's `goTo(event.from)` (already returned by
   `makeTimeline`) so clicking a pin jumps the scrubber there.
4. **De-dup / crowding.** When two events share a frame column, offset vertically or merge into a
   count badge — a small `clusterPinsByColumn()` helper.

**Config / tunables.** `timelineEventPins: true` (visuals group bool).

**Localization.** Reuse existing event labels; add `LOC_EMIG_TL_PIN_WAR` / `LOC_EMIG_TL_PIN_DISASTER`
tooltips if the resolved labels aren't player-ready.

**Tests.** `tests/network-timeline-pins.mjs`: `makeEventPins()` positions a known event at the right
`%`, clusters two same-column events, and yields zero pins for an empty events array.

**Risk.** Low — additive DOM in an existing overlay. Verify GameFace positions `%`-left children
correctly (it does for the existing marks).

---

## 5. Feature E — Net-migration sparkline in the city readout *(low)*

**Goal.** A tiny inline trend in the per-city readout ("gaining/losing over the last N passes") so the
panel feels live and answers "is this getting better or worse?"

**Current state.** [emigration-city-readout-data.js](../ui/emigration-city-readout-data.js) exposes
`ownerNet/ownerIn/ownerOut` and the session-local `recentEventsFor` feed; the readout renders via
`readoutModel()` ([emigration-city-readout.js](../ui/emigration-city-readout.js#L168)).

**Implementation.**
1. **Series.** Add a small ring buffer of recent per-city net values. Cheapest: derive from the existing
   migration timeline (`recordMigrations` history) — add `cityNetSeries(cityId, n)` to
   [emigration-migration-records.js](../ui/emigration-migration-records.js) or the readout-data module,
   returning the last `n` net values (in/out per recorded pass for that city).
2. **Render.** Add `sparkline(values, w, h)` returning an inline SVG/canvas-free `<div>` bar strip
   (GameFace-safe: a row of `<span>`s with heights, or a tiny `<canvas>` reusing `setupCanvas()` from the
   network module). Insert into `readoutModel()` near `originsLine()` (**L127**).

**Config / tunables.** `cityReadoutSparkline: true` (bool tunable).

**Tests.** `tests/city-readout-sparkline.mjs`: `cityNetSeries()` length/bounds; `sparkline()` clamps and
handles all-zero / single-point series.

**Risk.** Minimal.

---

## 6. Feature F — Cultural-blending outcomes at high integration *(higher — gameplay)*

**Goal.** When a diaspora reaches **high integration** in a host city, grant a small, flavorful,
**bounded** reward (a one-time yield bump and/or a named "Cultural Quarter" chronicle moment), so the
integration system you already simulate *matters* mechanically.

**Current state.** Integration-over-time lives in `integrateCity()` /
[emigration-composition.js](../ui/emigration-composition.js#L437). Diaspora *visibility* milestones are
already detected by tier in `detectFoundingForCity()`
([emigration-diaspora.js](../ui/emigration-diaspora.js#L143), `DIASPORA_STEP = 0.15`). There is no
"fully blended" outcome yet. The per-turn yield-grant plumbing exists in
[emigration-effects.js](../ui/emigration-effects.js) (`Players.grantYield` via `deduct()` — can grant
positive too) and the dividend path (`tickAttractionDividend`).

**Implementation.**
1. **Detect the milestone.** A diaspora has "blended" when a once-significant foreign origin has
   integrated down past a low threshold *after* having been high — i.e. its `share` fell from ≥
   `CONFIG.blendFromShare` to ≤ `CONFIG.blendToShare`. Track a per-(city,origin) high-water mark in a new
   tiny persisted map (or piggyback the composition `seenTurn`/tier dedupe). Add
   `detectBlendForCity(city)` next to `detectFoundingForCity()` in
   [emigration-diaspora.js](../ui/emigration-diaspora.js), called from `recordChroniclePass()` (**L169**).
2. **Reward (bounded, flag-gated).** On first blend per (city,origin), grant a **one-time** yield bump
   (e.g. small Culture or Happiness) via a new `grantBlendBonus(owner, kind, amount)` in
   [emigration-effects.js](../ui/emigration-effects.js), reusing the `grantYield` path. Cap total
   blend bonuses per civ per age to prevent farming. Default the reward small; expose `blendBonusYield`
   / `blendBonusAmount` tunables; `0` disables (chronicle-only).
3. **Narrative.** Add `blendLine(e)` to [emigration-narrative.js](../ui/emigration-narrative.js) (a
   "Cultural Quarter" / "the newcomers are now simply locals" prose set) and chronicle it
   (`kind: "founding"` reused, or a new `"blend"` kind — if new, extend the `ChronicleEntry.kind` union
   **L17**, the view's kind label in
   [emigration-chronicle-view.js](../ui/emigration-chronicle-view.js#L49), and `chronicleTitle()`
   **L224**).

**Config / tunables.** `culturalBlendEnabled: false` (off by default — it's a new reward),
`blendFromShare: 0.3`, `blendToShare: 0.05`, `blendBonusYield: "YIELD_CULTURE"`, `blendBonusAmount`,
`blendBonusCapPerAge`.

**Balance.** Must be snowball-safe: a magnet civ integrates more diasporas, so cap per-age and keep the
bonus token. Add a note to `scripts/snowball-stress.mjs` coverage if the bonus is yield-material.

**Tests.** `tests/cultural-blend.mjs`: high-water tracking; first-blend fires once (dedupe); cap
enforced; disabled flag → no grant, chronicle still optional.

**Risk.** Gameplay/balance — ship **off by default**, document in the guide
([emigration-guide.js](../ui/emigration-guide.js)) and Civilopedia
([data/emigration-civilopedia.xml](../data/emigration-civilopedia.xml)).

---

## 7. Feature G — Homeland "pull-back" events *(medium — gameplay)*

**Goal.** Dramatize the existing (quiet) return migration: when a homeland recovers (post-war / golden
age), occasionally fire a visible "the homeland calls" **wave** home, with a chronicle moment and a
toast, instead of the silent trickle.

**Current state.** Return migration already exists: `planReturns()`
([emigration-return.js](../ui/emigration-return.js#L322)) → `planOneReturn()` (**L264**), gated by
`returnAllowed()` (**L207**) and `prosperingOwners()` (**L126**); it already chronicles via
`chronicleReturn()` (**L220**) and `returnLine()`. What's missing is the **burst** framing and a
celebration/peace **trigger**.

**Implementation.**
1. **Trigger.** In `prosperingOwners()` / `returnAllowed()`, add a stronger condition: a homeland that
   *just* entered a Golden Age (`readPolity(owner).celebrating` from
   [emigration-polity.js](../ui/emigration-polity.js#L155)) or *just* made peace becomes a "calling"
   homeland for a few turns. Track an edge-trigger (was-not-celebrating → is-celebrating) in the return
   state.
2. **Burst.** When calling, temporarily raise the return volume/probability for that homeland (scale
   `returnRoll` / the per-host cap) for `CONFIG.pullbackTurns`, bounded so it can't drain hosts (still
   respects `minRuralToEmigrate`).
3. **Surface it.** Emit a distinct chronicle entry (`kind: "return"`, but a "wave" title variant via
   `chronicleTitle()`) and a throttled toast through the existing important-toast cooldown (see the
   Phase-1 digest in [emigration-feedback.js](../ui/emigration-feedback.js) /
   [emigration-notifications.js](../ui/emigration-notifications.js)).

**Config / tunables.** `homelandPullback: true`, `pullbackTurns: 3`, `pullbackBoost` (choice).

**Tests.** Extend `tests/return.mjs`: celebration edge-trigger arms the burst; burst decays after
`pullbackTurns`; never drains below the rural floor; disabled flag → current trickle behaviour.

**Risk.** Balance — bound the burst and keep the rural-floor guard so it can't depopulate a host.

---

## 8. Feature H — End-of-age migration recap *(low–medium)*

**Goal.** At each age rollover, post a satisfying recap ("In Antiquity, ~2.1M people moved; the great
story was the flight from Rome to Carthage"), generated from the Chronicle/records you already keep.

**Current state.** Per-turn loop is `doPass()`
([emigration-main.js](../ui/emigration-main.js#L158)); `gameTurn()` gives the turn but **age is not read
here** — it's available via `readPolity()` only for government, not age. Age strings exist on the viz
frames (`frame.age`, e.g. `"AGE_ANTIQUITY"`). Chronicle history is in
[emigration-chronicle.js](../ui/emigration-chronicle.js); migration timeline in
[emigration-flow-history.js](../ui/emigration-flow-history.js).

**Implementation.**
1. **Detect the boundary.** Read the current age once per pass. The robust source is the game's age API
   (probe for `Game.age` / `GameInfo.Ages` / the same source the viz uses to stamp `frame.age`). Persist
   `lastSeenAge`; when it changes, fire the recap. Add `currentAge()` to
   [emigration-polity.js](../ui/emigration-polity.js) (it already centralizes game reads) and a
   `lastSeenAge` field to a small state.
2. **Aggregate.** New `ageRecap(ageKey)` in a new file
   [emigration-age-recap.js](../ui/emigration-age-recap.js): sum people moved during the age from the
   migration history, find the top origin→dest corridor, the biggest exodus, and the biggest gainer.
3. **Emit.** Chronicle it (`kind: "founding"`/new `"recap"`) + one toast. Reuse `formatPeopleExact()`
   and the corridor data already used by the flow view.

**Config / tunables.** `ageRecapEnabled: true`.

**Tests.** `tests/age-recap.mjs`: boundary edge-trigger fires once per age; aggregation picks the right
top corridor; no-data age → graceful empty recap (no throw).

**Risk.** The age-read API must be verified in-game (best-effort with a neutral fallback — never throw).

---

## 9. Feature I — Migration-story follow-ups *(low)*

**Goal.** Close the narrative loop: a chronicle/notification entry can carry a "where are they now?"
follow-up (e.g. "the Roman diaspora that fled to Carthage is now 40% integrated").

**Current state.** Founding moments are chronicled with a `dedupeKey` that already encodes
`city|origin|tier` ([emigration-diaspora.js](../ui/emigration-diaspora.js#L151)). Integration share is
queryable any turn via `compositionForCity()`.

**Implementation.** When `detectFoundingForCity()` crosses a *downward* tier (integration progressing),
emit a short follow-up line via a new `followupLine(e)` in
[emigration-narrative.js](../ui/emigration-narrative.js), reusing the same dedupe scheme keyed on the new
tier. This largely overlaps Feature F — implement F and I together (F = the mechanical reward at full
blend; I = the narrative breadcrumbs along the way).

**Tests.** Folded into `tests/cultural-blend.mjs`.

---

## 10. Feature J — Migration-pressure map overlay *(higher — new map UI)*

**Goal.** Color your settlements on the map by net migration pressure, so you can spot bleeding cities
at a glance without opening each readout.

**Current state.** There is already a lens framework
([emigration-ethnicity-lens.js](../ui/emigration-ethnicity-lens.js),
[emigration-prosperity-lens.js](../ui/emigration-prosperity-lens.js)) that paints tiles via float4 RGBA
batches. `citySnapshot()` gives `pressureToBar` per city.

**Implementation.** Add a third lens mode "Migration Pressure" mirroring
[emigration-prosperity-lens.js](../ui/emigration-prosperity-lens.js): for each owned (or all met) city,
map `pressureToBar` (or `ownerNet`) to a red→green tile fill over the city's plots (reuse
`distributeTiles()` or a simpler whole-footprint fill). Register it alongside the existing lenses.

**Config / tunables.** `pressureLensEnabled: true`.

**Tests.** `tests/pressure-lens.mjs` mirroring the ethnicity/prosperity lens tests.

**Risk.** Medium — new lens registration + map paint; follow the prosperity-lens file as the template to
stay within the engine's lens API.

---

## 11. Feature K — Chain migration toward existing enclaves *(higher — model change)*

**Goal.** People migrate preferentially toward destinations that *already* host a community of their
origin (real-world chain migration), producing emergent, growing ethnic enclaves.

**Current state.** Pull is computed per `(src, dest)` in `adjustedPull()`
([emigration-pull.js](../ui/emigration-pull.js#L150)); a **TILT** term already exists for targeted
attraction (`tiltFor(src, dest)`, clamped by `CONFIG.tiltCap`). Per-origin presence at a destination is
exactly `compositionForCity(destCity)` / `compositionForOwner(destOwner)`.

**Implementation.**
1. **Enclave signal.** Add `enclaveAffinity(originCiv, dest)` reading the destination's composition share
   for `originCiv` (via `compositionForOwner(dest.owner)` or a per-city composition if the dest signal
   carries a city). Return a **bounded** additive bonus `= CONFIG.chainMigrationWeight * share`, capped.
2. **Wire into TILT.** Fold it into `tiltFor(src, dest)` so it rides the **existing clamped TILT
   channel** (no new unclamped term, preserves the anti-snowball bounds). Only applies to cross-civ /
   cross-city moves where the mover's origin matters — thread the mover's `originCiv` (already on the
   migration record) into the pull call, or approximate with the source civ for economic movers.
3. **Determinism.** Pure function of composition + config; no RNG.

**Config / tunables.** `chainMigrationEnabled: false` (off by default — it changes movement),
`chainMigrationWeight` (choice), `chainMigrationCap`.

**Balance.** This is a positive feedback loop (enclaves attract more of the same origin) — it MUST be
capped and run through `scripts/snowball-stress.mjs` and the calibration sweep before defaulting on.

**Tests.** `tests/chain-migration.mjs`: affinity scales with share, clamps at the cap, is zero when the
feature is off, and never makes pull unbounded (assert TILT clamp still binds).

**Risk.** Highest of the visualization/model set — model behaviour change. Ship off by default, validate
with the existing balance scripts, and document.

---

## 12. Refugee policy as a standing stance — what EXISTS, and how to DEEPEN it

**Short answer to your question: yes — this is already implemented**, and as real native **policy cards
(Traditions)**, not just a one-off dilemma. So my earlier "refugee policy as a standing stance"
suggestion was redundant with what's already shipping. Here is exactly what exists, then a concrete
design for the *deeper* version you described (government gating, granular per-people closure,
asymmetric consequences).

### 12.1 What already exists today

Defined as native, slotable **Traditions** in `POLICY_CULTURE_SLOT`, one pair per age, unlocked at a
civic node (`NODE_CIVIC_AQ_MAIN_CITIZENSHIP` and per-age equivalents):
- **Open Borders** (Pro-Immigration): native **+1/+2/+3 Influence** by age
  ([data/emigration-policies-gameeffects.xml](../data/emigration-policies-gameeffects.xml)); UI-VM adds
  **+50% immigration pull** (`openBordersOpenness = 1.5`). `borderStance(pid) → "pro"`.
- **Closed Borders** (Anti-Immigration): native **−2/−3/−4 Influence** **and** **+2/+3/+4 Production per
  city** (autarky); UI-VM throttles **inbound to 40%** (`closedBordersOpenness = 0.4`, floored at
  `opennessFloor = 0.15`) and **retains your own emigrants at 60%** (`closedBordersRetention = 0.6`).
  `borderStance(pid) → "anti"`.
- **Attraction cards** (Talent/Cultural/Commercial): carried **+Science/+Culture/+Gold** dividends that
  scale with immigration (`activeAttractions()` → dividend in
  [emigration-consequences.js](../ui/emigration-consequences.js#L52) + a small fixed native floor).
- **Asylum cards**: ease refugee-caused pull toward the holder (`hasAsylum()` consumed in
  [emigration-pull.js](../ui/emigration-pull.js#L77)).

The whole layer is read in [emigration-borders.js](../ui/emigration-borders.js) and applied as the
**PERMEABILITY** channel in [emigration-pull.js](../ui/emigration-pull.js) `permeability(src, dest)`
(**L93**): `openness(dest) × retention(src) × deal/alliance/war factors`, clamped to
`[permeFloor, permeCeil]`. So a stance is genuinely a standing, per-civ posture with an ongoing
Influence/Production/immigration trade-off — exactly the "standing stance" idea, already shipped.

### 12.2 What's NOT there yet — the deeper design you proposed

Three orthogonal extensions, each independently flag-gated. None require touching the population scaling
or the sim/layout.

#### 12.2a Government-form gating (who *may* close, and at what cost)

Make the **availability and cost** of a stance depend on the civ's government — e.g. an open,
representative government cannot fully close its borders (or pays a steep happiness/legitimacy cost to
do so), while an autocratic/mobilized government closes cheaply (and is *penalized* for staying open).

- **Read the government.** Already available: `readPolity(owner).government`
  ([emigration-polity.js](../ui/emigration-polity.js#L155)) → e.g. `"GOVERNMENT_DESPOTISM"`.
- **Pure enforcement, not native prohibition.** The engine slots a Tradition freely; the clean way to
  "prohibit" is to make the slotted card **inert or penalized** in JS rather than block the slot
  (blocking the slot needs native `TraditionRequirements`, which Civ VII does not reliably expose for a
  modded predicate). Add a `governmentBorderRule(government)` table in
  [emigration-borders.js](../ui/emigration-borders.js):
  `{ canClose: boolean, closeOpennessMult, openInfluencePenalty, closeHappinessPenalty }` per known
  government, with a neutral default for unknown ones.
- **Apply it.**
  - In `immigrationOpenness(pid)` (**L85**): if the government's `canClose === false`, clamp the Closed
    effect toward neutral (the card still grants its native Production, but the *immigration throttle*
    is reduced — "you can post the policy, but your open society keeps leaking"). Otherwise scale the
    throttle by `closeOpennessMult`.
  - For asymmetric **costs** that the native modifier can't express conditionally, charge them in JS in
    the per-turn path `chargePerTurnCosts()`
    ([emigration-main.js](../ui/emigration-main.js#L207)) via the existing `grantYield`/`deduct`
    plumbing in [emigration-effects.js](../ui/emigration-effects.js): e.g. an open government that slots
    **Closed** pays a happiness penalty each turn; an autocratic government that slots **Open** pays a
    legitimacy/Influence penalty.
- **Surface it.** Show the gate in the readout/guide and as a toast when a player slots a stance their
  government punishes (reuse the dilemma/feedback toast path).

**Config / tunables.** `governmentBorderRules: true`; the per-government table lives in code (like
`GOVERNMENT_LEAN`), optionally with a global `governmentBorderStrength` scalar (mirrors
`civTuningStrength`).

**Open question to settle before building:** enumerate the actual 1.4.1 government type ids and decide
the per-government rule (which governments are "can't fully close", which are "punished for staying
open"). Pull the list from `GameInfo.Governments` in-game (the same lookup `governmentName()` uses).

#### 12.2b Granular closure — closing to *certain peoples*, not all-or-nothing

Today `immigrationOpenness(pid)` is a **single per-destination scalar**. To close selectively (e.g.
"closed to civs you're hostile to, open to allies"), the openness must become a function of the
**pair** `(origin/source civ, destination civ)`.

- **Integration point.** `permeability(src, dest)`
  ([emigration-pull.js](../ui/emigration-pull.js#L93)) already has both `src` and `dest`, and already
  reads relationship factors (`hasOpenBordersDeal`, `hasAlliance`, `atWar` from
  [emigration-geography.js](../ui/emigration-geography.js)). Change `opennessFor(dest)` (**L~180**) to
  `opennessFor(src, dest)` and let the border module return a **pair-aware** multiplier.
- **Two viable data sources for "who is it closed to":**
  1. **Diplomacy-derived (no new UI, recommended first cut).** When a civ holds Closed Borders, apply
     the full throttle only to sources it is **hostile/at war** with, a softened throttle to neutral
     civs, and **near-neutral** to allies / open-borders-deal partners. This makes "selective closure"
     emergent from diplomacy and reuses signals already in `permeability()`. Add
     `selectiveOpenness(srcOwner, destOwner)` to [emigration-borders.js](../ui/emigration-borders.js).
  2. **Explicit per-civ choice (heavier, optional later).** A persisted per-civ "closed-to" set chosen
     via a small panel (model it on the refugee **dilemma** UI:
     [emigration-dilemma.js](../ui/emigration-dilemma.js) / `-dilemma-view.js`). New state key
     `EmigrationBorderTargets_v1`. Only worth it if players want manual control beyond diplomacy.
- **Keep it bounded.** The pair multiplier still flows through the existing
  `clamp(permeability, permeFloor, permeCeil)` (**L172**), so no stacking can break the model.

**Config / tunables.** `selectiveBorders: true`, `selectiveHostileMult` (extra throttle vs. hostile),
`selectiveAllyMult` (relief vs. allies).

#### 12.2c Richer, asymmetric consequences for both open *and* closed

You're right that **open** borders should also carry potential downsides, and **closing** should bite in
more than one dimension, with the mix depending on government/age.

- **Already present:** Open = +Influence, +inbound pull; Closed = −Influence, +Production, −inbound,
  +retention.
- **Additions (all flag-gated, native where possible, JS where conditional):**
  - **Open downside — assimilation strain.** Open borders pull more immigrants → more **integration
    load** (already modeled in [emigration-effects.js](../ui/emigration-effects.js)); optionally add a
    small extra happiness headwind while Open is slotted *and* the civ's recent net inflow is high
    (charge in `chargePerTurnCosts()`).
  - **Open downside — science/espionage exposure**, or **Closed downside — science/trade isolation.**
    Express flat parts as **native modifiers** in
    [data/emigration-policies-gameeffects.xml](../data/emigration-policies-gameeffects.xml) (the file
    already line-items per-age Influence and Production — add per-age Science/Trade modifiers the same
    way, with `COLLECTION_OWNER` / `COLLECTION_PLAYER_CITIES`). Conditional parts (scaling with net
    flow, or gated by government) stay in JS.
  - **International standing.** The Influence delta already *is* the standing lever; deepen it by making
    the magnitude **government- and age-scaled** (12.2a) rather than a flat native number — i.e. move the
    Influence from a fixed native modifier to a JS-charged amount when you need it conditional, or keep
    native for the base and add a JS top-up for the conditional slice.

**Where each consequence lives (rule of thumb):**
- **Flat, unconditional, per-age** → native modifier in the policy XML (visible on the card, in yields).
- **Conditional** (depends on government, diplomacy, recent flow, or selective targets) → JS in
  [emigration-borders.js](../ui/emigration-borders.js) (multipliers) + `chargePerTurnCosts()`
  ([emigration-main.js](../ui/emigration-main.js#L207)) (per-turn yields), reusing
  [emigration-effects.js](../ui/emigration-effects.js)'s `grantYield`/`deduct`.

### 12.3 Tests for the deepened stance

- Extend `tests/borders*.mjs` (and add `tests/border-government.mjs`, `tests/border-selective.mjs`):
  - government gate: a "can't close" government yields near-neutral openness even with Closed slotted;
  - a punished pairing charges the expected per-turn cost (mock `grantYield`/`deduct`);
  - selective closure: hostile source throttled, ally source relieved, product still within
    `[permeFloor, permeCeil]`;
  - all flags off → byte-identical to current behaviour (characterization test, like the existing
    `adjustedPull` test).

### 12.4 Localization / Civilopedia

- Update [data/emigration-civilopedia.xml](../data/emigration-civilopedia.xml) and the in-app guide
  ([emigration-guide.js](../ui/emigration-guide.js)) to explain government gating, selective closure, and
  the new consequences. New `LOC_EMIG_*` strings in all locales.

---

## 13. Cross-cutting work (applies to every feature)

1. **Config + tunables.** Add each flag to [emigration-config.js](../ui/emigration-config.js) (with a
   `@property` in [emigration-config-types.js](../ui/emigration-config-types.js)) and, where
   player-facing, a row in [emigration-tunables.js](../ui/emigration-tunables.js) (new `visuals` group
   for the viz features) with `LOC_EMIG_T_*` label/desc strings.
2. **modinfo.** Register every new `ui/*.js` in the game-scope `ImportFiles` and every new `data/*.xml`
   in the correct age-scoped `UpdateDatabase` block of [emigration.modinfo](../emigration.modinfo).
   `tests/modinfo.mjs` and `tests/validate-package.mjs` enforce this.
3. **Localization parity.** Every new visible string in all locales; `tests/validate-package.mjs`
   enforces 100% parity and XML well-formedness.
4. **Coverage exclusions.** Pure-canvas/engine-only files go in `.c8rc.json` excludes (as the existing
   viz files are) so the coverage gate isn't skewed.
5. **Tests wired into the gate.** Add each new `tests/*.mjs` to `package.json` (`test:js` + `verify`) and
   to the required-array in `scripts/required-scripts-gate.mjs`.
6. **Lint.** Keep every new/edited function ≤ 10 complexity; extract helpers. `max-len` and
   `no-unused-vars` are error-level.
7. **Verify + release.** `npm run verify` (exit 0) before every ship; then `bash release.sh`, recreate
   `dist/workshop_item_no_preview.vdf`, and publish (see the repo's Steam notes).

---

## 14. Suggested sequencing (impact ÷ effort)

1. **A — Diaspora legend** (tiny, immediately useful; no balance risk).
2. **E — Net sparkline** + **I — story follow-ups** (small, make existing data feel alive).
3. **D — Timeline event pins** (medium, additive DOM, no balance risk).
4. **B — Flow particles** + **C — Brain-drain highlight** (medium; the Flow view finally looks distinct).
5. **12.2a/c — Government-gated stance + richer consequences** (deepens a shipped system; mostly JS +
   a few native modifiers; off by default).
6. **F — Cultural blending** + **G — Homeland pull-back** + **H — Age recap** (gameplay/narrative; off by
   default, validate balance).
7. **K — Chain migration** + **12.2b — Selective closure** + **J — Pressure lens** (model/UI changes;
   highest risk; gate off, run the snowball/calibration scripts first).

Each item is independently shippable behind its flag, so they can be released incrementally rather than
as one large version.
