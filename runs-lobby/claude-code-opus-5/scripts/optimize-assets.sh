#!/usr/bin/env bash
# Post-processing of the generated assets for web delivery.
#   assets-source/  the untouched tool output, checked in as evidence
#   assets/         what Vite serves and ships in dist/
# Nothing here changes the *content* of an asset: material maps are resized to
# 1024 and encoded as JPEG, decals are resized to 512 and kept as PNG.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p assets-source/textures assets-source/music

# move the raw tool output aside once
for f in assets/textures/*.png; do
  [ -e "$f" ] || continue
  b=$(basename "$f")
  [ -e "assets-source/textures/$b" ] || cp "$f" "assets-source/textures/$b"
done
if [ -d assets/music/raw ]; then
  cp -n assets/music/raw/* assets-source/music/ 2>/dev/null || true
  rm -rf assets/music/raw
fi

DECALS="bullet_hole crack_decal dust_puff spark"
rm -f assets/textures/*.png assets/textures/*.jpg
for src in assets-source/textures/*.png; do
  name=$(basename "$src" .png)
  if echo "$DECALS" | grep -qw "$name"; then
    ffmpeg -v error -y -i "$src" -vf "scale=512:512:flags=lanczos" "assets/textures/${name}.png"
  else
    ffmpeg -v error -y -i "$src" -vf "scale=1024:1024:flags=lanczos" -q:v 3 "assets/textures/${name}.jpg"
  fi
done
echo "--- runtime textures ---"
ls -la assets/textures
du -sh assets assets-source
