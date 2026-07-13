# Changelog

All notable changes to the **Emigration** mod for Civilization VII. Loosely
follows [Keep a Changelog](https://keepachangelog.com/) and Semantic Versioning.
The Steam Workshop change note for each release is generated from the matching
section below by `release.sh`.

## [2.0.8] - 2026-07-13

### Changed
- **Policy (Tradition) cards are more compact and no longer take up excess vertical space.**
  The Open/Closed Borders and attraction cards spelled out full per-age value tables
  (e.g. "+1, +2, then +3 across the ages") and flat yield numbers that the game already
  prints on the card from the Tradition's own modifiers. That duplicated text made the
  cards noticeably taller than base-game policy cards. Each description now keeps only the
  numbers unique to the text — the immigration percentage and the per-immigrant scaling
  bonus — and lets the card's native modifier lines show the rest. Applied across all 12
  supported languages.

## [2.0.7] - 2026-07-10

### Fixed
- **The refugee and Cultural-Enclave decision pop-ups are now clickable in an actual game.**
  Two problems compounded: the decisions were drawn in a custom panel whose buttons could come up dead,
  and — the reason the in-game pop-up failed even when a self-test showed it working — the decision was
  raised *synchronously from inside the turn-start engine event*, which Civ VII will not surface a working,
  input-receiving modal from. The decision now (1) renders through the engine's own native decision dialog
  (the same multi-option pop-up the base game uses for its own choices — a framed box with the prompt and
  one button per choice), and (2) is presented on a deferred tick so it appears cleanly after the turn
  event settles. The buttons, Escape, and the ✕ all respond, and the prompt is wrapped to a tidy width.
  The obsolete custom-panel markup was removed.

### Added
- **The refugee dilemma now lists each choice's effect.** Under the prompt, each option shows its
  concrete trade-off — gold/happiness/influence cost and the population it settles — read from your live
  settings, so the outcome is clear before you choose instead of only hinted at in prose.
- **"Confirm Changes" button in the Advanced options window.** A labelled way back to the main Options
  window, matching the base Options screen, so you no longer have to hunt for the corner ✕. (Settings
  still apply live as you edit; the button simply closes.)
- **"Arm real dilemma" self-test.** A new Advanced-options self-test action registers a one-shot on the
  real turn event and fires the decision pop-up from inside it on your next turn — with its real applied
  effects — so the exact in-game path can be confirmed in a single turn instead of waiting for the rare
  natural trigger.

## [2.0.6] - 2026-07-10

### Fixed
- **Migration no longer stalls after an age change.** The per-turn migration pass and the
  war/disaster/assimilation/combat decay clocks were keyed on the age-local game turn, which
  resets at each age boundary — so the simulation went dormant and distress stopped decaying
  for a large stretch of every post-Antiquity age. The clocks now rebase across the reset.
- **A besieged, ruined city is no longer treated as an attractive destination.** A scoring
  sign-flip could rank a devastated city as a magnet and route refugees into a war zone.
- **Returnees are no longer lost.** A returning migrant drawn from the holding pool that the
  homeland couldn't receive was dropped instead of restored; it is now re-queued. A related
  host-population miscount for pool-sourced returns is fixed.
- **Localization + robustness:** the Prosperity/Ethnicity lens tooltips and an empty-column
  label are now translatable (they showed English regardless of language); migrant-borne
  plague distress respects its cap; a network hover no longer mislabels an unknown origin;
  and corrupted violence-save numbers are sanitized on load.

## [2.0.5] - 2026-07-10

Everything since the last Workshop release (2.0.4), shipped together: migration-network
display and population-percentage fixes, cultural-enclave reachability, clickable decision
modals, an on-screen self-test harness, notification-delivery fixes with full volume control,
the consolidated one-diagram Network tab, and a rebuilt playback timeline.

### Added
- **On-screen self-test harness (no dev console needed).** A new `On-screen self-test panel`
  option adds a second button to the subsystem dock (beside the Migration button) that opens a
  real base-UI screen (mouse-guard-backed, so its buttons work) with a 10-row diagnostic
  battery — settlement coverage, cultural enclaves, the two population measures, migration
  activity, refugee pool, chronicle, notifications, persistence, Demographics detection, and
  the force option — plus actions to **run a migration pass**, **force the enclave decision**,
  **force a refugee dilemma**, **fire test/all notifications**, **open the dashboard**, and
  **copy a screenshot-friendly bug-report snapshot** (version + every check + key settings).
  Off by default; takes effect after reloading the save.
- **Every settlement now draws on the migration network, and carries its population.**
  A pop-poor settlement that earns zero dots at the current scale kept a radius of 0
  and was skipped by the canvas (and its label), so only the largest few civ cities
  showed. City sub-cluster radius is now floored (`MIN_CITY_SUB_R`) and a dotless
  settlement's `bornFrame` is set finite, so all settlements render regardless of dot
  count. Additionally, any settlement that HAS population now gets at least one dot, so
  a freshly-founded (or otherwise sub-`unit`) settlement shows its initial population
  instead of an empty disc.
- **Cultural-enclave progress in the City Details panel.** When no enclave is
  settled, the panel shows the lead foreign origin's share vs the forming
  threshold — "awaits your decision" once it qualifies, or how far it must still
  climb — read from the same base the mechanic uses, so it always matches.
- **Enclave tunables + a Force option.** `Enclaves: minimum population` (the
  previously-hidden hard stock floor), `Enclaves: stickiness` (how strongly a
  foothold community resists integrating away so it can reach the bar), and
  `Enclaves: force the next decision` (a testing aid).
- **Immigration notifications.** Inbound counterpart to the existing loss/crisis
  notifications: when a notable inbound wave settles in a local city, log an entry
  and toast the largest, themed by cause and naming the (unmet-masked) origin civ.

### Fixed
- **Decision modals were unclickable (refugee dilemma + Cultural-Enclave decision).** The shared
  modal was a HUD DOM overlay relying on `ViewManager.isWorldInputAllowed`; on this build that does
  NOT free its buttons for input (only a ContextManager mouse guard does), so the choices could not
  be clicked. The modal is now a real base-UI screen pushed with `createMouseGuard: true`, so its
  buttons receive clicks; the hand-drawn ✕ is replaced with the engine's native close button, and the
  panel is centred absolutely. Escape / ✕ / clicking outside still resolve as the dismiss option.
- **Flow-pie percentages shifted with the Scaled/Civ Pop toggle.** Percentages are now always the raw
  pop-points share (the base the enclave threshold uses); the toggle changes only the displayed count.
- **Human enclaves effectively never fired in normal play.** Integration drift kept pulling a foreign
  minority back below the enclave bar before it could establish. Enclave stickiness (default on) lets a
  real diaspora climb from foothold to established; default share lowered 0.35 → 0.30 and min stock 5 → 3.
  (The "AI is getting them" some players saw was the all-civ chronicle *milestone* line, not an AI
  decision — no AI civ gets the enclave decision; only the local human does.)
- **Toast rendered below the HUD.** `z-index:99` sat under the game's tooltips/dropdowns (`10000`);
  raised to `10001`, with explicit font-size fallbacks for the HUD document.
- **First `notifyCooldownTurns` turns suppressed all important notifications.** The cooldown seeded its
  last-toast turn to 0 and treated it as a real toast; "never toasted" now always permits the first.
- **Decision pop-up choice note didn't wrap.** Added `white-space:normal` + `min-width:0` (GameFace
  doesn't wrap `<button>` text by default).
- **Dashboard could show a stale "Unmet" origin for one frame.** The per-turn memo now keys on the met
  *set* rather than the met-major *count*.

### Changed
- **Network tab consolidated into one diagram.** The separate "Flows" sub-view (and the Dots/Flows
  switcher) is gone. The Dots view's old "Origins" toggle is now **"Migrant flows"**, and instead of
  simple origin lines it overlays the green/red arrow system (red where people leave, green where they
  arrive; thicker = more migrants) directly on the dots — one diagram with both capabilities. The
  arrows honour the active isolate / focus / scope filters, and the "How to read this" note was updated
  to match. Arrow amount-tooltips and the click-to-expand/drag interactions from the old Flows view are
  dropped (the dots keep their own tooltips).
- **Timeline/playback controls rebuilt.** The play/pause button is now CSS-drawn (a triangle vs two
  bars) instead of a glyph — the pause glyph rendered as invisible tofu in-game, which looked like the
  button vanishing. Added a visible track with a gold progress fill and a bright playhead line + knob,
  a denser year scale (~12 labelled ticks + fine minor ticks), and hid a stray "0" the native slider drew.
- **Units toggle now explains itself.** Hover tips on Scaled Pop / Civ Pop spell out why the two
  differ and why Civ Pop looks steady while Scaled Pop drifts with the age.
- **Notification volume is fully controllable.** The anti-spam filtering is tunable via the
  `Notifications` mode (Off / Important / Verbose) and `minimum gap` cooldown (0 = every event); a new
  `Notifications: world refugee news` toggle exposes the previously-hardcoded other-civ crisis alerts.
- Enclave flavour quote `0.85rem` → `0.8rem`.

## [2.0.4] - 2026-07-08

This release fixes mod options — presets, display toggles, and every Advanced
tunable — silently reverting to their defaults when you reopened the Options
screen mid-game.

### Fixed
- **Options (including the Advanced editor) no longer reset to their defaults
  when you reopen the screen.** Changes made in-game — a preset, a display
  toggle, or any of the Advanced tunables — could revert to default the next time
  the Options screen was opened. The settings were persisted only in the shared
  `modSettings` localStorage, which Coherent's in-game UI can wipe between UIScript
  isolates: the reopened screen re-read an empty store and every value fell back to
  its default. Options are now **dual-backed** — mirrored, in-game, into the same
  durable, save-persistent `GameConfiguration` store the rest of the mod already
  uses for its state, and read back from there first — so a mid-game change sticks
  across the screen being reopened and across a save/reload. The shared
  localStorage remains the main-menu / cross-game fallback, and an in-game save now
  lands durably even when another mod has left the shared blob unparseable (which
  previously made the mod silently refuse to save). The in-game store is per-save;
  the mod's cache-reset convention was extended to the settings caches so a
  different save loaded in a live isolate can't read a prior game's values.

## [2.0.3] - 2026-07-07

This release fixes migration notifications mislabeling where people went. The
technical details are in the commit history; the player-facing summary is below.

### Fixed
- **Migration notifications and toasts mislabeled moves as "Internal" vs
  "External" (and named the wrong destination).** A move to another civilization
  could show up tagged as an internal move within your own empire, and a mix of
  people leaving one city for both your own settlements and a foreign power could
  be lumped into a single row with the wrong label. Notifications now classify
  each move correctly and split a mixed departure into a properly labeled internal
  row and external row. Only the notifications and pop-ups were affected — the
  Demographics graphs, migration totals, and flow map were always correct.

## [2.0.2] - 2026-07-06

Primarily an internal code-quality and repository-hygiene release — it removes the
last special-case carve-outs from the quality gate so the entire shipped `ui/`
tree is held to one uniform standard, moves the dev-only diagnostic out of the
shipped-source tree, and hardens a test to exercise real code instead of stubs.
It also carried one gameplay fix (the disaster strike-floor, below).

> **Changelog correction (2026-07-07):** the disaster strike-floor shipped in the
> v2.0.2 Workshop build but its source and this entry were only committed later,
> during the 2.0.3 prep. Documented here, under the version players actually
> received it in, rather than back-dated silently.

### Fixed
- **Disasters that struck a city but couldn't be measured did nothing.** When the
  engine confirmed a disaster hit a settlement but the mod had no way to gauge its
  size (the effect tables were absent, or a lava-scorched tile that never counts
  as "pillage"), the distress spike collapsed to zero and the disaster silently
  had no effect. A confirmed strike now floors its impact factor to
  `disasterStrikeFloor` (0.15) so it always lands *some* distress. The floor
  scales by disaster class, so a floored volcano clears the flee threshold (a
  struck city sheds refugees as it should) while a floored thunderstorm stays
  ambient. Set `disasterStrikeFloor: 0` to restore the legacy behavior.

### Internal
- **The dev-only API probe moved out of the shipped-source tree** from
  `ui/migration-probe.js` to a dedicated `devtools/migration-probe.js`. It was
  always excluded from the release zip, but living under `ui/` meant every tool
  that scans `ui/` had to special-case it. With the probe in its own `devtools/`
  directory, those carve-outs are simply deleted: the ESLint `ignores` entry, the
  `scripts/hotspot-score.mjs` skip line, and the ad-hoc path checks all go away;
  `tsconfig.json`, `scripts/inventory.mjs`, its own `migration-probe.modinfo`, and
  the docs now reference the new path; and `release.sh` excludes the whole
  dev-only `devtools/` directory (like `tests/` and `scripts/`) so not even an
  empty folder leaks into the shipped zip. The probe file itself is unchanged (a
  pure move).
- **Removed the last per-file exemption from the ESLint modularization gate.**
  `ui/emigration-config.js` (the tunable-settings catalog) was exempted from the
  `max-lines` / `max-lines-per-function` length rules on the grounds that it is
  "data, not logic". That exemption is gone — the whole `ui/` tree now passes the
  same complexity and length gate with **no** per-file carve-outs, so nothing
  quietly grows outside the limits.
- **Hardened the violence-signals branch test to drive the real modules.**
  `tests/violence-signals-branches.mjs` previously fabricated `globalThis.CONFIG`
  and hand-rolled globals; it now imports the actual `emigration-config.js` and
  `emigration-violence-signals.js` and exercises them through realistic
  district-health / besieged / pillage mocks, resetting globals between cases. The
  branch coverage now reflects production code paths rather than stubs.

## [2.0.1] - 2026-07-06

Localization plus a persistence-and-tuning pass for the Cultural Enclaves feature
(2.0.0). Every enclave string is now translated in all eleven non-English languages,
and enclaves gained a persistence requirement plus exposed frequency knobs, so the
one-time decision fires only for a diaspora that has genuinely settled in — not a
transient spike. Existing saves are unaffected.

### Added
- **Cultural Enclaves now require a diaspora to persist before they offer their
  decision.** An established enclave must hold the bar for a configurable number of
  turns (default 8) before its one-time choice is presented, so a transient
  spike — a war-refugee wave that later integrates or goes home — no longer
  triggers a permanent enclave. The dwell clock is sticky: a brief dip below the
  bar (within a small grace window) doesn't reset it, but a genuine collapse does,
  and a different origin overtaking the tile restarts it from scratch.
- **Four enclave-frequency knobs are now exposed in Options → Advanced
  (Integration & migrant costs).** "Enclaves: share to form" (how much of a city one
  foreign origin must make up, default 35%), "Enclaves: persistence before offer"
  (the new dwell requirement, 0 = legacy "offer as soon as it forms"), "Enclaves:
  turns between decisions" (the cooldown), and "Enclaves: decisions per age" (the
  per-age cap). Raising the share or the persistence, or lowering the per-age cap,
  makes enclave decisions rarer. Existing saves are unaffected; the new pending
  dwell clocks are tracked per host tile in the enclave state and default to empty.
