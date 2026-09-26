# Tooltip compatibility with other tooltip mods

Audited 2026-09-17 against the live install, Civilization VII **1.5.0**
(`.../Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules`), and
against every mod under `civilization_vii_mods/other_peoples_mods/` that touches a tooltip.

Status of the evidence: this is a **source audit, not an in-game observation**. Every verdict below was read out of the
shipped 1.5.0 JavaScript and the other mods' sources. Nothing here has been watched working in game. The one change
that alters what the player sees (the z-index lift, below) is reasoned from the same layering that was already
diagnosed and fixed for the mod's toast, not from a fresh in-game test.

## What this mod puts on screen

| Surface | File | Mechanism |
| --- | --- | --- |
| Ethnicity / Prosperity lens cursor panel | `emigration-lens-hover-panel.js` | Own `<div>` appended to `document.body`, `position:fixed`, `pointer-events:none`, positioned from `mousemove` |
| Enclave tooltip | `emigration-enclave-tooltip.js` | Same hover-panel host, with its own stylesheet and DOM body |
| Base plot-tooltip suppression | `emigration-plot-tooltip-suppress.js` | `SetIsPlotTooltipVisible(false)` + `ui-hide-plot-tooltips` window event + a legacy `.plot-tooltip` CSS rule |
| Notification toast | `emigration-feedback.js` | Own `<div>`, top-center |

Nothing is injected into the game's tooltip DOM, and nothing wraps a shared tooltip function. That is the reason the
surface area for conflict is as small as it is: the only shared state the mod writes is the plot tooltip's two
visibility gates.

## The two visibility gates (1.5.0)

`base-standard/ui-next/tooltips/plot-tooltip/plot-tooltip.js` gates its show on two independent signals, both read by
the same `createEffect` at ~line 1321:

1. `IsPlotTooltipVisible` — module-level signal created at line 33, written by the exported `SetIsPlotTooltipVisible`.
2. `isGlobalRuleVisible` — component-local signal created at line 1223, written by the `ui-hide-plot-tooltips` /
   `ui-show-plot-tooltips` window listeners registered `onMount` at lines 1348-1349.

The mod drives both. **The event gate is the load-bearing one**, which is the reverse of what
`emigration-plot-tooltip-suppress.js` used to claim in its header (now corrected):

- `SetIsPlotTooltipVisible` is shared, un-ref-counted state. Four base-game surfaces write it —
  `ui/tutorial/tutorial-callout.js`, `ui/endgame/screen-endgame.js`,
  `ui/unit-combat-preview/panel-unit-combat-preview.js` and `ui/pantheon-complete/panel-pantheon-complete.js` — and
  each sets it back to `true` when it closes. A combat
  preview opened and closed while a lens is active would therefore un-suppress the tooltip on that gate alone.
- No file in `base-standard`, no file in `core`, and no installed mod dispatches `ui-hide-plot-tooltips` or
  `ui-show-plot-tooltips`. This mod is the sole writer of that gate, so it is the one that actually holds.

Consequence: do not remove the event dispatch as a "legacy backstop". It is the durable half of the pair.

## Per-mod verdicts

### Version warning: audit the copy the player actually runs, not the repo snapshot

The first pass of this audit read `other_peoples_mods/`, which holds **snapshots**, some of them months old. Several
verdicts drawn from them were wrong for the versions people are running today. Re-checked 2026-09-17 against the
current Workshop copies:

| Mod | Repo snapshot | Current | Verdict |
| --- | --- | --- | --- |
| bz-map-trix (`3507072814`) | 3.9.2 (2026-06-01) | **4.1.0** (2026-09-16) | 4.1.0 is described as a "compatibility hotfix for Update 1.5.0" with "merged updates to plot tooltip". NOT yet audited — see below |
| bz-city-hall (`3507102289`) | 2.6.9 | **2.7.5** | Cleared. No plot-tooltip surface; its only `plot-tooltip` string is a `Controls.preloadImage` hint |
| bz-re-sorts (`3507102808`) | 2.4.0 | **3.0.1** | Cleared. No tooltip surface at all |
| bz-flag-corps (`3507103281`) | 3.2.1 | **3.3.2** | Cleared. Still `TooltipManager.registerType('bz-city-tooltip')`, i.e. the legacy `#tooltips` host |
| lf-policies-yields-preview (`3515801789`) | 1.4.0 | **1.4.2** | Cleared. Tech/civic tooltips only |
| bz-trix-fix / Trixie's Fixes (`3537591369`) | 1.3.4 | **1.4.2** | No tooltip surface in either version |
| City-Tile Labels (`3737638511`) | 1.2 | **1.3.3** | Cleared. No gate, no `#uinext-tooltips`, no competing z-index |
| Drongo's Mod Manager (`3734141337`) | 1.1 | **1.2.1** | Cleared. Same |
| Chronicle (`3761407790`) | 0.30.53 | **0.33.80** | Its modal sits at z-index 999998/999999, above the mod's panels. Correct: a screen the player opened should cover a hover readout |

