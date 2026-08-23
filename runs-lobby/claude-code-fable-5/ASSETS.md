# Generated asset manifest

Every asset below was generated specifically for this run with the mandated
tools and is checked into the repository. The demo runs fully offline — no
network or API calls at runtime.

Reproduction scripts: `scripts/gen-textures.sh` (Codex CLI), `scripts/gen-sfx.sh`
(ElevenLabs, key via `ELEVENLABS_KEY` env var), `scripts/gen-music.sh` (Suno via
AceDataCloud, token via `SUNO_TOKEN` env var). No credentials are stored in the
repository.

## Textures — `public/assets/textures/` (16 files)

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
| `blood_stain.png` (A4) | an irregular dark red blood splatter stain seen from directly above, deep desaturated dark crimson on a pure black background, organic splatter shape with a denser center and thin spray droplets at the edges, matte, stylized film prop blood, centered, 1024x1024 |

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
| `beep.mp3` | Loud electronic metal detector alert beep, two harsh insistent tones |
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
