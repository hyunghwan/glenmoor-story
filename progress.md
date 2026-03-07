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
  - programmatic debug commands and screenshot capture work
  - tile-selection regression checks still use the debug bridge because it is faster and deterministic for scripted tactical validation
