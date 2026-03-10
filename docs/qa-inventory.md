# QA Inventory

This file is the shared coverage list for functional QA and visual QA.
Any final signoff claim for the prototype must map back to one or more entries here.

## User-Visible Claims To Sign Off On

- The game boots into a polished single-battle prototype
- The game fills the browser viewport on load instead of sitting inside a reduced framed card
- The player can read a mission briefing, start the battle, and reach a victory or defeat result screen
- The battlefield is isometric, readable, and visually differentiated by terrain
- Initiative order, unit information, objective text, and combat forecast are visible in the HUD
- The current active unit is visually obvious on both the map and the initiative HUD
- After choosing a destination, move tiles remain visible until the player commits to `Attack`, `Skill`, or `Wait`
- The player can rotate the battlefield in `90°` steps, zoom in/out, and pan without breaking tile interaction
- HUD camera tools mirror the same view state as mouse-wheel zoom and drag pan
- The player can move, attack, use a signature skill, wait, and cancel or reselect where appropriate
- Every combat exchange opens a duel scene and returns to the battlefield without desync
- English and Korean both render correctly for HUD and story-wrapper text
- Enemy AI behaves tactically rather than randomly

## Controls And Behaviors To Verify

- Click active allied unit
- Click map tile to inspect or confirm a move
- Click HUD action buttons:
  - Move
  - Attack
  - Skill
  - Wait
  - Cancel or Back
- Click duel scene skip or fast-forward control
- Click locale switch
- Click briefing start button
- Click result screen restart or return button if implemented
- Spin the mouse wheel to zoom in and out
- Drag the battlefield beyond the pan threshold
- Click HUD camera buttons:
  - Rotate Left
  - Rotate Right
  - Zoom In
  - Zoom Out
  - Pan

## State Changes To Verify

- Battle starts in briefing state, then enters playable battle state
- Active unit changes according to initiative order
- Allied turn start auto-opens reachable move tiles for the active unit
- The original turn-start move range remains available after the first destination is chosen
- Reachable move tiles clear when initiative passes to an enemy turn
- Forecast updates when target or skill changes
- HP, statuses, and facing update after an exchange
- Push succeeds on valid tiles and fails cleanly at edges or blocked tiles
- Counterattacks resolve when conditions are met
- Defeated units are removed from tactical consideration
- Battle exits to victory when all enemies are down
- Battle exits to defeat if all allies are down
- Locale swap updates all supported visible text
- Camera telemetry updates when the board is rotated, zoomed, or panned
- Rotated tile clicks still resolve against the visible board at `90°`, `180°`, and `270°`
- Pan mode suppresses tactical tile clicks while still allowing camera movement
- Restarting the battle resets rotation, zoom, and pan state

## Required Functional Checks

- Start the battle from the briefing screen
- Confirm the first allied turn auto-selects the active unit and opens move range immediately
- Confirm the player can choose one move tile, then choose another move tile before committing an action
- Rotate the battlefield to `90°`, `180°`, and `270°` and confirm the active unit can still retarget using visible tiles
- Use the mouse wheel and HUD zoom controls to change zoom without breaking selection
- Drag beyond the camera threshold and confirm the board pans instead of triggering a tactical click
- Toggle `Pan` and confirm map clicks stop changing tactical state until `Pan` is turned back off
- Restart the battle and confirm the camera resets to its default state
- Complete at least one normal move plus basic attack flow
- Complete at least one signature skill flow
- Observe at least one counterattack
- Observe at least one status application and one stacked-status case
- Observe at least one successful push and one blocked push
- Confirm initiative order advances after each committed turn
- Confirm `Wait` selects the next initiative actor automatically, including enemy turns
- Confirm AI chooses a meaningful action on its turn
- Reach either victory or defeat and verify the result wrapper

## Required Visual Checks

- Initial view at `1600x900`
- Smaller desktop pass at `1280x720`
- Battlefield readability in the densest mid-battle state
- HUD spacing, layering, and text legibility
- Active-unit marker and initiative `Now` row remain easy to identify at a glance
- Duel scene composition, readability, and transition quality
- Briefing and result screen layout
- Initial viewport fit for the gameplay shell, HUD, and controls with no clipped primary controls
- Rotated move overlays remain aligned with the visible terrain and unit positions
- Zoomed and panned views remain readable and keep tile targeting aligned
- English text fit
- Korean text fit

## Exploratory Scenarios

- Cancel a planned action, reselect, and verify no stale highlights remain
- Attempt a push into an occupied tile or map edge and verify the result is explained cleanly
- Trigger a KO during a counterattack and verify battle state stays consistent
- Inspect a dense late-battle state with multiple statuses and confirm HUD clarity

