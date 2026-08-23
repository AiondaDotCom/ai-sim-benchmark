# Generated asset manifest

Every asset below was generated specifically for this run with the mandated
tools and is checked into the repository. The demo runs fully offline — no
network or API calls at runtime.

Reproduction scripts: `scripts/gen-textures.sh` (Codex CLI), `scripts/gen-sfx.sh`
(ElevenLabs, key via `ELEVENLABS_KEY` env var), `scripts/gen-music.sh` (Suno via
AceDataCloud, token via `SUNO_TOKEN` env var). No credentials are stored in the
repository.

## Textures — `public/assets/textures/` (15 files)

Tool: **Codex CLI image generation** (`codex exec … "Generate an image: <prompt>"`).

Five maps (`marble_column`, `wall_panel`, `coat_fabric`, `fabric_blue`,
`latex_black`) were regenerated in the B1 film-look pass with
stronger-structure prompts (script: `scripts/gen-textures-b1.sh`); the table
lists the prompts that produced the current files.

| File | Generation prompt |
|---|---|
| `marble_column.png` | seamless tileable texture of polished white-grey marble with STRONG dramatic dark grey diagonal veining, high contrast veins clearly visible from a distance, government building column cladding, photorealistic, even diffuse lighting, flat frontal view, 1024x1024 |
| `floor_dark.png` | seamless tileable texture of dark polished charcoal-grey stone floor tiles, large square tiles with thin seams, subtle reflective sheen, photorealistic, flat frontal view, even lighting, 1024x1024 |
| `substrate.png` | seamless tileable texture of rough grey concrete-like stone substrate, coarse chipped aggregate surface, matte, photorealistic, flat frontal view, even lighting, 1024x1024 |
| `ceiling_coffer.png` | texture of one dark bronze-green coffered ceiling panel: a deep recessed square coffer with stepped molding frame, institutional government building style, photorealistic, flat frontal view, even lighting, 1024x1024 |
| `brushed_metal.png` | seamless tileable texture of vertically brushed stainless steel, fine vertical grain, cool grey elevator door metal, photorealistic, even lighting, 1024x1024 |
| `coat_fabric.png` | seamless tileable close-up texture of coarse black wool coat fabric with a clearly visible diagonal twill weave, individual threads readable, dark charcoal with subtle grey highlights on the weave ridges, high detail, photorealistic, even lighting, 1024x1024 |
| `latex_black.png` | seamless tileable texture of glossy black latex with strong irregular specular highlight streaks and wrinkle sheen variation, wet-look shiny black material, high contrast highlights on black, photorealistic, 1024x1024 |
| `brass.png` | seamless tileable texture of polished brass metal, warm golden reflective surface with faint machining marks, photorealistic, even lighting, 1024x1024 |
| `fabric_blue.png` | seamless tileable close-up texture of light blue police uniform shirt fabric with clearly visible woven thread structure and subtle fabric wrinkles, high contrast weave detail, photorealistic, even lighting, 1024x1024 |
| `bullet_hole.png` | a single bullet impact crater in marble seen straight on, dark deep center hole with radial cracks and chipped bright edges, on a pure black background, centered, photorealistic, 1024x1024 |
| `crack_decal.png` | white radial impact crack pattern radiating from a central point, thin branching fracture lines, pure white lines on pure black background, centered, 1024x1024 |
| `wall_panel.png` | texture of a large stone wall made of big rectangular pale grey-green marble panels separated by thin dark recessed seams in a regular grid, each panel with clearly visible darker marble veining, institutional government lobby wall, photorealistic, flat frontal view, even lighting, high contrast, 1024x1024 |
| `granite_tile.png` (A3) | one single large square tile of dark grey-green speckled salt-and-pepper granite filling the whole image, dense fine black, white and grey speckles on a dark green-grey base, a thin darker recessed seam border along all four edges of the tile, polished institutional stone, DARK overall tone, photorealistic, flat frontal view, even diffuse lighting, tiles seamlessly when repeated, 1024x1024 |
| `floor_green.png` (A3) | seamless tileable texture of polished dark green marble, deep forest-green stone with elegant pale white-green veining, large square floor tiles with thin seams, glossy reflective surface, dark overall, photorealistic, flat frontal view, even lighting, 1024x1024 |
| `shirt_white.png` (A3) | seamless tileable close-up texture of white cotton uniform shirt fabric with clearly visible woven thread structure and subtle soft wrinkles, slightly warm off-white, photorealistic, even lighting, 1024x1024 |

(A `blood_stain.png` was generated for the A4 blood pass and removed again with
A6 — the demo contains no blood.)

