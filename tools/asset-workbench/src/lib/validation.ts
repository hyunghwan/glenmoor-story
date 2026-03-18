import { buildSyntheticAtlasManifest, GLENMOOR_ANIMATION_COUNTS, GLENMOOR_CONTRACT, GLENMOOR_DIRECTIONS, GLENMOOR_TERRAINS, GLENMOOR_UNITS, GLENMOOR_VFX_CUES } from '../contracts/glenmoor'
import { compareImageMetrics } from './imageAnalysis'
import { ASSET_KINDS, FINDING_SEVERITIES } from '../types'
import type { AssetRecord, AtlasAnimation, AtlasFrame, Finding, FindingSeverity, ValidationContext, WorkspaceScanSummary } from '../types'

function createFinding(
  id: string,
  severity: FindingSeverity,
  title: string,
  description: string,
  category: Finding['category'],
  suggestion?: string,
): Finding {
  return {
    id,
    severity,
    title,
    description,
    category,
    suggestion,
  }
}

function softenForPurchasedAsset(asset: AssetRecord, finding: Finding): Finding {
  if (asset.sourceType !== 'purchased') {
    return finding
  }

  const softCategories = new Set<Finding['category']>(['size', 'composition', 'naming', 'reference', 'completeness'])
  if (finding.severity !== 'fail' || !softCategories.has(finding.category)) {
    return finding
  }

  return {
    ...finding,
    severity: 'warn',
    suggestion: finding.suggestion ?? 'This looks adaptable. Treat it as a candidate for pad, crop, or scale correction.',
  }
}

function regionAverage(grid: number[][], xStart: number, xEnd: number, yStart: number, yEnd: number): number {
  let total = 0
  let count = 0

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      total += grid[y]?.[x] ?? 0
      count += 1
    }
  }

  return total / Math.max(1, count)
}

function validateManifestFrames(frames: AtlasFrame[]): Finding[] {
  const findings: Finding[] = []
  const uniqueIds = new Set<string>()

  for (const frame of frames) {
    if (uniqueIds.has(frame.frameId)) {
      findings.push(
        createFinding(
          `duplicate-frame-${frame.frameId}`,
          'fail',
          'Duplicate frame id',
          `Frame "${frame.frameId}" appears more than once in the manifest.`,
          'metadata',
        ),
      )
    }
    uniqueIds.add(frame.frameId)

    if (
      frame.x < 0 ||
      frame.y < 0 ||
      frame.x + frame.w > GLENMOOR_CONTRACT.atlas.width ||
      frame.y + frame.h > GLENMOOR_CONTRACT.atlas.height
    ) {
      findings.push(
        createFinding(
          `frame-bounds-${frame.frameId}`,
          'fail',
          'Frame outside atlas bounds',
          `Frame "${frame.frameId}" extends beyond the 1536x1024 atlas contract.`,
          'animation',
        ),
      )
    }
  }

  return findings
}

