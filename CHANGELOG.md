# Changelog

All notable changes to the **Emigration** mod for Civilization VII. Loosely
follows [Keep a Changelog](https://keepachangelog.com/) and Semantic Versioning.
The Steam Workshop change note for each release is generated from the matching
section below by `release.sh`.

## [1.7.0] - 2026-06-30

Two more languages, a controller-friendly route into the advanced editor, a faster
late-game pull pass, and a round of correctness + robustness hardening, including a
shared safeguard so starting a new game without relaunching can never inherit the
previous game's migration data.

### Added
- **Two new localizations: Polish and Traditional Chinese (Hong Kong).**
  Adds full `pl_PL` and `zh_Hant_HK` ModText, bringing the mod to 11 localized languages.
- **"Options: Advanced" entry on the standalone dashboard.**
  A control row that pushes the advanced-settings editor via the context manager, so the
  full tuning editor is reachable directly from the dashboard.

### Changed
- **Simplified Chinese locale renamed to the canonical `zh_hans_cn`.**
  The folder was `zh_cn`; the manifest now points the `zh_Hans_CN` locale at `text/zh_hans_cn/`.
- **Advanced tuning editor is fully controller-navigable.**
  Group headers use native `fxs-minus-plus` toggle buttons (gamepad-focusable) instead of a
  click-anywhere header, and collapsing now works while a search filter is active.
- **Faster late-game migration pass.**
  The heavy pull pass memoizes the per-pass hex-distance matrix and the per-civ-pair
  open-borders / alliance / war reads, and reuses the chosen destination across the split
  tracks when the crisis track shed nothing, cutting the late-game O(N²) cost.
- **Cross-game cache safety (internal robustness).**
  A shared "reset persisted caches on game boot" convention: every module that lazy-loads its
  state from the save now drops that cache when a new game id is detected, so a new game
  started inside a still-running UI can't read or persist the prior game's data. Gated by the
  `resetCachesOnGameBoot` flag.
- **Crisis deaths now ramp up instead of hitting all at once.**
  A city under lethal distress (war/disaster/siege/famine) no longer takes its full casualty rate the
  instant the crisis turns lethal. Attrition death-pressure builds gently at first and deepens over a
  few turns of *sustained* crisis (`deathRamp`: from `deathRampFloor` on turn 1 to full after
  `deathRampTurns`), and relaxes again if the crisis eases, so a sudden catastrophe is no longer
  immediately devastating and a brief scare is recoverable. It is **not** capped: a prolonged
  catastrophe still takes its full toll over time (rural population only, never the settlement itself).
  The death-channel state now persists across save/reload.
- **Maintainability:** removed redundant module exports, consolidated the developer docs, hardened
  the test gate so no test file can be added without being wired into the suite, and expanded the
  migration engine's automated test coverage.

### Fixed
- **Lagged migrants keep their deferral count across save/reload.**
  It was reset every turn, so the "force-land or perish after too many defers" guard and the
  longest-waiting-first arrival order never actually fired; both work now.
- **A migrant at the in-flight transit cap is no longer lost.**
  The cap is enforced at enqueue, so a capped migrant stays home (population conserved) rather
  than being removed from its source and then dropped.
- **A genuine one-point migration never reads as "0 people"** in the era-ceiling underflow
  regime, a real move's reported people are floored at 1.

## [1.6.7] - 2026-06-28

Migration plumbing hardened and the advanced tuning editor rebuilt for controller
support. Border policy now resolves consistently, slotting both Open and Closed Borders
cancels out, lagged arrivals wait their turn fairly and perish only as a last resort,
and per-civ border reads are cached for the heavy pull pass. Plus runtime memento tuning
and new regression harnesses carried over from the balance-audit work.

### Added
- **Full leader/civ ability matrix generation now includes mementos.**
  The matrix generator (`scripts/generate-leader-civ-matrix.mjs`) now parses base + DLC
  memento data, links mementos to leaders (including legend-path specific entries), and
  emits memento channel/risk overlays into the generated JSON/Markdown artifacts. This
  extends the balance audit surface beyond leader/civ traits to include memento effects.
- **Regression harness for complete tuning decision coverage.**
  Added `tests/civ-tuning-coverage.mjs` (+ `npm run test:civ-tuning-coverage`) to enforce
  that every rostered leader/civ from game data has an explicit tuning decision (outlier
  or neutral), with known alias allowances guarded in one place.
- **Runtime memento tuning now composes into leader/civ tuning.**
  `ui/emigration-civ-tuning.js` now reads equipped mementos via
  `Online.Metaprogression.getEquippedMementos(pid)`, applies bounded memento deltas to the
  tuning profile, and keeps explicit outlier/neutral memento decisions under coverage.
- **Hypotheticals sweep harness for hidden anomalies.**
  Added `tests/hypotheticals.mjs` (+ `npm run test:hypotheticals`) with Ulema-like
  specialist/science stress cases, memento-stack pressure cases, and invariants for no
  NaN migration records and strict per-city loss/gain cap adherence.

### Changed
- **Advanced tuning editor rebuilt for full controller support.**
  `ui/options/emigration-advanced-editor.js` now uses a native `fxs-textbox` search box,
  `fxs-button` / `fxs-activatable` controls for reset-all and per-row reset, collapsible
  groups, a modified-value dot, and a two-column grid. Editing any value switches the
  active preset to Custom, and the panel re-syncs its displayed values on focus.
- **Open and Closed Borders now cancel out instead of stacking.**
  `ui/emigration-borders.js` resolves a civ that has BOTH an Open and a Closed Borders
  card slotted to a neutral stance (openness ×1, no retention, stance "none") rather than
  multiplying the two opposing effects together. Border/attraction policy reads are now
  memoized per pass (`resetBorderCache()` runs alongside `resetPolityCache()`), so each
  civ's slotted cards are read once per pass instead of once per candidate on the
  O(cities²) pull hot path; the tradition families and attraction yields are a single
  data-driven registry.

### Fixed
- **Lagged arrivals now wait their turn fairly and perish only as a last resort.**
  `ui/emigration-arrivals.js` defers an arrival whose destination is at its inbound cap
  (or momentarily can't accept it) and retries for up to `MAX_DEFERS` turns, with the
  longest-waiting arrivals landing first so a saturated destination never starves old
  arrivals behind fresh ones. A refugee that still can't find room then perishes (a death)
  rather than force-landing past the cap or lingering in transit forever; a destination
  razed or captured en route still charges a death immediately. This keeps Feature 1b
  transit queues stable during destination spikes and the `maxGainPerCityPerTurn` bound
  strict.

## [1.6.6] - 2026-06-28

Migration balance you can actually steer: settings now apply mid-game, the intensity
presets govern war bursts, and a per-city cap stops sudden mass exodus. Plus a simpler
dashboard option, a per-city "what drives migration" meter, a fully per-tile Ethnic
Composition lens, and continuous low-resolution scaling.

### Fixed
- **Changing the intensity preset (or any setting) now takes effect mid-game.**
  Switching the Emigration intensity to Low, or changing any Advanced tunable,
  used to do nothing until you reloaded the game, because the Options screen and the
  running simulation are separate parts of the UI that only share saved settings. The
  simulation now re-reads your settings every turn, so a change applies on the next
  pass. (If you switch to Low and a city is mid-siege, the gentler limits take hold
  right away.)
- **Migrations no longer come in huge bursts; the intensity presets now actually
  govern them.** Early-era cities could shed ~5 population in a single turn during a
  siege, and the Low/Medium/High presets didn't touch any of the war-driven knobs, so
  picking "Low" couldn't calm it. Now there's a hard **per-city cap** on how many people
  one settlement can lose to migration in a turn (Low 1 / Medium 2 / High 4, also a new
  Advanced tunable), the war-burst defaults are lower, and the presets set all of it,
  so Low is genuinely gentle and High stays intense. The preset selector sits in the
  main Options panel with a note that finer control lives in Advanced settings.

- **Every screen now renders properly on lower resolutions.** On sub-1080p
  displays (1366×768, 1600×900 and similar) the game pins the UI font at its
  smallest size, so all the fixed elements, the title, tab bar, control pills and
  card headers, plus each tab's own displays (the Causes pies, the Net Migration
  and pressure tables, the Policy stances, the Network timeline and legend, the
  Notifications log and the Guide), kept their full size and squeezed the content
  into a sliver. The fixed-size content now scales *continuously* with the
  available height, easing smoothly from full size down to a readable floor as
  the window gets shorter, with no abrupt jumps between resolutions, so every tab
  fills the frame consistently. At the standard resolutions (1080p / 1440p / 4K)
  nothing changes.

### Changed
- **The Ethnic Composition lens now gives every tile its own ethnic mix, and the
  tooltip matches the colour.** Before, each tile was painted a single origin's flat
  colour and hovering any tile showed the same citywide percentages. Now each tile
  carries its own local blend, a diaspora concentrates into a few "neighbourhood"
  tiles where its share runs high and fades at the edges, while most tiles stay all
  the founder's, and the tile's colour is blended from its origins in proportion to
  those shares. Hovering a tile shows that tile's exact percentages, so the colour you
  see and the numbers you read are the same data. The per-tile shares still add up to
  the city's real composition (some tiles more, some less, the total conserved).

### Added
- **A "simplify dashboard" option.** Turning it on (main Options panel) hides the heavy
  migration analytics (the animated Network diagram and the Causes pie charts) and
  keeps the simple, numbers-first tabs: Net Migration, My Cities, Policies, Notifications
  and the Guide, plus the Demographics line graphs. For players who want the population
  and net-migration numbers without the charts.
- **A per-city migration meter on the My Cities / Settlements tab.** Each settlement now
  shows, beside its emigration-pressure bar, a "What's driving it" breakdown, the active
  causes (war, prosperity, unhappiness, disaster) as proportional bars with percentages,
  so you can see at a glance exactly what is pushing people out and by how much.

## [1.6.5] - 2026-06-28

The Ethnic Composition lens now shows immigrated population across the whole city,
gentler wording throughout, and a Migration-window sizing fix.

### Fixed
- **The Migration window's Dots and Flow diagrams now size to the window identically.**
  Both views use the same fit math, but they measured the panel at different moments,
  Dots when it first opened, before the flex layout had settled, and Flow a beat later,
  so one could come up oversized and clipped while the other rendered small with an empty
  band below it. Both now re-fit after the window settles (a couple of short delayed
  passes on top of the existing frame-aligned one), so they converge on the same
  height-bound size that fills the window without oversizing the diagram. Display sizing
  only, no simulation or layout changes.
- **The Ethnic Composition lens now actually shows immigrated population.** The lens
  and its hover panel were frozen on each city's mix as it stood the first time you
  opened them (typically all-one-civilization early on) and never reflected the
  immigration that arrived afterward, so every city read as 100% its founder and the
  map showed no variation. The lens, its tooltip, and the city readout now refresh
  the composition each turn, so diasporas that settle, grow, or return appear as they
  happen. (Cause: the recorder and the map readouts run in separate UI contexts that
  share this data only through the save; the readers were caching it indefinitely.)
- **War-refugee diasporas are attributed to their true homeland.** A refugee whose
  home city was razed or captured during the multi-turn journey could lose its origin
  on arrival (or be miscredited to the conqueror); the migrant now carries its origin
  with it, so even displaced peoples colour the lens correctly.

### Changed
- **Immigrant communities are now spread across the whole city on the lens, not
  banished to the barren outskirts.** Each diaspora claims a share-proportional set of
  tiles (always at least one, so a small community is never invisible) placed evenly
  from the dense core out to the rural fringe, a downtown block here, a rural hamlet
  there, so the mix reads at a glance. The dominant civilization still holds the
  majority of tiles.
- **Gentler, clearer wording throughout.** The per-turn cost of receiving migrants is
  now called the **integration cost** (formerly "assimilation"), matching the mod's
  existing "ethnic integration"; the relevant options group, settings, Civilopedia
  page, and tooltips are renamed to suit. Descriptions of immigrant communities now
  read as "communities" and "diasporas" rather than "minorities"/"foreigners", and a
  couple of incidental metaphors were softened. The same wording changes are applied
  across all 10 supported languages. Wording only, no mechanics change.

## [1.6.4] - 2026-06-27

The Flow view now fits the window like the Dots view.

### Fixed
- **The Flow (arrows) view now sizes to the window like the Dots view.** The
  1.6.2/1.6.3 fit work sized the Dots diagram's 2:1 stage to the available panel
  height, but the Flow view built the same stage and never applied that sizing,
  so its diagram stayed pinned at the CSS height cap and didn't fit/fill the
  window across resolutions. The Flow view now runs the identical stage-fit pass,
  so Dots and Flow render at the same size. Display sizing only, no layout,
  simulation, or canvas-buffer changes.

## [1.6.3] - 2026-06-27

Network and Flow diagram now fills the standalone window.

### Fixed
- **The Network and Flow diagrams now fill the standalone Migration window at
  every resolution.**
  The 1.6.2 fit fix bounded the 2:1 diagram to the dashboard tab body, which is
  capped at 74% of the screen height so it fits the embedded Demographics page.
  Inside the dedicated standalone window (which owns a 94% tall frame) that cap
  left a tall empty band below the diagram. The standalone window's tab body now
  grows to fill its frame, so the diagram uses the full available height while
  the embedded page keeps its shared-screen cap. Display sizing only, no
  layout, simulation, or canvas-buffer changes.

## [1.6.2] - 2026-06-27

Network and Flow diagram scaling fix.

### Fixed
- **The Network and Flow diagrams now fit at every resolution without clipping.**
  On smaller or shorter windows (e.g. a laptop at a moderate resolution) the
  lowest civilization clusters were cut off by the panel edge. The diagram stage
  is now sized against the actual scroll container it lives in, the dashboard's
  tab body, rather than the full viewport, so the 2:1 canvas always fits inside
  the panel. No layout, simulation, or canvas-buffer changes; only the display
  size is adjusted. The fix is also flicker-free on resize: repeated size writes
  are suppressed when the value has not changed.

## [1.6.1] - 2026-06-27

Two truthfulness fixes for the identity systems.

### Fixed
- **The Chronicle no longer invents details a city doesn't have.** Its narrative
  lines used to drop in flavor like "beyond the granaries" or "by the harbour" by
  chance, whether or not the place actually had a granary or a coast. Now each
  founding line reads the city's real surroundings, its terrain (mountains, water,
  coast, rivers) and the buildings it has actually constructed (granary, temple,
  market, walls), and only mentions what's genuinely there, falling back to
  always-true phrasing otherwise. The phrasing is framed at the city's edge, which
  is exactly where the Ethnic Composition lens paints a diaspora, so the story and
  the map agree.
