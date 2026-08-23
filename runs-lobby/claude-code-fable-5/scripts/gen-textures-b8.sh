#!/bin/bash
# B8: the substrate revealed when granite cladding is shot off the walls and
# columns. It has to read as a different MATERIAL from the polished granite,
# not a lighter version of it.
set -o pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
gen() { # name prompt
  local name="$1" prompt="$2" f="$DIR/public/assets/textures/$name.png"
  if [ -s "$f" ]; then echo "skip $name"; return; fi
  codex exec --skip-git-repo-check --sandbox workspace-write -C "$DIR" \
    "Generate an image: $prompt. Save it as public/assets/textures/$name.png relative to the current directory. If you can only store it under ~/.codex/generated_images, print that exact file path clearly." \
    < /dev/null > "$DIR/scripts/codexlog_b8_$name.txt" 2>&1
  if [ ! -s "$f" ]; then
    local q
    q=$(grep -oE '(/Users/[^ "]*\.codex/generated_images/[^ "]*\.png|~/\.codex/generated_images/[^ "]*\.png)' "$DIR/scripts/codexlog_b8_$name.txt" | tail -1)
    q="${q/#\~/$HOME}"
    [ -n "$q" ] && [ -s "$q" ] && cp "$q" "$f"
  fi
  if [ -s "$f" ]; then echo "OK   $name"; else echo "FAIL $name"; fi
}
gen b8_substrate "a seamless tileable flat-lit texture of the rough broken concrete backing wall revealed behind stripped-off stone cladding, pale chalky cool-grey cement with coarse exposed aggregate gravel, crumbly fractured surface, dry dusty matte finish with no polish and no shine at all, small pits and shallow chips, faint remnants of grey tile adhesive mortar in patches, construction substrate, photographic material study, no seams at the tile edges, no text, top-down flat view"
echo "ALL DONE"
