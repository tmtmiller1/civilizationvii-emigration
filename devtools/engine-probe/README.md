# Engine probe (dev-only, not shipped)

Throwaway hands-free probe used on 2026-09-11 to settle three engine questions for the Emigration mod.
Install by copying this folder to `~/Library/Application Support/Civilization VII/Mods/emig-engine-probe/`
with the two scripts under `ui/`. It auto-loads `TARGET_SAVE` (set in `eep-shell.js`) from the main
menu, presses "Begin Game" itself (`UI.notifyUIReady()`), runs five turns, and logs `[EmigProbe]` lines
to `Logs/UI.log`. Remove the folder afterward: it hijacks every launch while installed.

Turn ends fall back to `Autoplay` (the AI plays the local civ for one turn) when the persistent
"assign new resources" blocker cannot be cleared, so per-turn yield deltas are polluted by AI actions.
The structural fields (pop, rural, pendingPopulation, specialists, per-plot constructibles) are not.

Verdicts (run 4, AugustusAnt136 save, London/Leeds/Birmingham local, St. Petersburg foreign):

- `addRuralPopulation(-1)`: pop and rural drop at once, `pendingPopulation` becomes -1 and stays -1
  for the rest of the run. No improvement is removed on any plot (per-plot diff over 3 turns) and the
  city's net yields never drop. `getNextGrowthFoodThreshold` does not fall either.
- `addRuralPopulation(+1)` on a local city: `pendingPopulation` +1, growth threshold rises (272.8 to
  336.8). When the point is placed (Autoplay placed it the next turn) a real improvement appears
  (IMPROVEMENT_WOODCUTTER) and food rises. No NEW_POPULATION notification was seen for the human before
  Autoplay took the turn in this run; mod tests 64 to 67 later watched the game's blocking Grow City prompt
  appear for mod-added points alone (see the ledger below).
- `addRuralPopulation(+1)` on an AI city: the AI resolves the pending point on its turn as a specialist
  (specialists 2 to 3, rural back to 8); yields shift accordingly.
- `Players.grantYield(local, YIELD_HAPPINESS, -100)`: `Stats.getLifetimeYield` drops by exactly 100 at
  once (the celebration meter). Per-turn net happiness and every city's happiness are unchanged.
- `CREATE_ELEMENT` UNIT_MIGRANT for the local player works; `UNITCOMMAND_RESETTLE` on it adds +1 pop,
  +1 rural and +1 improvement to the receiving city (Birmingham 16/10/10 to 17/11/11).

Run 5 (same save) and the mod test, both 2026-09-11:

- `DESTROY_ELEMENT` with `{Kind:"CONSTRUCTIBLE", Owner, LocalID}` on a rural improvement (args as the
  base tuner sends them) removed the tile and one population point together within seconds: London
  24/9/9 to 23/8/8 (pop/rural/improvements), production 53 to 52; St. Petersburg (foreign, sent by the
  local player with the foreign Owner in the args) 25/8/8 to 24/7/7. Not owner-gated.
- `CityCommands.sendRequest(cityID, EXPAND, {X,Y})` right after a +1 placed the pending point the same
  turn: Leeds 17/5/5 to 18/6/6 with a fishing boat on the chosen plot, food 19 to 21.
- The growth-cancel question (does a lingering -1 pending eat the next growth) stayed inconclusive (the
  test town became unreadable after Autoplay) and is moot now that departures no longer use the counter.
- `eep-modtest.js` drove the shipped mod code on real cities: `commitSourcePoint` abandoned a fishing
  boat in London and a camp in St. Petersburg and charged 10 gold to each owner; `arriveRural` in
  automatic mode placed a tile in Leeds; in ask mode the native pop-up rendered ("Newcomers in London",
  three options) and clicking "Choose where they settle" opened `INTERFACEMODE_ACQUIRE_TILE`; in unit
  mode a Migrant unit spawned at Birmingham. Over two Autoplay turns the mod's own pass abandoned one
  tile per departure (a same-turn duplicate pick was found in the first run and fixed).

Run 6 (2026-09-12, same save): the developer tuner's CREATE_ELEMENT / DESTROY_ELEMENT surface, sent
by the local player with `Parent` = the city id and `Type` = the constructible's `$index` (improvements)
or type string (buildings), exactly as `base-standard/ui/tuner-input/tuner-input.js` sends them:

- Re-creating a standard improvement on the plot just abandoned worked on London (pop 23 to 24) and on
  foreign St. Petersburg (24 to 25). Standard constructibles can be PLACED at runtime, any owner.
- Creating BUILDING_GRANARY in a London district with room: urban 13 to 14, food 29 to 35, science and
  culture up. Destroying it: pop 25 to 24, urban 14 to 13. Urban population can be written both ways
  through buildings.
- CREATE_ELEMENT UNIT_MIGRANT for the foreign owner at an empty tile beside its city: units 16 to 17,
  the unit owned by player 2. CREATE_ELEMENT is NOT owner-gated; the earlier "local-only" verdict was
  wrong (most likely a bad location).
- CREATE_ELEMENT {Kind:"CITY"} founded a town for the local player on empty land (cities 6 to 7). The one
  foreign attempt did not take (request returned true, no city); untested whether the spot was invalid.
- ASSIGN_WORKER with Amount -1 on a specialist plot: specialists 2 to 1, population unchanged.

Runs 7 and 8 (2026-09-12, same save), the follow-ups. `eep-test-constructible.xml` defines
IMPROVEMENT_EMIG_TEST_ENCLAVE, a custom improvement that is never buildable (RequiresUnlock with no
unlock, CityBuildable/TownBuildable false) and carries +3 culture, +2 gold, population 1; the modinfo
here loads it with an UpdateDatabase group.

- Custom non-buildable improvement: CREATE_ELEMENT (index + Parent) placed it on a freed plot of London
  (culture 38.5 to 41.8, gold 25 to 27) and, in run 8, of AI-owned St. Petersburg (pop 24 to 25, culture
  96.8 to 100.1). The game ran seven AI turns after each placement with the tile in play, no crash, no
  new dump. The 2026-07-17 crash was the AI build evaluator scanning a universally buildable custom
  improvement; a mod-placed, never-buildable one is not evaluated.
- Foreign building destroyed (St. Petersburg library): pop 25 to 24, urban 15 to 14. Urban write, any owner.
- Town founded for the AI owner on the second candidate spot (cities 5 to 6); the first spot, four
  tiles from its capital, did not take. Local control spot founded too.
- AI migrant units: two UNIT_MIGRANT spawned for the AI beside its city both vanished within two turns
  while the owner's total population, rural, urban and improvements stayed exactly the same (57 / 31 /
  24 / 31); later growth was natural. The AI disbands them. Not a route for AI arrivals.
- ASSIGN_WORKER Amount:-1 sent as the FOREIGN owner: canStart reported success, sendRequest returned
  false, specialists unchanged over seven turns. Operations issued under another player's id are
  refused; the local player's own specialist removal (run 6) stands.

Mod tests 2 and 3 (2026-09-12, `eep-modtest2.js` in its two forms, logs `modtest2-urban-*` and
`modtest3-enclave-*`), driving the SHIPPED code on real cities:

- Crisis urban leg: a rural-exhausted crisis signal on London reserved a specialist; commit un-assigned
  it (specialists 2 to 1, pop 24 to 23, culture 38.5 to 36.3; the count decrement leaves pending -1). On
  foreign St. Petersburg it reserved a building; commit destroyed it (urban 15 to 14, culture 96.8 to
  91.3). A voluntary cause reserved nothing; a second reservation the same turn was refused; undo
  restored the signal; a death on rural-exhausted Paris took its harbor (urban 13 to 12).
- Enclave tile: the first attempt on an EMPTY plot did not take (an improvement needs its rural
  district). Creating DISTRICT_RURAL first (the tuner's district mode), then the improvement, placed
  IMPROVEMENT_EMIG_ENCLAVE_ROME_A in London (pop 24 to 25, improvements 9 to 10) and
  IMPROVEMENT_EMIG_ENCLAVE_GREECE_B in Leeds (culture 9 to 11, the tile's own +2). The marker module
  painted both tiles; three AI turns ran clean.

Mod test 4 (2026-09-12, `eep-modtest3.js`, log `modtest3-tuning-antiquity-UI.log`), the brakes on the real
losses, driving the shipped code on the AugustusAnt136 save (London, 13 urban / 9 rural):

- A live constructible instance exposes `damaged` (boolean), so the pillaged-first tile rule has its read.
  No tile in the player's cities was pillaged in this save, so the rule's live ORDER was not exercised.
- `GameInfo.Constructible_YieldChanges` supports `.filter` (172 rows), but farms, fishing boats,
  pastures and plantations have NO food row in it (confirmed in `Debug/gameplay-copy.sqlite`): the
  table-only read called every food tile "not food". Fixed the same evening: the name hint is primary,
  the table is a supplement. The corrected famine ordering is unit-tested, not yet watched live.
- `chargeDepartureGold` on the local player charged 10, 10, 10, then 0 (the 30 per-turn cap); the
  treasury read works (538.96 to 508.96), so the never-below-zero floor has its input.
- `findDepartureBuilding` reads the current age (`GameInfo.Ages.lookup(Game.age)` = AGE_ANTIQUITY) and
  flags obsolescence; London's pick was its harbor (not obsolete, cheapest).
- `urbanCrisisBudget(London)` = 4 (floor(13 x 0.34)).
- The disaster cap: after 12 booked losses on St. Petersburg (pop 25 x 0.5) `canShedPoint` refused the
  disaster cause and still allowed war.
- Both Self-Test rows render the new limits; three turns ran clean (the only engine errors were the
  base game's army-commander-flags and root-game.html noise seen in every run).

Runner: `run-modtest.sh` (enables the LOCAL emigration copy by ModId + scanned path, adds the test-only
`AffectsSavedGames=0`, installs the probe with `eep-modtest3.js` as its game script, launches via Steam, waits
for `DONE`, quits, and restores every emigration row to Disabled=1 by ModId). Gotcha learned on mod test 4:
editing a modinfo makes the game re-scan and assign a NEW ModRowId, so a restore keyed by row id misses the
live row and leaves the mod enabled. Restore by ModId.

Mod test 5 (2026-09-12, `eep-modtest4.js`, log `modtest4-transition-antiquity-UI.log`): placed enclave tiles
through an AGE TRANSITION, on the peer session's AutoSave_00_0158 (turn 158, Antiquity ending at 160; that
session had just seen an AsyncWorker1 EXC_BAD_ACCESS at 0x2a8 about 30 s after the same transition with
emigration disabled). With emigration enabled: an enclave placed on London (plot 3161) and one on AI Paris
(plot 4689, replacing a mine) both stood at once; Autoplay drove through the age end into Exploration and on
to Exploration turn 11; the game then idled 12 minutes. NO crash, no .ips. Observations:

- The transition reloads every game-scope UI script (the probe re-attached at Exploration turn 1 and ran
  again). The mod's own state is persisted in GameConfiguration, so this is fine in play, but the probe's
  in-memory record of London's Antiquity tile was lost, so whether plot 3161 survived is UNKNOWN.
- The Paris enclave (AI city) stood at Exploration turns 2 and 11: a placed enclave survives the transition.
- The probe's second placement on London at Exploration turn 1 (empty plot 2873, district then improvement)
  did NOT take (plot empty afterward). Placement on the very first turn of a new age is unverified.
- `WorldUI is not defined` unhandled rejections appear in UI.log at 22:07:17 (main menu, before any
  game-scope script exists) and at 22:08:22 (20 s before the game scripts re-attached after the
  transition). The mod's only WorldUI users (enclave-markers, ethnicity-lens) run inside try/catch and
  attach later than both, so these come from the base game or another mod, not from emigration.

Mod test 6 (2026-09-13, `eep-modtest5.js`, log `modtest5-brakes-UI.log`), the brakes on real losses,
AugustusAnt136 (Antiquity turn 136, 66 met cities):

- Famine ordering (after the yield-table fix): London's plain pick is its fishing boat; with the starving
  hint it is the mine. Food tiles (fishing boats, plantation) are now flagged by name.
- Pillaged-first: Mīlētos (AI, player 1) had one pillaged farm; a committed war departure picked exactly
  that tile, DESTROY_ELEMENT removed it (plot empty 5 s later), and player 1's treasury went 416.52 to
  406.52. So a raid and the flight it causes cost one tile, and the losing civ pays.
- Cross-civ gold: a departure from St. Petersburg (player 2) took its treasury 221.32 to 211.32.
- Treasury floor: BUG found. Drained to 5.96, two same-turn charges each took 5.96 (treasury -4.04): the
  balance read is stale within the turn (the engine applies the deduct asynchronously). Fixed the same
  morning: the floor now subtracts the turn's own charges; unit-tested, redeployed, not yet watched.
- Urban crisis cap, same turn: Paris (12 urban) with the cap at 1% and per-turn room of 5: budget 1,
  the harbor taken, then budget 0 and no further reservation although a fishing quay was available.
  Next-turn recheck came back "building": inconclusive, see mod test 7 (the config override may be reset
  at turn start).
- Enclave placed in London (plot 2875); arrival prompt issued (pending 1). Screenshots FAILED: the game
  runs on its own Space, and screencapture captured the desktop. The runner now activates the game
  window first.

Mod test 7 (2026-09-13, `eep-modtest6.js`, log `modtest6-transition-UI.log`, screenshots in `shots/`):
enclave tiles through the age transition with the placements PERSISTED, from AugustusAnt136 with Autoplay to
the age end at turn 160 and on to Exploration turn 9. No crash.

- Persistence: a record written with `Configuration.editGame().setValue` before the transition read back
  intact after it, so the mod's own GameConfiguration state survives the age change.
- Both enclaves stood every turn after the transition: London's (human, empty plot 2875, placed with a
  new rural district) and St. Petersburg's (AI, plot 5064, replacing a farm), through Exploration turn 9.
- Urban crisis cap across turns: with the cap at 1% and per-turn room of 5, Paris lost one harbor at turn
  136 and every turn from 137 to 156 read budget 0 and no reservation; the CONFIG override held across
  turns. So mod test 6's "building" recheck was the probe's own state, not the cap.
- Fresh placement in the Exploration age FAILED three times: London's one empty plot (3161, which had
  accepted an enclave in Antiquity in mod test 5) at turns 1 and 2, and an AI woodcutter takeover at turn
  3 whose DESTROY did not land either. Diagnosed in mod test 8.
- Visual: `shots/modtest6-transition-enclave-marker.png` shows the placed tile beside London with the
  Roman symbol and "ROMAN ENCLAVE" label; `shots/modtest6-transition-arrival-prompt.png` shows the
  "Newcomers in London" pop-up with its three choices. (Screenshots need Screen Recording permission for
  the terminal host; without it screencapture returns the wallpaper.)
