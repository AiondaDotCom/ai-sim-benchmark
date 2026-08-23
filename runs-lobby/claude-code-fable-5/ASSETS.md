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
| `bullet_hole.png` (retired, B13) | a single bullet impact crater in marble seen straight on, dark deep center hole with radial cracks and chipped bright edges, on a pure black background, centered, photorealistic, 1024x1024 |
| `crack_decal.png` (retired, B13) | white radial impact crack pattern radiating from a central point, thin branching fracture lines, pure white lines on pure black background, centered, 1024x1024 |
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

## Retired assets (B13 supplement)

`bullet_hole.png` and `crack_decal.png` are no longer loaded by the demo. They
backed the old impact decal: a ~22 cm quad carrying the painted hole albedo
behind a smooth radial alpha ramp. Two problems made them unusable. The ramp
held ~0.85 alpha out to 60% of the radius, so the texture's dark body covered a
large disc at near-full opacity with a perfectly circular outline — it read as
a sticker laid on the wall rather than damage in it. And the painted starburst
is near-white, so every mark carried a bright cartoon star.

Since B8 the cladding chunk is genuinely removed at the hit, so what belongs
there is a small pit in exposed broken masonry. That mark is now generated in
the shader (`Effects.makePockMat`) from the same value noise the cladding uses:
an irregular outline, an interior that deepens toward the centre, a thin pale
lip where the aggregate broke, and hairline cracks running out past the rim.
There is no texture to mismatch and the outline is never a circle.

The files are kept in `public/assets/textures/` as a record of what was
generated; nothing references them. The canvas-generated `radialAlphaTexture()`
helper went with them.

## B19 — tile detachment audio (ElevenLabs sound generation)

Generated by `scripts/gen-slab-b19.sh`; the key is read from `ELEVENLABS_KEY`
and never written into the repository. Prompts recorded verbatim:

| file | prompt |
|---|---|
| `slab_creak.mp3` | A heavy stone slab grinding and scraping as it separates from a wall, short low creak of rock on rock, then it lets go |
| `slab_crash_0.mp3` | A large heavy marble slab falling and smashing onto a polished stone floor in a huge echoing hall, deep booming impact followed by a short shattering tail of breaking stone |
| `slab_crash_1.mp3` (reworded) | A massive marble slab crashing onto a stone floor in a cavernous hall, very deep low-frequency boom with real weight, followed by a long tail of stone cracking and fragments skittering, heavy and slow |
| `slab_rubble.mp3` | A heavy stone slab landing on a pile of loose rubble and broken masonry, dull muffled crunch and clattering stone fragments in a large hall |

These are deliberately distinct from the existing `marble_*` and `debris_*`
chip sounds: a slab is an order of magnitude heavier, so it wants a deep impact
with a short shattering tail rather than a sharp crack. They are routed through
the same event-driven director as everything else and pitched with the time
scale, so in a slow-motion window the whole event stretches.

## A14 — green military reinforcements (Codex CLI image tool)

Generated by `scripts/gen-textures-a14.sh`; normal and roughness maps derived
from these albedos by `scripts/derive-maps.py` as usual. Prompts verbatim:

| file | prompt |
|---|---|
| `a14_field_green.png` | a seamless tileable flat-lit texture of olive drab field-uniform fabric, mid-tone army green cotton ripstop with the fine square ripstop grid clearly visible, matte finish, faint lighter wear along the weave crowns, a couple of soft pressed creases, photographic material study, no seams at the tile edges, no logo, no text, no camouflage pattern, top-down flat view |
| `a14_webbing_green.png` | a seamless tileable flat-lit texture of dark olive green military webbing and nylon load-bearing gear fabric, tight heavy basket weave clearly visible, matte with a faint sheen on the weave crowns, noticeably darker and coarser than a fatigue shirt, slight dusty wear, photographic material study, no seams at the tile edges, no logo, no text, top-down flat view |

Value contrast, measured on the albedos (mean luminance):

| surface | mean luma |
|---|---|
| `a14_field_green` (fatigues) | 0.326 |
| `granite_tile` (the hall) | 0.267 |
| `a14_webbing_green` (vest, webbing, helmet) | 0.253 |

The set is dark teal-green granite under a green grade, so an olive uniform
risks disappearing into it. The fatigues therefore sit clearly lighter than the
granite (1.34x before the granite's own 0.91 material tint, so about 1.4x in
the render), and the gear sits darker than the fatigues (0.78x), so the figures
separate from the wall by brightness even where the hue agrees and the webbing
reads as gear rather than as more uniform. The A9 rim light is applied to all
three of the new materials, doing part of that separation work in the wides.

