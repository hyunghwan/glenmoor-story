# Prototype Visual Asset Spec

This document is the canonical art-sizing contract for the current `Glenmoor Story` prototype.
It turns the open placeholder slots listed in `docs/asset-replacement-manifest.md` into implementation-ready requirements for terrain, named-unit battlefield sprites, duel portrait exports, combat VFX sheets, and future HUD icon work.

The scope is the current single-battle prototype, not a future multi-biome campaign pipeline.

## Source Of Truth

- Placeholder slots come from `docs/asset-replacement-manifest.md`.
- Runtime terrain families come from `src/game/content.ts`.
- Battlefield projection comes from `src/game/iso.ts`:
  - `TILE_WIDTH = 68`
  - `TILE_HEIGHT = 34`
  - `HEIGHT_STEP = 22`
- Current battlefield unit placement and click footprint come from `src/game/scenes/BattleScene.ts`:
  - units are drawn at tile world position with `y - 16` offset
  - the current interactive hit area is `44x68`
- Current duel card slot comes from `src/game/scenes/DuelScene.ts`:
  - card panel is `270x210`
  - the current token circle uses a `104px` diameter
- Tiled map metadata still reports `64x32` in `public/data/maps/glenmoor-pass.json`, but art sizing for the live game must follow the rendered `68x34` scene projection instead.

## Format Policy

Engine-ready terrain and character art must use `PNG` or `WebP` with transparency.
Do not generate engine-ready battlefield tiles as `JPG`: the isometric diamond and elevated side faces need transparent corners and padding.

## Terrain Catalog

The prototype terrain catalog is fixed to the seven runtime terrain IDs below.

| Terrain ID | Tactical Role | Base Variants | Required Overlay/Decal Notes |
| --- | --- | ---: | --- |
| `grass` | default walkable ground | 3 | subtle tufts, mud breakup, no hard landmarks |
| `road` | fast readable lane | 3 | cart rut and packed-dirt breakup |
| `forest` | defensive rough ground | 3 | canopy or brush overlay readable over units |
| `water` | impassable boundary | 3 | ripple and shoreline breakup |
| `stone` | solid fortified ground | 3 | cracked flagstone or masonry breakup |
| `bridge` | narrow crossing | 4 | plank direction and edge trim must read clearly |
| `ruins` | defensive broken terrain | 3 | debris and fractured stone overlay |

### Terrain Deliverables

- `grass`, `road`, `forest`, `water`, `stone`, and `ruins` each require `3` base block variants.
- `bridge` requires `4` variants:
  - `straight`
  - `endcap`
  - `broken`
  - `reinforced`
- The terrain overlay set is fixed to these named decal families:
  - `forest canopy`
  - `water ripple`
  - `road rut`
  - `bridge plank`
  - `ruins debris`
- All elevated terrain must share one cliff/side-face language so the fixed `22px` height step reads as one consistent world material rule.

## Battlefield Tile Block Spec

### Tile Geometry

Each terrain block represents one isometric cell plus one visible elevation face.

| Property | Display Size | Authoring / Export Size | Notes |
| --- | ---: | ---: | --- |
| block footprint | `68x56` | `136x112` | one top diamond plus one height face |
| top diamond safe area | `68x34` | `136x68` | ground surface only |
| side-face safe area | `68x22` | `136x44` | vertical elevation face only |
| tile logical center | `34,17` | `68,34` | align this point to the runtime tile world point |

### Placement Rules

- Export each block on a transparent canvas sized exactly `136x112`.
- Keep the logical tile center fixed at `68,34` in export space.
- Preserve transparent padding around the full block silhouette. Do not crop tightly to the visible diamond.
- The top diamond must stay centered horizontally over the side face.
- The bottom of the side face may extend to `y = 112`, but nothing should bleed outside the canvas.
- Terrain details that can hide unit feet or the tile edge should stay inside the top diamond safe area, not inside the transparent corners.

### Terrain Composition Rules

- Terrain blocks should read cleanly at both `1600x900` and `1280x720` desktop QA views.
- `forest` overlays must not obscure a unit's lower body or the tile's occupied center.
- `water` should remain obviously impassable without relying on gameplay tint.
- `bridge` art must preserve a clear travel direction across the narrow crossing.
- `road` and `bridge` variants should avoid visual perspective changes that imply a different tile anchor.

## Named Unit Battlefield Sprite Sheet Spec

Unit art is locked to named-unit atlases, not class-only atlases.
One battlefield atlas is required for each current named unit in the prototype.

| Unit ID | Team | Class ID | Notes |
| --- | --- | --- | --- |
| `rowan` | allies | `vanguard` | main frontline ally |
| `elira` | allies | `ranger` | allied ranged unit |
| `sable` | allies | `skirmisher` | allied mobile striker |
| `maelin` | allies | `arcanist` | allied caster |
| `osric` | allies | `warden` | allied defender |
| `talia` | allies | `cleric` | allied support |
| `brigandCaptain` | enemies | `vanguard` | phase-two objective target |
| `huntmaster` | enemies | `ranger` | enemy ranged unit |
| `hexbinder` | enemies | `arcanist` | enemy caster |
| `shieldbearer` | enemies | `warden` | phase-one objective target |
| `cutpurse` | enemies | `skirmisher` | enemy flanker |
| `fanatic` | enemies | `cleric` | enemy support |
| `fordStalker` | enemies | `ranger` | reinforcement |
| `roadReaver` | enemies | `skirmisher` | reinforcement |

### Atlas Format

