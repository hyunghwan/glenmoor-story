import { describe, expect, it } from 'vitest'
import { buildSyntheticAtlasManifest, createDefaultWorkspaceEntry } from '../contracts/glenmoor'
import { compareImageMetrics } from '../lib/imageAnalysis'
import { getFrameAtCursor, getNextFrameCursor } from '../lib/previewState'
import { classifyWorkspaceCandidate } from '../lib/scanWorkspace'
import { buildScanSummary, validateAsset } from '../lib/validation'
import { buildDemoWorkspaceFile } from '../lib/workspaceStore'
import type { AssetRecord, AtlasFrame, DemoWorkspaceManifest, ImageMetrics, ScanCandidate } from '../types'

function makeMetrics(partial: Partial<ImageMetrics> = {}): ImageMetrics {
  return {
    width: 128,
    height: 128,
    opaqueRatio: 0.42,
    transparentRatio: 0.58,
    edgeOpaqueRatio: 0.02,
    magentaRatio: 0,
    meanLuminance: 0.42,
    meanSaturation: 0.33,
    averageColor: { r: 110, g: 100, b: 90 },
    centerOfMass: { x: 64, y: 64 },
    centerOfMassDistance: 0.04,
    silhouetteMass: 0.42,
    contrast38: 0.14,
    contrast32: 0.12,
    alphaGrid: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0.15)),
    dominantColors: [
      { hex: '#806040', ratio: 0.42 },
      { hex: '#405060', ratio: 0.26 },
    ],
    bounds: {
      minX: 12,
      minY: 8,
      maxX: 112,
      maxY: 118,
    },
    ...partial,
  }
}

function makeAsset(partial: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: 'unit_rowan_head.webp',
    path: 'unit_rowan_head.webp',
    name: 'unit_rowan_head.webp',
    extension: 'webp',
    kind: 'portrait',
    sourceType: 'generated',
    fileSize: 1024,
    meta: {
      unitId: 'rowan',
      stem: 'unit_rowan_head',
    },
    findings: [],
    metrics: makeMetrics(),
    ...partial,
  }
}

