export type AssetKind =
  | 'unitAtlas'
  | 'unitManifest'
  | 'portrait'
  | 'terrainBlock'
  | 'terrainOverlay'
  | 'vfxSheet'
  | 'referenceImage'
  | 'unknown'

export type AssetSourceType = 'generated' | 'purchased'

export type FindingSeverity = 'pass' | 'warn' | 'fail'

export type ReviewStatus = 'approved' | 'hold' | 'rejected' | 'unreviewed'

export type WorkspaceSource = 'filesystem' | 'demo'

export type Direction = 'north' | 'east' | 'south' | 'west'

export type AtlasAnimation = 'idle' | 'move' | 'attack' | 'cast' | 'hit' | 'defeat'

export interface AtlasAnimationCounts {
  idle: number
  move: number
  attack: number
  cast: number
  hit: number
  defeat: number
}

export interface AtlasFrame {
  frameId: string
  direction: Direction
  animation: AtlasAnimation
  index: number
  x: number
  y: number
  w: number
  h: number
  pivotX: number
  pivotY: number
}

export interface AtlasManifest {
  unitId: string
  atlasFile: string
  frameWidth: number
  frameHeight: number
  pivotX: number
  pivotY: number
  directions: Direction[]
  animations: AtlasAnimationCounts
  frames: AtlasFrame[]
}

export interface AssetMeta {
  unitId?: string
  terrainId?: string
  cueId?: string
  variant?: string
  tone?: string
  expectedAtlasPath?: string
  stem?: string
}

export interface DominantColor {
  hex: string
  ratio: number
}

export interface AlphaBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface ImageMetrics {
  width: number
  height: number
  opaqueRatio: number
  transparentRatio: number
  edgeOpaqueRatio: number
  magentaRatio: number
  meanLuminance: number
  meanSaturation: number
  averageColor: {
    r: number
    g: number
    b: number
  }
  centerOfMass: {
    x: number
    y: number
  }
  centerOfMassDistance: number
  silhouetteMass: number
  contrast38: number
  contrast32: number
  alphaGrid: number[][]
  dominantColors: DominantColor[]
  bounds: AlphaBounds | null
}

export interface Finding {
  id: string
  title: string
  description: string
  severity: FindingSeverity
  category:
    | 'naming'
    | 'size'
    | 'transparency'
    | 'animation'
    | 'pivot'
    | 'color'
    | 'reference'
    | 'composition'
    | 'metadata'
    | 'completeness'
  suggestion?: string
}

export interface ReferenceComparison {
  referenceAssetId: string
  paletteDrift: number
  luminanceDrift: number
  saturationDrift: number
  silhouetteMassDiff: number
  dominantColorOverlap: number
  centerDrift: number
  findings: Finding[]
}

export interface AssetRecord {
  id: string
  path: string
  name: string
  extension: string
  kind: AssetKind
  sourceType: AssetSourceType
  fileSize: number
  fileHandle?: FileSystemFileHandle
  metrics?: ImageMetrics
  imageUrl?: string
  manifest?: AtlasManifest
  textContent?: string
  parseError?: string
  linkedManifestId?: string
  linkedAtlasId?: string
  meta: AssetMeta
  findings: Finding[]
  referenceComparison?: ReferenceComparison
}

export interface ChecklistTemplateItem {
  id: string
  label: string
  description: string
}

export interface WorkspaceEntry {
  sourceType?: AssetSourceType
  reviewStatus: ReviewStatus
  notes: string
  referenceAssetId?: string
  checklist: Record<string, boolean>
  updatedAt?: string
}

export interface WorkspaceScanSummary {
  scannedAt: string
  assetCount: number
  countsByKind: Record<AssetKind, number>
  findingCounts: Record<FindingSeverity, number>
  coverage: {
    expectedUnits: number
    atlasCount: number
    portraitCount: number
    expectedTerrains: number
    terrainFamiliesPresent: number
    expectedVfx: number
    vfxCuesPresent: number
    placeholderOnly: boolean
  }
  ignoredPaths: string[]
}

export interface WorkspaceFile {
  version: 1
  rootName: string
  updatedAt: string
  entries: Record<string, WorkspaceEntry>
  lastScanSummary?: WorkspaceScanSummary
}

export interface DemoWorkspaceOnboardingStep {
  id: string
  title: string
  description: string
  assetId?: string
}

export interface DemoWorkspaceAsset {
  id?: string
  path: string
  kind: AssetKind
  sourceType: AssetSourceType
  meta?: AssetMeta
  referenceAssetId?: string
  seededEntry?: Partial<WorkspaceEntry>
}

export interface DemoWorkspaceManifest {
  version: 1
  rootName: string
  featuredAssetId: string
  onboarding: DemoWorkspaceOnboardingStep[]
  assets: DemoWorkspaceAsset[]
}

export interface ScanWorkspaceResult {
  assets: AssetRecord[]
  summary: WorkspaceScanSummary
  preferredSelectionId?: string
  demoManifest?: DemoWorkspaceManifest
}

export interface ScanCandidate {
  relativePath: string
  name: string
  extension: string
  file: File
  handle: FileSystemFileHandle
}

export interface ValidationContext {
  referenceAsset?: AssetRecord
}

export interface PreviewState {
  viewMode: 'sheet' | 'frame' | 'duel'
  direction: Direction
  animation: AtlasAnimation
  frameCursor: number
  isPlaying: boolean
  flipX: boolean
}

export const ASSET_KINDS: AssetKind[] = [
  'unitAtlas',
  'unitManifest',
  'portrait',
  'terrainBlock',
  'terrainOverlay',
  'vfxSheet',
  'referenceImage',
  'unknown',
]

export const FINDING_SEVERITIES: FindingSeverity[] = ['pass', 'warn', 'fail']
