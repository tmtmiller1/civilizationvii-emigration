// emigration-train.js
//
// The game's own notification train (the stack of icons beside End Turn) as the on-screen surface for the
// mod's notices. A notification raised from script needs a type defined in the gameplay database
// (data/emigration-notifications.xml, one per channel, each with an icon in data/emigration-notification-icons.xml);
// Game.Notifications.send({Type, Message, Summary}, player) then lists it in the train with the game's icon and
// tooltip, ends it with the turn and lets a right-click dismiss it. The engine's rules, each watched in the
// strategic resources mod's phase 14 runs (its docs/verification-runs.md) before this was written:
//   - one live notification per type and player; a second send while one is live is dropped with no error. So
//     every line of one channel in one tick goes into one notification, and a later line in the same turn
//     replaces the live one with all the lines so far. A channel per kind of news keeps a turn's loss, arrival,
//     world-news and disaster notices side by side.
//   - last turn's notification is still listed at TurnBegin and goes when the local player's turn is activated;
//     a send before that is dropped. The pass sends from PlayerTurnActivated, after the engine has cleared it.
//   - the Location field is ignored in every shape, so a click does not move the camera. The mod registers a
//     handler on the train's model instead, and a click opens the Emigration screen.
// The text is composed by the caller in the active language and passed with the send; the database rows' Message
// and Summary tags are the fallback. Off-engine (no Game.Notifications) trainAvailable() is false and
// emigration-feedback.js keeps its own HUD toasts.

import { dlog } from "/emigration/ui/emigration-log.js";
import { loc } from "/emigration/ui/emigration-loc.js";
import { registerCacheReset } from "/emigration/ui/emigration-cache-reset.js";

/** @typedef {"loss"|"arrival"|"world"|"disaster"|"note"} Channel */

/**
 * The channels, each its own notification type: the player's own people leaving, newcomers settling in the
 * player's cities, a refugee crisis elsewhere, a disaster displacing people, and the rest (chronicle lines,
 * the verbose per-cause summary, the city readout's holding notices, the self-test).
 * @type {Readonly<Record<Channel, {type: string, title: string, fallback: string}>>}
 */
export const CHANNELS = Object.freeze({
  loss: { type: "NOTIFICATION_EMIGRATION_LOSS", title: "LOC_EMIG_TRAIN_LOSS", fallback: "People are leaving" },
  arrival: { type: "NOTIFICATION_EMIGRATION_ARRIVAL", title: "LOC_EMIG_TRAIN_ARRIVAL", fallback: "Newcomers have arrived" },
  world: { type: "NOTIFICATION_EMIGRATION_WORLD", title: "LOC_EMIG_TRAIN_WORLD", fallback: "Refugee crisis abroad" },
  disaster: { type: "NOTIFICATION_EMIGRATION_DISASTER", title: "LOC_EMIG_TRAIN_DISASTER", fallback: "Disaster displaces people" },
  note: { type: "NOTIFICATION_EMIGRATION_NOTE", title: "LOC_EMIG_TRAIN_NOTE", fallback: "Migration news" }
});

/** The game's line break inside a text the tooltip renders. */
const LINE_BREAK = "[N]";

/**
 * The channel for a notice that names no channel of its own: the cause decides for a crisis and a disaster,
 * the player's own loss goes to the loss channel, and everything else is a note.
 * @param {string} [cause] The migration cause (or "crisis" / "chronicle").
 * @param {boolean} [ownLoss] Whether this is the local player's own population loss.
 * @returns {Channel} The channel.
 */
export function channelFor(cause, ownLoss) {
  if (cause === "crisis") return "world";
  if (cause === "disaster") return "disaster";
  if (ownLoss === true) return "loss";
  return "note";
}

/**
 * Whether the engine's notification API is here (it is in the game; it is not in the Node tests).
 * @returns {boolean} True when Game.Notifications.send exists.
 */
export function trainAvailable() {
  try {
    return typeof Game !== "undefined" && !!Game.Notifications && typeof Game.Notifications.send === "function";
  } catch (_) {
    return false;
  }
}

/** @returns {number} Game.turn, or 0 off-engine. */
function gameTurn() {
  try {
    return typeof Game !== "undefined" && typeof Game.turn === "number" ? Game.turn : 0;
  } catch (_) {
    return 0;
  }
}

/** @returns {number|null} The local player id, or null when there is none. */
function localPlayerId() {
  try {
    return typeof GameContext !== "undefined" && typeof GameContext.localPlayerID === "number"
      ? GameContext.localPlayerID
      : null;
  } catch (_) {
    return null;
  }
}

/** @type {Map<Channel, string[]>} The lines queued in this tick, flushed together. */
const pending = new Map();
/** @type {*} The flush timer, or null when nothing is queued. */
let flushTimer = null;
/** @type {Map<Channel, {turn: number, lines: string[]}>} What each channel has shown this turn. */
const shown = new Map();
registerCacheReset(() => {
  pending.clear();
  shown.clear();
});

