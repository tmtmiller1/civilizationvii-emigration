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
import { loc } from "/emigration/ui/emigration-loc.js";
import { registerCacheReset, resetCachesOnNewGame } from "/emigration/ui/emigration-cache-reset.js";
import { speedTurns, speedBar } from "/emigration/ui/emigration-game-speed.js";
import {
  refugeeHeadline,
  civAdjective,
  civName,
  actionHint,
  warRefugeeName,
  localDigestMessage,
  inboundDigestMessage,
  pressureCueMessage,
  disasterName
} from "/emigration/ui/emigration-naming.js";
import { warAggressors } from "/emigration/ui/emigration-war.js";
import { worstDisasterTypeForOwner } from "/emigration/ui/emigration-disasters.js";
import { formatBothExact } from "/emigration/ui/emigration-population.js";
import { causeLabel, notificationAccent, digestAccent } from "/emigration/ui/emigration-causes.js";
import { logNotification } from "/emigration/ui/emigration-notifications.js";
import { pullReasonsPhrase } from "/emigration/ui/emigration-move-reasons.js";
import { assimilationCostFor } from "/emigration/ui/emigration-effects.js";
import { civHidden } from "/emigration/ui/emigration-governance.js";

const NEWS_KEY = "EmigrationNews_v1";
const NEWS_SCHEMA_VERSION = 2;
const MAX_ANNOUNCED_KEYS = 1024;

/** @type {{ announced: Record<string, number>, lastToastTurn: number } | null} */
let _news = null;
registerCacheReset(() => { _news = null; });

/**
 * @returns {{ announced: Record<string, number>, lastToastTurn: number }} Empty news state.
 */
function emptyNewsState() {
  return { announced: {}, lastToastTurn: 0 };
}

/**
 * Resolve persisted payload from a legacy or schema envelope blob.
 * @param {*} parsed Parsed JSON value.
 * @returns {*} Payload object, or null.
 */
function payloadFromBlob(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const payload = typeof parsed.v === "number" && parsed.data && typeof parsed.data === "object"
    ? parsed.data
    : parsed;
  return payload && typeof payload === "object" ? payload : null;
}

/**
 * @param {*} turn Candidate turn.
 * @returns {number} Normalized turn.
 */
function normalizeTurn(turn) {
  return typeof turn === "number" && isFinite(turn) ? Math.max(0, Math.floor(turn)) : 0;
}

/**
 * Normalize announced milestone map.
 * @param {*} announced Candidate map.
 * @returns {Record<string, number>} Sanitized map.
 */
function normalizeAnnounced(announced) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!announced || typeof announced !== "object") return out;
  let n = 0;
  for (const [key, tier] of Object.entries(announced)) {
    if (n >= MAX_ANNOUNCED_KEYS) break;
    if (typeof key !== "string" || !key.length) continue;
    if (typeof tier !== "number" || !isFinite(tier)) continue;
    out[key] = Math.max(0, Math.floor(tier));
    n++;
  }
  return out;
}

/**
 * Normalize persisted news state (legacy or schema envelope).
 * @param {*} parsed Parsed JSON value.
 * @returns {{ announced: Record<string, number>, lastToastTurn: number }|null} Normalized state.
 */
function normalizeNewsState(parsed) {
  const payload = payloadFromBlob(parsed);
  if (!payload) return null;
  return {
    announced: normalizeAnnounced(payload.announced),
    lastToastTurn: normalizeTurn(payload.lastToastTurn)
  };
}

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
    return typeof raw === "string" && raw.length ? normalizeNewsState(JSON.parse(raw)) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Load (once) the world-news state (announced milestone tiers + the last toast turn).
 * @returns {{ announced: Record<string, number>, lastToastTurn: number }} State.
 */
function newsState() {
  resetCachesOnNewGame();
  if (!_news) _news = loadNews() || emptyNewsState();
  return _news;
}

/** Persist the world-news state. */
function persistNews() {
  try {
    const normalized = normalizeNewsState(_news) || emptyNewsState();
    Configuration?.editGame?.()?.setValue?.(
      NEWS_KEY,
      JSON.stringify({ v: NEWS_SCHEMA_VERSION, data: normalized })
    );
  } catch (_) {
    /* ignore */
  }
}

