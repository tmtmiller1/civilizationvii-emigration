# Emigration — Roadmap & Backlog

The single planning document for the **Emigration** mod. It carries two kinds of work under one
continuous numbering:

- **The feature roadmap (§0–§17)** — a map of every relevant existing pipeline (with `file:line`
  anchors), then an implementation-grade plan for each not-yet-built feature: which files change, which
  functions to touch, the data shapes, the config knobs, the localization keys, and the tests to add. It
  covers the visualization/gameplay batch (Features B–K), the deepened refugee/border stance (§12), the
  cross-cutting checklist (§13), suggested sequencing (§14), the L–Z migration-intelligence layer (§15),
  the shared foundations every feature reuses (§16), and the carried-over deferred features (§17).
  Features A–K are numbered by letter position (B = §2 … K = §11), so the gaps are intentional: §1
  (Feature A) was never opened, and §4/§5/§6 shipped (Features D — timeline event pins, E — net
  sparkline, F — cultural quarters).
  In §15, Features **S** (most-diverse-cities ranking) and **T** (cosmopolitanism score) have also
  shipped and been removed; they created the `readout` tunable group and `emigration-diversity.js`,
  which the remaining readout features join and reuse (§16.6, §16.7).
- **The cleanups, QA & conditional backlog (§18–§26)** — the remaining correctness/perf/maintainability
  cleanups, pending in-game verification, trigger-gated leftovers, the rollout-flag retirement pass, and
  the deferred arrivals-hardening items, each with a "revisit if/when" condition.
- **The migration-system enhancement backlog (§27)** — measure-first proposals to enhance the simulation
  (fairness/exploit fixes, plausibility/depth), derived from the scenarios critique. Its Priority-0
  legibility layer shipped; the rest is gated on reading the shipped telemetry first.
- **The quality-analysis open items (§28)** — the three items still open in
  `mods_quality_analyses/emigration-quality-analysis`: the render-layer testing posture (a policy
  decision, not a defect), the mutation composite sitting 0.04 under its ratchet, and the RC-gated
  flakiness measurement. All gates are green; none of these is a bug.

Completed work is removed from this document as it ships and recorded in the
[CHANGELOG](../CHANGELOG.md). Deliberate non-changes (closed by decision, no trigger) live in
[wont-fix-with-justifications.md](wont-fix-with-justifications.md).

## Conventions & invariants

Every item honors the mod's standing rules: flag-gated behaviour with conservative defaults, and the
full cross-cutting checklist in **§13** (config/tunables, modinfo registration, localization parity, the
`visuals`/`readout` tunable groups, tests wired into the gate, lint, verify+release). The hard
invariants that must never be violated:

- Never touch the **population-scaling** constants — pinned bit-for-bit to the Demographics mod by
  `tests/scaling-demographics-parity.mjs`.
- Never change the network/flow **sim/layout/canvas-buffer** coordinates (`WX = 1120`, `WY = 560`).
- ESLint **complexity ≤ 10**; `max-len` and `no-unused-vars` are error-level. Extract helpers.
- `npm run verify` must exit 0 before every ship.

> Line numbers throughout are accurate as of writing but the codebase moves; treat the **function name**
> as the source of truth and the line as a hint. Re-grep before editing.

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

### 0.6 Border policy / immigration stance (relevant to §12)

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

### 0.7 Migration scenarios — reference diagrams (standalone)

The full scenario graphics are maintained in
[migration-scenarios-diagrams.md](migration-scenarios-diagrams.md) so they can evolve independently from
the implementation plan. They map directly to the hooks in §0.1–§0.6 and the quarter rules in
[cultural-enclaves.md](cultural-enclaves.md).

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

## 4. Feature D — Timeline event pins — SHIPPED

> **This section is stale and kept only for its rationale.** D is in the tree: `timelineEventPins`
> (config), `makeEventPins()` ([emigration-network-timeline.js](../ui/emigration-network-timeline.js)),
> and `tests/network-timeline-pins.mjs` + `tests/timeline-events.mjs` in the gate. It also created the
> `visuals` tunable group that B/C/W/J join (§16.6). Remove this section on the next doc pass.

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
queryable any turn via `compositionForCity()`. Migration records already carry `people` and are folded
in [emigration-migration-stats.js](../ui/emigration-migration-stats.js), so a city+origin immigrant-mass
counter can be derived without adding a second movement ledger.

> **Subsumes the former "P2.4 cumulative diaspora chronicle" (§27).** That item wanted a chronicle
> triggered by *cumulative inflow across an age* rather than a single share crossing. The shipped
> `none → foothold → established` diaspora arc already recognizes a slow trickle ("A {Civ} Foothold in
> {City}"); the only remaining piece — the cumulative-*mass* trigger — is exactly this feature's
> `migrantMass` gate. Build it here, not as a separate item.

**Implementation.** When `detectFoundingForCity()` crosses a *downward* tier (integration progressing),
emit a short follow-up line via a new `followupLine(e)` in
[emigration-narrative.js](../ui/emigration-narrative.js), reusing the same dedupe scheme keyed on the new
tier **only if** a minimum immigrant-mass gate is satisfied: `migrantMass(city, origin) >=
CONFIG.integrationMilestoneMinImmigrants`. `migrantMass` should be a persisted or foldable total of
migrated `people` for that `(city,origin)` pair (source: migration records/stat folds), so tiny trickles
that happen to cross a share tier do not fire milestone narrative. This largely overlaps the **shipped**
Cultural Quarter system (the mechanical reward + named quarter at full integration, `quartersEnabled`);
Feature I is the remaining narrative-breadcrumb layer along the way, and should reuse the quarter system's
status vocabulary and dedupe scheme.

**Config / tunables.** `integrationMilestoneMinImmigrants` (conservative default; `0` preserves old
share-only behaviour).

**Tests.** Folded into `tests/cultural-blend.mjs`: assert no follow-up when a tier crossing occurs below
`integrationMilestoneMinImmigrants`, and assert follow-up fires once when the same crossing occurs above
the threshold.

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

Refugee/border policy is **already implemented** as real native **policy cards (Traditions)**, not just a
one-off dilemma — so the "standing stance" idea is already shipping. This section documents exactly what
exists (§12.1), then specs a concrete design for the *deeper* version (§12.2: government gating, granular
per-people closure, asymmetric consequences).

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

### 12.2 What's NOT there yet — the deeper design

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

This orders the simulation/visualization/gameplay batch (Features B–K, §12). The L–Z
migration-intelligence layer has its own sequencing and version headline in §15.16.

1. **I — story follow-ups** (small, make existing data feel alive). *(E — net sparkline shipped.)*
2. **B — Flow particles** + **C — Brain-drain highlight** (medium; the Flow view finally looks distinct).
   *(D — Timeline event pins shipped; it created the `visuals` group these two join.)*
4. **12.2a/c — Government-gated stance + richer consequences** (deepens a shipped system; mostly JS +
   a few native modifiers; off by default).
5. **G — Homeland pull-back** + **H — Age recap** (gameplay/narrative; off by default, validate balance).
   *(F — Cultural quarters shipped.)*
6. **K — Chain migration** + **12.2b — Selective closure** + **J — Pressure lens** (model/UI changes;
   highest risk; gate off, run the snowball/calibration scripts first).

Each item is independently shippable behind its flag, so they can be released incrementally rather than
as one large version.

---

## 15. Migration Intelligence Update — readability & explainability features

The features above (B–K, §12) mostly add *new simulation* and *new visuals*. The community pattern for
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
**15.0a has shipped** (below); 15.0b is still open.

#### 15.0a `emigration-explain.js` — decompose push & pull into labeled contributions — SHIPPED

The single source of "why", live as [emigration-explain.js](../ui/emigration-explain.js). Read it before
building L/M/N/P — each is meant to be thin formatting over these rows, never its own reasoning.

- `explainPull(src, dest, ctx)` / `explainPush(signal, ctx)` → `[{ key, label, delta, kind }]`, sorted by
  `|delta|` descending, `[]` for anything with no decision to explain (null inputs, a pair `adjustedPull`
  rejects, a `crossCivEnabled: false` cross-civ pair).
- `weigh(rows)` → the same rows with a `weight` (`|delta| / Σ|delta|`). **This is the honesty rule made
  callable** — the deltas are model-score points with no player-meaningful unit, so only the ratios may be
  rendered. Never "−42% of your population". `weigh` excludes the multiplicative row for you.
- `factorLabel(key)` → the display label. `LOC_EMIG_EXPLAIN_*` keys are referenced but **not yet defined**:
  nothing renders these strings until Feature L mounts them, so L adds the keys to `en_us` + the 11
  locales. Until then `loc()` resolves them to the English fallbacks in the module. No parity debt today.

**Two spec corrections, worth knowing before you extend it.**

1. **Leave-one-out was not buildable and was not needed.** The original spec said to re-evaluate
   `adjustedPull()` with one factor neutralized. There is no seam for that — the factors come from
   `CONFIG` globals and private helpers (`tiltFor`, `crossCivBlock`, `dominanceFor`), so neutralizing one
   means mutating global state, which is not pure and races the engine's own `setNeutralBorders`
   counterfactual. It is also degenerate: pull is `(Σ additive terms) × permeability`, so a term's
   leave-one-out delta **is** `raw × permeability`. The shipped code computes that directly and exactly.
2. **`kind` follows the sign, on both sides.** The spec fixed `kind: "push"` for the push builder. A fixed
   kind has to call a thriving economy a "push", and the terms that RETAIN people are exactly what an
   advisor (N) must be able to name. One rule now: `delta > 0` = "pull", `< 0` = "push", plus `"scale"`
   for permeability.

**How the attribution stays honest**, and the two different mechanisms — do not conflate them:
- **Pull is a MIRROR.** `pullBreakdown()` lives next to `adjustedPull()` in
  [emigration-pull.js](../ui/emigration-pull.js) and re-lists its terms. It is deliberately not called by
  `adjustedPull`, which runs per (source × destination) pair and bails early on a non-positive gradient —
  it must not pay for an itemized array. **The mirror is only as good as the fixture**: the
  all-terms-at-once reconstruction case in `tests/explain.mjs` is what pins it, and it exists because the
  first version of that test left congestion/dominance/tilt/flight/aggressor at zero and happily survived
  deleting them. If you add a pull term, add it to `PULL_TERMS` in that test.
- **Push is DELEGATED.** `baseBreakdown()` / `situationalBreakdown()` in
  [emigration-prosperity.js](../ui/emigration-prosperity.js) are the source of truth and `baseScore()` /
  `situationalPercent()` are now just their sums (summed in the terms' declared order, so the arithmetic
  is unchanged — engine snapshots are byte-identical). Drift is structurally impossible here; a term
  changing value is caught by `tests/prosperity.mjs`, not by the reconstruction.

**One modelling subtlety to preserve.** `prosperity = base × (1 + Σ situational%/100)`, so a situational
penalty's contribution is `base × %/100`. On a city whose base has gone **negative** (poor, unhappy,
crowded) a signed multiply flips a siege into a positive "attraction" — the same pathology the F2 guard
exists for. `explainPush` scales situational terms by `|base|` so a penalty always reads as a push; for
the ordinary positive base it is exactly the true contribution.

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

