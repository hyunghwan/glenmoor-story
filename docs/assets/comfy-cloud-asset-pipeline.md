# Comfy Cloud Asset Pipeline

This runbook describes the current `Glenmoor Story` Comfy production path.

The project now uses three generated master workflows plus three checked-in support workflows:

- `docs/assets/comfy-workflows/unit-master-batch.ui-workflow.json`
- `docs/assets/comfy-workflows/terrain-catalog-batch.ui-workflow.json`
- `docs/assets/comfy-workflows/vfx-master-batch.ui-workflow.json`
- `docs/assets/comfy-workflows/style-bible-lookdev.ui-workflow.json`
- `docs/assets/comfy-workflows/unit-gemini-sprite-lookdev.ui-workflow.json`
- `docs/assets/comfy-workflows/unit-gemini-sprite-batch.ui-workflow.json`

The three master workflows are generated from machine-readable batch manifests under `docs/assets/comfy-batch/`.
The two Gemini sprite workflows are hand-authored JSON graphs because they rely on Gemini-specific custom nodes plus a crop or stitch layout that does not fit the current manifest generator.

## Source Of Truth

- Runtime art contract:
  `docs/assets/prototype-visual-asset-spec.md`
- Batch manifests:
  `docs/assets/comfy-batch/`
- Import-ready UI workflows:
  `docs/assets/comfy-workflows/`
- Human-readable prompt blocks:
  `docs/assets/comfy-pilot-prompt-pack.md`

## Production Model

Main production still uses one queue run per asset family, but the graphs no longer jump straight from text prompt to tiny final delivery size.

- Unit master workflow:
  generates a wide concept plate, derives a portrait at higher resolution, then uses the concept plate as an identity anchor for the battle-atlas branch before exporting to the locked runtime size
- Gemini sprite lookdev workflow:
  validates one unit at a time with Gemini-backed style, direction, and action proof sheets before any atlas pass is approved
- Gemini sprite batch workflow:
  uses the approved reference plus lookdev sheet to generate per-direction source grids, crop them into the locked runtime frame layout, and stitch the final battle atlas
- Terrain catalog workflow:
  generates larger isolated tile source renders, then rescales them to the locked runtime tile size
- VFX master workflow:
  generates larger isolated effect plates, then rescales them to the locked runtime sheet size

The style-bible workflow remains as a debug or lookdev tool only.

## Batch Manifests

The checked-in manifests define roster, prompts, save prefixes, and expected outputs.

- `unit-master-batch.manifest.json`
  - 14 named units
  - reference, portrait, and atlas prompt composition
  - fixed atlas contract for `1536x1024`, `12x8`, `96` frames
- `terrain-catalog-batch.manifest.json`
  - 7 terrain families
  - 22 base block outputs
  - 5 overlay outputs
- `vfx-master-batch.manifest.json`
  - 4 required primary cue sheets
  - primary tone mapping:
    `steel`, `radiant`, `ward`, `wind`

The manifests also retain `pilot` and `full` metadata.
The committed UI workflow exports target the full catalog.

## Regenerating The Workflows

Whenever a manifest changes, regenerate the tracked workflows:

```bash
npm run assets:comfy:generate
```

To regenerate and refresh the ignored working tree together:

```bash
npm run assets:comfy:init
```

That command:

- regenerates the three master UI workflow JSON files
- copies the hand-authored Gemini sprite workflows into the working tree alongside the generated master workflows
- copies workflows into `output/comfy/workflows/`
- copies batch manifests into `output/comfy/manifests/`
- writes fixed `unit_<unitId>_battle.json` files into `output/comfy/manifests/battle-json/`

## Opening The Master Graphs

### Unit Master

Use `docs/assets/comfy-workflows/unit-master-batch.ui-workflow.json`.

1. Open Comfy Cloud.
2. Import or drag in `unit-master-batch.ui-workflow.json`.
3. Confirm the graph opens with visible links across every unit branch.
4. Choose an available checkpoint in `CheckpointLoaderSimple`.
5. Queue once to emit reference, portrait, and atlas outputs for the full named roster.

The unit graph now uses:

- text-to-image for the wide concept plate
- text-to-image for the portrait source
- reference-anchored img2img for the atlas source
- final export resize for portrait and atlas delivery files

Expected output prefixes:

- `unit_<unitId>_reference`
- `unit_<unitId>_head`
- `unit_<unitId>_battle`

### Gemini Sprite Lookdev

Use `docs/assets/comfy-workflows/unit-gemini-sprite-lookdev.ui-workflow.json`.

Dependencies:

- Gemini custom nodes that provide `GeminiImage2Node`
- `BatchImagesNode`
- current Comfy core nodes for `LoadImage`, `SaveImage`, `ImageScale`, `ImageCrop`, and `ImageStitch`

The lookdev graph is the approval gate for the Gemini sprite path.
It is intentionally single-unit rather than roster-wide.

1. Import the workflow.
2. Load one approved full-body unit reference into `Load Approved Unit Reference`.
3. Load either the same image or a prior style anchor into `Load Style Anchor Or Same Reference`.
4. Replace the `unit_CHANGE_ME_*` save prefixes with the target unit ID.
5. Queue once to emit the three proof sheets.

