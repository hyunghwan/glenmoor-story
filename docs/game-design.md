# Glenmoor Story Prototype GDD

## Vision

`Glenmoor Story` is a compact tactical RPG prototype with the clarity of `Fire Emblem`, the battlefield spectacle of `Final Fantasy Tactics`, and a browser-native development loop.
The first playable build is a single handcrafted battle that proves the combat language, presentation style, and content pipeline.

## Prototype Boundaries

### In Scope

- One self-contained battle
- Medieval-fantasy setting
- Isometric battlefield rendered with 2D sprite-style visuals
- Mouse-first interaction
- English and Korean localization
- Tactical systems:
  - initiative timeline
  - terrain and elevation
  - facing bonuses
  - counterattacks
  - status effects
  - push/knockback
- HUD and combat forecast
- Briefing and result wrappers
- Reusable duel scene for every combat exchange

### Out Of Scope

- Campaign progression
- Recruitment or roster management
- Inventory and economy
- Save/load UX
- Permadeath meta rules
- Touch and gamepad implementation
- Map editor

## Battle Format

- Map size: `16x16`
- Teams: `6 allies` vs `6 enemies`
- Objective: eliminate all enemies
- Flow: units act by initiative rather than by side-wide phases
- Player loop:
  - inspect battlefield
  - select the active allied unit
  - reposition if desired
  - attack, use a signature skill, or wait
  - evaluate forecast and terrain before committing
- Enemy loop:
  - evaluate lethal opportunities
  - value flanks, height, and status application
  - push targets when it creates advantage

## Tactical Feel

- Terrain should matter immediately through movement cost and positional value
- Height should matter both tactically and visually
- Facing should reward flanks and rear attacks without hiding the rules
- Statuses should change priorities, not just add passive clutter
- Duel scenes should make every exchange feel important while staying fast and reusable

## Class Direction

The prototype should field a compact but readable spread of roles such as:

- frontline breaker
- ranged pressure unit
- caster or controller
- defender or anchor
- mobile flanker
- healer or support

Each class needs:

- a clear battlefield purpose
- distinct movement expectations
- one signature skill with a visible payoff
- readable forecast consequences before the action is confirmed

## UI Direction

- The battlefield remains the focus
- HUD text stays concise and tactical
- Forecast information must be immediately readable before commitment
- Initiative order must stay visible throughout the match
- Localized text must fit cleanly in both English and Korean

## Presentation Direction

- Visual tone: moody medieval fantasy, but still readable
- Map materials should feel intentionally different: grass, road, forest, stone, water, ruins, bridge, or similar
- Duel scenes should reuse common assets, framing, and effects rather than bespoke animations
- Placeholder assets are acceptable, but all asset slots should be documented for later replacement