- **Cultural Enclaves are now fully translated in all eleven non-English
  locales** (German, Spanish, French, Italian, Japanese, Korean, Polish,
  Portuguese, Russian, Simplified Chinese, Traditional Chinese). The full 2.0.0
  string set — the enclave decision prose, each civilization's two option labels
  and "why" lines, the passive "let them be" stance, the enclave dashboard/guide
  and FAQ, and the Civilopedia enclave page — is localized, using each language's
  standard Civilization yield names (Culture/Gold/Production/Science/Faith/Food/
  Happiness and their equivalents). Every `{name}`-style placeholder and line
  break was preserved and verified against the English source.

### Changed
- **The attributed historical quotes stay in their native-language original
  followed by an English gloss in every locale, by design** — they are epigraphs,
  not UI copy, and are not re-translated per language. The surrounding text that
  describes them now correctly says the quote appears beside its **English**
  translation in every language (a few locales had localized that phrase to their
  own language, which would have misdescribed what the player actually sees).

## [2.0.0] - 2026-07-05

The Cultural Enclaves release. When a foreign community grows into a lasting part
of one of your cities, it now forms a named **Cultural Enclave** (renamed from
Cultural Quarter) with a one-time, identity-grounded choice — and each enclave
reads as a page of history, carrying a real, primary-source-verified quote in the
origin people's own language beside its English translation. This is also the
release where the feature's decision actually bites: the yield effect persists
turn to turn, enclaves form only where a diaspora genuinely lives right now, and a
full sensitivity pass reworked the flavour throughout. Existing saves are
unaffected — only the player-facing name and the strings changed.

