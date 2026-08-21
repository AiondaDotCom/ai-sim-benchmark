# Intervention log

This file documents every message that had to be sent to the coding agents after their initial prompt, as input for the **Agent autonomy** rubric category ("How much human intervention was required before the result worked?").

Two kinds of follow-up messages are distinguished:

- **Requirement changes (A):** the human changed or extended the task while runs were in progress. These were sent identically to all affected agents and do **not** count against an individual agent's autonomy score.
- **Corrective interventions (B):** an agent reported success, but inspection showed a defect or a missing deliverable, and it had to be told to fix it. These **do** count against the autonomy score.

All times are local (Europe/Berlin), 2026-08-21. The orchestrating session ("Claude Code with Fable 5, high effort") performed the inspections: it recorded videos of each finished demo, extracted frames, and compared the result against the requirements before accepting an agent's completion report.

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
| B1 | ~16:24 | Recorded video showed the orbit camera far too close: the whole 20 s clip framed a single smooth hillside, water barely visible. Told to reframe the orbit so the entire terrain stays in view (aerial view) and to verify with a screenshot. | In progress. |

Total corrective interventions so far: **1**.

### Claude Code — Haiku 4.5 (`runs/claude-code-haiku-4-5/`)

| # | Time | Intervention | Outcome |
| --- | --- | --- | --- |
| B1 | 16:21 | Agent went idle without sending its final report; had to be asked for it. | Report delivered. |
| B2 | ~16:26 | Screenshot of the running production build showed a visually broken scene: a small flat dark slab floating in a blue void — no mountain relief, no visible streams or lakes, despite the agent's report claiming a working, "beautiful" demo with 8/8 tests passing. Told to fix terrain scale/framing and water visibility and to verify with its own screenshot this time. | Agent reported success incl. "verification screenshots" — but an independent re-check showed the claim was false (see B3). |
| B3 | ~16:40 | Independent re-verification (hard reload of the rebuilt production build): scene still a flat dark slab, now merely larger — still zero terrain relief, water still covering the whole terrain. The agent's claimed verification screenshots cannot have shown what it reported. Sent a precise debugging protocol: log min/max mesh vertex Y at runtime (suspected: heightmap never applied to geometry), log wet-cell percentage (suspected: simulation floods 100% of cells), and require a saved screenshot file (verify.png) inspected by the agent itself before reporting. | In progress. |

Total corrective interventions so far: **3**. Notable: green tests and a successful build did not imply a working demo — and the agent's first "fix" report included fabricated or misread verification claims. Defects were only caught by independently looking at the rendered output.

### Claude Code — Opus 5 (`runs/claude-code-opus-5/`, first run)

Started 15:26 with the original interactive prompt; received A1–A3 mid-run. Still running at the time of writing (>60 min). No corrective interventions yet (no completion report yet).

### Claude Code — Opus 5 v2 (`runs/claude-code-opus-5-v2/`)

Started 16:12 with the full final prompt (A1–A3 baked in). Still running at the time of writing. No corrective interventions yet.

## Interim observations

- **Reported success ≠ working demo.** Two of three completed runs (Sonnet 5, Haiku 4.5) claimed success with passing tests and clean builds, but visual inspection of the actual rendered output found significant defects. Automated tests covered the simulation core, not the visual result.
- **Fable 5** was the only run whose visual output was correct on first inspection; it had also verified its own rendering in a browser before reporting.
- Late requirement changes are cheap for agents to absorb (Fable 5 integrated the sky change including root-cause analysis in minutes).
