#!/bin/zsh
# run-promo142.sh - mod test 142 (Steam page screenshots) with the player's state protected.
# The probe turns migration up through the player's own settings and plays ~40 turns, which writes autosaves.
# Before the run: copy LocalStorage.sqlite (where the settings live) and the autosave folder aside. After it: if
# the Emigration settings differ from before (the probe's own restore did not run), put the file back.
set -u
S="$HOME/Library/Application Support/Civilization VII"
HERE="$(cd "$(dirname "$0")" && pwd)"
# Kept outside the repo: it holds saves and the settings store, which must never be committed.
BAK="${BAK_DIR:-$S/emigration-probe-backup}"
say() { echo "[$(date +%H:%M:%S)] $*"; }
slice() { sqlite3 "$S/LocalStorage.sqlite" "select value from \"Values\" where key='modSettings'" 2>/dev/null \
  | python3 -c 'import sys,json
try: print(json.dumps(json.loads(sys.stdin.read() or "{}").get("emigration"), sort_keys=True))
except Exception as e: print("unreadable", e)'; }

rm -rf "$BAK"; mkdir -p "$BAK"
cp "$S/LocalStorage.sqlite" "$BAK/"
cp -R "$S/Saves/Single/auto" "$BAK/auto"
BEFORE=$(slice)
say "backed up settings store and $(ls "$BAK/auto" | wc -l | tr -d ' ') autosave entries to $BAK"

zsh "$HERE/run-probe.sh" eep-modtest142.js AugustusExp66.Civ7Save promo142 5400

AFTER=$(slice)
if [ "$BEFORE" = "$AFTER" ]; then
  say "Emigration settings unchanged by the run"
else
  say "Emigration settings differ after the run; restoring LocalStorage.sqlite from the backup"
  say "  before: $BEFORE"
  say "  after:  $AFTER"
  pgrep -x CivilizationVII >/dev/null && { say "game still running; NOT restoring. Restore by hand: $BAK/LocalStorage.sqlite"; exit 1; }
  cp "$BAK/LocalStorage.sqlite" "$S/LocalStorage.sqlite"
  say "restored; now: $(slice)"
fi
say "autosaves from before the run are kept in $BAK/auto"
