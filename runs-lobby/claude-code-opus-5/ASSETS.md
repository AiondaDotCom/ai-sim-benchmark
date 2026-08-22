# ASSETS.md — generated-asset manifest

Every asset in this repository was generated during this run by the tools listed
below. Nothing was downloaded from an asset library, and the finished demo makes
**no network requests at runtime** — everything is served from `assets/`.

Two directories hold the same material:

| directory | contents |
| --- | --- |
| `assets-source/` | the raw, untouched tool output, kept as evidence |
| `assets/` | what the demo loads: the same files resized / re-encoded / edited for the web (see *Post-processing* at the end) |

Totals: **16 textures**, **43 sound effects**, **3 music stems → 1 assembled score**.

## Textures

Tool: **OpenAI image generation via the Codex CLI** (`codex exec --sandbox workspace-write -C <repo> "Generate an image: <prompt>. Save it as assets/textures/<name>.png relative to the current directory."`), driven by `scripts/gen-textures.sh`.

| file | source | size | prompt |
| --- | --- | --- | --- |
| `assets/textures/marble_albedo.jpg` (1024x1024) | `assets-source/textures/marble_albedo.png` (1254x1254) | 51 KB | a seamless tileable square texture of polished light grey Carrara marble slab, subtle soft grey veining, very light warm-grey base, photographic, flat even studio lighting, no shadows, no objects, top-down orthographic, high resolution material scan, edges must tile seamlessly |
| `assets/textures/marble_dark_floor.jpg` (1024x1024) | `assets-source/textures/marble_dark_floor.png` (1254x1254) | 190 KB | a seamless tileable square texture of dark charcoal grey polished stone floor made of large square tiles with thin darker grout lines, glossy mirror-like sheen, subtle grey mineral speckle, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly |
| `assets/textures/substrate.jpg` (1024x1024) | `assets-source/textures/substrate.png` (1254x1254) | 454 KB | a seamless tileable square texture of rough raw grey concrete and coarse crushed-stone aggregate, unpolished porous stone core, gritty and pitted, matte, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly |
| `assets/textures/plaster_ceiling.jpg` (1024x1024) | `assets-source/textures/plaster_ceiling.png` (1254x1254) | 184 KB | a seamless tileable square texture of pale off-white institutional plaster with a very fine sandy grain, matte, subtle tonal variation, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly |
| `assets/textures/brushed_metal.jpg` (1024x1024) | `assets-source/textures/brushed_metal.png` (1254x1254) | 212 KB | a seamless tileable square texture of brushed stainless steel with fine horizontal grain, cool neutral grey, subtle anisotropic sheen, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly |
| `assets/textures/brass.jpg` (1024x1024) | `assets-source/textures/brass.png` (1254x1254) | 163 KB | a seamless tileable square texture of polished brass cartridge metal, warm golden yellow, faint circular machining marks and micro scratches, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly |
| `assets/textures/coat_wool.jpg` (1024x1024) | `assets-source/textures/coat_wool.png` (1254x1254) | 172 KB | a seamless tileable square texture of heavy black wool gabardine coat fabric, very dark, fine diagonal twill weave visible up close, matte, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly |
| `assets/textures/latex_black.jpg` (1024x1024) | `assets-source/textures/latex_black.png` (1254x1254) | 50 KB | a seamless tileable square texture of glossy black latex or patent leather, smooth with soft broad specular highlights and faint stretch creases, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly |
| `assets/textures/uniform_blue.jpg` (1024x1024) | `assets-source/textures/uniform_blue.png` (1254x1254) | 392 KB | a seamless tileable square texture of light powder-blue security guard uniform shirt fabric, fine cotton poplin weave, matte, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly |
| `assets/textures/combat_fabric.jpg` (1024x1024) | `assets-source/textures/combat_fabric.png` (1254x1254) | 218 KB | a seamless tileable square texture of very dark charcoal tactical nylon combat gear fabric, tight cordura ripstop grid weave, matte, photographic material scan, flat even lighting, top-down orthographic, tiles seamlessly |
| `assets/textures/bullet_hole.png` (512x512) | `assets-source/textures/bullet_hole.png` (1254x1254) | 51 KB | a single bullet impact crater in stone, centred, on a pure solid black background: a bright pale grey ragged circular crater with a dark centre and short radial cracks and pale dust spray around it, greyscale, sharp, high contrast against the pure black background, square image |
| `assets/textures/crack_decal.png` (512x512) | `assets-source/textures/crack_decal.png` (1254x1254) | 50 KB | a network of thin pale grey cracks and fractures radiating from the centre, on a pure solid black background, greyscale, sharp thin bright lines only, nothing else, square image |
| `assets/textures/dust_puff.png` (512x512) | `assets-source/textures/dust_puff.png` (1254x1254) | 207 KB | a single soft round puff of pale grey stone dust and smoke, centred, fading smoothly to a pure solid black background at the edges, greyscale, soft focus, square image |
| `assets/textures/spark.png` (512x512) | `assets-source/textures/spark.png` (1254x1254) | 99 KB | a small bright white-hot spark flash with a soft warm orange glow, centred, on a pure solid black background, radial star burst, square image |
| `assets/textures/glass_dirt.jpg` (1024x1024) | `assets-source/textures/glass_dirt.png` (1254x1254) | 27 KB | a seamless tileable square texture of clean architectural glass with extremely faint smudges and dust, almost entirely uniform very light grey, subtle streaks, flat even lighting, top-down orthographic, tiles seamlessly |
| `assets/textures/marble_veneer_edge.jpg` (1024x1024) | `assets-source/textures/marble_veneer_edge.png` (1254x1254) | 320 KB | a seamless tileable square texture of a broken marble slab cross-section: a thin polished light grey marble layer on top of coarse dark grey rough stone substrate, jagged fracture line between them, photographic material scan, flat even lighting, tiles seamlessly horizontally |

