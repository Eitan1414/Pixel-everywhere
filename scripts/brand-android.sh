#!/usr/bin/env bash
set -euo pipefail

source_image="public/assets/icon-512.png"

for spec in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  density="${spec%%:*}"
  rest="${spec#*:}"
  launcher="${rest%%:*}"
  foreground="${rest##*:}"
  target="android/app/src/main/res/mipmap-${density}"
  foreground_logo=$((foreground * 72 / 108))

  convert "$source_image" -resize "${launcher}x${launcher}" "$target/ic_launcher.png"
  convert "$source_image" -resize "${launcher}x${launcher}" "$target/ic_launcher_round.png"
  convert "$source_image" \
    -resize "${foreground_logo}x${foreground_logo}" \
    -gravity center \
    -background none \
    -extent "${foreground}x${foreground}" \
    "$target/ic_launcher_foreground.png"
done

sed -i 's/#FFFFFF/#08090C/' \
  android/app/src/main/res/values/ic_launcher_background.xml

for target in android/app/src/main/res/drawable*/splash.png; do
  dimensions="$(identify -format '%wx%h' "$target")"
  width="${dimensions%x*}"
  height="${dimensions#*x}"
  if [ "$width" -lt "$height" ]; then
    side=$((width * 80 / 100))
  else
    side=$((height * 80 / 100))
  fi
  convert "$source_image" \
    -resize "${side}x${side}" \
    -gravity center \
    -background "#08090C" \
    -extent "$dimensions" \
    "$target"
done

