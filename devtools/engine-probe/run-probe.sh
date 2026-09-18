#!/bin/zsh
# run-probe.sh <game-script.js> <save file name> <label> [timeout seconds]
# Enables the LOCAL emigration copy (test-only AffectsSavedGames=0), installs the probe mod with the given
# game script, launches Civ VII via Steam, waits for "DONE", captures screenshots on "SHOT <name>" lines,
# quits, and restores (every emigration row Disabled=1 by ModId; probe removed).
set -u
SCRIPT="$1"; SAVE="$2"; LABEL="$3"; TIMEOUT="${4:-900}"
S="$HOME/Library/Application Support/Civilization VII"
DB="$S/Mods.sqlite"; MODS="$S/Mods"; LOG="$S/Logs/UI.log"; MI="$MODS/emigration/emigration.modinfo"
PROBE_SRC="$(cd "$(dirname "$0")" && pwd)"
say() { echo "[$(date +%H:%M:%S)] $*"; }

# Remember every emigration row's Disabled flag so the restore puts the registry back exactly as the
# player had it (forcing Disabled=1 afterwards left the mod switched off for the next real session).
PRE_STATE=$(sqlite3 "$DB" "select ModRowId||'='||Disabled from Mods where ModId='emigration'")
sqlite3 "$DB" "update Mods set Disabled=0 where ModId='emigration' and ScannedFileRowId in (select ScannedFileRowId from ScannedFiles where Path like '%/Civilization VII/Mods/emigration/%')"
cp "$MI" "$MI.bak"
grep -q AffectsSavedGames "$MI" || sed -i '' 's#<Version>2.2.0</Version>#<Version>2.2.0</Version>\n        <AffectsSavedGames>0</AffectsSavedGames>#' "$MI"
say "registry: $(sqlite3 "$DB" "select ModRowId,ModId,Disabled from Mods where ModId='emigration'" | tr '\n' ' ') ; modinfo flag: $(grep -c AffectsSavedGames "$MI")"

rm -rf "$MODS/emig-engine-probe"; mkdir -p "$MODS/emig-engine-probe/ui" "$MODS/emig-engine-probe/data" "$PROBE_SRC/shots"
cp "$PROBE_SRC/emig-engine-probe.modinfo" "$MODS/emig-engine-probe/"
# SCEN_SRC installs a SECOND throwaway mod whose modinfo carries a gameplay-context <ScenarioScripts>
# action (multiplayer plan 8.9h probe 1). It is its own mod on purpose: if the engine rejects that action
# the whole modinfo may fail to parse, and that must not stop the UI probe from running and reporting it.
rm -rf "$MODS/emig-scen-probe"
if [ -n "${SCEN_SRC:-}" ]; then
  mkdir -p "$MODS/emig-scen-probe/scripts"
  cp "$PROBE_SRC/emig-scen-probe.modinfo" "$MODS/emig-scen-probe/"
  cp "$PROBE_SRC/$SCEN_SRC" "$MODS/emig-scen-probe/scripts/eep-scenario.js"
  say "scenario-script probe installed: $SCEN_SRC"
fi
# SHELL_SRC picks another shell script (e.g. eep-shell-speed.js, which starts a new game); SPEED fills its __SPEED__.
sed -e "s/AugustusAnt136.Civ7Save/$SAVE/" -e "s/__SPEED__/${SPEED:-}/" -e "s/__CRISIS__/${CRISIS:-}/" -e "s/__AGE__/${AGE:-}/" "$PROBE_SRC/${SHELL_SRC:-eep-shell.js}" > "$MODS/emig-engine-probe/ui/eep-shell.js"
cp "$PROBE_SRC/$SCRIPT" "$MODS/emig-engine-probe/ui/eep-game.js"
cp "$PROBE_SRC/eep-test-constructible.xml" "$MODS/emig-engine-probe/data/"
# Optional probe-only database override (EXTRA_DATA=<file in this folder>). The modinfo always loads
# data/eep-extra.xml, so write an empty database when no override is asked for.
if [ -n "${EXTRA_DATA:-}" ]; then cp "$PROBE_SRC/$EXTRA_DATA" "$MODS/emig-engine-probe/data/eep-extra.xml"; say "extra data: $EXTRA_DATA";
else printf '<?xml version="1.0" encoding="utf-8"?>\n<Database/>\n' > "$MODS/emig-engine-probe/data/eep-extra.xml"; fi
say "probe installed: $SCRIPT on $SAVE"

