# Asset Replacement Manifest

The prototype can ship with rough placeholders, but each placeholder category should map cleanly to a future replacement slot.

## Visual Slots

- Battlefield terrain tiles:
  - grass
  - road
  - forest
  - water
  - stone or ruins
  - bridge or crossing
- Unit visuals:
  - allied named-unit battlefield sprites
  - enemy named-unit battlefield sprites
  - initiative and unit-panel head portraits
  - class differentiation markers
- Combat presentation:
  - duel backdrop
  - zoom-combat actor presentation
  - impact flashes
  - skill cast effects
  - damage and status callouts
- HUD:
  - panel frames
  - initiative markers
  - objective badge
  - button icons

## Audio Slots

- menu confirm
- menu cancel
- movement confirm
- basic attack hit
- skill cast
- victory sting
- defeat sting
- one looping battle ambience or music bed

## Replacement Rules

- Favor permissive assets suitable for temporary commercial and non-commercial prototyping
- Keep a clear record of source and license before replacing a placeholder
- Avoid building the prototype around asset-specific dimensions that would block future swaps
- Treat the current placeholder layer as disposable

## Integrated In Prototype

### Visual

- HUD panel frames, inset objective cards, and CTA button skin
  - Source: Kenney, `UI pack: RPG extension`
  - URL: <https://kenney.nl/assets/ui-pack-rpg-expansion>
  - License: `CC0 1.0`
  - Local files:
    - `public/assets/ui/kenney/panel_brown.png`
    - `public/assets/ui/kenney/panelInset_brown.png`
    - `public/assets/ui/kenney/buttonLong_brown.png`
    - `public/assets/ui/kenney/buttonLong_brown_pressed.png`
  - Current usage:
    - HUD card texture
    - modal frame texture
    - modal objective inset texture
    - primary CTA button texture

- Parchment backdrop texture
  - Source: FelisChaus, `Parchment background`
  - URL: <https://opengameart.org/content/parchment-background>
  - License: `CC0`
  - Local file:
    - `public/assets/textures/parchment_background.jpg`
  - Current usage:
    - app shell backdrop
    - duel-scene backdrop image

### Audio

- UI and battle placeholder SFX
  - Source: Kenney, `Interface Sounds`
  - URL: <https://kenney.nl/assets/interface-sounds>
  - License: `CC0 1.0`
  - Local files:
    - `public/assets/audio/sfx/confirm.ogg`
    - `public/assets/audio/sfx/cancel.ogg`
    - `public/assets/audio/sfx/select.ogg`
    - `public/assets/audio/sfx/move.ogg`
    - `public/assets/audio/sfx/hit.ogg`
    - `public/assets/audio/sfx/skill.ogg`
    - `public/assets/audio/sfx/victory.ogg`
    - `public/assets/audio/sfx/defeat.ogg`
  - Current usage:
    - menu confirm / cancel / select
    - movement confirm
    - duel hit and skill cues
    - victory / defeat stings

- Looping battle music bed
  - Source: cynicmusic, `Cynic Battle Loop`
  - URL: <https://opengameart.org/content/cynic-battle-loop>
  - License: `CC0`
  - Attribution note on source page references `cynicmusic.com` and `pixelsphere.org`
  - Local file:
    - `public/assets/audio/music/cynic_battle_loop.ogg`
  - Current usage:
    - looping battle music started from the live battle scene

## Remaining Placeholder Slots

- Battlefield terrain tiles still use procedural isometric fills and overlays.
- Unit visuals still use generated team-tinted token glyphs and initials rather than sourced named-unit sprite sheets and head portraits.
- Combat impact flashes and screen-space VFX still use procedural graphics rather than sourced effect sprites.
- Initiative rail chips and active-unit crests still rely on DOM or CSS initials rather than named-unit head portraits.
- Initiative markers and small HUD controls still rely on DOM or CSS styling plus Material Symbols rather than a full sourced icon pass.