A3 set change: the hall now uses `granite_tile.png` (columns, walls, elevator
surrounds) and `floor_green.png`; guards wear `shirt_white.png`. The earlier
`marble_column.png`, `wall_panel.png`, `floor_dark.png` and `fabric_blue.png`
remain in the repository as superseded generations (script:
`scripts/gen-textures-a3.sh`).

(Two tiny helper textures — a radial alpha falloff and a soft dust sprite — are
generated procedurally in code at runtime, `src/render/materials.ts`.)

## Sound effects — `public/assets/sfx/` (30 files)

Tool: **ElevenLabs sound-generation API** (`POST /v1/sound-generation`). Variants
per category are selected per event by the seeded RNG so repeats differ.

| File | Generation prompt |
|---|---|
| `pistol_0.mp3` | Single loud pistol gunshot, sharp powerful crack with a long echo in a huge marble hall |
| `pistol_1.mp3` | One handgun shot fired indoors, punchy bang with reverberant stone-hall echo tail |
| `pistol_2.mp3` | A single 9mm pistol gunshot, crisp snap and booming echo in a large empty lobby |
| `smg_0.mp3` | Short submachine gun burst of five rapid shots, automatic gunfire echoing in a big marble hall |
| `smg_1.mp3` | Rapid automatic gunfire burst, six rounds from a compact machine gun, indoor stone echo |
| `ricochet_0.mp3` | Bullet ricochet off polished stone, sharp metallic zing whining away |
| `ricochet_1.mp3` | A ricocheting bullet ping with a whistling deflection off marble |
| `marble_0.mp3` | Marble chunk shattering, stone chips cracking and breaking off a pillar, sharp stone debris |
| `marble_1.mp3` | Bullet impact into marble: stone cracking, chips of rock splintering and spraying |
| `marble_2.mp3` | Heavy stone surface bursting, palm-sized marble fragments breaking away with a crunch |
| `casing_0.mp3` | Single small brass shell casing falling onto a marble floor, bright metallic tink and bounce |
| `casing_1.mp3` | A brass bullet casing dropping and bouncing on polished stone with high-pitched metallic clicks |
| `casing_2.mp3` | Tiny metal shell case tinkling and rolling to rest on a hard stone floor |
| `debris_0.mp3` | Small stone debris fragments raining down and scattering across a stone floor |
| `debris_1.mp3` | Handful of rock chips and dust falling, clattering lightly on marble tiles |
| `footstep_0.mp3` | Single hard boot footstep on a polished marble floor with a slight echo |
| `footstep_1.mp3` | One firm leather boot heel step on stone floor, short clean echo |
| `beep.mp3` (B4, regenerated) | Walk-through metal-detector alarm. Built by `scripts/build-beep-b4.py` from the best of 7 ElevenLabs candidates (`scripts/gen-beep-b4.sh`): one clean generated beep laid out on an exact 3.4 Hz grid. Verified with `scripts/analyze-beep.py` — 7 pulses of 148 ms, gaps 294 ms ±0 ms, fundamental 1085 Hz (spread 3 Hz across pulses), 2.06 s. The raw takes had the right timbre but never a regular cadence (merged/dropped beeps, 5–11 beeps/s), so the rhythm is a deterministic edit of generated audio. Supersedes the earlier two-tone 2.1 kHz version. |
| `alarm.mp3` | Government building security alarm, urgent repeating electric bell ringing |
| `grunt_m0.mp3` | Short stylized male action-movie pain grunt, quick 'ugh', no gore |
| `grunt_m1.mp3` | A quick male fighter's grunt of impact, punchy 'hah' exhale, stylized |
| `grunt_m2.mp3` | Brief male cry of being hit, stylized action film 'agh', clean |
| `grunt_f0.mp3` | Short stylized female action-movie effort shout, sharp 'hyah', martial arts |
| `gundrop_0.mp3` | An empty metal handgun clattering onto a marble floor and sliding |
| `gundrop_1.mp3` | A heavy pistol dropped on polished stone, metallic clunk and skitter |
| `whoosh_0.mp3` | Fast martial arts whoosh with a sharp punch impact thud |
| `whoosh_1.mp3` | Quick spinning kick air whoosh followed by a solid impact hit |
| `elevator.mp3` | A soft elevator arrival chime ding, then smooth metal doors sliding open |
| `coat.mp3` | Heavy fabric whoosh of a long coat swinging quickly |
| `draw.mp3` | A handgun being drawn quickly from a leather holster with a metallic slide click |

## Music — `public/assets/music/` (6 files)

