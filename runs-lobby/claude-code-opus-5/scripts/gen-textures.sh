#!/usr/bin/env bash
# Generates every texture / decal with the Codex CLI image generation tool.
# Idempotent: existing valid PNGs are skipped.
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
mkdir -p assets/textures

tex () {
  local name="$1"; shift
  local prompt="$1"; shift
  local out="assets/textures/${name}.png"
  if [ -s "$out" ] && file "$out" | grep -qi 'PNG image'; then echo "skip $name"; return; fi
  echo "=== generating $name ==="
  local before
  before=$(ls -1t "$HOME/.codex/generated_images" 2>/dev/null | head -1 || true)
  codex exec --skip-git-repo-check --sandbox workspace-write -C "$REPO" \
    "Generate an image: ${prompt}. Save it as assets/textures/${name}.png relative to the current directory." \
    2>&1 | tail -5
  if [ ! -s "$out" ]; then
    # allowed fallback: copy the raw output codex printed under ~/.codex/generated_images
    local newest
    newest=$(ls -1t "$HOME/.codex/generated_images" 2>/dev/null | head -1 || true)
    if [ -n "$newest" ] && [ "$newest" != "$before" ]; then
      cp "$HOME/.codex/generated_images/$newest" "$out"
      echo "copied fallback $newest -> $out"
    fi
  fi
  if [ -s "$out" ] && file "$out" | grep -qi 'PNG image'; then
    echo "OK $name $(file -b "$out")"
  else
    echo "FAILED $name"
  fi
}

tex marble_albedo "a seamless tileable square texture of polished light grey Carrara marble slab, subtle soft grey veining, very light warm-grey base, photographic, flat even studio lighting, no shadows, no objects, top-down orthographic, high resolution material scan, edges must tile seamlessly"
tex marble_dark_floor "a seamless tileable square texture of dark charcoal grey polished stone floor made of large square tiles with thin darker grout lines, glossy mirror-like sheen, subtle grey mineral speckle, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly"
tex substrate "a seamless tileable square texture of rough raw grey concrete and coarse crushed-stone aggregate, unpolished porous stone core, gritty and pitted, matte, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly"
tex plaster_ceiling "a seamless tileable square texture of pale off-white institutional plaster with a very fine sandy grain, matte, subtle tonal variation, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly"
tex brushed_metal "a seamless tileable square texture of brushed stainless steel with fine horizontal grain, cool neutral grey, subtle anisotropic sheen, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly"
tex brass "a seamless tileable square texture of polished brass cartridge metal, warm golden yellow, faint circular machining marks and micro scratches, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly"
tex coat_wool "a seamless tileable square texture of heavy black wool gabardine coat fabric, very dark, fine diagonal twill weave visible up close, matte, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly"
tex latex_black "a seamless tileable square texture of glossy black latex or patent leather, smooth with soft broad specular highlights and faint stretch creases, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly"
tex uniform_blue "a seamless tileable square texture of light powder-blue security guard uniform shirt fabric, fine cotton poplin weave, matte, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly"
tex combat_fabric "a seamless tileable square texture of very dark charcoal tactical nylon combat gear fabric, tight cordura ripstop grid weave, matte, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly"
tex bullet_hole "a single bullet impact crater in stone, centred, on a pure solid black background: a bright pale grey ragged circular crater with a dark centre and short radial cracks and pale dust spray around it, greyscale, sharp, high contrast against the pure black background, square image"
tex crack_decal "a network of thin pale grey cracks and fractures radiating from the centre, on a pure solid black background, greyscale, sharp thin bright lines only, nothing else, square image"
tex dust_puff "a single soft round puff of pale grey stone dust and smoke, centred, fading smoothly to a pure solid black background at the edges, greyscale, soft focus, square image"
tex spark "a small bright white-hot spark flash with a soft warm orange glow, centred, on a pure solid black background, radial star burst, square image"
tex glass_dirt "a seamless tileable square texture of clean architectural glass with extremely faint smudges and dust, almost entirely uniform very light grey, subtle streaks, flat even lighting, top-down orthographic, tiles seamlessly"
tex marble_veneer_edge "a seamless tileable square texture of a broken marble slab cross-section: a thin polished light grey marble layer on top of coarse dark grey rough stone substrate, jagged fracture line between them, photographic material scan, flat even lighting, tiles seamlessly horizontally"
echo "=== texture generation done ==="
ls -la assets/textures