## Sound effects

Tool: **ElevenLabs sound-generation API** (`POST https://api.elevenlabs.io/v1/sound-generation`), driven by `scripts/gen-sfx.sh`. Several variants exist per category; the simulation picks one with its seeded RNG (see `src/audio/manifest.ts`) so repeats are not noticeable.

| file | duration | prompt_influence | prompt |
| --- | --- | --- | --- |
| `assets/sfx/pistol_a.mp3` | 1.0 s requested / 1.0 s actual | 0.5 | Single dry gunshot from a 9mm handgun fired inside a huge empty marble hall, sharp crack with a long hard slapback echo, no music |
| `assets/sfx/pistol_b.mp3` | 1.0 s requested / 1.0 s actual | 0.5 | Single handgun gunshot, punchy low crack, fired in a cavernous stone lobby, metallic tail and reverb, no music |
| `assets/sfx/pistol_c.mp3` | 1.0 s requested / 1.0 s actual | 0.5 | One loud pistol shot, bright snappy transient, big marble room reverb decay, cinematic action movie gunshot, no music |
| `assets/sfx/smg_a.mp3` | 1.6 s requested / 1.6 s actual | 0.5 | Short rapid submachine gun burst, six rounds, dry mechanical rattle, huge marble hall echo, cinematic, no music |
| `assets/sfx/smg_b.mp3` | 1.6 s requested / 1.6 s actual | 0.5 | Automatic submachine gun burst of about eight rounds, fast bolt clatter, hard concrete reverb, no music |
| `assets/sfx/smg_c.mp3` | 1.9 s requested / 1.9 s actual | 0.5 | Sustained machine pistol burst, twelve rapid rounds, aggressive, echoing government building lobby, no music |
| `assets/sfx/ricochet_a.mp3` | 0.9 s requested / 0.9 s actual | 0.5 | Bullet ricochet whine off polished stone, sharp zing with high whistling tail, no music |
| `assets/sfx/ricochet_b.mp3` | 0.9 s requested / 0.9 s actual | 0.5 | Ricochet off marble, metallic pitched whizz spinning away, cinematic, no music |
| `assets/sfx/ricochet_c.mp3` | 0.9 s requested / 0.9 s actual | 0.5 | Bullet deflection ping off hard stone with descending whistle, no music |
| `assets/sfx/marble_chip_a.mp3` | 1.2 s requested / 1.2 s actual | 0.5 | Bullet hits polished marble column, sharp crack and a burst of stone chips and dust spraying, no music |
| `assets/sfx/marble_chip_b.mp3` | 1.2 s requested / 1.2 s actual | 0.5 | Impact into stone wall, dry crack, small marble fragments spitting out and rattling on the floor, no music |
| `assets/sfx/marble_chip_c.mp3` | 1.2 s requested / 1.2 s actual | 0.5 | Bullet smacking into a stone pillar, gritty crunch with dust puff and tiny falling shards, no music |
| `assets/sfx/marble_shatter_a.mp3` | 2.0 s requested / 2.0 s actual | 0.45 | Large slab of polished marble veneer shattering off a column and crashing onto a stone floor, heavy stone breaking, no music |
| `assets/sfx/marble_shatter_b.mp3` | 2.0 s requested / 2.0 s actual | 0.45 | Big chunks of stone cladding breaking apart and smashing down on hard tile, rubble collapse, no music |
| `assets/sfx/debris_fall_a.mp3` | 1.6 s requested / 1.6 s actual | 0.45 | Loose stone rubble and gravel tumbling and settling onto a hard polished floor, no music |
| `assets/sfx/debris_fall_b.mp3` | 1.6 s requested / 1.6 s actual | 0.45 | Small stone fragments and grit skittering across a marble floor and coming to rest, no music |
| `assets/sfx/casing_a.mp3` | 0.9 s requested / 0.9 s actual | 0.6 | A single brass shell casing bouncing on a polished marble floor, bright metallic tink tink ting, close up, no music |
| `assets/sfx/casing_b.mp3` | 0.9 s requested / 0.9 s actual | 0.6 | Empty bullet casing hitting hard stone and spinning to rest, high bright metallic ringing, no music |
| `assets/sfx/casing_c.mp3` | 0.9 s requested / 0.9 s actual | 0.6 | Brass cartridge dropping and rattling on tile, delicate metallic bounces, no music |
| `assets/sfx/casing_d.mp3` | 1.4 s requested / 1.4 s actual | 0.6 | A shower of many brass shell casings raining onto a marble floor, bright metallic clicks and rolls, no music |
| `assets/sfx/casing_spin.mp3` | 1.8 s requested / 1.8 s actual | 0.5 | A single brass shell casing spinning to rest on a stone floor, fine metallic wobble slowing to silence, close up, no music |
| `assets/sfx/step_a.mp3` | 0.8 s requested / 0.8 s actual | 0.5 | Single hard leather boot footstep on a polished marble floor in a huge empty hall, sharp click with long echo, no music |
| `assets/sfx/step_b.mp3` | 0.8 s requested / 0.8 s actual | 0.5 | One heavy boot step on stone tile, echoing in a vast empty lobby, no music |
| `assets/sfx/step_c.mp3` | 0.8 s requested / 0.8 s actual | 0.5 | Footstep of a heeled boot on marble, crisp tap with cathedral reverb, no music |
| `assets/sfx/coat_swish_a.mp3` | 1.0 s requested / 1.0 s actual | 0.4 | Heavy long leather coat swinging and snapping through the air, fabric whoosh, no music |
| `assets/sfx/coat_swish_b.mp3` | 1.0 s requested / 1.0 s actual | 0.4 | Long trench coat flaring open with a sharp fabric whip, no music |
| `assets/sfx/gundrop_a.mp3` | 1.3 s requested / 1.3 s actual | 0.5 | An empty handgun dropped and clattering across a hard marble floor, metal and polymer skittering, no music |
| `assets/sfx/gundrop_b.mp3` | 1.3 s requested / 1.3 s actual | 0.5 | Pistol discarded, hitting stone tile and sliding away with a metallic scrape, no music |
| `assets/sfx/draw_a.mp3` | 0.8 s requested / 0.8 s actual | 0.5 | Fast handgun draw from a leather holster with a crisp metallic slide rack, no music |
| `assets/sfx/draw_b.mp3` | 0.8 s requested / 0.8 s actual | 0.5 | Weapon being pulled from under a coat, fabric rustle and gun metal click, no music |
| `assets/sfx/punch_a.mp3` | 0.8 s requested / 0.8 s actual | 0.5 | Cinematic martial arts punch impact on a body, deep thud with a whip crack, movie foley, no music |
| `assets/sfx/punch_b.mp3` | 0.8 s requested / 0.8 s actual | 0.5 | Hard fight impact hit, blunt body thump with a snap, action movie style, no music |
| `assets/sfx/kick_a.mp3` | 0.9 s requested / 0.9 s actual | 0.5 | Powerful flying kick connecting with a body, heavy whoosh then blunt impact, action movie foley, no music |
| `assets/sfx/hit_a.mp3` | 0.9 s requested / 0.9 s actual | 0.45 | Short male grunt of being knocked down, sharp exhale, action movie stunt reaction, no music |
| `assets/sfx/hit_b.mp3` | 0.9 s requested / 0.9 s actual | 0.45 | Brief male cry of surprise as he is knocked backwards, clipped shout, no music |
| `assets/sfx/hit_c.mp3` | 0.9 s requested / 0.9 s actual | 0.45 | Short pained male grunt and gasp, stunt fall reaction, no music |
| `assets/sfx/hit_d.mp3` | 1.1 s requested / 1.1 s actual | 0.45 | Male body dropping heavily onto a hard floor with a muffled grunt and gear rattle, no music |
| `assets/sfx/detector_beep.mp3` | 1.2 s requested / 1.2 s actual | 0.6 | Walk-through airport metal detector alarm beeping loudly, harsh electronic tone, three quick beeps, no music |
| `assets/sfx/alarm_loop.mp3` | 4.0 s requested / 4.0 s actual | 0.5 | Building security alarm klaxon looping, harsh two-tone electronic wail echoing in a large hall, no music |
| `assets/sfx/door_push.mp3` | 1.2 s requested / 1.2 s actual | 0.45 | Heavy glass and metal lobby door being pushed open, hinge groan and a soft air rush, no music |
| `assets/sfx/elev_ding.mp3` | 1.4 s requested / 1.4 s actual | 0.5 | Elevator arrival chime, single bright bell ding in a marble lobby with echo, no music |
| `assets/sfx/elev_doors.mp3` | 2.6 s requested / 2.6 s actual | 0.45 | Metal elevator doors sliding open then closing with a soft mechanical hum and a final thud, no music |
| `assets/sfx/hall_tone.mp3` | 8.0 s requested / 8.0 s actual | 0.35 | Room tone of a vast empty marble government building lobby, faint air conditioning hum, distant hollow reverberant emptiness, no music |