Tool: **Suno via AceDataCloud** (`POST /suno/audios`, instrumental). Two
generation calls, two variants each (all four source tracks checked in):

- `calm_v0.mp3`, `calm_v1.mp3` — prompt: *"Instrumental film-score cue for a
  tense action movie scene in a sterile marble government lobby. Slow, calm but
  ominous: quiet pulsing synth bass, sparse ticking percussion like a clock,
  cold ambient pads, subtle rising tension. Minimalist, cinematic, restrained,
  no melody climax, no drums drop. Steady tempo around 100 BPM, dark and
  suspenseful throughout."*
- `metal_v0.mp3`, `metal_v1.mp3` — prompt: *"Aggressive instrumental heavy
  metal / industrial action track for a stylized movie shootout: driving
  distorted electric guitars, hard pounding double-kick drums, relentless
  industrial groove, dark heavy riffs, sustained high intensity, cinematic
  aggression. No vocals. Around 120-140 BPM, starts hard immediately from the
  first second with a powerful impact."* (per requirement change A1)
- `music.mp3` — the final continuous track used at runtime, assembled with
  ffmpeg exclusively from the Suno material above: calm intro (calm_v0,
  0–12 s, ducked), hard cut into heavy metal (metal_v0) at **exactly 12.0 s**
  — the sim-time moment the shootout erupts — sustained to ~40.8 s, then
  crossfade to the calm outro (calm_v0 @60 s+) fading out by ~62 s.
  Measured drop: −20.3 dB mean before 12 s → −10.9 dB after (≈ +9.4 dB).
- `calm.response.json`, `metal.response.json` — raw API responses (provenance).

## Sizes

Textures ≈ 17 MB PNG, SFX ≈ 0.6 MB MP3, music ≈ 16 MB MP3 (sources + final).

## A11 — character look-dev textures (Codex CLI) + derived relief maps

All surface art below was generated with the Codex CLI image tool
(`scripts/gen-textures-a11.sh`), the mandated image source for this benchmark.
Prompts are reproduced verbatim; each is prefixed by the harness with
"Generate an image: " and suffixed with the save instruction.

| File | Used for | Codex prompt (verbatim) |
|---|---|---|
| `a11_coat_twill.png` | the man's coat | a seamless tileable flat-lit texture of black heavy cotton-gabardine trench coat fabric, fine diagonal twill weave clearly visible, subtle slate-grey sheen on the raised diagonal ribs, a few faint pressed fold creases, very slightly lighter worn abrasion along the weave, photographic material study, no seams at the tile edges, no logo, no text, top-down flat view |
| `a11_shirt_weave.png` | guard uniform shirts | a seamless tileable flat-lit texture of crisp white cotton uniform shirt fabric, fine plain-weave poplin thread grid clearly visible, faint cool-grey shadowing in the weave, a couple of soft pressed creases, clean and slightly starched, photographic material study, no seams at the tile edges, no logo, no text, top-down flat view |
| `a11_latex_sheen.png` | the woman's suit | a seamless tileable flat-lit texture of black latex, glossy rubber surface with fine stretch crease lines and soft elongated specular streaks, subtle grain, deep black with cool highlights, photographic material study, no seams at the tile edges, no text, top-down flat view |
| `a11_skin_pores.png` | skin (relief + roughness only) | a seamless tileable flat-lit texture of human facial skin, neutral light tan, very fine pore detail and subtle mottled tonal variation, slight redness variation, matte, no hair, no features, photographic material study, no seams at the tile edges, top-down flat view |
| `a11_tactical_weave.png` | soldier fatigues | a seamless tileable flat-lit texture of black tactical nylon cordura fabric, tight ballistic basket weave clearly visible, matte with a faint sheen on the weave crowns, slight dusty wear, photographic material study, no seams at the tile edges, no logo, no text, top-down flat view |
| `a11_boot_leather.png` | boots, gloves, black leather | a seamless tileable flat-lit texture of scuffed black leather combat boot hide, fine natural grain, soft creasing, subtle lighter scuffs and polish highlights, photographic material study, no seams at the tile edges, no text, top-down flat view |

Note on the skin sheet: it drives **relief and roughness only**, never albedo.
Multiplying a tan map by a tan base colour turned every face orange, so the
skin tone stays a material colour and the sheet supplies pore break-up.

### Derived normal + roughness maps (`*_n.png`, `*_r.png`)