- The marker module's CSS-channel diagnostics wrote about 1,400 "Unable to parse declaration" lines in one
  session; replaced with the gated dlog the same morning.

Mod tests 8 to 10 (2026-09-13, `eep-modtest7.js`, logs `modtest7-exploration-UI.log`,
`modtest8-exploration-UI.log`, `modtest9-exploration-human-UI.log`): why fresh enclave placement failed in
the Exploration age.

- Tests 8 and 9 loaded today's Exploration AUTOSAVES, which were taken under Autoplay, and the game resumed
  Autoplay on load: turns kept ending every ~8 s even after `Autoplay.setActive(false)` (with
  `setReturnAsPlayer` too), so the AI was acting for London underneath the probe. In that state
  CREATE_ELEMENT and DESTROY_ELEMENT landed only sometimes (a district appeared and the AI immediately
  filled it with a mine; an AI takeover worked once and failed once), and `canStart` answered Success for
  every request, so it is no validity oracle. Verdict: autosaves from an Autoplay run are unusable for
  write probes; only saves made under human control are.
- Test 10 loaded AugustusExp66 (a real human-controlled Exploration save, turn 66): the enclave placed on
  London (human, replacing its outlying mine) and on Paris (AI, replacing a woodcutter) both stood within
  5 s. Exploration-age placement works. The empty-plot path (district first) was not exercisable here
  (London had no empty plot); its district-creation half was watched working in tests 8 and 9.
- Side finding from test 9: `findDepartureTile` picked London's OWN enclave as the outlying tile a
  departure would abandon. Fixed the same morning: enclave improvements are excluded from departure tiles
  (unit-tested, deployed, not yet watched).

Mod tests 11 to 14 (2026-09-13, `eep-modtest8.js`, logs `modtest8-yields-*` through `modtest12-closeup-*`,
captures in `shots/`): do the enclave's native yields reach the tile, and why did they not seem to?

- Plot yields read with `GameplayMap.getYields(plotIndex, localPlayerID)` (pairs of [yield type, amount]).
  Takeover path (London, AugustusExp66): a mine's 1/3/1/1 (food/production/science/happiness) became
  1/5/1/1 with the Roman "a" enclave, which carries +2 PRODUCTION natively (not culture). Empty-plot
  path (Washington): a bare plot's 2/1/1 (food/production/gold) became 2/3/1 within 6 s, city production
  60 to 63, and the same the next turn. The native yield reaches the tile on both paths.
- Why it looked broken: the marker's icon and label sat on the plot center, exactly where the yields
  layer draws its icon row (y 0, z 5), so the tile's yields were hidden behind the marker. Fixed by
  moving the icon to world y +14 and the label to y -12 (`emigration-enclave-markers.js`); the close-up
  `shots/modtest12-closeup-enclave-yields.png` shows the icon row between the laurel and the label.
- Village skin: a plain IMPROVEMENT_VILLAGE created on a mine plot kept the plot's 3 production and 1
  happiness (the Village carries no yield of its own), and no major civilization owned a Village or
  Encampment in any of the 76 met cities. The model itself could not be identified at the capture zoom.
- Camera: `Camera.lookAtPlot(loc, { zoom })` treats 1 as farthest; 0 to 0.2 frame a city.

Mod test 15 (2026-09-13, `eep-modtest9.js`, log `modtest13-village-UI.log`, captures
`shots/modtest13-village-*.png`): the Village-skinned enclave (`enclaveTileSkin` 1), AugustusExp66.

- Empty-plot path (Washington): a rural district then IMPROVEMENT_VILLAGE; the plot went from 2 food /
  1 production / 1 gold to the same plus 2 CULTURE within 7 s and read the same the next turn. So the
  data modifier (COLLECTION_SINGLE_PLOT_YIELDS + REQUIREMENT_PLOT_HAS_CONSTRUCTIBLE + REQUIREMENT_PLAYER_IS_MAJOR,
  attached through ConstructibleModifiers) loads and applies to a Village inside a major's city.
- Takeover path (London): the outlying mine became a Village, 1/3/1/1 plus 2 Culture. The next turn the
  plot read WONDER_EL_ESCORIAL: the city's wonder in progress was targeting that plot and completed over
  the Village. A wonder or building placed by the city can displace an enclave tile; the record then reads
  "not standing" and the treasury grant resumes, as designed for pillage and razing.
- The quarter record keeps `enclave` (the enclave improvement type) beside the placed Village type, and
  the marker module draws the civ symbol and "<Civ> Enclave" label from the record.
- The departure tile list for London no longer contains the Village.

Mod test 16 (2026-09-13, `eep-modtest10.js`, log `modtest14-uniques-UI.log`, captures
`shots/modtest14-uniques-*.png`): can other civilizations' unique improvements be enclave tiles?
AugustusExp66 (Exploration, the player is Mongolia), each placed by DESTROY + CREATE on an outlying tile.

- Foreign, trait-locked, on-age: Goryeo's Gama in London (human) LANDED, plot culture +3; in Paris (AI)
  LANDED, culture +3 (over a Souq). Mongolia's Ortoo in Paris LANDED, gold +5. Songhai's Caravanserai
  (Washington) +5 gold, Bulgaria's Hidden Fortress (hill) +4 production, Iceland's Thing +4 happiness
  (plus adjacency), Shawnee's Mawaskawe Skote +4 food. All stood two turns later with the same yields,
  the AI's included. So the native yield rows apply for a foreign owner, and the trait lock is a
  buildability rule only.
- A future age's type is NOT loaded: the Mughal Stepwell (Modern) had no GameInfo row in Exploration.
  Antiquity types are loaded in Exploration (the Hawelt row exists; its placement needed a flat tile
  London did not have free).
- Terrain rules bind: Ortoo, Hawelt, Baray, Megalith, Tea House are flat-only; Hidden Fortress, Hillfort,
  Terrace Farm hill-only (Constructible_ValidTerrains).
- London's Gama on plot 2874 was displaced by El Escorial (the wonder in progress) the next turn, as the
  Village was in mod test 15: the city's own wonder claims that plot.
- Discovery improvements (Cairn, Campfire, Plaza, Tents, Ruins) are RemoveOnEntry and unusable as skins;
  Village, Encampment, Hillfort, Megalith are independent-power types with art and no owner lock.
- The run's DONE line was missed by the runner's pattern (single-digit test numbers); fixed.

Mod test 17 (2026-09-13, `eep-modtest11.js`, log `modtest15-themed-UI.log`, captures
`shots/modtest15-themed-*.png`): the SHIPPED themed placement (`enclaveTileSkin` 1) on AugustusExp66.

- Goryeo: its own Gama (London, takeover), culture +3. Rome (no unique; stance a = production): the
  Hidden Fortress on a hill in Washington, production 2 to 6. Mughal (Stepwell is Modern, not loaded):
  the culture fallback, a Gama. Abbasid (stance a = science, no skin): stance b's happiness skin, a Thing,
  happiness +4. Aksum: its Antiquity Hawelt placed in Exploration (flat plot), gold +2 plus adjacency.
- Every placed plot was absent from that city's departure-tile list (record-based exclusion), the five
  quarter records read back with their enclave types, and all but London's stood two turns later with the
  same yields. London's plot 2874 was again taken by El Escorial, the wonder London is building.
- Goryeo is not in the stance registry, so its marker fell back to the raw type ("GORYEO A ENCLAVE") with
  no symbol; fixed in mod test 18 (civilization name from LOC_CIVILIZATION_<CIV>_NAME, civ icon fallback).

Mod test 18 (2026-09-13, `eep-modtest11.js` again, captures `shots/modtest16-marker-size-*.png`): the
marker at 60% symbol scale and label size 3.5, offsets 11 / -9; Goryeo now reads "GORYEO ENCLAVE" under
its civilization symbol (LOC_CIVILIZATION_<CIV>_NAME + the civ icon as fallbacks for civilizations outside
the stance registry). Same placements as mod test 17, same outcomes.

Mod tests 19 to 21 (2026-09-13, `eep-modtest12.js`, logs `modtest17-builtover-*` through
`modtest20-builtover-realpid-*`): an enclave BUILT OVER is destroyed, and a native crash isolated.

- London completes El Escorial on plot 2874 at turn 67, over whatever stands there. Test 19 (first
  rule): the record was "cleared" instead of destroyed because the mod's per-turn pass never saw the tile
  standing before the wonder replaced it. Rule changed: an OCCUPIED plot counts as built over whether or
  not the tile was ever seen; only an EMPTY plot means the placement never landed.
- Tests 20 and 21 (second rule) CRASHED natively at turn 67, twice, identically: EXC_BAD_ACCESS
  (KERN_INVALID_ADDRESS 0x100000377) on the AppHost application thread, cohtml/v8 frames beneath the
  game's (`crash-2026-09-13-070059.ips`, `crash-2026-09-13-070314.ips`). The probe's record used origin
  player id 99, a player that does not exist; the built-over branch chronicled the loss, and the naming
  path called `Game.IndependentPowers.independentName(99)`. The engine logged "lookup requires key to be
  of type 'number' or 'string'" one line earlier.
- Test 22 with a real origin id (player 4): no crash; the record was DROPPED at turn+1 and the chronicle
  held one "built over" entry, stable through turn+3. Hardened: `independentName` now returns null for
  any id `Players.get` does not know, so no record can reach that engine call (tests/naming.mjs).

Mod tests 23 and 24 (2026-09-13, `eep-modtest13.js`, logs `modtest21-autorecognize-*` and
`modtest22-autorecognize-seeded-*`, capture `shots/modtest22-autorecognize-seeded-ai-enclave.png`):
AUTOMATIC recognition everywhere (`quarterRecognition` 2) through the shipped `maybeQuarter`, force on.

- Test 23, the save as is: no records formed in two passes and two turns. AugustusExp66 was never played
  with the mod, so no city holds a foreign community; the gates held (nothing forms from nothing).
- Test 24, seeded: Chola migrants (player 8, from Pataliputra) written into Paris (Norman, AI) and London
  at 45% of each city's population through `recordCompositionPass` with synthetic migration records
  (composition read back 68/32). ONE pass then formed BOTH enclaves with no pop-up: Chola's stance a is
  gold, so each became a Caravanserai (Paris plot 4885, London plot 2874), both standing, two "An Enclave
  Takes Root" chronicle entries. London's tile was built over by El Escorial at turn 67 and its record
  destroyed by the per-turn upkeep; Paris's stood through turn 68 with `stood` set. No crash.
- So AI cities host enclaves under automatic recognition, the same placement and upkeep applying to them.

Mod test 25 (2026-09-13, `eep-modtest13.js`, log `modtest23-autorecognize-fixed-*`): the same seeded run
after two fixes found in test 24's turn-68 pass (a re-formed London enclave was placed on a fishing-boat
plot, and the same pass's upkeep dropped the brand-new record as "built over" because the replaced tile
had not yet vanished). Now: both enclaves formed in one pass; London's record survived the turn-67 pass
(placement grace) and was destroyed at turn 68 once El Escorial stood there; Paris's stood throughout with
`stood` set; skin plots are land only. No crash.

Mod tests 26 to 28 (2026-09-13, `eep-modtest14.js`, logs `modtest24-compensation-*` through
`modtest26-compensation-takeover-*`): takeover compensation (base + replaced improvement + enclave).

