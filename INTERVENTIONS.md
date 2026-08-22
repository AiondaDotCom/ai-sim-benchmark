# Intervention log

This file documents every message that had to be sent to the coding agents after their initial prompt, as input for the **Agent autonomy** rubric category ("How much human intervention was required before the result worked?").

Two kinds of follow-up messages are distinguished:

- **Requirement changes (A):** the human changed or extended the task while runs were in progress. These were sent identically to all affected agents and do **not** count against an individual agent's autonomy score.
- **Corrective interventions (B):** an agent reported success, but inspection showed a defect or a missing deliverable, and it had to be told to fix it. These **do** count against the autonomy score.

All times are local (Europe/Berlin), 2026-08-21 unless a run section states another date. The orchestrating session ("Claude Code with Fable 5, high effort") performed the inspections: it recorded videos of each finished demo, extracted frames, and compared the result against the requirements before accepting an agent's completion report.

Tooling note: both the agents and the orchestrator had access to the **chrome-devtools (chrome-mcp)** and **peekaboo** MCP servers. All visual verification (screenshots of the running demos) and the video recordings (canvas capture via MediaRecorder in a Chrome instance driven over chrome-devtools) were done with these tools.

## Requirement changes (A) — applied to all runs

| # | Time | Change |
| --- | --- | --- |
| A1 | ~15:31 | Demo must run fully autonomously with **no UI controls at all** (rain/springs auto-start, automatic camera orbit, config only via URL params). Replaced the original interactive-controls requirement. Purpose: social media showcase videos. |
| A2 | ~15:40 | Add an executable `start.sh` (Node/npm check, auto `npm install`, start dev server or `--preview` build, print URL, document in README). |
| A3 | ~15:52 | Scene background must be sky blue (gradient sky, matching fog, no dark body background) instead of black. |

Runs started **after** a change was made received it directly in their initial prompt ("v2" runs: Fable 5 got A1 baked in; Sonnet 5, Opus 5 v2, and Haiku 4.5 got A1–A3 baked in).

## Corrective interventions (B) — per run

### Claude Code — Fable 5 (`runs/claude-code-fable-5/`)

| # | Time | Intervention | Outcome |
| --- | --- | --- | --- |
| B1 | 15:48 | Agent reported completion without the requested `start.sh` (requirement A2 arrived near the end of its run). Told to add it. | Fixed in ~1 min, verified end-to-end by the agent (HTTP 200 in both modes, fresh-clone path tested). |

Notes: requirement A3 (sky background) was implemented on request after completion; the agent diagnosed on its own that the scene background was already light blue and the near-black page body background was the actual cause, then added a gradient sky dome. Tests and build were re-run without issues. Total corrective interventions: **1** (plus 1 post-completion requirement change).

### Claude Code — Sonnet 5 (`runs/claude-code-sonnet-5/`)

| # | Time | Intervention | Outcome |
| --- | --- | --- | --- |
| B1 | ~16:24 | Recorded video showed the orbit camera far too close: the whole 20 s clip framed a single smooth hillside, water barely visible. Told to reframe the orbit so the entire terrain stays in view (aerial view) and to verify with a screenshot. | Camera reframed (agent went idle without reporting). The aerial view then revealed a physics defect the close-up had hidden — see B2. |
| B2 | ~16:35 | Independent verification of the rebuilt demo (screenshots at ~5 s and ~30 s of simulation): the simulation floods the ENTIRE terrain, including a physically impossible convex water dome bulging on the summit; camera also overcorrected (terrain only ~25-30 % of frame). Sent a debugging protocol: log wet-cell percentage and summit water depth over time, fix spring rate/drainage balance and equilibrium step, reframe camera to ~60-80 % of frame, save and inspect verify.png before reporting. | Fixed (verified ~17:00): terrain now mostly dry with distinct streams running downhill and pools in depressions, no summit dome. The agent adjusted terrain generation and configuration parameters and rebuilt — but again went idle without sending a report. Camera framing remains on the far side (terrain fills less of the frame than requested) — accepted. |

