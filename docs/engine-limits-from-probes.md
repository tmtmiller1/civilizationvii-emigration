# Emigration — What a UI-Script Mod Cannot Do in Civilization VII (probe verdicts)

The consolidated list of things this project tried to do from script and found impossible, each with the
specific reason the engine gives. Every entry was established by an in-game probe, a native crash, or a
runtime survey, never by inference. Where a limit was later narrowed or overturned, the entry says so.

How to read an entry: **Wanted for** is the feature that needed it. **Tried** is what was run and when.
**Observed** is what the engine did. **Why it is closed** is the mechanism. **Instead** is what the mod
does now. **Recorded in** points at the evidence: the probe ledger (`devtools/engine-probe/README.md`, by
run or mod test number), `wont-implement-with-justifications.md` (the long-form record), or the archived
enclave feature.

Sections: population and yields (1), constructibles and tiles (2), ownership and cities (3), units (4),
the UI runtime (5), automation and the probe harness (6), and reads that mislead (7). Section 8 is a
one-line index.

---

## 1. Population and yields

### 1.1 Removing a rural population point removes nothing but a number

- **Wanted for.** Emigration that costs the source city something real.
- **Tried.** `city.addRuralPopulation(-1)` on London, watched over three turns with a per-plot diff.
  Probe run 4, 2026-09-11, save AugustusAnt136.
- **Observed.** Population and rural count drop at once, `pendingPopulation` goes to -1 and stays
  there. No improvement is removed on any plot. The city's net yields never fall and the growth
  threshold does not fall.
- **Why it is closed.** The counter is a pending-placement bookkeeping value. The engine only realises a
  population change when it places or removes a worked constructible, and a negative pending value is
  never resolved.
- **Instead.** A departure destroys one outlying rural improvement with `DESTROY_ELEMENT`, which removes
  the tile and the point together (`ui/emigration-departure-tile.js`). The counter is used only where no
  tile is left.
- **Recorded in.** Ledger, run 4.

### 1.2 Happiness cannot be granted or taken from a city

- **Wanted for.** An assimilation cost, a contested-enclave strain, a refugee-decision cost, all in
  happiness.
- **Tried.** `Players.grantYield(pid, YIELD_HAPPINESS, -n)`, watched against the city happiness readouts.
  Probe runs 1 to 5, 2026-09-11.
- **Observed.** Only the celebration stockpile moves (`Stats.getLifetimeYield`). No settlement's
  happiness or unrest changes.
- **Why it is closed.** Happiness in this engine is a per-settlement modifier sum, not a stockpile a
  script can add to. The only script-writable yield stores are the player-level ones.
- **Instead.** Every "happiness cost" is a celebration delay, and the option labels say so (README
  §7c).
- **Recorded in.** Ledger, runs 1 to 5; README §7c.

### 1.3 A runtime yield source cannot be attached, so mod yields never reach the banner or breakdown

- **Wanted for.** Enclave stance yields shown as a real per-turn source in the top banner and the yields
  breakdown, like the border-policy cards.
- **Tried.** A search of all 1,110 JS files across 231 community mods for a runtime modifier-attach call;
  then every runtime yield write the engine exposes. Closed 2026-07-16.
- **Observed.** The only runtime yield writes are `grantYield` and `changeGoldBalance`. Both move a
  balance without creating a breakdown source row.
- **Why it is closed.** The banner and breakdown read only the engine's own modifier and building
  sources. Policy cards work because they ride a Tradition slot the engine attaches. An emergent,
  per-city, player-chosen effect has no slot.
- **Narrowed 2026-09-12.** A placed constructible's native yields are engine-attributed and do reach the
  breakdown, so a yield can be made visible by placing a real improvement (2.4). The stance yield itself
  stays a treasury effect.
- **Instead.** The enclave's benefit is the placed tile's native yield; the stance drawback is a treasury
  effect surfaced in the mod's own readout.
- **Recorded in.** `wont-implement-with-justifications.md`, "Enclave STANCE yields" (CANTFIX-1).

### 1.3a `grantYield` reaches only player pools; Food and Production cannot be granted, most yields cannot be taken

