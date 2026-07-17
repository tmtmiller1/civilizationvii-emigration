# Vacated-tile on-map marker — implementation plan

**Status:** proposed / probe-gated
**Origin:** workshop feedback (JNR) — *"I wonder if the vacated tile could be marked as pillaged
and blocked from being repaired to communicate all this clearly on a visual level. Or did you add
some UI markers for it? Would be cool to have screenshots on the mod page."*

## 1. Problem

When rural population emigrates, the mod's only write is `city.addRuralPopulation(-1)`
([emigration-population.js:487-533](../ui/emigration-population.js#L487-L533) —
`moveRural` / `removeRural`). The **engine** then unassigns a worker from some tile, leaving the
improvement **intact but unworked** ([roadmap §17.3](emigration-roadmap-and-backlog.md#L1469-L1471)).
Nothing on the map communicates that a tile went quiet — the loss is invisible. JNR wants a visual
cue.

## 2. Why this is harder than the enclave markers

The enclave markers ([ui/emigration-enclave-markers.js](../ui/emigration-enclave-markers.js)) work
because an enclave is a **real Constructible** (`IMPROVEMENT_EMIG_ENCLAVE_<CIV>`); the module simply
re-scans `MapConstructibles.getConstructibles(x,y)` any time and paints whatever it finds. Game state
*remembers* enclaves, so "after the fact" is trivial.

A vacated tile leaves **no game-state trace** — an unworked improved tile is indistinguishable from
one that was never worked. The mod does not choose the tile either; the engine does. So the tile can
only be identified by **diffing the city's worked-plot set immediately before vs. after the removal**,
and then the mod must **persist** that coordinate itself (the save won't).

**Decision — reject "mark as pillaged + block repair."** It is a real game-state mutation with real
yield consequences (double-penalises the player beyond the lost worked yield), breaks the read-only
overlay design the enclave markers explicitly rely on for safe co-load, and no-ops on unimproved
worked plots. The overlay marker conveys the same information without a mechanic. Record alongside the
existing marker note in [wont-fix-with-justifications.md](wont-fix-with-justifications.md).

## 3. Probe gate (do this first)

Lives **inside the emigration mod's own Self-Test screen** (not the devtools dock) — gated behind the
`selftestEnabled` option ([emigration-config.js:284](../ui/emigration-config.js#L284)); enable it, open
the Self-Test panel, and use two buttons wired in
[emigration-selftest.js](../ui/emigration-selftest.js), backed by
[emigration-enclave-probe.js](../ui/emigration-enclave-probe.js) →
`runVacatedSurfaceProbe` / `runVacatedDiffProbe`:

- **"Read worked-plot set (vacated-tile)"** — read-only. Dumps the `Workers` surface, one
  `GetTilePlacementInfo` entry's field shape, and the worked-set size under 4 candidate signals
  (`IsWorked`, `NumWorkers>0`, `Assigned`, `notBlocked`). Runs anywhere.
- **"Vacated-tile -1 diff (perturbs city)"** — the load-bearing test: snapshots the worked set →
  `addRuralPopulation(-1)` on the **selected** city → re-snapshots → reports per-strategy
  `removed`/`added` plots → **restores `+1`** and confirms the tile returns. Prints `VERDICT ✓/✗`.

Notes:

- Runs **solo** — only your own city, no bordering AI needed. The diff needs a city with **rural
  pop ≥ 1** (it self-guards and says so otherwise).
- **Do not build below until the diff returns a clean single-plot verdict** (or a
  net-removed-with-reshuffle verdict — see §7). If *all* strategies show unchanged sizes, the Workers
  API exposes no current-worked flag and we fall back to a yield-attribution diff (§7, plan B).

### Probe result — 2026-07-15 (VERDICT ✗, plan-B territory)

Ran both buttons on a pop-20 city (urban 14 / rural 5, `workerPopulation` = `undefined`):

- `city.Workers.GetTilePlacementInfo` / `GetAllPlacementInfo` are the **specialist** subsystem — per
  plot they expose `NumWorkers`, `MaxWorkers`, `CurrentYields`/`NextYields`, `CurrentMaintenance`. Only
  **1** plot had `NumWorkers>0` (an urban specialist tile) while rural = 5. `IsWorked`/`Assigned`
  fields don't exist. So this API does **not** model which rural tile a rural-pop point works.
- The −1 removal (rural 5→4 confirmed) changed **nothing**: every strategy `removed=[] added=[]`.
  Two causes, same conclusion: (1) wrong subsystem (specialists ≠ rural working); (2) the engine only
  re-optimises tile assignment at **turn processing**, not inline within the ~1s window.

**Across-end-turn probe — 2026-07-15 (VERDICT ✗, CAN'T-DO):** armed on a rural-5 city (41 owned
plots), removed 1 rural, ended a turn. Rural dropped 5→4 but **NOT ONE** owned plot changed on any of
the three signals — `getYieldsWithCity`, constructible signature, or specialist `NumWorkers`. So the
earlier ✗ was not a timing artifact: the engine reassigns rural tiles internally and exposes **no
per-tile "now unworked" signal** to UI script, the rural improvement stays intact, and
`getYieldsWithCity` is a hypothetical if-worked value that never drops.

## Verdict: CAN'T-DO (marking the *tile*)

The vacated tile leaves **no readable trace** — it cannot even be *identified* from UI script, so
neither an overlay marker nor JNR's pillage idea is possible. (Contrast the enclave, which is a real
constructible and therefore markable.) Record in
[wont-fix-with-justifications.md](wont-fix-with-justifications.md).

**Viable alternatives (reframe, don't mark the tile):**

- **Mark / notify at the CITY** that lost population — the mod already has toasts, notifications, and a
  city readout; "N people emigrated from <City>" communicates the event without a tile.
- **Workshop-page framing** — explain that the destination enclave is marked but the origin tile isn't,
  because the game gives modders no per-tile unworked signal. That directly answers JNR.

The probe buttons + `runVacated*` code stay in the Self-Test module as the evidence trail; the
build-out below (§4–§10) is **shelved** unless a future patch exposes a rural-tile-worked read.

## 4. Architecture (pending probe verdict)

Two-phase capture, because the population write settles asynchronously (the existing probes wait
~800ms; the same is true in-pass across a turn):

1. **At departure** (choke points in [emigration-population.js](../ui/emigration-population.js) —
   `moveRural` **source side**, `removeRural`; both are the only callers used by
   [emigration-engine.js:665](../ui/emigration-engine.js#L665),
   [emigration-return.js:227](../ui/emigration-return.js#L227),
   [emigration-refugee-staging.js](../ui/emigration-refugee-staging.js)): snapshot the city's
   worked-plot set **before** the write and stash `{cityId, workedBefore, turn}` in an in-memory
   pending buffer.
2. **Next pass / deferred read** (a reconciler stage in `emigration-engine.js`): re-snapshot each
   pending city, diff `workedBefore \ workedAfter` → the vacated plot index(es), resolve to `{x,y}`,
   and commit into a **persisted** `vacated` map. Clear the pending entry.

Keep the primitives' signatures unchanged; add the snapshot via a thin optional hook so `moveRural`
callers that already know `source` (they all do) light it up without threading new params.

## 5. State (persist so the marker survives reload)

Extend [ui/emigration-state.js](../ui/emigration-state.js) with one map (own blob key, e.g.
`EmigrationVacated_v1`, or fold into `EmigrationState_v1`):

```
vacated = { "x,y": { sinceTurn, cityId } }
```

- **Prune** on load/turn: drop an entry when the plot is worked again (regrowth reclaimed it), the
  plot is no longer owned by the local player, or the improvement is gone.
- **Bound the save**: hard cap the map (e.g. most-recent N), and optionally **expire** entries after
  M turns so the map self-cleans (a decades-old vacancy stops being interesting). Add both to the
  blob-size probe key list ([migration-probe.js `BLOB_KEYS`](../devtools/migration-probe.js#L1839)).

## 6. Marker module (clone the enclave pattern)

New `ui/emigration-vacated-markers.js`, structurally a copy of
[ui/emigration-enclave-markers.js](../ui/emigration-enclave-markers.js):

- **Same paint path** — its own `WorldUI.createOverlayGroup` + `createSpriteGrid`, `addSprite` +
  `addText`, `OVERLAY_MAX_PRIORITY`, `safe()`-wrapped, degrades to "no marker", never throws.
- **Different data source** — read the persisted `vacated` map (§5) instead of scanning
  constructibles. Icon: a "depopulated"/abandoned glyph (reuse a stock BLP via `UI.getIconBLP`);
  label: `LOC_EMIGRATION_VACATED_MARKER` ("Depopulated" / "Vacated").
- **Same repaint triggers** — `PlayerTurnActivated`, `LoadComplete`, plus repaint after the mod's own
  pass commits new vacated tiles. **Clear** a marker in the same loop when its plot leaves the map
  (re-worked / unowned).
- Register in [emigration.modinfo](../emigration.modinfo) `UIScripts`, right after
  `ui/emigration-enclave-markers.js` (line ~87).

## 7. Edge cases & fallbacks

- **Engine reshuffle.** The engine may re-optimise the *whole* worked set on a -1, not just drop the
  lowest tile. If the probe shows `removed=1, added=0`, we're clean. If it shows a net -1 with churn,
  mark the **net-removed** plot(s) — still truthful ("this tile is no longer worked"). The probe
  reports `removed`/`added` per strategy so we choose with data, not assumption.
- **No worked flag at all (plan B).** If the Workers API exposes nothing current, identify the
  vacated tile by a **yield-attribution diff**: snapshot each owned plot's city-attributed
  contribution before/after and mark the one that dropped. Slower, last resort — only if §3 fails.
- **Async timing.** Take the "after" snapshot on a later pass/deferred read, never inline (matches the
  probe's own 800ms settle).
- **Marker clutter / honesty.** Cap + expiry (§5); the marker is a maintained fiction and must clear
  the instant the tile is re-worked, or it lies.

## 8. Config / Options

Add a toggle mirroring the existing marker/lens controls
([ui/emigration-options.js](../ui/emigration-options.js)) — `showVacatedMarkers` (default **on**),
with `LOC_OPTIONS_EMIGRATION_VACATED_MARKERS`. Wire through
[emigration-tunables.js](../ui/emigration-tunables.js) / `emigration-settings.js` like the other UI
flags.

## 9. Localization

New LOC keys in [text/en_us/ModText.xml](../text/en_us/ModText.xml) (marker label + option label +
tooltip), then propagate through `i18n/i18n-source.json` and the per-locale files, per
[localization-hardcoded-strings-plan.md](localization-hardcoded-strings-plan.md).

## 10. Tests & acceptance

- **Node harness** (`tests/vacated.mjs`): pure reconciler logic — before/after set diff yields the
  removed plot; reshuffle picks net-removed; prune drops re-worked/unowned; cap + expiry bound the
  map; v-migration adds the empty map and old saves load. No engine.
- **Probe** (§3): the engine confirmation, on a city with rural pop.
- **In-game `verify`**: emigrate from a developed city, confirm a marker appears on the tile that goes
  unworked, persists across save/reload, and **clears** when the city regrows and re-works it.
- **Screenshots** for the workshop page — directly answers JNR's ask; capture the marker at typical
  zoom (tune `ICON_Z` / `TEXT_Z` / `TEXT_FONT_SIZE` as the enclave marker note flags).

## 11. Sequencing

1. Run the Self-Test vacated probes (§3) → record the winning worked-signal in this doc.
2. State map + prune/cap/expiry + migration (§5) with `tests/vacated.mjs`.
3. Two-phase capture in the population primitives + engine reconciler (§4).
4. Clone the marker module + register + LOC (§6, §9).
5. Options toggle (§8).
6. In-game verify + screenshots (§10); update workshop description and
   [emigration-roadmap-and-backlog.md](emigration-roadmap-and-backlog.md) marker section.
