#!/usr/bin/env python3
from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


REPO_ROOT = Path(__file__).resolve().parents[3]
PUBLIC_ROOT = REPO_ROOT / 'tools' / 'asset-workbench' / 'public' / 'demo'

ATLAS_WIDTH = 1536
ATLAS_HEIGHT = 1024
FRAME_WIDTH = 128
FRAME_HEIGHT = 128
PORTRAIT_SIZE = 128
TERRAIN_WIDTH = 136
TERRAIN_HEIGHT = 112
VFX_SIZE = 256

DIRECTIONS = ['north', 'east', 'south', 'west']
ROW_A = [('idle', 0), ('idle', 1), ('move', 0), ('move', 1), ('move', 2), ('move', 3), ('move', 4), ('move', 5), ('attack', 0), ('attack', 1), ('attack', 2), ('attack', 3)]
ROW_B = [('attack', 4), ('cast', 0), ('cast', 1), ('cast', 2), ('cast', 3), ('cast', 4), ('hit', 0), ('hit', 1), ('defeat', 0), ('defeat', 1), ('defeat', 2), ('defeat', 3)]
ANIMATION_COUNTS = {
    'idle': 2,
    'move': 6,
    'attack': 5,
    'cast': 5,
    'hit': 2,
    'defeat': 4,
}


PASS_PALETTE = {
    'cloth': (72, 116, 168, 255),
    'trim': (214, 188, 120, 255),
    'cloak': (32, 58, 88, 240),
    'skin': (230, 205, 174, 255),
    'weapon': (195, 204, 214, 255),
    'accent': (106, 196, 146, 220),
}

REFERENCE_PALETTE = {
    'cloth': (82, 131, 182, 255),
    'trim': (227, 197, 137, 255),
    'cloak': (38, 68, 99, 240),
    'skin': (236, 211, 182, 255),
    'weapon': (210, 217, 228, 255),
    'accent': (124, 204, 164, 220),
}

PURCHASED_PALETTE = {
    'cloth': (124, 94, 116, 245),
    'trim': (184, 144, 152, 255),
    'cloak': (69, 46, 63, 230),
    'skin': (212, 188, 182, 255),
    'weapon': (166, 160, 182, 255),
    'accent': (230, 112, 196, 200),
}