describe('Glenmoor asset contracts', () => {
  it('builds a deterministic 96-frame synthetic atlas manifest', () => {
    const manifest = buildSyntheticAtlasManifest('rowan')

    expect(manifest.frames).toHaveLength(96)
    expect(manifest.frames[0]?.frameId).toBe('unit_rowan_north_idle_00')
    expect(manifest.frames.at(-1)?.frameId).toBe('unit_rowan_west_defeat_03')
    expect(manifest.animations.move).toBe(6)
  })

  it('classifies camelCase unit manifests without losing the unit id casing', () => {
    const candidate: ScanCandidate = {
      relativePath: 'output/comfy/manifests/battle-json/unit_brigandCaptain_battle.json',
      name: 'unit_brigandCaptain_battle.json',
      extension: 'json',
      file: new File(['{}'], 'unit_brigandCaptain_battle.json', { type: 'application/json' }),
      handle: {} as FileSystemFileHandle,
    }

    const classified = classifyWorkspaceCandidate(candidate)

    expect(classified?.kind).toBe('unitManifest')
    expect(classified?.meta.unitId).toBe('brigandCaptain')
  })

  it('downgrades adaptable purchased-art size failures to warnings', () => {
    const asset = makeAsset({
      sourceType: 'purchased',
      metrics: makeMetrics({
        width: 96,
        height: 96,
      }),
    })

    const result = validateAsset(asset)

    expect(result.findings.some((finding) => finding.id === 'portrait-size' && finding.severity === 'warn')).toBe(true)
  })

  it('summarizes manifest-only scans as placeholder-only coverage', () => {
    const manifestAsset = makeAsset({
      id: 'output/comfy/manifests/battle-json/unit_rowan_battle.json',
      path: 'output/comfy/manifests/battle-json/unit_rowan_battle.json',
      name: 'unit_rowan_battle.json',
      extension: 'json',
      kind: 'unitManifest',
      manifest: buildSyntheticAtlasManifest('rowan'),
      metrics: undefined,
      imageUrl: undefined,
      sourceType: 'generated',
      findings: [],
      meta: {
        unitId: 'rowan',
        expectedAtlasPath: 'unit_rowan_battle.webp',
        stem: 'unit_rowan_battle',
      },
    })

    const summary = buildScanSummary([manifestAsset], [])

    expect(summary.coverage.placeholderOnly).toBe(true)
    expect(summary.coverage.atlasCount).toBe(0)
    expect(summary.coverage.expectedUnits).toBeGreaterThan(1)
  })

  it('compares identical image metrics as a clean reference match', () => {
    const left = makeMetrics()
    const right = makeMetrics()

    const comparison = compareImageMetrics(left, right)

    expect(comparison.paletteDrift).toBe(0)
    expect(comparison.luminanceDrift).toBe(0)
    expect(comparison.dominantColorOverlap).toBe(1)
  })

  it('creates empty checklist defaults for unknown assets', () => {
    const entry = createDefaultWorkspaceEntry('unknown')

    expect(entry.reviewStatus).toBe('unreviewed')
    expect(entry.checklist).toEqual({})
  })

  it('seeds demo workspace entries with reference defaults', () => {
    const manifest: DemoWorkspaceManifest = {
      version: 1,
      rootName: 'Demo Workspace',
      featuredAssetId: 'demo/unit_rowan_head.png',
      onboarding: [],
      assets: [
        {
          path: 'demo/unit_rowan_head.png',
          kind: 'portrait',
          sourceType: 'generated',
          referenceAssetId: 'demo/references/unit_rowan_head_reference.png',
          seededEntry: {
            reviewStatus: 'approved',
            checklist: {
              'face-legibility': true,
            },
          },
        },
      ],
    }

    const workspace = buildDemoWorkspaceFile(manifest)
    const entry = workspace.entries['demo/unit_rowan_head.png']

    expect(entry?.reviewStatus).toBe('approved')
    expect(entry?.referenceAssetId).toBe('demo/references/unit_rowan_head_reference.png')
    expect(entry?.checklist['face-legibility']).toBe(true)
  })

  it('preserves stored demo notes while keeping missing seeded references', () => {
    const manifest: DemoWorkspaceManifest = {
      version: 1,
      rootName: 'Demo Workspace',
      featuredAssetId: 'demo/unit_rowan_head.png',
      onboarding: [],
      assets: [
        {
          path: 'demo/unit_rowan_head.png',
          kind: 'portrait',
          sourceType: 'generated',
          referenceAssetId: 'demo/references/unit_rowan_head_reference.png',
          seededEntry: {
            reviewStatus: 'approved',
            checklist: {
              'face-legibility': true,
            },
          },
        },
      ],
    }

    const workspace = buildDemoWorkspaceFile(manifest, {
      version: 1,
      rootName: 'Demo Workspace',
      updatedAt: '2026-03-18T00:00:00.000Z',
      entries: {
        'demo/unit_rowan_head.png': {
          reviewStatus: 'hold',
          notes: 'user note',
          checklist: {
            'mask-crop': true,
          },
        },
      },
    })

    const entry = workspace.entries['demo/unit_rowan_head.png']

    expect(entry?.reviewStatus).toBe('hold')
    expect(entry?.notes).toBe('user note')
    expect(entry?.referenceAssetId).toBe('demo/references/unit_rowan_head_reference.png')
    expect(entry?.checklist['face-legibility']).toBe(true)
    expect(entry?.checklist['mask-crop']).toBe(true)
  })

  it('uses frame cursor positions instead of manifest frame indexes for active selection', () => {
    const sparseFrames: AtlasFrame[] = [
      {
        frameId: 'attack-08',
        direction: 'south',
        animation: 'attack',
        index: 8,
        x: 0,
        y: 0,
        w: 128,
        h: 128,
        pivotX: 64,
        pivotY: 108,
      },
      {
        frameId: 'attack-09',
        direction: 'south',
        animation: 'attack',
        index: 9,
        x: 128,
        y: 0,
        w: 128,
        h: 128,
        pivotX: 64,
        pivotY: 108,
      },
      {
        frameId: 'attack-10',
        direction: 'south',
        animation: 'attack',
        index: 10,
        x: 256,
        y: 0,
        w: 128,
        h: 128,
        pivotX: 64,
        pivotY: 108,
      },
    ]

    expect(getFrameAtCursor(sparseFrames, 1)?.frameId).toBe('attack-09')
    expect(getNextFrameCursor(1, sparseFrames.length)).toBe(2)
    expect(getNextFrameCursor(2, sparseFrames.length)).toBe(0)
  })
})