- **Diasporas are now clearly visible on the Ethnic Composition lens.** Minority
  tiles (any origin that isn't the city's dominant civilization) were fading almost
  to invisibility; they now keep a clear color so even a small foreign community
  reads on the map. (A genuinely mono-ethnic early-game city still correctly shows a
  single color, that "100%" reading was real data, not a rendering glitch.)

## [1.6.0] - 2026-06-27

A small interface consolidation: the Migration Chronicle now lives in
Notifications instead of its own tab.

### Changed
- **The Chronicle tab is gone; chronicle moments now appear in the Notifications
  tab as their own type.** The world's great migrations (a city emptied by war, a
  diaspora taking root, a people returning home) still read as short prose, now
  as distinct, purple-accented "Chronicle" entries in the unified Notifications
  list, where each row expands to its title and story (and the underlying cause,
  when it had one). Removing the separate tab keeps everything that actually
  happened in one place. The guide's FAQ now points to Notifications accordingly.

## [1.5.1] - 2026-06-27

A small refinement to the refugee-decision dilemma.

### Changed
- **Welcoming refugees now carries a short-term happiness cost** in addition to the
  gold, reflecting the strain of absorbing a wave of newcomers (settling them on the
  frontier stays cheaper, turning them away still costs international standing). The
  choice cues now spell out each cost, and the cost reads are hardened against a
  missing/invalid tuning value.