def ensure_dirs() -> None:
    for relative in [
        'generated-pass/references',
        'purchased-candidate/references',
    ]:
        (PUBLIC_ROOT / relative).mkdir(parents=True, exist_ok=True)


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def render_character_frame(direction: str, animation: str, frame_index: int, palette: dict[str, tuple[int, int, int, int]], *, contrast_boost: float = 1.0, silhouette_scale: float = 1.0, outline: bool = False) -> Image.Image:
    image = Image.new('RGBA', (FRAME_WIDTH, FRAME_HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, 'RGBA')

    direction_offset = {
        'north': 0,
        'east': 8,
        'south': 0,
        'west': -8,
    }[direction]
    bob = {
        'idle': math.sin(frame_index * math.pi) * 1.0,
        'move': math.sin((frame_index / 5.0) * math.pi * 2.0) * 3.0,
        'attack': -frame_index * 0.8,
        'cast': math.sin(frame_index / 4.0 * math.pi) * 2.0 - 1.0,
        'hit': frame_index * 1.2,
        'defeat': frame_index * 3.4,
    }[animation]

    center_x = 64 + direction_offset
    foot_y = 108 + bob
    head_y = 34 + bob
    shoulder_y = 50 + bob
    hip_y = 74 + bob
    body_width = 28 * silhouette_scale
    cloak_width = 44 * silhouette_scale

    shadow_width = 30 + (4 if animation == 'move' else 0)
    draw.ellipse(
        (center_x - shadow_width, foot_y - 8, center_x + shadow_width, foot_y + 4),
        fill=(12, 16, 24, 110),
    )

    leg_splay = {
        'idle': 5,
        'move': 9 + abs(math.sin((frame_index / 5.0) * math.pi * 2.0)) * 6,
        'attack': 8,
        'cast': 6,
        'hit': 4,
        'defeat': 2,
    }[animation]

    draw.polygon(
        [
            (center_x - cloak_width * 0.5, shoulder_y + 4),
            (center_x + cloak_width * 0.5, shoulder_y + 4),
            (center_x + body_width * 0.8, hip_y + 12),
            (center_x - body_width * 0.8, hip_y + 12),
        ],
        fill=palette['cloak'],
    )

    torso_top = shoulder_y
    torso_bottom = hip_y + 12
    draw.rounded_rectangle(
        (
            center_x - body_width * 0.5,
            torso_top,
            center_x + body_width * 0.5,
            torso_bottom,
        ),
        radius=8,
        fill=palette['cloth'],
    )

    draw.rectangle(
        (
            center_x - 4,
            torso_top + 4,
            center_x + 4,
            torso_bottom - 2,
        ),
        fill=palette['trim'],
    )

    draw.rectangle((center_x - leg_splay, hip_y + 2, center_x - leg_splay + 8, foot_y), fill=(50, 44, 42, 255))
    draw.rectangle((center_x + leg_splay - 8, hip_y + 2, center_x + leg_splay, foot_y), fill=(50, 44, 42, 255))

    arm_raise = {
        'idle': 0,
        'move': math.sin((frame_index / 5.0) * math.pi * 2.0) * 5,
        'attack': 10 + frame_index * 3,
        'cast': 6 + frame_index * 2,
        'hit': -4,
        'defeat': -8 - frame_index * 2,
    }[animation]
    weapon_side = {
        'north': -18,
        'east': 22,
        'south': 18,
        'west': -22,
    }[direction]
    weapon_reach = 34 + (frame_index * 3 if animation == 'attack' else 0)

    draw.rectangle((center_x - 20, shoulder_y + 6, center_x - 10, shoulder_y + 32), fill=palette['skin'])
    draw.rectangle((center_x + 10, shoulder_y + 6, center_x + 20, shoulder_y + 32), fill=palette['skin'])
    draw.line(
        [
            (center_x + weapon_side * 0.15, shoulder_y + 12),
            (center_x + weapon_side, shoulder_y - arm_raise),
            (center_x + weapon_side + (6 if weapon_side > 0 else -6), shoulder_y - weapon_reach),
        ],
        fill=palette['weapon'],
        width=4,
    )
    draw.ellipse((center_x + weapon_side - 6, shoulder_y - weapon_reach - 6, center_x + weapon_side + 6, shoulder_y - weapon_reach + 6), fill=palette['accent'])

    draw.ellipse((center_x - 15, head_y - 6, center_x + 15, head_y + 22), fill=palette['skin'])
    draw.arc((center_x - 19, head_y - 10, center_x + 19, head_y + 26), start=180, end=360, fill=palette['trim'], width=5)
    draw.polygon(
        [
            (center_x - 24, head_y + 4),
            (center_x, head_y - 14),
            (center_x + 24, head_y + 4),
            (center_x + 18, head_y + 28),
            (center_x - 18, head_y + 28),
        ],
        fill=palette['cloak'],
    )

    if direction == 'north':
        draw.rectangle((center_x - 6, head_y + 8, center_x + 6, head_y + 10), fill=(60, 54, 64, 180))
    else:
        draw.ellipse((center_x - 8, head_y + 8, center_x - 4, head_y + 12), fill=(28, 24, 28, 200))
        draw.ellipse((center_x + 4, head_y + 8, center_x + 8, head_y + 12), fill=(28, 24, 28, 200))

    if outline:
        outline_layer = image.filter(ImageFilter.GaussianBlur(1.2))
        composite = Image.new('RGBA', image.size, (0, 0, 0, 0))
        composite.alpha_composite(outline_layer, (0, 0))
        composite.alpha_composite(image, (0, 0))
        image = composite

    if contrast_boost != 1.0:
        pixels = image.load()
        for y in range(image.height):
            for x in range(image.width):
                r, g, b, a = pixels[x, y]
                if a == 0:
                    continue
                midpoint = 112
                r = int(clamp(midpoint + (r - midpoint) * contrast_boost, 0, 255))
                g = int(clamp(midpoint + (g - midpoint) * contrast_boost, 0, 255))
                b = int(clamp(midpoint + (b - midpoint) * contrast_boost, 0, 255))
                pixels[x, y] = (r, g, b, a)

    return image


def render_atlas(unit_id: str, palette: dict[str, tuple[int, int, int, int]], *, contrast_boost: float = 1.0, silhouette_scale: float = 1.0, outline: bool = False) -> Image.Image:
    atlas = Image.new('RGBA', (ATLAS_WIDTH, ATLAS_HEIGHT), (0, 0, 0, 0))
    for direction_index, direction in enumerate(DIRECTIONS):
        row_a_index = direction_index * 2
        row_b_index = row_a_index + 1
        for column, (animation, frame_index) in enumerate(ROW_A):
            frame = render_character_frame(direction, animation, frame_index, palette, contrast_boost=contrast_boost, silhouette_scale=silhouette_scale, outline=outline)
            atlas.alpha_composite(frame, (column * FRAME_WIDTH, row_a_index * FRAME_HEIGHT))
        for column, (animation, frame_index) in enumerate(ROW_B):
            frame = render_character_frame(direction, animation, frame_index, palette, contrast_boost=contrast_boost, silhouette_scale=silhouette_scale, outline=outline)
            atlas.alpha_composite(frame, (column * FRAME_WIDTH, row_b_index * FRAME_HEIGHT))
    return atlas


def render_portrait(palette: dict[str, tuple[int, int, int, int]], size: int = PORTRAIT_SIZE, *, off_center: float = 0.0, trim_size: int = 0) -> Image.Image:
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, 'RGBA')
    center_x = size * (0.5 + off_center)
    face_radius = size * 0.19
    hood_radius = size * 0.36

    draw.ellipse((center_x - hood_radius, 12, center_x + hood_radius, size - 4), fill=palette['cloak'])
    draw.rounded_rectangle((center_x - hood_radius * 0.62, 24, center_x + hood_radius * 0.62, size - 8), radius=18, fill=palette['cloth'])
    draw.ellipse((center_x - face_radius, 30, center_x + face_radius, 86), fill=palette['skin'])
    draw.arc((center_x - hood_radius, 8, center_x + hood_radius, 88), start=190, end=350, fill=palette['trim'], width=5)
    draw.ellipse((center_x - 12, 52, center_x - 6, 58), fill=(28, 24, 24, 210))
    draw.ellipse((center_x + 6, 52, center_x + 12, 58), fill=(28, 24, 24, 210))
    draw.polygon(
        [
            (center_x, 58),
            (center_x - 5, 70),
            (center_x + 5, 70),
        ],
        fill=(180, 134, 120, 200),
    )
    draw.line((center_x - 10, 74, center_x + 10, 74), fill=(130, 80, 74, 180), width=2)
    draw.ellipse((center_x - 22, 24, center_x + 22, 42), fill=palette['trim'])

    if trim_size:
        return image.resize((trim_size, trim_size), Image.Resampling.LANCZOS)
    return image


