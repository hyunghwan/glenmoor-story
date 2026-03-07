# Glenmoor Story Prototype Plan

## Summary

- Build a browser-first SRPG vertical slice with `Phaser 3 + TypeScript + Vite`
- Deliver one polished battle only: medieval fantasy, isometric 2D sprite presentation, `16x16` map, `6v6`, win condition = enemy annihilation
- Use a hybrid tactics ruleset with initiative order, terrain movement cost, height advantage, facing, counterattacks, status effects, and push/knockback
- Open a short separate duel scene for every combat exchange
- Keep English as the source language and ship Korean from the start

## Foundation

- Use `main` as the default branch
- Keep the GitHub repo private during prototype development
- Maintain local Markdown as the source of truth for plan, progress, design, and QA
- Mirror execution status into the dedicated GitHub Project `Glenmoor Story`
- Enable `js_repl` before relying on the full `playwright-interactive` workflow in a future Codex session

## Architecture

- Phaser scenes:
  - `Boot/Preload`
  - `Battle`
  - `Duel`
- Battle rules live in a deterministic, data-driven core separate from rendering
- A lightweight DOM HUD sits over the game surface for menus, initiative, forecast, objective, and localized text
- Map content is loaded from external Tiled-style JSON so later battle variants do not require renderer rewrites

## Core Interfaces

- `BattleDefinition`: scenario setup, deployment, objective, localized briefing/result copy
- `UnitBlueprint`: unit identity, team, class, stats, and deployment slot
- `ClassDefinition`: base role, stat profile, movement profile, signature skill
- `SkillDefinition`: range, targeting, effects, status application, push/heal/damage behavior
- `TerrainDefinition`: movement cost, elevation interaction, visual theme, tactical modifier
- `BattleAction`: canonical action input used by player controls and AI
- `CombatResolution`: canonical action output shared by forecast, battle playback, and duel playback
- `AIProfile`: tactical evaluation profile plus score breakdown
- `LocaleBundle`: keyed `en` and `ko` strings

## Prototype Features

- Varied tactical tilemap with chokepoints, elevations, and readable terrain identity
- Distinct allied and enemy class roles with at least one signature skill each
- HUD with selected-unit panel, initiative timeline, action menu, combat forecast, status indicators, and objective text
- Duel scene with quick transition, close-up presentation, damage/status display, and skip or fast-forward support
- Full tactical-scoring enemy AI focused on threat, kill potential, terrain value, facing value, status application, and push opportunities
- Localized mission briefing plus localized victory and defeat result screens

## Acceptance Criteria

- A player can complete one full battle from briefing to result screen in the browser
- The tactics ruleset is deterministic and testable outside the renderer
- Every combat exchange routes through the duel presentation without desyncing map state
- English and Korean both cover visible HUD and story-wrapper text
- Functional and visual QA can be driven from the shared checklist in `docs/qa-inventory.md`