## Music

Tool: **Suno via the AceDataCloud REST API** (`POST https://api.acedata.cloud/suno/audios`, `instrumental: true`), driven by `scripts/gen-music.sh`. Three stems were generated; the score that plays is assembled from them with ffmpeg by `scripts/beat_cut.py` — the cut into the action stem is snapped to a detected onset so the drop lands exactly on the guard's lunge for his radio at story second 11.0.

| stem | duration | prompt |
| --- | --- | --- |
| `assets-source/music/calm_0.mp3` | 240.0 s | Cinematic action-film score, sterile marble lobby, calm but tense slow build: cold minimal pulsing synth bass on a steady heartbeat, ticking industrial percussion, distant metallic reverb, dark minor key, restrained menace, no drums yet, feels like the seconds before violence. 90s techno-noir sci-fi thriller. Instrumental. |
| `assets-source/music/action_0.mp3` | 240.0 s | Relentless industrial techno action score for a cinematic slow-motion gunfight: hard driving four-on-the-floor kick, distorted breakbeat, aggressive detuned synth bass stabs, screaming metallic guitar textures, orchestral low brass hits, huge reverb, 135 BPM, dark minor key, unstoppable propulsive momentum, 90s techno-noir sci-fi thriller shootout. Instrumental. |
| `assets-source/music/outro_0.mp3` | 239.0 s | Cinematic ambient outro after a battle: sparse dark drone, slow decaying piano notes, distant sub bass, settling dust and cold emptiness, minor key, calm resolution, no drums, elegiac and still, 90s techno-noir sci-fi thriller. Instrumental. |

