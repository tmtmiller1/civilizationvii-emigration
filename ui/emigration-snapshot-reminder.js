// emigration-snapshot-reminder.js
//
// A persistent reminder badge shown above every migration-dashboard tab when the timeline-detail
// setting samples less often than every turn. At interval N (> 1) the mod snapshots migration flows
// only every N turns, so a just-met civ or a recent move can lag up to N turns before it appears in
// the dashboard ; without a cue, that gap reads as a bug ("I met them, why aren't they here?").
// Self-contained (own style injection + DOM) so the views chunk that hosts the tabs stays under its
// line budget, and so both dashboard surfaces (standalone window + Demographics-embedded page) get
// the reminder from the single render path they share.

import { getSnapshotInterval } from "/emigration/ui/emigration-settings.js";

const STYLE_ID = "emig-snap-badge-style";
const CSS =
  ".emig-snap-badge{align-self:center;margin-bottom:0.25rem;padding:0.12rem 0.75rem;border-radius:0.9rem;font-size:0.72rem;letter-spacing:0.04rem;color:#f3c34c;text-align:center;background:rgba(243,195,76,0.12);border:1px solid rgba(243,195,76,0.4);}";

/** Inject the badge stylesheet once (idempotent). */
function injectStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

/**
 * Append the timeline-detail reminder to a dashboard wrapper when the snapshot interval is coarser
 * than every turn. No-op at the finest setting (every turn), where nothing lags, and a no-op if the
 * DOM is unavailable. The badge sits in the persistent wrapper above the per-tab body, so it shows
 * on every tab.
 * @param {*} wrap The dashboard wrapper element.
 */
export function appendSnapshotReminder(wrap) {
  if (!wrap || typeof document === "undefined") return;
  const n = getSnapshotInterval();
  if (n <= 1) return;
  injectStyle();
  const badge = document.createElement("div");
  badge.className = "emig-snap-badge";
  badge.textContent = "Timeline detail: every " + n + " turns ; a newly met civ or a recent move "
    + "can take up to " + n + " turns to appear here. Change in Options.";
  wrap.appendChild(badge);
}
