# Emigration — Won't-Implement Decisions (with justifications)

The canonical record of **features we designed or attempted and then decided cannot be built** — each
with the concrete reason there is no viable path, and a one-line **verdict**. These looked shippable but
hit a hard engine limit, a native crash, or an unproven-and-untestable hook, so they are documented here
to stop anyone (including future sessions) from re-discovering and re-attempting them.

Almost everything here is **enclave** work — the enclave lifecycle repeatedly ran into the same wall:
Civ VII gives a UI-script mod no way to place a yield-bearing entity, bind art to a custom
constructible, attribute a runtime yield to the player's UI, or safely make a custom improvement
buildable by every civ. The vacated-tile marker sits at the end for the same underlying reason — the
engine exposes no per-tile "unworked" signal.

> **How this differs from the neighbouring docs.**
> - [emigration-roadmap-and-backlog.md](emigration-roadmap-and-backlog.md) — work we intend to do, each
>   with a *revisit-if* trigger.
> - [wont-fix-with-justifications.md](wont-fix-with-justifications.md) — decisions **not to change**
>   existing, working behaviour (by-design mechanics, tidies not worth the churn). Closed by judgment,
>   not by an engine wall.
> - **This file** — features with **no path to shipping**: proven-impossible or removed because they
>   broke the game. Every entry below is blocked by a hard limit (engine wall, native crash, unproven
>   hook); a few carry a narrow *revisit only if the engine changes* trigger. This file is **also the
>   home for indefinitely-paused designs** — features parked with no path to shipping right now, whether
>   the blocker is a hard limit or only **priority / unmeasured value**. A design paused for priority
>   alone (no engine wall) belongs here too, tagged **`Paused — not engine-blocked`** so it's not
>   mistaken for a proven can't-do.
>
> **Standing convention — keep this list current.** When a feature is abandoned because it cannot be
> built (engine limit, native crash, no exposed hook), or parked indefinitely for priority/unmeasured
> value, **add it here** as a `##` entry with: what was proposed, why it was tempting, the concrete
> reason it won't ship, what we did instead, and a **verdict** (mark priority-pauses
> `Paused — not engine-blocked`). When a *judgment* not to change working behaviour is made instead, that
> goes in [wont-fix-with-justifications.md](wont-fix-with-justifications.md).

---

## Buildable per-civ enclave IMPROVEMENT — REMOVED (caused a native AI-turn crash)

**Proposed / shipped, then removed:** generate per-civ `IMPROVEMENT_EMIG_ENCLAVE_<CIV>` constructibles
(`CityBuildable=true`, civic-tree unlock) so the player could *build* the enclave they earned and have
its `Constructible_YieldChanges` **natively attributed** in the yields breakdown. This was the "What
shipped instead" answer to CANTFIX-1 below — until it turned out to crash the game.

**Why it was tempting:** it directly solved the CANTFIX-1 visibility goal (a real, breakdown-visible
yield source) using the one thing the engine *does* let a mod do — let the player build something.

**Why it can't be done — CONFIRMED native crash (2026-07-17), proven by elimination.** The feature's
design required the improvement to be buildable by **every** civ (the AI has to be able to form enclaves
too), so it was unlocked universally rather than civ-locked. Result: a deterministic
`SIGSEGV / KERN_INVALID_ADDRESS at 0x278` on thread `AsyncWorker1`, mid-AI-turn, byte-identical native
stack every time. The AI `ConstructibleBroker` evaluated all 45 enclave improvements in **every** city
and segfaulted while committing a build (`MARKRUNNING`).

- **Isolation test (the cheap disproof, run first):** blanking the enclave improvement XML → **no
  crash** (reached turn 21). That single test located the cause; the `UNIQUE_IMPROVEMENT` tag and the
  negative-yield row were both *wrong* guesses that an attribute-first theory would have chased.
- **Why it's unfixable, not just buggy:** the crash is the AI evaluating a universal, non-civ-locked
  custom improvement. No shipping community mod does a universal custom improvement — they are **all**
  civ-locked precisely so only the owning AI evaluates them. But civ-locking defeats the feature (every
  civ must be able to form enclaves). The two ways to avoid a buildable improvement entirely — runtime
  placement and runtime modifier-attach — are both **confirmed impossible** (see CANTFIX-1). And the
  "earned" gate is JS-only, so there is no engine-visible condition to hide the build from the AI.
  Every route out lands back on the crash.

