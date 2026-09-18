#!/bin/zsh
# run-probe148.sh - mod test 148 (ethnicity audit O1 + O4 probes) on EmigShots072. Backs up the autosaves (the probe
# ends one turn, which autosaves) and puts back any the run pushed out of the 10-slot rotation.
set -u
S="$HOME/Library/Application Support/Civilization VII"
HERE="$(cd "$(dirname "$0")" && pwd)"
AUTO="$S/Saves/Single/auto"
BAK="$S/emigration-probe-backup/auto-148"
say() { echo "[$(date +%H:%M:%S)] $*"; }
rm -rf "$BAK"; mkdir -p "$BAK"; cp -p "$AUTO"/*.Civ7Save "$BAK"/ 2>/dev/null
say "$(ls "$BAK" | wc -l | tr -d ' ') autosaves backed up"
zsh "$HERE/run-probe.sh" "${SCRIPT:-eep-modtest148.js}" "${SAVE:-EmigShots072.Civ7Save}" "${LABEL:-probe148}" "${TIMEOUT:-900}"
if [ "$(ls "$AUTO"/*.Civ7Save 2>/dev/null | xargs -n1 basename | sort)" != "$(ls "$BAK" | sort)" ]; then
  say "autosaves changed during the run; putting the player's back"
  rm -f "$AUTO"/*.Civ7Save; cp -p "$BAK"/*.Civ7Save "$AUTO"/
fi
say "done"
