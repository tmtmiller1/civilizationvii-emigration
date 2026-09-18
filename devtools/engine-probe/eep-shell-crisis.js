// eep-shell-crisis.js - shell scope. Starts a NEW single-player game with ONE age crisis left selectable, so
// the crisis that runs is known rather than random. Runs 3 and 4 proved an existing save cannot be pushed into
// a crisis from data, so a new game is the only route to the plague.
//
// The setup parameter is "Crises" (Base/modules/core/config/SetupParameters.xml):
//     ParameterID="Crises" Domain="StandardCrises" Array="1" UxHint="InvertSelection"
//     ConfigurationGroup="Game" ConfigurationKey="ExcludeCrises"
// Array + InvertSelection + ExcludeCrises means the stored value is the list of crises to EXCLUDE. So to force
// the plague we hand it every other crisis. Run 5 failed because the code walked the parameter list and used
// the object's numeric ID ("26") instead of this name, so nothing was ever set and the new game ran 30 turns
// to 22.1% age progression with no crisis at all.
const WANT_CRISIS = "__CRISIS__";
const WANT_AGE = "__AGE__";
function emit(m) { try { console.error("[EmigProbe] shell " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function nameOf(v) { try { return String(GameSetup.resolveString(v.name) || ""); } catch (_) { return ""; } }

function setSingle(id, want) {
  const p = safe(() => GameSetup.findGameParameter(id), null);
  if (!p) return id + ": no such parameter";
  const vals = (p.domain && p.domain.possibleValues) || [];
  const hit = vals.find((v) => String(v.value).toUpperCase() === want.toUpperCase())
    || vals.find((v) => String(v.value).toUpperCase().includes(want.toUpperCase()))
    || vals.find((v) => nameOf(v).toUpperCase().includes(want.toUpperCase()));
  if (!hit) return id + ": no value matches " + want + " options=" + J(vals.map((v) => String(v.value)).slice(0, 12));
  const ok = safe(() => GameSetup.setGameParameterValue(id, hit.value), "threw");
  const after = safe(() => GameSetup.findGameParameter(id), null);
  return id + ": set " + J(hit.value) + " -> " + J(ok) + " now=" + J(after && after.value && after.value.value);
}

emit("attached crisis=" + WANT_CRISIS + " age=" + WANT_AGE);
setTimeout(() => {
  try { Configuration.editGame()?.reset(GameModeTypes.SINGLEPLAYER); emit("config reset to single player"); }
  catch (e) { emit("reset threw " + e); }
  setTimeout(() => {
    emit(setSingle("Age", WANT_AGE));
    setTimeout(() => {
      const p = safe(() => GameSetup.findGameParameter("Crises"), null);
      if (!p) {
        emit("Crises: NO SUCH PARAMETER (setup shape changed)");
      } else {
        const vals = (p.domain && p.domain.possibleValues) || [];
        const all = vals.map((v) => String(v.value));
        emit("Crises options=" + J(all) + " current=" + J(safe(() => p.value && p.value.value)));
        // Inverted selection: hand it everything EXCEPT the one we want to run.
        const exclude = all.filter((v) => v.toUpperCase() !== WANT_CRISIS.toUpperCase());
        emit("Crises excluding=" + J(exclude) + " keeping=" + J(WANT_CRISIS));
        const ok = safe(() => GameSetup.setGameParameterValue("Crises", exclude), "threw");
        const after = safe(() => GameSetup.findGameParameter("Crises"), null);
        emit("Crises set -> " + J(ok) + " readback=" + J(safe(() => after && after.value && after.value.value)));
        // Belt and braces: write the configuration key directly too, in case the parameter layer ignores an array.
        const direct = safe(() => { Configuration.editGame().setValue("ExcludeCrises", exclude); return "ok"; }, "threw");
        emit("ExcludeCrises direct write -> " + J(direct)
          + " readback=" + J(safe(() => Configuration.getGame().getValue("ExcludeCrises"))));
      }
      setTimeout(() => {
        try { engine.call("startGame"); emit("startGame called (Play Now)"); } catch (e) { emit("startGame threw " + e); }
      }, 2500);
    }, 2500);
  }, 3000);
}, 15000);
