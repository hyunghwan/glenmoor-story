import { buildSyntheticAtlasManifest } from '../contracts/glenmoor'
import { analyzeImageFile } from './imageAnalysis'
import { walkWorkspace } from './fsAccess'
import { getWorkspaceEntry } from './workspaceStore'
import { buildScanSummary, validateAsset } from './validation'
import type {
  AssetKind,
  AssetMeta,
  AssetRecord,
  AtlasManifest,
  DemoWorkspaceAsset,
  DemoWorkspaceManifest,
  ScanCandidate,
  ScanWorkspaceResult,
  WorkspaceFile,
} from '../types'

const SUPPORTED_IMAGE_EXTENSIONS = new Set(['png', 'webp', 'jpg', 'jpeg', 'gif'])
const DEMO_MANIFEST_URL = '/demo/workspace.json'
const KIND_SORT_ORDER: Record<AssetKind, number> = {
  unitAtlas: 0,
  unitManifest: 1,
  portrait: 2,
  terrainBlock: 3,
  terrainOverlay: 4,
  vfxSheet: 5,
  referenceImage: 6,
  unknown: 7,
}

function toLowerName(candidate: Pick<ScanCandidate, 'name'>): string {
  return candidate.name.toLowerCase()
}

function fileNameFromPath(path: string): string {
  return path.split('/').at(-1) ?? path
}

function extensionFromPath(path: string): string {
  return fileNameFromPath(path).split('.').at(-1)?.toLowerCase() ?? ''
}

function mergeMeta(kind: AssetKind, inferred: AssetMeta, override?: AssetMeta): AssetMeta {
  if (kind === 'referenceImage') {
    return {
      stem: override?.stem ?? inferred.stem ?? fileNameFromPath(override?.stem ?? inferred.stem ?? ''),
      ...override,
    }
  }

  return {
    ...inferred,
    ...override,
  }
}

function createBaseAsset(
  id: string,
  path: string,
  name: string,
  extension: string,
  kind: AssetKind,
  sourceType: AssetRecord['sourceType'],
  fileSize: number,
  meta: AssetMeta,
): AssetRecord {
  return {
    id,
    path,
    name,
    extension,
    kind,
    sourceType,
    fileSize,
    meta,
    findings: [],
  }
}

async function hydrateAssetFromFile(asset: AssetRecord, file: File): Promise<AssetRecord> {
  const hydrated = {
    ...asset,
  }

  try {
    if (hydrated.kind === 'unitManifest') {
      const textContent = await file.text()
      hydrated.textContent = textContent
      hydrated.manifest = parseManifest(textContent)
      hydrated.meta.unitId = hydrated.manifest.unitId
      hydrated.meta.expectedAtlasPath = hydrated.manifest.atlasFile
    } else {
      hydrated.imageUrl = URL.createObjectURL(file)
      hydrated.metrics = await analyzeImageFile(file)
    }
  } catch (error) {
    hydrated.parseError = error instanceof Error ? error.message : String(error)
  }

  return hydrated
}

function applyAssetLinksAndOverrides(assets: AssetRecord[], workspace: WorkspaceFile | null): void {
  const atlasByUnit = new Map<string, AssetRecord>()
  const manifestByUnit = new Map<string, AssetRecord>()

  for (const asset of assets) {
    if (asset.kind === 'unitAtlas' && asset.meta.unitId) {
      atlasByUnit.set(asset.meta.unitId, asset)
    }

    if (asset.kind === 'unitManifest' && asset.meta.unitId) {
      manifestByUnit.set(asset.meta.unitId, asset)
    }
  }

  for (const asset of assets) {
    if (asset.kind === 'unitAtlas' && asset.meta.unitId) {
      const manifest = manifestByUnit.get(asset.meta.unitId)
      if (manifest) {
        asset.linkedManifestId = manifest.id
        asset.manifest = manifest.manifest ?? buildSyntheticAtlasManifest(asset.meta.unitId)
      } else {
        asset.manifest = buildSyntheticAtlasManifest(asset.meta.unitId)
      }
    }

    if (asset.kind === 'unitManifest' && asset.meta.unitId) {
      const atlas = atlasByUnit.get(asset.meta.unitId)
      if (atlas) {
        asset.linkedAtlasId = atlas.id
      }
    }

    const entry = getWorkspaceEntry(workspace, asset)
    asset.sourceType = entry.sourceType ?? asset.sourceType
  }
}

