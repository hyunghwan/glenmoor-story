# Prototype Visual Asset Spec

This document is the canonical art-sizing contract for the current `Glenmoor Story` prototype.
It turns the open placeholder slots listed in `docs/assets/asset-replacement-manifest.md` into implementation-ready requirements for terrain, named-unit battlefield sprites, zoom-combat sprite reuse, named-unit head portraits, combat VFX sheets, and future HUD icon work.

The scope is the current single-battle prototype, not a future multi-biome campaign pipeline.

## Source Of Truth

- Placeholder slots come from `docs/assets/asset-replacement-manifest.md`.
- Runtime terrain families come from `src/game/content.ts`.
- Tactical facing directions come from `src/game/types.ts` and `src/game/runtime.ts`:
  - directions are locked to `north`, `east`, `south`, and `west`
  - no diagonal facing or diagonal combat bonus exists in the current prototype
- Battlefield projection comes from `src/game/iso.ts`:
  - `TILE_WIDTH = 68`
  - `TILE_HEIGHT = 34`
  - `HEIGHT_STEP = 22`
- Current battlefield unit placement and click footprint come from `src/game/scenes/BattleScene.ts`:
  - units are drawn at tile world position with `y - 16` offset
  - the current interactive hit area is `44x68`
- Current duel layout comes from `src/game/scenes/DuelScene.ts`:
  - the duel stage band is `width - 120` by `420`
  - each combatant info card is `270x210`
  - the current placeholder token anchor is a `104px` circle centered `40px` above each card
- Current initiative chip portrait slot comes from `src/game/ui.ts` and `src/style.css`:
  - desktop slot is `38x38`
  - compact slot is `32x32`
- Tiled map metadata still reports `64x32` in `public/data/maps/glenmoor-pass.json`, but art sizing for the live game must follow the rendered `68x34` scene projection instead.

## Format Policy

Engine-ready terrain, character, portrait, and VFX art must use `PNG` or `WebP` with transparency.
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
- All elevated terrain must share one cliff or side-face language so the fixed `22px` height step reads as one consistent world material rule.

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
One battlefield atlas, one battlefield manifest, and one head portrait export are required for each current named unit in the prototype.

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
| atlas page budget | `1536x1024` fixed export target |

### Animation Set

Each named unit atlas must include four authored directions that map to the world-space tactical directions below.

| Animation | Frames Per Direction |
| --- | ---: |
| `idle` | 2 |
| `move` | 6 |
| `attack` | 5 |
| `cast` | 5 |
| `hit` | 2 |
| `defeat` | 4 |
| total | 24 |

- Direction order is fixed to: `north`, `east`, `south`, `west`.
- Total frame count is fixed to `96` per named unit.
- Camera rotation does not create extra art requirements. The battlefield camera may rotate in `90` degree steps, but art authoring stays at four world directions only.
- The battlefield sprite should fit inside the current battle placement and interaction envelope:
  - feet must land on the tile center
  - the body mass should stay visually compatible with the current `44x68` click region
  - idle stance height should not require a larger than `72x104` safe box

### Atlas Packing Contract

To keep the export deterministic with no later packing decisions, use this exact layout:

- atlas canvas: `1536x1024`
- grid: `12 columns x 8 rows`
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
| `frameId` | string | unique frame key such as `unit_rowan_east_move_03` |
| `direction` | string | one of `north`, `east`, `south`, `west` |
| `animation` | string | one of `idle`, `move`, `attack`, `cast`, `hit`, `defeat` |
| `index` | number | zero-based frame index inside the animation |
| `x` | number | source x in atlas pixels |
| `y` | number | source y in atlas pixels |
| `w` | number | frame width, fixed to `128` |
| `h` | number | frame height, fixed to `128` |
| `pivotX` | number | fixed to `64` |
| `pivotY` | number | fixed to `108` |

## Zoom Combat Presentation Appendix

The duel scene is a zoomed combat stage, not a separate portrait pipeline.
It should reuse the named-unit battlefield atlas at larger display scale and reserve the existing `270x210` cards for combat information.