## Evidence To Capture Later

- Desktop screenshots for briefing, mid-battle HUD, duel scene, and result screen
- `render_game_to_text` snapshots for key tactical states
- Console error review after each meaningful interaction burst
- A short note describing what the exploratory pass covered

## Captured On 2026-03-07

- `output/web-game/playthrough/01-briefing-en.png`
- `output/web-game/playthrough/02-battle-en.png`
- `output/web-game/playthrough/03-battle-ko.png`
- `output/web-game/playthrough/05-engagement-duel.png`
- `output/web-game/playthrough/10-push-after.json`
- `output/web-game/playthrough/11-victory.png`
- `output/web-game/playthrough/11-victory.json`
- `output/web-game/viewport-fit/desktop-1600x900-briefing.png`
- `output/web-game/viewport-fit/desktop-1600x900-battle.png`
- `output/web-game/viewport-fit/desktop-1280x720-briefing.png`
- `output/web-game/viewport-fit/desktop-1280x720-battle.png`
- `output/web-game/viewport-fit/desktop-1600x900.json`
- `output/web-game/viewport-fit/desktop-1280x720.json`
- `output/web-game/auto-active-turn/ally-turn-1600x900.png`
- `output/web-game/auto-active-turn/ally-turn-1280x720.png`
- `output/web-game/auto-active-turn/enemy-turn-1600x900.png`
- `output/web-game/auto-active-turn/enemy-turn-1280x720.png`
- `output/web-game/auto-active-turn/ally-turn-1600x900.json`
- `output/web-game/auto-active-turn/after-first-wait.json`
- `output/web-game/auto-active-turn/enemy-turn-1600x900.json`
- `output/web-game/button-click-fix/state-0.json`
- `output/web-game/move-retarget/01-turn-start.png`
- `output/web-game/move-retarget/02-after-first-move.png`
- `output/web-game/move-retarget/03-after-retarget.png`
- `output/web-game/move-retarget/02-after-first-move.json`
- `output/web-game/move-retarget/03-after-retarget.json`
- `output/web-game/camera-controls/01-battle-1600x900.png`
- `output/web-game/camera-controls/02-rotated-1600x900.png`
- `output/web-game/camera-controls/03-zoom-pan-1600x900.png`
- `output/web-game/camera-controls/04-pan-mode-1600x900.png`
- `output/web-game/camera-controls/05-restart-reset-1600x900.json`
- `output/web-game/camera-controls/06-rotated-1280x720.png`
- `output/web-game/camera-controls/06-rotated-1280x720.json`
- `output/web-game/camera-controls-smoke-final/state-0.json`

## Captured On 2026-03-10

- `output/web-game/playthrough/01-briefing-en.png`
- `output/web-game/playthrough/02-battle-en.png`
- `output/web-game/playthrough/03-battle-ko.png`
- `output/web-game/playthrough/05-engagement-duel-start.png`
- `output/web-game/playthrough/05-engagement-duel-mid.png`
- `output/web-game/playthrough/05-engagement-duel-end.png`
- `output/web-game/playthrough/08-skill-duel-mid.png`
- `output/web-game/playthrough/10-push-duel-mid.png`
- `output/web-game/playthrough/11-victory-duel-end.png`
- `output/web-game/camera-controls/01-battle-1600x900.png`
- `output/web-game/camera-controls/02-rotated-1600x900.png`
- `output/web-game/camera-controls/03-zoom-pan-1600x900.png`
- `output/web-game/camera-controls/04-pan-mode-1600x900.png`
- `output/web-game/camera-controls/05-restart-reset-1600x900.json`
- `output/web-game/camera-controls/06-rotated-1280x720.png`
- `output/web-game/camera-controls/06-rotated-1280x720.json`

## Current Gap

- Tactical flows, locale rendering, duel presentation, blocked push handling, and victory wrapping are covered by artifacts plus automated tests.
- Auto-active turn presentation, briefing start, and provisional movement retargeting are now covered by screenshots plus state snapshots.
- `qa:playthrough` and `qa:camera` now drive briefing start, locale swap, combat commands, tile targeting, camera rotation, zoom, pan, and restart through real DOM or pointer inputs.
- The remaining debug tile-projection dependency is now isolated to `qa:hud`; `qa:playthrough` and `qa:camera` no longer call `window.__glenmoorDebug.projectTile()`.
- The viewport-fit regression for the fullscreen shell must be rechecked at `1600x900` and `1280x720` after any future HUD layout changes.
- At `1280x720`, the lower `View` and `Forecast` cards are reachable through the right-panel's internal scroll area rather than fitting fully in the first visible panel frame.
