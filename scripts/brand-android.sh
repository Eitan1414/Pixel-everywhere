#!/usr/bin/env bash
set -euo pipefail

source_image="public/assets/icon-512.png"

test -s "$source_image"
timeout 10s identify "$source_image"

for spec in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  density="${spec%%:*}"
  rest="${spec#*:}"
  launcher="${rest%%:*}"
  foreground="${rest##*:}"
  target="android/app/src/main/res/mipmap-${density}"
  foreground_logo=$((foreground * 72 / 108))

  echo "Génération des icônes ${density}..."
  timeout 30s convert "$source_image" -resize "${launcher}x${launcher}" "$target/ic_launcher.png"
  timeout 30s convert "$source_image" -resize "${launcher}x${launcher}" "$target/ic_launcher_round.png"
  timeout 30s convert "$source_image" \
    -resize "${foreground_logo}x${foreground_logo}" \
    -gravity center \
    -background none \
    -extent "${foreground}x${foreground}" \
    "$target/ic_launcher_foreground.png"

done

sed -i 's/#FFFFFF/#08090C/' \
  android/app/src/main/res/values/ic_launcher_background.xml

for target in android/app/src/main/res/drawable*/splash.png; do
  echo "Mise à jour de ${target}..."
  dimensions="$(timeout 10s identify -format '%wx%h' "$target")"
  timeout 30s convert -size "$dimensions" xc:"#000000" "$target"
done

echo "Icônes Android générées avec succès."
