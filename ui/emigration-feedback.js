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
import { formatBoth } from "/emigration/ui/emigration-population.js";
import { causeLabel } from "/emigration/ui/emigration-causes.js";
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

// The toast is styled to read as a NATIVE Civ VII HUD message, not a web element: the game's
// TitleFont eyebrow + BodyFont body, its dark panel gradient, and its own gold/bronze trim palette
// (#8c7e62 bronze frame, #f0bc78 gold highlight, parchment #e8d8b4 text), plus a slide-in animation
// and a fade-out. A LEFT ACCENT BAR + eyebrow colour is themed PER CAUSE (set inline, below) so a
// glance tells war from disaster from prosperity.
const TOAST_CSS =
  ".emig-toast{position:fixed;left:50%;transform:translateX(-50%);z-index:99;" +
  "min-width:15rem;max-width:38rem;padding:0.5rem 1.3rem 0.6rem;text-align:center;pointer-events:none;" +
  'font-family:"BodyFont","BodyFont-JP","BodyFont-KR","BodyFont-SC","BodyFont-TC";color:#e8d8b4;' +
  "background:linear-gradient(180deg,rgba(28,32,44,0.97) 0%,rgba(9,12,19,0.97) 100%);" +
  "border:0.0833rem solid #8c7e62;border-left-width:0.28rem;border-radius:0.18rem;" +
  "box-shadow:0 0 0 0.0555rem rgba(0,0,0,0.65),inset 0 0 0 0.0555rem rgba(240,188,120,0.22)," +
  "0 0.33rem 1rem rgba(0,0,0,0.7);opacity:1;transition:opacity 0.5s ease,top 0.25s ease;" +
  "animation:emig-toast-in 0.26s ease-out;}" +
  '.emig-toast-eye{font-family:"TitleFont","TitleFont-JP","TitleFont-KR","TitleFont-SC","TitleFont-TC";' +
  "font-size:0.72rem;letter-spacing:0.13em;text-transform:uppercase;margin-bottom:0.15rem;color:#f0bc78;}" +
  ".emig-toast-msg{font-size:1rem;line-height:1.32;}" +
  "@keyframes emig-toast-in{from{opacity:0;transform:translateX(-50%) translateY(-0.55rem);}" +
  "to{opacity:1;transform:translateX(-50%) translateY(0);}}";

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

// Per-cause theming: a left-accent-bar + eyebrow colour, so the toast's TYPE reads at a glance.
// `crisis` is the world-news milestone pseudo-cause. The eyebrow text reuses the localized-by-code
// causeLabel taxonomy (War / Disaster / Attraction / …); the default is the gold mod accent.
/** @type {Record<string, string>} */
const CAUSE_ACCENT = {
  war: "#d24b3e", conquest: "#a83232", disaster: "#e08a3c",
  prosperity: "#5fae6b", unhappiness: "#c9a24b", attrition: "#9aa0a6", crisis: "#d24b3e"
};
const DEFAULT_ACCENT = "#cba35c";

const TOAST_MS = 11000; // how long a toast stays before its half-second fade-out
const TOAST_TOP = 5; // rem, the top of the topmost toast
const TOAST_STEP = 3.4; // rem between stacked toasts

/** @type {*[]} Toasts currently on screen (top → bottom), for vertical stacking. */
const _toasts = [];

/** Re-flow stacked toasts so they never overlap (newest below the rest). */
function reflowToasts() {
  for (let i = 0; i < _toasts.length; i++) {
    try {
      _toasts[i].style.top = TOAST_TOP + i * TOAST_STEP + "rem";
    } catch (_) {
      /* ignore */
    }
  }
}

/**
 * Remove a toast: fade it out, drop it from the stack, and re-flow the rest.
 * @param {*} el The toast element.
 */
function dismissToast(el) {
  const i = _toasts.indexOf(el);
  if (i >= 0) _toasts.splice(i, 1);
  try {
    el.style.opacity = "0";
  } catch (_) {
    /* ignore */
  }
  reflowToasts();
  setTimeout(() => {
    try {
      el.remove();
    } catch (_) {
      /* ignore */
    }
  }, 500);
}

/**
 * Build the toast element: a themed eyebrow (cause label, accent colour) over the message body.
 * @param {string} msg The message body.
 * @param {string|undefined} cause The migration cause (or "crisis").
 * @param {string} accent The theme accent colour.
 * @returns {*} The toast element.
 */
function buildToastEl(msg, cause, accent) {
  const el = document.createElement("div");
  el.className = "emig-toast";
  el.style.borderLeftColor = accent;
  const eye = document.createElement("div");
  eye.className = "emig-toast-eye";
  eye.textContent = cause ? causeLabel(cause) : "Emigration";
  eye.style.color = accent;
  const body = document.createElement("div");
  body.className = "emig-toast-msg";
  body.textContent = msg;
  el.appendChild(eye);
  el.appendChild(body);
  return el;
}

