#!/usr/bin/env bash
# Prepara gli screenshot per Google Play: 1080x1920 (9:16, entro il limite 2:1), con sfondo rosso e didascalia.
# Uso: scripts/store-screenshots.sh [cartella-screenshot]   (default: resources/)
set -euo pipefail
SRC="${1:-resources}"
OUT="store/screenshots"
FONT="DejaVu-Sans-Bold"
mkdir -p "$OUT"

# file originale | nome di uscita | didascalia
ITEMS=(
  "Screenshot_20261012-103810.png|01-mappa|Le zone residenti\ndi Bologna sulla mappa"
  "Screenshot_20261012-104005.png|02-si|Puoi parcheggiare?\nSÌ, in un tocco"
  "Screenshot_20261012-104011.png|03-no|Se è NO, ti porta al\nparcheggio più vicino"
  "Screenshot_20261012-103852.png|04-impostazioni|Scegli la tua zona\ne cosa mostrare"
  "Screenshot_20261012-103804.png|05-avviso|Un avviso chiaro\nprima di iniziare"
  "Screenshot_20261012-103957.png|06-fuori-zona|Fuori da una zona?\nTe lo dice"
)

W=1080; H=1920; SH=1380            # altezza dello screenshot dentro la cornice
for item in "${ITEMS[@]}"; do
  IFS='|' read -r file name caption <<<"$item"
  in="$SRC/$file"; [ -f "$in" ] || { echo "manca $in"; exit 1; }
  tmp="$(mktemp -d)"
  magick "$in" -resize "x$SH" "$tmp/shot.png"
  sw=$(magick identify -format %w "$tmp/shot.png")
  magick -size "${sw}x${SH}" xc:none -fill white -draw "roundrectangle 0,0 $((sw-1)),$((SH-1)) 54,54" "$tmp/mask.png"
  magick "$tmp/shot.png" -alpha set "$tmp/mask.png" -compose DstIn -composite "$tmp/round0.png"
  # bordo bianco sottile: serve soprattutto quando lo schermo è dello stesso rosso dello sfondo
  magick -size "$((sw+14))x$((SH+14))" xc:none -fill white -draw "roundrectangle 0,0 $((sw+13)),$((SH+13)) 60,60" \
    "$tmp/round0.png" -gravity center -compose Over -composite "$tmp/round.png"
  magick -size ${W}x${H} gradient:'#d9142f-#a50e24' \
    \( "$tmp/round.png" \( +clone -background black -shadow 55x22+0+18 \) +swap -background none -layers merge +repage \) \
    -gravity south -geometry +0+70 -composite \
    -gravity north -font "$FONT" -pointsize 62 -fill white -interline-spacing 6 -annotate +0+95 "$(printf "$caption")" \
    -alpha remove -alpha off "$OUT/$name.png"
  rm -rf "$tmp"
  echo "$OUT/$name.png  $(magick identify -format '%wx%h' "$OUT/$name.png")"
done