- **Wanted for.** Enclave stance yields, whose registry pays in Food, Production, Science, Culture, Faith,
  Gold and Happiness.
- **Tried.** `Players.grantYield(local, yield, +100)` then `-100` for every `YieldTypes` entry, each read
  within 3 s and across a turn: player pools, lifetime and net yields, tech and civic progress, and the
  capital's and a town's growth, build queue and yields. Mod test 152, 2026-09-18, save AugustusExp66.
  Then the gaps: a Culture deduction with a civic in progress, the Science deduction read three times, and
  `city.FoodQueue.addProgress` / `city.BuildQueue.addProgress` (±50) on London and on French Paris, mod
  test 153 the same day.
- **Observed.**

  | Yield | + | − |
  |---|---|---|
  | Gold | treasury +100 at once | treasury −100 at once |
  | Influence | balance +100 at once | balance −100 at once; goes negative |
  | Science | tech progress +100 at once, kept across the turn | progress never drops; turns left rose once; a +100 right after added nothing (possible hidden debt, seen once) |
  | Culture | civic progress +100 at once; can finish the civic | nothing, with or without a civic in progress |
  | Happiness | celebration stockpile only (1.2) | celebration stockpile only |
  | Food | nothing anywhere | nothing anywhere |
  | Production | nothing anywhere | nothing anywhere |
  | Faith | no such yield type | no such yield type |

  No grant moved `Stats.getNetYield` in the same turn, Gold included. `city.BuildQueue.addProgress(n)`
  does write production: progress moved about ±57.5 per ±50 within 3 s (the city's production bonus
  applies), floors at 0, survived the turn, worked on Paris with no operation, and finished Paris's item
  when it crossed the cost. `city.FoodQueue.addProgress(n)` changed nothing (London's stored food rose by
  exactly its net food over the turn, no more).
- **Why it is closed.** Food and Production are city stocks with no player pool for `grantYield` to add to;
  `city.Growth` has no write method. The Culture and Science pools accept additions only.
- **Instead.** Enclave stances pay once, at recognition, in Gold, Influence, Science or Culture, and
  cost only Gold (`ui/emigration-stance-payout.js`, 2026-09-18). What a script can pay: Gold and
  Influence both ways, Science and Culture as gains only, Production per city through
  `BuildQueue.addProgress` (nothing lands while the queue is empty), Happiness only as celebration
  progress, Food not at all.
- **Recorded in.** Ledger, mod tests 152 and 153; `devtools/engine-probe/modtest152-UI.log`,
  `modtest153-UI.log`.

### 1.4 A specialist cannot be removed from any city

- **Wanted for.** The crisis urban leg taking a specialist once a settlement has no rural tile left, for
  departures and deaths, and a specialist-for-tile swap that would remove one person cleanly.
- **Tried.** `ASSIGN_WORKER {Location, Amount: -1}` sent by the local player on London (AugustusAnt136, 24
  population, 9 rural, 13 urban, 2 specialists), read at 4 s, 8 s, and after one ended turn. Mod test 55,
  2026-09-14, two runs: on a plot holding a specialist, and on the first plot `canStart` accepts (the
  selection the shipped `unassignSpecialist` uses).
- **Observed.** On a specialist's own plot `canStart` answers false and nothing changes. `canStart` accepts
  only plots with a free slot (Palace, Monument, Brickyard, Library, Academy, Harbor, Lighthouse; 0 of 1
  workers). Sent on the Palace plot, `getNumWorkers(false)` drops 2 to 1, but both specialist slots in
  `GetAllPlacementInfo` still read 1 of 1, population stays 24 while rural, urban, and specialists sum to 23,
  and turns to grow move 8 to 7. The gap survives the turn. `Growth.isReadyToPlacePopulation` stays false
  and `canStart(EXPAND)` offers no plot, so no point is freed to re-place.
- **Why it is closed.** `ASSIGN_WORKER` is the base game's placement operation: the place-population view
  sends it with `Amount: 1` for a waiting point (`interface-mode-acquire-tile.js`). Its `canStart` ignores
  the sign and checks for a free slot, and a negative amount lowers the city's worker counter without
  emptying a slot. The only script write that removes a person cleanly is `DESTROY_ELEMENT` on a
  constructible (1.1, 2.9).