function validateUnitManifest(asset: AssetRecord): Finding[] {
  const findings: Finding[] = []
  const manifest = asset.manifest

  if (!manifest) {
    return [
      createFinding('manifest-parse', 'fail', 'Manifest parse failed', 'This atlas manifest could not be parsed.', 'metadata'),
    ]
  }

  if (!GLENMOOR_UNITS.includes(manifest.unitId as (typeof GLENMOOR_UNITS)[number])) {
    findings.push(
      createFinding(
        'manifest-unit-id',
        'warn',
        'Unknown unit id',
        `Unit id "${manifest.unitId}" is not part of the current Glenmoor roster contract.`,
        'metadata',
      ),
    )
  }

  if (manifest.frameWidth !== GLENMOOR_CONTRACT.atlas.frameWidth || manifest.frameHeight !== GLENMOOR_CONTRACT.atlas.frameHeight) {
    findings.push(
      createFinding(
        'manifest-frame-size',
        'fail',
        'Unexpected frame size',
        `Manifest frame size is ${manifest.frameWidth}x${manifest.frameHeight}, expected 128x128.`,
        'animation',
      ),
    )
  }

  if (manifest.pivotX !== GLENMOOR_CONTRACT.atlas.pivotX || manifest.pivotY !== GLENMOOR_CONTRACT.atlas.pivotY) {
    findings.push(
      createFinding(
        'manifest-pivot',
        'fail',
        'Unexpected pivot',
        `Manifest pivot is ${manifest.pivotX},${manifest.pivotY}, expected 64,108.`,
        'pivot',
      ),
    )
  }

  if (manifest.directions.join('|') !== GLENMOOR_DIRECTIONS.join('|')) {
    findings.push(
      createFinding(
        'manifest-directions',
        'fail',
        'Direction order mismatch',
        `Direction order must be north, east, south, west.`,
        'animation',
      ),
    )
  }

  for (const animation of Object.keys(GLENMOOR_ANIMATION_COUNTS) as AtlasAnimation[]) {
    if (manifest.animations[animation] !== GLENMOOR_ANIMATION_COUNTS[animation]) {
      findings.push(
        createFinding(
          `manifest-animation-${animation}`,
          'fail',
          'Animation count mismatch',
          `Animation "${animation}" has ${manifest.animations[animation]} frames, expected ${GLENMOOR_ANIMATION_COUNTS[animation]}.`,
          'animation',
        ),
      )
    }
  }

  if (manifest.frames.length !== 96) {
    findings.push(
      createFinding(
        'manifest-frame-total',
        'fail',
        'Unexpected total frame count',
        `Manifest has ${manifest.frames.length} frames, expected 96.`,
        'animation',
      ),
    )
  }

  findings.push(...validateManifestFrames(manifest.frames))

  if (!asset.linkedAtlasId) {
    findings.push(
      createFinding(
        'missing-atlas',
        'warn',
        'Companion atlas missing',
        'No matching unit battle atlas was found in the opened folder.',
        'completeness',
        'Add the matching atlas file or inspect this manifest alongside a candidate atlas.',
      ),
    )
  }

  return findings.map((finding) => softenForPurchasedAsset(asset, finding))
}

function atlasOrSyntheticManifest(asset: AssetRecord) {
  return asset.manifest ?? buildSyntheticAtlasManifest(asset.meta.unitId ?? 'unknown')
}

function validateCommonTransparency(asset: AssetRecord): Finding[] {
  const findings: Finding[] = []
  if (!asset.metrics) {
    return findings
  }

  if (asset.metrics.transparentRatio < 0.02) {
    findings.push(
      createFinding(
        'missing-transparency',
        'warn',
        'Very little transparency detected',
        'This image is almost fully opaque. Glenmoor runtime art generally expects transparent padding and background.',
        'transparency',
      ),
    )
  } else {
    findings.push(
      createFinding(
        'transparency-present',
        'pass',
        'Transparency present',
        'Transparent padding is present, which matches the runtime art policy.',
        'transparency',
      ),
    )
  }

  if (asset.metrics.magentaRatio > 0.001) {
    findings.push(
      createFinding(
        'magenta-key',
        'fail',
        'Flat magenta key color detected',
        'Exact #FF00FF pixels were found in the exported asset.',
        'color',
        'Remove key-color spill before approving the asset.',
      ),
    )
  }

  if (asset.metrics.edgeOpaqueRatio > 0.18) {
    findings.push(
      createFinding(
        'edge-matte',
        'warn',
        'Heavy edge occupancy',
        'Opaque pixels are touching the image border heavily, which can create matte or crop issues.',
        'transparency',
      ),
    )
  }

  return findings.map((finding) => softenForPurchasedAsset(asset, finding))
}

