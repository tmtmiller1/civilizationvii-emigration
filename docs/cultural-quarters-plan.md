# Emigration — Cultural Quarters: Design & Implementation Plan

> **Status:** extracted from [feature-improvements-plan.md](feature-improvements-plan.md) §6 (Feature F)
> for deeper refinement. This is the authoritative spec for the **Cultural Quarters** feature; the parent
> plan links here. Cross-references to `§16.x` and other features (I, H, R) refer to sections in
> [feature-improvements-plan.md](feature-improvements-plan.md).
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
player-readable feature: a visible **foothold**, then a **named, foreign-flavoured Cultural Quarter** on a
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
3. **Minimum immigrant mass required.** A quarter is only viable after a **real amount of migration** has
  occurred from that origin into that city; share alone is insufficient. Require `migrantMass >=
  CONFIG.quarterMinImmigrants` before any quarter event can fire.
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

Footholds do **not** open the full modal; they only chronicle and surface in the progression UI. Blended /
host-imprint upgrades may either auto-upgrade the current quarter option or open a **lighter-weight**
follow-up choice if we want the player to decide whether the district preserves a stronger foreign identity
or becomes more hybridized (see §6.1). The main quarter choice remains the only guaranteed modal.

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
| AKSUM | Aksumite Quarter | +Gold ▸ −Culture ▸ Red-Sea traders enrich the docks, but foreign custom crowds out local rites | +Faith ▸ −Happiness ▸ their stelae-churches draw pilgrims, but rival liturgy unsettles neighbours |
| ASSYRIA | Assyrian Quarter | +Production ▸ −Happiness ▸ siege-artisans man the foundries, but their martial bearing sours the ward | +Science ▸ −Gold ▸ captured codices fill the archives, but curating spoils costs coin |
| CARTHAGE | Punic Quarter | +Gold ▸ −Food ▸ Punic merchants work the wharves, not the fields | +Production ▸ −Culture ▸ shipwrights raise busy yards, but trade-tongue drowns local custom |
| EGYPT | Egyptian Quarter | +Culture ▸ −Gold ▸ monument-masons adorn the district, but upkeep of their works is dear | +Food ▸ −Production ▸ Nile-style flood-farming feeds the ward, but pulls labour off the works |
| GREECE | Greek Quarter | +Science ▸ −Happiness ▸ an agora of philosophers, and their factional politics | +Culture ▸ −Production ▸ theatres and porticoes flourish while the workshops idle |
| HAN | Han Quarter | +Food ▸ −Happiness ▸ intensive farming feeds many, at the cost of crowding | +Production ▸ −Gold ▸ public-works crews build fast, but the corvée is subsidised |
| KHMER | Khmer Quarter | +Food ▸ −Gold ▸ baray-style irrigation greens the fringe, but the waterworks cost coin | +Faith ▸ −Happiness ▸ their temple-processions draw crowds and some resentment |
| MAURYA | Mauryan Quarter | +Faith ▸ −Gold ▸ ascetic orders bless the ward, sustained by alms | +Food ▸ −Production ▸ stepwell gardens yield well, but tie up hands |
| MAYA | Maya Quarter | +Science ▸ −Production ▸ sky-watchers keep observatories, not workshops | +Food ▸ −Happiness ▸ dense milpa plots feed many, but crowd the fringe |
| MISSISSIPPIAN | Mississippian Quarter | +Culture ▸ −Gold ▸ mound-rites enrich the ward's life, funded by tribute | +Food ▸ −Production ▸ woodland gathering feeds the district, off the yards |
| PERSIA | Persian Quarter | +Gold ▸ −Happiness ▸ satrapal tribute flows in, and resentment with it | +Culture ▸ −Food ▸ walled pleasure-gardens delight, but eat good farmland |
| ROME | Roman Quarter | +Production ▸ −Happiness ▸ Roman engineering drives the works, but the legion's air chafes | +Gold ▸ −Culture ▸ their roads pull trade, and dilute the old ways |

**Exploration origins**