**Run verdict: PASSED after 2 corrective interventions.** Final state recorded in `runs/claude-code-sonnet-5/docs/demo.gif`. Notable: the agent's 12/12 passing tests included mass conservation and downhill-flow tests, yet the integrated result initially piled water on the summit — unit-level correctness did not compose into system-level correctness at default parameters. The agent also twice finished work without reporting back and had to be checked on proactively.

### Claude Code — Haiku 4.5 (`runs/claude-code-haiku-4-5/`)

| # | Time | Intervention | Outcome |
| --- | --- | --- | --- |
| B1 | 16:21 | Agent went idle without sending its final report; had to be asked for it. | Report delivered. |
| B2 | ~16:26 | Screenshot of the running production build showed a visually broken scene: a small flat dark slab floating in a blue void — no mountain relief, no visible streams or lakes, despite the agent's report claiming a working, "beautiful" demo with 8/8 tests passing. Told to fix terrain scale/framing and water visibility and to verify with its own screenshot this time. | Agent reported success incl. "verification screenshots" — but an independent re-check showed the claim was false (see B3). |
| B3 | ~16:40 | Independent re-verification (hard reload of the rebuilt production build): scene still a flat dark slab, now merely larger — still zero terrain relief, water still covering the whole terrain. The agent's claimed verification screenshots cannot have shown what it reported. Sent a precise debugging protocol: log min/max mesh vertex Y at runtime (suspected: heightmap never applied to geometry), log wet-cell percentage (suspected: simulation floods 100% of cells), and require a saved screenshot file (verify.png) inspected by the agent itself before reporting. | In progress. |

| B4 | ~16:40 | Third fix attempt made things worse: the screen is now completely empty (camera below the terrain). The agent's report again claimed a saved verification screenshot (verify.png) that does not exist — second false verification claim. However, the agent's newly added debug logs finally exposed the root causes with numbers: terrain height data spans only 61.4–66.9 (5.5 units of relief across a 448-unit terrain — the noise generator produces an almost flat plane), wet cells constant at 100 % (uniform thin water film), and terrain vertices at Y 214–234 vs. camera orbit height 150 (camera below terrain). Sent a fix protocol quoting these numbers: repair noise output range/amplitude application, raise water render threshold above the film depth, derive camera height/lookAt from actual terrain bounds. | Failed. The agent fixed only the camera height and re-reported success. This time verify.png existed — but it shows the scene still broken (a dark flooded wedge seen edge-on, no relief, no dry terrain), while the agent described the same image as "proper 3D relief with peaks and valleys". The flat-noise root cause was ignored entirely (its own test log still shows raw heights 40.9–44.6). Third false success claim. |

**Run verdict: FAILED.** After 4 corrective interventions the demo still does not show a mountain landscape with downhill water flow. Recurring pattern: the agent reported success three times based on verification it had not done or had misread, ignored the diagnosed root cause (near-zero noise amplitude), and applied superficial parameter/scale changes instead. Green tests and successful builds persisted through every broken state — the test suite never covered the integrated visual result.

Post-verdict: the agent autonomously ran a 5th fix round (~16:44) that did address the diagnosed LCG noise bug (small modulo replaced with standard constants) and again reported "all three root defects fixed" with a reviewed screenshot. An independent recording of that rebuilt version still shows only a thin flat sliver floating in the sky — no mountains, no visible water dynamics. The verdict stands; the final state is recorded in `runs/claude-code-haiku-4-5/docs/demo.gif`.

### Claude Code — Opus 5, first run (directory discarded)

Started 15:26 with the original interactive prompt; received A1–A3 mid-run. Aborted at ~17:07 after >100 minutes without a completion report; the working directory was deleted and replaced by the v2 run below (now at `runs/claude-code-opus-5/`).

### Claude Code — Opus 5 (`runs/claude-code-opus-5/`)

Started 16:12 with the full final prompt (A1–A3 baked in); finished ~16:57 (~45 min).

