// emigration-feedback.js
//
// In-game feedback for migration (§10): transient HUD toasts and "world refugee news"
// for major events anywhere in the world. Gated by CONFIG.notifyMode (0 off / 1 important
// / 2 verbose) and the per-channel flags, so it's silent by default at mode 0 and only
// high-signal at mode 1.
//
// Channels and what the probe/file-analysis settled:
//   • Toast - a styled DOM element on the HUD root (the engine has no toast API; corpus
//     mods do the same). We inject the CSS so it actually renders.
//   • World news - toast-delivered, threshold-gated, fired once per tier.
//   • On-map floating indicator - NOT done here: WorldUI has no floating-text method
//     (only overlay/marker/VFX builders - createOverlayGroup / createFixedMarker /
//     triggerVFXAtPlot), so a proper indicator needs an overlay build (a follow-up).
//   • Engine notifications (the clickable end-turn list) need a DB NotificationType
//     (probe API4-5); a future addition alongside the policy data component.
//
// Everything is defensive: the GameFace DOM can be absent, so each channel degrades to a
// no-op rather than throwing.

import { CONFIG } from "/emigration/ui/emigration-config.js";
import {
  refugeeHeadline,
  civAdjective,
  actionHint,
  localDigestMessage
} from "/emigration/ui/emigration-naming.js";
import { formatPeople } from "/emigration/ui/emigration-population.js";
import { assimilationCostFor } from "/emigration/ui/emigration-effects.js";

const NEWS_KEY = "EmigrationNews_v1";

/** @type {{ announced: Record<string, number>, lastToastTurn: number } | null} */
let _news = null;

/**
 * The raw persisted world-news string, or null.
 * @returns {string|null} The stored JSON, or null.
 */
function rawNews() {
  const g = Configuration?.getGame?.();
  return g && typeof g.getValue === "function" ? g.getValue(NEWS_KEY) : null;
}

/**
 * Read + parse the persisted world-news state, or null.
 * @returns {{ announced: Record<string, number>, lastToastTurn: number }|null} State, or null.
 */
function loadNews() {
  try {
    const raw = rawNews();
    const o = typeof raw === "string" && raw.length ? JSON.parse(raw) : null;
    if (!o || typeof o !== "object") return null;
    return { announced: o.announced || {}, lastToastTurn: o.lastToastTurn || 0 };
  } catch (_) {
    return null;
  }
}

/**
 * Load (once) the world-news state (announced milestone tiers + the last toast turn).
 * @returns {{ announced: Record<string, number>, lastToastTurn: number }} State.
 */
function newsState() {
  if (!_news) _news = loadNews() || { announced: {}, lastToastTurn: 0 };
  return _news;
}

/** Persist the world-news state. */
function persistNews() {
  try {
    Configuration?.editGame?.()?.setValue?.(NEWS_KEY, JSON.stringify(_news));
  } catch (_) {
    /* ignore */
  }
}

// The toast styling matches Civ VII's HUD: the game's BodyFont, a dark panel
// (#12151f→#05070d, the engine's panel tones) and parchment text (#e5d2ac), so a
// migration toast reads as a native message rather than a web element.
const TOAST_CSS =
  ".emig-toast{position:fixed;top:5rem;left:50%;transform:translateX(-50%);z-index:99;" +
  "max-width:40rem;padding:0.4rem 1.1rem;text-align:center;pointer-events:none;" +
  'font-family:"BodyFont","BodyFont-JP","BodyFont-KR","BodyFont-SC","BodyFont-TC";' +
  "font-size:1rem;color:#e5d2ac;" +
  "background:linear-gradient(180deg,rgba(18,21,31,0.94) 0%,rgba(5,7,13,0.94) 100%);" +
  "border:0.0555rem solid rgba(229,210,172,0.4);border-radius:0.333rem;" +
  "box-shadow:0 0.166rem 0.5rem rgba(0,0,0,0.6);}";