| Civ | Quarter | Option A (benefit ▸ cost ▸ why) | Option B (benefit ▸ cost ▸ why) |
| --- | --- | --- | --- |
| BULGARIA | Bulgar Quarter | +Production ▸ −Happiness ▸ horse-and-forge veterans work hard and brawl harder | +Gold ▸ −Culture ▸ frontier markets thrive as old custom fades |
| CHOLA | Chola Quarter | +Gold ▸ −Food ▸ Tamil maritime traders work the sea, not the soil | +Faith ▸ −Happiness ▸ great temple-tanks draw devotion and dispute |
| DAI_VIET | Dai Viet Quarter | +Culture ▸ −Gold ▸ wall-scholars keep learning alive, at public cost | +Production ▸ −Food ▸ fort-works employ many hands off the fields |
| HAWAII | Hawaiian Quarter | +Food ▸ −Production ▸ fish-ponds and reefs feed the ward, not the yards | +Culture ▸ −Gold ▸ heiau rites enrich island custom, funded by the city |
| INCA | Inca Quarter | +Production ▸ −Gold ▸ terrace-masons and road-crews build superbly, at expense | +Food ▸ −Happiness ▸ mountain terraces feed many in a crowded ward |
| MAJAPAHIT | Majapahit Quarter | +Gold ▸ −Culture ▸ spice-route factors enrich the docks, trade-tongue and all | +Food ▸ −Production ▸ coastal fisheries feed the fringe off the yards |
| MING | Ming Quarter | +Gold ▸ −Production ▸ porcelain and silk factors trade richly, not toil | +Culture ▸ −Happiness ▸ imperial arts refine the ward, and its airs vex neighbours |
| MONGOLIA | Mongol Quarter | +Production ▸ −Happiness ▸ horse-lines and smiths work fast; their swagger grates | +Gold ▸ −Culture ▸ steppe tribute-routes pay well, and thin the old ways |
| NORMAN | Norman Quarter | +Production ▸ −Happiness ▸ castle-masons raise strong works and a martial air | +Gold ▸ −Food ▸ feudal rents fill the coffers, off the farms |
| SONGHAI | Songhai Quarter | +Gold ▸ −Food ▸ river-and-salt traders work the trade, not the soil | +Science ▸ −Happiness ▸ their scholars keep famed libraries, and famed feuds |
| SPAIN | Spanish Quarter | +Gold ▸ −Happiness ▸ treasure-fleet factors enrich the port amid conversion strife | +Faith ▸ −Culture ▸ their missions win souls and overwrite old custom |

**Modern origins**

| Civ | Quarter | Option A (benefit ▸ cost ▸ why) | Option B (benefit ▸ cost ▸ why) |
| --- | --- | --- | --- |
| AMERICA | American Quarter | +Production ▸ −Happiness ▸ factory-hands drive output, but the shifts breed unrest | +Culture ▸ −Gold ▸ their cinema and jazz enliven the ward, at a subsidy |
| BUGANDA | Bugandan Quarter | +Food ▸ −Gold ▸ lakeshore gardens feed the ward, tended at cost | +Culture ▸ −Production ▸ bark-cloth artisans enrich custom, off the yards |
| FRENCH_EMPIRE | French Quarter | +Culture ▸ −Production ▸ salons and Great Works flourish while workshops idle | +Gold ▸ −Happiness ▸ luxury trade enriches the ward, and its airs vex the poor |
| GREAT_BRITAIN | British Quarter | +Gold ▸ −Happiness ▸ counting-houses and clerks profit; the mills breed grievance | +Production ▸ −Food ▸ industrial works run hot, drawing hands off the farms |
| HEIAN | Heian Quarter | +Culture ▸ −Production ▸ courtly refinement flowers over honest labour | +Happiness ▸ −Gold ▸ their festivals lift the whole city, at the treasury's cost |
| ICELAND | Icelandic Quarter | +Production ▸ −Food ▸ shipwrights and sailors build and raid, not farm | +Culture ▸ −Gold ▸ saga-singers keep the ward's memory, funded by the city |
| MEIJI | Meiji Quarter | +Production ▸ −Happiness ▸ rapid industry drives output at a hard human pace | +Science ▸ −Culture ▸ headlong modernisation, and old custom set aside |
| MEXICO | Mexican Quarter | +Culture ▸ −Gold ▸ murals and fiestas colour the ward, funded by the city | +Happiness ▸ −Production ▸ tight-knit community lifts spirits over output |
| MUGHAL | Mughal Quarter | +Culture ▸ −Gold ▸ miniaturists and architects adorn the ward, at expense | +Gold ▸ −Food ▸ fine-textile trade enriches the docks, not the fields |
| PRUSSIA | Prussian Quarter | +Production ▸ −Happiness ▸ disciplined arsenals out-work the city, stiffly | +Science ▸ −Culture ▸ their war-academies teach hard, and set old ways aside |
| QING | Qing Quarter | +Food ▸ −Happiness ▸ dense growth feeds many in a crowded ward | +Gold ▸ −Production ▸ treaty-port factors trade richly, not toil |
| RUSSIA | Russian Quarter | +Production ▸ −Food ▸ heavy-industry crews work hard in a hungry ward | +Culture ▸ −Gold ▸ their letters and theatre enrich the city, at a subsidy |
| SIAM | Siamese Quarter | +Culture ▸ −Gold ▸ temple-arts and dance enrich the ward, funded by the city | +Gold ▸ −Happiness ▸ their bustling trade pays well and crowds the streets |
| SILLA | Silla Quarter | +Happiness ▸ −Gold ▸ pagoda-rites lift the ward, sustained by alms | +Culture ▸ −Production ▸ their crafts refine custom over honest labour |

