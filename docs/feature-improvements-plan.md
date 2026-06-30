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
  - `integrateCity(e, owner, rateFor)` (**L410**) / `integratePass(s, work, signals)` (**L454**) — the
    **integration-over-time** drift of non-owner origins toward the host, rate from
    `CONFIG.integrationRate` / `integrationUnrestRate` / `integrationWarRate`.
  - `load()` (**L150**) with `_loadedTurn` (**L53**) — the per-turn cache that the v1.6.x "refresh each
    turn" fix relies on. `STATE_KEY = "EmigrationEthnos_v1"` (**L30**); `CityComposition` typedef
    `{ owner, byCiv: Record<string,number>, total, name, seenTurn }` (**L33**). Enumerate all cities via
    `Object.keys(load().cities)` (**L533**).
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
  - `readoutModel()` (**L89**), `originsLine(comp)` (**L61**), `renderPanel()` (**L167**), corner placement via
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

- **Chronicle — [emigration-chronicle.js](../ui/emigration-chronicle.js)**: `chronicle(entry)` (**L153**),
  `chronicled(key)` (**L120**), `chronicleLog(limit)` (**L215**). `ChronicleEntry { turn, kind:
  "exodus"|"founding"|"return", title, body, civ?, people?, cause?, dedupeKey? }` (**L17–26**);
  `STATE_KEY = "EmigrationChronicle_v1"`, `MAX_ENTRIES = 80` (**L14**). Mirrors to Notifications via
  `mirrorToNotifications()` (**L131**). View kind→label map `KIND_LABEL`
  ([emigration-chronicle-view.js](../ui/emigration-chronicle-view.js#L52)).
- **Narrative — [emigration-narrative.js](../ui/emigration-narrative.js)**: `exodusLine(e)` (**L158**),
  `foundingLine(e)` (**L177**), `returnLine(e)` (**L202**), `chronicleTitle(e)` (**L224**),
  `dilemmaPrompt(e)` (**L253**). All deterministic via `pick(list, seed, salt)` (FNV-1a, **L23–31**).
- **Diaspora chronicling — [emigration-diaspora.js](../ui/emigration-diaspora.js)**: `recordChroniclePass()`
  (**L169**), `detectFoundingForCity(city)` (**L127**), `leadForeignOrigin(comp)` (**L113**);
  `DIASPORA_MIN = 0.15` (**L33**), `DIASPORA_STEP = 0.15` (**L34**); founding `dedupeKey =
  "founding:"+city+"|"+civ+"|"+tier` (**L136**).
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
  "unhappiness"|"prosperity"|"war"|"disaster"|"conquest"|"attrition"|"return"` (**L23**); `REFUGEE_CAUSES`
  `{war,disaster,conquest}` (**L39**); `causeLabel` (**L106**), `causeHint` (**L153**), `isRefugeeCause`
  (**L97**); per-cause breakdown string `netDrivers(outByCause, inByCause)` (**L193**).
- **Records — [emigration-migration-records.js](../ui/emigration-migration-records.js)**: `moveRecord()`
  (**L64**), `departRecord()` (**L93**), `arriveRecord()` (**L117**). Record carries `originCiv`,
  `destOwner`, `cause`, `eventKey`, `destPaidCost`, `people`, `phase`. **Records are not persisted here** —
  they flow into [emigration-migration-stats.js](../ui/emigration-migration-stats.js) `recordMigrations()`
  (**L752**), which keeps the session-local `recentEventsFor(pid, limit)` ring (**L822**, `RECENT_CAP = 50`
  **L31**), cumulative `netCumFor`/`grossInCumFor`/`grossOutCumFor` (**L979–993**), and the per-corridor
  flow matrix `migrationFlows()` (**L566**) / `foldFlow()` key `"srcCiv>destCiv>srcCity>destCity"` (**L313**).

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
  via `Culture.isTraditionActive`. Exports `immigrationOpenness(pid)` (**L137**), `emigrationRetention(pid)`
  (**L157**), `activeAttractions(pid)` (**L171**), `hasAsylum(pid)` (**L180**), `borderStance(pid)`
  (**L191** → `"pro"|"anti"|"none"`); per-pass cached `policyState(pid)` (**L115**). Tradition types are
  consolidated in the frozen `POLICY_TYPES` registry (**L21**) `{ open, closed, talent, cultpull, tradepull,
  asylum }` + the `ATTRACTIONS` table (**L42**).
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
1. **Source the totals (the builder already exists — reuse, do not re-derive).** Cumulative per-owner
   net/in/out is `netCumFor(pid)` / `grossInCumFor(pid)` / `grossOutCumFor(pid)`
   ([emigration-migration-stats.js](../ui/emigration-migration-stats.js#L979) **L979–993**), also surfaced
   as `ownerStats(pid)` ([emigration-city-readout-data.js](../ui/emigration-city-readout-data.js#L263)) and
   `civLedgerRows(civs)` ([emigration-views.js](../ui/emigration-views.js#L31)). Export a thin
   `netByCiv(section)` adapter over those and import it into the viz. **This is the same per-owner totals
   source Features S, X, Y, and M consume — they all read `netCumFor`/`ownerStats`, not a parallel fold.**
   Only if you need net **scoped to the visible timeline window** (not cumulative) add `netByCiv(frames)` to
   [emigration-flow-history.js](../ui/emigration-flow-history.js): fold `edges[]` to `out[from] += people`,
   `in[to] += people`, `net = in - out`.
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
`ownerNet/ownerIn/ownerOut`; the readout renders via `readoutModel()`
([emigration-city-readout.js](../ui/emigration-city-readout.js#L89)). Note: the session-local
`recentEventsFor(pid, limit)` feed is **not** in readout-data — it lives in
[emigration-migration-stats.js](../ui/emigration-migration-stats.js#L822) and is keyed **per-owner**, not
per-city. Use the per-city `cityEvents()` getter from §15.0b as the series source (build §15.0b first).

**Implementation.**
1. **Series.** Do **not** add a second per-city history store. `cityNetSeries(cityKey, n)` is a thin
   reduction of the §15.0b `cityEvents(cityKey, n)` substrate (sum `in − out` per pass), co-located in
   [emigration-migration-stats.js](../ui/emigration-migration-stats.js), returning the last `n` net values.
   Features E (this sparkline), M (forecast), and O (event feed) all read that one substrate.
2. **Render.** Add `sparkline(values, w, h)` returning an inline SVG/canvas-free `<div>` bar strip
   (GameFace-safe: a row of `<span>`s with heights, or a tiny `<canvas>` reusing `setupCanvas()` from the
   network module). Insert into `readoutModel()` near `originsLine()` (**L61**).

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
[emigration-composition.js](../ui/emigration-composition.js#L410). Diaspora *visibility* milestones are
already detected by tier in `detectFoundingForCity()`
([emigration-diaspora.js](../ui/emigration-diaspora.js#L127), `DIASPORA_STEP = 0.15`). There is no
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
   **L19**, the view's kind label `KIND_LABEL` in
   [emigration-chronicle-view.js](../ui/emigration-chronicle-view.js#L52), and `chronicleTitle()`
   **L224**). **F's `"blend"`, H's `"recap"`, and R's `"milestone"` are the same coordinated union edit —
   see §16.4; add all kinds in one pass, not three.**

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
`city|origin|tier` ([emigration-diaspora.js](../ui/emigration-diaspora.js#L136)). Integration share is
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
  - In `immigrationOpenness(pid)` (**L137**): if the government's `canClose === false`, clamp the Closed
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

---

## 15. Migration Intelligence Update — readability & explainability features

The features above (A–K, §12) mostly add *new simulation* and *new visuals*. The community pattern for
Civ VII mods, though, rewards **readability and explainability** first: tooltips that expose hidden math,
lenses, policy-yield previews, "why is this happening?" surfaces, and screenshot-friendly rankings. This
section specs a batch (**Features L–Z**) that turns Emigration from a *historical record* into a
*migration-intelligence layer*: it explains **why** people moved, **what** the player can do, and **who**
the diasporas are — almost entirely **read-only over data the sim already produces**, so the balance risk
is low and most of these can default **on**.

All of §13 (cross-cutting: config/tunables/modinfo/localization/tests/lint) applies verbatim to every
feature here. New player-facing visual toggles join a new **`readout`** tunable group (alongside the
`visuals` group proposed in §13.1). Where a feature is genuinely off-by-default (it changes gameplay or is
a strong visual), that is called out explicitly.

> Anchors below are verified against the current tree, but the codebase moves: treat the **function name**
> as source of truth and the line as a hint. Re-grep before editing.

### 15.0 Shared substrate (build these once; L/M/N/P all consume them)

Five of these features ("why did they leave / go there", forecast, advisor, policy preview) all need the
same two primitives. Build them **once** as pure modules so each feature is thin formatting on top.

#### 15.0a `emigration-explain.js` — decompose push & pull into labeled contributions *(new file)*

The single source of "why". Two pure builders, both deterministic, both read-only:

- **Pull decomposition.** `explainPull(src, dest, ctx) → [{ key, label, delta, kind: "pull"|"push" }]`.
  The honest way to attribute a number that mixes additive and multiplicative terms is **leave-one-out
  (ceteris-paribus) deltas**: re-evaluate `adjustedPull()`
  ([emigration-pull.js](../ui/emigration-pull.js#L150)) with one factor neutralized and measure the
  change. The factors and their anchors (already enumerated by `adjustedPull`'s body) are:
  prosperity gradient + `tiltFor()` (**L72/L154**), `baseReluctance` (**L158**), the extra-population
  penalty (**L159–161**), `cityStateBarrier` (**L162**), `crossCivBlock()` (**L165**), `dominanceFor()`
  anti-snowball headwind (**L166**), `geoAdjust()` distance/flee (**L168**), `congestionFor()` (**L169**),
  and the multiplicative `permeability()` clamp (**L93/L172**) which itself factors into
  `opennessFor()` (**L182**) × `retentionFor()` (**L193**) × deal/alliance/war. For the **multiplicative**
  terms (permeability/openness/retention) report the delta as "pull × N → with-this-neutral pull"; for
  **additive** terms report the signed point delta. Return the list sorted by `|delta|` descending. Keep
  each helper ≤ 10 complexity by giving each neutralization its own thunk in a small table
  `[{ key, label, neutralize(ctx) }]` that `explainPull` maps over.
- **Push decomposition.** `explainPush(signal) → [{ key, label, delta, kind: "push" }]`. The push side is
  cheaper — it is already decomposed inside `prosperity()`/`distress()`
  ([emigration-prosperity.js](../ui/emigration-prosperity.js#L211)/[**L200**](../ui/emigration-prosperity.js#L200))
  as `situationalPercent()` (**L181**) summing `violencePercent()` (**L155**), `disasterPercent()`
  (**L169**), siege/starvation/unrest/war-weariness, minus `happinessForScore()` (**L74**) and the
  population penalty. Export those component percents (today they're folded into one number) and label
  them with `causeLabel()`/`causeHint()` ([emigration-causes.js](../ui/emigration-causes.js#L106)/[**L153**](../ui/emigration-causes.js#L153)).
  For the empire-wide "leaving because" mix, reuse the existing `netDrivers(outByCause, inByCause)`
  string-builder ([emigration-causes.js](../ui/emigration-causes.js#L193)) — it already produces a
  per-cause breakdown.

**Honesty rule (carry into every consumer):** these are **contributions to a model score**, not a
guaranteed headcount. Label the section "Why people are leaving / where they're drawn" and render the
push/pull factors as **relative weights** (normalize `|delta|` to a percent of total `Σ|delta|`), never as
"−42% of your population". This matches the doc's existing "do not overpromise precision" stance.

**Config / tunables.** No flag of its own (it's infrastructure); consumers gate themselves.
**Tests.** `tests/explain.mjs`: leave-one-out deltas reconstruct (additive factors sum back to the raw
pull within ε); neutralizing permeability on a closed-border dest moves pull the right direction; a
single-factor scenario yields one dominant row; disabled/edge inputs (null dest, zero pull) yield `[]`,
never throw.

#### 15.0b City-scoped record feed substrate (O/U/Y/W all read this)

`recentEventsFor(pid, limit)` ([emigration-migration-stats.js](../ui/emigration-migration-stats.js#L822))
already keeps a session-local ring (`RECENT_CAP = 50`, **L31**) of recent moves as
`{ srcOwner, destOwner, people, cause }`. That is **per-owner**, not **per-city**, and lacks the turn and
city names the feeds want. Add **one** pure getter `cityEvents(cityKey, limit)` to that module that filters
the same ring (and, when present, the flow snapshots `migrationFlows()` **L566** / `foldFlow()` key
`"srcCiv>destCiv>srcCity>destCity"` **L313**) to a per-city, newest-first list
`[{ turn, kind: "in"|"out"|"diaspora"|"return", people, otherName, cause }]`. Every city-feed feature (O,
the corridor/severity/digest features) formats this one list; do not re-derive per feature.

---

### Feature L — "Why did they leave / go there?" explainer tooltip *(low–medium; top pick)*

**Goal.** On hover of a city, a migration arrow, or a readout number, show a compact **cause stack**:
"Leaving because of: Unhappiness, War pressure, Closed borders nearby, Distance…" and "Drawn there by:
Prosperity, Open borders, Existing Roman community, Alliance…", each with a relative weight. Makes the
whole mod legible without the guide.

**Current state.** All the inputs exist: `citySnapshot(cityId)`
([emigration-city-readout-data.js](../ui/emigration-city-readout-data.js#L318)) already carries `cause`,
`causeLabel`, `causeMix`, `distress`, `pressureToBar`, `topDestinationName`, `crossCiv`, and `composition`.
The push/pull decomposition is exactly §15.0a. Hover hosts already exist: the lens hover panel
([emigration-lens-hover-panel.js](../ui/emigration-lens-hover-panel.js)), the ethnicity tooltip
([emigration-ethnicity-tooltip.js](../ui/emigration-ethnicity-tooltip.js)), and the network interaction
tooltip ([emigration-network-interact.js](../ui/emigration-network-interact.js)).

**Implementation.**
1. **Model.** New `explainModel(cityId) → { leaving: [{label, weight}], drawnTo: [{label, weight, dest}] }`
   in a new file [emigration-explain-view.js](../ui/emigration-explain-view.js): call `explainPush(signal)`
   for `leaving`, and `explainPull(signal, bestDest, ctx)` (via `bestDestination()`
   [emigration-pull.js](../ui/emigration-pull.js#L262)) for `drawnTo`. Fold the **enclave** term: if the
   destination's `compositionForCity()`/`compositionForOwner()`
   ([emigration-composition.js](../ui/emigration-composition.js#L510)/[**L528**](../ui/emigration-composition.js#L528))
   has a share of the mover's origin, surface it as "Existing _ community" (this is the same signal as
   §11 / Feature K's `enclaveAffinity` — reuse it if K shipped, otherwise read the share directly).
2. **Render.** `renderExplain(parent, model)` — two labeled groups, each a row per factor with a small
   weight bar (the GameFace-safe `<span>`-height idiom from §5/§1, not a `<canvas>`). Reuse
   `civDisplayColor()` ([emigration-civ-colors.js](../ui/emigration-civ-colors.js)) for the community row's
   swatch.
3. **Mount points.** (a) **Readout:** append the two groups under `readoutModel()`
   ([emigration-city-readout.js](../ui/emigration-city-readout.js#L89)) when expanded. (b) **Arrow/cluster
   hover:** add to the network tooltip in
   [emigration-network-interact.js](../ui/emigration-network-interact.js). (c) **Lens hover:** add to
   [emigration-lens-hover-panel.js](../ui/emigration-lens-hover-panel.js). Keep each mount thin — all three
   call the same `renderExplain`.

**Config / tunables.** `migrationExplainer: true` (config + `bool` in the new `readout` group).
**Localization.** `LOC_EMIG_EXPLAIN_LEAVING` ("Why people are leaving"), `LOC_EMIG_EXPLAIN_DRAWN`
("Where they're drawn"), `LOC_EMIG_EXPLAIN_COMMUNITY` ("Existing {civ} community"),
`LOC_EMIG_EXPLAIN_FRICTION` ("Distance & friction"). Reuse `causeLabel` strings for the rest.
**Tests.** `tests/explain-view.mjs`: model groups are non-empty for a distressed city; weights normalize
to ~100% within each group; community row appears only when the dest hosts the origin; off flag → no rows.
**Risk.** Low–medium — read-only; the only subtlety is **not overpromising precision** (render weights, not
headcounts). GameFace-safe DOM (`removeChild` loop).

---

### Feature M — Migration forecast ("next 5 turns") *(low–medium)*

**Goal.** A forward-looking line in the readout: *"Forecast: losing ~23k people over the next ~5 turns
unless happiness or safety improves,"* or *"likely to become a destination for refugees from Persia."*
Turns the mod from record into strategy. **Explicitly framed as a projection, not certainty.**

**Current state.** Per-city net is available as `ownerNet/ownerIn/ownerOut` on the snapshot
([emigration-city-readout-data.js](../ui/emigration-city-readout-data.js#L151)); cumulative per-owner net
via `netCumFor()` ([emigration-migration-stats.js](../ui/emigration-migration-stats.js#L993)). `pressure`/
`pressureToBar`/`distress` and `onCooldown`/`cooldown` are on the snapshot; the per-pass budget is
`CONFIG.emigrationBar`. **No model change is required** — this is a conservative linear projection.

**Implementation.**
1. **Projection.** `forecastFor(snapshot, turns = CONFIG.forecastTurns) → { netPeople, direction, driver,
   topSourceName? }` in a new file [emigration-forecast.js](../ui/emigration-forecast.js): project recent
   per-city net (from the §15.0b feed or `ownerNet` scaled by the city's share of empire flow) forward by
   `turns`, **damped** toward zero by `onCooldown` and by a configurable `forecastDecay` so it never reads
   as a guarantee. `driver` is the top `explainPush` factor; for inbound forecasts, the top likely source
   is the largest current outflow corridor toward this city (from `migrationFlows()`
   [emigration-migration-stats.js](../ui/emigration-migration-stats.js#L566)).
2. **Render.** One line appended in `readoutModel()` (**L89**), worded as a forecast
   (`formatPeopleExact()` for the count, "~" prefix, "unless …" suffix from the driver's `causeHint()`).
3. **Conservatism.** Clamp the horizon (`forecastTurns` default 5, max ~10) and the magnitude (cap at, e.g.,
   the city's rural pool so it can't predict draining below the floor).

**Config / tunables.** `cityReadoutForecast: true`, `forecastTurns` (choice `[3,5,8]`), `forecastDecay`
(module const). `readout` group.
**Localization.** `LOC_EMIG_FORECAST_LOSE`, `LOC_EMIG_FORECAST_GAIN`, `LOC_EMIG_FORECAST_DEST`
("…destination for refugees from {civ}"), `LOC_EMIG_FORECAST_STABLE`.
**Tests.** `tests/forecast.mjs`: monotonic in recent net; damped by cooldown; never projects below the
rural floor; stable city → "stable" branch; off flag → no line.
**Risk.** Low — but word it as a forecast and keep the cap, or players will treat it as a promise.

---

### Feature N — Migration advisor (actionable recommendations) *(low–medium)*

**Goal.** A short advisor block tied **only to levers the player actually controls**: *"To reduce
emigration from Ravenna: raise happiness, end nearby war pressure, or slot Open Borders. To attract
migrants to Carthage: improve prosperity, keep Open Borders, build stability before the age transition."*

**Current state.** The levers are all readable: happiness via `cityHappinessStage()`
([emigration-polity.js](../ui/emigration-polity.js#L133)); war/violence via the push components
(§15.0a); border stance via `borderStance()` ([emigration-borders.js](../ui/emigration-borders.js#L191))
and `activeAttractions()` (**L171**); government via `readGovernment()` (**L188**); integration load via
`assimLoad` on the snapshot. **The advisor must map the top push/pull factor to its controllable lever —
not invent options.**

**Implementation.**
1. **Lever table.** `ADVISOR_LEVERS` in a new file [emigration-advisor.js](../ui/emigration-advisor.js):
   `[{ factorKey, available(snapshot): bool, tipLoc }]` mapping each `explainPush`/`explainPull` `key` to a
   recommendation **only if the lever is reachable** (e.g. suggest "slot Open Borders" only when the civ
   isn't already Open and `bordersEnabled`; suggest "end the war" only when `isRefugeeCause`/violence is the
   top push). This guard is the whole point — `available()` filters out non-options.
2. **Builder.** `advise(cityId) → { reduceOutflow: string[], attract: string[] }`: take the top 2–3
   `explainPush` factors → reduce-outflow tips; top 2–3 `explainPull` gaps → attract tips. Cap at 3 each.
3. **Render.** Collapsible advisor block under the readout (or a "💡" toggle), reusing `renderExplain`'s
   row idiom. Gate behind the same expand state as L.

**Config / tunables.** `migrationAdvisor: true` (`readout` group).
**Localization.** One `LOC_EMIG_ADVISE_*` per lever (`_HAPPINESS`, `_WAR`, `_OPEN_BORDERS`, `_PROSPERITY`,
`_STABILITY`, `_INTEGRATION`, `_GROWTH`), plus headers `LOC_EMIG_ADVISE_REDUCE` / `LOC_EMIG_ADVISE_ATTRACT`.
**Tests.** `tests/advisor.mjs`: a war-pushed city yields the war tip; an already-Open civ never gets
"slot Open Borders"; tips cap at 3; off flag → empty.
**Risk.** Low — the only failure mode is recommending an unavailable lever; the `available()` guard plus a
test prevents it.

---

### Feature O — Per-city migration event feed *(low)*

**Goal.** A short recent-history strip in the readout: *"Turn 87: 34k left for Athens after war began · Turn
90: 12k arrived from Egypt · Turn 93: Greek community reached 25% · Turn 96: return migration began."*
Makes the city feel alive moment-to-moment (finer-grained than the Chronicle).

**Current state.** The substrate is §15.0b (`cityEvents(cityKey, limit)`). Record shapes carry everything
needed: `moveRecord/departRecord/arriveRecord`
([emigration-migration-records.js](../ui/emigration-migration-records.js#L64)/[**L93**](../ui/emigration-migration-records.js#L93)/[**L117**](../ui/emigration-migration-records.js#L117))
carry `srcName/destName/people/cause/phase/originCiv`. Diaspora-tier crossings come from
`detectFoundingForCity()` ([emigration-diaspora.js](../ui/emigration-diaspora.js#L127)); returns from the
return system. The chronicle already aggregates the *grand* moments — this is the *local, frequent* feed.

**Implementation.**
1. **Source.** `cityEvents(cityKey, n)` from §15.0b for the move rows; merge the city's chronicle entries
   (`chronicleLog()` ([emigration-chronicle.js](../ui/emigration-chronicle.js#L215)) filtered to this city)
   for the diaspora/return rows so tier-crossings appear. Merge, sort by `turn` desc, slice to `n`.
2. **Render.** `renderCityFeed(parent, rows)` in [emigration-city-readout.js](../ui/emigration-city-readout.js):
   one muted line per row, `formatPeopleExact()` + localized verb by `kind` + `otherName`.
3. **Throttle.** Cap rows (`cityFeedRows` default 5).

**Config / tunables.** `cityReadoutFeed: true`, `cityFeedRows` (choice `[3,5,8]`). `readout` group.
**Localization.** `LOC_EMIG_FEED_OUT` ("{people} left for {city}"), `_IN`, `_DIASPORA`
("{civ} community reached {pct}%"), `_RETURN`.
**Tests.** `tests/city-feed.mjs`: `cityEvents` filters to the right city, newest-first, length-capped;
empty city → empty feed (no throw); merges chronicle + moves without dupes.
**Risk.** Minimal — presentation over existing records.

---

### Feature P — Contextual policy impact preview *(medium; high community appeal)*

**Goal.** Civ players love hidden-yield clarity. When inspecting a border/attraction/asylum card, show its
**expected effect in the current game**, not a static description: *"Open Borders → ~+18k immigration/turn,
+3 Influence/turn, +2 integration load; likely top sources: Rome, Egypt, Persia."*

**Current state.** The card layer is fully modeled: `immigrationOpenness()`
([emigration-borders.js](../ui/emigration-borders.js#L137)), `emigrationRetention()` (**L157**),
`activeAttractions()` (**L171**), `ATTRACTIONS` (**L42**), `policyState()` (**L115**). The yield side:
`addAttractionDividend()`/`tickAttractionDividend()`/`dividendFor()`
([emigration-dividend.js](../ui/emigration-dividend.js#L176)/[**L217**](../ui/emigration-dividend.js#L217)/[**L241**](../ui/emigration-dividend.js#L241))
plus `CONFIG.dividendPerMigrant`/`dividendCap`; integration load via `addAssimilationLoad()`
([emigration-consequences.js](../ui/emigration-consequences.js#L49)). The native flat parts (Influence/
Production per age) are already in
[data/emigration-policies-gameeffects.xml](../data/emigration-policies-gameeffects.xml).

**Implementation.**
1. **Counterfactual estimate.** `previewPolicy(pid, cardKind) → { immigrationDelta, influenceDelta,
   integrationDelta, topSources: string[] }` in a new file [emigration-policy-preview.js](../ui/emigration-policy-preview.js).
   Re-rank under the toggled stance: snapshot current pull totals, then re-evaluate with the candidate
   stance applied (the borders module already has the neutral-toggle path used by `permeability()`); the
   delta in summed inbound pull × the per-pass budget approximates `immigrationDelta`. Influence/Production
   deltas read straight off the card's native modifier table (per-age constants). Integration delta =
   `immigrationDelta ×` the per-migrant load constant. `topSources` = the largest current outflow corridors
   that the stance would open (from `migrationFlows()` [**L566**](../ui/emigration-migration-stats.js#L566)).
2. **Honest hedging.** Prefix with "~" and label "estimated this turn"; clamp to the per-pass budget so it
   can't claim more than the bar allows.
3. **Render.** `renderPolicyPreview(parent, model)` — mount on the dilemma/border UI and in the guide. The
   dock decorator path ([emigration-dock-decorator.js](../ui/emigration-dock-decorator.js#L138)) or the
   dilemma view ([emigration-dilemma-view.js](../ui/emigration-dilemma-view.js#L122)) are the natural hosts.

**Config / tunables.** `policyPreview: true` (`readout` group).
**Localization.** `LOC_EMIG_PREVIEW_IMMIG`, `_INFLUENCE`, `_INTEGRATION`, `_SOURCES`, `_ESTIMATE_NOTE`.
**Tests.** `tests/policy-preview.mjs`: Open stance yields positive immigration delta, Closed negative;
Influence delta matches the card's per-age constant; `topSources` capped; off flag → no preview.
**Risk.** Medium — the counterfactual must reuse the **existing clamped** permeability path (no new
unbounded math) and must hedge ("~", "estimated"). Do not promise exact yields.

---

### Feature Q — Diaspora profile cards *(low–medium; coolest narrative extension)*

**Goal.** For each major diaspora in a city, a small flavor card: *"Roman Community in Carthage — Share 31%
· Arrived mostly during The Western War · Status: integrating · Effects: moderate integration load · Homeland:
recovering."* Gives names and continuity to abstract population shares.

**Current state.** Composition is the data source: `compositionForCity(city).civs`
([emigration-composition.js](../ui/emigration-composition.js#L510)) is the sorted `[{civ, pts, share}]`;
`leadForeignOrigin()` ([emigration-diaspora.js](../ui/emigration-diaspora.js#L113)) finds the dominant
foreign origin; tier/dedupe data is in the founding chronicle (`dedupeKey = "founding:"+city+"|"+civ+"|"+tier`,
**L136**). "Arrived during {event}" can be recovered from the matching chronicle entry's `cause`/`title`.
Homeland status from `readPolity(originOwner)` ([emigration-polity.js](../ui/emigration-polity.js#L155))
(`celebrating`/`warWeary`). Integration trend from `integrateCity()` drift (**L410**). Quarter naming reuses
the existing `resolveQuarter()` prose helper already used by diaspora foundings.

**Implementation.**
1. **Builder.** `diasporaCard(cityKey, civ) → { origin, host, share, arrivalEvent, status, effects[],
   homeland }` in a new file [emigration-diaspora-card.js](../ui/emigration-diaspora-card.js): assemble from
   `compositionForCity` (share), the latest matching founding chronicle entry (arrivalEvent/title), the
   composition trend (status = "growing"/"integrating" by comparing successive shares via `seenTurn`), and
   `readPolity(origin)` (homeland = "recovering"/"stable"/"unstable"). `effects` = integration-load tier +
   (if F shipped) blend potential.
2. **List.** `cityDiasporaCards(cityKey)` → cards for every foreign origin ≥ `DIASPORA_MIN`
   ([emigration-diaspora.js](../ui/emigration-diaspora.js#L33)).
3. **Render.** `renderDiasporaCards(parent, cards)` — a compact card stack in the readout (and optionally
   in the chronicle detail). Color the header swatch with `civDisplayColor()`. Use `pick()`
   ([emigration-narrative.js](../ui/emigration-narrative.js#L40)) seeded on `city|civ` for deterministic
   flavor verbs.

**Config / tunables.** `diasporaCards: true` (`readout` group).
**Localization.** `LOC_EMIG_DIASPORA_CARD_TITLE` ("{civ} community in {city}"), `_ARRIVED`
("Arrived mostly during {event}"), `_STATUS_*` (growing/integrating/blended), `_HOMELAND_*`.
**Tests.** `tests/diaspora-cards.mjs`: one card per foreign origin ≥ min; status reflects share trend;
single-origin city → no foreign cards; missing chronicle → graceful "arrived gradually" fallback.
**Risk.** Low–medium — read-only; the only care is graceful fallback when no chronicle row exists for an
origin (don't throw). Overlaps Feature I (story follow-ups) — share the status/tier wording.

---

### Feature R — Migration milestones (in-mod "achievements") *(low)*

**Goal.** Memorable, shareable in-mod milestones (not Steam achievements): *First Great Exodus · First
Cosmopolitan Capital · Largest Diaspora in the World · City of Many Peoples · Homeland Recovered · Closed
Gate, Empty Streets · Refuge of Nations · Brain Drain Crisis · Great Return.* Cheap, fun, screenshot-bait.

**Current state.** The chronicle is the perfect host: `chronicle(entry)`
([emigration-chronicle.js](../ui/emigration-chronicle.js#L153)) with `chronicled(key)` dedupe (**L120**),
`MAX_ENTRIES = 80` (**L14**), and `mirrorToNotifications()` (**L131**). The conditions are all readable:
exodus/founding/return events (diaspora module), diversity (composition, see Feature S), net flow
(`netCumFor()` [**L993**](../ui/emigration-migration-stats.js#L993)), homeland recovery (`readPolity`).

**Implementation.**
1. **Milestone table.** `MILESTONES` in a new file [emigration-milestones.js](../ui/emigration-milestones.js):
   `[{ key, titleLoc, test(ctx): bool }]` where `ctx` bundles the per-pass signals + composition + flow
   tallies. Each `test` is a pure predicate (e.g. *City of Many Peoples* = a city with ≥ N origins above
   5%; *Brain Drain Crisis* = a city with net outflow past a threshold over K passes; *Refuge of Nations* =
   refugee inflow from ≥ M distinct origins).
2. **Detect & record.** `checkMilestones(ctx)` called from `recordChroniclePass()`
   ([emigration-diaspora.js](../ui/emigration-diaspora.js#L169)) (or `doPass()` between L165–L178): for each
   untriggered milestone whose `test` passes, `chronicle({ kind: "founding"|new "milestone", dedupeKey:
   "milestone:"+key, ... })`. Dedupe via `chronicled()` so each fires once per game. If a new `"milestone"`
   kind is added, extend `ChronicleEntry.kind` (**L19**), `KIND_LABEL`
   ([emigration-chronicle-view.js](../ui/emigration-chronicle-view.js#L52)), and `chronicleTitle()`
   ([emigration-narrative.js](../ui/emigration-narrative.js#L224)).
3. **Surface.** One toast on unlock via `announceImportant()`
   ([emigration-feedback.js](../ui/emigration-feedback.js#L312)) (respects the existing cooldown
   `cooldownOk()` **L292**).

**Config / tunables.** `milestonesEnabled: true` (`readout` group).
**Localization.** One `LOC_EMIG_MILESTONE_*` title + flavor per milestone in all locales.
**Tests.** `tests/milestones.mjs`: each predicate fires on a crafted ctx and not otherwise; each fires once
(dedupe); off flag → none; a `"milestone"` kind (if added) renders a label.
**Risk.** Low — chronicle-only, deterministic predicates. Keep predicates cheap (run once/pass).

---

### Feature S — "Most diverse cities" ranking *(low; screenshot-friendly)*

**Goal.** A simple leaderboard panel: *Carthage — 5 communities, no majority · Alexandria — 4, Egyptian
plurality · Rome — 3, Roman majority.* Pairs naturally with the demographics/ranking instinct and reads
well in screenshots.

**Current state.** Composition is enumerable: `Object.keys(load().cities)`
([emigration-composition.js](../ui/emigration-composition.js#L533)) over the persisted map; per-city
breakdown via `compositionForCity()` (**L510**) → `.civs` (sorted shares) + `.dominant`. **No diversity
metric exists yet** — only `rankByProsperity()` ([emigration-prosperity.js](../ui/emigration-prosperity.js#L225)).

**Implementation.**
1. **Metric.** `diversityScore(comp) → { originsAbove5: number, index: number, largestNonOwner: number,
   noMajority: bool }` in a new file [emigration-diversity.js](../ui/emigration-diversity.js): `index` =
   Shannon entropy (or 1 − Σ share², Simpson) over `comp.civs[].share`; `noMajority` = `dominant.share <
   0.5`. Pure.
2. **Ranking.** `diverseCityRanking(limit) → [{ cityName, originsAbove5, label }]`: enumerate cities (via
   the composition keys), score, sort by `index` desc, slice. `label` summarizes ("5 communities, no
   majority" / "Egyptian plurality" / "Roman majority").
3. **Render.** A panel/section in the existing dashboard. Mirror the ledger renderer idiom (`renderLedger()`
   [emigration-ledger-view.js](../ui/emigration-ledger-view.js#L196), `ledgerDataRow()` **L148**); add a
   `diverseCityRows()` to [emigration-views.js](../ui/emigration-views.js) next to `civLedgerRows()`
   (**L31**) and surface it via `gatherDashboard()` ([emigration-window.js](../ui/emigration-window.js#L676)).

**Config / tunables.** `diversityRanking: true` (`readout` group).
**Localization.** `LOC_EMIG_DIVERSE_TITLE` ("Most diverse cities"), `_NO_MAJORITY`, `_PLURALITY`
("{civ} plurality"), `_MAJORITY`, `_COMMUNITIES` ("{n} communities").
**Tests.** `tests/diversity.mjs`: entropy is max for an even split, 0 for single-origin; `noMajority`
boundary at 50%; ranking sorts and caps; empty world → empty ranking.
**Risk.** Low — read-only aggregate. Word everything as "communities/composition," never value-laden.

---

### Feature T — "Cosmopolitanism" score *(low; cosmetic readout — pairs with S)*

**Goal.** A derived, **readout-only** label per city/civ from diversity + integration + openness + inbound
flow: *Homogeneous · Local Majority · Mixed City · Cosmopolitan Center · World City.* Historically evocative,
non-judgmental. **Cosmetic at first — no yields.**

**Current state.** All inputs exist: diversity (Feature S `diversityScore`), integration (composition drift
/ `assimLoad`), openness (`borderStance()`/`immigrationOpenness()`
[emigration-borders.js](../ui/emigration-borders.js#L191)/[**L137**](../ui/emigration-borders.js#L137)),
inbound flow (`ownerIn`/`grossInCumFor()` [emigration-migration-stats.js](../ui/emigration-migration-stats.js#L980)).
Empire-wide composition via `compositionForOwner()` ([emigration-composition.js](../ui/emigration-composition.js#L528)).

**Implementation.**
1. **Score → tier.** `cosmopolitanism(comp, ctx) → { score: number, tierKey }` in
   [emigration-diversity.js](../ui/emigration-diversity.js) (co-locate with S): blend the normalized
   diversity index, an openness term, and a normalized inbound term into `[0,1]`; bucket into 5 tiers by
   fixed thresholds (`COSMO_TIERS`). Pure, deterministic.
2. **Surface.** A one-line label in the readout (under origins) and as a column in the Feature-S ranking.
   Reuse the score in T's panel rather than recomputing.

**Config / tunables.** `cosmopolitanismScore: true` (`readout` group). **Explicitly cosmetic** — note in
config types that it grants no yields (a future opt-in could, but not in this batch).
**Localization.** `LOC_EMIG_COSMO_*` for the 5 tiers; `_DESC` clarifying it describes composition, not
superiority.
**Tests.** `tests/cosmopolitanism.mjs`: tier boundaries monotonic; homogeneous city → lowest tier; high
diversity + open + inbound → top tier; off flag → no label.
**Risk.** Low — cosmetic. The only real risk is **wording**; keep it about "community composition" and
"cosmopolitanism," never ranking peoples. Document the framing in the guide/Civilopedia.

---

### Feature U — Refugee-crisis severity scale *(low–medium)*

**Goal.** For war/disaster/conquest waves, surface explicit severity: *"Refugee Crisis: Severe — 82k
displaced this turn · primary cause War · main route Rome → Carthage · receiving: Carthage, Egypt, Greece."*
Gives moral/historical weight without being exploitative.

**Current state.** Refugee causes are tagged: `REFUGEE_CAUSES`/`isRefugeeCause()`
([emigration-causes.js](../ui/emigration-causes.js#L39)/[**L97**](../ui/emigration-causes.js#L97)). Per-pass
refugee volume and routes are in the stats tallies (refugees in/out; corridors via `migrationFlows()`
[**L566**](../ui/emigration-migration-stats.js#L566) / `foldFlow()` **L313**). Disaster onsets are recorded
by `recordDisasterEvent()` (**L733**). The toast path with cooldown is `announceImportant()`/`cooldownOk()`
([emigration-feedback.js](../ui/emigration-feedback.js#L312)/[**L292**](../ui/emigration-feedback.js#L292)).

**Implementation.**
1. **Severity.** `crisisSeverity(passMigs) → { tierKey, displaced, cause, routeLabel, receivers[] } | null`
   in a new file [emigration-crisis.js](../ui/emigration-crisis.js): sum refugee-cause people this pass,
   bucket into Minor/Notable/Severe/Catastrophic by thresholds scaled to game speed; `routeLabel` = the
   largest refugee corridor; `receivers` = top destination civ names. `null` when below the Minor floor.
2. **Surface.** (a) **Toast** via `announceImportant()` (one per crisis tier change, cooldown-gated). (b)
   **Chronicle** entry (`kind: "exodus"`, severity in the title via `chronicleTitle()`). (c) optional **map
   badge** reusing the network `drawEventBadge()` path ([emigration-network-paint.js](../ui/emigration-network-paint.js#L480)).
3. **Hook.** Call from `recordChroniclePass()`/`doPass()` after `recordMigrations()` so the pass's records
   are available.

**Config / tunables.** `refugeeCrisisScale: true`, `crisisToasts: true` (separate so the scale can show in
the readout/chronicle without toasting). `readout` group.
**Localization.** `LOC_EMIG_CRISIS_*` (Minor/Notable/Severe/Catastrophic), `_DISPLACED`, `_ROUTE`,
`_RECEIVING`. Respectful, factual wording.
**Tests.** `tests/crisis.mjs`: tiering by displaced volume + game speed; only refugee causes count;
sub-floor pass → null; route/receiver extraction; off flags → silent.
**Risk.** Low–medium — keep wording respectful and throttle toasts hard (reuse `cooldownOk`).

---

### Feature V — "Humanitarian response" dilemma *(higher; gameplay + sensitive theme)*

**Goal.** A choice layer over refugee waves: *"Refugees at the Border — admit them fully (more integration
load, more population, diplomatic benefit) · establish camps (reduced load, lower growth/integration) ·
close the border (lower inflow, Influence penalty, possible unrest)."* Higher-risk: changes gameplay and
touches a sensitive real-world theme. **Make it rare, respectful, grounded in existing mechanics.**

**Current state.** The dilemma framework already exists and is reusable: `showDilemma(view, onChoice)`
([emigration-dilemma-view.js](../ui/emigration-dilemma-view.js#L122)), `buildPanel()` (**L100**),
`choiceButton()` (**L86**); model side `CHOICES` ([emigration-dilemma.js](../ui/emigration-dilemma.js#L34))
`{id,label,note}`, `DilemmaState` (**L45**, `STATE_KEY = "EmigrationDilemma_v1"`), `detectConquestDilemma()`
(**L268**). Consequences plug into the per-turn economy via `grantYield`/`deduct`
([emigration-effects.js](../ui/emigration-effects.js)) and `chargePerTurnCosts()`
([emigration-main.js](../ui/emigration-main.js#L207)). Asylum cards (§12) and `hasAsylum()` already exist as
the *standing* analog — the dilemma is the *acute* event version.

**Implementation.**
1. **Trigger.** New `detectHumanitarianDilemma(passMigs, me) → view | null` next to `detectConquestDilemma()`:
   fire only on a **Severe+** crisis (reuse Feature U's `crisisSeverity`) directed at the local player, and
   **rate-limit** via the existing `DilemmaState.spree`/`lastTurn` so it is rare.
2. **Options & consequences.** Three `CHOICES` (`admit` / `camps` / `close`), each mapping to **existing**
   levers only: `admit` → higher inbound permeability for a few turns + integration load + a diplomacy/
   Influence nudge; `camps` → capped intake + reduced integration drift; `close` → lower openness +
   Influence penalty + a small unrest charge — all via `chargePerTurnCosts()` and the borders multipliers.
   No new unbounded mechanics.
3. **Surface.** Reuse `showDilemma()`; record the outcome to the chronicle and `logNotification()`
   ([emigration-notifications.js](../ui/emigration-notifications.js#L144)).

**Config / tunables.** `humanitarianDilemma: false` (**off by default** — gameplay + sensitive),
`humanitarianMinSeverity` (default "severe"), `humanitarianCooldownTurns`.
**Localization.** `LOC_EMIG_HUMAN_TITLE`/`_BODY` and per-option `_ADMIT`/`_CAMPS`/`_CLOSE` + notes, all
locales, **carefully worded** (grounded, non-exploitative).
**Tests.** `tests/humanitarian-dilemma.mjs`: fires only on Severe+ and rate-limited; each option charges
the expected per-turn cost (mock `grantYield`/`deduct`); within `[permeFloor, permeCeil]`; off flag → never.
**Risk.** **Highest of this batch** (gameplay + theme). Ship off by default; keep rare, respectful, and
strictly inside existing bounded mechanics; document the intent in the guide.

---

### Feature W — Migration routes become named "cultural corridors" *(low–medium)*

**Goal.** When a route carries enough people over time, name it — *The Eastern Passage · The Carthaginian
Road · The Nile Refuge Route* — surfaced on the flow view and in age recaps. Makes repeated migration feel
historically consequential. **Mechanically just a threshold on cumulative origin→dest flow.**

**Current state.** Cumulative per-corridor flow already exists: `migrationFlows()`/`foldFlow()`
([emigration-migration-stats.js](../ui/emigration-migration-stats.js#L566)/[**L313**](../ui/emigration-migration-stats.js#L313))
key `"srcCiv>destCiv>srcCity>destCity"`; the flow view consumes `frameSegments()`
([emigration-network-flow.js](../ui/emigration-network-flow.js#L258)). Deterministic naming via `pick()`
([emigration-narrative.js](../ui/emigration-narrative.js#L40)).

**Implementation.**
1. **Detect & name.** `namedCorridors() → [{ key, fromCity, toCity, totalPeople, name }]` in a new file
   [emigration-corridors.js](../ui/emigration-corridors.js): scan cumulative flows; any corridor past
   `CONFIG.corridorThreshold` (scaled to game speed) gets a deterministic `name` via `pick(CORRIDOR_NAMES,
   key)` (refugee-cause corridors draw from a "Refuge Route" name set). Persist the assigned name once per
   corridor (new small state key `EmigrationCorridors_v1`) so it's stable across passes.
2. **Surface.** (a) Label the flow segment in `frameSegments()`/`drawArrow()` when a corridor is named. (b)
   Feed names into the **age recap** (Feature H) and the **chronicle**. (c) optional list in the dashboard.

**Config / tunables.** `culturalCorridors: true`, `corridorThreshold` (choice). `visuals` group (it paints
on the flow view; keep flow-view toggles together with B/C/D rather than splitting across two groups).
**Localization.** `LOC_EMIG_CORRIDOR_*` name fragments + `_REFUGE_*` variants; all locales.
**Tests.** `tests/corridors.mjs`: corridor named only past threshold; name stable across passes (persisted);
refugee corridor draws the refuge name set; below threshold → unnamed.
**Risk.** Low–medium — additive; keep naming deterministic and persisted so a corridor doesn't rename
between passes.

---

### Feature X — City "migration micro-icons" *(medium; constrained by engine)*

**Goal.** Tiny status glyphs so a player can read a city at a glance: ▲ net gaining · ▼ net losing ·
split-person = major diaspora present · refugee/flame = active crisis intake · home-arrow = return migration
active.

**Reality check (important).** Probing confirmed Civ VII exposes **no native city-banner DOM hook** for
mods. What *does* exist: the subsystem-dock decorator (`Controls.decorate("panel-sub-system-dock")`,
[emigration-dock-decorator.js](../ui/emigration-dock-decorator.js#L138)) and the selection-driven readout
panel (`SELECTION_EVENTS` [emigration-city-readout.js](../ui/emigration-city-readout.js#L213),
`showCityReadout()` **L195**). So "icons literally on the city banner" is **not reliably achievable**; spec
the achievable version and say so.

**Implementation (achievable form).**
1. **Status resolver.** `cityStatusIcons(cityId) → string[]` (glyph keys) in a new file
   [emigration-city-status.js](../ui/emigration-city-status.js): derive ▲/▼ from `ownerNet`/the §15.0b feed,
   diaspora from `leadForeignOrigin()` ≥ min, crisis from Feature U, return from the return system's active
   set. Pure.
2. **Surface (two non-banner hosts).** (a) Prepend the glyph row to the **city readout** header
   (`renderPanel()` [emigration-city-readout.js](../ui/emigration-city-readout.js#L167)) — guaranteed path.
   (b) Add an **aggregate count badge** to the **dock button** (`addButton()`
   [emigration-dock-decorator.js](../ui/emigration-dock-decorator.js#L114), e.g. "3 cities in crisis").
3. **Stretch (best-effort, gated).** A world-anchored overlay placing a glyph near the city via
   world→screen coordinate conversion (the same fixed-position injection the toasts use). Mark this
   experimental and feature-flag it separately; **never** assume a banner hook.

**Config / tunables.** `cityStatusIcons: true`, `cityStatusOverlay: false` (the experimental world-anchored
form, off by default). `readout` group.
**Localization.** `LOC_EMIG_ICON_*` tooltips (gaining/losing/diaspora/crisis/return).
**Tests.** `tests/city-status.mjs`: resolver returns the right glyphs for crafted snapshots; net-zero city →
no arrow; flags off → empty.
**Risk.** Medium — **scope honesty**: deliver the readout/dock form; treat true banner placement as
experimental. Don't regress selection wiring.

---

### Feature Y — "What changed this turn?" digest *(low; overlaps H)*

**Goal.** A small, frequent end/start-of-turn digest: *"Migration this turn — Rome lost 41k (mostly to
Carthage) · Athens became a net importer · a Persian community formed in Memphis."* The per-turn cousin of
the end-of-age recap (Feature H). **Optional and throttled** so it isn't notification spam.

**Current state.** Per-pass records flow through `recordMigrations()`
([emigration-migration-stats.js](../ui/emigration-migration-stats.js#L752)); the pass loop is `doPass()`
([emigration-main.js](../ui/emigration-main.js#L158)). The feedback pass already summarizes per-cause via
`reportPassFeedback()` ([emigration-feedback.js](../ui/emigration-feedback.js#L461)) — the digest is a
*compact* sibling, not a second toast storm. Net-importer flips come from `netCumFor()` deltas; new
communities from `detectFoundingForCity()`.

**Implementation.**
1. **Builder.** `turnDigest(passMigs) → { lines: string[] } | null` in a new file
   [emigration-digest.js](../ui/emigration-digest.js): top mover (biggest single-civ net change + its main
   corridor), any net-importer/exporter **flips** this pass, any new diaspora crossings. Cap at ~3 lines;
   `null` on a quiet pass.
2. **Surface.** Mount once per turn in the dashboard header and/or a **single** throttled toast via
   `announceImportant()` (cooldown-gated, `cooldownOk()` **L292**). Do **not** add per-event toasts.

**Config / tunables.** `turnDigestEnabled: false` (**off by default** to avoid spam), `digestToast: false`,
`digestLines` (choice). `readout` group.
**Localization.** `LOC_EMIG_DIGEST_TITLE`, `_LOST` ("{civ} lost {people}, mostly to {city}"), `_FLIP_IN`
("{civ} became a net importer"), `_NEW_COMMUNITY`.
**Tests.** `tests/digest.mjs`: top-mover selection; flip detection from net deltas; line cap; quiet pass →
null; off flag → silent. Overlaps H — share the corridor/`formatPeopleExact()` helpers.
**Risk.** Low — but **default off** and single-toast-throttled; the failure mode is spam, not correctness.

---

### Feature Z — Exportable migration history *(low; data-export audience)*

**Goal.** The chart/rankings/archive audience likes data export. Add: copy migration records to CSV, copy
city composition to CSV, copy age recap to clipboard, export the chronicle as text.

**Current state.** The data is all in hand: flows/tallies in
[emigration-migration-stats.js](../ui/emigration-migration-stats.js) (`migrationFlows()` **L566**,
`netCumFor`/`grossInCumFor`/`grossOutCumFor` **L979–993**); composition via `compositionForCity`/
`compositionForOwner` ([emigration-composition.js](../ui/emigration-composition.js#L510)); chronicle via
`chronicleLog()` ([emigration-chronicle.js](../ui/emigration-chronicle.js#L215)); the recap from Feature H.

**Implementation.**
1. **Serializers.** `toCsvRecords()`, `toCsvComposition()`, `chronicleToText()`, `recapToText()` (pure
   string builders) in a new file [emigration-export.js](../ui/emigration-export.js): iterate the existing
   getters, emit RFC-4180-safe CSV (quote/escape) and plain text. No engine reads — accept the already-built
   arrays so the functions are trivially testable.
2. **Surface.** Small "Copy CSV / Copy text" buttons in the dashboard footer. Clipboard write is GameFace-
   constrained — probe for a clipboard API; if absent, fall back to rendering the text into a selectable
   `<textarea>`/`<pre>` the player can copy manually (document the fallback).

**Config / tunables.** `historyExport: true` (`readout` group).
**Localization.** `LOC_EMIG_EXPORT_*` button labels + the manual-copy fallback hint.
**Tests.** `tests/export.mjs`: CSV escapes quotes/commas/newlines; row counts match input; empty input →
header-only CSV; chronicle/recap text round-trips the entries. (Clipboard side-effect is not unit-tested;
assert the serializers.)
**Risk.** Minimal — pure serializers; the only unknown is the clipboard API, handled by the `<textarea>`
fallback.

---

### 15.16 Sequencing & the version headline

These are mostly **read-only and low-balance-risk**, so they can ship faster than the gameplay batch. The
shared substrate (§15.0) is the gate — build it first; L/M/N/P collapse to thin formatting afterward.

1. **§15.0 substrate** (`emigration-explain.js` + `cityEvents`) — prerequisite for L/M/N/P/O.
2. **L — Explainer** (the keystone; makes everything legible) → **O — City feed** → **E/M — sparkline +
   forecast** (the readout becomes live and forward-looking).
3. **N — Advisor** + **P — Policy preview** (turn legibility into agency; P is high community appeal).
4. **S — Diversity ranking** + **T — Cosmopolitanism** + **Q — Diaspora cards** (flavor + screenshot bait;
   S/T share `emigration-diversity.js`, Q overlaps F/I).
5. **R — Milestones** + **U — Crisis severity** + **W — Cultural corridors** + **Y — Digest** (chronicle/
   feed surfaces; U feeds V and X; Y and W overlap H; default Y off).
6. **X — Micro-icons** (deliver the readout/dock form; world-overlay experimental) and **Z — Export**
   (data audience).
7. **V — Humanitarian dilemma** last (highest risk: gameplay + sensitive theme; off by default, rare,
   respectful, strictly bounded).

**Version headline — "Migration Intelligence Update":** *Adds migration explainers, city forecasts, an
advisor, contextual policy-impact previews, diversity & cosmopolitanism rankings, and diaspora profile
cards — so players understand not just **where** people moved, but **why**, and **what they can do about
it**.* The shortlist that carries that headline: **L (explainer), N (advisor), S/T (diversity/cosmopolitan
ranking), O (city feed), P (policy preview), Q (diaspora cards), X (micro-icons)** — all readability-first,
all low balance risk, most default on.

---

## 16. Consistency pass — overlaps, collisions & contradictions resolved

This section reconciles the whole plan (A–K, §12, and L–Z) after a verification pass. Each item below is
either an overlap to **share once**, a collision to **arbitrate**, or a contradiction to **correct**. The
inline specs above were edited to match these resolutions; this section is the index of why.

### 16.1 Anchor drift — §15's line numbers are authoritative

The §0 map and Features A–K were written against an earlier tree and several anchors had drifted (e.g.
`readoutModel()` was listed at **L168**, actually **L89**; the border-stance exports were ~50 lines off;
`moveRecord/departRecord/arriveRecord` at **L45/68/89**, actually **L64/93/117**). The §0 map and the A–K
"Current state" blocks were **corrected inline** to the verified anchors. Standing rule (already in the
header note): **the function name is the source of truth; re-grep before editing.** Where two sections ever
disagree again, the **§15** values are the most recently verified.

### 16.2 One per-city history substrate, not three (E ∩ M ∩ O)

Feature E originally proposed `cityNetSeries()` in `emigration-migration-records.js`, and separately claimed
the `recentEventsFor` feed lived in `emigration-city-readout-data.js`. Both were wrong: `recentEventsFor` is
in `emigration-migration-stats.js` (**L822**) and is **per-owner**. **Resolution:** §15.0b's
`cityEvents(cityKey, limit)` is the single per-city history getter; E's `cityNetSeries` is a thin reduction
of it, M's forecast reads it, O's feed formats it. Build §15.0b first. (E's spec was corrected.)

### 16.3 One per-owner totals source (C ∩ S ∩ X ∩ Y ∩ M)

Feature C speculated "if no per-owner `{in,out,net}` builder exists, add one." It **does**:
`netCumFor`/`grossInCumFor`/`grossOutCumFor` (stats **L979–993**), `ownerStats` (readout-data **L263**),
`civLedgerRows` (views **L31**). All of C (brain-drain tint), S (diversity ranking adjuncts), X (▲/▼
icons), Y (digest flips), and M (forecast) read **those**, not a parallel fold. C's "add `netByCiv(frames)`"
path now applies **only** to timeline-window-scoped net, which is a genuinely different number. (C corrected.)

### 16.4 One coordinated `ChronicleEntry.kind` extension (F ∩ H ∩ R)

Three features add a new chronicle kind: F (`"blend"`), H (`"recap"`), R (`"milestone"`). These are the
**same edit** to three spots — the `kind` union (**L19**), `KIND_LABEL`
([emigration-chronicle-view.js](../ui/emigration-chronicle-view.js#L52)), and `chronicleTitle()` (**L224**).
**Resolution:** if more than one of F/H/R ships, add all needed kinds in **one** pass with one label-map and
one title-switch update; don't land three half-edits to the same union. (Noted inline in F.)

### 16.5 Dilemma arbitration — V must not collide with the existing dilemma (V ∩ §12.2b ∩ existing)

Feature V (`detectHumanitarianDilemma`) and the shipped `detectConquestDilemma()`
([emigration-dilemma.js](../ui/emigration-dilemma.js#L268)) can both want to fire in the same turn, and
§12.2b option-2 proposes a *third* dilemma-style panel. There is **one** dilemma surface (`showDilemma()`,
one modal). **Resolution:** add a single arbiter in the dilemma module — at most one dilemma per turn,
priority `conquest > humanitarian > (selective-borders panel)`, all sharing the existing
`DilemmaState.spree`/`lastTurn` rate-limit (**L45**). Do not let two `showDilemma()` calls race. V's spec
already routes through that state; this makes the precedence explicit.

### 16.6 Tunable groups — `visuals` and `readout` are each created once

Features B/C/D each say "a new `visuals` group" and §13.1 says the same; §15 adds a `readout` group. Only
the **first** feature to land in each group creates it; the rest **join**. Allocation: **`visuals`** = the
canvas/flow-view toggles (B particles, C brain-drain, D pins, W corridor labels, J pressure lens);
**`readout`** = the intelligence panel toggles (L–T, U scale, X icons, Y digest, Z export). Feature W's
earlier "`readout`/`visuals`" ambiguity was resolved to **`visuals`** (it paints on the flow view).

### 16.7 Cross-batch sequencing — E moves into the §15 wave

Feature E (sparkline) is listed in the original §14 plan (step 2) **and** in §15.16 (step 2). That's
intentional, not a contradiction: E shares the §15.0b per-city substrate with M/O, so it is most cheaply
built **with** the intelligence batch. **§15.16 supersedes the §14 placement of E.** The rest of §14 (A,
B, C, D, F, G, H, J, K, §12) is unchanged.

### 16.8 Smaller overlaps (share, don't duplicate)

- **Enclave share (K ∩ L):** "Existing _ community" in L's explainer is the same composition-share signal as
  K's `enclaveAffinity`. Reuse K's helper if shipped; otherwise read `compositionFor*` share directly.
- **Diaspora narrative (Q ∩ I ∩ F):** Q's card "status" (growing/integrating/blended) shares wording with
  I's follow-ups and F's blend milestone — one status vocabulary across all three.
- **Crisis surface (U ∩ D ∩ V):** U's optional map badge reuses D's `drawEventBadge()` path; U's severity is
  the trigger input to V. One `crisisSeverity()` (U) feeds all three; don't recompute.
- **Corridors (W ∩ H):** named corridors feed H's age recap and the chronicle — one `namedCorridors()`
  source, consumed by H, not a second corridor scan.
- **`formatPeopleExact()`** is treated as existing by H and reused by M/O/U/Y/Z — verify it's exported
  before the first consumer lands (it's used by the flow view today).

---

## 17. Carried-over deferred features (from the open-items backlog)

These two were tracked in [emigration-open-items.md](emigration-open-items.md) but are genuine
**net-new features**, not the correctness/perf/maintainability cleanups that file descends from — so
they're moved here to live with the rest of the feature roadmap. Both follow §13's cross-cutting rules
(flag-gating, modinfo registration, localization parity, tests wired into the gate). Each carries the
"revisit when" trigger it had in the backlog.

### 17.1 Feature AA — Wire the staged Migration Chronicle view *(low; frontend wiring)*

**Goal.** Mount the already-built Migration Chronicle **view** into a Demographics sub-tab so the live
chronicle data has a home in the UI.

**Current state.** `renderChronicle(body)`
([emigration-chronicle-view.js:74](../ui/emigration-chronicle-view.js#L74)) exists and its
idempotent-render bug is already fixed, but it is **not mounted** anywhere yet. The Chronicle **data**
layer is fully live — `chronicle()` ([emigration-chronicle.js:153](../ui/emigration-chronicle.js#L153))
is written by the dilemma/return paths and mirrored to Notifications via `mirrorToNotifications()`
([**L131**](../ui/emigration-chronicle.js#L131)). This is a built-ahead-of-wiring feature; **do not
delete it** — the action is to wire it up.

**Implementation.**
1. **Mount.** Add a "Chronicle" sub-tab to the Demographics window and call `renderChronicle(body)` from
   the same dashboard-gather path the other tabs use (`gatherDashboard()`
   [emigration-window.js:676](../ui/emigration-window.js#L676)). Refresh on the same turn-advance signal
   the other views use so entries appear as they're chronicled.
2. **Kind labels.** Confirm the view's `KIND_LABEL`
   ([emigration-chronicle-view.js:52](../ui/emigration-chronicle-view.js#L52)) covers every
   `ChronicleEntry.kind` in play (and any new kinds added by §6-F/H/R — coordinate with §16.4).

**Config / tunables.** `chronicleTabEnabled: true` (`readout` group). **Localization.** Reuse the view's
existing strings; fold its raw English (`"Turn "`, fallback title, empty-state prose, `KIND_LABEL`) into
the Phase-1 `LOC_*` sweep noted in the open-items cross-cutting list. **Tests.** Extend the chronicle-view
test: the tab renders without throwing on an empty log, is idempotent across re-render, and shows entries
newest-first.

**Risk.** Low — additive frontend over a live data layer. Deliberately excluded from the behavior-neutral
dead-code pass because it's a feature, not cleanup.

### 17.2 Feature AB — City-local migration brakes (Phase 5) *(higher — gameplay; off until shakedown)*

**Goal.** Move the assimilation / congestion **braking** load from **civ scope to city scope** so
congestion penalties bite per destination city rather than empire-wide — the optional follow-on to the
shipped two-track voluntary/crisis split.

**Current state.** The voluntary/crisis split **shipped** (engine `processSourceSplit`,
`crisisPressure`/`crisisCooldown` state, split per-civ budgets, counterfactual parity, the
`splitTracksEnabled` / `splitBudgetsEnabled` / `splitUiReadoutEnabled` flags, and the multi-cause
`causeMix` city readout). The brakes today are **civ-scoped**: `addAssimilationLoad()`,
`tickAssimilation()`, `assimLoadFor()`, `congestionPenalty()`
([emigration-effects.js](../ui/emigration-effects.js#L105)) key load by owner, not city (verified: no
city-keyed load in effects.js). This piece was explicitly gated "ship only after Phase 1 stability gates
pass" / after the in-game pass. (Source: the now-deleted `MIGRATION_SPLIT_PLAN.md` §5 / `SHIP_PLAN.md`
Phase 5.)

**Implementation.**
1. **Re-key the load by destination city id.** Change the `EmigrationAssim_v1` load store and
   `addAssimilationLoad(destOwner, destPopulation)` / `tickAssimilation()` / `assimLoadFor()` /
   `congestionPenalty()` to key on destination city id instead of owner pid. Ship a **compatibility
   migration** that folds any existing owner-scoped persisted load into the new city-keyed shape on first
   load (don't drop accumulated load on upgrade).
2. **Bound it.** Keep the same caps/clamps the civ-scoped version uses so per-city braking can't exceed
   the existing empire-wide ceiling; run the migrated path through the balance harnesses
   (`scripts/snowball-stress.mjs`, `calibration-sweep`).

**Config / tunables.** `cityScopedBrakes: false` (**off by default** — it changes braking behavior);
ship behind the flag and validate in-game before defaulting on.

**Optional enhancements (lower value, not started).**
- A **voluntary-vs-crisis toggle** in the network viz (let the player filter the flow/dots view to one
  track).
- Promote the **per-cause Demographics metrics** to **on-by-default** (today opt-in via
  `splitUiReadoutEnabled`).

**Tests.** Add `tests/city-scoped-brakes.mjs`: city-keyed load accumulates/decays per city; the
owner→city compatibility migration preserves total load; congestion penalty stays within the existing
clamp; off flag → byte-identical to the current civ-scoped behavior (characterization test).

**Revisit when** the split has had its in-game shakedown and city-granular braking is actually wanted.
**Risk.** Gameplay/balance + a persisted-state migration — ship off by default, validate with the
balance scripts, and document.
