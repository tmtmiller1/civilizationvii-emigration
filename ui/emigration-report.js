// emigration-report.js
//
// Turn applied Migration records into human-readable log lines, honoring the player's
// number-display preference (Civ population points, the Demographics-scaled people count, or both).
// This is the LOG side of reporting; in-game toasts / world-news live in emigration-feedback.js.

import { formatPeople } from "/emigration/ui/emigration-population.js";
import { getNumberMode, NumberMode } from "/emigration/ui/emigration-settings.js";
import { dlog } from "/emigration/ui/emigration-log.js";

/**
 * Localized civilization/leader name for a player id, defensively.
 * @param {number} pid Player id.
 * @returns {string} A short owner label.
 */
function ownerLabel(pid) {
  try {
    const p = Players.get(pid);
    const n = p?.civilizationName ?? p?.name;
    if (typeof n === "string" && n.length) {
      return typeof Locale !== "undefined" && Locale.compose ? Locale.compose(n) : n;
    }
  } catch (_) {
    /* ignore */
  }
  return "Player " + pid;
}

/**
 * Compose a localized string from a LOC key + args, falling back to null when Locale is unavailable
 * (headless/tests) or the key just echoes back. Mirrors the codebase's other inline composers.
 * @param {string} key A LOC key. @param {...*} args Substitution args.
 * @returns {string|null} The composed string, or null.
 */
function loc(key, ...args) {
  try {
    if (typeof Locale !== "undefined" && typeof Locale.compose === "function") {
      const v = Locale.compose(key, ...args);
      if (typeof v === "string" && v.length && !v.startsWith("LOC_")) return v;
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * Format a migration's size honoring the player's number-display preference: the Civ population
 * number, the Demographics-scaled people count, or both (default). Both reads e.g. "1 population
 * point (12 thousand people)". The unit words are localized (LOC_EMIG_COUNT_*), with the English
 * phrasing kept as a fail-safe so the line is never blank when Locale is unavailable.
 * @param {import("/emigration/ui/emigration-engine.js").Migration} m Migration.
 * @returns {string} The formatted count phrase.
 */
function formatCount(m) {
  const pts = typeof m.points === "number" ? m.points : 1;
  const civ = loc(pts === 1 ? "LOC_EMIG_COUNT_POINT" : "LOC_EMIG_COUNT_POINTS", pts)
    || (pts + (pts === 1 ? " population point" : " population points"));
  const peopleNum = formatPeople(m.people);
  const hist = loc("LOC_EMIG_COUNT_PEOPLE", peopleNum) || (peopleNum + " people");
  switch (getNumberMode()) {
    case NumberMode.CIV:
      return civ;
    case NumberMode.HISTORICAL:
      return hist;
    default:
      return loc("LOC_EMIG_COUNT_BOTH", civ, hist) || (civ + " (" + hist + ")");
  }
}

/**
 * Report one migration as a single log line.
 * @param {import("/emigration/ui/emigration-engine.js").Migration} m Migration.
 */
export function reportMigration(m) {
  const count = formatCount(m);
  if (m.cause === "attrition") {
    dlog("ATTRITION " + count + " lost from " + m.srcName + " (no refuge)");
    return;
  }
  if (m.crossCiv) {
    dlog(
      "EMIGRATION " +
        count +
        " left " +
        m.srcName +
        " (" +
        ownerLabel(m.srcOwner ?? 0) +
        ") for " +
        m.destName +
        " (" +
        ownerLabel(m.destOwner ?? m.srcOwner ?? 0) +
        ")"
    );
  } else {
    dlog("MIGRATION " + count + " moved from " + m.srcName + " to " + m.destName);
  }
}
