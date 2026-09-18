#!/bin/zsh
# run-closeout-chain.sh - the in-game runs that close README §17's playtest, game-speed, and placement-prompt caveats,
# one after another: the placement-prompt test (mod test 59), the remaining game speeds (mod test 56), then the
# long run with every layer on (mod test 57) and its control with the mod's pass off (mod test 58). After each run
# the mod's own pass-timing lines and any emigration errors are pulled from UI.log before the next launch clears it.
# Usage: zsh run-closeout-chain.sh [SPEEDS...]   (default speeds: ONLINE QUICK STANDARD EPIC)
set -u
cd "$(dirname "$0")"
U="$HOME/Library/Application Support/Civilization VII/Logs/UI.log"
say() { echo "[$(date +%H:%M:%S)] $*"; }
extract() {
  grep "\[EmigProbe\] shell" "$U" | cut -c1-600 > "$1-shell.log" 2>/dev/null
  grep "\[Emigration\] pass (" "$U" > "$1-passes.log" 2>/dev/null
  grep -i "\[Emigration\].*\(threw\|error\)" "$U" | head -40 > "$1-emig-errors.txt" 2>/dev/null
  say "$1: $(grep -c . "$1-passes.log") pass lines, $(grep -c . "$1-emig-errors.txt") emigration error lines"
}
pause() { sleep 25; while pgrep -x CivilizationVII >/dev/null; do sleep 5; done; }

if [[ -z "${SKIP_PROMPT:-}" ]]; then
  zsh run-probe.sh eep-modtest59.js AugustusExp66.Civ7Save modtest59-placement-prompt 600; extract modtest59-placement-prompt; pause
fi
# zsh does not word-split an unquoted default, so the speeds live in an array (run 1 passed them as one word).
SPEEDS=(ONLINE QUICK STANDARD EPIC)
(( $# )) && SPEEDS=("$@")
for sp in $SPEEDS; do
  l=modtest56-speed-${(L)sp}
  SHELL_SRC=eep-shell-speed.js SPEED=$sp zsh run-probe.sh eep-modtest56.js none $l 900; extract $l; pause
done
zsh run-probe.sh eep-modtest57.js AugustusExp66.Civ7Save modtest57-scale-mod 4500; extract modtest57-scale-mod; pause
sed -e 's/const CONTROL = false;/const CONTROL = true;/' -e 's/modtest57 attached/modtest58 attached/' eep-modtest57.js > eep-modtest58.js
zsh run-probe.sh eep-modtest58.js AugustusExp66.Civ7Save modtest58-scale-control 4500; extract modtest58-scale-control
say "CHAIN FINISHED"
