# Progress Log

This is the canonical implementation log for `Glenmoor Story`.

## 2026-03-07

### Completed

- Renamed the working branch to `main`
- Connected the repository to `https://github.com/hyunghwan/glenmoor-story.git`
- Created the project documentation set:
  - `docs/plan.md`
  - `docs/game-design.md`
  - `docs/progress.md`
  - `docs/qa-inventory.md`
  - `docs/assets/asset-replacement-manifest.md`
  - root `progress.md`
- Created a documented scope guardrail around a single-battle prototype
- Implemented a Phaser-based playable battle shell with:
  - isometric 16x16 terrain map loaded from Tiled-style JSON
  - localized DOM HUD for objective, unit cards, initiative, and battle feed
  - a separate duel scene for attacks and skills
  - deterministic tactics logic for initiative, terrain, height, facing, status, counters, and push
  - enemy AI scoring for lethal preference, support choices, and fallback positioning
- Added tactical regression tests in `tests/runtime.test.ts` and `tests/ai.test.ts`
- Added automated QA capture scripts and artifacts under `scripts/qa/` and `output/web-game/`
- Enabled `js_repl` in `~/.codex/config.toml` for the next session to unblock the full `playwright-interactive` workflow
- Expanded the shell from a framed `1280x720` presentation to a fullscreen viewport layout with responsive HUD column sizing so the battlefield and controls remain easier to click
- Reworked turn presentation around the initiative queue and active unit:
  - allied turns now auto-open move range without an extra unit click
  - `selectedUnitId` now follows `activeUnitId` on battle start and after each committed turn
  - enemy turns now auto-select and highlight the active enemy while keeping move tiles hidden
  - initiative HUD now renders as a structured ordered queue with a dedicated current-turn readout
  - active units now receive a stronger on-map marker, tile highlight, and `NOW` badge
- Hardened HUD command delegation so DOM-triggered `button.click()` reliably advances the briefing into battle
- Fixed the flaky `Commence Battle` interaction path by:
  - dispatching HUD commands on `pointerdown` instead of waiting for `click`
  - suppressing board-hover HUD rerenders while modal overlays are active
- Changed movement to stay provisional until the player picks an action:
  - selecting a destination no longer collapses move tiles immediately
  - the unit can be retargeted to another tile inside the original turn-start move range
  - pressing `attack` or `skill` hides move tiles, and `cancel` restores them for repositioning
  - pressing `wait` finalizes the turn and advances initiative as before
- Added battle camera controls for crowded maps:
  - `Rotate Left` and `Rotate Right` now re-project the battlefield in `90°` steps without changing logical grid coordinates
  - mouse-wheel zoom and HUD zoom buttons share the same clamped camera zoom path
  - drag-to-pan now activates after a short threshold, and the `Pan` toggle forces camera-only drag behavior
  - battle restart resets rotation, zoom, and pan mode back to defaults
- Fixed the underlying pointer-routing issues that blocked reliable board interaction:
  - `hud-root` no longer intercepts battlefield clicks meant for the canvas
  - tile zones now stop propagation before the full-battlefield pan catcher can overwrite the clicked tile candidate
  - unit hit areas are disabled during move mode so nearby destination tiles stay clickable
- Added camera-specific browser QA coverage in `scripts/qa/camera-controls.mjs`
- Added deployment-specific `startingHp` support on unit blueprints so battle balance can be tuned per encounter without changing shared class stats
- Softened the Glenmoor Pass encounter by lowering the opening HP of `brigandCaptain`, `huntmaster`, `hexbinder`, and `cutpurse`
- Added a runtime regression that locks the battle-specific starting HP overrides
- Rebalanced core combat roles without changing the shared class roster:
  - `vanguard` control shifted further into `Shield Bash` instead of pure burst
  - `ranger` slow uptime increased
  - `arcanist` and `skirmisher` burst windows were trimmed
  - `warden` and `cleric` support ranges were extended
  - initiative order now opens on `elira` after the `skirmisher` speed reduction
- Added structured combat presentation data on `CombatResolution` so duel playback, forecast text, and battle-feed summaries all read from the same source
- Rebuilt the duel scene into automatic step playback with:
  - announce / impact / effects / counter / defeat sequencing
  - per-step HP transitions on both combatant cards
  - persistent status readouts
  - duel telemetry exposed to `render_game_to_text`