// The toast is styled to read as a NATIVE Civ VII HUD message, not a web element: the game's
// TitleFont eyebrow + BodyFont body, its dark panel gradient, and its own gold/bronze trim palette
// (#8c7e62 bronze frame, #f0bc78 gold highlight, parchment #e8d8b4 text), plus a slide-in animation
// and a fade-out. A LEFT ACCENT BAR + eyebrow colour is themed PER CAUSE (set inline, below) so a
// glance tells war from disaster from prosperity.
// z-index sits ABOVE the game's top HUD layers: root-game.html mounts #uinext-tooltips and
// #uinext-dropdowns at z-index 10000 and #tooltip-root at 99, so the old z-index:99 let tooltips and
// dropdowns paint OVER a top-center toast (a prime cause of "notifications never show"). 10001 clears
// them. The font sizes are hard values (not the dashboard's --dg-fs-* custom properties): the toast
// renders in the HUD document, where those dashboard-scoped vars are UNDEFINED, so a bare var() left the
// text at an inherited size. Fallbacks keep the intended 0.72/0.95rem there while still honouring the
// dashboard vars if ever present.
const TOAST_CSS =
  ".emig-toast{position:fixed;left:50%;transform:translateX(-50%);z-index:10001;" +
  "min-width:15rem;max-width:38rem;padding:0.5rem 1.3rem 0.6rem;text-align:center;pointer-events:none;" +
  'font-family:"BodyFont","BodyFont-JP","BodyFont-KR","BodyFont-SC","BodyFont-TC";color:#e8d8b4;' +
  "background:linear-gradient(180deg,rgba(28,32,44,0.97) 0%,rgba(9,12,19,0.97) 100%);" +
  "border:0.0833rem solid #8c7e62;border-left-width:0.28rem;border-radius:0.18rem;" +
  "box-shadow:0 0 0 0.0555rem rgba(0,0,0,0.65),inset 0 0 0 0.0555rem rgba(240,188,120,0.22)," +
  "0 0.33rem 1rem rgba(0,0,0,0.7);opacity:1;transition:opacity 0.5s ease,top 0.25s ease;" +
  "animation:emig-toast-in 0.26s ease-out;}" +
  '.emig-toast-eye{font-family:"TitleFont","TitleFont-JP","TitleFont-KR","TitleFont-SC","TitleFont-TC";' +
  "font-size:var(--dg-fs-72,0.72rem);letter-spacing:0.13em;text-transform:uppercase;margin-bottom:0.15rem;color:#f0bc78;}" +
  // white-space:pre-line honours the blank line localDigestMessage puts between the situation and the
  // guidance, so the toast shows them as two paragraphs; a message with no break renders unchanged.
  ".emig-toast-msg{font-size:var(--dg-fs-95,0.95rem);line-height:1.32;white-space:pre-line;}" +
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

// Per-cause theming (the accent bar + eyebrow colour) comes from the shared causeAccent() taxonomy,
// so the toast and the notifications log read identically; the eyebrow TEXT reuses causeLabel.
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
 * @param {boolean} [ownLoss] Whether this is the local player's own loss (reserves the red accent).
 * @param {string} [accentOverride] An explicit accent colour that wins over the cause colour — used by
 *   the per-move digests so the toast matches the log row's DIRECTION-based colour (see {@link digestAccent}).
 */