Assembled score — `assets/music/score.mp3`:

| property | value |
| --- | --- |
| duration | 50.1 s |
| calm opening | `calm_0.mp3` from 35.09 s, 11.0 s long |
| the drop | hard cut to `action_0.mp3` at story second 11.0 |
| action section | `action_0.mp3` from 60.26 s, 22.57 s (a whole number of beats at 98.36 BPM) |
| outro | crossfade into `outro_0.mp3` at story second 33.57 |

## Post-processing

No generated material was replaced or hand-authored; the only changes are format conversions and edits made with the provided tooling:

* **Textures** — `scripts/optimize-assets.sh` resizes the 1254x1254 originals to 1024x1024 and re-encodes the tiling material maps as JPEG (decals stay PNG at 512) with ffmpeg. Originals are kept in `assets-source/textures/`.
* **Music** — `scripts/beat_cut.py` trims and crossfades the three stems into one continuous score with ffmpeg, as the task explicitly permits. Stems are kept in `assets-source/music/`.
* **Sound effects** — used exactly as generated. Pitch and time-stretch happen at runtime: every voice's `playbackRate` follows the simulation's time scale, so slow motion drops the pitch of gunfire, debris and the score together.

## Checksums

| file | sha256 (first 12) |
| --- | --- |
| `assets/music/score.json` | `c424042af6c0` |
| `assets/music/score.mp3` | `74dc88c27b68` |
| `assets/sfx/alarm_loop.mp3` | `0974a8dd2939` |
| `assets/sfx/casing_a.mp3` | `65fb6b32f3c5` |
| `assets/sfx/casing_b.mp3` | `a8dd5a2524d8` |
| `assets/sfx/casing_c.mp3` | `f3e44dc5afd7` |
| `assets/sfx/casing_d.mp3` | `aebce5074bd9` |
| `assets/sfx/casing_spin.mp3` | `bbcb7f0476bd` |
| `assets/sfx/coat_swish_a.mp3` | `0c2aae3e84f1` |
| `assets/sfx/coat_swish_b.mp3` | `366d689e1fb9` |
| `assets/sfx/debris_fall_a.mp3` | `ba997aa4d2f2` |
| `assets/sfx/debris_fall_b.mp3` | `612fd9865886` |
| `assets/sfx/detector_beep.mp3` | `79f156ccb53c` |
| `assets/sfx/door_push.mp3` | `79de2e8e3beb` |
| `assets/sfx/draw_a.mp3` | `0f6240ab870f` |
| `assets/sfx/draw_b.mp3` | `e317c9a9289f` |
| `assets/sfx/elev_ding.mp3` | `1b4069b76a53` |
| `assets/sfx/elev_doors.mp3` | `ce7159ecd4c0` |
| `assets/sfx/gundrop_a.mp3` | `ed255d0232b8` |
| `assets/sfx/gundrop_b.mp3` | `56ce092a3bcb` |
| `assets/sfx/hall_tone.mp3` | `26d20b9549a2` |
| `assets/sfx/hit_a.mp3` | `ef57bebc3b8c` |
| `assets/sfx/hit_b.mp3` | `c5bb5462ced6` |
| `assets/sfx/hit_c.mp3` | `965f60170619` |
| `assets/sfx/hit_d.mp3` | `61e63df8f3ba` |
| `assets/sfx/kick_a.mp3` | `851e03be929d` |
| `assets/sfx/marble_chip_a.mp3` | `4a3439ce51cc` |
| `assets/sfx/marble_chip_b.mp3` | `4ada6b8968d1` |
| `assets/sfx/marble_chip_c.mp3` | `b73ee99bed8b` |
| `assets/sfx/marble_shatter_a.mp3` | `3d6f082588f0` |
| `assets/sfx/marble_shatter_b.mp3` | `f8b1ccfd4368` |
| `assets/sfx/pistol_a.mp3` | `450c73eb2b6a` |
| `assets/sfx/pistol_b.mp3` | `64a011d52518` |
| `assets/sfx/pistol_c.mp3` | `47ce02b375b7` |
| `assets/sfx/punch_a.mp3` | `a69d50609283` |
| `assets/sfx/punch_b.mp3` | `f8fc618056f8` |
| `assets/sfx/ricochet_a.mp3` | `6fdff709f802` |
| `assets/sfx/ricochet_b.mp3` | `2d4c21e1c304` |
| `assets/sfx/ricochet_c.mp3` | `67154752a2bf` |
| `assets/sfx/smg_a.mp3` | `1507c381d221` |
| `assets/sfx/smg_b.mp3` | `0903417867dc` |
| `assets/sfx/smg_c.mp3` | `3b352a2da8c7` |
| `assets/sfx/step_a.mp3` | `05cbcdbe0cb8` |
| `assets/sfx/step_b.mp3` | `7e2a2f6f126f` |
| `assets/sfx/step_c.mp3` | `64685f72190b` |
| `assets/textures/brass.jpg` | `29ef02cb465a` |
| `assets/textures/brushed_metal.jpg` | `e40ccdbca558` |
| `assets/textures/bullet_hole.png` | `8adf4a58d8e0` |
| `assets/textures/coat_wool.jpg` | `745d314322b6` |
| `assets/textures/combat_fabric.jpg` | `3b63bf756f63` |
| `assets/textures/crack_decal.png` | `866ad7b35db4` |
| `assets/textures/dust_puff.png` | `61653806b0f6` |
| `assets/textures/glass_dirt.jpg` | `0dd912340290` |
| `assets/textures/latex_black.jpg` | `608943237e7c` |
| `assets/textures/marble_albedo.jpg` | `23e31ba192f3` |
| `assets/textures/marble_dark_floor.jpg` | `d48cbf90c473` |
| `assets/textures/marble_veneer_edge.jpg` | `824a89495429` |
| `assets/textures/plaster_ceiling.jpg` | `c885fc044418` |
| `assets/textures/spark.png` | `bd923403f6d0` |
| `assets/textures/substrate.jpg` | `dd82c87f8731` |
| `assets/textures/uniform_blue.jpg` | `a15df59f0476` |