Expected output prefixes:

- `unit_<unitId>_proof_style`
- `unit_<unitId>_proof_direction`
- `unit_<unitId>_proof_action`

Approval order for the first Gemini pass is fixed:

1. `rowan` locks the overall hybrid FFT plus painterly miniature style
2. `elira` confirms thin weapon, cloak, and face readability at tactical scale
3. the rest of the roster follows only after both approvals pass

### Gemini Sprite Batch

Use `docs/assets/comfy-workflows/unit-gemini-sprite-batch.ui-workflow.json`.

This graph is also single-unit.
It assumes the unit already has an approved full-body reference and an approved Gemini lookdev proof sheet.

1. Import the workflow.
2. Load the approved unit reference and the approved Gemini lookdev sheet.
3. Replace every `unit_CHANGE_ME_*` save prefix with the target unit ID.
4. Queue once to emit the source grids, per-direction animation proof strips, and final stitched battle atlas.
5. Pair the atlas with the fixed JSON manifest already generated under `output/comfy/manifests/battle-json/`.

The Gemini batch graph uses:

- one 4x3 source grid for row A of each world direction
- one 4x3 source grid for row B of each world direction
- fixed `128x128` crop extraction after normalization to a `512x384` grid canvas
- stitch nodes to rebuild the runtime `12x8` atlas contract in `north`, `east`, `south`, `west` order

Expected proof and atlas prefixes:

- `unit_<unitId>_source_<direction>_row_a`
- `unit_<unitId>_source_<direction>_row_b`
- `unit_<unitId>_proof_<direction>_idle`
- `unit_<unitId>_proof_<direction>_move`
- `unit_<unitId>_proof_<direction>_attack`
- `unit_<unitId>_proof_<direction>_cast`
- `unit_<unitId>_proof_<direction>_hit`
- `unit_<unitId>_proof_<direction>_defeat`
- `unit_<unitId>_battle`

Prompt and rendering rules for the Gemini sprite path are locked:

- use `painterly isometric tactical sprite-source` framing, not pixel art
- keep `slightly cute adult proportions`, `soft facial planes`, and `clear hand and weapon read`
- forbid `super-deformed` and `hyper-grim` outcomes
- use flat chroma magenta `#FF00FF` as the key color and keep that exact color out of the character body, costume, and weapon
- use world-direction prompts, not a single right-facing side view

Batch review fails if any of these checks fail:

- silhouettes stop reading at small battlefield scale
- world directions are easy to confuse
- foot anchors drift between frames
- the sprite stops reading in the roughly `2.0x` duel presentation

### Terrain Catalog

Use `docs/assets/comfy-workflows/terrain-catalog-batch.ui-workflow.json`.

1. Import the graph.
2. Confirm each terrain family branch is connected.
3. Choose a checkpoint.
4. Queue once to emit all required block and overlay outputs.

The terrain graph now renders each asset family at a larger source size and scales down to the delivery canvas.

Expected output prefixes follow the runtime filename contract:

- `terrain_<terrainId>_<variant>_block`
- `terrain_<terrainId>_<variant>_overlay`

### VFX Master

Use `docs/assets/comfy-workflows/vfx-master-batch.ui-workflow.json`.

1. Import the graph.
2. Confirm all four cue branches are connected.
3. Choose a checkpoint.
4. Queue once to emit the required primary VFX sheets.

The VFX graph now renders each cue at a larger source size and scales down to the delivery canvas.

Expected output prefixes:

- `vfx_impact-flash_steel_a`
- `vfx_cast-burst_radiant_a`
- `vfx_status-pulse_ward_a`
- `vfx_projectile-burst_wind_a`

## Output Contract

The master workflows target the live runtime art contract.

- Units:
  - battle atlas canvas `1536x1024`
  - head portrait `128x128`
  - companion JSON generated from the fixed packing contract
- Gemini sprite batch:
  - battle atlas canvas `1536x1024`
  - companion JSON reused from `output/comfy/manifests/battle-json/`
  - no head portrait output in this first pass
- Terrain:
  - final block and overlay exports `136x112`
- VFX:
  - final primary sheets `256x256`

The canonical sizing and naming rules remain in `docs/assets/prototype-visual-asset-spec.md`.

## Reality Check

These graphs are designed to improve coherence and small-scale readability, but they still use stock diffusion outputs.

- They are much more reliable than the original direct-to-final-size graphs.
- They do not guarantee perfect production-ready transparency by themselves.
- If you need true clean alpha edges for shipping assets, plan on a follow-up knockout or background-removal pass after generation.

## Current Workflow Set

The repo now keeps only the active import-ready UI workflow files:

- `style-bible-lookdev.ui-workflow.json`
- `unit-gemini-sprite-lookdev.ui-workflow.json`
- `unit-gemini-sprite-batch.ui-workflow.json`
- `unit-master-batch.ui-workflow.json`
- `terrain-catalog-batch.ui-workflow.json`
- `vfx-master-batch.ui-workflow.json`
