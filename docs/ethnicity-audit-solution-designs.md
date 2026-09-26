# Ethnicity audit: solution designs

Date: 2026-09-18. Scope: the ethnic-composition ledger (`ui/emigration-composition.js`), the Ethnic Composition lens
(`emigration-ethnicity-lens.js`, `-tiles.js`, `-distribution.js`, `-colour.js`) and its hover panel
(`emigration-ethnicity-tooltip.js`).

Each item states what was actually observed, the design, whether it is possible, the cheapest test that could prove the
design wrong, and what counts as done. Per the repo rules, an item is done only when the fix has been watched changing
the behavior in game.

Build status (2026-09-18): items 1, 2, 3, O1, O2, O3 and O4 are done. Each Node disproof test was watched failing
before its change and passing after it, and each in-game criterion was watched in mod tests 148 to 151
(`devtools/engine-probe/eep-modtest148.js` to `151.js`, logs `probe148-*`, `combined149-*`, `real150-*`,
`combined151-*`). O4 is done in part: step 3 took the fallback the plan names. O5 stays parked.

Out of scope by decision: newborns counting as the owner's ethnicity (audit item 4) is correct behavior, read as
assimilation.

| # | Issue | Evidence | Feasible | Size | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Lens inverts a majority enclave | Watched in game (Rostov, 2026-09-18); reproduced in Node | Yes | Small | Done: watched (mod tests 149, 151) |
| 2 | Re-migrants take the source owner's identity | Reproduced in Node | Yes | Medium | Done: watched (mod tests 149, 151) |
| 3 | Gone settlements linger up to 50 turns | Seen in save data (Rouen, Taksasila) | Yes | Small | Done: watched (mod tests 149, 150) |
| O1 | Lens one turn stale, and never repaints while open | Code reading | Yes, one probe | Small | Done: probe 148, watched (mod tests 149, 150) |
| O2 | Wrong comment about mod state not being saved | Save data + mod test 86 log | Yes | Trivial | Done (comment only) |
| O3 | Migrations matched to cities by display name | Code reading | Yes | Small | Done: Node test passes (no in-game watch, by design) |
| O4 | Captured city-states seed as 100% conqueror | Code reading | Partly | Small | Steps 1-2 done, watched (mod test 149); step 3 fallback |
| O5 | Almost no foreign population in normal play (parked) | Save series + mod tests 90-94 | Yes, needs tuning runs | Medium | Parked |

---

## 1. The lens inverts a majority enclave

**Observed.** Rostov on Don (Norman-held, 60% Bulgarian, Bulgar Enclave at 78,52) paints the enclave tile in the
Norman color, "Norman 92%, Bulgarian 8%", while the rest of the city is Bulgarian. Reproduced with a synthetic 4x4
city whose enclave people are 80% of the city: depending on where the enclave sits, its tile holds anywhere from 34% to
95% of the enclave people, and at one position it is the least-enclave tile in the city (34% against 65% everywhere
else).

**Cause.** Two rules in `distributeTiles` / `capacities` do not agree:

- The distribution treats the city's largest origin (`dominantCiv`) as the base fill and water-fills only the other
  origins. A majority enclave people is the base, so it is never seated on its own tile.
- `capacities()` gives the pinned enclave tile the full `MINORITY_CAP` (0.92) for every origin that is not the base.
  Here that is the owner's own people (the Normans), so when their hash anchor lands near the enclave they fill it.

**Design.**

1. Choose the base fill as the largest origin that is **not pinned**, not simply the largest origin. A pinned enclave
   people is always water-filled, seated on its enclave tile first, whatever its citywide share.
2. Make the enclave tile's extra headroom belong to the enclave's own origin only. Every tile keeps the plain cap for
   every other origin. The pinned origin fills first, and on the enclave tile only, another origin may take
   `min(plain × people, MINORITY_CAP × people − already placed)`.