function validateUnitAtlas(asset: AssetRecord): Finding[] {
  const findings = [...validateCommonTransparency(asset)]
  const metrics = asset.metrics
  const manifest = atlasOrSyntheticManifest(asset)

  if (!metrics) {
    return findings
  }

  if (metrics.width !== GLENMOOR_CONTRACT.atlas.width || metrics.height !== GLENMOOR_CONTRACT.atlas.height) {
    findings.push(
      createFinding(
        'atlas-size',
        'fail',
        'Unexpected atlas size',
        `Atlas is ${metrics.width}x${metrics.height}, expected 1536x1024.`,
        'size',
        'Pad or rescale the sheet to the fixed Glenmoor atlas size.',
      ),
    )
  } else {
    findings.push(
      createFinding('atlas-size-pass', 'pass', 'Atlas size matches', 'Atlas matches the 1536x1024 contract.', 'size'),
    )
  }

  if (!asset.linkedManifestId) {
    findings.push(
      createFinding(
        'atlas-missing-manifest',
        'warn',
        'No companion manifest found',
        'No matching battle manifest was found. Synthetic frame layout is being used for preview and validation.',
        'completeness',
      ),
    )
  }

  findings.push(...validateManifestFrames(manifest.frames).map((finding) => softenForPurchasedAsset(asset, finding)))

  const lowContrast = metrics.contrast32 < 0.08 || metrics.contrast38 < 0.08
  if (lowContrast) {
    findings.push(
      createFinding(
        'atlas-small-scale',
        'warn',
        'Low small-scale readability',
        'The atlas looks low-contrast when sampled at portrait and gameplay scales.',
        'composition',
      ),
    )
  }

  return findings.map((finding) => softenForPurchasedAsset(asset, finding))
}

function validatePortrait(asset: AssetRecord): Finding[] {
  const findings = [...validateCommonTransparency(asset)]
  const metrics = asset.metrics

  if (!metrics) {
    return findings
  }

  if (metrics.width !== GLENMOOR_CONTRACT.portrait.width || metrics.height !== GLENMOOR_CONTRACT.portrait.height) {
    findings.push(
      createFinding(
        'portrait-size',
        'fail',
        'Unexpected portrait size',
        `Portrait is ${metrics.width}x${metrics.height}, expected 128x128.`,
        'size',
        'Scale or pad the portrait to the runtime export size.',
      ),
    )
  } else {
    findings.push(
      createFinding('portrait-size-pass', 'pass', 'Portrait size matches', 'Portrait matches the 128x128 contract.', 'size'),
    )
  }

  if (metrics.contrast32 < 0.065 || metrics.contrast38 < 0.065) {
    findings.push(
      createFinding(
        'portrait-contrast',
        'warn',
        'Small portrait readability may be weak',
        'The 32px or 38px preview shows low luminance contrast.',
        'composition',
        'Try a cleaner face crop or stronger value separation around the eyes and hairline.',
      ),
    )
  }

  if (metrics.centerOfMassDistance > 0.2) {
    findings.push(
      createFinding(
        'portrait-center',
        'warn',
        'Portrait mass is off-center',
        'The portrait reads as visually off-center, which may clip poorly under rounded masks.',
        'composition',
      ),
    )
  }

  return findings.map((finding) => softenForPurchasedAsset(asset, finding))
}

function validateTerrainBlock(asset: AssetRecord): Finding[] {
  const findings = [...validateCommonTransparency(asset)]
  const metrics = asset.metrics

  if (!metrics) {
    return findings
  }

  if (metrics.width !== GLENMOOR_CONTRACT.terrain.width || metrics.height !== GLENMOOR_CONTRACT.terrain.height) {
    findings.push(
      createFinding(
        'terrain-size',
        'fail',
        'Unexpected terrain block size',
        `Block is ${metrics.width}x${metrics.height}, expected 136x112.`,
        'size',
      ),
    )
  } else {
    findings.push(
      createFinding('terrain-size-pass', 'pass', 'Terrain size matches', 'Terrain block matches the 136x112 contract.', 'size'),
    )
  }

  const cornerNoise =
    regionAverage(metrics.alphaGrid, 0, 2, 0, 2) +
    regionAverage(metrics.alphaGrid, 8, 10, 0, 2) +
    regionAverage(metrics.alphaGrid, 0, 2, 8, 10) +
    regionAverage(metrics.alphaGrid, 8, 10, 8, 10)

  if (cornerNoise / 4 > 0.28) {
    findings.push(
      createFinding(
        'terrain-corners',
        'warn',
        'Transparent corners look crowded',
        'Opaque paint is spilling into the expected transparent corner padding.',
        'composition',
      ),
    )
  }

  const centerOcclusion = regionAverage(metrics.alphaGrid, 4, 6, 4, 7)
  if (centerOcclusion > 0.78) {
    findings.push(
      createFinding(
        'terrain-center-occlusion',
        'warn',
        'Tile center may bury unit feet',
        'The occupied center of the block is visually dense and may interfere with unit readability.',
        'composition',
      ),
    )
  }

  return findings.map((finding) => softenForPurchasedAsset(asset, finding))
}