- Tightened AI behavior so support units stop repeating zero-heal duplicate warding, ranged units advance toward usable firing lines, and weak signature skills lose to basic attacks when they are not materially better
- Hardened browser QA scripts by:
  - switching duel validation from fixed waits to telemetry-driven step checks
  - making `scripts/qa/playthrough.mjs` and `scripts/qa/camera-controls.mjs` honor `PLAYWRIGHT_BASE_URL`
- Added combat-text helper coverage to lock forecast/feed consistency on top of the new runtime and AI assertions

### Verification

- `npm test` passes with 20 tactical, AI, UI-model, and camera assertions
- `npm test` now passes with 27 tactical, AI, camera, combat-text, and runtime assertions
- `npx tsc --noEmit` passes
- `npm run build` completes successfully
- `npm run qa:playthrough` generates English/Korean, duel, push, and victory evidence:
  - `output/web-game/playthrough/02-battle-en.png`
  - `output/web-game/playthrough/03-battle-ko.png`
  - `output/web-game/playthrough/05-engagement-duel.png`
  - `output/web-game/playthrough/11-victory.png`
- Viewport-fit QA should explicitly confirm fullscreen shell coverage plus unclipped primary HUD controls at `1600x900` and `1280x720`
- Fullscreen viewport-fit verification now passes at both desktop checkpoints with fresh artifacts:
  - `output/web-game/viewport-fit/desktop-1600x900-briefing.png`
  - `output/web-game/viewport-fit/desktop-1600x900-battle.png`
  - `output/web-game/viewport-fit/desktop-1280x720-briefing.png`
  - `output/web-game/viewport-fit/desktop-1280x720-battle.png`
  - `output/web-game/viewport-fit/desktop-1600x900.json`
  - `output/web-game/viewport-fit/desktop-1280x720.json`
- Auto-active turn verification now passes with fresh evidence:
  - battle start enters `phase=active`, `mode=move`, and exposes non-empty `reachableTiles`
  - first `Wait` advances to `elira`, keeps `selectedUnitId === activeUnitId`, and auto-opens move tiles again
  - second `Wait` advances to enemy `cutpurse`, keeps `selectedUnitId === activeUnitId`, and clears move tiles
  - artifacts:
    - `output/web-game/auto-active-turn/ally-turn-1600x900.png`
    - `output/web-game/auto-active-turn/ally-turn-1280x720.png`
    - `output/web-game/auto-active-turn/enemy-turn-1600x900.png`
    - `output/web-game/auto-active-turn/enemy-turn-1280x720.png`
    - `output/web-game/auto-active-turn/ally-turn-1600x900.json`
    - `output/web-game/auto-active-turn/after-first-wait.json`
    - `output/web-game/auto-active-turn/enemy-turn-1600x900.json`
- Pointer and provisional-move verification now passes with fresh evidence:
  - headless Playwright `page.click()` now advances the briefing button into `phase=active`
  - after moving `sable` from `(4,12)` to `(5,12)`, the scene remains in `mode=move` with the original move range still visible
  - the same turn can retarget `sable` again to `(3,12)` while keeping move tiles visible
  - `wait` still advances cleanly to `elira` with a fresh auto-open move range
  - artifacts:
    - `output/web-game/button-click-fix/state-0.json`
    - `output/web-game/move-retarget/01-turn-start.png`
    - `output/web-game/move-retarget/02-after-first-move.png`
    - `output/web-game/move-retarget/03-after-retarget.png`
    - `output/web-game/move-retarget/02-after-first-move.json`
    - `output/web-game/move-retarget/03-after-retarget.json`
- Camera-control verification now passes with fresh evidence:
  - real pointer clicks still retarget the active unit after `90°`, `180°`, and `270°` rotations
  - mouse-wheel zoom and drag pan update camera telemetry and keep overlays aligned
  - `Pan` mode suppresses tactical tile clicks until the toggle is turned back off
  - battle restart resets camera state to `rotation=0`, `zoom=1`, and `panModeActive=false`
  - artifacts:
    - `output/web-game/camera-controls/01-battle-1600x900.png`
    - `output/web-game/camera-controls/02-rotated-1600x900.png`
    - `output/web-game/camera-controls/03-zoom-pan-1600x900.png`
    - `output/web-game/camera-controls/04-pan-mode-1600x900.png`
    - `output/web-game/camera-controls/05-restart-reset-1600x900.json`
    - `output/web-game/camera-controls/06-rotated-1280x720.png`
    - `output/web-game/camera-controls/06-rotated-1280x720.json`
    - `output/web-game/camera-controls-smoke-final/state-0.json`