### Added
- **Cultural Enclaves show a real, attributed historical quote — in the origin
  people's own language, with an English translation.** When you're offered the
  enclave decision, a short epigraph now sits between the prose and the choices,
  e.g. "倉廩實而知禮節 (When the granaries are full, the people know propriety.)" —
  Guanzi. Every translated quote carries its **native-language original followed
  by an English gloss** (Greek, Latin, Classical Chinese, Japanese, Russian,
  German, French, Spanish, Persian, Arabic, Thai, Old Norse, Old English, Prakrit,
  K'iche', Ge'ez, and more). Each original was **verified against a primary
  source** (Perseus, ctext, Oracc/RINAP, ganjoor, and the like) rather than
  reconstructed. Right-to-left originals (Arabic, Persian) are bidi-isolated so
  they render correctly beside the English attribution.

### Changed
- **"Cultural Quarters" are now "Cultural Enclaves"** in all player-facing
  in-game text (the other locales follow in 2.0.1). The internal systems, save
  data, and code identifiers are unchanged, so existing saves are unaffected.
- **One quote per enclave, not one per option.** The decision modal now shows a
  single quote for the enclave as a whole, instead of a separate quote under each
  of the two choices. Which one appears is set by ordinal: an origin's **first**
  enclave shows quote A, its **second** shows quote B.
- **A single civilization can hold at most two enclaves in your empire — per
  civilization, not overall.** You can still have two Roman, two Norman, and two Han
  enclaves at once; reaching the cap for one origin never blocks another.
  Once an origin has two, no third same-origin enclave is offered. Identity is by
  civilization (captured and persisted when the enclave forms), so the cap stays
  correct even if the origin player later changes civilization across an age, and
  two players sharing a civilization count together.
- **Enclave and quote text passed a full sensitivity review.** Removed
  trope-adjacent flavour (e.g. a Semitic "greed" slur, a "barbarian" atrocity
  quote, "great-replacement"-style cultural-erosion phrasing, and a
  fifth-column/loyalty framing on the wartime "contested" line), and replaced a
  misattributed hadith and a handful of misattributed or unsourceable quotes with
  correctly sourced, own-voice alternatives.

### Fixed
- **Cultural Enclaves now gate on the diaspora's CURRENT size, not lifetime
  arrivals.** A quarter's second gate (beyond the share threshold) required
  250,000 cumulative arrivals from an origin into a city — a lifetime inflow total
  that only ever grew and was never reduced by integration, return-home, or
  attrition. So a city that had merely **processed** many migrants over the ages
  could clear it even after that diaspora had largely gone. The gate is now a true
  first-over-the-line on **current standing stock**: the lead foreign origin must
  be at least 5 population points **right now** (read from the netted composition
  ledger) as well as ≥25% (foothold) / ≥35% (established) of the city. If the
  diaspora later integrates or leaves, the city drops back below the line. The
  foothold Chronicle line now reads a standing community size rather than
  "arrivals over time".

## [1.9.1] - 2026-07-04

### Fixed
- **No more duplicate migration rows in Demographics' All Civilizations view.**
  Each migration figure (Emigration, Immigration, Net Migration, Refugees In/Out,
  Population) is registered twice — a scaled-"people" series and a raw Civ-numbers
  twin — for the graph's Scaled/Civ toggle. In Demographics' new metrics-as-rows
  comparison both twins showed up as separate, identically-labelled rows (two
  "Emigration", two "Immigration", …). The Civ-numbers twins are now hidden from
  that comparison, so each flow shows once; Demographics' own Scaled/Civ toggle
  swaps the whole table between the two unit systems. The migration graphs are
  unchanged.

## [1.9.0] - 2026-07-04

A localization release. Numbers now read in the player's own language, and the
last hardcoded interface strings — the cause labels and hints, and the Migration
Chronicle's own chrome — move behind translation tags so they localize with the
rest of the UI.

### Fixed
- **Numbers now format for the player's language.** Grouped figures (people and
  population-point counts, the refugee-support burden) previously always used
  English separators (`12,400`) regardless of language. They now route through
  the game's own `Locale.toNumber` — the same API the base game uses for scores
  and yields — so a German player sees `12.400`, a French player `12 400`, and
  the burden's decimal reads `3,4` rather than `3.4`. This replaces the earlier
  `Intl.NumberFormat` path, whose no-locale default never actually tracked the
  chosen Civ language in the game's UI runtime. Off-engine (and if the API is
  ever unavailable) every formatter falls back to the previous grouping, so
  nothing regresses.

