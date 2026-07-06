# Emigration — Cultural Enclaves: Design & Implementation Plan

> **Status:** extracted from [feature-improvements-plan.md](feature-improvements-plan.md) §6 (Feature F)
> for deeper refinement. This is the authoritative spec for the **Cultural Enclaves** feature; the parent
> plan links here. Cross-references to `§16.x` and other features (I, H, R) refer to sections in
> [feature-improvements-plan.md](feature-improvements-plan.md).
>
> **Terminology (2026-07-05):** the player-facing term is now **"enclave"** (e.g. *the Roman Enclave*,
> *Cultural Enclave*), not "quarter". The **canonical player-facing prose lives in §3.1** and is what the
> implementation ships. The older design/algorithm body below (§1–§2, §4–§10) still says "quarter" for the
> internal concept — read every such prose "quarter" as "enclave"; a mechanical rename of that body text is
> deferred (it is interleaved with code tokens and links that must not change). **Code identifiers are
> unchanged** and still read `quarter` — function names (`quarterName`, `quarterOptionsFor`), LOC keys
> (`LOC_EMIG_QTR_*`), CONFIG keys (`quartersEnabled`, `quarterFromShare`, …), the `EmigrationQuarters_v1`
> state key, and the `emigration-quarter*.js` file names all stay as-is (renaming them would break saves
> and buys nothing). When this doc names a code token, treat the literal `quarter` spelling as truth.
>
> House-style conventions from the parent plan apply verbatim: every new behaviour is **flag-gated** in
> [emigration-config.js](../ui/emigration-config.js) and, where player-facing, a tunable in
> [emigration-tunables.js](../ui/emigration-tunables.js) (defaults conservative); new `ui/*.js` and
> `data/*.xml` files are registered in [emigration.modinfo](../emigration.modinfo); new visible strings
> ship in **all** locales; each feature ships a node test harness wired into `package.json` and
> `scripts/required-scripts-gate.mjs`; ESLint complexity ≤ 10. Line numbers are hints — treat the
> **function name** as source of truth and re-grep before editing.

---

## 1. Overview *(higher — gameplay)*

**Goal.** When a diaspora reaches **real cumulative mass** in a host city and then advances through
**integration**, the newcomers "keep a district of their own". Turn that long arc into a staged,
player-readable feature: a visible **foothold**, then a **named, foreign-flavoured Cultural Enclave** on a
specific edge tile, and finally, for the largest and longest-lived communities, a **blended / host-imprint
quarter** that has become part of the city's identity. The quarter is named after the **origin** population
(e.g. *American Quarter*, *Roman Quarter*), and each choice is a **scaled-down, city-local echo of that
civilization's real gameplay identity** — always a **benefit paired with a matching drawback**, with an
in-fiction justification. The reward is small, bounded, and flag-gated, so both the cumulative-migration
system and the integration system you already simulate *matter* mechanically without snowballing.

