#!/usr/bin/env python3
"""Regenerates ASSETS.md from the generator scripts, so that every prompt in the
manifest is the exact string that was sent to the tool."""
import hashlib
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()[:12]


def size(path):
    n = os.path.getsize(path)
    return f"{n/1024:.0f} KB" if n < 1024 * 1024 else f"{n/1024/1024:.1f} MB"


def dims(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                          "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", path],
                         capture_output=True, text=True).stdout.strip()
    return out or "-"


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip()
    try:
        return f"{float(out):.1f} s"
    except ValueError:
        return "-"


tex = re.findall(r'^tex (\w+) "(.*)"$', open("scripts/gen-textures.sh").read(), re.M)
sfx = re.findall(r'^sfx (\w+) ([\d.]+) ([\d.]+) "(.*)"$', open("scripts/gen-sfx.sh").read(), re.M)
music = re.findall(r'^gen "(\w+)" "(.*)"$', open("scripts/gen-music.sh").read(), re.M)

L = []
w = L.append
w("# ASSETS.md — generated-asset manifest\n")
w("Every asset in this repository was generated during this run by the tools listed")
w("below. Nothing was downloaded from an asset library, and the finished demo makes")
w("**no network requests at runtime** — everything is served from `assets/`.\n")
w("Two directories hold the same material:\n")
w("| directory | contents |")
w("| --- | --- |")
w("| `assets-source/` | the raw, untouched tool output, kept as evidence |")
w("| `assets/` | what the demo loads: the same files resized / re-encoded / edited for the web (see *Post-processing* at the end) |\n")
w(f"Totals: **{len(tex)} textures**, **{len(sfx)} sound effects**, "
  f"**{len(music)} music stems → 1 assembled score**.\n")

w("## Textures\n")
w("Tool: **OpenAI image generation via the Codex CLI** "
  "(`codex exec --sandbox workspace-write -C <repo> \"Generate an image: <prompt>. "
  "Save it as assets/textures/<name>.png relative to the current directory.\"`), "
  "driven by `scripts/gen-textures.sh`.\n")
w("| file | source | size | prompt |")
w("| --- | --- | --- | --- |")
for name, prompt in tex:
    for ext in ("jpg", "png"):
        p = f"assets/textures/{name}.{ext}"
        if os.path.exists(p):
            break
    src = f"assets-source/textures/{name}.png"
    w(f"| `{p}` ({dims(p)}) | `{src}` ({dims(src)}) | {size(p)} | {prompt} |")

w("\n## Sound effects\n")
w("Tool: **ElevenLabs sound-generation API** "
  "(`POST https://api.elevenlabs.io/v1/sound-generation`), driven by `scripts/gen-sfx.sh`. "
  "Several variants exist per category; the simulation picks one with its seeded RNG "
  "(see `src/audio/manifest.ts`) so repeats are not noticeable.\n")
w("| file | duration | prompt_influence | prompt |")
w("| --- | --- | --- | --- |")
for name, dur, infl, prompt in sfx:
    p = f"assets/sfx/{name}.mp3"
    w(f"| `{p}` | {dur} s requested / {duration(p)} actual | {infl} | {prompt} |")

w("\n## Music\n")
w("Tool: **Suno via the AceDataCloud REST API** "
  "(`POST https://api.acedata.cloud/suno/audios`, `instrumental: true`), driven by "
  "`scripts/gen-music.sh`. Three stems were generated; the score that plays is "
  "assembled from them with ffmpeg by `scripts/beat_cut.py` — the cut into the action "
  "stem is snapped to a detected onset so the drop lands exactly on the guard's lunge "
  "for his radio at story second 11.0.\n")
w("| stem | duration | prompt |")
w("| --- | --- | --- |")
for name, prompt in music:
    p = f"assets-source/music/{name}_0.mp3"
    if os.path.exists(p):
        w(f"| `{p}` | {duration(p)} | {prompt} |")
if os.path.exists("assets/music/score.json"):
    r = json.load(open("assets/music/score.json"))
    w("")
    w("Assembled score — `assets/music/score.mp3`:\n")
    w("| property | value |")
    w("| --- | --- |")
    w(f"| duration | {r['output']['duration_s']:.1f} s |")
    w(f"| calm opening | `calm_0.mp3` from {r['calm']['cut_in_s']} s, {r['calm']['length_s']} s long |")
    w(f"| the drop | hard cut to `action_0.mp3` at story second {r['output']['drop_at_s']} |")
    w(f"| action section | `action_0.mp3` from {r['action']['cut_in_s']} s, {r['action']['length_s']} s "
      f"(a whole number of beats at {r['action']['bpm']} BPM) |")
    w(f"| outro | crossfade into `outro_0.mp3` at story second {r['output']['outro_at_s']} |")

w("\n## Post-processing\n")
w("No generated material was replaced or hand-authored; the only changes are format "
  "conversions and edits made with the provided tooling:\n")
w("* **Textures** — `scripts/optimize-assets.sh` resizes the 1254x1254 originals to "
  "1024x1024 and re-encodes the tiling material maps as JPEG (decals stay PNG at 512) "
  "with ffmpeg. Originals are kept in `assets-source/textures/`.")
w("* **Music** — `scripts/beat_cut.py` trims and crossfades the three stems into one "
  "continuous score with ffmpeg, as the task explicitly permits. Stems are kept in "
  "`assets-source/music/`.")
w("* **Sound effects** — used exactly as generated. Pitch and time-stretch happen at "
  "runtime: every voice's `playbackRate` follows the simulation's time scale, so slow "
  "motion drops the pitch of gunfire, debris and the score together.")
w("\n## Checksums\n")
w("| file | sha256 (first 12) |")
w("| --- | --- |")
for d, _, files in sorted(os.walk("assets")):
    for f in sorted(files):
        p = os.path.join(d, f)
        w(f"| `{p}` | `{sha(p)}` |")

open("ASSETS.md", "w").write("\n".join(L) + "\n")
print("ASSETS.md written:", len(L), "lines")