## [1.5.0] - 2026-06-27

A disaster-rebalance and game-speed-fairness release. Disasters now hurt in
proportion to what they actually did (a harmless thunderstorm is nearly free; a
catastrophic volcano still bites), they no longer over-punish slow speeds, and a
city always recovers. A sweep of other per-turn effects that quietly drifted with
the game-speed slider, immigration cost/reward, crisis lethality, alert pacing,
now keep a constant game-time feel. Gameplay rules are unchanged; this is balance
and presentation, all adjustable under Options ▸ Mods ▸ Emigration.

### Changed
- **Disasters now hurt in proportion to what they actually did.** A disaster's
  population pressure is scaled by its measured impact (tiles pillaged, yields
  cut, buildings damaged), bounded by its type, so a thunderstorm that pillages
  nothing is nearly free, while a catastrophic volcano still bites. Type sets the
  ceiling; the measured impact picks where in that band the event lands.
- **Disasters no longer over-punish slow game speeds.** A one-shot disaster shock
  is divided by the speed scalar so its *total* cost over the (longer) fade is
  about the same on Marathon as on Standard, instead of paying the full per-turn
  hit on ~3× as many turns. Repeated disasters now stack with diminishing returns
  under a hard cap, so a city always recovers (no "dead for the rest of the game").
  All of the above is on by default and fully adjustable under Options ▸ Mods ▸
  Emigration.