function applyValidation(assets: AssetRecord[], workspace: WorkspaceFile | null): void {
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]))

  for (const asset of assets) {
    const workspaceEntry = getWorkspaceEntry(workspace, asset)
    const referenceAsset = workspaceEntry.referenceAssetId ? assetMap.get(workspaceEntry.referenceAssetId) : undefined
    const validation = validateAsset(asset, { referenceAsset })
    asset.findings = validation.findings
    asset.referenceComparison = validation.referenceComparison
  }
}

function finalizeScan(
  assets: AssetRecord[],
  workspace: WorkspaceFile | null,
  ignoredPaths: string[],
  preferredSelectionId?: string,
  demoManifest?: DemoWorkspaceManifest,
): ScanWorkspaceResult {
  applyAssetLinksAndOverrides(assets, workspace)
  applyValidation(assets, workspace)

  return {
    assets: assets.sort((left, right) => KIND_SORT_ORDER[left.kind] - KIND_SORT_ORDER[right.kind] || left.path.localeCompare(right.path)),
    summary: buildScanSummary(assets, ignoredPaths),
    preferredSelectionId,
    demoManifest,
  }
}

export function classifyWorkspaceCandidate(candidate: { relativePath: string; name: string; extension: string }): { kind: AssetKind; meta: AssetMeta } | null {
  const relativePath = candidate.relativePath
  const lower = toLowerName(candidate)
  const rawName = candidate.name

  if (candidate.extension === 'json') {
    const manifestMatch = rawName.match(/^unit_([A-Za-z0-9]+)_battle\.json$/)
    if (manifestMatch) {
      return {
        kind: 'unitManifest',
        meta: {
          unitId: manifestMatch[1],
          expectedAtlasPath: `unit_${manifestMatch[1]}_battle.webp`,
          stem: `unit_${manifestMatch[1]}_battle`,
        },
      }
    }

    return null
  }

  if (!SUPPORTED_IMAGE_EXTENSIONS.has(candidate.extension)) {
    return null
  }

  const unitAtlasMatch = rawName.match(/^unit_([A-Za-z0-9]+)_battle\.(png|webp|jpg|jpeg|gif)$/)
  if (unitAtlasMatch) {
    return {
      kind: 'unitAtlas',
      meta: {
        unitId: unitAtlasMatch[1],
        stem: `unit_${unitAtlasMatch[1]}_battle`,
      },
    }
  }

  const portraitMatch = rawName.match(/^unit_([A-Za-z0-9]+)_head(?:_[a-z0-9-]+)?\.(png|webp|jpg|jpeg|gif)$/)
  if (portraitMatch) {
    return {
      kind: 'portrait',
      meta: {
        unitId: portraitMatch[1],
        stem: `unit_${portraitMatch[1]}_head`,
      },
    }
  }

  const terrainBlockMatch = lower.match(/^terrain_([a-z0-9-]+)_([a-z0-9-]+)_block\.(png|webp|jpg|jpeg|gif)$/i)
  if (terrainBlockMatch) {
    return {
      kind: 'terrainBlock',
      meta: {
        terrainId: terrainBlockMatch[1],
        variant: terrainBlockMatch[2],
        stem: `terrain_${terrainBlockMatch[1]}_${terrainBlockMatch[2]}_block`,
      },
    }
  }

  const terrainOverlayMatch = lower.match(/^terrain_([a-z0-9-]+)_([a-z0-9-]+)_overlay\.(png|webp|jpg|jpeg|gif)$/i)
  if (terrainOverlayMatch) {
    return {
      kind: 'terrainOverlay',
      meta: {
        terrainId: terrainOverlayMatch[1],
        variant: terrainOverlayMatch[2],
        stem: `terrain_${terrainOverlayMatch[1]}_${terrainOverlayMatch[2]}_overlay`,
      },
    }
  }

  const vfxMatch = lower.match(/^vfx_([a-z0-9-]+)(?:_([a-z0-9-]+))?(?:_([a-z]))?\.(png|webp|jpg|jpeg|gif)$/i)
  if (vfxMatch) {
    return {
      kind: 'vfxSheet',
      meta: {
        cueId: vfxMatch[1],
        tone: vfxMatch[2],
        variant: vfxMatch[3],
        stem: `vfx_${vfxMatch[1]}${vfxMatch[2] ? `_${vfxMatch[2]}` : ''}${vfxMatch[3] ? `_${vfxMatch[3]}` : ''}`,
      },
    }
  }

  if (relativePath.includes('/references/') || lower.includes('_reference') || lower.includes('_proof_')) {
    return {
      kind: 'referenceImage',
      meta: {
        stem: lower.replace(/\.[a-z]+$/, ''),
      },
    }
  }

  return null
}

