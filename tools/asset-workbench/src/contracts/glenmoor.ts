import type {
  AssetKind,
  AtlasAnimation,
  AtlasAnimationCounts,
  AtlasFrame,
  AtlasManifest,
  ChecklistTemplateItem,
  Direction,
  PreviewState,
  WorkspaceEntry,
} from '../types'

// Source of truth:
// - docs/assets/prototype-visual-asset-spec.md
// - output/comfy/manifests/battle-json/*.json
// When those contracts change, update this file first and keep tests aligned.

export const GLENMOOR_DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west']

export const GLENMOOR_ANIMATIONS: AtlasAnimation[] = ['idle', 'move', 'attack', 'cast', 'hit', 'defeat']

export const GLENMOOR_ANIMATION_COUNTS: AtlasAnimationCounts = {
  idle: 2,
  move: 6,
  attack: 5,
  cast: 5,
  hit: 2,
  defeat: 4,
}

export const GLENMOOR_UNITS = [
  'rowan',
  'elira',
  'sable',
  'maelin',
  'osric',
  'talia',
  'brigandCaptain',
  'huntmaster',
  'hexbinder',
  'shieldbearer',
  'cutpurse',
  'fanatic',
  'fordStalker',
  'roadReaver',
] as const

export const GLENMOOR_TERRAINS = ['grass', 'road', 'forest', 'water', 'stone', 'bridge', 'ruins'] as const

export const GLENMOOR_VFX_CUES = ['impact-flash', 'cast-burst', 'status-pulse', 'projectile-burst'] as const

export const GLENMOOR_CONTRACT = {
  atlas: {
    width: 1536,
    height: 1024,
    frameWidth: 128,
    frameHeight: 128,
    pivotX: 64,
    pivotY: 108,
    columns: 12,
    rows: 8,
    safeWidth: 72,
    safeHeight: 104,
  },
  portrait: {
    width: 128,
    height: 128,
    previewSizes: [38, 32] as const,
  },
  duel: {
    scale: 2,
  },
  terrain: {
    width: 136,
    height: 112,
    topDiamondHeight: 68,
    sideFaceHeight: 44,
    logicalCenterX: 68,
    logicalCenterY: 34,
  },
  vfx: {
    width: 256,
    height: 256,
  },
}

export const DEFAULT_PREVIEW_STATE: PreviewState = {
  viewMode: 'sheet',
  direction: 'south',
  animation: 'idle',
  frameCursor: 0,
  isPlaying: true,
  flipX: false,
}

const rowA: Array<[AtlasAnimation, number]> = [
  ['idle', 0],
  ['idle', 1],
  ['move', 0],
  ['move', 1],
  ['move', 2],
  ['move', 3],
  ['move', 4],
  ['move', 5],
  ['attack', 0],
  ['attack', 1],
  ['attack', 2],
  ['attack', 3],
]

const rowB: Array<[AtlasAnimation, number]> = [
  ['attack', 4],
  ['cast', 0],
  ['cast', 1],
  ['cast', 2],
  ['cast', 3],
  ['cast', 4],
  ['hit', 0],
  ['hit', 1],
  ['defeat', 0],
  ['defeat', 1],
  ['defeat', 2],
  ['defeat', 3],
]

