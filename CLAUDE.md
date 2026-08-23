# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A benchmark for comparing autonomous coding agents (Claude Code, Codex CLI, Grok CLI, …) on one fixed task: building an autonomous 3D water simulation (procedural terrain, downhill water flow, TypeScript + Vite + Three.js, no physics engine, no 3D assets). The repository root is documentation and protocol, not an application — there is nothing to build or test at the root.

- `PROMPT.md` — the **frozen** canonical task prompt. Use it verbatim for new runs (only the working-directory path in the first line is adapted). The superseded interactive-UI prompt at the bottom of the file must not be used.
- `INTERVENTIONS.md` — the log of every follow-up message sent to an agent. Two categories: **A** (requirement changes, sent to all runs, not scored) and **B** (corrective interventions, counted against that run's autonomy score). Any new follow-up message to a running agent must be logged here.
- `README.md` — measurement philosophy (maximum capability; time/cost recorded but never scored), the 10-category × 5-point rubric, the fair-comparison protocol, and the "Status of the recorded runs" section disclosing that the current six runs are a non-conformant pilot round.
- `runs/<agent-model>/` — one complete, self-contained repository per benchmark run, exactly as the agent left it, plus `docs/demo.gif` and `docs/demo.mp4` recorded by the orchestrator.

## Critical rule: run directories are evidence

The contents of `runs/*` are benchmark artifacts. The protocol forbids manually editing generated files — a run's code, README, and tests must stay exactly as the agent produced them, including in failed runs (Haiku 4.5, Grok). Fixes happen only by messaging the agent and logging the intervention in `INTERVENTIONS.md`. Editing at the repo root (README, PROMPT, INTERVENTIONS, this file) is fine; `PROMPT.md`'s task text is frozen and changes to it would invalidate comparability.

## How to run agents on this benchmark (orchestration pattern)

Learned from the Scene 2 lobby runs (see the comparative observation in `INTERVENTIONS.md`); apply it to new runs and to any multi-agent work in this repository:

- **Opus orchestrates and owns the acceptance criteria.** The orchestrator's real job is judgement — decomposing requirements, deciding what counts as done, writing interventions — and that is the dimension where calibration matters most.
- **Fable subagents build, in parallel.** Fast, competent execution and clean absorption of many change requests is its demonstrated strength.
- **Deep review goes to fresh critic subagents, not to the orchestrator.** The orchestrator accumulates context and becomes a co-owner of the decisions; ownership bias is what makes an agent wave through its own screenshots. A critic must have fresh context, no authorship of the code under review, and an explicit mandate to refute rather than confirm.
- **Whoever built something never signs it off.** This is a role rule, not a model rule; rotate roles so no single model's blind spot is inherited by every decision.
- **Prefer measurement over eyeballing.** The most reliable findings in these runs came from measurement harnesses (weapon-alignment over every firing frame, spectral analysis of a sound effect, muzzle-offset statistics, a pixel-diff noise floor), not from visual judgement. Any acceptance criterion that can become a test should become one, and stay in the repo.

## Commands (inside a run directory)

Each `runs/<agent-model>/` is an independent npm project; run commands from within that directory:

- `./start.sh` — one-command start (checks Node/npm, installs if needed, starts dev server); `./start.sh --preview` serves the production build
- `npm run dev` / `npm run build` / `npm run preview`
- `npm test` — Vitest suite (`npx vitest run tests/terrain.test.ts` for a single file; some runs name it differently — check that run's `tests/`)

Per the prompt, each run separates simulation logic (`src/sim/` or similar, covered by tests: terrain determinism, mass conservation, downhill flow) from rendering (`src/render/`) and bootstrap (`src/main.ts`). Config is via URL query parameters or code constants only — the demos deliberately have no UI.

## Evaluation and verification

- Verdicts are based on the **rendered output**, not on green tests: multiple runs had passing tests and successful builds while the scene was visually broken. Verify by loading the demo in a real browser (the chrome-devtools MCP server is the required tool for screenshots and canvas recording; peekaboo existed only in the pilot round and is not required) before accepting any success claim.
- Demo videos are canvas captures via MediaRecorder in a Chrome instance driven over chrome-devtools; each run's video lives in `runs/<agent-model>/docs/`.
- New runs should follow the protocol in README: fresh empty repo, frozen prompt verbatim, agent in strongest configuration, no time/cost cap, generation in a disposable VM, evaluation on the host, full result record.
