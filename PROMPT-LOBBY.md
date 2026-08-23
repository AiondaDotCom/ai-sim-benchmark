# Lobby benchmark prompt ("Game 2")

Second benchmark scene: a stylized homage to the classic lobby-shootout sequence,
this time as a **multimodal production task** — the agents must orchestrate code,
generated textures, sound effects, and music. The protocol from
[README.md](README.md) applies unchanged (empty repo, prompt verbatim, strongest
configuration, interventions logged in [INTERVENTIONS.md](INTERVENTIONS.md)).

Status: **FROZEN** as of 2026-08-22 with the start of the first run
(Claude Code — Opus 5). The task text below must be used verbatim; only the
working-directory path in the first line is adapted per run. The per-harness
tool provisioning (how ElevenLabs/music/image/Blender are technically exposed)
is environment, not task text, and may differ between harnesses.

---

Your working directory for this task is `<PATH>` — an empty, freshly
initialized git repository. Do ALL work inside that directory only. Do not
modify anything outside it. Never reference any path outside it (including
/tmp) in any command — scratch files belong inside the working directory.

Complete the following task:

Build a fully autonomous 3D action-scene demo in this empty repository: a stylized homage to the classic "lobby shootout" scene — two protagonists in long dark coats storm a marble government-building lobby defended by uniformed security guards.

## Scene reference — build it to look like this

Recreate the look and choreography of the famous film sequence as closely as the medium allows. This section is the visual script; follow it beat by beat.

**The set.** A monumental government-building lobby with a high coffered ceiling. Two parallel rows of massive square columns (roughly 1.2 m thick, 3–4 per side) run the length of the hall, clad in polished light-grey marble with subtle veining. The floor is dark polished stone in large tiles, reflective enough to mirror the columns. At the near end: the entrance with dark-framed glass doors and, just inside, a security checkpoint — a walk-through metal-detector frame beside a guard desk with an X-ray belt. At the far end: an elevator bank with brushed-metal doors. Lighting is cool institutional daylight with a subtle desaturated green-tinted grade over the whole image — the scene's signature look. The mood before the action: sterile, quiet, echoing.

**The protagonists.** A man: ankle-length black coat that swings with every turn, narrow dark sunglasses, short dark hair, black boots; beneath the coat, a strapped arsenal of holstered handguns and compact submachine guns. A woman: glossy black skin-tight outfit, black boots, dark sunglasses, dark hair slicked back; equally armed. Both move with unhurried, perfectly synchronized calm — until the first shot, after which they move like dancers: economical, acrobatic, never surprised.

**The defenders.** Phase one: classic lobby security — light-blue uniform shirts, dark peaked caps and ties, holstered pistols. Phase two: a reinforcement squad of soldiers in dark combat gear with helmets, vests, and submachine guns that storms in once the alarm is raised. All hits are stylized: guards crumple, slide down columns, or drop where they stand — no blood, no gore.

**The choreography, beat by beat (target ≈ 45–60 s total):**

1. **Entrance (calm).** The man pushes through the doors and walks the centerline toward the checkpoint, coat swaying, footsteps echoing in the empty hall; the woman follows a few paces behind. The music is a calm, tense pulse.
2. **The checkpoint.** He steps through the metal detector — a loud beep. A guard steps up and asks him to remove any metal objects. In answer he opens his coat, revealing the arsenal. One frozen beat of silence.
3. **Eruption.** The guard lunges for his radio; the music drops exactly on this moment. The man drops the nearest guards with fast close-quarters strikes; the woman spins in with a flying kick at the second guard; the alarm sounds, and the shootout begins.
4. **The main shootout.** The reinforcement squad pours in and takes cover behind the columns; the pair advance down the hall between the column rows in a synchronized ballet. Mandatory set pieces, each with at least one sustained slow-motion moment with the camera orbiting the action while dust and shell casings hang in the air:
   - The man cartwheels sideways across the open floor while firing a pistol in each hand; casings rain onto the marble and bounce with bright metallic clicks.
   - The woman runs several steps up and along a wall/column face while firing mid-run, then lands in a crouch and continues firing.
   - Both repeatedly use columns as cover, spinning around them; emptied guns are discarded (clattering across the floor and staying there) and fresh ones drawn from under the coat.
   - Soldiers answer with sustained automatic bursts that chew the marble: the polished veneer shatters off in palm-sized chips, dust bursts out of every impact, and craters expose the rough grey substrate beneath. Wall panels break apart the same way. Every crater, chip, and fragment persists.
   - Hit soldiers fall stylized — some slide down the column they were leaning on.