None of the current versions above still reference `lens-manager.chunk.js`, `PlotTooltipPriority`, or the legacy
`ui/tooltips/plot-tooltip.js` — their authors have migrated to 1.5.0. The stale snapshots did, which is what produced
the retracted verdict below.

### The three ways a 1.5.0 mod can take over the plot tooltip, and what each does to our two gates

Re-audited 2026-09-17 against the current Workshop copies. This is the section that matters, because the
suppression only works if the tooltip actually in front of the player still reads the gate we write.

| Mechanism | Who | `SetIsPlotTooltipVisible` gate | `ui-hide-plot-tooltips` gate |
| --- | --- | --- | --- |
| Nothing (vanilla) | base game | honored | honored |
| `ImportFiles` override of `ui-next/tooltips/plot-tooltip/plot-tooltip.js` | **bz-map-trix 4.1.0** | honored | honored |
| `ComponentRegistry` override of the `PlotTooltip` component | **QD Improved Plot Tooltip** (`3799304989`) | honored | **DROPPED** |

**bz-map-trix 4.1.0 is safe.** It replaces the whole base file, but its replacement is a fork of the 1.5.0
original and keeps the contract exactly: the same export list
(`IsPlotTooltipVisible, PlotTooltip, PlotTooltipContent, SetIsPlotTooltipVisible, UnitInfoSection`), the same
`isGlobalRuleVisible` signal, and the same `ui-hide-plot-tooltips` / `ui-show-plot-tooltips` listeners. So our
static import still resolves - which matters, because a missing named export there would be fatal to
`emigration-plot-tooltip-suppress.js` and would take both lenses and the enclave tooltip down with it - and both
levers still reach it. Note 4.1.0 also disabled its own legacy registration: `installPlotTooltip()` is now a
no-op whose `TooltipManager.registerPlotType` line is commented out.

**QD Improved Plot Tooltip is the one that changes our risk.** It does not replace the file; it registers its
own component at `overridePriority: 1` and imports `IsPlotTooltipVisible` from the base module, so the signal
gate still works. But it has no `isGlobalRuleVisible` and no `ui-hide-plot-tooltips` listener anywhere in the
mod - its gate effect reads only
`[plotCoords, IsPlotTooltipVisible, isWorldFocused, isRevealed, isWorldDragging, showTouchPressPlotTooltip]`.

That inverts the conclusion this document reached earlier. Against vanilla and bz-map-trix the event gate is the
durable one and the signal is the fragile one; **against QD the event gate does nothing at all, and the only
lever left is the exact signal that tutorial-callout, screen-endgame, panel-unit-combat-preview and
panel-pantheon-complete each reset to `true` when they close.** With QD installed and the old latch in place,
opening and closing a combat preview under an active lens would have restored the plot tooltip for the rest of
the session, leaving it fighting the lens panel at the cursor.

This is why `setBasePlotTooltipHidden()` no longer latches. It holds the state down: a self-rescheduling
`setTimeout` re-asserts every 750 ms while suppression is wanted and is cleared the moment it is not. Neither
gate is readable from outside (the event one is component-local), so re-asserting blindly is cheaper and more
robust than trying to detect which writer stomped us. Reasoned from the mods' sources, **not yet watched in
game.**

### Retracted: "the legacy plot-tooltip mods are inert on 1.5.0"

This was observed, but only of **bz-map-trix 3.9.2**, the stale copy installed on this machine. Loading it under 1.5.0
on 2026-09-17 produced, in `UI.log`:

```
Failed to open file - .../core/ui/lenses/lens-manager.chunk.js
SOURCE ERROR - /bz-map-trix/ui/options/bz-map-trix-options.js
SOURCE ERROR - /bz-map-trix/ui/mini-map/bz-panel-mini-map.js
SOURCE ERROR - /bz-map-trix/ui/tooltips/bz-plot-tooltip.js
```

