Original prompt: Build `Glenmoor Story`, a browser-first isometric fantasy SRPG inspired by `Fire Emblem` and `Final Fantasy Tactics`, using a web-friendly engine suited for Playwright validation, with mouse-first controls, one polished battle, placeholder assets, English-first content plus Korean localization, Markdown project docs, GitHub Project sync, and a branch rename from `master` to `main`.

This file exists for agent handoff continuity required by the `develop-web-game` workflow.
The canonical implementation log lives in `docs/progress.md`.

## 2026-03-07

- Repository branch renamed to `main`
- GitHub remote connected at `hyunghwan/glenmoor-story`
- Dedicated docs set initialized
- Current working build:
  - Phaser battle prototype is playable
  - deterministic battle logic, duel scene, and localized HUD are wired up
  - the game shell now expands to the full browser viewport with narrower responsive side HUD columns
  - short-height desktop layout now keeps the battle feed centered so the Initiative panel remains fully visible at `1280x720`
  - allied turns now auto-open move range, and `Wait` advances selection cleanly to the next initiative actor
  - the active actor now has a stronger map marker plus a structured initiative queue with a dedicated current-turn readout
  - `Commence Battle` now responds to real pointer clicks reliably
  - after moving, the player can retarget to another tile inside the original move range until choosing `Attack`, `Skill`, or `Wait`
  - the battle camera now supports `90°` rotation, wheel/HUD zoom, threshold drag pan, and an explicit `Pan` toggle
  - battlefield clicks now route cleanly to Phaser because `hud-root` no longer intercepts canvas input
  - move mode no longer lets oversized unit hitboxes block nearby destination tiles
  - dedicated camera QA coverage now lives in `scripts/qa/camera-controls.mjs`
  - Vitest tactical coverage passes
  - Playwright QA artifacts are stored in `output/web-game/playthrough/`
  - fullscreen viewport-fit artifacts are stored in `output/web-game/viewport-fit/`
  - auto-active turn QA artifacts are stored in `output/web-game/auto-active-turn/`
  - button-click and move-retarget QA artifacts are stored in `output/web-game/button-click-fix/` and `output/web-game/move-retarget/`
  - `js_repl` has been enabled in `~/.codex/config.toml` for the next session

## Working Notes

- Keep the prototype scope to one battle only
- Keep docs English-first to match code and localization keys
- Treat `docs/qa-inventory.md` as the shared checklist for future browser validation
- Current Playwright limitation in this session:
  - raw pointer choreography now covers rotated tile clicks, wheel zoom, drag pan, and pan toggle suppression
  - the remaining debug assist is only `window.__glenmoorDebug.projectTile(x, y)`, which converts a logical tile into an exact browser click point for automation
  - at `1280x720`, the lower `View` and `Forecast` cards live behind the right-panel's internal scroll area

## 2026-03-08

- Added optional `startingHp` on battle unit blueprints so encounter tuning can happen per deployment without altering shared class stats
- Softened the current battle by trimming starting HP on `brigandCaptain`, `huntmaster`, `hexbinder`, and `cutpurse`
- Added a runtime regression test to lock the battle-specific starting HP overrides
- Rebalanced class stats and signature skills to sharpen roles without rewriting the roster:
  - `shieldBash` now trades raw damage for control
  - `snareVolley` extends slow duration
  - `emberSigil` and `shadowLunge` lose some burst
  - `aegisField` and `resolveHymn` gain longer support reach
  - initiative order now opens on `elira` instead of `sable`
- Added structured `CombatResolution.presentation` data and converted the battle feed / forecast pipeline to consume it
- Rebuilt the duel scene into an automatic multi-step presentation with per-step HP updates, status display, counter timing, and duel telemetry for QA
- Updated AI scoring to avoid duplicate zero-heal support loops, prefer meaningful skill upgrades over weak skill spam, and move ranged units into workable firing distance more reliably
- Updated browser QA scripts to use duel telemetry instead of fixed timeouts and to accept `PLAYWRIGHT_BASE_URL`
- Verification:
  - `npm test`
  - `npx tsc --noEmit`
  - `npm run build`
  - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 npm run qa:playthrough`
  - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 npm run qa:camera`

## 2026-03-09

- Switched the Phaser renderer to `AUTO` and enabled Matter as a visual-only FX layer so battlefield particles and shards can run on the WebGL path without touching tactics logic
- Added presentation metadata to attacks, signature skills, and statuses, then expanded runtime duel steps into `announce`, `cast`, `projectile`, `hit`, `status`, `push`, `counter`, `defeat`, and `recover`
- Reworked battlefield overlays into layered telegraphs with lethal/counter/status/push accents, persistent status auras, Matter-driven ambient particles, and screen-space danger pulses
- Extended HUD target previews and duel telemetry so `render_game_to_text()` now exposes structured telegraph summaries plus `stepKind`, `fxCueId`, `targetUnitId`, `activeStatusAuraIds`, and `activeTelegraphKinds`
- Added a safe pointer-gesture fallback for rotated map clicks and extended the duel final-step hold so both camera QA and telemetry-driven duel capture remain reliable
- Fixed duel card accents so enemy attackers now render with enemy colors even when they appear on the left side of the zoomed combat view
- Verification:
  - `npm test`
  - `npx tsc --noEmit`
  - `npm run build`
  - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run qa:playthrough`
  - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run qa:camera`
- Reverted the battle command UI from a docked HUD tray to a unit-tethered floating action menu while keeping DOM-measured safe placement and click-through passive HUD surfaces
- Added action-menu placement avoidance for current interactive tile centers so move/attack/skill prompts stay near the active unit without blocking actionable tiles
- Tightened target overlay anchoring and removed the old tray column from the footer layout so the bottom HUD regains map space at `1280x720`
- Updated `scripts/qa/hud-polish.mjs` to validate unit-tethered menu bounds, anchor proximity, passive HUD hit-testing, and action-menu tile occlusion across `1600x900 EN`, `1280x720 EN/KO`, `engagement`, `skill-demo`, and `push-demo`
- Verification:
  - `npm test`
  - `npm run build`
  - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4174 npm run qa:hud`
- Expanded anchored HUD placement to eight directions and changed the renderer to reserve occupied popup rects in order (`action menu -> target detail -> target markers`)
- Target detail now prefers the side opposite the active unit and hard-avoids the action-menu rect, so forecast popups no longer overlap the command menu at desktop `1280x720+`
- `scripts/qa/hud-polish.mjs` now hovers every targetable unit in the `engagement`, `skill-demo`, and `push-demo` scenarios and asserts action-menu/target-detail separation with zero intersection area
- Verification:
  - `npm test`
  - `npm run build`
  - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4174 npm run qa:hud`