### Added
- **Cause labels and hints now localize.** The migration-cause names shown in the
  city readout, flow bars, and attribution ("War", "Attraction", "Conquest", …)
  and their one-line "what can I do" hints were still emitted as raw English.
  They now resolve through `LOC_EMIG_CAUSE_LABEL_*` / `LOC_EMIG_HINT_*` tags
  (the two hints that lacked a tag — Conquest and Return — gained one), so they
  translate with the rest of the interface. The English text is kept in code as
  the off-engine fallback, so behaviour is unchanged where the engine Locale API
  is absent.
- **The Migration Chronicle's own labels now localize.** The view's chrome — the
  kind labels (*Exodus / Diaspora / Return*), the "Turn N" stamp, the untitled-
  entry fallback, and the empty-state prose — was hardcoded English drawn around
  each entry's own (already-localized) title and body. It now composes through
  translation tags too. Entry titles and bodies are unchanged and still stored as
  written, so existing saves' Chronicles are unaffected.
- **Restored three drifted translations.** The internal/external move labels and
  the "Bound for …" destination clause had been hand-translated in every language
  file but were missing from the translation source, so they would have silently
  reverted to English on the next regeneration. They are now back in the source
  in all eleven languages.

## [1.8.1] - 2026-07-04

This is a bug-fix release for the Cultural Quarters feature: the choice pop-up is
clickable again, and the stance you pick now actually changes the city's yields.

