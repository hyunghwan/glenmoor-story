# Glenmoor Story Architecture

## Overview

`Glenmoor Story` is a browser-first SRPG vertical slice built with `Phaser 3`, `TypeScript`, and `Vite`.
The project is intentionally scoped around one authored battle so the core tactics language, presentation, and QA loop can stay tight and well documented.

## Scene flow

The main game loop is organized around three Phaser scenes:

- `BootScene`
  - Preloads the map JSON, placeholder audio, and backdrop textures.
  - Starts the battle scene once core assets are available.
- `BattleScene`
  - Owns battlefield rendering, turn flow, HUD publishing, camera controls, tile interaction, telegraphs, and transition into the duel scene.
  - Uses `BattleRuntime` as the single source of truth for tactical state.
- `DuelScene`
  - Plays the close-up presentation for each committed attack or skill.
  - Returns control to the battle scene once the exchange finishes.

## Deterministic runtime

`BattleRuntime` is the public tactics entry point.
It exposes methods for:

- starting the battle
- reading the active unit
- calculating reachable tiles
- previewing and committing actions
- reading initiative order
- choosing AI actions

The runtime is designed to stay deterministic and renderer-independent.
That makes it suitable for direct unit tests and lets the UI, duel scene, and browser QA all consume the same combat outcomes.

## HUD and presentation

The battlefield uses a split presentation model:

- Phaser draws the map, units, overlays, FX, and duel scene.
- A DOM-based `HudController` renders command menus, initiative, target detail, accessible controls, locale switching, and wrapper modals.

This separation keeps tactical state in the runtime while allowing flexible layout and accessibility-oriented UI behavior outside the canvas.

## Content loading

Gameplay content is split between code-defined registries and authored JSON:

- `src/game/data/*.json`
  - scenario data
  - class definitions
  - skill definitions
  - status definitions
  - AI profiles
- `content-loader.ts` and `scenario-loader.ts`
  - parse and validate the external data before it is used at runtime

The current pass keeps these JSON formats source-compatible so content edits do not require renderer rewrites.

## QA and verification

The project keeps both unit-style and browser-style validation:

- `tests/`
  - runtime, AI, content, scenario, responsive, UI-model, and camera coverage
- `scripts/qa/`
  - playthrough, camera, HUD, and mobile-oriented browser QA flows
- `docs/qa-inventory.md`
  - shared checklist for user-visible signoff expectations

This is why the project can safely support structural refactors without changing gameplay behavior.

## Optional asset workbench

`tools/asset-workbench/` is a separate workspace for reviewing placeholder art and replacement candidates.

It is useful when:

- comparing generated and sourced assets
- checking runtime-facing art constraints
- recording review notes and replacement status

It is not part of the main game boot flow and should be treated as an optional companion tool.