- **Overturns.** The 2026-09-12 run 6 reading "removes a specialist", which read only `getNumWorkers`, and
  with it 3.4's "works for the local player's own cities". The pending -1 seen in mod test 2 came from the
  urban leg adding the counter write (1.1) on top of this desync. The swap was not attempted: with no freed
  point there is nothing to re-place.
- **Instead.** The crisis urban leg was removed 2026-09-14, specialist and building steps both. Crisis
  flight and deaths stop at the rural floor, and no mod code sends `ASSIGN_WORKER -1`.
- **Recorded in.** Ledger, mod test 55; the removed code and its justification in
  `mod_ideas_tested/_archived-emigration-urban-leg/`.

---

## 2. Constructibles and tiles

### 2.1 A constructible cannot be damaged (pillaged) from script

- **Wanted for.** A crisis that pillages a building or tile so a repair restores it, instead of
  destroying it (player-experience plan 8.2a).
- **Tried.** Mod tests 36 to 38, 2026-09-14, AugustusExp66 under human control. Every operation enum was
  read live: 67 `PlayerOperationTypes`, 4 `CityOperationTypes`, 13 `CityCommandTypes`, 75
  `UnitOperationTypes`, 33 `UnitCommandTypes`. The constructible instance's `setProperty` was called
  with "damaged", "Damaged", "DAMAGED", and "pillaged". `UNITOPERATION_PILLAGE` was asked from a knight
  created directly on London's own mine and against the city-center building plot.
- **Observed.** Only `CREATE_ELEMENT` and `DESTROY_ELEMENT` touch elements; nothing is damage-, pillage-,
  or repair-shaped. `setProperty` returned null and the `damaged` flag stayed false. Pillage answered
  `canStart` false in both cases.
- **Why it is closed.** Damage is written only by the combat pipeline. The pillage operation validates
  the target as hostile territory, and the instance's property store is script metadata that the engine
  does not read.
- **Instead.** No building is ever taken: the crisis urban leg was removed 2026-09-14 (1.4).
- **Recorded in.** Ledger, mod tests 36 to 38; `wont-implement-with-justifications.md`, last entry.

### 2.2 A half-built constructible created by script is an orphan

- **Wanted for.** The fallback to 2.1: revert a lost building to part-built so the city finishes it at a
  discount.
- **Tried.** `DESTROY_ELEMENT` a Gristmill, then `CREATE_ELEMENT` it back with the tuner's `Progress: 50`
  argument, then `Game.CityOperations.canStart(BUILD)` and a real build request. Mod test 38.
- **Observed.** The instance appears with `complete: false`, but the city reports the type buildable
  with plots and no `InProgress` flag. Sending the build queues a fresh copy at progress 0 of 175 and
  places a second incomplete instance on the same plot. An obsolete-age building cannot be queued at all
  in the current age.
- **Why it is closed.** The build system tracks its own in-progress entries; an instance created with
  `Progress` is a map object the queue never claims.
- **Instead.** Nothing. The gold refund covers recovery.
- **Recorded in.** Ledger, mod test 38.

### 2.3 A custom constructible cannot have a 3D model

- **Wanted for.** An on-map model for the per-civilization enclave constructibles.
- **Tried.** `VisualRemap` with improvement donors (Souq, Farm) and building donors (Monument, Granary),
  built and completed on proper tiles. Confirmed 2026-07-15.
- **Observed.** Every custom type rendered invisible. `ArtDef.log` never referenced the remap.
- **Why it is closed.** `VisualRemap` binds art only for units. Improvement and building art is bound by
  type name inside the art packs, and there is no modder asset SDK. The community "buildings visual remap
  fix" is deprecated because it makes the AI's copies of a remapped building invisible.
- **Instead.** Enclaves are placed as existing improvement types whose art already exists (the origin's
  own unique improvement, a same-yield fallback, or the Village), with a `WorldUI` overlay marker for the
  name and symbol (`ui/emigration-enclave-skins.js`, `ui/emigration-enclave-markers.js`).