: > "$LOG" 2>/dev/null
open steam://rungameid/1295660
n=0; until pgrep -x CivilizationVII >/dev/null; do sleep 2; n=$((n+1)); [ $n -gt 90 ] && { say "GAME DID NOT START"; break; }; done
say "game pid $(pgrep -x CivilizationVII | head -1)"
t=0; result=timeout; typeset -A shot
while [ $t -lt $TIMEOUT ]; do
  sleep 4; t=$((t+4))
  for name in $(grep -o "\[EmigTest\] SHOT [A-Za-z0-9_-]*" "$LOG" 2>/dev/null | awk '{print $3}'); do
    if [ -z "${shot[$name]:-}" ]; then
      shot[$name]=1
      # Capture the game WINDOW by id when a tall one is listed; otherwise bring the game forward and take the
      # full screen ONLY if the game is then verifiably the frontmost app. Never capture while another app is
      # in front: a full-screen shot once recorded the player's own desktop (2026-09-14).
      wins=$(swift "$PROBE_SRC/eep-winid.swift" 2>/dev/null)
      winid=$(printf "%s\n" "$wins" | awk '$3 > 600' | sort -k3 -n -r | head -1 | awk '{print $1}')
      out="$PROBE_SRC/shots/$LABEL-$name.png"
      if [ -n "$winid" ]; then
        screencapture -x -o -l "$winid" "$out"
        say "shot $name (window $winid) -> $(ls -la "$out" 2>&1 | awk '{print $5" bytes"}')"
      else
        say "shot $name: no tall game window in list [$(printf "%s" "$wins" | tr '\n' ';')]; trying frontmost capture"
        osascript -e 'tell application "CivilizationVII" to activate' >/dev/null 2>&1; sleep 3
        front=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null)
        if printf "%s" "$front" | grep -qi "civilization"; then
          screencapture -x "$out"
          say "shot $name (frontmost '$front') -> $(ls -la "$out" 2>&1 | awk '{print $5" bytes"}')"
        else
          say "shot $name skipped: frontmost app is '$front', not the game"
        fi
      fi
    fi
  done
  if grep -q "DONE modtest[0-9]* finished" "$LOG" 2>/dev/null; then result=done; sleep 6; break; fi
  if grep -q "LOAD gave up\|cannot load" "$LOG" 2>/dev/null; then result=loadfail; break; fi
  if ! pgrep -x CivilizationVII >/dev/null; then result=crashed; break; fi
done
say "result=$result after ${t}s"
grep "\[EmigTest\]\|\[EmigProbe\]" "$LOG" | cut -c1-1200 > "$PROBE_SRC/$LABEL-UI.log"
# A gameplay-context script may log somewhere other than UI.log, and whether its mod was scanned and its
# actions understood is only visible in Modding.log. Capture both for the multiplayer probe.
grep -h "\[EmigScen\]" "$S/Logs/"*.log 2>/dev/null | cut -c1-1200 > "$PROBE_SRC/$LABEL-scen.log"
grep -i "emig-scen-probe\|ScenarioScripts\|emig-engine-probe" "$S/Logs/Modding.log" 2>/dev/null | cut -c1-500 > "$PROBE_SRC/$LABEL-modding.log"
grep -i "error\|exception" "$LOG" | grep -iv "EmigTest\|\[Emigration" | tail -15 > "$PROBE_SRC/$LABEL-errors.txt"

pkill -TERM CivilizationVII; sleep 8; pgrep -x CivilizationVII >/dev/null && { sleep 10; pkill -KILL CivilizationVII; }
for row in ${(f)PRE_STATE}; do sqlite3 "$DB" "update Mods set Disabled=${row#*=} where ModRowId=${row%%=*}"; done
mv "$MI.bak" "$MI"
rm -rf "$MODS/emig-engine-probe" "$MODS/emig-scen-probe"
say "restored: $(sqlite3 "$DB" "select ModRowId,ModId,Disabled from Mods where ModId='emigration'" | tr '\n' ' ') ; modinfo flag: $(grep -c AffectsSavedGames "$MI") ; probe present: $([ -d "$MODS/emig-engine-probe" ] && echo yes || echo no)"
say "FINISHED result=$result"
