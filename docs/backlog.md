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
  - The final app-side `window.__glenmoorDebug.projectTile()` dependency was removed in `#5` when `qa:hud` migrated to the shared external projection helper.

### 2. Short-height HUD fit and locale readability

- GitHub: `#5` `Compact the battle HUD for 1280x720 and locale-fit readability`
- Project status: `Done`
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
- Notes:
  - Added short-height HUD compaction rules for the topbar, active-unit card, initiative rail, action menu, and target-detail popup.
  - `scripts/qa/hud-polish.mjs` now uses the shared external projection helper plus real DOM locale/command clicks.
  - `window.__glenmoorDebug.projectTile()` was removed after all browser QA flows stopped depending on it.

### 3. Multi-phase objective model and runtime event hooks

- GitHub: `#6` `Add multi-phase objectives and battle event hooks to the tactics core`
- Project status: `Done`
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
- Notes:
  - `BattleDefinition` and `BattleState` now support authored objective phases, phase-scoped copy keys, and resolved scripted-event tracking.
  - The deterministic runtime now evaluates `eliminate-team`, `defeat-unit`, and `turn-at-least` objective conditions and can switch phases or deploy reinforcements from scripted hooks.
  - Supported scripted triggers are `battle-start`, `turn-start`, and `unit-defeated`; supported effects are `set-objective-phase` and `deploy-unit`.
  - The core model is in place, but the first authored mid-battle phase beat remains deferred to `#7`.

### 4. Authored Glenmoor Pass phase beat

- GitHub: `#7` `Author a phased Glenmoor Pass encounter with one memorable mid-battle beat`
- Project status: `Done`
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
- Notes:
  - The live Glenmoor Pass encounter now opens on a `break-the-line` objective focused on collapsing the ridge shield wall rather than generic full-rout cleanup.
  - When `shieldbearer` falls, the encounter shifts into `hunt-the-captain`, deploys two reserve enemies from the ford road, and changes end-state copy to the reserve-horn beat.
  - The authored beat is covered by runtime tests plus browser regression on the existing playthrough path; explicit player-facing phase-transition QA artifacts remain deferred to `#8`.

### 5. Objective UX, wrapper copy, and QA coverage

- GitHub: `#8` `Expose objective phases in HUD, briefing, result copy, and QA coverage`
- Project status: `Done`
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
- Notes:
  - The HUD topbar now shows both the current turn and the authored objective-phase progress (`Battle Phase 1/2`, `2/2`) instead of only the raw objective sentence.
  - Briefing, victory, and defeat wrappers now include a dedicated objective callout so the current or final encounter goal is visible alongside the narrative copy.
  - Mid-battle phase shifts now surface an objective-update announcement card driven by the phase definition's localized `announcementKey`.
  - `qa:playthrough` and `qa:hud` now capture and assert briefing objective callouts, reserve-beat phase progress, and the authored objective-update announcement.

### 6. Open-source placeholder art and audio pass

- GitHub: `#1` `Open-source placeholder asset and audio pass`
- Project status: `Done`
- Depends on: `#8`
- Outcome:
  - The prototype presentation improves using curated open-source placeholders without blocking a future custom asset swap.
- Tasks:
  - Replace the roughest placeholder visuals with curated open-source packs.
  - Add open-source placeholder SFX and music where they materially help readability or atmosphere.
  - Record source and license details in `docs/assets/asset-replacement-manifest.md`.
  - Leave future generated/final asset replacement for a later manual pass.
- Exit criteria:
  - Visual and audio placeholders are integrated without changing prototype scope.
  - Source and license details are recorded in docs.
- Notes:
  - The HUD and modal presentation now use Kenney `UI pack: RPG extension` textures for panel framing, inset cards, and the primary CTA button.
  - The app shell and duel scene now use the OpenGameArt `Parchment background` texture as a temporary fantasy backdrop.
  - Menu, battle, and result SFX now use Kenney `Interface Sounds`, and the live battle scene now starts the OpenGameArt `Cynic Battle Loop` music bed.
  - `docs/assets/asset-replacement-manifest.md` now records local file paths, source URLs, and license details for every integrated placeholder asset.

### 7. Scenario data extraction

- GitHub: `#9` `Externalize Glenmoor Pass scenario data from content.ts into data files`
- Project status: `Done`
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
- Notes:
  - Glenmoor Pass now loads from `src/game/data/glenmoor-pass.scenario.json` through `src/game/scenario-loader.ts` instead of a large inline object in `content.ts`.
  - The loader performs structural parsing plus duplicate-id and phase-reference checks before `content.ts` exports the definition.
  - `validateBattleDefinitionContent()` now locks class, AI, deployed-unit, trigger-unit, and objective-unit references against the live content registry.
  - Regression for the new data boundary now includes `npm test`, `npm run build`, `PLAYWRIGHT_BASE_URL=<live-url> npm run qa:playthrough`, and the browser smoke script.

### 8. Core content extraction and validation

- GitHub: `#10` `Externalize class, skill, status, and AI content with load validation`
- Project status: `Done`
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
- Notes:
  - Class, skill, status, and AI authoring data now live in `src/game/data/*.json` instead of the large inlined blocks that used to sit in `content.ts`.
  - `src/game/content-loader.ts` now parses those JSON files into typed runtime records and validates duplicate ids, status references inside skills, signature-skill references inside classes, and basic-attack presentation ids.
  - `src/game/content.ts` now keeps terrain and attack-presentation code locally while loading the external content registry before validating the external Glenmoor Pass scenario.
  - Regression for this content boundary now includes `npm test`, `npm run build`, `PLAYWRIGHT_BASE_URL=<live-url> npm run qa:playthrough`, and the browser smoke script.

## Sync Rule

Whenever a backlog item changes status, update:

- this file
- `docs/progress.md`
- the matching GitHub issue
- the GitHub Project item status
