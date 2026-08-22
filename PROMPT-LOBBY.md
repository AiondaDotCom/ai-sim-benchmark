# Lobby benchmark prompt ("Game 2") — DRAFT, to be frozen before the first run

Second benchmark scene: a stylized homage to the classic lobby-shootout sequence,
this time as a **multimodal production task** — the agents must orchestrate code,
generated textures, sound effects, and music. The protocol from
[README.md](README.md) applies unchanged (empty repo, prompt verbatim, strongest
configuration, interventions logged in [INTERVENTIONS.md](INTERVENTIONS.md)).

Status: **DRAFT.** This text becomes frozen the moment the first run starts.
Until then, wording changes are allowed and must happen in this file only.

Only the first line is adapted per run — replace the path with the agent's own
empty working directory.

---

Your working directory for this task is `<PATH>` — an empty, freshly
initialized git repository. Do ALL work inside that directory only. Do not
modify anything outside it. Never reference any path outside it (including
/tmp) in any command — scratch files belong inside the working directory.

Complete the following task:

Build a fully autonomous 3D action-scene demo in this empty repository: a stylized homage to the classic "lobby shootout" scene — two protagonists in long dark coats (one male, one female) storm a marble government-building lobby defended by uniformed security guards.

The demo plays as a choreographed sequence of roughly 45–60 seconds containing at least these beats: a calm synchronized entrance; an escalation moment at the security checkpoint; an extended shootout in which each protagonist performs at least one acrobatic slow-motion set piece (for example a cartwheel with sustained fire, a wall run); guards that take cover behind pillars, advance, and fall when hit; progressive visible destruction; and a closing shot of the wrecked lobby as the two walk toward the elevator. After the sequence the demo may loop.

Destruction must work like in the film: marble pillars AND wall panels chip and break apart under fire — the marble veneer shatters off in chunks revealing the rough substrate beneath; impact craters and bullet holes persist; broken fragments fall, bounce audibly, and remain on the floor together with the spent shell casings, so that the final shot shows a visibly wrecked lobby (chipped pillars, stripped wall sections, debris covering the floor, dust hanging in the air). Nothing despawns during the sequence.

Use TypeScript, Vite, and Three.js. Do not use a prebuilt physics engine. All geometry and animation must be created within this run: either procedurally in code, or modeled/rigged/animated with the provided Blender tool and exported to glTF (check the exports into the repository). Importing ready-made models, animation data, or asset-library content — in Blender or anywhere else — is forbidden.

MANDATORY generated assets — the following tools are provided and their use is required:

- Generate all textures (marble, substrate, brass, coat fabric, bullet-hole and crack decals, …) with the provided image-generation tool.
- Generate all sound effects with the provided ElevenLabs tool: gunfire, ricochets, shattering marble, falling shell casings and debris, footsteps, and stylized action-movie hit reactions (short grunts/cries — no gore). Provide several variants per category and vary them (seeded) so repetitions are not noticeable.
- Generate one continuous background-music track with the provided music tool whose dramaturgy follows the scene: calm opening, a drop synchronized with the outbreak of the shootout, sustained intensity, calm outro.
- Check every generated asset into the repository. The finished demo must run fully offline — NO network or API calls at runtime.
- Maintain `ASSETS.md`: a manifest listing every generated file with the exact generation prompt used and the tool that produced it.

Slow motion must be implemented as a proper time scale on a fixed-timestep simulation — audio is pitched/stretched accordingly — not by slowing the render loop. Keep simulation/choreography (timeline), rendering, audio, and bootstrap code cleanly separated.

The tone stays stylized PG-13 action film: no blood, no gore, no lingering suffering.

IMPORTANT — the demo is FULLY AUTONOMOUS with NO user interaction and NO visible UI controls at all; it starts on page load and the camera is choreographed automatically, including the slow-motion orbits, keeping the action well framed at all times. Configuration (seed, camera timing, volume, time scale) may only exist via URL query parameters or code constants — never as on-screen UI. The page must never flash dark before the scene paints.

The seed controls procedural variation (debris, particle detail, sound-variant selection); the choreography itself is fixed and deterministic.

Add meaningful automated tests for at least: deterministic replay (identical seed ⇒ identical simulation state hash after N steps), time-scale correctness (at 0.1× time scale the simulation advances exactly 1/10 as far per real second), hit-event/audio pairing (every guard-down event triggers exactly one hit-reaction sound), no friendly fire (the protagonists' shots never hit each other), and destruction persistence (the damage map never reverts; the debris count grows monotonically).

Also add an executable `start.sh` in the repository root: check that Node.js and npm are available and print a helpful message if not; run `npm install` if node_modules is missing; start the dev server, plus a `--preview` mode for the production build; print the local URL. chmod +x it and mention it in the README ("Quick start: ./start.sh").

Install the required dependencies, run the tests and the production build, and independently fix any errors you encounter. Verify your own rendered result in the browser (screenshots at several points of the sequence) before reporting. Finally document the architecture, the timeline/choreography system, the asset pipeline, how to run the application, and all known limitations in the README.

When you are finished, report: the final test results (pass/fail counts), the production build result, an asset inventory summary (file counts per category), a short summary of the architecture, and any known limitations.

---

## Agent environment for this scene

Every run must provide, in addition to the usual filesystem/terminal tools:

| Tool | MCP server | Purpose | Use |
| --- | --- | --- | --- |
| chrome-devtools | `chrome-devtools-mcp` (isolated profile per agent) | visual self-verification, video capture | required infrastructure |
| ElevenLabs | `elevenlabs-mcp` | sound effects incl. stylized hit reactions | mandatory |
| Music | `mcp-suno` | background-music track | mandatory |
| Image generation | `mcp-openai-image` | all textures and decals | mandatory |
| Blender | BlenderMCP | optional route for models/rigs/animations | optional |

Planned comparison field (strongest available configuration each): Claude Code —
Fable 5; Claude Code — Opus 5; Codex CLI — GPT-5.6-sol (xhigh); OpenCode —
Kimi K3 via OpenRouter (xhigh).

Metadata to record per run additionally: asset-generation costs (ElevenLabs
credits, music/image API costs) separate from LLM token costs.
