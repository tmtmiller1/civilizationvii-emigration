# Emigration dashboard improvements plan

Four changes to the Emigration tab in the Demographics screen (and the standalone window). Spans
both mods: **emigration** (data + guide + metric specs) and **demographics** (chart engine + captions).
Build/sync after each part with `./release.sh && rsync -a --delete dist/<mod>/ "$MODS/<mod>/"` for both
mods; verify with `npm run verify` (emigration) and `npx tsc --noEmit` / `eslint` (both).

---

## (1) Guide: fill in missing detail + make the red ✗ actually appear  — ✅ DONE (synced)

**Finding:** `emigration-guide.js` already renders both marks — `yes:true → ✓` (green `.y`),
`yes:false → ✗` (red `.n`). So "X's not appearing" is almost certainly that the **✗ glyph (U+2717)
doesn't render** in the GameFace BodyFont/TitleFont (same class of issue as the PDF needing pifont for
✓/✗). Only the ✓ (U+2713) happens to render.

**Done:**
- [x] Mark glyph: `NO` changed from ✗ (U+2717, absent in GameFace fonts → rendered blank) to `×`
  (U+00D7, universally present), styled bold + larger via `.emig-guide-ic.n` so the red X reads clearly.
  ✓ (U+2713) kept (it renders).
- [x] Filled every empty `note` (pillaged, starvation, disasters, overcrowding, higher prosperity, your
  civilization, migration-between-civs, closed borders) with a concise explanation.
- [x] Re-audited entries against current behavior; clarified the city-states row (they still don't
  send/receive, but attacking a city drives ITS people out) and added a dedicated "What it does NOT do"
  group with two new ✗ rows (no instant cross-map movement; no hand-picking individual migrants).
- [x] Mirrored all changes into the README matrix (added a "What it does NOT do" sub-table).

**Files:** `emigration/ui/emigration-guide.js`, `emigration/README.md`.