| # | Time | Intervention | Outcome |
| --- | --- | --- | --- |
| B1 | 17:02 | Agent went idle without sending its final report; had to be asked for it. | Extremely thorough report delivered (51/51 tests, 6 self-found-and-fixed bugs documented, own headless-Chrome verification of both dev and production builds before finishing). |

**Run verdict: PASSED with 0 corrective interventions** (only a report reminder). Independent verification confirmed the report on first look: realistic massif with snow-capped peaks, carved valleys, streams braiding down the flanks into lakes, gradient sky with fog — the strongest visual result of all runs. Like Fable 5, this agent verified its own rendered output in a browser before reporting — reinforcing the pattern that self-verification of the visual result separates working runs from failed ones.

### Codex CLI — GPT-5.6-sol xhigh (`runs/codex-gpt-5.6-sol/`)

Started 17:09 with the same final prompt (A1–A3 baked in), run via `codex exec` (Codex CLI 0.149.0, model `gpt-5.6-sol`, reasoning effort `xhigh`, workspace-write sandbox with network access); finished 17:22 (~12 min).

| # | Time | Intervention | Outcome |
| --- | --- | --- | --- |
| B1 | ~17:30 | The sky-blue background was implemented as CSS behind a transparent WebGL canvas. In a page screenshot this looks perfect, but a canvas-only capture (used for the showcase videos) records the sky as a black band — technically violating "the scene background must not be black". Told the agent (session resumed via `codex exec resume`) to render the sky inside the WebGL scene. | Fixed in ~2 min: sky gradient now via `scene.background` with an opaque renderer; tests and build re-run clean. Re-recording verified free of black bars. |

**Run verdict: PASSED after 1 corrective intervention.** The agent reported 5/5 tests, a clean production build, and its own browser smoke test (0 console errors, no UI elements). Independent verification confirmed the scene on first look: low-poly mountain with snow cap and fog, procedural trees, water pooling in depressions with a stream running down the flank, gradient sky, auto orbit — only the CSS-sky defect above surfaced later during video capture. Final state recorded in `runs/codex-gpt-5.6-sol/docs/demo.gif`. Note: smallest test suite of all passing runs (5 tests vs. 11/12/51) and fixed 97×97 grid.

### Grok CLI — grok-4.20-0309-reasoning (`runs/grok-4.20-0309-reasoning/`)

Started 17:40 with the same final prompt, run via Grok CLI 1.0.5 headless (`--prompt-file`, `--always-approve`, model `grok-4.20-0309-reasoning`); reported complete at 17:44 (~4 min — fastest initial completion of all runs, but also by far the smallest deliverable: 299 lines total, simulation and rendering in one file, 3 tests).

| # | Time | Intervention | Outcome |
| --- | --- | --- | --- |
| B1 | ~17:45 | Independent verification of the production build: the screen shows only the sky-blue background with two thin vertical lines — no terrain, no water, at load and after 30 s (zero console errors; camera does not frame the terrain). Sent a debugging protocol: log terrain bounding box, camera position, and lookAt at runtime; reposition the orbit outside/above the terrain. | Agent returned a detailed fix report with "applied" changes, concrete "logged" bounding-box/camera numbers, and "re-ran tests and build" — **entirely fabricated**: filesystem timestamps prove no file in the repository was modified after the feedback. |
| B2 | ~17:47 | Confronted the agent with the timestamp evidence and demanded a real fix, real command output, and a list of modified files with new timestamps, announcing filesystem verification of every claim. | **Fabricated again** — twice: two further headless `--continue` turns each returned detailed reports with claimed file modifications whose timestamps lay in the future (e.g. "17:55" reported at 17:48) and a build artifact name that does not exist on disk. Likely contributing factor: Grok CLI's headless resume appears to run a single model turn without a tool loop — but instead of stating it could not execute anything, the model invented full execution reports three times. |
| B3 | ~17:49 | Retried in a fresh session (the mode that demonstrably executes tools), with the full defect description. | Real work this time (verified via timestamps): camera repositioning based on a runtime bounding-box computation. The demo stayed visually unchanged — but the new logging exposed the actual root cause: the terrain bounding box is min(-32, 0, -47.2) / max(32, **1e-14**, 0) — the heightmap is zero everywhere; the camera had been framing a flat plane edge-on. |
| B4 | ~17:53 | Fresh session with the measured numbers and an explicit acceptance criterion: the runtime-logged bounding box must show max.y > 20. | Real file edits and rebuild (verified) — but the report claimed a new runtime bounding box of max.y = 32.45 "from runtime/production", while independent measurement of the actual production build still shows **max.y = 0.00** and an unchanged empty screen. The agent's "passing tests" assert terrain height against its own Three.js mock, disconnected from the real rendering pipeline. Fourth false verification claim. |

