#!/bin/zsh
# run-promo144.sh - mod test 144 (Steam page retakes). Puts mod test 142's turn-106 save into the save list under
# a probe-only name, runs the probe (no turns), then takes the save back out and restores any autosaves the load
# pushed out of the game's 10-slot rotation.
set -u
S="$HOME/Library/Application Support/Civilization VII"
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$S/emigration-probe-saves/promo142-turn106.Civ7Save"
NAME="EmigPromo106.Civ7Save"
AUTO="$S/Saves/Single/auto"
BAK="$S/emigration-probe-backup/auto-144"
say() { echo "[$(date +%H:%M:%S)] $*"; }
[ -f "$SRC" ] || { say "missing $SRC"; exit 1; }
rm -rf "$BAK"; mkdir -p "$BAK"; cp -p "$AUTO"/*.Civ7Save "$BAK"/ 2>/dev/null
cp "$SRC" "$S/Saves/Single/$NAME"
say "save staged as $NAME; $(ls "$BAK" | wc -l | tr -d ' ') autosaves backed up"
zsh "$HERE/run-probe.sh" "${SCRIPT:-eep-modtest144.js}" "$NAME" "${LABEL:-promo144}" 900
rm -f "$S/Saves/Single/$NAME"
if [ "$(ls "$AUTO"/*.Civ7Save 2>/dev/null | xargs -n1 basename | sort)" != "$(ls "$BAK" | sort)" ]; then
  say "autosaves changed during the run; putting the player's back"
  rm -f "$AUTO"/*.Civ7Save; cp -p "$BAK"/*.Civ7Save "$AUTO"/
fi
say "done; staged save removed: $([ -f "$S/Saves/Single/$NAME" ] && echo no || echo yes)"
