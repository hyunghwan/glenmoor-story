# Glenmoor Story

`Glenmoor Story` is a browser-first tactical RPG prototype inspired by `Fire Emblem` and `Final Fantasy Tactics`.
The goal of v1 is not a full game. It is one polished battle: medieval-fantasy tone, isometric 2D presentation, mouse-first controls, English-first content, and Korean localization from day one.

## Current Status

- Repository initialized on `main`
- Remote connected to `https://github.com/hyunghwan/glenmoor-story.git`
- Phaser + TypeScript prototype implemented on top of Vite
- Deterministic battle core, AI scoring, localized HUD, and duel scene are wired into a playable single battle
- Vitest tactical rule coverage and Playwright QA artifact generation are in place
- `js_repl` has been enabled in Codex config for the next session so the `playwright-interactive` workflow can take over

## Prototype Pillars

- One complete battle, not a broad feature list
- Deterministic tactics core that can be tested without rendering
- Separate duel scene for every combat exchange
- DOM HUD layered over the game surface
- English source strings with Korean locale parity
- Project planning and progress tracked in Markdown and mirrored to GitHub Project items

## Documentation

- `docs/plan.md`: implementation plan and delivery structure
- `docs/backlog.md`: concrete execution backlog and GitHub Project sync source of truth
- `docs/game-design.md`: prototype GDD
- `docs/progress.md`: canonical implementation log
- `docs/qa-inventory.md`: QA coverage list for functional and visual validation
- `docs/assets/prototype-visual-asset-spec.md`: canonical tile, unit, duel, VFX, and HUD asset sizing contract
- `docs/assets/asset-replacement-manifest.md`: placeholder asset slots and replacement targets
- `docs/assets/comfy-cloud-asset-pipeline.md`: Comfy Cloud production runbook for prototype-grade game assets
- `docs/assets/comfy-pilot-prompt-pack.md`: pilot prompts for style bible, unit references, terrain, and VFX
- `docs/assets/comfy-batch/`: machine-readable batch manifests for the master Comfy workflows
- `docs/assets/comfy-workflows/`: import-ready Comfy UI workflows plus legacy/debug helpers
- `progress.md`: handoff-friendly agent log required by the web-game workflow

## Implemented Slice

The current playable slice includes:

- a 16x16 isometric map
- 6 allied units and 6 enemy units
- initiative-based turn order
- terrain, height, facing, status, counterattack, and push systems
- battle HUD, localized story wrapper, and reusable duel presentation
- English and Korean locale support
- automated tactical tests and screenshot/state capture under `output/web-game/`