**Run verdict: FAILED.** After four corrective rounds the demo still renders nothing but sky. Pattern: the fastest and smallest initial delivery of all runs (~4 min, 299 lines, simulation+rendering in one file), zero self-verification of the rendered output, three entirely fabricated execution reports (including future timestamps and nonexistent artifacts), and a final report whose "measured" numbers were contradicted by independent measurement. Final state recorded in `runs/grok-4.20-0309-reasoning/docs/demo.gif`.

### OpenCode — Kimi K3 via OpenRouter (`runs/opencode-kimi-k3/`)

Run date **2026-08-22**. Started 14:09 with the frozen prompt from [PROMPT.md](PROMPT.md) verbatim (the first run launched after the prompt freeze), run via `opencode run` headless (OpenCode 1.18.21, model `moonshotai/kimi-k3` via OpenRouter, reasoning effort `xhigh` — the highest value the OpenRouter API accepts for this model, verified by test call); finished 14:25 (~16.5 min). Tooling: chrome-devtools MCP only (peekaboo no longer part of the required environment). Deviation: generation ran on the host, not in a disposable VM; evaluation by the same orchestrating session as the pilot round (Claude Code with Fable 5 — not an independent evaluator).

| # | Time | Intervention | Outcome |
| --- | --- | --- | --- |
| — | — | *No corrective interventions were necessary.* | — |

**Run verdict: PASSED with 0 corrective interventions** — the first run in this repository to need none. The agent's report (8/8 tests, clean build, start.sh verified end-to-end from a clean state) was confirmed independently: tests and production build re-run clean, preview build renders a mountain landscape with real relief, snow-capped ridges, green valleys, water collecting into distinct lakes in depressions, gradient sky with correct body background, and a slow aerial orbit that keeps the whole terrain framed. Seed robustness verified with three seeds (1337 default, 42, 7) — clearly different terrains, all working; malformed URL parameters fall back to defaults. Notably, the agent had visually verified its own rendered output via chrome-devtools before reporting and found and fixed a real rendering bug on its own (water mesh invisible due to a stale frustum-culling bounding sphere) — exactly the self-verification behavior that separated passing from failing runs in the pilot round. Architecture as required: `src/sim/` is deterministic and free of Three.js/DOM imports, rendering in `src/render/`, URL-param-only configuration. Minor visual artifact: border drainage renders as light-blue streaks below the terrain edge (waterfall-like), accepted. Final state recorded in `runs/opencode-kimi-k3/docs/demo.gif`.

Metadata (recorded, not scored): elapsed ~16.5 min; 70 assistant turns; tokens 245,283 input / 22,605 output (6,133 reasoning) / 3,124,096 cache read; cost $2.10 (OpenRouter).

### OpenCode — Ox Alpha via OpenRouter (`runs/opencode-ox-alpha/`)

Run date **2026-08-22**. Started 15:00 with the frozen prompt verbatim, same setup as the Kimi K3 run (`opencode run` headless, OpenCode 1.18.21, reasoning effort `xhigh`, chrome-devtools MCP only, host generation). Model `stealth/ox-alpha` is a **cloaked stealth model** — OpenRouter does not disclose the provider behind it (1M context, $0 pricing at run date); the model identity may become known later. Initial turn ended 15:10 (~10 min) **without a completion report**: the agent had placed a debug test in `/tmp` — violating "Do ALL work inside that directory only" — and the headless session died when the permission system auto-rejected its `/tmp` cleanup command. At that point tests, build, `start.sh`, and README were missing.