- **Recorded in.** `wont-implement-with-justifications.md`, "A distinct 3D model".

### 2.4 A universal buildable custom improvement crashes the AI turn

- **Wanted for.** Enclaves the player and the AI build through production, so the engine attributes
  their yields natively.
- **Tried.** Forty-five `IMPROVEMENT_EMIG_ENCLAVE_<CIV>` rows, `CityBuildable` true, unlocked for every
  civilization. Isolated by blanking the data, 2026-07-17.
- **Observed.** A deterministic native crash mid AI turn (SIGSEGV at 0x278 on AsyncWorker1) while the AI
  constructible broker committed a build; no crash with the data blanked.
- **Why it is closed.** Every AI evaluates every improvement it can build. A custom type buildable by all
  civilizations is evaluated by every AI city, and the broker segfaults committing it. No shipping mod
  ships a non-civ-locked custom improvement; they are all civ-locked so only the owner evaluates them.
- **Narrowed 2026-09-12.** A never-buildable custom improvement (`RequiresUnlock` with no unlock,
  `CityBuildable` false) placed by `CREATE_ELEMENT` is safe: the broker never evaluates it, and it
  survived seven AI turns on human and AI cities.
- **Instead.** Enclaves are placed, never built (2.3).
- **Recorded in.** `wont-implement-with-justifications.md`, first entry; the archived feature at
  `mod_ideas_tested/_archived-emigration-enclave-feature/`.

### 2.5 The tile a departing worker leaves cannot be identified

- **Wanted for.** A map marker on the origin tile of a departure (workshop feedback).
- **Tried.** Three probe variants, 2026-07-15: the worked-set surface (`city.Workers.GetTilePlacementInfo`
  and `GetAllPlacementInfo`), an inline diff around a -1 rural removal, and a diff across a full turn on
  all 41 owned plots on three signals.
- **Observed.** The worker surface is the specialist subsystem (`NumWorkers`, `MaxWorkers`), not rural
  tile working. Not one per-plot signal changed after the removal, inline or across a turn.
- **Why it is closed.** The engine reassigns rural tiles internally with no per-tile "worked" or
  "unworked" flag exposed to script, and `getYieldsWithCity` is a hypothetical if-worked value.
- **Superseded in part 2026-09-11.** Since departures now destroy a tile the mod chooses (1.1), the
  vacated tile is known and visibly empty. The per-tile read is still impossible, but no longer needed.
- **Recorded in.** `wont-implement-with-justifications.md`, "Vacated-tile on-map marker".

### 2.6 An improvement cannot be placed on an empty plot without a rural district

- **Wanted for.** Enclave placement on a city's empty plot.
- **Tried.** `CREATE_ELEMENT {Kind:"CONSTRUCTIBLE"}` on an owned empty plot. Mod test 2, 2026-09-12.
- **Observed.** The request returns true and nothing appears.
- **Why it is closed.** A constructible needs a district on the plot. The engine does not create one
  implicitly.
- **Instead.** Create `{Kind:"DISTRICT", Type:"DISTRICT_RURAL", Location, Parent, Owner}` first, then the
  constructible (`placeOnEmpty` in `ui/emigration-enclave-place.js`).
- **Recorded in.** Ledger, mod tests 2 and 3.

### 2.7 A future age's constructible types do not exist yet, and Discovery improvements cannot be used

- **Wanted for.** Themed enclave skins for every civilization in every age.
- **Tried.** Placing a Modern civilization's unique improvement (the Mughal Stepwell) in Exploration;
  placing Discovery improvements (Cairn, Campfire, Plaza, Tents, Ruins). Mod tests 16 and 17, 2026-09-13.
- **Observed.** The Stepwell had no `GameInfo` row in Exploration. Discovery improvements are
  `RemoveOnEntry` and vanish when a unit enters.
- **Why it is closed.** Each age loads only its own and earlier constructible tables.
- **Instead.** Skin candidates are an ordered list and the placer takes the first type that is loaded in
  this age and has a valid plot, ending at the Village.
