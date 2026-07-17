# Emigration — Indefinitely Paused Features

Features that were **designed in full but deliberately not built**, parked here with the design intact and
the reason for the pause. This is not a queue — nothing here is scheduled, and nothing here should be
picked up without first clearing the blocker named in its entry.

> **How this differs from the neighbouring docs.**
> - [emigration-roadmap-and-backlog.md](emigration-roadmap-and-backlog.md) — work we intend to do, with a
>   *revisit-if* trigger.
> - [wont-fix-with-justifications.md](wont-fix-with-justifications.md) — closed by decision; do not
>   re-attempt.
> - **This file** — good designs with no path to shipping *right now*. They may never ship. Kept because
>   the design work is real and re-deriving it would cost more than storing it.
>
> **Standing convention.** If one of these ships, delete its entry here and document the shipped behaviour
> where the feature lives. If one is formally abandoned, move it to `wont-fix-with-justifications.md` with
> a verdict. Don't let an entry rot in place.

---

## Cultural Enclaves — the three unbuilt stages

**Context.** The Cultural Enclave system shipped (foreign-origin gate, standing-stock bar,
dwell/cooldown/cap gates, the `none → foothold → established` arc, the decision modal + 44-civ registry
and quotes, change-of-hands, contested/war strain, the per-civ cap, and a player-built per-civ enclave
improvement). The three stages below were specced alongside it and never built. All three were designed
against the **old per-turn `grantYield` stance model**, before the enclave became a real built
improvement — which is why the reward-model question (roadmap §22a) gates most of them.

Triaged 2026-07-16. Code identifiers read `quarter`; the player-facing term is `enclave`.

### Blocker shared by all three: nobody has measured how often an enclave forms

`quarterMinStock: 3` / `quarterEstablishedShare: 0.3` / `quarterEnclaveStickiness: 0.25` /
`quarterDwellTurns: 8` have never been measured against played games. The one datapoint is a player
reporting enclaves weren't happening at all — which is *why* `quarterEnclaveStickiness` exists. Extending
a stage arc that most games never reach is not worth doing. **Measure first** (same measure-first stance
as roadmap §27). This blocks judging the value of every entry below.

---

### 1. Blended / host-imprint enclave (the mature end-state)

**Status:** paused — conditional. *Blocked on* roadmap §22a (the reward-model decision) **and** the
measurement above.

**Triage:** the strongest narrative case of the three — a diaspora *shaping* the host rather than
dissolving into it is the whole point of the feature, and the arc currently just stops at `established`.
But its **mechanics are now largely unimplementable as designed**: "keep the benefit, reduce the penalty
by a configured fraction" assumed a per-turn `grantYield` we could re-scale at will. If §22a makes the
built improvement canonical, the reward is a static `Constructible_YieldChanges` row, and CANTFIX-1
establishes that a mod cannot re-scale that at runtime. The design already warned blending "must not
become a free second reward layer"; the engine now enforces that for us.

**If it is ever built: chronicle + readout milestone only.** Same shape as the shipped foothold. No yield
change, no `preserve`/`blend` branch, no `quarterBlendPenaltyRelief`. That is roughly a day's work and
delivers the story, which was always the real goal.

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

### 2. Petition / secession / uprising

**Status:** paused — **recommend against building as specced.** *Revisit only if* all three hold: (a)
roadmap §22a is settled, (b) enclaves are confirmed common in normal play, (c) a live probe shows a mod
can induce the native revolt pipeline.

**Triage — four independent reasons, any one sufficient to defer:**

1. **Its payoff depends on an unproven hook.** The good version ends in a real `BY_REVOLT` city transfer.
   The probe plan below was never run, and the neighbouring probe for a *far* smaller ask (place one
   improvement) came back dead — see CANTFIX-1. The realistic outcome is the mod-owned consolation path
   (riots/unrest pressure), which is a lot of machinery for a chronicle line.
2. **It's gated behind a state that barely occurs.** `quarterEnclaveStickiness` had to be added because
   enclaves weren't forming at all. This then requires an established enclave **plus** a sustained >55%
   foreign majority **plus** multi-turn unrest **plus** a live recipient civ. Most games would never fire
   it.
3. **It's the largest surface in the design** — a 5-state machine, 9 new config keys, a new persisted
   record, `CityTransfered` wiring, and escalation touching unrest/happiness — landing on the same
   `contested` state §22a is about to renegotiate.
4. **It carries the heaviest sensitivity load.** See the guardrail below. That's manageable — the shipped
   contested-enclave prose manages it well — but every line needs that same care, which is real cost, and
   it should be spent on a feature that will actually be seen.

**If it is ever built:** build the **petition warning only** (chronicle + readout + unrest pressure) and
stop there. The outcome ladder's paths 3–4 are where the unproven engine dependency lives.

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

**Probe plan (never run) — do this before promising any native-defection outcome:**
1. Check whether any exposed runtime object offers a callable revolt path beyond the fixed operation enums.
2. Verify whether a mod can deliberately apply or intensify the relevant unhappiness-effect states in a
   chosen city strongly enough to make the engine's own revolt pipeline fire.
3. Verify whether `CityTransfered` / transfer-type reads expose `BY_REVOLT` clearly enough to react.

Until that probe succeeds, this feature is **native-sympathetic but mod-owned**: it leans on the same
inputs and surfaces as the game's revolt crisis, but must not assume it can invoke the engine's actual
city-defection routine.

---

### 3. Enclave progression screen

**Status:** paused as a *screen* — **the useful 80% is live work, tracked as roadmap §22b** (a city-readout
subpanel). Nothing here is blocked; it is folded into §22.

**Triage:** the only one of the three with a live, confirmed problem behind it — the stance yield is
invisible (CANTFIX-1) — and most of the state it needs is already persisted, so the cost is mostly the
panel itself. But a *dedicated screen* is over-built: the enclave already announces itself via the modal,
the build menu, the chronicle, and an on-map marker. Ship the field list below as a **city-readout
subpanel**, which is the same surface §22b needs anyway. Drop `quarterProgressionScreenEnabled` — a readout
line doesn't need a flag.

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