### Fixed
- **Several per-turn effects now keep the same game-time feel across speeds.** The
  immigrant-integration cost, the attraction-yield dividend, crisis death-pressure,
  and the world-news notification spacing were all paced in raw turns; they are now
  speed-scaled like the rest of the model, so immigration's cost/reward and crisis
  lethality no longer drift with the speed slider, and alerts no longer go silent on
  Marathon / spammy on Online.
- **A city no longer panics off a cliff.** Directional war-flight now ramps in
  smoothly past the flee threshold instead of snapping to full strength on a single
  bad turn.
- **Hardened the people-scaling soft ceiling** against a divide-by-zero in the (today
  impossible) case of a zero ceiling.
- **Migration readout now localizes its unit words.** The "population point(s)" /
  "people" labels in the migration log line are now pulled from localized strings
  (with the English phrasing as a fail-safe) instead of being hardcoded English.
- **Exact population numbers now group digits the player's way.** Grouped integers
  (e.g. `12,400`) use the locale's separators where the runtime exposes them
  (`12.400`, `12 400`, …), falling back to the previous grouping otherwise.

## [1.4.0] - 2026-06-27

A population-realism release, in lockstep with the **Demographics** mod's 2.1.0.
The "people" counts behind every migration figure are reworked so they read at a
believable historical scale in **every age** instead of ballooning in the late
game. Gameplay rules are unchanged, this is how the numbers are *displayed*.

### Changed
- **Migration people-counts are now grounded in Civilization VII's own per-era
  growth formula.** The old `raw^1.11 × 12,000 × 1.009^turn` curve is gone.
  Each settlement's "people" figure is derived from the game's real growth cost
  for the age it's in, so a point leaving a town in Antiquity reads as a few
  thousand while the same point in a Modern metropolis reads far larger, with a
  smooth, continuous hand-off across age boundaries and no dependence on the raw
  turn count (so it no longer drifts with game speed). Still pinned bit-for-bit
  to Demographics by a shared parity test, so the two mods always agree on a
  given settlement.
- **Per-event variation now leans on real game signals.** A migration's reported
  people-count still varies so two events never read identically, but the lean is
  now drawn from the source settlement's actual happiness and urban/rural mix
  (its identity only as a tie-breaker) rather than a bare name hash.

### Added
- **Modern megacities & "one more turn".** The largest Modern settlements now
  scale into the real 10–38 million range, and if you keep playing past the
  natural end of the game the figures keep growing instead of flat-lining
  (bounded so they can never run away).

### Internal
- Cross-mod parity reference extended to the new growth-formula, megacity,
  ceiling, and overtime constants; new scaling, anchor, and continuity tests.

## [1.3.1] - 2026-06-27

A polish, stability, and quality-assurance release. No gameplay rules changed.
Two visible fixes (chart sizing and a stray toggle), a round of crash-hardening
against corrupt or old saves, and a new install-integrity gate that makes a
broken release effectively impossible to ship.

### Fixed
- **Migration charts now fill the window at every resolution.** The Network and
  Flow diagrams were capped to roughly half the viewport height, leaving a large
  empty band beneath them on tall / high-resolution displays (e.g. 3024x1964).
  They now measure the space actually available and grow to use it, while still
  shrinking to fit smaller resolutions, and keep their 2:1 aspect so the dots
  never distort.
- **The "Scaled Pop / Civ Pop" number toggle no longer appears on the Guide
  tab.** It was showing on every tab of the standalone Migration window,
  including the static Guide (under both the "What counts" and "FAQ" pills). It
  is now hidden wherever there are no population counts to switch (Guide, Network,
  Policies, Notifications, Chronicle), matching the embedded Demographics view.

### Changed
- Confirmed and documented that migration-event population counts use the exact
  same age-scaled formula as the Demographics settlements board
  (`raw^1.11 x 12000 x 1.009^turn`, plus the Modern megacity ramp). A single
  point fleeing early in Antiquity reads as a believable ~13,000 people rather
  than hundreds of thousands, and the two mods always agree for the same
  settlement. No numbers changed; this behaviour is now locked in by a test.

### Hardening (crash safety)
- **Resize-listener leak fixed.** The new chart-sizing code registered a window
  `resize` handler on every chart render (tab switch, Dots/Flow toggle, Units
  toggle) and only cleaned it up lazily, so handlers accumulated for the whole
  session and could cause a reflow hitch on the next window resize. A single
  shared listener now tracks only the current chart.
- **Ethnic-composition state is validated on load.** A corrupt or old-schema
  saved blob could previously throw on the ethnicity-lens, hover-tooltip, and
  city-readout render paths. Every entry is now validated and coerced on load
  (bad entries dropped, totals derived from the data, the map bounded), so a
  malformed save can no longer crash those screens.
