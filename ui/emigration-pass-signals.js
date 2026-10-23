// emigration-pass-signals.js
//
// The ranked city signals of the most recent pass, kept for readers that run between passes and must not
// collect the signals again (a full map read, 0.3 to 1.6 s on a large game). The AI call-home rule reads a
// civilization's distress from these on its own turn. Empty before the first pass of a session.
//
// Only plain data is kept, never the engine's city object. A city that changes hands or is removed between
// the pass and a later read has its engine object freed, and touching the held reference then crashes the
// game natively (watched 2026-10-23: Chalkís passed from Greece to Goryeo during Persia's turn, and reading
// the held object on Greece's turn was a bus error on the UI thread). Each kept signal carries its city's
// component id instead; `freshCity` resolves it at read time.

/** @type {*[]} */
let _lastRanked = [];

/**
 * A copy of a signal without its engine city object, keeping the city's component id as plain numbers.
 * @param {*} s A city signal. @returns {*} The plain copy.
 */
function plainSignal(s) {
  if (!s || typeof s !== "object") return null;
  const { city, ...rest } = s;
  let cid = null;
  try {
    const id = city && city.id;
    if (id && typeof id === "object") cid = { owner: id.owner, id: id.id, type: id.type };
  } catch (_) {
    cid = null;
  }
  return { ...rest, cid };
}

/**
 * Remember this pass's ranked signals as plain copies, and hand the ranked list itself back so the pass can
 * wrap its own ranking call.
 * @param {*[]} ranked The ranked city signals. @returns {*[]} The same array, unchanged.
 */
export function rememberPassRanked(ranked) {
  _lastRanked = Array.isArray(ranked) ? ranked.map(plainSignal).filter(Boolean) : [];
  return ranked;
}

/**
 * The plain signals from the most recent pass (no engine objects; see {@link freshCity}).
 * @returns {*[]} The signals (empty before the first pass).
 */
export function lastPassRanked() {
  return _lastRanked;
}

/**
 * The live city for a kept signal, or null when it no longer exists or no longer belongs to the owner the
 * pass saw. Never reads a held engine object.
 * @param {*} s A kept signal. @returns {*} The city, or null.
 */
export function freshCity(s) {
  try {
    if (!s || !s.cid || typeof Cities === "undefined" || typeof Cities.get !== "function") return null;
    const city = Cities.get(s.cid);
    if (!city || city.owner !== s.owner) return null;
    return city;
  } catch (_) {
    return null;
  }
}