**What we did instead (2026-07-17, at the author's direction):** removed the entire buildable-enclave
feature and archived it (13 files) at
[`tower_mods/_archived-emigration-enclave-feature/`](../../_archived-emigration-enclave-feature/) — full
design preserved in its [`docs/cultural-enclaves.md`](../../_archived-emigration-enclave-feature/docs/cultural-enclaves.md).
Patched out the couplings (`emigration-quarter.js` built-enclave double-pay guard dropped,
`emigration-city-panel.js` `invested:false`, `emigration-selftest.js` probe imports → inert no-ops,
modinfo enclave ActionGroups/items, the `test:enclave-built` script). **The STANCE / decision-modal
enclave system was kept** — it doesn't build anything, doesn't crash, and is separate.

**Verdict:** removed permanently. Do **not** reintroduce a universal (non-civ-locked) buildable custom
improvement — it crashes the AI turn, and there is no engine gate to keep the AI from evaluating it.
Revisit only if a future patch either exposes a build-eligibility hook a mod can drive, or fixes the
`ConstructibleBroker` evaluation of universal custom improvements. The consequence for the yield-
visibility goal (CANTFIX-1) is that its "shipped instead" route is now gone too — see the next entry.

---

## Enclave STANCE yields in the GPT banner / global yields breakdown (CANTFIX-1)

> **Status (closed 2026-07-16; updated 2026-07-17):** both runtime routes are confirmed dead, so the
> **stance** yield can never reach the banner/breakdown — that is the can't-do. The workaround that once
> closed the *feature goal* (ship the enclave as a **player-built improvement** the engine attributes
> natively) **was itself removed the next day** because it crashed the AI turn — see the entry above. So
> the enclave's yield is **not** natively attributed anywhere today; the stance stays a treasury/stat
> effect, surfaced only in the mod's own city readout (roadmap §22b).

**Proposed:** make the "Tax them"-style enclave stance yields show as a real per-turn source in the top
banner (gold-per-turn) and the game's global yields breakdown, instead of the current invisible per-turn
`Players.grantYield` treasury injection ([emigration-effects.js `applyQuarterYields`](../ui/emigration-effects.js),
driven by [emigration-quarter.js `tickContestedQuarters`](../ui/emigration-quarter.js)).

**Why it's tempting:** the player sees no GPT change when they tax an enclave, and the border-policy
cards already surface a real per-turn yield via an `EFFECT_PLAYER_ADJUST_YIELD` modifier — so it *looks*
like the enclave should be able to as well.

**Why it can't be done (from a UI-script mod):** the banner and breakdown read ONLY the engine's
Modifier/building yield sources. A UI-script mod cannot create or attach such a source at runtime:
1. **No runtime modifier-attach API exists** — searched all 1,110 JS files across 231 community mods;
   the only runtime yield writes are `grantYield` and `changeGoldBalance`, both of which move the
   balance/stat without a breakdown source row.
2. **Auto-placing a real yield-bearing entity at runtime — CONFIRMED FAILED.** `Game.PlayerOperations`
   `CREATE_ELEMENT {Kind:"CONSTRUCTIBLE"}` for a tile IMPROVEMENT. The first probe was invalid (it never
   sent the op — gated behind a `CityOperations.canStart("BUILD")` check improvements don't use). The
   corrected Self-Test probe ([ui/emigration-enclave-probe.js](../ui/emigration-enclave-probe.js)) sends
   it directly; placement does not take. Route disproven.

The border policies only work because they ride the game's native Tradition/policy slot, which the
engine attaches; an emergent, per-city, player-chosen enclave stance has no equivalent slot.

**What we tried instead, and why it also failed.** The engine won't let a mod *place* an improvement, but
it will let the player *build* one — so per-civ `IMPROVEMENT_EMIG_ENCLAVE_<CIV>` constructibles with real
`Constructible_YieldChanges` rows were shipped (natively attributed, breakdown-visible). That met the
player-visible goal for one day, then was **removed** because a universal buildable custom improvement
crashes the AI turn (see the entry above). No native-attribution route survives.

**Verdict:** **Closed can't-do** for the stance yield specifically — both runtime routes are disproven,
the built-improvement workaround crashed and was removed, and the stance stays a treasury/stat effect
permanently. Do not re-attempt either runtime route or the universal buildable improvement. The stance's
per-turn yield is made legible only inside the mod's **own** city readout / enclave panel
([emigration-city-panel-data.js](../ui/emigration-city-panel-data.js), roadmap §22b).

---

## A distinct 3D model for the per-civ enclave constructibles

**Proposed:** give each of the 45 per-civ Cultural Enclave constructibles
([data/emigration-enclave-improvements.xml](../data/emigration-enclave-improvements.xml), generated by
[scripts/gen-enclave-improvements.mjs](../scripts/gen-enclave-improvements.mjs)) its own on-map 3D model
by reusing an existing building/improvement's art via `VisualRemap`.

**Why it's tempting:** the enclave is a real constructible on a tile, so it *should* have a model like
every shipped building; an invisible tile reads as unfinished.

**Why it can't be done — CONFIRMED engine limitation (2026-07-15):** Civ VII exposes **no moddable way to
bind a 3D model to a custom constructible.** `VisualRemap` — the only art hook — works **only for UNITS**;
for buildings/improvements it does nothing (and the community "Buildings visual remap fix" addon is
*deprecated* because it makes the AI's copies of a remapped building invisible — a non-resolvable engine
bug). There is no modder asset SDK to author a new model. Verified every way: improvement donors
(SOUQ, FARM) and building donors (MONUMENT, GRANARY) all rendered invisible even when built + completed on
a proper tile; `ArtDef.log` never even references the remap. The only community workaround — hijack an
existing shipped building's identity (override its DB values so the game draws its real model) — cannot
scale to 45 distinct types and can't be a unique/quarter building, so it's unusable here. Sources:
CivFanatics threads *empty-visuals-for-custom-civ-uniques* (697154), *visualremaps-visuals-for-custom-units*
(697233), and the deprecated *addon-buildings-visual-remap-fix* (32160).

**What we did instead:** the enclave stayed a plain tile IMPROVEMENT identified in-game by the tile
**tooltip** and (while it existed) its native **yield in the breakdown**, with its on-map presence
painted by the mod itself: [ui/emigration-enclave-markers.js](../ui/emigration-enclave-markers.js) draws
the civ symbol icon + a "<Civ> Enclave" label over each enclave tile from the mod's own `WorldUI`
overlay group, bypassing the art pipeline entirely. (The overlay marker outlived the buildable
improvement — it reads the enclave's game-state presence, so it survives the improvement's removal.)

**Verdict:** a real 3D model is impossible via data mods (hard engine limit, not our bug); the WorldUI
overlay marker is the shipped substitute. Do not re-attempt `VisualRemap` for constructibles.

---

## Blended / host-imprint enclave — the mature end-state stage (designed, unbuildable as designed)

**Status:** abandoned **as designed** (was "paused — conditional"). The full drafted design is preserved
below because re-deriving it would cost more than storing it. The *narrative* payoff remains reachable in
a stripped form — **see the verdict** — but the mechanical design cannot be built.

**Why it can't be built as designed:** its mechanics assumed a per-turn `grantYield` we could re-scale at
will ("keep the benefit, reduce the penalty by a configured fraction"). With the stance a treasury effect
and the built-improvement route removed (CANTFIX-1 and the crash entry above), there is no re-scalable
yield to soften. The design already warned blending "must not become a free second reward layer"; the
engine now enforces that for us. It was also gated behind the unmeasured enclave-formation rate (below),
so most games would never reach the stage even if the yield problem vanished.

> **Shared blocker (all three enclave stages): nobody has measured how often an enclave forms.**
> `quarterMinStock: 3` / `quarterEstablishedShare: 0.3` / `quarterEnclaveStickiness: 0.25` /
> `quarterDwellTurns: 8` have never been measured against played games. The one datapoint is a player
> reporting enclaves weren't happening at all — which is *why* `quarterEnclaveStickiness` exists.
> Extending a stage arc that most games never reach is not worth doing even setting the engine walls
> aside. (Code identifiers read `quarter`; the player-facing term is `enclave`.)

**Verdict:** abandoned as a mechanical stage — the re-scalable-yield design is dead. If the *story* is
ever wanted, build **chronicle + readout milestone only** (same shape as the shipped foothold: no yield
change, no `preserve`/`blend` branch, no `quarterBlendPenaltyRelief`) — roughly a day's work, and it
delivers the narrative that was always the real goal. Revisit only if enclave-formation is measured to be
common enough to matter.

#### Preserved design

**Meaning.** A blended / host-imprint enclave is not just a larger foreign enclave. It means the host city
has lived with this community long enough that local life now carries both identities. The district still
remembers where it came from, but it is no longer merely "foreign families under strain"; it has become a
recognized part of the host city's own story.

**Narrative effect.** Chronicle this as a distinct slow-burn milestone: *"Over generations, the Roman
Quarter became part of Carthage itself."* Keep the origin visible in the name and prose; do **not** erase
the diaspora into a generic host district.

**Drafted gate (stage 3 of the arc).** Fires for an enclave that already exists and has remained important
over time: `stock ≥ quarterBlendMinImmigrants`, `lead.share ≥ quarterBlendShare`, held for
`quarterBlendTurns` while the origin continues integrating. **None of those config keys exist.**

**Drafted mechanical meaning** — the mature stage was to do three things:

1. **Persist the origin visibly.** The enclave continues to exist as a named place, and the city's
   progression/readout screens keep showing its origin, stage, and chosen tradition.
2. **Reduce pure-enclave strain.** Part of the original downside softens, because the district is no
   longer newly-arrived or precarious. The safe version: keep the main benefit, reduce the penalty by a
   configured fraction, leave the total reward bounded. *(This is the part the improvement model breaks.)*
3. **Leave a host imprint.** A small, persistent sign that the diaspora changed local identity. Prefer a
   conservative signal over a large yield: a tiny culture/happiness nudge, a persistent follow-up tag in
   the chronicle/progression screen, or an integration floor / blended-identity marker so the origin does
   not simply fade to zero while the enclave persists.

**Important constraint.** Blending must not become a free second reward layer on top of the original
enclave. The purpose is historical persistence and local identity, not snowball yields. Default to "same
enclave, softer penalty, stronger story" rather than "new major bonus unlocked."

**Drafted implementation shape.** Persist an enclave `stage` and `stageTurn` in the tile record. When the
blended threshold is crossed, emit a follow-up chronicle and either auto-upgrade the active option to its
blended form, or open a light follow-up branch:

- `preserve`: keep more of the origin-flavoured benefit, keep more of the penalty
- `blend`: slightly soften the penalty, gain the host-imprint tag, keep the benefit bounded

**Player-facing prose (drafted, never rendered).** `{Name}` = enclave name; `{Where}` = truthful
capitalised edge phrase; `{Adj}` = origin civ adjective; `{City}` = host city name.

> **BLENDED ENCLAVE**
> **The {Name} Becomes Part of {City}**
>
> Generations have passed {Where}. What began as a foreign enclave is now woven into the city's own life:
> still marked by {Adj} memory, but no longer merely apart from its neighbours. The enclave's strain
> softens, but its identity remains visible.

---

## Petition / secession / uprising (designed, depends on an unproven engine hook)

**Status:** abandoned **as specced** (was "paused — recommend against building as specced"). The full
drafted design is preserved below. The good version ends in a real `BY_REVOLT` city transfer through the
engine's revolt pipeline — a hook a UI-script mod has **never been shown able to invoke**, and the
neighbouring probe for a far smaller ask (place one improvement) came back dead (CANTFIX-1).

**Why it can't be built as specced — four independent reasons, any one sufficient:**

1. **Its payoff depends on an unproven, untested hook.** The revolt pipeline appears engine-owned: a mod
   can *observe* warnings, conditions, and completed `CityTransfered` results, but no callable
   "trigger revolt / transfer by revolt" path has ever been found or verified. The probe plan (below)
   was never run; the realistic outcome is the mod-owned consolation path (riots/unrest pressure) — a lot
   of machinery for a chronicle line.
2. **It's gated behind a state that barely occurs.** `quarterEnclaveStickiness` had to be added because
   enclaves weren't forming at all. This then requires an established enclave **plus** a sustained >55%
   foreign majority **plus** multi-turn unrest **plus** a live recipient civ. Most games would never fire
   it.
3. **It's the largest surface in the design** — a 5-state machine, 9 new config keys, a new persisted
   record, `CityTransfered` wiring, and escalation touching unrest/happiness.
4. **It carries the heaviest sensitivity load** (see the binding guardrail below) — every line needs the
   same care the shipped contested-enclave prose gets, which is real cost, and should be spent on a
   feature that will actually be seen.

**Verdict:** abandoned as specced. If it is ever revisited, build the **petition warning only** (chronicle
+ readout + unrest pressure) and stop — paths 3–4 of the outcome ladder are where the unproven engine
dependency lives. Revisit only if **all three** hold: (a) roadmap §22a is settled, (b) enclaves are
confirmed common in normal play, and (c) a **live probe** shows a mod can induce the native revolt
pipeline. Until that probe succeeds, do not promise any native-defection outcome.

#### Framing guardrail (sensitivity) — binding on any future attempt

> This models wartime strain, contested enclaves, petitions, and uprisings — mechanics that sit
> dangerously close to the "enemy-alien / fifth-column / dual-loyalty" trope historically weaponized
> against diasporas (Jews, Japanese-Americans, and others). All player-facing prose built from these
> mechanics **must** center the *host's* (often unjust) suspicion and the diaspora's severed ties home,
> and treat an uprising as a failure of the host's treatment of the community — **never** assert or imply
> the diaspora is inherently disloyal, treacherous, or a natural fifth column. The shipped
> contested-enclave string is the reference tone. A "petition to rejoin a homeland" must read as a
> political response to sustained mistreatment/unrest, not as proof that immigrants' true loyalty always
> lies elsewhere.

#### Preserved design

**Why closed borders are not part of this.** Closed borders should **not** add a separate enclave-specific
slowdown. They already reduce new cross-border arrivals upstream, so immigrant mass grows more slowly on
its own; a second direct penalty would double-count the same cause. What the enclave layer *should* react
to is **diaspora tension**, especially war with the origin civ.

**War-strain rule.** If a host owns a large diaspora from civ `X` and then enters war with `X`:

1. **Owner-level war strain.** Aggregate enemy-origin diaspora mass/share across the host civ; large enemy
   communities create a global happiness penalty rather than an enclave-only local malus — a broad
   domestic problem, not only a neighborhood one. *(This part **shipped**: `accrueContestedStrain` +
   `diasporaWarStrainCap`.)*
2. **City-level hotspot strain.** Cities with an established or blended enclave from that enemy origin get
   additional unrest pressure or a temporary enclave-specific happiness hit
   (`contestedQuarterPenalty`). *(Shipped.)*
3. **Contested state.** An enclave under war strain enters `contested`: blended upgrades are paused, some
   follow-up benefits can freeze or regress, and the UI shows the district as politically tense.
   *(Shipped, minus the blended half.)*
4. **Possible uprising.** If a contested enclave sits in a city already under unrest / low happiness /
   violence pressure long enough, fire an uprising-style consequence. Prefer reusing existing unrest,
   pressure, or violence channels over a separate rebel-combat system. **(Not built.)**

**Majority-immigrant cities.** Nothing in the composition ledger caps a foreign-origin bucket below 50%, so
a city can become majority immigrant demographically while remaining under the host's political ownership.
A petition is the political stage between "restless diaspora" and "actual defection."

**State machine.** Persist a bounded petition record keyed by `cityKey|originCiv`:
`{ cityKey, owner, originCiv, recipientCiv, share, migrantMass, stage, majoritySince, tensionTurns,
warnedTurn, lastEscalationTurn, nativeResolved, resolvedTurn }`, where `stage` is
`none → petitioning → defiant → uprising-risk → resolved`.

**Exact default gates.**
1. `petitionMajorityShare(0.55)` — 55%, not 50%, to avoid one-turn oscillation around parity.
2. `petitionReleaseShare(0.48)` — hysteresis floor; once a petition starts it only clears below 48%.
3. `petitionMinImmigrants(250000)` — scaled-people floor so tiny settlements cannot trigger it.
4. `petitionMinTurns(3)` — majority + tension must hold 3 consecutive turns before the warning fires.
5. `petitionDefiantTurns(6)` — unresolved petition escalates to `defiant` after 6 tense turns.
6. `petitionUprisingTurns(9)` — unresolved defiant petition enters `uprising-risk` after 9 tense turns.
7. `petitionPressureWeight(1.5)` — per-turn unrest / pressure multiplier while a petition is active.
8. `petitionNeedsQuarter: true` — require an established or contested enclave, so this is a
   durable-community mechanic, not a fresh-camp one.

**Recipient resolution (exact order).**
1. **Primary:** the majority origin's homeland civ, if alive and still holding ≥1 settlement.
2. **Exploration religious override:** if `petitionCanUseReligionRecipient` is on and the city is in a
   religious-revolt frame (foreign religion + unhappiness), the recipient may instead be the founder of
   the city's majority religion.
3. **No viable recipient:** do **not** open a petition — keep only the contested-city unrest path. A city
   should not petition to join a dead or nonexistent polity.

**Escalation rules.**
1. `petitioning`: emit warning/readout/chronicle once; apply light happiness / unrest pressure.
2. `defiant`: increase enclave tension, pause blended progression, add stronger unrest pressure.
3. `uprising-risk`: drive native-compatible revolt conditions aggressively (unhappiness, prolonged unrest,
   religious mismatch); if native revolt still doesn't fire, unlock the mod-owned riot / sabotage /
   militia consequence path.
4. `resolved`: clear on a native `BY_REVOLT` transfer, on share falling below `petitionReleaseShare`, on
   recipient disappearance, or after a recovery window of positive happiness and no unrest.

**Outcome ladder.** The petition must not instantly transfer the city.
1. **Petition warning.** *"The majority of the Roman families in Carthage are petitioning to join Rome."*
2. **Pressure phase.** Extra happiness loss, unrest, or contested tension while unresolved.
3. **Resolution path A: native revolt fires.** If the city's happiness state is bad enough and the engine's
   own revolt pipeline takes over, treat that as the canonical defection outcome.
4. **Resolution path B: mod-owned uprising.** If native revolt does not fire, escalate through riots /
   sabotage / militia pressure / enclave regression without assuming we can force a city transfer.

**Native integration point.** Wire `engine.on("CityTransfered", …)` in `emigration-main.js`; if the
transfer type is `BY_REVOLT` and the city had an active petition, mark it `nativeResolved`, chronicle it as
the canonical outcome, and clear contested state for the old owner.

**Files.** `emigration-composition.js` / `emigration-diaspora.js` (majority-origin detection + sustained
share tracking), `emigration-engine.js` or `emigration-effects.js` (pressure/unrest escalation),
`emigration-city-readout*.js` / notifications (petition visibility), `emigration-main.js`
(`CityTransfered` wiring), plus the contested-state logic in `emigration-quarter.js`.

**Config.** `petitionMajorityShare`, `petitionReleaseShare`, `petitionMinImmigrants`, `petitionMinTurns`,
`petitionDefiantTurns`, `petitionUprisingTurns`, `petitionPressureWeight`, `petitionNeedsQuarter`,
`petitionCanUseReligionRecipient`. **None exist.**

**Tests (drafted).** A crafted city with one foreign origin >55% and sufficient mass enters petition state;
below-threshold cities don't. Petition escalates unrest under bad happiness. A native `CityTransfered` with
revolt transfer type resolves the petition; otherwise the mod-owned unrest path fires. Cover hysteresis
(55% starts / 48% clears), recipient selection (origin homeland vs religion founder), no-recipient
suppression, and enclave-gated activation.

**Risk.** Medium–high — thresholds too low make cities feel politically unstable too often; too high and
the feature never appears.

#### Native-game scoping (as investigated — re-verify before trusting)

> **Citations unresolvable (2026-07-16).** The `base-standard/data` paths this section originally cited
> **do not resolve from this repo** — the checked-in `civilization_vii_1.4.1_game_files/` is only the Mac
> app-bundle shell (`Info.plist`, `MacOS`, `Resources/Base/Assets`), with no `modules/base-standard/` tree
> and no gameplay XML. Neither file exists anywhere in the repo, so **nothing below has been re-verified**;
> it is recorded as written. Re-check against a real game install (or a copy of base-standard under
> `other_peoples_mods/*/base-standard/`, the only base-standard data present). This is part of why this
> feature is triaged as probe-first.

What was believed to exist natively:
1. **Real revolt conditions.** Base happiness data defines `CityRevolt`, `ReligiousRevolt`, and
   `CityRioting` as unhappiness effects in `base-standard/data/happiness-identity.xml` *(unverified)*.
2. **Real revolt transfer.** Base narrative-crisis effects include an `EFFECT_CITY_TRANSFER_OWNER` with
   `TransferType = BY_REVOLT` in `base-standard/data/narrative-crises-stories-gameeffects.xml`
   *(unverified)*.
3. **Real native warnings / notifications.** `ADVISOR_WARNING_CITY_REVOLT` and `NOTIFICATION_REVOLT` ship
   in base advisory / notification data, with text saying a city on the brink of revolt may defect if it
   stays unhappy.
4. **Native crisis framing.** Civilopedia and crisis text present Antiquity revolts and Exploration
   religious revolts as engine-supported crisis types, not flavor text.

What appears **not** exposed to a UI gameplay mod:
1. No discovered PlayerOperation / CityOperation / UnitOperation / command that says "trigger revolt now"
   or "transfer city by revolt".
2. The revolt path appears **engine-owned**: the UI can observe warnings, conditions, and completed
   transfer results, but there is no proven callable hook for invoking `BY_REVOLT` on demand.
3. `Game.CrisisManager` is visible for **read-side state** only — not a writable revolt trigger.

What **is** exposed well enough to react after the fact:
1. Base UI already reads city transfer results and types after ownership changes (the city banner checks
   `city.mostRecentTranseferType` against `CityTransferTypes.*`), so a revolt result should be detectable
   once the engine performs it.
2. The engine exposes a `CityTransfered` event mods can subscribe to. Even without calling revolt directly,
   we can respond to a native revolt: chronicle it, update enclave state, clear or contest an enclave, and
   attach the correct transfer-story text.

**Probe plan (never run) — would be required before promising any native-defection outcome:**
1. Check whether any exposed runtime object offers a callable revolt path beyond the fixed operation enums.
2. Verify whether a mod can deliberately apply or intensify the relevant unhappiness-effect states in a
   chosen city strongly enough to make the engine's own revolt pipeline fire.
3. Verify whether `CityTransfered` / transfer-type reads expose `BY_REVOLT` clearly enough to react.

Until that probe succeeds, this feature is **native-sympathetic but mod-owned**: it leans on the same
inputs and surfaces as the game's revolt crisis, but must not assume it can invoke the engine's actual
city-defection routine.

---

## Enclave progression *screen* (dedicated screen abandoned; the readout subpanel is live roadmap §22b)

**Status:** the **dedicated screen** is abandoned as over-built. **This is not a dead feature** — the
useful ~80% of it (a per-enclave field list) is live work tracked as a **city-readout subpanel** in
[emigration-roadmap-and-backlog.md](emigration-roadmap-and-backlog.md) §22b, which is the same surface
the stance-visibility problem (CANTFIX-1) needs anyway. Only the *separate screen* is recorded here as
won't-implement.

**Why the dedicated screen is over-built:** the enclave already announces itself via the decision modal,
the build menu (while the improvement existed), the chronicle, and the on-map marker. A whole new screen
duplicates surfaces the player already has. Drop `quarterProgressionScreenEnabled` — a readout line
doesn't need a flag.

**Verdict:** don't build a dedicated progression *screen*. Ship the field list below as the city-readout
subpanel under roadmap §22b instead; most of the state it needs is already persisted, so the cost is
mostly the panel. Read-only is fine for a first ship.

#### Preserved design

**Persisted per-enclave state the design assumed** (most of this exists today in the tile record):
`originCiv`, `tileKey`, `stage: foothold | quarter | blended | contested`, `formedTurn`, `stageTurn`,
`migrantMass`, `shareBand`, `optionId`, `tension`.

**Chronicle follow-ups it would enable** — slow-burn storytelling rather than only the formation moment:

- *a foreign community took root here*
- *the Roman Quarter was formally recognized*
- *over generations it became part of Carthage*
- *war with Rome turned the quarter restless*
- *the quarter changed hands and a new people defined the ward*

**The progression surface should show, per enclave:**

1. enclave name and origin civ
2. city and tile flavor/location phrase
3. current stage (`Foothold`, `Established`, `Blended`, `Contested`)
4. immigrant mass / share / integration trend
5. chosen option and current benefit / penalty state
6. any current war-strain or unrest warning
7. next milestone hint (e.g. *"Likely to become a recognized quarter if integration continues"*)

Read-only is fine for a first ship. The value is clarity: it lets the player see the long historical growth
of enclaves even when no single turn produced a dramatic wave. Think of it as the enclave equivalent of
*trading posts grow into towns*.

---

## Vacated-tile on-map marker (the tile can't even be identified)

**The ask (workshop feedback, JNR):** when rural population emigrates the mod calls
`city.addRuralPopulation(-1)`; the engine then unassigns a worker from some tile, leaving the
improvement intact but **unworked**. Mark that vacated tile on the map (icon/label, or "mark it as
pillaged and block repair") the way the destination enclave is marked, so the loss reads visually.

**Why it's tempting:** we already paint on-map markers for enclaves
([ui/emigration-enclave-markers.js](../ui/emigration-enclave-markers.js)), so "do the same for the
origin tile" looks like a small reuse.

**Why it can't be done — CONFIRMED (2026-07-15), the tile can't even be IDENTIFIED:** unlike an enclave
(a real Constructible that persists in game state and is re-scannable any time via
`MapConstructibles.getConstructibles`), a vacated tile leaves **no readable trace**. The mod doesn't
choose the tile — the engine does — so the only way to identify it is to diff the city's worked-plot
set around the removal. Three probe variants, all ✗ (shipped in the Self-Test screen as the evidence
trail — `runVacatedSurfaceProbe` / `runVacatedDiffProbe` / `runVacatedTurnArm` + `runVacatedTurnRead`
in [ui/emigration-enclave-probe.js](../ui/emigration-enclave-probe.js)):

1. **Worked-set surface** — `city.Workers.GetTilePlacementInfo` / `GetAllPlacementInfo` is the
   **specialist** subsystem (`NumWorkers`/`MaxWorkers`/`CurrentYields`), NOT rural tile-working: only
   1 plot read `NumWorkers>0` on a rural-5 city, and `workerPopulation` was `undefined`. No
   `IsWorked`/`Assigned` field exists.
2. **Inline −1 diff** — removing a rural pop (rural 5→4) changed **nothing** in any per-plot signal.
3. **Across-end-turn diff** — armed, removed 1 rural, ended a full turn, re-read all **41** owned plots
   on three signals (`getYieldsWithCity`, constructible signature, specialist `NumWorkers`): **not one
   plot changed.** So it wasn't a timing artifact. The engine reassigns rural tiles internally with no
   per-tile "now unworked" flag exposed to UI script, the rural improvement stays intact, and
   `getYieldsWithCity` is a *hypothetical if-worked* value that never drops.

JNR's "mark as pillaged + block repair" is separately rejected regardless: it's a real game-state
mutation with a real yield penalty (double-punishes the player), breaks the read-only-overlay design
that keeps this mod co-load-safe, and no-ops on unimproved worked tiles.

**What we did instead:** nothing on the tile — the event is communicated at the **city** level (toasts /
notifications / city readout), and the workshop page explains that the destination enclave is marked
but the origin tile isn't, because the game gives modders no per-tile unworked signal.

**Verdict:** marking (or pillaging) the vacated tile is impossible — the tile is **unidentifiable** from
a UI-script mod, not merely unpaintable. Do NOT re-open this: do not re-probe `city.Workers`,
`getYieldsWithCity`, or constructible scans for a "which tile went unworked" read. The probe buttons +
`runVacated*` code stay in the Self-Test module as the evidence trail. Revisit only if a future game
patch adds a rural-tile-worked accessor.
