# Changelog

All notable changes to the **Emigration** mod for Civilization VII. Loosely
follows [Keep a Changelog](https://keepachangelog.com/) and Semantic Versioning.
The Steam Workshop change note for each release is generated from the matching
section below by `release.sh`.

## [Unreleased]

## [1.5.0] - 2026-06-27

A disaster-rebalance and game-speed-fairness release. Disasters now hurt in
proportion to what they actually did (a harmless thunderstorm is nearly free; a
catastrophic volcano still bites), they no longer over-punish slow speeds, and a
city always recovers. A sweep of other per-turn effects that quietly drifted with
the game-speed slider — immigration cost/reward, crisis lethality, alert pacing —
now keep a constant game-time feel. Gameplay rules are unchanged; this is balance
and presentation, all adjustable under Options ▸ Mods ▸ Emigration.

### Changed
- **Disasters now hurt in proportion to what they actually did.** A disaster's
  population pressure is scaled by its measured impact (tiles pillaged, yields
  cut, buildings damaged), bounded by its type — so a thunderstorm that pillages
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
game. Gameplay rules are unchanged — this is how the numbers are *displayed*.

### Changed
- **Migration people-counts are now grounded in Civilization VII's own per-era
  growth formula.** The old `raw^1.11 × 12,000 × 1.009^turn` curve is gone.
  Each settlement's "people" figure is derived from the game's real growth cost
  for the age it's in, so a point leaving a town in Antiquity reads as a few
  thousand while the same point in a Modern metropolis reads far larger — with a
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
  never revealed — they're reported as "an unmet civilization" (the same mask the
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
  Emigration wrote back only its own slice — and, worse, reset the whole blob to empty
  whenever it couldn't parse it — deleting every other mod's saved options. Emigration
  now re-reads on an empty result, refuses to write when the shared store can't be
  safely read, only ever touches its own slice, and never resets the blob.

### Added
- **Brush & Blade civ/leader tuning pass.** Extended the per-leader/civ variance table
  (`ui/emigration-civ-tuning.js`, Algorithm C) to cover the expansion's new civilizations and
  leaders, with abilities verified against `Contents_1.4.1/resources/DLC`. All nudges are bounded
  and only applied to genuine migration *outliers* — the goal is to prevent snowballing, not flatten
  civ identity. 8 leaders: conquerors who profit from taking cities pay more gold to absorb the
  spoils (Alexander, Genghis Khan, Edward Teach `assimilationEase` 1.2–1.25); Bolívar instead
  *integrates* conquests cheaply (0.85); Toyotomi takes double damage defending so his cities also
  shed population faster under siege (`warRetention` 0.85); Himiko is a happiness/celebration magnet
  (`happinessPull` 0.85); Napoleon's FOOD_BANE base persona gets a small growth cushion
  (`sourceBias` 0.5); Sayyida al-Hurra's naval-garrison cities resist depopulation (`warRetention`
  1.2). 12 civilizations: conquest economies (Assyria, Bulgaria, Ottomans, Pirate Republic) pay more
  to absorb spoils — Pirate Republic's inland-unhappiness also makes it a net *source* (`sourceBias`
  −0.5); tall/few-settlement shapes are shielded from the density penalty (Carthage, Nepal, Qajar);
  fortification-defensive civs retain population under siege (Dai Viet, Sengoku `warRetention` 1.4);
  happiness/celebration magnets are damped (Heian, Silla, Ottomans, Qajar); and high-growth Shawnee
  gets a cushion so per-capita dilution doesn't bleed pop (`sourceBias` 0.75). Iceland, Tonga, Great
  Britain, and four leaders (Ada Lovelace, Gilgamesh, Lakshmibai, Friedrich) were reviewed and left
  neutral — no migration-relevant outlier. The whole layer remains gated by `civTuningEnabled`.
- **Civ-tuning strength knob (`civTuningStrength`, default 0.7).** A single global "flatten between
  civilizations" control that compresses every per-leader/civ profile toward neutral: 1.0 = the full
  table as written, 0 = fully flat (equivalent to the table off). It interpolates each field toward
  its own neutral, so relative ordering is preserved (the most defensive civ stays the most
  defensive) while the absolute spread — the gap that feeds a snowball — shrinks uniformly across
  base and expansion entries. The default 0.7 keeps each civ's character but trims the divergence
  ~30% as an extra anti-snowball margin; exposed as a Scope tunable (0 / 0.4 / 0.7 / 1) for dialing.

## [1.0.0] - 2026-06-23