function validateTerrainOverlay(asset: AssetRecord): Finding[] {
  const findings = [...validateCommonTransparency(asset)]
  const metrics = asset.metrics

  if (!metrics) {
    return findings
  }

  if (metrics.width !== GLENMOOR_CONTRACT.terrain.width || metrics.height !== GLENMOOR_CONTRACT.terrain.height) {
    findings.push(
      createFinding(
        'overlay-size',
        'fail',
        'Unexpected overlay size',
        `Overlay is ${metrics.width}x${metrics.height}, expected 136x112.`,
        'size',
      ),
    )
  }

  if (metrics.opaqueRatio > 0.52) {
    findings.push(
      createFinding(
        'overlay-density',
        'warn',
        'Overlay density is high',
        'The overlay covers a large portion of the tile and may hide battlefield readability.',
        'composition',
      ),
    )
  }

  return findings.map((finding) => softenForPurchasedAsset(asset, finding))
}

function validateVfxSheet(asset: AssetRecord): Finding[] {
  const findings = [...validateCommonTransparency(asset)]
  const metrics = asset.metrics

  if (!metrics) {
    return findings
  }

  if (metrics.width !== GLENMOOR_CONTRACT.vfx.width || metrics.height !== GLENMOOR_CONTRACT.vfx.height) {
    findings.push(
      createFinding(
        'vfx-size',
        'fail',
        'Unexpected VFX size',
        `VFX sheet is ${metrics.width}x${metrics.height}, expected 256x256.`,
        'size',
      ),
    )
  } else {
    findings.push(createFinding('vfx-size-pass', 'pass', 'VFX size matches', 'Sheet matches the 256x256 contract.', 'size'))
  }

  if (metrics.centerOfMassDistance > 0.2) {
    findings.push(
      createFinding(
        'vfx-center',
        'warn',
        'Burst energy is off-center',
        'The visual center of mass drifts away from the sheet center and may scale unevenly.',
        'composition',
      ),
    )
  }

  if (metrics.meanSaturation > 0.86 && metrics.meanLuminance > 0.72) {
    findings.push(
      createFinding(
        'vfx-overexposed',
        'warn',
        'VFX may be overexposed',
        'The effect is both very bright and very saturated, which can clip badly against combat backgrounds.',
        'color',
      ),
    )
  }

  return findings.map((finding) => softenForPurchasedAsset(asset, finding))
}

function validateReferenceComparison(asset: AssetRecord, context: ValidationContext): {
  comparison?: AssetRecord['referenceComparison']
} {
  const referenceAsset = context.referenceAsset
  if (!referenceAsset || !asset.metrics || !referenceAsset.metrics) {
    return {}
  }

  const comparisonNumbers = compareImageMetrics(asset.metrics, referenceAsset.metrics)
  const findings: Finding[] = []

  if (comparisonNumbers.paletteDrift > 0.24) {
    findings.push(
      createFinding(
        'reference-palette',
        'warn',
        'Palette drift from reference',
        'Average palette balance drifts noticeably from the linked reference image.',
        'reference',
      ),
    )
  }

  if (comparisonNumbers.luminanceDrift > 0.14) {
    findings.push(
      createFinding(
        'reference-luminance',
        'warn',
        'Luminance drift from reference',
        'Overall value grouping differs meaningfully from the linked reference image.',
        'reference',
      ),
    )
  }

  if (comparisonNumbers.dominantColorOverlap < 0.28) {
    findings.push(
      createFinding(
        'reference-overlap',
        'warn',
        'Low dominant-color overlap',
        'Dominant color families have little overlap with the linked reference image.',
        'reference',
      ),
    )
  }

  if (comparisonNumbers.silhouetteMassDiff > 0.12) {
    findings.push(
      createFinding(
        'reference-silhouette',
        'warn',
        'Silhouette mass drift',
        'The occupied mass differs noticeably from the linked reference image.',
        'reference',
      ),
    )
  }

  return {
    comparison: {
      referenceAssetId: referenceAsset.id,
      ...comparisonNumbers,
      findings,
    },
  }
}