- **Chronicle and Notification logs are validated on load**, and their writes no
  longer emit `undefined`-valued fields. The in-memory cache now stays identical
  to what is saved (no divergence across a reload), and old-schema entries can't
  reach the views as wrong-typed values.

### Tests and quality gates
- New **`validate-package`** install-integrity gate, run on every `verify` and
  every release. It checks: XML well-formedness of the modinfo and all data/text
  files across all 10 locales (catching, for example, an unescaped `&` that the
  regex localisation test would miss); that every file the modinfo references
  exists; no duplicate Civilopedia primary keys; full locale parity (every key
  present, correct `Language` attribute, no duplicate tags); that every LOC key
  used in the database is defined; and that every mod-owned database identifier
  is uniquely namespaced so it can never collide with the base game or another
  Workshop mod.
- Verified **zero** database / text / id / UI collisions against 230 other
  published mods, confirming Emigration is safe to install alongside them.
- New **`scaling-demographics-parity`** test pins migration-event scaling to the
  Demographics formula across the full Antiquity -> Modern range, failing if
  either mod's constants drift.
- New **`composition-malformed`** and **`persistence-normalization`** tests prove
  the hardened loaders drop or repair corrupt saves without throwing, and that
  log writes round-trip cleanly through save/reload.
- **Major automated test-coverage expansion.** Around two dozen new branch- and
  defensive-path regression harnesses now exercise error paths and edge cases
  across the mod's subsystems, not just the happy path:
  - screen lifecycle and controls (`screen-controls-throws`,
    `screen-controls-unavailable`, `screen-context-manager-branches`,
    `screen-lifecycle-branches`, `views-render-branches`);
  - effects, dividends and migrant units (`effects-branches-extra`,
    `dividend-defensive-branches`, `dividend-normalization-branches`);
  - events and causes (`event-attribution-branches`, `per-cause-metrics`,
    `disasters-branches-extra`, `combat-branches`);
  - cities and Demographics integration (`cities-branches-extra`,
    `cities-signals`, `demographics-branches-extra`, `flow-history-branches-extra`);
  - ethnicity, governance, settings and config
    (`ethnicity-distribution-branches`, `governance-branches-extra`,
    `settings-branches-extra`, `config-types`, `window-state`).

  The automated suite now runs 95 test scripts in total.

### Internal
- Extracted the chart viewport-fit logic into `ui/emigration-network-fit.js`.
- `max-len` and `no-unused-vars` remain error-level; all new code passes ESLint,
  `tsc`, and the full test suite, which now runs the four new harnesses above.

## [1.3.0] - 2026-06-26

### Added
- **Migration Chronicle.** A new "Chronicle" tab in the Demographics Migration
  screen writes the world's great migrations as short history: cities that
  emptied in war or disaster, diasporas that took root far from home, and peoples
  who returned once their homeland recovered.
- **Per-tile ethnicity lens.** The Ethnic Composition lens now paints each
  settlement as a density mosaic instead of one flat colour: urban tiles read
  denser, minorities cluster on the rural fringe, and each origin's share of the
  population is preserved across the tiles.
- **Ethnic integration over time.** Newcomers gradually take on their host's
  identity, held apart while their homeland is at war with the host or the city
  is in unrest, so a contested city keeps its colours on the lens.
- **Return migration.** When a homeland is at peace and prospering again, some of
  its people abroad set out for home, moving real population back over time.
- **Refugee decisions.** Once in a while, when a neighbour's conquest spree or a
  plague crisis sends a wave of refugees toward your lands, a short decision
  appears: welcome them, settle them on the frontier, or turn them away. Rare by
  design, and toggleable under Options (Emigration, refugee decisions).

### Changed
- **War refugee events name both sides.** A war was reported as "British vs. the
  enemy" whenever the other side wasn't tracked. It now names both belligerents
  when you have met them, and reads "British vs. an unmet civilization" when you
  have not, so a war is always named without revealing a civ you haven't met.
- **Exact, varied people counts.** Notification figures are now precise numbers
  (for example 35,670) rather than rounded prose, and vary per settlement so two
  same-size places never report the identical count.
- **Immediate disaster popups name the settlement struck**, and a refugee crisis
  now names the disaster that hit that civilization rather than the most recent
  one anywhere in the world.

### Fixed
- **Return migration no longer inflates world population.** It now draws only
  from settlements that have rural population to give, and is paced as an
  occasional ebb rather than a constant stream.

## [1.2.0] - 2026-06-25

### Changed
- **World-news notifications now name WHO was affected, with spoiler protection.**
  Refugee-crisis headlines for wars, disasters, and conquests led with the event
  but not the civ; they now lead with the affected civilization. Unmet civs are
  never revealed, they're reported as "an unmet civilization" (the same mask the
  dashboard uses), and the notification log is masked the same way.
- **Disaster popups now default to migration-affecting events.** The on-screen
  disaster toast was driven by severity alone, which felt invasive at high
  disaster frequencies. By default it now pops only for disasters that strike a
  settlement (so they actually drive migration) and meet the minimum severity.
  The notifications log still records every severe disaster regardless, so the
  quieter popups never lose the record.

### Added
- **"Disaster popups" knob** (Notifications group): 0 = off (log only), 1 =
  migration-affecting only (default), 2 = any disaster at/above the minimum
  severity (the previous behavior). Pairs with the existing "min disaster
  severity" knob for full control.

## [1.1.0] - 2026-06-25