- Difficulty-tuning verification now passes with fresh evidence:
  - the battle-start telemetry shows `brigandCaptain=27/30`, `huntmaster=20/22`, `hexbinder=18/20`, and `cutpurse=21/24`
  - the battle scene still renders cleanly with partially depleted enemy HP bars and no new console-error artifact
  - artifacts:
    - `output/web-game/difficulty-tuning/shot-0.png`
    - `output/web-game/difficulty-tuning/state-0.json`
- `npm run qa:playthrough` completes successfully after the balance change
- Duel-readability playthrough verification now passes against the telemetry-driven step flow:
  - engagement, skill, push, and victory demos now capture duel start, mid-step impact, and final-step states before resolution completes
  - artifacts:
    - `output/web-game/playthrough/05-engagement-duel-start.png`
    - `output/web-game/playthrough/05-engagement-duel-mid.png`
    - `output/web-game/playthrough/05-engagement-duel-end.png`
    - `output/web-game/playthrough/08-skill-duel-mid.png`
    - `output/web-game/playthrough/10-push-duel-mid.png`
    - `output/web-game/playthrough/11-victory-duel-end.png`
- Camera-control verification still passes after the initiative/balance changes when run against a live dev URL via `PLAYWRIGHT_BASE_URL`

### Next Steps

- Sync the implementation backlog into GitHub Project items and keep those cards updated as scope changes
- Restart Codex in a new session so `js_repl` is available for persistent `playwright-interactive`
- Replace placeholder generated visuals/audio with curated open-source packs when the concept stabilizes
- Extend raw-pointer browser coverage from camera + tile retargeting into complete attack / skill confirmation flows

### Notes

- Keep documentation English-first
- Keep GitHub Project items synchronized with actual implementation status, not aspirational status
- Do not let the prototype expand into campaign systems
- Headless Playwright `page.click()` on the briefing button now succeeds after the HUD input-path fix
- Camera QA now uses real pointer clicks for movement, rotation, zoom, and pan; the only remaining debug assist is the tile-projection helper that converts logical tiles into browser click coordinates
- At `1280x720`, the lower `View` and `Forecast` cards rely on the right-panel's internal scroll area rather than fitting fully above the fold

## 2026-03-09

### Completed

- Promoted battlefield rendering to `Phaser.AUTO` with a Matter-enabled scene config so WebGL-first FX can run without changing deterministic tactics rules
- Added presentation metadata across combat content:
  - skills and statuses now declare `fxCueId`, `telegraphStyle`, `castMs`, `impactMs`, `cameraCue`, `matterProfile`, and `tone`
  - classes now declare `basicAttackPresentationId`
  - combat presentation steps now carry `fxCueId`, source/target points, camera cues, and impulse hints
- Expanded runtime presentation output from coarse duel beats into `announce`, `cast`, `projectile`, `hit`, `status`, `push`, `counter`, `defeat`, and `recover` steps while keeping damage, status, counter, and turn rules unchanged
- Rebuilt battlefield presentation layers in `BattleScene`:
  - layered move / range / target telegraphs with lethal, counter, status, and push accents
  - persistent status-aura rendering for `burning`, `guardBreak`, `warded`, and `slow`
  - Matter-driven ambient particles for target emphasis and status FX
  - screen-space danger pulses for lethal and counter previews
- Extended HUD forecast data with structured telegraph summaries so map markers and detail cards now expose `lethal`, `counterRisk`, `predictedStatusIds`, `pushOutcome`, and `markerTone`
- Updated the duel scene with readable combat motion:
  - cast windups, projectile travel, hit flashes, status bursts, push slides, defeat fades, and recover beats
  - richer duel telemetry now reports `stepKind`, `fxCueId`, and `targetUnitId`
- Hardened camera and duel interaction reliability:
  - added a pointer-gesture fallback that safely completes clicks when Phaser misses a `pointerup` during rotated map interaction
  - held the duel's final `recover` beat long enough for telemetry-driven QA capture
- Fixed duel-side team accents so enemy-initiated zoomed combat no longer paints the left combatant with ally colors
- Refreshed browser QA scripts so each run clears stale artifacts before capture and validates the new presentation telemetry fields

### Verification

- `npm test`
- `npx tsc --noEmit`
- `npm run build`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run qa:playthrough`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run qa:camera`
- Fresh QA evidence was regenerated under:
  - `output/web-game/playthrough/`
  - `output/web-game/camera-controls/`

## 2026-03-10

### Completed