- **Recorded in.** Ledger, mod tests 16 and 17.

### 2.8 `canStart` is not a validity oracle for player operations

- **Wanted for.** Checking a placement before sending it.
- **Tried.** `Game.PlayerOperations.canStart` before every `CREATE_ELEMENT` and `DESTROY_ELEMENT`, on
  human saves and on Autoplay autosaves. Mod tests 8 to 10, 2026-09-13.
- **Observed.** Success for every request, including ones that did not take.
- **Why it is closed.** The player-operation `canStart` validates the request shape, not the placement.
- **Narrowed 2026-09-14.** `canStart` for `ASSIGN_WORKER` does answer per plot, but as a placement check
  that ignores the sign of `Amount`: for `-1` it refused a specialist's own plot and accepted empty slots
  (1.4). Its Success is not evidence that a removal is possible.
- **Instead.** Every placement is confirmed by reading the plot on a later pass (`enclaveStanding`,
  `placedPlotOccupied`), never by the request result.
- **Recorded in.** Ledger, mod tests 8 to 10.

### 2.9 Destroying an improvement leaves a dead rural district

- **Wanted for.** Departures and enclave removals that take a tile away without ruining the plot.
- **Tried.** `DESTROY_ELEMENT {Kind:"CONSTRUCTIBLE"}` on rural improvements, then the settlement's
  `canStart(EXPAND).Plots`. Mod test 40, 2026-09-14, the reporting player's own save.
- **Observed.** The improvement and its population point go, but the `DISTRICT_RURAL` stays with nothing on
  it. That plot is never offered for a new population point, and nothing is damaged, so it can neither be
  re-placed nor repaired.
- **Why.** The expansion list only offers plots without a district; the district is a separate element that
  the constructible destroy does not remove.
- **Instead.** The empty district is removed with `DESTROY_ELEMENT {Kind:"DISTRICT", Owner, LocalID}` a moment
  after the improvement's destroy lands, and a sweep on load and each turn clears any that remain
  (`ui/emigration-plot-cleanup.js`). Watched: the plot returns to the list and takes a new population point.
- **Recorded in.** Ledger, mod test 40.

---

## 3. Ownership and cities

### 3.1 A city-attached tile cannot be released

- **Wanted for.** Cultural Diffusion's tile flips, and any emigration idea that would free land.
- **Tried.** `WorldBuilder.MapPlots.setOwnership(NO_PLAYER, loc)` on a city tile, checked over twelve
  turns, also after first setting ownership to self. Cultural Diffusion harness runs 1 and 2, 2026-09-12,
  game 1.4.2.
- **Observed.** The tile stays owned. No other ownership-writing call exists in the base game's scripts.
- **Why it is closed.** Ownership of a city's plots is derived from the city's territory, and the world
  builder write does not detach a plot from its city.
- **Instead.** No mod feature is planned on releasing city tiles. `city.purchasePlot` does extend
  territory (and lands after the call, see 7.2).
- **Recorded in.** The Cultural Diffusion harness notes; memory "civ7-engine-ownership-verdicts".

### 3.2 An existing city cannot be transferred between owners

- **Wanted for.** Enclave secession and uprising (a `BY_REVOLT` transfer).
- **Tried.** The 2026-09-12 survey of the developer tuner's request surface.
- **Observed.** `CREATE_ELEMENT {Kind:"CITY"}` founds a town for the local player or an AI owner, and
  cities can be destroyed, but no request transfers a city.
- **Why it is closed.** City transfer is owned by the engine's capture and revolt pipelines, which a
  script can observe (`CityTransfered`) but not invoke. Destroy-then-refound is not a transfer.
- **Instead.** The petition, secession, and uprising design is abandoned as specified.
- **Recorded in.** `wont-implement-with-justifications.md`, "Petition / secession / uprising".

### 3.3 Operations sent under another player's id are refused

- **Wanted for.** Acting on AI cities as if the AI had done it.
- **Tried.** `ASSIGN_WORKER Amount: -1` sent with a foreign player id. Probe runs 7 and 8, 2026-09-12.
- **Observed.** `canStart` reported success, `sendRequest` returned false, and specialists were
  unchanged over seven turns.