5. **Wind-down.** The last soldier drops. Sudden near-silence: settling debris, one final shell casing spinning to rest, dust drifting through the light. The camera pans slowly across the wreckage — chipped columns stripped to substrate, wall sections torn open, the floor covered in fragments and hundreds of casings.
6. **Exit.** The two holster their weapons and walk calmly side by side to the elevator; the doors open, they step in, the doors close. A final wide shot holds on the wrecked lobby. The demo may then loop.

## Technical requirements

Destruction must work like in the film: marble pillars AND wall panels chip and break apart under fire — the marble veneer shatters off in chunks revealing the rough substrate beneath; impact craters and bullet holes persist; broken fragments fall, bounce audibly, and remain on the floor together with the spent shell casings, so that the final shot shows a visibly wrecked lobby. Nothing despawns during the sequence.

Use TypeScript, Vite, and Three.js. Do not use a prebuilt physics engine. All geometry and animation must be created within this run: either procedurally in code, or modeled/rigged/animated with the provided Blender tool and exported to glTF (check the exports into the repository). Importing ready-made models, animation data, or asset-library content — in Blender or anywhere else — is forbidden.

MANDATORY generated assets — the following tools are provided and their use is required:

- Generate all textures (marble, substrate, brass, coat fabric, bullet-hole and crack decals, …) with the provided image-generation tool.
- Generate all sound effects with the provided ElevenLabs tool: gunfire, ricochets, shattering marble, falling shell casings and debris, footsteps, the metal-detector beep, the alarm, and stylized action-movie hit reactions (short grunts/cries — no gore). Provide several variants per category and vary them (seeded) so repetitions are not noticeable.
- Generate one continuous background-music track with the provided music tool whose dramaturgy follows the scene: calm tense opening, a drop synchronized with the outbreak of the shootout, sustained intensity, calm outro.
- Check every generated asset into the repository. The finished demo must run fully offline — NO network or API calls at runtime.
- Maintain `ASSETS.md`: a manifest listing every generated file with the exact generation prompt used and the tool that produced it.

Slow motion must be implemented as a proper time scale on a fixed-timestep simulation — audio is pitched/stretched accordingly — not by slowing the render loop. Keep simulation/choreography (timeline), rendering, audio, and bootstrap code cleanly separated.

The tone stays stylized PG-13 action film: no blood, no gore, no lingering suffering.

IMPORTANT — the demo is FULLY AUTONOMOUS with NO user interaction and NO visible UI controls at all; it starts on page load and the camera is choreographed automatically, including the slow-motion orbits, keeping the action well framed at all times. Configuration (seed, camera timing, volume, time scale) may only exist via URL query parameters or code constants — never as on-screen UI. The page must never flash dark before the scene paints. (Browsers block autoplaying audio until a user gesture; starting the audio context on the first click/keypress while the visual demo already runs is acceptable and does not count as UI.)

The seed controls procedural variation (debris, particle detail, sound-variant selection); the choreography itself is fixed and deterministic.