def render_terrain_block(top_color: tuple[int, int, int, int], face_color: tuple[int, int, int, int], accent_color: tuple[int, int, int, int], *, width: int = TERRAIN_WIDTH, height: int = TERRAIN_HEIGHT, dense_center: bool = False) -> Image.Image:
    image = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, 'RGBA')
    center_x = width / 2
    top_y = 6
    mid_y = 36
    base_y = min(height - 8, 74)
    diamond = [(center_x, top_y), (width - 8, mid_y), (center_x, base_y), (8, mid_y)]
    draw.polygon(diamond, fill=top_color)
    draw.polygon([(8, mid_y), (center_x, base_y), (center_x, height - 6), (8, mid_y + 38)], fill=face_color)
    draw.polygon([(width - 8, mid_y), (center_x, base_y), (center_x, height - 6), (width - 8, mid_y + 38)], fill=tuple(max(channel - 18, 0) for channel in face_color[:3]) + (255,))

    for patch_index in range(6):
        t = patch_index / 5
        px = lerp(24, width - 24, t)
        py = lerp(26, 48, (patch_index % 3) / 2)
        radius = 7 + (patch_index % 2) * 2
        draw.ellipse((px - radius, py - radius * 0.6, px + radius, py + radius * 0.6), fill=accent_color)

    if dense_center:
        draw.ellipse((center_x - 24, 36, center_x + 24, 76), fill=(48, 40, 54, 180))
        draw.rectangle((center_x - 8, 28, center_x + 8, 88), fill=(72, 54, 82, 170))

    return image


