#!/usr/bin/env bash
set -euo pipefail

mkdir -p public/assets

decode_asset() {
  source_file="$1"
  target_file="$2"
  echo "Restauration de ${target_file}..."
  test -s "$source_file"
  timeout 20s base64 --decode "$source_file" > "$target_file"
  test -s "$target_file"
  file "$target_file"
}

decode_asset assets-encoded/pdd-logo.jpg.b64 public/assets/pdd-logo.jpg
decode_asset assets-encoded/alpha-logo.png.b64 public/assets/alpha-logo.png
decode_asset assets-encoded/pixel-mascot.png.b64 public/assets/pixel-mascot.png
decode_asset assets-encoded/pdd2-wordmark.png.b64 public/assets/pdd2-wordmark.png
decode_asset assets-encoded/pixel-body.png.b64 public/assets/pixel-body.png
decode_asset assets-encoded/pixel-eye.png.b64 public/assets/pixel-eye.png

echo "Restauration du logo Pixel Everywhere sain..."
cat \
  assets-encoded/pixel-everywhere-logo-256.parts/part01.b64 \
  assets-encoded/pixel-everywhere-logo-256.parts/part02.b64 \
  assets-encoded/pixel-everywhere-logo-256.parts/part03.b64 \
  | timeout 20s base64 --decode \
  > public/assets/pixel-everywhere-logo.png

test -s public/assets/pixel-everywhere-logo.png
echo "6f98bde3e3661e7e7faf7dd3d0c5e61d5ab33bb427cdbdbf77fb6eefd2665fe6  public/assets/pixel-everywhere-logo.png" \
  | sha256sum --check --strict
timeout 10s identify public/assets/pixel-everywhere-logo.png

echo "Création des icônes web..."
timeout 30s convert public/assets/pixel-everywhere-logo.png -resize 192x192 public/assets/icon-192.png
timeout 30s convert public/assets/pixel-everywhere-logo.png -resize 512x512 public/assets/icon-512.png
timeout 10s identify public/assets/icon-192.png public/assets/icon-512.png

echo "Ressources graphiques restaurées avec succès."
