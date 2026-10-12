#!/usr/bin/env bash
# Avvia l'emulatore dell'auto (Desktop Head Unit) collegato al telefono, per provare ParResBo su Android Auto.
# Prima, sul telefono: Android Auto → menu ⋮ → "Avvia server unità principale" (vedi docs/android-auto-testing.md).
#
# Uso:  scripts/dhu.sh [profilo]     profilo: 480p (default, 800x480) | 720p | 1080p | wide | 6in | rotary | file.ini
#       scripts/dhu.sh 1080p
set -euo pipefail

SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
ADB="$(command -v adb || echo "$SDK/platform-tools/adb")"
DHU_DIR="$SDK/extras/google/auto"

[ -x "$DHU_DIR/desktop-head-unit" ] || { echo "Desktop Head Unit non trovato in $DHU_DIR (Android Studio → SDK Manager → SDK Tools → Android Auto Desktop Head Unit Emulator)"; exit 1; }

echo "Telefoni collegati:"
"$ADB" devices | sed -n '2,$p' | grep -v '^$' || true
"$ADB" get-state >/dev/null 2>&1 || { echo "Nessun telefono: collega il cavo USB e accetta il debug USB sul telefono."; exit 1; }

"$ADB" forward tcp:5277 tcp:5277

# Profilo di schermo: scorciatoie per i file di config/ dell'emulatore (o un tuo .ini)
ARGS=()
if [ $# -gt 0 ]; then
  case "$1" in
    480p)   CFG="$DHU_DIR/config/default.ini" ;;
    720p)   CFG="$DHU_DIR/config/default_720p.ini" ;;
    1080p)  CFG="$DHU_DIR/config/default_1080p.ini" ;;
    wide)   CFG="$DHU_DIR/config/default_wide.ini" ;;
    6in)    CFG="$DHU_DIR/config/default_6in.ini" ;;
    rotary) CFG="$DHU_DIR/config/rotary.ini" ;;
    *)      CFG="$1" ;;
  esac
  [ -f "$CFG" ] || { echo "Profilo non trovato: $CFG"; exit 1; }
  ARGS=(-c "$CFG")
  shift
fi

echo "Porta inoltrata (5277). Avvio l'emulatore dell'auto ${ARGS[*]:-}…"
cd "$DHU_DIR"
exec ./desktop-head-unit ${ARGS[@]+"${ARGS[@]}"} "$@"
