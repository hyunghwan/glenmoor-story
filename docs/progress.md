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

### Verification

- `npm test` passes with 10 tactical and AI assertions
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

### Next Steps

- Sync the implementation backlog into GitHub Project items and keep those cards updated as scope changes
- Restart Codex in a new session so `js_repl` is available for persistent `playwright-interactive`
- Replace placeholder generated visuals/audio with curated open-source packs when the concept stabilizes
- Extend pointer-driven browser coverage from HUD buttons into fully scripted tile-selection and action-confirmation passes

### Notes

- Keep documentation English-first
- Keep GitHub Project items synchronized with actual implementation status, not aspirational status
- Do not let the prototype expand into campaign systems
- Headless Playwright `page.click()` on the briefing button now succeeds after the HUD input-path fix
- Gameplay-state QA for movement retargeting still uses the debug bridge for tile selection because it is faster and deterministic for scripted regression checks
