// eep-shell-hotseat2.js - shell scope. Second attempt at starting a HOTSEAT game with two humans for the
// multiplayer plan's probe 4. The first attempt (eep-shell-hotseat.js) configured hotseat and then called
// engine.call("startGame") (Play Now), and the game that started was ordinary single player: isHotseat false,
// one human. Play Now does not carry the mode.
//
// This one starts the game the way the base game and its own automation do: configure, let the game-setup
// revision settle, then Network.hostGame(ServerType.SERVER_TYPE_HOTSEAT)
// (core/ui/shell/mp-shell-logic, base-standard/ui/automation/automation-base-play-game.js).

function emit(m) { try { console.error("[EmigProbe] shell " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }

/** @returns {string} What the configuration says about the session right now. */
function state() {
  const g = safeGet();
  return "isHotseat=" + J(g && g.isHotseat) + " isAnyMultiplayer=" + J(g && g.isAnyMultiplayer) +
    " humans=" + J(g && g.humanPlayerIDs) + " count=" + J(g && g.humanPlayerCount);
}

function safeGet() {
  try { return Configuration.getGame(); } catch (_) { return null; }
}

function takeSlots(want) {
  const g = safeGet();
  if (!g) return;
  let need = want - Number(g.humanPlayerCount || 0);
  for (const id of (g.availablePlayerIDs || [])) {
    if (need <= 0) break;
    try { Configuration.editPlayer(id).setSlotStatus(SlotStatus.SS_TAKEN); need--; emit("slot " + id + " taken (available)"); } catch (e) { emit("slot " + id + " threw " + e); }
  }
  for (const id of (g.aiPlayerIDs || [])) {
    if (need <= 0) break;
    try {
      const pc = Configuration.editPlayer(id);
      if (pc.civilizationLevelTypeID === CivilizationLevelTypes.CIVILIZATION_LEVEL_FULL_CIV) {
        pc.setSlotStatus(SlotStatus.SS_TAKEN);
        need--;
        emit("slot " + id + " taken (was AI)");
      }
    } catch (e) { emit("slot " + id + " threw " + e); }
  }
}

emit("attached (hotseat2)");
setTimeout(() => {
  try {
    Configuration.editGame()?.reset(GameModeTypes.HOTSEAT);
    emit("reset to hotseat: " + state());
  } catch (e) {
    emit("reset threw " + e);
  }
  setTimeout(() => {
    takeSlots(2);
    emit("after slots: " + state() + " setupRevision=" + J(safeGet() && GameSetup?.currentRevision));
    setTimeout(() => {
      try {
        Network.hostGame(ServerType.SERVER_TYPE_HOTSEAT);
        emit("hostGame(SERVER_TYPE_HOTSEAT) called");
      } catch (e) {
        emit("hostGame threw " + e);
      }
      // The staging room may need a start push once the slots are ready.
      setTimeout(() => {
        emit("after hostGame: " + state());
        try { Network.startMultiplayerGame(); emit("startMultiplayerGame called"); } catch (e) { emit("startMultiplayerGame threw " + e); }
        setTimeout(() => emit("after start: " + state()), 8000);
      }, 8000);
    }, 4000);
  }, 3000);
}, 15000);
