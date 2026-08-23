#!/bin/bash
# A3 set/wardrobe pass: granite hall, green marble floor, white guard shirts.
set -uo pipefail
REPO="/Users/saf/dev/bench-runs/claude-fable-5-lobby"
OUT="public/assets/textures"

gen() { # name prompt
  local name="$1" prompt="$2"
  local f="$REPO/$OUT/$name.png"
  rm -f "$f"
  codex exec --skip-git-repo-check --sandbox workspace-write -C "$REPO" \
    "Generate an image: $prompt. Save it as $OUT/$name.png relative to the current directory. If you can only store it under ~/.codex/generated_images, print that exact file path clearly." \
    > "$REPO/scripts/codexlog_a3_$name.txt" 2>&1
  if [ ! -s "$f" ]; then
    local p=$(grep -oE '(/Users/[^ "]*\.codex/generated_images/[^ "]*\.png|~/.codex/generated_images/[^ "]*\.png)' "$REPO/scripts/codexlog_a3_$name.txt" | tail -1)
    p="${p/#\~/$HOME}"
    if [ -n "$p" ] && [ -s "$p" ]; then cp "$p" "$f"; fi
  fi
  if file "$f" 2>/dev/null | grep -qi png; then echo "OK   $name"; else echo "FAIL $name"; fi
}

gen granite_tile "one single large square tile of dark grey-green speckled salt-and-pepper granite filling the whole image, dense fine black, white and grey speckles on a dark green-grey base, a thin darker recessed seam border along all four edges of the tile, polished institutional stone, DARK overall tone, photorealistic, flat frontal view, even diffuse lighting, tiles seamlessly when repeated, 1024x1024"
gen floor_green "seamless tileable texture of polished dark green marble, deep forest-green stone with elegant pale white-green veining, large square floor tiles with thin seams, glossy reflective surface, dark overall, photorealistic, flat frontal view, even lighting, 1024x1024"
gen shirt_white "seamless tileable close-up texture of white cotton uniform shirt fabric with clearly visible woven thread structure and subtle soft wrinkles, slightly warm off-white, photorealistic, even lighting, 1024x1024"

echo done
