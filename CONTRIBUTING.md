# Contributing to Glenmoor Story

Thanks for taking a look at `Glenmoor Story`.

This repository is organized as a focused SRPG vertical slice rather than a general-purpose game framework, so the best contributions are the ones that strengthen clarity, stability, and polish inside the existing scope.

## Setup

```bash
npm install
```

Start the main game:

```bash
npm run dev
```

Start the optional asset workbench:

```bash
npm run asset-workbench:dev
```

## Core validation

Run these before opening a PR:

```bash
npx tsc --noEmit
npm test
npm run build
```

Recommended QA commands for gameplay, HUD, or layout changes:

```bash
npm run qa:playthrough
npm run qa:camera
npm run qa:hud
npm run qa:mobile
```

## Scope guidelines

- Keep the project focused on one authored SRPG battle, not campaign expansion.
- Preserve deterministic combat behavior unless the change intentionally updates the ruleset and includes test coverage.
- Keep English as the documentation language.
- Keep English and Korean gameplay localization in sync when UI copy or wrapper copy changes.
- Treat placeholder visual and audio assets as replaceable. If you add or swap one, update the asset manifest with source and license details.

## Working areas

### Gameplay and runtime

- `src/game/runtime.ts` is the public runtime entry point.
- Content is loaded from `src/game/data/*.json`.
- Rule changes should update or extend the relevant Vitest coverage in `tests/`.

### Scenes and HUD

- `BattleScene` orchestrates the battlefield presentation and player input.
- `DuelScene` handles the close-up exchange presentation.
- `ui.ts` owns the DOM HUD controller and command/event delegation.

### QA and regression

- Browser QA scripts live in `scripts/qa/`.
- The shared signoff checklist lives in `docs/qa-inventory.md`.
- If a change affects targetability, projection, or viewport layout, refresh the matching automated QA path.

### Documentation

- Keep public-facing docs concise and practical.
- Prefer explaining how to run, test, and understand the demo over internal production history.
- Internal planning and progress docs are still kept in the repo, but they are secondary to onboarding docs.

## Content and data changes

When editing `src/game/data/*.json`:

- Keep the existing JSON structure source-compatible.
- Re-run `npx tsc --noEmit`, `npm test`, and `npm run build`.
- If the change affects gameplay flow or authored battle states, also run the relevant QA scripts.

## Pull requests

Good pull requests for this repo usually include:

- A short explanation of the user-visible or developer-facing outcome
- Notes about any gameplay or content assumptions
- The validation commands you ran
- Updated docs or asset attribution when the change affects them