| Asset / Slot | Source | Display Contract | Notes |
| --- | --- | --- | --- |
| zoom combat actor sprite | `unit_<unitId>_battle.webp` + JSON manifest | reuse one `128x128` battle frame inside an approximately `256x256` per-side display envelope | default presentation scale is about `2.0x` |
| combatant info card | runtime UI panel | `270x210` | holds name, class, HP, and statuses |
| placeholder token anchor | current duel layout reference | `104px` circle | treat as an overlap or anchor reference only, not as a final crop mask |

### Zoom Combat Rules

- No separate `unit_<unitId>_duel.webp` bust export is required for the current prototype.
- The same four battlefield directions must service duel playback. Do not author duel-only facings.
- Compose battlefield sprites so the weapon silhouette, casting pose, and hit reaction still read when the `72x104` safe box is shown at roughly `144x208` in the zoomed view.
- Leave transparent headroom and side padding within the `128x128` frame so jumps, recoil, and defeat motion can scale cleanly in the duel view.
- The `270x210` card panels remain the information layer for name, class, HP, and statuses rather than the primary art container.
- VFX, flashes, and combat motion should carry the spectacle of the zoomed exchange, not a separate bust portrait pipeline.

## Initiative Head Portrait Appendix

The initiative rail currently renders text initials inside `38x38` desktop and `32x32` compact slots.
Future art should replace those initials with named-unit head crops that stay readable at both sizes.

| Asset | Master Size | Export Size | Runtime Target | Notes |
| --- | ---: | ---: | --- | --- |
| named-unit head portrait | `512x512` | `128x128` | `38x38` desktop, `32x32` compact | transparent background |
| face safe zone | `320x320` | `80x80` | centered inside the slot | eyes, brow, nose, hairline, and major headgear must stay readable |

### Head Portrait Rules

- Create one head portrait per named unit ID.
- Crop from forehead to collar or helmet line. Prioritize face readability over shoulders or weapon silhouette.
- Keep the face centered enough that a rounded-square mask or slight active-state zoom will not clip the eyes or chin.
- Prefer a front or slight three-quarter view that remains legible after downscaling to `32x32`.
- Export at `128x128` even though the runtime slot is smaller so the same file can support future hover, selected, or active-state enlargement.
- The same head crop may be reused later for the active-unit crest, but initiative-rail readability is the locking requirement for this prototype.

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

The current required named-unit outputs are battlefield atlas, battlefield manifest, and head portrait.
The `unit_<unitId>_duel.webp` filename is reserved for an optional future duel-only portrait pass and is not required for the current prototype.

| Slot | Filename Pattern | Example |
| --- | --- | --- |
| terrain block | `terrain_<terrainId>_<variant>_block.webp` | `terrain_grass_a_block.webp` |
| terrain overlay | `terrain_<terrainId>_<variant>_overlay.webp` | `terrain_forest_canopy_overlay.webp` |
| battlefield atlas | `unit_<unitId>_battle.webp` | `unit_rowan_battle.webp` |
| battlefield manifest | `unit_<unitId>_battle.json` | `unit_rowan_battle.json` |
| head portrait | `unit_<unitId>_head.webp` | `unit_rowan_head.webp` |
| duel portrait (optional future) | `unit_<unitId>_duel.webp` | `unit_rowan_duel.webp` |
| vfx sheet | `vfx_<cueId>_<variant>.webp` | `vfx_ember_burst_a.webp` |
| hud icon | `hud_<slot>_<variant>.webp` | `hud_initiative_marker_a.webp` |

## Integration Notes

- This is a doc-only contract. No runtime API or type changes are required in this step.
- Future terrain assets must map back to the existing runtime terrain IDs exactly.
- Future battlefield atlases and head portraits must map back to the named unit IDs already authored in `src/game/data/glenmoor-pass.scenario.json`.
- No current runtime loader should be expected to require duel-only portrait files.
- If a future prototype revision adds a new terrain ID or named unit, this document must be updated in the same change.

## Verification Checklist

- Terrain coverage includes every open battlefield terrain slot from `docs/assets/asset-replacement-manifest.md`.
- Unit coverage includes the current named roster plus scripted reinforcements and requires battle atlas plus head portrait outputs.
- Combat presentation coverage includes zoom combat, head portraits, VFX, and HUD or icon appendices.
- No legacy diagonal-direction or oversized battlefield-atlas frame-count requirement remains.
- All locked numbers trace back to current runtime geometry or current UI slot sizes.
