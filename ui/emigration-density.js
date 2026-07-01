// emigration-density.js
//
// Resolution-aware "density" stylesheet for the Emigration dashboard.
//
// WHY THIS EXISTS
// ---------------
// Civilization VII's UI scales rem with resolution via core/ui/themes/default/
// global-scaling.js: `html { font-size: basis * 18px }`, where the basis FLOORS
// at 1.0 for any window height <= ~1333px. So at the canonical resolutions
// (1080p / 1440p / 2160p) the viewport is always ~60rem tall, the size this
// dashboard was designed against, but on a sub-1080p laptop (1366x768,
// 1600x900) the font stays pinned at 18px and the viewport is only ~40-50rem
// tall.
//
// Every fixed-rem piece of chrome (the screen title, the tab bar, the control
// pill rows, the card headers and paddings) keeps its rem size, so at a short
// viewport that chrome eats a far larger share of the column and squeezes the
// flex-grow content (most visibly the 2:1 network / flow diagram, which then
// auto-fits into a sliver). The flex chain itself is sound; the problem is
// purely that the chrome doesn't get out of the way when vertical space is
// scarce.
//
// THE RESPONSE IS PURE CSS, no JavaScript controller, no re-render. The
// stylesheet below combines two layers (see the comment on DENSITY_CSS): the
// fixed-rem CONTENT scales continuously with clamp(), and the small surrounding
// CHROME steps at two `@media (max-height: …rem)` breakpoints. The rem unit in
// the media query tracks the engine's scaled root font, so the breakpoints
// respond to BOTH resolution and the Interface Size accessibility setting,
// exactly as the base game's own screens do (advisor-screen, pause-menu and
// load-screen all adapt with @media (max-height: …rem)). The same stylesheet is
// injected for the standalone screen and the Demographics-embedded Migration
// page, so both inherit the right spacing with no wiring.