Five rules define the feature:
1. **Named for the newcomers.** A quarter is named after the **origin** civ's people, not the host.
2. **Never your own people.** A civ **never** forms a quarter for its own diaspora — the origin must be a
   **foreign** civ (`lead.civ !== comp.owner`'s civilization). Self-origin blends are chronicled by the
   existing follow-up line (Feature I) only; they never open a quarter or a choice.
3. **Minimum standing stock required.** A quarter is only viable while the diaspora is a **real standing
  presence right now**; share alone is insufficient (a tiny hamlet that happens to be 40% foreign is not a
  quarter). The gate reads the **netted composition ledger** — the origin's *current* pop points, after
  integration / return-home / attrition — not lifetime inflow. Require the lead foreign origin's current
  `pts >= QUARTER_MIN_STOCK` (5 points) before any quarter event can fire. Because it is current stock, a
  diaspora that later integrates or leaves falls back below the line. *(Superseded design: an earlier draft
  gated on cumulative lifetime arrivals `migrantMass >= quarterMinImmigrants`; that total never decremented,
  so a city could clear it long after the diaspora had gone — fixed to standing stock.)*
4. **A real choice with trade-offs.** The chronicle moment presents **2–3 options**, each a small
   **tile/city-scoped** yield tied to the origin civ's actual bonuses, **each with a downside** and a
   one-line justification. There is no strictly-dominant option.
5. **Grounded in the origin civ.** The benefits/penalties are **scaled-down, city-specific versions of
   that civ's real Civ VII uniques** (per the registry in §7), not generic filler.
6. **No stacking — quarters are replaced, not accumulated (see §6).** One quarter per tile. If a tile
   already holds a quarter and a **different** origin later blends onto the **same tile**, it does **not**
   add a second quarter: it fires a **"the quarter changes hands"** change-chronicle event, **removes the
   old modifier, and rewrites the tile's bonus** to the new origin's (a fresh choice is offered).
7. **Both mass and integration matter.** Quarter progression is not share-only and not integration-only.
  A diaspora must first accumulate enough **migrant mass** to become durable, then continue through
  **integration** milestones to deepen from foothold → established quarter → blended / host-imprint
  quarter.
8. **Large diasporas can shape the host, not only be absorbed by it.** The end-state is not simply
  "the foreign bucket shrinks." A mature quarter can become a permanent part of the host city's local
  character, with chronicle follow-ups, a persistent blended identity, and tension if the host later goes
  to war with that origin.

**Current state.** Integration-over-time lives in `integrateCity()` /
[emigration-composition.js](../ui/emigration-composition.js#L410). Diaspora *visibility* milestones are
already detected by tier in `detectFoundingForCity()`
([emigration-diaspora.js](../ui/emigration-diaspora.js#L127), `DIASPORA_STEP = 0.15`). Per-tile origin
assignment already exists — `distributeTiles(plots, comp, scaledPeople)`
([emigration-ethnicity-distribution.js](../ui/emigration-ethnicity-distribution.js#L93)) returns
`[{ x, y, civ, people, density }]`, so a quarter can be pinned to a concrete `(x,y)` edge plot. Truthful
edge-of-city phrasing already exists in `resolveQuarter(keys, seed)`
([emigration-quarter-phrases.js](../ui/emigration-quarter-phrases.js)). The origin **demonym** comes from
`narrativeCiv()` ([emigration-naming.js](../ui/emigration-naming.js)). The choice **modal** already
exists as `showDilemma()` ([emigration-dilemma-view.js](../ui/emigration-dilemma-view.js)) — a centered,
native-styled panel that renders a title, prose, and choice buttons. The one-time yield plumbing exists
in [emigration-effects.js](../ui/emigration-effects.js) (`Players.grantYield` via `deduct()` — grants
positive too).

## 2. Detect and progress the quarter (per-tile, foreign-origin)

Add `detectQuarterForCity(city)` next to `detectFoundingForCity()` in
[emigration-diaspora.js](../ui/emigration-diaspora.js), called from `recordChroniclePass()` (**L169**):

1. `comp = compositionForCity(city)`; skip if `civHidden(comp.owner)`.
2. `lead = leadForeignOrigin(comp)` — **must be foreign**: if `lead.civ` resolves to the host's own
   civilization, **return** (rule 2, no self-quarter). `leadForeignOrigin()` already excludes the owner
   *player*, but a captured/allied city can share a *civilization* with the diaspora origin — compare the
   resolved `CivilizationType`, not just the player id.
3. Compute immigrant mass for `(city, origin)` as `migrantMass = max(lead.pts, cumulativeArrivals)` where
  `cumulativeArrivals` is a persisted sum of migrated `people` for that pair (folded from migration
  records in [emigration-migration-stats.js](../ui/emigration-migration-stats.js)).
4. Resolve the origin's **densest edge plot** from `distributeTiles(...)` for `lead.civ` as the candidate
  quarter tile `(x,y)`. Dedupe/replacement is **keyed on the tile**, not `(city,origin)` (see §6):
  `quarterKey = "quarter:" + x + "," + y`.
5. Evaluate the diaspora's **stage** (see §2.1) from both cumulative mass and integration progression:
  foothold, established quarter, blended / host-imprint quarter. The same `(city, origin, tile)` can
  advance through stages over time; later stages never bypass the earlier cumulative-mass gate.

### 2.1 Stage progression: foothold → quarter → blended quarter

The quarter system should explicitly model **both** things you asked for earlier: durable settlement from
**cumulative migration** and later deepening via **integration**. The staged model is:

1. **Foothold (cumulative-migration milestone, no reward yet).** Fires when `migrantMass ≥
  CONFIG.quarterMinImmigrants` and `lead.share ≥ CONFIG.quarterFootholdShare`, even if the group is not
  yet highly integrated. This is a chronicle/readout/progression-state event, not the full reward.
  It says: *this is no longer a trickle; a real community exists here.*
2. **Established quarter (the current quarter moment, now explicitly both/and).** Fires only when the
  foothold exists **and** the diaspora has advanced into meaningful integration: `lead.share ≥
  CONFIG.quarterFromShare`, `migrantMass ≥ CONFIG.quarterMinImmigrants`, and the origin has crossed the
  integration / follow-up tier the blend narrative already tracks. This is where the named quarter,
  choice modal, and bounded trade-off modifier appear.
3. **Blended / host-imprint quarter (mature end-state).** Fires only for a quarter that already exists and
  has remained important over time: `migrantMass ≥ CONFIG.quarterBlendMinImmigrants`, `lead.share ≥
  CONFIG.quarterBlendShare`, and the city has held the quarter for `CONFIG.quarterBlendTurns` while the
  origin continues integrating. This is not "the foreign group disappeared"; it means the quarter has
  become part of the host city's local identity (see §6.1).

This staging keeps the historical arc readable:

- early wave: *a community forms*
- middle phase: *it becomes a recognized quarter*
- long-run phase: *it helps define the city itself*

## 3. The choice moment (reuses the dilemma modal)

On first **established-quarter** formation (or on a change-of-hands, §6), open a choice via `showDilemma()`
([emigration-dilemma-view.js](../ui/emigration-dilemma-view.js)) with:
- **eyebrow:** `"CULTURAL QUARTER"` (or `"THE QUARTER CHANGES HANDS"` on replacement).
- **title:** the quarter name from §5 (e.g. *"The American Quarter"*).
- **body:** `quarterLine(e)` from [emigration-narrative.js](../ui/emigration-narrative.js) — truthful
  prose that uses `resolveQuarter()` for the edge phrase ("…take shape by the harbour…").
- **choices:** the origin civ's 2–3 options from the registry (§7), each rendered
  `label` + `note` where the note states **both the gain and the cost** ("+2 Production on the quarter;
  −1 Happiness in the city").

Arbitration: quarter choices route through the **single dilemma arbiter** (parent plan §16.5) at **lower
priority than refugee dilemmas** (`conquest > humanitarian > quarter`), sharing the same
`DilemmaState.spree`/`lastTurn` rate-limit so two modals never race. If the player dismisses the modal,
default to the **first** option (the "keep it simple" one) — never leave a formed quarter without a
modifier.

**Per-civ enclave cap (per origin civ, NOT global).** Each origin **civilisation** may hold at most
**`MAX_ENCLAVES_PER_CIV` = 2** enclaves across the host's cities — independently: a host can hold two
Roman *and* two Norman *and* two Han enclaves at once. The count (`enclaveCountForCiv`) is per-origin, so
reaching the cap for one civ never blocks a different civ. Once an origin has two, no third *same-origin*
enclave is offered — `candidateFromSignal` returns null.

Identity is by **CivilizationType, not player.** Each record persists `originCiv` — the CivilizationType
captured *when the enclave formed* — so the cap is stable even if the origin player later changes
civilisation across an age, and two players sharing a civilisation count together. `enclaveCountForCiv`
compares `originCiv` (falling back to a live `civType(rec.civ)` for pre-persistence legacy records, and to
the raw origin player id only when neither civ resolves — a deterministic last resort, not a design
choice). A *different* origin overtaking an occupied tile is a change-of-hands (§6), not a new enclave, so
it is unaffected by the cap. This same per-civ count is the enclave's **ordinal** that picks quote A
(first same-origin enclave) vs quote B (second) in §8.

Footholds do **not** open the full modal; they only chronicle and surface in the progression UI. Blended /
host-imprint upgrades may either auto-upgrade the current enclave option or open a **lighter-weight**
follow-up choice if we want the player to decide whether the district preserves a stronger foreign identity
or becomes more hybridized (see §6.1). The main enclave choice remains the only guaranteed modal.

### 3.1 Finalized player-facing prose (source of truth for the LOC strings)

The canonical prose for every enclave state. **Implemented** blocks are live in the code today and match
`text/en_us/ModText.xml` verbatim (the JS fallback in the cited function is identical); **planned** blocks
(Foothold, Blended) describe states that are not yet rendered and are the spec for when they are built.
`{Name}` = the enclave name from `quarterName()` (e.g. *the Roman Enclave*); `{Where}` = a truthful,
capitalised edge phrase from `resolveQuarter()` (e.g. *By the harbour*); `{Adj}`/`{OriginCiv}` = the origin
civ's adjective/name; `{City}` = the host city name.

**Cultural Enclave — the decision modal** *(implemented — `quarterView()`, keys `LOC_EMIG_QTR_EYEBROW` /
`_TITLE` / `_BODY`; below the body a **single** attributed §8 quote (see §8 for the one-quote-per-enclave
rule), then each option renders its label + `{Gain}; {Cost}. {why}` note — options no longer carry quotes):*

> **CULTURAL ENCLAVE**
> **The {Name}**
>
> The {Adj} families of {City} have become more than new arrivals. {Where}, their shops, shrines,
> workshops, festivals, and habits now draw a life of their own — a district with a memory from elsewhere.
> Recognize the enclave, and decide what tradition the city will make room for.

**Foothold** *(planned — a chronicle/readout milestone, no modal; see §2.1):*

> **FOOTHOLD**
> **A Foreign Community Takes Root**
>
> The {Adj} families of {City} are no longer a trickle. {Where}, familiar speech, food, rites, and trades
> have begun to gather into a visible community. No formal enclave has been recognized yet.

**Blended Enclave** *(planned — mature end-state; see §6.1):*

> **BLENDED ENCLAVE**
> **The {Name} Becomes Part of {City}**
>
> Generations have passed {Where}. What began as a foreign enclave is now woven into the city's own life:
> still marked by {Adj} memory, but no longer merely apart from its neighbours. The enclave's strain
> softens, but its identity remains visible.

**The Enclave Changes Hands** *(implemented — `chronicleDecision()`, keys `LOC_EMIG_QTR_CHRON_HANDS_TITLE` /
`_BODY`):*

> **THE ENCLAVE CHANGES HANDS**
> **The Enclave Changes Hands**
>
> The old {OldName} has faded as its families moved on, married in, or were overtaken by new arrivals.
> {Where}, {NewAdj} households now give the ward its name, its customs, and its bargains.
>
> *(A fresh decision modal for the new origin then opens.)*

**Contested Enclave** *(implemented — `accrueContestedStrain()`, keys `LOC_EMIG_QTR_CHRON_RESTLESS_TITLE` /
`_BODY`):*

> **CONTESTED ENCLAVE**
> **War Tests the {Name}**
>
> War with {OriginCiv} falls hard on the {Name}: its families are cut off from kin in the fighting, and
> some neighbours meet them with cold looks, forgetting they did not choose this war. Until peace returns,
> that strain keeps the enclave from settling fully into the city's life.
>
> *(Framing rule: the strain is the host's — the enclave's severed ties home and its neighbours' unjust
> wartime suspicion. Never assert the diaspora is disloyal; the "doubted loyalties / fifth-column" register
> is out of bounds.)*

## 4. Apply the bounded reward + drawback

Add `applyQuarter(owner, tileKey, option)` to [emigration-effects.js](../ui/emigration-effects.js):
- Grant the option's **benefit** and its **penalty** through the existing `grantYield` path (a positive
  and a negative `deduct()` respectively). Benefits/penalties are **small** (default ±1–2) and
  **tile/city-scoped** by flavor (we can't bind a real per-tile modifier from a UI mod, so the effect is
  a small city-level yield delta *attributed* to the tile in the prose/chronicle).
- Record the applied modifier in the tile's persisted quarter record so §6 can **reverse it exactly**
  on replacement.
- **Cap** total active quarters per civ per age (`quarterCapPerAge`) so a magnet civ can't farm them.

## 5. Naming (origin demonym → quarter name; never the host)

Add `quarterName(originCiv)` to [emigration-naming.js](../ui/emigration-naming.js): map the origin
`CivilizationType` to a **demonym adjective** (registry column in §7, e.g. `CIVILIZATION_AMERICA →
"American"`) → `"<Adjective> Quarter"`. Fall back to `narrativeCiv(originCiv) + " Quarter"` for any civ
missing an explicit demonym so a new DLC civ still names cleanly. The host civ is **never** used for the
name — the name always reads as the *newcomers'* district.

## 6. No stacking — one quarter per tile, replaced on change of hands

This is the core anti-stacking rule. Persist a per-tile map
`quarters: Record<tileKey, { civ, optionId, age, turn, applied: { benefit, penalty } }>` in a small state
(`STATE_KEY = "EmigrationQuarters_v1"`), keyed by `"x,y"`.

- **Same origin, same tile, later turn:** no-op (already chronicled; the quarter persists unchanged).
- **Different origin blends onto an occupied tile:** it does **not** add a second quarter. Instead:
  1. **Reverse** the old option's applied yields exactly (grant `−benefit`, grant `+penalty` back) via
     `applyQuarter`'s inverse, so nothing accumulates.
  2. Fire a **change-chronicle** moment — eyebrow *"THE QUARTER CHANGES HANDS"*, title = the **new**
     quarter name, body = `quarterChangeLine(oldCiv, newCiv)` ("…the old <Roman> Quarter, its families
     long since moved on, is now the <Norman> Quarter…").
  3. Open a **fresh choice** for the new origin and **overwrite** the tile record with the new
     `{ civ, optionId, applied }`. The bonus is **rewritten, not summed**.
- **Age rollover:** quarters persist across ages (a tile keeps its identity) unless replaced. The
  per-age *cap* counts only quarters **formed** that age, so old quarters don't block new ones forever.

Chronicle kind: reuse `kind: "founding"` for the initial moment and add a `"quarter"` kind for the
change-of-hands entry. **This `"quarter"` kind, H's `"recap"`, and R's `"milestone"` are the same
coordinated union edit — see parent plan §16.4; add all kinds in one pass, not three** (union **L19**,
`KIND_LABEL` [emigration-chronicle-view.js](../ui/emigration-chronicle-view.js#L52), `chronicleTitle()`
**L224**).

### 6.1 Blended / host-imprint quarter (the mature end-state)

This is the deeper answer to the critique's point that large diasporas should sometimes **shape the host**
rather than only being absorbed by it.

**Meaning.** A blended / host-imprint quarter is not just a larger foreign enclave. It means the host city
has lived with this community long enough that local life now carries both identities. The district still
remembers where it came from, but it is no longer merely "foreign families under strain"; it has become a
recognized part of the host city's own story.

**Narrative effect.** Chronicle this as a distinct slow-burn milestone: *"Over generations, the Roman
Quarter became part of Carthage itself."* Keep the origin visible in the name and prose; do **not** erase
the diaspora into a generic host district.

**Mechanical meaning.** The mature stage should do three things:

1. **Persist the origin visibly.** The quarter continues to exist as a named place, and the city's
  progression/readout screens keep showing its origin, stage, and chosen tradition.
2. **Reduce pure-enclave strain.** Part of the original quarter downside softens, because the district is
  no longer newly-arrived or precarious. The easiest safe version is to keep the main benefit, reduce the
  penalty by a configured fraction, and leave the total reward bounded.
3. **Leave a host imprint.** The city retains a small, persistent sign that the diaspora changed local
  identity. Prefer a conservative signal over a large yield: a tiny culture/happiness nudge, a persistent
  follow-up tag in the chronicle/progression screen, or an integration floor / blended-identity marker so
  the origin does not simply fade to zero while the quarter persists.

**Important constraint.** Blending must not become a free second reward layer on top of the original
quarter. The purpose is historical persistence and local identity, not snowball yields. Default to
"same quarter, softer penalty, stronger story" rather than "new major bonus unlocked."

**Implementation shape.** Persist a quarter `stage` and `stageTurn` in the tile record. When the blended
threshold is crossed, emit a follow-up chronicle and either:

- auto-upgrade the active option to its blended form, or
- open a light follow-up branch such as `preserve` vs `blend`.

The conservative version is:

- `preserve`: keep more of the origin-flavoured benefit, keep more of the penalty
- `blend`: slightly soften the penalty, gain the host-imprint tag, keep the benefit bounded

This keeps the system readable without turning every mature quarter into a new subgame.

### 6.2 Closed borders, war strain, and uprisings

> **Framing guardrail (sensitivity).** This section models wartime strain, contested enclaves, petitions,
> and uprisings — mechanics that sit dangerously close to the "enemy-alien / fifth-column / dual-loyalty"
> trope historically weaponized against diasporas (Jews, Japanese-Americans, and others). All player-facing
> prose built from these mechanics **must** center the *host's* (often unjust) suspicion and the diaspora's
> severed ties home, and treat an uprising as a failure of the host's treatment of the community — **never**
> assert or imply the diaspora is inherently disloyal, treacherous, or a natural fifth column. The shipped
> contested-enclave string (§3.1) is the reference tone. A "petition to rejoin a homeland" must read as a
> political response to sustained mistreatment/unrest, not as proof that immigrants' true loyalty always
> lies elsewhere.

Closed borders should **not** add a separate quarter-specific slowdown by default. They already reduce new
cross-border arrivals upstream, so cumulative immigrant mass grows more slowly on its own. Adding a second,
direct "quarter formation speed" penalty on top of that would double-count the same cause.

What the quarter layer *should* react to is **diaspora tension**, especially when the host later goes to
war with the origin civ.

**Rule.** If a host owns a large diaspora from civ `X` and then enters war with `X`, apply a separate
owner/city tension check:

1. **Owner-level war strain.** Aggregate enemy-origin diaspora mass/share across the host civ. Large enemy
  communities create a global happiness penalty (`diasporaWarStrain`) rather than a quarter-only local
  malus. This matches your desire that it feel like a broad domestic problem, not only a neighborhood one.
2. **City-level hotspot strain.** Cities with an established or blended quarter from that enemy origin get
  additional unrest pressure or a temporary quarter-specific happiness hit (`contestedQuarterPenalty`).
3. **Contested-quarter state.** A quarter under war strain enters `contested` state: blended upgrades are
  paused, some follow-up benefits can freeze or regress, and the chronicle/progression UI shows the
  district as politically tense rather than peacefully blended.
4. **Possible uprising.** If a contested quarter sits in a city already under unrest / low happiness /
  violence pressure for long enough, fire an uprising-style consequence. Prefer reusing existing unrest,
  pressure, or violence channels over inventing a wholly separate rebel-combat system. The event can read
  as riots, sabotage, militia mobilization, or communal violence depending on the surrounding state.

#### Native-game scoping: what can be reused vs. what must be emulated

The base game does have a **very close native system** already: the Age-Crisis revolt pipeline.

What exists natively in game data:

1. **Real revolt conditions.** Base happiness data defines `CityRevolt`, `ReligiousRevolt`, and
  `CityRioting` as unhappiness effects in
  [../civilization_vii_1.4.1_gamefiles/Resources/Base/modules/base-standard/data/happiness-identity.xml](../civilization_vii_1.4.1_gamefiles/Resources/Base/modules/base-standard/data/happiness-identity.xml).
2. **Real revolt transfer.** Base narrative-crisis effects include an `EFFECT_CITY_TRANSFER_OWNER` with
  `TransferType = BY_REVOLT` in
  [../civilization_vii_1.4.1_gamefiles/Resources/Base/modules/base-standard/data/narrative-crises-stories-gameeffects.xml](../civilization_vii_1.4.1_gamefiles/Resources/Base/modules/base-standard/data/narrative-crises-stories-gameeffects.xml).
3. **Real native warnings / notifications.** The game ships `ADVISOR_WARNING_CITY_REVOLT` and
  `NOTIFICATION_REVOLT` in the base advisory / notification data, with text that explicitly says a city on
  the brink of revolt may defect if it stays unhappy.
4. **Native crisis framing.** Civilopedia and crisis text make clear that Antiquity revolts and
  Exploration religious revolts are already engine-supported crisis types, not just flavor text.

What appears **not** to be exposed to a UI gameplay mod:

1. There is **no discovered PlayerOperation / CityOperation / UnitOperation / command** that says
  "trigger revolt now" or "transfer city by revolt".
2. The revolt path appears to be **engine-owned**: the UI can observe warnings, conditions, and completed
  transfer results, but there is no proven callable hook for directly invoking `BY_REVOLT` on demand.
3. The Age-Crisis manager is visible for **read-side state** (`Game.CrisisManager`, crisis-stage reads,
  crisis card slot presence), but that is not the same thing as a writable revolt trigger API.

What **is** exposed strongly enough to react after the fact:

1. Base UI code already reads city transfer results and transfer types after ownership changes. The city
  banner checks `city.mostRecentTranseferType` against `CityTransferTypes.*`, which means a revolt result
  should be detectable once the engine has performed it.
2. The engine also exposes a `CityTransfered` event that mods can subscribe to. So even if we cannot call
  revolt directly, we can still respond to a native revolt when it happens: chronicle it, update quarter
  state, clear or contest a quarter, and attach the correct transfer-story text.

So the uprising feature should be scoped in two layers:

1. **Native-compatible trigger layer.** We should deliberately drive the same kinds of ingredients the
  native revolt system cares about: unhappiness, prolonged local distress, and special pressure in
  contested diaspora cities.
2. **Mod-owned consequence layer.** Unless a live probe proves otherwise, we should assume the actual
  `BY_REVOLT` city-transfer pipeline cannot be called directly. Our mod therefore needs its own
  consequence stack: quarter `contested` state, extra happiness / unrest pressure, violence/riot state,
  temporary city penalties, custom chronicle / warning surfaces, and optionally spawned local turmoil
  effects only when the local player is the owner.

This means the safest design is:

- **First preference:** try to push a city into the same danger zone as the native system, so the engine may
  produce its own revolt organically if the surrounding happiness state is bad enough.
- **Fallback / default:** if native revolt does not fire, still apply the mod's own uprising consequences so
  the feature remains readable and mechanically meaningful.

#### Probe plan before implementation

Before promising a full native-city-defection outcome, do one targeted live probe in a dev mod:

1. Check whether any exposed runtime object offers a callable revolt path beyond the fixed operation enums.
2. Verify whether a mod can deliberately apply or intensify the relevant unhappiness-effect states in a
  chosen city strongly enough to make the engine's own revolt pipeline fire.
3. Verify whether `CityTransfered` / transfer-type reads expose `BY_REVOLT` clearly enough for the quarter
  system to react after the fact.

Until that probe succeeds, this feature should be specified as **native-sympathetic but mod-owned**: it
leans on the same inputs and surfaces as the game's revolt crisis, but does not assume we can directly
invoke the engine's actual city-defection routine.

#### Majority-immigrant cities and petitions to join another civilization

Yes: under the emigration model, a city can absolutely become **majority immigrant**. The composition
ledger already tracks per-origin shares, and nothing in that model inherently caps a foreign-origin bucket
 below 50%. A city that has taken repeated refugee waves, long-run prosperity inflows, or slow cumulative
settlement can therefore become majority foreign in demographic terms even while remaining under the host's
political ownership.

That opens a natural **petition** mechanic.

**Interpretation.** A petition is the political stage between "restless diaspora" and "actual defection."
The city has not yet revolted, but a majority foreign-origin population is now publicly pushing to join a
different polity.

**Recommended gates.** Keep this strict so it remains exceptional:

1. A single foreign origin exceeds `petitionMajorityShare` (default implementation shape: `0.55`, with a
  lower release floor for hysteresis so the state does not flap around parity).
2. That origin also exceeds a real cumulative mass floor (`petitionMinImmigrants`) so the trigger cannot be
  tripped by a tiny city.
3. The city is unhappy / in unrest / under quarter tension for multiple turns.
4. There is a plausible recipient civ: normally the majority origin's homeland, but in Exploration a
  founder-religion recipient is also plausible when using the native religious-revolt framing.
5. The petition city is not simply a fresh war-camp: require either an established quarter or a sustained
  majority over `petitionMinTurns` so this reads as a durable political movement, not one bad turn.

**Outcome ladder.** The petition should not instantly transfer the city.

1. **Petition warning.** Chronicle / readout / notification: *"The majority of the Roman families in
  Carthage are petitioning to join Rome."*
2. **Pressure phase.** Apply extra happiness loss, unrest, or contested-quarter tension while the petition
  is unresolved.
3. **Resolution path A: native revolt fires.** If the city's broader happiness state is bad enough and the
  engine's own revolt pipeline takes over, we treat that as the canonical settlement defection outcome.
4. **Resolution path B: mod-owned uprising.** If native revolt does not fire, escalate through riots /
  sabotage / militia pressure / quarter regression without assuming we can force a city transfer.

This gives you the historical feel you want: a city can become demographically foreign-majority and begin
openly agitating to rejoin another civ, even if the technical city-transfer endpoint still depends on what
the native revolt pipeline is willing to do.

This gives you the dynamic you described:

- closed borders naturally slow new quarter growth by slowing arrivals
- war with a diaspora's homeland creates a broader domestic cost
- the biggest, most visible diaspora centers can become flashpoints

### 6.3 Chronicle follow-ups and a quarter progression screen

The quarter state should become the basis for **slow-burn historical storytelling**, not only the moment a
quarter first appears.

Persist enough state on each quarter to support this:

- `originCiv`
- `tileKey`
- `stage: foothold | quarter | blended | contested`
- `formedTurn`
- `stageTurn`
- `migrantMass`
- `shareBand`
- `optionId`
- `tension`

With that, the system can emit cumulative follow-ups such as:

- *a foreign community took root here*
- *the Roman Quarter was formally recognized*
- *over generations it became part of Carthage*
- *war with Rome turned the quarter restless*
- *the quarter changed hands and a new people defined the ward*

That same state also supports a **Quarter Progression** screen or panel, which is the right way to make
the long arc legible in play. Think of it as the quarter equivalent of *trading posts grow into towns*:
the player can see that a district is not static, but developing across stages.

The progression surface should show, per quarter:

1. quarter name and origin civ
2. city and tile flavor/location phrase
3. current stage (`Foothold`, `Established`, `Blended`, `Contested`)
4. immigrant mass / share / integration trend
5. chosen option and current benefit / penalty state
6. any current war-strain or unrest warning
7. next milestone hint (for example: *"Likely to become a recognized quarter if integration continues"*)

This screen can be read-only at first. The value is clarity: it lets the player see the long historical
growth of quarters even when no single turn produced a dramatic wave.

## 7. Per-civilization quarter registry (all 44 civs)

New pure module [emigration-quarter-bonuses.js](../ui/emigration-quarter-bonuses.js), a frozen registry
keyed by origin `CivilizationType`. It reuses the ability knowledge already curated in
[emigration-civ-tuning.js](../ui/emigration-civ-tuning.js) (which cites `Contents_1.4.1/resources/DLC`);
**final yields/uniques must be re-verified against that game data before coding** (house style — the
function name is truth, the numbers are a starting draft). Shape:

```js
/** @typedef {{yield:string, amount:number}} QYield */
/** @typedef {{id:string, label:string, benefit:QYield, penalty:QYield, why:string}} QOption */
/** @type {Record<string, { demonym:string, options: QOption[] }>} */
export const QUARTER_BONUSES = { /* CIVILIZATION_* → { demonym, options:[…] } */ };
```

Each civ offers **two trade-off options** (a third may be added later). "▸" reads *benefit ▸ cost ▸ why*.
Yields are small (±1–2) and grounded in the origin civ's real identity.

**Antiquity origins**

| Civ | Quarter | Option A (benefit ▸ cost ▸ why) | Option B (benefit ▸ cost ▸ why) |
| --- | --- | --- | --- |
| ABBASID | Abbasid Quarter | +Science ▸ −Gold ▸ House-of-Wisdom scholars translate, but their stipends drain the treasury | +Happiness ▸ −Production ▸ famed gardens and salons soothe the city, but few hands work the yards |
| AKSUM | Aksumite Quarter | +Gold ▸ −Culture ▸ Red-Sea traders enrich the docks, but coin flows to the quays, not the old rites | +Faith ▸ −Happiness ▸ their stelae-churches draw pilgrims, and the crowds throng the ward |
| ASSYRIA | Assyrian Quarter | +Production ▸ −Happiness ▸ siege-artisans man the foundries, but their martial bearing sours the ward | +Science ▸ −Gold ▸ captured codices fill the archives, but curating spoils costs coin |
| CARTHAGE | Punic Quarter | +Gold ▸ −Food ▸ Punic merchants fill the wharves, drawing hands off the fields | +Production ▸ −Culture ▸ shipwrights raise busy yards, and the city prizes tonnage over temples |
| EGYPT | Egyptian Quarter | +Culture ▸ −Gold ▸ monument-masons adorn the district, but upkeep of their works is dear | +Food ▸ −Production ▸ Nile-style flood-farming feeds the ward, but pulls labour off the works |
| GREECE | Greek Quarter | +Science ▸ −Happiness ▸ an agora of philosophers, and their factional politics | +Culture ▸ −Production ▸ theatres and porticoes flourish while the workshops idle |
| HAN | Han Quarter | +Food ▸ −Happiness ▸ intensive farming feeds many, at the cost of crowding | +Production ▸ −Gold ▸ public-works crews build fast, but the corvée is subsidised |
| KHMER | Khmer Quarter | +Food ▸ −Gold ▸ baray-style irrigation greens the fringe, but the waterworks cost coin | +Faith ▸ −Happiness ▸ their temple-processions draw great crowds that throng the streets |
| MAURYA | Mauryan Quarter | +Faith ▸ −Gold ▸ ascetic orders bless the ward, sustained by alms | +Food ▸ −Production ▸ stepwell gardens yield well, but tie up hands |
| MAYA | Maya Quarter | +Science ▸ −Production ▸ sky-watchers keep observatories, not workshops | +Food ▸ −Happiness ▸ dense milpa plots feed many, but crowd the fringe |
| MISSISSIPPIAN | Mississippian Quarter | +Culture ▸ −Gold ▸ mound-rites enrich the ward's life, funded by tribute | +Food ▸ −Production ▸ woodland gathering feeds the district, off the yards |
| PERSIA | Persian Quarter | +Gold ▸ −Happiness ▸ satrapal tribute flows in, and resentment with it | +Culture ▸ −Food ▸ walled pleasure-gardens delight, but eat good farmland |
| ROME | Roman Quarter | +Production ▸ −Happiness ▸ Roman engineering drives the works, but the legion's air chafes | +Gold ▸ −Culture ▸ their roads pull trade to the city, and coin sets the fashion |

**Exploration origins**

| Civ | Quarter | Option A (benefit ▸ cost ▸ why) | Option B (benefit ▸ cost ▸ why) |
| --- | --- | --- | --- |
| BULGARIA | Bulgar Quarter | +Production ▸ −Happiness ▸ horse-and-forge veterans work hard and brawl harder | +Gold ▸ −Culture ▸ frontier markets thrive, and the city keeps fuller ledgers than calendars |
| CHOLA | Chola Quarter | +Gold ▸ −Food ▸ Tamil maritime traders fill the harbours, drawing hands off the soil | +Faith ▸ −Happiness ▸ great temple-tanks draw pilgrims, and the festival crowds throng the ward |
| DAI_VIET | Dai Viet Quarter | +Culture ▸ −Gold ▸ wall-scholars keep learning alive, at public cost | +Production ▸ −Food ▸ fort-works employ many hands off the fields |
| HAWAII | Hawaiian Quarter | +Food ▸ −Production ▸ fish-ponds and reefs feed the ward, drawing hands off the yards | +Culture ▸ −Gold ▸ heiau rites enrich island custom, funded by the city |
| INCA | Inca Quarter | +Production ▸ −Gold ▸ terrace-masons and road-crews build superbly, at expense | +Food ▸ −Happiness ▸ mountain terraces feed many in a crowded ward |
| MAJAPAHIT | Majapahit Quarter | +Gold ▸ −Culture ▸ spice-route factors enrich the docks, and the wharves talk profit over pageantry | +Food ▸ −Production ▸ coastal fisheries feed the fringe off the yards |
| MING | Ming Quarter | +Gold ▸ −Production ▸ porcelain and silk factors fill the ledgers while the kilns run cool | +Culture ▸ −Happiness ▸ imperial arts refine the ward, and its finery outshines humbler streets |
| MONGOLIA | Mongol Quarter | +Production ▸ −Happiness ▸ horse-lines and smiths work fast; their swagger grates | +Gold ▸ −Culture ▸ steppe tribute-routes pay well, and the city counts coin where it once kept ceremony |
| NORMAN | Norman Quarter | +Production ▸ −Happiness ▸ castle-masons raise strong works and a martial air | +Gold ▸ −Food ▸ feudal rents fill the coffers, off the farms |
| SONGHAI | Songhai Quarter | +Gold ▸ −Food ▸ river-and-salt caravans fill the market, drawing hands off the soil | +Science ▸ −Happiness ▸ their scholars keep famed libraries, and famed feuds |
| SPAIN | Spanish Quarter | +Gold ▸ −Happiness ▸ treasure-fleet factors enrich the port amid conversion strife | +Faith ▸ −Culture ▸ their missions win souls and overwrite old custom |

**Modern origins**

| Civ | Quarter | Option A (benefit ▸ cost ▸ why) | Option B (benefit ▸ cost ▸ why) |
| --- | --- | --- | --- |
| AMERICA | American Quarter | +Production ▸ −Happiness ▸ factory-hands drive output, but the shifts breed unrest | +Culture ▸ −Gold ▸ their cinema and jazz enliven the ward, at a subsidy |
| BUGANDA | Bugandan Quarter | +Food ▸ −Gold ▸ lakeshore gardens feed the ward, tended at cost | +Culture ▸ −Production ▸ bark-cloth artisans enrich custom, off the yards |
| FRENCH_EMPIRE | French Quarter | +Culture ▸ −Production ▸ salons and Great Works flourish while workshops idle | +Gold ▸ −Happiness ▸ luxury trade enriches the ward, and its airs vex the poor |
| GREAT_BRITAIN | British Quarter | +Gold ▸ −Happiness ▸ counting-houses and clerks profit; the mills breed grievance | +Production ▸ −Food ▸ industrial works run hot, drawing hands off the farms |
| HEIAN | Heian Quarter | +Culture ▸ −Production ▸ courtly refinement flowers while the workshops idle | +Happiness ▸ −Gold ▸ their festivals lift the whole city, at the treasury's cost |
| ICELAND | Icelandic Quarter | +Production ▸ −Food ▸ shipwrights and sailors build and crew fast longships, drawing hands off the farms | +Culture ▸ −Gold ▸ saga-singers keep the ward's memory, funded by the city |
| MEIJI | Meiji Quarter | +Production ▸ −Happiness ▸ rapid industry drives output at a hard human pace | +Science ▸ −Culture ▸ headlong modernisation, and old custom set aside |
| MEXICO | Mexican Quarter | +Culture ▸ −Gold ▸ murals and fiestas colour the ward, funded by the city | +Happiness ▸ −Production ▸ tight-knit community lifts spirits over output |
| MUGHAL | Mughal Quarter | +Culture ▸ −Gold ▸ miniaturists and architects adorn the ward, at expense | +Gold ▸ −Food ▸ fine-textile trade fills the docks, drawing hands off the fields |
| PRUSSIA | Prussian Quarter | +Production ▸ −Happiness ▸ disciplined arsenals out-work the city, stiffly | +Science ▸ −Culture ▸ their war-academies teach hard, and set old ways aside |
| QING | Qing Quarter | +Food ▸ −Happiness ▸ dense growth feeds many in a crowded ward | +Gold ▸ −Production ▸ treaty-port factors fill the ledgers, and the workshops slow |
| RUSSIA | Russian Quarter | +Production ▸ −Food ▸ heavy-industry crews work hard in a hungry ward | +Culture ▸ −Gold ▸ their letters and theatre enrich the city, at a subsidy |
| SIAM | Siamese Quarter | +Culture ▸ −Gold ▸ temple-arts and dance enrich the ward, funded by the city | +Gold ▸ −Happiness ▸ their bustling trade pays well and crowds the streets |
| SILLA | Silla Quarter | +Happiness ▸ −Gold ▸ pagoda-rites lift the ward, sustained by alms | +Culture ▸ −Production ▸ their crafts refine custom while the workshops idle |

**Age-flex origins (Nepal, Ottomans, Pirate Republic, Qajar, Sengoku, Shawnee, Tonga)**

| Civ | Quarter | Option A (benefit ▸ cost ▸ why) | Option B (benefit ▸ cost ▸ why) |
| --- | --- | --- | --- |
| NEPAL | Nepali Quarter | +Food ▸ −Gold ▸ mountain terraces feed the ward, tended at cost | +Production ▸ −Happiness ▸ fort-masons raise strong works and a martial air |
| OTTOMANS | Ottoman Quarter | +Science ▸ −Gold ▸ külliye specialists teach and heal, at public cost | +Culture ▸ −Production ▸ grand celebrations enrich custom while the workshops idle |
| PIRATE_REPUBLIC | Buccaneer Quarter | +Gold ▸ −Happiness ▸ prize-goods and black markets pay well, lawlessly | +Production ▸ −Culture ▸ busy careening-yards work fast, and the port prizes speed over ceremony |
| QAJAR | Qajar Quarter | +Food ▸ −Gold ▸ walled garden-farms feed the ward, tended at cost | +Culture ▸ −Production ▸ Bāq celebrations enrich custom while the workshops idle |
| SENGOKU | Sengoku Quarter | +Production ▸ −Happiness ▸ castle-town armourers out-work the ward, sternly | +Gold ▸ −Food ▸ daimyō markets pay well, off the fields |
| SHAWNEE | Shawnee Quarter | +Food ▸ −Gold ▸ river-bottom gathering feeds the ward, at some cost | +Culture ▸ −Production ▸ council-rites enrich custom while the workshops idle |
| TONGA | Tongan Quarter | +Food ▸ −Production ▸ ocean fisheries feed the fringe, drawing hands off the yards | +Gold ▸ −Culture ▸ island trade-routes pay well, and the city keeps its accounts before its rites |

> The registry is **origin-agnostic about the host**: a *Roman Quarter* reads the same in a Norman or a
> Han city. Rule 2 still guarantees Rome's own cities never grow a Roman Quarter (self-origin is skipped
> before naming). A new DLC civ with no registry row still forms a quarter (fallback name + a neutral
> ±1 option pair) so the feature never throws on unknown civs.

## 8. Flavour quotes for the choice moment (real, attributed)

Each enclave shows **one** short **historical quote** in the choice modal (§3), as a single epigraph
between the body and the options (not one-per-option), so the moment reads as a page of history rather
than a menu. **Which of the civ's two quotes shows is set by enclave ordinal:** the origin's **first**
enclave shows quote **A**, its **second** shows quote **B** (`quarterView(quarter, ordinal)` →
`enclaveQuote()` in emigration-quarter.js; `ordinal` = count of the origin's existing enclaves). Since an
origin civ is **capped at two enclaves** per host (§3 / `MAX_ENCLAVES_PER_CIV`), both quotes are reachable
and never exhausted. Quotes are keyed
`QUARTER_QUOTES[civ][optionId] = { text, who, source }` in
[emigration-quarter-bonuses.js](../ui/emigration-quarter-bonuses.js) (same module as the registry) and go
in **all** locales as `LOC_EMIG_QUARTER_Q_*` strings (translated where a canonical translation exists;
otherwise the original with an English gloss).

**Curation rules (enforced by `tests/cultural-quarters.mjs`):**
- **Real + attributed.** Every entry names a **speaker** and a **source work**. Where a wording is a
  translation or an attribution is contested, it is marked *(attr. debated)* / *(trans.)* and **must be
  re-verified against the cited source before shipping** (house style — the citation is the source of
  truth, the wording a draft).
- **Culturally appropriate.** No genocidaires or hate figures (explicitly **no Hitler, no Stalin** — Russia
  uses Pushkin/Dostoevsky, America uses Coolidge/Early rather than any tainted industrialist). Where a
  civ's history involves conquest or colonialism, a **critical primary source from the period** is used
  rather than a triumphal one (e.g. Spain's conversion option quotes **Las Casas'** protest, not a
  conquistador).
- **Prefer the culture's own voice.** Use a primary source *from that people* first (Ashoka's edicts,
  the Ramkhamhaeng inscription, ʻŌlelo Noʻeau, Apolo Kaggwa); fall back to a named historian of that
  people only when no usable primary survives (Carthage, Chola, Buganda-crafts).

**Antiquity origins**

| Civ | Option A quote (— speaker, *source*) | Option B quote (— speaker, *source*) |
| --- | --- | --- |
| ABBASID | "طَلَبُ الْعِلْمِ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ. (Seeking knowledge is an obligation upon every Muslim.)" — the Prophet Muhammad, *Sunan Ibn Mājah 224* | "Baghdad became the intellectual capital of the medieval world." — Philip K. Hitti, *History of the Arabs* (1937) |
| AKSUM | "ΤΟΥΤΟ ΑΡΕΣΗ ΤΗ ΧΩΡΑ (Toûto arésē tê chôra — may this please the country.)" — Mani, *Kephalaia* (3rd c.) | "ፍሥሓ ፡ ለይኲን ፡ ለአሕዛብ (Fǝśśǝḥā läyǝkʷǝn läʾaḥzāb — let the people be glad.)" — King Ezana, *Ezana Stone inscription* (4th c., trans.) |
| ASSYRIA | "BÀD šalḫû ušēpišma uzaqqir ḫuršāniš (I had a wall built and raised it as high as mountains.)" — Sennacherib, *Taylor Prism* (7th c. BCE, trans.) | "aḫuz nēmeqī Nabû, kullat ṭupšarrūti (I grasped the wisdom of Nabû, the whole art of the scribe.)" — Ashurbanipal, *royal inscription* (trans.) |
| CARTHAGE | "Ἔδοξε Καρχηδονίοις Ἅννωνα πλεῖν ἔξω Στηλῶν Ἡρακλείων (It was resolved by the Carthaginians that Hanno should sail beyond the Pillars of Heracles.)" — Hanno the Navigator, *Periplus of Hanno* (5th c. BCE, trans.) | "νεωρίων αἱ κρηπῖδες ἐς ναῦς διακοσίας καὶ εἴκοσι πεποιημένων (The dockyard quays were built for two hundred and twenty ships.)" — Appian, *Roman History (Punica)* (2nd c., trans.) |
| EGYPT | "πλεῖστα θωμάσια ἔχει ἢ ἡ ἄλλη πᾶσα χώρη καὶ ἔργα λόγου μέζω παρέχεται (It has more marvels than any other land, and works too great for words.)" — Herodotus, *Histories*, Bk. II (trans.) | "Αἴγυπτος… δῶρον τοῦ ποταμοῦ (Egypt… is the gift of the river.)" — Herodotus (after Hecataeus), *Histories*, Bk. II (trans.) |
| GREECE | "ὁ ἀνεξέταστος βίος οὐ βιωτὸς ἀνθρώπῳ. (The unexamined life is not worth living.)" — Socrates, in Plato, *Apology* (trans.) | "φιλοκαλοῦμέν τε μετ' εὐτελείας καὶ φιλοσοφοῦμεν ἄνευ μαλακίας (We love the beautiful with economy, and wisdom without softness.)" — Pericles, in Thucydides, *History of the Peloponnesian War*, Bk. II (trans.) |
| HAN | "農，天下之大本也 (Agriculture is the great foundation of all under heaven.)" — Chao Cuo, *Memorial on the Value of Grain* (2nd c. BCE, trans.) | "倉廩實而知禮節。 (When the granaries are full, the people know propriety.)" — *Guanzi*, quoted in Sima Qian, *Records of the Grand Historian* (trans.) |
| KHMER | "大抵一歲中，可三四番收種。 (In general, three or four harvests a year can be had.)" — Zhou Daguan, *The Customs of Cambodia* (1296, trans.) | "當國之中有金塔一座 (At the centre of the kingdom stands a tower of gold.)" — Zhou Daguan, *The Customs of Cambodia* (1296, trans.) |
| MAURYA | "sabe munise paja mama (All men are my children.)" — Ashoka, *Kalinga Rock Edict* (3rd c. BCE, trans.) | "magesu pi me nigohani lopapitani… amba-vadikya lopapita (On the roads banyan trees were planted by me… and mango-groves.)" — Ashoka, *Pillar Edict VII* (trans.) |
| MAYA | "Xa q'ana jal, saqi jal u tio'jil (Merely yellow maize and white maize made their flesh.)" — *Popol Vuh* (Tedlock trans.) | "The Maya were the most brilliant civilization of the New World." — Michael D. Coe, *The Maya* (1966) |
| MISSISSIPPIAN | "Cahokia was the first city in what would become the United States." — Timothy Pauketat, *Cahokia* (2009) | "Maize agriculture underpinned the rise of the Mississippian towns." — George Milner, *The Moundbuilders* (2004) |
| PERSIA | "ἀρχὰς κατεστήσατο εἴκοσι, τὰς αὐτοὶ καλέουσι σατραπηίας (He set up twenty provinces, which they themselves call satrapies.)" — Herodotus, *Histories*, Bk. III (trans.) | "ἔστι δ' αὐτῶν ἃ καὶ ἐφύτευσα αὐτός (There are some of these that I planted myself.)" — Cyrus the Younger, in Xenophon, *Oeconomicus*, Bk. IV (trans.) |
| ROME | "Tot aquarum tam multis necessariis molibus pyramidas videlicet otiosas compares… (Would you set the idle Pyramids beside these many indispensable works of water?)" — Frontinus, *On the Aqueducts of Rome* (1st c., trans.) | "ἄγεται ἐκ πάσης γῆς καὶ θαλάττης ὅσα ὧραι φύουσι καὶ χῶραι ἕκασται φέρουσι (From every land and sea is brought whatever the seasons grow and each country bears.)" — Aelius Aristides, *Roman Oration* (2nd c., trans.) |

**Exploration origins**

| Civ | Option A quote (— speaker, *source*) | Option B quote (— speaker, *source*) |
| --- | --- | --- |
| BULGARIA | "The Bulgar state was built for war, its horsemen disciplined and its frontier strong." — Steven Runciman, *A History of the First Bulgarian Empire* (1930) | "The Bulgarians commanded the great roads of trade between the empires." — Steven Runciman, *A History of the First Bulgarian Empire* (1930) |
| CHOLA | "The Chola navy was the most powerful in the Indian Ocean of its day." — K. A. Nilakanta Sastri, *The CōĻas* (1955) | "Rajaraja raised the great temple at Tanjore, a wonder of the age." — K. A. Nilakanta Sastri, *The CōĻas* (1955) |
| DAI_VIET | "賢才國家之元氣 (Hiền tài là nguyên khí của quốc gia — the virtuous and talented are the vital force of the state.)" — Thân Nhân Trung, *Temple of Literature stele* (1442, trans.) | "訓練士卒，習爾弓矢 (Drill the soldiers, and practise the bow and arrow.)" — Trần Hưng Đạo, *Proclamation to the Officers* (1284, trans.) |
| HAWAII | "He aliʻi ka ʻāina; he kauwā ke kanaka." (The land is chief; man is its servant.) — *ʻŌlelo Noʻeau*, coll. Mary Kawena Pukui (1983) | "I ka ʻōlelo nō ke ola, i ka ʻōlelo nō ka make." (In the word there is life; in the word there is death.) — *ʻŌlelo Noʻeau*, coll. Mary Kawena Pukui (1983) |
| INCA | "desde que hay memoria de gentes no se ha leído de tanta grandeza como tuvo este camino hecho por valles hondos y por sierras altas (Since men have memory, none has read of so great a road as this, made through deep valleys and high sierras.)" — Pedro Cieza de León, *Crónica del Perú* (1553, trans.) | "En los cerros y laderas hazían andenes para allanarlas, como hoy se veen en el Cozco y en todo el Perú (On the hills and slopes they made terraces to level them, as are seen today in Cuzco and all Peru.)" — Garcilaso de la Vega, *Comentarios Reales de los Incas* (1609, trans.) |
| MAJAPAHIT | "milwang balyadi nusantara sahana saha prabhrti (All the vassals of Nusantara come, every one, bringing tribute.)" — Mpu Prapanca, *Nagarakretagama* (1365, trans.) | "民甚殷富，其各處番船多到此地買賣 (The people are very rich, and foreign ships from every place come here to trade.)" — Ma Huan, *Yingya Shenglan* (1433, trans.) |
| MING | "涉滄溟十萬餘里。 (We have traversed more than one hundred thousand li of vast water-spaces.)" — Zheng He, *Changle stele* (1431, trans.) | "In the late Ming, the appreciation of fine things became the mark of the cultivated gentleman." — Craig Clunas, *Superfluous Things* (1991) *(re-verify before ship)* |
| MONGOLIA | "One can conquer the world on horseback, but one cannot govern it from there." — attributed to Genghis Khan / Yelü Chucai *(attr. debated)* | "di capo de le 25 miglie egli truovano una posta, ove albergano li messaggi del Grande Sire (Every twenty-five miles the messengers find a post-house, where the Great Khan's couriers lodge.)" — Marco Polo, *The Travels* (trans.) |
| NORMAN | "and fylden þe land ful of castles (And they filled the land full of castles.)" — *Anglo-Saxon Chronicle* (trans.) | "þæt næs an ælpig hide… þæt næs gesæt on his gewrite (Not one single hide… was left unset in his record.)" — *Anglo-Saxon Chronicle*, on Domesday (1085, trans.) |
| SONGHAI | "sono molte botteghe di artigiani e mercatanti, e massimamente di tessitori di tele di bambagio (There are many shops of craftsmen and merchants, above all weavers of cotton cloth.)" — Leo Africanus, *Description of Africa* (1550, trans.) | "Vendonsi molti libri scritti a mano, che vengono di Barberia; e di questi si fa più guadagno che del rimanente delle mercatanzie (Many handwritten books are sold, brought from Barbary; and more profit is made on these than on all other goods.)" — Leo Africanus, *Description of Africa* (1550, trans.) |
| SPAIN | "Soy el rico Potosí, del mundo soy el tesoro, el rey de los montes y la envidia de los reyes (I am rich Potosí, treasure of the world, king of the mountains and envy of kings.)" — Luis Capoche, *Relación de la Villa Imperial de Potosí* (1585, trans.) | "Han muerto y destruido tan infinito número de ánimas los cristianos… por la insaciable codicia de oro. (The Christians have destroyed such infinite numbers of souls… out of insatiable greed for gold.)" — Bartolomé de las Casas, *A Short Account of the Destruction of the Indies* (1552, trans.) |

**Modern origins**

| Civ | Option A quote (— speaker, *source*) | Option B quote (— speaker, *source*) |
| --- | --- | --- |
| AMERICA | "The chief business of the American people is business." — Calvin Coolidge, *address to newspaper editors* (1925) | "America will be remembered for the Constitution, jazz music, and baseball." — Gerald Early, in Ken Burns, *Jazz* (2001) |
| BUGANDA | "The banana was the staple food of the country; plantations surrounded every house." — John Roscoe, *The Baganda* (1911) | "Agali awamu ge galuma ennyama. (Teeth set together are the ones that chew the meat — unity gives strength.)" — after Apolo Kaggwa, *The Customs of the Baganda* (1905) |
| FRENCH_EMPIRE | "If you are lucky enough to have lived in Paris as a young man, it stays with you." — Ernest Hemingway, *A Moveable Feast* (1964) | "L’art de l’imposition consiste à plumer l’oie pour obtenir le plus possible de plumes avec le moins possible de cris. (The art of taxation is to pluck the goose so as to get the most feathers with the least hissing.)" — Jean-Baptiste Colbert *(attr.)* |
| GREAT_BRITAIN | "A project fit only for a nation of shopkeepers." — Adam Smith, *The Wealth of Nations* (1776) | "And was Jerusalem builded here, among these dark Satanic Mills?" — William Blake, *Milton* (1804) |
| HEIAN | "春はあけぼの、やうやう白くなりゆく山ぎは… (In spring, the dawn — when the slowly paling mountain rim grows faintly light.)" — Sei Shōnagon, *The Pillow Book* (c. 1002, trans.) | "一条の大路、所なく、むくつけきまで騒ぎたり (The great avenue, with no room to spare, was astir with the festival throng.)" — Murasaki Shikibu, *The Tale of Genji* (11th c., trans.) |
| ICELAND | "En ef þú vill vera kaupmaðr… hygg þú vandliga at, hvárt skip þitt sé vel tjǫrgat (If you would be a merchant… look carefully whether your ship is well tarred.)" — *Konungs skuggsjá (The King's Mirror)* (13th c., trans.) | "Deyr fé, deyja frændr, deyr sjalfr it sama; ek veit einn, at aldri deyr: dómr um dauðan hvern. (Cattle die, kinsmen die, but the fame of a dead man never dies.)" — *Hávamál*, *Poetic Edda* (trans.) |
| MEIJI | "富国強兵 (Fukoku kyōhei — enrich the country, strengthen the army.)" — *Meiji national slogan* (trans.) | "天は人の上に人を造らず人の下に人を造らず。 (Heaven does not create one man above or below another.)" — Fukuzawa Yukichi, *An Encouragement of Learning* (1872, trans.) |
| MEXICO | "El solitario mexicano ama las fiestas y las reuniones públicas. (The solitary Mexican loves fiestas and public gatherings.)" — Octavio Paz, *The Labyrinth of Solitude* (1950, trans.) | "El respeto al derecho ajeno es la paz." (Respect for the rights of others is peace.) — Benito Juárez (1867) |
| MUGHAL | "اگر فردوس بر روی زمین است، همین است و همین است و همین است (If there is a paradise on earth, it is this, it is this, it is this.)" — attributed to Amir Khusrow, *Red Fort inscription* *(attr. debated)* | "L’or et l’argent, après avoir circulé dans le monde, passent dans l’Hindoustan, d’où ils ne reviennent plus. (Gold and silver, after circling the world, pass into Hindustan, from which they never return.)" — François Bernier, *Travels in the Mogul Empire* (1670s, trans.) |
| PRUSSIA | "La Prusse n’est pas un État qui possède une armée, mais une armée qui possède un État. (Prussia is not a state that has an army, but an army that has a state.)" — attributed to Mirabeau *(attr. debated)* | "Der Krieg ist eine bloße Fortsetzung der Politik mit anderen Mitteln. (War is the continuation of policy by other means.)" — Carl von Clausewitz, *On War* (1832, trans.) |
| QING | "天朝物產豐盈，無所不有，原不藉外夷貨物以通有無。 (The Celestial Empire possesses all things in abundance and lacks nothing; it has never relied on foreign goods.)" — Qianlong Emperor, *letter to King George III* (1793, trans.) | "貴國王累世相傳，皆稱恭順；唯通商已久，遂有夾帶鴉片 (Your kings for generations have professed obedience; yet trade being long established, opium has been smuggled in.)" — Lin Zexu, *letter to Queen Victoria* (1839, trans.) |
| RUSSIA | "Здесь будет город заложён на зло надменному соседу. (Here a city shall be founded, to spite our arrogant neighbour.)" — Alexander Pushkin, *The Bronze Horseman* (1833, trans.) | "Красота спасёт мир. (Beauty will save the world.)" — Fyodor Dostoevsky, *The Idiot* (1869, trans.) |
| SIAM | "เมื่อออกพรรษากรานกฐิน… เสียงพาทย์ เสียงพิณ เสียงเลื่อน เสียงขับ (When the rains end they hold the Kathin… with sounds of pipes, lute, chant, and song.)" — *Ramkhamhaeng Inscription* (1292, trans.) | "ในน้ำมีปลา ในนามีข้าว (In the water there are fish, in the fields there is rice.)" — *Ramkhamhaeng Inscription* (1292, trans.) |
| SILLA | "心生則種種法生，心滅則種種法滅 (When the mind arises, all things arise; when the mind ceases, all things cease.)" — Wonhyo (7th c., trans.) | "新羅全盛之時，歌吹滿路，晝夜不絕 (In Silla's golden age, song and music filled the streets, unceasing day and night.)" — *Samguk Yusa*, Iryeon (13th c., trans.) *(re-verify before ship)* |

**Age-flex origins**

| Civ | Option A quote (— speaker, *source*) | Option B quote (— speaker, *source*) |
| --- | --- | --- |
| NEPAL | "The whole valley is a highly cultivated garden, terraced and watered with singular industry." — William Kirkpatrick, *An Account of the Kingdom of Nepaul* (1811) *(re-verify before ship)* | "यो राजे दुई ढुङ्गाको तरुल जस्तो रहेछ (This realm is like a yam between two stones.)" — Prithvi Narayan Shah, *Divya Upadesh* (18th c., trans.) |
| OTTOMANS | "Halk içinde mu'teber bir nesne yok devlet gibi, olmaya devlet cihanda bir nefes sıhhat gibi. (Among people nothing is prized like the state — yet no fortune on earth is like one breath of health.)" — Evliya Çelebi, *Seyahatname (Book of Travels)* (17th c., trans.) | "Bir safâ bahşedelim gel şu dil-i nâ-şâda, gidelim serv-i revânım yürü Sa'd-âbâd'a. (Let us grant some joy to this joyless heart; come, my graceful cypress, let us away to Sa'dabad.)" — Evliya Çelebi, *Seyahatname* (17th c., trans.) |
| PIRATE_REPUBLIC | "A merry life and a short one shall be my motto." — Bartholomew Roberts (18th c.), in *A General History of the Pyrates* (1724) | "The pirates careened their ships at New Providence, which they made their republic." — Charles Johnson, *A General History of the Pyrates* (1724) |
| QAJAR | "درخت دوستی بنشان که کام دل به بار آرد (Plant the tree of friendship, that it bring the heart's desire to fruit.)" — Hafez, *Divan* (14th c., trans.) | "گر دست دهد ز مغز گندم نانی… عیشی بود آن نه حد هر سلطانی (Given but a loaf of wheaten bread… that were a joy beyond any sultan.)" — Omar Khayyám, *Rubáiyát* (FitzGerald trans., 1859) |
| SENGOKU | "疾如風、徐如林、侵掠如火、不動如山 (Swift as the wind, silent as the forest, fierce as fire, immovable as the mountain.)" — Takeda Shingen, *Fūrinkazan banner* (after Sun Tzu, trans.) | "楽市楽座 (Rakuichi rakuza — free markets, open guilds.)" — Oda Nobunaga, *Azuchi market edicts* (trans.) |
| SHAWNEE | "Sell a country! Why not sell the air, the clouds, and the great sea?" — Tecumseh (1810) | "A single twig breaks, but the bundle of twigs is strong." — attributed to Tecumseh *(attr. debated)* |
| TONGA | "Fonua ko e tangata, tangata ko e fonua." (The land is the people, the people are the land.) — *Tongan proverb* | "The Tuʻi Tonga held a maritime empire across the central Pacific." — I. C. Campbell, *Island Kingdom: Tonga Ancient and Modern* (1992) |

> **Sensitivity note.** Conquest- and colonialism-heavy civs deliberately quote a *critical or plain*
> voice (Spain → Las Casas' protest; Mongolia → a governance line, not a massacre line; Bulgaria →
> Runciman on the state's discipline, not an atrocity). No group is characterized by a slur.
>
> **Sensitivity revision (2026-07-05).** A full anti-trope pass swept every quote and every per-civ
> "why" line (this doc, the live registry, prose.md, and all 12 locales). Removed: (1) the Carthage
> "greed" quote (Polybius' *Punica fides* — an antisemitic-adjacent slur against a Semitic people →
> replaced with Hanno's *Periplus*, their own seafaring voice); (2) the Bulgaria skull-cup quote
> (barbarian-savage trope → Runciman on Bulgar statecraft); (3) the Persia "huckster" line (merchant
> slur → Herodotus on the satrapy tribute system). Systemically reframed: the −Culture "why" lines that
> had immigrants "drown / dilute / thin / crowd out / overwrite" native culture (nativist replacement
> register → recast as the host city's *own* priorities shifting to trade); the "trade, not honest toil"
> merchant-as-parasite formula that had landed on Semitic/colonized peoples (→ neutral labour-allocation,
> "drawing hands off the fields"); and the minority-faith-as-disruptive lines (Aksum/Khmer/Chola "rival
> liturgy unsettles / draws resentment / dispute" → crowding). The **contested-enclave** prose was
> rewritten to center the host's *unjust* wartime suspicion and the diaspora's severed ties home, not the
> "doubted loyalties" fifth-column trope. The `QUARTER_QUOTES` gate still requires every shipped option a
> concrete `source`; the three previously-blank cells (Ming-B, Silla-B, Nepal-A) are now filled with named
> sources marked *(re-verify before ship)*.
>
> **Bilingual-originals pass (2026-07-05).** Each translated quote now shows its **native-language
> original followed by an English gloss** (the Hawaiian/Tongan format), e.g. *"倉廩實而知禮節 (When the
> granaries are full, the people know propriety.)"*. Originals were **web-verified against primary
> sources** (Perseus TEI for Greek/Latin; ctext / zh.wikisource for Chinese; ganjoor for Persian; Oracc
> RINAP for Akkadian; Hultzsch for Prakrit; Christenson for K'iche'; etc.) — nothing was reconstructed
> from memory. **68 of 90 options** carry an original; the RTL originals (Arabic/Persian) are bidi-isolated
> at render (`bidiIsolate` in emigration-dilemma-view.js). The five quotes whose originals proved
> un-sourceable verbatim (Mani/*Kephalaia*, Ezana stone, Evliya Çelebi's *Seyahatname* ×2, Kaggwa's
> Luganda) were **dropped and replaced with sourced own-voice alternatives**: Aksum → its Greek and Ge'ez
> **coin mottos** (*ΤΟΥΤΟ ΑΡΕΣΗ ΤΗ ΧΩΡΑ*; Armah's *ፍሥሓ ፡ ለይኲን ፡ ለአሕዛብ*); Ottoman → **Süleyman/Muhibbî**
> and **Nedîm**; Buganda → the Ganda proverb *Agali awamu ge galuma ennyama*. The remaining 22 English
> quotes are English-**authored** (modern historians Hitti/Coe/Runciman/Sastri/Clunas/Pauketat/Milner and
> English voices Coolidge/Blake/Tecumseh/Adam Smith/Hemingway/…), which have no foreign original.
> **Verification also caught
> real errors**, now fixed: HAN-a "農，天下之大本也" is **Emperor Wen's edict**, not Chao Cuo; INCA-a is from
> *El Señorío de los Incas* (1554), not the 1553 *Crónica*; INCA-b's "never a year of famine" (contradicted
> by Garcilaso) → his real terrace line; SPAIN-a's "richest hill" (the modern editor's words) → the genuine
> Potosí coat-of-arms motto; NORMAN-a's "which the French call *castella*" (a translator's embellishment
> absent from the 1137 annal) → the real *"and fylden þe land ful of castles"*; SILLA-a is canonically the
> *Awakening of Faith*, associated with Wonhyo by his awakening story.

## 9. Config / tunables, balance, tests, risk

**Config / tunables.** `culturalQuartersEnabled: false` (off by default — a new reward),
`quarterFootholdShare`, `quarterFromShare: 0.3`, `quarterBlendShare`, `quarterMinImmigrants`,
`quarterBlendMinImmigrants`, `quarterBlendTurns`, `quarterCapPerAge`, `quarterBenefitMax: 2`,
`quarterPenaltyMax: 2`, `quarterBlendPenaltyRelief`, `diasporaWarStrain`, `contestedQuarterPenalty`,
`quarterProgressionScreenEnabled`,
`quarterChoicesEnabled: true` (when `false`, auto-apply option A and chronicle it without opening the
modal). All player-facing rows go in [emigration-tunables.js](../ui/emigration-tunables.js) with
`LOC_EMIG_T_*` label/desc strings in **all** locales.

**Balance.** Snowball-safe by construction: small ±values, **one quarter per tile**, **no stacking**
(§6), and a **per-age cap**. Because every option carries a real cost, a magnet civ that integrates many
diasporas does not accrue free yields. Add coverage to `scripts/snowball-stress.mjs` if any option's
benefit is yield-material.

**Tests.** `tests/cultural-quarters.mjs`: foreign-origin gate (self-origin → no quarter, no name);
minimum immigrant-mass gate (`migrantMass < quarterMinImmigrants` → no foothold/quarter even if share
threshold is met); stage progression (foothold → established → blended requires both cumulative mass and
integration/progression gates, not one or the other alone); per-tile keying; **no stacking** — a second,
different origin on the same tile **reverses the old modifier exactly** and rewrites (net effect is a
*replacement*, never a sum); change-of-hands chronicle fires once; per-age cap enforced; blended-stage
upgrade softens or rewrites the penalty only within configured bounds; war with origin triggers
contested-quarter state and blocks peaceful blended progression; owner-level diaspora-war strain aggregates
correctly; every registry civ has a valid demonym + ≥2 options with both a benefit and a penalty; unknown
civ → fallback name + neutral option (no throw); `quarterChoicesEnabled:false` auto-applies option A;
disabled flag → no grant, no modal. **Quote gate:** every shipped option has a `QUARTER_QUOTES` entry
with a non-empty `text`, `who`, and concrete `source` (placeholders like "re-verify a named source before
ship" fail the gate), so no option can ship without a real, attributed quote.

**Risk.** Gameplay/balance — ship **off by default**, document in the guide
([emigration-guide.js](../ui/emigration-guide.js)) and Civilopedia
([data/emigration-civilopedia.xml](../data/emigration-civilopedia.xml)). The choice modal shares the
single dilemma surface — respect the parent plan §16.5 arbiter so it never races a refugee dilemma.

## 10. Open refinement questions

Tracked here so the standalone doc can be iterated without touching the parent plan:

- **Quote verification.** Fill the three placeholder cells (Ming-B, Silla-B, Nepal-A) with a named source,
  and re-verify every *(trans.)* / *(attr. debated)* wording against the cited work.
- **Third option.** Some civs (magnet/celebration civs) may warrant a third trade-off; decide whether to
  keep a uniform two-option shape or allow 2–3.
- **Tile modifier fidelity.** Confirm whether any real per-tile/district modifier is bindable from a UI
  mod; if not, lock in the city-level-delta-attributed-to-tile model (§4) and word the prose accordingly.
- **Demonym table.** Finalize the `demonym` column for all 44 civs (esp. Dai Viet, Majapahit, Mississippian).
- **Viability floor tuning.** Calibrate `quarterMinImmigrants` so tiny trickles never form quarters, but
  legitimate minority waves still do.
- **Stage thresholds.** Tune foothold / quarter / blended thresholds so the system produces a readable arc
  rather than skipping straight from "invisible" to "fully blended."
- **Blended-state mechanics.** Decide whether mature quarters auto-upgrade their existing option or open a
  small `preserve` vs `blend` follow-up choice.
- **Diaspora war strain.** Decide whether the uprising consequence is deterministic pressure/unrest or a
  rarer narrative event, and keep it coupled to existing unrest/violence channels rather than a second
  rebel subsystem.
- **Quarter progression screen.** Decide whether the first ship is a dedicated screen, a chronicle tab, or
  a city-readout subpanel.
- **Interaction with Feature I follow-ups.** Ensure the self-origin path routes only to I's `followupLine`
  and never opens a quarter (parent plan §16.8 shared-vocabulary note).