The previous dark cordura map (`a11_tactical_weave`) is no longer used for the
soldiers; it stays in the repository as a record of what was generated.

## A15 — the squad leader's command (ElevenLabs TTS)

Generated by `scripts/gen-vo-a15.sh`; the key is read from `ELEVENLABS_KEY` and
never written into the repository.

| file | voice | line |
|---|---|---|
| `vo_freeze.mp3` | Adam (the squad-leader voice already used in A10) | `Freeze!` |

Shouted and hard, with a light drive and a large-room echo so it carries in the
hall. It ducks the music at 0.6 — harder than any other line — because the held
beat that follows it is the point, and the command has to land clean.

A single generic police/military command word is standard vocabulary rather
than distinctive dialogue; the copyright guardrails on this run are about the
latter, and no other line is taken from any source.

## B25 — the squad rush (ElevenLabs sound generation)

Generated by `scripts/gen-boots-b25.sh`; the key is read from `ELEVENLABS_KEY`
and never written into the repository. Prompts verbatim:

| file | prompt |
|---|---|
| `boot_run_0.mp3` (reworded) | One combat boot striking polished marble, sharp leathery slap with a crisp high transient and grit under the sole, moderate low thump, bright echo in a large stone hall |
| `boot_run_1.mp3` (reworded) | A single army boot footfall on hard polished stone, bright rubber-and-leather sole slap with a fast sharp attack and clear high-frequency detail, light low end, ringing reflection in a big marble lobby |
| `boot_run_2.mp3` | One heavy combat boot step landing hard on smooth marble, dense leathery impact with grit under the sole and a long tail of hall reverb |
| `boot_plant.mp3` | A heavy combat boot planting hard and skidding briefly to a stop on polished marble, sharp scuff and a solid weighted stop, echoing in a large stone hall |
| `gear_rattle.mp3` | Military webbing and a slung weapon rattling as a loaded soldier runs, nylon straps, buckles and metal clinking softly, close and dry |
| `boot_walk_0.mp3` | A single hard-soled boot step walking on polished marble in a huge empty lobby, crisp heel strike with a long bright echo |
| `boot_walk_1.mp3` | One hard leather-soled shoe footfall on polished stone in a vast hall, sharp heel click and a long reverberant tail |

Each soldier's steps fire on HIS OWN stride cycle rather than from a shared
loop, and the sample and pitch are chosen from his index, so the rush is a
many-footed clatter of men out of step rather than one loud person. Everything
carries a world position and is attenuated against the lens, so the squad grows
louder as it comes toward camera; the clatter stops the moment the last man
sets into cover, which is what hands into the A15 standoff.

`boot_walk_*` are the protagonists' calm-phase steps, regenerated harder and
wetter for the space. They are written alongside `footstep_*` rather than over
them, so the originals stay as a record of what was generated.

## Reworded prompts, and why (measurement, not preference)

Three samples came back not matching their brief. This was established by
measuring them (`scripts/analyze-slab-b19.py`) rather than by opinion, because
the defects are the kind a quick listen can miss on good speakers and cannot
miss on bad ones.

| sample | measured | problem |
|---|---|---|
| `slab_crash_0` | 26.2% of energy below 120 Hz, -20 dB in 0.64 s | correct: deep, with a tail |
| `slab_crash_1` | **1.2%** below 120 Hz, -20 dB in **0.05 s** | a thin short click, not a heavy slab |
| `boot_run_0` | **90.3%** below 120 Hz, centroid **47.6 Hz** | a pure low thud, no sole slap |
| `boot_run_1` | **98.5%** below 120 Hz, centroid **45.6 Hz** | the same, more so |
| `boot_run_2` | 46.8% below 120 Hz, centroid 151.9 Hz | correct |
| `boot_plant` | centroid 2376 Hz | correct: a bright scuff |
| `gear_rattle` | centroid 649 Hz | correct |

The two crash takes ARE genuinely distinct (waveform correlation -0.001, 66.8
percentage points of band difference), so the concern that they might be a
duplicated write was unfounded — the problem is that the second one has no
weight. Alternating them reads as an inconsistency rather than as variation,
which defeats the point of having two takes at all. The three boot variants are
likewise distinct from one another; two of them simply have no top edge, and on
small speakers would be close to inaudible.

The reworded prompts ask for the missing half explicitly: low-frequency weight
and a long tail for the slab, the transient and high-frequency detail for the
boots, with the low end deliberately played down.