def render_terrain_overlay(color: tuple[int, int, int, int], *, width: int = TERRAIN_WIDTH, height: int = TERRAIN_HEIGHT, dense: bool = False) -> Image.Image:
    image = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, 'RGBA')
    leaf_count = 18 if dense else 10
    for leaf_index in range(leaf_count):
        progress = leaf_index / max(1, leaf_count - 1)
        x = lerp(18, width - 18, progress)
        y = 18 + math.sin(progress * math.pi * 2.0) * 11 + (leaf_index % 3) * 8
        w = 18 + (leaf_index % 2) * 8
        h = 9 + (leaf_index % 3)
        draw.ellipse((x - w / 2, y - h / 2, x + w / 2, y + h / 2), fill=color)
    return image


def render_vfx(base_color: tuple[int, int, int], ring_color: tuple[int, int, int], *, size: int = VFX_SIZE, center_offset: tuple[int, int] = (0, 0), overexposed: bool = False) -> Image.Image:
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, 'RGBA')
    center_x = size / 2 + center_offset[0]
    center_y = size / 2 + center_offset[1]
    max_radius = size * 0.34

    for step in range(10, 0, -1):
        radius = max_radius * step / 10
        alpha = int(lerp(24, 180, step / 10))
        fill = (*base_color, alpha)
        draw.ellipse((center_x - radius, center_y - radius, center_x + radius, center_y + radius), fill=fill)

    for arm in range(8):
        angle = arm * math.pi / 4.0
        inner = max_radius * 0.45
        outer = max_radius * (1.2 if overexposed else 1.0)
        draw.polygon(
            [
                (center_x + math.cos(angle - 0.14) * inner, center_y + math.sin(angle - 0.14) * inner),
                (center_x + math.cos(angle) * outer, center_y + math.sin(angle) * outer),
                (center_x + math.cos(angle + 0.14) * inner, center_y + math.sin(angle + 0.14) * inner),
            ],
            fill=(*ring_color, 195),
        )

    for ring in range(3):
        radius = max_radius * (0.56 + ring * 0.18)
        alpha = 160 - ring * 32
        draw.ellipse((center_x - radius, center_y - radius, center_x + radius, center_y + radius), outline=(*ring_color, alpha), width=3)

    glow = image.filter(ImageFilter.GaussianBlur(6 if overexposed else 4))
    composite = Image.new('RGBA', image.size, (0, 0, 0, 0))
    composite.alpha_composite(glow, (0, 0))
    composite.alpha_composite(image, (0, 0))
    return composite


def write_png(relative_path: str, image: Image.Image) -> None:
    path = PUBLIC_ROOT / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format='PNG', optimize=True)