- **Note 2026-09-14.** The operation tried here is not a removal even for the local player (1.4). The
  refusal verdict rests on `sendRequest` returning false, which still holds.
- **Why it is closed.** Requests are authenticated as the sending player. Only the local player's id is
  accepted from the local client.
- **Instead.** Cross-civilization writes are sent as the local player with `Owner` and `Parent` arguments
  naming the other civilization. This works for `CREATE_ELEMENT`, `DESTROY_ELEMENT`, and unit creation.
  It is also why the mod is single-player only.
- **Recorded in.** Ledger, runs 7 and 8.

### 3.4 A specialist cannot be removed from an AI city

- **Wanted for.** The crisis urban leg taking a specialist before a building, in every city.
- **Tried.** `ASSIGN_WORKER Amount: -1` for an AI city, both as the foreign id (refused, 3.3) and as
  the local player with the foreign owner. Runs 6 to 8.
- **Observed.** Works only for the local player's own cities.
- **Why it is closed.** The un-assign operation is a city command bound to the requesting owner.
- **Superseded 2026-09-14.** No city can lose a specialist from script, the local player's included: in the
  local player's cities the operation only desyncs the worker counter (1.4). The AI-city limit is a special
  case of that.
- **Instead.** See 1.4. The urban leg was removed 2026-09-14; no city loses an urban point to a crisis.
- **Recorded in.** Ledger, runs 6 to 8; README §6d.

---

## 4. Units

### 4.1 The AI disbands migrant units

- **Wanted for.** Arrivals in AI cities as migrant units the AI settles, mirroring the human path.
- **Tried.** Two `UNIT_MIGRANT` created beside an AI city. Runs 7 and 8, 2026-09-12.
- **Observed.** Both vanished within two turns while the owner's population, rural, urban, and
  improvement counts stayed exactly the same.
- **Why it is closed.** The AI has no behavior for the migrant unit and disbands what it cannot use.
- **Instead.** AI arrivals are placed directly (`arriveRural` with the automatic expand path); the migrant
  unit is a human-only option.
- **Recorded in.** Ledger, runs 7 and 8.

### 4.2 A unit cannot pillage its owner's own tiles

See 2.1. `UNITOPERATION_PILLAGE` answers false on own plots even with the unit standing on the tile.

---

## 5. The UI runtime

### 5.1 The UI engine has no CSS grid

- **Observed.** `display: grid` and `1fr` silently break layout in GameFace; a blank screen with
  `near text: 1fr` in `UI.log` is the signature.
- **Instead.** Flexbox everywhere. The Guide, the readout, and the banner bar are all flex.
- **Recorded in.** Memory "civ7-gameface-no-css-grid".

### 5.2 An unknown player id crashes the game natively

- **Observed.** `Game.IndependentPowers.independentName(99)`, a player that does not exist, crashed the
  game twice (EXC_BAD_ACCESS in the host and the UI runtime), 2026-09-13.
- **Why.** Engine accessors do not validate ids; a bad one dereferences freely.
- **Instead.** Every player-keyed engine call is guarded by `Players.get(pid)` first
  (`knownPlayer` in `ui/emigration-naming.js`), and probe records must use real ids.
- **Recorded in.** Ledger, mod tests 19 to 21; README §12.

### 5.3 A UI script cannot count on reaching the component it decorates

- **Wanted for.** The city-banner pressure bar.
- **Observed.** `Controls.decorate` accepts a registration and may then never hand a component over: the
  same call, written the same way, attached to the sub-system dock and never once to a city banner. A
  script's own context can also lack the HUD entirely (no banners, no dock) while another mod's script sees
  both, and load order does not settle it. Registration returning without throwing, and the module logging
  that it registered, were both true for the bar's whole life while it drew nothing.
- **Instead.** Anything that must attach to base-game UI watches the DOM for it, as the plot tooltips do,
  and logs how many target elements it can actually see. The bar was withdrawn.
- **Recorded in.** `mod_ideas_tested/_archived-emigration-banner-pressure/docs/why-it-was-removed.md`.

