# QA Inventory

This file is the shared coverage list for functional QA and visual QA.
Any final signoff claim for the prototype must map back to one or more entries here.

## User-Visible Claims To Sign Off On

- The game boots into a polished single-battle prototype
- The player can read a mission briefing, start the battle, and reach a victory or defeat result screen
- The battlefield is isometric, readable, and visually differentiated by terrain
- Initiative order, unit information, objective text, and combat forecast are visible in the HUD
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

## State Changes To Verify

- Battle starts in briefing state, then enters playable battle state
- Active unit changes according to initiative order
- Reachable move tiles update when unit selection changes
- Forecast updates when target or skill changes
- HP, statuses, and facing update after an exchange
- Push succeeds on valid tiles and fails cleanly at edges or blocked tiles
- Counterattacks resolve when conditions are met
- Defeated units are removed from tactical consideration
- Battle exits to victory when all enemies are down
- Battle exits to defeat if all allies are down
- Locale swap updates all supported visible text

## Required Functional Checks

- Start the battle from the briefing screen
- Complete at least one normal move plus basic attack flow
- Complete at least one signature skill flow
- Observe at least one counterattack
- Observe at least one status application and one stacked-status case
- Observe at least one successful push and one blocked push
- Confirm initiative order advances after each committed turn
- Confirm AI chooses a meaningful action on its turn
- Reach either victory or defeat and verify the result wrapper

## Required Visual Checks

- Initial view at `1600x900`
- Smaller desktop pass at `1280x720`
- Battlefield readability in the densest mid-battle state
- HUD spacing, layering, and text legibility
- Duel scene composition, readability, and transition quality
- Briefing and result screen layout
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

## Current Gap

- Tactical flows, locale rendering, duel presentation, blocked push handling, and victory wrapping are covered by artifacts plus automated tests.
- A true pointer-driven Playwright pass is still pending because DOM click delivery was unreliable in the current session; `js_repl` has been enabled for the next Codex session to continue with `playwright-interactive`.