### Fixed
- **Cultural Quarter pop-up could not be clicked.** The choice modal is a DOM overlay, but Civ VII
  still routes clicks, selection, and camera to the map behind it unless a screen explicitly takes
  world input. The modal now turns off world input while it is open (the same lever the game's own
  screens use) and restores it exactly as it found it on close, so the three options are selectable
  with the mouse again instead of only being dismissable with Escape. Applies to the refugee dilemma
  modal too, since both share the same surface.
- **Cultural Quarter stance had no effect on yields.** The chosen stance's benefit/drawback was applied
  as a one-time `grantYield`, which the engine's per-turn recompute wiped for Happiness and which never
  showed for the other yields — so nothing changed. The stance's yields are now applied **every turn**
  from the tile's current quarter record (matching the city panel, which already read "each turn", and
  the design's small ±1–2 intent). Default amounts were re-scaled from the old one-time 40/20 lump to a
  small per-turn +2 benefit / −1 drawback. Because yields now follow whichever origin holds the tile,
  a change-of-hands self-corrects with no separate reversal. "Grants … each turn" wording updated in
  all 12 locales.

## [1.8.0] - 2026-07-02

This release makes migration explain itself: every move and death now says why it
happened, cities warn you before people start leaving, and refugees from war and
disaster wait in holding pools instead of instantly becoming workers. The Ethnic
Composition map lens was also redrawn to read clearly — host colour, a grey "mixed"
midpoint, and the incomer's colour, with each city framed in its main civ's colour.
Population counts also read as plain numbers now.