/**
 * Emit a transient toast on the HUD, styled to match the game (see TOAST_CSS) and themed by cause so
 * its type (war / disaster / prosperity / …) reads at a glance. Stacks rather than overlapping, and
 * stays up TOAST_MS before fading. No-op when notifications are off.
 * @param {string} msg The message body.
 * @param {string} [cause] The migration cause (or "crisis"), for the eyebrow + accent theme.
 */
export function toast(msg, cause) {
  if (CONFIG.notifyMode < 1 || !CONFIG.notifyToasts) return;
  try {
    const root = document.body || document.documentElement;
    if (!root) return;
    injectToastStyle();
    const accent = (cause && CAUSE_ACCENT[cause]) || DEFAULT_ACCENT;
    const el = buildToastEl(msg, cause, accent);
    root.appendChild(el);
    _toasts.push(el);
    reflowToasts();
    setTimeout(() => dismissToast(el), TOAST_MS);
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
 * @param {string} [cause] The migration cause (or "crisis"), for the toast's theme.
 */
export function announceImportant(msg, cause) {
  if (CONFIG.notifyMode < 1) return;
  if (!cooldownOk()) return;
  toast(msg, cause);
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
  const data = /** @type {*} */ (globalThis).EmigrationData;
  const cumPts = data && typeof data.refugeesPtsFor === "function" ? data.refugeesPtsFor(pid) : 0;
  const ev = { cause: "crisis", civ: civAdjective(pid), people: formatBoth(cum, cumPts) };
  announceImportant(refugeeHeadline(ev), "crisis");
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
 * Verbose per-pass per-cause toast (mode 2 only), each carrying its action hint, dual-system count
 * (population points + scaled people), and per-cause theme.
 * @param {{cause?:string, people?:number, points?:number}[]} migrations Applied migrations.
 */
function toastPerCause(migrations) {
  /** @type {Record<string, number>} */
  const peopleByCause = {};
  /** @type {Record<string, number>} */
  const ptsByCause = {};
  for (const m of migrations) {
    if (!m.cause || m.cause === "unhappiness") continue;
    peopleByCause[m.cause] = (peopleByCause[m.cause] || 0) + (m.people || 0);
    ptsByCause[m.cause] = (ptsByCause[m.cause] || 0) + (m.points || 0);
  }
  for (const cause of Object.keys(peopleByCause)) {
    const head = refugeeHeadline({ cause, people: formatBoth(peopleByCause[cause], ptsByCause[cause]) });
    const hint = actionHint(cause);
    toast(hint ? head + " " + hint : head, cause);
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
 * @param {{total:number, totalPts:number, lead:*, byCause:Record<string,number>}} acc Accumulator.
 * @param {{srcOwner?:number, people?:number, points?:number, cause?:string}} m A migration.
 * @param {number} me Local player id.
 */
function foldLocalLoss(acc, m, me) {
  const p = m.srcOwner === me ? m.people || 0 : 0;
  if (!(p > 0)) return; // past here the source IS the local player, so points are this loss's points
  acc.total += p;
  acc.totalPts += m.points || 0;
  const c = m.cause || "other";
  acc.byCause[c] = (acc.byCause[c] || 0) + p;
  if (!acc.lead || p > (acc.lead.people || 0)) acc.lead = m;
}

/**
 * Summarize the local player's losses this pass: total people, dominant cause, and the largest
 * single loss (for the source/destination), or null if the player lost nobody.
 * @param {{srcOwner?:number, people?:number, cause?:string}[]} migs Applied migrations.
 * @param {number} me Local player id.
 * @returns {{total:number, totalPts:number, cause:string, lead:*}|null} The summary, or null.
 */
function localLossSummary(migs, me) {
  /** @type {{total:number, totalPts:number, lead:*, byCause:Record<string,number>}} */
  const acc = { total: 0, totalPts: 0, lead: null, byCause: {} };
  for (const m of migs) foldLocalLoss(acc, m, me);
  return acc.lead
    ? { total: acc.total, totalPts: acc.totalPts, cause: dominantCause(acc.byCause), lead: acc.lead }
    : null;
}

/**
 * Fire the local player's explanatory digest (subject to the important-toast cooldown): why they
 * lost population this pass, what to do about it, whether it's temporary, and — for a cross-civ
 * loss — what the destination pays to absorb them. No-op when no local player or no local loss.
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
      people: formatBoth(s.total, s.totalPts),
      city: lead.srcName || "a settlement",
      crossCiv,
      destName: lead.destName,
      destGold
    }),
    s.cause
  );
}