/**
 * Queue one line for a channel. The lines of one tick go into one notification when the tick ends, so a pass
 * that reports several events of one kind raises one notification carrying them all.
 * @param {Channel} channel The channel.
 * @param {string} text The line, already composed in the active language.
 * @returns {boolean} True when the line was queued.
 */
export function trainNotify(channel, text) {
  const line = typeof text === "string" ? text.trim() : "";
  if (!line || !CHANNELS[channel]) return false;
  const queue = pending.get(channel) || [];
  queue.push(line);
  pending.set(channel, queue);
  if (flushTimer == null) flushTimer = setTimeout(flushTrain, 0);
  return true;
}

/** Send every queued channel now. Called by the tick timer; a test may call it directly. */
export function flushTrain() {
  flushTimer = null;
  const batch = [...pending];
  pending.clear();
  for (const [channel, lines] of batch) {
    try {
      sendChannel(channel, lines);
    } catch (e) {
      dlog("train: send for " + channel + " threw " + e);
    }
  }
}

/**
 * The tooltip text for a channel's lines: each line's own paragraph breaks kept, one break between lines.
 * @param {string[]} lines The lines.
 * @returns {string} The summary.
 */
export function summaryOf(lines) {
  return lines.map((l) => l.replace(/\n+/g, LINE_BREAK)).join(LINE_BREAK);
}

/**
 * Dismiss the local player's live notifications of a type, so a new one of that type can be sent this turn.
 * @param {number} player The local player id. @param {string} type The notification type name.
 * @returns {number} How many were dismissed.
 */
function dismissLive(player, type) {
  let n = 0;
  try {
    const ids = Game.Notifications.getIdsOfTypeForPlayer(player, Game.getHash(type)) || [];
    for (const id of ids) {
      Game.Notifications.dismiss(id);
      n += 1;
    }
  } catch (e) {
    dlog("train: dismiss of " + type + " threw " + e);
  }
  return n;
}

/**
 * Send a channel's lines as one notification. A channel that already has a notification this turn folds the
 * earlier lines in and replaces it, since the engine would drop a second live one of the type.
 * @param {Channel} channel The channel. @param {string[]} lines This tick's lines.
 */
function sendChannel(channel, lines) {
  if (!trainAvailable()) return;
  const player = localPlayerId();
  if (player == null) return;
  const spec = CHANNELS[channel];
  const turn = gameTurn();
  const before = shown.get(channel);
  const all = before && before.turn === turn ? before.lines.concat(lines) : lines;
  if (before && before.turn === turn) dismissLive(player, spec.type);
  shown.set(channel, { turn, lines: all });
  Game.Notifications.send(
    { Type: Game.getHash(spec.type), Message: loc(spec.title, spec.fallback), Summary: summaryOf(all) },
    player
  );
  dlog("train: " + channel + " sent, turn " + turn + ", " + all.length + " line(s)");
}

/**
 * Register a handler for the mod's notification types on the train's model, so a click on one opens the
 * Emigration screen (the default handler only moves the camera, and the engine ignores a location given from
 * script). The model is imported when the game serves it; without it, or when another mod's replacement lacks
 * the registration call, the default handler stays and a click does nothing.
 * @param {() => void} open Opens the Emigration screen.
 * @returns {Promise<boolean>} True once the handler is registered.
 */
export function installTrainHandler(open) {
  if (!trainAvailable()) return Promise.resolve(false);
  return import("/base-standard/ui/notification-train/model-notification-train.js")
    .then((/** @type {*} */ mod) => {
      const manager = mod && mod.NotificationModel && mod.NotificationModel.manager;
      if (!manager || typeof manager.registerHandler !== "function" || typeof manager.add !== "function") {
        dlog("train: the notification model has no handler registration; clicks keep the default handler");
        return false;
      }
      const handler = {
        lookAt() {},
        activate() {
          try {
            open();
          } catch (e) {
            dlog("train: opening the screen threw " + e);
          }
          return true;
        },
        add(/** @type {*} */ id) {
          const n = Game.Notifications.find(id);
          return !!n && manager.add(n.Type, n.GroupType, id) != null;
        },
        dismiss(/** @type {*} */ id) {
          if (typeof manager.onDismiss === "function") manager.onDismiss(id);
        }
      };
      for (const spec of Object.values(CHANNELS)) manager.registerHandler(spec.type, handler);
      dlog("train: handler registered for " + Object.keys(CHANNELS).length + " notification types");
      return true;
    })
    .catch((e) => {
      dlog("train: the notification model did not load (" + e + "); clicks keep the default handler");
      return false;
    });
}
