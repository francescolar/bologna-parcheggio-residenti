#!/usr/bin/env bash
# Imposta una posizione finta sul telefono collegato (per provare ParResBo, anche su Android Auto, senza
# essere a Bologna). La rinnova ogni 2 secondi; con Ctrl+C la toglie e torna la posizione vera.
#
# Uso:  scripts/fake-location.sh                  # Bologna, Via Indipendenza (44.4949 11.3426)
#       scripts/fake-location.sh 44.5058 11.3433  # coordinate a scelta: latitudine longitudine [precisione-m]
#
# Funziona da Android 12: usa "adb shell cmd location providers" e il permesso di posizione fittizia per adb.
set -euo pipefail

ADB="$(command -v adb || echo "${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools/adb")"
LAT="${1:-44.4949}"
LNG="${2:-11.3426}"
ACC="${3:-5}"
PROVIDERS=(gps network fused)   # tutti e tre: se ne lasci uno vero, il telefono ritorna alla posizione reale

"$ADB" get-state >/dev/null 2>&1 || { echo "Nessun telefono collegato (cavo USB + debug USB)."; exit 1; }

shell() { "$ADB" shell "$@" 2>&1; }

# Permesso di posizione fittizia per l'utente "shell" di adb
shell appops set 2000 android:mock_location allow >/dev/null || true

cleanup() {
  for p in "${PROVIDERS[@]}"; do shell cmd location providers remove-test-provider "$p" >/dev/null || true; done
  echo; echo "Posizione finta tolta: torna quella vera."
}
trap cleanup EXIT
trap 'exit 0' INT TERM

for p in "${PROVIDERS[@]}"; do
  shell cmd location providers remove-test-provider "$p" >/dev/null || true
  out="$(shell cmd location providers add-test-provider "$p")"
  if grep -qi "exception" <<<"$out"; then echo "Errore con $p: $out"; exit 1; fi
  shell cmd location providers set-test-provider-enabled "$p" true >/dev/null
done

echo "Posizione finta attiva: $LAT, $LNG (precisione ${ACC} m). Ctrl+C per fermarla."
while true; do
  for p in "${PROVIDERS[@]}"; do
    shell cmd location providers set-test-provider-location "$p" --location "$LAT,$LNG" --accuracy "$ACC" >/dev/null
  done
  sleep 2
done
