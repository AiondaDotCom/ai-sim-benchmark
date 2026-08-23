#!/bin/bash
# B1 regeneration pass: stronger-structure replacements for five maps.
# Usage: ./scripts/gen-textures-b1.sh   (codex must be authenticated)
set -uo pipefail
REPO="/Users/saf/dev/bench-runs/claude-fable-5-lobby"
OUT="public/assets/textures"

gen() { # name prompt
  local name="$1" prompt="$2"
  local f="$REPO/$OUT/$name.png"
  rm -f "$f"
  codex exec --skip-git-repo-check --sandbox workspace-write -C "$REPO" \
    "Generate an image: $prompt. Save it as $OUT/$name.png relative to the current directory. If you can only store it under ~/.codex/generated_images, print that exact file path clearly." \
    > "$REPO/scripts/codexlog_b1_$name.txt" 2>&1
  if [ ! -s "$f" ]; then
    local p=$(grep -oE '(/Users/[^ "]*\.codex/generated_images/[^ "]*\.png|~/.codex/generated_images/[^ "]*\.png)' "$REPO/scripts/codexlog_b1_$name.txt" | tail -1)
    p="${p/#\~/$HOME}"
    if [ -n "$p" ] && [ -s "$p" ]; then cp "$p" "$f"; fi
  fi
  if file "$f" 2>/dev/null | grep -qi png; then echo "OK   $name"; else echo "FAIL $name"; fi
}

gen marble_column "seamless tileable texture of polished white-grey marble with STRONG dramatic dark grey diagonal veining, high contrast veins clearly visible from a distance, government building column cladding, photorealistic, even diffuse lighting, flat frontal view, 1024x1024"
gen wall_panel "texture of a large stone wall made of big rectangular pale grey-green marble panels separated by thin dark recessed seams in a regular grid, each panel with clearly visible darker marble veining, institutional government lobby wall, photorealistic, flat frontal view, even lighting, high contrast, 1024x1024"
gen coat_fabric "seamless tileable close-up texture of coarse black wool coat fabric with a clearly visible diagonal twill weave, individual threads readable, dark charcoal with subtle grey highlights on the weave ridges, high detail, photorealistic, even lighting, 1024x1024"
gen fabric_blue "seamless tileable close-up texture of light blue police uniform shirt fabric with clearly visible woven thread structure and subtle fabric wrinkles, high contrast weave detail, photorealistic, even lighting, 1024x1024"
gen latex_black "seamless tileable texture of glossy black latex with strong irregular specular highlight streaks and wrinkle sheen variation, wet-look shiny black material, high contrast highlights on black, photorealistic, 1024x1024"

echo done