### Fixed
- **Critical mod-compatibility fix.** Emigration could wipe other mods' settings out
  of the shared options store. Mods share one `modSettings` blob (one slice each);
  when the game's UI layer handed back a momentarily-empty or unreadable copy of it,
  Emigration wrote back only its own slice, and, worse, reset the whole blob to empty
  whenever it couldn't parse it, deleting every other mod's saved options. Emigration
  now re-reads on an empty result, refuses to write when the shared store can't be
  safely read, only ever touches its own slice, and never resets the blob.

### Added
- **Brush & Blade civ/leader tuning pass.** Extended the per-leader/civ variance table
  (`ui/emigration-civ-tuning.js`, Algorithm C) to cover the expansion's new civilizations and
  leaders, with abilities verified against `Contents_1.4.1/resources/DLC`. All nudges are bounded
  and only applied to genuine migration *outliers*, the goal is to prevent snowballing, not flatten
  civ identity. 8 leaders: conquerors who profit from taking cities pay more gold to absorb the
  spoils (Alexander, Genghis Khan, Edward Teach `assimilationEase` 1.2–1.25); Bolívar instead
  *integrates* conquests cheaply (0.85); Toyotomi takes double damage defending so his cities also
  shed population faster under siege (`warRetention` 0.85); Himiko is a happiness/celebration magnet
  (`happinessPull` 0.85); Napoleon's FOOD_BANE base persona gets a small growth cushion
  (`sourceBias` 0.5); Sayyida al-Hurra's naval-garrison cities resist depopulation (`warRetention`
  1.2). 12 civilizations: conquest economies (Assyria, Bulgaria, Ottomans, Pirate Republic) pay more
  to absorb spoils, Pirate Republic's inland-unhappiness also makes it a net *source* (`sourceBias`
  −0.5); tall/few-settlement shapes are shielded from the density penalty (Carthage, Nepal, Qajar);
  fortification-defensive civs retain population under siege (Dai Viet, Sengoku `warRetention` 1.4);
  happiness/celebration magnets are damped (Heian, Silla, Ottomans, Qajar); and high-growth Shawnee
  gets a cushion so per-capita dilution doesn't bleed pop (`sourceBias` 0.75). Iceland, Tonga, Great
  Britain, and four leaders (Ada Lovelace, Gilgamesh, Lakshmibai, Friedrich) were reviewed and left
  neutral, no migration-relevant outlier. The whole layer remains gated by `civTuningEnabled`.
- **Civ-tuning strength knob (`civTuningStrength`, default 0.7).** A single global "flatten between
  civilizations" control that compresses every per-leader/civ profile toward neutral: 1.0 = the full
  table as written, 0 = fully flat (equivalent to the table off). It interpolates each field toward
  its own neutral, so relative ordering is preserved (the most defensive civ stays the most
  defensive) while the absolute spread (the gap that feeds a snowball) shrinks uniformly across
  base and expansion entries. The default 0.7 keeps each civ's character but trims the divergence
  ~30% as an extra anti-snowball margin; exposed as a Scope tunable (0 / 0.4 / 0.7 / 1) for dialing.

## [1.0.0] - 2026-06-23

### Changed
- **1.4.1 happiness/economy rebalance.** A full-parameter calibration sweep
  (`scripts/calibration-sweep.mjs`, scored against a player-experience rubric) found the shaped
  happiness model was *saturating* the prosperity score: happiness drove ~90% of the migration
  signal and the happiness multiplier sat pinned at its clamp, so real economic differences,
  including 1.4.1's now-harsher −5%/point unhappiness yield penalty, were invisible (a city's
  economy barely affected whether people left it). Re-tuned the shipped defaults to de-saturate and
  rebalance: yield weights ×2.5 (`foodFactor`/`productionFactor`/`goldFactor` 1→2.5, science 0.25→
  0.625, culture 0.5→1.25), `happyFloor` 8→4, `happyAmp` 0.8→0.2, `happyRepulsion` 2→1.8. Result:
  economy now carries ~28% of the signal (happiness still primary), the −5% penalty is 8× more
  visible, prosperity is monotonic in economy at every happiness level, and the *overall* prosperity
  scale is held constant so the friction/pacing constants are unchanged. **Snowball-checked**
  (`scripts/snowball-stress.mjs`): the new calibration's dominance ceiling is equal-or-lower than the
  old across happy/rich/rich+happy leader profiles (e.g. 1.60→1.30 for a happy leader), because
  de-saturating lifts the field and shrinks the gap that fed a leader, so it is *less* snowball-prone,
  not more. `polityModelEnabled: false` still restores the full pre-1.4.1 model (old weights included).

### Added
- **Civ VII 1.4.1 polity model.** The migration model now reads the systems 1.4.1
  reworked (happiness *stages*, governments, and celebrations) and feeds them in as
  bounded, additive pull/push terms (`polityModelEnabled`, default on; set false for exact
  pre-1.4.1 scoring):
  - **Happiness stages.** Each settlement's 5-stage ordinal (Angry → Ecstatic, read from
    `GameInfo.HappinessStages`) adds a happiness response. It's **pull-biased**
    (`happinessStageMiseryScale`): full weight on the happy side (positive happiness doesn't boost
    yields in 1.4.1, so happy-city attraction is under-modeled), quarter weight on the misery side
    (already covered by the happiness term + the now-harsher −5%/point suppressed yields, so a
    full-weight negative would triple-count). Balance-checked with `scripts/happiness-balance.mjs`,
    which measured the −5% yield change to be near-inert in the happiness-dominated shaped model
    (it shifts the content→unhappy pull gradient by ~1%).
  - **Celebrations (Golden Ages).** A civ in a celebration, now scarcer and tourism-feeding