- Converted the next prototype steps into a concrete execution backlog in `docs/backlog.md`
- Synced the backlog into the GitHub Project `Glenmoor Story` with issue-backed items:
  - `#4` complete pointer-only browser QA coverage and remove the final debug assist
  - `#5` compact the battle HUD for `1280x720` and locale-fit readability
  - `#6` add multi-phase objectives and battle event hooks to the tactics core
  - `#7` author a phased Glenmoor Pass encounter with one memorable mid-battle beat
  - `#8` expose objective phases in HUD, briefing, result copy, and QA coverage
  - `#1` open-source placeholder asset and audio pass
  - `#9` externalize Glenmoor Pass scenario data from `content.ts` into data files
  - `#10` externalize class, skill, status, and AI content with load validation
- Updated the existing open issues so their scope reflects the current execution plan:
  - `#4` now tracks the pointer-only QA finish line rather than generic browser automation
  - `#1` now records the open-source-only placeholder art/audio direction for the later polish pass
- Completed backlog item `#4` by moving the main browser QA flows onto real player input paths:
  - added `scripts/qa/projection.mjs` so automation can convert tactical tiles into browser client coordinates from telemetry plus map data instead of calling app-side `projectTile()`
  - changed `scripts/qa/playthrough.mjs` to click real briefing, locale, and action-menu buttons and to confirm attack / skill / push / victory targets through projected canvas clicks
  - changed `scripts/qa/camera-controls.mjs` to hover and click rotated tiles through the shared projection helper and to restart through a real HUD command
  - extended `render_game_to_text()` telemetry with `mapId` and `boardProjection` metadata so external QA can project tile coordinates without internal scene helpers
  - exposed an in-battle `restart-battle` HUD control so camera reset coverage no longer depends on a debug command path
- Left `window.__glenmoorDebug.stage()` in place as the only staged setup shortcut for the scripted QA scenarios
- Completed backlog item `#5` by compacting the short-height desktop HUD and finishing the last browser-QA debug cleanup:
  - added `max-height` responsive HUD rules so the topbar, active-unit card, initiative rail, action menu, and target-detail popup shrink cleanly at `1280x720`
  - changed `scripts/qa/hud-polish.mjs` to use the shared external projection helper plus real DOM locale and command clicks instead of debug command or `projectTile()` shortcuts
  - extended HUD QA coverage with `1280x720 EN/KO` start-state checks and `1280x720` target-detail checks for forecast readability
  - removed `window.__glenmoorDebug.projectTile()` from the app after `qa:hud` no longer depended on it
- Completed backlog item `#6` by adding deterministic phase-objective and scripted-event support to the tactics runtime:
  - extended battle definitions and runtime state with authored objective phases, phase-scoped objective / briefing / result copy keys, and resolved event tracking
  - added deterministic objective evaluation for `eliminate-team`, `defeat-unit`, and `turn-at-least` conditions instead of hardwiring battle resolution to only team wipe checks
  - added scripted runtime hooks for `battle-start`, `turn-start`, and `unit-defeated` plus `set-objective-phase` and `deploy-unit` effects so future authored encounter beats can switch goals or spawn reinforcements without scene-specific code
  - updated the scene HUD / telemetry layer to surface the active objective phase and to read wrapper copy from runtime state rather than static battle-definition keys
  - added runtime tests covering reinforcement deployment on phase shift, turn-count victory, and phase-specific defeat conditions
- Completed backlog item `#7` by authoring the first live mid-battle beat in Glenmoor Pass:
  - changed the opening live objective from generic full rout into a `break-the-line` phase centered on defeating the ridge `shieldbearer`
  - scripted the authored phase shift so `shieldbearer`'s defeat flips the objective to `hunt-the-captain` and deploys two reserve enemies from the ford road
  - rewrote Glenmoor Pass briefing and result copy in both locales to foreshadow and resolve the reserve-horn beat
  - reset debug stage setup to the initial objective phase and cleared resolved scripted events so browser QA stages remain deterministic after live-battle authoring changes
  - extended `scripts/qa/playthrough.mjs` with a staged `phase-demo` flow that captures the shield-line collapse, objective-copy swap, and reserve deployment through real action targeting
  - added runtime coverage asserting the real Glenmoor Pass content now shifts phases, deploys reserves, and awards victory on the captain kill even while reserves remain alive