// ────────────────────────────────────────────────────────────────────────────
// DENSITY STYLESHEET
//
// The compaction rules. They live here (rather than inline in
// emigration-views.js) so the dashboard view module stays under its line budget,
// and so all resolution logic sits in one place. Appended to DASH_CSS in
// emigration-views.js, so these rules come AFTER the base sheet and win ties.
//
// Two layers:
//   1. PER-TAB CONTENT, each tab's fixed-rem displays (ledger/pressure tables,
//      the explicit-rem Cause pies, Policy stance type, the Guide). These scale
//      CONTINUOUSLY with viewport height via clamp(floor, K·vh, canonical) so
//      they never "jump" at a threshold; the network diagram auto-fits itself.
//      Unconditional, keyed under `.emig-dash`, recomputed live on every resize.
//   2. SHARED CHROME, the dashboard's own frame (tabs, control rows, cards,
//      section titles, tabbody max-height) plus a few per-tab spacing nudges.
//      These STEP at two `@media (max-height: …rem)` breakpoints, small
//      inter-block nudges the eye can't resolve. rem in the query tracks the
//      engine's scaled root font, so the steps fire on a short viewport OR a
//      larger Interface Size, matching the base game's own screens. The micro
//      block (≤44rem) cascades on top of the compact block (≤54rem); both apply
//      below 44rem and micro wins by source order.
//
// Every selector is scoped under `.emig-dash` (present on the dashboard root in
// BOTH the standalone screen and the Demographics-embedded page) so it covers
// both contexts and keeps the specificity that out-specifies the base sheet.
// Only spacing / font-size is touched, never structure or data.
// ────────────────────────────────────────────────────────────────────────────
export const DENSITY_CSS =
  // ── Per-tab CONTENT, FLUID (continuous) sizing ───────────────────────────
  // Each tab's FIXED-size content scales fluidly with available viewport height
  // via clamp(floor, K·vh, canonical): canonical at 1080p+ (K = canonical / 0.6,
  // and the engine keeps every design resolution ~60rem tall) easing to a
  // readable floor as the window shortens, no buckets, recomputed live on every
  // resize. The canvas pies draw at a fixed 320px bitmap and are only DISPLAYED
  // at this size, so CSS rescales them with no redraw.
  ".emig-dash .emig-led-c{font-size:clamp(0.95rem,1.97vh,1.18rem);}" +
  ".emig-dash .emig-pr-c{font-size:clamp(0.92rem,1.83vh,1.1rem);}" +
  ".emig-dash .emig-led-bar{height:clamp(0.6rem,1.17vh,0.7rem);}" +
  ".emig-dash .emig-pie-c,.emig-dash .emig-pie-empty" +
  "{width:clamp(9.5rem,22.5vh,13.5rem);height:clamp(9.5rem,22.5vh,13.5rem);}" +
  ".emig-dash .emig-pie.big .emig-pie-c" +
  "{width:clamp(12rem,28.33vh,17rem);height:clamp(12rem,28.33vh,17rem);}" +
  ".emig-dash .emig-stance-row{font-size:clamp(1.05rem,2.33vh,1.4rem);}" +
  ".emig-dash .emig-stance-detail{font-size:clamp(0.92rem,1.83vh,1.1rem);}" +
  ".emig-dash .emig-filter-btn{font-size:clamp(0.74rem,1.3vh,0.78rem);}" +
  ".emig-dash .emig-flow-tog{font-size:clamp(0.92rem,1.67vh,1rem);}" +
  ".emig-dash .emig-netc-cap{font-size:clamp(0.88rem,1.58vh,0.95rem);}" +
  ".emig-dash .emig-netc-time-note{font-size:clamp(0.78rem,1.37vh,0.82rem);}" +
  ".emig-dash .emig-guide-h{font-size:clamp(1.05rem,1.92vh,1.15rem);}" +
  ".emig-dash .emig-guide-q{font-size:clamp(1rem,1.97vh,1.18rem);}" +
  ".emig-dash .emig-guide-note{font-size:clamp(0.94rem,1.75vh,1.05rem);}" +
  ".emig-dash .emig-guide-faq-q{font-size:clamp(1.04rem,2vh,1.2rem);}" +
  ".emig-dash .emig-guide-faq-a{font-size:clamp(0.96rem,1.83vh,1.1rem);}" +
  // ── COMPACT chrome (viewport ≲ 54rem tall) ────────────────────────────────
  "@media (max-height: 53.9rem){" +
  ".emig-dash{gap:0.55rem;}" +
  ".emig-dash .emig-tabs{margin-bottom:0.45rem;}" +
  ".emig-dash .emig-tab{padding:0.2rem 0.7rem;font-size:0.78rem;}" +
  ".emig-dash .emig-ctrl-row{margin:0.05rem 0 0.3rem;gap:0.25rem 1rem;}" +
  ".emig-dash .emig-card{padding:0.42rem 0.6rem;}" +
  ".emig-dash .emig-card-h{margin-bottom:0.3rem;padding-bottom:0.15rem;}" +
  ".emig-dash .emig-section-title{font-size:1rem;margin:0.05rem 0 0.4rem;}" +
  ".emig-dash .emig-tabbody{max-height:80vh;}" +
  ".emig-screen-host .emig-tabbody{max-height:none;}" +
  ".emig-dash .emig-led-c{padding:0.5rem 0.55rem;}" +
  ".emig-dash .emig-pr-c{padding:0.45rem 0.55rem;}" +
  ".emig-dash .emig-pie-row{gap:1.4rem;margin-bottom:0.9rem;}" +
  ".emig-dash .emig-stance-block{padding:0.55rem 0.2rem;}" +
  ".emig-dash .emig-netc-chips{margin:0.08rem 0 0.3rem;}" +
  ".emig-dash .emig-legend{margin:0.3rem 0;}" +
  ".emig-dash .emig-netc-time{margin:0.35rem 0;}" +
  ".emig-dash .emig-netc-time-note{margin:0.35rem 0;}" +
  ".emig-dash .emig-ntf-head{padding:0.32rem 0.55rem;}" +
  ".emig-dash .emig-ntf-list{gap:0.25rem;}" +
  ".emig-dash .emig-guide-row{padding:0.45rem 0.1rem;}" +
  "}" +
  // ── MICRO chrome (viewport ≲ 44rem tall, cascades over compact) ───────────
  "@media (max-height: 43.9rem){" +
  ".emig-dash{gap:0.4rem;}" +
  ".emig-dash .emig-tabs{margin-bottom:0.3rem;}" +
  ".emig-dash .emig-tab{padding:0.14rem 0.6rem;font-size:0.74rem;}" +
  ".emig-dash .emig-ctrl-row{margin:0.04rem 0 0.22rem;gap:0.2rem 0.8rem;}" +
  ".emig-dash .emig-pill-lbl{font-size:0.8rem;}" +
  ".emig-dash .emig-card{padding:0.3rem 0.5rem;}" +
  ".emig-dash .emig-card-h{font-size:0.85rem;margin-bottom:0.22rem;padding-bottom:0.1rem;}" +
  ".emig-dash .emig-section-title{font-size:0.92rem;margin:0.04rem 0 0.32rem;}" +
  ".emig-dash .emig-tabbody{max-height:84vh;}" +
  ".emig-screen-host .emig-tabbody{max-height:none;}" +
  ".emig-dash .emig-led-c{padding:0.4rem 0.5rem;}" +
  ".emig-dash .emig-pr-c{padding:0.38rem 0.5rem;}" +
  ".emig-dash .emig-pie-row{gap:1rem;margin-bottom:0.7rem;}" +
  ".emig-dash .emig-pie{padding:0.3rem 0.3rem 0.7rem;}" +
  ".emig-dash .emig-stance-block{padding:0.4rem 0.2rem;}" +
  ".emig-dash .emig-tag{font-size:1rem;}" +
  ".emig-dash .emig-filter-btn{padding:0.14rem 0.5rem;}" +
  ".emig-dash .emig-flow-tog{padding:0.26rem 0.95rem;}" +
  ".emig-dash .emig-netc-chips{margin:0.06rem 0 0.22rem;gap:0.3rem;}" +
  ".emig-dash .emig-legend{margin:0.22rem 0;gap:0.2rem 0.7rem;}" +
  ".emig-dash .emig-netc-time{margin:0.25rem 0;}" +
  ".emig-dash .emig-netc-time-note{margin:0.25rem 0;}" +
  ".emig-dash .emig-netc-cap{margin-top:0.25rem;}" +
  ".emig-dash .emig-netc-tl{padding:0.25rem 0.5rem 0.9rem;}" +
  ".emig-dash .emig-ntf-head{padding:0.26rem 0.5rem;gap:0.45rem;}" +
  ".emig-dash .emig-ntf-list{gap:0.2rem;}" +
  ".emig-dash .emig-ntf-detail{padding:0.08rem 0.6rem 0.4rem 0.8rem;}" +
  ".emig-dash .emig-guide-row{padding:0.38rem 0.1rem;}" +
  "}";