function inferSourceType(candidate: Pick<ScanCandidate, 'relativePath'>, kind: AssetKind): AssetRecord['sourceType'] {
  const relativePath = candidate.relativePath.toLowerCase()

  if (kind === 'unitManifest' || relativePath.startsWith('output/comfy/') || relativePath.startsWith('docs/assets/')) {
    return 'generated'
  }

  return 'purchased'
}

function parseManifest(textContent: string): AtlasManifest {
  return JSON.parse(textContent) as AtlasManifest
}

export async function loadDemoWorkspaceManifest(): Promise<DemoWorkspaceManifest> {
  const response = await fetch(DEMO_MANIFEST_URL, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to load demo workspace manifest (${response.status}).`)
  }

  return (await response.json()) as DemoWorkspaceManifest
}

function classifyDemoAsset(seed: DemoWorkspaceAsset): { kind: AssetKind; meta: AssetMeta } {
  const candidate = {
    relativePath: seed.path,
    name: fileNameFromPath(seed.path),
    extension: extensionFromPath(seed.path),
  }
  const inferred = classifyWorkspaceCandidate(candidate)

  return {
    kind: seed.kind ?? inferred?.kind ?? 'unknown',
    meta: mergeMeta(seed.kind ?? inferred?.kind ?? 'unknown', inferred?.meta ?? {}, seed.meta),
  }
}

export function disposeAssetResources(assets: AssetRecord[]): void {
  for (const asset of assets) {
    if (asset.imageUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(asset.imageUrl)
    }
  }
}

export async function scanWorkspace(
  rootHandle: FileSystemDirectoryHandle,
  workspace: WorkspaceFile | null,
): Promise<ScanWorkspaceResult> {
  const { files, ignoredPaths } = await walkWorkspace(rootHandle)
  const assets: AssetRecord[] = []

  for (const candidate of files) {
    const classified = classifyWorkspaceCandidate(candidate)
    if (!classified) {
      continue
    }

    const baseAsset = createBaseAsset(
      candidate.relativePath,
      candidate.relativePath,
      candidate.name,
      candidate.extension,
      classified.kind,
      inferSourceType(candidate, classified.kind),
      candidate.file.size,
      classified.meta,
    )
    baseAsset.fileHandle = candidate.handle

    assets.push(await hydrateAssetFromFile(baseAsset, candidate.file))
  }

  return finalizeScan(assets, workspace, ignoredPaths)
}

export async function scanDemoWorkspace(workspace: WorkspaceFile | null, manifestOverride?: DemoWorkspaceManifest): Promise<ScanWorkspaceResult> {
  const demoManifest = manifestOverride ?? (await loadDemoWorkspaceManifest())
  const assets: AssetRecord[] = []

  for (const seed of demoManifest.assets) {
    const classified = classifyDemoAsset(seed)
    const publicPath = seed.path.startsWith('/') ? seed.path : `/${seed.path}`
    const response = await fetch(publicPath, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`Failed to load demo asset "${seed.path}" (${response.status}).`)
    }

    const blob = await response.blob()
    const file = new File([blob], fileNameFromPath(seed.path), {
      type: blob.type || 'application/octet-stream',
    })

    const assetId = seed.id ?? seed.path
    const baseAsset = createBaseAsset(
      assetId,
      seed.path,
      file.name,
      extensionFromPath(seed.path),
      classified.kind,
      seed.sourceType,
      file.size,
      classified.meta,
    )

    assets.push(await hydrateAssetFromFile(baseAsset, file))
  }

  return finalizeScan(assets, workspace, [], demoManifest.featuredAssetId, demoManifest)
}