- Completed backlog item `#8` by making the authored objective state visible from briefing through result:
  - added explicit objective-phase progress tags to the HUD topbar so the live battle now surfaces `Battle Phase 1/2` and `2/2` alongside the current objective text
  - added briefing and result-wrapper objective callouts so the current or final goal remains visible inside the modal copy instead of only in the battle HUD
  - added a localized objective-update announcement card for mid-battle phase shifts, using the phase definition's announcement key when the reserve beat triggers
  - extended `qa:playthrough` to assert briefing objective callouts, phase-progress tags, phase-update announcements, and result-wrapper objective copy
  - extended `qa:hud` with a live `phase-demo` scenario that validates the authored phase-shift HUD state and keeps the new announcement card inside the viewport
- Completed backlog item `#1` by integrating curated open-source placeholder art and audio:
  - added Kenney `UI pack: RPG extension` textures to the HUD card, modal frame, objective inset, and primary CTA button treatments
  - added the OpenGameArt `Parchment background` texture to the app shell and duel scene as a temporary fantasy backdrop
  - added Kenney `Interface Sounds` for UI confirm / cancel / select, movement confirm, hit / skill cues, and victory / defeat stings
  - added the OpenGameArt `Cynic Battle Loop` as the live battle music bed
  - recorded exact source URLs, licenses, and local file paths in `docs/assets/asset-replacement-manifest.md` while keeping terrain, unit, and VFX art swaps explicitly disposable for future replacement
- Completed backlog item `#9` by moving authored scenario content behind a validated data boundary:
  - extracted the full Glenmoor Pass encounter definition into `src/game/data/glenmoor-pass.scenario.json`
  - added `src/game/scenario-loader.ts` to parse external scenario JSON into typed runtime data and to reject malformed structure, duplicate ids, and unknown phase references
  - changed `src/game/content.ts` to load and validate the external scenario against the live class and AI registries before exporting `battleDefinition`
  - added `tests/scenario-loader.test.ts` coverage for successful load, content-registry validation, and broken phase / class reference failures
- Completed backlog item `#10` by extracting the rest of the gameplay content registry:
  - moved status, skill, class, and AI profile authoring data into `src/game/data/status-definitions.json`, `src/game/data/skill-definitions.json`, `src/game/data/class-definitions.json`, and `src/game/data/ai-profiles.json`
  - added `src/game/content-loader.ts` to parse those JSON files into typed runtime records and to reject malformed definitions, duplicate ids, unknown status links inside skills, and broken signature-skill / attack-presentation references inside classes
  - reduced `src/game/content.ts` to the code-owned terrain and attack-presentation registry plus validated loading of the external content and scenario data
  - added `tests/content-loader.test.ts` coverage for the happy path plus broken status-link and basic-attack-presentation failures

### Verification

- `npm test`
- `npm run build`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run qa:playthrough`
- `QA_CAMERA_INCLUDE_1280=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run qa:camera`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run qa:hud`
- `node "$CODEX_HOME/skills/develop-web-game/scripts/web_game_playwright_client.js" --url http://127.0.0.1:4173 --actions-file scripts/qa/smoke-actions.json --iterations 1 --pause-ms 250`

### Notes

- The execution order remains sequential: `#4 -> #5 -> #6 -> #7 -> #8 -> #1 -> #9 -> #10`
- Keep the prototype scoped to one battle even as the authored encounter flow becomes deeper
- Keep docs and project-board status aligned when individual backlog items move
- All current browser QA flows now use telemetry-driven external tile projection; app-side `window.__glenmoorDebug.projectTile()` has been removed
- `1280x720` HUD compaction now keeps the active-unit card, initiative rail, and target-detail forecast readable without relying on an initial scroll pass
- The runtime now supports phase-based objectives and scripted event hooks, and Glenmoor Pass now uses that model for a live reserve-beat phase shift
- The authored objective flow is now surfaced in briefing, active-battle HUD, mid-battle update messaging, and result wrappers, and the prototype now layers curated open-source HUD/audio placeholders on top of the deterministic battle slice
- Terrain, unit, and effect sprites remain the main disposable visual placeholder layer even after this open-source polish pass
- Glenmoor Pass scenario authoring now lives in `src/game/data/glenmoor-pass.scenario.json`, while `content.ts` only exports the validated loaded definition
- Class, skill, status, and AI authoring now also live in validated JSON data files, so `content.ts` is down to terrain, attack presentation, and loader wiring

## 2026-03-12

### Completed

- Finished the tactile-feedback polish pass QA refresh:
  - `scripts/qa/playthrough.mjs` now captures the commit-burst beat and waits for the animated victory modal settle state
  - `scripts/qa/hud-polish.mjs` now validates the victory modal entrance treatment at `1600x900 EN` and `1280x720 KO`
  - fresh QA artifacts were regenerated under `output/web-game/playthrough/` and `output/web-game/hud-polish/`