def build_manifest(unit_id: str, atlas_file: str) -> dict:
    frames = []
    for direction_index, direction in enumerate(DIRECTIONS):
        row_a_index = direction_index * 2
        row_b_index = row_a_index + 1
        for column, (animation, frame_index) in enumerate(ROW_A):
            frames.append(
                {
                    'frameId': f'unit_{unit_id}_{direction}_{animation}_{frame_index:02d}',
                    'direction': direction,
                    'animation': animation,
                    'index': frame_index,
                    'x': column * FRAME_WIDTH,
                    'y': row_a_index * FRAME_HEIGHT,
                    'w': FRAME_WIDTH,
                    'h': FRAME_HEIGHT,
                    'pivotX': 64,
                    'pivotY': 108,
                }
            )
        for column, (animation, frame_index) in enumerate(ROW_B):
            frames.append(
                {
                    'frameId': f'unit_{unit_id}_{direction}_{animation}_{frame_index:02d}',
                    'direction': direction,
                    'animation': animation,
                    'index': frame_index,
                    'x': column * FRAME_WIDTH,
                    'y': row_b_index * FRAME_HEIGHT,
                    'w': FRAME_WIDTH,
                    'h': FRAME_HEIGHT,
                    'pivotX': 64,
                    'pivotY': 108,
                }
            )
    return {
        'unitId': unit_id,
        'atlasFile': atlas_file,
        'frameWidth': FRAME_WIDTH,
        'frameHeight': FRAME_HEIGHT,
        'pivotX': 64,
        'pivotY': 108,
        'directions': DIRECTIONS,
        'animations': ANIMATION_COUNTS,
        'frames': frames,
    }