, becomes a stronger attractor (`celebrationPull`).
  - **Governments.** A small, clamped per-government flavor lean (`governmentWeight`,
    `governmentLeanCap`) breaks ties between similar destinations; the bulk of a government's
    effect already reaches the model through the happiness and yields it produces.
  - **War weariness.** A war-weary civ's settlements take a modest empire-wide push
    (`warWearinessModifier`), distinct from the in-border violence terms it composes with.
  - Verified against the installed 1.4.1.28 game data: all existing reads and the policy XML
    foreign keys still resolve, so this is an additive pass, not a compatibility fix. See
    `docs/v1.4.1-deep-pass-plan.md`.
- **Population scaling alignment refresh.** Emigration's scaled-people math now
  mirrors Demographics' current city formula exactly: `raw^1.11 · 12000 · 1.009^turn`
  plus the same Modern-only smooth megacity ramp/boost, removing the earlier
  baseline mismatch.
- **Migration legibility, Demographics page (Phase 4).** When the Demographics mod is
  installed (and recent enough to expose the new `registerPanel` companion hook), Emigration
  contributes a dedicated **Migration** page to its screen, mounting the same dashboard render
  core as the standalone window. Order-independent handshake; a silent no-op on an older
  Demographics (the standalone window still covers the same content). Requires the matching
  Demographics-side change (its CHANGELOG).
- **Migration legibility, dashboard window (Phase 3).** A standalone HUD window
  (`emigration.window()` / `emigration.closeWindow()`) showing the whole migration picture:
  a per-civ ledger (in / out / net / refugees / deaths), the world's "why people move"
  breakdown by cause with shares, who holds Pro-/Anti-Immigration stances, and your cities
  ranked by migration pressure. Built on a shared render core (`emigration-views.js`) that
  the Demographics page (Phase 4) will reuse, so it works with or without Demographics.
- **Migration legibility, per-city readout (Phase 2).** An on-demand HUD panel that
  explains why a settlement is gaining or losing population: the dominant cause and its
  status (building pressure / resting), where its people are being pulled (and whether to a
  rival), the assimilation cost, the civ's net migration, a "what can I do" hint, a
  temporary/persistent cue, and an at-risk / trapped-with-no-refuge warning. Opens via the
  console (`emigration.city(id)` / `emigration.hideCity()`) and best-effort on city
  selection; toggle in Options → Mods (`cityReadoutEnabled`), corner via `cityReadoutCorner`.
  Reuses the Phase-0 `citySnapshot` (recompute-on-read, no new state) and the Phase-1
  localized hint/permanence strings.
- **Migration legibility, explanatory toasts (Phase 1).** Builds on the data core to
  answer *why did I lose population?* in the moment:
  - A **local-player digest**: when your cities lose people in a pass, one throttled toast
    (the existing important-toast cooldown, no extra spam) names the dominant cause, what
    you can do about it, whether it's temporary or persistent, and, for a cross-civ loss,
    what the destination pays to assimilate them. e.g. *"12 thousand people left Rome,
    unhappy at home. Raise this city's happiness, or slot an Anti-Immigration Stance to
    retain them. It continues until you address the cause."*
  - The verbose per-cause toasts and the disaster alert now carry their **action hint** too.
  - 14 new localized strings (per-cause loss headline, action hint, permanence cue, cost
    note), **translated into all 10 languages**.