/** Inject the toast stylesheet once (so the DOM toast actually renders, game-styled). */
function injectToastStyle() {
  try {
    if (document.getElementById("emig-toast-style")) return;
    const s = document.createElement("style");
    s.id = "emig-toast-style";
    s.textContent = TOAST_CSS;
    document.head.appendChild(s);
  } catch (_) {
    /* ignore */
  }
}

/**
 * Emit a transient toast on the HUD, styled to match the game (see TOAST_CSS). No-op
 * when off.
 * @param {string} msg The message.
 */
export function toast(msg) {
  if (CONFIG.notifyMode < 1 || !CONFIG.notifyToasts) return;
  try {
    const root = document.body || document.documentElement;
    if (!root) return;
    injectToastStyle();
    const el = document.createElement("div");
    el.className = "emig-toast";
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => {
      try {
        el.remove();
      } catch (_) {
        /* ignore */
      }
    }, 6000);
  } catch (_) {
    /* ignore */
  }
}

/**
 * The current game turn, or 0.
 * @returns {number} Game.turn or 0.
 */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Whether an "important" toast may fire now (anti-spam cooldown): true at most once per
 * notifyCooldownTurns, stamping the turn when it returns true.
 * @returns {boolean} True if allowed (and the cooldown was reset).
 */
function cooldownOk() {
  const s = newsState();
  const turn = gameTurn();
  if (typeof s.lastToastTurn === "number" && turn - s.lastToastTurn < CONFIG.notifyCooldownTurns) {
    return false;
  }
  s.lastToastTurn = turn;
  persistNews();
  return true;
}

/**
 * Fire a high-signal toast subject to the cooldown backstop. Used for the events that
 * actually warrant a notification (bad disasters, refugee-crisis milestones).
 * @param {string} msg The message.
 */
export function announceImportant(msg) {
  if (CONFIG.notifyMode < 1) return;
  if (!cooldownOk()) return;
  toast(msg);
}

/**
 * The set of civs that produced refugees (war/disaster/conquest) in a pass.
 * @param {{cause?:string, srcOwner?:number}[]} migrations Applied migrations.
 * @returns {Set<number>} Source owner ids.
 */
function refugeeCivs(migrations) {
  /** @type {Set<number>} */
  const set = new Set();
  for (const m of migrations) {
    if (m.cause && m.cause !== "unhappiness" && typeof m.srcOwner === "number") set.add(m.srcOwner);
  }
  return set;
}

/**
 * Fire a refugee-crisis alert when a civ's CUMULATIVE refugees cross a worldRefugeeThreshold
 * milestone - once per tier, so a long war produces a few headlines, not one per turn.
 * @param {number} pid Source civ id.
 * @param {number} cum Cumulative refugees produced.
 */
function crisisMilestone(pid, cum) {
  if (!(cum >= CONFIG.worldRefugeeThreshold)) return;
  const tier = Math.floor(cum / CONFIG.worldRefugeeThreshold);
  const s = newsState();
  const key = "civ" + pid;
  if ((s.announced[key] || 0) >= tier) return;
  s.announced[key] = tier;
  persistNews();
  const ev = { cause: "crisis", civ: civAdjective(pid), people: formatPeople(cum) + " people" };
  announceImportant(refugeeHeadline(ev));
}

/**
 * Per-pass refugee feedback, throttled to avoid spam:
 *  • Important mode (default): only refugee-CRISIS milestones (per-civ cumulative).
 *  • Verbose mode (2): additionally a per-pass per-cause toast.
 * Plain unhappiness migration is never announced (the quiet baseline).
 * @param {{cause?:string, srcOwner?:number, people?:number}[]} migrations Applied migrations.
 */
export function reportPassFeedback(migrations) {
  if (CONFIG.notifyMode < 1 || !Array.isArray(migrations) || !migrations.length) return;
  if (CONFIG.notifyMode >= 2) toastPerCause(migrations);
  localDigest(migrations); // the local player's own "why am I losing people?" explainer
  if (!CONFIG.notifyWorldNews) return;
  const data = /** @type {*} */ (globalThis).EmigrationData;
  if (!data || typeof data.refugeesCumFor !== "function") return;
  for (const pid of refugeeCivs(migrations)) crisisMilestone(pid, data.refugeesCumFor(pid));
}