def build_demo_workspace_manifest() -> dict:
    return {
        'version': 1,
        'rootName': 'Demo Workspace',
        'featuredAssetId': 'demo/generated-pass/unit_rowan_battle.png',
        'onboarding': [
            {
                'id': 'pass-atlas',
                'title': 'Pass sample',
                'description': 'Open Rowan first to see a contract-clean atlas, linked reference, and duel-ready preview.',
                'assetId': 'demo/generated-pass/unit_rowan_battle.png',
            },
            {
                'id': 'portrait-check',
                'title': 'Portrait readability',
                'description': 'Switch to the Rowan portrait to check 128, 38, and 32 pixel readability at a glance.',
                'assetId': 'demo/generated-pass/unit_rowan_head.png',
            },
            {
                'id': 'warn-policy',
                'title': 'Purchased candidate',
                'description': 'Jump to the Sable portrait to see size failures softened into warnings for adaptable purchased art.',
                'assetId': 'demo/purchased-candidate/unit_sable_head.png',
            },
            {
                'id': 'persistence',
                'title': 'Review persistence',
                'description': 'Edit status or notes and refresh. Demo reviews persist in browser local storage instead of .asset-workbench/workspace.json.',
                'assetId': 'demo/generated-pass/unit_rowan_battle.png',
            },
        ],
        'assets': [
            {
                'path': 'demo/generated-pass/unit_rowan_battle.png',
                'kind': 'unitAtlas',
                'sourceType': 'generated',
                'referenceAssetId': 'demo/generated-pass/references/unit_rowan_battle_reference.png',
                'seededEntry': {
                    'reviewStatus': 'approved',
                    'notes': 'Contract-clean demo atlas. Use this first to see sheet, frame, and duel views with a linked reference.',
                    'checklist': {
                        'direction-readability': True,
                        'weapon-identity': True,
                        'foot-anchor': True,
                        'duel-readability': True,
                    },
                },
            },
            {
                'path': 'demo/generated-pass/unit_rowan_battle.json',
                'kind': 'unitManifest',
                'sourceType': 'generated',
                'seededEntry': {
                    'reviewStatus': 'approved',
                    'notes': 'Generated demo manifest aligned to the Rowan atlas fixture.',
                    'checklist': {
                        'manifest-contract': True,
                    },
                },
            },
            {
                'path': 'demo/generated-pass/unit_rowan_head.png',
                'kind': 'portrait',
                'sourceType': 'generated',
                'referenceAssetId': 'demo/generated-pass/references/unit_rowan_head_reference.png',
                'seededEntry': {
                    'reviewStatus': 'approved',
                    'notes': 'Portrait sample tuned for 38px and 32px chip readability.',
                    'checklist': {
                        'face-legibility': True,
                        'mask-crop': True,
                    },
                },
            },
            {
                'path': 'demo/generated-pass/terrain_grass_moss_block.png',
                'kind': 'terrainBlock',
                'sourceType': 'generated',
                'referenceAssetId': 'demo/generated-pass/references/terrain_grass_moss_block_reference.png',
                'seededEntry': {
                    'reviewStatus': 'approved',
                    'notes': 'Terrain block sample with safe corners and a readable tactical center.',
                    'checklist': {
                        'tile-center': True,
                        'diamond-language': True,
                    },
                },
            },
            {
                'path': 'demo/generated-pass/terrain_grass_moss_overlay.png',
                'kind': 'terrainOverlay',
                'sourceType': 'generated',
                'referenceAssetId': 'demo/generated-pass/references/terrain_grass_moss_block_reference.png',
                'seededEntry': {
                    'reviewStatus': 'approved',
                    'notes': 'Overlay sample stays decorative without swallowing the tile center.',
                    'checklist': {
                        'overlay-restraint': True,
                    },
                },
            },
            {
                'path': 'demo/generated-pass/vfx_cast-burst_arc_a.png',
                'kind': 'vfxSheet',
                'sourceType': 'generated',
                'referenceAssetId': 'demo/generated-pass/references/vfx_cast-burst_reference.png',
                'seededEntry': {
                    'reviewStatus': 'approved',
                    'notes': 'Centered VFX burst fixture with dark and light backdrop checks.',
                    'checklist': {
                        'effect-silhouette': True,
                        'centered-energy': True,
                    },
                },
            },
            {
                'path': 'demo/generated-pass/references/unit_rowan_battle_reference.png',
                'kind': 'referenceImage',
                'sourceType': 'generated',
                'seededEntry': {
                    'reviewStatus': 'approved',
                    'checklist': {
                        'reference-approved': True,
                    },
                },
            },
            {
                'path': 'demo/generated-pass/references/unit_rowan_head_reference.png',
                'kind': 'referenceImage',
                'sourceType': 'generated',
                'seededEntry': {
                    'reviewStatus': 'approved',
                    'checklist': {
                        'reference-approved': True,
                    },
                },
            },
            {
                'path': 'demo/generated-pass/references/terrain_grass_moss_block_reference.png',
                'kind': 'referenceImage',
                'sourceType': 'generated',
                'seededEntry': {
                    'reviewStatus': 'approved',
                    'checklist': {
                        'reference-approved': True,
                    },
                },
            },
            {
                'path': 'demo/generated-pass/references/vfx_cast-burst_reference.png',
                'kind': 'referenceImage',
                'sourceType': 'generated',
                'seededEntry': {
                    'reviewStatus': 'approved',
                    'checklist': {
                        'reference-approved': True,
                    },
                },
            },
            {
                'path': 'demo/purchased-candidate/unit_sable_battle.png',
                'kind': 'unitAtlas',
                'sourceType': 'purchased',
                'seededEntry': {
                    'reviewStatus': 'hold',
                    'notes': 'Purchased atlas candidate. It previews well enough to judge silhouette and animation, but still needs runtime adaptation.',
                },
            },
            {
                'path': 'demo/purchased-candidate/unit_sable_head.png',
                'kind': 'portrait',
                'sourceType': 'purchased',
                'referenceAssetId': 'demo/purchased-candidate/references/unit_sable_head_reference.png',
                'seededEntry': {
                    'reviewStatus': 'hold',
                    'notes': 'Intentional purchased-art warning sample. Size is off-spec, but the workbench softens it to a warning because it can still be padded or scaled.',
                },
            },
            {
                'path': 'demo/purchased-candidate/terrain_ruins_cracked_block.png',
                'kind': 'terrainBlock',
                'sourceType': 'purchased',
                'seededEntry': {
                    'reviewStatus': 'hold',
                    'notes': 'Ruins block candidate with size drift and a cluttered center to demonstrate warn-first adaptation review.',
                },
            },
            {
                'path': 'demo/purchased-candidate/terrain_ruins_cracked_overlay.png',
                'kind': 'terrainOverlay',
                'sourceType': 'purchased',
                'seededEntry': {
                    'reviewStatus': 'hold',
                    'notes': 'Overlay intentionally dense so the tactical center warning is easy to spot.',
                },
            },
            {
                'path': 'demo/purchased-candidate/vfx_status-pulse_neon_a.png',
                'kind': 'vfxSheet',
                'sourceType': 'purchased',
                'seededEntry': {
                    'reviewStatus': 'hold',
                    'notes': 'Over-bright purchased VFX candidate showing center drift and exposure warnings.',
                },
            },
            {
                'path': 'demo/purchased-candidate/references/unit_sable_head_reference.png',
                'kind': 'referenceImage',
                'sourceType': 'generated',
                'seededEntry': {
                    'reviewStatus': 'approved',
                    'checklist': {
                        'reference-approved': True,
                    },
                },
            },
        ],
    }


