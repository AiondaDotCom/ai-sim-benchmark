# Frozen benchmark prompt

This is the canonical task prompt, frozen after requirement changes A1–A3 (see
[INTERVENTIONS.md](INTERVENTIONS.md)). Every run from Sonnet 5 onwards received
this text; use it verbatim for all future runs.

Only the first line is adapted per run — replace the path with the agent's own
empty working directory. The closing reporting instruction stays as written, so
that every agent is asked for the same completion report.

---

Your working directory for this task is `<PATH>` — an empty, freshly
initialized git repository. Do ALL work inside that directory only. Do not
modify anything outside it.

Complete the following task:

Build an interactive 3D water simulation in this empty repository.

Generate a procedural mountain landscape from a deterministic seed. Water must flow downhill according to the local terrain gradient, collect in depressions, and form visible streams and lakes.

Use TypeScript, Vite, and Three.js. Do not use a prebuilt physics engine or external 3D assets.

IMPORTANT — the application must be a FULLY AUTONOMOUS demo with NO user interaction and NO visible UI controls at all. Purpose: recording showcase videos for social media. Concretely:
- No visible control elements whatsoever (no buttons, sliders, panels, seed input, click-to-place-water). The screen shows only the 3D scene.
- On page load the simulation starts automatically: rainfall begins on its own and/or water springs emerge near mountain peaks, so water visibly flows downhill, forms streams, and collects into lakes without anyone touching anything.
- Add a slow, smooth automatic camera movement (e.g. gentle orbit around the terrain) so a recorded video looks good.
- Configuration (seed, rain intensity, simulation speed) may only exist via URL query parameters or code constants — never as on-screen UI.
- The scene background must NOT be black — use an attractive sky blue (e.g. around #87CEEB, ideally a soft gradient sky) with matching fog color so the horizon blends naturally. Also make sure the page body background is sky blue, not dark, so there is no dark flash before the canvas paints.

Keep the simulation, rendering, and user-interface/bootstrap code cleanly separated. Add meaningful automated tests for deterministic terrain generation, approximate conservation of water mass, and downhill flow direction.

Also add an executable `start.sh` in the repository root so that people who clone the repo can start the demo with a single command. It should: check that Node.js and npm are available and print a helpful message if not; run `npm install` if node_modules is missing; then start the app (dev server, plus a `--preview` mode for the production build) and print the local URL. chmod +x it and mention it in the README ("Quick start: ./start.sh").

Install the required dependencies, run the tests and production build, and independently fix any errors you encounter. Finally, document the architecture, the simulation model, how to run the application, and all known limitations in the README.

When you are finished, report: the final test results (pass/fail counts), the production build result, a short summary of the architecture, and any known limitations.

---

## Superseded original prompt (pre-A1)

The version below was the original task and required an interactive UI. Only the
Fable 5 run started from it; A1 replaced the interactive controls with the
autonomous demo requirement above. It is kept here for the record and must not
be used for new runs.

> Build an interactive 3D water simulation in this empty repository.
>
> Generate a procedural mountain landscape from a deterministic seed. The user must be able to enable rainfall or place a water source by clicking on the terrain. Water must flow downhill according to the local terrain gradient, collect in depressions, and form visible streams and lakes.
>
> Use TypeScript, Vite, and Three.js. Implement camera controls, start/pause, reset, simulation-speed control, rainfall-intensity control, and seed selection. Do not use a prebuilt physics engine or external 3D assets.
>
> Keep the simulation, rendering, and user-interface code cleanly separated. Add meaningful automated tests for deterministic terrain generation, approximate conservation of water mass, and downhill flow direction.
>
> Install the required dependencies, run the tests and production build, and independently fix any errors you encounter. Finally, document the architecture, the simulation model, how to run the application, and all known limitations in the README.