These are **derived, not separately generated**. `scripts/derive-maps.py`
converts each albedo to greyscale, takes a wrap-around Sobel gradient into a
tangent-space normal map, and maps inverted contrast-stretched luminance into a
per-material roughness window. Both are approximations of relief inferred from
the albedo, not measured surface data. Per-material normal strength and
roughness range live in the `TARGETS` table in that script, tuned so granite
reads coarse and speckled, fabric reads woven, and polished stone takes relief
only in its veining. Regenerate with:

    ./.venv-analysis/bin/python scripts/derive-maps.py

Materials covered: granite_tile, floor_green, marble_column, wall_panel,
coat_fabric, shirt_white, latex_black, brushed_metal, brass, fabric_blue, and
all six A11 sheets above.


## A10 — English voice lines (ElevenLabs text-to-speech)

Generated by `scripts/gen-vo-a10.sh` (key from `$ELEVENLABS_KEY`, never
committed), model `eleven_multilingual_v2`, stability 0.42 / similarity 0.8 /
style 0.35. Files live in `public/assets/vo/` and are checked in, so the demo
stays offline.

**Copyright:** every line is original, generic security/police phrasing. No
dialogue, phrasing or character name from any film is used.

| File | Role / voice | Voice id | Beat | Exact TTS text |
|---|---|---|---|---|
| `vo_checkpoint_1.mp3` | mature guard — Eric | `cjVigY5qzO86Huf0OWal` | 8.25 s, in the detector frame | Sir, please remove any metal items and step back through. |
| `vo_checkpoint_2.mp3` | mature guard — Eric | `cjVigY5qzO86Huf0OWal` | 10.5 s, tensing before the reveal | Sir. I need you to step back. Now. |
| `vo_hands.mp3` | younger guard — Will | `bIHbv24MWmeRgasZH58o` | 12.0 s, the eruption | Hands where I can see them! |
| `vo_radio_backup.mp3` | guard on the radio — Eric | `cjVigY5qzO86Huf0OWal` | 13.55 s, on the alarm | Control, lobby post. Armed intruders in the main hall, requesting immediate backup. |
| `vo_go.mp3` | squad leader — Adam | `pNInz6obpgDQGcFmaJgB` | 15.2 s, storm-in | Go, go, go! |
| `vo_takecover.mp3` | squad leader — Adam | `pNInz6obpgDQGcFmaJgB` | 16.9 s | Take cover! |
| `vo_leftflank.mp3` | squad leader — Adam | `pNInz6obpgDQGcFmaJgB` | 18.5 s | Moving up, left flank! |
| `vo_reloading.mp3` | trooper — Harry | `SOYHLrjzK2X1ezoPC6cr` | 24.6 s, mid-fight | Reloading! |
| `vo_column.mp3` | trooper — Harry | `SOYHLrjzK2X1ezoPC6cr` | 27.6 s, mid-fight | He's behind the column! |
| `vo_lobbypost.mp3` | dispatcher on the radio — Daniel | `onwK4e9ZLuTAKqWW03F9` | 41.8 s, unanswered in the wind-down | Lobby post, report. Lobby post, do you copy? |

### Radio treatment

The two radio lines are post-processed in ffmpeg by the same script: 300 Hz
high-pass and 3 kHz low-pass, `acompressor` at 8:1 with a hard limiter for the
light distortion, and a short pink-noise squelch burst concatenated at each
end. Verified with `scripts/analyze-vo.py`: 90.4 % and 95.3 % of their energy
sits inside the 300–3000 Hz band, against 22–35 % for the plain lines.

### Mix

Lines are routed through the normal event → sound path, so they pitch and
stretch with the time scale like every other sound. They sit under the music
and gunfire; the two checkpoint lines duck the music (0.45 / 0.35) so the
dialogue stays intelligible, and the radio lines duck it slightly (0.2 / 0.3).


## B8 — substrate revealed behind the cladding (Codex CLI)

| File | Used for | Codex prompt (verbatim) |
|---|---|---|
| `b8_substrate.png` | the rough core exposed when granite cladding is shot off walls and columns | a seamless tileable flat-lit texture of the rough broken concrete backing wall revealed behind stripped-off stone cladding, pale chalky cool-grey cement with coarse exposed aggregate gravel, crumbly fractured surface, dry dusty matte finish with no polish and no shine at all, small pits and shallow chips, faint remnants of grey tile adhesive mortar in patches, construction substrate, photographic material study, no seams at the tile edges, no text, top-down flat view |

Generated by `scripts/gen-textures-b8.sh`. Normal and roughness maps are
derived from it by `scripts/derive-maps.py` at a high normal strength (3.0) and
a rough window (0.72–1.00), so the exposed core reads coarse and completely
matte against the polished granite. It replaces the earlier `substrate.png`,
which was a mid-grey aggregate that read as a darker granite rather than as a
different material.
