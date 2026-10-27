# Emigration: Roadmap & Backlog

The single planning document for the **Emigration** mod. It carries two kinds of work under one
continuous numbering:

- The feature roadmap (§0–§17): a map of every relevant existing pipeline (with `file:line`
  anchors), then an implementation-grade plan for each not-yet-built feature: which files change, which
  functions to touch, the data shapes, the config knobs, the localization keys, and the tests to add. It
  covers the visualization/gameplay batch (Features B–K), the deepened refugee/border stance (§12), the
  cross-cutting checklist (§13), suggested sequencing (§14), the L–Z migration-intelligence layer (§15),
  the shared foundations every feature reuses (§16), and the carried-over deferred features (§17).
  Features A–K are numbered by letter position (B = §2 … K = §11), so the gaps are intentional: §1
  (Feature A) was never opened, and §4/§5/§6 shipped (Feature D, timeline event pins; E, net
  sparkline; F, cultural quarters).
  In §15, Features **S** (most-diverse-cities ranking) and **T** (cosmopolitanism score) have also
  shipped and been removed; they created the `readout` tunable group and `emigration-diversity.js`,
  which the remaining readout features join and reuse (§16.6, §16.7).
- The cleanups, QA & conditional backlog (§18–§26): the remaining correctness/perf/maintainability
  cleanups, pending in-game verification, trigger-gated leftovers, the rollout-flag retirement pass, and
  the deferred arrivals-hardening items, each with a "revisit if/when" condition.
- The migration-system enhancement backlog (§27): measure-first proposals to enhance the simulation
  (fairness/exploit fixes, plausibility/depth), derived from the scenarios critique. Its Priority-0
  legibility layer shipped; the rest is gated on reading the shipped telemetry first.
- The quality-analysis open items (§28): the three items still open in
  `mods_quality_analyses/emigration-quality-analysis`: the render-layer testing posture (a policy
  decision, not a defect), the mutation composite sitting 0.04 under its ratchet, and the RC-gated
  flakiness measurement. All gates are green; none of these is a bug.

Completed work is removed from this document as it ships and recorded in the
[CHANGELOG](../CHANGELOG.md). Deliberate non-changes (closed by decision, no trigger) live in
[wont-fix-with-justifications.md](wont-fix-with-justifications.md).

## Conventions & invariants

Every item honors the mod's standing rules: flag-gated behavior with conservative defaults, and the
full cross-cutting checklist in **§13** (config/tunables, modinfo registration, localization parity, the
`visuals`/`readout` tunable groups, tests wired into the gate, lint, verify+release). The hard
invariants that must never be violated:

- Never touch the **population-scaling** constants, pinned bit-for-bit to the Demographics mod by
  `tests/scaling-demographics-parity.mjs`.
- Never change the network/flow **sim/layout/canvas-buffer** coordinates (`WX = 1120`, `WY = 560`).
- ESLint **complexity ≤ 10**; `max-len` and `no-unused-vars` are error-level. Extract helpers.
- `npm run verify` must exit 0 before every ship.

> Line numbers throughout are accurate as of writing but the codebase moves; treat the **function name**
> as the source of truth and the line as a hint. Re-grep before editing.

---

## 0. The systems these features build on (current pipeline map)

### 0.1 Ethnic composition + lens (per-tile origin mosaic)

- **Model: [emigration-composition.js](../ui/emigration-composition.js)**
  - `compositionForCity(city)` (**L510**) → `{ total, owner, civs: [{ civ, pts, share }], dominant: { civ, share } | null }`.
    `civs` is sorted by `share` descending. This is the one source for "who lives here".
  - `compositionForOwner(pid)` (**L528**) → same shape, empire-wide.
  - `recordCompositionPass(signals, migs)` (**L476**): per-pass update; calls `integratePass()`.
  - `integrateCity(e, owner, rateFor)` (**L410**) / `integratePass(s, work, signals)` (**L454**): the
    **integration-over-time** drift of non-owner origins toward the host, rate from
    `CONFIG.integrationRate` / `integrationUnrestRate` / `integrationWarRate`.
  - `load()` (**L150**) with `_loadedTurn` (**L53**): the per-turn cache that the v1.6.x "refresh each
    turn" fix relies on. `STATE_KEY = "EmigrationEthnos_v1"` (**L30**); `CityComposition` typedef
    `{ owner, byCiv: Record<string,number>, total, name, seenTurn }` (**L33**). Enumerate all cities via
    `Object.keys(load().cities)` (**L533**).
- **Lens paint: [emigration-ethnicity-lens.js](../ui/emigration-ethnicity-lens.js)**
  - `tilePaints()` (**L190**) → `[{ x, y, fill: {x,y,z,w} }]` (float4 RGBA); calls
    `compositionForCity()` per settlement (**L203**).
  - `cachedBatches()` (**L254**): the refresh trigger; `lensTurn()` (**L256**) busts the cache when
    `Game.turn` advances.
- **Per-tile spread: [emigration-ethnicity-distribution.js](../ui/emigration-ethnicity-distribution.js)**
  - `distributeTiles(plots, comp, scaledPeople)` (**L93**) → `[{ x, y, civ, people, density }]`.
- Hover panel: [emigration-ethnicity-tooltip.js](../ui/emigration-ethnicity-tooltip.js) (renders a
  `parts[]` array of origins with `share`, **L86–97**) and
  [emigration-lens-hover-panel.js](../ui/emigration-lens-hover-panel.js) (`registerLensHoverPanel()` **L282**,
  `rebuildIndex()` **L99**).
- Origin colors: [emigration-civ-colors.js](../ui/emigration-civ-colors.js) `civDisplayColor(pid, fallback)`
  (≈ **L300**) → readable `#RRGGBB`.

### 0.2 City readout (on-demand HUD panel)

- **Data: [emigration-city-readout-data.js](../ui/emigration-city-readout-data.js)**
  - `buildCitySnapshot(opts)` (**L151**) / `citySnapshot(cityId)` (**L318**) →
    `{ owner, cityName, population, cause, causeLabel, causeMix, distress, pressure, pressureToBar,
    topDestinationName, composition: { total, parts: [{ name, share }] } | null, ownerNet, ownerIn,
    ownerOut, ... }`.
- **Render: [emigration-city-readout.js](../ui/emigration-city-readout.js)**
  - `readoutModel()` (**L89**), `originsLine(comp)` (**L61**), `renderPanel()` (**L167**), corner placement via
    `CONFIG.cityReadoutCorner`.

### 0.3 Network / flow visualization

- Frames (history the views consume): [emigration-flow-history.js](../ui/emigration-flow-history.js):
  `Frame { turn, age, year, network: { nodes, edges, cityEdges, maxEdge, maxNode }, pops, intra, delta }`.
- Dots view: [emigration-network-viz.js](../ui/emigration-network-viz.js): `renderNetworkViz()`,
  `mountChrome(parts)` (**L554**), `runLoop()` (**L708**). Canvas `WX = 1120`, `WY = 560`.
- Flow view: [emigration-network-flow.js](../ui/emigration-network-flow.js): `renderFlowMap()` (**L852**),
  `buildFlowViz()` (**L747**), `mountFlowChrome()` (**L716**), `runFlowLoop()` (**L618**),
  `paintFlow()` (**L529**), `frameSegments()` (**L258**) →
  `[{ x0, y0, x1, y1, people, points, label }]`, `drawArrow()` (**L330**), `setFlowStroke()` (**L313**).
  `OUTFLOW = "#e0786b"`, `INFLOW = "#7fd08a"`, `FLOW_MIN_W = 1.6`, `FLOW_MAX_W = 8`.
- Paint primitives: [emigration-network-paint.js](../ui/emigration-network-paint.js): `paint()` (**L510**),
  `drawCivCircle()` (**L368**), `drawFlowLine()` (**L468**), `drawEventBadge()` (**L480**).
- Timeline: [emigration-network-timeline.js](../ui/emigration-network-timeline.js): `makeTimeline()`
  (**L206**), `makeTimelineArea()` (**L172**), `makeMarks()` (age-boundary + turn-tick overlay, ≈ **L100**),
  `makeAgeBar()` / `ageSegments()` (≈ **L55–70**). Marks are positioned as `% of width` in
  `.emig-netc-marks`.
- Sizing: [emigration-network-fit.js](../ui/emigration-network-fit.js): `installStageFit()` (shared by both
  views; do not regress the v1.6.x window-fit work).
- Interaction: [emigration-network-interact.js](../ui/emigration-network-interact.js): hit-testing
  (`nearestCluster()`, `nearestCity()`), hover tooltip.

### 0.4 Chronicle / narrative / return / effects / causes

- Chronicle: [emigration-chronicle.js](../ui/emigration-chronicle.js): `chronicle(entry)` (**L153**),
  `chronicled(key)` (**L120**), `chronicleLog(limit)` (**L215**). `ChronicleEntry { turn, kind:
  "exodus"|"founding"|"return", title, body, civ?, people?, cause?, dedupeKey? }` (**L17–26**);
  `STATE_KEY = "EmigrationChronicle_v1"`, `MAX_ENTRIES = 80` (**L14**). Mirrors to Notifications via
  `mirrorToNotifications()` (**L131**).
- Narrative: [emigration-narrative.js](../ui/emigration-narrative.js): `exodusLine(e)` (**L158**),
  `foundingLine(e)` (**L177**), `returnLine(e)` (**L202**), `chronicleTitle(e)` (**L224**),
  `dilemmaPrompt(e)` (**L253**). All deterministic via `pick(list, seed, salt)` (FNV-1a, **L23–31**).
- Diaspora chronicling: [emigration-diaspora.js](../ui/emigration-diaspora.js): `recordChroniclePass()`
  (**L169**), `detectFoundingForCity(city)` (**L127**), `leadForeignOrigin(comp)` (**L113**);
  `DIASPORA_MIN = 0.15` (**L33**), `DIASPORA_STEP = 0.15` (**L34**); founding `dedupeKey =
  "founding:"+city+"|"+civ+"|"+tier` (**L136**).
- Return migration: [emigration-return.js](../ui/emigration-return.js): `planReturns(signals)` (**L322**),
  `planOneReturn(host, ctx)` (**L264**), `returnAllowed()` (**L207**), `prosperingOwners(signals)`
  (**L126**), `eligibleDiaspora(comp)` (**L161**), `chronicleReturn()` (**L220**). `STATE_KEY =
  "EmigrationReturn_v1"`.
- Integration-cost economy: [emigration-effects.js](../ui/emigration-effects.js):
  `addAssimilationLoad(destOwner, destPopulation)` (**L105**), `tickAssimilation(pid)` (**L124**),
  `assimLoadFor(pid)` (**L216**), `congestionPenalty(pid, civPop)` (**L245**). `STATE_KEY =
  "EmigrationAssim_v1"`. (The changelog renames "assimilation" → "integration" in player text;
  internal identifiers stay.)
- Causes: [emigration-causes.js](../ui/emigration-causes.js): `MigrationCause =
  "unhappiness"|"prosperity"|"war"|"disaster"|"conquest"|"attrition"|"return"` (**L23**); `REFUGEE_CAUSES`
  `{war,disaster,conquest}` (**L39**); `causeLabel` (**L106**), `causeHint` (**L153**), `isRefugeeCause`
  (**L97**); per-cause breakdown string `netDrivers(outByCause, inByCause)` (**L193**).
- Records: [emigration-migration-records.js](../ui/emigration-migration-records.js): `moveRecord()`
  (**L64**), `departRecord()` (**L93**), `arriveRecord()` (**L117**). Record carries `originCiv`,
  `destOwner`, `cause`, `eventKey`, `destPaidCost`, `people`, `phase`. **Records are not persisted here**,
  they flow into [emigration-migration-stats.js](../ui/emigration-migration-stats.js) `recordMigrations()`
  (**L752**), which keeps the session-local `recentEventsFor(pid, limit)` ring (**L822**, `RECENT_CAP = 50`
  **L31**), cumulative `netCumFor`/`grossInCumFor`/`grossOutCumFor` (**L979–993**), and the per-corridor
  flow matrix `migrationFlows()` (**L566**) / `foldFlow()` key `"srcCiv>destCiv>srcCity>destCity"` (**L313**).

### 0.5 Per-turn loop (where new systems hook)

- [emigration-main.js](../ui/emigration-main.js): `onTurnActivated(data)` (**L233**, engine
  `PlayerTurnActivated`); per-civ `chargePerTurnCosts(who, local)` (**L207** → `tickAssimilation` **L210**,
  `applyMigrantHoldingPenalty` **L216**, `tickAttractionDividend` **L222**); the local-player
  `doPass(why)` (**L158**): `runPass()` → `collectCitySignals()` (**L164**) → `foldReturns()` (**L165**) →
  `recordCompositionPass()` (**L169**) → `recordChroniclePass()` (**L172**) → `recordMigrations()`
  (**L178**). `gameTurn()` (**L54**) returns `Game.turn`. **New per-turn systems are added inside
  `doPass()` between L165–L178, or to `chargePerTurnCosts()` for per-civ logic.**

### 0.6 Border policy / immigration stance (relevant to §12)

- Stance VM: [emigration-borders.js](../ui/emigration-borders.js): reads slotted **native Traditions**
  via `Culture.isTraditionActive`. Exports `immigrationOpenness(pid)` (**L137**), `emigrationRetention(pid)`
  (**L157**), `activeAttractions(pid)` (**L171**), `hasAsylum(pid)` (**L180**), `borderStance(pid)`
  (**L191** → `"pro"|"anti"|"none"`); per-pass cached `policyState(pid)` (**L115**). Tradition types are
  consolidated in the frozen `POLICY_TYPES` registry (**L21**) `{ open, closed, talent, cultpull, tradepull,
  asylum }` + the `ATTRACTIONS` table (**L42**).
- Consumed in pull: [emigration-pull.js](../ui/emigration-pull.js): imports those three at **L16**;
  `permeability(src, dest)` (**L93**) multiplies `opennessFor(dest)` (**L~180**) × `retentionFor(src)`
  (**L~192**) × deal/alliance/war factors, clamped to `[permeFloor, permeCeil]` in `adjustedPull()`
  (**L172**). Refugee asylum easing at **L77**.
- Government read: [emigration-polity.js](../ui/emigration-polity.js): `readPolity(owner)` (**L155**) →
  `{ government, celebrating, goldenAgeTurnsLeft, warWeary }`; `readGovernment(player)` (**L188**) via
  `Culture.getGovernmentType()` → `GameInfo.Governments.lookup().GovernmentType`; `governmentLean()`
  (**L214**) + the `GOVERNMENT_LEAN` table.
- Data (native cards): [data/emigration-policies-antiquity.xml](../data/emigration-policies-antiquity.xml),
  `-exploration.xml`, `-modern.xml`, `-gameeffects.xml`, `-policy-icons.xml`. Two slotable Traditions per
  age (Open / Closed Borders) in `POLICY_CULTURE_SLOT`, unlocked at `NODE_CIVIC_AQ_MAIN_CITIZENSHIP`
  (and the per-age equivalents). Native modifiers: Open `+1/+2/+3` Influence; Closed `-2/-3/-4`
  Influence **and** `+2/+3/+4` Production per city (autarky).