def build_assets() -> None:
    ensure_dirs()

    write_png('generated-pass/unit_rowan_battle.png', render_atlas('rowan', PASS_PALETTE, contrast_boost=1.04, outline=True))
    write_png('generated-pass/references/unit_rowan_battle_reference.png', render_atlas('rowan', REFERENCE_PALETTE, contrast_boost=1.02))
    write_png('generated-pass/unit_rowan_head.png', render_portrait(PASS_PALETTE))
    write_png('generated-pass/references/unit_rowan_head_reference.png', render_portrait(REFERENCE_PALETTE))
    write_png('generated-pass/terrain_grass_moss_block.png', render_terrain_block((86, 132, 78, 255), (70, 96, 62, 255), (118, 168, 96, 220)))
    write_png('generated-pass/references/terrain_grass_moss_block_reference.png', render_terrain_block((92, 144, 86, 255), (72, 104, 68, 255), (136, 176, 102, 220)))
    write_png('generated-pass/terrain_grass_moss_overlay.png', render_terrain_overlay((160, 214, 136, 135)))
    write_png('generated-pass/vfx_cast-burst_arc_a.png', render_vfx((120, 214, 255), (255, 242, 176)))
    write_png('generated-pass/references/vfx_cast-burst_reference.png', render_vfx((130, 224, 255), (255, 248, 190)))

    write_png('purchased-candidate/unit_sable_battle.png', render_atlas('sable', PURCHASED_PALETTE, contrast_boost=0.82, silhouette_scale=0.9))
    write_png('purchased-candidate/unit_sable_head.png', render_portrait(PURCHASED_PALETTE, trim_size=96, off_center=0.13))
    write_png('purchased-candidate/references/unit_sable_head_reference.png', render_portrait(REFERENCE_PALETTE, off_center=0.04))
    write_png('purchased-candidate/terrain_ruins_cracked_block.png', render_terrain_block((122, 112, 132, 255), (82, 74, 96, 255), (154, 138, 166, 176), width=150, dense_center=True))
    write_png('purchased-candidate/terrain_ruins_cracked_overlay.png', render_terrain_overlay((190, 164, 218, 118), dense=True))
    write_png('purchased-candidate/vfx_status-pulse_neon_a.png', render_vfx((255, 188, 245), (255, 244, 255), size=300, center_offset=(28, -14), overexposed=True))

    manifest_path = PUBLIC_ROOT / 'generated-pass' / 'unit_rowan_battle.json'
    manifest_path.write_text(json.dumps(build_manifest('rowan', 'unit_rowan_battle.png'), indent=2) + '\n', encoding='utf-8')

    workspace_path = PUBLIC_ROOT / 'workspace.json'
    workspace_path.write_text(json.dumps(build_demo_workspace_manifest(), indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    build_assets()