### 5.4 No floating map text, and no clickable notification without a database row

- **Observed.** `WorldUI` has no usable path for text rising from a plot. A clickable end-turn notification
  needs a notification type defined in the database; the UI runtime cannot raise a new one.
- **Instead.** Toasts and world news carry the per-plot messages.

### 5.5 Gameplay writes from the UI runtime are client-side

- **Observed.** UI-VM gameplay writes apply on the machine that runs them.
- **Instead.** The mod is single-player.

### 5.6 An existing save cannot be pushed into an age crisis, and the running crisis is not readable

- **Wanted for.** Crisis-driven displacement tests.
- **Observed.** Editing `AgeCrisisStages` reaches the database (the lowered trigger percentages read back
  changed) but a save in progress ignores it: with both crises present and stage 1 lowered to 42%, a save
  carried from 41.3% to 48.8% age progression never left stage -1. `Game.CrisisManager` reports the current
  stage, the stage count, and whether crises are enabled, but never which crisis was selected. Mod tests 96
  to 98d, 2026-09-16.
- **Instead.** Force a crisis with a new game and the crisis chosen in setup (mod test 100 onward).
- **Recorded in.** Ledger, mod tests 96 to 100.

---

## 6. Automation and the probe harness

These limit how the mod can be verified, not what it can do.

### 6.1 A multi-turn Autoplay never runs the mod's pass

- **Observed.** Eighty turns of `Autoplay.setTurns(80)` produced zero migrations and never seeded the
  composition ledger. One-turn Autoplay, repeated, does run it. Mod tests 29 and 30, 2026-09-13.
- **Why.** The pass hooks the local player's `PlayerTurnActivated`, which a long Autoplay does not raise
  between its turns.
- **Instead.** Measure with one-turn Autoplay loops or script-ended turns.

### 6.2 Autosaves taken under Autoplay resume Autoplay and are unusable for write probes

- **Observed.** Turns kept ending every eight seconds after `Autoplay.setActive(false)`; placements landed
  only sometimes because the AI acted underneath the probe. Mod tests 8 to 10.
- **Instead.** Only saves made under human control are used for write probes.

### 6.3 The `-autojson` automation flag does not start a run

- **Observed.** The argument stayed on the process and nothing happened; no Automation lines in the log.
  Game 1.4.2, 2026-09-12.
- **Instead.** The shell-scope save loader in `devtools/engine-probe/eep-shell.js`, then
  `UI.notifyUIReady()` to press Begin Game.

### 6.4 The "assign new resources" end-turn blocker cannot be cleared from script

- **Observed.** `NOTIFICATION_ASSIGN_NEW_RESOURCES` recurred every turn and survived `dismiss`,
  `activate`, `ASSIGN_RESOURCE`, and `CONSIDER_ASSIGN_RESOURCE`. Runs 1 to 5.
- **Instead.** The harness falls back to one-turn Autoplay, which pollutes yield deltas; only structural
  fields are trusted after such a turn.

### 6.5 No gameplay request lands before Begin Game is pressed

- **Observed.** With the loading state at `WaitingForUIReady` or `WaitingToStart`, city, player, and
  Autoplay requests are dropped, while direct mutators such as `addRuralPopulation` still apply.
- **Instead.** Poll `UI.getGameLoadingState()` and call `UI.notifyUIReady()` until `GameStarted`.

---

## 7. Reads that mislead

Not limits on what can be done, but reads that lie for a moment and have caused wrong verdicts.

### 7.1 The treasury balance is stale within the turn after a deduct

- **Observed.** Two same-turn charges read the old balance and took a treasury to -4. 2026-09-13.
- **Instead.** Any floor must subtract what the turn has already charged.

### 7.2 Ownership and placement land after the call

- **Observed.** `purchasePlot` shows the old owner on the same tick and the new one within about three
  seconds. A placed constructible shows its native yields within seconds, not immediately. A freshly
  placed enclave's plot still shows the replaced tile for a moment.
- **Instead.** Judge every write on a later pass or timer, never by an inline read. The enclave
  built-over rule has a two-turn placement grace for this reason.

