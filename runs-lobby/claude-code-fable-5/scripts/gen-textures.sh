#!/bin/bash
# Generates all textures via the Codex CLI image-generation tool.
# Usage: ./scripts/gen-textures.sh   (codex must be authenticated)
set -uo pipefail
REPO="/Users/saf/dev/bench-runs/claude-fable-5-lobby"
OUT="public/assets/textures"
mkdir -p "$REPO/$OUT"

gen() { # name prompt
  local name="$1" prompt="$2"
  local f="$REPO/$OUT/$name.png"
  if [ -s "$f" ] && file "$f" | grep -qi png; then echo "skip $name (exists)"; return; fi
  codex exec --skip-git-repo-check --sandbox workspace-write -C "$REPO" \
    "Generate an image: $prompt. Save it as $OUT/$name.png relative to the current directory. If you can only store it under ~/.codex/generated_images, print that exact file path clearly." \
    > "$REPO/scripts/codexlog_$name.txt" 2>&1
  if [ ! -s "$f" ]; then
    # fall back: copy the path codex printed from ~/.codex/generated_images
    local p=$(grep -oE '(/Users/[^ "]*\.codex/generated_images/[^ "]*\.png|~/.codex/generated_images/[^ "]*\.png)' "$REPO/scripts/codexlog_$name.txt" | tail -1)
    p="${p/#\~/$HOME}"
    if [ -n "$p" ] && [ -s "$p" ]; then cp "$p" "$f"; fi
  fi
  if file "$f" 2>/dev/null | grep -qi png; then echo "OK   $name"; else echo "FAIL $name"; fi
}

gen marble_column "seamless tileable texture of polished light-grey marble with subtle soft grey and faint warm veining, elegant government building stone cladding, photorealistic, even diffuse lighting, no shadows, flat frontal view, 1024x1024"
gen floor_dark "seamless tileable texture of dark polished charcoal-grey stone floor tiles, large square tiles with thin seams, subtle reflective sheen, photorealistic, flat frontal view, even lighting, 1024x1024"
gen substrate "seamless tileable texture of rough grey concrete-like stone substrate, coarse chipped aggregate surface, matte, photorealistic, flat frontal view, even lighting, 1024x1024"
gen ceiling_coffer "texture of one dark bronze-green coffered ceiling panel: a deep recessed square coffer with stepped molding frame, institutional government building style, photorealistic, flat frontal view, even lighting, 1024x1024"
gen brushed_metal "seamless tileable texture of vertically brushed stainless steel, fine vertical grain, cool grey elevator door metal, photorealistic, even lighting, 1024x1024"
gen coat_fabric "seamless tileable texture of matte black heavy wool coat fabric, fine twill weave, very dark, photorealistic, even lighting, 1024x1024"
gen latex_black "seamless tileable texture of glossy black latex material with subtle highlights, smooth reflective black surface, photorealistic, even lighting, 1024x1024"
gen brass "seamless tileable texture of polished brass metal, warm golden reflective surface with faint machining marks, photorealistic, even lighting, 1024x1024"
gen fabric_blue "seamless tileable texture of light blue uniform shirt fabric, fine cotton weave, photorealistic, even lighting, 1024x1024"
gen bullet_hole "a single bullet impact crater in marble seen straight on, dark deep center hole with radial cracks and chipped bright edges, on a pure black background, centered, photorealistic, 1024x1024"
gen crack_decal "white radial impact crack pattern radiating from a central point, thin branching fracture lines, pure white lines on pure black background, centered, 1024x1024"
gen wall_panel "seamless tileable texture of pale grey-green marble wall paneling with subtle veining, institutional lobby wall, photorealistic, flat frontal view, even lighting, 1024x1024"

echo done