Add meaningful automated tests for at least: deterministic replay (identical seed ⇒ identical simulation state hash after N steps), time-scale correctness (at 0.1× time scale the simulation advances exactly 1/10 as far per real second), hit-event/audio pairing (every guard-down event triggers exactly one hit-reaction sound), no friendly fire (the protagonists' shots never hit each other), and destruction persistence (the damage map never reverts; the debris count grows monotonically).

Also add an executable `start.sh` in the repository root: check that Node.js and npm are available and print a helpful message if not; run `npm install` if node_modules is missing; start the dev server, plus a `--preview` mode for the production build; print the local URL. chmod +x it and mention it in the README ("Quick start: ./start.sh").

Install the required dependencies, run the tests and the production build, and independently fix any errors you encounter. Verify your own rendered result in the browser (screenshots at several points of the sequence) before reporting. Finally document the architecture, the timeline/choreography system, the asset pipeline, how to run the application, and all known limitations in the README.

When you are finished, report: the final test results (pass/fail counts), the production build result, an asset inventory summary (file counts per category), a short summary of the architecture, and any known limitations.

---

## Amendments (A) — requirement changes after the freeze

Applied per the protocol in [INTERVENTIONS.md](INTERVENTIONS.md): sent to all
Scene-2 runs, appended verbatim after the frozen task text, not scored.

**A1 (2026-08-23):** During the main shootout the background music must be
heavy metal or a comparably aggressive hard style (driving distorted guitars,
hard drums — e.g. metal, industrial, aggressive rock); the calm tense opening
and the calm outro remain as specified, and the drop into the aggressive
section stays synchronized with the outbreak of the shootout.

**A2 (2026-08-23):** Character models (protagonists and defenders) must go
visibly beyond box primitives: smoothed silhouettes and recognizable anatomy —
a head with sunglasses/cap, articulated hands, a coat that drapes with folds —
at least the low-poly character quality of an early-2000s game. Procedural
generation and the Blender route are both acceptable ways to get there; the
no-imported-assets rule is unchanged.

**A3 (2026-08-23):** Set and wardrobe corrections derived from a frame-by-frame
review of the original film scene (the review method is documented in
INTERVENTIONS.md; the reference frames themselves stay private and are not part
of this repository). These override the corresponding details of the frozen
task text:

- Columns, wall cladding, and the elevator surround are **dark grey-green
  speckled granite** in large square tiles with visible recessed seams —
  replacing "polished light-grey marble with subtle veining". Under fire the
  dark granite bursts in showers of **pale chips and dust**, so damage reads
  high-contrast light-on-dark; craters expose a pale rough substrate.
- The floor is polished **dark green-veined marble** in large tiles, strongly
  reflective.
- The security checkpoint (desk, X-ray belt) is dark wood / black metal and
  sits in a dim zone of the hall.
- Phase-one guards wear **white shirts** with dark-green trousers, dark tie,
  and peaked cap — replacing "light-blue uniform shirts".
- The grade is a strong dark teal-green across the whole image with deep
  shadows; during the destruction phase pale dust visibly hangs and drifts in
  the air.

**A4 (2026-08-23):** The "no blood" constraint is lifted: stylized blood at the
level of the film is now permitted — brief red impact sprays on hits and blood
staining on uniforms of downed defenders. Still no gore: no dismemberment, no
wound close-ups, no lingering suffering. (Published demo videos will be marked
as sensitive content where platforms require it.)

**A6 (2026-08-23):** Revokes A4 — the demo is blood-free again (no impact
sprays, no stains), restoring the frozen prompt's original no-blood rule, so
published clips need no sensitive-content marking.

**A7 (2026-08-23):** Max-Payne-style ballistics detail package: bullets are
real modeled geometry (ogive nose, copper/brass body, spinning around the
flight axis) that clearly reads in slow motion beneath the tracer glow; one
bullet-cam set piece where the camera travels with the single bullet that
drops the last soldier (extreme slow motion, air-wake trailing, brief stylized
impact, cut wide — violence limits apply); and a casing slow-motion drop beat
followed close-up from ejection to floor with its bounce sounds pitched into
the slow motion, one clink per visible contact.

**A9 (2026-08-23):** Visual fidelity pass toward a game-industry look, in
descending order of impact per effort: a real post-processing stack via
EffectComposer (selective bloom on emissives, SSAO, time-scale-aware motion
blur, vignette, film grain, the teal grade moved into a grading pass);
normal/roughness maps derived procedurally from the existing albedo textures so
granite, marble, fabric and metal stop reading flat; a rim/back light that
separates the near-black protagonists from the dark hall; and animation quality
through easing, anticipation, overshoot and secondary motion instead of linear
interpolation. Performance target 60 fps stays binding, with a `?quality=low`
path.

**A10 (2026-08-23):** English voice acting via ElevenLabs text-to-speech, with
distinct voices per role (checkpoint guards, radio dispatcher, squad leader),
radio lines band-passed into walkie-talkie sound. All lines must be original
generic security/police phrasing — never dialogue from the film. Lines are
routed through the audio director as timed events so they pitch with the time
scale, mixed under music and gunfire as texture, with the music ducking under
the checkpoint line. Every line and voice id documented in ASSETS.md.

**A11 (2026-08-23):** Character look-dev loop against the "Playmobil figures"
verdict: build a dev-only turntable mode that renders each character type
isolated under neutral studio light from fixed angles; diagnose the toy-look
tells (oversized round head, no neck, mitten hands, constant-thickness limbs,
missing garment geometry such as collars, lapels, cuffs, belts and boot soles,
flat single-colour materials, featureless faces); generate fitting UV-mapped
texture sheets per garment with the Codex CLI image tool (the mandated image
source — normal/roughness maps may be derived from them by script); then
iterate in closed rounds — render, inspect, list what still reads as a toy,
fix, re-render — at least three rounds per character type, including a
solid-black silhouette check. Finally re-verify the characters in the scene
under the teal grade at 60 fps.

**A5 (2026-08-23):** Ballistics special-effects package. Bullets must be
modeled as real visible projectiles, not hitscan-only effects:

- Every shot spawns a visible tracer projectile with a hot glowing head and a
  light trail that subtly illuminates nearby surfaces (game-style tracer glow);
  in slow motion the projectile's flight is clearly readable through the room.
- At least one slow-motion insert shows a bullet visibly leaving the muzzle —
  muzzle flash, smoke, and the ejected casing readable in the same moment.
- At least one slow-motion insert makes individual brass casings the visual
  subject: ejecting, spinning, falling, and bouncing close to camera.
- One additional set piece: a protagonist dodges incoming fire in extreme slow
  motion (leaning back / twisting aside) while the camera orbits; the passing
  bullets carry an air-wake effect — visible ripple/shockwave distortion trails
  through the air.
- All projectile effects run inside the deterministic fixed-timestep simulation
  (same seed ⇒ same trajectories) and must not break the frame-rate target.

The scene is an **homage, not a replica**. Binding for every run:

- No film footage, film audio, dialogue lines, or on-screen text from the film.
- No character names from the film and no actor likenesses — the protagonists
  and defenders stay generic, unnamed figures.
- The choreography is an original, compressed arrangement inspired by the
  scene's motifs — not a shot-for-shot reconstruction of the film's cut.
- All assets are generated within the run (already mandated); reference frames
  from the film are never checked in and never given to agents as image input —
  fidelity feedback reaches agents as text descriptions only.
- Style elements (architecture, wardrobe style, color grade, slow-motion
  gunfight motifs) are deliberately close to the reference; concrete protected
  expression is not.

## Violence limits (German law, § 131 StGB)

The depiction of violence must stay within standard stylized action-film/game
bounds and must never glorify, trivialize, or celebrate cruelty. Concretely,
in addition to A4's limits (no gore, no dismemberment, no wound close-ups, no
lingering suffering): no execution-style violence against defenseless or
surrendering figures, no degrading treatment of the fallen, hits and falls stay
brief and stylized, and the camera never dwells on a dying or dead figure. The
tone remains choreographed action ballet, not cruelty.