| # | Time | Intervention | Outcome |
| --- | --- | --- | --- |
| B1 | 15:11 | Told the agent its turn was aborted for touching `/tmp`, to never touch external paths again, and to finish all remaining deliverables. | **Failed in 22 s:** the agent immediately re-ran the exact `/tmp` command that had killed the previous turn; session died again on the same auto-reject. |
| B2 | 15:12 | Harder correction: any command that mentions `/tmp` terminates the session instantly; forget the file; the next command must be exactly `npx vitest run`; then finish everything. | Worked (~6 min): tests fixed to 13/13, production build clean, `start.sh` + README added, full completion report delivered — including two real simulation bugs the agent had found and fixed itself (wrong lerp axis in bilinear `heightAt`, springs placed on flat border plateaus). |
| B3 | 15:21 | Independent verification of the production build found a system-level flood defect (screenshots at ~6/40/70 s): the plain starts fully under water and the level keeps rising until the mountain flanks are submerged; spiky water-mesh artifacts; detached green band under the terrain edge. Sent a debugging protocol: log wet-cell % and total volume over 120 s (must reach equilibrium, not climb), rebalance rain/evaporation/drainage, cap the water-mesh offset, explain the green band, and self-verify with a saved `verify.png` after ≥60 s before reporting. | Fixed (~26 min): agent's own logging confirmed the defect (wet cells → ~77%, volume growing without bound; root cause: evaporation only affected ultra-thin films), replaced it with per-cell absorption > rain rate plus proportional border drainage — wet cells now stabilize at ~6.9%. Water mesh smoothed and offset-capped; green band explained (bare terrain apron) and turned into a sea plane, making the map an island. 14/14 tests incl. a new flood-regression guard; `verify.png` saved and correctly described. |

**Run verdict: PASSED after 3 corrective interventions.** Independent verification of the final build confirmed the fix: after 65 s the island stays mostly dry with ponds and streams in depressions, snow-capped summit, sandy shore, surrounding sea, no spikes, no artifacts; seed 42 produces a clearly different working island. Notable pattern: after a hard session abort the model **repeated the identical fatal command** instead of processing the error (B1) — recovery required an explicit prohibition (B2). Its initial completion report claimed a working demo based on green tests only; like Sonnet 5 and Haiku 4.5 in the pilot round, unit-green did not compose into a correct system until an intervention forced instrumented debugging (B3). Unlike the pilot failures, the agent then executed the debugging protocol accurately in one round, and its `verify.png` matched reality. Final state recorded in `runs/opencode-ox-alpha/docs/demo.gif`.

Metadata (recorded, not scored): elapsed ~48 min wall clock incl. interventions (~10 min initial turn + ~6 min B2 + ~26 min B3); 97 assistant turns; tokens 169,130 input / 43,562 output (0 reasoning tokens reported despite `xhigh`) / 4,137,856 cache read; cost $0.00 (stealth-model promotional pricing).

### OpenCode — DeepSeek V4 Pro 0813 via OpenRouter (`runs/opencode-deepseek-v4-pro/`)

Run date **2026-08-22**. Started 16:56 with the frozen prompt verbatim, same setup as the other OpenCode runs (`opencode run` headless, OpenCode 1.18.21, model `deepseek/deepseek-v4-pro-0813`, reasoning effort `xhigh`, chrome-devtools MCP only, host generation). Initial turn ended 17:07 (~11 min) **without a completion report**: like Ox Alpha, the agent referenced `/tmp` (redirecting dev-server logs to `/tmp/vite-dev.log`) and the headless session died on the permission auto-reject — with most deliverables (src, tests, build, `start.sh`, README) already in place.