**Age-flex origins (Nepal, Ottomans, Pirate Republic, Qajar, Sengoku, Shawnee, Tonga)**

| Civ | Quarter | Option A (benefit ▸ cost ▸ why) | Option B (benefit ▸ cost ▸ why) |
| --- | --- | --- | --- |
| NEPAL | Nepali Quarter | +Food ▸ −Gold ▸ mountain terraces feed the ward, tended at cost | +Production ▸ −Happiness ▸ fort-masons raise strong works and a martial air |
| OTTOMANS | Ottoman Quarter | +Science ▸ −Gold ▸ külliye specialists teach and heal, at public cost | +Culture ▸ −Production ▸ grand celebrations enrich custom over labour |
| PIRATE_REPUBLIC | Buccaneer Quarter | +Gold ▸ −Happiness ▸ prize-goods and black markets pay well, lawlessly | +Production ▸ −Culture ▸ busy careening-yards work fast, trade-tongue and all |
| QAJAR | Qajar Quarter | +Food ▸ −Gold ▸ walled garden-farms feed the ward, tended at cost | +Culture ▸ −Production ▸ Bāq celebrations enrich custom over labour |
| SENGOKU | Sengoku Quarter | +Production ▸ −Happiness ▸ castle-town armourers out-work the ward, sternly | +Gold ▸ −Food ▸ daimyō markets pay well, off the fields |
| SHAWNEE | Shawnee Quarter | +Food ▸ −Gold ▸ river-bottom gathering feeds the ward, at some cost | +Culture ▸ −Production ▸ council-rites enrich custom over honest labour |
| TONGA | Tongan Quarter | +Food ▸ −Production ▸ ocean fisheries feed the fringe, not the yards | +Gold ▸ −Culture ▸ island trade-routes pay well as old custom thins |

> The registry is **origin-agnostic about the host**: a *Roman Quarter* reads the same in a Norman or a
> Han city. Rule 2 still guarantees Rome's own cities never grow a Roman Quarter (self-origin is skipped
> before naming). A new DLC civ with no registry row still forms a quarter (fallback name + a neutral
> ±1 option pair) so the feature never throws on unknown civs.

## 8. Flavour quotes for the choice moment (real, attributed)

