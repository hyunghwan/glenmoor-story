# Glenmoor Story Execution Backlog

This file is the concrete execution backlog for the next prototype passes.
It stays aligned with the GitHub Project `Glenmoor Story` and keeps the scope locked to one polished battle.

## Guardrails

- Keep the prototype focused on one authored battle, not campaign expansion.
- Keep documentation English-first.
- Use curated open-source placeholder art and audio for the production-facing polish pass.
- Keep the tactics core deterministic and testable outside rendering.
- Keep docs and GitHub Project items synchronized with actual status, not aspirational status.

## Project Board

- GitHub Project: `Glenmoor Story`
- Project URL: <https://github.com/users/hyunghwan/projects/3>

## Execution Order

### 1. Pointer-only browser QA and debug-assist removal

- GitHub: `#4` `Complete pointer-only browser QA coverage and remove final debug assist`
- Project status: `Done`
- Depends on: none
- Outcome:
  - Main scripted battle flows no longer depend on `window.__glenmoorDebug.projectTile(x, y)`.
  - Browser QA covers pointer-driven movement, attack confirmation, and skill confirmation.
- Tasks:
  - Extend QA from camera/movement validation into pointer-driven basic attack confirmation.
  - Extend QA into pointer-driven signature skill confirmation.
  - Remove the remaining tile-projection debug dependency from main scripted battle flows.
  - Refresh captured artifacts and update QA docs after the flow is stable.
- Exit criteria:
  - `npm test`
  - `npm run build`
  - `PLAYWRIGHT_BASE_URL=<live-url> npm run qa:playthrough`
  - `PLAYWRIGHT_BASE_URL=<live-url> npm run qa:camera`
- Notes:
  - `scripts/qa/playthrough.mjs` and `scripts/qa/camera-controls.mjs` now use shared external tile projection from telemetry plus map height data.
  - `window.__glenmoorDebug.stage()` remains as the only staged setup shortcut for these scenarios.
  - `window.__glenmoorDebug.projectTile()` is still retained for `qa:hud` and should be removed in `#5`.

### 2. Short-height HUD fit and locale readability

- GitHub: `#5` `Compact the battle HUD for 1280x720 and locale-fit readability`
- Project status: `Todo`
- Depends on: `#4`
- Outcome:
  - The `1280x720` battle view exposes critical tactical information without relying on first-pass internal scroll for core understanding.
  - English and Korean remain readable after the layout compaction.
- Tasks:
  - Reduce HUD density for short-height desktop.
  - Preserve the unit-tethered action-menu approach instead of reintroducing a heavy static tray.
  - Tighten initiative, forecast, and active-unit presentation for `1280x720`.
  - Refresh screenshot evidence and QA expectations for short-height layouts.
- Exit criteria:
  - `npm test`
  - `npm run build`
  - `PLAYWRIGHT_BASE_URL=<live-url> npm run qa:hud`

### 3. Multi-phase objective model and runtime event hooks

- GitHub: `#6` `Add multi-phase objectives and battle event hooks to the tactics core`
- Project status: `Todo`
- Depends on: `#5`
- Outcome:
  - The runtime can represent objective changes and scripted battle events without expanding into metagame systems.
- Tasks:
  - Extend battle data and runtime state to support phase objectives.
  - Add event hooks for reinforcement, objective shifts, or wrapper-copy changes.
  - Keep the tactics core deterministic and testable.
  - Avoid campaign, inventory, save/load, recruitment, or broader progression features.
- Exit criteria:
  - `npm test`
  - `npm run build`

### 4. Authored Glenmoor Pass phase beat

- GitHub: `#7` `Author a phased Glenmoor Pass encounter with one memorable mid-battle beat`
- Project status: `Todo`
- Depends on: `#6`
- Outcome:
  - Glenmoor Pass gains one memorable mid-battle turn or reinforcement beat that makes the fight feel authored and replayable.
- Tasks:
  - Script one concrete phase change or reinforcement beat.
  - Rebalance deployment, timing, and copy around the new flow.
  - Update localized text required by the new beat.
- Exit criteria:
  - `npm test`
  - `npm run build`
  - `PLAYWRIGHT_BASE_URL=<live-url> npm run qa:playthrough`

### 5. Objective UX, wrapper copy, and QA coverage

- GitHub: `#8` `Expose objective phases in HUD, briefing, result copy, and QA coverage`
- Project status: `Todo`
- Depends on: `#7`
- Outcome:
  - Players can read the current objective and understand the encounter structure from briefing through result.
- Tasks:
  - Surface the current objective / phase state in the HUD.
  - Update briefing, mid-battle messaging, and result wrappers.
  - Extend automated and manual QA coverage for the new objective states.
  - Refresh signoff docs that define expected behavior.
- Exit criteria:
  - `npm test`
  - `npm run build`
  - `PLAYWRIGHT_BASE_URL=<live-url> npm run qa:playthrough`
  - `PLAYWRIGHT_BASE_URL=<live-url> npm run qa:hud`

### 6. Open-source placeholder art and audio pass

- GitHub: `#1` `Open-source placeholder asset and audio pass`
- Project status: `Todo`
- Depends on: `#8`
- Outcome:
  - The prototype presentation improves using curated open-source placeholders without blocking a future custom asset swap.
- Tasks:
  - Replace the roughest placeholder visuals with curated open-source packs.
  - Add open-source placeholder SFX and music where they materially help readability or atmosphere.
  - Record source and license details in `docs/asset-replacement-manifest.md`.
  - Leave future generated/final asset replacement for a later manual pass.
- Exit criteria:
  - Visual and audio placeholders are integrated without changing prototype scope.
  - Source and license details are recorded in docs.

### 7. Scenario data extraction

- GitHub: `#9` `Externalize Glenmoor Pass scenario data from content.ts into data files`
- Project status: `Todo`
- Depends on: `#1`
- Outcome:
  - Encounter-specific scenario data can be edited without changing the main source module.
- Tasks:
  - Move battle scenario data into external files.
  - Keep typed loading and validation around the scenario format.
  - Preserve current behavior while changing the content source boundary.
- Exit criteria:
  - `npm test`
  - `npm run build`

### 8. Core content extraction and validation

- GitHub: `#10` `Externalize class, skill, status, and AI content with load validation`
- Project status: `Todo`
- Depends on: `#9`
- Outcome:
  - Class, skill, status, and AI content no longer live in one large source definition block.
- Tasks:
  - Move class, skill, status, and AI profile definitions into external data files or validated modules.
  - Add load-time or test-time validation for content integrity.
  - Preserve deterministic runtime behavior, localization links, and presentation metadata.
- Exit criteria:
  - `npm test`
  - `npm run build`

## Sync Rule

Whenever a backlog item changes status, update:

- this file
- `docs/progress.md`
- the matching GitHub issue
- the GitHub Project item status
