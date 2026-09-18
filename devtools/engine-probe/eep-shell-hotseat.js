// eep-shell-hotseat.js - shell scope. Starts a NEW HOTSEAT game with TWO human players, for the
// multiplayer plan's probe 4 (docs/player-experience-risks.md 8.9h): does the mod's per-turn work run once
// per human instead of once per game turn, and what do the session reads answer when more than one human
// exists? Same shape as eep-shell-speed.js (reset, configure, Play Now), with the game mode set to hotseat
// and one full-civ AI slot converted to a second local human, the way the base automation support does it
// (base-standard/ui/automation/automation-test-support.js, SlotStatus.SS_TAKEN).

function emit(m) { try { console.error("[EmigProbe] shell " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }

emit("attached (hotseat)");
setTimeout(() => {
  try {
    Configuration.editGame()?.reset(GameModeTypes.HOTSEAT);
    emit("config reset to hotseat; isHotseat=" + J(Configuration.getGame()?.isHotseat) +
      " isAnyMultiplayer=" + J(Configuration.getGame()?.isAnyMultiplayer));
  } catch (e) {
    emit("reset threw " + e);
  }
  setTimeout(() => {
    try {
      const g = Configuration.getGame();
      emit("before: humans=" + J(g.humanPlayerIDs) + " count=" + J(g.humanPlayerCount) + " ai=" + J(g.aiPlayerIDs));
      let need = 2 - Number(g.humanPlayerCount || 0);
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
      const after = Configuration.getGame();
      emit("after: humans=" + J(after.humanPlayerIDs) + " count=" + J(after.humanPlayerCount));
    } catch (e) {
      emit("slot setup threw " + e);
    }
    setTimeout(() => {
      try { engine.call("startGame"); emit("startGame called (Play Now, hotseat)"); } catch (e) { emit("startGame threw " + e); }
    }, 2000);
  }, 3000);
}, 15000);