- **Migration legibility, data core (in-game readout, Phase 0).** Groundwork for
  explaining *why* a settlement gains or loses population:
  - A single source-of-truth cause taxonomy (`ui/emigration-causes.js`): one
    `MigrationCause` typedef (previously duplicated), plus `causeLabel` /
    `causePermanence` / `causeHint` / `isRefugeeCause`. The cause strings are
    persisted routing keys, so the set is additive, nothing was renamed.
  - **`prosperity` is now emitted** as a distinct cause: a content city that loses
    people to a better-off neighbour reports *Attraction*, no longer mislabeled
    *Unhappiness* (split at `unhappyCauseThreshold`; reporting only, movement is
    unchanged). The refugees tally + the refugee "camp" transit lag now key on
    `isRefugeeCause` (war/disaster/conquest), so prosperity/unhappiness moves are
    correctly excluded. (`conquest` remains reserved for a later capture-detection
    phase.)
  - **Per-city snapshot** (`ui/emigration-city-readout-data.js`): a pure
    `buildCitySnapshot` (cause + label + permanence + action hint, distress /
    at-risk / attrition-risk flags, pressure-to-bar + cooldown, where people are
    being pulled, the destination's assimilation cost, owner net/in/out) plus a
    recompute-on-read `citySnapshot(cityId)`, no new persisted state.
  - Migration records now carry **`destPaidCost`** (the assimilation load the
    destination took on), and `EmigrationData` exposes `citySnapshot` plus a
    session-local `recentEventsFor` feed.
  - Demographics per-cause attribution now flows through the shared `causeLabel`.
- **Migrant-holding penalty.** A civilization is now charged each turn for every
  unsettled `UNIT_MIGRANT` it holds (via `grantYield`, scaling with the count), so
  overflow migrants must be settled rather than hoarded. Tunable (`migrantHoldGold`
  / `migrantHoldHappiness`, 0 = off). Reliable for the local player; best-effort
  for AI (their units may be fog-limited - the dev probe's new VERIFY button checks
  this in-game).

### Removed
- The dead "unemployed workers over the city's cap" prosperity term - Civ VII has
  no such mechanic (the specialist cap is a hard placement limit, so it never
  fired). Not replaced: a civ over its *settlement* cap is already penalized with
  happiness by the base game, which this model reads via the happiness term, so an
  explicit settlement-cap term would just double-count.

### Added (earlier this cycle)
- **Migration now has a real, in-game cost - duration-based (assimilation load).**
  Civ VII's population model has no per-citizen cost, so growth/migration is
  otherwise free. When a settlement absorbs a migrant, its civilization gains
  **assimilation load** scaled by destination size; that load **decays each turn**
  (the duration) and the civ pays a per-turn `grantYield` cost proportional to its
  current load - a **gold** drain (probe-confirmed to deduct, cross-civ) and a
  **happiness** drain (inferred). So receiving migrants costs you *for a while* as
  they integrate, and a magnet civ that keeps pulling people in keeps paying every
  turn - the continuous negative feedback that earlier (one-time / max-size) costs
  lacked. Scoped to *migrated* population only; natural growth never adds load.
  Cross-civ (applies to every civ on its own turn; foreign unit/yield writes are
  probe-confirmed). Persisted in `GameConfiguration`. Tunable in **Options → Mods →
  Emigration - Advanced** (load per migrant, overcrowding scaling, **decay =
  duration**, happiness/gold per turn); any to 0 disables it. New
  `ui/emigration-effects.js`. (Supersedes the earlier one-time migration cost.)
- **Demographics integration.** When the Demographics mod is installed, Emigration
  adds a **Net migration** graph to its Historical Data → Power page, alongside
  Population. It plots each civilization's net migration over time - immigration
  minus emigration, in the same historically-scaled "people" units - so a line
  above zero is net population gain from migration and below zero is net loss.
  Driven through Demographics' normal sample → store → line-chart pipeline via a
  small companion-mod hook it now exposes (`globalThis.DemographicsMetricsAPI`).
  The graph appears iff Demographics is actually installed - registration is
  load-order-independent (it registers immediately if Demographics is up, or
  queues for Demographics to drain when its lazily-loaded metrics module
  initializes), and if Demographics is absent nothing is ever shown.
- The tunables are now exposed in the **Options → Mods** screen, in both the
  main-menu (pregame) and in-game Options. An **Emigration intensity** preset
  (Custom / Low / Medium / High) is the simple control; an **"Emigration -
  Advanced"** group exposes the individual knobs (pacing, scope, prosperity
  weights, war/violence, geography) as dropdowns and checkboxes. Settings persist
  in the shared `modSettings` slice and apply to the live config immediately
  (and at game boot). Applying a preset writes the relevant advanced values
  (reopen Options to see those controls refresh). Driven by a declarative
  `emigration-tunables.js` spec, so adding a knob is one line. Population-scaling
  constants are intentionally not exposed (they must match the Demographics mod).

### Changed
- War-driven emigration is now gated on **actual violence inside a city's
  borders**, not on the empire merely being at war. A per-city violence score
  drives it, built entirely from **polled, fog-independent** signals so that wars
  the player can watch and distant AI-vs-AI wars register identically (no bias
  toward player-adjacent conflicts):
  - **District damage.** Each turn the mod reads the city center district's health
    (`Players.Districts.get(owner).getDistrictHealth` / `getDistrictMaxHealth`)
    for every met city. The gameplay model exposes this regardless of line of
    sight, so a foreign city being sacked **out of view** still registers. Fresh
    damage spikes the score; standing damage sustains ongoing-siege pressure.
  - **Pillage.** Damaged improvements on a city's purchased plots
    (`MapConstructibles` / `Constructibles…damaged`) add a small standing pressure
    per pillaged tile until repaired. This is **pressure only** - it slides
    emigration up via the prosperity penalty and never moves or destroys a pop
    point, so repairing a tile can't recycle population. Gated behind `vwPillage`
    (set to 0 to skip the per-plot scan).
  The score **decays each turn**, so it tracks recent, ongoing fighting: a
  sustained siege builds high; a lone raid fades in 2–3 turns (the "duration"
  dimension). Emigration scales on a sliding scale with intensity (up to
  `violenceCapPct`). A civilization at war but with no fighting in a given city's
  territory produces no war-driven emigration there.
- Emigration is now geographically influenced. Destinations are penalized by hex
  distance from the source (`distanceFactor`), so migration stays regional:
  people move to nearby settlements rather than teleporting across the map.
- War no longer blocks cross-civ migration, and a besieged city's refugees flee
  *away* from the nearest invading civilization (`fleeFactor`, now gated on the
  violence score) - the Mongol-invasion effect of an army from the east driving
  people west. People can emigrate to any civilization.

## [0.1.0] - 2026-06-10

### Added
- Citizens emigrate from unhappy, struggling settlements to happier, more
  prosperous ones - within and between civilizations - each local-player turn,
  driven by a Civ V-style Prosperity model (per-capita food/production/gold/
  science/culture, happiness, war/siege/starvation/unrest/unemployment).
- Migration reporting aligned with the Demographics mod's population scaling
  (`raw^1.11 · 3000 · 1.009^turn`), so a moved population point is reported as a
  historically representative people count.
- Options screen setting (Options → Mods → "Emigration • migration counts"):
  show both the Civ population number and the historical people count (default),
  or either one alone. Persisted via the shared `modSettings` localStorage slice.
- Dev dock controls: run a migration pass now, dump the current city prosperity
  ranking.

### Internal
- Brought the project to the Demographics repo standard: typed JavaScript with
  JSDoc checked by `tsc --noEmit`, ESLint modularization gate, a node test
  harness, 10-locale `ModText.xml` localization, and a `release.sh` that ships
  readable, debug-muted JS behind an allow-list audit.
