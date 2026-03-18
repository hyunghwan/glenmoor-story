import { createDefaultWorkspaceEntry } from '../contracts/glenmoor'
import { readJsonFile, writeJsonFile } from './fsAccess'
import type { AssetKind, AssetRecord, DemoWorkspaceManifest, WorkspaceEntry, WorkspaceFile, WorkspaceScanSummary } from '../types'

export const WORKSPACE_FILE_PATH = '.asset-workbench/workspace.json'
export const DEMO_WORKSPACE_STORAGE_KEY = 'glenmoor-asset-workbench.demo-workspace'

function mergeWorkspaceEntry(kind: AssetKind, partial?: Partial<WorkspaceEntry>): WorkspaceEntry {
  const defaults = createDefaultWorkspaceEntry(kind)

  return {
    ...defaults,
    ...partial,
    checklist: {
      ...defaults.checklist,
      ...(partial?.checklist ?? {}),
    },
    updatedAt: partial?.updatedAt ?? defaults.updatedAt,
  }
}

function createWorkspaceFile(rootName: string, entries: Record<string, WorkspaceEntry>, summary?: WorkspaceScanSummary): WorkspaceFile {
  return {
    version: 1,
    rootName,
    updatedAt: new Date().toISOString(),
    entries,
    lastScanSummary: summary,
  }
}

export async function loadWorkspaceFile(rootHandle: FileSystemDirectoryHandle): Promise<WorkspaceFile | null> {
  return readJsonFile<WorkspaceFile>(rootHandle, WORKSPACE_FILE_PATH)
}

export async function saveWorkspaceFile(
  rootHandle: FileSystemDirectoryHandle,
  workspace: WorkspaceFile,
): Promise<void> {
  await writeJsonFile(rootHandle, WORKSPACE_FILE_PATH, workspace)
}

export function buildDemoWorkspaceFile(
  manifest: DemoWorkspaceManifest,
  existing: WorkspaceFile | null = null,
  summary?: WorkspaceScanSummary,
): WorkspaceFile {
  const entries: Record<string, WorkspaceEntry> = { ...(existing?.entries ?? {}) }

  for (const asset of manifest.assets) {
    const assetId = asset.id ?? asset.path
    const seed = mergeWorkspaceEntry(asset.kind, {
      ...asset.seededEntry,
      referenceAssetId: asset.seededEntry?.referenceAssetId ?? asset.referenceAssetId,
    })
    const stored = existing?.entries[assetId]
    entries[assetId] = stored
      ? mergeWorkspaceEntry(asset.kind, {
          ...seed,
          ...stored,
          referenceAssetId: stored.referenceAssetId ?? seed.referenceAssetId,
          checklist: {
            ...seed.checklist,
            ...(stored.checklist ?? {}),
          },
        })
      : seed
  }

  return createWorkspaceFile(manifest.rootName, entries, summary ?? existing?.lastScanSummary)
}

export function loadDemoWorkspaceFile(manifest: DemoWorkspaceManifest): WorkspaceFile {
  if (typeof window === 'undefined') {
    return buildDemoWorkspaceFile(manifest, null)
  }

  try {
    const raw = window.localStorage.getItem(DEMO_WORKSPACE_STORAGE_KEY)
    if (!raw) {
      return buildDemoWorkspaceFile(manifest, null)
    }

    const parsed = JSON.parse(raw) as WorkspaceFile
    return buildDemoWorkspaceFile(manifest, parsed)
  } catch {
    return buildDemoWorkspaceFile(manifest, null)
  }
}

export function saveDemoWorkspaceFile(workspace: WorkspaceFile): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(DEMO_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace))
}

export function getWorkspaceEntry(workspace: WorkspaceFile | null, asset: AssetRecord): WorkspaceEntry {
  return mergeWorkspaceEntry(asset.kind, workspace?.entries[asset.id])
}

export function upsertWorkspaceEntry(
  workspace: WorkspaceFile | null,
  rootName: string,
  asset: AssetRecord,
  next: Partial<WorkspaceEntry>,
  summary?: WorkspaceScanSummary,
): WorkspaceFile {
  const existing = getWorkspaceEntry(workspace, asset)
  const merged = mergeWorkspaceEntry(asset.kind, {
    ...existing,
    ...next,
    updatedAt: new Date().toISOString(),
  })

  return createWorkspaceFile(
    rootName,
    {
      ...(workspace?.entries ?? {}),
      [asset.id]: merged,
    },
    summary ?? workspace?.lastScanSummary,
  )
}

export function replaceWorkspaceSummary(
  workspace: WorkspaceFile | null,
  rootName: string,
  summary: WorkspaceScanSummary,
): WorkspaceFile {
  return createWorkspaceFile(rootName, workspace?.entries ?? {}, summary)
}
