// eep-shell-speed.js - shell scope. Starts a NEW single-player game at a chosen game speed. The runner replaces
// __SPEED__ (SPEED=ONLINE|QUICK|STANDARD|EPIC|MARATHON): reset the configuration to single player, set the
// "GameSpeeds" setup parameter to the matching option (by value or resolved name), then Play Now
// (engine.call("startGame")), as the cultural-diffusion harness's run 8 did.

const WANT = "__SPEED__";
function emit(m) { try { console.error("[EmigProbe] shell " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function nameOf(v) { try { return String(GameSetup.resolveString(v.name) || ""); } catch (_) { return ""; } }

emit("attached speed=" + WANT);
setTimeout(() => {
  try { Configuration.editGame()?.reset(GameModeTypes.SINGLEPLAYER); emit("config reset to single player"); } catch (e) { emit("reset threw " + e); }
  setTimeout(() => {
    try {
      const p = GameSetup.findGameParameter("GameSpeeds");
      const vals = (p && p.domain && p.domain.possibleValues) || [];
      emit("speed options " + J(vals.map((v) => [v.value, nameOf(v)])) + " current=" + J(p && p.value && p.value.value));
      const want = WANT.toUpperCase();
      const hit = vals.find((v) => String(v.value).toUpperCase().includes(want) || nameOf(v).toUpperCase().includes(want));
      if (!hit) { emit("cannot load: no speed option matches " + WANT); return; }
      const ok = GameSetup.setGameParameterValue("GameSpeeds", hit.value);
      const after = GameSetup.findGameParameter("GameSpeeds");
      emit("set GameSpeeds=" + J(hit.value) + " returned " + J(ok) + " now=" + J(after && after.value && after.value.value));
    } catch (e) { emit("set speed threw " + e); }
    setTimeout(() => { try { engine.call("startGame"); emit("startGame called (Play Now)"); } catch (e) { emit("startGame threw " + e); } }, 2000);
  }, 3000);
}, 15000);