Each option carries a short **historical quote** shown in the choice modal (§3) beneath its
benefit/cost line, so the moment reads as a page of history rather than a menu. Quotes are keyed
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
| ABBASID | "Seek knowledge from the cradle to the grave." — attributed to the Prophet Muhammad, *Islamic tradition* *(attr. debated)* | "Baghdad became the intellectual capital of the medieval world." — Philip K. Hitti, *History of the Arabs* (1937) |
| AKSUM | "There are four great kingdoms on earth… the third is the Kingdom of the Aksumites." — Mani, *Kephalaia* (3rd c.) | "Through the might of the Lord of Heaven… I set up this throne." — King Ezana, *Ezana Stone inscription* (4th c., trans.) |
| ASSYRIA | "I built a wall… I made it great, I raised it mountain-high." — Sennacherib, *Taylor Prism* (7th c. BCE, trans.) | "I read the cunning tablets of Sumer and the dark Akkadian… I solved the laborious problems of division and multiplication." — Ashurbanipal, *royal inscription* (trans.) |
| CARTHAGE | "The Carthaginians consider nothing disgraceful that leads to gain." — Polybius, *Histories*, Bk. VI (2nd c. BCE, trans.) | "The docks had room for two hundred and twenty ships." — Appian, *Roman History (Punica)* (2nd c., trans.) |
| EGYPT | "Nowhere are there so many marvellous things, nor works of such unspeakable greatness." — Herodotus, *Histories*, Bk. II (trans.) | "Egypt is the gift of the Nile." — Herodotus (after Hecataeus), *Histories*, Bk. II (trans.) |
| GREECE | "The unexamined life is not worth living." — Socrates, in Plato, *Apology* (trans.) | "We are lovers of the beautiful, yet simple in our tastes." — Pericles, in Thucydides, *History of the Peloponnesian War*, Bk. II (trans.) |
| HAN | "Agriculture is the great foundation of the empire." — Chao Cuo, *Memorial on the Value of Grain* (2nd c. BCE, trans.) | "When the granaries are full, the people know propriety." — *Guanzi*, quoted in Sima Qian, *Records of the Grand Historian* (trans.) |
| KHMER | "Three or four rice harvests a year can be had." — Zhou Daguan, *The Customs of Cambodia* (1296, trans.) | "At the centre of the kingdom rises a tower of gold." — Zhou Daguan, *The Customs of Cambodia* (1296, trans.) |
| MAURYA | "All men are my children." — Ashoka, *Kalinga Rock Edict* (3rd c. BCE, trans.) | "Along the roads I have had banyan trees planted… and mango-groves." — Ashoka, *Pillar Edict VII* (trans.) |
| MAYA | "Of yellow corn and of white corn their flesh was made." — *Popol Vuh* (Tedlock trans.) | "The Maya were the most brilliant civilization of the New World." — Michael D. Coe, *The Maya* (1966) |
| MISSISSIPPIAN | "Cahokia was the first city in what would become the United States." — Timothy Pauketat, *Cahokia* (2009) | "Maize agriculture underpinned the rise of the Mississippian towns." — George Milner, *The Moundbuilders* (2004) |
| PERSIA | "The Persians called Darius a huckster, because he fixed the tribute." — Herodotus, *Histories*, Bk. III (trans.) | "I myself planted some of these trees with my own hands." — Cyrus the Younger, in Xenophon, *Oeconomicus*, Bk. IV (trans.) |
| ROME | "Will anyone compare the idle Pyramids with these many indispensable aqueducts?" — Frontinus, *On the Aqueducts of Rome* (1st c., trans.) | "Here may be seen whatever each season brings, and all the goods of every land and sea." — Aelius Aristides, *Roman Oration* (2nd c., trans.) |

**Exploration origins**