### Added
- **Refugee holding pools.** War and disaster refugees can now arrive at a host city and wait in a
  holding pool before joining its working population, instead of every intake spike becoming instant
  labor growth. Only a bounded share settles per turn (scaled by the host's happiness, borders, and
  crowding), a small fraction settles right away, and the rest stay as visible, temporary displacement
  pressure. While people are held, the host civ pays a small per-turn support cost in gold and
  happiness, separate from assimilation. Held refugees show up on the migration map lens (a marker over
  hosting settlements) and in the per-city readout. Tunable via the `refugeePool*` settings.
- **Migration explanations.** Each move now records *why* those people chose that destination (nearby,
  more prosperous, open borders, an ally, offered asylum, escaping the crisis, safer interior, away
  from the fighting, avoiding the aggressor) and shows it in the notification ("Drawn there: ...") and
  the city readout ("Why there: ..."). Attrition deaths explain their cause too (under siege, disaster,
  famine, no safe refuge, or lost while fleeing) on the death notice and the readout warning. English
  plus all 11 translations.
- **Rising-pressure cue.** When one of your settlements is steadily building toward a move but no one
  has left yet, a low-key Notifications entry flags it ("Rising emigration pressure: citizens in X are
  increasingly drawn to Y"), throttled per settlement so it never floods the log.
- **City readout trend sparkline.** The per-city readout can show a small bar strip of recent net
  migration (green bars for gaining, red for losing), so you can tell at a glance whether a settlement
  is filling or emptying. Toggle it in the tunables.
- **Cultural quarters.** When a foreign diaspora grows into an established community in one of your
  cities, you're offered a one-time choice of how to treat it (embrace, tax, or let be), each with a
  small one-time yield reward and drawback. It's a durable, per-city-tile district: only one quarter
  per city, and if a different origin later overtakes that city the old stance's yields are reversed
  and the quarter changes hands (noted in the Migration Chronicle). While you're at war with a
  quarter's homeland it turns "contested" and adds a small, capped happiness strain until the war ends.
  The prompt is rare (a per-age cap plus a cooldown) and never collides with a refugee dilemma. Turn
  the whole system off with `quartersEnabled`.
- **Emigration data in the City Details panel.** The base game's City Details panel now shows the mod's
  per-settlement migration data, read live when the panel opens and on each city switch, so it's
  legible without opening the standalone dashboard. The Citizen Growth tab gains a population block
  (origin mix, where recent emigrants departed to, where arrivals came from, and any refugees still
  held awaiting settlement); the Building Breakdown tab gains a Cultural Quarter block (its origin, your
  stance, its one-time yields, and whether it's contested). Injected via a non-invasive panel decorator,
  so it coexists with other City Details mods. English plus all 11 translations.

### Changed
- **Ethnic Composition lens redraw.** The lens is far easier to read at a glance. Each tile's FILL is
  now a diverging colour scale on how mixed that tile is: a settlement's own people show the host civ's
  banner colour, a genuinely mixed tile reads neutral GREY (instead of a muddy host-tinted blend), and a
  tile taken over by an incoming diaspora reads that origin's colour. Every tile is also BORDERED in the
  settlement's main-origin colour, so you always see whose city it is regardless of the fill. A diaspora
  now concentrates into a believable neighbourhood cluster that fades to the host over a few tiles
  (rather than being smeared invisibly thin), each origin's people still total its real citywide share,
  and tile opacity is normalized per settlement — the built-up core reads vivid, the rural fringe faint,
  with a subtle per-tile texture — so a city reads as a population mosaic at any size. The hover panel
  lists the settlement's exact origin percentages.
- **The whole in-game UI is now localized.** Previously only the Options screen and a few labels were
  translated; the dashboard tables and tabs, the per-city readout, the refugee-dilemma and
  cultural-quarter modals, the notifications log, and the procedural Migration Chronicle prose all read
  hardcoded English. They now route through the mod's localization pipeline: 182 new strings across
  those surfaces, translated into all 11 languages (English is the fallback for anything unresolved).
  The generated Chronicle lines stay deterministic and read identically in English.
- **Population counts read as plain numbers.** "12 thousand" now shows as "12,000", "1.3 million" as
  "1,300,000", and so on, everywhere counts appear (city readout, notifications, network tooltips, and
  the README examples). The rounding is unchanged; only the wording became digits.

### Fixed
- **The Network tab remembers Dots vs Flow.** On the Flows view, using the Scaled Pop / Civ Pop toggle
  no longer bounces you back to the Dots diagram; the sub-view choice is remembered (even across a panel
  rebuild) and the counts change in place. Also fixes the controls row duplicating on repeated toggles.
- **The network diagram no longer collides with the filter row.** The top row of civilization circles
  and their name labels now sits clear of the Dots/Flows filters instead of riding up underneath them.

### Maintainability
- **Balance telemetry counters.** Session counters for the migration system's health: voluntary vs
  crisis moves (crisis and overall split own-civ vs cross-civ), return moves, outlet attrition deaths
  (trapped vs lost-while-fleeing), transit deaths (razed vs perished-at-cap), arrivals into a city that
  turned unsafe mid-journey, refugee-pool inflow/outflow, a pass denominator, and a histogram of which
  destination factors actually drive moves. Summarized to the debug log, dumpable on demand via the
  `emigration.metrics()` console command, so the pacing knobs can be tuned from real numbers.
- **Docs + tests.** Added a migration scenario/system diagram reference, a migration enhancement plan,
  and a cultural-quarters design note (developer docs); a shared reason-tag module; and new test
  harnesses for the sparkline, the Dots/Flow sub-view, the reason tags, the pressure cue, the telemetry
  counters, and the cultural-quarter decision, state, and registry.

## [1.7.1] - 2026-07-01

Crisis deaths now ease in over a few turns instead of striking all at once, with
matching guide and Civilopedia updates and wider engine test coverage.

### Changed
- **Crisis deaths ramp up instead of hitting all at once.**
  A city under lethal distress (war/disaster/siege/famine) no longer takes its full casualty rate the
  instant the crisis turns lethal. Attrition death-pressure builds gently at first and deepens over a
  few turns of *sustained* crisis (`deathRamp`: from `deathRampFloor` on turn 1 to full after
  `deathRampTurns`), and relaxes again if the crisis eases, so a sudden catastrophe is no longer
  immediately devastating and a brief scare is recoverable. It is **not** capped: a prolonged
  catastrophe still takes its full toll over time (rural population only, never the settlement itself).
  The death-channel state now persists across save/reload.
- **Guide and Civilopedia match the mechanic.** The in-game guide and Civilopedia (English plus all 11
  translations) now describe crisis deaths accurately: they build over a sustained crisis and are
  uncapped. Earlier text wrongly implied deaths stop at the rural floor.
- **Maintainability: mutation-tested the migration engine.** Raised `emigration-engine.js` mutation
  score from 41% to 88% (474 of 539 mutants killed). Added two harnesses, `tests/engine-rigor.mjs` and
  `tests/engine-rigor-fixtures.mjs` (~110 exact-boundary, arithmetic, and branch assertions, plus
  seeded war/combat/siege fixtures), a `__test` surface exposing the engine's internal decision and
  sizing helpers, and a fast engine-only mutation loop (`npm run mutation:engine` via
  `stryker.engine.config.json`). Every kill is a real assertion; no mutants were suppressed to inflate
  the score, and the surviving ones are genuine equivalent mutants. Also tightened the harness itself so
  a fixture that fails to set up now fails loudly instead of passing silently.

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
- **Maintainability:** removed redundant module exports, consolidated the developer docs, and
  hardened the test gate so no test file can be added without being wired into the suite.

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