---

## Agent environment for this scene

Every run must provide, in addition to the usual filesystem/terminal tools:

| Tool | Provisioning | Purpose | Use |
| --- | --- | --- | --- |
| chrome-devtools | `chrome-devtools-mcp` (isolated profile per agent) | visual self-verification, video capture | required infrastructure |
| ElevenLabs | `elevenlabs-mcp` or ElevenLabs REST API (key provided) | sound effects incl. stylized hit reactions | mandatory |
| Music | `mcp-suno` or AceDataCloud Suno REST API (token provided) | background-music track | mandatory |
| Image generation | Codex CLI (`codex exec`, OpenAI image generation) or `mcp-openai-image` | all textures and decals | mandatory |
| Blender | BlenderMCP (addon socket on port 9876) | optional route for models/rigs/animations | optional |

The exact interface (MCP server vs. REST via shell vs. CLI) may differ per
harness; what is fixed is the capability set and that image generation is
OpenAI-based.

Planned comparison field (strongest available configuration each): Claude Code —
Fable 5; Claude Code — Opus 5; Codex CLI — GPT-5.6-sol (xhigh); OpenCode —
Kimi K3 via OpenRouter (xhigh).

Metadata to record per run additionally: asset-generation costs (ElevenLabs
credits, music/image API costs) separate from LLM token costs.
