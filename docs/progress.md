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

### Verification

- `npm test` passes with 10 tactical and AI assertions
- `npm run build` completes successfully
- `npm run qa:playthrough` generates English/Korean, duel, push, and victory evidence:
  - `output/web-game/playthrough/02-battle-en.png`
  - `output/web-game/playthrough/03-battle-ko.png`
  - `output/web-game/playthrough/05-engagement-duel.png`
  - `output/web-game/playthrough/11-victory.png`

### Next Steps

- Sync the implementation backlog into GitHub Project items and keep those cards updated as scope changes
- Restart Codex in a new session so `js_repl` is available for persistent `playwright-interactive`
- Replace placeholder generated visuals/audio with curated open-source packs when the concept stabilizes
- Add a true pointer-driven browser pass once the local Playwright input issue is resolved in the refreshed session

### Notes

- Keep documentation English-first
- Keep GitHub Project items synchronized with actual implementation status, not aspirational status
- Do not let the prototype expand into campaign systems
- In the current session, Playwright page-level mouse clicks did not reliably fire DOM click handlers; automated UI capture used the debug harness plus tactical unit tests as the primary verification path
