#!/bin/bash
# A11 character look-dev textures. All surface art is generated with the Codex
# CLI image tool (the mandated image source for this benchmark); normal and
# roughness maps are DERIVED from these albedos by scripts/derive-maps.py.
# Usage: ./scripts/gen-textures-a11.sh
set -uo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
gen() { # name prompt
  local name="$1" prompt="$2"
  if [ -s "$DIR/public/assets/textures/$name.png" ]; then echo "skip $name"; return; fi
  echo "=== $name"
  local f="$DIR/public/assets/textures/$name.png"
  codex exec --skip-git-repo-check --sandbox workspace-write -C "$DIR" \
    "Generate an image: $prompt. Save it as public/assets/textures/$name.png relative to the current directory. If you can only store it under ~/.codex/generated_images, print that exact file path clearly." \
    < /dev/null > "$DIR/scripts/codexlog_a11_$name.txt" 2>&1
  if [ ! -s "$f" ]; then
    local q
    q=$(grep -oE '(/Users/[^ "]*\.codex/generated_images/[^ "]*\.png|~/\.codex/generated_images/[^ "]*\.png)' "$DIR/scripts/codexlog_a11_$name.txt" | tail -1)
    q="${q/#\~/$HOME}"
    if [ -n "$q" ] && [ -s "$q" ]; then cp "$q" "$f"; fi
  fi
  if [ -s "$f" ]; then echo "OK   $name"; else echo "FAIL $name (see scripts/codexlog_a11_$name.txt)"; fi
}

gen a11_coat_twill "a seamless tileable flat-lit texture of black heavy cotton-gabardine trench coat fabric, fine diagonal twill weave clearly visible, subtle slate-grey sheen on the raised diagonal ribs, a few faint pressed fold creases, very slightly lighter worn abrasion along the weave, photographic material study, no seams at the tile edges, no logo, no text, top-down flat view"
gen a11_shirt_weave "a seamless tileable flat-lit texture of crisp white cotton uniform shirt fabric, fine plain-weave poplin thread grid clearly visible, faint cool-grey shadowing in the weave, a couple of soft pressed creases, clean and slightly starched, photographic material study, no seams at the tile edges, no logo, no text, top-down flat view"
gen a11_latex_sheen "a seamless tileable flat-lit texture of black latex, glossy rubber surface with fine stretch crease lines and soft elongated specular streaks, subtle grain, deep black with cool highlights, photographic material study, no seams at the tile edges, no text, top-down flat view"
gen a11_skin_pores "a seamless tileable flat-lit texture of human facial skin, neutral light tan, very fine pore detail and subtle mottled tonal variation, slight redness variation, matte, no hair, no features, photographic material study, no seams at the tile edges, top-down flat view"
gen a11_tactical_weave "a seamless tileable flat-lit texture of black tactical nylon cordura fabric, tight ballistic basket weave clearly visible, matte with a faint sheen on the weave crowns, slight dusty wear, photographic material study, no seams at the tile edges, no logo, no text, top-down flat view"
gen a11_boot_leather "a seamless tileable flat-lit texture of scuffed black leather combat boot hide, fine natural grain, soft creasing, subtle lighter scuffs and polish highlights, photographic material study, no seams at the tile edges, no text, top-down flat view"
echo "ALL DONE"