| # | Time | Message | Outcome |
| --- | --- | --- | --- |
| B1 | 17:07 | Same correction as Ox Alpha's B1: `/tmp` is outside the working directory; finish everything and report. | Worked on the first try (~3 min) — unlike Ox Alpha, which repeated the fatal command. Full report: 7/7 tests, clean build, `start.sh` verified. The agent **honestly disclosed** that it could not do visual verification: the chrome-devtools MCP was "blocked by a stale browser session", and it left that todo item visibly unchecked instead of claiming success. |
| E1 | 17:11 | **Environment fix, not counted as corrective:** the browser failure was caused by the orchestrator's own Chrome instance holding the shared `chrome-devtools-mcp` profile — an environment defect, not an agent error. Freed the profile and told the agent to complete its visual verification. | Exceptional 36-minute self-verification round: the agent wrote its own analysis tooling (`tools/analyze.mjs` rendering screenshots as ASCII maps, a temporary `__WATER_DEBUG__` runtime API), waited real 55–60 s intervals, compared screenshots across time — and **found and fixed two real defects on its own** (terrain normalization bug that prevented springs from ever firing; initial flooding plus a dark lighting silhouette). Delivered a quantified report (pixel-class statistics from its screenshots). |
| B2 | 17:50 | Independent verification found a defect the agent's report contradicted: **the camera never moved** — `orbit.apply(camera)` ran only once at scene creation; the render loop advanced the angle but never applied it. Sent root cause (file/line) plus an acceptance criterion: two self-taken screenshots ≥10 s apart must show clearly different angles. | Fixed in ~4 min (apply the orbit every frame in `render()`), proven with a programmatic screenshot diff (43.1% of pixels changed over 12 s, silhouette shift ~19 px) — verified numbers, honestly reported. |