export function validateAsset(asset: AssetRecord, context: ValidationContext = {}): {
  findings: Finding[]
  referenceComparison?: AssetRecord['referenceComparison']
} {
  let findings: Finding[] = []

  switch (asset.kind) {
    case 'unitManifest':
      findings = validateUnitManifest(asset)
      break
    case 'unitAtlas':
      findings = validateUnitAtlas(asset)
      break
    case 'portrait':
      findings = validatePortrait(asset)
      break
    case 'terrainBlock':
      findings = validateTerrainBlock(asset)
      break
    case 'terrainOverlay':
      findings = validateTerrainOverlay(asset)
      break
    case 'vfxSheet':
      findings = validateVfxSheet(asset)
      break
    case 'referenceImage':
      findings = [
        createFinding(
          'reference-ready',
          'pass',
          'Reference image ready',
          'This image can be linked as a visual comparison target.',
          'reference',
        ),
      ]
      break
    case 'unknown':
      findings = [
        createFinding(
          'unknown-asset',
          'warn',
          'Unsupported asset pattern',
          'This file was scanned but does not match a Glenmoor gameplay asset contract.',
          'metadata',
        ),
      ]
      break
  }

  const reference = validateReferenceComparison(asset, context)
  if (reference.comparison?.findings.length) {
    findings = [...findings, ...reference.comparison.findings]
  }

  return {
    findings: findings.sort((left, right) => FINDING_SEVERITIES.indexOf(right.severity) - FINDING_SEVERITIES.indexOf(left.severity)),
    referenceComparison: reference.comparison,
  }
}

export function buildScanSummary(assets: AssetRecord[], ignoredPaths: string[]): WorkspaceScanSummary {
  const countsByKind = Object.fromEntries(ASSET_KINDS.map((kind) => [kind, 0])) as WorkspaceScanSummary['countsByKind']
  const findingCounts = Object.fromEntries(FINDING_SEVERITIES.map((severity) => [severity, 0])) as WorkspaceScanSummary['findingCounts']

  for (const asset of assets) {
    countsByKind[asset.kind] += 1
    for (const finding of asset.findings) {
      findingCounts[finding.severity] += 1
    }
  }

  const atlasUnitIds = new Set(assets.filter((asset) => asset.kind === 'unitAtlas').map((asset) => asset.meta.unitId).filter(Boolean))
  const portraitUnitIds = new Set(assets.filter((asset) => asset.kind === 'portrait').map((asset) => asset.meta.unitId).filter(Boolean))
  const terrainFamilies = new Set(
    assets.filter((asset) => asset.kind === 'terrainBlock' || asset.kind === 'terrainOverlay').map((asset) => asset.meta.terrainId).filter(Boolean),
  )
  const vfxCues = new Set(assets.filter((asset) => asset.kind === 'vfxSheet').map((asset) => asset.meta.cueId).filter(Boolean))

  return {
    scannedAt: new Date().toISOString(),
    assetCount: assets.length,
    countsByKind,
    findingCounts,
    coverage: {
      expectedUnits: GLENMOOR_UNITS.length,
      atlasCount: atlasUnitIds.size,
      portraitCount: portraitUnitIds.size,
      expectedTerrains: GLENMOOR_TERRAINS.length,
      terrainFamiliesPresent: terrainFamilies.size,
      expectedVfx: GLENMOOR_VFX_CUES.length,
      vfxCuesPresent: vfxCues.size,
      placeholderOnly: atlasUnitIds.size === 0 && portraitUnitIds.size === 0 && terrainFamilies.size === 0 && vfxCues.size === 0,
    },
    ignoredPaths,
  }
}
