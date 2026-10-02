import assert from "node:assert/strict";

// Stored lines are composed in the language active when they are READ. The notification log and the
// Chronicle keep each line's LOC key and arguments beside its English text; the Notifications view
// composes them again through Locale, so a log written in an English session reads in German once the
// player switches. Entries saved before keys were stored carry only text and must render exactly as
// they did.

let KV = {};
let SEED = 1; // the game id; changing it makes every persisted-state cache reload (a new game / a load)
globalThis.Configuration = {
  getGame: () => ({ gameSeed: SEED, getValue: (k) => (k in KV ? KV[k] : null) }),
  editGame: () => ({ setValue: (k, v) => (KV[k] = v) })
};
globalThis.Game = { turn: 7 };

// A two-language Locale: templates by key per language, {n_X} substitution like the engine. A key with
// no row echoes itself, as Locale.compose does.
const TEXT = {
  en: {
    LOC_EMIG_PRESSURE_CUE: "Rising emigration pressure: citizens in {1_City} are increasingly drawn to {2_Dest}.",
    LOC_EMIG_DIGEST_UNHAPPINESS_TO: "{1_People} left {2_City} for {3_Dest}, unhappy at home.",
    LOC_EMIG_COUNT_POINT: "{1_Count} population point",
    LOC_EMIG_COUNT_PEOPLE: "{1_Count} people",
    LOC_EMIG_COUNT_BOTH: "{1_Civ} ({2_People})",
    LOC_EMIG_NARR_TITLE_EXODUS_3: "The Emptying of {2_City}",
    LOC_CIVILIZATION_ROME_ADJECTIVE: "Roman"
  },
  de: {
    LOC_EMIG_PRESSURE_CUE: "Steigender Auswanderungsdruck: Die Bürger von {1_City} zieht es zunehmend nach {2_Dest}.",
    LOC_EMIG_DIGEST_UNHAPPINESS_TO: "{1_People} verließen {2_City} Richtung {3_Dest}, unzufrieden zu Hause.",
    LOC_EMIG_COUNT_POINT: "{1_Count} Bevölkerungspunkt",
    LOC_EMIG_COUNT_PEOPLE: "{1_Count} Menschen",
    LOC_EMIG_COUNT_BOTH: "{1_Civ} ({2_People})",
    LOC_EMIG_NARR_TITLE_EXODUS_3: "Die Entleerung von {2_City}",
    LOC_CIVILIZATION_ROME_ADJECTIVE: "Römisch"
  }
};
let lang = "en";
const fill = (t, args) => t.replace(/\{(\d+)_[A-Za-z]+\}/g, (m, n) => (args[n - 1] == null ? m : String(args[n - 1])));
globalThis.Locale = {
  compose: (k, ...args) => (TEXT[lang][k] ? fill(TEXT[lang][k], args) : k),
  toNumber: (n) => (lang === "de" ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".") : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","))
};

const loc = await import("/emigration/ui/emigration-loc.js");
const { logNotification, notificationLog, entryText, clearNotifications } = await import(
  "/emigration/ui/emigration-notifications.js"
);
const { chronicle, chronicleLog, clearChronicle } = await import("/emigration/ui/emigration-chronicle.js");
const { pressureCueMsg } = await import("/emigration/ui/emigration-naming.js");
const { formatBothExactMsg } = await import("/emigration/ui/emigration-population.js");

// ── the node helpers ─────────────────────────────────────────────────────────
{
  const { msg, msgText, msgPack, msgCompose, msgJoin, msgCap, msgBare, msgNum, msgKey } = loc;
  const node = msgJoin(msgCap(msg("LOC_NONE", "the {1_X} line", "first")), " · ", msgBare("the Roman War"), " ",
    msgNum(1234567), " ", msgKey("LOC_CIVILIZATION_ROME_ADJECTIVE", "Roman"), " ", msgKey("plain", "plain"));
  lang = "en";
  assert.equal(msgText(node), "The first line · Roman War 1,234,567 Roman plain", "live text uses each fallback");
  const packed = msgPack(node);
  assert.deepEqual(packed, ["+", ["^", ["LOC_NONE", "first"]], " · ", ["~", "the Roman War"], " ", ["#", 1234567], " ",
    ["LOC_CIVILIZATION_ROME_ADJECTIVE"], " ", "plain"], "packing drops the fallbacks");
  assert.equal(JSON.stringify(packed).includes("{1_X}"), false, "no English template is stored");
  assert.equal(msgCompose(packed), null, "a key with no row anywhere cannot compose: the caller keeps its text");
  assert.deepEqual(msgPack(msgJoin("a", msgJoin("b", msgJoin("c")), "")), ["+", "a", "b", "c"], "joins flatten");
  assert.equal(msgPack(msgJoin(msgJoin("solo"))), "solo", "a one-part join packs as its part");
  const ok = ["+", ["LOC_CIVILIZATION_ROME_ADJECTIVE"], " ", ["#", 1234567]];
  lang = "de";
  assert.equal(msgCompose(ok), "Römisch 1.234.567", "composes in the current language");
  assert.equal(loc.msgClean(ok), ok, "a well-formed message survives load");
  assert.equal(loc.msgClean([1, 2]), undefined, "a malformed head is dropped");
  assert.equal(loc.msgClean({ k: "LOC_X" }), undefined, "an in-memory node is not a packed message");
  let deep = ["LOC_A", "x"];
  for (let i = 0; i < 12; i++) deep = ["LOC_A", deep];
  assert.equal(loc.msgClean(deep), undefined, "an over-deep message is dropped");
  assert.equal(loc.msgClean(["LOC_A", "y".repeat(5000)]), undefined, "an oversized string is dropped");
  const saved = globalThis.Locale;
  globalThis.Locale = undefined;
  assert.equal(msgCompose(ok), null, "no Locale: nothing composes, the stored text shows");
  globalThis.Locale = saved;
}

