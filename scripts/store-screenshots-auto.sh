#!/usr/bin/env bash
# Screenshot di Android Auto per Google Play: 1920x1080 (16:9), schermo dell'auto in cornice su fondo rosso con didascalia.
# Uso: scripts/store-screenshots-auto.sh [cartella-screenshot]   (default: resources/)
set -euo pipefail
SRC="${1:-resources}"
OUT="store/screenshots-auto"
FONT="DejaVu-Sans-Bold"
mkdir -p "$OUT"

# file originale | nome | didascalia
ITEMS=(
  "Schermata_20261012_110438.png|01-si|Su Android Auto: SÌ,\npuoi parcheggiare qui"
  "Schermata_20261012_110313.png|02-no|NO! E ti propone il\nparcheggio più vicino"
  "Schermata_20261012_105351.png|03-zona|Scegli la tua zona\nanche dall'auto"
  "Schermata_20261012_110610.png|04-fuori-zona|Fuori da una zona?\nTe lo dice"
)

W=1920; H=1080; SW=1360            # larghezza dello schermo dentro la cornice
for item in "${ITEMS[@]}"; do
  IFS='|' read -r file name caption <<<"$item"
  in="$SRC/$file"; [ -f "$in" ] || { echo "manca $in"; exit 1; }
  tmp="$(mktemp -d)"
  # via 4 px di bordo della finestra, poi ridimensiona
  magick "$in" -gravity center -shave 4x4 +repage -resize "${SW}x" "$tmp/shot.png"
  sh=$(magick identify -format %h "$tmp/shot.png")
  magick -size "${SW}x${sh}" xc:none -fill white -draw "roundrectangle 0,0 $((SW-1)),$((sh-1)) 30,30" "$tmp/mask.png"
  magick "$tmp/shot.png" -alpha set "$tmp/mask.png" -compose DstIn -composite "$tmp/round0.png"
  magick -size "$((SW+16))x$((sh+16))" xc:none -fill white -draw "roundrectangle 0,0 $((SW+15)),$((sh+15)) 36,36" \
    "$tmp/round0.png" -gravity center -compose Over -composite "$tmp/round.png"
  magick -size ${W}x${H} gradient:'#d9142f-#a50e24' \
    \( "$tmp/round.png" \( +clone -background black -shadow 55x20+0+16 \) +swap -background none -layers merge +repage \) \
    -gravity south -geometry +0+20 -composite \
    -gravity north -font "$FONT" -pointsize 54 -fill white -interline-spacing 4 -annotate +0+50 "$(printf "$caption")" \
    -alpha remove -alpha off "$OUT/$name.png"
  rm -rf "$tmp"
  echo "$OUT/$name.png  $(magick identify -format '%wx%h' "$OUT/$name.png")"
done