### Feature L — "Why did they leave / go there?" explainer — SHIPPED

> **Kept only for the two design corrections below**; the rest is in the tree. `migrationExplainer`
> (config + `readout` tunable), [emigration-explain-view.js](../ui/emigration-explain-view.js)
> (`buildExplainModel` pure / `explainModel` gathering / `renderExplain` / `mountExplain`), and
> `tests/explain-view.mjs` in the gate. It defined the `LOC_EMIG_EXPLAIN_*` keys the §15.0a substrate
> referenced, so those are now real strings in all 12 locales. Remove this section on the next doc pass
> once M/N/P have read it.

**Two spec corrections, worth knowing before you build M/N/P on this.**

1. **The "existing {Civ} community" row could not be a weighted row, and is a NOTE instead.** The spec
   listed "Prosperity, Open borders, Existing Roman community, Alliance" as peer rows. Only the first is
   an addend. Chain migration is Feature K (§11) — unbuilt — so a destination's diaspora contributes
   **exactly zero** to today's pull; and permeability (open borders / alliance) is the multiplicative
   channel `weigh()` deliberately excludes. Synthesizing a delta for the community row would not merely
   overstate that row: the fabricated magnitude enters `weigh()`'s denominator and **silently falsifies
   every other row's share**. So the shipped model renders three distinct things — weighted `leaving` /
   `drawnTo` factors, a `permeability` multiplier reported as `×N` (its `factor` is the honest number,
   per §15.0a), and a `community` context note. When K ships, its `enclaveAffinity` folds into `tiltFor`
   and the existing `tilt` row carries it as an earned weight, with no change to this surface.
   `tests/explain-view.mjs::testCommunityDoesNotDisturbWeights` pins that the notes cannot move a weight.
2. **The network-tooltip mount (b) was NOT built — it is a category error, not an oversight.** The
   spec's three mounts were readout / network tooltip / lens hover. Mounts (a) and (c) shipped; (b) is
   deferred to §20b because the network view is a **historical playback** surface (`pb.idx` scrubs
   `frames[]`, and the scene's dots span the whole timeline) while the explainer is a **live,
   current-turn** decomposition of `collectCitySignals()`. Pinning today's cause stack onto a turn-40
   frame would attribute present reasons to the past. The scene also carries no city key to resolve a
   signal with — only `(civ id, city name)`, the same pair `cityNetSeries` keys on. Both are solvable
   (match on owner+name; gate on the scrubber sitting at the live frame) but that is a real feature, not
   a mount, so it is written up separately rather than smuggled in here.

**Other things worth knowing.**

- **New seam: `pullContext(src, ranked, ownerPop)`** ([emigration-pull.js](../ui/emigration-pull.js)) →
  `{flee, ownerPop, aggressors}`. `bestDestination` and the explainer BOTH build their context through
  it, so a hovered city can't be explained against different inputs than the sim decided with (before
  it, a tooltip that forgot to look up aggressors would silently report an `aggressor` row of 0 for a
  besieged city). Use it for M/N/P too.
- **The explainer is memoized per turn** (`resetExplainCache()`, registered with the cache-reset
  convention). Unlike the readout — one snapshot per *selection* — this is mounted on hover panels, and
  the gather ranks every settlement in the world. A cursor crossing a civ's tiles would otherwise
  re-rank it dozens of times a turn.
- **New generic hook: `HoverPanelSpec.decorate(panel, signal)`**
  ([emigration-lens-hover-panel.js](../ui/emigration-lens-hover-panel.js)), called once per new tile.
  The panel's `rows` contract is title + flat strings, so anything with structure (the weight bars)
  mounts through here. It is a spec hook, not a call in that module, so the shared panel stays agnostic
  about which features exist — the Prosperity lens opts in. Reuse it for O/X rather than widening `rows`.
- **Row display rules** live in the view, not the substrate: `MAX_ROWS = 5` and `MIN_WEIGHT = 0.005`.
  Truncation is honest here because each weight is a share of the FULL decomposition, so a shown row
  means the same thing whether or not the tail is drawn — a truncated group sums to ≤ 1 and is **not**
  renormalized (`tests/explain-view.mjs` pins both halves of that).

---

### Feature M — Migration forecast ("next 5 turns" / "Will depart soon") *(low–medium)*

