// emigration-density.js
//
// Resolution-aware "density" stylesheet for the Emigration dashboard. The engine's root font floors
// at 18px below ~1333px window height, so on a sub-1080p viewport (~40-50rem tall) the fixed-rem
// chrome squeezes the flex-grow content. Pure CSS response, in two layers: per-tab CONTENT scales
// continuously with clamp(), and the shared CHROME steps at two `@media (max-height: …rem)`
// breakpoints (rem tracks the scaled root font, so they respond to Interface Size too).

// ────────────────────────────────────────────────────────────────────────────
// DENSITY STYLESHEET
//
// Appended to DASH_CSS in emigration-views.js, so these rules come AFTER the base sheet and win ties.
// Every selector is scoped under `.emig-dash` (present on the dashboard root in both the standalone
// screen and the Demographics-embedded page). Only spacing / font-size is touched, never structure.
// The micro block (≤44rem) cascades on top of the compact block (≤54rem); micro wins by source order.
// ────────────────────────────────────────────────────────────────────────────
export const DENSITY_CSS =
  // ── Per-tab CONTENT, FLUID (continuous) sizing ───────────────────────────
  // Fixed-size content scales with viewport height via clamp(floor, K·vh, canonical), K = canonical /
  // 0.6 since every design resolution is ~60rem tall. The canvas pies draw at a fixed 320px bitmap and
  // are only DISPLAYED at this size, so CSS rescales them with no redraw.
  ".emig-dash .emig-led-c{font-size:var(--dg-fs-120);}" +
  ".emig-dash .emig-pr-c{font-size:var(--dg-fs-105);}" +
  ".emig-dash .emig-led-bar{height:clamp(0.6rem,1.17vh,0.7rem);}" +
  ".emig-dash .emig-pie-c,.emig-dash .emig-pie-empty" +
  "{width:clamp(9.5rem,22.5vh,13.5rem);height:clamp(9.5rem,22.5vh,13.5rem);}" +
  ".emig-dash .emig-pie.big .emig-pie-c" +
  "{width:clamp(12rem,28.33vh,17rem);height:clamp(12rem,28.33vh,17rem);}" +
  ".emig-dash .emig-stance-row{font-size:var(--dg-fs-140);}" +
  ".emig-dash .emig-stance-detail{font-size:var(--dg-fs-105);}" +
  ".emig-dash .emig-filter-btn{font-size:var(--dg-fs-72);}" +
  ".emig-dash .emig-netc-cap{font-size:var(--dg-fs-95);}" +
  ".emig-dash .emig-netc-time-note{font-size:var(--dg-fs-85);}" +
  ".emig-dash .emig-guide-h{font-size:var(--dg-fs-120);}" +
  ".emig-dash .emig-guide-q{font-size:var(--dg-fs-120);}" +
  ".emig-dash .emig-guide-note{font-size:var(--dg-fs-105);}" +
  ".emig-dash .emig-guide-faq-q{font-size:var(--dg-fs-120);}" +
  ".emig-dash .emig-guide-faq-a{font-size:var(--dg-fs-105);}" +
  // ── COMPACT chrome (viewport ≲ 54rem tall) ────────────────────────────────
  "@media (max-height: 53.9rem){" +
  ".emig-dash{gap:0.55rem;}" +
  ".emig-dash .emig-tabs{margin-bottom:0.45rem;}" +
  ".emig-dash .emig-tab{padding:0.2rem 0.7rem;font-size:var(--dg-fs-72);}" +
  ".emig-dash .emig-ctrl-row{margin:0.05rem 0 0.3rem;gap:0.25rem 1rem;}" +
  ".emig-dash .emig-card{padding:0.42rem 0.6rem;}" +
  ".emig-dash .emig-card-h{margin-bottom:0.3rem;padding-bottom:0.15rem;}" +
  ".emig-dash .emig-section-title{font-size:var(--dg-fs-95);margin:0.05rem 0 0.4rem;}" +
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
  ".emig-dash .emig-tab{padding:0.14rem 0.6rem;font-size:var(--dg-fs-72);}" +
  ".emig-dash .emig-ctrl-row{margin:0.04rem 0 0.22rem;gap:0.2rem 0.8rem;}" +
  ".emig-dash .emig-pill-lbl{font-size:var(--dg-fs-85);}" +
  ".emig-dash .emig-card{padding:0.3rem 0.5rem;}" +
  ".emig-dash .emig-card-h{font-size:var(--dg-fs-85);margin-bottom:0.22rem;padding-bottom:0.1rem;}" +
  ".emig-dash .emig-section-title{font-size:var(--dg-fs-95);margin:0.04rem 0 0.32rem;}" +
  ".emig-dash .emig-tabbody{max-height:84vh;}" +
  ".emig-screen-host .emig-tabbody{max-height:none;}" +
  ".emig-dash .emig-led-c{padding:0.4rem 0.5rem;}" +
  ".emig-dash .emig-pr-c{padding:0.38rem 0.5rem;}" +
  ".emig-dash .emig-pie-row{gap:1rem;margin-bottom:0.7rem;}" +
  ".emig-dash .emig-pie{padding:0.3rem 0.3rem 0.7rem;}" +
  ".emig-dash .emig-stance-block{padding:0.4rem 0.2rem;}" +
  ".emig-dash .emig-tag{font-size:var(--dg-fs-95);}" +
  ".emig-dash .emig-filter-btn{padding:0.14rem 0.5rem;}" +
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