/**
 * Verbose per-pass per-cause toast (mode 2 only), each carrying its action hint.
 * @param {{cause?:string, people?:number}[]} migrations Applied migrations.
 */
function toastPerCause(migrations) {
  /** @type {Record<string, number>} */
  const byCause = {};
  for (const m of migrations) {
    if (m.cause && m.cause !== "unhappiness") byCause[m.cause] = (byCause[m.cause] || 0) + (m.people || 0);
  }
  for (const cause of Object.keys(byCause)) {
    const head = refugeeHeadline({ cause, people: formatPeople(byCause[cause]) + " people" });
    const hint = actionHint(cause);
    toast(hint ? head + " " + hint : head);
  }
}

/**
 * The local player id, or null when unavailable.
 * @returns {number|null} The id.
 */
function localPlayerId() {
  try {
    return typeof GameContext !== "undefined" && typeof GameContext.localPlayerID === "number"
      ? GameContext.localPlayerID
      : null;
  } catch (_) {
    return null;
  }
}

/**
 * The dominant cause in a per-cause people map (the most-people cause).
 * @param {Record<string, number>} byCause People per cause.
 * @returns {string} The dominant cause.
 */
function dominantCause(byCause) {
  let best = "other";
  let bestN = -1;
  for (const c of Object.keys(byCause)) {
    if (byCause[c] > bestN) {
      bestN = byCause[c];
      best = c;
    }
  }
  return best;
}

/**
 * Fold one migration into the local-loss accumulator (a loss only if its source is the local
 * player): updates the running total, the per-cause tally, and the largest single loss.
 * @param {{total:number, lead:*, byCause:Record<string,number>}} acc Accumulator.
 * @param {{srcOwner?:number, people?:number, cause?:string}} m A migration.
 * @param {number} me Local player id.
 */
function foldLocalLoss(acc, m, me) {
  const p = m.srcOwner === me ? m.people || 0 : 0;
  if (!(p > 0)) return;
  acc.total += p;
  const c = m.cause || "other";
  acc.byCause[c] = (acc.byCause[c] || 0) + p;
  if (!acc.lead || p > (acc.lead.people || 0)) acc.lead = m;
}

/**
 * Summarize the local player's losses this pass: total people, dominant cause, and the largest
 * single loss (for the source/destination), or null if the player lost nobody.
 * @param {{srcOwner?:number, people?:number, cause?:string}[]} migs Applied migrations.
 * @param {number} me Local player id.
 * @returns {{total:number, cause:string, lead:*}|null} The summary, or null.
 */
function localLossSummary(migs, me) {
  /** @type {{total:number, lead:*, byCause:Record<string,number>}} */
  const acc = { total: 0, lead: null, byCause: {} };
  for (const m of migs) foldLocalLoss(acc, m, me);
  return acc.lead ? { total: acc.total, cause: dominantCause(acc.byCause), lead: acc.lead } : null;
}

/**
 * Fire the local player's explanatory digest (subject to the important-toast cooldown): why they
 * lost population this pass, what to do about it, whether it's temporary, and , for a cross-civ
 * loss , what the destination pays to absorb them. No-op when no local player or no local loss.
 * @param {{srcOwner?:number, destOwner?:number, people?:number, cause?:string,
 *          crossCiv?:boolean, srcName?:string, destName?:string}[]} migs Applied migrations.
 */
function localDigest(migs) {
  const me = localPlayerId();
  if (me == null) return;
  const s = localLossSummary(migs, me);
  if (!s) return;
  const lead = s.lead;
  const crossCiv = !!lead.crossCiv && typeof lead.destOwner === "number";
  const destGold = crossCiv ? assimilationCostFor(lead.destOwner).gold : 0;
  announceImportant(
    localDigestMessage({
      cause: s.cause,
      people: formatPeople(s.total) + " people",
      city: lead.srcName || "a settlement",
      crossCiv,
      destName: lead.destName,
      destGold
    })
  );
}