**Motivation (why this is now the priority, 2026-07-17).** The City Details panel's flow lists were
reworded this pass from the misleading present tense ("Departing to") to an honest past-tense,
all-game ledger ("Departed to (all game)"), and each corridor now names its dominant cause ("… -
mostly Unhappiness"). That fixes the "who already left and why" half of the panel. What it deliberately
does **not** do is tell the player who is *about* to leave and when — the thing a player most wants in
order to intervene before the loss. This feature is that missing forward half, and its natural home is
a **"Will depart soon"** block on the same City Details panel (not only the HUD readout line originally
specced), directly above the "Departed to" ledger so past and projected read together.

**Goal.** A forward-looking line: *"Will depart soon: ~23k people over the next ~5 turns unless
happiness or safety improves,"* or *"likely to become a destination for refugees from Persia."*
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
2. **Render — two surfaces, one projection.**
   - **City Details "Will depart soon" block** (primary, per the 2026-07-17 motivation). Add a
     `forecast` field to the panel view-model in
     [emigration-city-panel-data.js](../ui/emigration-city-panel-data.js): the host
     ([emigration-city-panel.js](../ui/emigration-city-panel.js)) calls `forecastFor()` and passes the
     already-resolved `{netPeople, direction, driverName, topSourceName?}` (resolve the driver label
     via `causeLabel()` host-side, exactly as the new `topCauseName()` helper resolves the ledger's
     dominant cause — keep the pure model DOM/engine-free). The block renders only when the flag is on
     and the projection is non-trivial; place it directly ABOVE `departingHeading` so "will depart" and
     "departed" sit together.
   - **HUD readout line** (secondary, the original spec): one line appended in `readoutModel()`
     (**L89**), same wording.
3. **Conservatism.** Clamp the horizon (`forecastTurns` default 5, max ~10) and the magnitude (cap at, e.g.,
   the city's rural pool so it can't predict draining below the floor).

**Config / tunables.** `cityReadoutForecast: true` (gates BOTH surfaces), `forecastTurns` (choice
`[3,5,8]`), `forecastDecay` (module const). `readout` group.
**Localization.** `LOC_EMIG_FORECAST_LOSE`, `LOC_EMIG_FORECAST_GAIN`, `LOC_EMIG_FORECAST_DEST`
("…destination for refugees from {civ}"), `LOC_EMIG_FORECAST_STABLE`, plus a panel heading
`LOC_EMIGRATION_PANEL_WILL_DEPART` ("Will depart soon") — all 11 locales via the i18n pipeline
(`i18n_extract` → `i18n_apply`, parity enforced by `tests/i18n.mjs`).
**Tests.** `tests/forecast.mjs`: monotonic in recent net; damped by cooldown; never projects below the
rural floor; stable city → "stable" branch; off flag → no line. Panel wiring: extend
`tests/city-panel.mjs` for the `forecast` block (present when on + non-trivial; absent when off/stable).
**Risk.** Low — but word it as a forecast and keep the cap, or players will treat it as a promise. The
"Will depart soon" heading sitting right above "Departed to (all game)" makes the past/future contrast
explicit, which reinforces the framing.

**Prerequisite shipped (2026-07-17):** the City Details ledger rework this feature builds on — see the
CHANGELOG "Fixed" entry for the panel relabel + per-corridor cause. The `topCause()` helper
([emigration-causes.js](../ui/emigration-causes.js)) and host-side `topCauseName()`
([emigration-city-panel.js](../ui/emigration-city-panel.js)) are the pattern to follow for resolving
the forecast driver label.

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
3. **Render.** Collapsible advisor block under the readout (or an "advisor" toggle), reusing `renderExplain`'s
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
exodus/founding/return events (diaspora module), diversity (the **shipped** `diversityScore()` /
`cosmopolitanism()` in [emigration-diversity.js](../ui/emigration-diversity.js) — reuse it for the
*City of Many Peoples* / diversity predicates rather than re-deriving), net flow
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

1. **§15.0 substrate** — `emigration-explain.js` has **shipped** (§15.0a); `cityEvents` (§15.0b) is the
   remaining prerequisite, for O/M's feed.
2. **L — Explainer shipped** (the keystone; everything below is now thin formatting over it — read
   §15.1's two spec corrections and the `pullContext` seam before building M/N/P). Next: **O — City
   feed** (needs §15.0b) → **M — forecast** (the readout becomes live and forward-looking). *(E —
   sparkline shipped; it already reads the §15.0b substrate M/O share.)*
3. **N — Advisor** + **P — Policy preview** (turn legibility into agency; P is high community appeal).
4. **Q — Diaspora cards** (flavor + screenshot bait; Q overlaps F/I). *(S — diversity ranking and
   T — cosmopolitanism shipped, sharing `emigration-diversity.js`; they created the `readout` tunable
   group and the `diversity` dashboard section that later readout features join.)*
5. **R — Milestones** + **U — Crisis severity** + **W — Cultural corridors** + **Y — Digest** (chronicle/
   feed surfaces; U feeds V and X; Y and W overlap H; default Y off).
6. **X — Micro-icons** (deliver the readout/dock form; world-overlay experimental) and **Z — Export**
   (data audience).
7. **V — Humanitarian dilemma** last (highest risk: gameplay + sensitive theme; off by default, rare,
   respectful, strictly bounded).

**Version headline — "Migration Intelligence Update":** *Adds migration explainers, city forecasts, an
advisor, contextual policy-impact previews, diversity & cosmopolitanism rankings, and diaspora profile
cards — so players understand not just **where** people moved, but **why**, and **what they can do about
it**.* The shortlist that carries that headline: **L (explainer), N (advisor), O (city feed),
P (policy preview), Q (diaspora cards), X (micro-icons)** — all readability-first, all low balance risk,
most default on. *(S/T — the diversity/cosmopolitanism ranking — shipped first; **L — the explainer —
has now landed** and is the keystone of the headline.)*

---

## 16. Shared foundations & cross-feature overlaps

The substrates and coordination rules that multiple features reuse. Build each **once** and have every
consumer read it, rather than letting each feature grow a parallel copy — the items below are where that
duplication would otherwise creep in: one per-city history feed, one per-owner totals source, one
chronicle-kind edit, one dilemma arbiter, one of each tunable group.

### 16.1 Anchors are hints, not truth

The `file:line` anchors throughout this document drift as the tree moves. Treat the **function name** as
the source of truth and re-grep before editing; where a feature's "Current state" block and this section
ever disagree, the more recently verified value wins.

### 16.2 One per-city history substrate, not three (M ∩ O; E shipped on it)

**Resolution (shipped for E):** §15.0b's `cityEvents(cityKey, limit)` is the single per-city history
getter. Feature E (sparkline) **shipped** as `cityNetSeries` — a thin reduction of that substrate — living
in `emigration-migration-stats.js`, not a second per-city store. M's forecast reads the same substrate and
O's feed formats it; build the rest of §15.0b once and both consume it. `recentEventsFor`
(`emigration-migration-stats.js` **L822**) is **per-owner**, so the per-city getter is the right layer.

### 16.3 One per-owner totals source (C ∩ S ∩ X ∩ Y ∩ M)

Feature C speculated "if no per-owner `{in,out,net}` builder exists, add one." It **does**:
`netCumFor`/`grossInCumFor`/`grossOutCumFor` (stats **L979–993**), `ownerStats` (readout-data **L263**),
`civLedgerRows` (views **L31**). All of C (brain-drain tint), S (diversity ranking adjuncts), X (▲/▼
icons), Y (digest flips), and M (forecast) read **those**, not a parallel fold. C's "add `netByCiv(frames)`"
path now applies **only** to timeline-window-scoped net, which is a genuinely different number. (C corrected.)

**Shipped for S:** the diversity ranking consumes `grossInCumFor` for its inbound term, but takes it by
**injection** (`diverseCityRanking({ openness, inbound, visible })` in
[emigration-diversity.js](../ui/emigration-diversity.js), bound in `gatherDiversity()`
[emigration-window.js](../ui/emigration-window.js)) rather than importing the stats/borders modules — that
keeps the metrics pure and unit-testable off-engine. Later readout features can bind the same seam.

### 16.4 One coordinated `ChronicleEntry.kind` extension (H ∩ R)

Two remaining features add a new chronicle kind: H (`"recap"`) and R (`"milestone"`). These are the
**same edit** to three spots — the `kind` union (**L19**), `KIND_LABEL`
([emigration-chronicle-view.js](../ui/emigration-chronicle-view.js#L52)), and `chronicleTitle()` (**L224**).
**Resolution:** if both H/R ship, add all needed kinds in **one** pass with one label-map and one
title-switch update; don't land two half-edits to the same union. (The shipped Cultural Quarter system did
**not** add a chronicle kind — quarters surface via the dilemma modal and reuse the existing
exodus/founding/return kinds — so it is not part of this edit.)

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

**Both groups now exist — JOIN them, don't re-create them.** `readout` was created by the shipped
diversity ranking (S/T) and `visuals` by the timeline-pins work (D); each is registered once in
`TUNABLES` ([emigration-tunables.js](../ui/emigration-tunables.js)) and given its section header in
`GROUPS` ([ui/options/emigration-advanced-editor.js](../ui/options/emigration-advanced-editor.js)). A new
feature adds only its own `TUNABLES` row with the right `group` key; the header is already there.

### 16.7 Shipped substrates are live — reuse them

Features S (diversity ranking) and T (cosmopolitanism) have **shipped** as
[emigration-diversity.js](../ui/emigration-diversity.js) (pure metrics + ranking) and the `diversity`
dashboard section in [emigration-detail-views.js](../ui/emigration-detail-views.js), fed by
`allCityCompositions()` — a new enumerator on [emigration-composition.js](../ui/emigration-composition.js)
for readers that aggregate ACROSS settlements rather than asking about one city. Feature R's diversity
predicates and Q's card status should read `diversityScore()`/`cosmopolitanism()`, and any feature needing
every city's mix should read `allCityCompositions()` rather than re-walking the ledger.

Features E (net sparkline) and F (cultural quarters) have **shipped** and left reusable substrates: E's
`cityNetSeries` (a thin reduction of §15.0b's `cityEvents`, in `emigration-migration-stats.js`) and F's
Cultural Quarter/Enclave system (state, registry, and status vocabulary). Later features read these rather
than rebuilding them — M/O consume the §15.0b feed; Q/I reuse the quarter status wording (see §16.8).

The **§15.0a explain substrate has shipped** as [emigration-explain.js](../ui/emigration-explain.js)
(`explainPull` / `explainPush` / `weigh` / `factorLabel`), together with the breakdown seams it reads:
`pullBreakdown()` ([emigration-pull.js](../ui/emigration-pull.js)) and `baseBreakdown()` /
`situationalBreakdown()` ([emigration-prosperity.js](../ui/emigration-prosperity.js)). **L, M, N and P are
now the thin formatting layers they were specced to be** — L renders `weigh(explainPush(...))` /
`weigh(explainPull(...))`, M's `driver` is `explainPush(...)[0]`, N maps a row's `key` to its lever, and
P's counterfactual re-reads `pullBreakdown` under the toggled stance. None of them may re-derive a reason,
and none may render a raw `delta` (see the honesty rule in §15.0a).

### 16.8 Smaller overlaps (share, don't duplicate)

- **Enclave share (K ∩ L):** "Existing _ community" in L's explainer is the same composition-share signal as
  K's `enclaveAffinity`. Reuse K's helper if shipped; otherwise read `compositionFor*` share directly.
- **Diaspora narrative (Q ∩ I):** Q's card "status" (growing/integrating/blended) shares wording with
  I's follow-ups and the **shipped** Cultural Quarter milestone — reuse the quarter system's status
  vocabulary across all three rather than inventing a parallel one.
- **Crisis surface (U ∩ D ∩ V):** U's optional map badge reuses D's `drawEventBadge()` path; U's severity is
  the trigger input to V. One `crisisSeverity()` (U) feeds all three; don't recompute.
- **Corridors (W ∩ H):** named corridors feed H's age recap and the chronicle — one `namedCorridors()`
  source, consumed by H, not a second corridor scan.
- **`formatPeopleExact()`** is treated as existing by H and reused by M/O/U/Y/Z — verify it's exported
  before the first consumer lands (it's used by the flow view today).

---

## 17. Carried-over deferred features

These were once tracked in the cleanups backlog (§18–§26) but are genuine **net-new features**, not the
correctness/perf/maintainability cleanups that backlog descends from — so they live here with the rest of
the feature roadmap. Each follows the §13 cross-cutting checklist and carries the "revisit when" trigger
it had in the backlog.

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
   `ChronicleEntry.kind` in play (and any new kinds added by H/R — coordinate with §16.4).

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

### 17.3 Feature AC — Emigration of urban population *(higher — gameplay; unspecced, probe-gated)*

**Goal.** Extend the migration model beyond rural population so a city's **urban** population can also
leave under sufficient pressure — a besieged/collapsing city today only ever bleeds its rural workers,
so the urban core is effectively immortal to migration.

**Current state.** The mod's **only** population write is `city.addRuralPopulation(±1)`, wrapped by
`moveRural` / `removeRural` / `addRural`
([emigration-population.js:487-533](../ui/emigration-population.js#L487-L533)). By design it "only ever
removes rural population, so the urban core and the settlement itself survive until an actual capture"
(README §Outlet). This feature would relax that deliberate floor for the crisis track only.

**Open questions (resolve before design).**
1. **Is there an engine lever at all?** Verify whether a symmetric `city.addUrbanPopulation(±1)` (or
   equivalent) exists and is callable/writable from the UI VM, cross-civ, the way `addRuralPopulation`
   is — **probe first** (extend `devtools/migration-probe.js`); if there is no such write, the feature is
   dead on arrival and should be recorded in [wont-fix-with-justifications.md](wont-fix-with-justifications.md).
2. **What does losing an urban point do to the district/building on that tile?** Rural removal leaves the
   improvement intact and merely unworked; the urban analogue (specialists, buildings) is unknown and must
   be observed in-game, not assumed.
3. **Should urban emigration ever be voluntary, or crisis-only?** Likely crisis-only — voluntary urban
   flight would trivialize city collapse. Gate under the existing crisis track, not the voluntary one.

**Implementation (sketch, pending Q1).** Add urban-aware wrappers alongside the rural ones and route them
only from the crisis/outlet path once rural population is exhausted (urban is the *last* to leave, never
the first). Reuse the deterministic pressure math and the transit queue; do **not** add a second RNG.

**Config / tunables.** New flag, **off by default** (`urbanEmigrationEnabled: false`) — it changes the
core invariant that cities survive migration. **Tests.** Characterization test proving off → byte-identical
to today; a rural-exhausted-then-urban ordering test.

**Revisit when** the Q1 probe confirms an urban-population write is reachable. **Risk.** High — touches
the mod's central "cities don't die from migration" invariant and depends on an unverified engine API;
must be probe-gated and shipped off by default.

---

The remainder of this document is the **cleanups, QA & conditional backlog**: the
correctness/perf/maintainability cleanups, pending in-game verification, and trigger-gated leftovers that
survived their reviews without shipping. It descends from a series of now-consolidated audits
(`emigration-improvement-review.md`, `emigration-dead-code-audit.md`, the per-module backlogs, and the
2026-07-10 corpus bug-hunt); everything those reviews resolved has shipped and is in the
[CHANGELOG](../CHANGELOG.md). All work here honors the **Conventions & invariants** above and the §13
checklist. Two items once tracked here — the staged Migration Chronicle view (`renderChronicle` wiring)
and the city-local migration brakes — turned out to be genuine net-new features and now live in §17
(Features AA and AB).

## 18. Won't-fix decisions

Deliberate non-changes (closed by decision, with no "revisit if" trigger) live in their own canonical
list — [wont-fix-with-justifications.md](wont-fix-with-justifications.md) (currently **P3** — caching
`situationalPercent`/`distress` is unsafe under `warSiege`; and **C3** — no safe `prepareState`
monoTurn-jump guard). Add new deliberate non-changes there, not here.

---

## 19. Deferred module cleanups — `emigration-causes.js` (from a 2026-06-29 review)

All parked with reasoning; the one item that shipped (`netDrivers()` ±Infinity guard + deterministic
`CAUSE_ORDER` tie-break) is already in the module. The cause string set is **additive-only / never
renamed**, originates as raw returns in `migrationCause()`
([pull.js:47-50](../ui/emigration-pull.js#L47-L50)), and every getter falls back to `other` / `""` — which
is why most of these are YAGNI today.

> **Worked through 2026-06-30 (shipped v1.7.0).** The two-colour-map drift item was resolved by deciding intent (the
> `ACCENTS` toast/log accents and `CAUSE_PALETTE` network-dot fills are *deliberately* distinct — the
> latter is tuned to harmonize with `CIV_PALETTE`) and adding cross-referencing comments in both files
> rather than consolidating. Three cosmetic-only items with no "revisit if" trigger (split `LABELS`,
> "Return" → "Return Migration" copy, comment punctuation/spelling sweep) were closed by decision and
> moved to [wont-fix-with-justifications.md](wont-fix-with-justifications.md). The items below are the
> ones that remain genuinely conditional — each still gated on an unfired trigger.

1. **Frozen `MigrationCauses` / `HeadlineCauses` constants** — define cause keys once as frozen objects,
   reference everywhere instead of hand-typed literals (~14 consumer files). *Revisit if:* several new
   causes are added, or contributors would benefit from compile-time keys. (High churn, marginal protection.)
2. **`normalizeCause()` + `CAUSE_ALIASES` table** — map legacy/persisted keys to canonical on every
   lookup. *Revisit if:* a persisted cause value is ever renamed (then it's *required*, alongside item 3).
   YAGNI today — zero aliases, additive-only set.
3. **`netDrivers()` Map-aggregation by normalized cause** — sum into a `Map` keyed by canonical cause.
   *Revisit if:* item 2 lands. **Implementation caveat:** apply the `>= 0.5` threshold *after* the sum,
   not before (the review's draft dropped two sub-threshold contributions that should sum past it).

*(Item 4 — localization keys `LABEL_KEYS` / `causeLabelKey()` — shipped in v1.9.0 and was removed.)*

---

## 20. Pending in-game verification (manual QA — not runnable off-engine)

The test suite covers the pure logic, but several shipped systems carry an explicit "needs an in-game
visual pass" note (from `SHIP_PLAN.md` and the disaster plan). These are verification TODOs, not code:

- **Tile-by-tile prosperity lens** ([emigration-prosperity-lens.js](../ui/emigration-prosperity-lens.js))
  — confirm the `GameplayMap.getYields` shape/scale and the per-tile paint read correctly in-engine
  (with the per-city fallback path).
- **Game-speed "feel"** across Online…Marathon, and the **disaster Marathon rebalance** — confirm the
  re-tuned pacing actually feels right in play (the math is unit-tested; the *feel* isn't).
- **1.4.1 happiness/economy recalibration** — the polity model (happiness stages / governments /
  celebrations / war weariness) and the rebalanced yield weighting shipped and are unit-tested + bounded
  by the `scripts/` balance harnesses (`calibration-sweep`, `happiness-balance`, `snowball-stress`), but
  the **final balance sign-off still wants in-game observation**. Re-run those harnesses when re-tuning.
  (Full rationale: the implemented `v1.4.1-deep-pass-plan.md` in `mods_research_and_analysis/emigration-docs/`.)
- **UI polish from the ship plan** — Refugees pill/title wording, per-graph definitions, the Net table
  pills + diverging bar alignment, and cross-civ immigrant dots flying from their origin on load/scrub.
- **Player-report round (Unreleased): network display + enclave reachability.** Off-engine tests cover
  the layout floor (`network-anim`), pinned pie shares, enclave stickiness + force relaxation
  (`composition`), and the pending/forming panel readout (`city-panel`). Still needs an in-game pass:
  confirm all settlements render on both network sub-views, that the Scaled/Civ Pop toggle no longer
  moves the flow-pie percentages, that the City Details panel shows the enclave-progress line, and that
  the new **Force enclave** option actually surfaces the decision modal for a qualifying local city
  (and that enclaves now occur in normal play with stickiness on).

- **Feature L (the explainer) — never observed in-engine.** Off-engine tests cover the model (weights
  are shares; permeability/community stay out of them) and the render (rows, bars, notes, one-time
  stylesheet) against a stub DOM, but the *mounting* is exactly what a stub cannot prove. Needs an
  in-game pass: (a) the two groups actually appear under the city readout on selection and don't
  overflow the panel's `max-width:24rem`; (b) they appear under the **Prosperity lens** cursor panel on
  hover, and the panel still positions correctly now that it is taller (`place()` clamps to the
  viewport — check near the screen edges); (c) the `--dg-fs-72` / `rem` sizing reads correctly at
  non-default UI scales; (d) hovering across a large civ's tiles stays smooth (the per-turn memo should
  make the re-rank happen once, not per tile — if it stutters, that memo is not being hit); (e) the
  weight bars render at all in GameFace (percentage `width` on a nested div — the sparkline's
  percentage `height` idiom works, so this is expected to, but it is unproven).

## 20a. Deferred — notification DELIVERY (out of scope for the Unreleased player-report round)

The player also reported "notifications not working yet." Confirmed **not** part of the enclave fix: the
persistent Notifications *log* works (it's what surfaces the all-civ chronicle milestone entries the
player mistook for "the AI getting enclaves"), and the enclave decision uses the `showDilemma` modal,
not the notification feed. What remains deferred:

- **On-screen HUD toasts** are DOM-injected onto the HUD root (`emigration-feedback.js`) because the
  engine exposes no toast API; this is inherently fragile across GameFace updates. Revisit if toasts
  are reported missing after the z-order/first-turn fixes in v2.0.5.
- **Clickable end-turn engine notifications** need a DB `NotificationType` (see the note in
  `emigration-feedback.js` and README §"Engine notifications need a DB type"). Larger effort; deferred
  until there's appetite for the DB-side work.

## 20b. Deferred — the explainer on the network view (Feature L mount (b), 2026-07-17)

Feature L specced three mounts; the readout and the Prosperity-lens hover shipped. The **network /
flow tooltip** did not, for a reason worth keeping rather than retrying blind (§15.1, correction 2):

- **It is a historical surface.** The network view scrubs `frames[]` via `pb.idx`
  ([emigration-network-viz.js](../ui/emigration-network-viz.js)) and its scene holds dots across the
  whole timeline. The explainer decomposes **today's** `collectCitySignals()`. Mounting one on the other
  would attribute the present turn's cause stack to whatever frame the scrubber happens to sit on.
- **The scene carries no city key.** Nodes resolve to `(civ id, city name)` only — no `owner:localId` —
  so `findSignal` has nothing to match. `cityNetSeries` already keys on `"owner|cityName"`, so the pair
  IS a usable key; it just isn't a lookup that exists today.

**Revisit if/when** the network view grows a live mode, or a player asks for "why?" from the flow map.
The shape then: (1) an `explainModelByOwnerName(owner, name)` lookup beside `explainModel`, reusing the
`cityNetSeries` key convention; (2) a gate so the tooltip only offers the stack when
`pb.idx === frames.length - 1` (the live frame), showing nothing rather than something wrong while
scrubbing; (3) a `decorate`-style hook on the tooltip, mirroring the one added to
[emigration-lens-hover-panel.js](../ui/emigration-lens-hover-panel.js) — the network tip is
`setHTML`-based, so it needs the same string-vs-DOM escape hatch.

Do **not** implement it by folding the live stack into the historical tip and hoping the scrubber is
parked at the end.

## 21. More deferred module cleanups (low priority — chronicle-view / cities / city-features)

All parked with reasoning in the now-deleted per-module backlogs; only the genuinely-actionable or
conditional ones are kept here (the rest defended states the producer makes unreachable — don't
re-litigate).

> **Worked through 2026-06-30 (shipped v1.7.0).** The one genuinely-actionable item shipped: the chronicle-view
> narrow-panel UX fix (`.emig-chr-head{flex-wrap:wrap}`) is in
> [emigration-chronicle-view.js](../ui/emigration-chronicle-view.js#L27) — a long title now lets the
> kind label wrap to its own line instead of crowding it. One cosmetic (rebuild the `CSS` string as a
> `.join("")` array) was closed by decision and moved to
> [wont-fix-with-justifications.md](wont-fix-with-justifications.md). Everything else below is genuinely
> blocked on an external trigger that can't be fired off-engine (an unverified Civ VII API, an unstarted
> localization phase, or gameplay that hasn't been observed yet) — each kept with its trigger, none
> safe to "complete" by guessing.

- **chronicle-view** ([emigration-chronicle-view.js](../ui/emigration-chronicle-view.js)): only one
  cosmetic remains — chronicle-specific empty class vs the shared `.emig-empty` (today it deliberately
  carries its own copy so it can render standalone; [view.js:34-35](../ui/emigration-chronicle-view.js#L34-L35)
  already documents why). *Revisit only if a real class collision is observed*; do not rename pre-emptively.
- **cities** ([emigration-cities.js](../ui/emigration-cities.js)): split `siege` from `razing` — today
  `siege: !!city.isBeingRazed` ([cities.js:191](../ui/emigration-cities.js#L191)) conflates the two.
  **Revisit only with a confirmed Civ VII city-siege / under-attack API** (current API is unverified
  speculation — no such read exists in the codebase to wire up, so this cannot be done now).
- **city-features** ([emigration-city-features.js](../ui/emigration-city-features.js)) — the whole file
  reviewed clean (nothing shipped); the only items worth carrying:
  - Verify `getPurchasedPlots()` ([city-features.js:95](../ui/emigration-city-features.js#L95)) covers
    the **city center**. If it excludes it, the Chronicle could miss defining geography — broaden the
    plot source or correct the comment. (Unverified API; **needs an in-game pass to confirm** — can't be
    settled off-engine, don't guess. Shares §20's "needs an in-game visual pass" gate.)
  - Narrative-design tweaks (substring→token matching, `isWater`/`coast` semantics, river-adjacency,
    etc.) are **parked unless the generated prose actually reads wrong in play** — they redefine "has a
    feature," a design decision, not a bug.

**Cross-cutting (collapse when picked up):**
- **Frozen-constants family** — the cause-keys (§19 item 1) and `CITY_FEATURE` keys are the same small,
  stable, additive set hand-typed across a few modules. Same call: centralizing adds computed-key churn
  for marginal safety. *Revisit if* a third consumer appears or a drift bug actually bites.

*(The Phase-1 localization sweep that used to sit here shipped in v1.9.0 and was removed.)*

## 22. Enclave STANCE yields — reconcile with the built improvement, then make them legible

The enclave stance yield can never appear in the game's GPT banner / global yields breakdown (closed
2026-07-16 — see [wont-fix CANTFIX-1](wont-fix-with-justifications.md): runtime modifier-attach has no
API, and runtime `CREATE_ELEMENT` improvement placement is disproven). The player-built enclave
improvement solved the *visibility* goal by another route — its `Constructible_YieldChanges` are
natively attributed — but the **stance** yield is a separate, still-invisible per-turn `grantYield`.

**22a. Reconcile the two reward paths — DONE (2026-07-16).** Resolved as *"both, deliberately: the
improvement REPLACES the grant — and pays strictly more, framed as an optional government investment in
the enclave community."* The two-tier reward now reads:

| | What it is | Cost | Pays |
|---|---|---|---|
| **Recognize** (modal stance) | acknowledging the enclave | free | `+2` benefit / `−1` drawback per turn |
| **Invest** (build the improvement) | the treasury endowing the community's workshops, schools and halls | 40 production + a tile + a population point | `+4`, no drawback — the stance grant steps aside |

The grant is the "recognized but unbuilt" reward; building is a deliberate, optional upgrade that is
clearly worth its cost. They never stack. Shipped as:
- New [emigration-enclave-built.js](../ui/emigration-enclave-built.js) — the built-enclave read-back:
  `enclaveTypeForCiv(originCiv)` (the pure inverse of the generator's `typeOf`), `builtEnclaveIndex(owner)`
  (city-centre plot key → the set of enclave types built in that city, read **once per turn**, not per
  quarter), and `enclaveIsBuiltFor()`. Reuses the same read the on-map markers already prove in-game
  (`MapConstructibles.getConstructibles`).
- `applyOwnerQuarterYields()` ([emigration-quarter.js](../ui/emigration-quarter.js)) now skips any quarter
  whose origin has its enclave built in that city. An unreadable map degrades to the prior grant-always
  behaviour — never a throw into the pass.
- Note the join: a quarter record's `tileKey` is its **city-centre** plot, while the improvement sits on
  any city tile — so the coupling is per-**city-and-origin**, not per-tile (the section's original
  "drop the grant for a tile that has the improvement" wording could not work as written).
- `BENEFIT_AMOUNT` 2 → **4** in [gen-enclave-improvements.mjs](../scripts/gen-enclave-improvements.mjs),
  with the improvement's description/tooltip reframed as a public investment ("Endow their workshops,
  schools and halls at public expense… Recognizing the enclave costs nothing and already pays a smaller
  dividend — this is what your treasury can make of it instead"). Regenerated across all 45 civs.
  **Why raise it:** at the old `+2` flat, building converted `+2/−1` into `+2/+0` — a net **+1/turn** for
  40 production, a tile, and a population point. That is a bad trade, so the §22a fix alone left building
  under-motivated. `+4` makes investing plainly worth choosing.
- Tests: new `tests/enclave-built.mjs` (type mapping, index keying, the supersede test, degradation) plus
  a §22a block in `tests/quarter.mjs` asserting the grant steps aside for the built origin **only**.
  Wired into `test:js` + `verify`; `npm run verify` exits 0.

> **The `+4` is UNMEASURED — it wants the in-game pass (§20).** The balance harnesses cannot check it:
> `scripts/snowball-stress.mjs`, `calibration-sweep`, and `emigration-prosperity.js` model the migration
> sim over fake worlds and **never read `Constructible_YieldChanges`**, so no off-engine harness sees a
> tile improvement's yield at all. `verify` green only proves the sim is untouched (engine snapshots
> byte-identical). Watch in play: `+4` on one tile is double a standard improvement, and in-game it feeds
> city yields → prosperity → *more* immigration, which is a feedback path the harnesses also can't see.
> Also unlocalized: `text/en_us/EnclaveText.xml` is en_us-only (no locale-parity gate covers it), so every
> language shows this English text — a pre-existing gap, now with more prose behind it.

> **Two wrinkles found while implementing 22a — still open, for whoever picks up 22b.**
> 1. **The improvement always pays option 'a', whatever stance was chosen.**
>    [gen-enclave-improvements.mjs](../scripts/gen-enclave-improvements.mjs) hard-codes
>    `entry.options[0].benefit`, so a player who picks stance 'b' and builds gets a yield the stance never
>    offered (e.g. Greece 'b' is +Culture/−Production, but the tile pays +Science). Latent under the 22a
>    resolution — the grant steps aside, so the tile's option-'a' yield is simply what lands.
> 2. **The improvement carries no drawback.** Every registry option is a benefit *paired with* a matching
>    penalty (see the `emigration-quarter-bonuses.js` header), but the native row is pure upside — so
>    building the enclave currently drops the trade-off. Fixing either properly means regenerating the XML
>    as one improvement per option (~92 rows) with a penalty row each, plus per-option build gating and
>    localization.

**22b. Make the surviving stance yield legible — DONE (2026-07-16).**

**This section was stale: the core ask was already shipped, in the City Details panel, not the readout.**
`gatherQuarter()` ([emigration-city-panel.js](../ui/emigration-city-panel.js)) already read the tile
record's `applied` block and `quarterLines()`
([emigration-city-panel-data.js](../ui/emigration-city-panel-data.js)) already rendered "A Roman Enclave
has taken root…" / "Your stance: …" / "Grants 2 Culture to the city each turn." / "Costs 1 Happiness each
turn." That *is* the honest substitute for the banner line the engine won't draw. Nothing was added to the
readout; §22b reduced to making those existing lines tier-aware.

**Which mattered, because §22a broke them.** Reading `applied` unconditionally meant that once the enclave
was built and the grant stepped aside, the panel still claimed "Grants 2 Culture to the city each turn" —
stating a yield the player was no longer paid. Shipped fix:
- New `stanceYieldLines()` splits the two tiers. **Recognized** (unbuilt) → the existing grants/costs
  lines, the only place that invisible dividend is readable. **Invested** (built) → a new line, and the
  grants/costs lines are suppressed.
- `gatherQuarter()` resolves `invested` via the new `enclaveBuiltInCity(city, originCiv)`
  ([emigration-enclave-built.js](../ui/emigration-enclave-built.js)) — the single-city form, since the
  panel renders one city and shouldn't scan the empire.
- **Deliberately does not restate the built enclave's number.** That constant lives in the XML; the
  improvement's yield is natively attributed, so the game shows it. Restating it in JS would be a drift
  hazard for no gain.
- Legacy-record hole closed in the same pass: a record written before `originCiv` was persisted carries
  none, so it would never have been superseded (a silent surviving double-pay). Both the grant path and
  the panel now fall back to `civType(rec.civ)`.
- New `LOC_EMIGRATION_PANEL_QUARTER_INVESTED` in en_us + all 11 locales (parity green at 948 keys).
- Tests: three cases in `tests/city-panel.mjs` (recognized states the dividend; invested never restates
  it; a contested built enclave still reports its strain). Verified they fail without the fix.

**Still open from this section:** confirm in-game that the positive `grantYield` reward actually lands —
only the negative/deduct path was ever probe-confirmed. Untouched by this work, and it is exactly what the
"recognized" tier depends on: if the positive grant does not land, the unbuilt tier pays nothing and the
panel's grants line is a second, deeper lie. **Verify this before trusting the two-tier design.**

## Notes / context

- `devtools/migration-probe.js` is a separate diagnostic tool (own `migration-probe.modinfo`); its exports serve
  that probe and are not mod dead code. Its API7 enclave-placement test was superseded by the in-mod
  Self-Test button ([ui/emigration-enclave-probe.js](../ui/emigration-enclave-probe.js)); result: runtime
  placement FAILED and is now a closed can't-do (CANTFIX-1). The enclave ships as a **player-built**
  improvement instead; the probe is kept as the evidence for that decision.
- No orphaned *files* exist — every `ui/*.js` is listed in `emigration.modinfo` and runs.
- The mod's larger gameplay roadmap (Features A–K + deepened refugee stance + L–Z, plus the carried-over
  AA/AB/AC in §17) is the feature roadmap in §0–§17; those are net-new features, out of scope for the
  correctness/perf/maintainability review this backlog descends from.

---

## 23. Corpus bug-hunt findings (2026-07-10)

All the confirmed/plausible correctness findings from the tower_mods-wide bug-hunt audit have **shipped**
and are verified in the tree, so they were removed from this backlog: **F1** (age-boundary marker rebase
so the core pass and war/disaster decay clocks survive the `Game.turn` reset — violence/disasters/effects/
combat/feedback/main), **F2** (prosperity double-negative sign-flip that ranked a devastated city as a
magnet), **R1/R2** (`return.js` pool-return population leak + host-signal miscount), **F3** (disaster
accumulation cap on `addDistress`), **F4** (city-flows direction flag instead of an English substring test),
**F5** (`Math.abs(neutral)` stance-impact percent), **F6** (`byId.get` nullish handling in `breakdownTip`),
**F7** (`Array.isArray` guard around the city-signal loop), **F8** (`normalizeViolence` numeric-map
sanitize on load), **L1** (localized lens tooltips), and **L2** (lazy `dilemma.js` `choices()`). See the
[CHANGELOG](../CHANGELOG.md) for the release notes.

**Still open:** none — the last item (below) shipped 2026-07-17.

- **Migration-stats reader staleness — SHIPPED (2026-07-17).**
  [emigration-migration-stats.js](../ui/emigration-migration-stats.js) `load()` cached `_s` for the module
  lifetime and, unlike `composition.js`, never re-read on turn change, so the City Details
  Departing/Arriving lists could show a frozen snapshot while the co-located Population-origins block
  stayed fresh. `load()` now re-reads once per turn (`_loadedTurn`, mirroring `composition.js`), reusing
  the cache within a turn so a pass never churns. Two wrinkles the composition fix didn't have:
  the per-sample **watermarks** (`lastSampled`/`wm*`) are advanced in memory by the samplers and never
  saved, so they are carried across a reload (`carryWatermarks`) — otherwise each turn would rewind them
  to the recorder's persisted values and the graphs would replay flow they had already charted; and an
  unreadable store on a turn tick keeps the in-memory state rather than wiping live tallies. Covered by
  `tests/migration-stats-reload.mjs` (wired into `verify` + `test:js`).

## 24. Residual — native-speaker review of the notification-clarity translations (2026-07-14)

The notification-clarity wording rewrite (2026-07-14) and its 11-locale translation refresh **shipped**
(en_us + JS fallbacks reworded; `LOC_EMIG_HINT_ATTRITION`/`_DISASTER`/`_PROSPERITY`, new
`LOC_EMIG_DIGEST_DISASTER_TO`; both `i18n.mjs` and `metrics-loc-placeholders --check` green). What remains
open is **non-blocking native-speaker review only:** the 11 locale strings are best-effort translations
worth a pass for register/terminology consistency. One known nit: the prosperity hint's `{1_City}` swap
left the surrounding possessive (e.g. German "ihre Erträge") agreeing with the old common-noun "this city"
rather than a proper noun — a translator should confirm gender/case agreement per language.

## 25. Rollout-flag retirement — delete never-run legacy branches (proposed 2026-07-02)

**Status:** Proposed, not started — verified 2026-07-14 that every flag/key below is still live in the
tree, so the premises hold. **Scope:** the `emigration` mod only. A follow-up to a complexity audit
asking "is there code/game-logic we don't genuinely need, or that overcomplicates the mod?" This is a
pure refactor with **zero player-visible behavior change** — every targeted flag already sits at its
shipped default, so the engine output over a fixed fake world must stay byte-identical.

### 25.1 Executive summary

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

### 25.2 Goals / non-goals

#### Goals
- Remove legacy code paths that never execute under shipped defaults.
- Shrink the "can be off" surface (fewer branches → smaller test + mutation matrix, less to reason about).
- Delete three config keys documented as inert.
- Preserve every player-visible behavior exactly (this is a refactor, not a balance change).

#### Non-goals (explicitly out of scope)
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

### 25.3 Classification methodology

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
| **Internal but a genuine safety backstop** | `resetCachesOnGameBoot` | **KEEP** (see §25.7) |
| **Sub-flags of an exposed system** | `refugeePoolBurdenEnabled`, `plagueCarryEnabled`, `split* (UI subset)` | KEEP with parent |

Plus three **inert config keys** (not flags): `scaleBase`, `scaleExp`, `scaleGrowth` → **REMOVE** (WS3).

### 25.4 Inventory & touchpoints

Line numbers are indicative (verify against HEAD before editing).

#### WS1 — heavy legacy branches (high value)

| Flag | False-path = dead code | Primary touchpoints | Test touchpoints |
|---|---|---|---|
| `splitTracksEnabled` | `processSourceLegacy` + `legacyEmigrate` / `belowEmigrationBar` / `restingOnCooldown` — a full alternate ~150-line source pass | `emigration-engine.js` (gate ~L573; legacy fn ~L416+), `emigration-config{,-types}.js` | `engine-legacy-snapshots.mjs` (item 1 only — see §25.5), `engine-rigor.mjs`, `engine-pass.mjs`, `city-readout-panel.mjs` |
| `splitBudgetsEnabled` | shared single-budget branch | `emigration-engine.js` (~L890–L900), `emigration-config{,-types}.js` | `engine-rigor.mjs`, `engine-pass.mjs` |
| `splitUiReadoutEnabled` | second "one dominant cause" readout renderer | `emigration-city-readout.js`, `emigration-city-readout-data.js`, `emigration-config{,-types}.js` | (none direct) |

#### WS2 — cheap fail-safe guards (low value, optional)

Each off-path is a one-liner neutral fallback (`return 0/1/identity` or an early guard). Removing them
buys little code but shrinks the branch/test matrix. Weigh case-by-case; some are arguably *defensible
defensive coding* (graceful degradation). See §25.6 for the judgment call.

| Flag | Off-path | Touchpoint | Tests |
|---|---|---|---|
| `gameSpeedTuningEnabled` | `speedScale()` returns identity 1 | `emigration-game-speed.js:74` | `game-speed*.mjs`, `disasters.mjs`, `engine-rigor*.mjs` |
| `polityModelEnabled` | polity bonus returns 0; war-weary term skipped | `emigration-prosperity.js:96,189` | `prosperity.mjs` |
| `deathRampEnabled` | ramp multiplier returns 1 | `emigration-engine.js:623` | `engine-rigor*.mjs` |
| `conquestMigrationEnabled` | early `return` in capture handler | `emigration-main.js:176` | (none direct) |
| `crisisDeathEnabled` | crisis-while-fleeing death suppressed | `emigration-engine.js:636,648` | `engine-rigor*.mjs`, `engine-pass.mjs` |
| `voluntaryCueEnabled` | rising-pressure cue suppressed | `emigration-engine.js:88` | (none direct) |

#### WS3 — inert config keys

| Key | Evidence of inertness | Touchpoints |
|---|---|---|
| `scaleBase`, `scaleExp`, `scaleGrowth` | `emigration-config.js:497` header: *"DEPRECATED, no longer read … retained only so saved configs / config-types stay valid; they are inert."* The `game-speed.js:136` and `tunables.js:13` hits are **comments only** (tunables.js:13 literally says they are "intentionally absent" as knobs). | `emigration-config.js` (CONFIG + CONFIG_DEFAULTS), `emigration-config-types.js` (typedef) |

> Note: `gameSpeedScalePopulation` (config.js:58, live at `game-speed.js:144`) *mentions* the
> `scaleGrowth` concept in its comment but does **not** read the key. It is a separate, live flag —
> leave it alone.

### 25.5 Workstreams & sequencing

Do these **one flag at a time**, suite green between each. Order = value-first, and heavy items before
the cheap ones so early PRs carry the payoff.

#### WS1.1 — `splitTracksEnabled` (biggest single win)
1. In `emigration-engine.js`: inline `processSourceSplit` into `processSource` (drop the `if
   (CONFIG.splitTracksEnabled)` fork), delete `processSourceLegacy`, `legacyEmigrate`,
   `belowEmigrationBar`, `restingOnCooldown` and any helper now unreferenced.
2. In `engine-legacy-snapshots.mjs`: **delete only item (1)** (the legacy-pass coverage). **Keep items
   (2) the stance counterfactual and (3) the citySnapshot readers** — they share the fake world and are
   unrelated to the flag. Rename the file if "legacy" no longer describes it.
3. Remove `splitTracksEnabled` from `CONFIG`, `CONFIG_DEFAULTS`, and the `EmigrationConfig` typedef.
4. Update `README.md` §2 ("Two concurrent tracks") to drop the "flags exist so the split is reversible"
   note; the split is now unconditional.

#### WS1.2 — `splitBudgetsEnabled`
1. In `emigration-engine.js` (~L890–L900): keep the split-budgets branch, delete the shared-pool
   branch and the `budgets.shared` plumbing it feeds.
2. Remove flag from config + typedef; prune `engine-rigor.mjs` / `engine-pass.mjs` cases that set it false.

#### WS1.3 — `splitUiReadoutEnabled`
1. In `emigration-city-readout{,-data}.js`: keep the per-cause breakdown, delete the single-dominant-cause
   renderer branch.
2. Remove flag from config + typedef.

#### WS2 (optional) — cheap guards
For each of the six: keep the active path, delete the `false` early-return/identity branch, remove the
flag from config + typedef, and prune any test case that sets it false. Land each as its own small commit.
**See §25.6 before doing these** — they may be worth keeping as fail-safes.

#### WS3 — dead scale keys
1. Delete `scaleBase`, `scaleExp`, `scaleGrowth` from `CONFIG` and `CONFIG_DEFAULTS`
   (`emigration-config.js:501-503`).
2. Delete their `@property` lines from the `EmigrationConfig` typedef in `emigration-config-types.js`.
3. **Confirm saved-config compatibility first** (see §25.7): the settings loader must tolerate an old saved
   config that *contains* these keys. If it rejects unknown keys, either (a) keep the keys, or (b) add a
   drop-unknown-keys shim before removing.

### 25.6 The judgment call on WS2 (be honest about this)

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

### 25.7 Explicitly retained (with justification)

- **`resetCachesOnGameBoot` — KEEP.** Although internal-only, this is **not** a rollout hatch for a
  behavior change. It is a *latent-robustness safety backstop* for the UIScript-isolate reuse bug
  (a new game starting inside a still-live isolate persisting the prior game's cached state — the same
  class of isolate hazard behind the earlier ethnicity-lens bug). Its `false` path ("rely on isolate
  teardown") is a legitimate fallback, and the whole `emigration-cache-reset.js` convention is a
  deliberate defensive layer. Removing the flag would delete a safety net, not dead weight. Leave it.
- **All player-exposed flags (§25.2 non-goals).** Off-paths are reachable features.
- **`disasterImpactScalingEnabled` / `disasterSpeedShockEnabled`.** Player-exposed (appear in the
  options/tunables scan) and each "fail-safes to the legacy numbers" — that legacy path is reachable, keep.

### 25.8 Verification protocol (per step)

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

Log any deliberate non-change or deferred item to [wont-fix-with-justifications.md](wont-fix-with-justifications.md)
(verdict + reasoning) or this document's conditional backlog sections (§18–§24, deferred/conditional), per
repo convention.

### 25.9 Risks & rollback

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
- **Shared test fixtures:** `engine-legacy-snapshots.mjs` covers three unrelated things (§25.5 WS1.1) — do
  not delete the file, only its legacy-pass section.

### 25.10 Estimated payoff

| Item | Code removed (approx.) | Confidence |
|---|---|---|
| `splitTracksEnabled` | ~150 LOC duplicate engine pass + legacy tests | High |
| `splitBudgetsEnabled` | shared-budget branch + plumbing | High |
| `splitUiReadoutEnabled` | second readout renderer | Medium |
| `scaleBase/Exp/Growth` | 3 keys + 3 typedef props | High |
| WS2 (if taken, all six) | ~6 one-line branches + a few test cases | Low value |

Net: a whole second migration-engine path deleted, three dead keys gone, and a materially smaller
"this can be off" surface — **with no player-visible change.**

### 25.11 Checklist

- [ ] WS1.1 `splitTracksEnabled` — inline split path, delete `processSourceLegacy` et al., trim legacy test section, drop key+typedef, update README §2
- [ ] WS1.2 `splitBudgetsEnabled` — delete shared-pool branch + `budgets.shared`, drop key+typedef
- [ ] WS1.3 `splitUiReadoutEnabled` — delete dominant-cause renderer, drop key+typedef
- [ ] WS3 — confirm loader tolerates unknown keys → delete `scaleBase/Exp/Growth` from CONFIG/DEFAULTS/typedef
- [ ] WS2 (optional, per §25.6) — retire selected cheap guards individually
- [ ] Verification protocol (§25.8) green after **each** step; behavior snapshots unchanged
- [ ] `resetCachesOnGameBoot` left intact (§25.7)
- [ ] Non-changes logged to wont-fix / this backlog per convention

## 26. `emigration-arrivals.js` hardening backlog (deferred — 2026-07-02 review)

Deferred-but-valid ideas from the 2026-07-02 arrivals review. **Tier 1** (defensive per-arrival guard,
`forced`→`expired` rename + comment fixes, empty-`ranked` logging, pooled-refugee cap documentation)
shipped. The items below were assessed as real but **not worth doing right now** — each is either purely
cosmetic, or behavior-changing in a way that would churn the deterministic golden baselines gated in CI
(`engine-legacy-snapshots`, `engine-rigor`, `snapshot-reminder`). Revisit any of these the next time those
snapshots are being re-baselined anyway.

These are *deferred / conditional* (each has a "revisit when…" trigger), which is why they live here and
not in [wont-fix-with-justifications.md](wont-fix-with-justifications.md). A hard rejection (with no
revisit trigger) belongs there instead — e.g. the "softer death→pool for capped arrivals" item, which was
rejected outright.

### 26.1 Tier 2 — correct, but changes deterministic outcomes (needs a snapshot re-baseline)

#### `roll01` should divide by `0x100000000`, not `0xffffffff`

`roll01` returns `(h >>> 0) / 0xffffffff`, so the maximum hash yields exactly `1.0` — the docstring
claims `[0,1)` but the range is `[0,1]`.

- **Why it's low priority:** the exact-`1.0` case is 1-in-4-billion per seed, and even then it produces
  a *valid* outcome (`roll01(seed) < pct` is `false` → the refugee enters the holding pool), so no bug
  ever manifests. It's a purity fix, not a behavior bug.
- **Cost:** dividing by `0x100000000` shifts *every* roll value slightly, flipping a handful of
  `immediateSettle` decisions across a game → changes settle/pool outcomes → breaks the golden
  determinism snapshots until regenerated.
- **Revisit when:** we're regenerating `engine-legacy-snapshots` for another reason; fold it in then and
  re-baseline in the same pass.

#### Explicit tie-breakers in the due-arrival sort

The sort is `defers`-desc only: `(b.defers || 0) - (a.defers || 0)`. Ties currently resolve by
transit-queue order.

- **Why it's low priority:** V8's `Array.sort` is stable (Node 11+), and the transit array is itself
  deterministic, so equal-`defers` ties are *already* deterministic. A proposed comparator
  (`defers`, then earlier `arriveTurn`, then `destKey`, then `srcName`) is "more literally fair" but not
  more *deterministic*.
- **Cost:** it changes the tie order → changes which arrivals land first under a tight inbound cap →
  snapshot churn, for a fairness refinement no player would observe.
- **Revisit when:** we ever move off a stable-sort engine, or we're re-baselining snapshots anyway.

### 26.2 Tier 3 — design decisions, not fixes

#### Seed `immediateSettle` from event identity instead of processing turn

The seed includes `now` and `defers`, so a deferred refugee re-rolls its settle-vs-pool decision each
attempt. The review suggests seeding from a stable event identity (e.g. `departTurn`) so cap timing
can't change destiny.

- **Blocker:** `Transit` has **no `departTurn`** (see the typedef in `emigration-state.js`). Adding one
  is a persisted-schema change touching `normalizeTransitEntry`/`normalizeTransitList` and the save
  format.
- **Assessment:** the current behavior is *already deterministic* (the review concedes this); "re-roll
  per attempt" is a defensible "each turn is a fresh attempt" model, not a bug.
- **If we ever do want wave-stable identity:** seed from existing stable fields
  (`eventKey` + `destKey` + `srcOwner` + the creation-time `arriveTurn`) rather than adding a field —
  and expect a snapshot re-baseline.

#### `MAX_DEFERS` → `CONFIG`

Make the retry-window length a tunable (`CONFIG.maxArrivalDefers`, defaulting to 4) instead of a module
constant.

- **Assessment:** consistent with the mod's tunables system, but it's an internal balance constant few
  players would touch. Cheap if added as a plain non-UI `CONFIG` override; scope-creep if exposed in the
  Advanced editor (needs config-types + i18n + the tunables UI).
- **Revisit when:** playtesting shows the perish window actually needs tuning.

#### Split / rename `resolveArrival`

The name reads as pure but it mutates (`addRural`, `destSig.rural/population`, `queueRefugees`,
`bumpArrivedIntoCrisis`, `applyArrivalConsequences`). Suggested: rename to `applyResolvedArrival`, or
split into `classifyArrival` (pure) + `landArrival` (imperative).

- **Assessment:** the docstring already enumerates the side effects, which blunts the "name hides
  mutation" concern. A split improves testability but adds indirection; only worth it if the function
  approaches the eslint `complexity`/`max-statements` caps (it currently doesn't).
- **Revisit when:** `resolveArrival` grows a new branch that pushes it near the lint caps.

## 27. Migration-system enhancement backlog (measure-first; from the scenarios critique)

A prioritized plan for enhancing the migration simulation, derived from a design critique of the system
diagrams ([migration-scenarios-diagrams.md](migration-scenarios-diagrams.md)). It is a proposal for
review, not a committed work order — each item states the problem, the change, the files/config it
touches, the risk, and how it would be tested. **Operating rule (measure-first):** the P0 telemetry
(below) shipped; read those counters over a few playthroughs via `emigration.metrics()` before building
any item here — several may be retired if their counter stays near zero.

**Guiding principles (from the critique).**
- **Do not simplify the core model.** The voluntary/crisis split, transit queue, holding pool, attrition
  ramp, return, composition/integration, and narrative layers are the strength. Enhance around them.
- **Legibility before more mechanics.** The biggest risk is *invisible sophistication* — outcomes that are
  correct but feel arbitrary. Explaining *why* a movement or death happened beats adding new systems.
- **Never expose gamey internals in player text.** "anti-snowball penalty" → "crowded destination".
- **Fairness at the edges.** Deaths and reroutes should read as earned, not as hidden punishment.

**Already handled (so we don't re-propose it).**
- Depopulation guardrails: `maxLossPerCityPerTurn(2)`, `minRuralToEmigrate(1)`, `warSurgeMax(3)`,
  `siegeLossCapPct(0.6)`; smoothed death onset (`deathRamp`); return conservatism (`returnCooldownTurns`);
  composition stability across conquest; and the base city readout already names dominant cause, pull
  target, integration cost, origins, net trend (sparkline), and a "trapped with nowhere to flee" warning.
- **Priority 0 — the legibility layer — shipped.** P0.1 per-movement reason tags
  (`emigration-move-reasons.js` + `deriveMoveReasons`), P0.2 attrition "why" (`deriveDeathReasons`), P0.3
  voluntary-pressure cue (`takePressureCues`/`reportPressureCues`, `voluntaryCueEnabled/Fraction/CooldownTurns`),
  and P0.4 telemetry counters (`recordPassCounters`/`telemetryCounters`, `emigration.metrics()`) are all
  live (see the CHANGELOG). Everything below is the still-open remainder: per-move fairness/exploit fixes
  and depth.

### 27.1 Priority 1 — Fairness & exploit fixes

#### P1.1 Reroute-before-death on transit deferral
- **Problem.** "Perished waiting" after `MAX_DEFERS(4)` at a merely *temporarily* full destination feels
  arbitrary (A6, transit queue).
- **Change.** Before charging the death, attempt **one reroute** to the next-best viable host (reuse
  `bestDestination` with the failed destination excluded). Only if none exists does the point die. New
  flow: `arrival due → dest full → defer up to MAX_DEFERS → reroute once → else death`.
- **Files.** [../ui/emigration-arrivals.js](../ui/emigration-arrivals.js), `emigration-pull.js`
  (excluded-candidate variant), `emigration-inbound.js` (capacity check).
- **Config.** `rerouteOnDeferFail: true`.
- **Risk.** Medium — must not create infinite reroute churn (cap at one attempt; the rerouted point
  re-enters transit with a fresh, bounded lag).
- **Test.** A capped destination + one open alternative → point reroutes and survives; no alternative →
  death (unchanged). The reserved reroute-success telemetry counter measures how often this fires.

#### P1.2 Arrival safety revalidation (edge case E1)
- **Problem.** A destination safe at departure can become besieged/violent before arrival; today only
  razed/captured is caught. **The detection half already shipped** — `arrivals.js` bumps the
  `arrived-into-crisis` telemetry counter — but the arrival still *settles* into the crisis.
- **Change.** On arrival, revalidate destination safety (violence/siege below the flee thresholds). If
  unsafe: reroute (P1.1) or hold in the pool with elevated risk instead of settling into a new crisis.
- **Files.** `emigration-arrivals.js`, `emigration-refugee-staging.js`.
- **Risk.** Medium. Pairs naturally with P1.1. **Test.** A destination that turns violent mid-transit →
  arrival reroutes/holds rather than settling. (The shipped `arrived-into-crisis` counter tells you how
  often this case actually occurs — check it before building.)

#### P1.3 Closed-borders backlash (edge case E3 / exploit #7)
- **Problem.** Closed Borders both cut immigration (`closedBordersOpenness 0.4`) and retain would-be
  emigrants (`closedBordersRetention 0.6`) with only modest cost — a potentially dominant "stop
  population loss" strategy, and retained people simply vanish from the flow with no moral cost.
- **Change.** Retained emigrants don't disappear: a fraction of the *suppressed* cross-civ outflow is
  folded back into the source's voluntary pressure (and, in lethal distress, into attrition risk), so
  trapping people in bad conditions has consequences. Closed Borders stays useful but becomes
  morally/mechanically dangerous.
- **Files.** [../ui/emigration-borders.js](../ui/emigration-borders.js) (expose the retained amount),
  `emigration-engine.js` (fold into pressure/distress), `emigration-effects.js` (attrition coupling).
- **Config.** `closedBorderBacklash(weight)`, `closedBorderBacklashAttrition(weight)`.
- **Risk.** Medium–high — a feedback loop; must be capped and telemetered. Ship behind a flag, default
  conservative.
- **Test.** With borders closed under high distress, source pressure/attrition rises vs. the open
  baseline; capped so it can't spiral.

### 27.2 Priority 2 — Plausibility & depth

#### P2.1 Weak-refuge fallback band (softens the "no viable refuge" cliff)
- **Problem.** Attrition is binary: a destination just below the pull threshold → deaths; just above →
  clean relocation. Real desperate flight goes *somewhere bad* because staying is worse.
- **Change.** Add a middle tier to destination selection: `strong` (normal), `weak` (emergency,
  low-efficiency: forced extra transit lag, higher integration load, possibly partial settlement),
  `none` (attrition). Attrition fires only when even a weak refuge is absent.
- **Files.** `emigration-pull.js` (return a tier, not just best/none), `emigration-engine.js` (attrition
  gate consults the tier), `emigration-consequences.js` (weak-arrival penalties).
- **Config.** `weakRefugePullFloor`, `weakRefugeeLagBonus`, `weakRefugeeLoadMult`.
- **Risk.** High — changes attrition frequency; must be tuned with P0.4 telemetry.
- **Test.** A below-threshold-but-existent destination yields a weak relocation instead of a death.

#### P2.2 Crisis-escape phasing by tenure (refugee wave realism)
- **Problem.** `crisisEscapeBonus(+14)` and `ownCivRefugeeBonus(1)` are flat, so war refugees may
  internationalize immediately instead of first filling safer own-civ interior.
- **Change.** Scale with `crisisTenure` (already tracked): turns 1–2 strongly prefer own-civ interior;
  cross-border escape pressure rises as the crisis persists. Produces the believable arc interior →
  allied/open neighbors → broad displacement.
- **Files.** `emigration-pull.js` (`crossCivBlock`/`geoAdjust` read tenure), `emigration-engine.js` (pass
  tenure into pull).
- **Config.** `ownCivRefugeeBonusEarly`, `crisisEscapeRampTurns`.
- **Risk.** Medium. **Test.** Same crisis at tenure 1 routes own-civ; at tenure 6 allows cross-border.
  (Infra note: `crisisTenure` is already tracked in the engine, so only the tenure-scaled knobs are new.)

#### P2.3 Dividend gated on integration (avoid win-more)
- **Problem.** The attraction dividend (A11) rewards raw arrival; combined with prosperity pull it can
  compound (arrive → yields → prosperity → more arrivals). Integration cost partly counters it.
- **Change.** Make arrival a *strain* first (integration load, already immediate) and release the
  dividend only as migrants *integrate* — a satisfying "strain then benefit" arc, and self-limiting.
- **Files.** [../ui/emigration-dividend.js](../ui/emigration-dividend.js), coupled to integration
  progress in `emigration-composition.js`.
- **Config.** `dividendOnIntegration: true`.
- **Risk.** Medium. **Test.** No dividend on the arrival turn; dividend accrues as the origin bucket
  integrates.

#### P2.5 City-states as viable refuges (edge case E5)
- **Problem.** A flat `cityStateBarrier(5)` may make city-states underused as refuges, though they're
  historically plausible sanctuaries.
- **Change.** Reduce the barrier for peaceful/open/high-prosperity city-states so they can be attractive
  refuges (still gated by `includeCityStates`).
- **Files.** `emigration-pull.js`.
- **Config.** `cityStateRefugeRelief`.
- **Risk.** Low–medium. **Test.** A safe, open city-state becomes a valid refuge target under crisis.

#### P2.6 Circular-migration damping (edge case E2)
- **Problem.** A→B for prosperity, then return/gradient sends people back — churn, only partly damped by
  cooldowns.
- **Change.** Short per-(origin,destination) migration memory that mildly damps immediate reverse flows
  within a window.
- **Files.** `emigration-state.js` (bounded memory), `emigration-pull.js` (apply damping).
- **Config.** `reverseFlowDampTurns`, `reverseFlowDampWeight`.
- **Risk.** Medium (state growth — must be bounded). **Test.** Immediate reverse flow is reduced vs. no
  memory; expires after the window.

> **Folded / relocated P2 items (do not re-spec here):**
> - **P2.4 (cumulative diaspora chronicle)** — its gap ("a steady multi-turn trickle that reshapes a city
>   goes unremarked") is largely closed by the shipped staged diaspora arc (`none → foothold → established`
>   with the "A {Civ} Foothold in {City}" chronicle) plus the dwell-gated enclave. The remaining
>   cumulative-*mass* trigger is exactly **Feature I (§9)**'s `migrantMass` gate — build it there, not as a
>   separate item.
> - **P2.7 (majority-immigrant petition / secession)** — moved to its detailed home,
>   [indefinitely-paused-features.md](indefinitely-paused-features.md) → *Petition / secession /
>   uprising*, which owns the framing guardrail, native-revolt scoping, probe plan, and the full state
>   machine / exact gates / recipient resolution / wiring. **Paused indefinitely** — triaged
>   recommend-against 2026-07-16; do not queue it without clearing the blockers named there. The
>   `contested`-enclave half already ships ([cultural-enclaves.md](cultural-enclaves.md) §6.1).

### 27.3 Priority 3 — Optional deeper simulation (defer)

> **P3.1 (bidirectional integration / large-diaspora imprint)** — "at 35%+ share the host gains a minor
> persistent cultural imprint / integration floor" is the **"blended / host-imprint quarter"** already
> specified for the shipped Cultural Enclave system (Feature F / Feature I §9) and detailed in
> [indefinitely-paused-features.md](indefinitely-paused-features.md) → *Blended / host-imprint enclave*.
> Track it there, not as a separate P3 item; it is **paused** pending the reward-model decision (§22a).
> Config sketch if ever pulled out standalone: `diasporaImprintShare(0.35)`,
> `integrationFloorForLargeDiaspora`. High risk (touches the composition core) — defer until 27.1–27.2 land
> and are tuned.

### 27.4 Balance knobs, non-goals & sequencing

**Balance knobs to watch in testing (with the shipped P0.4 telemetry).**

| Knob(s) | Governs | Failure mode to watch |
|---|---|---|
| `emigrationBar(30)`, `cooldownTurns(8)` | voluntary visibility | voluntary migration feels invisible |
| `warSurgeMax(3)`, `siegeLossCapPct(0.6)` | war displacement pace | too gentle (no drama) or too fast (depopulation) |
| `crisisEscapeBonus(14)` vs `aggressorPenalty(12)` | refugee internationalization | flee abroad too easily / not enough |
| `closedBordersOpenness(0.4)`, `closedBordersRetention(0.6)` | border policy | exploitable "seal the borders" strategy |
| `assimilationDecay(0.7)`, `assimilationGold(1.5)`, `assimilationHappiness(0.5)` | receiving-side cost | immigration is free money |
| `deathRampFloor(0.25)`, `deathRampTurns(6)`, `attritionMinDistress(40)` | death feel | sudden/arbitrary vs. tragic/earned |

**Non-goals.**
- No simplification of the voluntary/crisis/transit/pool/attrition/return/composition spine.
- No player-facing exposure of internal term names (keep "crowded destination", not "anti-snowball").
- No unbounded state (all new memories/pools bounded, mirroring existing caps).

**Suggested sequencing.**
1. **P0** (reason tags, attrition why, voluntary cue, telemetry) — **shipped.**
2. **P1** (reroute-before-death, arrival revalidation, closed-border backlash) — fairness + the one real
   exploit. Start here.
3. **P2** (weak-refuge band, crisis-escape phasing, dividend-on-integration, city-state refuges, circular
   damping) — plausibility/depth, tuned against the P0.4 telemetry.
4. **P3** (bidirectional integration, via the quarter plan) — optional, only after the rest is stable.

Each item is independently shippable behind its own config flag, so tiers can land incrementally and be
A/B compared against the recorded telemetry.

## 28. Quality-analysis open items (from `emigration-quality-analysis`, refreshed 2026-07-06)

Source: [`mods_quality_analyses/emigration-quality-analysis`](../../../mods_quality_analyses/emigration-quality-analysis)
(`issues-worklist.md` + `code-quality-violations-report.md`). **Every gate is green** — `tsc --noEmit` 0
errors, `eslint ui` 0 problems, `npm run verify` passing over 119 test files, no in-scope module under
90% statements. These three are what remain: one policy decision, one metric just under its ratchet, and
one deferred-to-RC measurement. **None is a defect** — do not read this section as a bug list.

### 28.1 Decide the render-layer testing posture *(policy, not a defect — the one real decision)*

The only item carried unresolved across every analysis refresh, and the largest genuine untested surface.
`.c8rc.json` deliberately **excludes the engine-bound render/visualization layer** — `emigration-network-*`
(sim/flow/viz/paint/dots/interact/timeline/fit), [emigration-window.js](../ui/emigration-window.js),
[emigration-main.js](../ui/emigration-main.js), `emigration-options.js`, the lens/tooltip modules,
`ledger-view`, `pies`, `return`, `dilemma`, `narrative`, `detail-views`, `chronicle-view`,
`notifications-view`, `flow-tab`, `city-flows`, `city-features` — because the off-engine harnesses cannot
mount Gameface DOM/canvas. So the headline **96.07% statements** means "of the instrumented logic layer,"
**not** of every shipped line; §13.4 already codifies the exclusion as the convention for new viz files.

Sharpening why it matters: the two highest-complexity render files are *also* top-five churn×complexity
hotspots and sit outside the scope — [emigration-window.js](../ui/emigration-window.js) (complexity 185,
hotspot 0.4108) and [emigration-network-viz.js](../ui/emigration-network-viz.js) (148, 0.3480). The
volatile *logic* hotspots (views, migration-stats) are both ≥94% covered, so this is where the residual
risk concentrates.

**Decide one of two postures** (the analysis is explicit that either is acceptable — the defect is leaving
it undecided):
1. **Accept the exclusion as documented policy.** Write it into the README next to the coverage number so
   "96.07%" is never read as whole-mod coverage, and lean on the existing compensating controls: the
   `*-branches` / screen-contract / window-state harnesses, `npm run metrics:render` (render-layer
   synthetic path pass rate, currently **100%**, 9/9 harnesses), and §20's in-game visual passes.
2. **Stand up a Gameface-shim harness** for the network/lens modules and bring them into the c8 include
   set. Larger effort; the existing branch harnesses already exercise part of this surface indirectly.

*Revisit trigger is already fired* — this is decision-ready now. Posture 1 is the cheaper honest close.

### 28.2 Mutation composite — 59.96% against a ≥60 ratchet *(misses by 0.04)*

`quality-ratchet-baseline.json` reads `mutation_score = 59.96` (`active_below_target`; target ≥60, stretch
≥75), so the risk table still lists mutation effectiveness as **Medium** on a 0.04-point rounding artifact
rather than a quality signal.

The composite is not the problem — **the engine is in genuinely good shape at 87.94%** (474/539, survivors
302→65), all real kills with **zero `// Stryker disable`**, and §9 of `mutation-rigor-remediation-plan.md`
honestly classifies the remaining survivors as mostly equivalent mutants rather than hiding them. What
drags the composite down is the **other four Stryker modules — geography (55.43%), prosperity (55.40%),
effects (52.49%), borders (43.82%)** — none re-run since 2026-06-16, so the number mixes per-module as-of
dates.

**Do:** re-run mutation over the four stale modules and recompute via
`npm run metrics:mutation-overall -- --json`; the composite likely clears 60 on the refresh alone. The
report also suggests **widening the 5-module Stryker scope** now that coverage supports it. Note the cost
before scheduling: a full run is ≈16s/mutant × ~1240 mutants over the suite, which is why engine-only
scoping was used last time — scope per module rather than running the whole set blind.

### 28.3 Raise flakiness confidence from quick baseline to policy grade *(deferred to RC)*

`test_flakiness_percent = 0` is real but thin — measured over only **3 runs** (`npm run metrics:flake --
--runs 3`, 3/3 verify passes). **Do at release-candidate time:** run
`npm run metrics:flake -- --runs 20 --json` and track the trend. Not worth spending the wall-clock before
an RC; carried here so it isn't lost.

> **Not open, recorded to prevent re-litigation.** Two earlier metric readings were **parser false
> positives**, both fixed 2026-07-02: `loc_placeholder_mismatch_count = 1232` and
> `loc_ui_overflow_issue_count = 0`-then-2 both traced to `parseRows` matching only `<Row>` (the en_us
> format) while locale files use `<Replace>`, so every locale parsed as zero rows. Parser now accepts
> both; true values are **0** and **0**. No translation files needed changing. Don't re-open on a stale
> report.

---

## Cultural Enclaves — deferred / conditional items

The per-civ Cultural Enclave constructibles ship as tile IMPROVEMENTs (build menu gated to the city's
established diaspora, civic-tree unlock hidden, native yield in the breakdown, on-map icon+label marker
via [ui/emigration-enclave-markers.js](../ui/emigration-enclave-markers.js)). A distinct 3D model is a
closed can't-do (see [wont-fix-with-justifications.md](wont-fix-with-justifications.md) →
*cultural-enclaves — a distinct 3D model*). Deferred, each with its revisit trigger:

- **Enforce empty-tile-only placement (never overbuild an existing improvement).** A tile improvement
  takes the tile's one improvement slot, so building the enclave on a farmed tile replaces the farm.
  Offered 2026-07-15; user chose to leave it (build on an open tile by choice). *Revisit if* players
  report accidentally destroying valued improvements — implement by wrapping the enclave BUILD
  `canStart` and filtering `.Plots` to tiles with `MapConstructibles.getConstructibles(x,y).length === 0`
  (same canStart-wrap gating pattern as the placement-gating work / national_park natural-wonder gate).
- **Auto-build the earned enclave on the diaspora event** (vs. manual player build). Probe exists
  (Self-Test "Build enclave (BUILD op)" / "Seed diaspora + build"); *revisit if* we want the enclave to
  appear automatically rather than as a player choice.
- **Marker polish** — icon/label size + height are tunable constants (`ICON_Z`/`TEXT_Z`/`TEXT_FONT_SIZE`
  in the marker module); *revisit if* the on-map marker reads too big/small/crowded at typical zoom.

### Unbuilt stages — paused indefinitely (triaged 2026-07-16)

Three stages were specced alongside the enclave system and **never built**: the **blended / host-imprint
enclave**, **petition / secession / uprising**, and the **enclave progression screen**. They are **not
queued** — each is paused in [indefinitely-paused-features.md](indefinitely-paused-features.md), which
owns their designs, the triage reasoning, and the blocker each waits on. Summary of the verdicts:

- **Blended stage** — conditional; chronicle-only if ever built. Blocked on §22a (the reward-model
  decision) — its drafted mechanics assume a re-scalable `grantYield` that CANTFIX-1 rules out.
- **Petition / uprising** — recommend against; probe-first if ever. Its payoff depends on an unproven
  native-revolt hook, and it gates behind an enclave state that barely occurs.
- **Progression screen** — the useful remainder is live work, folded into **§22b** as a city-readout
  subpanel. The dedicated screen is over-built and stays paused.

**Blocker shared by all three:** nobody has measured how often an enclave actually forms.
`quarterMinStock: 3` / `quarterEstablishedShare: 0.3` / `quarterEnclaveStickiness: 0.25` /
`quarterDwellTurns: 8` have never been checked against played games, and the one datapoint is a player
reporting enclaves weren't happening. Measure first (same stance as §27) — a stage arc nobody reaches is
not worth extending.