3. Keep conservation when the base is small. With the owner at 5%, the water-filled origins total 95%, above
   `MINORITY_CAP`. The plain cap must stay at least equal to the water-filled total, so the ceiling becomes
   `min(max(MINORITY_CAP, totalWaterFilled + ε), 1)`. The owner then keeps only the sliver its share allows.

The border color (the dominant origin) and the hover numbers need no change. They already read the same tile data.

**Open design question (parked with enclave creation, see O5).** Should an enclave form at all for an origin that
is already the city's majority? Rostov's Bulgarians are not a quarter of a Norman city; they are the city, conquered. Option B is to add an upper bar
to formation (the origin must be under 50%), so a conquered majority shows as the whole city's color instead of an
enclave. The recommendation is the lens fix above either way, because an existing save (EmigShots072) already holds
such an enclave.

**Cheapest disproof.** Turn the Node repro into a failing test: for every enclave position in the synthetic city, and
for enclave shares of 10%, 35%, 60% and 80%, the enclave tile must hold the highest share of the enclave people of any
tile in the city. It fails today (the 34% position). If it still fails after the change, the design is wrong.

**Done when.** The test passes, and the Rostov retake from `EmigShots072.Civ7Save` shows the enclave tile at least as
Bulgarian as every other Rostov tile, watched in game. That also unblocks the Steam lens screenshot retake.