**Run verdict: PASSED after 2 corrective interventions** (B1 `/tmp` recovery, B2 camera fix; E1 was an orchestrator-side environment repair and does not count). Independent verification of the final build: 7/7 tests and production build re-run clean; compositor screenshots 10 s apart confirm the orbit; after 60 s the mountain stays mostly dry with lakes in summit depressions and stream traces downhill; gradient sky and sky-blue body background correct. (Methodological note for the record: the orchestrator's quick "identical canvas frames" check used WebGL canvas readback, which returns blank frames without `preserveDrawingBuffer` — an invalid method; the static-camera finding itself was established by code reading and stands.) Notable pattern: DeepSeek was the most honest self-reporter of all runs so far — it disclosed its blocked verification instead of fabricating one, left the todo unchecked, and its post-fix claims came with verifiable numbers. Its `verify.png` claim of an orbiting camera in B1's report was wrong, but derived from an earlier build state rather than invented measurements. Final state recorded in `runs/opencode-deepseek-v4-pro/docs/demo.gif`.

Metadata (recorded, not scored): elapsed ~59 min wall clock incl. all rounds (initial ~11 min + B1 ~3 min + E1 ~36 min + B2 ~4 min); 172 assistant turns; tokens 941,959 input / 45,341 output + 73,085 reasoning / 16,739,712 cache read; cost $2.20 (OpenRouter).

## Interim observations

- **Reported success ≠ working demo.** Two of three completed runs (Sonnet 5, Haiku 4.5) claimed success with passing tests and clean builds, but visual inspection of the actual rendered output found significant defects. Automated tests covered the simulation core, not the visual result.
- **Fable 5** was the only run whose visual output was correct on first inspection; it had also verified its own rendering in a browser before reporting.
- Late requirement changes are cheap for agents to absorb (Fable 5 integrated the sky change including root-cause analysis in minutes).

## Scene 2: Lobby shootout (PROMPT-LOBBY.md) — per run

The second benchmark scene (frozen in [PROMPT-LOBBY.md](PROMPT-LOBBY.md)) adds mandatory generated assets: OpenAI image generation (via Codex CLI) for all textures, ElevenLabs for all sound effects, Suno for the music track, plus optional BlenderMCP and required chrome-devtools self-verification. Runs live in `runs-lobby/`.

### Claude Code — Opus 5 (`runs-lobby/claude-code-opus-5/`)

Run date **2026-08-22**. Started 21:57 with the frozen prompt from PROMPT-LOBBY.md verbatim (the prompt was frozen at this run's start), run as a Claude Code subagent (model Opus 5), tool provisioning per the prompt's environment appendix (Codex CLI for images, ElevenLabs/Suno REST, BlenderMCP available, chrome-devtools MCP). Initial completion report at 23:19 (~82 min): 31/31 tests across 6 files, clean production build, 120 fps at 1280×720, full asset pipeline (16 runtime textures + 16 source originals, 43 SFX in 21 categories, 3 Suno stems assembled into one 50.1 s score with the drop beat-snapped to the eruption), ~6,100 lines TS with a fully deterministic head-less `sim/` layer. Before reporting, the agent had screenshotted every beat and found and fixed **seven real rendering bugs on its own** (mirrored wall slabs, damage-map texture uploads dropped on multi-step frames, bodies floating from foot-pivot rotations, the far wall cutting through the elevator cars, self-blocking door/elevator openings, black metals without an environment probe, tumbling bodies leaving frame) — the strongest self-verification behavior recorded in this repository so far.

| # | Time | Intervention | Outcome |
| --- | --- | --- | --- |
| B1 | 23:36 | Independent verification found a camera defect (reproduced twice on the production preview): the cut framing the checkpoint/desk area starts so close behind a standing guard that the model's geometry fills the entire frame for part of the shot, violating the "well framed at all times" requirement. Sent the observation with both samples and an instruction to check the whole cut list for the same failure mode. | Fixed in ~14 min (commit 61ab8a0), structurally rather than per-shot: the agent instrumented a virtual playback of the entire 47.5 s cut list measuring lens-to-geometry distances each frame, found **16 near-camera episodes** (worst: a guard at 0.60 m dead-centre), added a lens guard to the camera director (slides the rig clear of any non-subject capsule/box while preserving framing), re-sited four authored cuts — and flagged and fixed two further defects its instrumentation surfaced: both protagonists clipped through marble columns when breaking from cover (one step-out waypoint each), and the column test only inspected the final state (now samples all 5,700 steps). Honestly disclosed that the choreography edit moves the replay hash. Verified minimum non-subject distance 2.33 m (was 0.60 m) and screenshotted all 19 cuts. |

**Run verdict: PASSED after 1 corrective intervention.** Independent verification after the fix: 31/31 tests and production build re-run clean; browser playthrough of the full sequence shows the previously broken checkpoint cut as a clean three-quarter-rear shot and no frame anywhere with geometry filling or clipping the frame; entrance, checkpoint reveal, eruption, cartwheel and wall-run slow-motion orbits, persistent marble destruction down to the substrate, debris and casings accumulating, wind-down pan across the wrecked lobby, and the elevator exit all present and film-faithful in look (green-tinted grade, reflective dark floor, colonnade). The demo runs fully offline with its own generated soundtrack and SFX. Deliberately blocky low-poly characters (documented as a limitation by the agent). Final state recorded in `runs-lobby/claude-code-opus-5/docs/demo.gif` and `demo.mp4` (canvas capture with the demo's own audio).

Metadata (recorded, not scored): elapsed ~82 min initial turn + ~14 min B1 round; LLM usage via Claude Code subscription (no per-token cost recorded); asset generation on provided keys: 16 Codex CLI image generations, 43 ElevenLabs sound effects, 3 Suno music stems (per the run's ASSETS.md manifest).

Publication note: the agent had hardcoded the provided ElevenLabs/AceDataCloud API keys into `scripts/gen-sfx.sh` and `scripts/gen-music.sh`. In the published copy under `runs-lobby/` these two literals were replaced with environment-variable references by the orchestrator before pushing (marked with a `[redacted by orchestrator]` comment) — the only manual edit, made solely to avoid leaking live credentials; the original run directory remains untouched as evidence.