**Note:** `npm run verify` currently fails earlier in the chain on a pre-existing complexity error in
`emigration-population.js` (`currentAgeProgressPct`) — NOT touched by this work (likely Copilot/uncommitted).
The guide file is tsc- and eslint-clean; the build (which doesn't gate on lint) synced fine.

---

## (2)+(3) Migration graphs: per-turn bars ↔ cumulative lines (merged)  — ✅ DONE (synced)

**Done:** Added 4 cumulative specs (`emig_net_cum`/`emig_out_cum`/`emig_in_cum` + the existing
`emig_refugees`) and a per-turn refugees spec (`emig_ref_turn`, new `sampleRefugees` watermark accessor)
→ 8 metrics total. The "Graphs" tab is now a **2D metric-group** with a metric toggle (Net/Emigration/
Immigration/Refugees) + a view toggle (Per turn / Cumulative). Per-turn specs carry `chartType:"bar"`;
the chart engine renders them as Chart.js bars (native ± / zero baseline / grouped-by-civ), cumulative
stay lines. Each spec has a `description` caption (#4). Files touched: emigration-migration-stats.js
(`wmRefugees` + `sampleRefugees`), emigration-demographics.js (8 specs + 2D group), demographics
metric-group (2D shape) in demographics-metrics.js + view-history.js, and chart-line-config.js
(`type` from `metricMeta.chartType`).


**Unified design (supersedes the earlier "only Net as bars" / "cumulative as extra members"):** the
"Graphs" tab gets **two toggle rows** — a metric toggle and a view toggle — giving each metric two
representations (4 metrics × 2 views = 8 charts):
- **Metric toggle:** Net Migration · Emigration · Immigration · Refugees.
- **View toggle:** **Per turn (bars)** · **Cumulative (line over time)**.
- **Per turn → BAR chart**, zero baseline, all civs grouped/clustered, bars up = gain / down = loss
  (so Net's ± reads naturally; Emigration/Immigration/Refugees-per-turn are ≥0 bars from zero).
- **Cumulative → LINE chart**, the running total to date over time (Net cumulative can be ±; the rest
  climb monotonically).

**Metrics (8 total).** Per-turn ones are `chartType:"bar"`, cumulative ones `chartType:"line"`:
| Metric | Per turn (bar) | Cumulative (line) | Accessors |
|---|---|---|---|
| Net Migration | `emig_net_migration` | `emig_net_cum` | `netDeltaForPlayer` / `netCumFor` |
| Emigration | `emig_out` | `emig_out_cum` | `sampleOut` / `grossOutCumFor` |
| Immigration | `emig_in` | `emig_in_cum` | `sampleIn` / `grossInCumFor` |
| Refugees | `emig_ref_turn` | `emig_refugees` | per-turn refugees(?) / `refugeesCumFor` |

✅ **Per-turn refugees accessor:** resolved — added `sampleRefugees` (with a `wmRefugees` watermark) to
`emigration-migration-stats.js`.

**Work (all complete):**
- [x] Extended the metric-group feature to **2D** (members × views) — `registerMetricGroup` accepts the
  2D shape; `view-history.js` renders both toggles; effective metric = `members[metricSel][viewSel]`.
- [x] Registered all 8 metrics (`registerMetric`); per-turn ones set `chartType:"bar"`.
- [x] Bar rendering via Chart.js `type:"bar"` (chosen from `metricMeta.chartType` in
  `chart-line-config.js`) — native zero baseline, ±, and grouped-by-civ; datasets already carry per-civ
  `backgroundColor`. No separate renderer was needed (Chart.js handles it).
- [x] Each of the 8 metrics has a `description` caption (#4).

**Files (done):** `demographics/ui/metrics/demographics-metrics.js` (2D group shape),
`demographics/ui/screen-demographics/views/history/view-history.js` (two-toggle render),
`demographics/ui/screen-demographics/charts/line/chart-line-config.js` (`type` from `chartType`),
`emigration/ui/emigration-demographics.js` (8 SPECs + 2D group),
`emigration/ui/emigration-migration-stats.js` (`sampleRefugees`).

---

## (4) Concise definition under each graph's title  — ✅ DONE (synced)

**Done:** Added a `description` to the four current emigration metric specs (NET/OUT/IN/REF); Demographics
`appendMetricCaptions` now renders any registered metric's `description` as an always-visible one-line
caption under the title (strict `id===` guard to dodge getMetric's METRICS[0] fallback). The remaining
4 cumulative metrics will get descriptions when added in (2)+(3).


**Work (all complete):**
- [x] Added a `description` to all 8 emigration metric SPECs (per-turn + cumulative).
- [x] `appendMetricCaptions` renders any registered metric's `description` as an always-visible one-line
  caption under the title (strict `id===` guard to dodge `getMetric`'s METRICS[0] fallback). Generalizes
  to any metric that supplies a `description`.
- [x] Scope decided: emigration graphs for now (built-in metrics keep their existing hover popovers;
  the new path is generic and can be extended later).

**Files (done):** `emigration/ui/emigration-demographics.js` (SPEC `description`s),
`demographics/ui/screen-demographics/views/history/history-captions.js` (renders external descriptions).
(`registerMetric` already passes arbitrary spec fields through, so no change needed there.)

---

## Suggested order
1. **(1) Guide** — ✅ DONE.
2. **(4) Captions** — ✅ DONE.
3. **(2)+(3) metrics + 2D group toggle** — ✅ DONE.
4. **(2) bar renderer** — ✅ DONE (Chart.js `type:"bar"`; per-turn specs set `chartType:"bar"`).

**All four plan items complete.**

## Decisions (locked)
- (1) ✅ DONE — fixed the ✗ glyph (render-safe `×`), filled notes, re-audited, mirrored to README.
- (2)+(3) **MERGED**: "Graphs" tab gets a **metric toggle** (Net/Emigration/Immigration/Refugees) and a
  **view toggle** (Per turn = **bars**, ±, all civs grouped, zero baseline / Cumulative = **line over
  time**). 8 metrics total (4 per-turn bars + 4 cumulative lines).
- (4) Per-metric `description` rendered as a concise line under the title (all 8 metrics).
