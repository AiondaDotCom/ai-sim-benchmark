#!/bin/bash
# A14: the reinforcement squad is MILITARY, in field green, not black-clad.
# All surface art is generated with the Codex CLI image tool (the mandated
# image source for this benchmark); normal and roughness maps are DERIVED from
# these albedos by scripts/derive-maps.py.
# Usage: ./scripts/gen-textures-a14.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
gen() { # name prompt
  local name="$1" prompt="$2"
  if [ -s "$DIR/public/assets/textures/$name.png" ]; then echo "skip $name"; return; fi
  echo "=== $name"
  local f="$DIR/public/assets/textures/$name.png"
  codex exec --skip-git-repo-check --sandbox workspace-write -C "$DIR" \
    "Generate an image: $prompt. Save it as public/assets/textures/$name.png relative to the current directory. If you can only store it under ~/.codex/generated_images, print that exact file path clearly." \
    < /dev/null > "$DIR/scripts/codexlog_a14_$name.txt" 2>&1
  if [ ! -s "$f" ]; then
    local q
    q=$(grep -oE '(/Users/[^ "]*\.codex/generated_images/[^ "]*\.png|~/\.codex/generated_images/[^ "]*\.png)' "$DIR/scripts/codexlog_a14_$name.txt" | tail -1)
    q="${q/#\~/$HOME}"
    if [ -n "$q" ] && [ -s "$q" ]; then cp "$q" "$f"; fi
  fi
  if [ -s "$f" ]; then echo "OK   $name"; else echo "FAIL $name (see scripts/codexlog_a14_$name.txt)"; fi
}

gen a14_field_green "a seamless tileable flat-lit texture of olive drab field-uniform fabric, mid-tone army green cotton ripstop with the fine square ripstop grid clearly visible, matte finish, faint lighter wear along the weave crowns, a couple of soft pressed creases, photographic material study, no seams at the tile edges, no logo, no text, no camouflage pattern, top-down flat view"
gen a14_webbing_green "a seamless tileable flat-lit texture of dark olive green military webbing and nylon load-bearing gear fabric, tight heavy basket weave clearly visible, matte with a faint sheen on the weave crowns, noticeably darker and coarser than a fatigue shirt, slight dusty wear, photographic material study, no seams at the tile edges, no logo, no text, top-down flat view"
echo "ALL DONE"