- Extended the tactics core with a typed terrain-reaction layer:
  - added `TerrainReactionId` and `TerrainReactionResult`
  - extended `CombatTelegraphSummary` with `terrainReactions`
  - added a `terrain` `CombatPresentationStep` kind so battle and duel scenes can consume reaction beats directly
- Implemented three readable terrain reactions without changing the prototype scope:
  - `Forest Kindling` adds extra `burning` plus `+2` damage when fire / burning chains land on forest targets
  - `Ruins Echo` adds `+2` healing plus stronger `warded` support when ally support skills resolve on ruins
  - `Bridge Drop` turns a bridge-edge push toward water into an immediate defeat and suppresses counterplay
- Updated battlefield and duel presentation to surface those rules before and during action resolution:
  - target previews now show terrain-reaction verdict chips and reaction-aware amount / effect summaries
  - battle telegraphs now add ember, ward, and drop-warning overlays for forest, ruins, and bridge reactions
  - duel playback now renders dedicated terrain beats for forest flare, ruins echo, and bridge splash / drop finishers
- Updated tactical readability and authored coverage around the new rules:
  - AI now treats `bridge-drop` as a lethal line, gives `forest-kindling` and `ruins-echo` positive score weight, and penalizes ending on bridge tiles threatened by enemy pushes
  - English and Korean localization now include terrain-reaction labels in forecast text and battle feed output
  - browser QA now includes staged `forest-demo`, `ruins-demo`, and `bridge-demo` scenarios in both playthrough and HUD-polish flows

### Verification

- `npm test`
- `npm run build`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run qa:playthrough`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run qa:hud`
- `node "$CODEX_HOME/skills/develop-web-game/scripts/web_game_playwright_client.js" --url http://127.0.0.1:4173 --actions-file scripts/qa/smoke-actions.json --iterations 1 --pause-ms 250`

### Notes

- The terrain-reaction rules are code-authored for v1 and do not introduce new scenario-schema requirements or persistent tile state
- The acceptance focus remains readability: players should be able to predict reaction outcomes from HUD chips, overlays, and duel step messaging before confirming an action
- Representative fresh evidence includes:
  - `output/web-game/hud-polish/11-forest-reaction-target-detail-1600-en.png`
  - `output/web-game/hud-polish/12-ruins-reaction-target-detail-1280-ko.png`
  - `output/web-game/hud-polish/13-bridge-reaction-target-detail-1280-en.png`
  - `output/web-game/playthrough/16-bridge-duel-mid.png`

## 2026-03-14

### Completed

- Implemented a mobile-first presentation layer on top of the existing tactics prototype:
  - `src/main.ts` now drives a responsive battlefield shell that resizes Phaser to the real gameplay region instead of letterboxing a fixed `1280x720` canvas
  - added `desktop`, `mobile-portrait`, and `mobile-landscape` layout modes plus portrait battlefield height budgeting
  - added viewport-aware projection origin and default zoom helpers so tile scale remains touch-readable on phones
- Reworked the battle HUD for mobile and assistive access:
  - action menus can now render as desktop anchored popups or mobile bottom docks
  - target detail can now render as a desktop popup or a mobile sheet card
  - mobile now uses a collapsible info sheet instead of permanently showing the full active-unit and initiative stack
  - added a DOM-based accessible battle panel that exposes commands, reachable tiles, and targetable units without requiring canvas interaction
- Added persisted accessibility preferences and browser-surface integration:
  - text scale (`100/115/130`), high contrast, and reduced motion now persist in local storage
  - locale changes now also update document language
  - live battle messaging is mirrored into an aria-live region
- Updated duel presentation and QA:
  - duel staging now compacts for portrait and landscape mobile layouts
  - reduced-motion preference now suppresses duel camera shake / flash cues
  - added `tests/responsive.test.ts` and `scripts/qa/mobile-accessibility.mjs`
  - extended package scripts with `npm run qa:mobile`

### Verification

- `npm test`
- `npm run build`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run qa:mobile`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run qa:hud`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run qa:camera`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run qa:playthrough`

### Notes

- Mobile portrait now reserves more than half of the viewport height for the battlefield and keeps quick controls at or above the `48px` touch target floor in automated QA.
- The accessible DOM control path is intentionally layered on top of the same tactics commands rather than duplicating game rules in a separate controller.