| Civ | Option A quote (— speaker, *source*) | Option B quote (— speaker, *source*) |
| --- | --- | --- |
| BULGARIA | "Khan Krum made a drinking-cup of the emperor's skull." — Theophanes the Confessor, *Chronographia* (9th c., trans.) | "The Bulgarians commanded the great roads of trade between the empires." — Steven Runciman, *A History of the First Bulgarian Empire* (1930) |
| CHOLA | "The Chola navy was the most powerful in the Indian Ocean of its day." — K. A. Nilakanta Sastri, *The CōĻas* (1955) | "Rajaraja raised the great temple at Tanjore, a wonder of the age." — K. A. Nilakanta Sastri, *The CōĻas* (1955) |
| DAI_VIET | "Virtuous and talented men are the vital force of the state; when it is strong, the country prospers." — Thân Nhân Trung, *Temple of Literature stele* (1442, trans.) | "We sharpen our weapons and train our soldiers, that we may defeat the foe." — Trần Hưng Đạo, *Proclamation to the Officers* (1284, trans.) |
| HAWAII | "He aliʻi ka ʻāina; he kauwā ke kanaka." (The land is chief; man is its servant.) — *ʻŌlelo Noʻeau*, coll. Mary Kawena Pukui (1983) | "I ka ʻōlelo nō ke ola, i ka ʻōlelo nō ka make." (In the word there is life; in the word there is death.) — *ʻŌlelo Noʻeau*, coll. Mary Kawena Pukui (1983) |
| INCA | "In the memory of men there is no record of so great a road, built through deep valleys and high mountains." — Pedro Cieza de León, *Crónica del Perú* (1553, trans.) | "They terraced the mountainsides, and there was never a year of famine." — Garcilaso de la Vega, *Comentarios Reales de los Incas* (1609, trans.) |
| MAJAPAHIT | "All the lands of the archipelago come to offer their tribute." — Mpu Prapanca, *Nagarakretagama* (1365, trans.) | "The country is rich, and foreign ships gather at its ports." — Ma Huan, *Yingya Shenglan* (1433, trans.) |
| MING | "We have traversed more than one hundred thousand li of vast water-spaces." — Zheng He, *Changle stele* (1431, trans.) | "The Yongle Encyclopedia was the largest compilation of knowledge of its age." — historian's summary, *re-verify a named source before ship* |
| MONGOLIA | "One can conquer the world on horseback, but one cannot govern it from there." — attributed to Genghis Khan / Yelü Chucai *(attr. debated)* | "Along the roads, at every twenty-five miles, the messengers find a post-house." — Marco Polo, *The Travels* (trans.) |
| NORMAN | "Castles, which the French call castella, they built widely throughout the land." — *Anglo-Saxon Chronicle* (trans.) | "So narrowly did he have it searched out that not one hide was left out of his record." — *Anglo-Saxon Chronicle*, on Domesday (1085, trans.) |
| SONGHAI | "Here are many shops of craftsmen and merchants, especially weavers of cloth." — Leo Africanus, *Description of Africa* (1550, trans.) | "More profit is made from the book-trade here than from any other line of goods." — Leo Africanus, *Description of Africa* (1550, trans.) |
| SPAIN | "Potosí, the richest hill of all the world." — Luis Capoche, *Relación de la Villa Imperial de Potosí* (1585, trans.) | "The Christians have destroyed such infinite numbers of souls, moved by their wish for gold." — Bartolomé de las Casas, *A Short Account of the Destruction of the Indies* (1552, trans.) |

**Modern origins**

