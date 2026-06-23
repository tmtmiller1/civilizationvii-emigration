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
// Font size intentionally omitted, the badge carries the engine `text-sm` utility class (added in
// appendSnapshotReminder) so it matches the Demographics "Analytics policy" banner it sits beside.
const CSS =
  ".emig-snap-badge{align-self:center;margin-bottom:0.25rem;padding:0.12rem 0.75rem;border-radius:0.9rem;letter-spacing:0.04rem;color:#f3c34c;text-align:center;background:rgba(243,195,76,0.12);border:1px solid rgba(243,195,76,0.4);}";

/** Inject the badge stylesheet once (idempotent). */
function injectStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

/**
 * The timeline-detail reminder text when the snapshot interval is coarser than every turn, else "".
 * Exposed on `globalThis.EmigrationTimelineNote` so the Demographics-embedded page can render it
 * beside its own "Analytics policy" banner (single source of truth for the wording).
 * @returns {string} The reminder text, or "".
 */
export function timelineDetailText() {
  const n = getSnapshotInterval();
  if (n <= 1) return "";
  return "Timeline detail: every " + n + " turns ; a newly met civ or a recent move "
    + "can take up to " + n + " turns to appear here. Change in Options.";
}

/**
 * Append the timeline-detail reminder to a dashboard wrapper when the snapshot interval is coarser
 * than every turn. No-op at the finest setting (every turn) or if the DOM is unavailable. Used by the
 * STANDALONE window; the Demographics-embedded page instead shows it beside the policy banner.
 * @param {*} wrap The dashboard wrapper element.
 */
export function appendSnapshotReminder(wrap) {
  if (!wrap || typeof document === "undefined") return;
  const text = timelineDetailText();
  if (!text) return;
  injectStyle();
  const badge = document.createElement("div");
  badge.className = "emig-snap-badge font-body text-sm";
  badge.textContent = text;
  wrap.appendChild(badge);
}

// Expose the note text so the Demographics-embedded Migration page can render it next to its
// "Analytics policy" banner (cross-mod read; absent → Demographics simply shows no timeline note).
// `metricId` scopes the note to the Network sub-tab only, the migration-flow timeline the wording
// refers to ("...can take up to N turns to appear here"). It's that sub-tab's synthetic metric id:
// the Migration panel id + Demographics' "::" sub-tab separator + the "flow" (Network) sub-tab id.
try {
  /** @type {*} */ (globalThis).EmigrationTimelineNote = {
    metricId: "emig_migration_panel::flow",
    text: timelineDetailText
  };
} catch (_) {
  /* ignore */
}