### Changed
- **1.4.1 happiness/economy rebalance.** A full-parameter calibration sweep
  (`scripts/calibration-sweep.mjs`, scored against a player-experience rubric) found the shaped
  happiness model was *saturating* the prosperity score: happiness drove ~90% of the migration
  signal and the happiness multiplier sat pinned at its clamp, so real economic differences —
  including 1.4.1's now-harsher −5%/point unhappiness yield penalty — were invisible (a city's
  economy barely affected whether people left it). Re-tuned the shipped defaults to de-saturate and
  rebalance: yield weights ×2.5 (`foodFactor`/`productionFactor`/`goldFactor` 1→2.5, science 0.25→
  0.625, culture 0.5→1.25), `happyFloor` 8→4, `happyAmp` 0.8→0.2, `happyRepulsion` 2→1.8. Result:
  economy now carries ~28% of the signal (happiness still primary), the −5% penalty is 8× more
  visible, prosperity is monotonic in economy at every happiness level, and the *overall* prosperity
  scale is held constant so the friction/pacing constants are unchanged. **Snowball-checked**
  (`scripts/snowball-stress.mjs`): the new calibration's dominance ceiling is equal-or-lower than the
  old across happy/rich/rich+happy leader profiles (e.g. 1.60→1.30 for a happy leader), because
  de-saturating lifts the field and shrinks the gap that fed a leader — so it is *less* snowball-prone,
  not more. `polityModelEnabled: false` still restores the full pre-1.4.1 model (old weights included).

### Added
- **Civ VII 1.4.1 polity model.** The migration model now reads the systems 1.4.1
  reworked — happiness *stages*, governments, and celebrations — and feeds them in as
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
  - **Celebrations (Golden Ages).** A civ in a celebration — now scarcer and tourism-feeding
    — becomes a stronger attractor (`celebrationPull`).
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
- **Migration legibility — Demographics page (Phase 4).** When the Demographics mod is
  installed (and recent enough to expose the new `registerPanel` companion hook), Emigration
  contributes a dedicated **Migration** page to its screen, mounting the same dashboard render
  core as the standalone window. Order-independent handshake; a silent no-op on an older
  Demographics (the standalone window still covers the same content). Requires the matching
  Demographics-side change (its CHANGELOG).
- **Migration legibility — dashboard window (Phase 3).** A standalone HUD window
  (`emigration.window()` / `emigration.closeWindow()`) showing the whole migration picture:
  a per-civ ledger (in / out / net / refugees / deaths), the world's "why people move"
  breakdown by cause with shares, who holds Pro-/Anti-Immigration stances, and your cities
  ranked by migration pressure. Built on a shared render core (`emigration-views.js`) that
  the Demographics page (Phase 4) will reuse, so it works with or without Demographics.
- **Migration legibility — per-city readout (Phase 2).** An on-demand HUD panel that
  explains why a settlement is gaining or losing population: the dominant cause and its
  status (building pressure / resting), where its people are being pulled (and whether to a
  rival), the assimilation cost, the civ's net migration, a "what can I do" hint, a
  temporary/persistent cue, and an at-risk / trapped-with-no-refuge warning. Opens via the
  console (`emigration.city(id)` / `emigration.hideCity()`) and best-effort on city
  selection; toggle in Options → Mods (`cityReadoutEnabled`), corner via `cityReadoutCorner`.
  Reuses the Phase-0 `citySnapshot` (recompute-on-read, no new state) and the Phase-1
  localized hint/permanence strings.
- **Migration legibility — explanatory toasts (Phase 1).** Builds on the data core to
  answer *why did I lose population?* in the moment:
  - A **local-player digest**: when your cities lose people in a pass, one throttled toast
    (the existing important-toast cooldown — no extra spam) names the dominant cause, what
    you can do about it, whether it's temporary or persistent, and — for a cross-civ loss —
    what the destination pays to assimilate them. e.g. *"12 thousand people left Rome,
    unhappy at home. Raise this city's happiness, or slot an Anti-Immigration Stance to
    retain them. It continues until you address the cause."*
  - The verbose per-cause toasts and the disaster alert now carry their **action hint** too.
  - 14 new localized strings (per-cause loss headline, action hint, permanence cue, cost
    note), **translated into all 10 languages**.
- **Migration legibility — data core (in-game readout, Phase 0).** Groundwork for
  explaining *why* a settlement gains or loses population:
  - A single source-of-truth cause taxonomy (`ui/emigration-causes.js`): one
    `MigrationCause` typedef (previously duplicated), plus `causeLabel` /
    `causePermanence` / `causeHint` / `isRefugeeCause`. The cause strings are
    persisted routing keys, so the set is additive — nothing was renamed.
  - **`prosperity` is now emitted** as a distinct cause: a content city that loses
    people to a better-off neighbour reports *Attraction*, no longer mislabeled
    *Unhappiness* (split at `unhappyCauseThreshold`; reporting only — movement is
    unchanged). The refugees tally + the refugee "camp" transit lag now key on
    `isRefugeeCause` (war/disaster/conquest), so prosperity/unhappiness moves are
    correctly excluded. (`conquest` remains reserved for a later capture-detection
    phase.)
  - **Per-city snapshot** (`ui/emigration-city-readout-data.js`): a pure
    `buildCitySnapshot` (cause + label + permanence + action hint, distress /
    at-risk / attrition-risk flags, pressure-to-bar + cooldown, where people are
    being pulled, the destination's assimilation cost, owner net/in/out) plus a
    recompute-on-read `citySnapshot(cityId)` — no new persisted state.
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
  distance from the source (`distanceFactor`), so migration stays regional -
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