### 7.3 `Game.age` is a hash

- **Observed.** String-matching it made every age read as Antiquity.
- **Instead.** `GameInfo.Ages.lookup(Game.age).AgeType`.

### 7.4 The yield-change table has no food rows for farms

- **Observed.** `Constructible_YieldChanges` carries no food for farms, fishing boats, pastures, or
  plantations; the food comes from terrain and resources.
- **Instead.** Food improvements are classified by name first, the table second.

---

## 8. Index

| Item | Verdict | Date | Evidence |
|---|---|---|---|
| Remove a rural point through the counter | removes no tile, no yields | 2026-09-11 | ledger run 4 |
| Grant or take city happiness | only the celebration stockpile | 2026-09-11 | ledger runs 1 to 5 |
| Attach a runtime yield source | no API; banner never shows mod yields | 2026-07-16 | won't-implement, CANTFIX-1 |
| grantYield per yield | Gold, Influence ±; Science, Culture + only; Food, Production nothing; no Faith | 2026-09-18 | ledger, mod tests 152 and 153 |
| Write city production / food | BuildQueue.addProgress works, any owner; FoodQueue.addProgress does nothing | 2026-09-18 | ledger, mod test 153 |
| Remove a specialist from any city | ASSIGN_WORKER -1 desyncs the worker count; empties no slot, frees no point | 2026-09-14 | ledger, mod test 55 |
| Damage a constructible from script | no operation; setProperty is metadata; own-tile pillage refused | 2026-09-14 | ledger, mod tests 36 to 38 |
| Create a half-built constructible the city finishes | orphan; the queue makes a second copy | 2026-09-14 | ledger, mod test 38 |
| 3D model for a custom constructible | VisualRemap is units-only; no asset SDK | 2026-07-15 | won't-implement, 3D model |
| Universal buildable custom improvement | AI broker native crash | 2026-07-17 | won't-implement, first entry |
| Identify the tile a departing worker leaves | no per-tile worked flag | 2026-07-15 | won't-implement, vacated tile |
| Place an improvement on an empty plot | needs a rural district first | 2026-09-12 | ledger, mod tests 2 and 3 |
| Place a future age's type | not loaded in this age | 2026-09-13 | ledger, mod tests 16 and 17 |
| Trust player-operation canStart | always Success; ASSIGN_WORKER is a placement check that ignores the sign | 2026-09-13, 2026-09-14 | ledger, mod tests 8 to 10 and 55 |
| Re-use a plot after destroying its improvement | the rural district stays and blocks it; remove it too | 2026-09-14 | ledger, mod test 40 |
| Release a city-attached tile | setOwnership does nothing | 2026-09-12 | ownership verdicts |
| Transfer an existing city | no request exists | 2026-09-12 | won't-implement, petition |
| Send an operation as another player | refused | 2026-09-12 | ledger, runs 7 and 8 |
| Remove a specialist from an AI city | superseded: no city can, see "any city" | 2026-09-12, 2026-09-14 | ledger, runs 6 to 8 and mod test 55 |
| Migrant units for the AI | disbanded within two turns | 2026-09-12 | ledger, runs 7 and 8 |
| CSS grid in the UI | silently breaks layout | earlier | memory, GameFace |
| Engine call with an unknown player id | native crash | 2026-09-13 | ledger, mod tests 19 to 21 |
| Decorate a city banner | registration accepted, component never delivered | earlier | archived banner pressure |
| Floating map text; new clickable notification | no WorldUI path; needs a database type | earlier | runtime survey |
| Push an existing save into a crisis; read the running crisis | ignored; not exposed | 2026-09-16 | ledger, mod tests 96 to 98d |
| Multi-turn Autoplay running the pass | never raises the local turn | 2026-09-13 | ledger, mod tests 29 and 30 |
| Autoplay autosaves for write probes | Autoplay resumes on load | 2026-09-13 | ledger, mod tests 8 to 10 |
| `-autojson` automation | does not start | 2026-09-12 | memory, autojson |
| Clear the assign-resources blocker | survives every operation | 2026-09-11 | ledger, runs 1 to 5 |