**Built (2026-09-18).** `tests/ethnicity-distribution.mjs` case 8 failed before the change ("a 60% enclave at 1,0 reads
0.81 on its tile, below the city's best 0.92") and passes after it. What differed from the design: the base fill stays
the composition's dominant origin unless that origin is itself pinned, and only then becomes the largest unpinned
origin. The narrower rule keeps every existing case identical. The enclave cap is `max(MINORITY_CAP, plain)`, so a
lifted plain ceiling never overtakes the enclave tile.

**Watched (2026-09-18).** Mod test 148, on the old code, showed the enclave tile in the Norman color inside a Bulgarian
Rostov. Mod tests 149 and 151, on the fix, at turn 72 and again after End Turn: the enclave tile reads Bulgarian 92%,
the highest Bulgarian share of Rostov's 18 tiles, and the hover panel says "Bulgarian 92%, Norman 8%"; the tile is
painted Bulgarian (`shots/combined149-i1-rostov.png`). Status: done. The Steam lens retake is unblocked.

---

## 2. Migrants who move again lose their identity

**Observed.** Rome is one-third Carthaginian, and 3 people leave Rome for Athens. Rome loses 1 Carthaginian and 2
Romans (proportional removal), but Athens gains 3 Romans. Carthaginians vanish from the world count, and every
diaspora that moves on is converted to its host's identity in transit. Only returnees keep their origin
(`originCiv`).

**Cause.** The source side removes proportionally (`removeProportional`) and the destination side adds everything
under one origin (`m.srcOwner`). A lagged move is split across turns: the departure is applied on one pass and the
arrival several turns later from the transit entry, so the two sides never see each other.

**Design.** Carry the removed mix with the migrant.

1. At departure, where the engine builds the move or departure record (`moveRecord` / `departRecord` in
   `emigration-migration-records.js`, called from `emigration-engine.js`), read the source's current composition and
   stamp `originMix: {civ: fraction}` on the record. For a 1-point move out of the city above, that is
   `{Roman: 0.67, Carthaginian: 0.33}`.
2. Stamp the same `originMix` on the transit entry (`emigration-state.js`), so the lagged arrival record
   (`arriveRecord`) can forward it.
3. In the composition ledger, the source side removes exactly `originMix × points` from each bucket, and the
   destination side adds the same amounts. The two halves then conserve per origin, whether they land on one pass or
   several.
4. Precedence: `originCiv` (returnees, a specific people going home) wins over `originMix`, which wins over the
   current `srcOwner` attribution. Old saves' in-flight transit entries have no `originMix` and keep today's
   behavior, so no migration is needed.

Fractional people are fine: the ledger is already floating point and reconciles to the real population every pass. A
deterministic single-origin draw (largest remainder) is the alternative if whole people matter. The recommendation is
fractions, because they conserve exactly and need no seed.

**Audit before building.** Every store that holds a migrant between departure and arrival must carry the mix. From a
`srcOwner` grep, the candidates besides transit are the refugee holding pool and staging
(`emigration-refugee-pool.js`, `emigration-refugee-staging.js`), migrant units (`emigration-migrant-units.js`) and
the dilemma/arrival placement path (`emigration-dilemma.js`, `emigration-arrivals.js`). Each needs checking for
whether it creates or forwards a record.

**Cheapest disproof.** Extend the Node case above into a test asserting per-origin conservation across a move, for
both the instant path and the depart/arrive pair. It fails today (Athens gains 3 Romans). It must also still pass
`tests/composition.mjs` and `composition-reload.mjs` unchanged.

**Built (2026-09-18).** Before the change, the Node case showed Rome at `{Roman 18, Carthaginian 9}` and Athens gaining
3 Romans. `tests/composition-identity.mjs` now passes for the instant move, the depart/arrive pair (the transit entry
round-tripped through `normalizeTransitEntry`), a legacy transit entry, and a returnee. The audit found that only the
engine's move/depart path, the transit entry, `arriveRecord` and the return record reach the ledger. The refugee pool,
staging, migrant units and dilemma code build no ledger records. A migrant re-shed from the refugee pool is stamped
with the pool entry's single origin. Known gap: a mixed migrant who is pooled on arrival is stored in the pool under
the source owner, because the pool holds one origin per refugee. `composition.mjs` and `composition-reload.mjs` pass
unchanged.

**Done when.** The tests pass, and in game one cross-civ move out of a mixed city shows the right split in the
destination's hover panel. Cross-civ moves are rare in normal play (see O5, parked), so the in-game check needs a
staged setup: seed a mixed source city with the Self-Test's `seedEstablishedForeign` hook and force one move out of it.

**Watched (2026-09-18).** Mod tests 149 and 151 (EmigShots072, five turns): a marker people (player 1, the Abbasids,
eliminated, in no ledger entry) was seeded at 50% into every other major-civ city, leaving the rest as detectors. In
game the transit entries carried the mix (`{"1":0.5,"7":0.5}`), and by turn 77 the Bulgarian city Tula, a detector,
held 4% Abbasids that could only have arrived as part of a mixed migrant. Its hover panel read "Bulgarian 82%, Abbasid
18%" on the most Abbasid tile (`shots/combined151-item2-detector.png`). A single move cannot be forced, so the staging
seeded many sources and waited for ordinary moves instead. Status: done.

---

## 3. Settlements that are gone stay listed for up to 50 turns

**Observed.** In the turn-93 autosave, Rouen (last seen turn 60) and Taksasila (last seen turn 79) are still in the
ledger. A settlement leaves the pass's city list when it is razed, and also when it passes to a city-state or an
independent power, because `includeCityStates` is off. Readers that do not filter by when a settlement was last seen:

- `allCityCompositions()`, which feeds the diversity ranking's "All settlements" list (`emigration-window.js:657`),
  the enclave mean-population scale (`emigration-diaspora.js:102`), `emigration-quarter.js` and the origins
  diagnostic;
- `compositionForOwner()`, the empire-wide mix.

**Design.** Split "the settlement no longer exists" from "the settlement is not scanned this pass".

1. **Razed.** At the end of each pass, check every ledger entry that was not seen this pass with
   `Cities.getAtLocation(plotIndex)` / `MapCities.getCity(x, y)`. Both are used by the base game's own modules, so the
   API is confirmed to exist. No city on the plot means delete the entry now, not after 50 turns.
2. **Still standing but not scanned** (held by a city-state or independent). Keep the entry and mark it
   `tracked: false`. It keeps its origins, so a later recapture by a major civ resumes the old mix instead of seeding a
   fresh 100% conqueror (see O4).
3. **Readers.** `allCityCompositions()` and `compositionForOwner()` return only entries seen on the latest pass. Stamp
   `passTurn` on the ledger itself and compare against that, rather than against `Game.turn`, to stay clear of the
   age-local turn reset.
4. Keep `pruneStale` as the backstop for entries whose plot cannot be read.

**Cheapest disproof.** A Node test with a stubbed `Cities.getAtLocation`: a city drops out of the signals, the stub
reports no city, and after one pass the city must be gone from `allCityCompositions()` and `compositionForOwner()`.
Offline, rerunning the ledger extractor on the turn-93 autosave after the change should list no Rouen. In game, the
diversity window's "All settlements" list must stop showing a razed city on the next turn.

**Done when.** Watched: a razed settlement leaves the diversity list on the turn after it is razed.

**Built (2026-09-18).** `tests/composition-gone.mjs` failed before the change (Rouen still listed) and passes after it.
What differed from the design: the razed check uses `MapCities.getCity(x, y)` then `Cities.get(id)`, and requires the
found city to be centered on the plot, because `getCity` returns the plot's owning city and a neighbor's territory can
cover a razed center. No separate `tracked` flag was needed: the ledger stamps `passTurn`, and the live readers skip
entries whose `seenTurn` differs. The enclave records' two per-key lookups in `emigration-quarter.js` moved to a new
`cityCompositionByKey`, which still sees an entry held by a city-state, so the quarter logic is unchanged.

**Watched (2026-09-18).** Mod test 150 (AugustusAnt99, real data): at load the ledger listed Rouen (razed, last seen
turn 60) and Butoolo (last seen turn 97, now held by an Independent Power), and both were in the diversity list. After
one pass Rouen's entry was gone, and Butoolo's entry was kept but absent from `allCityCompositions` and the diversity
list (44 listed → 42). Mod tests 149 and 151 injected entries on a plot inside Rostov's territory, on an unowned plot
and on a city-state's center: the first two were deleted after one pass, the third kept and hidden. Status: done.

---

## O1. The lens can lag a turn, and never repaints while open

**Observed (code reading only).** Two separate staleness paths:

- **One turn behind.** The composition reader reloads once per `Game.turn`, and the tile and paint caches are keyed on
  `Game.turn` too. If the lens or hover panel reads in turn N before the recorder's pass for turn N has saved, it
  caches the previous turn's mix for all of turn N.
- **Frozen while open.** The lens paints in `applyLayer()` only, and it has no turn listener (neither lens does). A
  player who leaves the lens open across End Turn keeps last turn's paint until they toggle it.

**Design.**

1. The recorder writes a small pass stamp (a counter, under its own configuration key) right after `save()`.
2. The readers key their caches on that stamp instead of `Game.turn`. Reading one short configuration value per call is
   far cheaper than the JSON parse it guards, which happens only when the stamp changes.
3. The lens subscribes to `PlayerTurnActivated` in its own context. When its lens is active and the stamp has changed,
   it clears and repaints its layer.

**Feasibility.** Possible, pending one probe: whether calling the layer's clear-and-paint from an event handler,
outside `LensManager`'s own apply call, repaints the overlay. If it does not, the fallback is to re-activate the lens
through `LensManager.setActiveLens`.

**Cheapest disproof.** A probe that holds the lens open across End Turn in a game with a changing mix, and logs the
paint batch count and one tile's fill before and after. If the fill changes without a toggle, the fix works.

**Probe verdict (mod test 148, 2026-09-18).** Painting through the registered layer
(`LensManager.layers.get("emig-ethnicity-layer")`) from outside LensManager's apply call shows on the map, from a
timer and from inside a PlayerTurnActivated handler; the lens also stays active across End Turn. No fallback needed.

**Built and watched (2026-09-18).** The recorder writes `EmigrationEthnosStamp_v1` on every save;
`compositionVersion()` (turn plus stamp) keys the ledger reader, the tile cache and the lens paint cache; and the lens
checks for a newer version after each local PlayerTurnActivated (once the event's handlers have run, and again 3 s
later). `tests/composition-stamp.mjs` failed before and passes after. In game (mod tests 149, 150, 151) the open lens
repainted once after End Turn without a toggle, and the recorded stack shows that repaint came from the lens's own
`repaintIfStale`, with no other repaint after the turn. Status: done.

---

## O2. A code comment says mod state is not saved into the save file. It is.

**Observed.** `emigration-ethnicity-tiles.js:170` says a freshly loaded save "carries no stored composition at all
(mod state is not saved into the save file)". Both `AugustusAnt99` and `EmigShots072` hold the ledger in plaintext.
Mod test 86 saw no composition because it ran on `AugustusExp66`, a save made before the ledger existed (none of the
AugustusExp saves hold one), and because the lens painted before any pass had run.

**Design.** Rewrite the comment to say that: a save made before the ledger existed, or a lens painted before the first
pass, has no stored composition, so the lens treats the settlement as 100% owner. The fallback is correct and stays.

**Done when.** The comment is corrected. No behavior changes, so there is nothing to watch.

**Done (2026-09-18).** Comment rewritten.

---

## O3. Migrations are matched to cities by display name

**Observed (code reading only).** Migration records identify cities by `cityName()`, the localized display name, and
the ledger bridges name to plot through `nameToLoc`. Two cities with the same display name share one entry, and every
unreadable name falls back to the literal "a settlement", so all such cities collapse into one. A renamed city breaks
the match for any record still in transit.

**Design.** Add `srcLoc` and `destLoc` ("x,y", the ledger's own key) to the move, depart and arrive records (the
builders already hold the city objects) and to transit entries. The ledger looks up by location first, then by name
for records made before the change. Display names stay for notifications.

**Cheapest disproof.** A Node test with two cities both named "Alexandria" at different plots and a move into one of
them: today the arrival lands in whichever entry won the name map. With the fix it lands in the right one.

**Done when.** The test passes. This is rare enough in play that watching it in game is not required, which is noted
here as a deliberate exception.

**Built (2026-09-18).** Move, depart, arrive, death and return records, and transit entries, carry `srcLoc` / `destLoc`
when the plot is readable. The ledger matches by location first, then by name. The two-Alexandrias case in
`tests/composition-identity.mjs` passes, and a name-only record still resolves by name.

---

## O4. Captured city-states start as 100% the conqueror

**Observed (code reading only).** City-states are not scanned (`includeCityStates: false`), so the ledger first sees a
captured city-state when a major civ takes it, and seeds it as 100% the new owner. The same happens to any settlement
the ledger first meets already conquered: a mid-game install, or a city that was out of scan when it changed hands.

**Design.**

1. **Seed from the engine's original owner.** The city object exposes `originalOwner` (used throughout the base
   game's modules). On first sighting, when `originalOwner` is a different major civ, seed the city as that civ's
   people, not the conqueror's. This also covers a mid-game install and saves from before the ledger existed.
2. **Keep the entry through city-state ownership.** The `tracked: false` entries from item 3 keep a major civ's
   settlement's mix while a city-state or independent holds it.
3. **Native city-state people.** A city-state's own population has a minor player as its origin. The lens and panel
   resolve an origin's color and name through `civDisplayColor` and `civAdjective`, which have not been checked on
   minor or independent player ids.

**Feasibility.** Steps 1 and 2 are possible. Step 3 is **not confirmed**: it needs a probe of `civDisplayColor` /
`civAdjective` on a city-state id. If either fails, the fallback is to record a city-state's people as the conqueror,
as today, and record that verdict in `engine-closed.md` if it proves engine-bound.

**Cheapest disproof.** For step 1, one probe line: print `city.originalOwner` against `city.owner` for every city in
`EmigShots072` (which has conquests). If `originalOwner` is not populated as expected, the design falls back to the
ledger's own history.

**Probe verdicts (mod test 148, 2026-09-18).** Step 1: `originalOwner` is populated on all 82 cities and differs from
`owner` on 22, 20 of them held by player 0 and recorded in the ledger as 100% the conqueror. Step 3: `civAdjective`
names city-states and Independent Powers correctly ("Kannauj", "Vilnius") with no crash, but `civDisplayColor` gives
every minor player the same `#f9f9f9`, so the lens cannot tell two minor peoples apart (recorded in
`engine-closed.md`). Nothing downstream (enclave formation, returns, integration) filters minor origins, and
Independent Powers always read as at war, which would freeze their integration.

**Built and watched (2026-09-18).** Step 1: on first sighting, a settlement whose `originalOwner` is a different major
civ (checked through `Players.get`) seeds as that civ's people. Step 2 came with item 3. Step 3 took the fallback:
a captured city-state's people are still recorded as the conqueror. `tests/composition-stamp.mjs` covers the seed.
In game (mod tests 149, 151), Madrid (owner 0, original owner 5), deleted from the ledger and seen again, was re-seeded
as 99% origin 5 after one pass (1% had integrated), and Monte Albán (original owner a city-state) as the owner. Status:
steps 1 and 2 done; step 3 closed by the fallback.

---

## O5. Foreign population barely appears in normal play

Status: parked 2026-09-18. Enclave creation is set aside for now; nothing below is scheduled. The findings are kept so
the work can resume from the measurement step.

The target is some enclaves, not many.

### What the data shows

Foreign share of each settlement over time, read from the ledger in the saves (live settlements only). "Lead" is the
largest foreign origin's share of its city. 18% is the enclave bar at full pacing relaxation (30% × 0.6).

| Save | Game, version | Turn | Foreign pop | Cities with lead at or above 12.5% / 18% / 30% | Net cross-civ points |
| --- | --- | --- | --- | --- | --- |
| AugustusAnt43 | game A, 1.4.2 | 43 | 6.2% | 3 / 2 / 0 | 9 |
| AugustusAnt49 | game A, 1.4.2 | 49 | 8.4% | 7 / 5 / 1 | 12 |
| AugustusAnt65 | game B, 1.5.0 | 65 | 0.0% | 0 / 0 / 0 | 0 |
| AutoSave 82 | game B | 81 | 0.6% | 1 / 1 / 1 | not read |
| AugustusAnt99 | game B | 99 | 0.3% | 1 / 1 / 0 | 2 |
| EmigShots072 | promo game, 1.4.2 | 71 | 0.3% of 76 cities | 1 / 1 / 1 | 5.5 |

Game B has no enclave. The one Mérida community (46% at turn 81) is being integrated away, down to 26% by turn 99, and
no new foreign population arrived between turns 82 and 99. In 99 turns, 2 population points crossed a border, net.

The slider measurements (mod tests 90-94, 30 turns from AugustusExp66, which contains a volcano-driven refugee wave)
count cross-civ moves world-wide:

| "Movement between civilizations" | Cross-civ moves in 30 turns | Worst civ against the no-mod control |
| --- | --- | --- |
| Shipped default (mod test 94) | 15 | +17% |
| Old 0 position, now the default (mod test 90) | 25 | +18% |
| 25 (mod test 91b) | 30 | +29% |
| 75 (mod test 92) | 56 | +41% |
| 100 (mod test 93) | 63 | +37% |

### Diagnosis

- **Hypothesis.** The 2026-09-15 rescale of the cross-civ slider (shipped in 2.2.0: friction 30, crisis escape 0,
  small-civ brake 24, shelter-at-home 24) removed nearly all of the cross-civ flow that enclaves are made of. Game A,
  on the pre-rescale defaults, had 6-8% foreign population and 5 cities past the relaxed bar by turn 49. Every game
  since has around 0.3%.
- **Why it is only a hypothesis.** Game A and game B are different games, on different map scripts and game versions.
  One comparison across games does not isolate the setting.
- **What the rescale fixed.** It was a population balance fix: one refugee host ran 34-42% above its no-mod
  population. That problem is real, and the fix below must not bring it back.

The central point for the design: **balance depends on how many people cross borders. Enclaves depend on how
concentrated the ones who cross are.** The two can be tuned separately.

### Design

Order matters: the cheapest lever that cannot hurt balance goes first.

1. **Measure before tuning.** Rerun the mod test 94 harness (shipped defaults, AugustusExp66, 30
   turns) and log the composition ledger at each checkpoint: foreign share per city, cities past 12.5%, 18% and 30%,
   and enclaves recognized. Also run one peacetime save with no war or disaster in the window, because game B is
   peaceful and the harness save is not. If peacetime cross-civ moves are not near zero, the hypothesis is wrong, and
   the cause is integration speed, not inflow.
2. **Chain migration: concentrate, don't increase.** Backlog item K in `emigration-roadmap-and-backlog.md`. When a
   cross-civ migrant has several foreign destinations, prefer one that already holds their people:
   `enclaveAffinity(origin, dest)` from the destination's composition share. Two guards keep it neutral on balance.
   - It re-ranks foreign destinations only. It must not raise a foreign destination above the best domestic one, so
     the internal/cross-civ split, and so the balance numbers, are unchanged by construction.
   - It is capped, so the first arrivals still spread and one city does not collect a whole wave.

   The same 15 moves then land in 2-3 cities instead of 12, which is the difference between 1-point crumbs that
   integrate away and a community that crosses the bar. Item 2 (identity kept through re-migration) helps here too.
3. **Peacetime voluntary movement.** Mod tests 69-94 measured crisis waves. The rescale also throttled ordinary
   opportunity migration (friction 30 applies to voluntary moves). Lowering the friction for voluntary moves only,
   between civs at peace with Open Borders or a trade route between the two cities, is the historical merchant
   quarter. Refugee friction stays where it is. Measured, it must stay within the +17% balance result.
4. **Integration speed, last.** 3% per turn integrates a small community in about 23 turns (half-life), before it can
   grow. The ledger records no arrival turns, but the diaspora store already holds `since` per origin. A newcomer
   grace (no integration for a community's first N turns, the first generation) is possible. Try it only if steps 2
   and 3 are not enough, because it also slows every enclave's fade.
5. **Reframe pacing at the world level.** Pacing currently aims for 1 enclave per host civ per age (cap 3), and lowers
   the bars by up to 40% late in the age to get there. With 8-10 major civs, that target alone is 8-10 enclaves an age
   once inflow returns: the "ton" you want to avoid. Change it to a world-wide target, e.g. about one enclave per three
   major civs per age, with the per-host cap kept as the backstop. Pacing then relaxes the bars only while the world
   is below target, and not per host.

### Target to confirm

Proposed definition of "some", for your sign-off before any tuning runs:

- 2-4 enclaves world-wide per age on a large map with 8-10 major civs, and never more than 1 per host per age outside
  war (conquests can add more);
- at least 1 in a settlement the player has met by the middle of each age;
- balance unchanged: worst civ within the shipped +17% band (±3 points, the run-to-run noise mod test 94 recorded).

**Cheapest disproof** of the whole plan is step 1. If the ledger in the harness run already shows communities past 18%
under the shipped defaults, low inflow is not the problem and the design changes.

**Done when.** A 60-turn run on the shipped defaults plus the chosen steps lands inside the target, with the balance
figures logged beside it, and at least one enclave formed organically is watched in game.

---

## Suggested order

All five steps below are done (2026-09-18); the order is kept as the record of how the work ran.

1. O2 (comment) and item 3 (gone settlements): small and independent.
2. Item 1 (lens inversion): unblocks the Steam lens screenshots. The formation-bar question is parked with O5; the
   lens fix does not depend on it.
3. Item 2 and O3 together: both change the record and transit shapes, so one pass through the migration records
   covers both.
4. O1 (lens repaint): after its one probe.
5. O4: after its probe on city-state colors and names.

Parked: O5 (enclave frequency), including its measurement run and the formation-bar question from item 1.