| Property | Value |
| --- | --- |
| atlas count | 1 atlas per named unit |
| image format | `PNG` or `WebP` with transparency |
| metadata format | JSON manifest alongside the atlas |
| frame size | `128x128` |
| visible body safe box | max `72x104` |
| pivot / foot anchor | `64,108` |
| runtime color treatment | baked costumes and team colors, no runtime tint expectation |
| atlas page budget | `2048x2048` max |

### Animation Set

Each named unit atlas must include all eight directions and the full tactical animation set below.

| Animation | Frames Per Direction |
| --- | ---: |
| `idle` | 2 |
| `move` | 6 |
| `attack` | 5 |
| `cast` | 5 |
| `hit` | 2 |
| `defeat` | 4 |
| total | 24 |

- Direction order is fixed to: `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`.
- Total frame count is fixed to `192` per named unit.
- The battlefield sprite should fit inside the current battle placement and interaction envelope:
  - feet must land on the tile center
  - the body mass should stay visually compatible with the current `44x68` click region
  - idle stance height should not require a larger than `72x104` safe box

### Atlas Packing Contract

To keep the export under the `2048x2048` budget with no later packing decisions, use this exact layout:

- atlas canvas: `1536x2048`
- grid: `12 columns x 16 rows`
- each direction occupies `2` consecutive rows
- each row uses `12` frames

| Row Within Direction Band | Column Order |
| --- | --- |
| row A | `idle_0`, `idle_1`, `move_0`-`move_5`, `attack_0`-`attack_3` |
| row B | `attack_4`, `cast_0`-`cast_4`, `hit_0`-`hit_1`, `defeat_0`-`defeat_3` |

### JSON Manifest Contract

The companion JSON file should expose one record per frame with these fixed fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `frameId` | string | unique frame key such as `unit_rowan_NE_move_03` |
| `direction` | string | one of `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW` |
| `animation` | string | one of `idle`, `move`, `attack`, `cast`, `hit`, `defeat` |
| `index` | number | zero-based frame index inside the animation |
| `x` | number | source x in atlas pixels |
| `y` | number | source y in atlas pixels |
| `w` | number | frame width, fixed to `128` |
| `h` | number | frame height, fixed to `128` |
| `pivotX` | number | fixed to `64` |
| `pivotY` | number | fixed to `108` |

## Duel Bust Appendix

The duel scene currently renders a `270x210` card with a `104px` circular token slot.
Future duel art should replace that token with a transparent bust render that can scale down cleanly.

| Asset | Master Size | Export Size | Notes |
| --- | ---: | ---: | --- |
| named-unit duel bust | `1024x1024` | `320x320` | transparent background |
| safe character focus zone | `760x760` | `240x240` | face, shoulders, weapon silhouette |
| token replacement target | n/a | fits inside current `104px` token region | allow downscaling without losing facial read |

### Duel Bust Rules

- Create one duel bust per named unit ID.
- Compose busts to face inward toward the opposing card.
- Keep empty transparent padding around the silhouette so future scene code can slide or pulse the image without clipping.
- Preserve readable face and shoulder detail after scaling the `320x320` export into a roughly `104px` on-card target.

## Combat VFX Appendix

These assets are not yet loaded by runtime code, but their sizes are locked here for the future replacement pass.

| VFX Slot | Export Size | Notes |
| --- | ---: | --- |
| impact flash sheet | `256x256` | transparent sprite sheet |
| cast burst sheet | `256x256` | transparent sprite sheet |
| status pulse sheet | `256x256` | transparent sprite sheet |
| projectile burst sheet | `256x256` | transparent sprite sheet |

### VFX Rules

- Keep all VFX exports on transparent backgrounds.
- Center the main burst inside the canvas so effects can scale and rotate without recropping.
- Match VFX tone families to existing combat presentation buckets: steel, wind, radiant, shadow, ember, ward, and hazard.

## HUD And Icon Appendix

HUD replacement is optional for the initial art pass, but if the icon pass starts later, use these locked export sizes.

| HUD Slot | Export Size | Notes |
| --- | ---: | --- |
| initiative marker icon | `64x64` | transparent |
| objective badge icon | `64x64` | transparent |
| button icon | `64x64` | transparent |
| status icon | `64x64` | transparent |

## Filename Contract

Use these exact filenames so a future loader pass does not need to invent naming rules.

| Slot | Filename Pattern | Example |
| --- | --- | --- |
| terrain block | `terrain_<terrainId>_<variant>_block.webp` | `terrain_grass_a_block.webp` |
| terrain overlay | `terrain_<terrainId>_<variant>_overlay.webp` | `terrain_forest_canopy_overlay.webp` |
| battlefield atlas | `unit_<unitId>_battle.webp` | `unit_rowan_battle.webp` |
| battlefield manifest | `unit_<unitId>_battle.json` | `unit_rowan_battle.json` |
| duel bust | `unit_<unitId>_duel.webp` | `unit_rowan_duel.webp` |
| vfx sheet | `vfx_<cueId>_<variant>.webp` | `vfx_ember_burst_a.webp` |
| hud icon | `hud_<slot>_<variant>.webp` | `hud_initiative_marker_a.webp` |

## Integration Notes

- This is a doc-only contract. No runtime API or type changes are required in this step.
- Future terrain assets must map back to the existing runtime terrain IDs exactly.
- Future battlefield atlases and duel busts must map back to the named unit IDs already authored in `src/game/data/glenmoor-pass.scenario.json`.
- If a future prototype revision adds a new terrain ID or named unit, this document must be updated in the same change.

## Verification Checklist

- Terrain coverage includes every open battlefield terrain slot from `docs/asset-replacement-manifest.md`.
- Unit coverage includes the current named roster plus scripted reinforcements.
- Combat presentation coverage includes duel bust, VFX, and HUD/icon appendices.
- All locked numbers trace back to current runtime geometry or current UI slot sizes.