- Tests 26 and 27 placed on Washington's empty plot (no takeover, so no `before` and nothing to pay).
- Test 28 forced the takeover path (empty plots hidden from the placer): a woodcutter tile reading
  1 food / 4 production / 1 happiness became a Caravanserai reading 1 / 4 / 9 gold / 1. Nothing was lost,
  so the settled record carries no compensation, which is the correct outcome: in this game a basic
  improvement's food or production belongs to the terrain, feature, and warehouse bonuses, not to the
  improvement type, so replacing one keeps the plot's yields (the mine to Gama and mine to Village
  readings in mod tests 11 to 15 showed the same). What a takeover CAN lose is a warehouse bonus keyed to
  the replaced type (a granary's +1 food on farms, say); that is the case the compensation covers, and
  it is unit-tested (tests/enclave-place.mjs, tests/quarter.mjs) but was not exercisable on this save.

Balance model (2026-09-13): `EMIG_QUARTERS=1 node --loader ./tests/loader.mjs ./scripts/tile-transfer-stress.mjs`
runs composition + automatic recognition under the harness's own flows. In 200 peacetime turns and under
both disaster shapes no enclave formed: the largest single-origin foreign share of any city peaked at 0.14
(spikes) and 0.22 (sustained disaster, count-only model) against the 0.25 foothold and 0.30 established
bars, and integration drift (3% a turn) eroded it within ~20 turns. Enclaves need a concentrated inflow
from ONE origin (4+ points into a city of ~12 within the dwell window), i.e. a refugee crisis.

Mod tests 29 and 30 (2026-09-13, `eep-modtest15.js` / `eep-modtest16.js`, logs `modtest27-realflows-*`,
`modtest28-realflows-autoplay-*`): looking for REAL migration flows to judge enclave frequency.

- AugustusAnt136 holds no mod state (no tracked compositions, no flow records): like AugustusExp66 it
  was never played with the mod, so the saves on disk cannot answer the frequency question.
- 24 Antiquity + 80 Exploration turns of a single LONG Autoplay (setTurns(80)) with the mod active produced
  ZERO migrations and never seeded the composition ledger in Antiquity: the mod's pass runs on the local
  player's turn activation, which a multi-turn Autoplay does not raise between its turns. ONE-turn Autoplay
  (setTurns(1) each turn, as mod test 31 and the Cultural Diffusion session's run 5 used) does return
  control each turn, fires the activation, and runs the pass. So: measure with one-turn Autoplay or with
  script-ended turns, never with a long setTurns.

Mod test 31 (2026-09-13, `eep-modtest17.js`, log `modtest30-realflows-manual-*`): the mod's pass RUNNING
for 40 real turns on AugustusExp66 (turns 66 to 106; every turn ended by hand, each through the one-turn
Autoplay fallback because the human's end-turn was blocked, which still activates the local turn and runs
the pass). Automatic recognition everywhere, themed placement on, defaults (share 0.30, stock 3, dwell 8,
integration 0.03).

- Foreign communities are common: 19 of 84 settlements carried a foreign minority by turn 106; 3 to 4 sat
  at the foothold bar and 1 to 3 at the established bar at each snapshot. The largest: 13.1 Mongol points
  in Ming's Duisburg (41% of 32) at turn 81; 4 to 5 points at 31% to 45% in several 9 to 16 pop cities.
- Enclaves formed: 3 in 40 turns, all in AI cities and none for the human: two Mongol enclaves (Ortoo
  tiles) hosted by Ming and Chola around turn 86, and a Chola caravanserai in a Ming city by turn 96;
  the same three stood at turn 106. Rostov on Don (2 pop, 100% foreign, stock 2) correctly stayed below
  the stock floor.
- So at default thresholds the world sees roughly one enclave per 13 turns, with a few settlements
  hovering at the bar at any time. (The probe's `flowTotal` read the wrong API and reads 0; ignore it.)

Mod tests 32 and 33 (2026-09-13, `eep-modtest18.js`, logs `modtest31-fade-*`, `modtest32-fade-*`): enclaves
FADE, and the absolute-stock qualifier. AugustusExp66, automatic recognition, force on, seeded communities.

- Stock path: Paris (Norman, AI) seeded to 7.0 Chola points at 19% of the city, BELOW the 25% foothold,
  formed an enclave on the first pass through the six-point qualifier (a caravanserai over a woodcutter).
  Share path: Washington at 31% formed one too. (Test 32's Paris seed reconciled to 5.7 points and
  correctly did NOT form: the qualifier is a real bar.)
- Both communities then returned home (removed from the ledger: both cities read 100% native) with the
  fade period set to 2 turns. Both records survived the first turn below the bar (clock counting) and were
  dissolved on the second: both plots read EMPTY (tiles removed by DESTROY_ELEMENT), both records dropped,
  two "The Enclave Fades" chronicle entries. No crash.
- Test 32 (London) also showed the fade firing on a plot El Escorial had already taken: the record went
  with a fade entry rather than a built-over one because the fade check runs first in the upkeep.

Mod test 34 (2026-09-13, `eep-modtest18.js`, log `modtest33-scaledbar-*`): the stock bar SCALED to city
size. On AugustusExp66 the tracked settlements average about 14 people, so the six-point bar read 4.6 live
(6 x 14/18). Paris, seeded to 5.7 Chola points at 16% of the city (below the 25% foothold), formed its
enclave through the size path on the first pass; Washington at 31% formed through the share path. Both
communities then left and both enclaves faded on the second turn below the bars (plots empty, records
dropped, two "The Enclave Fades" entries). The user clicked in the game during this run; the sequence was
unaffected. No crash.

Mod test 35 (2026-09-14, `eep-modtest19.js`, log `modtest35-bannerbar-UI.log`, shots
`modtest35-bannerbar-banner-bar-{near,mid}.png`): the banner pressure bar. AugustusExp66, human control,
no turn ended. `Controls.decorate("city-banner", ...)` mounted a bar on all 89 banners the map had built
(all hidden with no pressure set). With London set to 0.9, Washington to 0.72, and Lahaina to 0.3 of the
move bar and the module refreshed, London painted at 90% and Lahaina stayed hidden (below the 0.66 cue
fraction). Watched in the near and mid screenshots: a two-pixel line under the banner's name row, beside
the status icons, legible and unobtrusive at both zoom levels. Two findings fixed after the run: London's
bar was green (its dominant cause was prosperity; the bar now follows the notifications' own-loss color
rule and is never green), and eight other cities read full amber because any non-zero distress counted as
a crisis (the full bar now requires a refugee cause: war, disaster, conquest). The corrected rules are
covered by `tests/banner-pressure.mjs`; the color and crisis changes were not re-watched in game. No
crash; the runner restored the registry and removed the probe.

Mod tests 36 to 38 (2026-09-14, `eep-modtest20.js`, `eep-modtest21.js`, `eep-modtest22.js`, logs
`modtest36-damage-*`, `modtest37-damage2-*`, `modtest38-halfbuilt-*`): can the mod DAMAGE (pillage) a
constructible instead of destroying it (plan 8.2a)? AugustusExp66, human control, no turn ended. Verdict:
no, from script.

- Every operation enum was read live: 67 `PlayerOperationTypes`, 4 `CityOperationTypes`, 13
  `CityCommandTypes`, 75 `UnitOperationTypes`, 33 `UnitCommandTypes`. Only `CREATE_ELEMENT` and
  `DESTROY_ELEMENT` touch elements; nothing is damage-, pillage-, or repair-shaped on the player or city
  side. `Game.PlayerOperations`, `CityOperations`, and `UnitOperations` expose only `canStart`,
  `sendRequest` (and `canStartQuery` / `canStartAny`).
- A constructible instance exposes `damaged`, `complete`, and a `setProperty` method. `setProperty` with
  "damaged", "Damaged", "DAMAGED", and "pillaged" returned null and changed nothing: it is script-side
  metadata, not engine state.
- Unit pillage on an OWN tile is refused: a knight created with `CREATE_ELEMENT {Kind:"UNIT"}` directly on
  London's mine got `canStart(UNITOPERATION_PILLAGE)` = false, and false again against the city-center
  building plot. (The first attempt used a unit at -9999,-9999, an off-map trebuchet; discard that read.)
  `UNITOPERATION_TELEPORT_TO` also answered false for that unit.
- The `Progress` argument of `CREATE_ELEMENT` (the tuner's) creates an INCOMPLETE constructible, but the
  city does not own it: after destroying the Gristmill and re-creating it at Progress 50, `canStart(BUILD,
  Gristmill)` answered Success with Plots and no `InProgress`, and sending the build queued a NEW
  Gristmill at progress 0 of 175 and placed a SECOND incomplete instance on the same plot. The half-built
  instance is an orphan the build system never continues. For an obsolete-age building (the Brickyard,
  which the urban leg takes first) the city cannot queue the type at all (`Success:false`).
- Side reads: destroying the Brickyard took urban 22 to 21 and pop 36 to 35 as before; the Gristmill's
  destroy did not change net production (172). The recurring "WorldUI is not defined" rejection in the
  errors file predates these runs (present since mod test 10) and is unrelated.

Mod test 39 (2026-09-14, `eep-modtest23.js`, log `modtest39-pacing-UI.log`, shot
`modtest39-pacing-readout-enclave.png`): per-age PACING of enclave formation, and the enclave-progress
surfaces. AugustusExp66, human control, automatic recognition, dwell 0, no turn ended.

- The engine's age progression read live: 41.2% into Exploration at turn 66. The manager's current-points
  read was overridable from script, so the run set progress to 70%: relax 0.400, the share bar read 0.180
  (plain 0.30), the size bar 2.76 (plain 4.60 at the ledger mean), the local host's counter 0.
- K1: Lahaina (pop 29) seeded with a Norman community of 4.1 points at 14%, under both plain bars and
  under the relaxed share bar, over the relaxed size bar. One pass formed the enclave (record 86,20,
  Norman). The counter read 1 and the relaxation 0.000 immediately after.
- K2: Washington seeded the same way (4.2 points, 13%) read stage none against the restored plain bars
  and did not form.
- K3: with the counter pushed to 3 (the cap), London seeded to 37% share and 13.2 points did not form; with
  `quarterCapPerAge` 0 the next pass formed it (record 92,32). The cap gates automatic recognition.
- K4: the readout snapshot's `enclave` field carried civ, share, live bars, stock, stage, and a null dwell
  (dwell 0) for all three cities; the dashboard's Diversity cells read "Norman enclave" for the two hosts
  and "" for Washington (below foothold). Watched on screen: the Washington readout panel with the line
  "Enclave: Norman at 13% of 30% share, 4.1 of 4.6 people". No crash; folder restored.
- Incidental: the same panel's "Why there" line read "greater prosperityandproximity", a missing
  separator that predates this work (fixed the same morning, see the changelog).

Mod test 40 (2026-09-14, `eep-modtest24.js`, log `modtest40-deadplots-UI.log`, shot
`modtest40-deadplots-dead-plot-fixed.png`): DEAD RURAL PLOTS after a departure. User report: "a tile removed
by migration can never be repaired or re-placed; noticed in towns". Save AugustusAnt43, the user's own game
at turn 43 on a Large map (96 wide), human control, no turn ended. Verdict: confirmed, and the fix watched.

- All 11 rural plots the mod abandoned that session (a 12th had since become Dur-Sharrukin) were an EMPTY
  `DISTRICT_RURAL`: the district survives `DESTROY_ELEMENT {Kind:"CONSTRUCTIBLE"}` with no constructible on
  it. None was in its settlement's `Game.CityCommands.canStart(EXPAND).Plots`, the list the place-population
  dialog offers. Nothing is damaged, so there is nothing to repair either. The plot is dead for good.
- Scope in that game: 10 empty rural districts, 1 in the player's town Birmingham (the volcano farm at
  28,18) and 9 in AI cities (Thang Long 5, Chang'an 3, Paris 1). Every one came from a departure.
- Fix: `DESTROY_ELEMENT {Kind:"DISTRICT", Owner, LocalID}` (the tuner's form, ids from
  `Districts.getIdAtLocation`) on the empty district. Birmingham's plot went straight into its EXPAND list;
  population and ownership unchanged. It also removed the district on AI-owned Paris (not offered there
  only because Paris had no growth pending: its EXPAND list was empty for every plot).
- Full cycle on a fresh tile: the shipped `abandonTileOrDecrement` took Birmingham's camp at 26,18 (pop 3
  to 2), leaving an empty district not offered; destroying the district made it offered; a +1 rural point
  and `EXPAND` onto that exact plot placed a new district and IMPROVEMENT_CAMP (pop 2 to 3).
- The runner now restores each registry row's own Disabled flag instead of forcing the mod off.

Mod test 41 (2026-09-14, `eep-modtest25.js`, log `modtest41-shippedfix-UI.log`, shot
`modtest41-shippedfix-shipped-fix-replaced.png`): the SHIPPED dead-plot fix (`ui/emigration-plot-cleanup.js`)
on AugustusAnt43, human control, no turn ended.

- Departure path: the shipped `abandonTileOrDecrement` took London's mine at 26,13 (pop 12 to 11). At 0.8 s the
  plot was an empty rural district; after the 2 s cleanup the mod logged "empty rural district cleared at plot
  1274" and the plot had no district. A +1 rural point and EXPAND onto that plot then placed a new mine.
- Enclave-removal path: the shipped `destroyPlacedTile` on London's mine at 26,15 left an empty district at
  0.8 s; the cleanup removed it ("cleared at plot 1466").
- Gap found: the 11 empty rural districts already in the save (10 on land, 1 on the water plot of an
  abandoned fishing boat) were still there after load. The sweep hangs on the local `PlayerTurnActivated`,
  which does not fire when a save is loaded mid-turn, so a damaged save stayed damaged until the next turn.

Mod test 42 (2026-09-14, `eep-modtest26.js`, log `modtest42-loadsweep-UI.log`): the LOAD-TIME sweep
(`sweepOnceGameStarts`). AugustusAnt43, no turn ended. At game start the save held 11 empty rural districts
(Birmingham 1, Paris 1, Chang'an 4, Thang Long 5). The mod logged "empty rural district cleared" for all 11
plots and "sweep cleared 11 empty rural districts" a few seconds after the loading state reached GameStarted;
eight seconds later the count was 0. `LoadComplete` has never fired for the mod's scripts in any logged
session, so the sweep polls `UI.getGameLoadingState()` instead. Registry restored with the local copy enabled.

Mod tests 43 and 44 (2026-09-14, `eep-modtest27.js`, `eep-modtest28.js`, logs `modtest43-choose-*`,
`modtest44-towns-*`, shots `modtest43-choose-choose-open-{TOWN,CITY}.png`): the arrivals pop-up's "Choose where
they settle" on AugustusAnt49. Reported as not working; the player later found they had taken the arrivals
pop-up for an enclave. Verdict: works in towns and cities.

- The shipped `arriveRural` in ask mode raised the real pop-up in Bristol (town), Birmingham (town) and London
  (city): pending 0 to 1, `Growth.isReadyToPlacePopulation` true, 10 to 12 EXPAND plots. Clicking the button
  through the DOM entered `INTERFACEMODE_ACQUIRE_TILE`, and the mode stayed for the full 12 s watched in
  Birmingham and London, with no DistrictAddedToMap and no self-exit. The engine never settles a pending point
  on its own: with no click, London held pending 1 for 12 s.
- The player was using the probe's game window during test 44: Bristol's point was placed by hand inside the
  opened view (districts added at 1.4 s and 4.3 s, pending 2 to 0, the mode then exited normally), Birmingham's
  no-click wait ended in a hand placement at 9.4 s, and a pause menu opened later. Those readings are player
  input, not engine behavior, and they confirm placement works from the view in a town.
- Test 43's town screenshot showed the plain map while the mode read ACQUIRE_TILE; given test 44 this was a
  capture taken before the view drew, not a failure. The base new-population notification opens the same mode
  (`UI.Player.lookAtID`, then `switchTo` with `CityID`) and handles towns exactly like cities.
- `console.log` never reaches UI.log, so the game's own "UIInterfaceMode: from X to Y" lines are invisible;
  read `InterfaceMode.getCurrent()` instead.

Mod tests 45 to 47 (2026-09-14, `eep-modtest29.js` to `eep-modtest31.js`, logs `modtest45-popups-*`,
`modtest46-popups-after-*`): the three decision pop-ups (arrivals, refugee decision, enclave decision). User
report: they look "bootleg", with odd spacing, visual conflicts, and jitter, and the arrivals pop-up was
mistaken for the enclave one. AugustusAnt49, no turn ended.

- Before (test 45, with screenshots): the dialog used `createDialog_MultiOption` without a layout. With more
  than two options the base screen stacks the buttons in an `fxs-button-group` with the `multi-button-container`
  column class, sizes each button to its own label (arrivals 363, 342, 207 px; enclave 330, 293, 215 px), gives
  all but the last an `mr-4` meant for a row (so the stack is staggered), leaves no vertical gap, and resizes the
  buttons in a second layout pass. The frame first drew about 4 percent smaller and 13 px higher and settled at
  50 ms (the base `animate-in-top` plus the resize). No category label anywhere; the refugee costs were plain
  centered lines run straight after the story. The enclave screenshot missed its dialog (captured after the
  dismissal: the runner only polls for SHOT lines every 4 s).
- Fix shipped: `layout: "vertical"` (a plain `flex flex-col` with `mb-2` buttons and no resize pass), a bold
  upper-cased category line with its icon opening every body (Newcomers `YIELD_POPULATION`, Refugees
  `YIELD_DIPLOMACY`, Cultural Enclave `CITY_UNIQUE_QUARTER`), and the refugee costs as their own paragraph with
  yield icons. The arrivals body in test 46 rendered the category line as a real `fxs-font-icon` image followed
  by bold NEWCOMERS, confirming the tokens work in the native dialog.
- Tests 46 and 47 are NOT valid visual checks. Test 46's probe still looked for buttons under
  `fxs-button-group`, which the vertical layout no longer uses, so it could not dismiss the arrivals pop-up and
  re-measured it three times. Its screenshots captured the player's own desktop, not the game: `osascript
  activate` does not bring the game forward while the player is using the Mac. Those captures were deleted
  unread beyond noticing they were not the game. Test 47 was stopped before any capture to stop pulling the game
  in front of the player's work. The redesign's layout is therefore unit-tested and structurally confirmed, not
  yet watched.

Mod test 48 (2026-09-14, `eep-modtest31.js`, log `modtest48-popups-visual-UI.log`): the redesigned pop-ups
measured, with the button selector fixed. AugustusAnt49, no turn ended, the player away from the Mac.

- All three buttons in every pop-up now share one width and one left edge, with an even 48 to 49 px pitch:
  Newcomers 481 px at x 1200, Refugees 573 px at x 1153, Cultural Enclave 558 px at x 1161 (before: 363 / 342 /
  207 px, staggered, touching). Each body opens with its own `fxs-font-icon` and bold category (NEWCOMERS with
  YIELD_POPULATION, REFUGEES with YIELD_DIPLOMACY, CULTURAL ENCLAVE with CITY_UNIQUE_QUARTER). All three dismissed
  through their own buttons. The only movement left is the base entrance animation, settled by 100 ms (4 percent
  on the small Newcomers frame, under 1 percent on the larger two).
- The screenshots were blank: the window-id helper picked the app's 3024x74 menu-bar window, which is wider
  than the game window. The helper now requires height > 600 and the runner takes the tallest match.

Mod test 49 (2026-09-14, `eep-modtest31.js`, log `modtest49-popups-visual2-UI.log`): the same measurement with
the height filter. The layout numbers matched mod test 48 (Newcomers 461 px body and buttons, Refugees 570 px),
and all three pop-ups dismissed through their own buttons. No screenshots: no game window was listed at all, so
the runner skipped each capture. The runner now activates the game and captures the full screen only after
System Events confirms the game is frontmost, and skips the capture otherwise.

Mod test 50 (2026-09-14, `eep-modtest31.js`, log `modtest50-popups-visual3-UI.log`): the first screenshots of
the redesigned pop-ups, captured with the game verified frontmost. Watched: the category line with its icon at
the top of each body, the refugee costs on their own lines with yield icons, and equal-width stacked buttons.
Also watched: an empty `[N][N]` paragraph collapses, so the body's paragraphs ran together.

Mod test 51 (2026-09-14, `eep-modtest31.js`, log `modtest51-popups-spacing-UI.log`): paragraphs joined by
`[N]`, a no-break space, `[N]`. Watched: a visible blank line between the category line, the prose, the costs,
and the quote. The bodies grew by that spacing alone (Newcomers 90 to 112 px, Refugees 208 to 254 px).

Mod test 52 (2026-09-14, `eep-modtest31.js`, log `modtest52-popups-quote-UI.log`): the enclave quote moved out
of the body into a `screen-dialog-box` decorator block: the base `filigree-divider-h3`, then an
`fxs-inner-frame` with `img-popup-middle-decor`, the quote in `font-style: italic`, and the attribution below.
Watched: the divider, the frame, and the attribution drew; the quote line did not. The user saw the same thing.

Mod test 53 (2026-09-14, `eep-modtest32.js`, log `modtest53-italic-UI.log`): why the quote vanished.
Hypothesis: GameFace has no italic face, so `font-style: italic` blanks the line. Measured on the live dialog:

| Quote line style | Rect (w x h) | Frame (w x h) |
| --- | --- | --- |
| `font-style: italic` | 0 x 0 | 529 x 50 |
| `font-style: normal` | 1012 x 23 | 1041 x 73 |
| normal plus `transform: skewX(-8deg)` | 1016 x 23 | 1041 x 73 |

- The hypothesis held: italic collapses the line to nothing; the same text upright draws. The font family is
  `BodyFont` with no italic variant. The attribution, upright, drew at 407 x 21.
- The skewed line was watched in the screenshot and reads as italics.
- Second defect: unwrapped, the 125-character quote is one row that stretched the frame to twice the body's
  width. The shipped fix wraps the quote at the body's 64 characters, one element per row, each skewed.

Mod test 54 (2026-09-14, `eep-modtest31.js`, screenshots `shots/modtest54-quote-fixed-popup-*.png`): the
shipped fix, all three pop-ups raised through shipped code on AugustusAnt49. Watched in the enclave screenshot:
the filigree divider under the prose, then the framed quote on two slanted rows reading as italics, then the
attribution upright beneath. The dialog frame measured 629 px wide, the same as the refugee pop-up, so the quote
no longer widens it. The frame held its size from 0 to 1500 ms.

Mod test 55 (2026-09-14, `eep-modtest55.js`, logs `modtest55-specialist-swap-UI.log` and
`modtest55b-specialist-swap-UI.log`, AugustusAnt136, London 24 pop / 9 rural / 13 urban / 2 specialists):
does `ASSIGN_WORKER Amount:-1` leave a population point waiting to be placed, so a specialist can be swapped
for a destroyed-and-re-placed rural tile? Disproof: `Growth.isReadyToPlacePopulation` stays false and
`canStart(EXPAND)` offers no plots after the un-assign.

- Run 1 sent the op on a plot `GetAllPlacementInfo` lists as holding a specialist (3258, 1 of 1). `canStart`
  answered false; nothing changed after 8 s or after one ended turn.
- Run 2 used the shipped `unassignSpecialist` selection (first purchased plot `canStart` accepts). Accepted: 7
  plots, all with a free slot (0 of 1): Palace, Monument, Brickyard, Library, Academy, Harbor, Lighthouse. Both
  real specialist plots were refused. `canStart` ignores the sign of `Amount` and answers as a placement check.
- Sent on the Palace plot: `getNumWorkers(false)` 2 to 1, but both specialist slots still read 1 of 1, pop
  stayed 24, rural + urban + specialists read 23 (a gap of 1), turns to grow moved 8 to 7. Unchanged after one
  ended turn. `isReadyToPlacePopulation` false and zero EXPAND plots throughout.
- Verdict: the hypothesis failed, and the run 6 reading ("removes a specialist") was wrong. The op lowers the
  city's worker counter without emptying a slot or freeing a point: a desync, not a removal. No specialist
  removal exists from script; only `DESTROY_ELEMENT` on a constructible removes a person cleanly. The swap was
  not attempted.

Mod test 56 (2026-09-15, `eep-modtest56.js` with the shell script `eep-shell-speed.js`, logs
`modtest56-speed-{online,quick,standard,epic,marathon}-*`): game-speed scaling in game at every speed. Each run
starts a NEW game: the shell script resets the configuration to single player, sets the setup parameter with
`GameSetup.setGameParameterValue("GameSpeeds", "GAMESPEED_X")`, and calls `engine.call("startGame")`. The game
script resets CONFIG to its defaults, reads the speed three ways, checks the mod's scalar and transforms, and ends
6 turns. Runner: `SHELL_SRC=eep-shell-speed.js SPEED=X zsh run-probe.sh eep-modtest56.js none <label>`.

| Speed | CostMultiplier | Mod S | `EconomicRules.adjustForGameSpeed(100)` | Cooldown / transit / dwell turns | Passes |
| --- | --- | --- | --- | --- | --- |
| Online | 50 | 0.5 | 50 | 8→4 / 4→2 / 8→4 | 6 over 6 turns |
| Quick | 67 | 0.67 | 67 | 8→5 / 4→3 / 8→5 | 6 over 6 turns |
| Standard | 100 | 1 | 100 | 8 / 4 / 8 | 5 over 5 turns |
| Epic | 150 | 1.5 | 150 | 8→12 / 4→6 / 8→12 | 5 over 5 turns |
| Marathon | 300 | 3 | 300 | 8→24 / 4→12 / 8→24 | 6 over 6 turns |

- At every speed the mod's scalar equals CostMultiplier / 100 and the engine's own speed adjustment, and all five
  transforms (`speedTurns`, `speedBar`, `speedDecay`, `speedShock`, the scalar) return the expected values. The pass
  ran once on every turn that advanced (on Standard and Epic one of the six activations did not advance the turn).
  No emigration errors.
- Not covered: equal game-time outcomes in a developed game at each speed. A new game has no migration in six turns,
  and no save exists at a non-Standard speed. That property stays unit-tested.

Mod tests 57 and 58 (2026-09-15, `eep-modtest57.js` and its control `eep-modtest58.js`, logs `modtest57-scale-mod-*`,
`modtest58-scale-control-*`): every layer on, at scale. AugustusExp66, CONFIG at its defaults, script-ended turns with
the one-turn Autoplay fallback. The control runs the identical loop with the pass off (`turnInterval` 99999). Both
runs went from Exploration turn 66 through the age transition to the end of the game at Modern turn 68, about 131
turns each; the probe re-attaches after the transition and reports each age separately.

- Run 1 of test 57 stalled on the shipped "Ask me" arrival pop-ups until the user clicked about 20 by hand, and was
  discarded. The rerun answers dialogs itself (arrivals "Let the city settle them", refugees "Welcome them in"): 72
  "Newcomers" pop-ups for the human civilization in 131 turns; no refugee decision fired.
- Stability: no crash report, no emigration error, and the pass ran on every turn in both ages. Base-game
  `army-commander-flags.js` errors appear in both runs alike.
- Pass time over 136 passes at 76 to 113 settlements: 329 ms minimum, 622 median, 1264 at the 90th percentile, 1623
  maximum; 10.3 migrations per pass on average, 30 at most.
- Flows: 60 Exploration turns gave 141 voluntary and 125 crisis moves. 68 Modern turns gave 266 voluntary, 156 crisis,
  2 returns, 2 crisis deaths, 1 migrant lost to a razed destination, 6 turned away by a full city; 102 refugees
  entered resettlement and 81 settled. Enclaves: 2 formed in Exploration (one later gone), 3 standing at game end.
- Control contamination: after the transition the mod's pass ran once (21 crisis moves) before the control probe
  switched it off again.

| Measure | Mod | Control |
| --- | --- | --- |
| World population, end of Exploration (turn 126) | 1283 | 1296 |
| World population, game end | 1618 | 1630 |
| Settlements, game end | 113 | 114 |
| Largest civilization's share of world population, game end | 30.1% | 36.1% |
| Smallest settlement at any snapshot | 1 | 2 |
| Largest one-turn drop of any settlement (Modern) | 4 | 4 |
| Civilizations with a negative treasury, any snapshot | 0 | 0 |
| Refugees resettling, game end | 13 | 0 |

Population by civilization at game end, mod against control: player 0 (the human civilization, AI-played) 487 vs
588 (0.83); player 6 279 vs 216 (1.29); player 4 257 vs 197 (1.30); player 7 223 vs 205 (1.09); player 8 147 vs 151
(0.97); player 9 124 vs 136 (0.91); player 2 101 vs 137 (0.74). This is one paired run: the per-civilization gaps mix
the mod's redistribution with the AI's run-to-run divergence (settlement counts already differed by up to two per
civilization by the end of Exploration).

Mod test 59 (2026-09-15, `eep-modtest59.js`, log `modtest59-placement-prompt-*`): does the game prompt the player to
place a population point the mod adds? AugustusExp66, mod pass off, the raw write `city.addRuralPopulation(+1)` on
London and on the town Leeds. Both became a real pending placement at once (population +1, pending 1,
`Growth.isReadyToPlacePopulation` true, EXPAND offering 4 and 6 plots) and no `NOTIFICATION_NEW_POPULATION` appeared
within 12 s. The end turn never advanced (the "assign new resources" blocker held turn 66), so the next-turn check
did not happen; the run's `promptSeen=true` verdict counted the ready flag and overstates the result.

Mod test 60 (2026-09-15, `eep-modtest60.js`, log `modtest60-placement-prompt-turn-*`): the same write, across a real
turn. The run tries to clear the blocker the ways the base game does: 44 unassigned resources, all 44 refused by
`ASSIGN_RESOURCE` for every city; `CONSIDER_ASSIGN_RESOURCE {}` accepted; the `ASSIGN_NEW_RESOURCES` notifications
dismissed. The blocker still read the same type, but the second `sendTurnComplete` advanced the game from turn 66
to 67 with no Autoplay.

- London and Leeds after the turn: pending 1, `isReadyToPlacePopulation` true, EXPAND offering 4 and 6 plots, and no
  `NOTIFICATION_NEW_POPULATION`. The game neither placed the point nor raised that notification.
- Control: Philadelphia, one turn from natural growth, grew that turn into the identical state (population 16 to 17,
  pending 1, ready, 12 plots) and also showed no `NOTIFICATION_NEW_POPULATION` in `getIdsForPlayer` or in any
  `NotificationAdded` event (only `ASSIGN_NEW_RESOURCES` arrived).
- Verdict: a mod-added point is indistinguishable in engine state from natural growth and waits for the player
  across a turn. Whether the game shows the player a visible prompt is still unsettled: the probe did not see one
  for natural growth either, so the notification list cannot answer it. A screenshot of the notification train and
  both banners after the turn is the next test.

Mod test 58b (2026-09-15, `eep-modtest58.js` again, log `modtest58b-scale-control2-*`): a second control run, to
measure how much of the mod-versus-control gap in tests 57 and 58 is the AI's own run-to-run variation. All 16
snapshots (both ages, every ten turns, and the summary) are identical to control run 1: world population,
settlements, every civilization's population and treasury, the largest one-turn drop (Gangaikonda Cholapuram, turn
55). The game is deterministic from the same save with the same inputs, so every gap between tests 57 and 58 is
caused by the mod, directly or through the AI decisions it changes. One paired run measures the mod's effect.

Mod test 61 (2026-09-15, `eep-modtest61.js`, captures `shots/modtest61-*`): mod test 60 with screenshots. The
turn-advance result repeated (turn 67, both written settlements still pending, no `NOTIFICATION_NEW_POPULATION`).
The two pre-turn shots were taken just after the write: London's banner reads 37 / 32 with no placement marker, and
the notification stack holds three icons, none for population. Both turn-67 shots show only an AI peace-deal
proposal covering the map, so the natural-growth comparison was not captured.

Mod tests 62 and 63 (2026-09-15, `eep-modtest62.js`, `eep-modtest63.js`, captures `shots/modtest62-*`,
`shots/modtest63-*`): the screenshots again, with a real pre-write shot and turn-start screens closed first. Test 62
pressed the peace deal's close button, which only raised "Close peace deal proposal? OK / Cancel", so its turn-67
shots were covered again. Test 63 took Reject and captured the map. After the write on turn 66 the end-turn button read
"CHOOSE PRODUCTION" and London's banner 37 / 32; on turn 67 the button read "GROW CITY". No banner showed a marker.

Correction to mod tests 59 to 63: they named notifications with `Game.Notifications.getTypeName(id)`. The base game
passes the TYPE (`getTypeName(notification.Type)`); given the id it returns a wrong name, and the probes read every
notification as ASSIGN_NEW_RESOURCES. Their "no NOTIFICATION_NEW_POPULATION" and "assign new resources blocker"
readings are void.

Mod test 64 (2026-09-15, `eep-modtest64.js`, log `modtest64-placement-prompt-types-*`): mod test 60 with the types
read correctly, plus each notification's message and target. On turn 66 the real blocker was London's
NOTIFICATION_CHOOSE_CITY_PRODUCTION, and no NOTIFICATION_NEW_POPULATION appeared after the write. On turn 67 there was
exactly one NOTIFICATION_NEW_POPULATION, message "Grow City", blocking the turn, with no city target (the base handler
opens the first city whose `isReadyToPlacePopulation` is true). London and Leeds (written) and Philadelphia (natural
growth) were all ready, so this one notification cannot say which triggered it.

Mod test 65 (2026-09-15, `eep-modtest65.js`, log `modtest65-placement-prompt-attribution-*`): attribution. On turn
67 the run placed Philadelphia's natural point with EXPAND (pending 1 to 0, ready false), leaving only the mod-written
London and Leeds ready. The NOTIFICATION_NEW_POPULATION "Grow City" stayed, now the end-turn blocker, and
`sendTurnComplete` did not advance the turn in 40 s. A point the mod adds keeps the game's own blocking "Grow City"
prompt up until the player places it.

Mod test 66 (2026-09-15, `eep-modtest66.js`, log `modtest66-placement-prompt-isolation-*`): could the prompt be
created by mod-added points alone, with no natural growth that turn? The Grow City notification cannot be dismissed
(`canUserDismissNotification` false), and four end-turn attempts over 160 s stayed on turn 67, blocked by it, with only
London and Leeds ready. Four settlements were also due to grow naturally on turn 68. Not isolated.

What mod tests 59 to 66 establish together:

- On the turn the mod adds a point, the game raises no prompt and does not block the turn: turn 66 advanced to 67 with
  London and Leeds pending and no NOTIFICATION_NEW_POPULATION present.
- From the next turn, whenever a settlement has a point waiting, the game shows its own "Grow City" notification. It
  blocks the end of turn, cannot be dismissed, and stays until the point is placed. Mod-added points alone keep it up.
- Resolved by mod test 67: mod-added points alone create it.

Mod test 67 (2026-09-15, `eep-modtest67.js`, log `modtest67-placement-prompt-clean-turn-*`): is Grow City created by
mod-added points alone? AugustusExp66, mod pass off, notification types read correctly. The run advanced with
one-turn Autoplay from turn 66 until a turn started with no settlement ready to place, none growing next turn, and no
Grow City notification: turn 80. On turn 80 it wrote +1 to London and Leeds. The first manual end turn was held with
NOTIFICATION_NEW_POPULATION as the blocker; the second advanced. On turn 81: one Grow City notification, blocking,
with London and Leeds the only ready settlements and no settlement grown naturally. Verdict: the game raises its own
blocking Grow City prompt for points the mod adds, with no natural growth involved.

Mod test 68 (2026-09-15, `eep-modtest68.js`, session watch): arrival pop-ups by type, put down roots, the game seed.
With the shipped defaults a migrant and a returnee were placed with no dialog; a refugee raised the Newcomers pop-up,
and "Let the city settle them" placed it. The "Later" note shows as the button's tooltip. A host with a standing
enclave of the returning origin rolled returns at 0.015 against 0.06 elsewhere, and the base City Details panel showed
the "Put down roots" line. `Configuration.getGame().gameSeed` read -942756747. The watch also found two defects, both
fixed since: the return roll (FNV-1a without a final mix rolled almost the same value on consecutive turns, so London
never returned; fixed with the fmix32 finalizer) and the city readout not opening on selection (`findSignal` did not
accept the ComponentID that CitySelectionChanged carries).

Mod test 69 (2026-09-15, `eep-modtest57.js` with the tuned defaults, log `modtest69-scale-tuned-*`): the advanced layers
at scale after tuning (poachBlock 18, crisisEscapeBonus 7, small-civilization brake 12). AugustusExp66, 80 script-ended
turns through the age transition, compared snapshot by snapshot with the no-mod control (mod test 58, deterministic:
a second control matched it in all 16 snapshots). No mod errors. Exploration: civ 7 ran 1.19 to 1.36 of its control
population and civ 2 0.82 to 0.85 (before tuning 1.52 and 0.73). Game end (Modern turn 68): civ 2 1.01 (before 0.74),
civ 4 1.31, civ 8 0.76; worst civ 31% off, the largest civ's share 32.1% against 36.1%. One return occurred. The
pass log showed the mechanism: a volcano in civ 2 started a refugee wave and civ 7 received nearly every cross-civ
refugee for ten turns (in Modern, civ 4 about 75 of 110). Destinations are chosen when the move is decided, while the
congestion load is booked only on arrival, and the crisis escape pull (+7) outweighs congestion (about 1 to 2).

Mod test 70 (2026-09-15, `eep-modtest70.js`, log `modtest70-engine-confirmations-*`): the four in-engine confirmations.
AugustusExp66, mod pass off, 14 hand-ended turns (two held by NOTIFICATION_CHOOSE_CITY_PRODUCTION, both advanced on a
later attempt; no Autoplay).

- Per-plot yields: `GameplayMap.getYields(plot, local)` returned `[type, amount]` pairs for 1597 owned plots and an
  empty array for 178, never another shape, on own, foreign, and unrevealed plots alike. The Prosperity lens
  activated (`LensManager.getActiveLens()` "emig-prosperity-lens").
- Disaster plot effects: `MapPlotEffects.hasPlotEffect` and `getPlotEffects` report an effect on a given plot;
  `PlotEffectAddedToMap` carries location and effect type and `RandomEventOccurred` carries event type, severity,
  and location. A plague effect forced onto St. Petersburg's center plot (`addPlotEffect` returned null, the effect
  was present with duration 1) was gone the next turn and never set `city.isInfected`. No city was infected in the
  15 turns read, so a live `isInfected` true is not observed here.
- The unhappiness penalty: `getYield` equals `getNetYield` for every yield in all 76 settlements. Destroying Megiddo's
  City Hall (+6 food, +6 happiness) took it from +1 to −5 happiness and on the same read food 32 to 20, production
  25 to 14.3, gold 53 to 30.2, science 4 to 1.5; the values held for 14 turns. Both getters read after the penalty.
- Policy cards: the six Exploration TRADITION_EMIG_* rows load with matching hashes in POLICY_CULTURE_SLOT, and the
  compiled DB holds their ProgressionTreeNodeUnlocks rows in the same shape as the base game's (Maritime Law on
  Economics, depth 1). Yet `getUnlockedTraditions(POLICY_CULTURE_SLOT)` (the call the base policies screen makes)
  listed no EMIG card for any civ although every civ had Economics, and no AI slotted one in 14 turns. Open: mod test
  73 tests whether the save researched those civics before the rows existed.

Mod test 71 (2026-09-15, `eep-modtest71.js`, log `modtest71-hostcap-*`): a first refugee host limit, counting the
refugees in transit to a foreign civ or held in its settlements against 10% of its population. 25 turns: civ 7 1.16
at turn 76 and 1.26 at turn 86 (without the limit 1.21 and 1.36). Civ 7 held 2 to 3 refugees at each snapshot against
a limit of about 11: holding drains as fast as a wave arrives, so the count almost never reached the limit. Replaced
by a decaying intake booked when a move is decided (mod test 72).

Mod test 72 (2026-09-15, `eep-modtest72.js`, log `modtest72-hostcap-intake-*`): the host limit as a decaying intake
(each committed cross-civ refugee books a point toward its host, fading by 0.8 a turn; closed at 10% of the host's
population). 68 turns to the age end at turn 134, no mod errors. Per civ against the control it matched the no-limit
run within a few points at every checkpoint (civ 7 1.35 at turn 86, 1.42 at 96, 1.05 at 126), and civ 7 still took 57
of 84 cross-civ arrivals. Civ 7's net inflow, decayed at 0.8, peaked near 13.5 against a limit of 11 to 13: at 10% a
civ of 120 can keep taking about 2.4 refugees a turn, the rate that made the spike.

Mod test 73 (2026-09-15, `eep-modtest73.js`, log `modtest73-policy-unlock-*`): the policy cards' unlock and slotting,
the Prosperity lens, and a live `isInfected`. AugustusExp66, mod pass off, hand-ended turns.

- Unlock: base cards on the mod's civics were unlocked (Maritime Law on Economics, Commune on Piety) and no EMIG card
  was. Society, the one EMIG civic not yet researched, completed after 6 turns and unlocked
  TRADITION_EMIG_CULTPULL_EXPLORATION together with the base Patronage and Uposatha. The cards unlock when their civic
  completes; this save researched the others before the mod's rows existed.
- Slotting: CHANGE_TRADITION Activate with `{TraditionType: $index}` (the base policies screen's arguments) returned
  canStart Success false, and the card was not active the next turn. Open: mod test 76 frees a slot first.
- Lens: the default lens and the Prosperity lens shot from the same camera over London look the same. Open: mod test
  75.
- `isInfected`: no settlement of any major was infected in 87 turns through the age end at turn 160. This save's
  crisis did not infect a city, so a live true reading is not observed. After the age transition the probe reloaded
  into the Modern age and was stopped by quitting the game.

Mod test 74 (2026-09-15, `eep-modtest74.js`, log `modtest74-hostcap5-*`): void. It set `CONFIG.refugeeHostCapPct` to
0.05, but the pass re-reads saved settings into CONFIG every turn (`refreshSettings` in emigration-main.js), so every
snapshot after the first logged 0.1 and the run matched mod test 72 exactly. Its intake log did show booking: civ 7's
intake was 8.4 at turn 71 and 9.8 at turn 81. A probe must change a tunable through `setTunable` (mod test 74b). The
same reload explains a small contamination in the no-mod control (mod tests 58 and 58b): the Exploration age ran no
pass, but after the age transition one pass ran before the reloaded probe switched the pass off again (21 crisis
moves, 19 across civs). Modern-age comparisons carry that one pass.

Mod test 75 (2026-09-15, `eep-modtest75.js`, log `modtest75-lens-*`): the Prosperity lens. The lens and its layer are
registered (`LensManager.lenses` / `layers`), the context reads 76 settlement signals and London's 36 plots with yield
pairs, and switching the lens on calls the layer's `overlay.addPlots` 12 times for 1623 plots at alpha 0.6 (a direct
`applyLayer()` does the same). The lens-on shot shows a pale gray fill over exactly the player's territory, ending at
the border hexes on the coast; the default-lens shot has none. So the lens paints, and the overlay setup matches the
base appeal layer and the Cultural Pressure lens. Its colors are nearly all gray: each tile is scaled against the
single most extreme tile, which is the likely reason (not measured: the probe logged three colors, not how many plots
fell in each bucket). A probe-owned magenta overlay created at run time did not render; not explained.

Mod test 76 (2026-09-15, `eep-modtest76.js`, log `modtest76-policy-slot-*`): slotting a policy card. AugustusExp66,
mod pass off. Society completed on turn 72; that turn `canSwapCultureSlot(POLICY)` was true with
NOTIFICATION_TRADITIONS_AVAILABLE, 5 slots, all 5 active. CHANGE_TRADITION Deactivate on Castes (canStart Success
true, TraditionChanged fired), then Activate on TRADITION_EMIG_CULTPULL_EXPLORATION (Success true, TraditionChanged
fired): the card was active, and still active on turns 73 and 74. The earlier refusal (mod test 73) was the full
slots. Verdict: the mod's cards unlock with their civic and slot like base cards in the swap window.

Mod test 74b (2026-09-15, `eep-modtest74b.js`, log `modtest74b-hostcap5-*`): the host limit at 5%, set with
`setTunable` so it held (snapshots logged 0.05) and reset on finish. 30 turns. The limit engaged: civ 7's intake peaked
at 6.9 (8.4 at 10%), civ 7 received 44 of 59 cross-civ arrivals (49 at 10%), civ 6 received 9 (3). The outcome barely
moved: civ 7 1.16 at turn 76, 1.36 at 86, 1.38 at 96 (1.16, 1.35, 1.42 at 10%). Civ 7 is the one host within reach of
civ 2's disaster wave, so a closed host makes the refugees wait a turn and then come anyway: the limit delays the wave
more than it redirects it. Four measured variants of a host limit (mod tests 71, 72, 74b) did not bring the largest
gainer within 15% of its no-mod population. The feature was removed on 2026-09-15; the account is in
`docs/wont-implement-with-justifications.md`.

Mod test 77 (2026-09-15, `eep-modtest77.js`, log `modtest77-lens-buckets-*`): why the Prosperity lens reads as a gray
wash. Over 1775 owned plots the tile score (summed per-plot yields) had mean 5.74 and percentiles 0 / 4 / 11, with a
single 69-yield tile setting the spread at 63.3. Scaled against that extreme, the median tile deviates 0.04 and 94% of
tiles fall inside 0.15, so the lens painted 1120 of 1775 plots in one gray bucket and only 8 plots in the four most
saturated ones. Fixed by normalizing each tile against its OWN settlement's mean and spread.

Mod test 78 (2026-09-15, `eep-modtest77.js` on the per-city build, log `modtest78-lens-percity-*`): the same
measurement after the fix. The same 1775 plots now paint in 18 color buckets instead of 12; the largest holds 492
plots (28%, was 1120 / 63%), 70 tiles reach full green and 110 the red end, where the four most saturated buckets held
8 plots before. The wide camera over London still cannot show a 0.6-alpha tint on textured terrain: mod test 79 points
the camera at the extremes.

Mod test 79 (2026-09-15, `eep-modtest79.js`, log `modtest79-lens-closeup-*`): the close-up watch, inconclusive by its
own timing. `Camera.lookAtPlot(loc, {zoom})` was called 4 s before each shot and every frame showed the PREVIOUS
framing (the lens-on shot still held the wide view, the lens-off shot held the worst-tile camera), so no tile of known
value was ever photographed with the lens on. The scoring it logged is right: London, 36 plots, best tile 62 against a
city mean of 11.9, worst 0. That worst tile is open ocean, i.e. the lens paints a settlement's owned WATER plots too,
which read 0 and drag the city's own scale. Mod test 80 moves the camera once, waits 15 s, and shoots lens-on then
lens-off from the same camera; it scores land plots only.

Mod test 80 (2026-09-15, `eep-modtest80.js`, log `modtest80-lens-watch-*`): the watch with the camera settled. One
`lookAtPlot` to London's best land tile (92,32: score 62 against a city mean of 13.9 over 27 land plots), 15 s, then
lens-on and lens-off shots from the SAME camera. The camera framing matched this time, so the pair does isolate the
lens. Two readings: the fill is present but still hard to read as a gradient on textured terrain at a flat 0.6 alpha,
and the mod's own prosperity hover panel rendered live in the lens-on frame ("London · About average −9%", with the
why-people-are-leaving and why-they're-drawn breakdowns). Answered by raising the contrast (a saturation curve plus
alpha that grows with strength) and by counting built coast, not just land, in a settlement's scale; watched in mod
test 81.

Mod test 81 (2026-09-15, `eep-modtest80.js` on the contrast build, log `modtest81-lens-contrast-*`): the same settled
camera over London's best land tile (92,32, score 62 against a city mean of 13.9). WATCHED: the lens-on frame shows a
real gradient, strong green over the settlement's best ground, pink and red over its poor tiles, neutral gray between,
and the lens-off frame from the same camera has no tint at all. The Prosperity lens is confirmed painting and legible
in game. Build: per-settlement scale, empty sea skipped (built coast counted), saturation curve with alpha rising
with strength.

Mod test 82 (2026-09-15, `eep-modtest82.js`, log `modtest82-domestic-option-*`): do settlements in crisis have a
homeland alternative? 25 turns at shipped defaults, the mod's pass on; each turn, for every source the engine counts
as in crisis, the best destination overall against the best one inside its own civ. 67 crisis sources: 63 scored a
FOREIGN destination best, 3 a domestic one, 1 had none. Of the 63, 45 had a homeland option at all and 18 had none.
The homeland option is usually much worse: home/best pull p10 0.09, p25 0.21, median 0.36, p75 0.57, p90 0.77, and in
absolute points the foreign-minus-home gap runs 2 / 12.3 / 23.3 at p10 / p50 / p90. Reading: a threshold rule ("stay
home when home is at least 70% as good") would bite in 13% of cases, too weak to move a 35-42% runaway; a WEIGHTED
homeland preference (a bonus added to same-civ destinations for a crisis source) flips about half the cross-civ
crisis moves at 12 points and about 90% at 23, and maps onto the "Movement between civilizations" slider.

Mod test 84 (2026-09-15, `eep-modtest84.js`, log `modtest84-internal-bonus-*`): the homeland bonus
(`crisisInternalBonus` 12, logged in every snapshot) over the 30-turn spike window against the no-mod control. It
works directionally and does not reach the target. Crisis moves staying inside their own civ: 26 internal against 35
cross-civ, 43%, where the same window without it ran 30%. Civ 7 against the control: 1.19 at turn 76, 1.26 at 86,
1.34 at 96 (without the bonus 1.16 / 1.35 / 1.42); worst civ 34%, against 42%. Cross-civ arrivals still concentrate
(42 of 45 into civ 7). Next: mod test 87 measures 24, the slider's 0-position value, which mod test 82 predicts flips
about nine in ten cross-civ crisis moves.

Mod test 87 (2026-09-15, `eep-modtest87.js`, log `modtest87-internal24-*`): the homeland bonus at 24, the slider's
0-position value, saved with `setTunable` (snapshots logged 24). Crisis moves staying inside their own civ rose to
37 internal against 21 cross-civ, 64% (43% at bonus 12, 30% without). Civ 7 against the control: 1.14 at turn 76,
1.29 at 86, 1.28 at 96; civ 2 recovered to 0.89; worst civ 29.5% (34% at 12, 42% without). Still short of ±15%, with
diminishing returns: the escape pull and the geography that makes civ 7 the only reachable refuge remain. Mod test 90
measures the whole slider at 0 (friction 30, escape 0, brake 24, homeland 24).

Mod test 88 (2026-09-15, `eep-modtest88.js`, log `modtest88-loc-trim-*`): does the game's text loader keep a
localized string's edge spaces? NO: 0 of 11 mod rows whose value carries a load-bearing leading or trailing space
kept it (" and " → "and", " · this tile" → "· this tile", " (rival civilization)" → "(rival civilization)"), and a
composed row with an argument came back "(+3 more)" with no leading space either. Every fragment the mod joins onto
other text must supply its own separator in CODE; the rows themselves are now stored trimmed in en_us and in all 11
locales. Found because the Prosperity panel's title read "London· this tile" (mod test 85).

Mod test 89 (2026-09-15, `eep-modtest86.js` on the rewritten lens, log `modtest89-ethnicity-gradient-*`): the
Ethnicity lens after the fix. It now paints 1623 plots in 51 batches (mod test 86: 0 plots, every settlement's
composition null), because the tile mosaic synthesizes an all-host composition when the pass has recorded none;
settlements report 18 to 36 tiles each. WATCHED: the territory paints in the owner's banner color with a visible
core-to-fringe gradient. Fill colors confirm the new rule (the leading origin's color, alpha 0.63 to 0.82 with the
hold and density).

Mod tests 90 to 93 and 91b (2026-09-15, `eep-modtest90.js` and its generated siblings, logs `modtest90-slider0-*`,
`modtest91b-slider25-*`, `modtest92-slider75-*`, `modtest93-slider100-*`): the "Movement between civilizations"
slider measured across its range, 30 turns each from AugustusExp66 against the mod-off control (mod test 58), with
the position set through `setGroupedSetting` so the per-pass settings refresh keeps it. Worst civ (always civ 7, the
host of the volcano-driven wave) and the stricken civ 2 at turn 96:

| slider | worst civ | civ 2 | note |
| --- | --- | --- | --- |
| 0 | +18% | 0.96 | friction 30, escape 0, brake 24, homeland 24 |
| 25 | +29% | 0.88 | |
| 50 (then default) | +34% | 0.85 | friction 18, escape 7, brake 12, homeland 12 |
| 75 | +41% | 0.80 | |
| 100 | +37% | 0.84 | friction 12, escape 14, brake 0, homeland 0 |

Above 50 the curve flattens (75 and 100 differ by noise): once refugees leave freely, loosening further changes
little. The first slider-25 run (`modtest91-slider25`) died 64 s in when the GAME crashed (run-probe reported
result=crashed, with HTML parser errors in root-game.html and no mod error); the re-run completed.
Outcome: the slider was re-scaled so its MIDDLE is the +18% behavior (the old 0), 100 stays free movement, and
below 50 the homeland preference hardens past the measured point. The shipped defaults are therefore the measured
+18% row.

Mod test 94 (2026-09-15, `eep-modtest84.js` on the re-scaled build, log `modtest94-shipped-defaults-*`): the
SHIPPED defaults, with nothing overridden (snapshots logged poachBlock 30, internalBonus 24). Worst civ +17% against
the control, civ 2 at 0.93 to 0.95, the largest civ's share 40.4 against 41.0, world population 1163 against 1158.
That matches the +18% measured through the slider override (mod test 90) within run-to-run variation, which with the
mod on is not zero: the probe answers the mod's dialogs on a timer, so AI decisions can differ slightly between
otherwise identical runs (the mod-OFF control is exactly reproducible, mod test 58b).

Mod test 85 (2026-09-15, `eep-modtest83.js` on the two-sided build, log `modtest85-lens-twosided-*`): the tile scale
after scaling each side separately. London's sampled tiles now read 62 → +100%, 12 → −5%, 7 → −45%, 6 → −53%,
0 → −100% (before: +100 / −1 / −12 / −14 / −26), with fills spanning green through gray to red. The cursor panel also
rendered this time (the probe still cannot set the plot cursor, but the element existed and was visible), reading
"Poor land here −45%", "This tile yields 7, the settlement averages 13", "Settlement: About average −9%": the number
the panel prints is now the number the color came from. One defect the dump exposed: the title read "London· this
tile". The en_us row is " · this tile" WITH a leading space, so the game's text loader strips leading whitespace from
a localized string. The title now joins with an explicit space in code; mod test 88 checks whether the trim is general
(it would also hit " and ", " (rival civilization)" and "{1_Name} strikes! ").

Mod test 83 (2026-09-15, `eep-modtest83.js`, log `modtest83-panel-*`): the Prosperity lens's cursor panel after it was
rewritten to lead with the hovered TILE's standing. Two readings.

- The panel's content is deterministic and was logged: on London's best tile it shows +100%, tile yield 62 against a
  settlement average of 13. The panel ELEMENT could not be driven from a probe (`PlotCursor.plotCursorCoords` is not
  assignable: the write threw, no panel existed), so the rendered panel still wants a human hover.
- A defect the same log exposed: per-settlement scaling alone still flattens. London's 33 counting tiles scored
  62 / 12 / 7 / 6 / 0 and read +100% / -1% / -12% / -14% / -26%, because one wonder tile set the whole scale from
  inside the settlement. Fixed by scaling the two sides separately (above the mean against the settlement's best
  tile, below it against its worst), so that 0-yield tile reads -100% and ordinary land spreads across the range;
  pinned in `tests/tile-score.mjs`.

Mod test 95 (2026-09-16, `eep-modtest95.js` on AugustusExp66, log `modtest95-fullUI.log`): the roster regenerated
from the INSTALLED game, watched in engine. The engine had loaded 47 civilizations and 36 playable leaders and
NONE of them was missing from the mod. `IMPROVEMENT_EMIG_ENCLAVE_OTTOMANS_A` and `_B` both loaded and the old
singular `..._OTTOMAN_A` did not, so the Ottoman key fix is live; every new civilization's enclave improvement
loaded and every new quarter text row composed (no row fell back to its own tag). Tuning resolved with England
neutral and Norman still 1.4, and each alternate persona distinct from its base. The save also happens to contain
a live `LEADER_ASHOKA_ALT` player (id 8, Chola), the exact case the persona fix was written for.

Mod test 96 and 97 (2026-09-16, `eep-modtest96.js` / `eep-modtest97.js`, reconnaissance): `Game.CrisisManager`
exists with `isCrisisEnabled()` true, `getCurrentCrisisStage()` -1, and `city.isInfected` is exposed and readable
as a real boolean on all 81 cities. Age progression is `AgeProgressManager.getCurrentAgeProgressionPoints()` over
`getMaxAgeProgressionPoints()` (66/160 = 41.3% at turn 66, about one point a turn). Crisis stage 1 triggers at 70%
age progression, and the crisis a game is running is NOT exposed anywhere readable.

Mod test 98c and 98d (2026-09-16, `eep-modtest98.js` with `eep-crisis-plague.xml` then `eep-crisis-early.xml`):
AN EXISTING SAVE CANNOT BE PUSHED INTO A CRISIS FROM DATA. First with the religion crisis deleted and plague
stage 1 lowered to 42%, then with BOTH crises present and both lowered to 42%, AugustusExp66 played from 41.3%
to 56.3% and to 48.8% age progression respectively. The stage never left -1 and no city was ever infected, with
`isCrisisEnabled()` true throughout. The crisis schedule is fixed when a game is created, so `AgeCrisisStages`
edits reach the database (the probe read them back changed) but not a game that already exists.

Mod test 100 (2026-09-16, `eep-modtest100.js` with `eep-shell-crisis.js`): a NEW Exploration game started and
played turn 1 to 31 (0.7% to 22.1% age progression) but still showed no crisis, because the setup parameter was
never set: the shell had walked the parameter list and used the parameter object's numeric id ("26"), which
`findGameParameter` does not accept.

Mod test 101 (2026-09-16, `eep-modtest100.js` with the corrected `eep-shell-crisis.js` and
`eep-crisis-plague-new.xml`, log `modtest101-fullUI.log`): **`city.isInfected` WATCHED TRUE.** A new Exploration
game with only the plague selectable reached crisis stage 0 at turn 7 and infected two cities by turn 9 (Tortuga
pop 8 and Road Town pop 11, both player 4). Verdict line: `isInfected observed true: YES | firstInfectedTurn=9
peakInfectedCities=2 | firstCrisisStageTurn=7`. This closes the last engine surface the mod read but had never
been watched.

The crisis is chosen through the `Crises` setup parameter (`Base/modules/core/config/SetupParameters.xml`:
`ParameterID="Crises" Domain="StandardCrises" Array="1" UxHint="InvertSelection" ConfigurationKey="ExcludeCrises"`).
Because the selection is INVERTED, the value written is the list of crises to EXCLUDE. Note that
`GameSetup.setGameParameterValue("Crises", [...])` returned 0 and read back null; what actually took was the
direct `Configuration.editGame().setValue("ExcludeCrises", [...])`, which read back correctly. Write both.

Environment note (2026-09-16): the game updated to **1.5.0** mid-session. `AppOptions.txt` carries
`[Modding] DisableModsOnStartupVersion`, which the game increments on update to disable every mod on the FIRST
startup afterward; that startup loads no mods at all (no `Modding.log` scan, a 0-byte `UI.log`) and sits on the
main menu, which looks exactly like a hang. The next launch is normal. 1.5.0 also adds an (empty)
`ModCompatibilityWhitelist` table to `Mods.sqlite`. The mod itself was watched healthy on 1.5.0: mod test 98c
played 24 turns with the pass running and 1383 mod log lines, and the only JS errors in the run came from the
base game's own `privateer-flags.js`. Regenerating the roster against 1.5.0 changed nothing (47 leaders, 50
civilizations, 133 mementos).

`eep-winid.swift` had never compiled: its `print` call and the closing brace of the `if` sat inside a trailing
`//` comment, so every window-targeted screenshot had been silently falling back to a frontmost-app capture.
Fixed 2026-09-16; it is what produced the screenshot that identified the 1.5.0 mod-disable banner.

## 1.5.0 compatibility (2026-09-16)

The game updated to 1.5.0 mid-session, so the mod was re-checked against it statically and in game.

Static, against the installed 1.5.0 tree: all 13 base-game imports resolve; all 7 named imports are still
exported; and the four `Controls.decorate` targets the mod attaches to (`city-banner`, `lens-panel`,
`screen-dialog-box`, `panel-sub-system-dock`) are all still defined in **legacy `ui/`**, not moved to
`ui-next/`. Two of the mod's own imports already point into `ui-next` (`plot-tooltip.js`,
`focus-manager.js`) and both resolve. Regenerating the roster against 1.5.0 changed nothing.

Watched in game (mod tests 95b, 98c, 101 to 105): 24 turns played with the pass running and 1383 mod log
lines, the only JS errors in the run coming from the base game's own `privateer-flags.js`; the roster,
Ottoman-key, new-civilization text and tuning checks all passing exactly as they did on 1.4.2; the console
API live and `runNow()` executing; the dashboard rendering in full (all seven tabs, the migration network,
a war toast and the city readout panel with its pressure breakdown); **both lenses registering, activating
and painting** (prosperity green-through-red across London's tiles, ethnicity in the origin civilization's
color with its per-tile tooltip); city banners rendering; localized text composing; 6 EMIG traditions and
100 enclave constructibles present in the 1.5.0 gameplay database.

Probe-context gotcha worth remembering, because it produced three false failures across mod tests 102 to 104:
`LensManager` is an **import** (`/core/ui/lenses/lens-manager.js`), not a global, so a bare reference reads
undefined and looks like "the lens system is gone". The probe script's `document` also does not see every HUD
element -- `panel-sub-system-dock` resolves but `lens-panel` and `city-banner` do not -- so a DOM count of 0
from the probe proves nothing; the screenshots showed banners and both lens overlays present. Judge these
surfaces by the imported API and by a screenshot, never by `querySelector` from the probe.

The one surface still unwatched is the banner pressure BAR itself drawing, which needs a city carrying at
least 5% emigration pressure; London was at "Attraction 3%" during the runs. That is a data condition, not a
1.5.0 question: the decorator injects its stylesheet only when a banner attaches with pressure to show.

## Mod test 109-110 - who is actually attacking a city (2026-09-16)

Ran against `AugustusAnt65` (Antiquity, England, 3 cities), 8 turns each, to settle whether the minor-power
violence downgrade can identify its attackers.

**109 - the at-war list is not an attacker list.** `Players.get(local).Diplomacy.isAtWarWith` returned true for
**18-19 Independent Powers at once**, every turn, with nothing besieged and no war declared. Independent Powers
are hostile-by-default and the engine models that as war. Also settled: `Players.getAlive()` DOES enumerate
minors (39-40 entries, ids 0-9 major, 10+ minor), so they were always being tested; and Independent Powers
report `isMajor=false, isMinor=false, isIndependent=true`, so `isMinor` alone MISSES them - test
`isMajor === false`. No city was besieged in the 8 turns, so the contested-district path went unobserved.

**110 - units in contact do name the attacker, per city.** After `attackersNear()` was added (armed hostile
units on or adjacent to a city's districts, via `MapUnits.getUnits(x,y)` -> `Units.get(cid)` -> `.owner` /
`.Combat`), the same save gave genuinely different readings per settlement:

```
CITY 'London'    besieged=false unitsInContact=[]   occupiers=[] atWarCount=18
CITY 'Liverpool' besieged=false unitsInContact=[27] occupiers=[] atWarCount=18
CITY 'Leeds'     besieged=false unitsInContact=[11] occupiers=[] atWarCount=18
```

Independent Power 27 sat on Liverpool for all ten readings; 11 touched Leeds on one turn and moved on; London
was never in contact. `atWarCount` was identical for all three cities on every turn - the old signal could not
have told them apart. No throws, no ERR reads.

Still unobserved: an actual siege, so the contested-district fallback and the pressure consequence of the
downgrade have not been watched. `attackersNear` is fog-limited for foreign cities by construction.

## Mod test 111 - the combat event stream, and fog (2026-09-16)

Same save, 10 turns. Two findings, both of which overturn assumptions this session had been designing around.

**The violence model ignores a dense, fully-formed combat event stream.** The mod listens to no combat events
at all and reconstructs violence by polling district health once per turn. In 10 turns the engine emitted
**107 `Combat`, 208 `UnitDamageChanged`, 28 `UnitKilledInCombat`, 25 `DistrictDamageChanged`**. Payloads:

```
Combat                {antiAir, attacker, defender, interceptor}   each a ComponentID with .owner/.id/.type
UnitKilledInCombat    {unitKilled, unitKiller}
UnitDamageChanged     {newDamage, oldDamage, unit}
DistrictDamageChanged {damageType, districtType, maxDamage, newDamage, prevDamage, cityID, id, location}
```

`DistrictDamageChanged` carries the exact delta, the city, the district and the plot - everything the polled
`districtDamageFrac` reconstructs by diffing, without the sampling gaps. Negative `newDamage` is repair.

**Fog does not apply, to units OR to events.** `attackersNear()` had been assumed fog-limited three times
without test. It returned hostile units at **8-12 foreign cities on every scan, all on never-revealed plots**
(`getRevealedState` 0, `foreignFoggedWithUnits` equal to `foreignWithUnits` in all five scans). Every `Combat`
event received was between two OTHER AI players (attackers 5/6, defenders 10/11/29; local was 0). So unit
reads and combat events both span the whole map, exactly like district health, and preserve the
fog-independence the migration model depends on.

The source comments and the memory entry asserting fog-limiting were corrected.

## Mod test 112-116 - the per-city combat ledger, watched (2026-09-16/17)

112 and 113 read zero: a probe that imports a module gets its own, never-started instance. 114 showed globals
DO cross mod contexts (`DemographicsData` visible) but `globalThis.emigration` was absent -- the main bootstrap
had not run at all, because `emigration-call-home.js` and `emigration-call-home-action.js` were never deployed
and `emigration-main.js` failed to load. Eight files were stale; `scripts/deploy.mjs` (`npm run deploy`,
`npm run deploy:check`) now syncs every modinfo-referenced file. 115 (played by hand) recorded real fights but
`attackers=[]`: an invader killed by the defender arrived as the victim and went unnamed. Fixed to name every
combatant who is not the city's owner.

116 runs unattended against criteria fixed in the script. First attempt stalled during save load
(`ApplyModdingState`, no crash report, not reproduced). Second attempt, 3 turns:

```
tracker:   {"tracking":true,"turn":68,"seen":44}
observed:  turnsSampled=4 citiesTouched=8 foreignRows=17 battles=16 kills=4
naming:    fightRows=16 named=16 unnamed=0 damageOnlyRows=2 distinctAttackers=[11,10,34,23,22,2,20,38] selfNamed=0
RESULT PASS
```

Row counts include a fight re-read on the following turn (evidence stays readable for one turn), so 16 is an
upper bound on distinct fights; the 0 unnamed and 0 self-named findings do not depend on that.

## Mod test 117 - do minor-power raids cause fewer refugees? (2026-09-17)

The violence model now scores every observation twice on the same turn: for real, and under the pre-change
rules (no minor downgrade), decaying both by the same factor (`emigration-violence-audit.js`, published as
`globalThis.EmigrationViolence`). The combat ledger was also changed to running totals with per-reader
cursors, so each event is read exactly once per reader. Unattended run on `AugustusAnt65`, criteria fixed in
the script; it stopped after 1 turn on its early-stop rule (>= 8 minor-only raids plus a refugee effect).

```
observations: minorOnly=10 withMajor=0 minorCities=10
checks:    misclassified=0 amplified=0 majorAltered=0 invariantBreaks=0
refugees:  oldRulesAtThreshold=5 prevented=3 pointsAvoided~7 actualWarRefugees minorCities=1 otherCities=0
naming:    fights=3 named=3 selfNamed=0
RESULT MECHANISM PASS
RESULT OUTCOME PASS: 3 of 5 at-threshold turns under the old rules were below it now; ~7 refugee points avoided
```

Limits: one turn of data. No raid involving a major civilization occurred, so "majors are never downgraded"
is covered by unit tests only, not watched in game. Refugee points are an estimate (no siege-duration
multiplier); the threshold crossings are exact.

## Mod test 118 - 60-turn unattended soak of the minor-power balance (2026-09-17)

Fixed 60 turns, no early stop, criteria fixed in the script. 1464 s wall clock, one age throughout, no
emigration errors in UI.log, harness cleaned up.

```
observed:   minorOnly=691 withMajor=21 minorCities=41 majorCities=7
sources:    {"struck":283,"units":365,"district":0,"atwar":64,"none":0}
checks:     misclassifiedAsMinor=0 misclassifiedAsMajor=0 amplified=0 nonMinorAltered=0 invariantBreaks=0
refugees:   oldRulesAtThreshold=371 prevented=323 pointsAvoided~768 actualWarRefugees minor=15 major=9
windows:    preventedRate by 10-turn window = 0.80 0.86 0.86 0.87 0.87 0.93
naming:     fights=412 named=412 withMajorAttacker=8 selfNamed=0
A MINOR-MECHANISM PASS  B MAJOR-MECHANISM PASS  C OUTCOME PASS (87.1%)  D CONVERGENCE CONVERGED  E HEALTH PASS
```

Notes: all 21 major-attacker observations fell in the first 30 turns. The `medianTurnMs` figure the probe
printed (455 s) is wrong -- 60 turns took 1464 s in total -- so its per-turn timing is not usable; `Date.now()`
or the retry path in the probe is suspect. District control was never the naming source (no district fell).
The at-war proxy was the only basis for 64 of 712 decisions (9%).

## Mod tests 119-124 - Options screen: conflict sliders and collapsible advanced sections (2026-09-17)

119/120 were load checks (text keys resolve, defaults in effect, no load errors). 121-124 are the first probes
that SEE the Options screen. Probes cannot draw the game's interface from their own script context, so the mod's
console API gained diagnostics that run in the mod's context: `emigration.options(tab, openSection)`,
`emigration.closeOptions()`, `emigration.optionsScrollTo(optionId)`. The mods tab is "ADD-ONS", index 0; other
installed mods come first, so scrolling is needed.

Watched: the overall and per-type refugee sliders render on the Mods tab; the advanced settings render as
sections whose checkbox shows and hides exactly that section's rows. The first capture (123) showed section
toggles indistinguishable from settings; section rows are now styled as headings (gold, uppercase, spaced) and
their settings indented, by intercepting the moment the screen assigns `forceRender` to an option (its row then
exists). Confirmed in 124's capture. Not watched: dragging a slider on screen (probes cannot drive input).

Mod test 55 (2026-09-17, `eep-modtest33.js`, log `modtest55-quotes-UI.log`): the refugee and newcomer quotes and
the glyphs a font-file check could not settle. AugustusAnt49, no turn ended.

- Watched: the refugee decision drew its quote in the framed panel, slanted and wrapped at the body's width. The
  refugees came from an unmet civilization (Mexico), so the quote came from the general pool (Mickiewicz), as
  designed.
- Watched: the Hawaiian okina (U+02BB), ā, and ụ render. The schwa ǝ (U+01DD) and Thai draw as boxes. The Aksum
  enclave quote's transliteration used the schwa, so it now shows only its English translation.
- The newcomers pop-up never opened: the saved option (automatic placement) replaced the probe's ask mode before
  the deferred flush, and the log shows the point auto-placed.

Mod test 56 (2026-09-17, `eep-modtest34.js`, log `modtest56-newcomers-UI.log`): ask mode forced and flushed
synchronously, two migrant arrivals. Still no pop-up: another session had since limited the pop-up to refugees by
default (migrants and returnees auto-place), which the log's auto-placement confirmed. Not a defect.

Mod test 57 (2026-09-17, `eep-modtest34.js`, log `modtest57-newcomers-refugee-UI.log`): the same with refugee
arrivals. Watched: "Refugees in Bristol" opened for both. Refugees from met Spain showed Spain's own quote (Ricote
the Morisco, Don Quixote II.54); refugees from unmet Mexico showed a pool quote, so the unmet civilization is not
named.

## Mod test 119 - can a mod run a gameplay-context script? (2026-09-17)

The multiplayer plan's Carrier 1 (`docs/player-experience-risks.md` 8.9d): a mod registers a script with the
`ScenarioScripts` modinfo action and the UI reaches it with the `EXECUTE_SCRIPT` player operation, so the
yield and counter writes could run inside the simulation on every client. Run on AugustusExp66 (1.5.0),
`eep-modtest-mp1.js` with `eep-scenario.js` installed as a second throwaway mod (`emig-scen-probe`), so a
rejected action could not stop the UI probe from reporting. Receipts were written to GameConfiguration
because the two contexts may share no globals.

```
A1 receipt EepScenLoaded=null
A3 InitialScriptType keys=["Default","Sandbox"]
A4 scripts[Default=0] count=98 eep=["/emig-engine-probe/ui/eep-game.js"]
A4 scripts[Sandbox=1] count=0 eep=[]
B1 PlayerOperationTypes.EXECUTE_SCRIPT=-966415096
B2 shape=OnStart|Function|FunctionName|ScriptName|Script|ScriptPath|File|Name+Args|empty
   canStart={"Success":true} sendRequest=true   (all nine)
C1 receipt EepScenCalls=null
VERDICT LOADS=NO REACHED=NO
```

- **The script never ran.** No receipt, no log line in any file under `Logs/`, and the engine registered it
  under neither initial-script type: `Default` held all 98 UI scripts including the probe's own
  `ui/eep-game.js`, and `Sandbox` held none. `Modding.log` shows `emig-scen-probe` scanned and loaded
  alongside the engine probe, so this is the engine's answer, not a harness miss.
- **`EXECUTE_SCRIPT` exists and accepts anything.** The operation is real (hash -966415096) and `canStart`
  answered Success and `sendRequest` true for all nine argument shapes, including `{}`. That is 2.8 again:
  the player-operation `canStart` validates the request shape, not the work. Nothing was reached.
- **Why, most likely.** `ScenarioScripts` sits in the engine's action-name table beside the scenario DLC
  packages (`test-of-time`, `pirate-content`), so it is probably scenario-content-only. `InitialScriptType`
  has no mod-reachable second host: the base game calls `getInitialScripts(Default)` and nothing else.
- **Consequence.** Carrier 1 is dead for a UI mod in an ordinary game. Multiplayer support now rests on
  whether the element operations replicate in a network game (plan probe 5, needs a second client) with the
  placed-constructible carrier as the floor.

Also settled in the same run, the plan's probe 2 (tile score by viewer): `GameplayMap.getYields(plot,
localPlayerID)` and `getYields(plot, ownerId)` returned identical values on all 72 foreign plots compared,
revealed and unrevealed. The per-plot yield read does not depend on who is asking, so making the planner
score tiles as the owner is free and changes no single-player behavior.

## Mod test 120 - can a placed constructible carry a per-turn yield cost? (2026-09-17)

The multiplayer plan's Carrier 3, the floor (`docs/player-experience-risks.md` 8.9d): express a per-turn cost
as a placed never-buildable constructible's database yield, so every client computes the same number and no
script write has to replicate. Tested in the BUILDING form (an improvement would take a plot the settlement
could use). Data: `eep-building-carrier.xml`, `BUILDING_EMIG_TEST_BURDEN`, `Population="0"`,
`YIELD_GOLD="-2"`, Antiquity age, `RequiresUnlock` with no unlock row. AugustusExp66 on 1.5.0, mod pass off,
6 turns, `eep-modtest-mp3.js`.

```
A1 row={"index":281,"cls":"BUILDING","pop":0,"cost":55}   A2 yieldChanges=["YIELD_GOLD=-2"]
B1 local (London)        CREATE string -> true placed=true   gold 88.54 -> 85.63   urban 22 -> 22
B2 ai (St. Petersburg)   CREATE string -> true placed=true   pop 30 -> 29, urban 18 -> 17
E3 after destroy         centre back to 3 buildings          gold 111.73 -> 124.04
VERDICT ROW=YES PLACED_LOCAL=YES PLACED_AI=YES POP=SAME SURVIVED=YES DESTROYED=YES
```

- **A negative constructible yield loads and charges.** The row compiled with `YieldChange="-2"` and the
  city's net gold fell the moment it landed. `Population="0"` kept urban population unchanged (22 to 22),
  so a carrier does not drag a citizen with it the way a normal building does.
- **It survives AI turns and can be removed.** Six turns with the AI playing, no crash report and no
  disappearance, then `DESTROY_ELEMENT` took it off and the center returned to its three buildings. The 2.4
  broker rule holds for a never-buildable custom BUILDING, not only for the improvement watched in runs 7
  and 8.
- **The cost is NOT the number in the data.** Removing the carrier returned 12.31 gold a turn to a city
  whose yield the data says is -2. The base figure is scaled by whatever multiplies that city's gold, so a
  carrier charges more in a rich settlement than in a poor one. Any design on this carrier has to compute
  the effect it wants against the city's own multipliers, or accept a cost that grows with the city.
- **Placing into a full district EVICTS a building.** St. Petersburg's center already held three buildings;
  the carrier replaced its Granary and took a population point with it (30 to 29, urban 18 to 17). London had
  room and lost nothing. So a carrier may only be placed where the district has a free slot, and the placer
  must read slot space first; otherwise the "cost" silently destroys a real building.
- **Consequence.** The floor works and is usable, with those two rules. It still only matters if the element
  operations replicate in a network game (plan probe 5).

## Mod test 121 - hotseat: does the per-turn work run once per human? (2026-09-17)

The multiplayer plan's probe 4 (`docs/player-experience-risks.md` 8.9h): with two humans, does the mod's
per-turn work run once per human instead of once per game turn, and what do the session reads answer? One
client and one simulation, so this tests the authority gate and the owner/viewer split, never replication.
`eep-modtest-mp4.js` with `eep-shell-hotseat2.js`, new game, 1.5.0.

**Starting a hotseat game headless.** `Configuration.editGame().reset(GameModeTypes.HOTSEAT)` plus
`Configuration.editPlayer(id).setSlotStatus(SlotStatus.SS_TAKEN)` for two slots configures it, but
`engine.call("startGame")` (Play Now) then starts an ORDINARY SINGLE-PLAYER game: `isHotseat` false, one
human (run `modtest-mp4`). Play Now does not carry the mode. What works is the base game's own path:
configure, then `Network.hostGame(ServerType.SERVER_TYPE_HOTSEAT)` followed by
`Network.startMultiplayerGame()` (run `modtest-mp4c`).

```
A1 isHotseat=true isAnyMultiplayer=true isNetworkMultiplayer=false isLocalMultiplayer=true
A2 humanPlayerIDs=[0,1] humanPlayerCount=2 localPlayerID=0
A3 Network.getHostPlayerId=0  Network.isHost=absent  config.isHost=undefined
B0 activation who=0 local=0 turn=1     B1 activation who=1 local=1 turn=1
[Emigration] pass (turn 1) none, 273ms      <- ONE pass line, for player 0 only
```

- **The session reads all answer.** `isHotseat`, `isAnyMultiplayer`, `isLocalMultiplayer` and
  `humanPlayerIDs` are exactly what `sessionKind()` and `humanPlayers()` need (plan 8.9b).
- **`Network.isHost` DOES NOT EXIST at runtime**, and `Configuration.getGame().isHost` is undefined.
  `Network.getHostPlayerId()` answers (0). The Demographics mod's `canSetHostPolicy` calls `Network.isHost()`
  and so can never resolve host status in a multiplayer game; both mods must use `getHostPlayerId()`.
- **The local player really does change with the handoff.** Player 0 activated as local 0, and after the turn
  passed, player 1 activated as local 1 within the SAME game turn. Every branch reading
  `GameContext.localPlayerID` as "the human" therefore changes meaning mid-turn in hotseat.
- **But the pass did not run twice**, and the reason matters: `lastLocalTurnRun` is a module variable, and on
  one client both humans share it, so the interval gate `turn - lastLocalTurnRun < turnInterval` skipped the
  second human's pass. The double-run is a NETWORK problem, where each client is its own isolate with its own
  copy of that variable; hotseat cannot show it. The work that is NOT interval-gated (the dead-district sweep
  and the calm-empire call-home offer) still runs once per human, and nothing in a turn-1 game exercised
  either.
- **Autoplay passes a hotseat turn, once.** The assign-resources blocker (6.4) held the turn as usual, and
  one-turn Autoplay advanced player 0. It did not advance player 1: repeated attempts over two minutes left
  the turn with player 1, so the hotseat handoff is only half drivable from script. The verdict line the
  probe printed on its earlier run (`ACTIVATIONS_PER_TURN_MAX=1 single run`) was an artifact of never passing
  the turn at all, not a finding.

Verdict-line artifact in the same run: the probe printed `HUMANS=1 ACTIVATIONS_PER_TURN_MAX=2 INCONCLUSIVE`
because it re-read `humanPlayerCount` at the END, after Autoplay had taken player 0 over; the game began with
two humans (`A2 humanPlayerIDs=[0,1] humanPlayerCount=2`). The data the verdict was computed from is the
finding: `activationsPerGameTurn={"1":2}` with `distinctLocalIds=[0,1]`. Read the counts, not that label.

## Mod tests 152-153 - what every yield write actually changes (2026-09-18)

Asked while reworking the enclave stance yields (the registry pays in Food, Production, Science, Culture, Faith,
Gold and Happiness through `Players.grantYield`). Earlier probes had only ever granted Gold, Happiness and
Influence. AugustusExp66 on 1.5.0, mod pass off (`turnInterval` 99999, logged in every snapshot). Mod test 152
granted +100 then -100 of every `YieldTypes` entry and diffed player pools, lifetime and net yields, tech and civic
progress, and London's and Leeds's growth, build queue and yields after each call and across a turn. Mod test 153
closed its gaps: a Culture deduction while a civic was in progress, the Science deduction read at 0 / 3 / 8 s, and
`city.FoodQueue.addProgress` / `city.BuildQueue.addProgress` (±50) on London and on French Paris. The idle diff
before any write showed 0 changes, so every same-turn diff below is the write alone. The end turns used one
Autoplay turn each (the resource blocker), so only stocks, not spending, are read across them.

```
A +100 GOLD        P.treasury.goldBalance 804.06 -> 904.06
A +100 SCIENCE     P.tech.node.progress 1033 -> 1133
A +100 CULTURE     P.civic.node.progress 996 -> 1096 (civic completed at the turn roll)
A +100 HAPPINESS   P.life.HAPPINESS +100 only
A +100 DIPLOMACY   diplomacyBalance 0 -> 100
A +100 FOOD        changed=0          A +100 PRODUCTION   changed=0
B -100 GOLD        goldBalance -100   B -100 DIPLOMACY    84.36 -> -15.64
B -100 SCIENCE     turnsLeft 2 -> 3, progress unchanged
B -100 CULTURE     changed=0 (no civic selected)   153: 996 -> 996 with a civic in progress
153 SCI -100       progress 1033 at 0, 3 and 8 s; the +100 "restore" then left it at 1033
153 FoodQueue ±50  London / Paris currentFood unchanged; turn: 10.83 + net 121.5 = 132.33 exactly
153 BuildQueue +50 London 0 -> 107.64 (+3 s); -50 107.64 -> 50.14; +50 50.14 -> 107.64; turn -> 303.14
153 BuildQueue +50 Paris 686.63/750 -> 0, turnsLeft 1 -> 10 (item finished); -50 at 0: no change
```

- **Gold and Influence: both ways, at once.** Influence goes negative.
- **Science and Culture: gains only.** A gain lands on the researched node's progress at once and can finish
  it. A Culture deduction does nothing. A Science deduction never lowers progress, but turns-left rose once and a
  +100 sent straight after added nothing, so it may be held as a hidden debt; seen once, not isolated.
- **Food and Production through grantYield: nothing.** No player or city number moved, either sign.
- **`BuildQueue.addProgress` writes city production**, both signs, within 3 s, on any owner's city with no
  operation, floored at 0, kept across the turn, and it completes the item when progress crosses the cost. The
  amount is scaled by the city's production bonus (±50 moved about ±57.5; the first call landed 107.64 and is not
  explained). **`FoodQueue.addProgress` does nothing** to stored food, and `city.Growth` has no write method.
- **No write moved `Stats.getNetYield` in the same turn**, Gold included, which overturns the older
  "grantYield spikes Gold Per Turn" reading (13-probe-findings:52) on 1.5.0.
- **No Faith.** `YieldTypes` holds Culture, Diplomacy, Food, Gold, Happiness, Production, Science.

Recorded in `docs/engine-limits-from-probes.md` 1.3a and the global `engine-closed.md`. Logs:
`modtest152-UI.log`, `modtest153-UI.log`.

## Mod tests 154-156 - the one-time enclave stance, watched (2026-09-18)

The stance rework (`ui/emigration-stance-payout.js`: a stance pays Culture, Science, Influence or Gold once at
recognition, sized from the host's income, and a non-Gold stance costs Gold), watched on AugustusExp66 with the
mod pass off. The probes build the real decision view for a Bulgarian enclave in London, raise it with the
shipped `showDilemma`, and press a button wired to the shipped `applyQuarterChoice`. London: 804 Gold banked,
705 Gold, 251 Science and 221 Culture a turn; Bulgaria is at war with England, so the payout is halved.

```
154 CHOICE a Learn their horsemanship  Science 375, price 1410 Gold  disabled=true (804 banked)
154 CHOICE b Tax their trade           Gold 530, free
154 PRESS  the disabled button -> nothing chosen, nothing paid
155 GRANT  +2000 Gold first; PRESS a -> CHOSEN a; gold 2804.06 -> 1394.06 (-1410); tech 1033 -> 1408 (+375);
           record.applied {SCIENCE 375, GOLD 1410, once:true}; tile placed IMPROVEMENT_HIDDEN_FORTRESS
156 figures moved onto the buttons: "Learn their horsemanship  +375 [icon:YIELD_SCIENCE] −1410 [icon:YIELD_GOLD]"
           iconsInLabel 2 / 1 / 0, no raw [icon: tag visible; same payout as 155
```

- **The payout lands exactly as stated**, on the tech in progress, and the price leaves the treasury at once.
- **An unaffordable stance is grayed out and its press does nothing.** At 804 Gold the Science stance's price
  (two turns of a 705-Gold income) could not be paid, so only the free Gold stance was open. A treasury smaller
  than two turns' income is common, so the price may often lock the Culture / Science / Influence stances;
  `quarterStanceCostTurns` is the knob.
- **Button captions draw the yield icons** (as in mod test 130). The longest caption nearly fills the button.

Screenshots: `shots/modtest154-enclave-stance-popup.png` (figures in the body) and
`shots/modtest156-enclave-stance-popup.png` (figures on the buttons). Logs: `modtest154-UI.log` to
`modtest156-UI.log`.

## Mod test 157 - Steam retakes of shots 08 and 09 (2026-09-18)

After the stance rework, on the Steam set's own game (mod test 142's turn-106 save, `run-promo144.sh`): a Bulgar
enclave in Washington, D.C., the real pop-up (buttons "Learn their horsemanship +1040 Science −1515 Gold", "Tax their
trade +1135 Gold", "Let them be"), then the first stance pressed and the placed tile (a Hidden Fortress over a mine)
framed with the enclave tooltip reading "Recognized: Learn their horsemanship". `docs/steam-screenshots/08` is a
1572×982 crop of `shots/modtest157b-stance.png`; `09` is `shots/modtest157b-tooltip.png` at 1920 wide.

- **Pinning the hover panel: hover ONCE.** The first run re-sent the plot-cursor event every 100 ms, and each one made
  the panel re-place itself at the last real mouse position, so it drew in the top-left corner. Sending the hover
  once and then only holding `left` / `top` kept it beside the tile (the mod test 145 recipe, corrected).

## Mod test 158 - Steam retakes of shots 05 to 08 (2026-09-18)

The four decision pop-ups on the current build, one run on the Steam set's game (turn-106 promo save,
`run-promo144.sh`), camera on Washington, D.C., each dialog dismissed through its last button before the next.

```
05 refugee   fireRealDilemmaForTest -> "Welcome them in: [pop] +1, [gold] -30, [happy] -10" / "Settle the frontier: ..." /
             "Turn them away: [influence] -20"   (costs on the buttons: another session's change, uncommitted today)
06 newcomer  arrivalPromptView(Washington, 1 point of Bulgarian refugees) -> Choose where they settle / Let the city
             settle them / Later
07 callhome  callHomeView FOREIGN, live flows (13 points abroad) -> three Gold sizes, three Influence sizes, Leave
08 stance    quarterView (Bulgar) -> "Learn their horsemanship: [science] +1040, [gold] -1515" / "Tax their trade:
             [gold] +1135" / "Let them be"   (enclave captions now in the refugee / call-home shape)
```

Crops centered on each dialog's rect (viewport 2880x1800 CSS = 3024x1890 px, x1.05): 05 and 08 1572x982, 06
1452x906, 07 1920x1200 (the call-home dialog is 1087 px tall, more than the old 1074 frame).

## Mod test 159 - the newcomer pop-up's button figures, watched, and shot 06 (2026-09-18)

The Newcomers / Refugees pop-up now states on each button what it gives: the population on all three, and on
"Let the city settle them" the summed yields of the tiles `autoTiles` predicts (the same `pickExpandPlot` rule
`placeOnTile` uses, each pick removed before the next; nothing when `arrivalPreferSpecialists` is on). Turn-106
promo save, Washington, D.C. given one real pending point with `addRuralPopulation(+1)`.

```
offered EXPAND plots  4006 {F1 P3 H1}   3905 {F1 P4 H2}      (no resource tile: the first offer is taken)
button                Let the city settle them: [pop] +1, [food] +1, [production] +3, [happiness] +1
pressed (autoPlace)   placed=1, pending 1 -> 0, offered now []
city net delta        FOOD +1, PRODUCTION +3.45, HAPPINESS +1, GOLD +1.15, SCIENCE +1.22, CULTURE +0.59, INFLUENCE +0.28
```

- **The predicted tile is the tile taken**, and its yields reach the city. The city also gains a little more than
  the tile shows: its production bonus (x1.15) and small per-population yields. The button understates, never
  overstates.
- `docs/steam-screenshots/06-newcomer-placement.jpg` is a 1452x906 crop of `shots/modtest159-newcomer.png`.