export function buildSyntheticAtlasManifest(unitId: string): AtlasManifest {
  const frames: AtlasFrame[] = []

  for (const [directionIndex, direction] of GLENMOOR_DIRECTIONS.entries()) {
    const rowAIndex = directionIndex * 2
    const rowBIndex = rowAIndex + 1

    for (const [column, [animation, index]] of rowA.entries()) {
      frames.push({
        frameId: `unit_${unitId}_${direction}_${animation}_${String(index).padStart(2, '0')}`,
        direction,
        animation,
        index,
        x: column * GLENMOOR_CONTRACT.atlas.frameWidth,
        y: rowAIndex * GLENMOOR_CONTRACT.atlas.frameHeight,
        w: GLENMOOR_CONTRACT.atlas.frameWidth,
        h: GLENMOOR_CONTRACT.atlas.frameHeight,
        pivotX: GLENMOOR_CONTRACT.atlas.pivotX,
        pivotY: GLENMOOR_CONTRACT.atlas.pivotY,
      })
    }

    for (const [column, [animation, index]] of rowB.entries()) {
      frames.push({
        frameId: `unit_${unitId}_${direction}_${animation}_${String(index).padStart(2, '0')}`,
        direction,
        animation,
        index,
        x: column * GLENMOOR_CONTRACT.atlas.frameWidth,
        y: rowBIndex * GLENMOOR_CONTRACT.atlas.frameHeight,
        w: GLENMOOR_CONTRACT.atlas.frameWidth,
        h: GLENMOOR_CONTRACT.atlas.frameHeight,
        pivotX: GLENMOOR_CONTRACT.atlas.pivotX,
        pivotY: GLENMOOR_CONTRACT.atlas.pivotY,
      })
    }
  }

  return {
    unitId,
    atlasFile: `unit_${unitId}_battle.webp`,
    frameWidth: GLENMOOR_CONTRACT.atlas.frameWidth,
    frameHeight: GLENMOOR_CONTRACT.atlas.frameHeight,
    pivotX: GLENMOOR_CONTRACT.atlas.pivotX,
    pivotY: GLENMOOR_CONTRACT.atlas.pivotY,
    directions: [...GLENMOOR_DIRECTIONS],
    animations: { ...GLENMOOR_ANIMATION_COUNTS },
    frames,
  }
}

export const CHECKLIST_TEMPLATES: Record<AssetKind, ChecklistTemplateItem[]> = {
  unitAtlas: [
    {
      id: 'direction-readability',
      label: 'Direction readability',
      description: 'North, east, south, and west read clearly at gameplay scale.',
    },
    {
      id: 'weapon-identity',
      label: 'Weapon identity stability',
      description: 'Weapon and silhouette stay consistent across all frames.',
    },
    {
      id: 'foot-anchor',
      label: 'Foot anchor consistency',
      description: 'Feet stay planted around the intended pivot with no drifting.',
    },
    {
      id: 'duel-readability',
      label: 'Duel 2x readability',
      description: 'The frame remains readable in the zoomed duel presentation.',
    },
  ],
  unitManifest: [
    {
      id: 'manifest-contract',
      label: 'Manifest contract reviewed',
      description: 'Manifest metadata matches the current runtime packing contract.',
    },
  ],
  portrait: [
    {
      id: 'face-legibility',
      label: 'Face legibility',
      description: 'Eyes, brow, nose, and major headgear stay readable at 32x32.',
    },
    {
      id: 'mask-crop',
      label: 'Mask crop safety',
      description: 'Rounded-square and circular crops do not clip the face.',
    },
  ],
  terrainBlock: [
    {
      id: 'tile-center',
      label: 'Tile center readable',
      description: 'The occupied center remains readable and unit feet are not buried.',
    },
    {
      id: 'diamond-language',
      label: 'Diamond anchor stability',
      description: 'Top diamond perspective and side face match the Glenmoor projection.',
    },
  ],
  terrainOverlay: [
    {
      id: 'overlay-restraint',
      label: 'Overlay restraint',
      description: 'The overlay adds flavor without obscuring the tactical center.',
    },
  ],
  vfxSheet: [
    {
      id: 'effect-silhouette',
      label: 'Effect silhouette',
      description: 'The effect reads clearly at gameplay scale on dark and light backdrops.',
    },
    {
      id: 'centered-energy',
      label: 'Centered energy',
      description: 'The burst is centered enough to scale and loop without recropping.',
    },
  ],
  referenceImage: [
    {
      id: 'reference-approved',
      label: 'Reference approved',
      description: 'This image is the approved visual reference for comparison.',
    },
  ],
  unknown: [],
}

export function createDefaultWorkspaceEntry(kind: AssetKind): WorkspaceEntry {
  const checklist = Object.fromEntries(CHECKLIST_TEMPLATES[kind].map((item) => [item.id, false]))

  return {
    reviewStatus: 'unreviewed',
    notes: '',
    checklist,
  }
}