| Civ | Option A quote (— speaker, *source*) | Option B quote (— speaker, *source*) |
| --- | --- | --- |
| AMERICA | "The chief business of the American people is business." — Calvin Coolidge, *address to newspaper editors* (1925) | "America will be remembered for the Constitution, jazz music, and baseball." — Gerald Early, in Ken Burns, *Jazz* (2001) |
| BUGANDA | "The banana was the staple food of the country; plantations surrounded every house." — John Roscoe, *The Baganda* (1911) | "The making of bark-cloth was an honoured craft among the Baganda." — after Apolo Kaggwa, *The Customs of the Baganda* (1905) |
| FRENCH_EMPIRE | "If you are lucky enough to have lived in Paris as a young man, it stays with you." — Ernest Hemingway, *A Moveable Feast* (1964) | "The art of taxation consists in so plucking the goose as to get the most feathers with the least hissing." — Jean-Baptiste Colbert *(attr.)* |
| GREAT_BRITAIN | "A project fit only for a nation of shopkeepers." — Adam Smith, *The Wealth of Nations* (1776) | "And was Jerusalem builded here, among these dark Satanic Mills?" — William Blake, *Milton* (1804) |
| HEIAN | "In spring, the dawn — when the slowly paling mountain rim grows faintly light." — Sei Shōnagon, *The Pillow Book* (c. 1002, trans.) | "The whole city was agog with excitement over the Festival." — Murasaki Shikibu, *The Tale of Genji* (11th c., trans.) |
| ICELAND | "If you would be a merchant, keep your ship well tarred and put out to sea." — *Konungs skuggsjá (The King's Mirror)* (13th c., trans.) | "Cattle die, kinsmen die, but the fame of a dead man never dies." — *Hávamál*, *Poetic Edda* (trans.) |
| MEIJI | "Fukoku kyōhei — enrich the country, strengthen the army." — *Meiji national slogan* (trans.) | "Heaven does not create one man above or below another." — Fukuzawa Yukichi, *An Encouragement of Learning* (1872, trans.) |
| MEXICO | "The solitary Mexican loves fiestas and public gatherings." — Octavio Paz, *The Labyrinth of Solitude* (1950, trans.) | "El respeto al derecho ajeno es la paz." (Respect for the rights of others is peace.) — Benito Juárez (1867) |
| MUGHAL | "If there is a paradise on earth, it is this, it is this, it is this." — attributed to Amir Khusrow, *Red Fort inscription* *(attr. debated)* | "Gold and silver come from every quarter of the globe to Hindustan." — François Bernier, *Travels in the Mogul Empire* (1670s, trans.) |
| PRUSSIA | "Prussia is not a state that has an army, but an army that has a state." — attributed to Mirabeau *(attr. debated)* | "War is the continuation of policy by other means." — Carl von Clausewitz, *On War* (1832, trans.) |
| QING | "The Celestial Empire possesses all things in prolific abundance and lacks no product." — Qianlong Emperor, *letter to King George III* (1793, trans.) | "The kings of your honourable country have long traded with us; yet you bring opium." — Lin Zexu, *letter to Queen Victoria* (1839, trans.) |
| RUSSIA | "Here a city shall be founded, to spite our arrogant neighbour." — Alexander Pushkin, *The Bronze Horseman* (1833, trans.) | "Beauty will save the world." — Fyodor Dostoevsky, *The Idiot* (1869, trans.) |
| SIAM | "At the end of the rains comes the Kathin festival; the town roars with music and merriment." — *Ramkhamhaeng Inscription* (1292, trans.) | "In the water there are fish, in the fields there is rice; whoever wishes to trade may trade." — *Ramkhamhaeng Inscription* (1292, trans.) |
| SILLA | "When the mind arises, all things arise; when the mind ceases, all things cease." — Wonhyo (7th c., trans.) | "Silla wrought the finest goldwork of ancient Korea." — historian's summary, *re-verify a named source before ship* |

**Age-flex origins**

| Civ | Option A quote (— speaker, *source*) | Option B quote (— speaker, *source*) |
| --- | --- | --- |
| NEPAL | "The hills are terraced to their summits; not a foot of soil is left to waste." — traveller's account, *re-verify a named source before ship* | "Nepal is a yam between two boulders." — Prithvi Narayan Shah, *Divya Upadesh* (18th c., trans.) |
| OTTOMANS | "In Istanbul there are colleges and hospitals, where the sick are tended without charge." — Evliya Çelebi, *Seyahatname (Book of Travels)* (17th c., trans.) | "The guilds pass in procession, the whole city given over to festival." — Evliya Çelebi, *Seyahatname* (17th c., trans.) |
| PIRATE_REPUBLIC | "A merry life and a short one shall be my motto." — Bartholomew Roberts (18th c.), in *A General History of the Pyrates* (1724) | "The pirates careened their ships at New Providence, which they made their republic." — Charles Johnson, *A General History of the Pyrates* (1724) |
| QAJAR | "Plant the tree of friendship that bears the fruit of the heart's desire." — Hafez, *Divan* (14th c., trans.) | "A jug of wine, a loaf of bread — and thou beside me singing in the wilderness." — Omar Khayyám, *Rubáiyát* (FitzGerald trans., 1859) |
| SENGOKU | "Swift as the wind, silent as the forest, fierce as fire, immovable as the mountain." — Takeda Shingen, *Fūrinkazan banner* (after Sun Tzu, trans.) | "Free markets, open guilds — rakuichi rakuza." — Oda Nobunaga, *Azuchi market edicts* (trans.) |
| SHAWNEE | "Sell a country! Why not sell the air, the clouds, and the great sea?" — Tecumseh (1810) | "A single twig breaks, but the bundle of twigs is strong." — attributed to Tecumseh *(attr. debated)* |
| TONGA | "Fonua ko e tangata, tangata ko e fonua." (The land is the people, the people are the land.) — *Tongan proverb* | "The Tuʻi Tonga held a maritime empire across the central Pacific." — I. C. Campbell, *Island Kingdom: Tonga Ancient and Modern* (1992) |

> **Sensitivity note.** Conquest- and colonialism-heavy civs deliberately quote a *critical or plain*
> primary voice (Spain → Las Casas' protest; Assyria/Bulgaria → the chroniclers' record, not a boast;
> Mongolia → a governance line, not a massacre line). Two cells are placeholders pending a named source
> (Ming-B, Silla-B, Nepal-A) and must be filled before ship — the test asserts every shipped quote has a
> concrete `source` string, so a placeholder fails the gate rather than silently shipping.

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