That is a real 1.5.0 verdict about the removed APIs, and it means 3.9.2's plot tooltip and its `LensManager.toggleLayer`
prototype patch never run. It says nothing about **4.1.0**, which ships a plot tooltip built for 1.5.0. Treat the
coexistence question as **open** until 4.1.0 has been read and run: it is the one other mod that puts a competing
surface on the same map tile under the same cursor.

TCS Improved Plot Tooltip (`3506956202`) overrode `ui/tooltips/plot-tooltip.js`, a path no module ships in 1.5.0. That
finding also came from a snapshot and has not been re-checked against the current Workshop version.

### The mods that do work on 1.5.0 decorate the ui-next tooltip, and suppression is clean for them

- **Handheld/Controller UI Improvements** (`3701064830`) — `plot-tooltip-population.js` reads the hovered plot and
  adds population lines; `plot-tooltip-offscreen-hide.js` hides the tooltip during camera motion by toggling its own
  class on `#uinext-tooltips`; `tooltip-toggle-guard.js` re-fires `active-device-type-changed`. None of these touches
  either of the mod's gates, and the mod touches neither of theirs. When this mod suppresses the plot tooltip the
  handheld additions simply do not render, which is the intended outcome — the lens panel is showing instead.
- **Aventura Resources Stockpile** (`3729215006`) — `aventura-resource-tooltips.js` runs a `MutationObserver` over
  `#uinext-tooltips` and injects into the plot tooltip as it mounts. Same verdict: suppression means the tooltip never
  mounts, so the observer never fires, and both resume together when suppression lifts.
- **Scapeh's Better Nested Tooltips** (`3735528208`) — works on the nested/locked tooltip stack.
  `cursorOutsideStack()` deliberately uses three independent checks, and check (2) is pure geometry over
  `.tooltip-autolock-frame` rects, documented as "robust to transforms, pointer-events, and panels painted above the
  tooltip". Check (1) uses `elementFromPoint`, which skips `pointer-events:none` nodes. This mod's panels are
  `pointer-events:none` and carry no autolock class, so they cannot produce a false open or a false close either way.
- **Enhanced Town Focus Info** (`3548476215`), **f1rstdan's Cool UI** (`3510572267`), **bz-flag-corps**
  (`3507103281`), **LF Yields** (`3515801789`), **Leonardfactory's Policy Yield Previews** (`3689032288`) — these edit
  the city, town-focus, city-yields and tech/civic tooltips. None of them is a map-plot surface, so they never share a
  screen position or a gate with anything here.
- **readable-tooltips** (this author's own mod) — wraps `TooltipController.reposition` to offset `#tooltip-root`
  (z-index 99), which is the legacy simple-tooltip host. It does not touch `#uinext-tooltips` and does not touch the
  plot tooltip. This mod's panels position themselves, so they are neither offset by it nor in its way.

### The one real conflict: stacking order (fixed)

`core/ui/shell/root-shell.html` mounts `#uinext-dropdowns` and `#uinext-tooltips` at `z-index: 10000` (lines 151-160)
and `#tooltip-root` at `z-index: 99` (line 163). Every ui-next tooltip renders inside `#uinext-tooltips` — the game's
own, and the ones the working tooltip mods above portal or inject into it.

The mod's cursor panels were at `z-index: 9999`, i.e. **under** that layer, while both anchor to the cursor. This is
the same failure already diagnosed and fixed for the toast, whose header comment records `z-index:99` as "a prime
cause of 'notifications never show'".

Fixed by giving both cursor panels `PANEL_Z = 10001` (exported from `emigration-lens-hover-panel.js`, imported by
`emigration-enclave-tooltip.js` so the two cannot drift), and lifting the toast from 10001 to 10002 so a notification
still wins over a hover readout.

Not watched in game. The cheap confirmation, when the game is next up: turn on the Ethnicity lens and hover a unit
flag on an owned tile — the unit-flag tooltip and the lens panel should both be legible, with the panel on top.

## Outstanding risk, not fixed

`setBasePlotTooltipHidden()` latches on a module-level `_hidden` flag and only acts on a transition.
`isGlobalRuleVisible` is created **inside** the plot-tooltip component (line 1223), so it resets to `true` whenever
that component remounts.
If the component remounts while a lens is still active — an age transition or a view change are the candidates — the
tooltip would come back and the latch would stop the mod from re-asserting.

Not fixed, because it has not been observed. The cheap test that would prove it: turn a lens on, trigger an age
transition, and see whether the base plot tooltip reappears under the lens panel. If it does, the fix is to re-assert
on the hover-panel render pass instead of latching, or to re-apply on the view-change event.