// ── a new notification records its key + args and composes in the reader's language ─────────────
{
  KV = {};
  clearNotifications();
  lang = "en";
  logNotification({ kind: "cue", cause: "prosperity", summary: pressureCueMsg("Leeds", "Duisburg"),
    fromCity: "Leeds", toCity: "Duisburg" });
  const e = notificationLog()[0];
  assert.equal(e.summary,
    "Rising emigration pressure: citizens in Leeds are increasingly drawn to Duisburg.", "English text is stored");
  assert.deepEqual(e.s, ["@PRESSURE_CUE", "Leeds", "Duisburg"], "key + args are stored beside it (LOC_EMIG_ as @)");
  const blob = JSON.parse(KV.EmigrationNotif_v1)[0];
  assert.deepEqual(blob.s, e.s, "the packed message is persisted");
  lang = "de";
  assert.equal(entryText(e, "summary"),
    "Steigender Auswanderungsdruck: Die Bürger von Leeds zieht es zunehmend nach Duisburg.", "read in German");
  lang = "en";
  assert.equal(entryText(e, "summary"), e.summary, "read in English");
}

// ── nested localizable arguments (counts, civ adjectives) resolve at display time too ──────────────
{
  clearNotifications();
  lang = "en";
  const people = formatBothExactMsg(147006, 1);
  const summary = loc.msg("LOC_EMIG_DIGEST_UNHAPPINESS_TO", "{1_People} left {2_City} for {3_Dest}, unhappy at home.",
    people, "Leeds", "Duisburg");
  logNotification({ kind: "digest", cause: "unhappiness", summary, people: 147006, points: 1,
    fromCiv: loc.msgKey("LOC_CIVILIZATION_ROME_ADJECTIVE", "Roman") });
  const e = notificationLog()[0];
  assert.equal(e.summary, "1 population point (147,006 people) left Leeds for Duisburg, unhappy at home.");
  assert.equal(e.fromCiv, "Roman");
  lang = "de";
  assert.equal(entryText(e, "summary"),
    "1 Bevölkerungspunkt (147.006 Menschen) verließen Leeds Richtung Duisburg, unzufrieden zu Hause.");
  assert.equal(entryText(e, "fromCiv"), "Römisch", "the civ adjective follows the language");
  lang = "en";
}

// ── an entry saved before keys were stored renders its text unchanged ─────────────────────────────
{
  const old = { turn: 3, cause: "war", kind: "digest", summary: "Bulgarian: 4 population points (295,414 people) flee "
    + "the Norman-Bulgarian War.", event: "Norman-Bulgarian War", fromCiv: "Bulgarian", people: 295414, points: 4,
    crossCiv: false, ownLoss: false };
  KV = { EmigrationNotif_v1: JSON.stringify([old, { turn: 2, cause: "war", summary: "x", s: { not: "packed" } }]) };
  SEED++; // load the save: the log cache reloads from the blob above
  const list = notificationLog();
  assert.equal(list.length, 2);
  const e = list[0];
  lang = "de";
  assert.equal(entryText(e, "summary"), old.summary, "no key: the stored English text, exactly");
  assert.equal(entryText(e, "event"), old.event);
  assert.equal(entryText(e, "fromCiv"), old.fromCiv);
  assert.equal("s" in e, false, "no message invented for an old entry");
  assert.equal("s" in list[1], false, "a malformed stored message is dropped on load");
  assert.equal(entryText(list[1], "summary"), "x");
  lang = "en";
  // The same path through the public API: an entry logged with plain strings stores no message.
  clearNotifications();
  logNotification({ kind: "digest", cause: "war", summary: old.summary, event: old.event });
  lang = "de";
  assert.equal(entryText(notificationLog()[0], "summary"), old.summary);
  lang = "en";
}

// ── the Chronicle keeps title/body messages and mirrors them into the log ─────────────────────────
{
  KV = {};
  clearChronicle();
  clearNotifications();
  lang = "en";
  const title = loc.msg("LOC_EMIG_NARR_TITLE_EXODUS_3", "The Emptying of {2_City}", "", "Leeds");
  assert.equal(chronicle({ kind: "exodus", title, body: "Leeds emptied.", dedupeKey: "k1" }), true);
  const c = chronicleLog()[0];
  assert.equal(c.title, "The Emptying of Leeds");
  assert.deepEqual(c.ts, ["@NARR_TITLE_EXODUS_3", "", "Leeds"]);
  assert.equal("bs" in c, false, "a plain-string body stores no message");
  const n = notificationLog()[0];
  assert.equal(n.kind, "chronicle");
  assert.deepEqual(n.ts, c.ts, "the mirror carries the title message");
  lang = "de";
  assert.equal(entryText(n, "title"), "Die Entleerung von Leeds", "the mirrored title reads in German");
  assert.equal(entryText(n, "body"), "Leeds emptied.", "the plain body keeps its text");
  lang = "en";
}

console.log("  ok   stored-messages");