export function toast(msg, cause, ownLoss, accentOverride) {
  if (CONFIG.notifyMode < 1 || !CONFIG.notifyToasts) return;
  try {
    const root = document.body || document.documentElement;
    if (!root) return;
    injectToastStyle();
    const accent = accentOverride || notificationAccent(cause, ownLoss);
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
  // F1: rebase the cooldown clock down when Game.turn resets at an age boundary, so the
  // comparison below can't be corrupted (a stale future lastToastTurn either spamming or
  // over-suppressing).
  if (s.lastToastTurn > turn) s.lastToastTurn = turn;
  // speedTurns (×S): keep the REAL-TIME spacing of important toasts constant across speeds, else they
  // sat ~3× further apart on Marathon (event over before you're told) and spammed on Online.
  // Guard on lastToastTurn > 0, not just "is a number": the empty state seeds it to 0, so the plain
  // number check silently suppressed EVERY important toast for the first notifyCooldownTurns of a fresh
  // game (turn - 0 < 6). 0 means "never toasted yet" → always allow the first one; the cooldown then
  // applies normally once a real turn is stamped.
  if (s.lastToastTurn > 0 && turn - s.lastToastTurn < speedTurns(CONFIG.notifyCooldownTurns)) {
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
 * @param {boolean} [ownLoss] Whether this is the local player's own loss (reserves the red accent).
 * @param {string} [accentOverride] Explicit accent colour (per-move digests pass the direction accent).
 */
export function announceImportant(msg, cause, ownLoss, accentOverride) {
  if (CONFIG.notifyMode < 1) return;
  if (!cooldownOk()) return;
  toast(msg, cause, ownLoss, accentOverride);
}

/** Causes that name a specific in-world event (war/disaster/conquest), vs economic migration. */
const REFUGEE_CAUSES = new Set(["war", "disaster", "conquest"]);

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
 * The most recent disaster event's in-game name (for naming disaster refugees), or null.
 * @returns {string|null} The disaster name.
 */
function recentDisasterName() {
  const data = /** @type {*} */ (globalThis).EmigrationData;
  const evs = data && typeof data.disasterEvents === "function" ? data.disasterEvents() : null;
  const last = Array.isArray(evs) && evs.length ? evs[evs.length - 1] : null;
  return last && typeof last.name === "string" && last.name ? last.name : null;
}

/**
 * The SPECIFIC in-world event behind a refugee cause, the named war (via the aggressor map +
 * warRefugeeName) for war/conquest, or the named disaster for disaster, so a notification reads
 * "the Roman–Carthaginian War" / "Thera" rather than a generic cause. Null for economic migration.
 * @param {string} [cause] The migration cause.
 * @param {number} [srcOwner] The fleeing civ id (for the war pairing).
 * @returns {string|null} The event name, or null.
 */
function eventNameFor(cause, srcOwner) {
  if ((cause === "war" || cause === "conquest") && typeof srcOwner === "number") {
    return warRefugeeName(srcOwner, warAggressors(srcOwner));
  }
  if (cause === "disaster") {
    // Name the disaster striking THIS civ (its worst active event), not the globally most-recent one
    //, a "Greek refugee crisis" must read "the Greek volcano", never a flood on another continent.
    const type = typeof srcOwner === "number" ? worstDisasterTypeForOwner(srcOwner) : null;
    return (type && disasterName(type)) || recentDisasterName();
  }
  return null;
}

/**
 * A civ's DOMINANT refugee cause so far (war / disaster / conquest), for naming the world milestone.
 * @param {number} pid Civ id.
 * @returns {string} The dominant refugee cause (defaults to "war").
 */
function dominantRefugeeCause(pid) {
  const data = /** @type {*} */ (globalThis).EmigrationData;
  const bc = data && typeof data.emigrationByCauseFor === "function" ? data.emigrationByCauseFor(pid) : null;
  let best = "war";
  let bestN = -1;
  for (const c of REFUGEE_CAUSES) {
    const n = (bc && bc[c]) || 0;
    if (n > bestN) {
      bestN = n;
      best = c;
    }
  }
  return best;
}

/**
 * Per-civ refugee outflow THIS pass (people + points), so the world milestone shows an event-scale
 * figure rather than the lifetime cumulative (which can exceed a civ's current size and reads wrong).
 * @param {{cause?:string, srcOwner?:number, people?:number, points?:number}[]} migrations The pass.
 * @returns {Map<number,{people:number, points:number}>} Per-source refugee totals this pass.
 */
function refugeePassTotals(migrations) {
  /** @type {Map<number,{people:number, points:number}>} */
  const map = new Map();
  for (const m of migrations) {
    if (!m.cause || !REFUGEE_CAUSES.has(m.cause) || typeof m.srcOwner !== "number") continue;
    const e = map.get(m.srcOwner) || { people: 0, points: 0 };
    e.people += m.people || 0;
    e.points += m.points || 0;
    map.set(m.srcOwner, e);
  }
  return map;
}

/**
 * Whether a fresh refugee-crisis tier was reached for `pid` (cumulative crossed a new
 * worldRefugeeThreshold multiple). Stamps and persists the new tier when so, so it fires once.
 * @param {number} pid Source civ id. @param {number} cum Cumulative refugees produced.
 * @returns {boolean} True when a new tier was crossed (and recorded).
 */
function newCrisisTier(pid, cum) {
  // speedBar (×S): the cumulative-refugee milestone is an absolute people count, so on slow speeds it
  // would be reached at a different fraction of the game; scaling the bar by S keeps it on-beat with
  // game-progress (more turns ⇒ proportionally more refugees needed for the same headline).
  const bar = speedBar(CONFIG.worldRefugeeThreshold);
  if (!(cum >= bar)) return false;
  const tier = Math.floor(cum / bar);
  const s = newsState();
  const key = "civ" + pid;
  if ((s.announced[key] || 0) >= tier) return false;
  s.announced[key] = tier;
  persistNews();
  return true;
}

/**
 * Fire a refugee-crisis alert when a civ's CUMULATIVE refugees cross a worldRefugeeThreshold
 * milestone - once per tier, so a long war produces a few headlines, not one per turn. The cumulative
 * total only GATES the announcement; the headline names the SPECIFIC war/disaster driving it (no
 * generic "crisis") and shows THIS pass's refugee outflow, so the figure stays event-scale.
 * @param {number} pid Source civ id.
 * @param {number} cum Cumulative refugees produced (the milestone gate).
 * @param {{people:number, points:number}} [pass] This pass's refugee outflow for the civ (displayed).
 */
function crisisMilestone(pid, cum, pass) {
  if (!newCrisisTier(pid, cum)) return;
  const cause = dominantRefugeeCause(pid);
  const event = eventNameFor(cause, pid);
  const people = pass ? pass.people : cum;
  const points = pass ? pass.points : 0;
  // WHO the crisis hit, spoiler-guarded: an unmet civ is never named in world news
  // (mirrors the dashboard's "Unmet" mask), it's reported as "an unmet civilization".
  const who = civHidden(pid) ? UNMET_CIV_LABEL() : civAdjective(pid);
  const ev = { cause, civ: who, people: formatBothExact(people, points),
    warName: event || undefined, eventName: event || undefined };
  const head = refugeeHeadline(ev); // leads with WHO (spoiler-guarded) for event-named causes
  const ownLoss = pid === localPlayerId(); // red only when it's the player's OWN civ in crisis
  logNotification({ kind: "crisis", cause, event: event || undefined, summary: head,
    people, points, fromCiv: who, ownLoss });
  announceImportant(head, cause, ownLoss);
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
  // Priority order for the SHARED toast cooldown (one important toast per pass): the player's own
  // losses first, then world crises (the player's own INBOUND gains are reported separately via
  // reportInboundFeedback, which the caller runs last so losses/crises claim the HUD first). Each
  // channel still LOGS every event; only the on-screen toast is throttled.
  localDigest(migrations); // the local player's own "why am I losing people?" explainer
  reportWorldCrises(migrations); // per-civ refugee-crisis milestones (world news)
}

/**
 * Report the local player's INBOUND immigration for the pass (people SETTLING in the player's cities).
 * Kept separate from {@link reportPassFeedback} because it must see the ARRIVAL records - the loss side
 * is announced at DEPARTURE and the caller filters arrivals out of reportPassFeedback's stream, but a
 * gain is only real when the migrant ARRIVES, so this runs on the full, unfiltered pass. Call it AFTER
 * reportPassFeedback so the more urgent loss/crisis toasts claim the shared cooldown first.
 * @param {*[]} migrations The pass's FULL migrations (arrivals included).
 */
export function reportInboundFeedback(migrations) {
  if (CONFIG.notifyMode < 1 || !Array.isArray(migrations) || !migrations.length) return;
  inboundDigest(migrations); // the local player's own "who is moving IN?" explainer (immigration)
}

/**
 * Fire per-civ refugee-crisis milestones for the pass (the "world news" channel). No-op when world news
 * is off or the shared data facade isn't available.
 * @param {{cause?:string, srcOwner?:number, people?:number, points?:number}[]} migrations Applied migrations.
 */
function reportWorldCrises(migrations) {
  if (!CONFIG.notifyWorldNews) return;
  const data = /** @type {*} */ (globalThis).EmigrationData;
  if (!data || typeof data.refugeesCumFor !== "function") return;
  const pass = refugeePassTotals(migrations);
  for (const pid of refugeeCivs(migrations)) {
    crisisMilestone(pid, data.refugeesCumFor(pid), pass.get(pid));
  }
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
    const head = refugeeHeadline({ cause, people: formatBothExact(peopleByCause[cause], ptsByCause[cause]) });
    const hint = actionHint(cause);
    logNotification({ kind: "cause", cause, summary: head,
      people: peopleByCause[cause], points: ptsByCause[cause] });
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
 * The destination owner as the notification layer sees it: the tally-driving `destOwner` when present
 * (an instantaneous move or an arrival), else the non-tally `edgeDestOwner` a lagged DEPARTURE record
 * carries (it withholds `destOwner` so the immigration tally isn't double-credited on arrival). Reading
 * `edgeDestOwner` here is safe: this digest is separate from the migration/immigration tallies, so it
 * can't double-count - it only needs the destination civ to name it and apply unmet-masking.
 * @param {*} m A migration record.
 * @returns {number|undefined} The destination player id, or undefined when neither owner is present.
 */
function moveDestOwner(m) {
  if (typeof m.destOwner === "number") return m.destOwner;
  if (typeof m.edgeDestOwner === "number") return m.edgeDestOwner;
  return undefined;
}

/**
 * Get (or create) the per-event bucket for a loss record, keyed by source settlement + cause + scope.
 * Scope (internal vs cross-civ) is part of the key so a source shedding the SAME cause to both its own
 * settlements AND a foreign civ splits into two correctly-labelled rows, never one row mislabelled by
 * whichever stream happened to be larger.
 * @param {Map<string,*>} map Bucket map.
 * @param {*} m A migration.
 * @param {number} me Local player id.
 * @returns {*} The bucket.
 */
function eventBucket(map, m, me) {
  const cause = m.cause || "other";
  const cross = !!m.crossCiv; // the record's authoritative scope flag (src.owner !== dest.owner)
  const key = (m.srcName || "?") + "|" + cause + "|" + (cross ? "x" : "i");
  let ev = map.get(key);
  if (!ev) {
    ev = { cause, srcOwner: me, srcName: m.srcName, destName: m.destName, destOwner: moveDestOwner(m),
      crossCiv: cross, people: 0, points: 0, reasons: [], _lead: 0 };
    map.set(key, ev);
  }
  return ev;
}

/**
 * Fold one of the local player's loss records into its per-event bucket (source settlement + cause):
 * sum people/points and track the destination that took the most people. Counts only when the source
 * is the local player and people moved.
 * @param {Map<string,*>} map Bucket map.
 * @param {*} m A migration.
 * @param {number} me Local player id.
 */
function foldEvent(map, m, me) {
  const ppl = m.people || 0;
  if (m.srcOwner !== me || ppl <= 0) return;
  const ev = eventBucket(map, m, me);
  ev.people += ppl;
  ev.points += m.points || 0;
  if (ppl > ev._lead) { // the destination that took the most people defines "where they went"
    ev._lead = ppl;
    ev.destName = m.destName;
    ev.destOwner = moveDestOwner(m); // recover the dest civ from edgeDestOwner on a lagged departure
    // ev.crossCiv is fixed per bucket (part of the key) - trust the record's flag, never gate it on
    // destOwner being present, or a lagged cross-civ departure (which withholds destOwner) mislabels
    // as internal.
    ev.reasons = Array.isArray(m.reasons) ? m.reasons : []; // the lead move's "why here" tags (P0.1)
  }
}

/**
 * Group the local player's losses this pass into distinct EVENTS (one per source settlement + cause),
 * largest first, so each is a single coherent event with an accurate count, never a pass-wide sum.
 * @param {*[]} migs Applied migrations.
 * @param {number} me Local player id.
 * @returns {*[]} Per-event buckets (people-desc).
 */
function groupLocalEvents(migs, me) {
  /** @type {Map<string,*>} */
  const map = new Map();
  for (const m of migs) foldEvent(map, m, me);
  return [...map.values()].sort((a, b) => b.people - a.people);
}

// Anonymized destination for a civ the analytics-visibility policy withholds (unmet). Mirrors the
// dashboard's "Unmet" masking so a notification never names a civ the player hasn't met. Localized
// lazily and cached at first RUNTIME use (never at module load, where Locale may not be ready).
/** @type {string|null} */
let _unmetCivLabel = null;
function UNMET_CIV_LABEL() {
  if (_unmetCivLabel == null) _unmetCivLabel = loc("LOC_EMIG_FALLBACK_UNMET_CIV", "an unmet civilization");
  return _unmetCivLabel;
}

/**
 * The destination as shown to the player, with the analytics-visibility mask applied. A death
 * (attrition) has no destination. A cross-civ move to a policy-hidden (unmet) civ is anonymized to
 * "an unmet civilization" with its city name dropped, so the notification never leaks an unmet civ.
 * Internal moves and moves to met civs pass through unchanged.
 * @param {*} ev A per-event bucket.
 * @returns {{toCiv?:string, toCity?:string}} The masked destination labels.
 */
function destView(ev) {
  if (ev.cause === "attrition") return {}; // a death, they did not arrive anywhere
  if (ev.crossCiv && typeof ev.destOwner === "number") {
    if (civHidden(ev.destOwner)) return { toCiv: UNMET_CIV_LABEL() };
    return { toCiv: civAdjective(ev.destOwner), toCity: ev.destName || undefined };
  }
  return { toCity: ev.destName || undefined }; // internal move
}

/**
 * Compose one event's explanatory message (cause-named headline + hint + permanence + cross-civ cost).
 * @param {*} ev A per-event bucket.
 * @returns {string} The message.
 */
function eventMessage(ev) {
  const dv = destView(ev);
  const destGold = ev.crossCiv && typeof ev.destOwner === "number"
    ? assimilationCostFor(ev.destOwner).gold : 0;
  return localDigestMessage({
    cause: ev.cause, people: formatBothExact(ev.people, ev.points), city: ev.srcName || "a settlement",
    crossCiv: ev.crossCiv, destName: dv.toCity || dv.toCiv, destGold, why: pullReasonsPhrase(ev.reasons),
    byCiv: conquerorName(ev) // the (unmet-masked) conquering civ NAME; only the conquest headline reads it
  });
}

/**
 * The conquering civ's NAME (a proper noun, e.g. "Rome"), unmet-masked, for the conquest headline;
 * undefined for any other cause. Uses the civ NAME rather than its adjective so "conquered by <civ>"
 * reads correctly ("…by Rome", not "…by Roman"). destOwner is the new owner of the captured city.
 * @param {*} ev A per-event bucket.
 * @returns {string|undefined} The conqueror's name, or undefined.
 */
function conquerorName(ev) {
  if (ev.cause !== "conquest" || typeof ev.destOwner !== "number") return undefined;
  return civHidden(ev.destOwner) ? UNMET_CIV_LABEL() : civName(ev.destOwner);
}

/**
 * Record one event to the notification log: its cause, specific named war/disaster, dual-system count,
 * and origin → destination.
 * @param {*} ev A per-event bucket.
 * @param {string} msg The composed event message (the row summary).
 */
function logEvent(ev, msg) {
  const fromCiv = ev.srcOwner != null ? civAdjective(ev.srcOwner) : undefined;
  const dv = destView(ev);
  logNotification({
    kind: "digest", cause: ev.cause, event: eventNameFor(ev.cause, ev.srcOwner) || undefined,
    summary: msg, people: ev.people, points: ev.points,
    fromCity: ev.srcName, fromCiv, toCity: dv.toCity, toCiv: dv.toCiv, crossCiv: ev.crossCiv,
    reasons: pullReasonsPhrase(ev.reasons) || undefined, // "why here" pull tags for the log detail (P0.1)
    ownLoss: true // the local player's own settlement shedding population
  });
}

/**
 * Explain the local player's population losses this pass. Each distinct event (one source settlement +
 * cause) is logged as its OWN notification with an accurate count, so the Notifications log reads one
 * coherent event per row, never a confusing pass-wide "7 moved" lumped across cities and causes. On
 * screen, only the largest event toasts (subject to the cooldown), so the HUD isn't flooded when
 * several settlements shed people in one pass; the rest are in the log. No-op without a local loss.
 * @param {*[]} migs Applied migrations.
 */
function localDigest(migs) {
  const me = localPlayerId();
  if (me == null) return;
  const events = groupLocalEvents(migs, me);
  if (!events.length) return;
  for (const ev of events) logEvent(ev, eventMessage(ev));
  const lead = events[0];
  // Colour the toast by DIRECTION (red for own people leaving for a rival, green for an internal
  // shuffle), matching the log row's accent — not by cause, which mismatched (a prosperity departure
  // toasted green while the log row was correctly red).
  announceImportant(eventMessage(lead), lead.cause, true, digestAccent(true, lead.crossCiv));
}

/**
 * Fold one INBOUND (immigration) record into its per-destination bucket, keyed by destination
 * settlement + cause + origin civ. Counts only CROSS-CIV arrivals credited to the local player (people
 * settling in the player's empire from another civ); internal relocations and the player's own
 * departures are excluded. Arrival records carry `destOwner` (the player) + `originCiv` (the true source
 * civ) but NOT the tally-driving `srcOwner`, so origin is read from `originCiv`.
 * @param {Map<string,*>} map Bucket map. @param {*} m A migration. @param {number} me Local player id.
 */
function foldInbound(map, m, me) {
  const ppl = m.people || 0;
  if (m.destOwner !== me || !m.crossCiv || ppl <= 0) return;
  const ev = inboundBucket(map, m);
  ev.people += ppl;
  ev.points += m.points || 0;
}

/**
 * Get (or create) the per-event inbound bucket, keyed by destination settlement + cause + origin civ.
 * @param {Map<string,*>} map Bucket map. @param {*} m An inbound migration. @returns {*} The bucket.
 */
function inboundBucket(map, m) {
  const cause = m.cause || "other";
  const origin = typeof m.originCiv === "number" ? m.originCiv : undefined;
  const key = (m.destName || "?") + "|" + cause + "|" + (origin != null ? origin : "?");
  let ev = map.get(key);
  if (!ev) {
    ev = { cause, destName: m.destName, originCiv: origin, people: 0, points: 0 };
    map.set(key, ev);
  }
  return ev;
}

/**
 * Group the local player's INBOUND immigration this pass into distinct events (one per destination
 * settlement + cause + origin), largest first.
 * @param {*[]} migs Applied migrations. @param {number} me Local player id.
 * @returns {*[]} Per-event buckets (people-desc).
 */
function groupInboundEvents(migs, me) {
  /** @type {Map<string,*>} */
  const map = new Map();
  for (const m of migs) foldInbound(map, m, me);
  return [...map.values()].sort((a, b) => b.people - a.people);
}

/**
 * The origin as shown to the player, with the analytics-visibility mask applied: a cross-civ arrival
 * from a policy-hidden (unmet) civ is anonymized to "an unmet civilization" so a notification never
 * leaks an unmet civ (mirrors {@link destView}). Unknown origin → no clause.
 * @param {*} ev An inbound event bucket.
 * @returns {{fromCiv?:string}} The masked origin label.
 */
function inboundOriginView(ev) {
  if (typeof ev.originCiv !== "number") return {};
  if (civHidden(ev.originCiv)) return { fromCiv: UNMET_CIV_LABEL() };
  return { fromCiv: civAdjective(ev.originCiv) };
}

/**
 * Compose one inbound event's message ("N settled in <city>, drawn from <origin>").
 * @param {*} ev An inbound event bucket. @returns {string} The message.
 */
function inboundMessage(ev) {
  const ov = inboundOriginView(ev);
  return inboundDigestMessage({
    cause: ev.cause, people: formatBothExact(ev.people, ev.points),
    city: ev.destName || "a settlement", fromCiv: ov.fromCiv
  });
}

/**
 * Record one inbound event to the notification log: its cause, dual-system count, and origin →
 * destination. `ownLoss:false` (a GAIN to the player's empire → neutral, not red).
 * @param {*} ev An inbound event bucket. @param {string} msg The composed message (the row summary).
 */
function logInbound(ev, msg) {
  const ov = inboundOriginView(ev);
  logNotification({
    kind: "digest", cause: ev.cause, summary: msg, people: ev.people, points: ev.points,
    fromCiv: ov.fromCiv, toCity: ev.destName, crossCiv: true, ownLoss: false
  });
}

/**
 * Explain the local player's INBOUND immigration this pass: cross-civ newcomers settling in the
 * player's cities. Each event over the `inboundNotifyPoints` floor is logged, and the largest is toasted
 * (subject to the shared cooldown), so a prosperous, peaceful empire that is RECEIVING migrants also
 * gets "important" news, not only one that is losing people. A steady 1-point trickle (below the floor)
 * stays quiet. No-op without a qualifying inbound wave.
 * @param {*[]} migs Applied migrations.
 */
function inboundDigest(migs) {
  const me = localPlayerId();
  if (me == null) return;
  const floor = CONFIG.inboundNotifyPoints > 0 ? CONFIG.inboundNotifyPoints : 1;
  const events = groupInboundEvents(migs, me).filter((ev) => ev.points >= floor);
  if (!events.length) return;
  for (const ev of events) logInbound(ev, inboundMessage(ev));
  const lead = events[0];
  // A gain → green (direction accent), matching the log row.
  announceImportant(inboundMessage(lead), lead.cause, false, digestAccent(false, true));
}

// P0.3 per-source cue cooldown (session-only; a reload resetting a low-key cue is harmless).
/** @type {Map<string, number>} */
const _cueTurn = new Map();
registerCacheReset(() => _cueTurn.clear());

/**
 * Surface low-key "rising emigration pressure" cues for the local player's settlements building toward
 * a voluntary move without anyone having left yet (P0.3). Logged to the Notifications list only (no HUD
 * toast, so it never floods the screen), throttled per source to one per `voluntaryCueCooldownTurns`.
 * No-op without a local player.
 * @param {{srcName:string, srcOwner:number, destName:string, cause:string}[]} cues This pass's cues.
 */
export function reportPressureCues(cues) {
  if (!Array.isArray(cues) || !cues.length) return;
  const me = localPlayerId();
  if (me == null) return;
  const turn = gameTurn();
  const cd = CONFIG.voluntaryCueCooldownTurns > 0 ? speedTurns(CONFIG.voluntaryCueCooldownTurns) : 0;
  for (const c of cues) emitPressureCue(c, me, turn, cd);
}

/**
 * Log one pressure cue if it's the local player's and past its per-source cooldown.
 * @param {*} c A cue ({srcName, srcOwner, destName, cause}).
 * @param {number} me Local player id.
 * @param {number} turn Current game turn.
 * @param {number} cd Cooldown turns.
 */
function emitPressureCue(c, me, turn, cd) {
  if (c.srcOwner !== me || !c.srcName || !c.destName) return;
  const last = _cueTurn.get(c.srcName);
  // F1: a `last` above the current turn is stale from a prior age (Game.turn reset); ignore
  // it (the `turn >= last` guard) so the cue isn't suppressed for the rest of the new age.
  if (typeof last === "number" && turn >= last && turn - last < cd) return;
  _cueTurn.set(c.srcName, turn);
  logNotification({
    kind: "cue",
    cause: c.cause || "prosperity",
    summary: pressureCueMessage(c.srcName, c.destName),
    fromCity: c.srcName,
    toCity: c.destName
  });
}