Regenerating just those, without spending the rest again:

    ELEVENLABS_KEY=... FORCE=1 FORCE_ONLY="slab_crash_1" ./scripts/gen-slab-b19.sh
    ELEVENLABS_KEY=... FORCE=1 FORCE_ONLY="boot_run_0 boot_run_1" ./scripts/gen-boots-b25.sh

The file names are unchanged, so nothing needs rewiring. Re-run
`scripts/analyze-slab-b19.py` afterwards to confirm the new takes land where
they should.

## Third pass: generate candidates and pick by measurement

Two rounds of rewording established that the generator is inconsistent run to
run rather than merely mis-prompted, so a single take is a coin flip:

| sample | first take | after rewording | verdict |
|---|---|---|---|
| `slab_crash_1` | 1.2% below 120 Hz, no weight | **97.7%**, tail gone (-33.4 dB against `slab_crash_0`'s -3.1) | overcorrected |
| `boot_run_0` | 90.3% below 120 Hz | **93.3%** | barely moved |
| `boot_run_1` | 98.5% below 120 Hz | **15.5%** | good, keep |

Asking for "very deep low-frequency boom with real weight" produced exactly
that and nothing else — the cracking and skittering the same prompt asked for
did not survive. Asking twice for a bright sole slap produced a sub-bass thud
both times.

`scripts/gen-best-take.sh` therefore generates N candidates per sample,
measures each, and installs the one closest to a reference sample that is
already correct — `slab_crash_0` for the crash, `boot_run_2` for the boot —
measured in the same run so the numbers do not depend on the method. Candidates
are kept in `scripts/.takes/` so a different one can be installed by hand if
the numbers and the ear disagree.

    ELEVENLABS_KEY=... CANDIDATES=3 ./scripts/gen-best-take.sh
    ELEVENLABS_KEY=... ONLY="hit_body_0 hit_body_1 hit_body_2" ./scripts/gen-best-take.sh

Two metrics, both ffmpeg-only:

  low%   share of energy below 120 Hz. Wrong in both directions so far: above
         about 90% a cue is effectively silent on a phone speaker, which is the
         device most of the audience will use; near 1% it has no weight.
  tail   level of the back half of the file against the front, in dB. Near 0
         rings on; -30 dies at once. This is the property that vanished from
         `slab_crash_1` while its low end was being fixed, and it is weighted
         heavily in the crash's score for that reason. A footstep does not need
         one, so it is weighted zero for the boot.

`scripts/analyze-slab-b19.py` gives a fuller picture (band histogram, spectral
centroid, waveform correlation between takes) but needs numpy and a decoded
WAV, so it will not run on a machine that only has the system python.
`gen-best-take.sh` needs only ffmpeg, ffprobe, awk and sed — the same tools the
other generation scripts already require — and reproduces the low% figure
exactly.

Third-pass prompts:

| file | prompt |
|---|---|
| `slab_crash_1.mp3` | Broken marble fragments cracking, splintering and skittering across a hard stone floor in a huge echoing hall, bright sharp rock detail and scattered debris ringing out and rolling to a stop, a moderate low thud underneath from the initial impact, long ringing decay |
| `boot_run_0.mp3` | A hard boot sole slapping down on polished marble, thin bright leather snap with sharp treble detail and grit under the sole, quick ringing echo in a large stone hall, crisp and trebly, almost no bass |

## `slab_crash_1.mp3` — derived, not generated (disclosed)

Four rounds of generation failed the same way, so this file ships as a
**deterministic edit of generated audio**, exactly as `beep.mp3` does and for
the same kind of reason. `scripts/derive-slab-variant.sh` produces it from
`slab_crash_0.mp3`; re-running the script reproduces it byte for byte, and the
source is generated material. Nothing is hand-authored.

Why generation was abandoned for this one sample. Every phrasing that named the
object — slab, crash, impact, boom — anchored the model on the low end and
dropped the debris entirely:

| attempt | wording aimed at | energy below 120 Hz | tail |
|---|---|---|---|
| 1 | a heavy crash with a shattering tail | 1.2% | — |
| 2 | very deep low-frequency boom with weight | 97.7% | -33.4 dB |
| 3 | as 2, best of 3 candidates | 75.9% (range 75.9–93.3) | -27.8 dB |
| — | `slab_crash_0`, the take that is correct | **49.0%** | **-3.1 dB** |

The purpose of a second variant is only that a repeat not be audible. A take
that differs in *weight* does not serve that — it reads as an inconsistency
rather than as variation — so a fourth wording would have had to get lucky
rather than be right.

The derived variant measured against the same references:

| | energy below 120 Hz | tail | duration | correlation with `slab_crash_0` |
|---|---|---|---|---|
| `slab_crash_0` | 49.0% | -3.1 dB | 2.56 s | 1.000 |
| **derived `slab_crash_1`** | **42.7%** | **-1.9 dB** | **2.70 s** | **+0.082** |
| rejected generated take | 75.9% | -27.8 dB | 2.56 s | +0.116 |

The last column is the one that matters for honesty: the derived variant is as
decorrelated from `slab_crash_0` as an independently generated take is
(+0.082 against +0.116), so it is a genuinely different sound rather than the
same one played back differently — while matching it in weight and keeping the
tail. Spectral centroid 2821 Hz against the source's 2272 Hz and the rejected
take's 71.7 Hz, which is what a sound that is all boom and no debris looks like.

The edit: pitch down 7% via resampling, so every resonance in the stone moves
rather than being filtered; two tempo stages for a net length change; a shelf
tilt toward the fragment detail and away from the boom; and a different room
reflection so the tail decays on its own pattern.

`scripts/measure-audio.sh` reproduces every number above and needs only ffmpeg,
ffprobe, awk and sed — unlike `analyze-slab-b19.py`, which needs numpy and so
cannot run on the machine that holds the API key.

## B27 — the shouted command, regenerated and normalised

The first take read as somebody saying the word at conversational level.
Measured against its own neighbours it was the QUIETEST line in the film:

| line | peak | rms | crest | >1.5 kHz |
|---|---|---|---|---|
| `vo_freeze` (first take) | -11.5 dB | -26.8 dB | 15.3 dB | 26.3% |
| `vo_go` | -7.3 dB | -22.4 dB | 15.1 dB | 14.5% |
| `vo_takecover` | -9.5 dB | -24.1 dB | 14.6 dB | 20.0% |

Regenerated by `scripts/gen-vo-b27.sh`, which makes three candidates and scores
them on the three measures that separate a shout from a spoken word: peak
level, crest factor (a barked order is dense and compressed, so a LOW crest;
a conversational read is peaky), and the share of energy above 1.5 kHz (strain,
edge and consonant snap all sit high). Voice settings carry the delivery —
stability dropped to 0.12 so the read is not flattened toward neutral, style
0.95 — then drive and a short bright slapback for the hall.

The second round is where the interesting failure was. The chosen take came
back genuinely more shouted — crest 15.3 -> 12.5 dB and high-frequency share
26.3% -> 46.8% — and yet 2 dB QUIETER than the take it replaced, at -13.6 dBFS
peak. Delivery and level were coupled to the same lucky draw. The script now
peak-normalises the chosen take to -1 dBFS before installing it, so the cue
gain in the mix controls balance rather than compensating for whatever the
generator happened to return.

Final, against the same neighbours:

| line | peak | rms | crest | >1.5 kHz |
|---|---|---|---|---|
| **`vo_freeze`** | **-1.4 dB** | **-13.9 dB** | **12.5 dB** | **45.7%** |
| `vo_go` | -7.3 dB | -22.4 dB | 15.1 dB | 14.5% |
| `vo_takecover` | -9.5 dB | -24.1 dB | 14.6 dB | 20.0% |
| `vo_hands` | -10.9 dB | -26.3 dB | 15.4 dB | 18.6% |

5.9 to 9.5 dB louder at peak and 8.5 to 12.4 dB louder in average level than
every other line, the densest crest of the four, and more than double their
high-frequency share. In the mix it additionally ducks the music at 0.88 and
clears the effects bed under itself, routed around the bus it is ducking so it
does not attenuate itself.

## B28 — the blow landing (ElevenLabs sound generation)

Generated by `scripts/gen-best-take.sh`, three candidates each, scored against
`boot_plant` — the closest thing already in the set to a hard dry close impact.
Prompts verbatim:

| file | prompt |
|---|---|
| `hit_body_0.mp3` | A hard punch landing on a torso, dull heavy thud with a leathery slap on top, close and dry, thick and percussive, no music, no reverb |
| `hit_body_1.mp3` | A heavy body blow connecting, deep muffled impact into a padded chest with a sharp leather crack over it, tight and close, dry room, no tail |
| `hit_body_2.mp3` | A boot striking a body hard, blunt low thump with a slapping crack of cloth and leather, dry and immediate, close-miked, no reverb |

Chosen takes, and what the rejected ones looked like:

| sample | installed | low% | tail | rejected siblings |
|---|---|---|---|---|
| `hit_body_0` | c2 | 20.0% | -43.7 dB | 97.7% / 43.7% |
| `hit_body_1` | c2 | 12.0% | -33.2 dB | 91.2% / 91.2% |
| `hit_body_2` | c1 | 31.6% | -27.0 dB | 97.7% / 37.2% |

For `hit_body_1` two of the three takes came back at 91% sub-120 Hz and would
have been dull thuds with no slap at all, which is the case for candidate
selection in one line.

`ONLY` is a space-separated word list. It was originally compared as a single
string against each name, so `ONLY="a b c"` matched nothing and skipped every
sample while printing "skip ... / ALL DONE" — a switch that silently did
nothing and reported success. `OUT_DIR` and `TAKES_DIR` now allow a dry run
that writes nowhere near the real assets.

## A17 — industrial intro (Suno via AceDataCloud)

The opening section before the drop was a soft ambient tense pulse — too gentle
and too generic for two armed people walking into a building they intend to
take apart. Replaced with a cold industrial build made of struck metal.

Generated by `scripts/gen-music-a17.sh`, token read from `SUNO_TOKEN` and never
written into the repository. Prompt verbatim:

> Cold industrial instrumental intro built entirely from struck metal. Heavy
> anvil-like hammer blows on steel, scraped and dragged metal, a deep
> mechanical rumble underneath, a slow menacing pulse with a lot of space
> between the hits, each hit ringing out and decaying in a huge empty stone
> hall. Sparse and patient rather than busy, an atmosphere of something
> enormous and inevitable moving into place. No melody, no vocals, no drum kit,
> no guitars. Steady pulse around 130 BPM so it shares a tempo with the heavy
> industrial metal that follows.

The 130 BPM is deliberate: the action section is 120-140 BPM, so a shared pulse
makes the drop read as the same music turning violent rather than as a cut
between two unrelated pieces.

### How it is assembled, and why only the intro is rebuilt

`scripts/build-music-a17.sh <source-basename> [offset]`. **Only the first 12
seconds are rebuilt.** Everything from the drop onward comes from
`tail_from12s.mp3`, cut once from the previous `music.mp3` at exactly 12.0 s
and reused verbatim, so the heavy-metal section and the calm outro cannot
drift and the drop cannot move. Re-running is idempotent — the tail is never
re-encoded again. `music_calmintro.mp3` is the previous full track, kept for
provenance and as the fallback.

Two things the build does on purpose:

- **Level-matches the intro to -20.9 dB**, which is what the calm intro
  measured across 0-12 s. If the intro level changes, the size of the drop
  changes with it and the checkpoint dialogue stops cutting through.
- **Fades in over 1.5 s and does NOT fade out.** The drop has to read as a
  jump; a fade at 12.0 s would turn it into a crossfade.

It is a single filtered pass rather than encode-then-concat. Concatenating two
MP3s with `-c copy` joins on a frame boundary and gains a whole frame, which
put the drop 24 ms late and made the file 61.824 s instead of 61.800. Small,
but the drop is the one thing that must not move.

### Chosen take

Two variants were generated (`industrial_v0.mp3`, `industrial_v1.mp3`, both
checked in with `industrial.response.json` for provenance); the operator chose
**v1**, and `music.mp3` is assembled from it with the intro-only rebuild
described above — tail reused verbatim from 12.0 s.

Measured on the shipped assembly:

| | |
|---|---|
| total duration | **61.800 s** — unchanged, so the drop cannot have moved |
| 3 s before the drop | -21.6 dB |
| 3 s after the drop | -11.4 dB |
| drop | **+10.2 dB** (was +9.1 with the calm intro) |
| 200 ms either side of 12.0 s | -19.3 -> -11.5 dB, a **+7.8 dB jump** |
| music at 7.5-9.0 s (beep + first line) | -21.3 dB |
| music at 10.2-11.7 s (second line) | -20.2 dB |

The drop is slightly stronger than it was with the calm intro rather than
weaker, and the checkpoint dialogue is not masked.

### Handover, verified by the build script

Measured on a dry run with a stand-in source before any material existed, which
is what proved the mechanics:

| | |
|---|---|
| total duration | 61.800 s (was 61.800) |
| 3 s before the drop | -20.3 dB |
| 3 s after the drop | -11.4 dB |
| drop | **+8.9 dB** (was +9.1) |
| 200 ms either side of 12.0 s | -20.5 -> -11.5 dB, a **+9.0 dB jump** |
| music at 7.5-9.0 s (beep + first line) | -20.6 dB |
| music at 10.2-11.7 s (second line) | -20.4 dB |

The last two are the masking check: the music around the checkpoint sits at the
same level it did before, and the VO cues duck it further on top of that.