- Config: [emigration-config.js](../ui/emigration-config.js): `bordersEnabled` (**L384**),
  `closedBordersOpenness: 0.4` (**L385**), `closedBordersRetention: 0.6` (**L386**),
  `openBordersOpenness: 1.5` (**L387**), `opennessFloor: 0.15` (**L388**), `permOpenBorders` (**L53**),
  `openBordersBonus` (**L172**). Tunables at [emigration-tunables.js](../ui/emigration-tunables.js#L40-L43).

### 0.7 Migration scenarios, reference diagrams (standalone)

The full scenario graphics are maintained in
[migration-scenarios-diagrams.md](migration-scenarios-diagrams.md) so they can evolve independently from
the implementation plan. They map directly to the hooks in §0.1–§0.6 and the quarter rules in
[cultural-enclaves.md](../../../mod_ideas_tested/_archived-emigration-enclave-feature/docs/cultural-enclaves.md) (archived).

---

## 2. Feature B: Animated flow particles along the arrows *(medium)*

**Goal.** Make the Flow view visually distinct from Dots: send small dots traveling source→dest along
each arrow, speed/spacing ∝ volume, so "who is bleeding to whom" reads at a glance.

**Current state.** Arrows are static quadratic curves drawn each frame by `drawArrow()`
([emigration-network-flow.js](../ui/emigration-network-flow.js#L330)) from `frameSegments()`
(**L258**) → `{x0,y0,x1,y1,people,points,label}`. The render loop is `runFlowLoop()` (**L618**) calling
`paintFlow()` (**L529**) when dirty.

**Implementation.**
1. Parametric position. The curve already has a control point (`curveControl(segment)` /
   `setFlowStroke()` **L313**). Add a pure helper `bezierPoint(seg, ctrl, t)` returning the `(x,y)` at
   `t∈[0,1]` on the quadratic. (Standard `(1-t)²P0 + 2(1-t)t·C + t²P1`.)
2. Particle phase. Add a module-level monotonic `_flowPhase` advanced each frame in `runFlowLoop()`
   (e.g. `+= speedMul * dt`). For each segment, draw `N = clamp(round(seg.people / UNIT), 1, MAX_DOTS)`
   particles at `t = frac(_flowPhase * SPEED + k/N)` for `k in 0..N-1`. Color each particle by lerping
   `OUTFLOW → INFLOW` over `t` (reuse the gradient logic).
3. Keep the loop alive. `paintFlow()` currently repaints only when `dirty`. Gate particle animation
   behind `CONFIG.flowParticlesEnabled`; when on, treat the view as "always animating" the way the Dots
   view's `needsPaint()` keeps repainting during playback (see
   [emigration-network-viz.js](../ui/emigration-network-viz.js) `needsPaint()`), but **throttle** to a
   modest particle FPS to avoid pegging GameFace. Respect the existing rAF loop; do not add a second
   loop.
4. Draw primitive. Add `drawFlowParticle(ctx, x, y, r, color)` next to `drawArrow()`; small filled
   arc. Keep `drawArrow()` complexity ≤ 10 by putting the particle pass in its own function called from
   `paintFlow()` after the arrows are stroked (so particles sit on top).

**Config / tunables.** `flowParticlesEnabled: true`; `flowParticleSpeed` (choice, e.g. `[0,0.5,1,2]`,
`0` disables) in a new `visuals` tunable group; `MAX_DOTS`/`UNIT` as module constants.

**Tests.** `tests/network-flow-particles.mjs`: unit-test `bezierPoint()` endpoints (`t=0→P0`,
`t=1→P1`) and that particle count scales with `people` and clamps. (Canvas drawing itself is not
unit-tested; assert the geometry helpers.)

**Risk.** Performance on low-end GPUs, mitigate with the speed=0 off switch and a hard `MAX_DOTS`.
Do **not** alter `WX/WY` or segment geometry.

---

## 3. Feature C: "Brain drain" highlighting (net importer/exporter) *(medium)*

**Goal.** Tint or ring each civ circle by its **net migration** over the visible timeline, green for
net importers, red for net exporters, so the migration winners/losers are obvious on both views.

**Current state.** Per-civ net is **not pre-computed** in the viz files; `frame.network.edges[]` carries
`{from, to, people}` (or `cityEdges[]`). Civ circles are drawn by `drawCivCircle()`
([emigration-network-paint.js](../ui/emigration-network-paint.js#L368)). The ledger view already computes
per-civ in/out/net for the dashboard, reuse that rather than re-deriving.

**Implementation.**
1. Source the totals (the builder already exists, reuse, do not re-derive). Cumulative per-owner
   net/in/out is `netCumFor(pid)` / `grossInCumFor(pid)` / `grossOutCumFor(pid)`
   ([emigration-migration-stats.js](../ui/emigration-migration-stats.js#L979) **L979–993**), also surfaced
   as `ownerStats(pid)` ([emigration-city-readout-data.js](../ui/emigration-city-readout-data.js#L263)) and
   `civLedgerRows(civs)` ([emigration-views.js](../ui/emigration-views.js#L31)). Export a thin
   `netByCiv(section)` adapter over those and import it into the viz. **This is the same per-owner totals
   source Features S, X, Y, and M consume, they all read `netCumFor`/`ownerStats`, not a parallel fold.**
   Only if you need net **scoped to the visible timeline window** (not cumulative) add `netByCiv(frames)` to
   [emigration-flow-history.js](../ui/emigration-flow-history.js): fold `edges[]` to `out[from] += people`,
   `in[to] += people`, `net = in - out`.
2. Map net → color. Add `brainDrainTint(net, maxAbs)` returning an rgba ramp
   (red → neutral → green). Pass a per-civ `net` into the scene nodes (extend `NetworkNode` with a
   transient `net` field set at build time in `buildCenters()` /
   [emigration-network-viz.js](../ui/emigration-network-viz.js#L189)).
3. Apply. In `drawCivCircle()` (**L368**) use the tint for the stroke or a faint fill when
   `CONFIG.brainDrainHighlight` is on; otherwise the current color. Keep the lens-driven coloring
   (origin/cause/movement) intact, this is an **additive ring**, gated by a new lens option, not a
   replacement.
4. Legend. Add a one-line key (red = losing people, green = gaining) to the existing legend builder
   (`flowLegend()` in [emigration-network-flow.js](../ui/emigration-network-flow.js#L644) and the dots
   legend) when the highlight is active.

**Config / tunables.** `brainDrainHighlight: false` (off by default, it's a strong visual);
`visuals` group bool tunable.

**Tests.** `tests/network-brain-drain.mjs`: `netByCiv()` on a tiny frame set returns correct
in/out/net; `brainDrainTint()` is monotonic and symmetric around 0.

**Risk.** Visual clash with the existing lens recolor, keep it a separate ring/option.

---

## 4. Feature D (Timeline event pins) SHIPPED

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
1. Thread events to the timeline. `makeTimeline(frames, pb, onSet)` (**L206**) currently takes only
   `frames`. Add an optional `events` param (default `[]`) and pass it from both callers
   (`mountChrome` / `mountFlowChrome`). Keep the signature backward-compatible.
2. Pin builder. New `makeEventPins(frames, events)` returning a layer of absolutely-positioned
   pins: `left = (event.from / (frames.length - 1)) * 100 + "%"`, an icon/glyph by `event.kind`
   (war/disaster), and a hover tooltip with `event.label`. Append it into the same `.emig-netc-marks`
   container inside `makeTimelineArea()` (**L172**). Keep `makeMarks()` and `makeEventPins()` separate so
   each stays ≤ 10 complexity.
3. Click-to-scrub. On pin click, call the timeline's `goTo(event.from)` (already returned by
   `makeTimeline`) so clicking a pin jumps the scrubber there.
4. De-dup / crowding. When two events share a frame column, offset vertically or merge into a
   count badge, a small `clusterPinsByColumn()` helper.

**Config / tunables.** `timelineEventPins: true` (visuals group bool).

**Localization.** Reuse existing event labels; add `LOC_EMIG_TL_PIN_WAR` / `LOC_EMIG_TL_PIN_DISASTER`
tooltips if the resolved labels aren't player-ready.

**Tests.** `tests/network-timeline-pins.mjs`: `makeEventPins()` positions a known event at the right
`%`, clusters two same-column events, and yields zero pins for an empty events array.

**Risk.** Low, additive DOM in an existing overlay. Verify GameFace positions `%`-left children
correctly (it does for the existing marks).

---

## 7. Feature G: Homeland "pull-back" events *(medium, gameplay)*

**Goal.** Dramatize the existing (quiet) return migration: when a homeland recovers (post-war / golden
age), occasionally fire a visible "the homeland calls" **wave** home, with a chronicle moment and a
toast, instead of the silent trickle.

**Current state.** Return migration already exists: `planReturns()`
([emigration-return.js](../ui/emigration-return.js#L322)) → `planOneReturn()` (**L264**), gated by
`returnAllowed()` (**L207**) and `prosperingOwners()` (**L126**); it already chronicles via
`chronicleReturn()` (**L220**) and `returnLine()`. What's missing is the **burst** framing and a
celebration/peace **trigger**.

**Implementation.**
1. Trigger. In `prosperingOwners()` / `returnAllowed()`, add a stronger condition: a homeland that
   *just* entered a Golden Age (`readPolity(owner).celebrating` from
   [emigration-polity.js](../ui/emigration-polity.js#L155)) or *just* made peace becomes a "calling"
   homeland for a few turns. Track an edge-trigger (was-not-celebrating → is-celebrating) in the return
   state.
2. Burst. When calling, temporarily raise the return volume/probability for that homeland (scale
   `returnRoll` / the per-host cap) for `CONFIG.pullbackTurns`, bounded so it can't drain hosts (still
   respects `minRuralToEmigrate`).
3. Surface it. Emit a distinct chronicle entry (`kind: "return"`, but a "wave" title variant via
   `chronicleTitle()`) and a throttled toast through the existing important-toast cooldown (see the
   Phase-1 digest in [emigration-feedback.js](../ui/emigration-feedback.js) /
   [emigration-notifications.js](../ui/emigration-notifications.js)).

**Config / tunables.** `homelandPullback: true`, `pullbackTurns: 3`, `pullbackBoost` (choice).

**Tests.** Extend `tests/return.mjs`: celebration edge-trigger arms the burst; burst decays after
`pullbackTurns`; never drains below the rural floor; disabled flag → current trickle behavior.

**Risk.** Balance, bound the burst and keep the rural-floor guard so it can't depopulate a host.

---

## 8. Feature H: End-of-age migration recap *(low–medium)*

**Goal.** At each age rollover, post a satisfying recap ("In Antiquity, ~2.1M people moved; the great
story was the flight from Rome to Carthage"), generated from the Chronicle/records you already keep.

**Current state.** Per-turn loop is `doPass()`
([emigration-main.js](../ui/emigration-main.js#L158)); `gameTurn()` gives the turn but **age is not read
here**: it's available via `readPolity()` only for government, not age. Age strings exist on the viz
frames (`frame.age`, e.g. `"AGE_ANTIQUITY"`). Chronicle history is in
[emigration-chronicle.js](../ui/emigration-chronicle.js); migration timeline in
[emigration-flow-history.js](../ui/emigration-flow-history.js).

**Implementation.**
1. Detect the boundary. Read the current age once per pass. The reliable source is the game's age API
   (probe for `Game.age` / `GameInfo.Ages` / the same source the viz uses to stamp `frame.age`). Persist
   `lastSeenAge`; when it changes, fire the recap. Add `currentAge()` to
   [emigration-polity.js](../ui/emigration-polity.js) (it already centralizes game reads) and a
   `lastSeenAge` field to a small state.
2. Aggregate. New `ageRecap(ageKey)` in a new file
   [emigration-age-recap.js](../ui/emigration-age-recap.js): sum people moved during the age from the
   migration history, find the top origin→dest corridor, the biggest exodus, and the biggest gainer.
3. Emit. Chronicle it (`kind: "founding"`/new `"recap"`) + one toast. Reuse `formatPeopleExact()`
   and the corridor data already used by the flow view.

**Config / tunables.** `ageRecapEnabled: true`.

**Tests.** `tests/age-recap.mjs`: boundary edge-trigger fires once per age; aggregation picks the right
top corridor; no-data age → graceful empty recap (no throw).

**Risk.** The age-read API must be verified in-game (best-effort with a neutral fallback, never throw).

---

## 9. Feature I: Migration-story follow-ups *(low)*

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
> {City}"); the only remaining piece (the cumulative-*mass* trigger) is exactly this feature's
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
share-only behavior).

**Tests.** Folded into `tests/cultural-blend.mjs`: assert no follow-up when a tier crossing occurs below
`integrationMilestoneMinImmigrants`, and assert follow-up fires once when the same crossing occurs above
the threshold.

---

## 10. Feature J: Migration-pressure map overlay *(higher, new map UI)*

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

**Risk.** Medium, new lens registration + map paint; follow the prosperity-lens file as the template to
stay within the engine's lens API.

---

## 11. Feature K: Chain migration toward existing enclaves *(higher, model change)*

**Goal.** People migrate preferentially toward destinations that *already* host a community of their
origin (real-world chain migration), producing emergent, growing ethnic enclaves.

**Current state.** Pull is computed per `(src, dest)` in `adjustedPull()`
([emigration-pull.js](../ui/emigration-pull.js#L150)); a **TILT** term already exists for targeted
attraction (`tiltFor(src, dest)`, clamped by `CONFIG.tiltCap`). Per-origin presence at a destination is
exactly `compositionForCity(destCity)` / `compositionForOwner(destOwner)`.

**Implementation.**
1. Enclave signal. Add `enclaveAffinity(originCiv, dest)` reading the destination's composition share
   for `originCiv` (via `compositionForOwner(dest.owner)` or a per-city composition if the dest signal
   carries a city). Return a **bounded** additive bonus `= CONFIG.chainMigrationWeight * share`, capped.
2. Wire into TILT. Fold it into `tiltFor(src, dest)` so it rides the **existing clamped TILT
   channel** (no new unclamped term, preserves the anti-snowball bounds). Only applies to cross-civ /
   cross-city moves where the mover's origin matters, thread the mover's `originCiv` (already on the
   migration record) into the pull call, or approximate with the source civ for economic movers.
3. Determinism. Pure function of composition + config; no RNG.

**Config / tunables.** `chainMigrationEnabled: false` (off by default, it changes movement),
`chainMigrationWeight` (choice), `chainMigrationCap`.

**Balance.** This is a positive feedback loop (enclaves attract more of the same origin): it must be
capped and run through `scripts/snowball-stress.mjs` and the calibration sweep before defaulting on.

**Tests.** `tests/chain-migration.mjs`: affinity scales with share, clamps at the cap, is zero when the
feature is off, and never makes pull unbounded (assert TILT clamp still binds).

**Risk.** Highest of the visualization/model set, model behavior change. Ship off by default, validate
with the existing balance scripts, and document.

---

## 12. Refugee policy as a standing stance, what EXISTS, and how to DEEPEN it

Refugee/border policy is **already implemented** as real native **policy cards (Traditions)**, not just a
one-off dilemma, so the "standing stance" idea is already shipping. This section documents exactly what
exists (§12.1), then specs a concrete design for the *deeper* version (§12.2: government gating, granular
per-people closure, asymmetric consequences).

### 12.1 What already exists today

**3.6.0 (2026-10-17, unreleased):** the cards are ten, the treatment and asylum effects live on the two stances, each
stance grants its own policy slot while slotted (withheld while the other stance is slotted), and the stance read
skips the other ages' types, which the engine reports as active. Watched in one Antiquity and one Exploration lab
game (`tools/plans/overnight-watch-run-2-log.md`, "Emigration cards"). The paragraphs below describe 3.5.x's shape
where they name the retired cards.

**3.6.2 (2026-10-17):** the stances no longer grant a slot. A card that grants the slot it sits in crashes the game
natively while the AI plans its policies: the owner's Antiquity save (Washington, turn 76, usual Tower set) crashed on
every End Turn during the independents' turns, seven times out of seven, in an AsyncWorker memmove with a garbage
length under the AI's tradition analysis and GameEffects attach. Blocking every request the mods' scripts sent didn't
help; unlinking the six `MOD_EMIG_STANCE_SLOT_*` TraditionModifiers rows let turns 76 → 79 pass in the same lab game.
The six definitions stay, unlinked, so 3.6.0/3.6.1 saves find every modifier id they hold. Never link a slot grant to
the card that occupies it.

Defined as native, slotable **Traditions** in `POLICY_CULTURE_SLOT`, one pair per age, unlocked at a
civic node (`NODE_CIVIC_AQ_MAIN_CITIZENSHIP` and per-age equivalents):
- Open Borders (Pro-Immigration): native **+1/+2/+3 Influence** by age
  ([data/emigration-policies-gameeffects.xml](../data/emigration-policies-gameeffects.xml)); UI-VM adds
  **+50% immigration pull** (`openBordersOpenness = 1.5`). `borderStance(pid) → "pro"`.
- Closed Borders (Anti-Immigration): native **−2/−3/−4 Influence** **and** **+2/+3/+4 Production per
  city** (autarky); UI-VM throttles **inbound to 40%** (`closedBordersOpenness = 0.4`, floored at
  `opennessFloor = 0.15`) and **retains your own emigrants at 60%** (`closedBordersRetention = 0.6`).
  `borderStance(pid) → "anti"`.
- Attraction cards (Talent/Cultural/Commercial): carried **+Science/+Culture/+Gold** dividends that
  scale with immigration (`activeAttractions()` → dividend in
  [emigration-consequences.js](../ui/emigration-consequences.js#L52) + a small fixed native floor).
- Asylum cards: ease refugee-caused pull toward the holder (`hasAsylum()` consumed in
  [emigration-pull.js](../ui/emigration-pull.js#L77)).

The whole layer is read in [emigration-borders.js](../ui/emigration-borders.js) and applied as the
**PERMEABILITY** channel in [emigration-pull.js](../ui/emigration-pull.js) `permeability(src, dest)`
(**L93**): `openness(dest) × retention(src) × deal/alliance/war factors`, clamped to
`[permeFloor, permeCeil]`. So a stance is genuinely a standing, per-civ posture with an ongoing
Influence/Production/immigration trade-off, exactly the "standing stance" idea, already shipped.

### 12.2 What's not there yet, the deeper design

Three orthogonal extensions, each independently flag-gated. None require touching the population scaling
or the sim/layout.

#### 12.2a Government-form gating (who *may* close, and at what cost)

Make the **availability and cost** of a stance depend on the civ's government, e.g. an open,
representative government cannot fully close its borders (or pays a steep happiness/legitimacy cost to
do so), while an autocratic/mobilized government closes cheaply (and is *penalized* for staying open).

- Read the government. Already available: `readPolity(owner).government`
  ([emigration-polity.js](../ui/emigration-polity.js#L155)) → e.g. `"GOVERNMENT_DESPOTISM"`.
- Pure enforcement, not native prohibition. The engine slots a Tradition freely; the clean way to
  "prohibit" is to make the slotted card **inert or penalized** in JS rather than block the slot
  (blocking the slot needs native `TraditionRequirements`, which Civ VII does not reliably expose for a
  modded predicate). Add a `governmentBorderRule(government)` table in
  [emigration-borders.js](../ui/emigration-borders.js):
  `{ canClose: boolean, closeOpennessMult, openInfluencePenalty, closeHappinessPenalty }` per known
  government, with a neutral default for unknown ones.
- **Apply it.**
  - In `immigrationOpenness(pid)` (**L137**): if the government's `canClose === false`, clamp the Closed
    effect toward neutral (the card still grants its native Production, but the *immigration throttle*
    is reduced: "you can post the policy, but your open society keeps leaking"). Otherwise scale the
    throttle by `closeOpennessMult`.
  - For asymmetric **costs** that the native modifier can't express conditionally, charge them in JS in
    the per-turn path `chargePerTurnCosts()`
    ([emigration-main.js](../ui/emigration-main.js#L207)) via the existing `grantYield`/`deduct`
    plumbing in [emigration-effects.js](../ui/emigration-effects.js): e.g. an open government that slots
    **Closed** pays a happiness penalty each turn; an autocratic government that slots **Open** pays a
    legitimacy/Influence penalty.
- Surface it. Show the gate in the readout/guide and as a toast when a player slots a stance their
  government punishes (reuse the dilemma/feedback toast path).

**Config / tunables.** `governmentBorderRules: true`; the per-government table lives in code (like
`GOVERNMENT_LEAN`), optionally with a global `governmentBorderStrength` scalar (mirrors
`civTuningStrength`).

**Open question to settle before building:** enumerate the actual 1.4.1 government type ids and decide
the per-government rule (which governments are "can't fully close", which are "punished for staying
open"). Pull the list from `GameInfo.Governments` in-game (the same lookup `governmentName()` uses).

#### 12.2b Granular closure, closing to *certain peoples*, not all-or-nothing

Today `immigrationOpenness(pid)` is a **single per-destination scalar**. To close selectively (e.g.
"closed to civs you're hostile to, open to allies"), the openness must become a function of the
**pair** `(origin/source civ, destination civ)`.

- Integration point. `permeability(src, dest)`
  ([emigration-pull.js](../ui/emigration-pull.js#L93)) already has both `src` and `dest`, and already
  reads relationship factors (`hasOpenBordersDeal`, `hasAlliance`, `atWar` from
  [emigration-geography.js](../ui/emigration-geography.js)). Change `opennessFor(dest)` (**L~180**) to
  `opennessFor(src, dest)` and let the border module return a **pair-aware** multiplier.
- **Two viable data sources for "who is it closed to":**
  1. Diplomacy-derived (no new UI, recommended first cut). When a civ holds Closed Borders, apply
     the full throttle only to sources it is **hostile/at war** with, a softened throttle to neutral
     civs, and **near-neutral** to allies / open-borders-deal partners. This makes "selective closure"
     emergent from diplomacy and reuses signals already in `permeability()`. Add
     `selectiveOpenness(srcOwner, destOwner)` to [emigration-borders.js](../ui/emigration-borders.js).
  2. Explicit per-civ choice (heavier, optional later). A persisted per-civ "closed-to" set chosen
     via a small panel (model it on the refugee **dilemma** UI:
     [emigration-dilemma.js](../ui/emigration-dilemma.js) / `-dilemma-view.js`). New state key
     `EmigrationBorderTargets_v1`. Only worth it if players want manual control beyond diplomacy.
- Keep it bounded. The pair multiplier still flows through the existing
  `clamp(permeability, permeFloor, permeCeil)` (**L172**), so no stacking can break the model.

**Config / tunables.** `selectiveBorders: true`, `selectiveHostileMult` (extra throttle vs. hostile),
`selectiveAllyMult` (relief vs. allies).

#### 12.2c Richer, asymmetric consequences for both open *and* closed

You're right that **open** borders should also carry potential downsides, and **closing** should bite in
more than one dimension, with the mix depending on government/age.

- Already present: Open = +Influence, +inbound pull; Closed = −Influence, +Production, −inbound,
  +retention.
- **Additions (all flag-gated, native where possible, JS where conditional):**
  - Open downside, assimilation strain. Open borders pull more immigrants → more **integration
    load** (already modeled in [emigration-effects.js](../ui/emigration-effects.js)); optionally add a
    small extra happiness headwind while Open is slotted *and* the civ's recent net inflow is high
    (charge in `chargePerTurnCosts()`).
  - Open downside (science/espionage exposure, or **Closed downside) science/trade isolation.**
    Express flat parts as **native modifiers** in
    [data/emigration-policies-gameeffects.xml](../data/emigration-policies-gameeffects.xml) (the file
    already line-items per-age Influence and Production, add per-age Science/Trade modifiers the same
    way, with `COLLECTION_OWNER` / `COLLECTION_PLAYER_CITIES`). Conditional parts (scaling with net
    flow, or gated by government) stay in JS.
  - International standing. The Influence delta already *is* the standing lever; deepen it by making
    the magnitude **government- and age-scaled** (12.2a) rather than a flat native number, i.e. move the
    Influence from a fixed native modifier to a JS-charged amount when you need it conditional, or keep
    native for the base and add a JS top-up for the conditional slice.

**Where each consequence lives (rule of thumb):**
- Flat, unconditional, per-age → native modifier in the policy XML (visible on the card, in yields).
- Conditional (depends on government, diplomacy, recent flow, or selective targets) → JS in
  [emigration-borders.js](../ui/emigration-borders.js) (multipliers) + `chargePerTurnCosts()`
  ([emigration-main.js](../ui/emigration-main.js#L207)) (per-turn yields), reusing
  [emigration-effects.js](../ui/emigration-effects.js)'s `grantYield`/`deduct`.

### 12.3 Tests for the deepened stance

- Extend `tests/borders*.mjs` (and add `tests/border-government.mjs`, `tests/border-selective.mjs`):
  - government gate: a "can't close" government yields near-neutral openness even with Closed slotted;
  - a punished pairing charges the expected per-turn cost (mock `grantYield`/`deduct`);
  - selective closure: hostile source throttled, ally source relieved, product still within
    `[permeFloor, permeCeil]`;
  - all flags off → byte-identical to current behavior (characterization test, like the existing
    `adjustedPull` test).

### 12.4 Localization / Civilopedia

- Update [data/emigration-civilopedia.xml](../data/emigration-civilopedia.xml) and the in-app guide
  ([emigration-guide.js](../ui/emigration-guide.js)) to explain government gating, selective closure, and
  the new consequences. New `LOC_EMIG_*` strings in all locales.

---

## 13. Cross-cutting work (applies to every feature)

1. Config + tunables. Add each flag to [emigration-config.js](../ui/emigration-config.js) (with a
   `@property` in [emigration-config-types.js](../ui/emigration-config-types.js)) and, where
   player-facing, a row in [emigration-tunables.js](../ui/emigration-tunables.js) (new `visuals` group
   for the viz features) with `LOC_EMIG_T_*` label/desc strings.
2. modinfo. Register every new `ui/*.js` in the game-scope `ImportFiles` and every new `data/*.xml`
   in the correct age-scoped `UpdateDatabase` block of [emigration.modinfo](../emigration.modinfo).
   `tests/modinfo.mjs` and `tests/validate-package.mjs` enforce this.
3. Localization parity. Every new visible string in all locales; `tests/validate-package.mjs`
   enforces 100% parity and XML well-formedness.
4. Coverage exclusions. Pure-canvas/engine-only files go in `.c8rc.json` excludes (as the existing
   viz files are) so the coverage gate isn't skewed.
5. Tests wired into the gate. Add each new `tests/*.mjs` to `package.json` (`test:js` + `verify`) and
   to the required-array in `scripts/required-scripts-gate.mjs`.
6. Lint. Keep every new/edited function ≤ 10 complexity; extract helpers. `max-len` and
   `no-unused-vars` are error-level.
7. Verify + release. `npm run verify` (exit 0) before every ship; then `bash release.sh`, recreate
   `dist/workshop_item_no_preview.vdf`, and publish (see the repo's Steam notes).

---

## 14. Suggested sequencing (impact ÷ effort)

This orders the simulation/visualization/gameplay batch (Features B–K, §12). The L–Z
migration-intelligence layer has its own sequencing and version headline in §15.16.

1. I, story follow-ups (small, make existing data feel alive). *(E, net sparkline shipped.)*
2. B (Flow particles + **C) Brain-drain highlight** (medium; the Flow view finally looks distinct).
   *(D: Timeline event pins shipped; it created the `visuals` group these two join.)*
4. 12.2a/c: Government-gated stance + richer consequences (deepens a shipped system; mostly JS +
   a few native modifiers; off by default).
5. G (Homeland pull-back + **H) Age recap** (gameplay/narrative; off by default, validate balance).
   *(F: Cultural quarters shipped.)*
6. K (Chain migration + **12.2b) Selective closure** + **J: Pressure lens** (model/UI changes;
   highest risk; gate off, run the snowball/calibration scripts first).

Each item is independently shippable behind its flag, so they can be released incrementally rather than
as one large version.

---

## 15. Migration Intelligence Update, readability & explainability features

The features above (B–K, §12) mostly add *new simulation* and *new visuals*. The community pattern for
Civ VII mods, though, rewards **readability and explainability** first: tooltips that expose hidden math,
lenses, policy-yield previews, "why is this happening?" surfaces, and screenshot-friendly rankings. This
section specs a batch (**Features L–Z**) that turns Emigration from a *historical record* into a
*migration-intelligence layer*: it explains **why** people moved, **what** the player can do, and **who**
the diasporas are, almost entirely **read-only over data the sim already produces**, so the balance risk
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

#### 15.0a `emigration-explain.js` (decompose push & pull into labeled contributions) SHIPPED

The single source of "why", live as [emigration-explain.js](../ui/emigration-explain.js). Read it before
building L/M/N/P, each is meant to be thin formatting over these rows, never its own reasoning.

- `explainPull(src, dest, ctx)` / `explainPush(signal, ctx)` → `[{ key, label, delta, kind }]`, sorted by
  `|delta|` descending, `[]` for anything with no decision to explain (null inputs, a pair `adjustedPull`
  rejects, a `crossCivEnabled: false` cross-civ pair).
- `weigh(rows)` → the same rows with a `weight` (`|delta| / Σ|delta|`). **This is the honesty rule made
  callable**: the deltas are model-score points with no player-meaningful unit, so only the ratios may be
  rendered. Never "−42% of your population". `weigh` excludes the multiplicative row for you.
- `factorLabel(key)` → the display label. `LOC_EMIG_EXPLAIN_*` keys are referenced but **not yet defined**:
  nothing renders these strings until Feature L mounts them, so L adds the keys to `en_us` + the 11
  locales. Until then `loc()` resolves them to the English fallbacks in the module. No parity debt today.

**Two spec corrections, worth knowing before you extend it.**

1. Leave-one-out was not buildable and was not needed. The original spec said to re-evaluate
   `adjustedPull()` with one factor neutralized. There is no seam for that, the factors come from
   `CONFIG` globals and private helpers (`tiltFor`, `crossCivBlock`, `dominanceFor`), so neutralizing one
   means mutating global state, which is not pure and races the engine's own `setNeutralBorders`
   counterfactual. It is also degenerate: pull is `(Σ additive terms) × permeability`, so a term's
   leave-one-out delta **is** `raw × permeability`. The shipped code computes that directly and exactly.
2. `kind` follows the sign, on both sides. The spec fixed `kind: "push"` for the push builder. A fixed
   kind has to call a thriving economy a "push", and the terms that RETAIN people are exactly what an
   advisor (N) must be able to name. One rule now: `delta > 0` = "pull", `< 0` = "push", plus `"scale"`
   for permeability.

**How the attribution stays honest**, and the two different mechanisms, do not conflate them:
- Pull is a MIRROR. `pullBreakdown()` lives next to `adjustedPull()` in
  [emigration-pull.js](../ui/emigration-pull.js) and re-lists its terms. It is not called by
  `adjustedPull`, which runs per (source × destination) pair and bails early on a non-positive gradient,
  it must not pay for an itemized array. **The mirror is only as good as the fixture**: the
  all-terms-at-once reconstruction case in `tests/explain.mjs` is what pins it, and it exists because the
  first version of that test left congestion/dominance/tilt/flight/aggressor at zero and happily survived
  deleting them. If you add a pull term, add it to `PULL_TERMS` in that test.
- Push is DELEGATED. `baseBreakdown()` / `situationalBreakdown()` in
  [emigration-prosperity.js](../ui/emigration-prosperity.js) are the source of truth and `baseScore()` /
  `situationalPercent()` are now just their sums (summed in the terms' declared order, so the arithmetic
  is unchanged, engine snapshots are byte-identical). Drift is structurally impossible here; a term
  changing value is caught by `tests/prosperity.mjs`, not by the reconstruction.

**One modeling subtlety to preserve.** `prosperity = base × (1 + Σ situational%/100)`, so a situational
penalty's contribution is `base × %/100`. On a city whose base has gone **negative** (poor, unhappy,
crowded) a signed multiply flips a siege into a positive "attraction", the same pathology the F2 guard
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

### Feature L ("Why did they leave / go there?" explainer) SHIPPED

> **Kept only for the two design corrections below**; the rest is in the tree. `migrationExplainer`
> (config + `readout` tunable), [emigration-explain-view.js](../ui/emigration-explain-view.js)
> (`buildExplainModel` pure / `explainModel` gathering / `renderExplain` / `mountExplain`), and
> `tests/explain-view.mjs` in the gate. It defined the `LOC_EMIG_EXPLAIN_*` keys the §15.0a substrate
> referenced, so those are now real strings in all 12 locales. Remove this section on the next doc pass
> once M/N/P have read it.

**Two spec corrections, worth knowing before you build M/N/P on this.**

1. The "existing {Civ} community" row could not be a weighted row, and is a NOTE instead. The spec
   listed "Prosperity, Open borders, Existing Roman community, Alliance" as peer rows. Only the first is
   an addend. Chain migration is Feature K (§11) (unbuilt) so a destination's diaspora contributes
   **exactly zero** to today's pull; and permeability (open borders / alliance) is the multiplicative
   channel `weigh()` leaves out on purpose. Synthesizing a delta for the community row would not merely
   overstate that row: the fabricated magnitude enters `weigh()`'s denominator and **silently falsifies
   every other row's share**. So the shipped model renders three distinct things, weighted `leaving` /
   `drawnTo` factors, a `permeability` multiplier reported as `×N` (its `factor` is the honest number,
   per §15.0a), and a `community` context note. When K ships, its `enclaveAffinity` folds into `tiltFor`
   and the existing `tilt` row carries it as an earned weight, with no change to this surface.
   `tests/explain-view.mjs::testCommunityDoesNotDisturbWeights` pins that the notes cannot move a weight.
2. The network-tooltip mount (b) was not built: it is a category error, not an oversight. The
   spec's three mounts were readout / network tooltip / lens hover. Mounts (a) and (c) shipped; (b) is
   deferred to §20b because the network view is a **historical playback** surface (`pb.idx` scrubs
   `frames[]`, and the scene's dots span the whole timeline) while the explainer is a **live,
   current-turn** decomposition of `collectCitySignals()`. Pinning today's cause stack onto a turn-40
   frame would attribute present reasons to the past. The scene also carries no city key to resolve a
   signal with, only `(civ id, city name)`, the same pair `cityNetSeries` keys on. Both are solvable
   (match on owner+name; gate on the scrubber sitting at the live frame) but that is a real feature, not
   a mount, so it is written up separately rather than smuggled in here.

**Other things worth knowing.**

- New seam: `pullContext(src, ranked, ownerPop)` ([emigration-pull.js](../ui/emigration-pull.js)) →
  `{flee, ownerPop, aggressors}`. `bestDestination` and the explainer both build their context through
  it, so a hovered city can't be explained against different inputs than the sim decided with (before
  it, a tooltip that forgot to look up aggressors would silently report an `aggressor` row of 0 for a
  besieged city). Use it for M/N/P too.
- The explainer is memoized per turn (`resetExplainCache()`, registered with the cache-reset
  convention). Unlike the readout (one snapshot per *selection*) this is mounted on hover panels, and
  the gather ranks every settlement in the world. A cursor crossing a civ's tiles would otherwise
  re-rank it dozens of times a turn.
- **New generic hook: `HoverPanelSpec.decorate(panel, signal)`**
  ([emigration-lens-hover-panel.js](../ui/emigration-lens-hover-panel.js)), called once per new tile.
  The panel's `rows` contract is title + flat strings, so anything with structure (the weight bars)
  mounts through here. It is a spec hook, not a call in that module, so the shared panel stays agnostic
  about which features exist, the Prosperity lens opts in. Reuse it for O/X rather than widening `rows`.
- Row display rules live in the view, not the substrate: `MAX_ROWS = 5` and `MIN_WEIGHT = 0.005`.
  Truncation is honest here because each weight is a share of the FULL decomposition, so a shown row
  means the same thing whether or not the tail is drawn, a truncated group sums to ≤ 1 and is **not**
  renormalized (`tests/explain-view.mjs` pins both halves of that).

---

### Feature M: Migration forecast ("next 5 turns" / "Will depart soon") *(low–medium)*

**Motivation (why this is now the priority, 2026-07-17).** The City Details panel's flow lists were
reworded this pass from the misleading present tense ("Departing to") to an honest past-tense,
all-game ledger ("Departed to (all game)"), and each corridor now names its dominant cause ("… -
mostly Unhappiness"). That fixes the "who already left and why" half of the panel. What it does
*not* do is tell the player who is *about* to leave and when, the thing a player most wants in
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
`CONFIG.emigrationBar`. **No model change is required**: this is a conservative linear projection.

**Implementation.**
1. Projection. `forecastFor(snapshot, turns = CONFIG.forecastTurns) → { netPeople, direction, driver,
   topSourceName? }` in a new file [emigration-forecast.js](../ui/emigration-forecast.js): project recent
   per-city net (from the §15.0b feed or `ownerNet` scaled by the city's share of empire flow) forward by
   `turns`, **damped** toward zero by `onCooldown` and by a configurable `forecastDecay` so it never reads
   as a guarantee. `driver` is the top `explainPush` factor; for inbound forecasts, the top likely source
   is the largest current outflow corridor toward this city (from `migrationFlows()`
   [emigration-migration-stats.js](../ui/emigration-migration-stats.js#L566)).
2. **Render, two surfaces, one projection.**
   - City Details "Will depart soon" block (primary, per the 2026-07-17 motivation). Add a
     `forecast` field to the panel view-model in
     [emigration-city-panel-data.js](../ui/emigration-city-panel-data.js): the host
     ([emigration-city-panel.js](../ui/emigration-city-panel.js)) calls `forecastFor()` and passes the
     already-resolved `{netPeople, direction, driverName, topSourceName?}` (resolve the driver label
     via `causeLabel()` host-side, exactly as the new `topCauseName()` helper resolves the ledger's
     dominant cause, keep the pure model DOM/engine-free). The block renders only when the flag is on
     and the projection is non-trivial; place it directly ABOVE `departingHeading` so "will depart" and
     "departed" sit together.
   - HUD readout line (secondary, the original spec): one line appended in `readoutModel()`
     (**L89**), same wording.
3. Conservatism. Clamp the horizon (`forecastTurns` default 5, max ~10) and the magnitude (cap at, e.g.,
   the city's rural pool so it can't predict draining below the floor).

**Config / tunables.** `cityReadoutForecast: true` (gates both surfaces), `forecastTurns` (choice
`[3,5,8]`), `forecastDecay` (module const). `readout` group.
**Localization.** `LOC_EMIG_FORECAST_LOSE`, `LOC_EMIG_FORECAST_GAIN`, `LOC_EMIG_FORECAST_DEST`
("…destination for refugees from {civ}"), `LOC_EMIG_FORECAST_STABLE`, plus a panel heading
`LOC_EMIGRATION_PANEL_WILL_DEPART` ("Will depart soon"): all 11 locales via the i18n pipeline
(`i18n_extract` → `i18n_apply`, parity enforced by `tests/i18n.mjs`).
**Tests.** `tests/forecast.mjs`: monotonic in recent net; damped by cooldown; never projects below the
rural floor; stable city → "stable" branch; off flag → no line. Panel wiring: extend
`tests/city-panel.mjs` for the `forecast` block (present when on + non-trivial; absent when off/stable).
**Risk.** Low, but word it as a forecast and keep the cap, or players will treat it as a promise. The
"Will depart soon" heading sitting right above "Departed to (all game)" makes the past/future contrast
explicit, which reinforces the framing.

**Prerequisite shipped (2026-07-17):** the City Details ledger rework this feature builds on, see the
CHANGELOG "Fixed" entry for the panel relabel + per-corridor cause. The `topCause()` helper
([emigration-causes.js](../ui/emigration-causes.js)) and host-side `topCauseName()`
([emigration-city-panel.js](../ui/emigration-city-panel.js)) are the pattern to follow for resolving
the forecast driver label.

---

### Feature N: Migration advisor (actionable recommendations) *(low–medium)*

**Goal.** A short advisor block tied **only to levers the player actually controls**: *"To reduce
emigration from Ravenna: raise happiness, end nearby war pressure, or slot Open Borders. To attract
migrants to Carthage: improve prosperity, keep Open Borders, build stability before the age transition."*

**Current state.** The levers are all readable: happiness via `cityHappinessStage()`
([emigration-polity.js](../ui/emigration-polity.js#L133)); war/violence via the push components
(§15.0a); border stance via `borderStance()` ([emigration-borders.js](../ui/emigration-borders.js#L191))
and `activeAttractions()` (**L171**); government via `readGovernment()` (**L188**); integration load via
`assimLoad` on the snapshot. **The advisor must map the top push/pull factor to its controllable lever,
not invent options.**

**Implementation.**
1. Lever table. `ADVISOR_LEVERS` in a new file [emigration-advisor.js](../ui/emigration-advisor.js):
   `[{ factorKey, available(snapshot): bool, tipLoc }]` mapping each `explainPush`/`explainPull` `key` to a
   recommendation **only if the lever is reachable** (e.g. suggest "slot Open Borders" only when the civ
   isn't already Open and `bordersEnabled`; suggest "end the war" only when `isRefugeeCause`/violence is the
   top push). This guard is the whole point: `available()` filters out non-options.
2. Builder. `advise(cityId) → { reduceOutflow: string[], attract: string[] }`: take the top 2–3
   `explainPush` factors → reduce-outflow tips; top 2–3 `explainPull` gaps → attract tips. Cap at 3 each.
3. Render. Collapsible advisor block under the readout (or an "advisor" toggle), reusing `renderExplain`'s
   row idiom. Gate behind the same expand state as L.

**Config / tunables.** `migrationAdvisor: true` (`readout` group).
**Localization.** One `LOC_EMIG_ADVISE_*` per lever (`_HAPPINESS`, `_WAR`, `_OPEN_BORDERS`, `_PROSPERITY`,
`_STABILITY`, `_INTEGRATION`, `_GROWTH`), plus headers `LOC_EMIG_ADVISE_REDUCE` / `LOC_EMIG_ADVISE_ATTRACT`.
**Tests.** `tests/advisor.mjs`: a war-pushed city yields the war tip; an already-Open civ never gets
"slot Open Borders"; tips cap at 3; off flag → empty.
**Risk.** Low, the only failure mode is recommending an unavailable lever; the `available()` guard plus a
test prevents it.

---

### Feature O: Per-city migration event feed *(low)*

**Goal.** A short recent-history strip in the readout: *"Turn 87: 34k left for Athens after war began · Turn
90: 12k arrived from Egypt · Turn 93: Greek community reached 25% · Turn 96: return migration began."*
Makes the city feel alive moment-to-moment (finer-grained than the Chronicle).

**Current state.** The substrate is §15.0b (`cityEvents(cityKey, limit)`). Record shapes carry everything
needed: `moveRecord/departRecord/arriveRecord`
([emigration-migration-records.js](../ui/emigration-migration-records.js#L64)/[**L93**](../ui/emigration-migration-records.js#L93)/[**L117**](../ui/emigration-migration-records.js#L117))
carry `srcName/destName/people/cause/phase/originCiv`. Diaspora-tier crossings come from
`detectFoundingForCity()` ([emigration-diaspora.js](../ui/emigration-diaspora.js#L127)); returns from the
return system. The chronicle already aggregates the *grand* moments, this is the *local, frequent* feed.

**Implementation.**
1. Source. `cityEvents(cityKey, n)` from §15.0b for the move rows; merge the city's chronicle entries
   (`chronicleLog()` ([emigration-chronicle.js](../ui/emigration-chronicle.js#L215)) filtered to this city)
   for the diaspora/return rows so tier-crossings appear. Merge, sort by `turn` desc, slice to `n`.
2. Render. `renderCityFeed(parent, rows)` in [emigration-city-readout.js](../ui/emigration-city-readout.js):
   one muted line per row, `formatPeopleExact()` + localized verb by `kind` + `otherName`.
3. Throttle. Cap rows (`cityFeedRows` default 5).

**Config / tunables.** `cityReadoutFeed: true`, `cityFeedRows` (choice `[3,5,8]`). `readout` group.
**Localization.** `LOC_EMIG_FEED_OUT` ("{people} left for {city}"), `_IN`, `_DIASPORA`
("{civ} community reached {pct}%"), `_RETURN`.
**Tests.** `tests/city-feed.mjs`: `cityEvents` filters to the right city, newest-first, length-capped;
empty city → empty feed (no throw); merges chronicle + moves without dupes.
**Risk.** Minimal, presentation over existing records.

---

### Feature P: Contextual policy impact preview *(medium; high community appeal)*

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
1. Counterfactual estimate. `previewPolicy(pid, cardKind) → { immigrationDelta, influenceDelta,
   integrationDelta, topSources: string[] }` in a new file [emigration-policy-preview.js](../ui/emigration-policy-preview.js).
   Re-rank under the toggled stance: snapshot current pull totals, then re-evaluate with the candidate
   stance applied (the borders module already has the neutral-toggle path used by `permeability()`); the
   delta in summed inbound pull × the per-pass budget approximates `immigrationDelta`. Influence/Production
   deltas read straight off the card's native modifier table (per-age constants). Integration delta =
   `immigrationDelta ×` the per-migrant load constant. `topSources` = the largest current outflow corridors
   that the stance would open (from `migrationFlows()` [**L566**](../ui/emigration-migration-stats.js#L566)).
2. Honest hedging. Prefix with "~" and label "estimated this turn"; clamp to the per-pass budget so it
   can't claim more than the bar allows.
3. Render. `renderPolicyPreview(parent, model)`: mount on the dilemma/border UI and in the guide. The
   dock decorator path ([emigration-dock-decorator.js](../ui/emigration-dock-decorator.js#L138)) or the
   dilemma view ([emigration-dilemma-view.js](../ui/emigration-dilemma-view.js#L122)) are the natural hosts.

**Config / tunables.** `policyPreview: true` (`readout` group).
**Localization.** `LOC_EMIG_PREVIEW_IMMIG`, `_INFLUENCE`, `_INTEGRATION`, `_SOURCES`, `_ESTIMATE_NOTE`.
**Tests.** `tests/policy-preview.mjs`: Open stance yields positive immigration delta, Closed negative;
Influence delta matches the card's per-age constant; `topSources` capped; off flag → no preview.
**Risk.** Medium, the counterfactual must reuse the **existing clamped** permeability path (no new
unbounded math) and must hedge ("~", "estimated"). Do not promise exact yields.

---

### Feature Q: Diaspora profile cards *(low–medium; coolest narrative extension)*

**Goal.** For each major diaspora in a city, a small flavor card: *"Roman Community in Carthage: Share 31%
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
1. Builder. `diasporaCard(cityKey, civ) → { origin, host, share, arrivalEvent, status, effects[],
   homeland }` in a new file [emigration-diaspora-card.js](../ui/emigration-diaspora-card.js): assemble from
   `compositionForCity` (share), the latest matching founding chronicle entry (arrivalEvent/title), the
   composition trend (status = "growing"/"integrating" by comparing successive shares via `seenTurn`), and
   `readPolity(origin)` (homeland = "recovering"/"stable"/"unstable"). `effects` = integration-load tier +
   (if F shipped) blend potential.
2. List. `cityDiasporaCards(cityKey)` → cards for every foreign origin ≥ `DIASPORA_MIN`
   ([emigration-diaspora.js](../ui/emigration-diaspora.js#L33)).
3. Render. `renderDiasporaCards(parent, cards)`: a compact card stack in the readout (and optionally
   in the chronicle detail). Color the header swatch with `civDisplayColor()`. Use `pick()`
   ([emigration-narrative.js](../ui/emigration-narrative.js#L40)) seeded on `city|civ` for deterministic
   flavor verbs.

**Config / tunables.** `diasporaCards: true` (`readout` group).
**Localization.** `LOC_EMIG_DIASPORA_CARD_TITLE` ("{civ} community in {city}"), `_ARRIVED`
("Arrived mostly during {event}"), `_STATUS_*` (growing/integrating/blended), `_HOMELAND_*`.
**Tests.** `tests/diaspora-cards.mjs`: one card per foreign origin ≥ min; status reflects share trend;
single-origin city → no foreign cards; missing chronicle → graceful "arrived gradually" fallback.
**Risk.** Low–medium, read-only; the only care is graceful fallback when no chronicle row exists for an
origin (don't throw). Overlaps Feature I (story follow-ups): share the status/tier wording.

---

### Feature R: Migration milestones (in-mod "achievements") *(low)*

**Goal.** Memorable, shareable in-mod milestones (not Steam achievements): *First Great Exodus · First
Cosmopolitan Capital · Largest Diaspora in the World · City of Many Peoples · Homeland Recovered · Closed
Gate, Empty Streets · Refuge of Nations · Brain Drain Crisis · Great Return.* Cheap, fun, screenshot-bait.

**Current state.** The chronicle is the perfect host: `chronicle(entry)`
([emigration-chronicle.js](../ui/emigration-chronicle.js#L153)) with `chronicled(key)` dedupe (**L120**),
`MAX_ENTRIES = 80` (**L14**), and `mirrorToNotifications()` (**L131**). The conditions are all readable:
exodus/founding/return events (diaspora module), diversity (the **shipped** `diversityScore()` /
`cosmopolitanism()` in [emigration-diversity.js](../ui/emigration-diversity.js): reuse it for the
*City of Many Peoples* / diversity predicates rather than re-deriving), net flow
(`netCumFor()` [**L993**](../ui/emigration-migration-stats.js#L993)), homeland recovery (`readPolity`).

**Implementation.**
1. Milestone table. `MILESTONES` in a new file [emigration-milestones.js](../ui/emigration-milestones.js):
   `[{ key, titleLoc, test(ctx): bool }]` where `ctx` bundles the per-pass signals + composition + flow
   tallies. Each `test` is a pure predicate (e.g. *City of Many Peoples* = a city with ≥ N origins above
   5%; *Brain Drain Crisis* = a city with net outflow past a threshold over K passes; *Refuge of Nations* =
   refugee inflow from ≥ M distinct origins).
2. Detect & record. `checkMilestones(ctx)` called from `recordChroniclePass()`
   ([emigration-diaspora.js](../ui/emigration-diaspora.js#L169)) (or `doPass()` between L165–L178): for each
   untriggered milestone whose `test` passes, `chronicle({ kind: "founding"|new "milestone", dedupeKey:
   "milestone:"+key, ... })`. Dedupe via `chronicled()` so each fires once per game. If a new `"milestone"`
   kind is added, extend `ChronicleEntry.kind` (**L19**) and `chronicleTitle()`
   ([emigration-narrative.js](../ui/emigration-narrative.js#L224)).
3. Surface. One toast on unlock via `announceImportant()`
   ([emigration-feedback.js](../ui/emigration-feedback.js#L312)) (respects the existing cooldown
   `cooldownOk()` **L292**).

**Config / tunables.** `milestonesEnabled: true` (`readout` group).
**Localization.** One `LOC_EMIG_MILESTONE_*` title + flavor per milestone in all locales.
**Tests.** `tests/milestones.mjs`: each predicate fires on a crafted ctx and not otherwise; each fires once
(dedupe); off flag → none; a `"milestone"` kind (if added) renders a label.
**Risk.** Low, chronicle-only, deterministic predicates. Keep predicates cheap (run once/pass).

---

### Feature U: Refugee-crisis severity scale *(low–medium)*

**Goal.** For war/disaster/conquest waves, surface explicit severity: *"Refugee Crisis: Severe: 82k
displaced this turn · primary cause War · main route Rome → Carthage · receiving: Carthage, Egypt, Greece."*
Gives moral/historical weight without being exploitative.

**Current state.** Refugee causes are tagged: `REFUGEE_CAUSES`/`isRefugeeCause()`
([emigration-causes.js](../ui/emigration-causes.js#L39)/[**L97**](../ui/emigration-causes.js#L97)). Per-pass
refugee volume and routes are in the stats tallies (refugees in/out; corridors via `migrationFlows()`
[**L566**](../ui/emigration-migration-stats.js#L566) / `foldFlow()` **L313**). Disaster onsets are recorded
by `recordDisasterEvent()` (**L733**). The toast path with cooldown is `announceImportant()`/`cooldownOk()`
([emigration-feedback.js](../ui/emigration-feedback.js#L312)/[**L292**](../ui/emigration-feedback.js#L292)).

**Implementation.**
1. Severity. `crisisSeverity(passMigs) → { tierKey, displaced, cause, routeLabel, receivers[] } | null`
   in a new file [emigration-crisis.js](../ui/emigration-crisis.js): sum refugee-cause people this pass,
   bucket into Minor/Notable/Severe/Catastrophic by thresholds scaled to game speed; `routeLabel` = the
   largest refugee corridor; `receivers` = top destination civ names. `null` when below the Minor floor.
2. Surface. (a) **Toast** via `announceImportant()` (one per crisis tier change, cooldown-gated). (b)
   **Chronicle** entry (`kind: "exodus"`, severity in the title via `chronicleTitle()`). (c) optional **map
   badge** reusing the network `drawEventBadge()` path ([emigration-network-paint.js](../ui/emigration-network-paint.js#L480)).
3. Hook. Call from `recordChroniclePass()`/`doPass()` after `recordMigrations()` so the pass's records
   are available.

**Config / tunables.** `refugeeCrisisScale: true`, `crisisToasts: true` (separate so the scale can show in
the readout/chronicle without toasting). `readout` group.
**Localization.** `LOC_EMIG_CRISIS_*` (Minor/Notable/Severe/Catastrophic), `_DISPLACED`, `_ROUTE`,
`_RECEIVING`. Respectful, factual wording.
**Tests.** `tests/crisis.mjs`: tiering by displaced volume + game speed; only refugee causes count;
sub-floor pass → null; route/receiver extraction; off flags → silent.
**Risk.** Low–medium, keep wording respectful and throttle toasts hard (reuse `cooldownOk`).

---

### Feature V: "Humanitarian response" dilemma *(higher; gameplay + sensitive theme)*

**Goal.** A choice layer over refugee waves: *"Refugees at the Border, admit them fully (more integration
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
the *standing* analog, the dilemma is the *acute* event version.

**Implementation.**
1. Trigger. New `detectHumanitarianDilemma(passMigs, me) → view | null` next to `detectConquestDilemma()`:
   fire only on a **Severe+** crisis (reuse Feature U's `crisisSeverity`) directed at the local player, and
   **rate-limit** via the existing `DilemmaState.spree`/`lastTurn` so it is rare.
2. Options & consequences. Three `CHOICES` (`admit` / `camps` / `close`), each mapping to **existing**
   levers only: `admit` → higher inbound permeability for a few turns + integration load + a diplomacy/
   Influence nudge; `camps` → capped intake + reduced integration drift; `close` → lower openness +
   Influence penalty + a small unrest charge, all via `chargePerTurnCosts()` and the borders multipliers.
   No new unbounded mechanics.
3. Surface. Reuse `showDilemma()`; record the outcome to the chronicle and `logNotification()`
   ([emigration-notifications.js](../ui/emigration-notifications.js#L144)).

**Config / tunables.** `humanitarianDilemma: false` (**off by default**: gameplay + sensitive),
`humanitarianMinSeverity` (default "severe"), `humanitarianCooldownTurns`.
**Localization.** `LOC_EMIG_HUMAN_TITLE`/`_BODY` and per-option `_ADMIT`/`_CAMPS`/`_CLOSE` + notes, all
locales, **carefully worded** (grounded, non-exploitative).
**Tests.** `tests/humanitarian-dilemma.mjs`: fires only on Severe+ and rate-limited; each option charges
the expected per-turn cost (mock `grantYield`/`deduct`); within `[permeFloor, permeCeil]`; off flag → never.
**Risk.** **Highest of this batch** (gameplay + theme). Ship off by default; keep rare, respectful, and
strictly inside existing bounded mechanics; document the intent in the guide.

---

### Feature W: Migration routes become named "cultural corridors" *(low–medium)*

**Goal.** When a route carries enough people over time, name it: *The Eastern Passage · The Carthaginian
Road · The Nile Refuge Route*, surfaced on the flow view and in age recaps. Makes repeated migration feel
historically consequential. **Mechanically just a threshold on cumulative origin→dest flow.**

**Current state.** Cumulative per-corridor flow already exists: `migrationFlows()`/`foldFlow()`
([emigration-migration-stats.js](../ui/emigration-migration-stats.js#L566)/[**L313**](../ui/emigration-migration-stats.js#L313))
key `"srcCiv>destCiv>srcCity>destCity"`; the flow view consumes `frameSegments()`
([emigration-network-flow.js](../ui/emigration-network-flow.js#L258)). Deterministic naming via `pick()`
([emigration-narrative.js](../ui/emigration-narrative.js#L40)).

**Implementation.**
1. Detect & name. `namedCorridors() → [{ key, fromCity, toCity, totalPeople, name }]` in a new file
   [emigration-corridors.js](../ui/emigration-corridors.js): scan cumulative flows; any corridor past
   `CONFIG.corridorThreshold` (scaled to game speed) gets a deterministic `name` via `pick(CORRIDOR_NAMES,
   key)` (refugee-cause corridors draw from a "Refuge Route" name set). Persist the assigned name once per
   corridor (new small state key `EmigrationCorridors_v1`) so it's stable across passes.
2. Surface. (a) Label the flow segment in `frameSegments()`/`drawArrow()` when a corridor is named. (b)
   Feed names into the **age recap** (Feature H) and the **chronicle**. (c) optional list in the dashboard.

**Config / tunables.** `culturalCorridors: true`, `corridorThreshold` (choice). `visuals` group (it paints
on the flow view; keep flow-view toggles together with B/C/D rather than splitting across two groups).
**Localization.** `LOC_EMIG_CORRIDOR_*` name fragments + `_REFUGE_*` variants; all locales.
**Tests.** `tests/corridors.mjs`: corridor named only past threshold; name stable across passes (persisted);
refugee corridor draws the refuge name set; below threshold → unnamed.
**Risk.** Low–medium, additive; keep naming deterministic and persisted so a corridor doesn't rename
between passes.

---

### Feature X: City "migration micro-icons" *(medium; constrained by engine)*

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
1. Status resolver. `cityStatusIcons(cityId) → string[]` (glyph keys) in a new file
   [emigration-city-status.js](../ui/emigration-city-status.js): derive ▲/▼ from `ownerNet`/the §15.0b feed,
   diaspora from `leadForeignOrigin()` ≥ min, crisis from Feature U, return from the return system's active
   set. Pure.
2. Surface (two non-banner hosts). (a) Prepend the glyph row to the **city readout** header
   (`renderPanel()` [emigration-city-readout.js](../ui/emigration-city-readout.js#L167)): guaranteed path.
   (b) Add an **aggregate count badge** to the **dock button** (`addButton()`
   [emigration-dock-decorator.js](../ui/emigration-dock-decorator.js#L114), e.g. "3 cities in crisis").
3. Stretch (best-effort, gated). A world-anchored overlay placing a glyph near the city via
   world→screen coordinate conversion (the same fixed-position injection the toasts use). Mark this
   experimental and feature-flag it separately; **never** assume a banner hook.

**Config / tunables.** `cityStatusIcons: true`, `cityStatusOverlay: false` (the experimental world-anchored
form, off by default). `readout` group.
**Localization.** `LOC_EMIG_ICON_*` tooltips (gaining/losing/diaspora/crisis/return).
**Tests.** `tests/city-status.mjs`: resolver returns the right glyphs for crafted snapshots; net-zero city →
no arrow; flags off → empty.
**Risk.** Medium: **scope honesty**: deliver the readout/dock form; treat true banner placement as
experimental. Don't regress selection wiring.

---

### Feature Y: "What changed this turn?" digest *(low; overlaps H)*

**Goal.** A small, frequent end/start-of-turn digest: *"Migration this turn: Rome lost 41k (mostly to
Carthage) · Athens became a net importer · a Persian community formed in Memphis."* The per-turn cousin of
the end-of-age recap (Feature H). **Optional and throttled** so it isn't notification spam.

**Current state.** Per-pass records flow through `recordMigrations()`
([emigration-migration-stats.js](../ui/emigration-migration-stats.js#L752)); the pass loop is `doPass()`
([emigration-main.js](../ui/emigration-main.js#L158)). The feedback pass already summarizes per-cause via
`reportPassFeedback()` ([emigration-feedback.js](../ui/emigration-feedback.js#L461)): the digest is a
*compact* sibling, not a second toast storm. Net-importer flips come from `netCumFor()` deltas; new
communities from `detectFoundingForCity()`.

**Implementation.**
1. Builder. `turnDigest(passMigs) → { lines: string[] } | null` in a new file
   [emigration-digest.js](../ui/emigration-digest.js): top mover (biggest single-civ net change + its main
   corridor), any net-importer/exporter **flips** this pass, any new diaspora crossings. Cap at ~3 lines;
   `null` on a quiet pass.
2. Surface. Mount once per turn in the dashboard header and/or a **single** throttled toast via
   `announceImportant()` (cooldown-gated, `cooldownOk()` **L292**). Do **not** add per-event toasts.

**Config / tunables.** `turnDigestEnabled: false` (**off by default** to avoid spam), `digestToast: false`,
`digestLines` (choice). `readout` group.
**Localization.** `LOC_EMIG_DIGEST_TITLE`, `_LOST` ("{civ} lost {people}, mostly to {city}"), `_FLIP_IN`
("{civ} became a net importer"), `_NEW_COMMUNITY`.
**Tests.** `tests/digest.mjs`: top-mover selection; flip detection from net deltas; line cap; quiet pass →
null; off flag → silent. Overlaps H, share the corridor/`formatPeopleExact()` helpers.
**Risk.** Low, but **default off** and single-toast-throttled; the failure mode is spam, not correctness.

---

### Feature Z: Exportable migration history *(low; data-export audience)*

**Goal.** The chart/rankings/archive audience likes data export. Add: copy migration records to CSV, copy
city composition to CSV, copy age recap to clipboard, export the chronicle as text.

**Current state.** The data is all in hand: flows/tallies in
[emigration-migration-stats.js](../ui/emigration-migration-stats.js) (`migrationFlows()` **L566**,
`netCumFor`/`grossInCumFor`/`grossOutCumFor` **L979–993**); composition via `compositionForCity`/
`compositionForOwner` ([emigration-composition.js](../ui/emigration-composition.js#L510)); chronicle via
`chronicleLog()` ([emigration-chronicle.js](../ui/emigration-chronicle.js#L215)); the recap from Feature H.

**Implementation.**
1. Serializers. `toCsvRecords()`, `toCsvComposition()`, `chronicleToText()`, `recapToText()` (pure
   string builders) in a new file [emigration-export.js](../ui/emigration-export.js): iterate the existing
   getters, emit RFC-4180-safe CSV (quote/escape) and plain text. No engine reads, accept the already-built
   arrays so the functions are trivially testable.
2. Surface. Small "Copy CSV / Copy text" buttons in the dashboard footer. Clipboard write is GameFace-
   constrained, probe for a clipboard API; if absent, fall back to rendering the text into a selectable
   `<textarea>`/`<pre>` the player can copy manually (document the fallback).

**Config / tunables.** `historyExport: true` (`readout` group).
**Localization.** `LOC_EMIG_EXPORT_*` button labels + the manual-copy fallback hint.
**Tests.** `tests/export.mjs`: CSV escapes quotes/commas/newlines; row counts match input; empty input →
header-only CSV; chronicle/recap text round-trips the entries. (Clipboard side-effect is not unit-tested;
assert the serializers.)
**Risk.** Minimal, pure serializers; the only unknown is the clipboard API, handled by the `<textarea>`
fallback.

---

### 15.16 Sequencing & the version headline

These are mostly **read-only and low-balance-risk**, so they can ship faster than the gameplay batch. The
shared substrate (§15.0) is the gate, build it first; L/M/N/P collapse to thin formatting afterward.

1. §15.0 substrate: `emigration-explain.js` has **shipped** (§15.0a); `cityEvents` (§15.0b) is the
   remaining prerequisite, for O/M's feed.
2. L: Explainer shipped (the keystone; everything below is now thin formatting over it, read
   §15.1's two spec corrections and the `pullContext` seam before building M/N/P). Next: **O: City
   feed** (needs §15.0b) → **M, forecast** (the readout becomes live and forward-looking). *(E,
   sparkline shipped; it already reads the §15.0b substrate M/O share.)*
3. N (Advisor + **P) Policy preview** (turn legibility into agency; P is high community appeal).
4. Q: Diaspora cards (flavor + screenshot bait; Q overlaps F/I). *(S, diversity ranking and
   T, cosmopolitanism shipped, sharing `emigration-diversity.js`; they created the `readout` tunable
   group and the `diversity` dashboard section that later readout features join.)*
5. R (Milestones + **U) Crisis severity** + **W (Cultural corridors** + **Y) Digest** (chronicle/
   feed surfaces; U feeds V and X; Y and W overlap H; default Y off).
6. X: Micro-icons (deliver the readout/dock form; world-overlay experimental) and **Z: Export**
   (data audience).
7. V: Humanitarian dilemma last (highest risk: gameplay + sensitive theme; off by default, rare,
   respectful, strictly bounded).

**Version headline: "Migration Intelligence Update":** *Adds migration explainers, city forecasts, an
advisor, contextual policy-impact previews, diversity & cosmopolitanism rankings, and diaspora profile
cards, so players understand not just **where** people moved, but **why**, and **what they can do about
it**.* The shortlist that carries that headline: **L (explainer), N (advisor), O (city feed),
P (policy preview), Q (diaspora cards), X (micro-icons)**: all readability-first, all low balance risk,
most default on. *(S/T (the diversity/cosmopolitanism ranking) shipped first; **L, the explainer,
has now landed** and is the keystone of the headline.)*

---

## 16. Shared foundations & cross-feature overlaps

The substrates and coordination rules that multiple features reuse. Build each **once** and have every
consumer read it, rather than letting each feature grow a parallel copy, the items below are where that
duplication would otherwise creep in: one per-city history feed, one per-owner totals source, one
chronicle-kind edit, one dilemma arbiter, one of each tunable group.

### 16.1 Anchors are hints, not truth

The `file:line` anchors throughout this document drift as the tree moves. Treat the **function name** as
the source of truth and re-grep before editing; where a feature's "Current state" block and this section
ever disagree, the more recently verified value wins.

### 16.2 One per-city history substrate, not three (M ∩ O; E shipped on it)

**Resolution (shipped for E):** §15.0b's `cityEvents(cityKey, limit)` is the single per-city history
getter. Feature E (sparkline) **shipped** as `cityNetSeries` (a thin reduction of that substrate) living
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
[emigration-window.js](../ui/emigration-window.js)) rather than importing the stats/borders modules, that
keeps the metrics pure and unit-testable off-engine. Later readout features can bind the same seam.

### 16.4 One coordinated `ChronicleEntry.kind` extension (H ∩ R)

Two remaining features add a new chronicle kind: H (`"recap"`) and R (`"milestone"`). These are the
**same edit** to two spots, the `kind` union (**L19**) and `chronicleTitle()` (**L224**).
**Resolution:** if both H/R ship, add all needed kinds in **one** pass with one label-map and one
title-switch update; don't land two half-edits to the same union. (The shipped Cultural Quarter system did
**not** add a chronicle kind, quarters surface via the dilemma modal and reuse the existing
exodus/founding/return kinds, so it is not part of this edit.)

### 16.5 Dilemma arbitration: V must not collide with the existing dilemma (V ∩ §12.2b ∩ existing)

Feature V (`detectHumanitarianDilemma`) and the shipped `detectConquestDilemma()`
([emigration-dilemma.js](../ui/emigration-dilemma.js#L268)) can both want to fire in the same turn, and
§12.2b option-2 proposes a *third* dilemma-style panel. There is **one** dilemma surface (`showDilemma()`,
one modal). **Resolution:** add a single arbiter in the dilemma module, at most one dilemma per turn,
priority `conquest > humanitarian > (selective-borders panel)`, all sharing the existing
`DilemmaState.spree`/`lastTurn` rate-limit (**L45**). Do not let two `showDilemma()` calls race. V's spec
already routes through that state; this makes the precedence explicit.

### 16.6 Tunable groups: `visuals` and `readout` are each created once

Features B/C/D each say "a new `visuals` group" and §13.1 says the same; §15 adds a `readout` group. Only
the **first** feature to land in each group creates it; the rest **join**. Allocation: **`visuals`** = the
canvas/flow-view toggles (B particles, C brain-drain, D pins, W corridor labels, J pressure lens);
**`readout`** = the intelligence panel toggles (L–T, U scale, X icons, Y digest, Z export). Feature W's
earlier "`readout`/`visuals`" ambiguity was resolved to **`visuals`** (it paints on the flow view).

**Both groups now exist: JOIN them, don't re-create them.** `readout` was created by the shipped
diversity ranking (S/T) and `visuals` by the timeline-pins work (D); each is registered once in
`TUNABLES` ([emigration-tunables.js](../ui/emigration-tunables.js)) and given its section header in
`GROUPS` ([ui/options/emigration-advanced-editor.js](../ui/options/emigration-advanced-editor.js)). A new
feature adds only its own `TUNABLES` row with the right `group` key; the header is already there.

### 16.7 Shipped substrates are live, reuse them

Features S (diversity ranking) and T (cosmopolitanism) have **shipped** as
[emigration-diversity.js](../ui/emigration-diversity.js) (pure metrics + ranking) and the `diversity`
dashboard section in [emigration-detail-views.js](../ui/emigration-detail-views.js), fed by
`allCityCompositions()`: a new enumerator on [emigration-composition.js](../ui/emigration-composition.js)
for readers that aggregate ACROSS settlements rather than asking about one city. Feature R's diversity
predicates and Q's card status should read `diversityScore()`/`cosmopolitanism()`, and any feature needing
every city's mix should read `allCityCompositions()` rather than re-walking the ledger.

Features E (net sparkline) and F (cultural quarters) have **shipped** and left reusable substrates: E's
`cityNetSeries` (a thin reduction of §15.0b's `cityEvents`, in `emigration-migration-stats.js`) and F's
Cultural Quarter/Enclave system (state, registry, and status vocabulary). Later features read these rather
than rebuilding them: M/O consume the §15.0b feed; Q/I reuse the quarter status wording (see §16.8).

The **§15.0a explain substrate has shipped** as [emigration-explain.js](../ui/emigration-explain.js)
(`explainPull` / `explainPush` / `weigh` / `factorLabel`), together with the breakdown seams it reads:
`pullBreakdown()` ([emigration-pull.js](../ui/emigration-pull.js)) and `baseBreakdown()` /
`situationalBreakdown()` ([emigration-prosperity.js](../ui/emigration-prosperity.js)). **L, M, N and P are
now the thin formatting layers they were specced to be**: L renders `weigh(explainPush(...))` /
`weigh(explainPull(...))`, M's `driver` is `explainPush(...)[0]`, N maps a row's `key` to its lever, and
P's counterfactual re-reads `pullBreakdown` under the toggled stance. None of them may re-derive a reason,
and none may render a raw `delta` (see the honesty rule in §15.0a).

### 16.8 Smaller overlaps (share, don't duplicate)

- Enclave share (K ∩ L): "Existing _ community" in L's explainer is the same composition-share signal as
  K's `enclaveAffinity`. Reuse K's helper if shipped; otherwise read `compositionFor*` share directly.
- Diaspora narrative (Q ∩ I): Q's card "status" (growing/integrating/blended) shares wording with
  I's follow-ups and the **shipped** Cultural Quarter milestone, reuse the quarter system's status
  vocabulary across all three rather than inventing a parallel one.
- Crisis surface (U ∩ D ∩ V): U's optional map badge reuses D's `drawEventBadge()` path; U's severity is
  the trigger input to V. One `crisisSeverity()` (U) feeds all three; don't recompute.
- Corridors (W ∩ H): named corridors feed H's age recap and the chronicle, one `namedCorridors()`
  source, consumed by H, not a second corridor scan.
- `formatPeopleExact()` is treated as existing by H and reused by M/O/U/Y/Z, verify it's exported
  before the first consumer lands (it's used by the flow view today).

---

## 17. Carried-over deferred features

These were once tracked in the cleanups backlog (§18–§26) but are genuine **net-new features**, not the
correctness/perf/maintainability cleanups that backlog descends from, so they live here with the rest of
the feature roadmap. Each follows the §13 cross-cutting checklist and carries the "revisit when" trigger
it had in the backlog.

### 17.1 Feature AA: Wire the staged Migration Chronicle view *(DROPPED)*

**Dropped.** The Chronicle already has a UI home: v1.6.0 folded it into the **Notifications** tab, where
each chronicled moment surfaces as a purple-accented "Chronicle"-type entry via `mirrorToNotifications()`
([emigration-chronicle.js](../ui/emigration-chronicle.js)). A second, dedicated Chronicle sub-tab was
judged redundant, so the staged standalone renderer (`renderChronicle` / `emigration-chronicle-view.js`,
never mounted) was **removed** rather than wired up. The Chronicle **data** layer stays fully live. Reopen
this only if a dedicated Chronicle tab is genuinely wanted, in which case the view must be rebuilt (see
git history for the removed renderer).

### 17.2 Feature AB: City-local migration brakes (Phase 5) *(higher, gameplay; off until shakedown)*

**Goal.** Move the assimilation / congestion **braking** load from **civ scope to city scope** so
congestion penalties bite per destination city rather than empire-wide, the optional follow-on to the
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
1. Re-key the load by destination city id. Change the `EmigrationAssim_v1` load store and
   `addAssimilationLoad(destOwner, destPopulation)` / `tickAssimilation()` / `assimLoadFor()` /
   `congestionPenalty()` to key on destination city id instead of owner pid. Ship a **compatibility
   migration** that folds any existing owner-scoped persisted load into the new city-keyed shape on first
   load (don't drop accumulated load on upgrade).
2. Bound it. Keep the same caps/clamps the civ-scoped version uses so per-city braking can't exceed
   the existing empire-wide ceiling; run the migrated path through the balance harnesses
   (`scripts/snowball-stress.mjs`, `calibration-sweep`).

**Config / tunables.** `cityScopedBrakes: false` (**off by default**: it changes braking behavior);
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
**Risk.** Gameplay/balance + a persisted-state migration, ship off by default, validate with the
balance scripts, and document.

### 17.3 Feature AC: Emigration of urban population *(built 2026-09-12 as the crisis urban leg, REMOVED 2026-09-14)*

> Removed 2026-09-14, before release: no script operation removes a specialist (`ASSIGN_WORKER -1` only
> desyncs the worker counter; `engine-limits-from-probes.md` 1.4), and building loss was ruled out for
> players. Only rural tiles leave. The notes below record what was built and the original spec.

> Shipped: `urbanEmigrationEnabled` / `urbanFloor` / `maxUrbanLossPerCityPerTurn` / `urbanLossCapPct` /
> `urbanRecoveryTurns` in
> `emigration-departure-tile.js` (`urbanReserveKind`, `takeUrbanPoint`, `abandonForDeath`), reserved in
> `consumeSourcePoint`, gated in the engine by `canShedPoint` / `canShedAny`. Crisis only, rural first,
> specialists (local) then buildings. The notes below are the original spec.


**Goal.** Extend the migration model beyond rural population so a city's **urban** population can also
leave under sufficient pressure, a besieged/collapsing city today only ever bleeds its rural workers,
so the urban core is all but immortal to migration.

**Current state.** The mod's **only** population write is `city.addRuralPopulation(±1)`, wrapped by
`moveRural` / `removeRural` / `addRural`
([emigration-population.js:487-533](../ui/emigration-population.js#L487-L533)). By design it "only ever
removes rural population, so the urban core and the settlement itself survive until an actual capture"
(README §Outlet). This feature would relax that deliberate floor for the crisis track only.

**Open questions (resolve before design).**
1. Is there an engine lever at all? Verify whether a symmetric `city.addUrbanPopulation(±1)` (or
   equivalent) exists and is callable/writable from the UI VM, cross-civ, the way `addRuralPopulation`
   is: **probe first** (extend `devtools/migration-probe.js`); if there is no such write, the feature is
   dead on arrival and should be recorded in [wont-fix-with-justifications.md](wont-fix-with-justifications.md).
2. What does losing an urban point do to the district/building on that tile? Rural removal leaves the
   improvement intact and merely unworked; the urban analogue (specialists, buildings) is unknown and must
   be observed in-game, not assumed.
3. Should urban emigration ever be voluntary, or crisis-only? Likely crisis-only, voluntary urban
   flight would trivialize city collapse. Gate under the existing crisis track, not the voluntary one.

**Implementation (sketch, pending Q1).** Add urban-aware wrappers alongside the rural ones and route them
only from the crisis/outlet path once rural population is exhausted (urban is the *last* to leave, never
the first). Reuse the deterministic pressure math and the transit queue; do **not** add a second RNG.

**Config / tunables.** New flag, **off by default** (`urbanEmigrationEnabled: false`): it changes the
core invariant that cities survive migration. **Tests.** Characterization test proving off → byte-identical
to today; a rural-exhausted-then-urban ordering test.

**Q1 answered (2026-09-12, `devtools/engine-probe/` runs 6–8):** the urban write is a BUILDING.
`DESTROY_ELEMENT {Kind:"CONSTRUCTIBLE", Owner, LocalID}` on a building removed it and took one urban
population point with it (London granary: urban 14→13; a foreign library: urban 15→14), and
`CREATE_ELEMENT {Kind:"CONSTRUCTIBLE", Type:"BUILDING_X", Location: district plot, Parent, Owner}` added
a building and one urban point. `ASSIGN_WORKER {Location, Amount:-1}` removes a specialist for the local
player only (the op is refused under a foreign player id). Q2 answered: the building goes with the
point. The feature is buildable: crisis-only, rural tiles first, then specialists (local) / buildings.

**Revisit when** the Q1 probe confirms an urban-population write is reachable. **Risk.** High, touches
the mod's central "cities don't die from migration" invariant and depends on an unverified engine API;
must be probe-gated and shipped off by default.

---

The remainder of this document is the **cleanups, QA & conditional backlog**: the
correctness/perf/maintainability cleanups, pending in-game verification, and trigger-gated leftovers that
survived their reviews without shipping. It descends from a series of now-consolidated audits
(`emigration-improvement-review.md`, `emigration-dead-code-audit.md`, the per-module backlogs, and the
2026-07-10 corpus bug-hunt); everything those reviews resolved has shipped and is in the
[CHANGELOG](../CHANGELOG.md). All work here honors the **Conventions & invariants** above and the §13
checklist. Two items once tracked here, the staged Migration Chronicle view (`renderChronicle` wiring)
and the city-local migration brakes, turned out to be genuine net-new features and now live in §17
(Features AA and AB).

## 18. Won't-fix decisions

Deliberate non-changes (closed by decision, with no "revisit if" trigger) live in their own canonical
list: [wont-fix-with-justifications.md](wont-fix-with-justifications.md) (currently **P3**: caching
`situationalPercent`/`distress` is unsafe under `warSiege`; and **C3**: no safe `prepareState`
monoTurn-jump guard). Add new deliberate non-changes there, not here.

---

## 19. Deferred module cleanups: `emigration-causes.js` (from a 2026-06-29 review)

All parked with reasoning; the one item that shipped (`netDrivers()` ±Infinity guard + deterministic
`CAUSE_ORDER` tie-break) is already in the module. The cause string set is **additive-only / never
renamed**, originates as raw returns in `migrationCause()`
([pull.js:47-50](../ui/emigration-pull.js#L47-L50)), and every getter falls back to `other` / `""`: which
is why most of these are YAGNI today.

> **Worked through 2026-06-30 (shipped v1.7.0).** The two-color-map drift item was resolved by deciding intent (the
> `ACCENTS` toast/log accents and `CAUSE_PALETTE` network-dot fills are distinct by design, the
> latter is tuned to harmonize with `CIV_PALETTE`) and adding cross-referencing comments in both files
> rather than consolidating. Three cosmetic-only items with no "revisit if" trigger (split `LABELS`,
> "Return" → "Return Migration" copy, comment punctuation/spelling sweep) were closed by decision and
> moved to [wont-fix-with-justifications.md](wont-fix-with-justifications.md). The items below are the
> ones that remain genuinely conditional, each still gated on an unfired trigger.

1. Frozen `MigrationCauses` / `HeadlineCauses` constants: define cause keys once as frozen objects,
   reference everywhere instead of hand-typed literals (~14 consumer files). *Revisit if:* several new
   causes are added, or contributors would benefit from compile-time keys. (High churn, marginal protection.)
2. `normalizeCause()` + `CAUSE_ALIASES` table: map legacy/persisted keys to canonical on every
   lookup. *Revisit if:* a persisted cause value is ever renamed (then it's *required*, alongside item 3).
   YAGNI today, zero aliases, additive-only set.
3. `netDrivers()` Map-aggregation by normalized cause: sum into a `Map` keyed by canonical cause.
   *Revisit if:* item 2 lands. **Implementation caveat:** apply the `>= 0.5` threshold *after* the sum,
   not before (the review's draft dropped two sub-threshold contributions that should sum past it).

*(Item 4, localization keys `LABEL_KEYS` / `causeLabelKey()`: shipped in v1.9.0 and was removed.)*

---

## 20. Pending in-game verification (manual QA, not runnable off-engine)

- Departures and arrivals made real (2026-09-11): watched hands-free, wants a human pass. The
  engine writes were watched through `devtools/engine-probe/` (tile abandoned and yields dropped on a
  local and a foreign city; automatic placement produced a real improvement; the Migrant unit spawned;
  the mod's own pass abandoned tiles over two Autoplay turns). Still unwatched by a human: the "Ask me"
  pop-up's look and its "Choose where they settle" button opening the place-population view with a
  mouse (the harness drove it from script), and `arrivalPreferSpecialists` seating a specialist in a
  real district. Both are off the default path or cosmetic; verify on the next play session.

The test suite covers the pure logic, but several shipped systems carry an explicit "needs an in-game
visual pass" note (from `SHIP_PLAN.md` and the disaster plan). These are verification TODOs, not code:

- Tile-by-tile prosperity lens ([emigration-prosperity-lens.js](../ui/emigration-prosperity-lens.js)),
  confirm the `GameplayMap.getYields` shape/scale and the per-tile paint read correctly in-engine
  (with the per-city fallback path). Watched 2026-10-16 (watch run 2 block 1 L2, usual set): switching to
  `emig-prosperity-lens` made 6 bucketed `addPlots` calls over 51 plots in 6 colours (the per-tile path, not the
  per-settlement fallback); `working_screenshots/watch2-block1/L2-emig-prosperity-lens.png` shows tiles of one
  settlement in different colours.
- Game-speed "feel" across Online…Marathon, and the **disaster Marathon rebalance**: confirm the
  re-tuned pacing actually feels right in play (the math is unit-tested; the *feel* isn't).
- 1.4.1 happiness/economy recalibration: the polity model (happiness stages / governments /
  celebrations / war weariness) and the rebalanced yield weighting shipped and are unit-tested + bounded
  by the `scripts/` balance harnesses (`calibration-sweep`, `happiness-balance`, `snowball-stress`), but
  the **final balance sign-off still wants in-game observation**. Re-run those harnesses when re-tuning.
  (Full rationale: the implemented `v1.4.1-deep-pass-plan.md` in `mods_research_and_analysis/emigration-docs/`.)
- UI polish from the ship plan: Refugees pill/title wording, per-graph definitions, the Net table
  pills + diverging bar alignment, and cross-civ immigrant dots flying from their origin on load/scrub.
- Player-report round (shipped in 2.0.5): network display + enclave reachability. Off-engine tests cover
  the layout floor (`network-anim`), pinned pie shares, enclave stickiness + force relaxation
  (`composition`), and the pending/forming panel readout (`city-panel`). Still needs an in-game pass:
  confirm all settlements render on both network sub-views, that the Scaled/Civ Pop toggle no longer
  moves the flow-pie percentages, that the City Details panel shows the enclave-progress line, and that
  the new **Force enclave** option actually surfaces the decision modal for a qualifying local city
  (and that enclaves now occur in normal play with stickiness on).

- Feature L (the explainer): never observed in-engine. Off-engine tests cover the model (weights
  are shares; permeability/community stay out of them) and the render (rows, bars, notes, one-time
  stylesheet) against a stub DOM, but the *mounting* is exactly what a stub cannot prove. Needs an
  in-game pass: (a) the two groups actually appear under the city readout on selection and don't
  overflow the panel's `max-width:24rem`; (b) they appear under the **Prosperity lens** cursor panel on
  hover, and the panel still positions correctly now that it is taller (`place()` clamps to the
  viewport, check near the screen edges); (c) the `--dg-fs-72` / `rem` sizing reads correctly at
  non-default UI scales; (d) hovering across a large civ's tiles stays smooth (the per-turn memo should
  make the re-rank happen once, not per tile, if it stutters, that memo is not being hit); (e) the
  weight bars render at all in GameFace (percentage `width` on a nested div, the sparkline's
  percentage `height` idiom works, so this is expected to, but it is unproven).

## 20a. Deferred, notification DELIVERY (out of scope for the Unreleased player-report round)

The player also reported "notifications not working yet." Confirmed **not** part of the enclave fix: the
persistent Notifications *log* works (it's what surfaces the all-civ chronicle milestone entries the
player mistook for "the AI getting enclaves"), and the enclave decision uses the `showDilemma` modal,
not the notification feed. What remains deferred:

- On-screen HUD toasts are DOM-injected onto the HUD root (`emigration-feedback.js`) because the
  engine exposes no toast API; this is inherently fragile across GameFace updates. Revisit if toasts
  are reported missing after the z-order/first-turn fixes in v2.0.5.
- Clickable end-turn notifications: shipped in 3.4.0. Five notification types in
  `data/emigration-notifications.xml` are raised from `ui/emigration-train.js` into the game's notification train,
  and a click opens the Emigration screen. The click itself hasn't been watched in a game yet (3.4.0 release commit).
  Watched 2026-10-16 (watch run 2 block 1 L2, usual set): a `NOTIFICATION_EMIGRATION_NOTE` raised through
  `trainNotify`/`flushTrain` and activated with `Game.Notifications.activate` (the train's click path) opened
  `screen-emigration`.
- Self-Test, watched 2026-10-16 (watch run 2 block 1 L2, usual set): 18 checks render and all nine actions run (Re-run
  checks, Run a migration pass, Force enclave pop-up and Force refugee dilemma each open a dialog, Arm REAL dilemma,
  Fire test toast, Fire all notifications, Open dashboard opens `screen-emigration`, Copy diagnostics). One check
  reads FAIL: "Notification clarity: Notification wording/tint is off (why-there "greater prosperity and proximity",
  pure-flight "", tints rival/internal/arrival #d24b3e/#7d8aa0/#5fae6b). The v2.1.0 clarity change is not active
  here." Not judged; it's on the fix list.
- 3.5.1, watched 2026-10-16 (watch run 2 block 2 G4, usual set, Exploration 4242, `eep-modtest200.js` as a lab
  variant): Pārsa's Abbasid enclave built over at turn 8 ("a new enclave here waits out the dwell") and established
  again at turn 16, the eight-turn dwell, where 3.5.0 re-established within seconds. The Chronicle reads "The Enclave
  Is Built Over", "An Enclave Takes Root", "The Abbasid Enclave" and "The Abbasid Enclave has taken root". The
  Diversity table's cell for Heian-Kyo reads "Abbasid enclave: Fading", matching its record, so block 1's empty
  cells (K4) were rows with no standing enclave. City Details and the tooltip lines are left for the presentation run.

## 20b. Deferred, the explainer on the network view (Feature L mount (b), 2026-07-17)

Feature L specced three mounts; the readout and the Prosperity-lens hover shipped. The **network /
flow tooltip** did not, for a reason worth keeping rather than retrying blind (§15.1, correction 2):

- It is a historical surface. The network view scrubs `frames[]` via `pb.idx`
  ([emigration-network-viz.js](../ui/emigration-network-viz.js)) and its scene holds dots across the
  whole timeline. The explainer decomposes **today's** `collectCitySignals()`. Mounting one on the other
  would attribute the present turn's cause stack to whatever frame the scrubber happens to sit on.
- The scene carries no city key. Nodes resolve to `(civ id, city name)` only, no `owner:localId`,
  so `findSignal` has nothing to match. `cityNetSeries` already keys on `"owner|cityName"`, so the pair
  IS a usable key; it just isn't a lookup that exists today.

**Revisit if/when** the network view grows a live mode, or a player asks for "why?" from the flow map.
The shape then: (1) an `explainModelByOwnerName(owner, name)` lookup beside `explainModel`, reusing the
`cityNetSeries` key convention; (2) a gate so the tooltip only offers the stack when
`pb.idx === frames.length - 1` (the live frame), showing nothing rather than something wrong while
scrubbing; (3) a `decorate`-style hook on the tooltip, mirroring the one added to
[emigration-lens-hover-panel.js](../ui/emigration-lens-hover-panel.js): the network tip is
`setHTML`-based, so it needs the same string-vs-DOM escape hatch.

Do **not** implement it by folding the live stack into the historical tip and hoping the scrubber is
parked at the end.

## 21. More deferred module cleanups (low priority, cities / city-features)

All parked with reasoning in the now-deleted per-module backlogs; only the genuinely-actionable or
conditional ones are kept here (the rest defended states the producer makes unreachable, don't
re-litigate).

> **Worked through 2026-06-30 (shipped v1.7.0).** The one genuinely-actionable item shipped: the chronicle-view
> narrow-panel UX fix (`.emig-chr-head{flex-wrap:wrap}`) is in
> [emigration-chronicle-view.js](../ui/emigration-chronicle-view.js#L27): a long title now lets the
> kind label wrap to its own line instead of crowding it. One cosmetic (rebuild the `CSS` string as a
> `.join("")` array) was closed by decision and moved to
> [wont-fix-with-justifications.md](wont-fix-with-justifications.md). Everything else below is genuinely
> blocked on an external trigger that can't be fired off-engine (an unverified Civ VII API, an unstarted
> localization phase, or gameplay that hasn't been observed yet): each kept with its trigger, none
> safe to "complete" by guessing.

- cities ([emigration-cities.js](../ui/emigration-cities.js)): split `siege` from `razing`: today
  `siege: !!city.isBeingRazed` ([cities.js:191](../ui/emigration-cities.js#L191)) conflates the two.
  **Revisit only with a confirmed Civ VII city-siege / under-attack API** (current API is unverified
  speculation, no such read exists in the codebase to wire up, so this cannot be done now).
- city-features ([emigration-city-features.js](../ui/emigration-city-features.js)): the whole file
  reviewed clean (nothing shipped); the only items worth carrying:
  - `getPurchasedPlots()` ([emigration-city-features.js](../ui/emigration-city-features.js)) does cover the city
    center: Cultural Diffusion's harness read Lihu'e's 24 plots with it and rewrote the center's value along with the
    rest (`cultural_diffusion/devtools/harness/README.md`, build run B4, 2026-09-26, game 1.5.0). The Chronicle's
    geography already reads the center's terrain and buildings, so nothing changes. Closed.
  - Narrative-design tweaks (substring→token matching, `isWater`/`coast` semantics, river-adjacency,
    etc.) are **parked unless the generated prose actually reads wrong in play**: they redefine "has a
    feature," a design decision, not a bug.

**Cross-cutting (collapse when picked up):**
- Frozen-constants family: the cause-keys (§19 item 1) and `CITY_FEATURE` keys are the same small,
  stable, additive set hand-typed across a few modules. Same call: centralizing adds computed-key churn
  for marginal safety. *Revisit if* a third consumer appears or a drift bug actually bites.
- Copied store helpers: `payloadFromBlob` (reads a saved blob with or without the `{ v, data }` envelope)
  is the same function in seven stores: dilemma, dividend, quarter-state, disasters, feedback, return and
  war. [emigration-state.js](../ui/emigration-state.js) has an eighth copy named `payloadFromStateBlob`.
  `nonNegInt` is copied in dilemma and quarter-state, and
  [emigration-diaspora.js](../ui/emigration-diaspora.js) has `safeTurn` and `gameTurn` doing the same
  thing. One shared leaf module would replace them, registered in the game-scope `ImportFiles`. It's a
  pure move, so before it ships, load a save made with the current release and check every store reads
  back the same.

*(The Phase-1 localization sweep that used to sit here shipped in v1.9.0 and was removed.)*

## 22. Enclave stance yields: closed

> **Closed 2026-10-15.** Everything this section was planned around is gone or answered. Its 2026-07-16 write-up
> (the two-tier "recognize, then invest" reward, `ui/emigration-enclave-built.js`, the per-turn stance grant, the
> `+4` improvement and its two wrinkles) is in git history before this date.

What's true today:

- The player-built enclave improvement was removed on 2026-07-17 because it crashed the AI turn (see
  [won't-implement](wont-implement-with-justifications.md)). `ui/emigration-enclave-built.js` and
  `ui/emigration-enclave-probe.js` went with it, into `mod_ideas_tested/_archived-emigration-enclave-feature/`.
- The script places the enclave's tile itself with `CREATE_ELEMENT`
  ([emigration-enclave-place.js](../ui/emigration-enclave-place.js)). The improvements are never buildable, so the
  AI's build evaluator never sees them, and the tile's yield is the engine's own, so the game shows it.
- A stance doesn't pay each turn. It pays once, when the enclave is recognized: Gold, Influence, Science or Culture,
  sized from the host's income, and a stance that doesn't pay Gold costs Gold
  ([emigration-quarter-bonuses.js](../ui/emigration-quarter-bonuses.js),
  [emigration-stance-payout.js](../ui/emigration-stance-payout.js)).
- The question 22b left open, whether a positive `grantYield` lands, is answered, and that's why the one-time
  payout is safe. Gold and Influence land on the treasury at once, Science on the tech in progress and Culture on the
  civic in progress. Food and Production don't land anywhere, and no stance pays them (`engine-closed.md`,
  "`Players.grantYield(pid, yield, n)` writes only player-level pools", watched 2026-09-18 on 1.5.0, mod tests 152
  and 153). Mod tests 154 to 156 then watched a recognized stance's Science reach the tech and its Gold price leave
  the treasury (`devtools/engine-probe/README.md`).
- Since 2026-09-17 an enclave is created (record, tile, the tile's yield) when its community is established, and
  recognized after the dwell, when the stance pays. See `establishEnclaves` / `recordForChoice` in
  [emigration-quarter.js](../ui/emigration-quarter.js) and `tests/quarter-dwell.mjs`. That path hasn't been watched
  in a game yet; `devtools/engine-probe/README.md` says how the old seeded runs would show it.

## Notes / context

- `devtools/migration-probe.js` is a separate diagnostic tool (own `migration-probe.modinfo`); its exports serve
  that probe and are not mod dead code. Its API7 enclave-placement test, and the Self-Test probe after it, both
  failed to place an improvement. Mod test 6 (2026-09-12) found the argument shape that works, and the script has
  placed the enclave's tile since 2.2.0 (`ui/emigration-enclave-place.js`). The old Self-Test probe is archived in
  `mod_ideas_tested/_archived-emigration-enclave-feature/ui/emigration-enclave-probe.js`.
- Every `ui/*.js` the game runs is listed in `emigration.modinfo`. Two aren't, on purpose:
  `ui/emigration-config-types.js` holds only JSDoc types (it's only named inside type annotations), and
  `ui/emigration-demographics-per-cause-metrics.js` is an optional set of Demographics charts that nothing loads by
  default. Both still ship, since the release allow-list takes every `ui/*.js`.
- The mod's larger gameplay roadmap (Features A–K + deepened refugee stance + L–Z, plus the carried-over
  AA/AB/AC in §17) is the feature roadmap in §0–§17; those are net-new features, out of scope for the
  correctness/perf/maintainability review this backlog descends from.

---

## 23. Corpus bug-hunt findings (2026-07-10)

All the confirmed/plausible correctness findings from the tower_mods-wide bug-hunt audit have **shipped**
and are verified in the tree, so they were removed from this backlog: **F1** (age-boundary marker rebase
so the core pass and war/disaster decay clocks survive the `Game.turn` reset, violence/disasters/effects/
combat/feedback/main), **F2** (prosperity double-negative sign-flip that ranked a devastated city as a
magnet), **R1/R2** (`return.js` pool-return population leak + host-signal miscount), **F3** (disaster
accumulation cap on `addDistress`), **F4** (city-flows direction flag instead of an English substring test),
**F5** (`Math.abs(neutral)` stance-impact percent), **F6** (`byId.get` nullish handling in `breakdownTip`),
**F7** (`Array.isArray` guard around the city-signal loop), **F8** (`normalizeViolence` numeric-map
sanitize on load), **L1** (localized lens tooltips), and **L2** (lazy `dilemma.js` `choices()`). See the
[CHANGELOG](../CHANGELOG.md) for the release notes.

**Still open:** none, the last item (below) shipped 2026-07-17.

- **Migration-stats reader staleness: SHIPPED (2026-07-17).**
  [emigration-migration-stats.js](../ui/emigration-migration-stats.js) `load()` cached `_s` for the module
  lifetime and, unlike `composition.js`, never re-read on turn change, so the City Details
  Departing/Arriving lists could show a frozen snapshot while the co-located Population-origins block
  stayed fresh. `load()` now re-reads once per turn (`_loadedTurn`, mirroring `composition.js`), reusing
  the cache within a turn so a pass never churns. Two wrinkles the composition fix didn't have:
  the per-sample **watermarks** (`lastSampled`/`wm*`) are advanced in memory by the samplers and never
  saved, so they are carried across a reload (`carryWatermarks`): otherwise each turn would rewind them
  to the recorder's persisted values and the graphs would replay flow they had already charted; and an
  unreadable store on a turn tick keeps the in-memory state rather than wiping live tallies. Covered by
  `tests/migration-stats-reload.mjs` (wired into `verify` + `test:js`).

## 24. Residual, native-speaker review of the notification-clarity translations (2026-07-14)

The notification-clarity wording rewrite (2026-07-14) and its 11-locale translation refresh **shipped**
(en_us + JS fallbacks reworded; `LOC_EMIG_HINT_ATTRITION`/`_DISASTER`/`_PROSPERITY`, new
`LOC_EMIG_DIGEST_DISASTER_TO`; both `i18n.mjs` and `metrics-loc-placeholders --check` green). What remains
open is **non-blocking native-speaker review only:** the 11 locale strings are best-effort translations
worth a pass for register/terminology consistency. One known nit: the prosperity hint's `{1_City}` swap
left the surrounding possessive (e.g. German "ihre Erträge") agreeing with the old common-noun "this city"
rather than a proper noun, a translator should confirm gender/case agreement per language.

## 25. Rollout-flag retirement, delete never-run legacy branches (proposed 2026-07-02)

**Status:** Proposed, not started, verified 2026-07-14 that every flag/key below is still live in the
tree, so the premises hold. **Scope:** the `emigration` mod only. A follow-up to a complexity audit
asking "is there code/game-logic we don't genuinely need, or that overcomplicates the mod?" This is a
pure refactor with **zero player-visible behavior change**: every targeted flag already sits at its
shipped default, so the engine output over a fixed fake world must stay byte-identical.

### 25.1 Executive summary

The emigration mod is **not accidentally complex.** The 103 UI files / ~31 k LOC are a deliberate
consequence of a ≤500-line single-concern file gate, and nearly every system is documented,
config-gated, and mutation-tested. "Overly complicated" is therefore **not** a code-hygiene problem
and **not** a case for collapsing files or cutting features.

There is exactly one class of genuinely removable carrying cost: **internal "rollout" / reversibility
flags whose `false` branch is legacy code that ships in every build but never runs in real play.**
These were rollback hatches for behavior changes that have since shipped and been validated across
multiple releases. The codebase pays for them permanently, a second implementation to read,
maintain, test, and mutation-cover, for a rollback we will almost certainly never take.

The flagship is `splitTracksEnabled`, which gates a complete **~150-line duplicate engine pass**
(`processSourceLegacy`) plus its own dedicated test coverage.

This plan retires those internal flags in priority order, deletes the dead branches, and removes three
already-dead config keys, with **zero player-visible behavior change** and the test/mutation suite
green between every step.

### 25.2 Goals / non-goals

#### Goals
- Remove legacy code paths that never execute under shipped defaults.
- Shrink the "can be off" surface (fewer branches → smaller test + mutation matrix, less to reason about).
- Delete three config keys documented as inert.
- Preserve every player-visible behavior exactly (this is a refactor, not a balance change).

#### Non-goals (explicitly out of scope)
- Not touching player-facing feature toggles. `disastersEnabled`, `bordersEnabled`,
  `quartersEnabled`, `getDilemmasEnabled`, `returnEnabled`, `integrationEnabled`, `civTuningEnabled`,
  `attritionEnabled`, `happinessShaped`, `warSiege`, `refugeePoolEnabled` are real on/off switches
  wired to Options/tunables, their `false` paths are **features**, not dead code. Keep them.
- Not consolidating "overlapping-sounding" systems (violence / violence-signals / war / raid /
  combat / disasters; dilemmas + cultural quarters). These are distinct scope choices, and the
  narrative ones are player-toggleable. Removing them would be a *design/scope* decision, not a
  dead-code cleanup, out of scope here.
- Not merging files or relaxing the 500-line gate.
- Not a rebalance. Numeric tunables are untouched.

### 25.3 Classification methodology

Each `*Enabled` flag was classified by whether it is **reachable by a player**:

> A flag is scanned for references in `emigration-tunables.js`, `emigration-options.js`,
> `emigration-settings.js`, and `ui/options/`. **Zero references = internal-only** (player can never
> flip it → its off-path is unreachable in normal play → legacy carrying cost).

24 `*Enabled` flags total. Result:

| Class | Flags | Disposition |
|---|---|---|
| **Player-exposed** (off-path is a feature) | `disastersEnabled`, `bordersEnabled`, `quartersEnabled`, `getDilemmasEnabled`, `returnEnabled`, `integrationEnabled`, `civTuningEnabled`, `attritionEnabled`, `happinessShaped`, `warSiege`, `disasterImpactScalingEnabled`, `disasterSpeedShockEnabled` | **KEEP**: do not touch |
| **Internal rollout, heavy branch** | `splitTracksEnabled`, `splitBudgetsEnabled`, `splitUiReadoutEnabled` | **RETIRE** (WS1) |
| **Internal rollout, cheap fail-safe guard** | `gameSpeedTuningEnabled`, `polityModelEnabled`, `deathRampEnabled`, `conquestMigrationEnabled`, `crisisDeathEnabled`, `voluntaryCueEnabled` | **RETIRE, optional/low-priority** (WS2) |
| **Internal but a genuine safety backstop** | `resetCachesOnGameBoot` | **KEEP** (see §25.7) |
| **Sub-flags of an exposed system** | `refugeePoolBurdenEnabled`, `plagueCarryEnabled`, `split* (UI subset)` | KEEP with parent |

Plus three **inert config keys** (not flags): `scaleBase`, `scaleExp`, `scaleGrowth` → **REMOVE** (WS3).

### 25.4 Inventory & touchpoints

Line numbers are indicative (verify against HEAD before editing).

#### WS1, heavy legacy branches (high value)

| Flag | False-path = dead code | Primary touchpoints | Test touchpoints |
|---|---|---|---|
| `splitTracksEnabled` | `processSourceLegacy` + `legacyEmigrate` / `belowEmigrationBar` / `restingOnCooldown`: a full alternate ~150-line source pass | `emigration-engine.js` (gate ~L573; legacy fn ~L416+), `emigration-config{,-types}.js` | `engine-legacy-snapshots.mjs` (item 1 only, see §25.5), `engine-rigor.mjs`, `engine-pass.mjs`, `city-readout-panel.mjs` |
| `splitBudgetsEnabled` | shared single-budget branch | `emigration-engine.js` (~L890–L900), `emigration-config{,-types}.js` | `engine-rigor.mjs`, `engine-pass.mjs` |
| `splitUiReadoutEnabled` | second "one dominant cause" readout renderer | `emigration-city-readout.js`, `emigration-city-readout-data.js`, `emigration-config{,-types}.js` | (none direct) |

#### WS2, cheap fail-safe guards (low value, optional)

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

#### WS3, inert config keys

| Key | Evidence of inertness | Touchpoints |
|---|---|---|
| `scaleBase`, `scaleExp`, `scaleGrowth` | `emigration-config.js:497` header: *"DEPRECATED, no longer read … retained only so saved configs / config-types stay valid; they are inert."* The `game-speed.js:136` and `tunables.js:13` hits are **comments only** (tunables.js:13 literally says they are "intentionally absent" as knobs). | `emigration-config.js` (CONFIG + CONFIG_DEFAULTS), `emigration-config-types.js` (typedef) |

> `gameSpeedScalePopulation` (config.js:58, live at `game-speed.js:144`) *mentions* the
> `scaleGrowth` concept in its comment but does **not** read the key. It is a separate, live flag,
> leave it alone.

### 25.5 Workstreams & sequencing

Do these **one flag at a time**, suite green between each. Order = value-first, and heavy items before
the cheap ones so early PRs carry the payoff.

#### WS1.1: `splitTracksEnabled` (biggest single win)
1. In `emigration-engine.js`: inline `processSourceSplit` into `processSource` (drop the `if
   (CONFIG.splitTracksEnabled)` fork), delete `processSourceLegacy`, `legacyEmigrate`,
   `belowEmigrationBar`, `restingOnCooldown` and any helper now unreferenced.
2. In `engine-legacy-snapshots.mjs`: **delete only item (1)** (the legacy-pass coverage). **Keep items
   (2) the stance counterfactual and (3) the citySnapshot readers**: they share the fake world and are
   unrelated to the flag. Rename the file if "legacy" no longer describes it.
3. Remove `splitTracksEnabled` from `CONFIG`, `CONFIG_DEFAULTS`, and the `EmigrationConfig` typedef.
4. Update `README.md` §2 ("Two concurrent tracks") to drop the "flags exist so the split is reversible"
   note; the split is now unconditional.

#### WS1.2: `splitBudgetsEnabled`
1. In `emigration-engine.js` (~L890–L900): keep the split-budgets branch, delete the shared-pool
   branch and the `budgets.shared` plumbing it feeds.
2. Remove flag from config + typedef; prune `engine-rigor.mjs` / `engine-pass.mjs` cases that set it false.

#### WS1.3: `splitUiReadoutEnabled`
1. In `emigration-city-readout{,-data}.js`: keep the per-cause breakdown, delete the single-dominant-cause
   renderer branch.
2. Remove flag from config + typedef.

#### WS2 (optional): cheap guards
For each of the six: keep the active path, delete the `false` early-return/identity branch, remove the
flag from config + typedef, and prune any test case that sets it false. Land each as its own small commit.
**See §25.6 before doing these**: they may be worth keeping as fail-safes.

#### WS3, dead scale keys
1. Delete `scaleBase`, `scaleExp`, `scaleGrowth` from `CONFIG` and `CONFIG_DEFAULTS`
   (`emigration-config.js:501-503`).
2. Delete their `@property` lines from the `EmigrationConfig` typedef in `emigration-config-types.js`.
3. Confirm saved-config compatibility first (see §25.7): the settings loader must tolerate an old saved
   config that *contains* these keys. If it rejects unknown keys, either (a) keep the keys, or (b) add a
   drop-unknown-keys shim before removing.

### 25.6 The judgment call on WS2 (be honest about this)

WS1 and WS3 are unambiguous wins: real duplicate implementations and documented-dead keys.

WS2 is a genuine tradeoff, not a slam-dunk. Each of those six off-paths is a **one-line neutral
fallback**: `return 1`, `return 0`, or an early guard. Two readings:

- Remove: they're unreachable in real play (not player-exposed), so they're branches that exist only
  to be tested. Deleting them shrinks the mutation matrix and the "this could be off" cognitive surface.
- Keep: a fallback like `if (!gameSpeedTuningEnabled) return 1` is cheap, self-documenting
  graceful degradation. It costs ~1 line and one test case, and it makes the module's behavior legible
  ("with tuning off, this is identity"). That's arguably *good* defensive coding, not cruft.

**Recommendation:** do WS1 + WS3 first and ship them. Treat WS2 as opt-in cleanup, decided per flag,
retire the ones whose false-branch touches multiple call sites or complicates a hot path
(`crisisDeathEnabled` threads through the death channel), and leave the pure one-line identities
(`gameSpeedTuningEnabled`, `deathRampEnabled`) if they read as clean fail-safes. Do **not** treat "10
flags retired" as a target, that would be metric-chasing over judgment.

### 25.7 Explicitly retained (with justification)

- `resetCachesOnGameBoot`: KEEP. Although internal-only, this is **not** a rollout hatch for a
  behavior change. It is a *latent-robustness safety backstop* for the UIScript-isolate reuse bug
  (a new game starting inside a still-live isolate persisting the prior game's cached state, the same
  class of isolate hazard behind the earlier ethnicity-lens bug). Its `false` path ("rely on isolate
  teardown") is a legitimate fallback, and the whole `emigration-cache-reset.js` convention is a
  deliberate defensive layer. Removing the flag would delete a safety net, not dead weight. Leave it.
- All player-exposed flags (§25.2 non-goals). Off-paths are reachable features.
- `disasterImpactScalingEnabled` / `disasterSpeedShockEnabled`. Player-exposed (appear in the
  options/tunables scan) and each "fail-safes to the legacy numbers", that legacy path is reachable, keep.

### 25.8 Verification protocol (per step)

Run between **every** flag removal, not just at the end:

1. Type/lint: `npm run lint` (eslint config enforces the file-size + max-params gates).
2. Unit/integration: `node scripts/run-tests.mjs` (full `tests/` suite must stay green).
3. Mutation (targeted): run the relevant Stryker config for the touched module
   (`stryker.leaf.config.json` / `stryker.engine.config.json`). **Per the no-metric-masking rule:** do
   not exclude the deleted branch from coverage to "keep the number up", the score should move only
   because dead branches (and their now-removed tests) are gone. Record the honest before/after.
4. Behavioral sanity: because every retired flag was already at its shipped default, the engine
   output over a fixed fake world must be **byte-identical** before/after. The snapshot tests in
   `engine-rigor.mjs` / `engine-pass.mjs` are the guardrail, if any snapshot *changes*, the removal
   altered behavior and must be reverted and re-examined.
5. Modinfo/import gate: `tests/modinfo.mjs` must still pass (no orphaned/renamed imports).

Log any deliberate non-change or deferred item to [wont-fix-with-justifications.md](wont-fix-with-justifications.md)
(verdict + reasoning) or this document's conditional backlog sections (§18–§24, deferred/conditional), per
repo convention.

### 25.9 Risks & rollback

- Irony noted: this plan *removes rollback hatches.* The replacement rollback mechanism is **git**,
  each flag is retired in its own commit, so reverting a single commit restores that flag and its
  branch. This is strictly better than carrying the branch in every build forever.
- Saved-config compatibility (WS3, and any config-shape change): removing keys from the typedef could
  break loading a saved config that still contains them, *if* the settings loader validates against the
  typedef / rejects unknown keys. **Action:** before WS3, confirm the loader in `emigration-settings.js`
  (the cascade-safe `modSettings` store) ignores unknown keys. If it doesn't, keep the keys or add a
  shim.
- Hidden readers: a flag may be read somewhere the scan missed (dynamic access, string key). **Action:**
  before deleting each flag, `grep -rn "<flag>"` across `ui/`, `tests/`, `scripts/`, and `*.modinfo` and
  confirm every hit is either the definition or a call site being removed.
- Shared test fixtures: `engine-legacy-snapshots.mjs` covers three unrelated things (§25.5 WS1.1): do
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
"this can be off" surface: **with no player-visible change.**

### 25.11 Checklist

- [ ] WS1.1 `splitTracksEnabled`: inline split path, delete `processSourceLegacy` et al., trim legacy test section, drop key+typedef, update README §2
- [ ] WS1.2 `splitBudgetsEnabled`: delete shared-pool branch + `budgets.shared`, drop key+typedef
- [ ] WS1.3 `splitUiReadoutEnabled`: delete dominant-cause renderer, drop key+typedef
- [ ] WS3, confirm loader tolerates unknown keys → delete `scaleBase/Exp/Growth` from CONFIG/DEFAULTS/typedef
- [ ] WS2 (optional, per §25.6): retire selected cheap guards individually
- [ ] Verification protocol (§25.8) green after **each** step; behavior snapshots unchanged
- [ ] `resetCachesOnGameBoot` left intact (§25.7)
- [ ] Non-changes logged to wont-fix / this backlog per convention

## 26. `emigration-arrivals.js` hardening backlog (deferred: 2026-07-02 review)

Deferred-but-valid ideas from the 2026-07-02 arrivals review. **Tier 1** (defensive per-arrival guard,
`forced`→`expired` rename + comment fixes, empty-`ranked` logging, pooled-refugee cap documentation)
shipped. The items below were assessed as real but **not worth doing right now**: each is either purely
cosmetic, or behavior-changing in a way that would churn the deterministic golden baselines gated in CI
(`engine-legacy-snapshots`, `engine-rigor`, `snapshot-reminder`). Revisit any of these the next time those
snapshots are being re-baselined anyway.

These are *deferred / conditional* (each has a "revisit when…" trigger), which is why they live here and
not in [wont-fix-with-justifications.md](wont-fix-with-justifications.md). A hard rejection (with no
revisit trigger) belongs there instead, e.g. the "softer death→pool for capped arrivals" item, which was
rejected outright.

### 26.1 Tier 2, correct, but changes deterministic outcomes (needs a snapshot re-baseline)

#### `roll01` divides by `0x100000000`: done

`roll01` in [emigration-arrivals.js](../ui/emigration-arrivals.js) now returns `(h >>> 0) / 0x100000000`, so its
range is `[0,1)` as the docstring says, and a murmur3 finalizer was added so seeds that differ only at the end still
spread. It landed in `07cd82a` (2026-09-17), and the engine snapshot tests pass with it. Closed.

#### Explicit tie-breakers in the due-arrival sort

The sort is `defers`-desc only: `(b.defers || 0) - (a.defers || 0)`. Ties currently resolve by
transit-queue order.

- Why it's low priority: V8's `Array.sort` is stable (Node 11+), and the transit array is itself
  deterministic, so equal-`defers` ties are *already* deterministic. A proposed comparator
  (`defers`, then earlier `arriveTurn`, then `destKey`, then `srcName`) is "more literally fair" but not
  more *deterministic*.
- Cost: it changes the tie order → changes which arrivals land first under a tight inbound cap →
  snapshot churn, for a fairness refinement no player would observe.
- Revisit when: we ever move off a stable-sort engine, or we're re-baselining snapshots anyway.

### 26.2 Tier 3, design decisions, not fixes

#### Seed `immediateSettle` from event identity instead of processing turn

The seed includes `now` and `defers`, so a deferred refugee re-rolls its settle-vs-pool decision each
attempt. The review suggests seeding from a stable event identity (e.g. `departTurn`) so cap timing
can't change destiny.

- Blocker: `Transit` has **no `departTurn`** (see the typedef in `emigration-state.js`). Adding one
  is a persisted-schema change touching `normalizeTransitEntry`/`normalizeTransitList` and the save
  format.
- Assessment: the current behavior is *already deterministic* (the review concedes this); "re-roll
  per attempt" is a defensible "each turn is a fresh attempt" model, not a bug.
- If we ever do want wave-stable identity: seed from existing stable fields
  (`eventKey` + `destKey` + `srcOwner` + the creation-time `arriveTurn`) rather than adding a field,
  and expect a snapshot re-baseline.

#### `MAX_DEFERS` → `CONFIG`

Make the retry-window length a tunable (`CONFIG.maxArrivalDefers`, defaulting to 4) instead of a module
constant.

- Assessment: consistent with the mod's tunables system, but it's an internal balance constant few
  players would touch. Cheap if added as a plain non-UI `CONFIG` override; scope-creep if exposed in the
  Advanced editor (needs config-types + i18n + the tunables UI).
- Revisit when: playtesting shows the perish window actually needs tuning.

#### Split / rename `resolveArrival`

The name reads as pure but it mutates (`addRural`, `destSig.rural/population`, `queueRefugees`,
`bumpArrivedIntoCrisis`, `applyArrivalConsequences`). Suggested: rename to `applyResolvedArrival`, or
split into `classifyArrival` (pure) + `landArrival` (imperative).

- Assessment: the docstring already enumerates the side effects, which blunts the "name hides
  mutation" concern. A split improves testability but adds indirection; only worth it if the function
  approaches the eslint `complexity`/`max-statements` caps (it currently doesn't).
- Revisit when: `resolveArrival` grows a new branch that pushes it near the lint caps.

## 27. Migration-system enhancement backlog (measure-first; from the scenarios critique)

A prioritized plan for enhancing the migration simulation, derived from a design critique of the system
diagrams ([migration-scenarios-diagrams.md](migration-scenarios-diagrams.md)). It is a proposal for
review, not a committed work order, each item states the problem, the change, the files/config it
touches, the risk, and how it would be tested. **Operating rule (measure-first):** the P0 telemetry
(below) shipped; read those counters over a few playthroughs via `emigration.metrics()` before building
any item here, several may be retired if their counter stays near zero.

**Guiding principles (from the critique).**
- Do not simplify the core model. The voluntary/crisis split, transit queue, holding pool, attrition
  ramp, return, composition/integration, and narrative layers are the strength. Enhance around them.
- Legibility before more mechanics. The biggest risk is *invisible sophistication*, outcomes that are
  correct but feel arbitrary. Explaining *why* a movement or death happened beats adding new systems.
- Never expose gamey internals in player text. "anti-snowball penalty" → "crowded destination".
- Fairness at the edges. Deaths and reroutes should read as earned, not as hidden punishment.

**Already handled (so we don't re-propose it).**
- Depopulation guardrails: `maxLossPerCityPerTurn(2)`, `minRuralToEmigrate(1)`, `warSurgeMax(3)`,
  `siegeLossCapPct(0.6)`; smoothed death onset (`deathRamp`); return conservatism (`returnCooldownTurns`);
  composition stability across conquest; and the base city readout already names dominant cause, pull
  target, integration cost, origins, net trend (sparkline), and a "trapped with nowhere to flee" warning.
- Priority 0 (the legibility layer) shipped. P0.1 per-movement reason tags
  (`emigration-move-reasons.js` + `deriveMoveReasons`), P0.2 attrition "why" (`deriveDeathReasons`), P0.3
  voluntary-pressure cue (`takePressureCues`/`reportPressureCues`, `voluntaryCueEnabled/Fraction/CooldownTurns`),
  and P0.4 telemetry counters (`recordPassCounters`/`telemetryCounters`, `emigration.metrics()`) are all
  live (see the CHANGELOG). Everything below is the still-open remainder: per-move fairness/exploit fixes
  and depth.

**The measure-first read, done (2026-10-26).** The counters were read over two lab games (the session-1 reads of
§59): the owner's WashingtonAnt130 save driven nine turns to the age's end with the usual set (83 moves, 76 of them
crisis), and an Exploration game at Deity, seed 4242, driven 138 turns to the age's end (318 moves, 268 crisis).
`_counters` is module state, zero on every load, so each figure covers the driven turns only; the all-game ledgers
(`flows()`, the per-event maps) were read beside them where the item needed history.

| Item | Evidence (Washington / Exploration) | Verdict |
|---|---|---|
| P1.1 reroute-before-death | `transitCapped` 0 / 0 against `crisisMoves` 76 / 268; `transitRazed` 0 / 0 | Retired: nobody died waiting at a full destination in 351 crisis moves. In `wont-fix-with-justifications.md`. |
| P1.2 arrival safety revalidation | `arrivedIntoCrisis` 6 / 46 (7% and 17% of crisis moves) | Kept, with numbers. It fires every game: New York took four turns of arrivals while besieged in the Washington drive. The commonest open edge case of the eight. |
| P1.3 closed-borders backlash | no counter. Dai Viet held Closed Borders (Exploration) turns 60 to 70 and again at 100; Hawaii held Open Borders 90 to 100 | Kept as a counter, not a build: `emigration-borders.js` already returns `closedBordersRetention` for a closed source, so one counter of points the retention kept home (`retainedByBorders`) in `recordPassCounters` reads the share. Build only if that share is visible. |
| P2.1 weak-refuge band | `attritionTrapped` 0 / 0 against `attritionFleeing` 2 / 18 | Retired: trapped deaths never dominated; every death came with a refuge in reach. In `wont-fix-with-justifications.md`. |
| P2.2 crisis-escape phasing | `crisisCrossCiv` 4 / 88 against `crisisInternal` 72 / 180; the `crisis-escape` reason tag fired 0 / 0 times, `own-civ` 76 / 190, `aggressor-avoided` 4 / 31, `allied` 0 / 27 | Kept, with numbers. A third of Exploration crisis moves crossed a border, but no record carries the crisis tenure, so whether they crossed early can't be read. Recommend a `tenure` field on crisis records (one line in `deriveMoveReasons`'s caller) before building. |
| P2.3 dividend on integration | no counter. Pikawiiki (Washington) took arrivals four turns running (136 to 139, from Pittsburgh, disaster and prosperity) | Not readable yet: the arrivals ledger shows a compounding city but nothing says whether the dividend drove it. Recommend a counter of arrivals into cities already paying a dividend (`arrivedOnDividend`) before building. |
| P2.5 city-states as refuges | no counter. The flow ledger holds no edge touching a non-major owner in either game (141 and 101 edges) | Not readable yet: city-states take nobody, but no record says a city-state was the best candidate a refugee passed over. Recommend a counter of crisis moves whose top rejected candidate was a city-state (`cityStateRejected`, in `bestDestination`). |
| P2.6 circular damping | `returnMoves` 1 / 4 against `voluntaryMoves` 7 / 50; reverse pairs inside the nine-turn Washington window 4 of 35 moved corridors; all-game reverse-pair edges 28 of 141 and 32 of 101 | Kept, with numbers. A to B then B to A inside a few turns happened on about one corridor in nine; the all-game ledgers show a reverse edge on a third of corridors (mostly war one way, prosperity back). Not common enough to build on now; a later read decides. |

Nothing above gets built in the 3.7.0 pass.

### 27.1 Priority 1: Fairness & exploit fixes

#### P1.1 Reroute-before-death on transit deferral
- Problem. "Perished waiting" after `MAX_DEFERS(4)` at a merely *temporarily* full destination feels
  arbitrary (A6, transit queue).
- Change. Before charging the death, attempt **one reroute** to the next-best viable host (reuse
  `bestDestination` with the failed destination excluded). Only if none exists does the point die. New
  flow: `arrival due → dest full → defer up to MAX_DEFERS → reroute once → else death`.
- Files. [../ui/emigration-arrivals.js](../ui/emigration-arrivals.js), `emigration-pull.js`
  (excluded-candidate variant), `emigration-inbound.js` (capacity check).
- Config. `rerouteOnDeferFail: true`.
- Risk. Medium, must not create infinite reroute churn (cap at one attempt; the rerouted point
  re-enters transit with a fresh, bounded lag).
- Test. A capped destination + one open alternative → point reroutes and survives; no alternative →
  death (unchanged). The reserved reroute-success telemetry counter measures how often this fires.

#### P1.2 Arrival safety revalidation (edge case E1)
- Problem. A destination safe at departure can become besieged/violent before arrival; today only
  razed/captured is caught. **The detection half already shipped**: `arrivals.js` bumps the
  `arrived-into-crisis` telemetry counter, but the arrival still *settles* into the crisis.
- Change. On arrival, revalidate destination safety (violence/siege below the flee thresholds). If
  unsafe: reroute (P1.1) or hold in the pool with elevated risk instead of settling into a new crisis.
- Files. `emigration-arrivals.js`, `emigration-refugee-staging.js`.
- Risk. Medium. Pairs naturally with P1.1. **Test.** A destination that turns violent mid-transit →
  arrival reroutes/holds rather than settling. (The shipped `arrived-into-crisis` counter tells you how
  often this case actually occurs, check it before building.)

#### P1.3 Closed-borders backlash (edge case E3 / exploit #7)
- Problem. Closed Borders both cut immigration (`closedBordersOpenness 0.4`) and retain would-be
  emigrants (`closedBordersRetention 0.6`) with only modest cost, a potentially dominant "stop
  population loss" strategy, and retained people just vanish from the flow with no moral cost.
- Change. Retained emigrants don't disappear: a fraction of the *suppressed* cross-civ outflow is
  folded back into the source's voluntary pressure (and, in lethal distress, into attrition risk), so
  trapping people in bad conditions has consequences. Closed Borders stays useful but becomes
  morally/mechanically dangerous.
- Files. [../ui/emigration-borders.js](../ui/emigration-borders.js) (expose the retained amount),
  `emigration-engine.js` (fold into pressure/distress), `emigration-effects.js` (attrition coupling).
- Config. `closedBorderBacklash(weight)`, `closedBorderBacklashAttrition(weight)`.
- Risk. Medium–high, a feedback loop; must be capped and telemetered. Ship behind a flag, default
  conservative.
- Test. With borders closed under high distress, source pressure/attrition rises vs. the open
  baseline; capped so it can't spiral.

### 27.2 Priority 2: Plausibility & depth

#### P2.1 Weak-refuge fallback band (softens the "no viable refuge" cliff)
- Problem. Attrition is binary: a destination just below the pull threshold → deaths; just above →
  clean relocation. Real desperate flight goes *somewhere bad* because staying is worse.
- Change. Add a middle tier to destination selection: `strong` (normal), `weak` (emergency,
  low-efficiency: forced extra transit lag, higher integration load, possibly partial settlement),
  `none` (attrition). Attrition fires only when even a weak refuge is absent.
- Files. `emigration-pull.js` (return a tier, not just best/none), `emigration-engine.js` (attrition
  gate consults the tier), `emigration-consequences.js` (weak-arrival penalties).
- Config. `weakRefugePullFloor`, `weakRefugeeLagBonus`, `weakRefugeeLoadMult`.
- Risk. High, changes attrition frequency; must be tuned with P0.4 telemetry.
- Test. A below-threshold-but-existent destination yields a weak relocation instead of a death.

#### P2.2 Crisis-escape phasing by tenure (refugee wave realism)
- Problem. `crisisEscapeBonus(+14)` and `ownCivRefugeeBonus(1)` are flat, so war refugees may
  internationalize immediately instead of first filling safer own-civ interior.
- Change. Scale with `crisisTenure` (already tracked): turns 1–2 strongly prefer own-civ interior;
  cross-border escape pressure rises as the crisis persists. Produces the believable arc interior →
  allied/open neighbors → broad displacement.
- Files. `emigration-pull.js` (`crossCivBlock`/`geoAdjust` read tenure), `emigration-engine.js` (pass
  tenure into pull).
- Config. `ownCivRefugeeBonusEarly`, `crisisEscapeRampTurns`.
- Risk. Medium. **Test.** Same crisis at tenure 1 routes own-civ; at tenure 6 allows cross-border.
  (Infra note: `crisisTenure` is already tracked in the engine, so only the tenure-scaled knobs are new.)

#### P2.3 Dividend gated on integration (avoid win-more)
- Problem. The attraction dividend (A11) rewards raw arrival; combined with prosperity pull it can
  compound (arrive → yields → prosperity → more arrivals). Integration cost partly counters it.
- Change. Make arrival a *strain* first (integration load, already immediate) and release the
  dividend only as migrants *integrate*, a satisfying "strain then benefit" arc, and self-limiting.
- Files. [../ui/emigration-dividend.js](../ui/emigration-dividend.js), coupled to integration
  progress in `emigration-composition.js`.
- Config. `dividendOnIntegration: true`.
- Risk. Medium. **Test.** No dividend on the arrival turn; dividend accrues as the origin bucket
  integrates.

#### P2.5 City-states as viable refuges (edge case E5)
- Problem. A flat `cityStateBarrier(5)` may make city-states underused as refuges, though they're
  historically plausible sanctuaries.
- Change. Reduce the barrier for peaceful/open/high-prosperity city-states so they can be attractive
  refuges (still gated by `includeCityStates`).
- Files. `emigration-pull.js`.
- Config. `cityStateRefugeRelief`.
- Risk. Low–medium. **Test.** A safe, open city-state becomes a valid refuge target under crisis.

#### P2.6 Circular-migration damping (edge case E2)
- Problem. A→B for prosperity, then return/gradient sends people back, churn, only partly damped by
  cooldowns.
- Change. Short per-(origin,destination) migration memory that mildly damps immediate reverse flows
  within a window.
- Files. `emigration-state.js` (bounded memory), `emigration-pull.js` (apply damping).
- Config. `reverseFlowDampTurns`, `reverseFlowDampWeight`.
- Risk. Medium (state growth, must be bounded). **Test.** Immediate reverse flow is reduced vs. no
  memory; expires after the window.

> **Folded / relocated P2 items (do not re-spec here):**
> - **P2.4 (cumulative diaspora chronicle)**: its gap ("a steady multi-turn trickle that reshapes a city
>   goes unremarked") is largely closed by the shipped staged diaspora arc (`none → foothold → established`
>   with the "A {Civ} Foothold in {City}" chronicle) plus the dwell-gated enclave. The remaining
>   cumulative-*mass* trigger is exactly **Feature I (§9)**'s `migrantMass` gate, build it there, not as a
>   separate item.
> - **P2.7 (majority-immigrant petition / secession)**: moved to its detailed home,
>   [wont-implement-with-justifications.md](wont-implement-with-justifications.md) → *Petition /
>   secession / uprising*, which owns the framing guardrail, native-revolt scoping, probe plan, and the
>   full state machine / exact gates / recipient resolution / wiring. **Abandoned as specced**
>   (2026-07-19): its payoff depends on an unproven native-revolt hook; do not queue it without clearing
>   the blockers named there. The `contested`-enclave half already ships.

### 27.3 Priority 3: Optional deeper simulation (defer)

> **P3.1 (bidirectional integration / large-diaspora imprint)**: "at 35%+ share the host gains a minor
> persistent cultural imprint / integration floor" is the **"blended / host-imprint quarter"** already
> specified for the shipped Cultural Enclave system (Feature F / Feature I §9) and detailed in
> [wont-implement-with-justifications.md](wont-implement-with-justifications.md) → *Blended / host-imprint
> enclave*. Track it there, not as a separate P3 item; it is **abandoned as designed** (2026-07-19): its
> re-scalable-`grantYield` mechanics can't be built, though a chronicle-only version remains possible.
> Config sketch if ever pulled out standalone: `diasporaImprintShare(0.35)`,
> `integrationFloorForLargeDiaspora`. High risk (touches the composition core): defer until 27.1–27.2 land
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
1. P0 (reason tags, attrition why, voluntary cue, telemetry): **shipped.**
2. P1 (reroute-before-death, arrival revalidation, closed-border backlash): fairness + the one real
   exploit. Start here.
3. P2 (weak-refuge band, crisis-escape phasing, dividend-on-integration, city-state refuges, circular
   damping): plausibility/depth, tuned against the P0.4 telemetry.
4. P3 (bidirectional integration, via the quarter plan): optional, only after the rest is stable.

Each item is independently shippable behind its own config flag, so tiers can land incrementally and be
A/B compared against the recorded telemetry.

## 28. Quality-analysis open items (from `emigration-quality-analysis`, refreshed 2026-07-06)

Source: [`mods_quality_analyses/emigration-quality-analysis`](../../../mods_quality_analyses/emigration-quality-analysis)
(`issues-worklist.md` + `code-quality-violations-report.md`). **Every gate is green**: `tsc --noEmit` 0
errors, `eslint ui` 0 problems, `npm run verify` passing over 119 test files, no in-scope module under
90% statements. These three are what remain: one policy decision, one metric just under its ratchet, and
one deferred-to-RC measurement. **None is a defect**: do not read this section as a bug list.

### 28.1 Decide the render-layer testing posture *(policy, not a defect, the one real decision)*

The only item carried unresolved across every analysis refresh, and the largest genuine untested surface.
`.c8rc.json` **excludes the engine-bound render/visualization layer**: `emigration-network-*`
(sim/flow/viz/paint/dots/interact/timeline/fit), [emigration-window.js](../ui/emigration-window.js),
[emigration-main.js](../ui/emigration-main.js), `emigration-options.js`, the lens/tooltip modules,
`ledger-view`, `pies`, `return`, `dilemma`, `narrative`, `detail-views`,
`notifications-view`, `flow-tab`, `city-flows`, `city-features`: because the off-engine harnesses cannot
mount Gameface DOM/canvas. So the headline **96.07% statements** means "of the instrumented logic layer,"
**not** of every shipped line; §13.4 already codifies the exclusion as the convention for new viz files.

Sharpening why it matters: the two highest-complexity render files are *also* top-five churn×complexity
hotspots and sit outside the scope: [emigration-window.js](../ui/emigration-window.js) (complexity 185,
hotspot 0.4108) and [emigration-network-viz.js](../ui/emigration-network-viz.js) (148, 0.3480). The
volatile *logic* hotspots (views, migration-stats) are both ≥94% covered, so this is where the residual
risk concentrates.

**Decide one of two postures** (the analysis is explicit that either is acceptable, the defect is leaving
it undecided):
1. Accept the exclusion as documented policy. Write it into the README next to the coverage number so
   "96.07%" is never read as whole-mod coverage, and lean on the existing compensating controls: the
   `*-branches` / screen-contract / window-state harnesses, `npm run metrics:render` (render-layer
   synthetic path pass rate, currently **100%**, 9/9 harnesses), and §20's in-game visual passes.
2. Stand up a Gameface-shim harness for the network/lens modules and bring them into the c8 include
   set. Larger effort; the existing branch harnesses already exercise part of this surface indirectly.

*Revisit trigger is already fired*, this is decision-ready now. Posture 1 is the cheaper honest close.

### 28.2 Mutation score: 76.68% against a ≥60 ratchet *(corrected 2026-10-15)*

This heading used to read 59.96%, "missing by 0.04". That was the first trend point of 2026-07-02. The same day's
sharded full-suite run reads **76.68%**, above the 75 stretch (`quality-ratchet-baseline.json`, `mutation_score`,
source `rigorous-20260702-pass5` at `c0b2296`). Per module, all as of 2026-07-02: engine 82.08, prosperity 84.21,
geography 70.85, effects 60.50, borders 87.90. The one figure under its own floor is the engine's:
`engine_mutation_score` reads 82.08 against 87 (`active_below_target`), down from the 87.94 an engine-only run
measured on 2026-06-30.

The commands named in this section and in 28.1 and 28.3 (`npm run metrics:*`, `npm run mutation:shards`) aren't in
`package.json`. Only the scripts exist (`scripts/metrics-*.mjs`, `scripts/mutation-sharded-full.mjs`), and
`npm run mutation` / `npm run mutation:engine` run Stryker directly. A fresh sharded run takes about 5.5 hours, so
it's the owner's call; none has been started since 2026-07-02.

### 28.3 Raise flakiness confidence from quick baseline to policy grade *(deferred to RC)*

`test_flakiness_percent = 0` is real but thin, measured over only **3 runs** (`npm run metrics:flake --
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

## Cultural Enclaves, deferred / conditional items

> **Closed 2026-10-15.** These items were written for the buildable enclave, which was removed on 2026-07-17. The
> script places the enclave's tile now, on the nearest empty land plot or over the outlying farmstead
> (`ui/emigration-enclave-place.js`), so there's no build menu to gate and nothing for a player to overbuild, and the
> enclave already appears on its own. The Self-Test build buttons the second item named are gone too. A distinct 3D
> model is still a closed can't-do (see [wont-implement-with-justifications.md](wont-implement-with-justifications.md)
> → *A distinct 3D model for the per-civ enclave constructibles*). The one live knob: the marker's size and height
> are the constants `ICON_Z`, `TEXT_Z` and `TEXT_FONT_SIZE` in
> [emigration-enclave-markers.js](../ui/emigration-enclave-markers.js), to change if the marker reads wrong at
> typical zoom.

### Unbuilt stages, abandoned as unbuildable (triaged 2026-07-16, abandoned 2026-07-19)

Three stages were specced alongside the enclave system and **never built**: the **blended / host-imprint
enclave**, **petition / secession / uprising**, and the **enclave progression screen**. They turned out
to be unbuildable as designed (the same engine walls that killed the enclave yield/attribution work), so
each was moved to [wont-implement-with-justifications.md](wont-implement-with-justifications.md), which
owns their full designs, verdicts, and revisit triggers. Summary:

- Blended stage: abandoned as designed; chronicle-only if ever built. Its drafted mechanics assume a
  re-scalable `grantYield` that CANTFIX-1 rules out.
- Petition / uprising: abandoned as specced; warning-only + a live probe if ever. Its payoff depends
  on an unproven native-revolt hook, and it gates behind an enclave state that barely occurs.
- Progression screen: only the *dedicated screen* is abandoned. The useful remainder went into the City Details
  readout, which names an enclave's stage and what the next one takes (Unreleased, after 3.4.1).

**Blocker shared by all three:** nobody has measured how often an enclave actually forms.
`quarterMinStock: 3` / `quarterEstablishedShare: 0.3` / `quarterEnclaveStickiness: 0.25` /
`quarterDwellTurns: 8` have never been checked against played games, and the one datapoint is a player
reporting enclaves weren't happening. Measure first (same stance as §27): a stage arc nobody reaches is
not worth extending.

## 29. Screen open speed (measured 2026-10-18)

The owner reported that clicking one of the mod's notices froze the game long enough to look like a crash. Timing lines
(`perf:` in UI.log, from `plog` in `ui/emigration-log.js`) were added around the gather, the tab builds, the network
scene and its settle loop, and measured in a lab game: usual mod set, Antiquity seed 4242, `--quick`, driven to turn 101.

| Open | Gather | First tab | Network |
| --- | --- | --- | --- |
| Notifications tab, first open of the turn (before) | 6,627 ms fresh | 9 ms, built twice | not built |
| Network tab, cached gather (before) | 6 ms | 508 ms, built twice | 108 dots (Civ Pop), settled in 2.2 s, paint 0.7 ms |
| Network tab, first open after End Turn (before) | 7,083 ms fresh | 502 ms, built twice | settled in 2.2 s |
| Network tab, Scaled Pop (before) | cached | 513 ms, built twice | 535 dots, paint 1.5 ms, worst frame gap 30 ms |
| Notifications tab, first open after a load (after) | 24 ms fresh | 16 ms | not built |
| Network tab, first open after End Turn (after) | 18 ms fresh | 536 ms, built once | 535 dots |

The gather's parts put 5,834 ms in the history frames. Each frame masks its flow edges through `civHidden`, which
measured 9.4 ms a call: it asks `effectivePolicy` twice, and that parses the shared `modSettings` store on each ask
(4.7 ms to parse a 524 KB string, 1.5 ms to fetch it). 285 edges × 2 ends × 9.4 ms is about 5.3 s. The fix is
`withPolicySnapshot` in `ui/emigration-governance.js`: the fresh gather reads the policy once and holds it for the
pass. Outside a pass every call still reads fresh. The network itself was cheap at these sizes; the double build came
from the game's tab bar announcing its starting tab while it attaches, and both calls now skip a tab already showing.
A notification click now opens on the Notifications tab (`openEmigrationScreen("notifications")`).

The before/after numbers for the network and Notifications tabs were taken by opening the screen from a script, not by
clicking the train. The "after" runs were in the same game reloaded from a script-made save, and the game crashed about
19 s after the last open (heap-corruption abort in the UI engine, `CivilizationVII-2026-10-18-073817.ips`). Whether
that crash has anything to do with Emigration is still open; see WATCH_LIST.md.

Other `civHidden` callers outside the gather (about 40 sites: the Ethnicity and Prosperity lenses, the lens hover
panel's settlement index, the ethnicity tooltip, notices, naming, diaspora) also paid the 9.4 ms per call. The slow
read only happens when Demographics hasn't published its policy to GameConfiguration, and it only publishes from its
own screen (`publishEffectivePolicy` in `demographics/ui/screen-demographics/screen/screen-demographics.js`), so any
game where the player hasn't opened Demographics, or doesn't have it, pays it on every check. `localPolicy` now keeps
its read for one second (`LOCAL_READ_MS`). A change on Demographics' Options page, which doesn't publish, reaches
Emigration within that second.

Watched 2026-10-18 in a second lab game (usual set, Antiquity seed 4242, `--quick`, driven to turn 101, 25
settlements, Demographics never opened so nothing was published). Each action was timed from a script twice: as built,
and with `Date.now` jumping 2 s on every call so the kept read was always stale, which is the old behavior. Times are two
animation frames from the action; the same two frames with no action took 78 ms in that windowed game.

| Action | Old | Now | Store reads, old → now |
| --- | --- | --- | --- |
| One `civHidden` check | 10.6 ms | 0.04 ms | 2 → 0 a check |
| Prosperity lens switched on | 529 ms | 122 ms | 76 → 1 |
| Hover onto a settlement, Ethnicity lens, with the 3 s index rebuild | 334 ms | 98 ms | 40 → 1 |
| Hover onto a settlement, Prosperity lens, with the 3 s index rebuild | 325 ms | 100 ms | 38 → 1 |
| Hover onto a settlement, cached index (either lens) | not timed | 81-82 ms | 0 |

So the old hover stalled about a quarter of a second every 3 s while the cursor moved, and switching on the Prosperity
lens stalled about half a second. Both hover panels showed their content. Switching on the Ethnicity lens made no store
reads within those two frames either way, so its paint wasn't covered here. The cursor was moved by setting
`PlotCursor.plotCursorCoords`, not with the mouse.

## 30. Network tab refugee rings and event labels (watched 2026-10-25)

Lab game, seed 4242, usual set, `--quick`, the deployed 3.6.6 code plus the ring fix below. Live data first: by
Exploration turn 33 (about 170 turns) the game had 20 war records and war emigration in Goryeo, Persia and Hawai'i,
but every war move stayed inside its own civ and the only flows between met civs were two conquest flows. So no live
dot was tagged, and the legend showed no ring key, which is correct for that data.

With the sample data (Options, sample on), in the game's own screen:

- The legend ends with "War refugees" and "Disaster refugees", ring swatches in #e5616b and #e0913c, and their hover text.
- A sweep of the canvas with page mousemove events (156,800 points, 2 canvas px apart) hit refugee dots for all ten
  sample events. Each tooltip named the right one: "Roman–Greek War · Refugee from Rome", "Punic–Persian War · Refugee
  from Carthage", "Nile flood · Refugee from Egypt", and so on. 26,316 points gave the usual city or civ breakdown.
- "Event labels" is unlit when the screen opens. On, at frame 78 (157 CE), "Roman–Greek War" shows under Rome and
  Greece and "Aegean quake" under Greece; off, the labels go and the civ names and rings stay. The sample disasters
  carry civs, so their labels show; live disaster records have none, so in a real game only war labels appear.

Found and fixed in the same run: on the last frame every sample war had ended and its rings had faded, so the legend's
war ring matched nothing on the diagram while the flood's rings still showed. A refugee's ring now settles at half
strength after its event instead of fading out (`EVENT_REST` in `ui/emigration-network-paint.js`), and the last frame
shows red rings on the Roman and Mauryan refugees in Persia. Captures: `working_screenshots/emig-366-*.png`.

`new MouseEvent(type, {clientX, clientY})` arrives at (0,0) in this UI engine, and `element.click()` throws; set the
coordinates with `Object.defineProperty` on the event, and send clicks as `new Event("click")`.

## 31. Homecoming: probes before building (2026-10-25)

The design: internal displaced people return on their own once their home settlement is calm (one point every few
turns), the call-home pop-up goes away in favour of a Displaced tab with a worth line, and departures record the
tile they abandoned. These were checked in a lab game (seed 4242, usual set, Antiquity to turn 130, a per-turn
recorder of every major civ's city distress and call-home ledger) before any of it is built.

- **The call-home ledger is cumulative.** `callHomeCandidates` reads `migrationFlows()`, the all-game city-pair
  matrix, and neither a return nor a paid call subtracts from it. The AI made five internal calls in the run, each
  moving one point (`"returned":1`), and no civ's internal total dropped once in 130 turns. So the quote overstates
  who is away after any return, and the offer and AI calls can repeat for people already home. Homecoming needs its
  own count of people still away (displaced less returned), and the existing call-home should read it too.
- **Most internal refugees can't go home.** At turn 130, 38 of the 44 internal ledger points named a home settlement
  its civ no longer owned (razed, taken by an independent, or Tiwanaku taken by Hawai'i). Six pointed at a home still
  held. The homes that survived had calm runs of 19 to 45 turns, so a trickle has room there; a replay of the
  recorded distress at one point per 4 turns after 3 calm turns returned 19 points, median 24 turns to heal.
- **A returnee can rebuild the plot it left.** In Heian-Kyo a departure abandoned plot 956, the empty district was
  gone within seconds and the plot stayed the city's; with one pending point, `canStart(EXPAND).Plots` listed 956
  among 15 and `sendRequest(EXPAND, {X, Y})` built on it. The game chose a Woodcutter, not the Megalith that was
  there, so the plot comes back but not necessarily the improvement. AI cities had no empty rural districts left
  (0 of 108), so their abandoned plots are open too.
- **Plot yields are readable** with `GameplayMap.getYield(x, y, yield, player)`: an empty plot read 2 Food 1
  Production, a Clay Pit 3 yields, a Megalith 6 Food 2 Culture, a Jinja 12 Culture. Departures abandoned Megaliths
  first in Heian-Kyo, so recording the abandoned improvement and its yields is what makes a "Lost" line honest.
- **The AI's worth number isn't the player's.** `personValue` divides the whole city's yields by population, about
  6 to 9 yields per person per turn here, where a returnee adds one rural tile (2 to 4, more on a unique
  improvement). The Displaced tab should show the tile, not the AI's average.
- **One unexplained abandonment.** Of four tile abandonments in Heian-Kyo, three lowered population by one; the
  first (a Megalith, with 12 rural improvements and 11 rural population) didn't. A second Megalith and an abandonment
  after a counter departure both lowered it, so neither the improvement type nor a surplus explains it. Not chased.
- **The lab can't show the player's notice load.** The human seat holds one city under Autoplay, so it had no
  departures and no internal displacement; the train sent four "Refugee crisis abroad" notices in 130 turns. The
  pop-up and notice flood players see needs a multi-city human seat to measure.

Built and watched 2026-10-25, step 1 (the "still away" count): `ui/emigration-returned.js` counts each return that
lands in `moveReturnees` (paid calls and drift home alike), kept in the save as `EmigrationReturned_v1`, and
`callHomeCandidates` takes it off the flow ledger (exact pair first, the rest off the same host settlement's other
pairs). Same seed, usual set, to turn 130: the AI made five internal calls, and each civ's net count fell by its
calls (Persia 12 net against 15 on the ledger after three calls, Hawai'i 18 against 19, Goryeo 8 against 9). The
save held exactly those five returns. Persia's live quote then listed one person, the rest belonging to lost homes.
Not yet seen: the record surviving a save and load, a drift-home return from abroad being counted, and the
player's own offer no longer repeating. Next steps keep the rebuild rule agreed with the owner: a returnee goes
back to the plot they left when it's open, otherwise to another free plot in the same city.

Built and watched 2026-10-25, step 2 (homecoming, `ui/emigration-homecoming.js`): same seed and set to turn 130,
3 calm turns then one every 4. Fifteen people came home on their own (Goryeo 4 to Hwangju, Persia 4 to Pārsa and 5
to Sparda, Hawai'i 1, Đại Việt 1). Every return came after 3 calm turns and none came within 4 turns of the last
to the same home; each one shows as a drop in the civ's net count, except where a new displacement from the same
home landed the same turn (the raw ledger rises exactly then). No AI paid for an internal call (0 calls, against 5
in the run without homecoming). Nobody went back to a home after it was lost. The one thing to tune: Pārsa took 4
people back between turns 95 and 103 while it kept being hit (population 1 to 3), and Persia lost it at turn 118
with them in it, so 3 calm turns can send people back to a frontier city still in the line of fire. Not yet seen:
the player's Chronicle lines and the Advanced settings rows (the lab's human seat holds one city), and the state
surviving a save and load in game.

Built and watched 2026-10-25, step 2b (the longer wait after fighting) and step 3 (the Displaced tab):
`homecomingCalmTurnsAfterWar` (10) applies when the home's last trouble was fighting in its borders or a siege,
read from `situationalBreakdown`; the kind is kept in the save. The Displaced tab (`ui/emigration-displaced.js`,
`-displaced-view.js`) sits after My Cities. Watched in a lab game at turn 5: the tab opens from
`openEmigrationScreen("displaced")` with its title and empty line, and a set of three sample cards rendered into the
tab body read as designed (away, worth, wait, hasten with its button, abroad with the expected cost, a lost home's
line). Two things found: the Hasten button floated to the far right (the text column no longer stretches), and every
italic line was missing, since the game's font draws italic as nothing (engine-closed.md, UI runtime). That also hid
the tabs' "Nothing to show yet" lines, the Diversity note and the timeline's pending note, all plain now. Live
cards (a human seat with displaced people), the buttons opening the call for one settlement and the redraw after it,
and the worth line's live tile read are still owed. Captures: `working_screenshots/emig-370-displaced-*.png`.

Two lab runs earlier that evening loaded the Workshop copy of the mod instead of the local one: the owner's 3.6.7
upload had re-registered it with the Workshop row enabled and the local row disabled. The flags were put back
(local on, Workshop off, as before the upload), and the local modinfo now reads 3.7.0.

## 32. Talent Attraction without the fade (2026-10-25)

The owner found the card's "+1.5 per immigrant, fading 30% a turn" unreadable: nobody could tell whether the card
weakened, what faded, or when. The per-immigrant part was a script pool (`emigration-dividend.js`) granted with
`Players.grantYield`, so it never showed in a settlement's yield breakdown either. The card now pays through the
game's own `EFFECT_CITY_ADJUST_YIELD_PER_POPULATION`, the effect the Quipu tradition uses: +1 Science per 5
Population in every settlement in Exploration, per 4 in Modern, rural and urban alike. Immigrants raise population,
so the brain drain is still there: every person the card draws adds to it for as long as they stay, and the planner
values it natively. The retired Cultural Magnetism and Commercial Draw cards got the same shape in Culture and Gold
for saves that still hold one. The dividend module now serves the raids alone; `activeAttractions` and the
`ATTRACTIONS` table are gone from `emigration-borders.js`.

Watched 2026-10-25 in an Exploration lab game at turn 1: `GameInfo.Modifiers.lookup("MOD_EMIG_TALENT_YIELD_EX")`
resolves to a `COLLECTION_PLAYER_CITIES` / `EFFECT_CITY_ADJUST_YIELD_PER_POPULATION` modifier with YieldType,
Amount 1, Divisor 5, Rural true, Urban true and the tooltip, the same argument set as `QUIPU_MOD_URBAN_GOLD`, and both
descriptions compose with their icons. Not watched: the card on the Policies screen and the Science line in a
settlement's yield breakdown once it is slotted.

The eleven other languages' descriptions still said "fading 30% a turn" after the pipeline ran, because
`i18n_apply` keeps a stored translation whatever the English now says. Those seven keys were dropped from
`i18n/<locale>.json` so the XML carries the English until retranslated; the parity gates pass.

Built and watched 2026-10-25, steps 4 and 5: `ui/emigration-lost-tiles.js` keeps, per settlement, the improvement and
plot each departure tore down (`commitSourcePoint` records it; a host giving up a tile to a return doesn't count).
A return takes the oldest entry whose plot is still free, else the oldest, and the placement settles that plot when
the game offers it, else another free plot of the settlement (the owner's rule); with Ask-me placement or in an AI
city the game chooses, and the entry is still consumed. The Displaced tab's card gets a "Lost: 2 Farms, 1
Woodcutter" line. A "People are coming home" notice joins the train when a settlement's people start returning and
when the last is back; it and "People are leaving" open the screen on the Displaced tab. The call-home pop-up is
off by default. Watched in a 120-turn lab game (seed 4242, usual set): the store filled with real types and plots
for every AI settlement that lost people (Hwangju ten entries by turn 111, Farms, Woodcutters, a Mine, a
Plantation), and drained on homecomings (Hwangju 4 to 2 across its four returns, Pārsa 8 to 7). Not watched: a
human returnee landing on the old plot, the Lost line and the home notice on screen (the lab's human seat holds
one city). The per-turn notice flood the owner described is already bounded by `notifyCooldownTurns` (6) on the
"important" notices; the repeat was the call-home offer, now gone.

## 33. Spec: the first-loss page (a tutorial moment, shipped off)

**What the player sees.** The first time one of their settlements loses a population point to emigration, one
page in the mod's dilemma frame (`showDilemma`, the frame the refugee decisions and the call-home dialog use):

- Eyebrow: "Emigration". Title: "People Have Left {City}".
- Body, four short paragraphs in the plain voice: what happened ("{N} people left {City} this turn. They tore
  down the {Farm} they worked on the way out; the plot is yours to settle again."); where they went ("They have
  gone to {Dest}{, a city of {Civ}}, because {reason}: {whyLine}."); what happens next ("People who stay inside
  your civilization come home on their own once {City} has been calm for a few turns. People who crossed a
  border can be called back from the Displaced tab, at a price and at odds."); where to look ("The Emigration
  screen (the button in the dock, or the notice beside End Turn) shows every settlement losing people, why, and
  what would stop it. Hover a city for the short version."). The `{reason}` and `{whyLine}` are the readout's own
  `cause` label and `whyThereLine`, and the Farm line comes from `emigration-lost-tiles.js`.
- Details: the readout's fix line for that settlement ("What would stop it: +3 Food or +2 Happiness here (Granary
  gives +1 Food)"), when it has one.
- Quote: none (the frame draws one; this page is instruction, not narrative).
- Choices: "Open the Emigration screen" (opens on the Displaced tab) and "Got it" (dismiss; also Escape and the
  close button). Neither choice changes game state.

After that, nothing: the page never comes back in that game, whatever else happens.

**Trigger.** In `feedback.js` `localDigest`, which already groups the local player's losses per pass: when the
page is on and the save holds no `EmigrationFirstLoss_v1` flag, and an event's `subject` is `"tile"` (a real tile
was torn down; a counter decrement is too quiet to teach from), show the page for the largest event, set the
flag (with the turn and the settlement, for the Chronicle), and skip the "People are leaving" notice for that
pass so the player isn't told twice. A pass with only counter decrements waits for a later tile loss. A game that
starts at Exploration or Modern from an advanced start can lose a tile on turn 1; the page still waits for the
player's own turn, as every dilemma does.

**Off by design.** A checkbox on the Mods tab, "First-loss explainer", registered through
`registerTunableToggle` beside "Ask me about arrivals", bound to a new tunable `firstLossPage` (default `false`).
The Advanced settings carry the same row under Notifications. Switching it on mid-game shows the page at the next
tile loss unless the flag is already set; switching it off never clears the flag. The sample-data preview mode
never shows it.

**The Chronicle.** One entry when the page shows ("The First to Leave", the body's first paragraph), so a player
who dismissed it fast can read it again in Notifications.

**AI.** Nothing; the page is a human-only surface.

**Data.** `EmigrationFirstLoss_v1` in the save: `{turn, city}`; cleared by the usual new-game cache reset.

**Tests.** The trigger: a tile-loss event with the page on and no flag shows it once and sets the flag; a
counter-only pass doesn't; the flag set, or the page off, never shows it; the notice is skipped on the showing
pass. The body: every placeholder filled for an internal and a cross-border loss, with and without a lost tile and
a fix line.

**Watch list.** A human seat with two cities losing a tile (the lab's one-city seat can't): the page's text and
its two buttons, the Chronicle entry, and that it never returns.

**Open question for the owner.** Whether to ship it on for new games and off for games in progress. Off
everywhere is the ask; a first-time player gains most from it, and the flag makes "on for new games only" a
one-line change later.

## 34. Spec: enclaves as a reward (the build-up on the banner and in the Chronicle)

**What the player sees today.** An enclave appears when a foreign community reaches the Established stage
(`quarterEstablishedShare` 30% of the settlement and `quarterMinStock` 3 points), and the stance pop-up follows at
recognition. The stages (Foothold, Established, Recognized) and the next step show only on hover: the enclave
tooltip, City Details and the Diversity table (`enclaveStageAt`, `stageLine`, `nextLine`).

**What changes.**

1. *A banner tag.* `emigration-banner-pressure.js` already decorates the player's own `city-banner` controls with a
   two-pixel bar under the name. Beside it, a short tag in the banner's font at 72%: "{Greek} community forming
   22% / 30%" from the Foothold stage, "{Greek} community established" once the enclave stands, "{Greek} enclave
   recognized" afterward, nothing when there is no foreign community at a tenth of the bar or more. The tag reads
   the same `enclaveStageAt` the tooltip reads, through the per-pass memo, so it never adds an engine read of its
   own; it repaints with the bar. Colour: the origin civ's banner colour (`civDisplayColor`), the colour the
   Ethnicity lens uses for that people. Other civilizations' banners show nothing, as the bar does. Option
   `bannerCommunityTag`: off, forming and up (default), established and up.
2. *Chronicle teasers.* One line per settlement per stage, on the pass that reaches it: "Greeks are putting down
   roots in Mutsu: one in five of the city now" at Foothold; "The Greek community in Mutsu is established; an
   enclave has taken shape" at Established (the existing "has taken root" entry, kept); the recognition entry as
   now. Each carries the settlement and the origin, and the Foothold line names the share in words, not a
   percentage. Deduped by settlement, origin and stage, so a community that drops back and climbs again is told
   again, which is right: it is news again.
3. *A notice beside End Turn.* The Foothold line also goes to the train on the "note" channel, once per
   settlement and origin; clicking it opens the Diversity tab. Established and recognition already have their
   notices.
4. *The reward itself, said out loud.* At Established the Chronicle line ends with what the enclave will pay:
   "{Yield} to Mutsu once recognized" from the two stances' yields for that origin, read from the same tables the
   stance pop-up offers. A player then knows why to care before the pop-up asks.

**AI.** AI hosts get stages 2 and 4 in the Chronicle in the third person as they get the recognition line now;
no banner tag (the tag is the local player's banners only).

**Data.** None new; the stage read and the Chronicle dedupe keys exist. The teaser dedupe is
`"community:" + settlement + "|" + origin + "|" + stage`.

**Tests.** The tag text for each stage and for no community; the option's three settings; the Foothold line's
share wording at 10, 22 and 29%; the dedupe on a stage reached twice with a drop between; the Established line's
yield phrase from a stance table.

**Watch list.** A human seat with a foreign community growing: the tag at Foothold and its colour, the three
Chronicle lines in order, the train notice opening Diversity, and the tag disappearing when the community fades.
AI hosts: the third-person lines in a lab game (the pass logs give the stage changes).

**Cost.** A day for the banner tag (the decorator and its repaint are the delicate part), half a day for the
lines and the option, the lab run after.

## 35. The player-side and AI-side batch of 2026-10-25 (evening): what was built and seen

Built: the readout's fix line (`emigration-prescribe.js`), the newcomer cost lines (readout, Displaced tab, arrival
notice), Consular Protection's native Influence (+1 EX / +2 MO), the "hold your people" city strategy
(`emigration-ai-strategy.sql`, `HasFoodLessThan 2`, Production and Happiness biases at 25), the other civilizations'
stance notices (`emigration-ai-stance-notice.js`), and the AI's difficulty discount (`emigration-ai-difficulty.js`,
4% a Gold-handicap level, applied to the AI's call-home charge and refund and to its refugee prices). Specs for the
first-loss page and the enclave build-up are sections 33 and 34.

Seen in an Exploration lab game (seed 4242, usual set, Prince, 54 driven turns until the human seat was out):

- The fix line on real cities under pressure: "What would stop it: +14 Food or +14 Production or +3 Happiness here
  (Hospital gives +8 Food)" at Spahān (gap 2.4), "+30 Food ... or +10 Happiness" at Wailuku (gap 8.8, 69% to the
  bar), and nothing at Zabid (88% to the bar, a gap no amount under 60 closes). The Food and Production numbers
  are large because the model divides yields by population to the power `popExponent`; Happiness is the number a
  player can act on, so the line now shows the two cheapest yields, cheapest first.
- The difficulty: `Configuration.getGame().getValue("Difficulty")` is null; the hash on
  `Configuration.getGame().difficultyType` resolves through `GameInfo.Difficulties` (DIFFICULTY_PRINCE here, Gold
  handicap level 0, scale 1). Deity reads level 5 in the same table, 20% off.
- The stance notices: four Chronicle lines over 54 turns ("Abbasid closes its borders: an Anti-Immigration Stance",
  "Đại Việt opens its borders", "drops its immigration stance", "closes its borders"), each with a "world" train
  notice the same turn.
- Which cards the AI slotted, sampled every 10 turns: Đại Việt held both stances at turn 23 and swapped between them
  afterward; Persia (Abbasid) held Anti-Immigration from turn 33 on. Nobody slotted Talent Attraction or Consular
  Protection by turn 54; whether their civics (Inspiration, Diplomatic Service) were reached by then wasn't read.
- A yield grant doesn't reach a city's own Happiness (engine-closed.md, UI runtime), so pressure can't be routed
  into the AI's happiness strategy; the "hold your people" strategy stands on the game's Food condition instead.

Not seen: the readout and arrival-notice cost lines and the fix line on the player's own cities (the lab's human
seat), an AI paying a discounted price at Deity, the hold-people strategy changing an AI build or card, and the two
late cards taken by an AI (a longer Exploration run, reading each AI's unlocked civics alongside its cards).

## 36. The player's side, watched on a real empire (2026-10-25, late)

The lab's human seat never settles past its capital, so everything built today for the player had only been seen
on AI civilizations. The owner's own save, WashingtonAnt130 (Antiquity turn 130, eleven cities, the usual set),
was loaded inside a lab game with `Network.loadGame` (LOCAL_STORAGE, NORMAL, SINGLE_PLAYER, GAME_STATE,
SERVER_TYPE_NONE), the loading curtain cleared with `UI.notifyUIReady()`, and the game driven ten turns to the age's
end. The save file itself was left as it was (compared byte for byte afterward).

Seen:

- The Displaced tab with live data: nine cards (Boston 23 away in five of the player's other cities since turn 90,
  down to Philadelphia and Yetakapewaki at 2), each with its Away, Worth, Wait and Hasten lines; the newcomer cost
  line at the top (10 Gold and 3.7 Happiness a turn); the tab scrolls (overflow auto, 2014 of 1332 px). Capture:
  `working_screenshots/emig-370-displaced-live.png`.
- The readout's fix line on the player's own cities: Philadelphia (16% to the bar, pulled toward New York) "What
  would stop it: +2 Happiness or +10 Food here (Arena gives +4 Happiness)"; Shomron (55%) "+5 Happiness or +11
  Food". Cities under pressure with no destination that turn (White Oak 62%) get no line, as designed.
- The player's homecomings: eight people came home over the drive (Shomron to White Oak, Pittsburgh to Shomron,
  and on), with "People are coming home" train notices on turns 134 (three lines), 136, 137 and 138, and a "People
  are leaving" notice on 135. The lost-tile store filled for the player's departures (Philadelphia 7, Cilakofa 2 by
  turn 137).

Changed from what was seen: the Worth line listed "+1.8 Production, +1.2 Food, +0.5 Happiness, +0.3 Gold, +0.2
Science, +0.2 Culture", noise; it now rounds to whole numbers and keeps the three largest. And Boston's 23 people at
one every four turns meant 91 turns to refill; each return now brings one person plus one for every
`homecomingBatchPer` (8) still away, so Boston reads "the next 3 come home in 3 turns, and the last in about 50".

Still to see: the Hasten and Call from abroad buttons clicked on the live tab and the redraw after, the Lost line
on a card (the store was empty at the load; it fills from here), a returnee landing on the plot their people left,
and the Talent and Consular cards taken by an AI in a long Exploration game.

## 37. Six tabs, a real button, and honest characters (2026-10-25, late evening)

From the owner's notes on the live tab: fewer tabs that mean something, a Hasten control that reads as a button and
a tab that reads as a place to act, and a Communities "Character" that agrees with the bar beside it.

- The dashboard has six tabs on both surfaces (the screen and the Emigration page inside Demographics): Network,
  Cities, Displaced, Communities, Policies, Notifications. The Net Migration table rides behind "View: Diagram |
  Table" on Network, every civilization's cause cards behind "Show: Mine | All civilizations" on Cities
  (`emigration-tab-switches.js`); the Guide left the row. The switch had to use `replaceChild`: the game's DOM has
  no `replaceWith` (engine-closed.md), and the first build changed the switch's state without redrawing.
- Hasten is a gold button, the tab label carries the count ("Displaced (66)"), and a call made from the tab closes
  the screen, waits until it is gone, raises the dialog, and reopens the tab after. Raising the dialog with the
  screen up, or while it was still closing, lost the dialog to the display queue (watched both). The call runs
  on that settlement's own cooldown; before, hastening one city put every card's button on the civilization-wide
  eight-turn clock.
- Character comes from the settlement's own people (`characterTier`): Homogeneous at 95%+, Local Majority under a
  15% foreign community, Mixed City, Cosmopolitan Center (no origin at 60%, three at 10%+), World City (none at
  half, four at 10%+). Washington, D.C., 100% American, read "Mixed City" before because `cosmopolitanism()` blends
  the owner's openness and inbound flow; that score stays for the Demographics metric, the word no longer uses it.
  Every column heading and every Mix and Character value carries its definition on hover.

Watched on WashingtonAnt130 after a reload: the six labels with "Displaced (66)"; Table showing the ledger;
"All civilizations" showing the six civ cards under "Causes: Why people move"; Washington "Homogeneous" with the
hover texts on cells and headings; the Hasten flow end to end (screen closed, dialog up, "Bring one home for 60"
taken, screen back on "Displaced (65)", Philadelphia 2 to 1, 351 to 291 Gold). After a reload (2026-10-26, early morning): the View and Show switches sit in the Options row beside Numbers;
Hasten is a 134×42 gold button; hastening one from Boston (351 to 291 Gold, "Displaced (65)") put "Available again
in 8 turns" on Boston's card alone, the other eight kept their buttons; a how-to line under the heading says what
the tab is for. The dialog's buttons answer `action-activate`, not `click`, from the bench.
Captures: `working_screenshots/emig-370-*.png`.

## 38. What the fee buys, and one navigation for both surfaces (2026-10-26)

The owner's two checks after section 37: that the tabs, pills and buttons match the Demographics screen's, and that
the Hasten dialog says what the player is paying for ("it doesn't show what the benefit/cost is overall or to the
settlement they're leaving or going to... WHAT ARE WE PAYING FOR?").

What a paid call does, read from the code before writing a word of it: inside your own borders a returnee leaves
a rural tile where they live now (`commitSourcePoint`) and works one at home (`arriveRural`, the torn-down plot
first), so the civilization swaps one tile for another; the integration load their arrival booked on the host
decays on its own either way; the free homecoming brings them anyway, in batches. So the fee buys time, and the
ledger says so. From abroad the person is a tile gained for good, nothing of yours is given up, and the fee is paid
whether anyone answers. `emigration-hasten-ledger.js` computes the per-person swap (home tile less the hosts'
weighted average tile), the turns the n-th person would otherwise wait (`turnsForN`), and the lines; the card's
Worth and Hasten lines come from the same place, and the dialog (`callHomeView` with `home`, `ledger`, `wait`)
shows the ledger in place of the pair list, under a title naming the settlement, with "Wait for the free
homecoming" as the way out. The pop-up raised without a settlement keeps its old shape.

Navigation, from an audit of the Demographics screen's own code (view-pills.js, its base and density stylesheets,
screen-demographics.js): it uses `fxs-tab-bar` at two levels, rounded gold pills with no label for choosing a view,
flat uppercase filter buttons with no label for Scaled / Civ, its Options button in the frame header, and a soft
gold in-content button ("View on map"). Emigration now matches: tab bar first (with the same attributes and a host
with the same margins), the view pills under it, the Scaled | Civ row, the content; the Advanced button at the top
right of the standalone screen's title; `.emig-dp-btn` in the "View on map" shape; `--dg-fs-78` and `--dg-fs-100`
added to the screen's ladder (the pills use them); the tab items shrink at the 50rem density tier. Labels were
dropped from the Numbers row ("Scaled | Civ", the Demographics wording) and from the view switches. The old
`var(--x, fallback)` form on the button is gone: Coherent rejects the two-argument `var()`.

Watched on WashingtonAnt130 after a reload (2026-10-26, early morning): the tab bar first with the Diagram | Table
pills under it in the Demographics shape, Scaled | Civ unlabelled in the Network lens row, the Hasten button in the
"View on map" shape, the Advanced button at the top right of the frame (it landed above the title line on the
first build: client rects need a screen-to-local conversion; the rebuild uses offsetTop instead, not yet seen),
Boston's card reading "each returnee works a Boston tile, about +2 Production, +1 Food, +1 Happiness a turn, and
leaves a tile where they live now (about +2 Food, +1 Production, +1 Happiness a turn)" and "312 Gold or 62
Influence brings 3 back this turn, 3 turns sooner than the free homecoming"; the dialog titled "Bring Boston's
people home" with the schedule, the five ledger lines (Boston gains, Pittsburgh / Cornstalk's Town / White Oak give
up, "and 2 more settlements", Overall: +1 Production a turn, 3 turns sooner) and "Wait for the free homecoming",
which closed it with nothing spent and the screen back on the tab. Captures `working_screenshots/emig-370-nav-*.png`,
`emig-370-hasten-ledger.png`. Not seen: a Call from abroad ledger (nobody abroad in this save), the embedded
Demographics page after the navigation change.

## 39. The reminder instead of the pop-up (2026-10-26)

The owner: "Maybe the popup for hastening should instead just send you to the displaced screen where you can
choose settlements specifically?" and then "almost more like a reminder to check that screen when the number of
people that have moved hits above a threshold - but with some logic so as to not be annoying and so that it can
be permanently dismissed if the player so chooses."

Built as `emigration-home-notice.js`, run from the turn pass where the calm pop-up used to be. A small pop-up
(the dilemma dialog) with three buttons: Open the Displaced tab, Not now, Don't remind me again. The owner asked
for the dismissal on the pop-up itself, and whether the first repeat rule (+5 people or 20 turns) was enough of a
buffer; it wasn't: this save's count went 66, 75, 83 over four turns, so +5 would have spoken every two or three
turns. The rule now: speak when at least `homeNoticeMinAway` (5) population points are displaced from settlements
you still hold and some home they fled has been calm for the turns the free homecoming asks (the empire-wide
"nothing in distress" gate never came true in the eleven-city save: watched over six turns, then confirmed by a
dry run with calm forced); again only once the count has grown by half, and by the threshold, with at least
NOTICE_GAP (10) turns since the last; a count that stands still never repeats; Not now counts as a notice. The
last notice is in the save (`EmigrationHomeNotice_v1`). Calm stays a gate, per settlement: while the home is
still in trouble the people can't come back, so the reminder would only nag. Permanent dismissal is the pop-up's
own third button, the switch that gated the old pop-up (`callHomeOfferWhenCalm`, now on by default), also on the
tab as "Stop the reminders about displaced people" and in Options, Mods, Emigration; the threshold is an Advanced
setting. The four option texts changed meaning, so their translations were dropped from `i18n/<locale>.json`
before the apply (the i18n memory note), and the English ships until retranslated.

Watched on WashingtonAnt130 (reload, four driven turns), as the train-notice version: the reminder recorded
itself at turn 134 (`{turn:134, away:75}`), the turn Boston's calm ran out; the Displaced tab's "Stop the
reminders about displaced people" link flipped the switch (`CONFIG.callHomeOfferWhenCalm` false, a forced dry run
quiet). The pop-up version, same save, reloaded: "Your people can come home" with the three buttons came up on turn
134 with "75 of your people are displaced..."; Not now closed it and the record stayed `{turn:134, away:75}`; turns
135 and 136 raised no dialog (the free homecoming's own "home" notice still came on 136); a forced pop-up's "Don't
remind me again" read `callHomeOfferWhenCalm` false afterwards and the tab showed "Reminders are off...". Capture
`working_screenshots/emig-370-home-reminder.png`. Not seen: the Open button landing on the tab.

## 40. The Displaced table, and the cards' downsides (2026-10-26)

The owner: the Hasten button should sit "to the right of all the text for each civ, like in its own column", and
the tab "is a bunch of prose but it seems like we could present the information more visually"; and the stance
cards "should remind players of the negatives... in the game's own yields with icons, in parenthesis".

The tab is a five-column grid with a heading row (`emigration-displaced-view.js`): Settlement (name, since,
"no longer yours"); Away (the count large, where they are, "Lost: Farm ×2 (rebuilt first)"); Per returnee, a
turn (gains / leaves / net as yield chips: the game's icon from `UI.getIconURL(key, "YIELD")` and a signed whole
number, the three largest, red for a loss; the yield's name stands in off-engine); Free homecoming (next batch
and when, then the cadence, all home by); Bring back now (the Hasten button, "3 for [gold] 312 or [influence] 62",
"3 turns sooner"; the Call from abroad button with its odds). The prose lines (`worthText`, `waitText`,
`hastenText`, `abroadText`) are the columns' hovers. Under 70rem the worth and free columns drop under Away.

The cards: the Pro-Immigration Stance's description ends "(Each newcomer costs about 1.5 Gold and 0.5 Happiness a
turn while they settle in, fading over 6 to 8 turns; more arrivals also mean more enclaves to live with.)", the
numbers being `assimilationGold` × `assimilationLoadPerMigrant` and `assimilationHappiness` at `assimilationDecay`
0.7; the Anti-Immigration Stance's "(You give up the Population growth and the Food/Production tiles newcomers
would have worked, and half of your enclaves' Science/Culture/Gold yields.)", its Influence cost staying up front
as a yield line in the game's own form ("-2 Influence per turn"), which the data test pins to the modifier. The six descriptions' translations were dropped from `i18n/<locale>.json` (new meaning), so the
English ships until retranslated.

Watched on WashingtonAnt130 (four reloads): the first draw stopped at the heading row (a price chip named
YIELD_DIPLOMACY, which the yield-name table didn't have; a render test against a fake DOM now draws the table);
the second piled every column vertically (the engine ignores CSS grid; flex rows now); the third laid the five
columns across the width with the game's yield icons in the chips and the Hasten button at the far right, and a
Hasten from the table took one from Boston (351 to 291 Gold, "Displaced (65)", the cooldown note in the action
column); the fourth drew the large count (28 px high; a `font-family: inherit` had been taken literally) and the
price on one line (163 × 21 px). Both stance descriptions composed in-game with the parentheticals. Capture
`working_screenshots/emig-370-displaced-table.png`.

## 41. One Settlements tab (2026-10-26)

The owner: "there should be some way we can combine the information on the Cities tab and the Displacements tab.
Also, the new combined tab should be called Settlements, since it should include both cities and towns."

Done as a strip under the settlement card: the Settlements tab (kind `cityflows`, label "Settlements", or
"Settlements (N displaced)") keeps each settlement's two pies and pressure column, and under a settlement people
fled adds the four displaced cells (Displaced, Per returnee, Free homecoming, Bring back now), each under a small
heading; the intro lines (newcomer cost, what the strips offer, the reminder switch) sit above the cards only
when anyone is displaced; a settlement with people away but no movement card (a lost one) gets a card for its
strip alone; "All civilizations" never carries strips. The Displaced tab, its section, its heading row and the
`displaced` start kind are gone: the train click, the reminder pop-up and the screen's reopen after a call all
land on `cityflows`. `displacedExtras(d)` hands the Settlements section its rows, pid, costs, invalidate and
label; `renderCityFlows` places the strips (`displacedStrip`, `displacedIntro`, `displacedAfter`).

Watched on WashingtonAnt130 (two reloads): five tabs, "Settlements (66 displaced)"; eleven settlement cards with
their pies and pressure columns, nine of them with a strip under the charts (Philadelphia's: 2 displaced since turn
108, 2 in Shomron; gains / leaves / net chips; calm in 3 more turns; Hasten, "2 for 170 or 34", "3 to 7 turns
sooner"); the intro lines above the cards. The strip's cells first stopped at three quarters of the row (the
engine grows `flex: 1.6 1 0` cells in proportion but not to the row's end); as shares of the row (36 / 27 / 18 %,
the rest to the buttons) the Hasten button sits on the right edge (2764 of 2764). Capture
`working_screenshots/emig-370-settlements.png`.

## 42. The displaced column, named rows, and pies that agree (2026-10-26)

The owner, on the first Settlements capture: label the rows "Settlement name gains" and "settlement name loses";
Philadelphia's emigrants pie said "No departures yet" while its displaced strip had 2 of its people in Shomron;
the information should interleave more naturally; the prose at the top was too wordy.

The pies: a settlement card counted `recentEventsFor(me, 50)`, the fifty most recent moves the civilization took
part in, and in an eleven-city game Philadelphia's turn-108 departure had rolled out of that window while the
displaced model read the age's cumulative flows. The cards now fold the same flows (`D.flows()`, people and points
split by cause), so the two agree: Philadelphia's pie reads "Within our borders 2 (100%), Why: Disaster 100%" next
to "2 in Shomron". A move between the player's own settlements is one slice named "Within our borders".

The layout: the strip under the card became the card's fourth column (`displacedCol`, an `emig-city-col` like the
pies and the pressure), so the four columns share one row: Displaced (count, since, where, lost tiles), the
yield rows named "Philadelphia gains" / "Shomron loses" (one per host, the three largest) / "net, each", Free
homecoming, and the buttons with their prices at the foot. The intro is one line (the newcomer cost, the
reminder switch); the how-to sentence is gone. Watched on WashingtonAnt130: eleven cards, four equal columns
(644 px each), the named rows, the agreeing pie. Capture `working_screenshots/emig-370-settlements.png`.

## 43. One shape for every settlement card (2026-10-26)

The owner, on the four-column capture: "always having graphs present even if they're empty in order to standardize
the formatting", the pressure or the displaced block "under the city name to more effectively use space", bars
"until it's worth having a full pie chart", or smaller pies; "this still needs work."

The card (`settlementCard`, emigration-city-flows.js) now has one shape: the name on the left of the head line and
the emigration pressure on its right (the bar at 9rem, "16% · Low", the drivers as swatches: "Attraction 100%"),
the reasons to stay and "Heading to" on a small line under; then three columns at 31% each: Immigrants and
Emigrants as stacked bars (a segment per origin or destination in the civ's colour, both bars on the scale of the
busier direction, the count at the head's right, the legend and the Why line under; an empty track and "No
arrivals yet" / "No departures yet" when nobody moved) and Displaced (the column from
emigration-displaced-view.js with the count at its head, or an empty track and "Nobody away"). A lost settlement
with people away gets the same card with empty bars. The pies stay on the All civilizations cards.

Watched on WashingtonAnt130: eleven cards, every head line 27 px, three 821 px columns on each card (Washington
171 px tall, Philadelphia 445 px with its displaced column), the bars drawn (Yetakapewaki's immigrants 9 within
our borders + 2 Shawnee as two segments, 82% / 18%). The first draw centred the displaced column's text and the
Why lines: the single-class card rules later in the sheet outranked the new ones, so the card's rules now use two
classes; not yet seen.

## 44. The displaced row under the bars (2026-10-26)

The owner, on the three-column card: "now the displaced information needs to be more horizontally provided or
something? like underneath the two new bar charts?" So the card is the head line, two bar columns at 48% each,
and under them `displacedRow`: four cells across (Displaced with the count at its head, since, where, lost tiles;
the named yield rows; Free homecoming; the buttons at the right edge), or `displacedRowEmpty`, one line reading
"Displaced  Nobody away", so every card ends the same way. The three-column card of section 43 lived for one
reload.
Watched on WashingtonAnt130: eleven cards; Philadelphia's card 287 px tall with two 1271 px bars and a full-width
displaced row (cells 794 / 794 / 424 / 577 px, the Hasten button on the right edge at 2764 of 2764); two "Nobody
away" lines on the cards with nobody displaced among the first screen; the Why lines left-aligned (the two-class
rules took). Capture `working_screenshots/emig-370-settlements.png`.

## 45. The pressure moves into the bottom row (2026-10-26)

The owner: "put emigration pressure on the same line to the left of displacement and shift displacement to the
right." The name now stands alone on its line; the bottom row of every card begins with a pressure cell (the
heading, the bar at the cell's width with "16% · Low" beside it, the drivers as swatches, the reasons to stay and
"Heading to" in small type under) at 27%, then the displaced cells at 20 / 23 / 12 % and the buttons in the rest;
a settlement nobody fled has the pressure cell and "Displaced  Nobody away".
Watched on WashingtonAnt130: Philadelphia's card 260 px tall, its bottom row's cells 715 / 529 / 609 / 318 / 399
px with the Hasten button at the right edge (2764 of 2764); Washington's bottom row the pressure cell and the
"Nobody away" cell. Capture `working_screenshots/emig-370-settlements.png`.

## 46. The settlement dashboard (2026-10-26)

The owner: "treat this more like a control dashboard where we had the Immigrant half on the left and the Emigrant
half on the right and we could learn/manipulate what we need from this screen"; the pressure is "a black box";
"show who is exerting emigration pressure on us and who we're exerting pressure on"; "make it fucking STUNNING".

What the model already had: `rankByProsperity` scores every settlement each pass; `adjustedPull(src, dest)` is the
gradient plus friction times permeability; `pullBreakdown` / `explainPull` / `explainPush` itemise it; `prescribe`
names the yield and building that close a gap; emigration-explain-view.js keeps the pass per turn (`passData`,
now `livePass()`). So no new mechanics, only new reads:

- `emigration-settlement-model.js`: `pulledToward` (the three destinations with the greatest adjusted pull on
  the settlement's people, each with the explainer's rows), `drawnFrom` (every settlement whose best destination
  is this one, strongest four named, the count), the score's terms as shares, the prescription, the stance read,
  the move bar. `liveSettlementModels(pid)` builds them for the player's settlements by composed name.
- `emigration-settlement-card.js`: the card. Title line (name, "6 in · 2 out · 2 away", the score). Two halves
  in framed panels, green-edged Attract and red-edged Keep and recover, each with its bar, then the blocks:
  Drawing from / To draw more on the left, Pressure (gauge, drivers, reasons to stay; the hover lists the score's
  terms and the strongest pull's terms as signed shares, and says how pressure builds and what empties it) /
  Pulled toward / To keep them on the right. Pull rows: name, an "ours" or rival-civ tag, the signed pull in green
  or red, the two biggest reasons, the full rows on hover. Then the displaced row. The card borrows the bar body,
  the title, the pressure band and bar, the stay line and the drivers from emigration-city-flows.js through a
  `deps` object, so the two files don't import each other.
- The levers are the real ones: `prescribe`'s first option ("+2 Food here (Granary gives +2) lifts this settlement
  above Boston" / "closes the gap to Boston"), `openBordersOpenness` (+50% pull) and `closedBordersRetention`
  (40% fewer leave) read from CONFIG, each line saying whether the stance is slotted.

Watched on WashingtonAnt130 (two reloads): eleven cards, two 1271 px halves each; Philadelphia reading "6 in ·
2 out · 2 away · score +10.3", its Attract half "Drawing from: Nobody is drawn here yet" and "+2 Happiness here
(Arena gives +4) lifts this settlement above New York, the strongest draw on its people. Pro-Immigration Stance
slotted: +50% pull."; its Keep half "16% of the move bar · Low", "Pulled toward New York (ours) +2.1 Prosperity
gap", "+2 Happiness here (Arena gives +4) closes the gap to New York."; the pressure hover "Economy +44% ·
Population size −37% · Government & celebrations +11% · Wonders & buildings +7% · Happiness −2% / The pull
toward New York: Prosperity gap +53% · Leaving a larger settlement −18% · Reluctance to move −16% · Distance −12%
· Congestion −1%"; New York's "Drawing from: Pikawiiki (ours) +91.2 Prosperity gap, Shelter at home; Shomron +2.7;
Philadelphia +2.1"; Cilakofa pulled toward Cornstalk's Town, New York and White Oak. The first draw ran the
building note into the yield ("here(Arena") because the text loader strips a localized string's leading space;
the space now lives in the code. Captures `working_screenshots/emig-370-settlements.png` (top) and
`emig-370-settlements-newyork.png`.

Then, the same evening: the displaced row moved into the Keep and recover half ("shouldn't the hasten part be in
the keep and recover card?"), two cells a line; a "Newcomers living here · N" mirror on the Attract half was built and taken
out the same hour (the owner: the arrivals bar already says it); and the wording went from draw to attract ("Attracting from", "To attract more"), with an empty block reading "None"
as a value rather than a sentence (the owner: "Attracted: None").

A wording pass followed (the owner: "Nowhere out-pulls it" is awkward, and "More yields and Happiness widen the
lead" after it is confusing): the levers now read "+2 Happiness here (Arena: +4) would put this settlement ahead of
New York, which pulls hardest on its people" / "Already the strongest attraction in reach." / "Pro-Immigration
Stance: +50% pull for all your settlements." / "Anti-Immigration Stance: 40% fewer leave for other
civilizations."; the gauge "16% of the way to a departure · Low"; the hover "What makes this settlement's score:"
/ "What pulls people toward New York:" / "Pressure rises each turn with the strongest pull. When it fills, people
leave. Close the gap and it drains."; the intro "Newcomers cost 10 Gold and 3.7 Happiness a turn while they settle
in." with "Stop displaced-people reminders"; "net per person" on the yield rows.

## 47. One typography for the card (2026-10-26)

The owner: make the headings clearly headings and the text under them clearly contextual, throughout; "To attract
more" is too wordy and should use the game's yield icons the way the displaced block does; the displaced block
itself is formatted poorly.

Three text roles now run through the whole card, in both halves and the displaced block: a heading (`.emig-sc-bl`,
small caps, soft gold), a line the player acts on (`.emig-sc-line`), and context under it (`.emig-sc-dim`). The
Why line under a bar and the stance notes are context; the legend chips are body. The levers are yield chips
("+2 Happiness" with the game's icon, then "here · Arena: +4" in small type, then "puts it ahead of New York" /
"closes the gap to New York"); the chip is the displaced block's, exported from emigration-displaced-view.js. The
displaced block is stacked like the blocks above it: the heading with its count, where they are, a context line
(since when, the tiles torn down), "Per returnee, a turn" with the named yield rows, then the free homecoming on
the left and the buttons on the right of one line.

Then the pressure reading and the halves' names (the owner: the pressure "isn't a counter that simply flips", "it's
not a likelihood per turn", so a percent misleads; and "Keep and Recover" talks about people like stock). The gauge
is five steps lit to the stage, with the stage's word (Negligible under 10% of the bar, Low, Moderate, High,
Critical from 90%; the fifth stage is new, the bands are shared with the old pressure column), and the block's
hover says what it is: "Pressure to leave builds each turn from the strongest pull on this settlement's people
and drains when the gap closes. When it fills, a group leaves. It is 16% full now." followed by the term shares.
The halves are "Arriving · and how to attract more" and "Leaving · how to keep them, and bring back those who
left". Watched on WashingtonAnt130: Philadelphia "Low" with two steps lit and the hover's first line as above;
"+2 Happiness" as a chip with "here · Arena: +4" and "puts it ahead of New York"; the displaced block's heading,
where-line, notes, named yield rows, and the homecoming beside the Hasten button. Capture
`working_screenshots/emig-370-settlements.png`.

And the block's name: "Left · displaced people, and the way home", in the half's own heading style, inside the
Leaving half (the owner: "use the same font as Leaving for Left for the displaced section, but keep it part of the
same leaving card"). Two slips fixed on the way, both caught by the reload: rules written for the earlier two-cell
row (`flex-wrap` on what is now a column) had pushed the homecoming and the Hasten button out of sight, and the
intro's centring rule had gone with the old row rules. Measured after: the Left block 305 px tall with its five
parts stacked, the homecoming and the button on one line, the button at the half's right edge.

## 48. Four blocks: Arriving, Arrived, Leaving, Left (2026-10-26)

The owner: "perhaps we actually need four cards for each settlement? Arriving, Leaving, Arrived, Left. The Arrived
section could show the impacts of those that are there already, the enclaves, any outstanding enclave decisions";
and the policy cards as steps: "to increase: research X civic, or place X policy card".

Arrived sits under To attract more, headed like Left ("Arrived · newcomers living here, and their communities",
the count of residents from other civilizations): the origins ("11 Han · 2 Shawnee", from the settlement's
composition record, an unmet civilization counted without its name) and the community's standing from the city
snapshot's enclave summary, the same lines the city readout shows (the stage, the next step, what holds it back,
including a pending decision and its dwell), carried on the settlement row through `pressureMap` as `enclave`.
The stance lines read the civic tree: `Culture.isNodeUnlocked` on the node that unlocks this age's card
(`GameInfo.ProgressionTreeNodeUnlocks` by TargetType), so each says "Complete Citizenship to unlock the
Pro-Immigration Stance: +50% pull", or "Slot the Pro-Immigration Stance…", or "…slotted".
Watched on WashingtonAnt130: Boston's Arrived block "3 · 3 Shawnee · Shawnee community · Gains a foothold at 25%
of Boston (now 29%) · Needs at least 3 population of its own (now 2.9)"; Philadelphia's "1 · 1 Han · Han community
· Gains a foothold at 25% of Philadelphia (now 4%)"; Washington's "0 · None"; the stance lines "Pro-Immigration
Stance slotted: +50% pull." and "Slot the Anti-Immigration Stance: 40% fewer leave for other civilizations." (the
Antiquity civic Citizenship is done in this save, so the "Complete {civic}" form is unwatched). Capture
`working_screenshots/emig-370-settlements.png`.

## 49. Four panes, pies beside the text, the decision button (2026-10-26)

The owner: pies again, to the right of the text in their panes; "From our own settlements" instead of "Within our
borders"; Arrived and Left as cards of their own; an outstanding enclave decision settable from Arrived, like
Hasten in Left; the lever to say how ("Add +2 Happiness by building: Arena"); and some way to steer internal
migration, as older games let surplus food be sent between settlements.

The card is two rows of two panes. Arriving and Leaving each have a body with the text blocks on the left and the
pie (10.5rem, the legend and the Why line under it) on the right; nobody moved draws the dashed placeholder at
the same size. Arrived and Left are panes with the same head style, lighter-edged. The own-civ slice is named
for its direction (`resolveDir(d, me, inbound)`). The lever reads "Add [chip] by building: Arena (+4)" with what it
achieves under it, and when Food is the answer adds the game's own route: a growing town sends its surplus Food
to the cities it is connected to; that is the native lever for internal churn, and the honest one, rather than a
food-transfer mechanism of the mod's own. `emigration-quarter-decision.js` raises the enclave decision the pass
would offer (`candidateFromSignal`, `quarterView`, `applyQuarterChoice`, now exported from emigration-quarter.js)
from a "Decide their stance" button in Arrived, through the same step-aside `actionButton` as Hasten.
Watched on WashingtonAnt130: Philadelphia's four panes, two rows of 1271 px (332 and 311 px tall), a 170 px pie
in each flow pane with the legend "From our own settlements 6 (100%)", the lever "Add +2 [Happiness] by building:
Arena (+4) · puts it ahead of New York", Arrived "1 Han · Han community · Gains a foothold…", Left with the
homecoming and Hasten. No settlement in this save has a stance decision waiting, so the "Decide their stance"
button is on the watch list. Captures `working_screenshots/emig-370-settlements.png` and `-2.png`.

## 50. No dialog: the calls are buttons on the card (2026-10-26)

The owner, on the refreshed captures: Cilakofa's Leaving pane read "High" beside "Nobody is being pulled away",
and the Hasten dialog was still there ("I thought we got rid of this dialogue interface... people use the main
window as the interface for the mechanic").

The contradiction was the lever's wording, not the mechanic: Cilakofa was pulled toward Cornstalk's Town at +12.8
(the pane listed it), but `prescribe` found no single yield that closes a gap that wide and the lever fell back to
the "nobody is pulled" sentence. It now says "The gap to Cornstalk's Town (+12.8) is too wide for one building to
close. Unhappiness is 95% of what pushes people out." How the mechanic works, for the record: each turn the
strongest adjusted pull on a settlement's people is added to its pressure; when the pressure reaches the bar, a
group leaves for that destination and the pressure empties; closing the gap stops the accrual. The gauge's stage
is how full the bar is, not a chance.

The dialog is gone from the tab. The Left pane's paid return is two buttons, "Bring 3 back now for" [Gold 312]
[Influence 62], which call `callHomeNow` at once for that settlement's people and redraw the tab in place
(`displacedAfter` now rebuilds the section rather than reopening the screen); a price the treasury can't cover is
greyed with the shortfall on hover; the ledger is the block's hover. The call abroad has the same two buttons with
the odds under them. `offerCallHome` and the dialog remain for the console command and the AI; the Arrived pane's
stance decision still steps the screen aside, since that one is a choice of stances.

Watched the same morning in the WashingtonAnt130 save (turn 130, windowed lab, the save untouched): Philadelphia's
Left pane read "2 in Shomron" with [Gold 170] [Influence 34]. Pressing Gold took the treasury from 351 to 181, the
pane redrew in place as "None", the tab's label fell from 66 displaced to 64, and the screen stayed on the
Settlements tab. Cilakofa's Leaving pane read "High" over the wide-gap line and its three pulls; captures
`working_screenshots/emig-370-settlements.png` (top) and `emig-370-settlements-2.png` (Cilakofa and Pikawiiki).
The greyed price (treasury short) and an Influence press are unwatched; this save covers both costs.

## 51. Titled pies, and who lives here (2026-10-26)

The owner: "we need to title the pie charts", and the Arrived pane needs "a current settlement composition pie
chart". Each flow pie now carries a heading in the card's heading style: "Where they came from" over the Arriving
pie, "Where they went" over the Leaving pie. The Arrived pane has the same body as the flow panes, its text on the
left and a pie on the right titled "Who lives here": a slice per origin from the settlement's composition record,
the owner's own people among them as "Our own people", the legend with counts and shares. Before the first pass the
pie is the dashed placeholder, "Not counted yet". `newcomersOf` now also returns `all`, the whole composition, for
it. Watched in the WashingtonAnt130 save: Washington "Our own people 28 (100%)", Philadelphia "16 (94%) · Han 1
(6%)", Cilakofa half and half with the Shawnee; captures `emig-370-settlements.png` and `emig-370-settlements-2.png`.

Later the same morning, three more from the owner, each watched in the same save: the scaffolding stays ("instead
of hiding the scaffolding of this interface every time there isn't something to display, let's keep more of it
there permanently but just not filled in"): the Arrived pane always has its Newcomers, Community and Stance
decision blocks, the Left pane its where-line, "Per returnee, a turn", "Free homecoming" and the two price buttons,
dashes and greyed buttons where there is nothing, and the cost line with the reminder switch stays above the cards
with "No newcomers are settling in right now." when there are none. The tab is "Settlements" without the displaced
count. And each settlement is one framed card, its name on a gold band across the top with the counts beside it,
air between settlements ("it's hard to tell where each settlement begins and ends visually"); the frame rules were
watched by injecting the same text into the open screen, the deployed stylesheet itself awaits the next reload.
Captures refreshed: `emig-370-settlements.png`, `emig-370-settlements-2.png`.

## 52. The pies by pane, and a title band that says something (2026-10-26)

The owner: "the 'where they went' pie should be in Left, and there should be a 'reasons why they're leaving' pie
in Leaving. That should also replace the colored squares under the pressure bar." And the title line's "8 in · 7
out · 7 away · score −18.6" was "functionally meaningless".

Each pane now has the pie that belongs to it. Arriving: "Where they came from". Leaving: "Why they're leaving", a
slice per driver of the pressure (the same causes and colours the swatches used), so the swatch line under the gauge
is gone. Arrived: "Who lives here". Left: "Where they went" with its recorded causes ("Why: War 100%") beside the
displaced text; `leftPane` in the card moves the displaced row's content into a text column and hangs the chart on
the right, the same body as the other panes. The title band carries two readings instead of the counts: a pill
"Pressure to leave · High" in the gauge's colour, and "Prosperity · 10 of 11 of your settlements"
(`rankModels` in the model, ranked when the live set is built). The counts were already in each pane's corner.

Watched in the WashingtonAnt130 save after a fresh reload (so the settlement frame from section 51 is now watched
from the deployed stylesheet too): Cilakofa's four pies read Shawnee 6 / Unhappiness 95% + Attraction 5% / half
and half / To our own settlements 3, Why: War; Washington's band "Negligible · 5 of 11", Pikawiiki's "Low · 11 of
11". Captures `emig-370-settlements.png`, `emig-370-settlements-2.png`.

The owner then: "just remove 'prosperity' and '10 of 11 settlements' from the headers and keep 'Pressure to leave:
low'". The band is the name and the pill; the rank and its `rankModels` are gone.

## 53. The tally, the plain wait, and shorter pane labels (2026-10-26)

The owner, three more: "To keep them" should "list the reasons stacked by their effect... the contribution to the
score from each thing as a list (reminiscent of the relationship tallies)"; "3 to 11 turns sooner" under the
price buttons was "confusing as fuck"; and the four pane subtitles were to be made direct or dropped.

To keep them now opens with a tally of the settlement's prosperity score: a line per term, biggest first, signed
and coloured (what holds people in green, what pushes them out in red), and the total "Prosperity score" under a
rule; the terms are `explainPush`'s rows, the same ones the pressure hover listed. "What would help" follows with
the lever and the stance step. Cilakofa's reads Population size −6.0, Happiness −5.9, Wonders & buildings +5.4,
Economy +4.6, Government & celebrations +4.1, Unrest −1.3, Fighting −0.4, Prosperity score +0.5.

The wait is said as what the fee replaces: "instead of over the next 11 turns" under the buttons (one batch:
"instead of in 4 turns"; nothing when the free homecoming would bring them next turn anyway), and the ledger and the
card's hasten line use the same phrase (`insteadText` replaces `soonerText`). The mechanic itself is unchanged: the
paid call brings them home this turn, the free homecoming in batches.

The subtitles are now in parentheses with the game's population icon first: "(👥 that came here this age)",
"(👥 that left this age)", "(👥 from elsewhere, living here)" and "(👥 that went elsewhere)" (`peopleSub`, the
icon from `UI.getIconURL("YIELD_POPULATION", "FONTICON")`, tinted green with `fxs-background-image-tint`; the YIELD
context gives a settlement mark, the owner caught it, and the glyph's texture is white, so the tint does the colour,
and it only holds on an element without opacity; see docs/engine-limits-from-probes.md). A tally row that would print as 0.0 is left out.
Watched in the WashingtonAnt130 save; captures `emig-370-settlements.png`, `emig-370-settlements-2.png`.

A note for the lab scripts: the Settlements cards exist only once that tab is selected (the screen opens on
Network), so a probe should wait for `fxs-tab-bar`, not for `.emig-city-card`. And on one reload the tab bar was
already up before the probe called `emigration.window()` at all (the screen comes back with the save), so a probe
that calls the opener blindly can close it; check for the tab bar first and open only when it is missing.

## 54. The prosperity strip (2026-10-26)

The owner, on the tally under To keep them: "that kind of applies to both arriving and leaving (but not to arrived
and left). Should we find a better way of integrating that since it applies to BOTH?" It does: the score is one
number a settlement has, people arrive when it beats the neighbours' and leave when it falls short, so it now sits
above both flow panes as a strip across the card, between the name band and the panes. The heading carries the
total ("Prosperity score +0.5"); under it the terms in two groups, what pushes people out on the left in red and
what holds them here on the right in green, each a wrapped row of "Label −6.0" items, biggest first, with a caption
under each group. Before the first pass the strip shows a dash and the waiting words, so the frame is always there.
Leaving's last block is "What would help" (the lever and the stance step); "To keep them" is gone.
`prosperityStripFor(m)` is the pure split the strip and its test share.

Then, the same hour: "I really find the ledger version of this more readable. Is there a way we could put this as a
thinner 5th card that sits vertically in between?" The strip is gone; the card is three columns now, Arriving over
Arrived on the left, the prosperity ledger standing between (a `.emig-sc-half.ledger`, 13% of the row, the term
lines and the total as the first tally drew them), Leaving over Left on the right. The panes fill their column
(`.emig-sc-half` lost its 48% basis; the columns carry 41.5% each, fixed shares because the engine grows
proportional flex only part way).

## 55. The ledger opened up (2026-10-26)

The owner: "is that a full ledger accounting or could we get more granular... break out wonders and buildings and
then show which ones specifically underneath?", then: Wonders, Buildings, Government and Celebrations on their own
lines, the detail "as a dropdown if you click on the main heading (like a hidden accordion)", disasters "with their
name and then in parenthesis turns remaining", and the title to open everything.

`explainLedger` (emigration-explain.js) is the accounting the ledger draws: `explainPush`'s rows with the polity
term split into Government, Celebrations and a happiness-stage piece that joins the Happiness row, and the built term
split into Wonders and Buildings; the rows still sum to the score exactly. Under each row the lines its accordion
opens to: the five yields under Economy (`productivenessParts`, each scaled by the happiness multiplier, summing to
the row), each credited wonder and building with its points (`builtItems` on the signal, from `scoreKinds`, with a
"Cap on what's built" line when the ceiling trimmed them), the happiness against the empire's average and the stage
piece, the population, the government by name, whether a celebration runs, and under each situational penalty its
share of the base score; the Disaster row names the disaster (`disasterType` on the signal) with the turns its
distress has left at this speed's decay. Wonders, Buildings, Government and Celebrations stay even at 0.0.

The card: a chevron on each row that has lines, a click opens them (the chevron turns), the title opens or closes
every row at once. Watched in the WashingtonAnt130 save with every row open: Washington's Wonders +4.5 are Hanging
Gardens, Byrsa and Gate of All Nations at +1.5 each, Buildings +1.5 are seven buildings less a cap of −3.9; the
economy's five yields sum to +23.0; Pikawiiki's Disaster −26.2 reads "10 turns remaining · 137% of the base" (its
type stamp was unset in this save, so the row kept the plain word Disaster). Long notes overflowed the thin column
on the first draw and the space before a note's parenthesis was collapsed by the engine; the notes are shorter, the
labels wrap, and the gap is a margin. Captures `emig-370-settlements.png`, `emig-370-settlements-2.png`.

Then: "we should use the small gold + button to show the drop downs", and the lines under a row formatted like the
rows "but just not such bright gold", never spilling over the card. Each row with lines now carries the game's own
`fxs-minus-plus` (its `data-type` flips between plus and minus; it answers `action-activate`, and the row itself
still answers a click); the lines share the rows' layout and size a step in, in a dimmer gold, and the ledger clips
anything that would run past its edge. Watched with every row open on Washington and Pikawiiki: seven buttons,
21 px square, no line past the ledger's right edge. Captures refreshed.

## 56. The Communities tab folded into Settlements (2026-10-26)

The owner: "the 'majority' and 'homogeneous' columns in the communities tab are really the only truly unique pieces
of information on that tab. If we find a way to integrate them into the settlements tab's two sub pills... I think
we could eliminate the communities tab entirely?" Right: the composition bar is the Arrived pane's "Who lives here"
pie, and population and origins sit in that pane too.

The diversity rows (`diverseCityRows`, unchanged) now ride on the Settlements section as `diversity`. Mine: each
card's Arrived pane has a Mix block, "American majority · Homogeneous", the two words carrying the old column rules
as hovers (`mixWords`); a dash before the rows are read. All civilizations: under every civilization's card a table
of its settlements (`mixTable`: name, composition bar, population and origins, Mix, Character, Enclave), bars scaled
against the largest settlement on the tab; `buildCivFlows` keeps a card for every civilization now, flows or none,
and a civilization with rows but no card gets a bare one, so no settlement goes missing. The tab, its label, its
section, its renderer and the embedded page's sub-tab and hub page are gone; `CONFIG.diversityRanking` off now
empties the rows instead of hiding a tab. The working capture of the tab is deleted.

Watched in the WashingtonAnt130 save: four tabs (Network, Settlements, Policies, Notifications); Washington's
Arrived pane "American majority · Homogeneous", Cilakofa's "American majority · Mixed City" (its people are half
Shawnee, and a 50% share still reads as the majority, as the old column had it); All civilizations: six cards,
each with its settlements table, the American one listing all eleven with Mix, Character and the Shawnee enclaves.
The Mix line first drew its two words on separate lines (inline spans in a block); it is a flex row now. Captures
`emig-370-settlements.png`, `emig-370-settlements-2.png`, `emig-370-settlements-all.png`.

## 57. Sort by pressure, "Your settlements", Spoil Guard (2026-10-26)

The owner, three asks. (1) Sort the Settlements tab's two views by pressure: a second pill group, "By pressure" (the
default) and "By name", beside the view pills (`chosen.sort` in emigration-tab-switches.js, the switch mount split
into `mountPills` so two groups can share one redraw). Your settlements orders the cards by the pressure bar; All
civilizations orders each table's rows the same way, the cards by their most pressed settlement, and the tables
gained a "Pressure to leave" column with the stage word (every settlement's snapshot, `allCitySnapshots`, joined
to the mix rows as `pressure`). (2) "Mine" is "Your settlements". (3) A Spoil Guard "like we have for the
Demographics mod", working alone and with it: the Options checkbox replaces the three-way Analytics visibility
dropdown, stored in the same slot (1 on, 2 off, 0 the pre-checkbox "follow"), and `effectivePolicy` takes the
stricter of our guard and Demographics' published or stored guard, with the host's ceiling over both, so a player
who guards in either mod is never spoiled by the other, and turning one guard off only shows everyone once both
are off. Without Demographics the checkbox is the whole story.

Watched in the WashingtonAnt130 save: the pills read "Your settlements | All civilizations" and "By pressure | By
name"; By pressure puts Cilakofa (High) first, then White Oak and Shomron (Moderate), the Low ones, then the
Negligible ones in the game's order; By name runs Boston, Cilakofa, Cornstalk's Town, New York, Philadelphia. All
civilizations by pressure opens on the Incan card, whose Kashamarka reads Critical, then Wanuku and Ullantaytampu
Low. The first draw had every table row at Negligible: `diverseCityRows` builds a fresh object per row and dropped
the pressure; it carries it now. Captures `emig-370-settlements.png` (Your settlements by pressure) and
`emig-370-settlements-all.png` (All civilizations by pressure). The Spoil Guard checkbox itself is in the game's
Options screen, which the lab doesn't open; its policy arithmetic is covered by the governance tests.

Two more from the owner the same afternoon: "the red label at the top of our window indicating that the default
setting for the spoil guard is on that we have in the demographics mod", and the Settlements tab first, Network
second. The pill (`policyPill` in emigration-screen.js) sits left of the Advanced button in the Demographics
banner's shape and colours and reads "Spoil Guard on: civilizations you haven't met are hidden" (or "only your own
civilization shows"), with the way to turn it off on hover; it is left out when the effective policy hides nothing.
`allSections` lists the Settlements section first, so the screen opens on it, and the embedded page's sub-tabs and
hub pages follow the same order.

Then: the sort as "square filter buttons on the same level as Scaled and Civ with a vertical line separating the
two", and "a very light red shading behind Leaving and Left and very light green behind Arriving and Arrived". The
sort buttons (`mountSortButtons`) sit on the control row after a "|" divider in the Scaled / Civ button style; the
panes carry a faint green or red gradient over their dark base. Watched in the save: the Settlements tab opens
first with the Spoil Guard pill reading "Spoil Guard on: civilizations you haven't met are hidden" beside Advanced.

## 58. The documentation pass, and the quote on the reminder (2026-10-26)

The owner: align the Civilopedia with the current version, then the docs, with the AI section brought up to date.
In-game: Reading the Dashboard describes the four tabs and the settlement card; Calling Your People Home is Coming
Home, with a new On Their Own chapter (`HOMECOMING` in `data/emigration-civilopedia.xml`) and the Hasten, Call from
Abroad and price chapters rewritten around the card's buttons and the AI's discount; Immigration Policies and
Treatment carry Talent Attraction's per-population Science and Consular Protection's flat Influence; the lens,
options and Scope & Visibility pages name the Spoil Guard; the notifications page describes the train notices, the
readout's fix line and the newcomer cost; Common Questions, the overview, Attraction & Asylum (the retired asylum
cards) and About (3.7.0, the two city strategies) follow. The Simplify dashboard option description hides the
Network diagram only. Docs: README What's new in 3.7.0, Features, FAQ, the dashboard section, §1, §6b, §6j, §9,
§10 and §11 (the hold-people strategy, the difficulty discount, the stance notices, the native yields the planner
reads, abroad-only calls, six new rows in the seen table), §12 (the new modules); the CHANGELOG's Unreleased
section is one account of 3.7.0 against 3.6.7 instead of the day-by-day one; the Workshop description's dashboard
paragraph and two new bullets.

Then the owner: "lets just put the quotes on the reminder pop-up". `homeNoticeView(away, quote)` carries a
homecoming epigraph (`displacedQuoteFor(pid, "return", "home-notice|pid|turn")`, one per notice), drawn by the
dilemma view's quote frame as the refugee decision's is; the Voices page says so. Unit-tested
(`tests/home-notice.mjs`); the drawn pop-up is on the watch list.

The 31 pedia and option keys whose English changed were dropped from `i18n/<locale>.json` and the locale XML
regenerated with `i18n_apply --force`, so they read in English until translated, like the other 314 strings of
this release (`i18n-keeps-stale-translations`). `emigration-guide.js` and its 169 `LOC_EMIG_GUIDE_*` strings have
no importer since the Guide tab went; left for a code pass.

## 59. Session 1 of the 3.7.0 plan: the reads (2026-10-26)

Two lab games, each launched once (`tools/plans/next-2026-10-26/emigration-next-prompt.md`, session 1). Nothing was
built. The per-turn sample ran inside `lab drive` and read the mod's own surfaces (`emigration.metrics()`,
`EmigrationData`, `EmigrationViolence`, the violence-signals module) beside the engine's.

**The counters.** `_counters` in `ui/emigration-telemetry.js` is module state: zero on every load, reset again on
a cache reset. A read covers the turns driven in that session, so the save's all-game ledgers (`flows()`, the
per-event maps, `netCumFor`, `refugeesCumFor`, `deathsCumFor`) were read at the start and the end of each drive
too. `lab start` takes a difficulty: `--setup Difficulty=DIFFICULTY_DEITY` (the game-level parameter; the bench
confirms it on the setup screen).

**The Washington save, usual set, turns 130 to 139 (the age's end at 139 of 140).** Loaded with `Network.loadGame`
inside a lab game as §36 says; the save file was byte for byte the same afterward (MD5 `9ed4223b…`). Nine passes,
83 moves (7 voluntary, 76 crisis of which 72 internal and 4 abroad), 1 return, 2 fleeing deaths, 0 trapped, 0
transit deaths, 6 arrivals into a crisis, 50 refugee points queued and 33 settled. The player's cities took 84
points of movement over 35 corridors in those nine turns; Philadelphia to Washington (6 points, war) and Pittsburgh
to Pikawiiki (5, disaster and prosperity) were the largest.

- *Arrivals per city of the player's.* Four of the eleven cities took anyone: New York on four turns (132 to
  135), Washington on three (134 to 136), Pikawiiki on four (136 to 139), Philadelphia once (137). The
  newcomer cost line read 7 Gold and 2.6 Happiness a turn at 131, climbed to 29 Gold and 8.1 Happiness at 136
  while Washington and Pikawiiki both took war refugees, and ended at 20 Gold and 7 Happiness. So arrivals land in
  two or three cities at a time, the capital and the nearest safe city among them, and New York took its four
  turns of arrivals while it was itself besieged (that is where the six `arrivedIntoCrisis` came from). The read
  behind the intake toggle: the concentration is real and the cost line moves with it, which is the case the
  toggle's wording should name ("Close to newcomers" on the city that is taking them).
- *Sieges of the player's cities.* New York carried the engine's besieged flag from turn 133 to the end with
  damage rising 0.055 to 0.25 and the mod's intensity 1.2 up to 20.3 (threshold 2): a real siege. Philadelphia
  carried the flag for one turn (132) with no damage, and its intensity jumped 0.48 to 2.06, over the threshold, on
  that flag alone; it fell back below 2 by turn 137 once the flag went. Cilakofa sat at 1.4 to 2.5 with neither
  flag nor damage (combat events).
- *AI cards.* None of the nine AIs held one of the mod's cards at turn 130 or 139 (Antiquity: the two stances only).

**Exploration, seed 4242, Deity, usual set, turns 1 to 139 (the age's end).** 138 passes, 318 moves (50 voluntary,
268 crisis: 180 internal, 88 abroad), 4 returns, 18 fleeing deaths, 0 trapped, 0 transit deaths, 46 arrivals into a
crisis, 209 refugee points queued and 21 settled, 59 passes with no move (43%). Reason tags: richer 310, own-civ
190, nearby 63, safer-dir 53, aggressor-avoided 31, allied 27, asylum 9, open-borders 4, crisis-escape 0. The
flow ledger ended with 101 corridors, 43 of them cross-civ (129 of 348 points), none touching a city-state.

- *Civics beside cards, every ten turns.* Talent Attraction was slotted by every AI, each within ten turns of
  unlocking Inspiration: Hawaii by turn 30 (Inspiration at 30), Abbasid by 70 (at 70), Persia by 80 (at 70),
  Dai Viet by 90 (at 90), Goryeo by 100 (at 90); four still held it at 130. Consular Protection was never slotted,
  though every AI had Diplomatic Service by turn 90. Dai Viet slotted Closed Borders from 60 to 70 and again at 100
  (with Open Borders beside it at 80, which cancels); Hawaii slotted Open Borders at 90 and 100.
- *City strategies.* The UI VM has no read of a city's active strategies, but the game writes one:
  `Logs/AI_CityStrategy.csv` (turn, player, city, strategy, Following or Stopped, percentage), overwritten each
  launch. Read after this game closed: `CITY_STRATEGY_EMIG_KEEP_THEM_HAPPY` activated 29 times across seven AI
  cities and three independents' cities (first at turn 18, Goryeo), each stopping some twenty turns later;
  `CITY_STRATEGY_EMIG_HOLD_PEOPLE` never activated in 138 turns. Its condition is `HasFoodLessThan 2`, and the
  game's own Early Food strategy uses that function at 10 and 15 (gross Food yield), so under 2 is near
  impossible: the row is inert as written. The build queues were logged too; nothing in them can be tied to a
  strategy that never ran.
- *The live side of the siege question.* 176 city-turns carried the besieged flag across 18 cities. The flag with
  no district damage is the common case, and the intensity it holds is enough to bleed people: Lāhainā (Hawaii)
  carried the flag for 27 turns, 26 of them at zero damage, with intensity 7 to 13.7 (threshold 2); Jeonju
  (Goryeo) for 27 turns at zero damage, intensity 1.5 to 4.1, hovering around and above the threshold for twenty
  turns; the player's Heian-Kyo for 31 turns, 20 of them at zero damage, intensity 2.5 to 12.6. The intensity
  decays between flag-only turns (Lāhainā 10.4, 9.4, 8.8, 7.1 over turns 49 to 53) and jumps on a battle event,
  so the floor alone doesn't pin the fraction: it tops it up each turn, and with the decay the standing level of
  a flag-only siege sits well over the flee threshold for a large city and around it for a small one. That is
  the mechanism the stalemate rule (risks 2.3) addresses; session 2's off-engine gate reads the same thing in
  `tests/violence.mjs`.
- *The Deity price.* `aiPriceScale()` read 0.5 (the floor) under `DIFFICULTY_DEITY`; a ten-point internal call
  quoted 2846 Gold for an AI against 5692 for the player. `UI.log` from the same game holds the AI's own charge:
  "AI call home 1 external: paid 54, attempted 1, returned 1" at 16:16, and a second call by civ 2 that paid 54
  and got nobody. Half the player's price for one person abroad; the watch-list item is closed for the price.
- *The player's seat* (Heian, one city, Autoplay-driven) lost its capital to Abbasid and Musashi to Dai Viet by
  conquest, which is the 19 and 9 point conquest edges; nothing in the counters depends on it.

**Verdicts.** Written into §27 as a dated table: P1.1 and P2.1 retired to `wont-fix-with-justifications.md` with
their numbers; P1.2, P2.2 and P2.6 kept with numbers; P1.3, P2.3 and P2.5 get a counter recommendation each.

**Watched / not.** Watched: the counters over two games, the arrivals and cost line on the Washington save, the AI
civics and cards over 139 Exploration turns, the besieged flag against damage and intensity, the Deity scale.
Not watched: Consular Protection taken by an AI (never happened in 139 turns), the hold-people strategy running
(it never activated; the CSV says so).

**What the owner decided on the report (2026-10-26).** The plan file gained five builds for session 2: the
counters persisted across a load (2f), a heavy penalty for a destination in acute crisis with the arrival hold,
lifted by a stalled siege (2g), a Gold upkeep on Talent Attraction and a visible Influence floor on Consular
Protection (2h), a hold-people condition that fires (2i), and flight waiting for two sustained turns of violence
instead of the first (2j); the siege stall comes after 3 quiet turns, and 2a's gate reads the standing intensity
(about 2.7) against the threshold.


## 60. Session 2 of the 3.7.0 plan: the builds (2026-10-26)

No game launches (`tools/plans/next-2026-10-26/emigration-next-prompt.md`, session 2). Ten steps, each behind its
flag with the shipped default, unit-tested in `npm run verify`, lint-clean at complexity 10 and under the 500-line
gate, with English text only (session 4 translates), a CHANGELOG line, the README paragraph and the Civilopedia
sentence. Nothing here was watched in a game; every behaviour is on `WATCH_LIST.md` for session 3.

- **2a, the siege stalemate rule.** The gate first: `tests/violence.mjs` stepped a city ten turns with the
  engine's besieged flag set and no damage. The flag alone added 1.2 a turn (vwSiege 4 × siegeBesiegedFloor 0.3)
  against the 0.55 decay: 1.20, 1.86, 2.22, 2.42, 2.53, 2.59, 2.63, 2.64, 2.65, 2.66, a standing level of 2.67
  against the flee threshold of 2, crossed on the third turn. The doc's mechanism holds, so the rule was built:
  `lastDamageTurn` and `stalled` per city in the violence state, stamped at the siege's start and on fresh damage or
  fighting; after `siegeStallTurns` (3, speed-scaled) quiet turns the floor isn't applied, `lethalDistress` drops
  the fighting's share, `siegeStalled(city)` is on the readout snapshot, the readout and the Leaving pane say
  "Siege stalled", and the next hit ends it. 8.3b with it: `recordSiegeDeath` counts a death into the siege's tally
  and `siegeDeathCapped` stops the killing at `siegeTotalLossCapPct` (0.8) of the onset population; the tally
  clears when the siege ends. The death gate moved out of the engine into `emigration-outlet-death.js` (the
  500-line gate), and the Settlements rows out of `emigration-window.js` into `emigration-window-settlements.js`.
- **2b, the intake toggle.** `cities` on the persisted state (closed cities only, with the owner at closing time so
  a captured city reopens by itself), `isCityClosed` / `setCityClosed` in `emigration-state.js`, the closed check
  shared by the real pass, the planning pass and the readout's "Pulled toward", an arrival due at a closed city
  re-aimed at the civilization's most populous open, calm settlement (a deferral, so the retry window still bounds
  it), the "Close to newcomers" / "Open to newcomers" button in the Arriving pane's "To attract more" block in the
  `emig-filter-btn` style, the pane's "Closed to newcomers" tag, the readout line, `cityIntakeToggleEnabled`.
  `tests/intake-toggle.mjs` and `tests/settlement-card-render.mjs` (a fake DOM; the first render test of the card).
  The prosperity ledger moved into `emigration-settlement-ledger.js` for the line gate.
- **2c, the forecast.** The stats store keeps the last six pressure samples per source
  (`recordPressureSamples` from the pass, folded in by `recordMigrations` so there is one save, not two);
  `emigration-forecast.js` reads the rate of rise, the cooldown and the rural pool and says "About 3 people are
  likely to leave in the next 4 turns" or "Nobody is likely to leave soon"; the line sits under the gauge on the
  Leaving pane and after "Forecast:" in the readout. `cityReadoutForecast`, `forecastTurns` (3, 5, 8).
  `tests/forecast.mjs`.
- **2d, the Guide module.** Its matrix and FAQ were read against the Civilopedia. What the Common Questions page
  didn't say and the code still does: towns and internal moves take part; migrants can't be hand-placed; the three
  brakes against a snowball; what a repair does and doesn't do, and the fastest recovery. Those went in as four
  lines. The rest was already on a page, or no longer true ("Change AI strategy or decisions: No"). The module,
  its modinfo line, its CSS, the self-test sample key, the derived-keys block and the 169 strings in twelve
  languages are gone.
- **2e, the first-loss page.** `emigration-first-loss.js` per §33, shipped off (`firstLossPage`), the Mods-tab
  checkbox "First-loss explainer", the trigger in `localDigest` on a tile event (the migration record's
  `subject`), the flag `EmigrationFirstLoss_v1`, the Chronicle entry "The First to Leave", the notice skipped
  that pass, "Open the Emigration screen" landing on the Settlements tab. The screen module is imported on the
  click, not at load (importing it at load broke the feedback harness). `tests/first-loss.mjs`, a case in
  `tests/feedback.mjs`.
- **2f, counters that survive a load.** `EmigrationTelemetry_v1` holds the all-game totals and the reason
  histogram, written with each pass; `emigration.metrics()` prints `counters` (all-game) beside `session` (since
  the load), and the derived shares read the all-game numbers. `tests/telemetry.mjs`.
- **2g, destination safety.** `unsafePenalty` in `emigration-pull.js`: 12 for each threshold's worth a destination
  sits over its flee threshold, half a step at least, capped at 30, half for a source worse off, nothing for a
  stalled siege, never a reject; `pullBreakdown` carries the `unsafe` term and `tests/explain.mjs` pins the mirror;
  the real pass counts `crisisDestAvoided` when the penalty turned a move elsewhere; an arrival due at a city in
  crisis is held or re-aimed like one at a closed city, and lands anyway past its retry window, counted by
  `arrivedIntoCrisis`. `destinationSafetyEnabled`, `crisisDestPenalty`, `crisisDestPenaltyCap`. `tests/pull.mjs`,
  a case in `tests/arrivals.mjs`.
- **2h, the two cards.** Talent Attraction gains `MOD_EMIG_TALENT_UPKEEP_EX` / `_MO` (EFFECT_CITY_ADJUST_YIELD,
  -2 and -3 Gold per settlement); Consular Protection's floor is +3 / +5. The modifier ids of the Science and the
  old floor stay, so a save holding a card keeps it. The descriptions, the Policies and Treatment pages and the
  README carry the numbers; `tests/treatment-policies-data.mjs` reads the upkeep rows and the floor's rise by age.
- **2i, the hold-people condition.** Not built yet: its gate is a `tower-bench sql` read of AI cities' gross Food on
  a running game, which session 3's first launch gives. Recorded there.
- **2j, sustained violence.** `violenceCrisis(src)` in `emigration-violence.js`: over the flee threshold and
  `siegeTenure` at `violenceSustainTurns` (2) or more; the engine's `inCrisis`, the pull's `srcInCrisis` and
  `migrationCause`, and `lethalDistress` read it; razing stays immediate; with the siege model off the threshold
  alone decides, as before. The off-engine signals in `tests/engine-pull.mjs` and `tests/move-reasons.mjs` carry no
  city id, so they pin `violenceSustainTurns` at 1. `tests/violence.mjs`.

The translations: the keys whose English changed (the two card descriptions, Consular's, the Refugees, Dashboard,
FAQ and Options pages' bodies, the Policies and Treatment paragraphs) were dropped from `i18n/<locale>.json` and
the locale XML regenerated with `i18n_apply.mjs --force` (the shipped XML held the old English); they read in
English until session 4.

## 61. Session 3a: the Washington save, the builds watched (2026-10-26)

WashingtonAnt130 loaded into a lab game as §36 says (`Network.loadGame` from the game page, `UI.notifyUIReady()`
until the loading state read 8), the usual set, driven turns 130 to 139 with a reading every turn
(`emigration.metrics()`, the readout snapshot of each of the player's settlements, the age's flow ledger diffed per
turn, the violence audit, the save's own keys, any dialog on screen). The save file was byte for byte the same
afterward (MD5 `9ed4223b…`). No crash report.

Watched working:

- **Destination safety (2g).** New York carried the besieged flag from turn 133 (intensity 1.2, 3.6, 8.7, 14.6,
  20.3, 18.0, 12.9). It took arrivals on 131 and 132, before the siege, and none from 133 on; the refugees landed in
  Washington (3 on 133) and Pikawiiki (1, 4, 5, 6 on 133 to 136), then Cilakofa (4, 3, 4). `arrivedIntoCrisis`
  stayed at 0 for the whole drive (6 in session 1's drive of the same turns); `crisisDestAvoided` climbed 17 a
  pass to 169 (it counts every source whose best destination was turned, each pass).
- **Flight waits for sustained fighting (2j).** Philadelphia carried the flag for one turn (132, intensity 2.06)
  and its cause read "disaster" that turn; it read "war" from 133, its second turn over the threshold, and shed 2
  a turn from there. New York went over the threshold on 134 (3.6) and shed its first 2 on 135, its second
  sustained turn, not its first.
- **The intake switch (2b).** Washington closed by a scripted `setCityClosed` at turn 134 (the sample's own
  closing matched display names against LOC keys and never fired; the close was issued from outside the drive)
  and reopened at 138. While closed it took nobody (it had taken 3 on 133); the flow landed in Pikawiiki and
  Cilakofa. Reopening came one turn before the age's end, so arrivals resuming there wasn't seen. On the screen
  with Pikawiiki closed: the Arriving heading carries "Closed to newcomers", its button reads "Open to newcomers"
  in the active style, every other settlement's reads "Close to newcomers" (capture
  `working_screenshots/emig-370-s3/settlements-tab-closed-pikawiiki.png`; the button draws the full width of
  the block, a flat bar rather than a chip).
- **The forecast (2c).** On the card and in the snapshot: "About 1 people are likely to leave in the next 5
  turns" on White Oak and "in the next 4 turns" on Yetakapewaki, "Nobody is likely to leave soon" on the calm
  ones. Against what happened: Philadelphia read "2 in 2 turns" at 132 and shed 2 on 133 and 2 on 134;
  Pittsburgh read "2 in 1 turn" at 134 and 135 and shed 1 on 135 and 2 on 136; Cilakofa read "1 in 4 turns" at
  136 and shed nobody after (it became the destination). What the line missed: Cilakofa and Philadelphia read
  "stable" on 130 to 134 while they shed 1 and 2 a turn, because crisis flight ignores the bar the forecast
  reads. Fixed the same evening: a settlement whose cause is war, disaster or conquest reads "People are fleeing
  now; how many depends on the crisis, not the pressure" (`forecast.crisis`), unit-tested, not yet seen drawn.
- **Counters that survive a load (2f).** After the drive, a quicksave and a load from the game page:
  `emigration.metrics()` printed the same all-game counters as before the load (9 passes, 71 crisis moves, 7
  voluntary, 2 fleeing deaths, 169 avoided) beside a session block of zeros.
- **The first-loss page (2e), partly.** With `firstLossPage` switched on by script at turn 130, the flag
  `EmigrationFirstLoss_v1` read `{turn: 133, city: "Philadelphia"}` after the pass that tore down Philadelphia's
  first tile, and the Chronicle's newest entry was "The First to Leave". The page itself wasn't seen: the driver
  closes the game's dialog boxes between readings (5 closed over the drive) and the reading that turn found none
  open. "Open the Emigration screen" calls the same `openEmigrationScreen("cityflows")` the reminder uses, which
  opened the screen on the Settlements tab here. The skipped notice wasn't read.
- **The reminder's quote block.** The reminder ("Your people can come home", 74 displaced, its three buttons)
  was on screen at turn 134 with a framed quote block (`.emig-quote-block`) under its text.
- **The Influence price.** On the Left pane the Gold button read 312 and the Influence button 62, greyed, with
  "Not enough: this needs 62 and we have 26." on hover.
- **The Lost line's store.** `EmigrationLostTiles_v1` filled for Philadelphia (a fishing boat on 132, a
  woodcutter on 133) and Cilakofa; the line itself wasn't read off the card.

Not reachable in this save: a stalled siege (New York's siege had real damage every turn), Hasten and Call from
abroad (nobody abroad), the stance notices (no met civilization changed a card), a returnee landing on the plot
their people left.

## 62. Session 3b and 3c: the vanilla side and the crash soak (2026-10-26)

**The vanilla side.** Every other mod switched off in the registry (17 copies; the flags put back afterward), a Play
Now lab game driven 15 turns at 4.5 s a turn with the one-city seat. On the Settlements tab: London's card with
"Nobody is likely to leave soon" under its gauge, the "Close to newcomers" button in the Arriving pane, no "Siege
stalled" line (no siege), and no raw LOC tag anywhere on the screen (capture
`working_screenshots/emig-370-s3/vanilla-settlements-tab.png`). The button's own click wasn't landed from
script: GameFace elements have no `click()`, and the drive had already ended; the switch's effect was watched on
the Washington save (§61), so the vanilla side owes only the click itself. No reminder: nobody was displaced in
15 turns.

**The crash soak.** Two plain lab games, the usual set, each: 10 End Turns without Autoplay, the screen opened from
script (the bench can't click the train), three minutes open with a read every 20 s, closed from script, three
minutes closed. Both games were still running at the end, every read answered, and no crash report appeared
under `~/Library/Logs/DiagnosticReports`. The 2026-10-18 abort came in a game reloaded twice from a script-made
save with fresh module copies, and this soak had neither; the list's item moves to "seen twice without a crash",
not closed.

## 63. Session 3d and 4: the translations, and two languages on screen (2026-10-26)

**The translations (session 4).** `i18n_extract.mjs` listed 2,884 source keys; each locale map lacked between 364
(zh_Hant_HK) and 412 (fr_FR) of them: the 3.7.0 batch, the keys whose English changed in the documentation pass,
and this plan's additions. Eleven translators, one per locale, each given the locale's missing list and told to read
a couple of dozen of the locale's existing entries first, wrote the translations into one file each. Each file
was checked on the way in: the same key set as the list, every placeholder, icon tag, markup tag, LOC_ token and
number present in the English present in the translation (0 mismatches in every locale), and a script check (a
run that writes into a shared folder crossed Polish and Portuguese chunks for a while; both were rebuilt from
their own chunks and re-checked clean). The maps were merged and `i18n_apply.mjs` regenerated the locale XML:
2,884 rows per locale, nothing falling back to English. `tower-bench l10n` finds the mod's own tags complete in
every language; its two warnings predate this session (ten Civilopedia History Corrections tags, and the
self-test panel's monospace font list). The native-speaker review of §24 stays open.

**Two languages on screen (session 3d).** A Play Now game in German, launched before the translations were in:
the Settlements tab drew with German tab names, the 3.7.0 keys in English (the Coming Home title, the card
headings, the switch's label) and no raw LOC tag; the Civilopedia titles read through `Locale.compose` the same
way. Then Japanese, after the merge: twelve turns driven, the Settlements tab with every heading in Japanese
(流入 / 定住 / 繁栄度スコア / 流出 / 移出圧力 and the rest), the forecast line 近いうちに去る人はいなさそうです under the
gauge, the switch 新来者を受け入れない, the Spoil Guard note, and the Coming Home and Reading the Dashboard pages
composing in Japanese; no raw tag (capture `working_screenshots/emig-370-s3/settlements-ja.png`). The
game-setup option "Emigration: AI keeps cities happy" lives on the setup screen the lab skips, so it wasn't read.
The other nine languages are on the list.

## 64. Session 3e: the long Exploration game, and the hold-people condition (2026-10-26)

Exploration, seed 4242, the usual set, the lab's default difficulty, 110 turns driven at 5.6 s a turn with a
reading every ten: each AI's Inspiration and Diplomatic Service beside its slotted cards, every AI city's
population and Food, and the counters. The game closed without a crash report.

- **The two cards (2h).** With the Gold upkeep, Talent Attraction is a trade the AIs weigh rather than a reflex:
  Abbasid slotted it ten turns after Inspiration (61), Hawaii twenty turns after (61), Dai Viet forty (81),
  Persia twenty (101), Goryeo never in thirty turns with it unlocked; Abbasid dropped it at 91, took it back at
  101 and dropped it again at 111, Hawaii dropped it at 101. At turn 100 three AIs held it and two held neither
  card, the watch's shape. Consular Protection at +3 Influence was still never slotted by any of the five in 111
  turns, with Diplomatic Service unlocked from turn 41: the visible floor didn't move the planner. Persia held
  the Anti-Immigration Stance from 61 to 71.
- **The hold-people condition (2i), the gate.** `Logs/AI_CityStrategy.csv` from this game: "keep them happy"
  activated 48 times, "hold your people" never, with its `HasFoodLessThan 2`. The Food read: AI towns stuck at 8
  or 9 population for a hundred turns (Bactria, Gordion, Hải Phòng, Thái Bình, Pyeongyang, ‘Ewa) read 13 to 20
  Food through `Yields.getYield`; growing settlements read 30 to 89; brand-new towns of 2 or 3 population read 7
  to 13 while growing. A Food threshold alone can't tell a stalled town from a new one, so the condition is
  now two: `HasFoodLessThan 16` and `HasRuralPopGreaterThan 4`, both needed (`MinNumConditionsNeeded 2`). Built
  from the read, not yet seen Following in the CSV: on the list for the next long game. Whether the strategy's
  own Food read matches the UI's `getYield` is the open question the CSV answers.
- **The counters.** 111 passes, 97 crisis moves, 404 moves turned by the destination-safety penalty, 1 arrival
  into a crisis in the whole game (46 in session 1's game of the same seed).

**All eleven languages on screen (2026-10-26, late).** One Play Now lab game per language (de, es, fr, it, ja, ko,
pl, pt_BR, ru, zh_CN, zh_HK), twelve turns each, then the Settlements tab opened. In each game the page composed
every newly translated key whose translation opens differently from the English, 262 to 266 per language: none
came back as a raw tag and none as English, except "Diagram" in de, es, it and pt_BR, where the translation
starts with the same letters (Diagramm, Diagrama, Diagramma). Eight keys per language came back empty because
they open with a placeholder and were composed without values; the same kind of string draws in full on the
card. On the card, every language showed its own tab names, the four pane headings, the forecast line and the
"Close to newcomers" switch, with no raw tag; the setup option composed in every language ("Auswanderung: KI
hält Städte zufrieden", "移住：AIが都市を幸福に保つ", "Эмиграция: ИИ поддерживает счастье городов"). Korean
and both Chinese draw without missing-glyph boxes. Captures `working_screenshots/emig-370-s3/lang-*.png` for eight
languages; the window capture missed de, es and fr, whose readings are in the run log.

One fix from it: the Japanese card used 流出 for both the Leaving and the Left pane. Left (`LOC_EMIG_DP_SUB`) is
now 離郷, beside 定住 for Arrived; not seen drawn yet. The setup screen itself, which the lab skips: the owner confirmed
on 2026-10-26 that the option "Emigration: AI keeps cities happy" appears there and works.
