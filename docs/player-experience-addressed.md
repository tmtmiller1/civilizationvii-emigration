# Emigration — Player Experience Items Addressed

The ledger of items from [player-experience-risks.md](player-experience-risks.md) that have been addressed
to a satisfactory degree. Each entry says what the issue was, what was done, when, and whether the change
was watched in game or only unit-tested. Open items stay in the risks file; an item moves here when the
user judges it closed.

## Source-side departure gold (from issue 2.1, plans 8.1a and 8.1c)

- **Issue.** A departure charged the losing civilization gold per point, on top of the tile loss and the
  base game's unhappiness penalties, which compounded into a spiral for a struggling city.
- **Done, 2026-09-14.** The charge was removed outright: the function, its per-turn cap, the treasury
  read, both config keys, both option rows, and their text in eleven locales. A departure now costs the
  losing civilization the tile and nothing else. The receiving civilization's assimilation cost, the
  original and intended charge, is unchanged. The Guide row, self-test line, stress harness, README,
  and changelog say so.
- **Verification.** Unit tests rewritten to assert no gold moves; the full verify gate passes. Not a
  visible change, so no in-game probe.

## Banner pressure bar (the warning surface of plan 7.2)

- **Issue.** A player had no warning that a settlement was about to lose a point, short of a throttled
  toast and opening the readout.
- **Done, 2026-09-14.** `ui/emigration-banner-pressure.js` decorates the base `city-banner` control with a
  two-pixel bar under the name row on the player's own city banners. Three states, one color each:
  amber for progress toward losing one point, shown from 5% of the move bar up (or always, as an empty
  track, by option); red for a crisis (a refugee cause under distress, people fleeing every turn); deeper red for a
  heavy crisis (two or more points lost last pass, or distress at `attritionMinDistress`). The bar never
  names the cause. Other civilizations' banners show nothing. Option `bannerPressureBar`: off, while pressure builds
  (default), or always.
- **Verification.** Mod test 35 (`devtools/engine-probe/README.md`): all 89 banners decorated, the 90%
  and 72% bars painted, the 30% bar stayed hidden, and the bar was watched legible and unobtrusive at two
  zoom levels. The three-color scheme and the refugee-cause crisis rule were applied after that run and
  are unit-tested (`tests/banner-pressure.mjs`) but not re-watched.
- **Still open.** The pre-departure hold, the notice record, and the remedy notification (plan 7.2)
  are not built; the bar reads the existing pressure signal.

## Damage instead of delete (plan 8.2a, and the tile variant in 8.13): probed and closed

- **Question.** Could a crisis pillage a building or tile rather than destroy it, so a repair restores
  it?
- **Answer, 2026-09-14 (mod tests 36 to 38).** No, from script. Every operation enum was enumerated live
  in the engine; only create and destroy touch elements. The constructible instance's `setProperty` does
  not reach the engine's `damaged` flag. Unit pillage answers false on the owner's own plots, even with
  a unit created directly on the tile. The tuner's `Progress` argument leaves an incomplete instance the
  city never continues (queuing the type places a second copy). Obsolete-age buildings cannot be queued
  at all.
- **Consequence.** Building loss stays a destroy. The mitigations are the gold refund (8.2b), the
  explanatory notification (8.2c), and shipping the urban leg off by default (8.2d). Recorded in
  `docs/wont-implement-with-justifications.md` and the probe ledger.

## Enclave rarity: per-age pacing (issue 3.1, replaces plan 8.5b)

- **Issue.** At default bars the world formed about one enclave per thirteen turns, nearly all in AI
  cities; a player could finish an age without one. Pausing integration would have tuned one input blind.
- **Done, 2026-09-14.** `ui/emigration-enclave-pacing.js` paces the outcome per host per age. While a
  host has formed fewer enclaves this age than `quarterTargetPerAge` (1), its share bar, size bar, and
  dwell all read `bar × (1 − relax)` with `relax = quarterPacingMax (0.4) × clamp(ageProgress /
  quarterPacingBy (0.6), 0, 1)`, from the engine's own age progression points. The counter meets the
  target on the first formation and the bars return to full. `quarterCapPerAge` (3) now counts every
  enclave a host forms, automatic or by decision, and closes the age. The counters persist in the
  quarter state and reset on the age change. Three options, on by default.
- **Verification.** `tests/enclave-pacing.mjs` covers the curve, the bars, the counters and their age
  reset, the live readers against a stubbed progression manager, and the relaxed stage and dwell. The
  in-game probe is mod test 39 (see the ledger entry for what was watched).

## Enclave progress in the readout and the dashboard (issue 3.1, plan 8.5c)

- **Done, 2026-09-14.** The city readout shows the leading foreign community against the live share and
  size bars and, once a candidacy runs, its settling clock (`enclave` on the city snapshot, from
  `enclaveProgressForCity` and `dwellProgress`). The dashboard's Diversity table has an Enclave column:
  a standing enclave's origin, else the leading community's share against the bar from the foothold
  stage up. Both read the pacing-relaxed bars, so they agree with what will form.
- **Revised 2026-09-14.** Reported not visible in play: every game that morning was on turn 1 or 2, so no
  city had pressure, and the two-thirds threshold hid the bar for all but the last stretch before each
  departure. The bar now shows from 5% of the move bar, with an always-on track as an option; the first
  paint in a new game no longer waits a turn; the fill's corners no longer use a value the UI engine
  rejects. Unit-tested, not yet watched in game.

## Abandoned tiles could never be improved again (user report, 2026-09-14)

- **Issue.** "When we remove a tile due to migration it can never be repaired or re-placed; noticed in
  towns." Reported as making the game unplayable.
- **Cause, watched.** Mod test 40 on the player's own save: destroying the improvement left an empty rural
  district, which the placement list never offers. Ten such dead plots in that game, one in the player's
  town and nine in AI cities.
- **Done, 2026-09-14.** `ui/emigration-plot-cleanup.js` removes the empty rural district two seconds after
  every departure, death, and enclave-tile removal, and sweeps every settlement's land once a loaded game
  starts and at the start of each local turn, which heals damaged saves as they load. Only a rural district with nothing on it is ever touched.
- **Verification.** The removal and the re-placement on the same plot were watched in mod test 40;
  `tests/plot-cleanup.mjs` covers the detection, the deferred re-check, and the sweep.

## Decision pop-ups looked unfinished (user report, 2026-09-14)

- **Issue.** The arrivals pop-up was mistaken for the enclave one, and all three had uneven spacing, staggered
  buttons, and movement as they opened. The enclave quote ran into the body text.
- **Done, 2026-09-14.** Each body opens with its own icon and bold category line (Newcomers, Refugees, Cultural
  Enclave). Buttons use the dialog's vertical layout: one width, one left edge, even spacing. Paragraphs are
  separated by a visible blank line. The enclave quote is drawn by a `screen-dialog-box` decorator as the base
  game draws its own quotes: the filigree divider, then an inner frame with the pop-up's middle decor, the quote
  wrapped to the body's width and slanted, and the attribution upright beneath.
- **Why slanted, not italic.** The game's UI engine has no italic face. `font-style: italic` collapsed the quote
  to nothing (mod test 53); a skew draws the same slant.
- **Verification.** Watched in mod tests 48 to 54 (`devtools/engine-probe/README.md`): button widths and pitch,
  the category lines, the paragraph spacing, and the framed slanted quote at the normal dialog width.
  `tests/dilemma-view-quote.mjs` covers the quote split and the wrapping.
