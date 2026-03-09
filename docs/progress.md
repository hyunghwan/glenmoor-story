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
  - `docs/asset-replacement-manifest.md`
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
